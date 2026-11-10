// [파일 개요] 로그인 세션 저장소 — 세션을 메모리가 아닌 SQLite의 sessions 테이블에 저장해서, 서버를 껐다 켜도 로그인이 유지되게 해요.
// [비유] 손님에게 준 '번호표(쿠키)'의 실제 장부를 칠판(메모리 — 지워지기 쉬움)이 아니라 '금고 속 공책(SQLite DB)'에 적어 두는 장치예요.

// [뜻/역할] express-session 라이브러리를 불러와요. 여기서는 저장소의 기본 뼈대인 `session.Store` 클래스를 상속받기 위해 써요.
// [문법] const session = require('express-session');
// [작성 이유] express-session이 요구하는 표준 저장소 규격에 맞추기 위해서예요.
const session = require('express-session');

// [뜻/역할] db.js에서 이미 열려 있는 SQLite 데이터베이스 연결 객체를 가져와요.
// [문법] const db = require('./db');
// [작성 이유] 별도로 새 DB 파일을 만들지 않고 기존 `part.db` 파일 안에 `sessions` 표를 함께 넣어 관리하려고요.
const db = require('./db');

// [뜻/역할] 세션을 담을 `sessions` 표가 DB에 없으면 새로 만들어요.
// [문법] sid는 세션 고유 번호(기본키), data는 세션 내용(JSON 문자열), expires는 만료 시각(밀리초 숫자)이에요.
// [작성 이유] 로그인한 사용자의 세션 정보를 영구 파일에 기록해 둘 표가 필요하기 때문이에요.
db.exec('CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL)');

// [뜻/역할] 서버가 처음 켜질 때, 이미 유효기간(expires)이 현재 시각(`Date.now()`)보다 지난 옛날 세션들을 싹 지워요.
// [문법] db.prepare('DELETE ... WHERE expires <= ?').run(Date.now()); — `?` 자리에 현재 시각 숫자가 안전하게 들어가요.
// [작성 이유] 만료된 세션을 청소해 주지 않으면 sessions 표가 끝없이 커져서 DB 용량을 차지하기 때문이에요.
db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());

// [뜻/역할] `session.Store`를 물려받아(extends) SQLite로 동작하는 새 저장소 클래스 `SqliteStore`를 정의해요.
// [문법] class 자식클래스 extends 부모클래스 { ... } — 객체지향 상속 문법이에요.
// [작성 이유] express-session이 약속해 둔 4가지 필수 메서드(`get`, `set`, `destroy`, `touch`)를 우리 DB에 맞게 구현하기 위해서예요.
class SqliteStore extends session.Store {
  // [뜻/역할] 브라우저가 보낸 세션 번호(sid)로 DB에서 세션 내용을 찾아 돌려줘요.
  // [문법] get(sid, cb) — sid는 찾을 번호, cb는 결과를 넘겨줄 콜백 함수 `cb(에러, 결과)`예요.
  // [작성 이유] 손님이 요청을 보낼 때마다 "이 번호표 주인이 누구지?" 하고 장부에서 찾아보는 기능이에요.
  get(sid, cb) {
    // [뜻/역할] 세션 번호가 일치하고(`sid = ?`) 아직 만료 시각이 지나지 않은(`expires > ?`) 행의 데이터를 조회해요.
    // [문법] db.prepare(...).get(sid, Date.now());
    // [작성 이유] 기한이 지난 번호표는 DB에 남아 있더라도 무효로 처리해야 안전하기 때문이에요.
    const row = db.prepare('SELECT data FROM sessions WHERE sid = ? AND expires > ?').get(sid, Date.now());
    // [뜻/역할] 찾은 행이 있으면 JSON 글자를 객체로 풀어서(`JSON.parse`) 넘기고, 없으면 `null`을 넘겨요.
    // [문법] cb(null, 삼항연산자); — 첫 번째 인자 `null`은 "에러가 없다"는 뜻이에요.
    // [작성 이유] DB에는 글자로 저장되어 있으므로 자바스크립트 객체로 다시 바꿔 주어야 `req.session.uid`를 읽을 수 있어요.
    cb(null, row ? JSON.parse(row.data) : null);
  }

  // [뜻/역할] 새로운 세션을 저장하거나 기존 세션 내용을 업데이트해요.
  // [문법] set(sid, sess, cb) — sess는 저장할 세션 객체예요.
  // [작성 이유] 로그인에 성공했을 때 `req.session.uid = user.id`를 DB 장부에 적어 두기 위해서예요.
  set(sid, sess, cb) {
    // [뜻/역할] 세션 쿠키에 적힌 만료 시각을 밀리초 숫자로 계산해요. 만약 적혀 있지 않으면 현재 시각 + 하루(86,400,000ms)로 정해요.
    // [문법] sess.cookie?.expires — 옵셔널 체이닝(`?.`)으로 cookie가 없어도 에러가 나지 않게 해요.
    // [작성 이유] 언제까지 이 세션을 유효하게 볼지 숫자로 저장해 두어야 비교(`expires > ?`)가 빠르기 때문이에요.
    const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 86400000;
    // [뜻/역할] sessions 표에 세션 번호, JSON으로 바꾼 세션 내용, 만료 시각을 넣어요. 이미 같은 sid가 있으면 새 내용으로 덮어써요.
    // [문법] INSERT OR REPLACE INTO ... — 없으면 추가(INSERT), 기본키가 겹치면 교체(REPLACE)하는 SQLite 문법이에요.
    // [작성 이유] 첫 로그인(추가)과 정보 갱신(교체)을 쿼리 하나로 깔끔하게 처리하기 위해서예요.
    db.prepare('INSERT OR REPLACE INTO sessions (sid, data, expires) VALUES (?, ?, ?)').run(sid, JSON.stringify(sess), expires);
    // [뜻/역할] 저장이 끝났다고 콜백 함수를 불러 알려 줘요.
    // [문법] cb?.(null) — cb 함수가 전달되었을 때만 안전하게 호출해요.
    // [작성 이유] express-session이 저장이 완료된 것을 확인하고 응답을 마무리할 수 있게 해요.
    cb?.(null);
  }

  // [뜻/역할] 로그아웃하거나 회원 탈퇴할 때 DB에서 해당 세션을 완전히 지워요.
  // [문법] destroy(sid, cb)
  // [작성 이유] 로그아웃한 뒤에는 예전 쿠키 번호표를 들고 와도 더 이상 로그인 상태로 인정하지 않기 위해서예요.
  destroy(sid, cb) {
    // [뜻/역할] 해당 세션 번호(sid)를 가진 행을 sessions 표에서 삭제해요.
    // [문법] db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
    // [작성 이유] 서버 장부에서 기록을 지워 세션을 즉시 무효화해요.
    db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
    // [뜻/역할] 삭제 완료를 알려 줘요.
    // [문법] cb?.(null);
    // [작성 이유] `req.session.destroy(() => ...)`의 콜백이 이어서 실행되게 해요.
    cb?.(null);
  }

  // [뜻/역할] 사용자가 사이트를 계속 쓰는 동안 세션 만료 시각만 연장(갱신)할 때 불려요.
  // [문법] touch(sid, sess, cb)
  // [작성 이유] `server.js`에서 `rolling: true` 옵션을 켰기 때문에, 요청마다 express-session이 이 `touch`를 불러 기한을 늘려 줘요.
  touch(sid, sess, cb) {
    // [뜻/역할] 새로 늘어난 만료 시각이 담긴 `sess`를 그대로 덮어쓰기 위해 위에서 만든 `this.set`을 재사용해요.
    // [문법] this.set(sid, sess, cb);
    // [작성 이유] 똑같은 `INSERT OR REPLACE` 코드를 두 번 적지 않고 재사용(DRY 원칙)하기 위해서예요.
    this.set(sid, sess, cb);
  }
}

// [뜻/역할] 완성된 `SqliteStore` 클래스를 바깥으로 내보내요.
// [문법] module.exports = SqliteStore;
// [작성 이유] `server.js`에서 `new SqliteStore()`로 세션 미들웨어에 끼워 넣을 수 있게 해요.
module.exports = SqliteStore;
