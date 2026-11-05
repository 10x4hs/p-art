// 가입 · 로그인 · 로그아웃 · 내 정보 · 공개 프로필
import { Hono } from 'hono';
import { hashPassword, checkPassword } from '../password.js';
import { startSession, endSession, needLogin } from '../session.js';
import { bad, readJson } from '../util.js';

const auth = new Hono();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanEmail = (e) => String(e || '').trim().toLowerCase();   // Test@A.com 과 test@a.com 을 같은 사람으로
const me = (c, id) => c.env.DB.prepare('SELECT id, email, nickname, bio FROM users WHERE id = ?').bind(id).first();

function checkNickname(nickname) {
  if (nickname.length < 2 || nickname.length > 20) throw bad('닉네임은 2~20자예요');
}

auth.post('/signup', async (c) => {
  const body = await readJson(c);
  const email = cleanEmail(body.email);
  const password = String(body.password || '');
  const nickname = String(body.nickname || '').trim();
  if (!EMAIL.test(email) || email.length > 100) throw bad('이메일 주소를 확인해 주세요');
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) throw bad('비밀번호는 8자 이상, 영문+숫자가 필요해요');
  checkNickname(nickname);
  if (await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) throw bad('이미 가입한 이메일이에요', 409);

  const { meta } = await c.env.DB.prepare('INSERT INTO users (email, password, nickname) VALUES (?, ?, ?)')
    .bind(email, await hashPassword(password), nickname).run();
  await startSession(c, meta.last_row_id);   // 가입하면 바로 로그인
  return c.json(await me(c, meta.last_row_id));
});

auth.post('/login', async (c) => {
  const body = await readJson(c);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(cleanEmail(body.email)).first();
  // 이메일이 없든 비밀번호가 틀리든 같은 문구 → 어떤 이메일이 가입됐는지 남이 알 수 없게
  if (!user || !(await checkPassword(String(body.password || ''), user.password))) throw bad('이메일이나 비밀번호가 맞지 않아요', 401);
  await startSession(c, user.id);
  return c.json(await me(c, user.id));
});

auth.post('/logout', async (c) => {
  await endSession(c);
  return c.json({ ok: true });
});

auth.get('/me', async (c) => c.json(c.get('uid') ? await me(c, c.get('uid')) : null));

auth.put('/me', needLogin, async (c) => {
  const body = await readJson(c);
  const nickname = String(body.nickname || '').trim();
  checkNickname(nickname);
  await c.env.DB.prepare('UPDATE users SET nickname = ?, bio = ? WHERE id = ?')
    .bind(nickname, String(body.bio || '').slice(0, 200), c.get('uid')).run();
  return c.json(await me(c, c.get('uid')));
});

// 탈퇴: 사진(KV)을 먼저 지우고, 사용자를 지우면 작품·응원·세션은 DB가 같이 지운다(ON DELETE CASCADE)
auth.delete('/me', needLogin, async (c) => {
  const uid = c.get('uid');
  const { results } = await c.env.DB.prepare('SELECT i.file FROM images i JOIN projects p ON p.id = i.project_id WHERE p.user_id = ?').bind(uid).all();
  await Promise.all(results.map((i) => c.env.IMAGES.delete(i.file)));
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(uid).run();
  await endSession(c);
  return c.json({ ok: true });
});

auth.get('/users/:id', async (c) => {
  const user = await c.env.DB.prepare('SELECT id, nickname, bio FROM users WHERE id = ?').bind(c.req.param('id')).first();
  return user ? c.json(user) : c.json({ error: '없는 사용자예요' }, 404);
});

export default auth;
