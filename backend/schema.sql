-- [파일 개요] PART의 데이터베이스 표(테이블) 5개를 만드는 SQL 설계도예요.
-- [비유] 엑셀 파일에 '회원 명단', '작품 목록', '사진 목록', '응원 장부', '방명록' 시트 5개를 만들고 열 제목을 적어 두는 것과 같아요.

-- [뜻/역할] 회원 정보를 담는 users 표를 만들어요. 이미 표가 있으면 아무 일도 하지 않고 넘어가요(IF NOT EXISTS).
-- [문법] CREATE TABLE IF NOT EXISTS 테이블이름 (열이름 자료형 제약조건, ...);
-- [작성 이유] 서버를 켤 때마다 이 파일이 실행되므로, 기존 데이터가 날아가지 않게 '없을 때만 만든다'는 조건을 붙였어요.
CREATE TABLE IF NOT EXISTS users (
  -- [뜻/역할] 각 회원마다 자동으로 1, 2, 3... 번호가 매겨지는 고유 번호(기본키)예요.
  -- [문법] INTEGER(정수) PRIMARY KEY(대표 열, 중복 불가, 자동 증가)
  -- [작성 이유] 닉네임이나 이메일이 바뀌어도 회원을 절대 헷갈리지 않고 구분하기 위한 주민번호 같은 역할이에요.
  id       INTEGER PRIMARY KEY,
  -- [뜻/역할] 로그인할 때 아이디로 쓰는 이메일 주소예요. 소문자로 통일해서 저장해요.
  -- [문법] TEXT(글자) UNIQUE(중복 가입 불가) NOT NULL(빈칸 불가)
  -- [작성 이유] 같은 이메일로 계정을 두 개 만들지 못하게 DB 차원에서 한 번 더 막아 주는 거예요.
  email    TEXT UNIQUE NOT NULL,
  -- [뜻/역할] bcrypt로 안전하게 암호화(해시)된 비밀번호 글자를 저장해요.
  -- [문법] TEXT NOT NULL
  -- [작성 이유] 원래 비밀번호는 절대 저장하지 않고 암호문만 저장해서, 혹시 DB가 유출되어도 비밀번호를 알 수 없게 해요.
  password TEXT NOT NULL,
  -- [뜻/역할] 화면에 표시될 사용자의 별명(닉네임)이에요.
  -- [문법] TEXT NOT NULL
  -- [작성 이유] 이메일 주소 대신 친근한 이름을 프로필과 작품에 보여 주기 위해서예요.
  nickname TEXT NOT NULL,
  -- [뜻/역할] 프로필 페이지에 적는 한두 줄 자기소개예요.
  -- [문법] TEXT DEFAULT '' — 값을 안 넣으면 자동으로 빈 글자('')가 들어가요.
  -- [작성 이유] 가입할 때는 자기소개를 안 받기 때문에 기본값을 빈 문자열로 두었어요.
  bio      TEXT DEFAULT ''
);

-- [뜻/역할] 학생들이 올린 작품 정보를 담는 projects 표를 만들어요.
-- [문법] CREATE TABLE IF NOT EXISTS projects (...);
-- [작성 이유] 전시관의 핵심인 작품 카드와 상세 페이지의 모든 글 정보가 여기에 저장돼요.
CREATE TABLE IF NOT EXISTS projects (
  -- [뜻/역할] 작품마다 자동으로 매겨지는 고유 번호(1, 2, 3...)예요.
  -- [문법] INTEGER PRIMARY KEY
  -- [작성 이유] 주소창의 /project.html?id=3 처럼 특정 작품을 정확히 찾아갈 때 써요.
  id         INTEGER PRIMARY KEY,
  -- [뜻/역할] 이 작품을 누가 올렸는지 users 표의 id를 가리키는 연결고리(외래키)예요.
  -- [문법] REFERENCES users(id) ON DELETE CASCADE — 부모(회원)가 삭제되면 자식(그 회원의 작품)도 연쇄적으로(CASCADE) 자동 삭제돼요.
  -- [작성 이유] 회원 탈퇴를 했을 때 주인 없는 유령 작품이 남지 않도록 DB가 알아서 치워 주게 했어요.
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- [뜻/역할] 작품의 제목(1~40자)이에요.
  -- [문법] TEXT NOT NULL
  -- [작성 이유] 제목 없는 작품은 전시할 수 없으므로 NOT NULL로 필수로 지정했어요.
  title      TEXT NOT NULL,
  -- [뜻/역할] 카드에 바로 보이는 한 줄 소개(1~100자)예요.
  -- [문법] TEXT NOT NULL
  -- [작성 이유] 목록에서 어떤 작품인지 한눈에 알 수 있게 하는 필수 설명이에요.
  summary    TEXT NOT NULL,
  -- [뜻/역할] 상세 페이지에 나오는 '만든 이야기'(최대 2000자)예요.
  -- [문법] TEXT DEFAULT ''
  -- [작성 이유] 선택 입력 항목이라 안 적으면 빈 글자가 들어가요.
  detail     TEXT DEFAULT '',
  -- [뜻/역할] 친구들이 눌러서 바로 체험해 볼 수 있는 배포 웹사이트 주소(http/https)예요.
  -- [문법] TEXT NOT NULL
  -- [작성 이유] PART는 실제 동작하는 작품을 체험하는 전시관이므로 체험 주소는 필수예요.
  url        TEXT NOT NULL,
  -- [뜻/역할] 소스 코드가 있는 GitHub 저장소 주소(선택)예요.
  -- [문법] TEXT DEFAULT ''
  -- [작성 이유] 코드를 공개하고 싶은 학생만 적을 수 있도록 기본값을 빈 글자로 두었어요.
  github     TEXT DEFAULT '',
  -- [뜻/역할] 작품을 만들 때 쓴 기술 태그들을 쉼표로 이어 붙인 글자예요(예: "HTML,CSS,JS").
  -- [문법] TEXT DEFAULT ''
  -- [작성 이유] 태그가 최대 8개뿐이라 별도 테이블로 쪼개는 것보다 쉼표 문자열로 저장하는 게 훨씬 단순하고 빨라요.
  tags       TEXT DEFAULT '',
  -- [뜻/역할] 전시관에 공개할지(1) 나만 볼 비공개로 둘지(0) 표시하는 숫자예요.
  -- [문법] INTEGER DEFAULT 1 — SQLite에는 참/거짓(Boolean) 자료형이 따로 없어서 1(참)과 0(거짓) 정수를 써요.
  -- [작성 이유] 아직 완성 전인 작품을 임시로 걸어 두고 혼자 확인하고 싶을 때 비공개(0) 기능을 쓰기 위해서예요.
  is_public  INTEGER DEFAULT 1,
  -- [뜻/역할] 작품이 등록된 날짜와 시각(UTC 기준)이에요.
  -- [문법] TEXT DEFAULT CURRENT_TIMESTAMP — 데이터를 넣을 때 자동으로 현재 시각('YYYY-MM-DD HH:MM:SS')이 찍혀요.
  -- [작성 이유] 하루 안에 올라온 작품에 'New' 배지를 달아 주기 위해서예요.
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- [뜻/역할] 각 작품에 첨부된 사진 파일 이름들을 담는 images 표를 만들어요.
-- [문법] CREATE TABLE IF NOT EXISTS images (...);
-- [작성 이유] 작품 하나에 사진을 최대 5장까지 올릴 수 있으므로(1:N 관계), 별도 표로 분리해서 저장해요.
CREATE TABLE IF NOT EXISTS images (
  -- [뜻/역할] 사진 행마다 매겨지는 고유 번호예요.
  -- [문법] INTEGER PRIMARY KEY
  -- [작성 이유] 사진이 올라간 순서대로 정렬하거나 구분할 때 써요.
  id         INTEGER PRIMARY KEY,
  -- [뜻/역할] 어느 작품의 사진인지 projects 표의 id를 가리켜요. 작품이 지워지면 이 사진 기록도 같이 지워져요.
  -- [문법] INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE
  -- [작성 이유] 작품이 삭제되었을 때 DB에 쓸모없는 사진 기록이 남지 않게 해요.
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- [뜻/역할] data/uploads/ 폴더 안에 실제로 저장된 파일 이름(예: 17100000-abc.jpg)이에요.
  -- [문법] TEXT NOT NULL
  -- [작성 이유] 사진 원본은 폴더에 파일로 두고, DB에는 파일 이름만 적어 두어야 DB가 무거워지지 않아요.
  file       TEXT NOT NULL
);

-- [뜻/역할] 누가 어느 작품에 ▲ 응원을 눌렀는지 기록하는 likes 표를 만들어요.
-- [문법] CREATE TABLE IF NOT EXISTS likes (...);
-- [작성 이유] 한 사람이 한 작품에 응원을 한 번만 누를 수 있게 하고, 총 응원 수를 세기 위해서예요.
CREATE TABLE IF NOT EXISTS likes (
  -- [뜻/역할] 응원을 누른 회원의 번호예요. 회원이 탈퇴하면 응원 기록도 자동으로 사라져요.
  -- [문법] INTEGER REFERENCES users(id) ON DELETE CASCADE
  -- [작성 이유] 로그인한 회원만 응원을 누를 수 있도록 users 표와 연결했어요.
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  -- [뜻/역할] 응원을 받은 작품의 번호예요. 작품이 삭제되면 응원 기록도 자동으로 사라져요.
  -- [문법] INTEGER REFERENCES projects(id) ON DELETE CASCADE
  -- [작성 이유] 작품별 응원 개수를 빠르게 세기 위해서예요.
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  -- [뜻/역할] (회원 번호, 작품 번호) 두 개를 묶어서 기본키(복합키)로 지정해요.
  -- [문법] PRIMARY KEY (user_id, project_id)
  -- [작성 이유] 똑같은 사람이 똑같은 작품에 두 번 INSERT 하려고 하면 DB가 막아 주므로 '1인 1회 응원'이 완벽히 보장돼요!
  PRIMARY KEY (user_id, project_id)
);

-- [뜻/역할] 작품 상세 페이지 하단의 한 줄 감상(방명록)을 담는 comments 표를 만들어요.
-- [문법] CREATE TABLE IF NOT EXISTS comments (...);
-- [작성 이유] 로그인하지 않은 친구들도 부담 없이 응원의 한마디를 남길 수 있게 하기 위해서예요.
CREATE TABLE IF NOT EXISTS comments (
  -- [뜻/역할] 감상마다 매겨지는 고유 번호예요.
  -- [문법] INTEGER PRIMARY KEY
  -- [작성 이유] 작품 주인이 특정 감상을 골라 삭제할 때(:cid) 이 번호로 찾아서 지워요.
  id         INTEGER PRIMARY KEY,
  -- [뜻/역할] 어느 작품에 달린 감상인지 가리켜요. 작품이 지워지면 감상도 모두 함께 지워져요.
  -- [문법] INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE
  -- [작성 이유] 작품과 방명록의 생명주기를 일치시키기 위해서예요.
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- [뜻/역할] 감상을 남긴 사람의 이름(최대 12자, 안 적으면 '익명')이에요.
  -- [문법] TEXT NOT NULL
  -- [작성 이유] 비회원도 작성할 수 있어서 users 테이블과 연결하지 않고 글자로 이름을 바로 적어요.
  name       TEXT NOT NULL,
  -- [뜻/역할] 한 줄 감상 내용(1~80자)이에요.
  -- [문법] TEXT NOT NULL
  -- [작성 이유] 빈 감상은 남길 수 없으므로 NOT NULL이에요.
  text       TEXT NOT NULL,
  -- [뜻/역할] 감상을 남긴 사람의 인터넷 주소(IP)예요.
  -- [문법] TEXT DEFAULT ''
  -- [작성 이유] 로그인 없이 쓰다 보니 누군가 장난으로 도배하는 것을 막기 위해(같은 IP에서 1분에 5개 제한) 기록해요.
  ip         TEXT DEFAULT '',
  -- [뜻/역할] 감상을 남긴 시각이에요.
  -- [문법] TEXT DEFAULT CURRENT_TIMESTAMP
  -- [작성 이유] '최근 1분 안에 몇 개 썼는지' 계산할 때 이 시각을 기준으로 비교해요.
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
