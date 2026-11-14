# PART 친절한 코드 해설서 (초보자용 · 전 파일 완전판)

> 프로그래밍을 막 배우기 시작한 팀원도 PART 프로젝트의 **모든 파일(24개)을 한 줄 한 줄 읽고 스스로 고칠 수 있게** 작성한 해설서예요.
> 모든 소스 파일 자체에도 `[파일 개요]`, `[비유]`, `[뜻/역할]`, `[문법]`, `[작성 이유]` 주석이 빠짐없이 달려 있어요.
> 그림으로 보는 전체 흐름과 다이어그램은 [docs/WORKFLOW.md](docs/WORKFLOW.md)에 있어요.

---

## 1. 이 프로그램은 무엇을 하나요? (쉬운 설명)

- **한 줄 요약**: 학교 복도에 작품을 거는 것처럼, 학생이 수행평가나 동아리에서 만든 웹사이트·게임·도구를 **작품 카드로 걸어 두는 온라인 전시관**이에요.
- **일상 비유 (미술관 & 레스토랑)**:
  - `frontend/` (HTML 9개 + `style.css` + `js/app.js`) = **전시실 홀** (관람객이 보는 액자·조명·안내판)
  - `backend/src/` (Cloudflare Worker 파일 8개) = **안내 데스크 & 큐레이터실** (출입증 확인, 작품 접수, 응원·북마크·방명록·신고 처리)
  - **Cloudflare D1** (`backend/migrations/*.sql`) = **전시관 장부 창고** (SQLite 기반 DB: 회원·작품·사진키·응원·감상·세션·팀원·북마크·신고 9개 표)
  - **Cloudflare R2** (`p-art-uploads`) = **사진 원본 보관 금고** (작품 스크린샷 파일 자체를 UUID 키로 보관)
  - `shared/categories.json` = **공통 분야 스티커북** (서버와 화면이 똑같이 쓰는 분야 목록)
  - `scripts/smoke-test.js` = **개관 전 자동 점검 로봇** (59가지 기능을 처음부터 끝까지 자동으로 눌러 보는 테스트)

---

## 2. 전체 파일 지도 (24개 파일 한눈에 보기)

| 분류 | 파일 경로 | 역할 한 줄 요약 |
| :--- | :--- | :--- |
| **설정** | `wrangler.jsonc` | Cloudflare Workers·Static Assets·D1·R2·관리자 이메일 설정 |
| **공용 데이터** | `shared/categories.json` | 작품 분야 6가지 목록 (서버 검증 + 화면 칩 버튼 공용) |
| **DB 마이그레이션** | `backend/migrations/0001_init.sql` | 기본 표 6개(`users`, `projects`, `images`, `likes`, `comments`, `sessions`)와 색인 5개 생성 |
| **DB 마이그레이션** | `backend/migrations/0002_features.sql` | 확장 기능 열(`views`, `hidden`)과 표 3개(`project_members`, `bookmarks`, `reports`) 추가 |
| **백엔드 코어** | `backend/src/index.js` | Worker 시작점: 라우터 조립, `/project` OG 연결, `/uploads/:key` R2 사진 서빙, 공통 에러 처리 |
| **백엔드 코어** | `backend/src/util.js` | 공통 도구: 에러 생성(`bad`), JSON 읽기(`readJson`), URL 검사(`isHttp`), IP 추출, 관리자 확인(`isAdmin`) |
| **백엔드 코어** | `backend/src/session.js` | 로그인 세션: `sid` 쿠키 발급(`startSession`)·검증 및 자동 연장(`loadSession`)·삭제(`endSession`)·검문소(`needLogin`) |
| **백엔드 코어** | `backend/src/password.js` | 비밀번호 보안: Web Crypto `PBKDF2`(SHA-256, 10만 회 + 무작위 소금) 해시 생성 및 상수-시간 비교 |
| **백엔드 코어** | `backend/src/og.js` | 카톡·SNS 공유 미리보기: `HTMLRewriter`로 `/project.html?id=`에 작품별 Open Graph 메타 태그 실시간 주입 |
| **백엔드 라우트** | `backend/src/routes/auth.js` | 회원 API: 가입·로그인·로그아웃·내 정보 수정·회원 탈퇴(R2 사진 정리 포함)·팀원 닉네임 검색·공개 프로필 |
| **백엔드 라우트** | `backend/src/routes/projects.js` | 작품 API: 목록 검색/필터·상세/조회수·등록/수정/삭제·팀원·응원/북마크 토글·한 줄 감상(도배 방지)·신고(3회 자동 숨김) |
| **백엔드 라우트** | `backend/src/routes/admin.js` | 관리자 API: 신고/숨김 작품 목록 조회, 수동 숨김/해제, 신고 기록 비우기 |
| **프론트 공통** | `frontend/js/app.js` | 전 페이지 공통 JS: DOM 선택자(`$`), XSS 방지(`esc`), `api()`, 테마 전환, 상단 메뉴(`nav`), 카드(`card`), 응원 위임, 필터, `stepForm` |
| **프론트 스타일** | `frontend/style.css` | 다크/라이트 테마 CSS 변수, 유리 질감(`.glass`), 반응형 컨테이너 쿼리(`@container`) 디자인 |
| **프론트 화면** | `frontend/index.html` | 홈(`/`): 히어로 상위 3작품 스택, 응원 1등 '이번 주의 작품', 작품 6개 미리보기, 3단계 사용법 |
| **프론트 화면** | `frontend/works.html` | 전체 전시관: 모든 공개 작품 검색·분야·정렬 및 URL 쿼리 동기화(`history.replaceState`) |
| **프론트 화면** | `frontend/project.html` | 작품 상세: 소개·응원·북마크·샌드박스 iframe 미리보기·통계·팀원·한 줄 감상 방명록·신고 |
| **프론트 화면** | `frontend/edit.html` | 작품 걸기/고치기: 실시간 카드 미리보기, 팀원 검색/칩, `localStorage` 자동 임시 저장, `<canvas>` 사진 압축(`shrink`) |
| **프론트 화면** | `frontend/kit.html` | 홍보 키트: 작품 등록 직후 단톡방·인스타 스토리·한 줄 홍보 문구 3종 자동 생성 및 원클릭 복사 |
| **프론트 화면** | `frontend/login.html` | 로그인: `stepForm` 2단계(이메일 → 비밀번호) 대화형 입력 및 오픈 리다이렉트 방지 |
| **프론트 화면** | `frontend/signup.html` | 회원가입: `stepForm` 3단계(이메일 → 비밀번호 → 닉네임) 입력 및 가입 즉시 자동 로그인 |
| **프론트 화면** | `frontend/profile.html` | 프로필/내 공간: 내 정보 수정, 올린 작품, 작품별 조회/응원/감상/북마크 통계 표, 팀 참여 작품, 북마크 모아 보기 |
| **프론트 화면** | `frontend/admin.html` | 관리자 페이지: 신고 접수 및 숨김 작품 사유 확인, 숨기기/다시 보이기, 신고 지우기 |
| **자동 테스트** | `scripts/smoke-test.js` | 로컬 D1·R2 임시 환경에서 59개 시나리오를 처음부터 끝까지 자동 검증하는 스모크 테스트 |

---

## 3. 전체 실행 순서와 데이터의 여행 (Step-by-Step Flow)

| 순서 | 위치 / 함수 | 하는 일 (쉬운 설명) |
| :--- | :--- | :--- |
| 1단계 | 브라우저가 `https://p-art.swx2.workers.dev/` 접속 | Cloudflare Static Assets가 `frontend/index.html`을 Worker를 거치지 않고 초고속으로 바로 내려줘요 |
| 2단계 | `index.html`의 `<head>` 인라인 스크립트 | 화면이 그려지기 전에 `localStorage.getItem('theme')`을 확인해 밝은 테마(`.light`)를 즉시 켜서 화면 깜빡임을 막아요 |
| 3단계 | `/shared/categories.js` & `/js/app.js` 로드 | Worker가 `shared/categories.json`을 `window.CATS`로 내려주고, 공통 도구(`app.js`)가 준비돼요 |
| 4단계 | `app.js`의 `nav()` → `GET /api/me` | `wrangler.jsonc`의 `run_worker_first` 규칙에 따라 `/api/*` 요청이 Worker(`backend/src/index.js`)로 들어가요 |
| 5단계 | `session.js`의 `loadSession` 미들웨어 | 브라우저 쿠키의 `sid` 번호로 D1 `sessions` 표를 조회해 로그인한 회원 번호(`uid`)를 찾아 `c.set('uid', ...)`에 적어 둬요 |
| 6단계 | `routes/auth.js`의 `GET /api/me` | 로그인 상태면 닉네임과 관리자 여부(`isAdmin`)를 돌려주고, 상단 메뉴에 내 닉네임(관리자면 '관리' 포함)을 그려요 |
| 7단계 | `index.html`의 `loadTop()` & `list()` | `GET /api/projects?sort=hot`을 호출해 응원 상위 3개 히어로 카드, 1등 '이번 주의 작품', 전시 목록 6개를 그려요 |
| 8단계 | `<img src="/uploads/키">` 로드 | Worker(`index.js`)가 R2 버킷(`c.env.IMAGES`)에서 사진을 꺼내 1년 캐시(`immutable`) 헤더와 함께 내려줘요 |
| 9단계 | 카톡에 `/project.html?id=3` 링크 공유 | 메신저 봇이 접속하면 `og.js`의 `projectPage()`가 먼저 받아 `HTMLRewriter`로 그 작품의 제목·소개·사진을 `<meta property="og:...">`에 채워 보내요 |

---

## 4. 핵심 문법 및 키워드 사전 (초보자 필수 지식)

| 키워드 / 기호 | 뜻 | PART에서의 예 | 왜 쓰나요? / 주의할 점 |
| :--- | :--- | :--- | :--- |
| `import … from '…'` | 다른 파일이나 라이브러리의 기능을 **가져오기** | `import { Hono } from 'hono'` | 역할을 여러 파일로 나누어 깔끔하게 관리해요 |
| `export` / `export default` | 이 파일의 함수·객체를 밖에서 쓸 수 있게 **내보내기** | `export function bad(...)` | `default`는 파일당 1개, 일반 `export`는 여러 개 가능해요 |
| `const` / `let` | 다시 대입하지 않을 상수(`const`) / 값이 바뀔 변수(`let`) | `const PORT = 8799; let who = 'a';` | 실수로 변수가 덮어써지는 버그를 막기 위해 기본은 `const`를 써요 |
| `(a) => 식` | **화살표 함수** (함수를 짧게 쓰는 문법) | `const split = (v) => (v ? v.split(',') : [])` | 중괄호 `{}` 없이 쓰면 계산 결과를 자동으로 `return`해요 |
| `async` / `await` | DB 조회나 네트워크 통신이 **끝날 때까지 기다리기** | `const p = await api('/api/projects')` | `await`가 없으면 결과가 오기 전에 다음 줄로 넘어가 버려요 |
| `c` (Hono Context) | 요청(`c.req`)·응답(`c.json`)·환경(`c.env`)이 모두 담긴 **만능 상자** | `c.req.param('id')`, `c.env.DB` | Express의 `req`, `res`를 하나로 합쳐 둔 객체예요 |
| `?.` (옵셔널 체이닝) | 앞의 값이 `null`이나 `undefined`여도 에러 내지 않고 넘어가기 | `$('#report')?.addEventListener(...)` | 내 작품에는 `#report` 버튼이 없는데, 이때 에러 없이 조용히 넘어가요 |
| `...` (스프레드 연산자) | 배열이나 객체의 내용물을 낱개로 **펼치기** | `.bind(...values, id)` | 배열 안의 값 10개를 SQL `?` 자리에 순서대로 펼쳐 넘겨요 |
| `!!값` (이중 부정) | 숫자(`0`/`1`)나 객체를 진짜 불리언(`false`/`true`)으로 바꾸기 | `liked: !!p.liked` | SQLite는 참/거짓을 `1`/`0`으로 주므로 화면용 `true`/`false`로 바꿔요 |
| SQL `?` 바인딩 | SQL문에 값을 직접 이어 붙이지 않고 안전하게 끼워 넣는 빈칸 | `.prepare('... WHERE id = ?').bind(id)` | 해커가 입력칸에 SQL 명령어를 섞어 넣는 **SQL 인젝션** 공격을 100% 막아요 |
| `esc(문자열)` | `<`, `>`, `&`, `"`, `'` 기호를 안전한 HTML 문자로 치환 | `<h3>${esc(p.title)}</h3>` | 누군가 제목에 `<script>`를 넣어 실행시키는 **XSS 해킹**을 막아요 |

---

## 5. 📝 파일별 핵심 코드 & 설계 이유 완벽 해설

### 5-1. `wrangler.jsonc` — 정적 파일과 Worker 역할 나누기
- `assets.directory: "./frontend"`: HTML·CSS·JS·기본 이미지는 Cloudflare 정적 파일 서버가 바로 내려줘요.
- `assets.run_worker_first: ["/api/*", "/uploads/*", "/shared/*", "/project", "/project.html"]`:
  - `/api/*`(데이터 API), `/uploads/*`(R2 사진), `/shared/*`(공용 카테고리)는 Worker가 처리해요.
  - 특히 `/project`와 `/project.html`도 여기에 포함시켜서, 카카오톡이나 디스코드가 링크 미리보기를 요청할 때 Worker(`backend/src/og.js`)가 먼저 가로채 작품별 Open Graph 메타 태그를 심어 줄 수 있게 했어요.

### 5-2. `backend/migrations/0001_init.sql` & `0002_features.sql` — 9개 DB 표와 제약 조건
- **`ON DELETE CASCADE`**: 회원이 탈퇴하면(`DELETE FROM users`) 그 회원의 작품·응원·세션·팀원·북마크·신고가 연쇄적으로 자동 삭제되고, 작품을 내리면(`DELETE FROM projects`) 그 작품의 사진 키·응원·감상·팀원·북마크·신고가 자동으로 함께 지워져요.
- **복합 기본키(`PRIMARY KEY (user_id, project_id)`)와 `UNIQUE`**: `likes`(응원), `bookmarks`(북마크), `project_members`(팀원), `reports`(신고) 표에 걸려 있어서, 같은 사람이 두 번 중복으로 누르거나 신고하는 것을 DB 차원에서 원천 차단해요.
- **무중단 확장(`0002_features.sql`)**: 이미 운영 중인 DB의 기존 데이터를 지우지 않도록 `ALTER TABLE projects ADD COLUMN`과 `CREATE TABLE IF NOT EXISTS`로만 새 기능을 덧붙였어요.

### 5-3. `backend/src/session.js` & `password.js` — 안전한 인증과 암호화
- **쿠키에는 번호표(`sid`)만, 신원은 D1 `sessions` 표에**: 브라우저 쿠키에 회원 번호(`uid=3`)를 직접 넣으면 조작할 수 있으므로, `crypto.randomUUID()` 두 개를 이어 붙인 긴 무작위 문자열(`sid`)만 `httpOnly` 쿠키로 주고 실제 `uid`는 서버 DB에서만 확인해요.
- **PBKDF2 100,000회 + 무작위 소금(Salt) + 상수-시간 비교**:
  - 사람마다 16바이트 무작위 소금을 섞어 같은 비밀번호라도 해시값이 완전히 달라져요.
  - 로그인 비교 시 첫 바이트가 틀려도 멈추지 않고 끝까지 XOR(`^`) 연산으로 비교(`diff |= got[i] ^ want[i]`)해서, 응답 시간 차이로 비밀번호를 추측하는 **타이밍 공격**을 막아요.

### 5-4. `backend/src/og.js` — 카카오톡·SNS 공유 미리보기 (Open Graph)
- 카카오톡·슬랙·트위터 봇은 페이지에 들어와도 자바스크립트(`fetch('/api/projects/...')`)를 실행하지 않고 처음 받은 HTML의 `<meta property="og:title">` 태그만 읽어요.
- 그래서 `projectPage(c)` 함수가 원본 `frontend/project.html`을 가져온 뒤, 공개 작품(`is_public = 1 AND hidden = 0`)이면 Cloudflare의 스트리밍 파서인 `HTMLRewriter`로 `<title>`과 `<meta>` 태그를 그 작품의 제목·소개·첫 번째 사진 주소로 안전하게 바꿔서 내려보내요.

### 5-5. `backend/src/routes/projects.js` — SQL 한 번으로 목록 가져오기 & 쉼표 검색 트릭
- **`SELECT_FULL`**: 작품 목록을 가져올 때 서브쿼리(`group_concat`, `COUNT(*)`, `EXISTS`)를 사용해 작성자 닉네임·사진 키 목록·응원 수·감상 수·북마크 수·내 응원/북마크 여부를 **단 한 번의 SQL 실행**으로 모두 가져와요(N+1 쿼리 문제 해결).
- **쉼표 감싸기 트릭(`',' || p.cats || ',' LIKE '%,' || ?3 || ',%'`)**: 만약 `cats`가 `"게임개발,웹사이트"`일 때 그냥 `LIKE '%게임%'`으로 검색하면 `'게임'` 분야가 아닌데도 잘못 걸려 나와요. 양쪽에 쉼표를 붙여 `",게임개발,웹사이트,"` 안에 `",게임,"`이 있는지 검사하면 정확히 일치하는 분야와 태그만 깔끔하게 찾을 수 있어요.
- **`toggle(c, table, id)`**: 응원(`likes`)과 북마크(`bookmarks`)가 똑같은 구조이므로 하나의 `toggle` 함수로 묶었어요. 먼저 `DELETE`를 시도해 지워진 줄 수(`meta.changes`)가 `0`이면 새로 `INSERT`하고, `1`이면 그대로 두어 쿼리 수를 아끼고 동시 클릭에도 안전하게 작동해요.

### 5-6. `backend/src/routes/admin.js` & 신고 3회 자동 숨김
- 서로 다른 회원 3명(`HIDE_AT = 3`)이 작품을 신고하면 `projects.hidden = 1`이 되어 전시관 목록과 남의 상세 조회에서 즉시 숨겨져요(작품 주인과 관리자만 볼 수 있어요).
- 관리자(`wrangler.jsonc`의 `ADMIN_EMAILS`에 등록된 이메일로 로그인한 회원)는 상단 메뉴에 **'관리'**(`/admin.html`) 링크가 나타나며, 신고 사유들을 확인해 작품을 **'다시 보이기'**(`hidden: 0`)로 복구하거나 **'신고 지우기'**로 정리할 수 있어요.

### 5-7. `frontend/edit.html` — 실시간 미리보기 · 자동 임시 저장 · 클라이언트 사진 압축
- **자동 임시 저장(`saveDraft`)**: 글자를 입력할 때마다 0.5초 디바운스로 `localStorage`(`part-draft:new` 또는 `part-draft:작품번호`)에 저장해요. 실수로 창을 닫았다가 다시 열어도 `"임시 저장한 글을 불러왔어요"` 배너와 함께 작성하던 내용이 그대로 복구되고, 최종 제출에 성공하면 자동으로 지워져요.
- **클라이언트 사진 압축(`shrink`)**: 휴대폰으로 찍은 5~10MB짜리 고화질 사진을 그대로 서버에 올리면 느리고 용량 제한(1.5MB)에 걸려요. 브라우저의 `<canvas>`를 이용해 업로드 직전에 긴 변 최대 1600px, 품질 82% JPEG로 줄여서 올리기 때문에 빠르고 R2 저장 공간도 아낄 수 있어요.

---

## 6. 직접 실행하고 테스트해 보기

```bash
# 1. 패키지 설치 (처음 한 번)
npm install

# 2. 문법 및 설정 이상 유무 빠르게 확인
npm run check

# 3. 내 컴퓨터에서 개발 서버 켜기 (로컬 D1·R2 자동 생성 → http://localhost:8787)
npm run dev

# 4. 59가지 전체 시나리오 자동 스모크 테스트 실행
npm test
```

`npm test` 실행 시 59개 항목이 모두 초록색 체크(`✓`)로 통과하며 `모두 통과 (59개)`가 출력되면 모든 기능이 완벽하게 동작하는 상태예요!
