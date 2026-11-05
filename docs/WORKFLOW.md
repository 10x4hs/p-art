# PART는 어떻게 돌아가나요?

팀원이 코드를 처음 열었을 때 **무엇이 어디서 어떻게 움직이는지** 그림으로 이해하도록 만든 문서예요.
(GitHub에서 열면 아래 그림이 자동으로 그려져요.)

- [1. 전체 구조](#1-전체-구조)
- [2. 사용자 흐름](#2-사용자-흐름)
- [3. 기능별 흐름 (시퀀스)](#3-기능별-흐름)
- [4. DB 구조](#4-db-구조)
- [5. 개발 → 배포 흐름](#5-개발--배포-흐름)
- [6. 무엇을 바꾸려면 어디를?](#6-무엇을-바꾸려면-어디를)

---

## 1. 전체 구조

```mermaid
flowchart LR
  subgraph B["🖥️ 브라우저"]
    H["frontend/*.html<br/>화면 뼈대"]
    J["frontend/js/app.js<br/>공통 함수"]
    C["frontend/style.css<br/>디자인"]
  end

  subgraph CF["☁️ Cloudflare"]
    AS["Static Assets<br/>frontend/ 파일 그대로"]
    subgraph W["Worker (backend/src/)"]
      IX["index.js<br/>주소 나누기·오류 처리"]
      SE["session.js<br/>로그인 기억"]
      AU["routes/auth.js<br/>가입·로그인·내 정보"]
      PR["routes/projects.js<br/>작품·응원·감상"]
    end
    D1[("D1 · SQLite<br/>users · projects · …")]
    KV[("KV IMAGES<br/>사진")]
  end

  SH["shared/categories.json<br/>분야 목록 (양쪽 공용)"]

  H -- "① 페이지 요청" --> AS
  AS -- "② HTML·CSS·JS" --> H
  J -- "③ fetch('/api/…') JSON" --> IX
  IX --> SE --> AU & PR
  AU & PR --> D1
  PR --> KV
  SH -.-> IX
  IX -. "/shared/categories.js" .-> J
```

**핵심은 두 단계예요.**
1. 화면 파일(`frontend/`)은 Cloudflare가 **그대로** 보내요. Worker를 거치지 않아서 빠르고 무료 한도도 안 써요.
2. 페이지가 열리면 `app.js`가 `/api/...`를 불러요. 이 주소만 Worker(`backend/src/`)가 처리해서 **데이터만** 돌려줘요.

어떤 주소를 Worker가 먼저 처리할지는 `wrangler.jsonc`의 `run_worker_first`(`/api/*`, `/uploads/*`, `/shared/*`)가 정해요.
그래서 **보이는 것**은 `frontend/`, **저장·규칙**은 `backend/src/`에서 고쳐요.

> Cloudflare는 주소에서 `.html`을 떼어 줘요 (`/project.html?id=1` → `/project?id=1`). 둘 다 같은 페이지예요.

---

## 2. 사용자 흐름

```mermaid
flowchart TD
  HOME["🏠 홈 /<br/>이번 주의 작품 + 최근 6개"] --> WORKS["🖼️ 전시관 /works.html<br/>검색 · 분야 · 정렬"]
  HOME --> DETAIL
  WORKS --> DETAIL["📄 작품 상세 /project.html?id="]
  DETAIL --> CHEER{"▲ 응원"}
  CHEER -- 로그인 됨 --> CHEERED["응원 +1 (1인 1회)"]
  CHEER -- 로그인 안 됨 --> LOGIN
  DETAIL --> GUEST["💬 한 줄 감상<br/>(로그인 없이)"]

  HOME --> REG["✏️ 내 작품 걸기 /edit.html"]
  REG -- 로그인 안 됨 --> LOGIN["🔑 로그인 /login.html<br/>이메일 → 비밀번호"]
  LOGIN -- "?next= 로 돌아가기" --> REG
  LOGIN -.-> SIGNUP["🆕 가입 /signup.html<br/>이메일 → 비밀번호 → 닉네임"]
  REG -- 저장 --> KIT["📣 홍보 키트 /kit.html?id=<br/>문구 복사"]
  KIT --> SHARE["단톡방·인스타 공유"]
  SHARE -.-> DETAIL
```

---

## 3. 기능별 흐름

### 3-1. 가입 · 로그인

```mermaid
sequenceDiagram
  actor U as 사용자
  participant F as signup.html<br/>(stepForm)
  participant A as routes/auth.js
  participant DB as D1

  U->>F: 이메일 → 비밀번호 → 닉네임 (한 칸씩)
  Note over F: 칸마다 화면에서 먼저 검사<br/>위쪽 칸 높이 고정 → 입력칸 안 움직임
  F->>A: POST /api/signup {email, password, nickname}
  A->>A: 다시 검사 (화면 검사는 우회 가능하니까)
  A->>A: 이메일 소문자로, 비밀번호 PBKDF2 암호화
  A->>DB: INSERT users
  A->>DB: 무작위 세션 번호 저장 (sessions 표)
  A-->>F: Set-Cookie: sid=세션 번호 + 내 정보
  F-->>U: "가입 완료" → 작품 걸기
```

- 로그인 상태 = **쿠키 속 세션 번호(sid) → D1 sessions 표 → uid**. 배포해도 유지(30일, 쓸 때마다 연장).
- 비밀번호 원문은 어디에도 저장되지 않아요. PBKDF2를 쓰는 이유: Workers 무료 요금제는 요청당 CPU 10ms 제한이 있는데, bcrypt(순수 JS)는 100ms쯤 걸려요. PBKDF2는 Cloudflare 기본 기능이라 훨씬 빨라요.

### 3-2. 작품 걸기

```mermaid
sequenceDiagram
  actor U as 사용자
  participant E as edit.html
  participant P as routes/projects.js
  participant KV as KV IMAGES
  participant DB as D1

  U->>E: 칸 입력 · 사진 고르기
  E-->>U: 오른쪽 미리보기 카드 즉시 변경 (서버 안 거침)
  U->>E: 전시 시작하기
  E->>E: 필수 칸·주소 형식 검사
  E->>E: shrink(): 사진을 긴 쪽 1600px JPEG로 줄이기
  E->>P: POST /api/projects (FormData: 글 + 사진 ≤5장)
  P->>P: readForm(): 길이·주소 검사, 분야는 shared 목록만 남김
  P->>P: pickImages(): 종류·크기·장수 검사
  P->>DB: INSERT projects
  P->>KV: 사진마다 무작위 키로 저장
  P->>DB: INSERT images (키만)
  P-->>E: { id }
  E-->>U: /kit?id= 로 이동 (홍보 키트)
```

- 사진은 KV에, DB에는 **키(이름)만** 있어요. 화면은 `/uploads/키`로 사진을 불러요 → Worker가 KV에서 꺼내 보내요.
- 사진을 브라우저에서 줄이는 이유: KV 무료 한도(1GB, 하루 쓰기 1,000번)를 아끼고, 휴대폰 사진(5~10MB)도 빨리 올라가게.

### 3-3. ▲ 응원 · 💬 한 줄 감상

```mermaid
sequenceDiagram
  actor U as 사용자
  participant APP as app.js (공통 클릭 처리)
  participant P as routes/projects.js
  participant DB as D1

  U->>APP: ▲ 클릭 (어느 페이지든 data-cheer 버튼)
  APP->>P: POST /api/projects/:id/like
  alt 로그인 안 됨
    P-->>APP: 401
    APP-->>U: 로그인 화면으로 (끝나면 돌아옴)
  else 로그인 됨
    P->>DB: 있으면 DELETE, 없으면 INSERT (켜기/끄기)
    P-->>APP: { liked, likes }
    APP-->>U: 같은 작품의 ▲ 숫자 모두 갱신
  end

  U->>P: POST /api/projects/:id/comments {name, text}
  P->>DB: 같은 IP 최근 1분 감상 수 확인
  alt 5개 이상
    P-->>U: 429 "조금 있다가"
  else
    P->>DB: INSERT comments
  end
```

### 3-4. 목록 (홈 · 전시관)

```mermaid
flowchart LR
  Q["검색어 q · 분야 cat · 정렬 sort"] --> API["GET /api/projects?q=&cat=&sort="]
  API --> SQL["SQL 한 번에<br/>검색 + 분야 + 정렬 + 작성자·사진·응원 수<br/>비공개는 주인만"]
  SQL --> HOMEV["홈: 앞 6개만 + '전체 보기'"]
  SQL --> WORKSV["전시관: 전부<br/>조건을 주소에 저장"]
  HOMEV -- "조건 그대로 들고 이동" --> WORKSV
```

---

## 4. DB 구조

```mermaid
erDiagram
  users ||--o{ projects : "올린다"
  users ||--o{ likes : "누른다"
  projects ||--o{ images : "사진"
  projects ||--o{ likes : "받는다"
  projects ||--o{ comments : "감상"

  users {
    int id PK
    text email UK "로그인 (소문자)"
    text password "PBKDF2 암호"
    text nickname
    text bio
  }
  projects {
    int id PK
    int user_id FK
    text title
    text summary "한 줄 소개"
    text detail "만든 이야기"
    text url "체험 주소"
    text github
    text tags "기술, 쉼표 구분"
    text cats "분야, 쉼표 구분"
    text maker "만든 사람"
    text target "추천 대상"
    int is_public
    text created_at
  }
  images {
    int id PK
    int project_id FK
    text file "KV에 저장된 사진 키"
  }
  likes {
    int user_id PK
    int project_id PK
  }
  comments {
    int id PK
    int project_id FK
    text name
    text text
    text ip "도배 방지"
    text created_at
  }
```

- 사용자를 지우면 작품·응원이, 작품을 지우면 사진·응원·감상이 **함께 지워져요**(`ON DELETE CASCADE`).
- 로그인 세션은 `sessions` 표(sid, uid, expires)에 있어요.
- 표 구조는 `backend/migrations/0001_init.sql`. 바꿀 땐 **새 파일**(`0002_….sql`)을 추가해요 → 배포할 때 자동 적용.

---

## 5. 개발 → 배포 흐름

```mermaid
flowchart LR
  subgraph LOCAL["💻 내 컴퓨터"]
    BR["feature/fe-… 또는<br/>feature/be-… 브랜치"] --> CODE["코드 수정<br/>npm run dev (로컬 D1·KV)"] --> T["npm test"]
  end
  T -- push --> PR["Pull Request → dev"]
  PR --> CI{"GitHub Actions CI<br/>문법 검사 + 테스트 21개"}
  CI -- 실패 --> CODE
  CI -- 통과 + 라벨 자동 --> DEV["dev 브랜치<br/>(통합)"]
  DEV -- "발표·배포할 때 PR" --> MAIN["main 브랜치<br/>(배포용)"]
  MAIN -- "Deploy 워크플로" --> CFD["☁️ Cloudflare<br/>DB 표 업데이트 → 배포"]
  CFD --> LIVE["🌐 p-art.swx2.workers.dev"]
```

- `npm run dev`는 **내 컴퓨터 안에 가짜 D1·KV**를 만들어서 돌려요. 실제 사이트 데이터는 건드리지 않아요.

브랜치 규칙은 [CONTRIBUTING.md](../CONTRIBUTING.md), 배포 방법은 [DEPLOY.md](DEPLOY.md)에 있어요.

---

## 6. 무엇을 바꾸려면 어디를?

| 하고 싶은 것 | 고칠 곳 | 담당 |
|---|---|---|
| 화면 문구·배치 | `frontend/*.html` | FE |
| 색 · 글꼴 | `frontend/style.css` 맨 위 변수 (`--accent` 등) | FE |
| 카드 모양 (모든 페이지 공통) | `frontend/js/app.js`의 `card()` | FE |
| 홈에 보이는 작품 수 | `frontend/index.html`의 `HOME_LIMIT` | FE |
| 홍보 문구 | `frontend/kit.html`의 `promos()` | FE |
| 분야 추가·변경 | `shared/categories.json` **한 곳만** | 공용 |
| 입력 규칙(길이 등) | `backend/src/routes/*.js` + 화면 쪽 검사도 같이 | BE+FE |
| 새 API | `backend/src/routes/`에 추가 → `index.js`에서 `app.route` → API 표 갱신 | BE |
| 사진 크기·장수 | 화면 `edit.html`의 `shrink()` + 서버 `projects.js`의 `MAX_BYTES`·`MAX_FILES` | FE+BE |
| Worker가 먼저 처리할 주소 | `wrangler.jsonc`의 `run_worker_first` | BE |
| 테이블 구조 | `backend/migrations/`에 새 `000N_….sql` 추가 | BE |
