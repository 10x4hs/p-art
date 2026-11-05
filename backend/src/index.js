// PART 서버(Cloudflare Worker)의 시작점.
// /api/* · /uploads/* · /shared/* 만 여기로 오고, 나머지(화면 파일)는 Cloudflare가 frontend/에서 바로 보낸다 (wrangler.jsonc).
import { Hono } from 'hono';
import CATS from '../../shared/categories.json';
import { loadSession } from './session.js';
import auth from './routes/auth.js';
import projects from './routes/projects.js';

const app = new Hono();

app.use('/api/*', loadSession);                       // API 요청마다 "누가 로그인했나" 확인

app.get('/api/health', (c) => c.json({ ok: true }));  // 살아 있는지 확인용
app.route('/api', auth);                              // /api/signup, /login, /logout, /me, /users/:id
app.route('/api/projects', projects);                 // /api/projects …

// 분야 목록을 화면에도 같은 값으로 — <script src="/shared/categories.js">가 window.CATS를 받는다
app.get('/shared/categories.js', (c) =>
  c.body(`window.CATS = ${JSON.stringify(CATS)};`, 200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }));

// 사진: KV에서 꺼내 보낸다. 키는 바뀌지 않으니 브라우저가 1년 동안 저장해 둬도 된다
app.get('/uploads/:key', async (c) => {
  const { value, metadata } = await c.env.IMAGES.getWithMetadata(c.req.param('key'), 'arrayBuffer');
  if (!value) return c.notFound();
  return c.body(value, 200, { 'Content-Type': metadata?.type || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' });
});

// 예상한 오류(입력이 잘못됨)는 400, 나머지는 500 — 항상 { error } JSON으로
app.onError((err, c) => {
  if (err.status) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: '서버에서 문제가 생겼어요. 잠시 후 다시 해 주세요' }, 500);
});

export default app;
