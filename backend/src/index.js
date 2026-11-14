// ============================================================================
// [파일 개요] 백엔드 서버(Cloudflare Worker)의 시작점(엔트리 포인트)이에요.
// - `/api/*`, `/uploads/*`, `/shared/*`, `/project`, `/project.html` 요청만 이 파일로 들어와요.
// - 나머지 일반 HTML·CSS·JS 파일은 Cloudflare Static Assets가 `frontend/` 폴더에서 직접 빠르게 내려줘요(`wrangler.jsonc`의 `assets` 설정).
// [비유] 백화점 정문 안내 데스크예요. 손님(요청)이 오면 신분증(세션 쿠키)을 확인한 뒤, 회원 창구(`auth.js`), 작품 창구(`projects.js`), 관리자 창구(`admin.js`), 사진 창고(`R2`) 중 알맞은 곳으로 안내해 줘요.
// ============================================================================

// [뜻/역할] Cloudflare Workers 환경에 최적화된 가벼운 웹 프레임워크 Hono를 불러와요.
// [문법] ES 모듈(`import { 이름 } from '패키지'`) 문법이에요.
// [작성 이유] Node.js 전용인 Express는 Cloudflare Workers에서 바로 돌아가지 않기 때문에, 표준 Web API(Request/Response) 기반인 Hono를 사용해요.
import { Hono } from 'hono';

// [뜻/역할] 서버와 프론트엔드가 함께 쓰는 작품 분야(카테고리) 목록 JSON 파일을 불러와요.
// [문법] JSON 파일을 바로 `import`하면 배열 데이터(`["웹·앱", "게임", ...]`)로 들어와요.
// [작성 이유] 분야 목록을 한 곳(`shared/categories.json`)에만 적어 두고 서버 검사와 화면 표시 양쪽에서 똑같이 쓰기 위해서예요.
import CATS from '../../shared/categories.json';

// [뜻/역할] 요청 쿠키(`sid`)를 읽어 로그인한 사용자 번호(`uid`)를 찾아 주는 미들웨어를 불러와요.
// [문법] 같은 폴더(`./`)의 `session.js`에서 `loadSession` 함수를 가져와요.
// [작성 이유] 모든 API 요청이 실행되기 전에 "지금 요청한 사람이 누구인지" 먼저 파악하기 위해서예요.
import { loadSession } from './session.js';

// [뜻/역할] 회원(`auth`), 작품(`projects`), 관리자(`admin`) 라우터와 작품 공유 미리보기(`projectPage`) 함수를 불러와요.
// [문법] `export default`로 내보낸 라우터는 중괄호 없이, `export async function`으로 내보낸 함수는 중괄호(`{ projectPage }`)로 가져와요.
// [작성 이유] 모든 API 코드를 한 파일에 몰아넣으면 너무 길어지므로, 역할별로 파일을 깔끔하게 나누어 관리하기 위해서예요.
import auth from './routes/auth.js';
import projects from './routes/projects.js';
import admin from './routes/admin.js';
import { projectPage } from './og.js';

// [뜻/역할] Hono 서버 앱 인스턴스를 하나 새로 만들어요.
// [문법] `new Hono()` 생성자를 호출해 `app` 상수에 담아요.
// [작성 이유] 이 `app`에 미들웨어와 주소별 처리 함수(라우트)를 하나씩 등록하기 위해서예요.
const app = new Hono();

// [뜻/역할] `/api/`로 시작하는 모든 요청 앞에서 `loadSession`을 먼저 실행해요.
// [문법] `app.use(경로패턴, 미들웨어함수)`는 해당 경로로 들어오는 모든 HTTP 메서드(GET/POST/PUT/DELETE)에 공통 작업을 걸어 줘요.
// [작성 이유] 각 API마다 쿠키를 읽는 코드를 반복해서 쓰지 않고, 한 곳에서 로그인 여부를 확인해 `c.get('uid')`에 넣어 두기 위해서예요.
app.use('/api/*', loadSession);

// [뜻/역할] 서버가 정상적으로 살아 있는지 확인하는 헬스 체크(Health Check) 주소예요.
// [문법] `app.get(경로, (c) => c.json(객체))`는 GET 요청에 대해 JSON 응답(`{"ok":true}`)을 돌려줘요.
// [작성 이유] 자동화 테스트(`scripts/smoke-test.js`)나 배포 직후 서버가 제대로 켜졌는지 빠르게 확인하기 위해서예요.
app.get('/api/health', (c) => c.json({ ok: true }));

// [뜻/역할] 회원 관련 API(`/api/signup`, `/api/login`, `/api/logout`, `/api/me`, `/api/users/:id`)를 연결해요.
// [문법] `app.route(앞경로, 하위라우터)`는 하위 라우터 안의 주소들 앞에 `/api`를 붙여서 등록해 줘요.
// [작성 이유] `auth.js` 안에서는 `/login`, `/signup`처럼 짧게 적고 실제 주소는 `/api/login`이 되도록 깔끔하게 묶기 위해서예요.
app.route('/api', auth);

// [뜻/역할] 작품 관련 API(`/api/projects`, `/api/projects/:id`, 응원, 북마크, 감상, 신고)를 연결해요.
// [문법] `projects.js`에 정의된 모든 라우트를 `/api/projects` 아래에 붙여요.
// [작성 이유] 작품과 관련된 모든 기능을 `/api/projects` 경로 아래로 통일하기 위해서예요.
app.route('/api/projects', projects);

// [뜻/역할] 관리자 전용 API(`/api/admin/reports`, 숨김 처리 등)를 연결해요.
// [문법] `admin.js` 라우터를 `/api/admin` 경로 아래에 붙여요.
// [작성 이유] 관리자 기능만 따로 모아 두고, `admin.js` 첫머리의 관리자 권한 검문소를 거치게 하기 위해서예요.
app.route('/api/admin', admin);

// [뜻/역할] 작품 상세 페이지(`/project`, `/project.html`) 요청이 오면 그 작품의 제목·소개·첫 사진을 Open Graph 메타 태그에 채워 보내요(`og.js`).
// [문법] `/project`와 `/project.html` 두 주소 모두 `projectPage` 핸들러로 연결해요.
// [작성 이유] 카카오톡·디스코드·슬랙 같은 메신저에 링크를 공유할 때, 메신저 봇은 자바스크립트를 실행하지 않으므로 서버가 HTML의 `<meta property="og:...">` 태그를 미리 바꿔 줘야 예쁜 미리보기 카드가 뜨기 때문이에요.
app.get('/project', projectPage);
app.get('/project.html', projectPage);

// [뜻/역할] 프론트엔드 화면에서도 서버와 똑같은 분야 목록을 쓸 수 있도록 자바스크립트 파일 형태로 내려줘요.
// [문법] `JSON.stringify(CATS)`로 배열을 문자열로 바꾼 뒤 `window.CATS = [...];` 코드로 감싸서 `text/javascript` 타입으로 응답해요.
// [작성 이유] HTML 파일마다 분야 목록을 복사해 넣지 않고 `<script src="/shared/categories.js"></script>` 한 줄로 최신 목록을 받아 쓰기 위해서예요.
app.get('/shared/categories.js', (c) =>
  c.body(`window.CATS = ${JSON.stringify(CATS)};`, 200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }));

// [뜻/역할] R2 버킷(`c.env.IMAGES`)에 저장된 작품 사진을 꺼내 브라우저에 보내 줘요.
// [문법]
// - `:key`는 URL 경로 파라미터이고 `c.req.param('key')`로 값을 꺼내요.
// - `c.env.IMAGES.get(key)`로 R2에서 파일 객체를 가져오고, 없으면 `c.notFound()`(404)를 돌려줘요.
// - 있으면 `obj.body`(스트림)와 원래 이미지 타입(`contentType`), 1년(`31536000`초) 캐시 헤더를 붙여 응답해요.
// [작성 이유] 사진을 올릴 때마다 새 무작위 UUID 키를 쓰므로 같은 키의 사진 내용은 절대 바뀌지 않아요(`immutable`). 그래서 브라우저와 CDN이 1년 동안 캐시하게 해 속도를 높이고 비용을 아껴요.
app.get('/uploads/:key', async (c) => {
  const obj = await c.env.IMAGES.get(c.req.param('key'));
  if (!obj) return c.notFound();
  return c.body(obj.body, 200, { 'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' });
});

// [뜻/역할] 서버 어디서든 에러(`throw`)가 발생했을 때 한곳에서 받아서 일관된 JSON 모양(`{ error: "..." }`)으로 응답하는 공통 에러 처리기예요.
// [문법] `app.onError((err, c) => ...)`는 라우트 안에서 던져진 모든 예외를 잡아요.
// [작성 이유]
// - 우리가 의도적으로 던진 입력 오류(`bad('메시지', 400)`)는 `err.status`가 있으므로 그 상태 코드와 친절한 안내 문구를 그대로 보내요.
// - 예상치 못한 서버 버그는 `console.error(err)`로 서버 로그에만 남기고, 사용자에게는 내부 구조가 노출되지 않도록 안전한 500 안내 문구를 보내기 위해서예요.
app.onError((err, c) => {
  if (err.status) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: '서버에서 문제가 생겼어요. 잠시 후 다시 해 주세요' }, 500);
});

// [뜻/역할] 완성된 Hono 앱을 Cloudflare Workers 런타임이 실행할 수 있도록 기본 내보내기(export)해요.
// [문법] `export default app;`
// [작성 이유] Cloudflare Workers는 시작 파일이 `export default`한 객체의 `fetch` 핸들러를 호출해 요청을 처리하기 때문이에요.
export default app;
