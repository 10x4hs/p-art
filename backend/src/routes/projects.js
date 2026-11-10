// [파일 개요] 작품 API예요 — 목록·상세, 등록·수정·삭제, ▲ 응원, 💬 한 줄 감상. index.js가 /api/projects 아래에 붙여요.
import { Hono } from 'hono';
import CATS from '../../../shared/categories.json';
import { needLogin } from '../session.js';
import { bad, readJson, isHttp, split, clientIp } from '../util.js';

const projects = new Hono();

// ── 사진 (R2) ───────────────────────────────────────────
// 화면이 미리 줄여서 보내지만, 서버도 종류·크기(1.5MB)·장수(5장)를 다시 확인해요.
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILES = 5;

function pickImages(body) {
  // 파일이 1개면 값, 여러 개면 배열로 와서 concat으로 항상 배열로 맞춰요.
  const files = [].concat(body['images'] || []).filter((f) => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES) throw bad(`사진은 ${MAX_FILES}장까지예요`);
  for (const f of files) {
    if (!OK_TYPES.includes(f.type)) throw bad('jpg·png·webp 이미지만 올릴 수 있어요');
    if (f.size > 1.5 * 1024 * 1024) throw bad('사진이 너무 커요. 다시 골라 주세요');
  }
  return files;
}

// 무작위 키로 R2에 넣고(주소를 짐작할 수 없게), 어느 작품 사진인지 images 표에 적어요.
async function saveImages(c, pid, files) {
  for (const f of files) {
    const key = crypto.randomUUID();
    await c.env.IMAGES.put(key, await f.arrayBuffer(), { httpMetadata: { contentType: f.type } });
    await c.env.DB.prepare('INSERT INTO images (project_id, file) VALUES (?, ?)').bind(pid, key).run();
  }
}

// R2는 CASCADE가 닿지 않아서 직접 지워요.
async function deleteImages(c, pid) {
  const { results } = await c.env.DB.prepare('SELECT file FROM images WHERE project_id = ?').bind(pid).all();
  if (results.length) await c.env.IMAGES.delete(results.map((i) => i.file));
  await c.env.DB.prepare('DELETE FROM images WHERE project_id = ?').bind(pid).run();
}

// ── 목록 · 상세 ─────────────────────────────────────────
// 작성자·사진 키·응원 수·감상 수·내 응원 여부를 한 번에 붙여 와요. ?1 = 내 번호.
const SELECT_FULL = `
  SELECT p.*,
    u.nickname AS author,
    (SELECT group_concat(file, ',') FROM (SELECT file FROM images WHERE project_id = p.id ORDER BY id)) AS image_keys,
    (SELECT COUNT(*) FROM likes WHERE project_id = p.id) AS likes,
    (SELECT COUNT(*) FROM comments WHERE project_id = p.id) AS comments,
    EXISTS(SELECT 1 FROM likes WHERE project_id = p.id AND user_id = ?1) AS liked
  FROM projects p JOIN users u ON u.id = p.user_id`;

// DB 한 줄을 화면용 모양으로: 쉼표 글자 → 배열, 사진 키 → 주소, liked → true/false, mine 추가.
const shape = ({ image_keys, ...p }, uid) => ({
  ...p,
  tags: split(p.tags),
  cats: split(p.cats),
  images: split(image_keys).map((k) => '/uploads/' + k),
  liked: !!p.liked,
  mine: p.user_id === uid,
});

// GET /api/projects?q=&cat=&tag=&user=&sort=hot|new  (로그인 안 했으면 uid 0 = 아무도 아님)
projects.get('/', async (c) => {
  const uid = c.get('uid') || 0;
  const qs = (k) => c.req.query(k) || '';
  const hot = ['hot', 'popular'].includes(qs('sort'));
  // 입력은 전부 bind로만 넘겨요. 분야·태그는 앞뒤에 쉼표를 붙여 '게임'이 '게임개발'과 섞이지 않게 해요.
  const { results } = await c.env.DB.prepare(`${SELECT_FULL}
    WHERE (p.is_public = 1 OR p.user_id = ?1)                                -- 공개 작품 + 내 비공개 작품
      AND (p.title LIKE ?2 OR p.summary LIKE ?2 OR p.tags LIKE ?2 OR p.maker LIKE ?2 OR p.target LIKE ?2)
      AND (?3 = '' OR ',' || p.cats || ',' LIKE '%,' || ?3 || ',%')          -- 분야: 쉼표로 감싸서 정확히 일치
      AND (?4 = '' OR ',' || p.tags || ',' LIKE '%,' || ?4 || ',%')
      AND (?5 = '' OR p.user_id = ?5)
    ORDER BY ${hot ? 'likes DESC,' : ''} p.id DESC`)
    .bind(uid, `%${qs('q')}%`, qs('cat'), qs('tag'), qs('user')).all();
  return c.json(results.map((p) => shape(p, uid)));
});

// 비공개 작품은 주인 말고는 404로 답해서 있다는 사실도 숨겨요.
projects.get('/:id', async (c) => {
  const p = await c.env.DB.prepare(`${SELECT_FULL} WHERE p.id = ?2`).bind(c.get('uid') || 0, c.req.param('id')).first();
  if (!p || (!p.is_public && p.user_id !== c.get('uid'))) return c.json({ error: '없는 작품이에요' }, 404);
  return c.json(shape(p, c.get('uid')));
});

// ── 등록 · 수정 · 삭제 ──────────────────────────────────
// 폼을 검사해서 SQL ? 순서대로 값 10개를 돌려줘요. 화면 검사는 우회할 수 있어서 여기가 진짜 문지기예요.
function readForm(body) {
  const s = (k) => (typeof body[k] === 'string' ? body[k] : '');   // 파일이거나 없으면 ''
  const title = s('title').trim(), summary = s('summary').trim(), detail = s('detail'), url = s('url').trim(), github = s('github').trim();
  const maker = s('maker').trim(), target = s('target').trim();
  if (!title || title.length > 40) throw bad('제목은 1~40자예요');
  if (!summary || summary.length > 100) throw bad('한 줄 소개는 1~100자예요');
  if (maker.length > 30) throw bad('만든 사람은 30자까지예요');
  if (target.length > 50) throw bad('누구에게는 50자까지예요');
  if (detail.length > 2000) throw bad('만든 이야기는 2000자까지예요');
  if (!isHttp(url)) throw bad('체험 주소는 http(s)://로 시작해야 해요');
  if (github && !isHttp(github)) throw bad('GitHub 주소는 http(s)://로 시작해야 해요');
  // 태그: 공백 제거·빈 칸 버림·중복 제거·최대 8개. 분야: categories.json에 있는 것만 남겨요.
  const tags = [...new Set(s('tags').split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 8).join(',');
  const cats = [...new Set(s('cats').split(',').map((t) => t.trim()))].filter((t) => CATS.includes(t)).join(',');
  return [title, summary, detail, url, github, tags, cats, maker, target, s('is_public') === '0' ? 0 : 1];
}

// parseBody({ all: true })는 같은 이름(images)의 파일 여러 개를 배열로 모아 줘요.
async function readUpload(c) {
  const body = await c.req.parseBody({ all: true });
  return [readForm(body), pickImages(body)];
}

projects.post('/', needLogin, async (c) => {
  const [values, files] = await readUpload(c);
  const { meta } = await c.env.DB.prepare(`INSERT INTO projects
    (title, summary, detail, url, github, tags, cats, maker, target, is_public, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...values, c.get('uid')).run();
  await saveImages(c, meta.last_row_id, files);
  return c.json({ id: meta.last_row_id });
});

// 내 작품인지 확인하는 검문소: 없으면 404, 남의 것이면 403.
async function mine(c, next) {
  const p = await c.env.DB.prepare('SELECT user_id FROM projects WHERE id = ?').bind(c.req.param('id')).first();
  if (!p) return c.json({ error: '없는 작품이에요' }, 404);
  if (p.user_id !== c.get('uid')) return c.json({ error: '내 작품만 고칠 수 있어요' }, 403);
  await next();
}

projects.put('/:id', needLogin, mine, async (c) => {
  const id = Number(c.req.param('id'));
  const [values, files] = await readUpload(c);
  await c.env.DB.prepare(`UPDATE projects SET
    title = ?, summary = ?, detail = ?, url = ?, github = ?, tags = ?, cats = ?, maker = ?, target = ?, is_public = ?
    WHERE id = ?`).bind(...values, id).run();
  if (files.length) {                 // 새 사진을 올렸을 때만 기존 사진을 교체
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
  const id = c.req.param('id'), uid = c.get('uid');
  if (!(await c.env.DB.prepare('SELECT 1 FROM projects WHERE id = ?').bind(id).first())) return c.json({ error: '없는 작품이에요' }, 404);
  // 먼저 지워 보고, 지운 게 있으면 원래 켜져 있던 것 → 끄기. 없으면 새로 켜요.
  const { meta } = await c.env.DB.prepare('DELETE FROM likes WHERE user_id = ? AND project_id = ?').bind(uid, id).run();
  const removed = meta.changes > 0;
  if (!removed) await c.env.DB.prepare('INSERT INTO likes (user_id, project_id) VALUES (?, ?)').bind(uid, id).run();
  const { n } = await c.env.DB.prepare('SELECT COUNT(*) n FROM likes WHERE project_id = ?').bind(id).first();
  return c.json({ liked: !removed, likes: n });
});

// ── 💬 한 줄 감상: 로그인 없이 누구나. 같은 IP는 1분에 5개까지 ──
// 지금 사람이 볼 수 있는 작품이면 돌려주고, 아니면 null(비공개는 주인만).
async function visible(c) {
  const p = await c.env.DB.prepare('SELECT id, user_id, is_public FROM projects WHERE id = ?').bind(c.req.param('id')).first();
  return p && (p.is_public || p.user_id === c.get('uid')) ? p : null;
}

// canDelete로 주인 화면에만 삭제 버튼을 보여요. ip는 개인정보라 보내지 않아요.
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

// project_id도 함께 확인해서, 내 작품 주소로 남의 감상을 지우는 꼼수를 막아요.
projects.delete('/:id/comments/:cid', needLogin, mine, async (c) => {
  await c.env.DB.prepare('DELETE FROM comments WHERE id = ? AND project_id = ?').bind(c.req.param('cid'), c.req.param('id')).run();
  return c.json({ ok: true });
});

export default projects;
