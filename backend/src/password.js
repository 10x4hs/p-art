// 비밀번호 암호화 — Cloudflare가 기본으로 주는 Web Crypto(PBKDF2)를 쓴다.
// bcrypt는 순수 JS라 느려서 Workers 무료 요금제의 CPU 제한(요청당 10ms)을 넘기 쉽다.
// 저장 형식: pbkdf2$반복수$소금(base64)$해시(base64) — 반복수를 같이 저장해서 나중에 바꿔도 예전 비밀번호를 확인할 수 있다.

const ITERATIONS = 100000;   // Workers가 허용하는 최대값
const enc = new TextEncoder();
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));   // 사람마다 다른 무작위 "소금" → 같은 비밀번호라도 저장값이 달라짐
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function checkPassword(password, stored) {
  const [kind, iter, salt, hash] = String(stored).split('$');
  if (kind !== 'pbkdf2') return false;
  const got = new Uint8Array(await derive(password, fromB64(salt), Number(iter)));
  const want = fromB64(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];   // 끝까지 다 비교 → 걸린 시간으로 정답을 추측할 수 없게
  return diff === 0;
}
