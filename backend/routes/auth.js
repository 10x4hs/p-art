// [파일 개요] 회원 인증 및 계정 관리 라우터 — 가입, 로그인, 로그아웃, 내 정보 조회·수정·탈퇴, 다른 사용자 프로필 조회를 담당해요.
// [비유] 전시관 입구의 '안내 데스크'예요. 회원증을 발급(가입)하고, 신분증을 확인(로그인·needLogin)하고, 회원 정보를 고쳐 줘요.

// [뜻/역할] 주소별 규칙(라우트)을 묶어 주는 Express의 작은 라우터 객체를 하나 만들어요.
// [문법] const router = require('express').Router();
// [작성 이유] `server.js`에 모든 API를 다 적으면 너무 길어지므로, 회원 관련 API만 이 파일로 깔끔하게 분리하기 위해서예요.
const router = require('express').Router();

// [뜻/역할] 비밀번호를 원래대로 되돌릴 수 없는 암호문(해시)으로 바꿔 주고 비교해 주는 라이브러리를 불러와요.
// [문법] const bcrypt = require('bcryptjs');
// [작성 이유] 비밀번호를 있는 그대로 DB에 저장하면 해킹당했을 때 큰일이 나므로 단방향 암호화를 꼭 해야 해요.
const bcrypt = require('bcryptjs');

// [뜻/역할] SQLite 데이터베이스 연결 객체를 가져와요.
// [문법] const db = require('../db'); — `..`은 한 칸 위 폴더(`backend/`)를 뜻해요.
// [작성 이유] `users` 테이블에서 회원을 찾고 추가하고 수정하고 지우기 위해서예요.
const db = require('../db');

// [뜻/역할] 설정 파일에서 사진이 저장되는 폴더 경로(`UPLOAD_DIR`)를 가져와요.
// [문법] const { UPLOAD_DIR } = require('../config');
// [작성 이유] 회원이 탈퇴할 때 그 회원이 올렸던 작품 사진 파일들도 디스크에서 함께 지워 주기 위해서예요.
const { UPLOAD_DIR } = require('../config');

// [뜻/역할] 요청이 잘못되었을 때 상태 코드와 에러 메시지를 JSON으로 보내 주는 짧은 도우미 함수예요.
// [문법] const fail = (res, code, error) => res.status(code).json({ error }); — `{ error }`는 `{ error: error }`의 줄임말이에요.
// [작성 이유] `res.status(400).json({ error: '...' })`를 매번 길게 쓰지 않고 `fail(res, 400, '...')`로 읽기 쉽게 쓰려고요.
const fail = (res, code, error) => res.status(code).json({ error });

// [뜻/역할] 로그인이 필요한 기능 앞에서 "로그인했나요?" 하고 검사하는 검문소(미들웨어) 함수예요.
// [문법] (req, res, next) => 조건 ? next() : fail(...) — 세션에 uid가 있으면 `next()`로 다음 단계로 통과시키고, 없으면 401 에러를 돌려줘요.
// [작성 이유] 내 정보 수정, 탈퇴, 작품 등록·수정·삭제, 응원하기 등 로그인한 사람만 할 수 있는 API를 한 줄로 보호하기 위해서예요.
const needLogin = (req, res, next) => (req.session.uid ? next() : fail(res, 401, '로그인이 필요해요'));

// [뜻/역할] 회원 번호(id)로 DB에서 내 정보(번호, 이메일, 닉네임, 소개)만 골라 꺼내 오는 도우미 함수예요.
// [문법] const me = (id) => db.prepare('SELECT ... WHERE id = ?').get(id);
// [작성 이유] `password`(암호문) 열은 화면으로 보낼 필요가 없고 보내서도 안 되므로 안전한 4가지 열만 골라서 가져오는 거예요.
const me = (id) => db.prepare('SELECT id, email, nickname, bio FROM users WHERE id = ?').get(id);

// [뜻/역할] 글자가 이메일 주소 모양(`글자@글자.글자`)이 맞는지 검사하는 정규표현식(Regular Expression)이에요.
// [문법] /^[^\s@]+@[^\s@]+\.[^\s@]+$/ — `^`는 시작, `[^\s@]+`는 공백이나 @가 아닌 글자 1개 이상, `@`와 `\.`은 기호 그대로, `$`는 끝을 뜻해요.
// [작성 이유] 이메일 칸에 `@`가 없거나 공백이 섞인 잘못된 글자를 넣는 실수를 막기 위해서예요.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// [뜻/역할] 사용자가 입력한 이메일의 앞뒤 공백을 자르고(`trim`), 모든 알파벳을 소문자로 바꾸는(`toLowerCase`) 함수예요.
// [문법] String(e || '').trim().toLowerCase() — 값이 없어도(`undefined`) 에러가 안 나게 빈 글자(`''`)로 바꾼 뒤 처리해요.
// [작성 이유] `Student@School.kr`로 가입하고 나중에 `student@school.kr`로 로그인해도 같은 사람으로 인식하게 하기 위해서예요.
const cleanEmail = (e) => String(e || '').trim().toLowerCase();

// [뜻/역할] `POST /api/signup` 요청이 오면 새 회원을 가입시키고 동시에 로그인 상태로 만들어 줘요.
// [문법] router.post('/signup', (req, res) => { ... });
// [작성 이유] 회원가입 화면(`signup.html`)에서 3단계를 다 입력하고 완료를 눌렀을 때 실행되는 창구예요.
router.post('/signup', (req, res) => {
  // [뜻/역할] 요청 본문에서 이메일을 꺼내 공백을 지우고 소문자로 정리해요.
  // [문법] const email = cleanEmail(req.body.email);
  // [작성 이유] 검사하기 전에 미리 깨끗한 표준 모양으로 맞추기 위해서예요.
  const email = cleanEmail(req.body.email);
  // [뜻/역할] 요청 본문에서 비밀번호를 꺼내요. 만약 값이 안 왔으면 빈 글자(`''`)를 기본값으로 써요.
  // [문법] const { password = '' } = req.body; — 기본값이 있는 객체 구조 분해 할당이에요.
  // [작성 이유] `password`가 `undefined`일 때 에러가 나는 것을 막기 위해서예요.
  const { password = '' } = req.body;
  // [뜻/역할] 요청 본문에서 닉네임을 꺼내 문자열로 바꾸고 앞뒤 공백을 제거해요.
  // [문법] String(req.body.nickname || '').trim()
  // [작성 이유] 공백만 여러 칸 입력해서 닉네임 글자 수 검사를 통과하는 꼼수를 막기 위해서예요.
  const nickname = String(req.body.nickname || '').trim();
  // [뜻/역할] 이메일 형식이 맞지 않거나 100자를 넘으면 400(잘못된 요청) 에러를 돌려주고 함수를 끝내요(`return`).
  // [문법] if (!EMAIL.test(email) || email.length > 100) return fail(...); — `.test()`는 정규식에 맞으면 true를 돌려줘요.
  // [작성 이유] 프론트엔드에서도 검사하지만, 해커는 브라우저 검사를 우회해 서버로 바로 요청을 보낼 수 있으므로 서버에서 반드시 다시 검사해야 해요.
  if (!EMAIL.test(email) || email.length > 100) return fail(res, 400, '이메일 주소를 확인해 주세요');
  // [뜻/역할] 비밀번호에 영문자(`(?=.*[A-Za-z])`)와 숫자(`(?=.*\d)`)가 모두 들어 있고 8자 이상(`.{8,}`)인지 검사해요.
  // [문법] 정규식의 전방 탐색(`(?=...)`) 문법이에요. 조건에 안 맞으면 400 에러를 반환해요.
  // [작성 이유] `1234`나 `aaaa`처럼 너무 쉬워서 남이 추측할 수 있는 약한 비밀번호를 막기 위해서예요.
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) return fail(res, 400, '비밀번호는 8자 이상, 영문+숫자가 필요해요');
  // [뜻/역할] 닉네임이 2자보다 짧거나 20자보다 길면 400 에러를 돌려줘요.
  // [문법] if (nickname.length < 2 || nickname.length > 20) return fail(...);
  // [작성 이유] 너무 짧거나 화면 카드를 뚫고 나갈 만큼 긴 닉네임을 방지하기 위해서예요.
  if (nickname.length < 2 || nickname.length > 20) return fail(res, 400, '닉네임은 2~20자예요');
  // [뜻/역할] 이미 같은 이메일로 가입한 회원이 DB에 있는지 찾아보고, 있으면 409(Conflict, 중복 충돌) 에러를 돌려줘요.
  // [문법] db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)
  // [작성 이유] 가입 화면(`signup.html`)이 409 상태 코드를 받으면 자동으로 1단계(이메일 입력칸)로 되돌아가서 다른 이메일을 쓰게 안내해요.
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return fail(res, 409, '이미 가입한 이메일이에요');

  // [뜻/역할] 검사를 모두 통과한 비밀번호를 bcrypt로 10단계 강도($2^{10}=1024$번 섞기)로 암호화해요.
  // [문법] bcrypt.hashSync(원본비밀번호, 솔트라운드);
  // [작성 이유] 똑같은 비밀번호라도 매번 다른 소금값(Salt)을 쳐서 완전히 다른 암호문으로 만들어 안전하게 보관해요.
  const hash = bcrypt.hashSync(password, 10);
  // [뜻/역할] users 표에 새 회원을 추가(INSERT)하고, 방금 생성된 회원 번호(`lastInsertRowid`)를 세션(`req.session.uid`)에 바로 저장해요.
  // [문법] db.prepare('INSERT ...').run(값1, 값2, 값3).lastInsertRowid
  // [작성 이유] 가입하자마자 또 로그인할 필요 없이 바로 로그인 상태가 되게 해 주는 친절한 UX예요.
  req.session.uid = db.prepare('INSERT INTO users (email, password, nickname) VALUES (?, ?, ?)')
    .run(email, hash, nickname).lastInsertRowid;
  // [뜻/역할] 가입된 내 회원 정보를 JSON으로 응답해요.
  // [문법] res.json(me(req.session.uid));
  // [작성 이유] 프론트엔드가 가입 성공을 확인하고 환영 화면을 보여 줄 수 있게 해요.
  res.json(me(req.session.uid));
});

// [뜻/역할] `POST /api/login` 요청이 오면 이메일과 비밀번호를 확인해 로그인시켜 줘요.
// [문법] router.post('/login', (req, res) => { ... });
// [작성 이유] 로그인 화면(`login.html`)에서 이메일과 비밀번호를 입력했을 때 실행되는 창구예요.
router.post('/login', (req, res) => {
  // [뜻/역할] 입력한 이메일(소문자 변환)로 DB에서 회원 행 전체(비밀번호 암호문 포함)를 찾아와요.
  // [문법] db.prepare('SELECT * FROM users WHERE email = ?').get(...)
  // [작성 이유] 저장된 비밀번호 암호문(`user.password`)과 지금 입력한 비밀번호를 비교해야 하기 때문이에요.
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail(req.body.email));
  // [뜻/역할] 그런 이메일의 회원이 없거나(`!user`), 입력한 비밀번호와 암호문이 일치하지 않으면(`!bcrypt.compareSync(...)`) 401 에러를 돌려줘요.
  // [문법] bcrypt.compareSync(입력값, 저장된암호문) — 일치하면 true, 틀리면 false를 돌려줘요.
  // [작성 이유] 보안 꿀팁: "없는 이메일이에요"와 "비밀번호가 틀렸어요"를 구분해서 알려 주면 해커가 누가 가입했는지 알아낼 수 있어서(계정 열거 공격), 일부러 똑같은 안내 문구를 써요!
  if (!user || !bcrypt.compareSync(req.body.password || '', user.password)) return fail(res, 401, '이메일이나 비밀번호가 맞지 않아요');
  // [뜻/역할] 확인이 끝났으니 세션 장부에 이 회원의 번호(`user.id`)를 기록해요.
  // [문법] req.session.uid = user.id;
  // [작성 이유] 이 순간 세션이 DB에 저장되고 브라우저로 세션 쿠키가 발급되어 로그인이 완료돼요.
  req.session.uid = user.id;
  // [뜻/역할] 비밀번호를 뺀 안전한 내 정보(`me(user.id)`)를 JSON으로 돌려줘요.
  // [문법] res.json(me(user.id));
  // [작성 이유] 로그인 완료 화면에서 "어서 와요, OOO(닉네임)"을 바로 띄워 주기 위해서예요.
  res.json(me(user.id));
});

// [뜻/역할] `POST /api/logout` 요청이 오면 현재 세션을 DB에서 지워 로그아웃시켜요.
// [문법] req.session.destroy(() => res.json({ ok: true }));
// [작성 이유] 프로필 페이지에서 '로그아웃' 버튼을 눌렀을 때 서버의 세션 장부를 파기하기 위해서예요.
router.post('/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

// [뜻/역할] `GET /api/me` 요청이 오면 현재 로그인한 내 정보를 돌려주고, 로그인 안 했으면 `null`을 돌려줘요.
// [문법] req.session.uid ? me(req.session.uid) : null
// [작성 이유] 모든 페이지가 처음 열릴 때 상단 메뉴(`nav()`)가 이 주소를 불러서 왼쪽 위에 '닉네임'을 보여 줄지 'Login / Sign up'을 보여 줄지 결정해요.
router.get('/me', (req, res) => res.json(req.session.uid ? me(req.session.uid) : null));

// [뜻/역할] `PUT /api/me` 요청이 오면(로그인 필수) 내 닉네임과 자기소개를 수정해요.
// [문법] router.put('/me', needLogin, (req, res) => { ... }); — 가운데 `needLogin` 검문소를 먼저 통과해야 실행돼요.
// [작성 이유] 내 프로필 페이지(`profile.html`)에서 닉네임이나 소개글을 바꾸고 '저장'을 눌렀을 때 처리하기 위해서예요.
router.put('/me', needLogin, (req, res) => {
  // [뜻/역할] 새 닉네임의 앞뒤 공백을 제거해요.
  // [문법] String(req.body.nickname || '').trim()
  // [작성 이유] 공백만 넣는 것을 방지하기 위해서예요.
  const nickname = String(req.body.nickname || '').trim();
  // [뜻/역할] 새 자기소개 글을 문자열로 꺼내요.
  // [문법] String(req.body.bio || '')
  // [작성 이유] 자기소개는 비워 둘 수도 있으므로 없으면 빈 글자로 처리해요.
  const bio = String(req.body.bio || '');
  // [뜻/역할] 닉네임이 비어 있거나 2~20자 범위를 벗어나면 400 에러를 돌려줘요.
  // [문법] if (!nickname || nickname.length < 2 || nickname.length > 20)
  // [작성 이유] 수정할 때도 가입할 때와 똑같은 닉네임 규칙을 유지하기 위해서예요.
  if (!nickname || nickname.length < 2 || nickname.length > 20) return fail(res, 400, '닉네임은 2~20자예요');
  // [뜻/역할] DB에서 내 회원 행의 닉네임과 자기소개(최대 200자까지만 자름)를 업데이트해요.
  // [문법] bio.slice(0, 200) — 글자가 200자를 넘으면 앞 200자까지만 잘라내요.
  // [작성 이유] 너무 긴 글을 보내도 안전하게 200자까지만 저장하기 위해서예요.
  db.prepare('UPDATE users SET nickname = ?, bio = ? WHERE id = ?').run(nickname, bio.slice(0, 200), req.session.uid);
  // [뜻/역할] 수정된 최신 내 정보를 다시 읽어서 돌려줘요.
  // [문법] res.json(me(req.session.uid));
  // [작성 이유] 화면 상단 메뉴의 닉네임 표시를 즉시 새 닉네임으로 바꾸기 위해서예요.
  res.json(me(req.session.uid));
});

// [뜻/역할] `DELETE /api/me` 요청이 오면(로그인 필수) 내가 올린 사진 파일들과 계정, 작품, 응원 기록을 모두 지우고 탈퇴해요.
// [문법] router.delete('/me', needLogin, (req, res) => { ... });
// [작성 이유] 프로필 페이지에서 '회원 탈퇴' 버튼을 눌렀을 때 깨끗하게 모든 데이터를 정리하기 위해서예요.
router.delete('/me', needLogin, (req, res) => {
  // [뜻/역할] 내가 올린 모든 작품(`p.user_id = ?`)에 연결된 사진 파일 이름들(`i.file`)을 DB에서 찾아 디스크(`data/uploads/`)에서 하나씩 지워요.
  // [문법] JOIN으로 images와 projects 표를 연결해 조회한 뒤 `.forEach()`로 `fs.rmSync()`를 실행해요.
  // [작성 이유] DB의 행들은 아래 `DELETE FROM users`를 할 때 `ON DELETE CASCADE`로 자동 삭제되지만, 폴더에 있는 실제 사진 파일은 DB가 지워 주지 않기 때문에 먼저 직접 지워야 해요!
  db.prepare('SELECT i.file FROM images i JOIN projects p ON p.id = i.project_id WHERE p.user_id = ?').all(req.session.uid)
    .forEach((i) => require('fs').rmSync(require('path').join(UPLOAD_DIR, i.file), { force: true }));
  // [뜻/역할] users 표에서 내 회원 행을 지워요(이때 내 작품·응원·사진DB기록·작품감상도 CASCADE로 연쇄 삭제됨).
  // [문법] db.prepare('DELETE FROM users WHERE id = ?').run(req.session.uid);
  // [작성 이유] 계정과 관련된 모든 DB 기록을 남김없이 삭제해요.
  db.prepare('DELETE FROM users WHERE id = ?').run(req.session.uid);
  // [뜻/역할] 로그인 세션도 파기하고 `{ ok: true }`를 응답해요.
  // [문법] req.session.destroy(() => res.json({ ok: true }));
  // [작성 이유] 탈퇴한 계정의 세션이 남아 있지 않게 마무리해요.
  req.session.destroy(() => res.json({ ok: true }));
});

// [뜻/역할] `GET /api/users/:id` 요청이 오면 특정 번호(`:id`) 회원의 공개 프로필(번호, 닉네임, 소개)을 돌려줘요.
// [문법] req.params.id — 주소의 `:id` 자리에 들어온 값을 꺼내요. 이메일과 비밀번호는 빼고 조회해요!
// [작성 이유] 다른 친구의 프로필 페이지(`/profile.html?id=3`)에 들어갔을 때 개인정보(이메일) 노출 없이 닉네임과 소개만 보여 주기 위해서예요.
router.get('/users/:id', (req, res) => {
  // [뜻/역할] id로 회원의 공개 정보만 조회해요.
  // [문법] db.prepare('SELECT id, nickname, bio FROM users WHERE id = ?').get(req.params.id);
  // [작성 이유] 누구든 볼 수 있는 공개 API이므로 민감한 열은 제외했어요.
  const user = db.prepare('SELECT id, nickname, bio FROM users WHERE id = ?').get(req.params.id);
  // [뜻/역할] 회원이 있으면 JSON으로 보내고, 없는 번호면 404(찾을 수 없음) 에러를 보내요.
  // [문법] user ? res.json(user) : fail(res, 404, '없는 사용자예요');
  // [작성 이유] 잘못된 프로필 주소로 접속했을 때 화면이 안내 문구를 띄울 수 있게 해요.
  user ? res.json(user) : fail(res, 404, '없는 사용자예요');
});

// [뜻/역할] 이 라우터 객체를 기본으로 내보내고, `needLogin` 검문소 함수도 속성으로 함께 달아서 내보내요.
// [문법] module.exports = router; module.exports.needLogin = needLogin;
// [작성 이유] `server.js`는 라우터 전체를 쓰고, `routes/projects.js`는 `const { needLogin } = require('./auth')`로 로그인 검문소만 빌려 쓰기 위해서예요.
module.exports = router;
module.exports.needLogin = needLogin;
