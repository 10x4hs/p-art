-- [파일 개요] PART 데이터베이스의 표(테이블) 6개와 빠른 검색용 색인(인덱스)을 처음 만드는 파일이에요. (Cloudflare D1 = SQLite)
-- [비유] 엑셀 파일을 처음 만들 때 시트(표)마다 열 이름을 정해 두는 것과 같아요. users 시트, projects 시트 … 처럼요.
-- [뜻/역할] '마이그레이션(migration)'은 DB 구조를 바꾸는 작업을 번호 순서대로 적어 둔 파일이에요. 0001은 첫 번째라는 뜻이고,
--          wrangler가 어떤 번호까지 적용했는지 기억해서 같은 파일을 두 번 실행하지 않아요.
-- [작성 이유] 내 컴퓨터 DB와 배포(인터넷) DB가 똑같은 구조를 갖도록, 손으로 만들지 않고 이 파일을 실행해서 만들어요.
-- 적용: npx wrangler d1 migrations apply p-art --local  (배포 DB는 --remote)

-- [뜻/역할] 회원 표예요. 한 줄 = 회원 한 명.
-- [문법] INTEGER PRIMARY KEY — 줄마다 겹치지 않는 번호이고, 값을 안 넣으면 SQLite가 1, 2, 3 … 자동으로 매겨요.
--        UNIQUE는 같은 값이 두 번 들어갈 수 없음, NOT NULL은 비워 둘 수 없음, DEFAULT ''는 안 넣으면 빈 글자를 쓴다는 뜻이에요.
CREATE TABLE users (
  id       INTEGER PRIMARY KEY,
  -- [뜻/역할] 로그인 아이디예요. 소문자로 정리해서 저장해요(auth.js의 cleanEmail).
  email    TEXT UNIQUE NOT NULL,
  -- [뜻/역할] 비밀번호 '암호문'만 저장해요. 형식: pbkdf2$반복수$소금$해시 (원래 비밀번호는 저장하지 않아요, password.js 참고)
  password TEXT NOT NULL,
  nickname TEXT NOT NULL,
  bio      TEXT DEFAULT ''
);

-- [뜻/역할] 작품 표예요. 한 줄 = 작품 하나.
CREATE TABLE projects (
  id         INTEGER PRIMARY KEY,
  -- [뜻/역할] 작품을 올린 회원 번호예요.
  -- [문법] REFERENCES users(id) — users 표의 id를 가리킨다는 '외래 키'예요. ON DELETE CASCADE는 그 회원이 지워지면 이 작품도 같이 지우라는 뜻이에요.
  -- [작성 이유] 탈퇴한 회원의 작품이 주인 없이 남지 않게, DB가 알아서 함께 정리해 줘요.
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  -- [뜻/역할] 한 줄 소개
  summary    TEXT NOT NULL,
  -- [뜻/역할] 만든 이야기
  detail     TEXT DEFAULT '',
  -- [뜻/역할] 체험 주소
  url        TEXT NOT NULL,
  github     TEXT DEFAULT '',
  -- [뜻/역할] 쓴 기술, 쉼표로 구분: "HTML,CSS"
  -- [작성 이유] 태그를 따로 표로 나누면 복잡해져서, 작은 프로젝트답게 쉼표 글자 하나로 저장하고 꺼낼 때 배열로 바꿔요(util.js의 split).
  tags       TEXT DEFAULT '',
  -- [뜻/역할] 분야, 쉼표로 구분 (shared/categories.json에 있는 것 중에서만)
  cats       TEXT DEFAULT '',
  -- [뜻/역할] 만든 사람 (예: 1학년 4반 홍길동)
  maker      TEXT DEFAULT '',
  -- [뜻/역할] 이런 친구한테 추천
  target     TEXT DEFAULT '',
  -- [뜻/역할] 공개 여부예요. 1이면 공개, 0이면 나만 보기. (SQLite에는 true/false 종류가 따로 없어서 숫자로 저장해요)
  is_public  INTEGER DEFAULT 1,
  -- [뜻/역할] 만든 시각이에요. CURRENT_TIMESTAMP는 저장하는 순간의 시각(UTC)을 자동으로 넣어 줘요.
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- [뜻/역할] 작품 사진 표예요. 한 줄 = 사진 한 장. 사진 데이터 자체는 KV에 있고, 여기에는 '어느 작품의 어느 사진인지'만 적어요.
-- [작성 이유] 작품 하나에 사진이 여러 장일 수 있어서 projects 표와 따로 나눴어요.
CREATE TABLE images (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- [뜻/역할] KV(IMAGES)에 저장된 사진의 키
  file       TEXT NOT NULL
);

-- [뜻/역할] ▲ 응원 표예요. 한 줄 = "누가 어떤 작품을 응원했다".
-- [문법] PRIMARY KEY (user_id, project_id) — 두 열을 묶어서 하나의 키로 써요. 같은 사람·같은 작품 조합은 한 줄만 들어갈 수 있어요.
-- [작성 이유] 한 사람이 한 작품을 여러 번 응원하지 못하게(1인 1회) DB가 직접 막아 줘요.
CREATE TABLE likes (
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, project_id)
);

-- [뜻/역할] 💬 한 줄 감상 표예요. 로그인 없이 남길 수 있어서 회원 번호 대신 적은 이름(name)을 저장해요.
CREATE TABLE comments (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  text       TEXT NOT NULL,
  -- [뜻/역할] 남긴 사람의 IP예요. 도배 방지용(같은 IP는 1분에 5개까지)으로만 쓰고 화면에는 보내지 않아요.
  ip         TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- [뜻/역할] 로그인 세션 표예요. 한 줄 = 로그인 한 번(기기 하나). session.js가 쓰고 읽어요.
CREATE TABLE sessions (
  -- [뜻/역할] 쿠키에 담기는 무작위 번호
  sid     TEXT PRIMARY KEY,
  uid     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- [뜻/역할] 끝나는 시각 (밀리초). 자바스크립트 Date.now()와 같은 단위라 바로 비교할 수 있어요.
  expires INTEGER NOT NULL
);

-- [뜻/역할] 자주 찾는 열에 색인(인덱스)을 만들어요.
-- [비유] 책 맨 뒤의 '찾아보기'예요. 처음부터 끝까지 넘기지 않고 바로 해당 쪽으로 갈 수 있어요.
-- [작성 이유] "이 회원의 작품", "이 작품의 사진·응원·감상", "이 IP의 최근 감상"을 자주 찾기 때문에, 데이터가 많아져도 빠르게 찾으려고요.
CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_images_project ON images(project_id);
CREATE INDEX idx_likes_project ON likes(project_id);
CREATE INDEX idx_comments_project ON comments(project_id);
CREATE INDEX idx_comments_ip ON comments(ip, created_at);
