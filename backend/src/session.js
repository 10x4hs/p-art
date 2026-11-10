// [파일 개요] 로그인 상태(세션)를 만들고, 확인하고, 지우는 파일이에요.
// [비유] 놀이공원 '손목 밴드'와 같아요. 입장할 때(로그인) 번호가 적힌 밴드(쿠키 sid)를 채워 주고, 매표소 장부(D1의 sessions 표)에 "이 번호 = 누구"를 적어 둬요.
//        밴드에는 번호만 있어서 잃어버려도 이름은 안 보이고, 놀이기구(API)마다 밴드 번호를 장부와 대조해서 누구인지 알아내요.
// [뜻/역할] 쿠키에는 무작위 번호(sid)만 넣고, "누구인지(uid)"는 D1 데이터베이스의 sessions 표에 둬요.
// [작성 이유] Worker는 요청이 끝나면 메모리가 사라질 수 있어서 서버 메모리에 로그인 정보를 둘 수 없어요.
//            DB에 두면 배포·재시작이 일어나도 로그인이 그대로 유지돼요.

// [뜻/역할] Hono가 제공하는 쿠키 읽기·쓰기·지우기 도구를 가져와요.
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

// [뜻/역할] 쿠키 이름은 'sid'(session id)로 정해요.
const COOKIE = 'sid';
// [뜻/역할] 30일을 밀리초(1/1000초)로 계산한 값이에요. 30일 × 24시간 × 60분 × 60초 × 1000밀리초.
// [작성 이유] Date.now()가 밀리초 단위라서 같은 단위로 맞춰 두면 더하고 빼기 편해요.
const DAYS30 = 30 * 24 * 60 * 60 * 1000;

// [뜻/역할] 쿠키를 걸 때 쓸 옵션들을 만들어 돌려주는 함수예요.
// [문법] (c) => ({ ... }) — 화살표 함수가 객체를 바로 돌려줄 때는 중괄호를 소괄호로 감싸요.
const cookieOpts = (c) => ({
  // [뜻/역할] 사이트의 모든 주소에서 이 쿠키를 보내요.
  path: '/',
  // [작성 이유] httpOnly: 화면의 자바스크립트가 쿠키를 읽지 못하게 해서, 악성 스크립트가 로그인 쿠키를 훔쳐 가는 것을 막아요.
  httpOnly: true,                                       // 자바스크립트로 쿠키를 못 읽게
  // [작성 이유] sameSite 'Lax': 다른 사이트가 몰래 우리 서버로 요청을 보낼 때(CSRF 공격) 쿠키가 따라가지 않게 해요.
  sameSite: 'Lax',                                      // 다른 사이트에서 몰래 보내는 요청엔 안 따라가게
  // [뜻/역할] 주소가 https면 secure를 켜서 암호화된 연결에서만 쿠키를 보내요. 내 컴퓨터(http://127.0.0.1)에서는 꺼져서 테스트가 가능해요.
  secure: new URL(c.req.url).protocol === 'https:',     // 인터넷(https)에서는 암호화된 연결에서만
  // [뜻/역할] 쿠키 수명이에요. maxAge는 '초' 단위라서 밀리초를 1000으로 나눠요.
  maxAge: DAYS30 / 1000,
});

// [뜻/역할] 모든 /api 요청 앞에서 실행되는 미들웨어예요. 쿠키의 sid로 로그인한 사람을 찾아 c.set('uid', 번호)로 넣어 둬요.
// [문법] (c, next) — next()를 부르면 다음 단계(실제 API 처리)로 넘어가요. c.set/c.get은 이번 요청 동안만 쓰는 메모장이에요.
// [작성 이유] 뒤에 오는 API들은 c.get('uid')만 보면 "누가 로그인했는지" 바로 알 수 있어요(없으면 null).
export async function loadSession(c, next) {
  const sid = getCookie(c, COOKIE);
  // [뜻/역할] 일단 '로그인 안 함(null)'으로 시작해요.
  c.set('uid', null);
  if (sid) {
    // [뜻/역할] D1 데이터베이스에서 이 sid의 주인(uid)과 만료 시각(expires)을 찾아요.
    // [비유] D1은 Cloudflare가 관리해 주는 SQLite 데이터베이스예요. 엑셀처럼 표(테이블)에 줄(행)로 데이터를 저장해요.
    // [문법] c.env.DB는 wrangler.jsonc에서 연결(binding)한 D1이에요. prepare(SQL) → bind(값들) → first()는 '첫 줄 하나만 가져오기'예요.
    //        SQL 속 `?` 자리에 bind의 값이 안전하게 들어가요.
    // [작성 이유] 값을 SQL 글자에 직접 이어 붙이지 않고 ?로 넘기면, 해커가 SQL을 끼워 넣는 공격(SQL 인젝션)을 막을 수 있어요.
    const row = await c.env.DB.prepare('SELECT uid, expires FROM sessions WHERE sid = ?').bind(sid).first();
    // [뜻/역할] 세션이 있고 아직 만료되지 않았을 때만 로그인으로 인정해요.
    if (row && row.expires > Date.now()) {
      c.set('uid', row.uid);
      // [작성 이유] 로그아웃(endSession) 때 어떤 세션을 지울지 알려고 sid도 기억해 둬요.
      c.set('sid', sid);
      // [뜻/역할] 남은 기간이 '30일 - 하루'보다 짧으면(= 마지막 연장 뒤 하루 이상 지났으면) 만료를 다시 30일 뒤로 늘리고 쿠키도 새로 걸어요.
      // [작성 이유] 자주 쓰는 사람은 계속 로그인이 유지되게 하되, 요청마다 DB에 쓰면 느려지니 하루에 한 번만 연장해요.
      if (row.expires - Date.now() < DAYS30 - 24 * 60 * 60 * 1000) {   // 하루 이상 지났으면 기한을 다시 30일로(쓸 때마다 연장)
        await c.env.DB.prepare('UPDATE sessions SET expires = ? WHERE sid = ?').bind(Date.now() + DAYS30, sid).run();
        setCookie(c, COOKIE, sid, cookieOpts(c));
      }
    }
  }
  // [뜻/역할] 확인이 끝났으니 다음 단계(실제 API)로 넘겨요.
  await next();
}

// [뜻/역할] 로그인·가입에 성공했을 때 새 세션을 만들고 쿠키를 걸어 줘요.
export async function startSession(c, uid) {
  // [뜻/역할] 무작위 UUID 두 개를 이어 붙여 아주 긴 번호를 만들어요.
  // [작성 이유] 남이 번호를 맞혀서 다른 사람인 척 로그인하는 일이 사실상 불가능하게 하려고요.
  const sid = crypto.randomUUID() + crypto.randomUUID();   // 맞힐 수 없는 긴 무작위 번호
  // [뜻/역할] 두 가지 SQL을 한 번에 보내요: ① 만료된 오래된 세션 청소 ② 새 세션 추가.
  // [문법] DB.batch([...])는 여러 문장을 한 번의 왕복으로 차례대로 실행해요.
  // [작성 이유] 따로 청소 작업을 돌리지 않아도, 로그인할 때마다 조금씩 장부가 깨끗해져요.
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sessions WHERE expires <= ?').bind(Date.now()),   // 김에 만료된 세션 청소
    c.env.DB.prepare('INSERT INTO sessions (sid, uid, expires) VALUES (?, ?, ?)').bind(sid, uid, Date.now() + DAYS30),
  ]);
  // [뜻/역할] 브라우저에 sid 쿠키를 걸어요. 이제부터 브라우저가 요청마다 이 쿠키를 자동으로 보내요.
  setCookie(c, COOKIE, sid, cookieOpts(c));
}

// [뜻/역할] 로그아웃: DB의 세션 줄을 지우고, 브라우저의 쿠키도 지워요.
// [작성 이유] 쿠키만 지우면 누가 그 번호를 복사해 뒀을 때 계속 쓸 수 있으니, 장부(DB)에서도 꼭 지워요.
export async function endSession(c) {
  const sid = c.get('sid');
  if (sid) await c.env.DB.prepare('DELETE FROM sessions WHERE sid = ?').bind(sid).run();
  deleteCookie(c, COOKIE, { path: '/' });
}

// [뜻/역할] 로그인이 필요한 API 앞에 붙이는 검문소예요. 로그인 안 했으면 401(로그인 필요)로 바로 돌려보내요.
// [문법] return c.json(...)으로 응답하면 next()를 안 부르니 뒤의 API는 실행되지 않아요.
// [작성 이유] auth.put('/me', needLogin, ...)처럼 한 단어만 끼우면 그 API를 보호할 수 있어요.
export async function needLogin(c, next) {
  if (!c.get('uid')) return c.json({ error: '로그인이 필요해요' }, 401);
  await next();
}
