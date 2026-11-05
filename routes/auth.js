const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');

const fail = (res, code, error) => res.status(code).json({ error });
const needLogin = (req, res, next) => (req.session.uid ? next() : fail(res, 401, '로그인이 필요해요'));
const me = (id) => db.prepare('SELECT id, email, nickname, bio FROM users WHERE id = ?').get(id);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanEmail = (e) => String(e || '').trim().toLowerCase();

router.post('/signup', (req, res) => {
  const email = cleanEmail(req.body.email);
  const { password = '' } = req.body;
  const nickname = String(req.body.nickname || '').trim();
  if (!EMAIL.test(email) || email.length > 100) return fail(res, 400, '이메일 주소를 확인해 주세요');
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) return fail(res, 400, '비밀번호는 8자 이상, 영문+숫자가 필요해요');
  if (nickname.length < 2 || nickname.length > 20) return fail(res, 400, '닉네임은 2~20자예요');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return fail(res, 409, '이미 가입한 이메일이에요');

  const hash = bcrypt.hashSync(password, 10);
  req.session.uid = db.prepare('INSERT INTO users (email, password, nickname) VALUES (?, ?, ?)')
    .run(email, hash, nickname).lastInsertRowid;
  res.json(me(req.session.uid));
});

router.post('/login', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail(req.body.email));
  if (!user || !bcrypt.compareSync(req.body.password || '', user.password)) return fail(res, 401, '이메일이나 비밀번호가 맞지 않아요');
  req.session.uid = user.id;
  res.json(me(user.id));
});

router.post('/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

router.get('/me', (req, res) => res.json(req.session.uid ? me(req.session.uid) : null));

router.put('/me', needLogin, (req, res) => {
  const nickname = String(req.body.nickname || '').trim();
  const bio = String(req.body.bio || '');
  if (!nickname || nickname.length < 2 || nickname.length > 20) return fail(res, 400, '닉네임은 2~20자예요');
  db.prepare('UPDATE users SET nickname = ?, bio = ? WHERE id = ?').run(nickname, bio.slice(0, 200), req.session.uid);
  res.json(me(req.session.uid));
});

router.delete('/me', needLogin, (req, res) => {
  // 내 작품의 사진 파일도 지운다 (DB 행은 ON DELETE CASCADE로 같이 지워짐)
  db.prepare('SELECT i.file FROM images i JOIN projects p ON p.id = i.project_id WHERE p.user_id = ?').all(req.session.uid)
    .forEach((i) => require('fs').rmSync(require('path').join('uploads', i.file), { force: true }));
  db.prepare('DELETE FROM users WHERE id = ?').run(req.session.uid);
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/users/:id', (req, res) => {
  const user = db.prepare('SELECT id, nickname, bio FROM users WHERE id = ?').get(req.params.id);
  user ? res.json(user) : fail(res, 404, '없는 사용자예요');
});

module.exports = router;
module.exports.needLogin = needLogin;
