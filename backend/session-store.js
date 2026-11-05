// 로그인 세션 저장소 — 세션을 SQLite의 sessions 테이블에 넣어서, 서버를 껐다 켜도 로그인이 유지되게 한다.
// express-session은 기본으로 "메모리"에 세션을 두는데, 그러면 서버가 꺼지는 순간 모두 로그아웃된다.
const session = require('express-session');   // 세션 라이브러리. 여기서는 Store(저장소의 기본 틀)만 빌려 쓴다
const db = require('./db');                     // 이미 열려 있는 SQLite 연결

// 세션을 담을 표가 없으면 만든다. sid = 세션 번호, data = 세션 내용(JSON 글자), expires = 끝나는 시각(밀리초)
db.exec('CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL)');
// 서버가 켜질 때 이미 기한이 지난 세션은 지워서 표가 끝없이 커지지 않게 한다
db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());

// express-session이 정해 둔 4가지 함수(get·set·destroy·touch)를 SQLite로 구현한다
class SqliteStore extends session.Store {
  // 세션 번호로 내용을 찾아 돌려준다. 기한이 지났으면 없는 것으로 친다
  get(sid, cb) {
    const row = db.prepare('SELECT data FROM sessions WHERE sid = ? AND expires > ?').get(sid, Date.now());
    cb(null, row ? JSON.parse(row.data) : null);   // cb(오류, 결과) — 오류가 없으니 첫 칸은 null
  }

  // 세션을 저장한다. 같은 번호가 있으면 덮어쓴다(INSERT OR REPLACE)
  set(sid, sess, cb) {
    const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 86400000;   // 쿠키 기한, 없으면 하루
    db.prepare('INSERT OR REPLACE INTO sessions (sid, data, expires) VALUES (?, ?, ?)').run(sid, JSON.stringify(sess), expires);
    cb?.(null);   // ?. : cb가 있을 때만 부른다
  }

  // 로그아웃할 때 세션을 지운다
  destroy(sid, cb) {
    db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
    cb?.(null);
  }

  // 사이트를 쓸 때마다 기한을 늘린다(rolling) — 저장과 같은 일
  touch(sid, sess, cb) {
    this.set(sid, sess, cb);
  }
}

module.exports = SqliteStore;   // server.js에서 new SqliteStore()로 쓴다
