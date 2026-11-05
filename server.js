const express = require('express');
const session = require('express-session');

const app = express();
app.use(express.json());
// 세션을 SQLite에 저장해서 서버를 껐다 켜도 로그인이 유지되게 한다
const db = require('./db');
db.exec('CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL)');
class SqliteStore extends session.Store {
  get(sid, cb) {
    const row = db.prepare('SELECT data FROM sessions WHERE sid = ? AND expires > ?').get(sid, Date.now());
    cb(null, row ? JSON.parse(row.data) : null);
  }
  set(sid, sess, cb) {
    const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 86400000;
    db.prepare('INSERT OR REPLACE INTO sessions (sid, data, expires) VALUES (?, ?, ?)').run(sid, JSON.stringify(sess), expires);
    cb?.(null);
  }
  destroy(sid, cb) { db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid); cb?.(null); }
  touch(sid, sess, cb) { this.set(sid, sess, cb); }
}
db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());   // 만료된 세션 정리

app.use(session({
  store: new SqliteStore(),
  secret: process.env.SECRET || 'part-dev',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' },   // 30일
}));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

app.use('/api', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));

// 처리되지 않은 오류는 JSON으로 돌려준다
app.use((err, req, res, next) => {
  (req.files || []).forEach((f) => require('fs').rmSync(f.path, { force: true }));   // 실패한 업로드는 지운다
  res.status(400).json({ error: err.message });
});

app.listen(3000, () => console.log('PART → http://localhost:3000'));
