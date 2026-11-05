// 작품 목록·상세·등록·수정·삭제 · ▲ 응원 · 한 줄 감상
import { Hono } from 'hono';
import CATS from '../../../shared/categories.json';
import { needLogin } from '../session.js';
import { bad, readJson, isHttp, split, clientIp } from '../util.js';

const projects = new Hono();

// ── 사진 (KV) ───────────────────────────────────────────
// 화면(edit.html)이 올리기 전에 사진을 줄여서 보낸다. 여기서는 종류·크기·장수만 확인
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 1.5 * 1024 * 1024;   // 줄인 사진 기준 1.5MB
const MAX_FILES = 5;

function pickImages(body) {
  const files = [].concat(body['images'] || []).filter((f) => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES) throw bad(`사진은 ${MAX_FILES}장까지예요`);
  for (const f of files) {
    if (!OK_TYPES.includes(f.type)) throw bad('jpg·png·webp 이미지만 올릴 수 있어요');
    if (f.size > MAX_BYTES) throw bad('사진이 너무 커요. 다시 골라 주세요');
  }
  return files;
}

async function saveImages(c, pid, files) {
  for (const f of files) {
    const key = crypto.randomUUID();
    await c.env.IMAGES.put(key, await f.arrayBuffer(), { metadata: { type: f.type } });
    await c.env.DB.prepare('INSERT INTO images (project_id, file) VALUES (?, ?)').bind(pid, key).run();
  }
}

async function deleteImages(c, pid) {
  const { results } = await c.env.DB.prepare('SELECT file FROM images WHERE project_id = ?').bind(pid).all();
  await Promise.all(results.map((i) => c.env.IMAGES.delete(i.file)));
  await c.env.DB.prepare('DELETE FROM images WHERE project_id = ?').bind(pid).run();
}

// ── 목록 · 상세 ─────────────────────────────────────────
// 작품마다 작성자·사진·응원 수·감상 수·내가 눌렀는지를 SQL 한 번에 붙인다
const SELECT_FULL = `
  SELECT p.*,
    u.nickname AS author,
    (SELECT group_concat(file, ',') FROM (SELECT file FROM images WHERE project_id = p.id ORDER BY id)) AS image_keys,
    (SELECT COUNT(*) FROM likes WHERE project_id = p.id) AS likes,
    (SELECT COUNT(*) FROM comments WHERE project_id = p.id) AS comments,
    EXISTS(SELECT 1 FROM likes WHERE project_id = p.id AND user_id = ?1) AS liked
  FROM projects p JOIN users u ON u.id = p.user_id`;

const shape = (p, uid) => {
  const { image_keys, ...rest } = p;
  return {
    ...rest,
    tags: split(p.tags),
    cats: split(p.cats),
    images: split(image_keys).map((k) => '/uploads/' + k),
    liked: !!p.liked,
    mine: p.user_id === uid,
  };
};

// GET /api/projects?q=&cat=&tag=&user=&sort=hot|new
projects.get('/', async (c) => {
  const uid = c.get('uid') || 0;
  const q = c.req.query('q') || '', cat = c.req.query('cat') || '', tag = c.req.query('tag') || '', user = c.req.query('user') || '';
  const hot = ['hot', 'popular'].includes(c.req.query('sort'));
  const { results } = await c.env.DB.prepare(`${SELECT_FULL}
    WHERE (p.is_public = 1 OR p.user_id = ?1)                                -- 공개 작품 + 내 비공개 작품
      AND (p.title LIKE ?2 OR p.summary LIKE ?2 OR p.tags LIKE ?2 OR p.maker LIKE ?2 OR p.target LIKE ?2)
      AND (?3 = '' OR ',' || p.cats || ',' LIKE '%,' || ?3 || ',%')          -- 분야: 쉼표로 감싸서 정확히 일치
      AND (?4 = '' OR ',' || p.tags || ',' LIKE '%,' || ?4 || ',%')
      AND (?5 = '' OR p.user_id = ?5)
    ORDER BY ${hot ? 'likes DESC,' : ''} p.id DESC`)
    .bind(uid, `%${q}%`, cat, tag, user).all();
  return c.json(results.map((p) => shape(p, uid)));
});

const findFull = (c, id) => c.env.DB.prepare(`${SELECT_FULL} WHERE p.id = ?2`).bind(c.get('uid') || 0, id).first();

projects.get('/:id', async (c) => {
  const p = await findFull(c, c.req.param('id'));
  if (!p || (!p.is_public && p.user_id !== c.get('uid'))) return c.json({ error: '없는 작품이에요' }, 404);
  return c.json(shape(p, c.get('uid')));
});

// ── 등록 · 수정 · 삭제 ──────────────────────────────────
// 폼 내용을 검사하고 저장할 값만 골라 돌려준다 (화면 검사는 우회할 수 있으니 여기가 진짜 문지기)
function readForm(body) {
  const s = (k) => (typeof body[k] === 'string' ? body[k] : '');
  const title = s('title').trim(), summary = s('summary').trim(), detail = s('detail'), url = s('url').trim(), github = s('github').trim();
  const maker = s('maker').trim(), target = s('target').trim();
  if (!title || title.length > 40) throw bad('제목은 1~40자예요');
  if (!summary || summary.length > 100) throw bad('한 줄 소개는 1~100자예요');
  if (maker.length > 30) throw bad('만든 사람은 30자까지예요');
  if (target.length > 50) throw bad('누구에게는 50자까지예요');
  if (detail.length > 2000) throw bad('만든 이야기는 2000자까지예요');
  if (!isHttp(url)) throw bad('체험 주소는 http(s)://로 시작해야 해요');
  if (github && !isHttp(github)) throw bad('GitHub 주소는 http(s)://로 시작해야 해요');
  const tags = [...new Set(s('tags').split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 8).join(',');
  const cats = [...new Set(s('cats').split(',').map((t) => t.trim()))].filter((t) => CATS.includes(t)).join(',');
  return [title, summary, detail, url, github, tags, cats, maker, target, s('is_public') === '0' ? 0 : 1];
}

projects.post('/', needLogin, async (c) => {
  const body = await c.req.parseBody({ all: true });
  const values = readForm(body);
  const files = pickImages(body);
  const { meta } = await c.env.DB.prepare(`INSERT INTO projects
    (title, summary, detail, url, github, tags, cats, maker, target, is_public, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...values, c.get('uid')).run();
  await saveImages(c, meta.last_row_id, files);
  return c.json({ id: meta.last_row_id });
});

// 내 작품인지 확인하는 검문소
async function mine(c, next) {
  const p = await c.env.DB.prepare('SELECT user_id FROM projects WHERE id = ?').bind(c.req.param('id')).first();
  if (!p) return c.json({ error: '없는 작품이에요' }, 404);
  if (p.user_id !== c.get('uid')) return c.json({ error: '내 작품만 고칠 수 있어요' }, 403);
  await next();
}

projects.put('/:id', needLogin, mine, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.parseBody({ all: true });
  const values = readForm(body);
  const files = pickImages(body);
  await c.env.DB.prepare(`UPDATE projects SET
    title = ?, summary = ?, detail = ?, url = ?, github = ?, tags = ?, cats = ?, maker = ?, target = ?, is_public = ?
    WHERE id = ?`).bind(...values, id).run();
  if (files.length) {                 // 새 사진을 올리면 기존 사진을 교체
    await deleteImages(c, id);
    await saveImages(c, id, files);
  }
  return c.json({ id });
});

projects.delete('/:id', needLogin, mine, async (c) => {
  const id = c.req.param('id');
  await deleteImages(c, id);
  await c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();   // 응원·감상은 CASCADE로 같이 삭제
  return c.json({ ok: true });
});

// ── ▲ 응원: 누르면 켜지고, 다시 누르면 꺼진다 (1인 1회) ──
projects.post('/:id/like', needLogin, async (c) => {
  const id = c.req.param('id');
  const uid = c.get('uid');
  if (!(await c.env.DB.prepare('SELECT 1 FROM projects WHERE id = ?').bind(id).first())) return c.json({ error: '없는 작품이에요' }, 404);
  const { meta } = await c.env.DB.prepare('DELETE FROM likes WHERE user_id = ? AND project_id = ?').bind(uid, id).run();
  const removed = meta.changes > 0;   // 지운 게 있으면 = 원래 눌려 있었음 → 끄기
  if (!removed) await c.env.DB.prepare('INSERT INTO likes (user_id, project_id) VALUES (?, ?)').bind(uid, id).run();
  const { n } = await c.env.DB.prepare('SELECT COUNT(*) n FROM likes WHERE project_id = ?').bind(id).first();
  return c.json({ liked: !removed, likes: n });
});

// ── 💬 한 줄 감상: 로그인 없이 누구나. 같은 IP는 1분에 5개까지 ──
async function visible(c) {
  const p = await c.env.DB.prepare('SELECT id, user_id, is_public FROM projects WHERE id = ?').bind(c.req.param('id')).first();
  return p && (p.is_public || p.user_id === c.get('uid')) ? p : null;
}

projects.get('/:id/comments', async (c) => {
  const p = await visible(c);
  if (!p) return c.json({ error: '없는 작품이에요' }, 404);
  const { results } = await c.env.DB.prepare('SELECT id, name, text, created_at FROM comments WHERE project_id = ? ORDER BY id DESC').bind(p.id).all();
  return c.json(results.map((g) => ({ ...g, canDelete: p.user_id === c.get('uid') })));
});

projects.post('/:id/comments', async (c) => {
  const p = await visible(c);
  if (!p) return c.json({ error: '없는 작품이에요' }, 404);
  const body = await readJson(c);
  const name = String(body.name || '').trim() || '익명';
  const text = String(body.text || '').trim();
  if (name.length > 12) throw bad('이름은 12자까지예요');
  if (!text || text.length > 80) throw bad('감상은 1~80자예요');
  const ip = clientIp(c);
  const { n } = await c.env.DB.prepare("SELECT COUNT(*) n FROM comments WHERE ip = ? AND created_at > datetime('now', '-1 minute')").bind(ip).first();
  if (n >= 5) throw bad('조금 있다가 다시 남겨 주세요', 429);
  const { meta } = await c.env.DB.prepare('INSERT INTO comments (project_id, name, text, ip) VALUES (?, ?, ?, ?)').bind(p.id, name, text, ip).run();
  return c.json({ id: meta.last_row_id });
});

// 작품 주인만 감상을 지울 수 있다
projects.delete('/:id/comments/:cid', needLogin, mine, async (c) => {
  await c.env.DB.prepare('DELETE FROM comments WHERE id = ? AND project_id = ?').bind(c.req.param('cid'), c.req.param('id')).run();
  return c.json({ ok: true });
});

export default projects;
