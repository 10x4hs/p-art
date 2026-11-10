// PART — Cloudflare Workers 버전 서버.
// backend/(Express) 와 같은 API를 제공하지만, 저장소가 다르다:
//   SQLite 파일 → D1(env.DB),  사진 폴더 → R2(env.UPLOADS),  화면 파일 → Static Assets(env.ASSETS)
// /api/* 와 /uploads/* 만 이 코드로 오고, 나머지 주소는 Cloudflare가 public 폴더에서 바로 내려준다.

import CATS from '../shared/categories.js';   // 프론트와 같은 분야 목록 파일을 그대로 쓴다

const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const OK_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });

// ── 비밀번호: Workers에서 빠른 기본 내장 PBKDF2(SHA-256) ─────────────────────
const PBKDF2_ITER = 100000;
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));

async function pbkdf2(password, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITER}$${toHex(salt)}$${toHex(await pbkdf2(password, salt, PBKDF2_ITER))}`;
}
async function checkPassword(password, stored) {
  const [kind, iter, salt, hash] = String(stored).split('$');
  if (kind !== 'pbkdf2') return false;
  const got = new Uint8Array(await pbkdf2(password, fromHex(salt), Number(iter)));
  const want = fromHex(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

// ── 세션: 쿠키에는 무작위 세션 번호만, 누가 로그인했는지는 D1 sessions 표에 ──────
const readCookie = (req, name) =>
  (req.headers.get('Cookie') || '').split(/;\s*/).map((c) => c.split('=')).find(([k]) => k === name)?.[1];
const sessionCookie = (sid, maxAge) =>
  `sid=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

async function loadSession(ctx) {
  const sid = readCookie(ctx.req, 'sid');
  if (!sid) return;
  const row = await ctx.db.prepare('SELECT uid, expires FROM sessions WHERE sid = ? AND expires > ?').bind(sid, Date.now()).first();
  if (!row) return;
  ctx.sid = sid;
  ctx.uid = row.uid;
  // rolling: 하루 이상 지났으면 기한을 다시 30일로 늘린다 (매 요청마다 쓰지 않도록)
  if (row.expires - Date.now() < SESSION_MS - 86400000) {
    await ctx.db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?').bind(Date.now() + SESSION_MS, sid).run();
    ctx.setCookie = sessionCookie(sid, SESSION_MS / 1000);
  }
}
async function startSession(ctx, uid) {
  if (ctx.sid) await ctx.db.prepare('DELETE FROM sessions WHERE sid = ?').bind(ctx.sid).run();
  const sid = toHex(crypto.getRandomValues(new Uint8Array(32)));
  await ctx.db.prepare('INSERT INTO sessions (sid, uid, expires) VALUES (?, ?, ?)').bind(sid, uid, Date.now() + SESSION_MS).run();
  ctx.sid = sid;
  ctx.uid = uid;
  ctx.setCookie = sessionCookie(sid, SESSION_MS / 1000);
}
async function endSession(ctx) {
  if (ctx.sid) await ctx.db.prepare('DELETE FROM sessions WHERE sid = ?').bind(ctx.sid).run();
  ctx.sid = ctx.uid = undefined;
  ctx.setCookie = sessionCookie('', 0);
}
const needLogin = (ctx) => { if (!ctx.uid) fail(401, '로그인이 필요해요'); };

// ── 공통 도우미 ────────────────────────────────────────────────────────────
const me = (ctx, id) => ctx.db.prepare('SELECT id, email, nickname, bio FROM users WHERE id = ?').bind(id).first();
const cleanEmail = (e) => String(e || '').trim().toLowerCase();
const isHttp = (u) => /^https?:\/\/\S+$/.test(u);
const split = (v) => (v ? v.split(',') : []);

async function readJson(req) {
  if (!(req.headers.get('Content-Type') || '').includes('application/json')) return {};
  return req.json().catch(() => fail(400, '요청 형식이 올바르지 않아요'));
}

// 목록·상세에 공통으로 붙는 정보를 한 번의 SQL로 가져온다
const PROJECT_SELECT = `
  SELECT p.*, u.nickname AS author,
    (SELECT group_concat(file, '|') FROM (SELECT file FROM images WHERE project_id = p.id ORDER BY id)) AS image_files,
    (SELECT COUNT(*) FROM likes WHERE project_id = p.id) AS likes,
    EXISTS(SELECT 1 FROM likes WHERE project_id = p.id AND user_id = ?1) AS liked,
    (SELECT COUNT(*) FROM comments WHERE project_id = p.id) AS comments
  FROM projects p JOIN users u ON u.id = p.user_id`;

function decorate(p, uid) {
  const { image_files, ...rest } = p;
  return {
    ...rest,
    tags: split(p.tags),
    cats: split(p.cats),
    images: image_files ? image_files.split('|').map((f) => '/uploads/' + f) : [],
    liked: !!p.liked,
    mine: p.user_id === uid,
  };
}

function readForm(form) {
  const get = (k, d = '') => { const v = form.get(k); return typeof v === 'string' ? v : d; };
  const title = get('title'), summary = get('summary'), detail = get('detail'), url = get('url'), github = get('github');
  const tags = get('tags'), cats = get('cats'), maker = get('maker'), target = get('target'), isPublic = get('is_public', '1');
  if (!title.trim() || title.length > 40) fail(400, '제목은 1~40자예요');
  if (!summary.trim() || summary.length > 100) fail(400, '한 줄 소개는 1~100자예요');
  if (maker.length > 30) fail(400, '만든 사람은 30자까지예요');
  if (target.length > 50) fail(400, '누구에게는 50자까지예요');
  if (detail.length > 2000) fail(400, '만든 이야기는 2000자까지예요');
  if (!isHttp(url)) fail(400, '배포 주소는 http(s)://로 시작해야 해요');
  if (github && !isHttp(github)) fail(400, 'GitHub 주소는 http(s)://로 시작해야 해요');
  const cleanTags = [...new Set(tags.split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 8).join(',');
  const cleanCats = [...new Set(cats.split(',').map((t) => t.trim()))].filter((c) => CATS.includes(c)).join(',');
  return { title: title.trim(), summary: summary.trim(), detail, url, github, tags: cleanTags, cats: cleanCats, maker: maker.trim(), target: target.trim(), is_public: isPublic === '0' ? 0 : 1 };
}

function readImages(form) {
  const files = form.getAll('images').filter((f) => typeof f !== 'string' && f.size > 0);
  if (files.length > 5) fail(400, '사진은 5장까지 올릴 수 있어요');
  for (const f of files) {
    if (!OK_TYPES[f.type]) fail(400, 'jpg·png·webp 이미지만 올릴 수 있어요');
    if (f.size > 5 * 1024 * 1024) fail(400, '사진 한 장은 5MB까지예요');
  }
  return files;
}

async function saveImages(ctx, pid, files) {
  for (const f of files) {
    const name = Date.now() + '-' + Math.random().toString(36).slice(2) + OK_TYPES[f.type];
    await ctx.env.UPLOADS.put(name, f.stream(), { httpMetadata: { contentType: f.type } });
    await ctx.db.prepare('INSERT INTO images (project_id, file) VALUES (?, ?)').bind(pid, name).run();
  }
}
async function deleteImages(ctx, sql, ...args) {
  const { results } = await ctx.db.prepare(sql).bind(...args).all();
  if (results.length) await ctx.env.UPLOADS.delete(results.map((r) => r.file));
}

async function findProject(ctx, id) {
  return ctx.db.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
}
async function mine(ctx, id) {
  const p = await findProject(ctx, id);
  if (!p) fail(404, '없는 작품이에요');
  if (p.user_id !== ctx.uid) fail(403, '내 작품만 고칠 수 있어요');
  return p;
}
async function visible(ctx, id) {
  const p = await findProject(ctx, id);
  if (!p || !(p.is_public || p.user_id === ctx.uid)) fail(404, '없는 작품이에요');
  return p;
}

// ── 라우트 ─────────────────────────────────────────────────────────────────
const routes = [];
const on = (method, pattern, handler) => {
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$');
  routes.push({ method, re, handler });
};

on('GET', '/api/health', () => json({ ok: true }));

on('POST', '/api/signup', async (ctx) => {
  const body = await readJson(ctx.req);
  const email = cleanEmail(body.email);
  const password = String(body.password || '');
  const nickname = String(body.nickname || '').trim();
  if (!EMAIL.test(email) || email.length > 100) fail(400, '이메일 주소를 확인해 주세요');
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) fail(400, '비밀번호는 8자 이상, 영문+숫자가 필요해요');
  if (nickname.length < 2 || nickname.length > 20) fail(400, '닉네임은 2~20자예요');
  if (await ctx.db.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) fail(409, '이미 가입한 이메일이에요');
  const r = await ctx.db.prepare('INSERT INTO users (email, password, nickname) VALUES (?, ?, ?)')
    .bind(email, await hashPassword(password), nickname).run();
  await startSession(ctx, r.meta.last_row_id);
  return json(await me(ctx, ctx.uid));
});

on('POST', '/api/login', async (ctx) => {
  const body = await readJson(ctx.req);
  const user = await ctx.db.prepare('SELECT * FROM users WHERE email = ?').bind(cleanEmail(body.email)).first();
  if (!user || !(await checkPassword(String(body.password || ''), user.password))) fail(401, '이메일이나 비밀번호가 맞지 않아요');
  await startSession(ctx, user.id);
  return json(await me(ctx, user.id));
});

on('POST', '/api/logout', async (ctx) => { await endSession(ctx); return json({ ok: true }); });

on('GET', '/api/me', async (ctx) => json(ctx.uid ? await me(ctx, ctx.uid) : null));

on('PUT', '/api/me', async (ctx) => {
  needLogin(ctx);
  const body = await readJson(ctx.req);
  const nickname = String(body.nickname || '').trim();
  const bio = String(body.bio || '');
  if (nickname.length < 2 || nickname.length > 20) fail(400, '닉네임은 2~20자예요');
  await ctx.db.prepare('UPDATE users SET nickname = ?, bio = ? WHERE id = ?').bind(nickname, bio.slice(0, 200), ctx.uid).run();
  return json(await me(ctx, ctx.uid));
});

on('DELETE', '/api/me', async (ctx) => {
  needLogin(ctx);
  await deleteImages(ctx, 'SELECT i.file FROM images i JOIN projects p ON p.id = i.project_id WHERE p.user_id = ?', ctx.uid);
  await ctx.db.prepare('DELETE FROM users WHERE id = ?').bind(ctx.uid).run();   // 세션·작품·좋아요는 CASCADE로 같이 지워짐
  ctx.sid = undefined;
  ctx.setCookie = sessionCookie('', 0);
  return json({ ok: true });
});

on('GET', '/api/users/:id', async (ctx, { id }) => {
  const user = await ctx.db.prepare('SELECT id, nickname, bio FROM users WHERE id = ?').bind(id).first();
  return user ? json(user) : fail(404, '없는 사용자예요');
});

on('GET', '/api/projects', async (ctx) => {
  const q = ctx.url.searchParams;
  const sort = q.get('sort') || 'new';
  const order = sort === 'popular' || sort === 'hot' ? 'likes DESC, p.id DESC' : 'p.id DESC';
  const { results } = await ctx.db.prepare(`${PROJECT_SELECT}
    WHERE (p.is_public = 1 OR p.user_id = ?1)
      AND (p.title LIKE ?2 OR p.summary LIKE ?2 OR p.tags LIKE ?2 OR p.maker LIKE ?2 OR p.target LIKE ?2)
      AND (?3 = '' OR ',' || p.cats || ',' LIKE '%,' || ?3 || ',%')
      AND (?4 = '' OR ',' || p.tags || ',' LIKE '%,' || ?4 || ',%')
      AND (?5 = '' OR p.user_id = CAST(?5 AS INTEGER))
    ORDER BY ${order}`)
    .bind(ctx.uid || 0, `%${q.get('q') || ''}%`, q.get('cat') || '', q.get('tag') || '', q.get('user') || '').all();
  return json(results.map((p) => decorate(p, ctx.uid)));
});

on('GET', '/api/projects/:id', async (ctx, { id }) => {
  const p = await ctx.db.prepare(`${PROJECT_SELECT} WHERE p.id = ?2`).bind(ctx.uid || 0, id).first();
  if (!p || (!p.is_public && p.user_id !== ctx.uid)) fail(404, '없는 작품이에요');
  return json(decorate(p, ctx.uid));
});

on('POST', '/api/projects', async (ctx) => {
  needLogin(ctx);
  const form = await ctx.req.formData();
  const f = readForm(form);
  const files = readImages(form);
  const r = await ctx.db.prepare(`INSERT INTO projects (user_id, title, summary, detail, url, github, tags, cats, maker, target, is_public)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(ctx.uid, f.title, f.summary, f.detail, f.url, f.github, f.tags, f.cats, f.maker, f.target, f.is_public).run();
  const id = r.meta.last_row_id;
  await saveImages(ctx, id, files);
  return json({ id });
});

on('PUT', '/api/projects/:id', async (ctx, { id }) => {
  needLogin(ctx);
  await mine(ctx, id);
  const form = await ctx.req.formData();
  const f = readForm(form);
  const files = readImages(form);
  await ctx.db.prepare(`UPDATE projects SET title=?, summary=?, detail=?, url=?, github=?, tags=?, cats=?, maker=?, target=?, is_public=? WHERE id=?`)
    .bind(f.title, f.summary, f.detail, f.url, f.github, f.tags, f.cats, f.maker, f.target, f.is_public, id).run();
  if (files.length) {   // 새 이미지를 올리면 기존 이미지를 교체
    await deleteImages(ctx, 'SELECT file FROM images WHERE project_id = ?', id);
    await ctx.db.prepare('DELETE FROM images WHERE project_id = ?').bind(id).run();
    await saveImages(ctx, id, files);
  }
  return json({ id: +id });
});

on('DELETE', '/api/projects/:id', async (ctx, { id }) => {
  needLogin(ctx);
  await mine(ctx, id);
  await deleteImages(ctx, 'SELECT file FROM images WHERE project_id = ?', id);
  await ctx.db.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
  return json({ ok: true });
});

on('POST', '/api/projects/:id/like', async (ctx, { id }) => {
  needLogin(ctx);
  await visible(ctx, id);
  const done = (await ctx.db.prepare('DELETE FROM likes WHERE user_id = ? AND project_id = ?').bind(ctx.uid, id).run()).meta.changes;
  if (!done) await ctx.db.prepare('INSERT INTO likes (user_id, project_id) VALUES (?, ?)').bind(ctx.uid, id).run();
  const { n } = await ctx.db.prepare('SELECT COUNT(*) n FROM likes WHERE project_id = ?').bind(id).first();
  return json({ liked: !done, likes: n });
});

on('GET', '/api/projects/:id/comments', async (ctx, { id }) => {
  const p = await visible(ctx, id);
  const { results } = await ctx.db.prepare('SELECT id, name, text, created_at FROM comments WHERE project_id = ? ORDER BY id DESC').bind(p.id).all();
  return json(results.map((c) => ({ ...c, canDelete: p.user_id === ctx.uid })));
});

on('POST', '/api/projects/:id/comments', async (ctx, { id }) => {
  const p = await visible(ctx, id);
  const body = await readJson(ctx.req);
  const name = String(body.name || '').trim() || '익명';
  const text = String(body.text || '').trim();
  if (name.length > 12) fail(400, '이름은 12자까지예요');
  if (!text || text.length > 80) fail(400, '감상은 1~80자예요');
  const ip = ctx.req.headers.get('CF-Connecting-IP') || '';
  const { n } = await ctx.db.prepare("SELECT COUNT(*) n FROM comments WHERE ip = ? AND created_at > datetime('now', '-1 minute')").bind(ip).first();
  if (n >= 5) fail(429, '조금 있다가 다시 남겨 주세요');
  const r = await ctx.db.prepare('INSERT INTO comments (project_id, name, text, ip) VALUES (?, ?, ?, ?)').bind(p.id, name, text, ip).run();
  return json({ id: r.meta.last_row_id });
});

on('DELETE', '/api/projects/:id/comments/:cid', async (ctx, { id, cid }) => {
  needLogin(ctx);
  await mine(ctx, id);
  await ctx.db.prepare('DELETE FROM comments WHERE id = ? AND project_id = ?').bind(cid, id).run();
  return json({ ok: true });
});

// 사용자가 올린 사진: R2에서 꺼내 준다
async function serveUpload(env, key) {
  const obj = await env.UPLOADS.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('ETag', obj.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');   // 파일 이름이 매번 새로 생기므로 오래 캐시해도 안전
  return new Response(obj.body, { headers });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname.startsWith('/uploads/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
      return serveUpload(env, decodeURIComponent(url.pathname.slice('/uploads/'.length)));
    }
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);

    const ctx = { req, env, url, db: env.DB };
    let res;
    try {
      const route = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
      if (!route) fail(404, '없는 주소예요');
      await loadSession(ctx);
      res = await route.handler(ctx, url.pathname.match(route.re).groups || {});
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      res = json({ error: err instanceof HttpError ? err.message : '잠시 후 다시 해 주세요' }, err.status || 500);
    }
    if (ctx.setCookie) res.headers.append('Set-Cookie', ctx.setCookie);
    return res;
  },
};
