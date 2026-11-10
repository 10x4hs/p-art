var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// shared/categories.js
var require_categories = __commonJS({
  "shared/categories.js"(exports, module) {
    (function(root) {
      const CATS2 = ["\uC6F9\uC0AC\uC774\uD2B8", "\uAC8C\uC784", "\uD559\uAD50\uC0DD\uD65C", "\uACF5\uBD80", "\uB3C4\uAD6C"];
      if (typeof module !== "undefined" && module.exports) module.exports = CATS2;
      else root.CATS = CATS2;
    })(exports);
  }
});

// worker/index.js
var import_categories = __toESM(require_categories());
var SESSION_DAYS = 30;
var SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1e3;
var OK_TYPES = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var HttpError = class extends Error {
  static {
    __name(this, "HttpError");
  }
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
var fail = /* @__PURE__ */ __name((status, message) => {
  throw new HttpError(status, message);
}, "fail");
var json = /* @__PURE__ */ __name((data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } }), "json");
var PBKDF2_ITER = 1e5;
var toHex = /* @__PURE__ */ __name((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""), "toHex");
var fromHex = /* @__PURE__ */ __name((hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16))), "fromHex");
async function pbkdf2(password, salt, iter) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256);
}
__name(pbkdf2, "pbkdf2");
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITER}$${toHex(salt)}$${toHex(await pbkdf2(password, salt, PBKDF2_ITER))}`;
}
__name(hashPassword, "hashPassword");
async function checkPassword(password, stored) {
  const [kind, iter, salt, hash] = String(stored).split("$");
  if (kind !== "pbkdf2") return false;
  const got = new Uint8Array(await pbkdf2(password, fromHex(salt), Number(iter)));
  const want = fromHex(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}
__name(checkPassword, "checkPassword");
var readCookie = /* @__PURE__ */ __name((req, name) => (req.headers.get("Cookie") || "").split(/;\s*/).map((c) => c.split("=")).find(([k]) => k === name)?.[1], "readCookie");
var sessionCookie = /* @__PURE__ */ __name((sid, maxAge) => `sid=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`, "sessionCookie");
async function loadSession(ctx) {
  const sid = readCookie(ctx.req, "sid");
  if (!sid) return;
  const row = await ctx.db.prepare("SELECT uid, expires FROM sessions WHERE sid = ? AND expires > ?").bind(sid, Date.now()).first();
  if (!row) return;
  ctx.sid = sid;
  ctx.uid = row.uid;
  if (row.expires - Date.now() < SESSION_MS - 864e5) {
    await ctx.db.prepare("UPDATE sessions SET expires = ? WHERE sid = ?").bind(Date.now() + SESSION_MS, sid).run();
    ctx.setCookie = sessionCookie(sid, SESSION_MS / 1e3);
  }
}
__name(loadSession, "loadSession");
async function startSession(ctx, uid) {
  if (ctx.sid) await ctx.db.prepare("DELETE FROM sessions WHERE sid = ?").bind(ctx.sid).run();
  const sid = toHex(crypto.getRandomValues(new Uint8Array(32)));
  await ctx.db.prepare("INSERT INTO sessions (sid, uid, expires) VALUES (?, ?, ?)").bind(sid, uid, Date.now() + SESSION_MS).run();
  ctx.sid = sid;
  ctx.uid = uid;
  ctx.setCookie = sessionCookie(sid, SESSION_MS / 1e3);
}
__name(startSession, "startSession");
async function endSession(ctx) {
  if (ctx.sid) await ctx.db.prepare("DELETE FROM sessions WHERE sid = ?").bind(ctx.sid).run();
  ctx.sid = ctx.uid = void 0;
  ctx.setCookie = sessionCookie("", 0);
}
__name(endSession, "endSession");
var needLogin = /* @__PURE__ */ __name((ctx) => {
  if (!ctx.uid) fail(401, "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD574\uC694");
}, "needLogin");
var me = /* @__PURE__ */ __name((ctx, id) => ctx.db.prepare("SELECT id, email, nickname, bio FROM users WHERE id = ?").bind(id).first(), "me");
var cleanEmail = /* @__PURE__ */ __name((e) => String(e || "").trim().toLowerCase(), "cleanEmail");
var isHttp = /* @__PURE__ */ __name((u) => /^https?:\/\/\S+$/.test(u), "isHttp");
var split = /* @__PURE__ */ __name((v) => v ? v.split(",") : [], "split");
async function readJson(req) {
  if (!(req.headers.get("Content-Type") || "").includes("application/json")) return {};
  return req.json().catch(() => fail(400, "\uC694\uCCAD \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC544\uC694"));
}
__name(readJson, "readJson");
var PROJECT_SELECT = `
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
    images: image_files ? image_files.split("|").map((f) => "/uploads/" + f) : [],
    liked: !!p.liked,
    mine: p.user_id === uid
  };
}
__name(decorate, "decorate");
function readForm(form) {
  const get = /* @__PURE__ */ __name((k, d = "") => {
    const v = form.get(k);
    return typeof v === "string" ? v : d;
  }, "get");
  const title = get("title"), summary = get("summary"), detail = get("detail"), url = get("url"), github = get("github");
  const tags = get("tags"), cats = get("cats"), maker = get("maker"), target = get("target"), isPublic = get("is_public", "1");
  if (!title.trim() || title.length > 40) fail(400, "\uC81C\uBAA9\uC740 1~40\uC790\uC608\uC694");
  if (!summary.trim() || summary.length > 100) fail(400, "\uD55C \uC904 \uC18C\uAC1C\uB294 1~100\uC790\uC608\uC694");
  if (maker.length > 30) fail(400, "\uB9CC\uB4E0 \uC0AC\uB78C\uC740 30\uC790\uAE4C\uC9C0\uC608\uC694");
  if (target.length > 50) fail(400, "\uB204\uAD6C\uC5D0\uAC8C\uB294 50\uC790\uAE4C\uC9C0\uC608\uC694");
  if (detail.length > 2e3) fail(400, "\uB9CC\uB4E0 \uC774\uC57C\uAE30\uB294 2000\uC790\uAE4C\uC9C0\uC608\uC694");
  if (!isHttp(url)) fail(400, "\uBC30\uD3EC \uC8FC\uC18C\uB294 http(s)://\uB85C \uC2DC\uC791\uD574\uC57C \uD574\uC694");
  if (github && !isHttp(github)) fail(400, "GitHub \uC8FC\uC18C\uB294 http(s)://\uB85C \uC2DC\uC791\uD574\uC57C \uD574\uC694");
  const cleanTags = [...new Set(tags.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 8).join(",");
  const cleanCats = [...new Set(cats.split(",").map((t) => t.trim()))].filter((c) => import_categories.default.includes(c)).join(",");
  return { title: title.trim(), summary: summary.trim(), detail, url, github, tags: cleanTags, cats: cleanCats, maker: maker.trim(), target: target.trim(), is_public: isPublic === "0" ? 0 : 1 };
}
__name(readForm, "readForm");
function readImages(form) {
  const files = form.getAll("images").filter((f) => typeof f !== "string" && f.size > 0);
  if (files.length > 5) fail(400, "\uC0AC\uC9C4\uC740 5\uC7A5\uAE4C\uC9C0 \uC62C\uB9B4 \uC218 \uC788\uC5B4\uC694");
  for (const f of files) {
    if (!OK_TYPES[f.type]) fail(400, "jpg\xB7png\xB7webp \uC774\uBBF8\uC9C0\uB9CC \uC62C\uB9B4 \uC218 \uC788\uC5B4\uC694");
    if (f.size > 5 * 1024 * 1024) fail(400, "\uC0AC\uC9C4 \uD55C \uC7A5\uC740 5MB\uAE4C\uC9C0\uC608\uC694");
  }
  return files;
}
__name(readImages, "readImages");
async function saveImages(ctx, pid, files) {
  for (const f of files) {
    const name = Date.now() + "-" + Math.random().toString(36).slice(2) + OK_TYPES[f.type];
    await ctx.env.UPLOADS.put(name, f.stream(), { httpMetadata: { contentType: f.type } });
    await ctx.db.prepare("INSERT INTO images (project_id, file) VALUES (?, ?)").bind(pid, name).run();
  }
}
__name(saveImages, "saveImages");
async function deleteImages(ctx, sql, ...args) {
  const { results } = await ctx.db.prepare(sql).bind(...args).all();
  if (results.length) await ctx.env.UPLOADS.delete(results.map((r) => r.file));
}
__name(deleteImages, "deleteImages");
async function findProject(ctx, id) {
  return ctx.db.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first();
}
__name(findProject, "findProject");
async function mine(ctx, id) {
  const p = await findProject(ctx, id);
  if (!p) fail(404, "\uC5C6\uB294 \uC791\uD488\uC774\uC5D0\uC694");
  if (p.user_id !== ctx.uid) fail(403, "\uB0B4 \uC791\uD488\uB9CC \uACE0\uCE60 \uC218 \uC788\uC5B4\uC694");
  return p;
}
__name(mine, "mine");
async function visible(ctx, id) {
  const p = await findProject(ctx, id);
  if (!p || !(p.is_public || p.user_id === ctx.uid)) fail(404, "\uC5C6\uB294 \uC791\uD488\uC774\uC5D0\uC694");
  return p;
}
__name(visible, "visible");
var routes = [];
var on = /* @__PURE__ */ __name((method, pattern, handler) => {
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$");
  routes.push({ method, re, handler });
}, "on");
on("GET", "/api/health", () => json({ ok: true }));
on("POST", "/api/signup", async (ctx) => {
  const body = await readJson(ctx.req);
  const email = cleanEmail(body.email);
  const password = String(body.password || "");
  const nickname = String(body.nickname || "").trim();
  if (!EMAIL.test(email) || email.length > 100) fail(400, "\uC774\uBA54\uC77C \uC8FC\uC18C\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694");
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) fail(400, "\uBE44\uBC00\uBC88\uD638\uB294 8\uC790 \uC774\uC0C1, \uC601\uBB38+\uC22B\uC790\uAC00 \uD544\uC694\uD574\uC694");
  if (nickname.length < 2 || nickname.length > 20) fail(400, "\uB2C9\uB124\uC784\uC740 2~20\uC790\uC608\uC694");
  if (await ctx.db.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first()) fail(409, "\uC774\uBBF8 \uAC00\uC785\uD55C \uC774\uBA54\uC77C\uC774\uC5D0\uC694");
  const r = await ctx.db.prepare("INSERT INTO users (email, password, nickname) VALUES (?, ?, ?)").bind(email, await hashPassword(password), nickname).run();
  await startSession(ctx, r.meta.last_row_id);
  return json(await me(ctx, ctx.uid));
});
on("POST", "/api/login", async (ctx) => {
  const body = await readJson(ctx.req);
  const user = await ctx.db.prepare("SELECT * FROM users WHERE email = ?").bind(cleanEmail(body.email)).first();
  if (!user || !await checkPassword(String(body.password || ""), user.password)) fail(401, "\uC774\uBA54\uC77C\uC774\uB098 \uBE44\uBC00\uBC88\uD638\uAC00 \uB9DE\uC9C0 \uC54A\uC544\uC694");
  await startSession(ctx, user.id);
  return json(await me(ctx, user.id));
});
on("POST", "/api/logout", async (ctx) => {
  await endSession(ctx);
  return json({ ok: true });
});
on("GET", "/api/me", async (ctx) => json(ctx.uid ? await me(ctx, ctx.uid) : null));
on("PUT", "/api/me", async (ctx) => {
  needLogin(ctx);
  const body = await readJson(ctx.req);
  const nickname = String(body.nickname || "").trim();
  const bio = String(body.bio || "");
  if (nickname.length < 2 || nickname.length > 20) fail(400, "\uB2C9\uB124\uC784\uC740 2~20\uC790\uC608\uC694");
  await ctx.db.prepare("UPDATE users SET nickname = ?, bio = ? WHERE id = ?").bind(nickname, bio.slice(0, 200), ctx.uid).run();
  return json(await me(ctx, ctx.uid));
});
on("DELETE", "/api/me", async (ctx) => {
  needLogin(ctx);
  await deleteImages(ctx, "SELECT i.file FROM images i JOIN projects p ON p.id = i.project_id WHERE p.user_id = ?", ctx.uid);
  await ctx.db.prepare("DELETE FROM users WHERE id = ?").bind(ctx.uid).run();
  ctx.sid = void 0;
  ctx.setCookie = sessionCookie("", 0);
  return json({ ok: true });
});
on("GET", "/api/users/:id", async (ctx, { id }) => {
  const user = await ctx.db.prepare("SELECT id, nickname, bio FROM users WHERE id = ?").bind(id).first();
  return user ? json(user) : fail(404, "\uC5C6\uB294 \uC0AC\uC6A9\uC790\uC608\uC694");
});
on("GET", "/api/projects", async (ctx) => {
  const q = ctx.url.searchParams;
  const sort = q.get("sort") || "new";
  const order = sort === "popular" || sort === "hot" ? "likes DESC, p.id DESC" : "p.id DESC";
  const { results } = await ctx.db.prepare(`${PROJECT_SELECT}
    WHERE (p.is_public = 1 OR p.user_id = ?1)
      AND (p.title LIKE ?2 OR p.summary LIKE ?2 OR p.tags LIKE ?2 OR p.maker LIKE ?2 OR p.target LIKE ?2)
      AND (?3 = '' OR ',' || p.cats || ',' LIKE '%,' || ?3 || ',%')
      AND (?4 = '' OR ',' || p.tags || ',' LIKE '%,' || ?4 || ',%')
      AND (?5 = '' OR p.user_id = CAST(?5 AS INTEGER))
    ORDER BY ${order}`).bind(ctx.uid || 0, `%${q.get("q") || ""}%`, q.get("cat") || "", q.get("tag") || "", q.get("user") || "").all();
  return json(results.map((p) => decorate(p, ctx.uid)));
});
on("GET", "/api/projects/:id", async (ctx, { id }) => {
  const p = await ctx.db.prepare(`${PROJECT_SELECT} WHERE p.id = ?2`).bind(ctx.uid || 0, id).first();
  if (!p || !p.is_public && p.user_id !== ctx.uid) fail(404, "\uC5C6\uB294 \uC791\uD488\uC774\uC5D0\uC694");
  return json(decorate(p, ctx.uid));
});
on("POST", "/api/projects", async (ctx) => {
  needLogin(ctx);
  const form = await ctx.req.formData();
  const f = readForm(form);
  const files = readImages(form);
  const r = await ctx.db.prepare(`INSERT INTO projects (user_id, title, summary, detail, url, github, tags, cats, maker, target, is_public)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(ctx.uid, f.title, f.summary, f.detail, f.url, f.github, f.tags, f.cats, f.maker, f.target, f.is_public).run();
  const id = r.meta.last_row_id;
  await saveImages(ctx, id, files);
  return json({ id });
});
on("PUT", "/api/projects/:id", async (ctx, { id }) => {
  needLogin(ctx);
  await mine(ctx, id);
  const form = await ctx.req.formData();
  const f = readForm(form);
  const files = readImages(form);
  await ctx.db.prepare(`UPDATE projects SET title=?, summary=?, detail=?, url=?, github=?, tags=?, cats=?, maker=?, target=?, is_public=? WHERE id=?`).bind(f.title, f.summary, f.detail, f.url, f.github, f.tags, f.cats, f.maker, f.target, f.is_public, id).run();
  if (files.length) {
    await deleteImages(ctx, "SELECT file FROM images WHERE project_id = ?", id);
    await ctx.db.prepare("DELETE FROM images WHERE project_id = ?").bind(id).run();
    await saveImages(ctx, id, files);
  }
  return json({ id: +id });
});
on("DELETE", "/api/projects/:id", async (ctx, { id }) => {
  needLogin(ctx);
  await mine(ctx, id);
  await deleteImages(ctx, "SELECT file FROM images WHERE project_id = ?", id);
  await ctx.db.prepare("DELETE FROM projects WHERE id = ?").bind(id).run();
  return json({ ok: true });
});
on("POST", "/api/projects/:id/like", async (ctx, { id }) => {
  needLogin(ctx);
  await visible(ctx, id);
  const done = (await ctx.db.prepare("DELETE FROM likes WHERE user_id = ? AND project_id = ?").bind(ctx.uid, id).run()).meta.changes;
  if (!done) await ctx.db.prepare("INSERT INTO likes (user_id, project_id) VALUES (?, ?)").bind(ctx.uid, id).run();
  const { n } = await ctx.db.prepare("SELECT COUNT(*) n FROM likes WHERE project_id = ?").bind(id).first();
  return json({ liked: !done, likes: n });
});
on("GET", "/api/projects/:id/comments", async (ctx, { id }) => {
  const p = await visible(ctx, id);
  const { results } = await ctx.db.prepare("SELECT id, name, text, created_at FROM comments WHERE project_id = ? ORDER BY id DESC").bind(p.id).all();
  return json(results.map((c) => ({ ...c, canDelete: p.user_id === ctx.uid })));
});
on("POST", "/api/projects/:id/comments", async (ctx, { id }) => {
  const p = await visible(ctx, id);
  const body = await readJson(ctx.req);
  const name = String(body.name || "").trim() || "\uC775\uBA85";
  const text = String(body.text || "").trim();
  if (name.length > 12) fail(400, "\uC774\uB984\uC740 12\uC790\uAE4C\uC9C0\uC608\uC694");
  if (!text || text.length > 80) fail(400, "\uAC10\uC0C1\uC740 1~80\uC790\uC608\uC694");
  const ip = ctx.req.headers.get("CF-Connecting-IP") || "";
  const { n } = await ctx.db.prepare("SELECT COUNT(*) n FROM comments WHERE ip = ? AND created_at > datetime('now', '-1 minute')").bind(ip).first();
  if (n >= 5) fail(429, "\uC870\uAE08 \uC788\uB2E4\uAC00 \uB2E4\uC2DC \uB0A8\uACA8 \uC8FC\uC138\uC694");
  const r = await ctx.db.prepare("INSERT INTO comments (project_id, name, text, ip) VALUES (?, ?, ?, ?)").bind(p.id, name, text, ip).run();
  return json({ id: r.meta.last_row_id });
});
on("DELETE", "/api/projects/:id/comments/:cid", async (ctx, { id, cid }) => {
  needLogin(ctx);
  await mine(ctx, id);
  await ctx.db.prepare("DELETE FROM comments WHERE id = ? AND project_id = ?").bind(cid, id).run();
  return json({ ok: true });
});
async function serveUpload(env, key) {
  const obj = await env.UPLOADS.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("ETag", obj.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
}
__name(serveUpload, "serveUpload");
var index_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/uploads/")) {
      if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
      return serveUpload(env, decodeURIComponent(url.pathname.slice("/uploads/".length)));
    }
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    const ctx = { req, env, url, db: env.DB };
    let res;
    try {
      const route = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
      if (!route) fail(404, "\uC5C6\uB294 \uC8FC\uC18C\uC608\uC694");
      await loadSession(ctx);
      res = await route.handler(ctx, url.pathname.match(route.re).groups || {});
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      res = json({ error: err instanceof HttpError ? err.message : "\uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uD574 \uC8FC\uC138\uC694" }, err.status || 500);
    }
    if (ctx.setCookie) res.headers.append("Set-Cookie", ctx.setCookie);
    return res;
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
