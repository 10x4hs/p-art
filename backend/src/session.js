// ============================================================================
// [파일 개요] 로그인 상태(세션)를 만들고(`startSession`), 매 요청마다 확인하고(`loadSession`),
// 지우고(`endSession`), 로그인이 필요한 길목을 지키는(`needLogin`) 파일이에요.
// - 브라우저 쿠키에는 무작위 출입증 번호(`sid`)만 넣어 두고,
//   실제 "누구인지(`uid`)"와 "언제 만료되는지(`expires`)"는 D1 데이터베이스의 `sessions` 표에 저장해요.
// [비유] 놀이공원 자유이용권 팔찌예요. 손님 손목(브라우저 쿠키)에는 일련번호(`sid`)만 적혀 있고,
//   검표원(서버)은 장부(D1 `sessions` 표)에서 그 번호를 찾아 누구인지·유효기간이 남았는지 확인해요.
// ============================================================================

// [뜻/역할] Hono에서 제공하는 쿠키 읽기·쓰기·삭제 도우미 함수를 불러와요.
// [문법] `hono/cookie` 서브 모듈에서 필요한 함수 3개를 가져와요.
// [작성 이유] 복잡한 `Cookie` / `Set-Cookie` HTTP 헤더 문자열을 직접 조립하지 않고 안전하게 다루기 위해서예요.
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

// [뜻/역할] 하루(`DAY`)와 30일(`DAYS30`)이 몇 밀리초(1/1000초)인지 미리 계산해 둔 상수예요.
// [문법] `24시간 * 60분 * 60초 * 1000밀리초`로 계산해요.
// [작성 이유] 자바스크립트의 `Date.now()`가 밀리초 단위를 쓰기 때문에 만료 시각 계산을 읽기 쉽게 하기 위해서예요.
const DAY = 24 * 60 * 60 * 1000, DAYS30 = 30 * DAY;

// [뜻/역할] 브라우저에 `sid` 쿠키를 심을 때 적용할 보안 옵션을 만들어 돌려줘요.
// [문법] 요청 컨텍스트 `c`를 받아 현재 주소가 `https:`인지 확인하고 옵션 객체를 반환하는 화살표 함수예요.
// [작성 이유]
// - `path: '/'`: 사이트의 모든 경로에서 쿠키가 전송되게 해요.
// - `httpOnly: true`: 브라우저의 자바스크립트(`document.cookie`)가 이 쿠키를 읽지 못하게 막아, 혹시 악성 스크립트(XSS)가 실행되더라도 로그인 쿠키를 훔쳐 갈 수 없게 해요.
// - `sameSite: 'Lax'`: 다른 외부 사이트에서 몰래 보내는 요청(CSRF 공격)에는 쿠키가 자동으로 실리지 않게 막아요.
// - `secure`: 실제 배포 환경(`https:`)에서는 암호화된 연결로만 쿠키를 보내고, 내 컴퓨터(`http://127.0.0.1`)에서는 테스트할 수 있게 자동으로 켜고 꺼요.
// - `maxAge: DAYS30 / 1000`: 쿠키 수명은 초 단위이므로 밀리초를 1000으로 나눠 30일(2,592,000초)로 설정해요.
const cookieOpts = (c) => ({
  path: '/',
  httpOnly: true,
  sameSite: 'Lax',
  secure: new URL(c.req.url).protocol === 'https:',
  maxAge: DAYS30 / 1000,
});

// [뜻/역할] 모든 `/api/*` 요청 맨 앞에서 실행되어, 쿠키의 `sid`로 로그인한 사용자를 찾아 `c.set('uid', 회원번호)`에 저장해 주는 미들웨어예요.
// [문법] `(c, next)`를 받아 작업 후 `await next()`를 호출해 다음 라우트 핸들러로 순서를 넘겨요.
// [작성 이유]
// - 로그인하지 않았거나 만료된 경우 `c.get('uid')`를 `null`로 두어 비로그인 상태로 처리해요.
// - SQL의 `?` 자리에 `.bind(sid)`로 값을 넘겨 SQL 인젝션 공격을 원천 차단해요.
// - 마지막으로 세션을 연장한 지 하루(`DAY`) 이상 지났을 때만 만료일을 다시 30일 뒤로 늘려 줘요(매 요청마다 DB UPDATE를 하면 느려지기 때문에 하루에 한 번만 갱신해요).
export async function loadSession(c, next) {
  const sid = getCookie(c, 'sid');
  c.set('uid', null);
  const row = sid && (await c.env.DB.prepare('SELECT uid, expires FROM sessions WHERE sid = ?').bind(sid).first());
  if (row && row.expires > Date.now()) {
    c.set('uid', row.uid);
    c.set('sid', sid);
    if (row.expires - Date.now() < DAYS30 - DAY) {
      await c.env.DB.prepare('UPDATE sessions SET expires = ? WHERE sid = ?').bind(Date.now() + DAYS30, sid).run();
      setCookie(c, 'sid', sid, cookieOpts(c));
    }
  }
  await next();
}

// [뜻/역할] 회원가입이나 로그인에 성공했을 때 새 세션 출입증을 발급하고 브라우저에 쿠키를 심어 줘요.
// [문법]
// - `crypto.randomUUID() + crypto.randomUUID()`로 추측 불가능한 72자리 무작위 문자열(`sid`)을 만들어요.
// - `c.env.DB.batch([...])`로 ① 만료된 옛날 세션 청소(`DELETE`)와 ② 새 세션 저장(`INSERT`)을 한 번에 묶어 실행해요.
// [작성 이유] 따로 청소 스케줄러를 두지 않아도 누군가 로그인할 때마다 만료된 세션이 자동으로 정리되고, 쿠키에 새 `sid`가 안전하게 설정되게 하기 위해서예요.
export async function startSession(c, uid) {
  const sid = crypto.randomUUID() + crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sessions WHERE expires <= ?').bind(Date.now()),
    c.env.DB.prepare('INSERT INTO sessions (sid, uid, expires) VALUES (?, ?, ?)').bind(sid, uid, Date.now() + DAYS30),
  ]);
  setCookie(c, 'sid', sid, cookieOpts(c));
}

// [뜻/역할] 로그아웃하거나 회원 탈퇴할 때 DB의 세션 기록과 브라우저의 쿠키를 둘 다 지워요.
// [문법] `sessions` 표에서 현재 `sid` 줄을 `DELETE`하고, `deleteCookie`로 브라우저 쿠키도 만료시켜요.
// [작성 이유] 브라우저 쿠키만 지우면 미리 복사해 둔 `sid`로 계속 요청을 보낼 수 있기 때문에, 서버 장부(DB)에서도 즉시 지워 출입증을 완전히 무효화하기 위해서예요.
export async function endSession(c) {
  const sid = c.get('sid');
  if (sid) await c.env.DB.prepare('DELETE FROM sessions WHERE sid = ?').bind(sid).run();
  deleteCookie(c, 'sid', { path: '/' });
}

// [뜻/역할] 로그인이 꼭 필요한 API(작품 등록·수정·삭제, 응원, 북마크, 신고, 내 정보 수정 등) 앞에 세워 두는 검문소 미들웨어예요.
// [문법] `c.get('uid')`가 없으면 `401 Unauthorized` 상태 코드와 함께 에러 JSON을 즉시 반환하고, 있으면 `await next()`로 통과시켜요.
// [작성 이유] 각 API 함수마다 로그인 체크 `if (!c.get('uid')) ...`를 중복해서 적지 않고 라우트 선언부에 `needLogin`만 끼워 넣기 위해서예요.
export async function needLogin(c, next) {
  if (!c.get('uid')) return c.json({ error: '로그인이 필요해요' }, 401);
  await next();
}
