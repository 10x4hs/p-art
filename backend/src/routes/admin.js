// [파일 개요] 관리자 API예요 — 신고 목록 보기, 작품 숨기기·되살리기, 신고 지우기. index.js가 /api/admin 아래에 붙여요.
// 관리자는 이메일이 ADMIN_EMAILS(wrangler.jsonc vars)에 있는 회원이에요.
import { Hono } from 'hono';
import { needLogin } from '../session.js';
import { bad, readJson, isAdmin } from '../util.js';

const admin = new Hono();

// 이 파일의 모든 주소 앞 검문소: 로그인 + 관리자만 통과해요.
admin.use('*', needLogin, async (c, next) => {
  if (!(await isAdmin(c))) return c.json({ error: '관리자만 쓸 수 있어요' }, 403);
  await next();
});

// 신고가 있거나 숨긴 작품들이에요. 이유는 줄바꿈으로 이어 받아서 배열로 바꿔요(신고 이유엔 줄바꿈이 없어요).
admin.get('/reports', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT p.id, p.title, p.hidden, p.user_id, u.nickname AS author,
      (SELECT COUNT(*) FROM reports WHERE project_id = p.id) AS reports,
      (SELECT group_concat(reason, char(10)) FROM reports WHERE project_id = p.id) AS reasons
    FROM projects p JOIN users u ON u.id = p.user_id
    WHERE p.hidden = 1 OR EXISTS(SELECT 1 FROM reports WHERE project_id = p.id)
    ORDER BY reports DESC, p.id DESC`).all();
  return c.json(results.map((r) => ({ ...r, reasons: r.reasons ? r.reasons.split('\n') : [] })));
});

// { hidden: 1 }이면 숨기고, { hidden: 0 }이면 다시 보여요.
admin.post('/projects/:id/hide', async (c) => {
  const hidden = (await readJson(c)).hidden;
  if (hidden !== 0 && hidden !== 1) throw bad('hidden은 0이나 1이에요');
  const { meta } = await c.env.DB.prepare('UPDATE projects SET hidden = ? WHERE id = ?').bind(hidden, c.req.param('id')).run();
  if (!meta.changes) return c.json({ error: '없는 작품이에요' }, 404);
  return c.json({ ok: true });
});

// 확인이 끝난 신고를 지워요. 숨김은 따로 풀어야 해요.
admin.delete('/projects/:id/reports', async (c) => {
  await c.env.DB.prepare('DELETE FROM reports WHERE project_id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

export default admin;
