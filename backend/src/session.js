// 로그인 세션 — 쿠키에는 무작위 번호(sid)만, "누구인지(uid)"는 D1의 sessions 표에 둔다.
// 서버가 꺼졌다 켜져도(배포·재시작) DB에 남아 있으니 로그인이 유지된다.
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

const COOKIE = 'sid';
const DAYS30 = 30 * 24 * 60 * 60 * 1000;

const cookieOpts = (c) => ({
  path: '/',
  httpOnly: true,                                       // 자바스크립트로 쿠키를 못 읽게
  sameSite: 'Lax',                                      // 다른 사이트에서 몰래 보내는 요청엔 안 따라가게
  secure: new URL(c.req.url).protocol === 'https:',     // 인터넷(https)에서는 암호화된 연결에서만
  maxAge: DAYS30 / 1000,
});

// 모든 요청 앞에서: 쿠키의 sid로 로그인한 사람을 찾아 c.get('uid')에 넣는다
export async function loadSession(c, next) {
  const sid = getCookie(c, COOKIE);
  c.set('uid', null);
  if (sid) {
    const row = await c.env.DB.prepare('SELECT uid, expires FROM sessions WHERE sid = ?').bind(sid).first();
    if (row && row.expires > Date.now()) {
      c.set('uid', row.uid);
      c.set('sid', sid);
      if (row.expires - Date.now() < DAYS30 - 24 * 60 * 60 * 1000) {   // 하루 이상 지났으면 기한을 다시 30일로(쓸 때마다 연장)
        await c.env.DB.prepare('UPDATE sessions SET expires = ? WHERE sid = ?').bind(Date.now() + DAYS30, sid).run();
        setCookie(c, COOKIE, sid, cookieOpts(c));
      }
    }
  }
  await next();
}

// 로그인·가입 성공 시: 새 세션을 만들고 쿠키를 건다
export async function startSession(c, uid) {
  const sid = crypto.randomUUID() + crypto.randomUUID();   // 맞힐 수 없는 긴 무작위 번호
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sessions WHERE expires <= ?').bind(Date.now()),   // 김에 만료된 세션 청소
    c.env.DB.prepare('INSERT INTO sessions (sid, uid, expires) VALUES (?, ?, ?)').bind(sid, uid, Date.now() + DAYS30),
  ]);
  setCookie(c, COOKIE, sid, cookieOpts(c));
}

// 로그아웃: DB에서 지우고 쿠키도 지운다
export async function endSession(c) {
  const sid = c.get('sid');
  if (sid) await c.env.DB.prepare('DELETE FROM sessions WHERE sid = ?').bind(sid).run();
  deleteCookie(c, COOKIE, { path: '/' });
}

// 로그인이 필요한 API 앞에 붙이는 검문소
export async function needLogin(c, next) {
  if (!c.get('uid')) return c.json({ error: '로그인이 필요해요' }, 401);
  await next();
}
