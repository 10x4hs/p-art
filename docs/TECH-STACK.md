# PART는 왜 이 기술들을 썼나요?

> 2026-11-17 기준으로 코드를 직접 읽고 정리했어요.
> 흐름 그림은 [WORKFLOW.md](WORKFLOW.md), 폴더를 나눈 이유는 [CODE-REVIEW.md](CODE-REVIEW.md), 한 줄씩 해설은 [EXPLAIN.md](../EXPLAIN.md)에 있어요.

이 글은 세 가지를 답해요.

1. 이 프로젝트에 jQuery가 있나요? (없어요)
2. 쓰인 기술은 각각 무엇이고, 어디서 쓰이고, 왜 골랐나요?
3. 지금 다시 고른다면 바꿀 것이 있나요?

---

## 1. jQuery는 없어요

코드에 `$('#q')` 같은 모양이 84번 나와서 jQuery처럼 보이지만, jQuery가 아니에요.

**확인한 것**

- `package.json`의 라이브러리는 `hono`(서버)와 `wrangler`(개발·배포 도구) 둘뿐이에요.
- HTML이 불러오는 스크립트는 직접 만든 `/js/app.js`와 `/shared/categories.js`뿐이에요. jQuery CDN 주소는 없어요.
- 모든 브랜치와 git 기록에서 "jquery"를 찾아도 나오지 않아요.

**`$`의 정체**

`frontend/js/app.js` 맨 위에서 직접 만든 두 줄짜리 줄임말이에요.

```js
const $  = (s, el = document) => el.querySelector(s);          // 하나 찾기
const $$ = (s, el = document) => [...el.querySelectorAll(s)];  // 여러 개 찾아 배열로
```

`document.querySelector('#q')`를 매번 쓰기 길어서 `$('#q')`로 줄였어요. 이름만 jQuery 습관을 따랐어요.

**구별하는 법**: `$(...)` 뒤에 붙는 부분을 보면 돼요.

| 하려는 일 | jQuery라면 | 이 프로젝트 (순수 JS) |
|---|---|---|
| 입력값 넣기 | `$('#q').val('abc')` | `$('#q').value = 'abc'` |
| 글자 넣기 | `$('#total').text(3)` | `$('#total').textContent = 3` |
| 클릭 연결 | `$('#btn').on('click', fn)` | `$('#btn').addEventListener('click', fn)` |

`.value`, `.textContent`, `.addEventListener`는 브라우저에 원래 있는 기능이에요.

---

## 2. 기술 스택

### 한눈에 보기

```
브라우저 ──(HTML·CSS·JS)──▶ Static Assets (frontend/)
   │
   └──(fetch /api/…)──▶ Worker + Hono (backend/src/)
                            ├─▶ D1  : 가입·작품·감상·세션
                            └─▶ R2  : 사진
```

외부 라이브러리는 서버의 `hono` 하나예요. 나머지는 Cloudflare 서비스와 브라우저·Node 기본 기능이에요.

### 화면 (frontend/)

| 기술 | 무엇인가요 | 어디서 쓰이나요 | 왜 골랐나요 |
|---|---|---|---|
| HTML·CSS·순수 JS | 브라우저 기본 3종 | `frontend/*.html`, `style.css`, `js/app.js` | 수행평가 조건이에요. 빌드 과정이 없어서 파일을 고치면 바로 보여요 |
| `fetch` | 브라우저 내장 통신 기능 | `app.js`의 `api()` 함수 | 라이브러리(axios 등) 없이도 충분해요 |
| `localStorage` | 브라우저 안의 작은 저장소 | 밝은/어두운 테마 기억, 작품 임시 저장 | 서버에 둘 필요가 없는 개인 설정이에요 |
| 공통 함수 파일 | `app.js` 하나 | 메뉴·작품 카드·응원 버튼 | 한 곳을 고치면 모든 페이지에 적용돼요 |

React나 Vite를 쓰지 않은 이유: 페이지가 9개이고 `app.js`가 159줄이에요. 이 크기에서는 프레임워크가 주는 이득보다 배울 것과 빌드 단계가 늘어나는 부담이 더 커요.

### 서버 (backend/)

| 기술 | 무엇인가요 | 어디서 쓰이나요 | 왜 골랐나요 |
|---|---|---|---|
| Cloudflare Workers | 서버를 직접 두지 않고 코드를 돌려 주는 곳 | `backend/src/index.js`가 시작점 | 카드 등록 없이 무료예요. 다시 배포해도 데이터가 남아요 |
| Static Assets | Workers가 파일을 그대로 내려 주는 기능 | `wrangler.jsonc`의 `assets` → `frontend/` | 화면과 서버가 `wrangler deploy` 한 번에 같이 올라가요 |
| Hono | 주소마다 실행할 코드를 연결하는 서버 틀 | `index.js`, `routes/auth.js`·`projects.js`·`admin.js` | Express와 문법이 거의 같은데 Workers에서 바로 돌아요 |
| D1 | Cloudflare의 SQLite 데이터베이스 | 사용자·작품·감상·세션 표, `backend/migrations/*.sql` | 처음 쓴 SQLite SQL을 거의 그대로 쓸 수 있고, 학교 규모에 충분해요 |
| R2 | 파일 저장소 | 작품 사진. `/uploads/:key` 주소로 꺼내요 | 처음에는 KV를 썼는데 쓰기가 하루 1,000번뿐이라 바꿨어요 |
| Web Crypto (PBKDF2) | Workers에 내장된 암호화 기능 | `backend/src/password.js` | bcrypt 같은 라이브러리는 Workers에서 돌리기 어려워요. 반복 10만 회는 Workers가 허용하는 최대값이에요 |
| 쿠키 세션 | 로그인을 기억하는 방식 | `backend/src/session.js`, D1의 `sessions` 표 | 서버에서 세션을 지우면 바로 로그아웃돼요. `httpOnly` 쿠키라 악성 스크립트가 읽지 못해요 |

안 고른 것: Railway는 무료 체험이 끝나면 월 5달러가 들어요. Render 무료판은 다시 배포하면 데이터가 지워져요. MySQL·Postgres는 별도 서버와 비용이 필요해요.

### 함께 쓰는 값·도구

| 기술 | 무엇인가요 | 어디서 쓰이나요 | 왜 골랐나요 |
|---|---|---|---|
| `shared/categories.json` | 분야 목록 | 서버는 직접 읽고, 화면은 `/shared/categories.js`로 받아요 | 양쪽에 복사해 뒀다가 한쪽만 고쳐서 버그가 난 적이 있어요 |
| Wrangler | Cloudflare 공식 개발·배포 도구 | `npm run dev`, `npm run deploy`, `npm run check` | 로컬에서 D1·R2까지 똑같이 띄워 줘요 |
| 스모크 테스트 | 가입부터 탈퇴까지 한 바퀴 도는 테스트 | `scripts/smoke-test.js` (`npm test`) | Node 내장 `assert`만 써서 테스트 라이브러리가 필요 없어요 |
| GitHub Actions | 자동 검사·배포 | `.github/workflows/ci.yml`, `deploy.yml` | PR을 올리면 문법 검사와 테스트가 자동으로 돌아요 |

---

## 3. 지금 다시 고른다면

### 그대로 두는 것

- **Workers + D1 + R2 + Hono**: 이 규모의 서비스에 지금도 알맞은 조합이에요. 낡은 기술이 아니에요.
- **순수 JS**: 위에 적은 대로 지금 크기에서는 프레임워크가 필요 없어요.
- **PBKDF2 10만 회**: Workers 제한 때문에 더 올릴 수 없어요.
- **스모크 테스트 하나**: 지금 기능 수에서는 충분해요. 기능이 더 늘면 그때 나눠요.

### 손볼 만한 것 (중요한 순서)

| # | 무엇 | 왜 | 어떻게 |
|---|---|---|---|
| 1 | `$`, `$$` 이름 | jQuery로 오해받아요 | 이름을 `qs`, `qsa`로 바꿔요. 84군데를 고치지만 동작은 같아요 |
| 2 | `dist/` 폴더 | 옛 빌드 결과물이 git에 남아 있어요. `admin.html`이 빠져 있어 지금 코드와 달라요. `wrangler.jsonc`·`package.json`·CI 어디에서도 쓰지 않아요 | 폴더를 지우고 `.gitignore`에 넣어요 |
| 3 | `compatibility_date` | `2025-09-01`로 1년 넘게 지났어요 | 최근 날짜로 올리고 스모크 테스트로 확인해요. 급하지는 않아요 |

**결론**: 스택을 갈아엎을 이유는 없어요. 1번과 2번 같은 정리만 하면 돼요.
