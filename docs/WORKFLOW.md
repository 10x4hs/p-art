# PART 워크플로 & 아키텍처 시각화 가이드

> 팀원이 프로젝트 전체 구조와 데이터의 흐름을 **한눈에 그림으로 이해**할 수 있도록 정리한 문서예요.
> GitHub에서 이 파일을 열면 모든 Mermaid 다이어그램이 자동으로 선명하게 렌더링돼요.
> 코드 한 줄 한 줄에 대한 상세 해설은 [EXPLAIN.md](../EXPLAIN.md)를 함께 참고해 주세요.

- [1. 전체 시스템 아키텍처](#1-전체-시스템-아키텍처)
- [2. 페이지 이동 및 사용자 여정 (User Flow)](#2-페이지-이동-및-사용자-여정-user-flow)
- [3. 핵심 기능별 시퀀스 다이어그램 (Sequence Diagrams)](#3-핵심-기능별-시퀀스-다이어그램-sequence-diagrams)
  - [3-1. 회원가입 · 로그인 · 세션 쿠키](#3-1-회원가입--로그인--세션-쿠키)
  - [3-2. 작품 걸기 (클라이언트 사진 압축 + R2 업로드 + 팀원 지정)](#3-2-작품-걸기-클라이언트-사진-압축--r2-업로드--팀원-지정)
  - [3-3. ▲ 응원 · ☆ 북마크 · 💬 한 줄 감상 (도배 방지)](#3-3--응원---북마크---한-줄-감상-도배-방지)
  - [3-4. 카카오톡·SNS 공유 미리보기 (동적 Open Graph 치환)](#3-4-카카오톡sns-공유-미리보기-동적-open-graph-치환)
  - [3-5. 🚩 신고 3회 자동 숨김 & 관리자 검토](#3-5--신고-3회-자동-숨김--관리자-검토)
- [4. 데이터베이스 구조 (ERD · 전체 9개 테이블)](#4-데이터베이스-구조-erd--전체-9개-테이블)
- [5. 개발 · 테스트 · CI/CD 자동 배포 파이프라인](#5-개발--테스트--cicd-자동-배포-파이프라인)
- [6. 무엇을 바꾸려면 어느 파일을 고치나요? (빠른 길찾기 표)](#6-무엇을-바꾸려면-어느-파일을-고치나요-빠른-길찾기-표)

---

## 1. 전체 시스템 아키텍처

```mermaid
flowchart LR
  subgraph B["🖥️ 브라우저 (frontend/)"]
    H["9개 HTML 페이지<br/>index · works · project · edit<br/>kit · login · signup · profile · admin"]
    J["frontend/js/app.js<br/>공통 API · 메뉴 · 카드 · 필터 · stepForm"]
    C["frontend/style.css<br/>다크/라이트 변수 · 유리 질감 · 반응형"]
  end

  subgraph CF["☁️ Cloudflare Edge"]
    AS["Static Assets<br/>정적 파일 직접 서빙"]
    subgraph W["Worker (backend/src/)"]
      IX["index.js<br/>라우터 조립 · /uploads · 공통 에러"]
      OG["og.js<br/>HTMLRewriter 동적 OG 메타 태그"]
      SE["session.js & password.js<br/>sid 쿠키 세션 · PBKDF2 암호화"]
      AU["routes/auth.js<br/>가입 · 로그인 · 내 정보 · 팀원 검색"]
      PR["routes/projects.js<br/>작품 CRUD · 응원 · 북마크 · 감상 · 신고"]
      AD["routes/admin.js<br/>신고 목록 · 숨김/복구 · 신고 삭제"]
    end
    D1[("D1 Database (SQLite)<br/>9개 테이블 (0001 + 0002)")]
    R2[("R2 Bucket (p-art-uploads)<br/>작품 사진 원본 파일")]
  end

  SH["shared/categories.json<br/>분야 목록 (서버·화면 공용)"]

  H -- "① 일반 화면 요청" --> AS
  H -- "② /project.html?id= (공유/상세)" --> OG
  OG -- "원본 HTML + DB 조회" --> AS & D1
  J -- "③ fetch('/api/…')" --> IX
  IX --> SE --> AU & PR & AD
  AU & PR & AD --> D1
  PR & AU -- "사진 저장 · 삭제" --> R2
  IX -- "GET /uploads/:key" --> R2
  SH -. "import / window.CATS" .-> IX & PR & J
```

> [!TIP]
> **왜 정적 자산(Static Assets)과 Worker를 나누었나요?**
> 일반 HTML·CSS·JS 파일은 Worker를 거치지 않고 Cloudflare 정적 자산 서버가 바로 내려주어 속도가 빠르고 무료 요청 한도를 아껴요.
> 반면 `/api/*`, `/uploads/*`, `/shared/*`, 그리고 카톡 공유 미리보기가 필요한 `/project`, `/project.html`만 `wrangler.jsonc`의 `run_worker_first` 설정을 통해 Worker가 먼저 처리해요.

---

## 2. 페이지 이동 및 사용자 여정 (User Flow)

```mermaid
flowchart TD
  HOME["🏠 홈 (/index.html)<br/>히어로 TOP 3 · 이번 주의 작품 · 최근 6개"] --> WORKS["🖼️ 전시관 (/works.html)<br/>전체 작품 검색 · 분야 · 인기/최신 정렬"]
  HOME --> DETAIL["📄 작품 상세 (/project.html?id=)<br/>소개 · 사이트 미리보기 · 만든 이야기 · 화면 사진"]
  WORKS --> DETAIL

  DETAIL --> CHEER{"▲ 응원 / ☆ 북마크"}
  CHEER -- "로그인 상태" --> TOGGLE["즉시 켜기/끄기 (1인 1회 토글)"]
  CHEER -- "비로그인 (401)" --> LOGIN["🔑 로그인 (/login.html?next=)"]
  DETAIL --> GUEST["💬 한 줄 감상 방명록<br/>(로그인 없이 작성 · IP당 1분 5개 제한)"]
  DETAIL --> REPORT["🚩 신고하기 (로그인 필요)<br/>3명 누적 시 자동 숨김"]

  HOME --> EDIT["✏️ 작품 걸기·고치기 (/edit.html)<br/>실시간 카드 미리보기 · 자동 임시 저장 · 사진 압축"]
  EDIT -- "비로그인" --> LOGIN
  LOGIN -- "원래 페이지(?next=)로 복귀" --> EDIT
  LOGIN -. "계정이 없다면" .-> SIGNUP["🆕 가입 (/signup.html)<br/>이메일 → 비밀번호 → 닉네임 (즉시 로그인)"]
  EDIT -- "새 작품 등록 완료" --> KIT["📣 홍보 키트 (/kit.html?id=)<br/>단톡방 · 인스타 · 한 줄 문구 복사"]
  KIT --> DETAIL

  DETAIL --> PROF["👤 작가 프로필 (/profile.html?id=)<br/>걸어 둔 작품 · 팀 참여 작품 · 내 통계 · 북마크 모아 보기"]
  PROF --> ADMIN["🛡️ 관리자 (/admin.html)<br/>신고 사유 검토 · 숨김 해제 · 신고 비우기"]
```

---

## 3. 핵심 기능별 시퀀스 다이어그램 (Sequence Diagrams)

### 3-1. 회원가입 · 로그인 · 세션 쿠키

```mermaid
sequenceDiagram
  autonumber
  actor U as 사용자
  participant F as signup.html / login.html<br/>(stepForm)
  participant A as routes/auth.js
  participant P as password.js / session.js
  participant DB as Cloudflare D1

  U->>F: 이메일 → 비밀번호 → 닉네임 한 칸씩 입력
  F->>F: 단계별 정규식 검사 (이메일 형식, 영문+숫자 8자↑, 닉네임 2~20자)
  F->>A: POST /api/signup { email, password, nickname }
  A->>A: 서버 재검증 + 이메일 소문자 변환(cleanEmail)
  A->>DB: SELECT 1 FROM users WHERE email = ?
  alt 이미 가입된 이메일 (409 Conflict)
    A-->>F: 409 "이미 가입한 이메일이에요"
    F-->>U: stepForm.goTo(0) → 1단계(이메일 칸)로 자동 복귀
  else 신규 이메일
    A->>P: hashPassword(password) (16B 무작위 소금 + PBKDF2 100,000회)
    A->>DB: INSERT INTO users (email, password, nickname)
    A->>P: startSession(c, uid)
    P->>DB: batch: 만료 세션 DELETE + 새 sid(30일) INSERT
    P-->>F: Set-Cookie: sid=...; HttpOnly; SameSite=Lax + 내 정보 JSON
    F-->>U: "가입 완료" → /edit.html 이동
  end
```

---

### 3-2. 작품 걸기 (클라이언트 사진 압축 + R2 업로드 + 팀원 지정)

```mermaid
sequenceDiagram
  autonumber
  actor U as 사용자
  participant E as edit.html
  participant P as routes/projects.js
  participant R2 as Cloudflare R2 (IMAGES)
  participant DB as Cloudflare D1

  U->>E: 제목·소개·체험 주소 입력 & 사진 선택 & 팀원 닉네임 검색
  E->>E: 오른쪽 미리보기 카드(#pvTitle 등) 실시간 갱신
  E->>E: 0.5초 디바운스로 localStorage('part-draft:...') 자동 임시 저장
  U->>E: "전시 시작하기" 클릭
  E->>E: shrink(file): <canvas>로 긴 변 1600px 이하 · JPEG(82%) 압축
  E->>P: POST /api/projects (FormData: 텍스트 + 압축 사진 ≤5장 + members)
  P->>P: readForm(): 길이·http(s) 주소·허용 분야(CATS) 검증
  P->>P: pickImages(): jpg/png/webp 종류·장당 1.5MB·최대 5장 검증
  P->>DB: readMembers(): 실제 존재하는 회원인지 확인 (최대 5명)
  P->>DB: INSERT INTO projects (...)
  loop 사진 파일마다
    P->>R2: IMAGES.put(UUID키, arrayBuffer, contentType)
    P->>DB: INSERT INTO images (project_id, file)
  end
  P->>DB: saveMembers(): project_members 일괄 저장 (batch)
  P-->>E: { id: 새 작품 번호 }
  E->>E: dropDraft() (임시 저장본 삭제)
  E-->>U: /kit.html?id=번호 (홍보 키트 화면으로 이동)
```

---

### 3-3. ▲ 응원 · ☆ 북마크 · 💬 한 줄 감상 (도배 방지)

```mermaid
sequenceDiagram
  autonumber
  actor U as 사용자
  participant J as app.js / project.html
  participant P as routes/projects.js
  participant DB as Cloudflare D1

  U->>J: ▲ 응원 버튼([data-cheer]) 또는 ☆ 북마크(#bm) 클릭
  J->>P: POST /api/projects/:id/like (또는 /bookmark)
  alt 비로그인 상태
    P-->>J: 401 "로그인이 필요해요"
    J-->>U: 토스트 안내 후 /login.html?next=원래주소 로 이동
  else 로그인 상태
    P->>DB: toggle(): DELETE FROM likes WHERE user_id=? AND project_id=?
    alt 지워진 줄이 없음 (meta.changes === 0 → 새로 켜기)
      P->>DB: INSERT INTO likes (user_id, project_id)
    end
    P->>DB: SELECT COUNT(*) FROM likes WHERE project_id=?
    P-->>J: { liked: true/false, likes: 총개수 }
    J-->>U: 화면의 모든 해당 작품 응원 숫자·버튼 색상 즉시 동기화
  end

  U->>J: 방명록에 이름(선택)·한 줄 감상(1~80자) 입력 후 "남기기"
  J->>P: POST /api/projects/:id/comments { name, text }
  P->>DB: 같은 IP(cf-connecting-ip)의 최근 1분 내 작성 수 조회
  alt 1분 내 5개 이상
    P-->>J: 429 "조금 있다가 다시 남겨 주세요"
  else 5개 미만
    P->>DB: INSERT INTO comments (project_id, name, text, ip)
    P-->>J: { id } → 방명록 목록 새로고침
  end
```

---

### 3-4. 카카오톡·SNS 공유 미리보기 (동적 Open Graph 치환)

```mermaid
sequenceDiagram
  autonumber
  actor BOT as 카카오톡·디스코드 봇 / 브라우저
  participant OG as backend/src/og.js (projectPage)
  participant AS as Static Assets (frontend/project.html)
  participant DB as Cloudflare D1

  BOT->>OG: GET /project.html?id=7 (또는 /project?id=7)
  OG->>AS: ASSETS.fetch('/project')로 원본 HTML 가져오기
  OG->>DB: findPublic(): id=7 작품이 공개(is_public=1)이고 안 숨겨졌는지(hidden=0) 조회
  alt 공개 작품이 존재함
    OG->>OG: HTMLRewriter로 <title>, og:title, og:description, og:image를 작품 정보로 치환
    OG-->>BOT: 작품 전용 미리보기 메타 태그가 심어진 HTML 응답 (ETag 제거)
  else 없거나 비공개·숨김 작품
    OG-->>BOT: 기본 PART 전시관 미리보기 HTML 그대로 응답 (정보 유출 방지)
  end
```

---

### 3-5. 🚩 신고 3회 자동 숨김 & 관리자 검토

```mermaid
sequenceDiagram
  autonumber
  actor U as 일반 회원 (3명)
  actor A as 관리자 (ADMIN_EMAILS)
  participant PR as routes/projects.js
  participant AD as routes/admin.js
  participant DB as Cloudflare D1

  U->>PR: POST /api/projects/:id/report { reason: "사유" }
  PR->>DB: INSERT OR IGNORE INTO reports (project_id, user_id, reason)
  PR->>DB: SELECT COUNT(*) n FROM reports WHERE project_id = ?
  alt 누적 신고자 수 n >= 3 (HIDE_AT)
    PR->>DB: UPDATE projects SET hidden = 1 WHERE id = ?
    Note over DB: 전시관 목록·남의 상세 조회·OG 미리보기에서 즉시 가려짐<br/>(작품 주인과 관리자만 열람 가능)
  end

  A->>AD: GET /api/admin/reports (/admin.html 접속)
  AD->>DB: 숨김 처리되었거나 신고가 있는 작품 + 사유 목록(group_concat) 조회
  AD-->>A: 신고 건수 및 사유 목록 표시
  A->>AD: POST /api/admin/projects/:id/hide { hidden: 0 } ("다시 보이기")
  A->>AD: DELETE /api/admin/projects/:id/reports ("신고 지우기")
  AD->>DB: hidden 상태 변경 및 reports 기록 삭제
```

---

## 4. 데이터베이스 구조 (ERD · 전체 9개 테이블)

```mermaid
erDiagram
  users ||--o{ projects : "작성 (user_id)"
  users ||--o{ sessions : "로그인 유지 (uid)"
  users ||--o{ likes : "응원 (user_id)"
  users ||--o{ bookmarks : "북마크 (user_id)"
  users ||--o{ project_members : "팀원 참여 (user_id)"
  users ||--o{ reports : "신고 (user_id)"

  projects ||--o{ images : "사진 키 (project_id)"
  projects ||--o{ likes : "응원 받음 (project_id)"
  projects ||--o{ comments : "한 줄 감상 (project_id)"
  projects ||--o{ project_members : "팀원 구성 (project_id)"
  projects ||--o{ bookmarks : "북마크 됨 (project_id)"
  projects ||--o{ reports : "신고 접수 (project_id)"

  users {
    int id PK "회원 고유 번호"
    text email UK "로그인 이메일 (소문자)"
    text password "PBKDF2 해시 문자열"
    text nickname "닉네임 (2~20자)"
    text bio "소개글 (0~200자)"
  }
  sessions {
    text sid PK "무작위 세션 쿠키 키 (UUIDx2)"
    int uid FK "users.id (CASCADE)"
    int expires "만료 시각 (밀리초)"
  }
  projects {
    int id PK "작품 고유 번호"
    int user_id FK "작성자 users.id (CASCADE)"
    text title "작품 제목 (1~40자)"
    text summary "한 줄 소개 (1~100자)"
    text detail "만든 이야기 (0~2000자)"
    text url "체험 주소 (http/https)"
    text github "GitHub 주소"
    text tags "쓴 기술 (쉼표 구분, 최대 8개)"
    text cats "분야 (쉼표 구분, CATS 검증)"
    text maker "만든 사람 표기 (0~30자)"
    text target "추천 대상 (0~50자)"
    int is_public "공개 여부 (1=공개, 0=비공개)"
    int views "조회수 (주인 외 열람 시 +1)"
    int hidden "숨김 여부 (3회 신고/관리자=1)"
    text created_at "등록 시각 (UTC)"
  }
  images {
    int id PK
    int project_id FK "projects.id (CASCADE)"
    text file "R2 객체 키 (UUID)"
  }
  likes {
    int user_id PK "users.id (CASCADE)"
    int project_id PK "projects.id (CASCADE)"
  }
  comments {
    int id PK
    int project_id FK "projects.id (CASCADE)"
    text name "작성자 이름 (기본 익명, ≤12자)"
    text text "감상 내용 (1~80자)"
    text ip "도배 방지용 IP"
    text created_at "작성 시각 (UTC)"
  }
  project_members {
    int project_id PK "projects.id (CASCADE)"
    int user_id PK "users.id (CASCADE)"
  }
  bookmarks {
    int user_id PK "users.id (CASCADE)"
    int project_id PK "projects.id (CASCADE)"
  }
  reports {
    int id PK
    int project_id FK "projects.id (CASCADE)"
    int user_id FK "users.id (CASCADE)"
    text reason "신고 사유 (1~100자, UNIQUE(project_id,user_id))"
    text created_at "신고 시각 (UTC)"
  }
```

---

## 5. 개발 · 테스트 · CI/CD 자동 배포 파이프라인

```mermaid
flowchart LR
  subgraph LOCAL["💻 내 컴퓨터 (로컬 개발)"]
    BR["기능/문서 브랜치 생성"] --> DEV_RUN["코드 수정 & 확인<br/>npm run dev (로컬 D1·R2)"]
    DEV_RUN --> CHECK["npm run check & npm test<br/>(59개 시나리오 자동 검증)"]
  end

  CHECK -- "git push" --> PR["GitHub Pull Request"]
  PR --> CI{"GitHub Actions CI<br/>문법 검사 + 스모크 테스트 59개"}
  CI -- "실패" --> DEV_RUN
  CI -- "성공 (All checks passed)" --> MERGE_DEV["dev 브랜치 병합<br/>(팀 통합 브랜치)"]
  MERGE_DEV -- "릴리스 PR 병합" --> MERGE_MAIN["main 브랜치 병합<br/>(배포 브랜치)"]
  MERGE_MAIN -- "Deploy 워크플로 자동 실행" --> DEPLOY["☁️ Cloudflare 배포<br/>D1 마이그레이션 적용 → Worker & Assets 배포"]
  DEPLOY --> LIVE["🌐 https://p-art.swx2.workers.dev"]
```

---

## 6. 무엇을 바꾸려면 어느 파일을 고치나요? (빠른 길찾기 표)

| 바꾸고 싶은 것 | 고칠 파일 | 담당 |
| :--- | :--- | :--- |
| 화면 문구 · 배치 · 레이아웃 구조 | `frontend/*.html` | FE |
| 색상 테마 · 폰트 · 카드/버튼 디자인 | `frontend/style.css` (`:root`, `:root.light` 변수 등) | FE |
| 모든 페이지 공통 상단 메뉴 · 카드 모양 · 응원 클릭 동작 | `frontend/js/app.js` (`nav()`, `card()`, `filters()`, `stepForm()`) | FE |
| 홈 화면에 보이는 최대 작품 개수 | `frontend/index.html` (`HOME_LIMIT = 6`) | FE |
| 작품 등록 직후 나오는 홍보 문구 템플릿 | `frontend/kit.html` (`promos()`) | FE |
| 업로드 전 사진 리사이즈 해상도·품질 | `frontend/edit.html` (`shrink(file, 1600)`) | FE |
| 작품 분야(카테고리) 추가·변경 | `shared/categories.json` (**이 파일 한 곳만 고치면 서버·화면 모두 자동 반영!**) | 공용 |
| 카톡·SNS 공유 미리보기(Open Graph) 제목·이미지 규칙 | `backend/src/og.js` (`projectPage()`) | BE |
| 관리자 이메일 지정 | `wrangler.jsonc`의 `vars.ADMIN_EMAILS` (쉼표로 구분) | BE |
| 입력 글자 수 제한 · 검색/필터 SQL · 자동 숨김 신고 횟수(`HIDE_AT`) | `backend/src/routes/projects.js`, `backend/src/routes/auth.js` | BE |
| 데이터베이스 표·열 추가 | `backend/migrations/`에 새 `0003_....sql` 파일 추가 | BE |
| 자동화 테스트 시나리오 추가 | `scripts/smoke-test.js` (`npm test`) | 공용 |
