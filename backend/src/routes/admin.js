// ============================================================================
// [파일 개요] 관리자 전용 API를 모아 둔 라우터 파일이에요.
// - 신고가 접수되었거나 숨겨진 작품 목록 조회(`GET /api/admin/reports`),
//   작품 숨기기·다시 보이기(`POST /api/admin/projects/:id/hide`),
//   검토가 끝난 신고 기록 지우기(`DELETE /api/admin/projects/:id/reports`)를 담당해요.
// - 관리자는 이메일이 `wrangler.jsonc`의 `vars.ADMIN_EMAILS`(쉼표로 구분)에 등록된 회원이에요.
// [비유] 미술관 운영실이에요. 관람객들이 접수한 신고 카드를 모아서 확인하고, 작품을 잠시 내리거나 다시 걸어 주는 일을 해요.
// ============================================================================

import { Hono } from 'hono';
import { needLogin } from '../session.js';
import { bad, readJson, isAdmin } from '../util.js';

const admin = new Hono();

// [뜻/역할] 이 파일(`admin.js`)에 있는 모든 API 주소 맨 앞에서 실행되는 이중 검문소예요.
// [문법] `admin.use('*', needLogin, async (c, next) => ...)`로 먼저 로그인 여부(`needLogin`)를 확인하고, 이어서 관리자 여부(`await isAdmin(c)`)를 확인해 관리자가 아니면 `403 Forbidden`으로 돌려보내요.
// [작성 이유] 아래의 각 API 함수마다 관리자 확인 코드를 빠뜨리는 실수를 원천 차단하기 위해서예요.
admin.use('*', needLogin, async (c, next) => {
  if (!(await isAdmin(c))) return c.json({ error: '관리자만 쓸 수 있어요' }, 403);
  await next();
});

// [뜻/역할] 현재 숨겨져 있거나(`p.hidden = 1`) 신고가 1건 이상 접수된 작품들의 목록과 신고 사유들을 가져오는 API(`GET /api/admin/reports`)예요.
// [문법]
// - `group_concat(reason, char(10))`: 여러 명이 적은 신고 사유를 줄바꿈 문자(`char(10)` = `\n`)로 이어 붙여 한 문자열로 가져온 뒤, 자바스크립트에서 `.split('\n')`으로 배열로 쪼개요.
// - 신고를 저장할 때(`projects.js`) 사유 안의 줄바꿈을 모두 공백으로 치환해 두었기 때문에 `\n`으로 쪼개도 사유가 절대 엉키지 않아요.
// [작성 이유] 관리자가 한 화면(`admin.html`)에서 어떤 작품이 왜 신고되었는지 모든 사유를 한눈에 보고 판단할 수 있게 하기 위해서예요.
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

// [뜻/역할] 관리자가 특정 작품을 수동으로 숨기거나(`hidden: 1`), 숨겨진 작품을 다시 전시실에 보이게(`hidden: 0`) 전환하는 API(`POST /api/admin/projects/:id/hide`)예요.
// [문법] `hidden` 값이 정확히 숫자 `0` 또는 `1`인지 검사한 뒤 `projects` 표를 업데이트해요. 바뀐 줄(`meta.changes`)이 없으면 없는 작품이므로 `404`를 반환해요.
// [작성 이유] 3명 신고로 자동 숨김된 작품이 억울한 신고였을 때 다시 복구해 주거나, 반대로 신고가 1건뿐이어도 심각한 위반이면 관리자가 즉시 숨길 수 있게 하기 위해서예요.
admin.post('/projects/:id/hide', async (c) => {
  const hidden = (await readJson(c)).hidden;
  if (hidden !== 0 && hidden !== 1) throw bad('hidden은 0이나 1이에요');
  const { meta } = await c.env.DB.prepare('UPDATE projects SET hidden = ? WHERE id = ?').bind(hidden, c.req.param('id')).run();
  if (!meta.changes) return c.json({ error: '없는 작품이에요' }, 404);
  return c.json({ ok: true });
});

// [뜻/역할] 확인이 끝난 작품의 신고 기록들을 깨끗이 비우는 API(`DELETE /api/admin/projects/:id/reports`)예요.
// [문법] `DELETE FROM reports WHERE project_id = ?`로 해당 작품에 쌓인 신고 줄들을 삭제해요.
// [작성 이유] 이상 없는 작품을 검토한 뒤 신고 목록에서 내리거나, 조치를 마친 뒤 신고 카운트를 초기화하기 위해서예요(숨김 상태 자체는 위 `/hide` API로 따로 조절해요).
admin.delete('/projects/:id/reports', async (c) => {
  await c.env.DB.prepare('DELETE FROM reports WHERE project_id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

export default admin;
