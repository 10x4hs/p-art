// [파일 개요] PART 서버의 시작점(Entry Point)이에요. 터미널에서 `npm start`를 치면 가장 먼저 이 파일이 실행돼요.
// [비유] 식당 문을 열고, 손님 맞이 규칙(세션·정적 파일·주문 창구·에러 처리)을 순서대로 세팅하는 '총괄 지배인'이에요.
// 하는 일: ① 설정 읽기 ② 로그인 세션 붙이기 ③ 화면 파일 내보내기 ④ API 연결 ⑤ 포트 열기

// [뜻/역할] Node.js로 웹 서버를 가장 쉽고 빠르게 만들게 해 주는 express 라이브러리를 불러와요.
// [문법] const express = require('express');
// [작성 이유] 복잡한 네트워크 통신을 직접 짜지 않고, 주소별로 깔끔하게 요청을 처리하기 위해서예요.
const express = require('express');

// [뜻/역할] 브라우저 쿠키와 서버 장부를 연결해 "누가 로그인했는지" 기억해 주는 세션 미들웨어를 불러와요.
// [문법] const session = require('express-session');
// [작성 이유] HTTP 통신은 원래 한 번 응답하면 손님을 잊어버리기 때문에(Stateless), 로그인 상태를 유지하려면 세션이 꼭 필요해요.
const session = require('express-session');

// [뜻/역할] 파일을 다루는 Node.js 기본 도구(fs)를 불러와요.
// [문법] const fs = require('fs');
// [작성 이유] 작품 등록 중 에러가 났을 때, 이미 디스크에 올라간 사진 파일을 깔끔하게 지우기 위해 써요.
const fs = require('fs');

// [뜻/역할] 같은 폴더의 config.js에서 포트 번호, 비밀키, 폴더 경로 같은 설정 모음을 가져와요.
// [문법] const config = require('./config'); — 내가 만든 파일을 불러올 때는 './'를 붙여요.
// [작성 이유] 설정값들을 하드코딩하지 않고 config 객체에서 꺼내 쓰기 위해서예요.
const config = require('./config');

// [뜻/역할] 로그인 세션을 메모리가 아닌 SQLite DB에 저장해 주는 맞춤형 저장소 클래스를 가져와요.
// [문법] const SqliteStore = require('./session-store');
// [작성 이유] 서버가 재시작되거나 새로 배포되어도 학생들의 로그인이 풀리지 않게 하려고요.
const SqliteStore = require('./session-store');

// [뜻/역할] Express 서버 애플리케이션 객체(app)를 하나 새로 만들어요.
// [문법] const app = express(); — 함수를 호출해 서버 인스턴스를 생성해요.
// [작성 이유] 이제부터 이 app에 .set(), .use(), .get(), .listen()으로 서버의 모든 규칙을 차곡차곡 붙이게 돼요.
const app = express();

// [뜻/역할] 서버 앞에 있는 첫 번째 프록시(중계 서버, 예: Railway 로드밸런서)가 전달해 주는 접속자 IP와 HTTPS 정보를 믿겠다고 설정해요.
// [문법] app.set('설정명', 값); — 숫자 1은 '바로 앞 프록시 1단계를 신뢰한다'는 뜻이에요.
// [작성 이유] 이걸 켜지 않으면 배포 환경에서 모든 접속자의 IP가 프록시 IP 하나로 똑같이 보여 방명록 도배 방지가 먹통이 되고, HTTPS 보안 쿠키도 작동하지 않아요.
app.set('trust proxy', 1);

// [뜻/역할] 브라우저가 보낸 요청 본문(Body)이 JSON 형식이면 자동으로 자바스크립트 객체(req.body)로 변환해 주는 검문소(미들웨어)를 붙여요.
// [문법] app.use(express.json()); — app.use()는 모든 요청이 지나가는 길목에 함수를 설치하는 문법이에요.
// [작성 이유] 로그인·가입·방명록 작성 때 프론트엔드가 보낸 JSON 데이터를 `req.body.email`처럼 바로 꺼내 쓰기 위해서예요.
app.use(express.json());

// ② 로그인 세션: 브라우저에는 쿠키로 "세션 번호"만 주고, 진짜 내용(uid)은 서버 DB에 둔다
// [뜻/역할] 모든 요청마다 쿠키의 세션 번호를 확인해 `req.session` 객체를 준비해 주는 세션 미들웨어를 등록해요.
// [문법] app.use(session({ 옵션객체 }));
// [작성 이유] 이후 라우터들에서 `req.session.uid` 한 줄로 로그인 여부를 확인하거나 로그인 처리를 할 수 있게 해 줘요.
app.use(session({
  // [뜻/역할] 세션을 저장할 장소로 우리가 만든 SQLite 저장소 인스턴스를 지정해요.
  // [문법] store: new SqliteStore() — 클래스로 새 객체를 만들어 넘겨요.
  // [작성 이유] 기본 메모리 저장소를 쓰면 서버를 껐다 켤 때마다 전원 로그아웃되기 때문이에요.
  store: new SqliteStore(),
  // [뜻/역할] 브라우저에 주는 쿠키(세션 번호표)가 위조되지 않았는지 서명(도장)을 찍는 비밀키예요.
  // [문법] secret: 문자열
  // [작성 이유] 누군가 쿠키 값을 임의로 바꿔서 다른 사람인 척하는 해킹을 막아 줘요.
  secret: config.SECRET,
  // [뜻/역할] 요청 처리 중에 세션 내용이 바뀌지 않았다면 굳이 DB에 다시 저장하지 않게 해요.
  // [문법] resave: false
  // [작성 이유] 불필요한 DB 쓰기 작업을 줄여 성능을 아끼기 위해서예요.
  resave: false,
  // [뜻/역할] 아직 아무 정보도 담기지 않은 빈 세션(비로그인 방문자)은 DB에 저장하거나 쿠키를 주지 않아요.
  // [문법] saveUninitialized: false
  // [작성 이유] 그냥 구경만 하러 온 사람들의 빈 세션으로 DB가 가득 차는 것을 막아요.
  saveUninitialized: false,
  // [뜻/역할] 로그인한 사용자가 사이트를 이용할 때마다 쿠키 만료 기한을 다시 30일 뒤로 연장해요.
  // [문법] rolling: true
  // [작성 이유] 자주 들어오는 학생은 한 달이 지나도 갑자기 로그아웃되지 않고 계속 편하게 쓸 수 있게 해 줘요.
  rolling: true,
  // [뜻/역할] 브라우저에 심어 줄 세션 쿠키의 세부 보안·유효기간 규칙을 정해요.
  // [문법] cookie: { ... } 중첩 객체
  // [작성 이유] 쿠키 도난(XSS, CSRF, 네트워크 감청)을 막고 유지 기간을 설정하기 위해서예요.
  cookie: {
    // [뜻/역할] 쿠키의 수명을 30일(밀리초 단위: 30일 * 24시간 * 60분 * 60초 * 1000)로 정해요.
    // [문법] maxAge: 숫자(ms)
    // [작성 이유] 브라우저를 닫았다가 다시 열어도 30일 동안은 로그인이 유지되게 하려고요.
    maxAge: 30 * 24 * 60 * 60 * 1000,
    // [뜻/역할] 브라우저의 자바스크립트(`document.cookie`)로는 이 쿠키를 절대 읽을 수 없게 막아요.
    // [문법] httpOnly: true
    // [작성 이유] 혹시 악성 스크립트(XSS)가 실행되더라도 로그인 쿠키를 훔쳐 갈 수 없게 하는 핵심 보안 설정이에요.
    httpOnly: true,
    // [뜻/역할] 다른 외부 사이트에서 몰래 우리 서버로 요청을 보낼 때 쿠키가 자동으로 따라가지 않게 막아요.
    // [문법] sameSite: 'lax'
    // [작성 이유] 사이트 간 요청 위조(CSRF) 공격을 방어하면서도 일반 링크 클릭 이동은 자연스럽게 허용하기 위해서예요.
    sameSite: 'lax',
    // [뜻/역할] 배포 환경(isProd가 true)에서는 암호화된 HTTPS 연결일 때만 쿠키를 전송해요.
    // [문법] secure: 불리언(true/false)
    // [작성 이유] 내 컴퓨터(http://localhost)에서는 쿠키가 되어야 하고, 실제 인터넷(https://)에서는 감청을 막아야 하기 때문이에요.
    secure: config.isProd,
  },
}));

// ③ 정적 파일: 요청한 주소와 같은 이름의 파일을 가공 없이 그대로 내려준다
// [뜻/역할] `/api/health` 주소로 GET 요청이 오면 `{ "ok": true }` JSON을 즉시 돌려줘요.
// [문법] app.get('주소', (req, res) => res.json(객체));
// [작성 이유] Railway 배포 서버나 테스트 스크립트가 "서버가 잘 켜져서 살아 있나?"(헬스 체크)를 확인할 때 쓰는 전용 창구예요.
app.get('/api/health', (req, res) => res.json({ ok: true }));

// [뜻/역할] 브라우저가 `/`, `/works.html`, `/style.css`, `/js/app.js` 등을 요청하면 `frontend/` 폴더에서 같은 이름의 파일을 찾아 그대로 보내 줘요.
// [문법] app.use(express.static(폴더경로)); — `/` 요청은 자동으로 `index.html`을 찾아 줘요.
// [작성 이유] HTML·CSS·JS 파일마다 일일이 `app.get` 코드를 짜지 않고 폴더 통째로 웹에 공개하기 위해서예요.
app.use(express.static(config.FRONTEND_DIR));

// [뜻/역할] `/shared/...`로 시작하는 주소로 요청이 오면 `shared/` 폴더 안의 파일을 내려줘요.
// [문법] app.use('/접두사', express.static(폴더경로));
// [작성 이유] 프론트엔드 HTML에서 `<script src="/shared/categories.js">`로 백엔드와 똑같은 분야 목록 파일을 불러올 수 있게 해요.
app.use('/shared', express.static(config.SHARED_DIR));

// [뜻/역할] `/uploads/...`로 시작하는 주소로 요청이 오면 `data/uploads/` 폴더 안의 사진 파일을 내려줘요.
// [문법] app.use('/uploads', express.static(config.UPLOAD_DIR));
// [작성 이유] 사용자가 올린 작품 사진을 `<img src="/uploads/파일명.jpg">`로 화면에 보여 주기 위해서예요.
app.use('/uploads', express.static(config.UPLOAD_DIR));

// ④ API: 주소 앞부분에 따라 담당 라우터 파일로 주문을 넘긴다
// [뜻/역할] `/api`로 시작하는 요청(`/api/signup`, `/api/login`, `/api/me` 등)을 `routes/auth.js`로 넘겨요.
// [문법] app.use('/api', 라우터객체);
// [작성 이유] 회원 관련 API 코드를 별도 파일로 분리해 서버 코드를 깔끔하게 관리하기 위해서예요.
app.use('/api', require('./routes/auth'));

// [뜻/역할] `/api/projects`로 시작하는 요청(작품 목록, 등록, 수정, 삭제, 응원, 감상)을 `routes/projects.js`로 넘겨요.
// [문법] app.use('/api/projects', 라우터객체); — projects.js 안에서는 뒷부분 주소(`/`나 `/:id`)만 적으면 돼요.
// [작성 이유] 작품 관련 API들을 한 파일에 모아 두고 주소 접두사를 통일하기 위해서예요.
app.use('/api/projects', require('./routes/projects'));

// [뜻/역할] 위의 라우터나 multer(파일 업로드)에서 에러(`throw new Error(...)`)가 발생했을 때 마지막으로 잡아서 처리하는 '전역 에러 처리기'예요.
// [문법] app.use((err, req, res, next) => { ... }); — Express에서 매개변수가 4개(err, req, res, next)인 함수는 특별히 에러 전용 미들웨어로 동작해요!
// [작성 이유] 어디서 에러가 나든 서버가 죽지 않게 막고, 화면이 이해할 수 있는 `{ error: "문구" }` JSON 형태로 친절히 알려 주기 위해서예요.
app.use((err, req, res, next) => {
  // [뜻/역할] 만약 사진을 올리는 도중(req.files에 파일이 있음) 입력값 검사 에러가 났다면, 방금 저장된 사진 파일들을 디스크에서 도로 지워요.
  // [문법] (req.files || []).forEach(...) — req.files가 없을 수도 있으니 빈 배열([])을 기본값으로 두고 반복해요. force: true는 파일이 없어도 에러를 안 내요.
  // [작성 이유] 작품 등록은 실패했는데 사진 파일만 서버 디스크에 유령처럼 계속 쌓이는 현상을 막기 위해서예요.
  (req.files || []).forEach((f) => fs.rmSync(f.path, { force: true }));
  // [뜻/역할] 상태 코드 400(잘못된 요청)과 함께 에러 메시지를 JSON으로 응답해요.
  // [문법] res.status(400).json({ error: err.message });
  // [작성 이유] 프론트엔드의 `api()` 함수가 이 `error` 글자를 읽어서 사용자 화면에 경고 토스트나 안내 문구로 바로 띄워 줘요.
  res.status(400).json({ error: err.message });
});

// ⑤ 포트를 열고 손님(브라우저 요청)을 기다린다
// [뜻/역할] 지정된 포트 번호(기본 3000)로 웹 서버의 문을 활짝 열고, 준비가 끝나면 터미널에 접속 주소와 데이터 폴더 위치를 출력해요.
// [문법] app.listen(포트번호, 완료콜백함수);
// [작성 이유] 이 줄이 실행되어야 비로소 컴퓨터가 브라우저의 접속을 받을 수 있는 진짜 서버가 돼요.
app.listen(config.PORT, () => console.log(`PART → http://localhost:${config.PORT}  (data: ${config.DATA_DIR})`));
