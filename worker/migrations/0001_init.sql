-- PART D1 스키마 (backend/schema.sql + 나중에 추가된 열 + 세션 표)
CREATE TABLE IF NOT EXISTS users (
  id       INTEGER PRIMARY KEY,
  email    TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  nickname TEXT NOT NULL,
  bio      TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS projects (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  summary    TEXT NOT NULL,
  detail     TEXT DEFAULT '',
  url        TEXT NOT NULL,
  github     TEXT DEFAULT '',
  tags       TEXT DEFAULT '',
  is_public  INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  maker      TEXT DEFAULT '',
  target     TEXT DEFAULT '',
  cats       TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS images (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file       TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS likes (
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, project_id)
);
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  text       TEXT NOT NULL,
  ip         TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  uid     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_images_project ON images(project_id);
CREATE INDEX IF NOT EXISTS idx_likes_project ON likes(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_ip ON comments(ip, created_at);
