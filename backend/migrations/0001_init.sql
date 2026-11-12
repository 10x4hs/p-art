-- PART 데이터베이스 (Cloudflare D1 = SQLite)
-- 적용: npx wrangler d1 migrations apply p-art --local  (배포 DB는 --remote)

CREATE TABLE users (
  id       INTEGER PRIMARY KEY,
  email    TEXT UNIQUE NOT NULL,          -- 로그인 아이디 (소문자로 저장)
  password TEXT NOT NULL,                 -- pbkdf2$반복수$소금$해시 (원래 비밀번호는 저장하지 않음)
  nickname TEXT NOT NULL,
  bio      TEXT DEFAULT ''
);

CREATE TABLE projects (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  summary    TEXT NOT NULL,               -- 한 줄 소개
  detail     TEXT DEFAULT '',             -- 만든 이야기
  url        TEXT NOT NULL,               -- 체험 주소
  github     TEXT DEFAULT '',
  tags       TEXT DEFAULT '',             -- 기술, 쉼표로 구분: "HTML,CSS"
  cats       TEXT DEFAULT '',             -- 분야, 쉼표로 구분 (shared/categories.json 중에서)
  maker      TEXT DEFAULT '',             -- 만든 사람 (예: 1학년 4반 홍길동)
  target     TEXT DEFAULT '',             -- 이런 친구한테 추천
  is_public  INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE images (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file       TEXT NOT NULL                -- KV(IMAGES)에 저장된 사진의 키
);

CREATE TABLE likes (
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, project_id)
);

CREATE TABLE comments (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  text       TEXT NOT NULL,
  ip         TEXT DEFAULT '',             -- 도배 방지용
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  sid     TEXT PRIMARY KEY,               -- 쿠키에 담기는 무작위 번호
  uid     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL                -- 끝나는 시각 (밀리초)
);

CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_images_project ON images(project_id);
CREATE INDEX idx_likes_project ON likes(project_id);
CREATE INDEX idx_comments_project ON comments(project_id);
CREATE INDEX idx_comments_ip ON comments(ip, created_at);
