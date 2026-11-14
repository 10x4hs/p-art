-- ============================================================================
-- [파일 개요] PART 데이터베이스의 기본 표(테이블) 6개와 색인(인덱스) 5개를 처음 만드는 마이그레이션 파일이에요.
-- - Cloudflare D1은 SQLite 문법을 그대로 사용해요.
-- - 이미 배포 DB에 적용된 마이그레이션이므로 SQL 구문 자체는 절대 수정하지 않고 주석만 자세히 달았어요.
-- - 로컬 적용 명령: npx wrangler d1 migrations apply p-art --local (배포 DB는 --remote)
-- [비유] 도서관을 처음 열 때 "회원 명부, 작품 목록, 사진 대장, 응원 명단, 감상평 노트, 출입증 대장" 양식을 만드는 작업이에요.
-- ============================================================================

-- [뜻/역할] 가입한 회원 정보를 저장하는 `users` 표를 만들어요.
-- [문법]
-- - `INTEGER PRIMARY KEY`: SQLite에서 1, 2, 3... 번호가 자동으로 매겨지는 고유 식별자(기본키)예요.
-- - `TEXT UNIQUE NOT NULL`: 글자 타입이며, 중복될 수 없고(`UNIQUE`), 비워 둘 수 없다(`NOT NULL`)는 뜻이에요.
-- - `DEFAULT ''`: 값을 안 넣으면 빈 문자열(`''`)을 기본값으로 채워요.
-- [작성 이유] 같은 이메일로 중복 가입하는 것을 DB 차원에서 막고, 비밀번호는 평문이 아니라 암호화된 해시 문자열(`password.js`)만 저장하기 위해서예요.
CREATE TABLE users (
  id       INTEGER PRIMARY KEY,
  email    TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  nickname TEXT NOT NULL,
  bio      TEXT DEFAULT ''
);

-- [뜻/역할] 회원이 올린 작품(프로젝트) 정보를 저장하는 `projects` 표를 만들어요.
-- [문법]
-- - `REFERENCES users(id) ON DELETE CASCADE`: `users` 표의 `id`를 가리키는 외래키(Foreign Key)예요. `ON DELETE CASCADE`를 붙이면 회원이 탈퇴할 때 그 회원이 올린 작품도 DB가 자동으로 함께 지워 줘요.
-- - `is_public INTEGER DEFAULT 1`: SQLite에는 불리언(true/false) 타입이 따로 없어서 `1`(공개), `0`(비공개) 숫자로 저장해요.
-- - `CURRENT_TIMESTAMP`: 줄이 추가될 때 현재 시각(UTC 기준 `YYYY-MM-DD HH:MM:SS`)을 자동으로 기록해요.
-- [작성 이유] 작품의 제목·소개·링크·태그(`tags`)·분야(`cats`)·공개 여부를 한 줄에 모아 관리하고, 탈퇴한 회원의 고아 데이터가 남지 않게 하기 위해서예요.
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

-- [뜻/역할] 각 작품에 첨부된 사진의 R2 파일 키(`file`)를 저장하는 `images` 표를 만들어요.
-- [문법] `project_id`는 어느 작품의 사진인지 가리키고, 작품이 삭제되면(`ON DELETE CASCADE`) 사진 목록 줄도 함께 삭제돼요.
-- [작성 이유] 사진 원본 파일 자체는 용량이 크므로 R2(`c.env.IMAGES`)에 두고, DB에는 가벼운 R2 키 이름(UUID)만 기록해 빠르게 조회하기 위해서예요.
CREATE TABLE images (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file       TEXT NOT NULL
);

-- [뜻/역할] 누가 어느 작품에 '▲ 응원(좋아요)'을 눌렀는지 기록하는 `likes` 표를 만들어요.
-- [문법] `PRIMARY KEY (user_id, project_id)`는 두 열을 묶어서 하나의 복합 기본키로 지정하는 문법이에요.
-- [작성 이유] `(회원 번호, 작품 번호)` 조합이 유일해야 하므로, 한 사람이 같은 작품에 응원을 두 번 이상 중복으로 누르는 것을 DB가 완벽하게 막아 줘요.
CREATE TABLE likes (
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, project_id)
);

-- [뜻/역할] 작품 상세 페이지 하단의 '💬 한 줄 감상'을 저장하는 `comments` 표를 만들어요.
-- [문법] 로그인 없이 누구나 쓸 수 있도록 `user_id` 대신 작성자 이름(`name`)과 도배 방지용 IP(`ip`)를 글자(`TEXT`)로 저장해요.
-- [작성 이유] 방문자가 부담 없이 감상을 남기게 하되, 같은 IP에서 1분에 5개 넘게 도배하는 것을 막기 위해 `ip`와 작성 시각(`created_at`)을 함께 기록해요.
CREATE TABLE comments (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  text       TEXT NOT NULL,
  ip         TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- [뜻/역할] 현재 로그인한 사람들의 세션 출입증 정보를 저장하는 `sessions` 표를 만들어요(`session.js`).
-- [문법] `sid`는 쿠키에 들어가는 무작위 문자열 키(`TEXT PRIMARY KEY`)이고, `expires`는 만료 시각(밀리초 숫자, `Date.now()`)이에요.
-- [작성 이유] Cloudflare Worker는 요청이 끝나면 메모리가 사라질 수 있어서, 로그인 상태를 DB(`sessions` 표)에 안전하게 보관하기 위해서예요.
CREATE TABLE sessions (
  sid     TEXT PRIMARY KEY,
  uid     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);

-- [뜻/역할] 자주 검색하거나 조건(`WHERE`)으로 찾는 열에 색인(인덱스)을 만들어 둬요.
-- [문법] `CREATE INDEX 색인이름 ON 표이름(열이름);` 형식이에요.
-- [작성 이유] 책 맨 뒤의 '찾아보기(색인)'처럼, 작품이나 댓글이 많아져도 처음부터 끝까지 다 뒤지지 않고 특정 회원의 작품이나 특정 작품의 사진·응원·감상·도배 여부를 순식간에 찾기 위해서예요.
CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_images_project ON images(project_id);
CREATE INDEX idx_likes_project ON likes(project_id);
CREATE INDEX idx_comments_project ON comments(project_id);
CREATE INDEX idx_comments_ip ON comments(ip, created_at);
