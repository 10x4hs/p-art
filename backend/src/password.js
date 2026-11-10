// [파일 개요] 비밀번호를 되돌릴 수 없는 해시로 바꾸고, 로그인 때 맞는지 확인해요.
// bcrypt는 Workers CPU 제한에 걸리기 쉬워서 Web Crypto PBKDF2를 써요. 저장 형식: pbkdf2$반복수$소금$해시

const ITERATIONS = 100000;   // Workers가 허용하는 최대값
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));   // 사람마다 다른 소금 → 같은 비밀번호라도 저장값이 달라요
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(await derive(password, salt, ITERATIONS))}`;
}

export async function checkPassword(password, stored) {
  const [kind, iter, salt, hash] = String(stored).split('$');
  if (kind !== 'pbkdf2') return false;
  const got = new Uint8Array(await derive(password, fromB64(salt), Number(iter)));
  const want = fromB64(hash);
  if (got.length !== want.length) return false;
  // 중간에 멈추지 않고 끝까지 비교해야 걸린 시간으로 정답을 추측할 수 없어요(타이밍 공격 방지).
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}
