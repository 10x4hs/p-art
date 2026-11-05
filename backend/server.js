// PART 서버의 시작점. `npm start`를 치면 이 파일이 실행된다.
// 하는 일: ① 설정 읽기 ② 로그인 세션 붙이기 ③ 화면 파일 내보내기 ④ API 연결 ⑤ 포트 열기

const express = require('express');                 // 웹 서버를 쉽게 만들어 주는 라이브러리
const session = require('express-session');         // "누가 로그인했는지" 기억하는 기능
const fs = require('fs');                           // 파일 다루기(실패한 업로드 지우기에 사용)
const config = require('./config');                 // 포트, 비밀키, 폴더 경로 같은 설정 모음
const SqliteStore = require('./session-store');     // 세션을 DB에 저장하는 저장소

const app = express();                              // 서버 객체 하나 만들기 — 이후 app.use / app.get으로 규칙을 붙인다

app.set('trust proxy', 1);                          // Railway는 앞에 프록시를 두므로, 진짜 접속 IP와 https 여부를 프록시가 알려 준 값으로 믿는다
app.use(express.json());                            // 요청 본문이 JSON이면 자동으로 객체(req.body)로 바꿔 준다

// ② 로그인 세션: 브라우저에는 쿠키로 "세션 번호"만 주고, 내용(uid)은 DB에 둔다
app.use(session({
  store: new SqliteStore(),                         // 메모리 대신 SQLite에 저장 → 재시작해도 로그인 유지
  secret: config.SECRET,                            // 쿠키 위조를 막는 서명용 비밀키(배포 땐 환경변수 SECRET)
  resave: false,                                    // 바뀐 게 없으면 다시 저장하지 않는다
  saveUninitialized: false,                         // 로그인 전 빈 세션은 만들지 않는다
  rolling: true,                                    // 사이트를 쓸 때마다 기한을 다시 30일로 늘린다
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,               // 30일(밀리초)
    httpOnly: true,                                 // 자바스크립트로 쿠키를 못 읽게 해서 도난 위험을 줄인다
    sameSite: 'lax',                                // 다른 사이트에서 몰래 보내는 요청에 쿠키가 따라가지 않게
    secure: config.isProd,                          // 배포 환경(https)에서만 쿠키를 보낸다
  },
}));

// ③ 정적 파일: 요청한 주소와 같은 이름의 파일을 그대로 내려준다
app.get('/api/health', (req, res) => res.json({ ok: true }));   // Railway가 "서버 살아 있나?" 확인하는 주소
app.use(express.static(config.FRONTEND_DIR));       // / → frontend/index.html, /works.html → frontend/works.html …
app.use('/shared', express.static(config.SHARED_DIR));   // 프론트·백엔드가 같이 쓰는 파일(분야 목록)
app.use('/uploads', express.static(config.UPLOAD_DIR));  // 사용자가 올린 사진

// ④ API: 주소 앞부분에 따라 담당 파일로 넘긴다
app.use('/api', require('./routes/auth'));          // /api/signup, /api/login, /api/me …
app.use('/api/projects', require('./routes/projects'));  // /api/projects …

// 위에서 처리하다 에러가 나면 여기로 온다(인자가 4개인 함수 = 에러 처리기)
app.use((err, req, res, next) => {
  (req.files || []).forEach((f) => fs.rmSync(f.path, { force: true }));   // 저장 도중 실패했으면 올라온 사진을 지운다
  res.status(400).json({ error: err.message });     // 화면이 보여 줄 수 있게 JSON으로 오류 문구를 보낸다
});

// ⑤ 포트를 열고 요청을 기다린다
app.listen(config.PORT, () => console.log(`PART → http://localhost:${config.PORT}  (data: ${config.DATA_DIR})`));
