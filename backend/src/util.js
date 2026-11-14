// ============================================================================
// [파일 개요] `auth.js`, `projects.js`, `admin.js`가 공통으로 꺼내 쓰는 작은 만능 도구 모음이에요.
// - 에러 만들기(`bad`), 안전한 JSON 읽기(`readJson`), 주소 검사(`isHttp`), 문자열 쪼개기(`split`),
//   클라이언트 IP 확인(`clientIp`), 관리자 판별(`isAdminEmail`, `isAdmin`) 함수가 들어 있어요.
// [비유] 요리할 때 여러 요리사가 함께 쓰는 계량컵·체·온도계 선반이에요.
// ============================================================================

// [뜻/역할] 입력값이 잘못됐을 때 `throw bad('안내 문구', 상태코드)` 한 줄로 요청을 즉시 멈추고 에러 응답을 보내게 해 주는 함수예요.
// [문법] `new Error(message)`로 에러 객체를 만든 뒤, `Object.assign`으로 `{ status }` 속성(기본값 `400`)을 덧붙여 돌려줘요.
// [작성 이유] 매번 `return c.json({ error: ... }, 400)`을 길게 쓰지 않고, `throw bad(...)`만 던지면 `index.js`의 `app.onError`가 알아서 `{ error }` JSON으로 바꿔 주게 하기 위해서예요.
export function bad(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

// [뜻/역할] 요청 본문(Body)의 JSON을 안전하게 읽어요. 만약 JSON 형식이 깨져 있으면 에러를 터뜨리는 대신 빈 객체(`{}`)를 돌려줘요.
// [문법] `c.req.json()` 프로미스에 `.catch(() => ({}))`를 붙여 파싱 실패를 흡수해요.
// [작성 이유] 누군가 잘못된 JSON을 보냈을 때 500 서버 에러가 나는 대신, 빈 객체 `{}`가 넘어가서 바로 뒤의 필수값 검사에서 깔끔하게 400 에러로 거절하게 하기 위해서예요.
export const readJson = (c) => c.req.json().catch(() => ({}));

// [뜻/역할] 전달된 주소(`u`)가 안전한 웹 주소(`http://` 또는 `https://`)로 시작하고 공백이 없는지 검사해요.
// [문법] 정규식 `/^https?:\/\/\S+$/`의 `.test(u)`로 참/거짓을 판별해요(`^` 시작, `https?` http 또는 https, `\S+` 공백 아닌 글자 1개 이상, `$` 끝).
// [작성 이유] 작품 체험 주소나 GitHub 주소에 `javascript:alert(1)` 같은 악성 스크립트 주소(XSS 공격)를 넣지 못하도록 막기 위해서예요.
export const isHttp = (u) => /^https?:\/\/\S+$/.test(u);

// [뜻/역할] DB에 `"HTML,CSS"`처럼 쉼표로 이어 저장된 문자열을 `['HTML', 'CSS']` 배열로 바꿔요. 빈 문자열이면 빈 배열(`[]`)을 돌려줘요.
// [문법] 삼항 연산자 `v ? v.split(',') : []`를 사용해요.
// [작성 이유] `"a,b".split(',')`은 `['a', 'b']`가 되지만, 빈 문자열 `"".split(',')`을 그냥 호출하면 `['']`(빈 글자 1개짜리 배열)이 되어 버려서 이를 방지하기 위해서예요.
export const split = (v) => (v ? v.split(',') : []);

// [뜻/역할] 요청을 보낸 사람의 IP 주소를 알아내요.
// [문법] Cloudflare가 자동으로 붙여 주는 `cf-connecting-ip` 헤더를 읽고, 로컬 개발 환경처럼 헤더가 없으면 `'local'`을 돌려줘요.
// [작성 이유] 로그인 없이 남기는 한 줄 감상(`comments`)에서 같은 IP가 1분에 5개 넘게 도배하는 것을 막기 위해서예요.
export const clientIp = (c) => c.req.header('cf-connecting-ip') || 'local';

// [뜻/역할] 주어진 이메일(`email`)이 환경 변수 `ADMIN_EMAILS`(쉼표로 구분된 관리자 이메일 목록)에 포함되어 있는지 확인해요.
// [문법] `c.env.ADMIN_EMAILS`를 소문자로 바꾼 뒤 `,`로 쪼개고(`.split(',')`), 앞뒤 공백을 제거해(`.map(e => e.trim())`), 빈 값을 걸러낸 뒤(`.filter(Boolean)`), `.includes(email)`로 포함 여부를 확인해요.
// [작성 이유] DB 스키마를 복잡하게 바꾸지 않고도 `wrangler.jsonc`(또는 배포 환경 변수)에 이메일만 적으면 바로 관리자로 지정할 수 있게 하기 위해서예요.
export const isAdminEmail = (c, email) =>
  String(c.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((e) => e.trim()).filter(Boolean).includes(email);

// [뜻/역할] 지금 요청을 보낸 로그인 사용자(`c.get('uid')`)가 관리자인지 DB에서 이메일을 조회해 확인해요.
// [문법] `uid`가 없으면 바로 `false`를 반환하고, 있으면 `users` 표에서 이메일을 꺼내 `isAdminEmail`로 검사해요.
// [작성 이유] 관리자 전용 API(`admin.js`)나 신고로 숨겨진 작품 열람 권한(`projects.js`의 `canSee`)을 확인할 때 재사용하기 위해서예요.
export async function isAdmin(c) {
  if (!c.get('uid')) return false;
  const u = await c.env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(c.get('uid')).first();
  return !!u && isAdminEmail(c, u.email);
}
