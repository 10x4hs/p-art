// [파일 개요] 비밀번호를 되돌릴 수 없는 암호문(해시)으로 바꾸고, 로그인할 때 맞는지 확인하는 파일이에요.
// [비유] 비밀번호를 '믹서기'에 갈아서 주스로만 보관하는 것과 같아요. 주스를 보고 원래 과일을 알 수는 없지만, 같은 과일을 같은 방법으로 갈면 같은 주스가 나오니 비교는 할 수 있어요.
// [뜻/역할] Cloudflare가 기본으로 주는 Web Crypto(브라우저에도 있는 암호화 도구)의 PBKDF2 방식을 써요.
// [작성 이유] 예전 Express 버전은 bcrypt를 썼지만, bcrypt는 순수 자바스크립트라 느려서 Workers 무료 요금제의 CPU 제한(요청당 10ms)을 넘기 쉬워요.
//            Web Crypto는 Cloudflare 내부에서 빠르게 계산해 줘서 이 제한에 덜 걸려요.
// [뜻/역할] 저장 형식은 `pbkdf2$반복수$소금(base64)$해시(base64)` 예요. 반복수를 같이 저장해서 나중에 반복수를 바꿔도 예전 비밀번호를 확인할 수 있어요.

// [뜻/역할] 비밀번호를 몇 번 반복해서 섞을지 정해요. 많이 섞을수록 해커가 하나하나 대입해 보기 어려워져요.
// [작성 이유] 100000은 Workers의 Web Crypto가 허용하는 최대값이에요.
const ITERATIONS = 100000;   // Workers가 허용하는 최대값
// [뜻/역할] 글자를 바이트(컴퓨터가 다루는 숫자 묶음)로 바꿔 주는 도구예요. 암호화 함수는 글자가 아니라 바이트를 받기 때문이에요.
const enc = new TextEncoder();
// [뜻/역할] 바이트 묶음을 base64 글자로 바꿔요. DB에 글자로 저장하려고요.
// [문법] new Uint8Array(buf)로 바이트 배열을 만들고, ...(펼침 연산자)로 하나씩 펼쳐 String.fromCharCode에 넣은 뒤, btoa로 base64 글자로 바꿔요.
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
// [뜻/역할] 반대로 base64 글자를 다시 바이트 배열로 되돌려요.
// [문법] atob로 base64를 풀고, Uint8Array.from(글자, 변환함수)로 글자 하나하나를 숫자(charCodeAt)로 바꿔 배열을 만들어요.
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// [뜻/역할] 비밀번호 + 소금 + 반복수로 실제 해시(256비트 = 32바이트)를 계산하는 핵심 함수예요.
// [문법] async function — 안에서 await를 쓸 수 있는 비동기 함수예요. 암호 계산은 시간이 걸려서 Promise로 결과를 줘요.
//        crypto.subtle.importKey로 비밀번호를 '열쇠 재료'로 등록하고, deriveBits로 PBKDF2(SHA-256) 계산을 해서 비트를 뽑아요.
// [작성 이유] 가입(hashPassword)과 로그인 확인(checkPassword) 둘 다 같은 계산을 해야 해서 함수로 묶었어요.
async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

// [뜻/역할] 가입할 때 쓰는 함수예요. 비밀번호를 받아 DB에 저장할 글자(`pbkdf2$...`)를 만들어 돌려줘요.
// [문법] export — 다른 파일(routes/auth.js)에서 import해서 쓸 수 있게 내보내요.
export async function hashPassword(password) {
  // [뜻/역할] 16바이트짜리 무작위 값 '소금(salt)'을 만들어요.
  // [작성 이유] 사람마다 소금이 달라서, 두 사람이 같은 비밀번호를 써도 저장되는 해시는 완전히 달라져요. 미리 만들어 둔 해시 표로 한꺼번에 푸는 공격도 막아요.
  const salt = crypto.getRandomValues(new Uint8Array(16));   // 사람마다 다른 무작위 "소금" → 같은 비밀번호라도 저장값이 달라짐
  const hash = await derive(password, salt, ITERATIONS);
  // [뜻/역할] 방식·반복수·소금·해시를 $로 이어 붙인 한 줄 글자로 돌려줘요.
  // [문법] 템플릿 리터럴 안에서 `$`는 그냥 글자이고, `${...}`만 값이 끼워지는 자리예요. 그래서 `$${...}`는 "$ 글자 + 값"이에요.
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

// [뜻/역할] 로그인할 때 쓰는 함수예요. 입력한 비밀번호(password)가 DB에 저장된 값(stored)과 맞으면 true를 돌려줘요.
export async function checkPassword(password, stored) {
  // [뜻/역할] 저장된 글자를 $로 잘라 방식·반복수·소금·해시 4조각으로 나눠요.
  // [문법] const [a, b, c, d] = 배열; — 배열 구조 분해 할당이에요. 순서대로 이름을 붙여 꺼내요.
  const [kind, iter, salt, hash] = String(stored).split('$');
  // [뜻/역할] 우리가 아는 방식(pbkdf2)이 아니면 바로 '틀림'으로 처리해요.
  if (kind !== 'pbkdf2') return false;
  // [뜻/역할] 입력한 비밀번호를 '저장 당시와 똑같은 소금·반복수'로 다시 갈아서(got), 저장된 해시(want)와 비교할 준비를 해요.
  const got = new Uint8Array(await derive(password, fromB64(salt), Number(iter)));
  const want = fromB64(hash);
  // [뜻/역할] 길이부터 다르면 볼 것도 없이 틀린 거예요.
  if (got.length !== want.length) return false;
  // [뜻/역할] 바이트를 하나씩 비교해서 다른 곳이 하나라도 있으면 diff가 0이 아니게 돼요.
  // [문법] ^(XOR)는 두 숫자가 같으면 0, 다르면 0이 아닌 값을 줘요. |=는 "지금까지 값에 OR로 합치기"예요.
  // [작성 이유] 다른 곳을 찾자마자 멈추면, 응답 시간 차이로 해커가 "앞 몇 글자가 맞았는지" 추측할 수 있어요(타이밍 공격).
  //            그래서 맞든 틀리든 항상 끝까지 다 비교해서 걸리는 시간을 똑같이 만들어요.
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];   // 끝까지 다 비교 → 걸린 시간으로 정답을 추측할 수 없게
  return diff === 0;
}
