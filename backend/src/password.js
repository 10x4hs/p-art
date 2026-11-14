// ============================================================================
// [파일 개요] 회원의 비밀번호를 원래 글자로 되돌릴 수 없는 암호문(해시)으로 바꾸고(`hashPassword`),
// 로그인할 때 입력한 비밀번호가 맞는지 비교(`checkPassword`)하는 파일이에요.
// - Cloudflare Workers의 무료/표준 CPU 시간 제한 안에서도 안전하고 빠르게 동작하도록
//   표준 Web Crypto API의 `PBKDF2`(SHA-256, 100,000회 반복) 알고리즘을 사용해요.
// - DB 저장 형식: `pbkdf2$100000$소금(Base64)$해시결과(Base64)`
// [비유] 비밀번호라는 재료를 사람마다 다른 '소금(Salt)'과 함께 믹서기로 10만 번 갈아서 스무디(해시)로 보관하는 거예요.
//   스무디를 보고 원래 과일을 알아낼 순 없지만, 로그인할 때 똑같은 레시피로 다시 갈아 보면 맛이 같은지 확인할 수 있어요.
// ============================================================================

// [뜻/역할] PBKDF2 해시 계산을 몇 번 반복할지 정하는 상수예요(100,000번).
// [문법] 숫자 상수 `100000`이에요.
// [작성 이유] Cloudflare Workers Web Crypto API가 허용하는 최대 반복 횟수(100,000회)를 꽉 채워 써서, 해커가 비밀번호를 무작위로 대입(Brute-force)하는 속도를 최대한 늦추기 위해서예요.
const ITERATIONS = 100000;

// [뜻/역할] 바이트 배열(`ArrayBuffer`/`Uint8Array`)을 DB에 글자로 저장할 수 있게 Base64 문자열로 바꾸거나(`toB64`), 다시 바이트 배열로 되돌리는(`fromB64`) 변환 함수예요.
// [문법] `btoa`(이진 → Base64 문자열)와 `atob`(Base64 문자열 → 이진) 내장 함수를 사용해요.
// [작성 이유] 암호화 결과물과 소금(salt)은 눈에 안 보이는 이진 바이트 데이터라서, SQLite `TEXT` 열에 깨지지 않게 저장하려면 Base64 문자열로 바꿔야 하기 때문이에요.
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// [뜻/역할] 비밀번호 문자열과 소금(`salt`), 반복 횟수(`iterations`)를 받아 256비트(32바이트) 길이의 해시 바이트를 만들어 내는 핵심 함수예요.
// [문법]
// - `new TextEncoder().encode(password)`로 비밀번호 글자를 바이트로 바꿔요.
// - `crypto.subtle.importKey`로 원재료 키를 준비한 뒤, `crypto.subtle.deriveBits`로 SHA-256 해시를 `iterations`만큼 반복해 256비트를 뽑아내요.
// [작성 이유] `hashPassword`(가입 시)와 `checkPassword`(로그인 시) 양쪽에서 똑같은 방식으로 해시를 계산하기 위해 공통 함수로 분리했어요.
async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

// [뜻/역할] 회원가입할 때 평문 비밀번호를 받아 DB에 저장할 최종 해시 문자열을 만들어 돌려줘요.
// [문법] `crypto.getRandomValues(new Uint8Array(16))`로 16바이트 길이의 무작위 소금(Salt)을 만들고, 알고리즘 이름·반복 횟수·소금·해시값을 `$` 기호로 이어 붙여요.
// [작성 이유] 사람마다 다른 무작위 소금을 섞어야, 두 회원이 우연히 똑같은 비밀번호(`1234abcd`)를 쓰더라도 DB에 저장되는 해시값이 완전히 달라져 해시표(레인보우 테이블) 공격을 막을 수 있어요.
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(await derive(password, salt, ITERATIONS))}`;
}

// [뜻/역할] 로그인할 때 사용자가 입력한 `password`와 DB에 저장된 `stored` 문자열이 일치하는지 확인해 참(`true`)/거짓(`false`)을 돌려줘요.
// [문법]
// - `stored`를 `$` 기준으로 쪼개 `[알고리즘종류, 반복횟수, 소금, 정답해시]`를 꺼내요.
// - 입력한 비밀번호를 같은 소금과 반복 횟수로 다시 `derive`해 `got`을 만들고 정답 `want`와 바이트 단위로 비교해요.
// [작성 이유]
// - 일반 `===` 비교는 첫 글자만 틀려도 즉시 종료되어 버려서, 해커가 응답 시간의 미세한 차이를 재서 비밀번호를 한 글자씩 알아내는 '타이밍 공격(Timing Attack)'에 취약할 수 있어요.
// - 그래서 `for`문과 XOR 비트 연산(`got[i] ^ want[i]`)으로 끝까지 똑같은 시간 동안 모든 바이트를 비교한 뒤(`diff === 0`) 결과를 돌려줘요.
export async function checkPassword(password, stored) {
  const [kind, iter, salt, hash] = String(stored).split('$');
  if (kind !== 'pbkdf2') return false;
  const got = new Uint8Array(await derive(password, fromB64(salt), Number(iter)));
  const want = fromB64(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}
