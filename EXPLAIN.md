# PART 친절한 코드 해설서 (초보자용)

> 프로그래밍을 막 배우기 시작한 팀원도 PART 코드를 **스스로 읽고 고칠 수 있게** 쓴 설명서예요.
> 그림으로 보는 전체 흐름은 [docs/WORKFLOW.md](docs/WORKFLOW.md)에 있어요. 이 문서는 **코드 한 줄 한 줄**에 집중해요.

---

## 1. 이 프로그램은 무엇을 하나요? (쉬운 설명)

- **한 줄 요약**: 학교 복도에 작품을 거는 것처럼, 학생이 만든 웹사이트·게임을 **카드로 걸어 두는 온라인 전시관**이에요.
- **비유**: 식당으로 생각해 보세요.
  - `frontend/` = **홀** (손님이 보는 메뉴판·테이블) — HTML, CSS, 브라우저 JS
  - `backend/src/` = **주방** (주문을 받아 요리하고 창고에서 재료를 꺼냄) — Cloudflare Worker
  - **D1** = **장부 창고** (가입 정보·작품·감상) — SQLite 데이터베이스
  - **R2** = **사진 창고** — 키(이름표)로 사진 파일을 넣고 꺼내는 보관함
  - `fetch('/api/...')` = **주문서** — 홀이 주방에 보내는 요청
  - **Cloudflare** = 건물 전체를 빌려주는 회사. 손님이 오면 메뉴판(화면 파일)은 입구에서 바로 주고, 주문(`/api/…`)만 주방으로 보내요.
- **입력과 출력**: 사용자가 이메일·작품 정보·사진을 넣으면 → Worker가 검사해서 D1·R2에 저장하고 → 화면은 저장된 작품을 카드로 보여 줘요.

---

## 2. 전체 실행 순서와 흐름도 (How It Works)

| 순서 | 위치 / 함수 | 하는 일 (쉬운 설명) |
| :--- | :--- | :--- |
| 1단계 | 브라우저가 `https://p-art.swx2.workers.dev/` 요청 | Cloudflare가 `frontend/index.html`을 **그대로** 보내요 (Worker 안 거침) |
| 2단계 | `index.html` 안의 `<script>` | `/shared/categories.js`, `/js/app.js`를 불러와요 |
| 3단계 | `app.js`의 `nav()` | `fetch('/api/me')`로 "나 로그인했어?"를 물어봐요 |
| 4단계 | `wrangler.jsonc`의 `run_worker_first` | `/api/…`로 시작하니 Worker(`backend/src/index.js`)로 보내요 |
| 5단계 | `index.js`의 `loadSession` | 쿠키의 `sid`로 D1 `sessions` 표를 찾아 "누구인지(uid)"를 알아내요 |
| 6단계 | `routes/auth.js`의 `GET /me` | 내 정보를 D1에서 꺼내 JSON으로 돌려줘요 |
| 7단계 | `index.html`의 `list()` | `fetch('/api/projects?sort=hot')`로 작품 목록을 주문해요 |
| 8단계 | `routes/projects.js`의 `GET /` | SQL 한 번으로 작품 + 작성자 + 사진 + 응원 수를 꺼내요 |
| 9단계 | `app.js`의 `card()` | JSON을 카드 HTML로 바꿔 화면에 끼워 넣어요 |
| 10단계 | `<img src="/uploads/키">` | Worker가 R2에서 사진을 꺼내 보내요 |

---

## 3. 핵심 문법 및 키워드 사전 (초보자 필수 지식)

| 키워드 / 기호 | 뜻 | PART에서의 예 | 주의할 점 |
|---|---|---|---|
| `import … from '…'` | 다른 파일·라이브러리를 **가져와** 쓰기 | `import { Hono } from 'hono'` | 파일 이름 끝에 `.js`까지 써요 |
| `export default …` | 이 파일의 **대표로 내보낼 것** | `export default app` | 하나만 가능 |
| `export function …` | 이름을 붙여 **여러 개** 내보내기 | `export async function hashPassword` | 가져올 때 `{ }` 안에 이름 |
| `const` / `let` | 바꾸지 않을 이름 / 바뀔 수 있는 이름 | `const app = new Hono()` | `const` 객체 **안의 내용**은 바꿀 수 있어요 |
| `(a) => …` | **화살표 함수** — 짧게 쓰는 함수 | `(c) => c.json({ ok: true })` | `{ }`가 없으면 결과를 바로 돌려줘요 |
| `` `글자 ${값}` `` | **템플릿 문자열** — 글자 안에 값 끼우기 | `` `pbkdf2$${ITERATIONS}$…` `` | 따옴표가 아니라 백틱(`) |
| `async` / `await` | 오래 걸리는 일(DB, 네트워크)이 **끝날 때까지 기다리기** | `await c.env.DB.prepare(…).first()` | D1은 전부 `await`가 필요해요 |
| `c` (Hono) | 요청 하나에 대한 **모든 것이 든 상자** | `c.req.param('id')`, `c.json(…)`, `c.env.DB` | Express의 `req` + `res`를 합친 것 |
| `c.env` | Cloudflare가 연결해 준 **자원** | `c.env.DB`(D1), `c.env.IMAGES`(R2) | 이름은 `wrangler.jsonc`의 `binding` |
| `c.get` / `c.set` | 요청 하나 동안 쓰는 **메모장** | `c.set('uid', 3)` → `c.get('uid')` | 다음 요청엔 사라져요 |
| 미들웨어 | 요청이 지나가는 **검문소** `(c, next) => …` | `needLogin`, `mine` | 통과시키려면 `await next()` |
| `throw` | 오류를 **던져서** 지금 일을 멈추기 | `throw bad('제목은 1~40자예요')` | `index.js`의 `onError`가 받아요 |
| `?.` | 앞이 비어 있으면(`null`) **그냥 넘어가기** | `metadata?.type` | 오류 대신 `undefined` |
| `...obj` | 객체·배열 **펼치기**(복사) | `bind(...values, id)` | 배열을 낱개로 펼쳐 넘겨요 |
| `!!x` | 아무 값이나 **true/false로** | `liked: !!p.liked` | 값이 있으면 true |
| 쿠키 · 세션 | 쿠키 = 브라우저가 가진 **번호표**, 세션 = 서버의 **장부** | `sid` 쿠키 ↔ `sessions` 표 | 번호표엔 번호만, 누구인지는 서버에 |
| SQL `?` / `?1` | 값을 **안전하게** 끼우는 자리 | `WHERE email = ?` + `.bind(email)` | 글자를 직접 이어 붙이면 해킹(SQL 인젝션) 위험 |
| 해시(PBKDF2) | 비밀번호를 **되돌릴 수 없게** 섞기 | `hashPassword(pw)` | 원래 비밀번호는 저장하지 않아요 |
| `FormData` | 글 + **파일**을 한 번에 보내는 상자 | 작품 등록 | JSON으로는 사진을 못 보내요 |

---

## 4. 📝 한 줄 한 줄 완벽 해설 (Line-by-Line Breakdown)

### 4-1. `wrangler.jsonc` — Cloudflare에게 주는 설명서

```jsonc
"name": "p-art",                          // ① Worker 이름 → 주소가 p-art.<계정>.workers.dev
"main": "backend/src/index.js",           // ② 서버 코드의 시작 파일
"compatibility_date": "2025-09-01",       // ③ "이 날짜 기준의 Cloudflare 동작으로 돌려 줘" — 나중에 Cloudflare가 바뀌어도 우리 코드가 안 깨지게
"assets": {
  "directory": "./frontend",              // ④ 화면 파일 폴더. 이 안의 파일은 Cloudflare가 그대로 보냄
  "run_worker_first": ["/api/*", "/uploads/*", "/shared/*"]
                                          // ⑤ 이 주소들은 파일을 찾기 전에 Worker가 먼저 처리
},
"d1_databases": [{ "binding": "DB", … }], // ⑥ D1을 코드에서 c.env.DB 라는 이름으로 쓰게 연결
"r2_buckets": [{ "binding": "IMAGES", … }]     // ⑦ R2 버킷을 c.env.IMAGES 로 연결
```

### 4-2. `backend/src/index.js` — 서버의 시작점 (조립하는 곳)

```js
import { Hono } from 'hono';                         // ① Hono: 주소별 규칙을 쉽게 만드는 작은 웹 프레임워크
import CATS from '../../shared/categories.json';     // ② 분야 목록. JSON 파일을 바로 배열로 가져옴
import { loadSession } from './session.js';          // ③ 로그인 확인 검문소
import auth from './routes/auth.js';                 // ④ 가입·로그인 담당
import projects from './routes/projects.js';         // ⑤ 작품 담당

const app = new Hono();                              // ⑥ 서버(앱) 하나 만들기

app.use('/api/*', loadSession);                      // ⑦ /api로 시작하는 모든 요청은 먼저 "누구인지" 확인
app.get('/api/health', (c) => c.json({ ok: true })); // ⑧ "살아 있니?" 확인용 주소
app.route('/api', auth);                             // ⑨ /api/signup 등은 auth.js로
app.route('/api/projects', projects);                // ⑩ /api/projects… 는 projects.js로

app.get('/shared/categories.js', (c) =>              // ⑪ 브라우저용 분야 목록을
  c.body(`window.CATS = ${JSON.stringify(CATS)};`, 200, { 'Content-Type': 'text/javascript; …' }));
                                                     //    "window.CATS = [...]" 라는 JS 한 줄로 만들어 보냄
                                                     //    왜? 서버와 화면이 같은 JSON 파일 하나를 쓰게 하려고

app.get('/uploads/:key', async (c) => {              // ⑫ 사진 주소. :key 자리에 사진 이름이 들어옴
  const obj = await c.env.IMAGES.get(c.req.param('key'));
                                                     // ⑬ R2에서 사진 파일(내용 + 저장할 때 적어 둔 종류)을 꺼냄
  if (!obj) return c.notFound();                     // ⑭ 없으면 404
  return c.body(obj.body, 200, { 'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' });
                                                     // ⑮ 사진을 보내면서 "1년 동안 저장해 둬도 돼" — 키가 절대 안 바뀌니까
});

app.onError((err, c) => {                            // ⑯ 어디서든 throw된 오류가 여기로 옴
  if (err.status) return c.json({ error: err.message }, err.status);   // 우리가 던진 오류(bad) → 문구 그대로
  console.error(err);                                //    예상 못 한 오류 → 기록만 남기고
  return c.json({ error: '서버에서 문제가 생겼어요. …' }, 500);          //    사용자에겐 일반 문구 (내부 정보 숨김)
});

export default app;                                  // ⑰ Cloudflare가 이 app으로 요청을 처리
```

### 4-3. `backend/src/session.js` — 로그인 기억하기

```js
export async function loadSession(c, next) {
  const sid = getCookie(c, COOKIE);                  // ① 브라우저가 보낸 번호표(sid) 읽기
  c.set('uid', null);                                // ② 일단 "로그인 안 함"으로
  if (sid) {
    const row = await c.env.DB.prepare('SELECT uid, expires FROM sessions WHERE sid = ?').bind(sid).first();
                                                     // ③ 장부(sessions 표)에서 번호표 찾기. .first() = 한 줄만
    if (row && row.expires > Date.now()) {           // ④ 있고, 기한이 안 지났으면
      c.set('uid', row.uid);                         // ⑤ "이 요청은 uid번 사용자" — 뒤의 라우트가 c.get('uid')로 씀
      …                                              // ⑥ 하루 이상 지났으면 기한을 다시 30일로 (쓸수록 연장)
    }
  }
  await next();                                      // ⑦ 검문 끝, 다음으로
}

export async function startSession(c, uid) {
  const sid = crypto.randomUUID() + crypto.randomUUID();   // ⑧ 아무도 못 맞히는 긴 무작위 번호
  await c.env.DB.batch([ …만료 세션 청소…, …새 세션 저장… ]); // ⑨ batch = 여러 SQL을 한 번에 (빠름)
  setCookie(c, COOKIE, sid, cookieOpts(c));          // ⑩ 브라우저에 번호표 건네기 (httpOnly: JS로 못 훔침)
}
```

**왜 이렇게?** 쿠키에 "나는 3번 사용자"라고 적어 두면 누구나 숫자를 바꿔 남인 척할 수 있어요. 그래서 쿠키엔 **맞힐 수 없는 번호**만 주고, "누구인지"는 서버 장부에만 둬요.

### 4-4. `backend/src/password.js` — 비밀번호 섞기

```js
const ITERATIONS = 100000;                            // ① 섞는 횟수. 많을수록 해커가 하나씩 맞혀 보기 어려움
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));  // ② 사람마다 다른 무작위 "소금" 16바이트
  const hash = await derive(password, salt, ITERATIONS);    // ③ 비밀번호 + 소금을 10만 번 섞기 (PBKDF2)
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;   // ④ "방식$횟수$소금$결과" 한 줄로 저장
}
export async function checkPassword(password, stored) {
  const [kind, iter, salt, hash] = String(stored).split('$');   // ⑤ 저장된 줄을 $로 나눠 네 조각
  const got = …derive(password, 소금, 횟수)…                  // ⑥ 입력한 비밀번호를 같은 소금·횟수로 섞어서
  …for (…) diff |= got[i] ^ want[i];…                         // ⑦ 끝까지 다 비교 (중간에 멈추면 걸린 시간으로 정답을 추측할 수 있어서)
}
```

**왜 소금?** 소금이 없으면 비밀번호가 같은 두 사람의 저장값이 같아져서, 하나가 뚫리면 다른 사람도 뚫려요.
**왜 bcrypt가 아니라 PBKDF2?** Cloudflare 무료 요금제는 요청 하나당 CPU를 10ms까지만 쓸 수 있어요. bcrypt(JS로 계산)는 100ms쯤 걸리고, PBKDF2는 Cloudflare 기본 기능(`crypto.subtle`)이라 훨씬 빨라요.

### 4-5. `backend/src/routes/auth.js` — 가입·로그인

```js
auth.post('/signup', async (c) => {                    // ① POST /api/signup 이 오면 실행
  const body = await readJson(c);                      // ② 보낸 JSON 읽기 (깨졌으면 빈 객체)
  const email = cleanEmail(body.email);                // ③ 앞뒤 공백 제거 + 소문자
  …
  if (!EMAIL.test(email) || email.length > 100) throw bad('이메일 주소를 확인해 주세요');
                                                       // ④ 정규식으로 "글자@글자.글자" 모양인지
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) throw bad('…8자 이상, 영문+숫자…');
                                                       // ⑤ (?=.*[A-Za-z]) 영문 어딘가, (?=.*\d) 숫자 어딘가, .{8,} 8자 이상
  checkNickname(nickname);                             // ⑥ 2~20자
  if (await …SELECT 1 FROM users WHERE email = ?…) throw bad('이미 가입한 이메일이에요', 409);
                                                       // ⑦ 409 = "이미 있어서 충돌"
  const { meta } = await c.env.DB.prepare('INSERT INTO users (email, password, nickname) VALUES (?, ?, ?)')
    .bind(email, await hashPassword(password), nickname).run();
                                                       // ⑧ 비밀번호는 섞어서 저장. meta.last_row_id = 새 번호
  await startSession(c, meta.last_row_id);             // ⑨ 가입과 동시에 로그인
  return c.json(await me(c, meta.last_row_id));        // ⑩ 내 정보 돌려주기 (비밀번호 열은 빼고)
});

auth.post('/login', async (c) => {
  …
  if (!user || !(await checkPassword(…))) throw bad('이메일이나 비밀번호가 맞지 않아요', 401);
                                                       // ⑪ 이메일이 없든 비밀번호가 틀리든 **같은 문구**
                                                       //    → 어떤 이메일이 가입됐는지 남이 알아낼 수 없게
  await startSession(c, user.id);
  …
});
```

### 4-6. `backend/src/routes/projects.js` — 목록과 응원 (핵심만)

```js
const SELECT_FULL = `
  SELECT p.*, u.nickname AS author,                                  -- ① 작품 + 올린 사람 닉네임
    (SELECT group_concat(file, ',') FROM (…images…)) AS image_keys,  -- ② 사진 키들을 "a,b,c" 한 줄로
    (SELECT COUNT(*) FROM likes WHERE project_id = p.id) AS likes,   -- ③ 응원 수
    EXISTS(SELECT 1 FROM likes WHERE … AND user_id = ?1) AS liked    -- ④ 내가 눌렀는지
  FROM projects p JOIN users u ON u.id = p.user_id`;
// 왜 한 번에? 작품 20개를 가져온 뒤 작품마다 SQL을 또 부르면 20×4번 = 80번 DB에 다녀와요.
// D1은 네트워크 너머에 있어서 한 번 다녀올 때마다 시간이 걸려요 → SQL 한 번에 다 붙임

projects.get('/', async (c) => {
  const q = c.req.query('q') || '', cat = …;               // ⑤ 주소 뒤 ?q=급식&cat=게임 읽기
  … WHERE (p.is_public = 1 OR p.user_id = ?1)              -- ⑥ 공개 작품 + 내 비공개 작품만
      AND (?3 = '' OR ',' || p.cats || ',' LIKE '%,' || ?3 || ',%')
                                                           -- ⑦ ",학교생활,게임," 안에 ",게임,"이 있는지 → '게임기' 같은 부분 일치 방지
    ORDER BY ${hot ? 'likes DESC,' : ''} p.id DESC         -- ⑧ 인기순이면 응원 많은 순. ${}엔 정해진 글자만 들어가서 안전
  .bind(uid, `%${q}%`, cat, tag, user)                     // ⑨ ?1~?5 자리에 순서대로 끼우기
  return c.json(results.map((p) => shape(p, uid)));        // ⑩ 쉼표 글자를 배열로, 사진 키를 주소로 바꿔 보내기
});

projects.post('/:id/like', needLogin, async (c) => {       // ⑪ needLogin 검문소를 먼저 지남
  const { meta } = await …DELETE FROM likes WHERE user_id = ? AND project_id = ?…;
  const removed = meta.changes > 0;                        // ⑫ 지운 줄이 있으면 = 원래 눌려 있었음
  if (!removed) await …INSERT INTO likes…;                 // ⑬ 없었으면 새로 넣기 → 누를 때마다 켜짐/꺼짐(토글)
  …
});
```

### 4-7. `frontend/edit.html`의 `shrink()` — 사진 줄이기

```js
async function shrink(file, max = 1600) {
  const img = await createImageBitmap(file);                       // ① 고른 사진 파일을 그림으로 읽기
  const scale = Math.min(1, max / Math.max(img.width, img.height)); // ② 긴 쪽이 1600px이 되는 비율 (작으면 그대로 1)
  const canvas = document.createElement('canvas');                 // ③ 보이지 않는 도화지
  canvas.width = Math.round(img.width * scale); …                  // ④ 줄인 크기로
  ctx.fillStyle = '#fff'; ctx.fillRect(…);                         // ⑤ 투명 PNG도 흰 배경으로
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);           // ⑥ 그림 그리기
  return new Promise((ok, fail) => canvas.toBlob((b) => …, 'image/jpeg', 0.82));
                                                                   // ⑦ JPEG(품질 82%) 파일로 만들어 돌려줌
}
```
**왜?** 휴대폰 사진은 5~10MB예요. 사진 창고(R2) 무료 한도가 10GB라도 그대로 올리면 금방 차고, 올리는 데도 오래 걸려요. 줄이면 장당 100~300KB.

### 4-8. `frontend/js/app.js` — 화면 공통 함수 (핵심만)

```js
async function api(url, method = 'GET', body) {          // ① 서버 주문을 한 함수로
  …
  const res = await fetch(url, opts);                     // ② 주문 보내고 응답 기다리기
  const data = await res.json().catch(() => ({}));        // ③ 응답 JSON 꺼내기
  if (!res.ok) { const e = new Error(data.error || '…'); e.status = res.status; throw e; }
                                                          // ④ 실패면 서버 문구로 에러를 던짐 → 부른 쪽이 화면에 보여 줌
  return data;
}

const esc = (s = '') => String(s).replace(/[&<>"']/g, …);  // ⑤ 사용자가 쓴 글의 < > 같은 기호를 바꿈
// 왜? 누군가 제목에 <script>를 쓰면 다른 사람 화면에서 실행될 수 있어요(XSS 공격). 사용자 글은 항상 esc()

function card(p) { return `<article class="card">…${esc(p.title)}…</article>`; }
// ⑥ 작품 하나를 카드 HTML로. 홈·전시관·프로필·홍보 키트가 모두 이 함수 하나를 씀

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-cheer]');            // ⑦ 누른 곳에서 위로 올라가며 ▲ 버튼 찾기
  if (!btn) return;
  …
});
// ⑧ 버튼마다 연결하지 않고 문서 전체에 하나만 (이벤트 위임) → 나중에 그려진 카드도 자동으로 동작
```

### 4-9. 나중에 더한 기능 (`0002_features.sql`)

| 기능 | 어디에 | 한 줄 설명 |
|---|---|---|
| 팀원 | `project_members` 표, `GET /api/users?q=`, `edit.html` | 닉네임으로 찾아 최대 5명. 폼에 `members=3,7`로 보내면 서버가 통째로 바꿔요 |
| 임시 저장 | `edit.html`의 `saveDraft()` | 글자 칸만 `localStorage`(`part-draft:new` 또는 `part-draft:번호`)에. 저장 성공하면 지워요 |
| 사이트 미리보기 | `project.html`의 `#pvBtn` | 누를 때만 `sandbox` iframe을 만들어요 |
| 북마크 | `bookmarks` 표, `POST /api/projects/:id/bookmark` | 응원과 같은 `toggle()`을 써요. `?bookmarked=1`로 내 북마크만 |
| 공유 미리보기 | `backend/src/og.js` | `/project.html`은 Worker가 먼저 받아 `HTMLRewriter`로 og 태그를 작품 값으로 바꿔요 |
| 전시 통계 | `projects.views` | 주인이 아닌 사람이 상세를 열면 +1 |
| 신고·숨김 | `reports` 표, `projects.hidden`, `routes/admin.js` | 3명이 신고하면 숨김. 관리자(`ADMIN_EMAILS`)가 되살리거나 신고를 지워요 |

---

## 5. 왜 이렇게 코드를 작성했을까요? (작성 이유와 꿀팁)

- **Q1. 왜 React 같은 프레임워크 대신 바닐라 JS?**
  설치·빌드 없이 HTML 파일이 바로 보이고, 수행평가 요구(HTML·CSS·JS)에 맞아요. 공통 부분은 `app.js`에 모았어요.
- **Q2. 왜 Cloudflare?**
  카드 없이 무료이고, 서버가 쉬어도 데이터(D1·R2)가 남아요. Railway는 무료 체험이 끝났고, Render 무료는 재배포 때 데이터가 사라져요.
- **Q3. 화면에서 검사했는데 서버에서 또 검사하는 이유는?**
  화면 JS는 개발자 도구로 누구나 고칠 수 있어요. **진짜 문지기는 서버**예요. 화면 검사는 "빨리 알려 주기"용.
- **Q4. `esc()`를 빼먹으면?**
  누군가 작품 제목에 `<img src=x onerror=alert(1)>`을 쓰면 보는 사람 브라우저에서 코드가 실행돼요.
- **Q5. SQL에서 `?`를 안 쓰고 `'...' + email + '...'`로 이어 붙이면?**
  이메일 칸에 `' OR 1=1 --`를 넣어 남의 계정으로 로그인하는 공격(SQL 인젝션)이 가능해져요.
- **Q6. 로그인 실패 문구를 왜 하나로 합쳤나요?**
  "없는 이메일"과 "비밀번호 틀림"을 구분해 주면, 남이 어떤 이메일이 가입됐는지 알아낼 수 있어요.
- **Q7. 왜 DB 표를 `migrations/` 파일로 관리하나요?**
  표를 바꾼 기록이 순서대로 남고, 내 컴퓨터 DB와 실제 DB에 **같은 순서로** 적용돼요. 손으로 SQL을 치면 둘이 달라지기 쉬워요.

---

## 6. 직접 실행해 보기

```bash
npm install        # 필요한 라이브러리 설치 (처음 한 번)
npm run dev        # 내 컴퓨터에서 켜기 → http://localhost:8787
npm test           # 자동 확인 59가지
```

실행 결과 예시 (`npm test`):

```
✓ 화면 파일이 열린다
✓ 가입 + 이메일 소문자 저장
✓ 작품 등록 + 사진 저장
✓ 남의 작품 삭제 거절
…
모두 통과 (59개)
```

### 연습 문제
1. `shared/categories.json`에 `"예술"`을 추가하고 `npm run dev`를 다시 켜 보세요. 홈의 분야 버튼과 등록 화면에 모두 생기나요?
2. `frontend/index.html`의 `HOME_LIMIT`를 3으로 바꾸면 홈에 카드가 몇 개 보이나요?
3. 브라우저 개발자 도구(F12) → Network 탭을 열고 ▲를 눌러 보세요. 어떤 주소로 어떤 JSON이 오가나요?
4. 개발자 도구 → Application → Cookies에서 `sid`를 찾아 보세요. 왜 숫자(사용자 번호)가 아니라 긴 무작위 글자일까요?
