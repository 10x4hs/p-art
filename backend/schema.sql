CREATE TABLE IF NOT EXISTS users (
  id       INTEGER PRIMARY KEY,
  email    TEXT UNIQUE NOT NULL,       -- 로그인 아이디(소문자로 저장)
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
  tags       TEXT DEFAULT '',          -- 쉼표로 구분: "React,Node"
  is_public  INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
