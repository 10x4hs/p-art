// [파일 개요] 회원 관련 API 묶음이에요 — 가입, 로그인, 로그아웃, 내 정보 조회·수정·탈퇴, 다른 사람 공개 프로필 조회.
// [비유] 전시관 입구의 '안내 데스크'예요. 회원증을 발급(가입)하고, 신분증을 확인(로그인)하고, 회원 정보를 고쳐 줘요.

// [뜻/역할] 필요한 도구들을 가져와요: Hono(라우터), 비밀번호 암호화, 세션(로그인 상태), 공용 도구.
// [문법] import { a, b } from '경로'; — 그 파일이 export한 것 중 필요한 이름만 골라 가져와요. `../`는 한 칸 위 폴더(backend/src/)예요.
import { Hono } from 'hono';
import { hashPassword, checkPassword } from '../password.js';
import { startSession, endSession, needLogin } from '../session.js';
import { bad, readJson } from '../util.js';

// [뜻/역할] 회원 API만 담을 작은 Hono 앱을 만들어요. index.js가 이것을 /api 아래에 붙여요.
// [작성 이유] index.js에 모든 API를 다 쓰면 너무 길어져서, 회원 관련만 이 파일로 분리했어요.
const auth = new Hono();

// [뜻/역할] 이메일 모양(`글자@글자.글자`)인지 검사하는 정규표현식이에요.
// [문법] `^`는 시작, `[^\s@]+`는 공백이나 @가 아닌 글자 1개 이상, `\.`은 점 글자, `$`는 끝이에요.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// [뜻/역할] 이메일의 앞뒤 공백을 자르고 소문자로 바꿔요.
// [문법] String(e || '') — 값이 없어도(undefined) 에러가 안 나게 빈 글자로 바꾼 뒤 처리해요.
// [작성 이유] Test@A.com으로 가입하고 test@a.com으로 로그인해도 같은 사람으로 알아보게 하려고요.
const cleanEmail = (e) => String(e || '').trim().toLowerCase();   // Test@A.com 과 test@a.com 을 같은 사람으로
// [뜻/역할] 회원 번호로 DB에서 '보여 줘도 되는 정보'(번호, 이메일, 닉네임, 소개)만 꺼내요.
// [문법] c.env.DB는 D1 데이터베이스예요. prepare(SQL).bind(값).first()는 ? 자리에 값을 넣고 첫 줄 하나를 가져와요.
// [작성 이유] password(암호문) 열은 화면으로 보내면 안 되니까, 안전한 열만 골라서 가져와요.
const me = (c, id) => c.env.DB.prepare('SELECT id, email, nickname, bio FROM users WHERE id = ?').bind(id).first();

// [뜻/역할] 닉네임이 2~20자가 아니면 400 오류를 던져요.
// [문법] throw — 오류를 던지면 함수가 바로 멈추고, index.js의 onError가 받아서 { error } JSON으로 응답해요.
// [작성 이유] 가입과 정보 수정 두 곳에서 같은 규칙을 쓰니 함수 하나로 묶었어요.
function checkNickname(nickname) {
  if (nickname.length < 2 || nickname.length > 20) throw bad('닉네임은 2~20자예요');
}

// [뜻/역할] POST /api/signup — 새 회원을 가입시키고 바로 로그인 상태로 만들어 줘요.
// [문법] auth.post(주소, async (c) => {...}) — POST 요청이 오면 실행돼요. async라서 안에서 await로 DB 작업이 끝나길 기다릴 수 있어요.
auth.post('/signup', async (c) => {
  // [뜻/역할] 요청 본문(JSON)에서 이메일·비밀번호·닉네임을 꺼내 깨끗하게 정리해요.
  const body = await readJson(c);
  const email = cleanEmail(body.email);
  const password = String(body.password || '');
  const nickname = String(body.nickname || '').trim();
  // [뜻/역할] 이메일 형식이 틀렸거나 100자를 넘으면 거절해요.
  // [작성 이유] 화면에서도 검사하지만, 화면 검사는 우회해서 서버로 바로 요청을 보낼 수 있으니 서버에서 꼭 다시 검사해요.
  if (!EMAIL.test(email) || email.length > 100) throw bad('이메일 주소를 확인해 주세요');
  // [뜻/역할] 비밀번호가 8자 이상이고 영문자와 숫자가 모두 들어 있는지 검사해요.
  // [문법] (?=.*[A-Za-z])와 (?=.*\d)는 '전방 탐색'으로 "어딘가에 영문자/숫자가 있다"를 확인하고, .{8,}는 8글자 이상이에요.
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) throw bad('비밀번호는 8자 이상, 영문+숫자가 필요해요');
  checkNickname(nickname);
  // [뜻/역할] 같은 이메일이 이미 있으면 409(중복 충돌) 오류를 던져요.
  // [작성 이유] 가입 화면(signup.html)은 409를 받으면 이메일 입력 단계로 돌아가 다른 이메일을 쓰게 안내해요.
  if (await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) throw bad('이미 가입한 이메일이에요', 409);

  // [뜻/역할] 비밀번호를 암호문으로 바꿔서 users 표에 새 회원을 추가(INSERT)해요.
  // [문법] .run()은 결과 줄이 필요 없는 SQL(추가·수정·삭제)을 실행해요. 돌려받은 meta.last_row_id는 방금 생긴 회원 번호예요.
  //        const { meta } = ... 는 결과 객체에서 meta만 꺼내는 구조 분해 할당이에요.
  const { meta } = await c.env.DB.prepare('INSERT INTO users (email, password, nickname) VALUES (?, ?, ?)')
    .bind(email, await hashPassword(password), nickname).run();
  // [작성 이유] 가입하자마자 또 로그인할 필요 없게 바로 세션을 만들어 줘요.
  await startSession(c, meta.last_row_id);   // 가입하면 바로 로그인
  // [뜻/역할] 가입된 내 정보를 JSON으로 돌려줘요. 화면이 환영 문구를 띄울 때 써요.
  return c.json(await me(c, meta.last_row_id));
});

// [뜻/역할] POST /api/login — 이메일과 비밀번호를 확인해서 로그인시켜 줘요.
auth.post('/login', async (c) => {
  const body = await readJson(c);
  // [뜻/역할] 이메일로 회원 줄 전체(비밀번호 암호문 포함)를 찾아요. 저장된 암호문과 비교해야 하니까요.
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(cleanEmail(body.email)).first();
  // [뜻/역할] 회원이 없거나 비밀번호가 틀리면 401 오류를 던져요.
  // [작성 이유] "없는 이메일"과 "틀린 비밀번호"를 다르게 알려 주면, 남이 어떤 이메일이 가입돼 있는지 알아낼 수 있어서(계정 열거 공격) 일부러 같은 문구를 써요.
  if (!user || !(await checkPassword(String(body.password || ''), user.password))) throw bad('이메일이나 비밀번호가 맞지 않아요', 401);
  // [뜻/역할] 확인이 끝났으니 세션을 만들고(쿠키 발급), 비밀번호를 뺀 내 정보를 돌려줘요.
  await startSession(c, user.id);
  return c.json(await me(c, user.id));
});

// [뜻/역할] POST /api/logout — 세션을 지워서 로그아웃시켜요.
auth.post('/logout', async (c) => {
  await endSession(c);
  return c.json({ ok: true });
});

// [뜻/역할] GET /api/me — 로그인했으면 내 정보를, 안 했으면 null을 돌려줘요.
// [문법] 조건 ? A : B — 삼항 연산자예요. uid가 있으면 A, 없으면 B예요.
// [작성 이유] 모든 화면의 상단 메뉴(nav)가 이걸로 "로그인 / 내 프로필" 중 무엇을 보여 줄지 정해요.
auth.get('/me', async (c) => c.json(c.get('uid') ? await me(c, c.get('uid')) : null));

// [뜻/역할] PUT /api/me — 내 닉네임과 소개를 고쳐요. needLogin 검문소를 지나야만 실행돼요.
// [문법] auth.put(주소, 미들웨어, 처리함수) — 가운데 needLogin이 먼저 실행되고, 통과해야 처리함수로 넘어가요.
auth.put('/me', needLogin, async (c) => {
  const body = await readJson(c);
  const nickname = String(body.nickname || '').trim();
  checkNickname(nickname);
  // [뜻/역할] 소개(bio)는 200자까지만 잘라서(slice) 저장해요. WHERE id = 내 번호라서 남의 정보는 고칠 수 없어요.
  await c.env.DB.prepare('UPDATE users SET nickname = ?, bio = ? WHERE id = ?')
    .bind(nickname, String(body.bio || '').slice(0, 200), c.get('uid')).run();
  return c.json(await me(c, c.get('uid')));
});

// [뜻/역할] DELETE /api/me — 회원 탈퇴예요.
// [작성 이유] R2에 있는 사진은 DB가 자동으로 지워 주지 못하니 먼저 직접 지워요. 그다음 users 줄을 지우면,
//            작품·응원·세션은 DB의 ON DELETE CASCADE 규칙(0001_init.sql) 덕분에 같이 지워져요.
auth.delete('/me', needLogin, async (c) => {
  const uid = c.get('uid');
  // [뜻/역할] 내 작품들에 달린 사진 키를 모두 찾아요.
  // [문법] JOIN은 두 표를 조건(p.id = i.project_id)으로 이어 붙여요. .all()은 여러 줄을 { results: [...] }로 가져와요.
  const { results } = await c.env.DB.prepare('SELECT i.file FROM images i JOIN projects p ON p.id = i.project_id WHERE p.user_id = ?').bind(uid).all();
  // [뜻/역할] R2(IMAGES)에서 사진들을 한꺼번에 지워요.
  // [문법] R2의 delete()는 키 배열을 받으면 여러 개를 한 번에 지워요. 사진이 없으면(빈 배열) 부를 필요가 없어서 건너뛰어요.
  if (results.length) await c.env.IMAGES.delete(results.map((i) => i.file));
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(uid).run();
  await endSession(c);
  return c.json({ ok: true });
});

// [뜻/역할] GET /api/users/:id — 다른 사람의 공개 프로필(번호, 닉네임, 소개)을 돌려줘요. 이메일은 보여 주지 않아요.
// [문법] :id 자리의 글자는 c.req.param('id')로 꺼내요. 없으면 404(없음)로 응답해요.
auth.get('/users/:id', async (c) => {
  const user = await c.env.DB.prepare('SELECT id, nickname, bio FROM users WHERE id = ?').bind(c.req.param('id')).first();
  return user ? c.json(user) : c.json({ error: '없는 사용자예요' }, 404);
});

// [뜻/역할] 완성한 회원 API 묶음을 내보내요. index.js가 import해서 /api에 붙여요.
export default auth;
