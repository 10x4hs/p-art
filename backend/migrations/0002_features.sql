-- [파일 개요] 팀원·북마크·조회수·신고 기능에 필요한 열과 표를 더해요. 기존 표는 지우거나 바꾸지 않고 덧붙이기만 해요.
-- 적용: npx wrangler d1 migrations apply p-art --local  (배포 DB는 --remote, main 머지 때 자동)

-- 조회수(주인이 아닌 사람이 볼 때 +1)와 숨김(신고 3명 또는 관리자). 기존 작품은 0으로 시작해요.
ALTER TABLE projects ADD COLUMN views INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN hidden INTEGER DEFAULT 0;

-- 팀원. 작품 주인이 고른 회원(최대 5명)이에요. 작품이나 회원이 지워지면 같이 지워져요.
CREATE TABLE IF NOT EXISTS project_members (
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);

-- 북마크. likes와 같은 모양이라 한 사람이 한 작품에 한 번만 담을 수 있어요.
CREATE TABLE IF NOT EXISTS bookmarks (
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, project_id)
);

-- 신고. UNIQUE라서 한 사람이 한 작품을 한 번만 신고할 수 있어요.
CREATE TABLE IF NOT EXISTS reports (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason     TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_members_user ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_project ON bookmarks(project_id);
