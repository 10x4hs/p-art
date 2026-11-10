// [파일 개요] PART 서버(Cloudflare Worker)의 시작점이에요. 들어온 요청을 주소에 맞는 담당 파일로 나눠 보내요.
// [비유] 전시관 '정문 안내원'이에요. 손님이 "작품 보러 왔어요"(/api/projects), "회원가입이요"(/api/signup) 하면 알맞은 창구로 보내 줘요.
// [뜻/역할] /api/* · /uploads/* · /shared/* 주소만 이 Worker로 오고, 나머지 화면 파일(html·css·이미지)은 Cloudflare가 frontend/ 폴더에서 바로 보내 줘요 (wrangler.jsonc의 "assets" 설정).
// [작성 이유] Worker는 Cloudflare 전 세계 서버에서 요청이 올 때마다 잠깐 실행되는 작은 함수예요. 화면 파일까지 Worker가 처리하면 낭비라서, 정말 '계산'이 필요한 주소만 여기로 오게 했어요.

// [뜻/역할] Hono라는 가벼운 웹 프레임워크를 불러와요. 예전 Express와 비슷하게 app.get('/주소', 함수) 식으로 API를 만들 수 있어요.
// [문법] import { 이름 } from '패키지'; — ES 모듈 문법으로, 패키지에서 Hono라는 이름만 골라 가져와요.
// [작성 이유] Express는 Node.js 전용이라 Cloudflare Workers에서 돌지 않아요. Hono는 Workers에서 잘 돌도록 만들어진 프레임워크예요.
import { Hono } from 'hono';
// [뜻/역할] 분야 목록(예: 학교생활, 게임 …)이 담긴 JSON 파일을 배열로 불러와요.
// [문법] JSON 파일을 import하면 wrangler가 빌드할 때 자바스크립트 값으로 바꿔 넣어 줘요. `../../`는 두 칸 위 폴더예요.
// [작성 이유] 서버와 화면이 같은 분야 목록을 쓰도록 shared/ 폴더에 하나만 두고 같이 쓰려고요.
import CATS from '../../shared/categories.json';
// [뜻/역할] 요청마다 "누가 로그인했나"를 확인하는 함수를 session.js에서 가져와요.
import { loadSession } from './session.js';
// [뜻/역할] 회원 관련 API 묶음(auth)과 작품 관련 API 묶음(projects)을 가져와요.
// [작성 이유] 한 파일에 다 쓰면 너무 길어지니 기능별로 routes/ 폴더에 나눠 두었어요.
import auth from './routes/auth.js';
import projects from './routes/projects.js';

// [뜻/역할] 서버 앱 객체를 하나 만들어요. 앞으로 모든 주소 규칙을 이 app에 등록해요.
// [문법] new Hono() — 클래스로 새 객체를 만드는 문법이에요.
const app = new Hono();

// [뜻/역할] /api/로 시작하는 모든 요청 앞에서 loadSession을 먼저 실행해, 로그인한 사람의 번호(uid)를 찾아 둬요.
// [문법] app.use(주소패턴, 미들웨어) — '*'는 "그 뒤에 무엇이 오든"이라는 뜻이에요. 미들웨어는 본 처리 전에 끼어드는 검문소 함수예요.
// [작성 이유] 모든 API마다 쿠키 확인 코드를 반복해서 쓰지 않으려고 한곳에서 처리해요.
app.use('/api/*', loadSession);                       // API 요청마다 "누가 로그인했나" 확인

// [뜻/역할] GET /api/health 로 오면 { ok: true }를 돌려줘요. 서버가 살아 있는지 확인하는 용도예요.
// [문법] (c) => c.json(...) — c는 Hono의 'context'(요청·응답·환경 정보가 담긴 상자)이고, c.json()은 JSON으로 응답해요.
// [작성 이유] 테스트(scripts/smoke-test.js)가 서버가 다 켜졌는지 이 주소로 확인해요.
app.get('/api/health', (c) => c.json({ ok: true }));  // 살아 있는지 확인용
// [뜻/역할] 회원 API 묶음을 /api 아래에 붙여요. → /api/signup, /api/login, /api/logout, /api/me, /api/users/:id
// [문법] app.route(앞주소, 하위앱) — 하위 앱의 주소 앞에 '앞주소'를 붙여서 등록해요.
app.route('/api', auth);                              // /api/signup, /login, /logout, /me, /users/:id
// [뜻/역할] 작품 API 묶음을 /api/projects 아래에 붙여요.
app.route('/api/projects', projects);                 // /api/projects …

// [뜻/역할] 화면이 <script src="/shared/categories.js">로 부르면, 분야 목록을 `window.CATS = [...]` 자바스크립트로 만들어 보내 줘요.
// [문법] `window.CATS = ${...}` 는 템플릿 리터럴로, ${} 안의 값이 글자 속에 끼워져요. JSON.stringify는 배열을 글자로 바꿔요.
//        c.body(내용, 상태코드, 헤더) 는 원하는 내용·헤더로 직접 응답해요.
// [작성 이유] 서버(JSON import)와 화면(window.CATS)이 같은 파일에서 나온 같은 목록을 쓰게 하려고요. 'no-cache'는 목록이 바뀌면 바로 반영되게 해요.
app.get('/shared/categories.js', (c) =>
  c.body(`window.CATS = ${JSON.stringify(CATS)};`, 200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }));

// [뜻/역할] /uploads/사진키 로 오면 KV 저장소(IMAGES)에서 그 사진을 꺼내 보내 줘요.
// [비유] KV는 '이름표(키) 붙은 사물함'이에요. 키를 알면 사물함에서 물건(사진 데이터)을 바로 꺼낼 수 있어요.
// [문법] c.env.IMAGES 는 wrangler.jsonc에서 연결(binding)한 KV 저장소예요. c.env에는 이렇게 연결된 DB·KV 같은 도구들이 들어 있어요.
//        getWithMetadata(키, 'arrayBuffer') 는 사진 데이터(value)와 함께 저장해 둔 부가 정보(metadata)를 같이 꺼내요.
//        :key 는 주소의 그 자리 글자를 c.req.param('key')로 꺼낼 수 있다는 뜻이에요.
// [작성 이유] 사진 키는 한 번 정해지면 절대 안 바뀌니까, 브라우저가 1년(31536000초) 동안 저장해 두고 다시 받지 않아도 돼요(immutable).
app.get('/uploads/:key', async (c) => {
  const { value, metadata } = await c.env.IMAGES.getWithMetadata(c.req.param('key'), 'arrayBuffer');
  // [뜻/역할] 그런 키의 사진이 없으면 404(찾을 수 없음)로 응답해요.
  if (!value) return c.notFound();
  // [문법] metadata?.type — ?.(옵셔널 체이닝)은 metadata가 없으면 에러 대신 undefined를 줘요. 그러면 || 뒤의 'image/jpeg'를 써요.
  return c.body(value, 200, { 'Content-Type': metadata?.type || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' });
});

// [뜻/역할] 어떤 API에서든 오류가 던져지면(throw) 여기로 모여요. 예상한 오류(입력이 잘못됨 등)는 그 상태 코드로, 나머지는 500으로 보내요.
// [문법] app.onError((err, c) => ...) — Hono의 공통 오류 처리기예요. err.status는 util.js의 bad()가 붙여 둔 상태 코드예요.
// [작성 이유] 화면(app.js)은 항상 { error: '메시지' } 모양을 기대하므로, 어떤 오류든 같은 모양으로 돌려주려고요.
//            예상 못 한 오류는 console.error로 서버 기록(로그)에 남기고, 사용자에게는 자세한 내용 대신 부드러운 안내만 보여 줘요.
app.onError((err, c) => {
  if (err.status) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: '서버에서 문제가 생겼어요. 잠시 후 다시 해 주세요' }, 500);
});

// [뜻/역할] 완성된 app을 이 파일의 기본 내보내기로 내보내요. Cloudflare는 wrangler.jsonc의 "main" 파일이 내보낸 이것으로 요청을 처리해요.
// [문법] export default 값; — 파일마다 하나씩 둘 수 있는 '대표 내보내기'예요.
export default app;
