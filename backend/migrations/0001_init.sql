-- [파일 개요] PART DB의 표 6개와 색인을 처음 만드는 마이그레이션이에요(D1 = SQLite). 이미 배포 DB에 적용돼서 SQL은 고치면 안 돼요.
-- 적용: npx wrangler d1 migrations apply p-art --local  (배포 DB는 --remote)
-- 회원. INTEGER PRIMARY KEY는 번호가 자동으로 매겨지고, password에는 해시만 저장해요(password.js).
CREATE TABLE users (
  id       INTEGER PRIMARY KEY,
  email    TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  nickname TEXT NOT NULL,
  bio      TEXT DEFAULT ''
);

-- 작품. ON DELETE CASCADE: 회원을 지우면 그 작품도 같이 지워져요. tags·cats는 쉼표로 이은 글자예요.
CREATE TABLE projects (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  summary    TEXT NOT NULL,
  detail     TEXT DEFAULT '',
  url        TEXT NOT NULL,
  github     TEXT DEFAULT '',
  tags       TEXT DEFAULT '',
  cats       TEXT DEFAULT '',
  maker      TEXT DEFAULT '',
  target     TEXT DEFAULT '',
  is_public  INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 작품 사진. 사진 자체는 R2에 있고, 여기엔 R2 키(file)만 적어요.
CREATE TABLE images (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file       TEXT NOT NULL
);

-- 응원. (user_id, project_id) 묶음 키라서 한 사람이 한 작품에 한 번만 응원할 수 있어요.
CREATE TABLE likes (
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, project_id)
);

-- 한 줄 감상. 로그인 없이 쓰니 이름(name)을 저장하고, ip는 도배 방지용으로만 써요.
CREATE TABLE comments (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  text       TEXT NOT NULL,
  ip         TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 로그인 세션(session.js). expires는 Date.now()와 같은 밀리초예요.
CREATE TABLE sessions (
  sid     TEXT PRIMARY KEY,
  uid     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);

-- 자주 찾는 열에 색인(책 뒤 '찾아보기')을 만들어 빨리 찾아요.
CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_images_project ON images(project_id);
CREATE INDEX idx_likes_project ON likes(project_id);
CREATE INDEX idx_comments_project ON comments(project_id);
CREATE INDEX idx_comments_ip ON comments(ip, created_at);
