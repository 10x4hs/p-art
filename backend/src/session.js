// [파일 개요] 로그인 상태(세션)를 만들고·확인하고·지워요.
// 쿠키에는 무작위 번호(sid)만 넣고, "누구인지(uid)"는 D1 sessions 표에 둬요(Worker 메모리는 금방 사라져요).
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

const DAY = 24 * 60 * 60 * 1000, DAYS30 = 30 * DAY;   // 하루·30일(밀리초)

const cookieOpts = (c) => ({
  path: '/',
  httpOnly: true,                                     // JS가 쿠키를 못 읽어서 악성 스크립트가 훔쳐 가지 못해요
  sameSite: 'Lax',                                    // 다른 사이트의 몰래 요청(CSRF)엔 쿠키가 안 따라가요
  secure: new URL(c.req.url).protocol === 'https:',   // https에서만 켜요(로컬 http 테스트 가능)
  maxAge: DAYS30 / 1000,                              // maxAge는 초 단위예요
});

// 모든 /api 요청 앞에서 쿠키로 로그인한 사람을 찾아 c.set('uid')에 넣어요(없으면 null).
export async function loadSession(c, next) {
  const sid = getCookie(c, 'sid');
  c.set('uid', null);
  // ?에 값을 bind로 넘겨야 SQL 인젝션을 막을 수 있어요.
  const row = sid && (await c.env.DB.prepare('SELECT uid, expires FROM sessions WHERE sid = ?').bind(sid).first());
  if (row && row.expires > Date.now()) {
    c.set('uid', row.uid);
    c.set('sid', sid);
    // 마지막 연장 뒤 하루가 지났으면 다시 30일로 늘려요(요청마다 DB에 쓰면 느려서 하루 한 번만).
    if (row.expires - Date.now() < DAYS30 - DAY) {
      await c.env.DB.prepare('UPDATE sessions SET expires = ? WHERE sid = ?').bind(Date.now() + DAYS30, sid).run();
      setCookie(c, 'sid', sid, cookieOpts(c));
    }
  }
  await next();
}

// 로그인·가입 성공 시: 만료된 세션을 청소하고 새 세션을 만들어 쿠키를 걸어요.
export async function startSession(c, uid) {
  const sid = crypto.randomUUID() + crypto.randomUUID();   // 남이 맞힐 수 없는 긴 번호
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sessions WHERE expires <= ?').bind(Date.now()),
    c.env.DB.prepare('INSERT INTO sessions (sid, uid, expires) VALUES (?, ?, ?)').bind(sid, uid, Date.now() + DAYS30),
  ]);
  setCookie(c, 'sid', sid, cookieOpts(c));
}

// 로그아웃: 쿠키만 지우면 복사된 번호를 계속 쓸 수 있어서 DB에서도 지워요.
export async function endSession(c) {
  const sid = c.get('sid');
  if (sid) await c.env.DB.prepare('DELETE FROM sessions WHERE sid = ?').bind(sid).run();
  deleteCookie(c, 'sid', { path: '/' });
}

// 로그인이 필요한 API 앞에 끼우는 검문소예요.
export async function needLogin(c, next) {
  if (!c.get('uid')) return c.json({ error: '로그인이 필요해요' }, 401);
  await next();
}
