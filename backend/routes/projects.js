const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { UPLOAD_DIR } = require('../config');
const CATS = require('../../shared/categories');
const { needLogin } = require('./auth');

const OK_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + OK_TYPES[file.mimetype]),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => cb(OK_TYPES[file.mimetype] ? null : new Error('jpg·png·webp 이미지만 올릴 수 있어요'), true),
});

const isHttp = (u) => /^https?:\/\/\S+$/.test(u);
const split = (v) => (v ? v.split(',') : []);

// 목록·상세에 공통으로 붙는 정보(작성자, 이미지, 좋아요 수, 내가 눌렀는지)
function decorate(p, uid) {
  return {
    ...p,
    tags: split(p.tags),
    cats: split(p.cats),
    author: db.prepare('SELECT nickname FROM users WHERE id = ?').get(p.user_id).nickname,
    images: db.prepare('SELECT file FROM images WHERE project_id = ?').all(p.id).map((i) => '/uploads/' + i.file),
    likes: db.prepare('SELECT COUNT(*) n FROM likes WHERE project_id = ?').get(p.id).n,
    liked: !!db.prepare('SELECT 1 FROM likes WHERE project_id = ? AND user_id = ?').get(p.id, uid),
    comments: db.prepare('SELECT COUNT(*) n FROM comments WHERE project_id = ?').get(p.id).n,
    mine: p.user_id === uid,
  };
}

// 검색 · 태그 · 작성자 · 내 프로젝트 · 정렬
router.get('/', (req, res) => {
  const { q = '', tag = '', cat = '', user = '', sort = 'new' } = req.query;
  const uid = req.session.uid;
  const rows = db.prepare(`
    SELECT p.* FROM projects p
    WHERE (p.is_public = 1 OR p.user_id = @uid)
      AND (p.title LIKE @q OR p.summary LIKE @q OR p.tags LIKE @q OR p.maker LIKE @q OR p.target LIKE @q)
      AND (@cat = '' OR ',' || p.cats || ',' LIKE '%,' || @cat || ',%')
      AND (@tag = '' OR ',' || p.tags || ',' LIKE '%,' || @tag || ',%')
      AND (@user = '' OR p.user_id = @user)
    ORDER BY ${(sort === 'popular' || sort === 'hot') ? '(SELECT COUNT(*) FROM likes WHERE project_id = p.id) DESC,' : ''} p.id DESC
  `).all({ uid: uid || 0, q: `%${q}%`, tag, cat, user });
  res.json(rows.map((p) => decorate(p, uid)));
});

router.get('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!p || (!p.is_public && p.user_id !== req.session.uid)) return res.status(404).json({ error: '없는 작품이에요' });
  res.json(decorate(p, req.session.uid));
});

// 폼 내용 검사 후 저장할 값만 골라 돌려준다
function readForm(body) {
  const { title = '', summary = '', detail = '', url = '', github = '', tags = '', cats = '', maker = '', target = '', is_public = '1' } = body;
  if (!title.trim() || title.length > 40) throw new Error('제목은 1~40자예요');
  if (!summary.trim() || summary.length > 100) throw new Error('한 줄 소개는 1~100자예요');
  if (maker.length > 30) throw new Error('만든 사람은 30자까지예요');
  if (target.length > 50) throw new Error('누구에게는 50자까지예요');
  if (detail.length > 2000) throw new Error('만든 이야기는 2000자까지예요');
  if (!isHttp(url)) throw new Error('배포 주소는 http(s)://로 시작해야 해요');
  if (github && !isHttp(github)) throw new Error('GitHub 주소는 http(s)://로 시작해야 해요');
  const cleanTags = [...new Set(tags.split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 8).join(',');
  const cleanCats = [...new Set(cats.split(',').map((t) => t.trim()))].filter((c) => CATS.includes(c)).join(',');
  return { title: title.trim(), summary: summary.trim(), detail, url, github, tags: cleanTags, cats: cleanCats, maker: maker.trim(), target: target.trim(), is_public: is_public === '0' ? 0 : 1 };
}

const addImages = (pid, files) =>
  files.forEach((f) => db.prepare('INSERT INTO images (project_id, file) VALUES (?, ?)').run(pid, f.filename));

router.post('/', needLogin, upload.array('images', 5), (req, res) => {
  const f = readForm(req.body);
  const id = db.prepare(`INSERT INTO projects (user_id, title, summary, detail, url, github, tags, cats, maker, target, is_public)
    VALUES (@uid, @title, @summary, @detail, @url, @github, @tags, @cats, @maker, @target, @is_public)`).run({ uid: req.session.uid, ...f }).lastInsertRowid;
  addImages(id, req.files);
  res.json({ id });
});

// 내 작품인지 확인하는 공통 처리
function mine(req, res, next) {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: '없는 작품이에요' });
  if (p.user_id !== req.session.uid) return res.status(403).json({ error: '내 작품만 고칠 수 있어요' });
  next();
}

router.put('/:id', needLogin, mine, upload.array('images', 5), (req, res) => {
  const f = readForm(req.body);
  db.prepare(`UPDATE projects SET title=@title, summary=@summary, detail=@detail, url=@url, github=@github, tags=@tags, cats=@cats, maker=@maker, target=@target, is_public=@is_public
    WHERE id=@id`).run({ id: req.params.id, ...f });
  if (req.files.length) {            // 새 이미지를 올리면 기존 이미지를 교체
    db.prepare('SELECT file FROM images WHERE project_id = ?').all(req.params.id).forEach((i) => fs.rmSync(path.join(UPLOAD_DIR, i.file), { force: true }));
    db.prepare('DELETE FROM images WHERE project_id = ?').run(req.params.id);
    addImages(req.params.id, req.files);
  }
  res.json({ id: +req.params.id });
});

router.delete('/:id', needLogin, mine, (req, res) => {
  db.prepare('SELECT file FROM images WHERE project_id = ?').all(req.params.id).forEach((i) => fs.rmSync(path.join(UPLOAD_DIR, i.file), { force: true }));
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// 좋아요: 누르면 켜지고, 다시 누르면 꺼진다 (1인 1회)
router.post('/:id/like', needLogin, (req, res) => {
  const args = [req.session.uid, req.params.id];
  const done = db.prepare('DELETE FROM likes WHERE user_id = ? AND project_id = ?').run(...args).changes;
  if (!done) db.prepare('INSERT INTO likes (user_id, project_id) VALUES (?, ?)').run(...args);
  res.json({ liked: !done, likes: db.prepare('SELECT COUNT(*) n FROM likes WHERE project_id = ?').get(req.params.id).n });
});

// 한 줄 감상: 로그인 없이 누구나 남길 수 있다. 같은 IP는 1분에 5개까지.
const visible = (req) => {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  return p && (p.is_public || p.user_id === req.session.uid) ? p : null;
};

router.get('/:id/comments', (req, res) => {
  const p = visible(req);
  if (!p) return res.status(404).json({ error: '없는 작품이에요' });
  const rows = db.prepare('SELECT id, name, text, created_at FROM comments WHERE project_id = ? ORDER BY id DESC').all(p.id);
  res.json(rows.map((c) => ({ ...c, canDelete: p.user_id === req.session.uid })));
});

router.post('/:id/comments', (req, res) => {
  const p = visible(req);
  if (!p) return res.status(404).json({ error: '없는 작품이에요' });
  const name = String(req.body.name || '').trim() || '익명';
  const text = String(req.body.text || '').trim();
  if (name.length > 12) return res.status(400).json({ error: '이름은 12자까지예요' });
  if (!text || text.length > 80) return res.status(400).json({ error: '감상은 1~80자예요' });
  const recent = db.prepare("SELECT COUNT(*) n FROM comments WHERE ip = ? AND created_at > datetime('now', '-1 minute')").get(req.ip).n;
  if (recent >= 5) return res.status(429).json({ error: '조금 있다가 다시 남겨 주세요' });
  const id = db.prepare('INSERT INTO comments (project_id, name, text, ip) VALUES (?, ?, ?, ?)').run(p.id, name, text, req.ip).lastInsertRowid;
  res.json({ id });
});

// 작품 주인만 감상을 지울 수 있다
router.delete('/:id/comments/:cid', needLogin, mine, (req, res) => {
  db.prepare('DELETE FROM comments WHERE id = ? AND project_id = ?').run(req.params.cid, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
