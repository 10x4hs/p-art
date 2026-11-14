-- ============================================================================
-- [파일 개요] 팀원(project_members)·북마크(bookmarks)·조회수(views)·신고 및 숨김(reports, hidden) 기능을
-- 추가하는 두 번째 마이그레이션 파일이에요.
-- - 이미 운영 중인 DB의 기존 데이터를 잃지 않도록, 기존 표는 지우지 않고 열(COLUMN)과 새 표만 덧붙여요.
-- - 적용 명령: npx wrangler d1 migrations apply p-art --local (배포 DB는 --remote, main 브랜치 배포 시 자동 적용)
-- [비유] 이미 운영 중인 도서관 대장에 '조회수·숨김 체크칸'을 한 줄 더 긋고, '함께 만든 팀원 명단·북마크 공책·신고 접수철'을 새로 비치하는 작업이에요.
-- ============================================================================

-- [뜻/역할] 기존 `projects` 표에 조회수(`views`) 열과 숨김 여부(`hidden`) 열을 새로 추가해요.
-- [문법] `ALTER TABLE 표이름 ADD COLUMN 열이름 타입 DEFAULT 기본값;` 문법으로 기존 표 구조를 안전하게 확장해요.
-- [작성 이유]
-- - `views`: 작품 주인이 아닌 사람이 상세 페이지를 열어볼 때마다 +1씩 올리기 위해서예요.
-- - `hidden`: 서로 다른 회원 3명이 신고하거나 관리자가 숨김 처리했을 때 `1`로 바꿔서 목록에서 감추기 위해서예요. 기존 작품들은 모두 `0`으로 시작해요.
ALTER TABLE projects ADD COLUMN views INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN hidden INTEGER DEFAULT 0;

-- [뜻/역할] 작품을 함께 만든 팀원(최대 5명)을 연결하는 `project_members` 표를 만들어요.
-- [문법]
-- - `CREATE TABLE IF NOT EXISTS`: 혹시 같은 표가 이미 있더라도 에러를 내지 않고 넘어가요.
-- - `PRIMARY KEY (project_id, user_id)`: 한 작품에 같은 회원이 팀원으로 두 번 중복 등록되지 않게 묶음 기본키로 지정해요.
-- [작성 이유] 작품 주인(`projects.user_id`) 외에도 함께 참여한 팀원들의 프로필 페이지에 해당 작품이 표시되도록 다대다(N:M) 관계를 저장하기 위해서예요.
CREATE TABLE IF NOT EXISTS project_members (
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);

-- [뜻/역할] 회원이 나중에 다시 보려고 담아 둔 '북마크(저장한 작품)' 목록인 `bookmarks` 표를 만들어요.
-- [문법] `likes` 표와 똑같이 `(user_id, project_id)`를 복합 기본키로 쓰고, 회원이나 작품이 삭제되면(`ON DELETE CASCADE`) 자동으로 함께 지워져요.
-- [작성 이유] 한 사람이 한 작품을 한 번만 북마크할 수 있게 보장하고, 내 프로필 페이지에서 내가 저장한 작품만 모아 보여 주기 위해서예요.
CREATE TABLE IF NOT EXISTS bookmarks (
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, project_id)
);

-- [뜻/역할] 부적절한 작품에 대한 회원의 신고 내역을 기록하는 `reports` 표를 만들어요.
-- [문법] `UNIQUE (project_id, user_id)` 제약 조건을 걸어 같은 회원이 같은 작품을 중복 신고할 수 없게 해요.
-- [작성 이유] 1인 1회 신고 원칙을 DB에서 강제하고, 신고가 3건 이상 쌓이면 자동으로 작품을 숨기거나 관리자가 신고 사유(`reason`)를 검토할 수 있게 하기 위해서예요.
CREATE TABLE IF NOT EXISTS reports (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason     TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, user_id)
);

-- [뜻/역할] 특정 회원이 팀원으로 참여한 작품을 찾을 때(`idx_members_user`)와 특정 작품의 북마크 수를 셀 때(`idx_bookmarks_project`) 빠르게 조회하도록 색인을 만들어요.
-- [문법] `CREATE INDEX IF NOT EXISTS 색인이름 ON 표이름(열이름);` 형식이에요.
-- [작성 이유] 작품 목록 조회와 프로필 페이지 조회 속도를 높이기 위해서예요.
CREATE INDEX IF NOT EXISTS idx_members_user ON project_members(user_id);
CREATE INDEX idx_bookmarks_project ON bookmarks(project_id);
