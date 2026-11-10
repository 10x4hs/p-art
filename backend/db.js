// [파일 개요] SQLite 데이터베이스 연결 및 자동 초기화·업그레이드 담당 파일이에요.
// [비유] 식당의 '재료 창고 장부'를 여는 관리인이에요. 장부 파일이 없으면 새로 만들고, 옛날 양식이면 새 칸을 자동으로 그려 넣어요.

// [뜻/역할] SQLite 데이터베이스를 빠르고 간단한 동기(Synchronous) 함수로 다룰 수 있게 해 주는 라이브러리를 불러와요.
// [문법] const Database = require('better-sqlite3');
// [작성 이유] 일반 sqlite3보다 코드가 훨씬 짧고(async/await 불필요) 속도도 빨라서 학생 프로젝트와 중소규모 서버에 최적이에요.
const Database = require('better-sqlite3');

// [뜻/역할] config.js 설정 파일에서 데이터베이스 파일 경로(DB_FILE)만 쏙 꺼내 와요.
// [문법] const { DB_FILE } = require('./config'); — 객체 구조 분해 할당(Destructuring) 문법이에요.
// [작성 이유] 필요한 값만 이름으로 바로 꺼내 쓰면 코드가 깔끔해져요.
const { DB_FILE } = require('./config');

// [뜻/역할] 지정된 경로(data/part.db)에 있는 SQLite 파일을 열어서 데이터베이스 연결 객체(db)를 만들어요.
// [문법] new Database(파일경로) — 파일이 없으면 그 자리에 새 파일을 자동으로 만들어 줘요.
// [작성 이유] 이제부터 이 db 변수를 통해 모든 SQL 조회·저장·수정을 수행하기 위해서예요.
const db = new Database(DB_FILE);

// [뜻/역할] SQLite의 외래키(Foreign Key) 제약 조건 기능을 켜요.
// [문법] db.pragma('foreign_keys = ON'); — pragma는 SQLite의 동작 설정을 바꾸는 명령어예요.
// [작성 이유] SQLite는 기본적으로 외래키 기능이 꺼져 있어요. 이걸 켜야만 "회원이 탈퇴하면 그 회원의 작품도 자동 삭제(ON DELETE CASCADE)" 같은 규칙이 실제로 작동해요!
db.pragma('foreign_keys = ON');

// [뜻/역할] 옛날 버전 DB에서 users 테이블에 'username'이라는 열(컬럼)이 있는지 확인해요.
// [문법] db.prepare(SQL).get() — SQL 문을 준비해서 한 줄만 조회해요. 있으면 객체({ 1: 1 })를, 없으면 undefined를 돌려줘요.
// [작성 이유] 프로젝트 초기에 '아이디(username)'로 로그인하다가 '이메일(email)' 로그인으로 바뀌었는데, 기존 DB 파일을 지우지 않고도 호환되게 하려는 배려예요.
const old = db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'username'").get();

// [뜻/역할] 만약 옛날 DB라서 username 열이 있다면, 그 열 이름을 email로 바꿔요.
// [문법] if (old) db.exec('SQL문'); — db.exec()는 결과를 돌려받지 않는 SQL 명령을 바로 실행할 때 써요.
// [작성 이유] 아래에서 schema.sql을 실행하기 전에 열 이름을 미리 맞춰 두어야 충돌이 나지 않아요.
if (old) db.exec('ALTER TABLE users RENAME COLUMN username TO email');

// [뜻/역할] 같은 폴더에 있는 schema.sql 설계도 파일을 글자(utf8)로 읽어서 그 안의 CREATE TABLE 문들을 한 번에 실행해요.
// [문법] require('fs').readFileSync(경로, 'utf8')로 파일 내용을 읽고 db.exec()로 실행해요.
// [작성 이유] 테이블(users, projects, images, likes, comments)이 아직 없는 새 DB라면 이때 표들을 전부 만들어 주기 위해서예요.
db.exec(require('fs').readFileSync(__dirname + '/schema.sql', 'utf8'));

// [뜻/역할] 현재 projects 테이블에 있는 모든 열(컬럼)의 이름들을 배열로 뽑아내요.
// [문법] .all()은 모든 행을 배열로 가져오고, .map((c) => c.name)은 각 행 객체에서 이름(name) 속성만 추려 새 배열을 만들어요.
// [작성 이유] 나중에 추가된 열(maker, target, cats)이 기존 DB 파일에도 있는지 확인하기 위해서예요.
const cols = db.prepare('PRAGMA table_info(projects)').all().map((c) => c.name);

// [뜻/역할] 새로 필요한 세 가지 열(만든 사람 maker, 추천 대상 target, 분야 cats)을 하나씩 확인하면서 없으면 추가해요.
// [문법] for (const [name, def] of 배열) — 2차원 배열을 돌면서 첫 번째 값을 name에, 두 번째 값을 def에 나눠 담는 구조 분해 반복문이에요.
// [작성 이유] 팀원들이 옛날 part.db 파일을 가지고 있더라도 에러 없이 새 기능(만든 사람, 추천 대상, 분야)이 돌아가도록 자동 업그레이드(마이그레이션)해 주는 코드예요.
for (const [name, def] of [['maker', "TEXT DEFAULT ''"], ['target', "TEXT DEFAULT ''"], ['cats', "TEXT DEFAULT ''"]]) {
  // [뜻/역할] 현재 테이블 열 목록(cols)에 해당 열 이름(name)이 없을 때만 ALTER TABLE로 새 열을 붙여요.
  // [문법] !cols.includes(name) — 배열에 값이 포함되어 있지 않으면 true가 돼요. 백틱(`) 템플릿 리터럴로 SQL 문을 조립해요.
  // [작성 이유] 이미 있는 열을 또 추가하려고 하면 SQLite가 에러를 내기 때문에, 없는지 먼저 꼭 확인해야 해요.
  if (!cols.includes(name)) db.exec(`ALTER TABLE projects ADD COLUMN ${name} ${def}`);
}

// [뜻/역할] 준비와 업그레이드가 끝난 데이터베이스 연결 객체(db)를 다른 파일들이 쓸 수 있게 내보내요.
// [문법] module.exports = db;
// [작성 이유] session-store.js, auth.js, projects.js가 모두 이 하나의 db 연결을 공유해서 빠르고 일관되게 데이터를 다루기 위해서예요.
module.exports = db;
