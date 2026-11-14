// ============================================================================
// [파일 개요] 회원 관련 API를 모아 둔 라우터 파일이에요.
// - 회원가입(`POST /api/signup`), 로그인(`POST /api/login`), 로그아웃(`POST /api/logout`),
//   내 정보 조회·수정·탈퇴(`GET/PUT/DELETE /api/me`), 팀원 닉네임 검색(`GET /api/users`),
//   공개 프로필 조회(`GET /api/users/:id`)를 담당해요.
// - `backend/src/index.js`에서 `app.route('/api', auth)`로 연결돼요.
// [비유] 도서관의 회원증 발급 및 회원 정보 관리 창구예요.
// ============================================================================

import { Hono } from 'hono';
import { hashPassword, checkPassword } from '../password.js';
import { startSession, endSession, needLogin } from '../session.js';
import { bad, readJson, isAdminEmail } from '../util.js';

// [뜻/역할] 회원 API 전용 Hono 라우터 객체를 만들어요.
// [문법] `new Hono()`로 하위 라우터를 생성해요.
// [작성 이유] 회원 관련 주소들을 하나로 묶어 `index.js`로 내보내기 위해서예요.
const auth = new Hono();

// [뜻/역할] 이메일 형식이 맞는지 확인하는 정규식(`아이디@도메인.최상위도메인`)과 이메일 정리 함수예요.
// [문법] `cleanEmail`은 입력값 앞뒤 공백을 자르고(`.trim()`) 모두 소문자로 바꿔요(`.toLowerCase()`).
// [작성 이유] 사용자가 `Test@Example.com`으로 가입하고 나중에 `test@example.com`으로 로그인해도 똑같은 이메일로 인식하게 하기 위해서예요.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanEmail = (e) => String(e || '').trim().toLowerCase();

// [뜻/역할] 회원 번호(`id`)로 내 정보를 조회하되, 비밀번호 해시(`password`) 열은 빼고 안전한 열만 골라 가져와 관리자 여부(`isAdmin`)를 붙여 돌려줘요.
// [문법] `SELECT id, email, nickname, bio FROM users WHERE id = ?`로 조회한 뒤 스프레드 연산자(`...u`)로 `isAdmin` 불리언 값을 추가해요.
// [작성 이유] 응답 JSON에 암호화된 비밀번호 해시가 절대 섞여 나가지 않게 하고, 프론트엔드 상단 메뉴에서 관리자에게만 '관리' 링크를 보여 주기 위해서예요.
const me = async (c, id) => {
  const u = await c.env.DB.prepare('SELECT id, email, nickname, bio FROM users WHERE id = ?').bind(id).first();
  return u && { ...u, isAdmin: isAdminEmail(c, u.email) };
};

// [뜻/역할] 회원가입과 프로필 수정에서 공통으로 쓰는 닉네임 길이(2~20자) 검사 함수예요.
// [문법] 앞뒤 공백을 제거한 길이가 2자 미만이거나 20자 초과면 `bad('닉네임은 2~20자예요')`(400 에러)를 던져요.
// [작성 이유] 공백만 입력하거나 너무 긴 닉네임으로 화면 레이아웃이 깨지는 것을 막기 위해서예요.
const cleanNickname = (body) => {
  const nickname = String(body.nickname || '').trim();
  if (nickname.length < 2 || nickname.length > 20) throw bad('닉네임은 2~20자예요');
  return nickname;
};

// [뜻/역할] 새 회원을 등록하고 바로 로그인 세션까지 만들어 주는 회원가입 API(`POST /api/signup`)예요.
// [문법]
// - 이메일 형식·길이(100자 이하), 비밀번호 규칙(`/(?=.*[A-Za-z])(?=.*\d).{8,}/` → 영문+숫자 포함 8자 이상), 닉네임(2~20자)을 차례대로 검사해요.
// - 이미 있는 이메일이면 `409 Conflict` 에러를 던지고, 없으면 `hashPassword`로 암호화해 `users` 표에 넣어요.
// [작성 이유] 프론트엔드(`signup.html`)의 입력 검사는 개발자 도구로 우회할 수 있으므로 서버에서 모든 규칙을 다시 철저히 검증하고, 가입 즉시 `startSession`을 호출해 따로 또 로그인할 필요 없게 배려했어요.
auth.post('/signup', async (c) => {
  const body = await readJson(c);
  const email = cleanEmail(body.email);
  const password = String(body.password || '');
  if (!EMAIL.test(email) || email.length > 100) throw bad('이메일 주소를 확인해 주세요');
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) throw bad('비밀번호는 8자 이상, 영문+숫자가 필요해요');
  const nickname = cleanNickname(body);
  if (await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) throw bad('이미 가입한 이메일이에요', 409);
  const { meta } = await c.env.DB.prepare('INSERT INTO users (email, password, nickname) VALUES (?, ?, ?)')
    .bind(email, await hashPassword(password), nickname).run();
  await startSession(c, meta.last_row_id);
  return c.json(await me(c, meta.last_row_id));
});

// [뜻/역할] 이메일과 비밀번호를 확인해 로그인 세션을 발급하는 API(`POST /api/login`)예요.
// [문법] 이메일로 회원을 찾고, 회원이 없거나 `checkPassword`가 거짓이면 똑같이 `401` 에러를 던져요.
// [작성 이유] "없는 이메일이에요"와 "비밀번호가 틀렸어요"를 구분해서 알려 주면, 누군가 남의 이메일이 우리 사이트에 가입되어 있는지 떠볼 수(계정 열거 공격) 있기 때문에 일부러 같은 안내 문구로 답해요.
auth.post('/login', async (c) => {
  const body = await readJson(c);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(cleanEmail(body.email)).first();
  if (!user || !(await checkPassword(String(body.password || ''), user.password))) throw bad('이메일이나 비밀번호가 맞지 않아요', 401);
  await startSession(c, user.id);
  return c.json(await me(c, user.id));
});

// [뜻/역할] 현재 로그인 세션을 끝내고 쿠키를 지우는 로그아웃 API(`POST /api/logout`)예요.
// [문법] `endSession(c)`를 호출한 뒤 `{ ok: true }`를 반환해요.
// [작성 이유] 공용 컴퓨터 등에서도 안전하게 로그아웃할 수 있게 DB 세션과 쿠키를 모두 정리해요.
auth.post('/logout', async (c) => {
  await endSession(c);
  return c.json({ ok: true });
});

// [뜻/역할] 지금 로그인한 내 정보를 돌려주는 API(`GET /api/me`)예요. 로그인하지 않았으면 에러 대신 `null`을 돌려줘요.
// [문법] `c.get('uid')`가 있으면 `me(c, uid)` 결과를, 없으면 `null`을 JSON으로 응답해요.
// [작성 이유] 모든 페이지가 처음 열릴 때 상단 내비게이션 바(`frontend/js/app.js`)가 이 주소를 호출해 "로그인 버튼"을 보여 줄지 "내 공간 버튼"을 보여 줄지 결정하기 때문이에요.
auth.get('/me', async (c) => c.json(c.get('uid') ? await me(c, c.get('uid')) : null));

// [뜻/역할] 내 닉네임과 한 줄 소개(`bio`, 최대 200자)를 고치는 API(`PUT /api/me`)예요.
// [문법] `needLogin` 미들웨어로 로그인 여부를 먼저 확인하고, `UPDATE users SET nickname = ?, bio = ? WHERE id = ?`를 실행해요.
// [작성 이유] 본인(`c.get('uid')`)의 프로필만 안전하게 수정하고, 수정된 최신 내 정보를 바로 돌려주기 위해서예요.
auth.put('/me', needLogin, async (c) => {
  const body = await readJson(c);
  await c.env.DB.prepare('UPDATE users SET nickname = ?, bio = ? WHERE id = ?')
    .bind(cleanNickname(body), String(body.bio || '').slice(0, 200), c.get('uid')).run();
  return c.json(await me(c, c.get('uid')));
});

// [뜻/역할] 회원 탈퇴 API(`DELETE /api/me`)예요. 내가 올린 작품들의 R2 사진 파일까지 깨끗이 지운 뒤 회원 계정을 삭제해요.
// [문법]
// - 먼저 `images` 표와 `projects` 표를 `JOIN`해 내 작품에 속한 모든 R2 사진 키(`file`)를 찾아 `c.env.IMAGES.delete(...)`로 한 번에 지워요.
// - 그다음 `DELETE FROM users WHERE id = ?`를 실행하고 `endSession(c)`로 쿠키를 지워요.
// [작성 이유] DB의 작품·응원·북마크·세션 기록은 외래키의 `ON DELETE CASCADE` 덕분에 `users` 줄만 지워도 자동으로 함께 사라지지만, 외부 저장소인 R2 버킷의 사진 파일은 직접 지워 줘야 용량 낭비와 찌꺼기 파일이 남지 않기 때문이에요.
auth.delete('/me', needLogin, async (c) => {
  const uid = c.get('uid');
  const { results } = await c.env.DB.prepare('SELECT i.file FROM images i JOIN projects p ON p.id = i.project_id WHERE p.user_id = ?').bind(uid).all();
  if (results.length) await c.env.IMAGES.delete(results.map((i) => i.file));
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(uid).run();
  await endSession(c);
  return c.json({ ok: true });
});

// [뜻/역할] 작품을 등록·수정할 때 함께 만든 팀원을 닉네임으로 검색하는 API(`GET /api/users?q=검색어`)예요.
// [문법] 로그인한 회원만(`needLogin`) 쓸 수 있으며, `LIKE ?`에 `%검색어%`를 바인딩해 최대 10명까지만 `{ id, nickname }`을 돌려줘요.
// [작성 이유] 팀원 추가 화면(`edit.html`)에서 자동완성 목록을 보여 주되, 이메일 같은 민감한 정보는 빼고 번호와 닉네임만 안전하게 내려주기 위해서예요.
auth.get('/users', needLogin, async (c) => {
  const q = String(c.req.query('q') || '').trim();
  if (!q || q.length > 20) throw bad('닉네임을 1~20자로 적어 주세요');
  const { results } = await c.env.DB.prepare('SELECT id, nickname FROM users WHERE nickname LIKE ? ORDER BY nickname LIMIT 10').bind(`%${q}%`).all();
  return c.json(results);
});

// [뜻/역할] 다른 사람의 공개 프로필 페이지(`profile.html?id=번호`)에 보여 줄 기본 정보를 조회하는 API(`GET /api/users/:id`)예요.
// [문법] `SELECT id, nickname, bio FROM users WHERE id = ?`로 이메일(`email`)과 비밀번호(`password`)를 제외한 공개 항목만 가져와요.
// [작성 이유] 누구나 작가의 닉네임과 소개글은 볼 수 있게 하되 개인정보인 이메일은 외부에 노출되지 않게 보호하기 위해서예요.
auth.get('/users/:id', async (c) => {
  const user = await c.env.DB.prepare('SELECT id, nickname, bio FROM users WHERE id = ?').bind(c.req.param('id')).first();
  return user ? c.json(user) : c.json({ error: '없는 사용자예요' }, 404);
});

export default auth;
