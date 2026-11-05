# PART 친절한 코드 해설서 (초보자용)

> 프로그래밍을 막 배우기 시작한 팀원도 PART 코드를 **스스로 읽고 고칠 수 있게** 쓴 설명서예요.
> 그림으로 보는 전체 흐름은 [docs/WORKFLOW.md](docs/WORKFLOW.md)에 있어요. 이 문서는 **코드 한 줄 한 줄**에 집중해요.

---

## 1. 이 프로그램은 무엇을 하나요? (쉬운 설명)

- **한 줄 요약**: 학교 복도에 작품을 거는 것처럼, 학생이 만든 웹사이트·게임을 **카드로 걸어 두는 온라인 전시관**이에요.
- **비유**: 식당으로 생각해 보세요.
  - `frontend/` = **홀** (손님이 보는 메뉴판·테이블) — HTML, CSS, 브라우저 JS
  - `backend/` = **주방** (주문을 받아 요리하고 창고에서 재료를 꺼냄) — Express 서버
  - `data/part.db` = **창고** (재료 장부) — SQLite 데이터베이스
  - `fetch('/api/...')` = **주문서** — 홀이 주방에 보내는 요청
- **입력과 출력**: 사용자가 이메일·작품 정보·사진을 넣으면 → 서버가 검사해서 DB에 저장하고 → 화면은 저장된 작품을 카드로 보여 줘요.

---

## 2. 전체 실행 순서와 흐름도 (How It Works)

| 순서 | 위치 / 함수 | 하는 일 (쉬운 설명) |
| :--- | :--- | :--- |
| 1단계 | `npm start` → `backend/server.js` | 서버 프로그램이 켜져요 |
| 2단계 | `backend/config.js` | 포트 번호, 비밀키, 데이터 폴더 위치를 정해요 |
| 3단계 | `backend/db.js` | `data/part.db`를 열고, 표(테이블)가 없으면 만들어요 |
| 4단계 | `backend/session-store.js` | "누가 로그인했나"를 DB에 기억하는 장치를 붙여요 |
| 5단계 | `app.listen(3000)` | 3000번 문을 열고 손님(브라우저)을 기다려요 |
| 6단계 | 브라우저가 `/` 요청 | 서버가 `frontend/index.html`을 그대로 보내요 |
| 7단계 | `index.html` 안의 JS 실행 | `fetch('/api/projects')`로 작품 목록을 주문해요 |
| 8단계 | `routes/projects.js`의 `router.get('/')` | DB에서 작품을 꺼내 JSON으로 돌려줘요 |
| 9단계 | `app.js`의 `card()` | JSON을 받아 카드 HTML로 바꿔 화면에 끼워 넣어요 |

---

## 3. 핵심 문법 및 키워드 사전 (초보자 필수 지식)

| 키워드 / 기호 | 뜻 | PART에서의 예 | 주의할 점 |
|---|---|---|---|
| `require('x')` | 다른 파일·라이브러리를 **가져와** 쓰기 (Node.js) | `const express = require('express')` | 브라우저 JS에서는 못 써요 |
| `module.exports = …` | 이 파일에서 **내보낼 것** 정하기 | `module.exports = db` | `require`가 받는 값이 이거예요 |
| `const` | 다시 바꾸지 않을 이름(상수) | `const app = express()` | 객체 **안의 내용**은 바꿀 수 있어요 |
| `let` | 나중에 바뀔 수 있는 이름(변수) | `let toastTimer` | |
| `(a) => …` | **화살표 함수** — 짧게 쓰는 함수 | `(req, res) => res.json(…)` | `{ }`가 없으면 결과를 바로 돌려줘요 |
| `` `글자 ${값}` `` | **템플릿 문자열** — 글자 안에 값 끼우기 | `` `PART → http://localhost:${PORT}` `` | 따옴표가 아니라 백틱(`) |
| `async` / `await` | 오래 걸리는 일(서버 요청)이 **끝날 때까지 기다리기** | `const user = await api('/api/me')` | `await`는 `async` 함수 안에서만 |
| `fetch(url)` | 브라우저가 서버에 **요청 보내기** | `fetch('/api/projects')` | 결과는 `await res.json()`으로 꺼내요 |
| `try { } catch (e) { }` | 오류가 나도 프로그램이 멈추지 않게 **잡기** | 로그인 실패 메시지 보여 주기 | |
| `?.` | 앞이 비어 있으면(`null`) **그냥 넘어가기** | `cb?.(null)` | 오류 대신 `undefined` |
| `...obj` | 객체·배열 **펼치기**(복사) | `{ ...p, tags: [...] }` | 뒤에 쓴 값이 앞을 덮어써요 |
| `!!x` | 아무 값이나 **true/false로** 바꾸기 | `liked: !!row` | 값이 있으면 true |
| 미들웨어 | 요청이 지나가는 **검문소** 함수 `(req, res, next)` | `needLogin` | 통과시키려면 `next()` |
| `req` / `res` | **요청**(손님 주문) / **응답**(내갈 요리) | `req.body`, `res.json()` | |
| 세션·쿠키 | 쿠키 = 브라우저가 가진 **번호표**, 세션 = 서버의 **장부** | `req.session.uid` | 번호표엔 번호만, 내용은 서버에 |
| SQL `?` | 값을 **안전하게** 끼우는 자리 | `WHERE email = ?` | 글자를 직접 이어 붙이면 해킹(SQL 인젝션) 위험 |
| bcrypt | 비밀번호를 **되돌릴 수 없게** 섞기(해시) | `bcrypt.hashSync(pw, 10)` | 원래 비밀번호는 저장하지 않아요 |
| `FormData` | 글 + **파일**을 한 번에 보내는 상자 | 작품 등록 | JSON으로는 사진을 못 보내요 |

---

## 4. 📝 한 줄 한 줄 완벽 해설 (Line-by-Line Breakdown)

> `backend/server.js`와 `backend/session-store.js`는 **파일 안에 모든 줄 주석**이 달려 있어요. 열어서 같이 보세요.
> 여기서는 나머지 핵심 파일을 줄 단위로 풀어요.

### 4-1. `backend/config.js` — 설정 모음

```js
const path = require('path');          // ① 경로(폴더/파일 위치)를 운영체제에 맞게 이어 주는 도구
const fs = require('fs');              // ② 파일·폴더를 만들고 지우는 도구

const isProd = process.env.NODE_ENV === 'production';
// ③ process.env = 환경변수(프로그램 밖에서 넣어 주는 설정). NODE_ENV가 'production'이면 "지금 배포 중"이라는 뜻
//    === : 값과 종류가 모두 같은지 비교. 결과는 true/false

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
// ④ 데이터 폴더 위치. 환경변수 DATA_DIR이 있으면 그걸, 없으면(||) 프로젝트의 data/ 폴더
//    __dirname = 지금 이 파일이 있는 폴더(backend/). '..' = 한 칸 위
//    왜? Railway에서는 볼륨(/data)에, 내 컴퓨터에서는 data/에 저장하려고

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');   // ⑤ 사진은 데이터 폴더 안 uploads/
fs.mkdirSync(UPLOAD_DIR, { recursive: true });       // ⑥ 폴더가 없으면 만든다. recursive: 중간 폴더까지 한 번에

if (isProd && !process.env.SECRET) {                 // ⑦ 배포 중인데 비밀키가 없으면
  console.error('SECRET 환경변수가 없어요. …');
  process.exit(1);                                   //    일부러 서버를 끈다. 기본 비밀키로 돌면 쿠키 위조 위험이 있어서
}

module.exports = { isProd, PORT: …, SECRET: …, DATA_DIR, UPLOAD_DIR, DB_FILE: …, FRONTEND_DIR: …, SHARED_DIR: … };
// ⑧ 다른 파일이 require('./config')로 꺼내 쓸 값들
```

### 4-2. `backend/db.js` — DB 열기와 자동 업그레이드

```js
const Database = require('better-sqlite3');   // ① SQLite를 Node에서 쓰게 해 주는 라이브러리
const { DB_FILE } = require('./config');      // ② { } : 객체에서 DB_FILE만 꺼내기(구조 분해)
const db = new Database(DB_FILE);             // ③ 파일을 연다. 없으면 새로 만든다
db.pragma('foreign_keys = ON');               // ④ "작품을 지우면 사진·응원도 같이 지워라"(CASCADE) 규칙을 켠다
                                              //    SQLite는 기본이 꺼져 있어서 꼭 켜야 해요

const old = db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'username'").get();
if (old) db.exec('ALTER TABLE users RENAME COLUMN username TO email');
// ⑤⑥ 예전 버전(아이디 로그인) DB라면 열 이름을 email로 바꾼다 → DB를 지우지 않고도 새 코드가 돌아가게

db.exec(require('fs').readFileSync(__dirname + '/schema.sql', 'utf8'));
// ⑦ schema.sql을 읽어 실행 → 표가 없으면 만든다(CREATE TABLE IF NOT EXISTS라서 있으면 그냥 넘어감)

const cols = db.prepare('PRAGMA table_info(projects)').all().map((c) => c.name);
// ⑧ projects 표의 열 이름 목록. .all() = 모든 줄, .map() = 각 줄에서 name만 뽑아 새 배열
for (const [name, def] of [['maker', "TEXT DEFAULT ''"], ['target', …], ['cats', …]]) {
  if (!cols.includes(name)) db.exec(`ALTER TABLE projects ADD COLUMN ${name} ${def}`);
}
// ⑨ 새로 생긴 열이 예전 DB에 없으면 붙인다. [name, def] = 배열을 두 이름으로 나눠 받기

module.exports = db;   // ⑩ 열린 DB 하나를 모든 파일이 같이 쓴다
```

### 4-3. `backend/routes/auth.js` — 가입·로그인

```js
const router = require('express').Router();   // ① 주소별 규칙을 모아 두는 작은 앱. server.js가 '/api'에 붙여요
const bcrypt = require('bcryptjs');           // ② 비밀번호 해시 도구

const fail = (res, code, error) => res.status(code).json({ error });
// ③ 오류 응답을 한 줄로: 상태 코드 + { error: "문구" }. { error } 는 { error: error }의 줄임

const needLogin = (req, res, next) => (req.session.uid ? next() : fail(res, 401, '로그인이 필요해요'));
// ④ 검문소(미들웨어). 세션에 uid가 있으면 통과(next), 없으면 401
//    조건 ? A : B  = 조건이 참이면 A, 아니면 B (삼항 연산자)

const me = (id) => db.prepare('SELECT id, email, nickname, bio FROM users WHERE id = ?').get(id);
// ⑤ 내 정보 꺼내기. password는 일부러 안 꺼낸다(화면에 갈 필요 없음)

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// ⑥ 정규식: "공백·@ 아닌 글자들 @ 글자들 . 글자들" 모양인지 검사. ^ 시작, $ 끝
const cleanEmail = (e) => String(e || '').trim().toLowerCase();
// ⑦ 앞뒤 공백 제거 + 소문자로 → Test@A.com 과 test@a.com 을 같은 사람으로

router.post('/signup', (req, res) => {        // ⑧ POST /api/signup 이 오면 실행
  const email = cleanEmail(req.body.email);
  const { password = '' } = req.body;         // ⑨ 없으면 빈 글자(기본값)
  const nickname = String(req.body.nickname || '').trim();
  if (!EMAIL.test(email) || email.length > 100) return fail(res, 400, '이메일 주소를 확인해 주세요');
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) return fail(res, 400, '…8자 이상, 영문+숫자…');
  // ⑩ (?=.*[A-Za-z]) 영문이 어딘가 있고, (?=.*\d) 숫자가 어딘가 있고, .{8,} 8자 이상
  if (nickname.length < 2 || nickname.length > 20) return fail(res, 400, '닉네임은 2~20자예요');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return fail(res, 409, '이미 가입한 이메일이에요');
  // ⑪ 409 = "이미 있어서 충돌". return으로 바로 끝내서 아래가 실행되지 않게

  const hash = bcrypt.hashSync(password, 10);   // ⑫ 비밀번호 섞기. 10 = 섞는 강도(높을수록 느리고 안전)
  req.session.uid = db.prepare('INSERT INTO users (email, password, nickname) VALUES (?, ?, ?)')
    .run(email, hash, nickname).lastInsertRowid;
  // ⑬ 저장하고, 새로 생긴 사용자 번호를 세션에 넣는다 = 가입과 동시에 로그인
  res.json(me(req.session.uid));                // ⑭ 내 정보를 돌려준다
});

router.post('/login', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail(req.body.email));
  if (!user || !bcrypt.compareSync(req.body.password || '', user.password)) return fail(res, 401, '이메일이나 비밀번호가 맞지 않아요');
  // ⑮ 이메일이 없든 비밀번호가 틀리든 **같은 문구** → 어떤 이메일이 가입됐는지 남이 알아낼 수 없게
  req.session.uid = user.id;
  res.json(me(user.id));
});
```

### 4-4. `backend/routes/projects.js` — 목록과 응원 (핵심만)

```js
router.get('/', (req, res) => {
  const { q = '', tag = '', cat = '', user = '', sort = 'new' } = req.query;
  // ① 주소 뒤 ?q=급식&cat=게임 → req.query = { q: '급식', cat: '게임' }
  const uid = req.session.uid;                 // ② 로그인했다면 내 번호
  const rows = db.prepare(`
    SELECT p.* FROM projects p
    WHERE (p.is_public = 1 OR p.user_id = @uid)       -- ③ 공개 작품 + 내 비공개 작품만
      AND (p.title LIKE @q OR p.summary LIKE @q …)    -- ④ LIKE '%급식%' = '급식'이 들어 있으면
      AND (@cat = '' OR ',' || p.cats || ',' LIKE '%,' || @cat || ',%')
      -- ⑤ 분야 "학교생활,웹사이트" 앞뒤에 쉼표를 붙여 ",학교생활,웹사이트," 안에 ",게임,"이 있는지 → '게임기' 같은 부분 일치 방지
      AND (@user = '' OR p.user_id = @user)
    ORDER BY ${정렬이 hot이면 '응원 수 DESC,' : ''} p.id DESC   -- ⑥ 인기순이면 응원 많은 순, 그다음 최신순
  `).all({ uid: uid || 0, q: `%${q}%`, tag, cat, user });
  // ⑦ @이름 자리에 값을 안전하게 끼운다. ${…}에는 정해진 글자만 들어가서 안전
  res.json(rows.map((p) => decorate(p, uid)));   // ⑧ 각 작품에 작성자·사진·응원 수를 붙여 JSON으로
});

router.post('/:id/like', needLogin, (req, res) => {   // ⑨ needLogin 검문소를 먼저 지난다
  const args = [req.session.uid, req.params.id];      //    :id → req.params.id
  const done = db.prepare('DELETE FROM likes WHERE user_id = ? AND project_id = ?').run(...args).changes;
  // ⑩ 먼저 지워 본다. changes = 지운 줄 수(이미 눌렀었으면 1, 아니면 0)
  if (!done) db.prepare('INSERT INTO likes (user_id, project_id) VALUES (?, ?)').run(...args);
  // ⑪ 안 눌렀었으면 새로 넣는다 → 한 번 누르면 켜지고, 또 누르면 꺼지는 "토글"
  res.json({ liked: !done, likes: /* 전체 응원 수 */ });
});
```

### 4-5. `frontend/js/app.js` — 화면 공통 함수 (핵심만)

```js
async function api(url, method = 'GET', body) {          // ① 서버 주문을 한 함수로. method 기본값 GET
  const opts = { method };
  if (body instanceof FormData) opts.body = body;         // ② 사진이 있으면 FormData 그대로
  else if (body) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
  // ③ 보통 데이터는 JSON 글자로 바꿔 보낸다(서버의 express.json()이 다시 객체로 바꿔 줌)
  const res = await fetch(url, opts);                     // ④ 주문 보내고 응답이 올 때까지 기다림
  const data = await res.json().catch(() => ({}));        // ⑤ 응답 JSON 꺼내기(실패하면 빈 객체)
  if (!res.ok) { const e = new Error(data.error || '…'); e.status = res.status; throw e; }
  // ⑥ 200번대가 아니면 서버의 오류 문구로 에러를 던진다 → 부른 쪽 catch에서 화면에 보여 줌
  return data;
}

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', … }[c]));
// ⑦ 사용자가 쓴 글을 HTML에 넣기 전에 < > 같은 기호를 바꾼다
//    왜? 누군가 제목에 <script>를 쓰면 다른 사람 화면에서 실행될 수 있어서(XSS 공격). 모든 사용자 글에 esc()를 써요

function card(p) { return `<article class="card">…${esc(p.title)}…${upBtn(p)}…</article>`; }
// ⑧ 작품 하나를 카드 HTML 글자로. 홈·전시관·프로필·홍보 키트가 모두 이 함수 하나를 쓴다 → 모양을 한 곳에서 고침

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-cheer]');   // ⑨ 누른 곳에서 위로 올라가며 data-cheer 붙은 버튼 찾기
  if (!btn) return;                               //    응원 버튼이 아니면 무시
  …
});
// ⑩ 버튼마다 따로 연결하지 않고 문서 전체에 하나만 연결(이벤트 위임) → 나중에 그려진 카드도 자동으로 동작
```

### 4-6. `shared/categories.js` — 프론트·백엔드 공용 파일

```js
(function (root) {                                    // ① 함수를 만들자마자 실행(즉시 실행 함수). 안의 이름이 밖으로 새지 않게
  const CATS = ['웹사이트', '게임', '학교생활', '공부', '도구'];
  if (typeof module !== 'undefined' && module.exports) module.exports = CATS;   // ② Node(서버)에서 불렸으면 내보내기
  else root.CATS = CATS;                                                        // ③ 브라우저면 window.CATS로 걸어 두기
})(this);                                             // ④ this = 브라우저에선 window
```
왜? 분야 목록이 프론트와 백엔드에 따로 있으면 한쪽만 고쳤을 때 "화면엔 있는데 저장이 안 되는" 버그가 생겨요. 한 파일을 둘 다 읽게 했어요.

---

## 5. 왜 이렇게 코드를 작성했을까요? (작성 이유와 꿀팁)

- **Q1. 왜 React 같은 프레임워크 대신 바닐라 JS?**
  설치·빌드 과정 없이 HTML 파일을 열면 바로 보이고, 수행평가 요구(HTML·CSS·JS)에 맞아요. 대신 공통 부분(`card()`, `nav()`)을 `app.js`에 모아서 중복을 줄였어요.
- **Q2. 왜 MySQL이 아니라 SQLite?**
  DB 서버를 따로 설치할 필요 없이 파일 하나(`part.db`)로 끝나요. 학교 규모(동시 접속 수십 명)에는 충분해요.
- **Q3. 화면에서 검사했는데 서버에서 또 검사하는 이유는?**
  화면 JS는 개발자 도구로 누구나 고칠 수 있어요. **진짜 문지기는 서버**예요. 화면 검사는 "빨리 알려 주기"용.
- **Q4. 세션을 DB에 저장하지 않으면?**
  서버가 재시작(배포할 때마다)될 때 모든 사람이 로그아웃돼요. 그래서 `session-store.js`를 만들었어요.
- **Q5. `esc()`를 빼먹으면?**
  누군가 작품 제목에 `<img src=x onerror=alert(1)>`을 쓰면 보는 사람 브라우저에서 코드가 실행돼요. 사용자가 쓴 글은 **항상** `esc()`.
- **Q6. SQL에서 `?`를 안 쓰고 `'...' + email + '...'`로 이어 붙이면?**
  이메일 칸에 `' OR 1=1 --`를 넣어 남의 계정으로 로그인하는 공격(SQL 인젝션)이 가능해져요.
- **Q7. 로그인 실패 문구를 왜 하나로 합쳤나요?**
  "없는 이메일"과 "비밀번호 틀림"을 구분해 주면, 남이 어떤 이메일이 가입됐는지 알아낼 수 있어요.

---

## 6. 직접 실행해 보기

```bash
npm install        # 필요한 라이브러리 설치 (처음 한 번)
npm start          # 서버 켜기 → 브라우저에서 http://localhost:3000
npm test           # 자동 확인 14가지
```

실행 결과 예시:

```
PART → http://localhost:3000  (data: /…/part/data)
```

```
✓ 페이지가 열린다
✓ 가입 + 이메일 소문자 저장
…
모두 통과 (14개)
```

### 연습 문제
1. `shared/categories.js`에 `'예술'`을 추가하고 서버를 다시 켜 보세요. 홈의 분야 버튼과 등록 화면에 모두 생기나요?
2. `frontend/index.html`의 `HOME_LIMIT`를 3으로 바꾸면 홈에 카드가 몇 개 보이나요?
3. 브라우저 개발자 도구(F12) → Network 탭을 열고 ▲를 눌러 보세요. 어떤 주소로 어떤 JSON이 오가나요?
