// [파일 개요] 서버(Cloudflare Worker)의 시작점이에요. /api·/uploads·/shared·/project 요청만 여기로 오고,
// 나머지 화면 파일은 Cloudflare가 frontend/에서 바로 보내요(wrangler.jsonc의 assets).
import { Hono } from 'hono';   // Express는 Workers에서 안 돌아서 Hono를 써요
import CATS from '../../shared/categories.json';
import { loadSession } from './session.js';
import auth from './routes/auth.js';
import projects from './routes/projects.js';
import admin from './routes/admin.js';
import { projectPage } from './og.js';

const app = new Hono();

app.use('/api/*', loadSession);                       // API 요청마다 "누가 로그인했나" 확인
app.get('/api/health', (c) => c.json({ ok: true }));  // 살아 있는지 확인용(smoke-test가 씀)
app.route('/api', auth);                              // /api/signup, /login, /logout, /me, /users/:id
app.route('/api/projects', projects);                 // /api/projects …
app.route('/api/admin', admin);                       // /api/admin/… (관리자만)

// 작품 페이지는 공유 미리보기(og 태그)를 작품마다 바꿔서 보내요(og.js).
app.get('/project', projectPage);
app.get('/project.html', projectPage);

// 화면도 서버와 같은 분야 목록을 쓰도록 window.CATS 스크립트로 보내 줘요.
app.get('/shared/categories.js', (c) =>
  c.body(`window.CATS = ${JSON.stringify(CATS)};`, 200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }));

// R2(IMAGES)에서 사진을 꺼내 보내요. 키는 절대 안 바뀌니 브라우저가 1년 캐시해요.
app.get('/uploads/:key', async (c) => {
  const obj = await c.env.IMAGES.get(c.req.param('key'));
  if (!obj) return c.notFound();
  return c.body(obj.body, 200, { 'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' });
});

// 모든 오류를 { error } 모양으로 바꿔요. bad()가 붙인 status가 없으면 로그만 남기고 500이에요.
app.onError((err, c) => {
  if (err.status) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: '서버에서 문제가 생겼어요. 잠시 후 다시 해 주세요' }, 500);
});

export default app;
