# PART — Project + Art

> 학생이 만든 프로젝트를 링크 대신 **작품처럼 걸어 두는** 학교 전시관.

수행평가로 만든 웹페이지·게임·도구를 카드로 걸고, 친구들은 써 보고 ▲ 응원과 한 줄 감상을 남깁니다.
작품을 걸면 단톡방·인스타에 바로 붙여 넣을 홍보 문구도 만들어 줍니다.

- 화면: HTML · CSS · 바닐라 JavaScript (프레임워크 없음)
- 서버: Cloudflare Workers + [Hono](https://hono.dev)
- DB: Cloudflare D1 (SQLite) · 사진: Cloudflare KV
- 🌐 **https://p-art.swx2.workers.dev** (무료 요금제)

## 바로 실행하기

Node.js 20 이상이 필요해요. Cloudflare 계정은 **없어도** 돼요 (내 컴퓨터에 가짜 D1·KV를 만들어서 돌려요).

```bash
npm install
npm run dev        # → http://localhost:8787  (코드를 고치면 자동 반영)
npm test           # 임시 DB로 가입~탈퇴까지 21가지 자동 확인
```

처음 실행하면 `.wrangler/` 폴더에 로컬 DB가 만들어지고 빈 전시관에서 시작해요.
가입 → 작품 걸기 → 홍보 키트 순서로 눌러 보면 전체 흐름을 볼 수 있어요.

## 한눈에 보기

```mermaid
flowchart LR
  B["🖥️ 브라우저<br/>frontend/"] -- "fetch /api/…" --> W["⚙️ Worker<br/>backend/src/"]
  CF["☁️ Cloudflare 정적 파일"] -- "HTML·CSS·JS" --> B
  W --> D1[("D1<br/>가입·작품·감상")]
  W --> KV[("KV<br/>사진")]
  SH["shared/<br/>분야 목록"] -.-> W
```

📘 **자세한 그림 설명: [docs/WORKFLOW.md](docs/WORKFLOW.md)** · 🚂 배포: [docs/DEPLOY.md](docs/DEPLOY.md) · 🤝 같이 작업하기: [CONTRIBUTING.md](CONTRIBUTING.md) · 🔰 코드 해설(초보자용): [EXPLAIN.md](EXPLAIN.md) · 🔍 코드 리뷰: [docs/CODE-REVIEW.md](docs/CODE-REVIEW.md)

## 기능

| 구분 | 기능 |
|---|---|
| 계정 | 이메일 + 비밀번호 가입·로그인, 로그아웃, 회원 탈퇴, 닉네임·소개 수정 |
| 작품 | 등록(사진 5장, 분야, 기술 태그, GitHub), 수정, 삭제, 비공개 |
| 둘러보기 | 홈(이번 주의 작품 + 최근 6개), 전시관(검색·분야·인기순/최신순 전체 목록) |
| 반응 | ▲ 응원(로그인, 1인 1회), 한 줄 감상(로그인 없이, 작품 주인이 삭제 가능) |
| 알리기 | 홍보 키트(단톡방·인스타·한 줄 문구 복사), 작품 주소 복사 |
| 화면 | 어두운 화면 기본 + 밝은 화면 전환, 모바일 대응 |

## 페이지

| 주소 | 화면 |
|---|---|
| `/` | 홈 — 히어로, 이번 주의 작품, 최근 작품 6개, 사용법 |
| `/works.html` | 전시관 — 전체 작품 (검색·분야·정렬, 주소에 조건 저장) |
| `/project.html?id=` | 작품 상세 — 이야기, 추천 대상, 화면, 방명록 |
| `/edit.html` | 작품 걸기 / 고치기 (`?id=`) — 입력하는 대로 미리보기 |
| `/kit.html?id=` | 홍보 키트 |
| `/login.html`, `/signup.html` | 한 칸씩 입력하는 로그인·가입 |
| `/profile.html?id=` | 프로필 — 내 정보 수정, 걸어 둔 작품 |

## 폴더 구조

```
frontend/                 화면 (FE 담당) — Cloudflare가 그대로 보내는 파일
  index.html  works.html  project.html  edit.html  kit.html
  login.html  signup.html profile.html
  js/app.js               모든 화면이 같이 쓰는 함수 (api 호출, 메뉴, 카드, 응원, 한 칸 입력 폼)
  style.css               디자인 — 포인트색은 맨 위 --accent
  img/                    디자인 사진 (CC0)
backend/                  서버 (BE 담당) — Cloudflare Worker
  src/index.js            시작점: 주소 나누기, 사진·분야 보내기, 오류 처리
  src/session.js          로그인 세션 (쿠키 sid ↔ D1 sessions 표)
  src/password.js         비밀번호 암호화 (PBKDF2)
  src/util.js             공용 도구 (오류, 주소 검사, IP)
  src/routes/auth.js      /api/signup, /login, /logout, /me, /users/:id
  src/routes/projects.js  /api/projects 목록·상세·등록·수정·삭제, /like, /comments
  migrations/             DB 표 구조 (0001_init.sql, 바꿀 땐 0002_… 추가)
shared/categories.json    분야 목록 (프론트·백엔드 공용)
scripts/smoke-test.js     npm test
wrangler.jsonc            Cloudflare 설정 (D1·KV 연결, 정적 파일)
docs/                     WORKFLOW(그림 설명), DEPLOY(배포), CODE-REVIEW(리뷰 가이드)
.github/                  CI, 자동 배포, PR 라벨 자동, PR 템플릿
```

## API 요약

| 메서드 | 주소 | 설명 | 로그인 |
|---|---|---|---|
| POST | `/api/signup` | `{email, password, nickname}` | |
| POST | `/api/login` | `{email, password}` | |
| POST | `/api/logout` | | |
| GET / PUT / DELETE | `/api/me` | 내 정보 / 닉네임·소개 수정 / 탈퇴 | ✔ (GET 제외) |
| GET | `/api/users/:id` | 공개 프로필 | |
| GET | `/api/projects?q=&cat=&sort=hot\|new&user=` | 작품 목록 | |
| GET | `/api/projects/:id` | 작품 상세 | |
| POST / PUT / DELETE | `/api/projects[/:id]` | 등록 / 수정 / 삭제 (multipart, `images` 5장·장당 1.5MB) | ✔ 본인 |
| POST | `/api/projects/:id/like` | ▲ 응원 켜기·끄기 | ✔ |
| GET / POST | `/api/projects/:id/comments` | 한 줄 감상 보기 / 남기기 (IP당 1분 5개) | |
| DELETE | `/api/projects/:id/comments/:cid` | 감상 지우기 | ✔ 작품 주인 |

## 배포

**Cloudflare 무료 요금제**에서 돌아가요 → https://p-art.swx2.workers.dev
`main`에 머지되면 GitHub Actions가 테스트 → DB 표 업데이트 → 배포까지 자동으로 해요. 자세한 내용과 무료 한도는 **[docs/DEPLOY.md](docs/DEPLOY.md)**.

## 브랜치

`main`(배포) ← `dev`(통합) ← `feature/fe-…`, `feature/be-…`. 자세한 규칙은 [CONTRIBUTING.md](CONTRIBUTING.md).

## 아직 없는 것

구글 로그인, 이메일 인증, 비밀번호 찾기, 관리자 화면.

## 출처

사진: Unsplash, StockSnap, rawpixel (CC0)
