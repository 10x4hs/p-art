const Database = require('better-sqlite3');
const db = new Database('part.db');
db.pragma('foreign_keys = ON');
// 예전 DB(아이디 로그인)라면 username 열을 email로 바꾼다 — 테이블을 만들기 전에 처리
const old = db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'username'").get();
if (old) db.exec('ALTER TABLE users RENAME COLUMN username TO email');
db.exec(require('fs').readFileSync(__dirname + '/schema.sql', 'utf8'));

// 예전 DB에 새 열이 없으면 추가한다 (디자인 반영: 만든 사람, 누구에게, 분류)
const cols = db.prepare('PRAGMA table_info(projects)').all().map((c) => c.name);
for (const [name, def] of [['maker', "TEXT DEFAULT ''"], ['target', "TEXT DEFAULT ''"], ['cats', "TEXT DEFAULT ''"]]) {
  if (!cols.includes(name)) db.exec(`ALTER TABLE projects ADD COLUMN ${name} ${def}`);
}
module.exports = db;
