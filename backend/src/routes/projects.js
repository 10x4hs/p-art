// ============================================================================
// [파일 개요] 작품(프로젝트)과 관련된 모든 API를 담당하는 핵심 라우터 파일이에요.
// - 작품 목록 검색·필터(`GET /api/projects`), 작품 상세 조회 및 조회수 증가(`GET /api/projects/:id`),
//   작품 등록(`POST /`), 수정(`PUT /:id`), 삭제(`DELETE /:id`),
//   ▲ 응원 토글(`POST /:id/like`), 북마크 토글(`POST /:id/bookmark`),
//   💬 한 줄 감상 목록·작성·삭제(`GET/POST/DELETE /:id/comments`),
//   🚩 작품 신고 및 3회 누적 자동 숨김(`POST /:id/report`)이 모두 들어 있어요.
// [비유] 미술관의 전시실 큐레이터예요. 작품 접수·전시·관람객 응원 스티커·방명록·신고 접수를 총괄해요.
// ============================================================================

import { Hono } from 'hono';
import CATS from '../../../shared/categories.json';
import { needLogin } from '../session.js';
import { bad, readJson, isHttp, split, clientIp, isAdmin } from '../util.js';

const projects = new Hono();

// ── 1. 사진 업로드 및 삭제 (Cloudflare R2) ─────────────────────────────────
// [뜻/역할] 허용할 이미지 파일 형식(JPEG, PNG, WebP)과 작품당 최대 사진 장수(5장) 상수예요.
// [문법] 배열 상수 `OK_TYPES`와 숫자 상수 `MAX_FILES`로 선언해요.
// [작성 이유] 실행 파일이나 SVG(스크립트를 품을 수 있음) 업로드를 막고 안전한 사진 파일만 받기 위해서예요.
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILES = 5;

// [뜻/역할] 멀티파트 폼(`FormData`)에서 올라온 `images` 파일들을 꺼내 장수·종류·용량(장당 1.5MB 이하)을 검사해요.
// [문법]
// - `[].concat(body['images'] || [])`: 사진이 1장이면 단일 객체, 여러 장이면 배열로 들어오므로 `[].concat(...)`으로 항상 배열 모양으로 통일해요.
// - `f instanceof File && f.size > 0`: 실제 파일이면서 빈 파일이 아닌 것만 골라내요.
// [작성 이유] 프론트엔드(`edit.html`)에서 미리 이미지를 압축해 보내지만, 악의적인 요청이 서버로 직접 큰 파일이나 이상한 파일을 보낼 수 있으므로 서버에서도 한 번 더 철저히 검사해요.
function pickImages(body) {
  const files = [].concat(body['images'] || []).filter((f) => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES) throw bad(`사진은 ${MAX_FILES}장까지예요`);
  for (const f of files) {
    if (!OK_TYPES.includes(f.type)) throw bad('jpg·png·webp 이미지만 올릴 수 있어요');
    if (f.size > 1.5 * 1024 * 1024) throw bad('사진이 너무 커요. 다시 골라 주세요');
  }
  return files;
}

// [뜻/역할] 검사를 통과한 사진 파일들을 R2 버킷(`c.env.IMAGES`)에 저장하고, D1 `images` 표에 어느 작품(`pid`)의 사진인지 키(`key`)를 기록해요.
// [문법] `crypto.randomUUID()`로 겹치지 않는 무작위 파일 키를 만들고, `IMAGES.put(키, 바이트버퍼, 메타데이터)`로 저장해요.
// [작성 이유] 원본 파일 이름을 그대로 쓰면 한글 깨짐·경로 조작·이름 충돌 문제가 생길 수 있어서, 무작위 UUID를 파일 키로 사용해요.
async function saveImages(c, pid, files) {
  for (const f of files) {
    const key = crypto.randomUUID();
    await c.env.IMAGES.put(key, await f.arrayBuffer(), { httpMetadata: { contentType: f.type } });
    await c.env.DB.prepare('INSERT INTO images (project_id, file) VALUES (?, ?)').bind(pid, key).run();
  }
}

// [뜻/역할] 작품을 삭제하거나 새 사진으로 교체할 때, 기존 사진을 R2 버킷과 D1 `images` 표 양쪽에서 모두 지워요.
// [문법] 먼저 `SELECT file FROM images WHERE project_id = ?`로 R2 키들을 조회해 `c.env.IMAGES.delete(...)`에 배열로 넘겨 지운 뒤, DB 줄도 지워요.
// [작성 이유] DB의 `ON DELETE CASCADE`는 R2 버킷 안의 실제 파일까지는 지워 주지 못하므로, 서버가 직접 R2 파일을 청소해 줘야 해요.
async function deleteImages(c, pid) {
  const { results } = await c.env.DB.prepare('SELECT file FROM images WHERE project_id = ?').bind(pid).all();
  if (results.length) await c.env.IMAGES.delete(results.map((i) => i.file));
  await c.env.DB.prepare('DELETE FROM images WHERE project_id = ?').bind(pid).run();
}

// ── 2. 작품 목록 조회 및 상세 조회 ─────────────────────────────────────────
// [뜻/역할] 작품 기본 정보(`p.*`)에 더해 작성자 닉네임(`author`), 사진 키 목록(`image_keys`), 응원 수(`likes`), 감상 수(`comments`), 북마크 수(`bookmarks`), 그리고 지금 보는 사람(`?1`)이 응원/북마크했는지 여부(`liked`, `bookmarked`)를 한 번에 가져오는 공통 SQL문이에요.
// [문법]
// - `group_concat(file, ',')`: 여러 장의 사진 키를 올린 순서(`ORDER BY id`)대로 쉼표로 이어 한 줄로 묶어 와요.
// - `EXISTS(...)`: 조건에 맞는 줄이 있으면 `1`, 없으면 `0`을 돌려줘요.
// - `?1`: 첫 번째 바인딩 파라미터(현재 로그인한 회원 번호 `uid`)를 가리켜요.
// [작성 이유] 작품마다 사진·응원 수를 따로 조회하면 쿼리가 수십 번 실행(N+1 문제)되어 느려지므로, 서브쿼리로 단 한 번에 묶어 가져오기 위해서예요.
const SELECT_FULL = `
  SELECT p.*,
    u.nickname AS author,
    (SELECT group_concat(file, ',') FROM (SELECT file FROM images WHERE project_id = p.id ORDER BY id)) AS image_keys,
    (SELECT COUNT(*) FROM likes WHERE project_id = p.id) AS likes,
    (SELECT COUNT(*) FROM comments WHERE project_id = p.id) AS comments,
    (SELECT COUNT(*) FROM bookmarks WHERE project_id = p.id) AS bookmarks,
    EXISTS(SELECT 1 FROM likes WHERE project_id = p.id AND user_id = ?1) AS liked,
    EXISTS(SELECT 1 FROM bookmarks WHERE project_id = p.id AND user_id = ?1) AS bookmarked
  FROM projects p JOIN users u ON u.id = p.user_id`;

// [뜻/역할] DB에서 꺼낸 한 줄 데이터를 프론트엔드 화면이 바로 쓰기 좋은 모양으로 다듬어 주는 변환 함수예요.
// [문법]
// - 구조 분해 할당(`{ image_keys, ...p }`)으로 내부용 열인 `image_keys`는 빼고 `images: ['/uploads/키', ...]` 배열로 바꿔요.
// - `!!p.liked`: 숫자 `0`/`1`을 진짜 불리언 `false`/`true`로 바꿔요.
// - `mine: p.user_id === uid`: 지금 로그인한 사람의 작품인지 여부를 알려 줘요.
// [작성 이유] 프론트엔드에서 매번 쉼표를 쪼개거나 이미지 주소를 조립하지 않고, API 응답을 그대로 화면에 그릴 수 있게 하기 위해서예요.
const shape = ({ image_keys, ...p }, uid) => ({
  ...p,
  tags: split(p.tags),
  cats: split(p.cats),
  images: split(image_keys).map((k) => '/uploads/' + k),
  liked: !!p.liked,
  bookmarked: !!p.bookmarked,
  mine: p.user_id === uid,
});

// [뜻/역할] 특정 작품(`p`)을 지금 요청한 사람(`c`)이 볼 자격이 있는지 판별해요.
// [문법] 작품 주인(`p.user_id === c.get('uid')`)이면 무조건 `true`, 아니면 공개 작품(`is_public`)이면서 숨겨지지 않았거나(`!p.hidden`) 관리자인 경우(`await isAdmin(c)`)에만 `true`예요.
// [작성 이유] 비공개 작품은 작성자 본인만 볼 수 있고, 신고로 숨겨진 작품은 작성자 본인과 관리자만 확인할 수 있게 보호하기 위해서예요.
async function canSee(c, p) {
  if (p.user_id === c.get('uid')) return true;
  return !!p.is_public && (!p.hidden || (await isAdmin(c)));
}

// [뜻/역할] 작품 목록을 검색어(`q`)·분야(`cat`)·태그(`tag`)·작성자(`user`)·팀원(`member`)·내 북마크(`bookmarked=1`)·정렬(`sort=hot|new`) 조건에 맞춰 돌려주는 API(`GET /api/projects`)예요.
// [문법]
// - 비로그인 상태면 `uid`를 `0`으로 두어 아무 회원 번호와도 일치하지 않게 해요.
// - `',' || p.cats || ',' LIKE '%,' || ?3 || ',%'`: DB의 `cats` 앞뒤에 쉼표를 붙여서 검사해요.
// [작성 이유] 그냥 `LIKE '%게임%'`으로 찾으면 `'게임'`을 찾는데 `'보드게임'`이나 `'게임개발'`까지 잘못 걸려 나오기 때문에, 양쪽에 쉼표(`,게임,`)를 둘러 정확히 일치하는 분야·태그만 골라내기 위해서예요.
projects.get('/', async (c) => {
  const uid = c.get('uid') || 0;
  const qs = (k) => c.req.query(k) || '';
  const hot = ['hot', 'popular'].includes(qs('sort'));
  const saved = qs('bookmarked') === '1' ? 1 : 0;
  if (saved && !uid) return c.json({ error: '로그인이 필요해요' }, 401);
  const { results } = await c.env.DB.prepare(`${SELECT_FULL}
    WHERE (p.is_public = 1 OR p.user_id = ?1)
      AND (p.hidden = 0 OR p.user_id = ?1)
      AND (p.title LIKE ?2 OR p.summary LIKE ?2 OR p.tags LIKE ?2 OR p.maker LIKE ?2 OR p.target LIKE ?2)
      AND (?3 = '' OR ',' || p.cats || ',' LIKE '%,' || ?3 || ',%')
      AND (?4 = '' OR ',' || p.tags || ',' LIKE '%,' || ?4 || ',%')
      AND (?5 = '' OR p.user_id = ?5)
      AND (?6 = '' OR EXISTS(SELECT 1 FROM project_members WHERE project_id = p.id AND user_id = ?6))
      AND (?7 = 0 OR EXISTS(SELECT 1 FROM bookmarks WHERE project_id = p.id AND user_id = ?1))
    ORDER BY ${hot ? 'likes DESC,' : ''} p.id DESC`)
    .bind(uid, `%${qs('q')}%`, qs('cat'), qs('tag'), qs('user'), qs('member'), saved).all();
  return c.json(results.map((p) => shape(p, uid)));
});

// [뜻/역할] 작품 하나(`/:id`)의 상세 정보와 팀원 목록(`members`)을 돌려주고, 작품 주인이 아닌 사람이 열람하면 조회수(`views`)를 1 올리는 API(`GET /api/projects/:id`)예요.
// [문법] `canSee(c, p)`가 거짓이면 403 대신 404(`없는 작품이에요`)를 반환해요.
// [작성 이유] 남의 비공개 작품 번호를 찍어 봤을 때 "권한이 없어요(403)"라고 답하면 그 번호의 비공개 작품이 존재한다는 사실 자체가 노출되므로 404로 숨기고, 작가가 자기 작품을 수정·확인할 때는 조회수가 허수로 올라가지 않게 본인 조회는 제외해요.
projects.get('/:id', async (c) => {
  const p = await c.env.DB.prepare(`${SELECT_FULL} WHERE p.id = ?2`).bind(c.get('uid') || 0, c.req.param('id')).first();
  if (!p || !(await canSee(c, p))) return c.json({ error: '없는 작품이에요' }, 404);
  if (p.user_id !== c.get('uid')) {
    await c.env.DB.prepare('UPDATE projects SET views = views + 1 WHERE id = ?').bind(p.id).run();
    p.views++;
  }
  const { results: members } = await c.env.DB.prepare(
    'SELECT u.id, u.nickname FROM project_members m JOIN users u ON u.id = m.user_id WHERE m.project_id = ? ORDER BY m.rowid').bind(p.id).all();
  return c.json({ ...shape(p, c.get('uid')), members });
});

// ── 3. 작품 등록 · 수정 · 삭제 ─────────────────────────────────────────────
// [뜻/역할] 작품 등록·수정 폼에서 넘어온 글자 입력값들을 검사하고, SQL `?` 자리에 넣을 순서대로 배열(10개 값)로 정리해 돌려줘요.
// [문법]
// - 글자 수 제한(제목 40자, 한 줄 소개 100자, 만든 사람 30자, 누구에게 50자, 이야기 2000자)과 URL 형식(`isHttp`)을 검사해요.
// - `[...new Set(...)]`으로 태그와 분야의 중복을 제거하고, 태그는 최대 8개, 분야는 `shared/categories.json`에 등록된 값만 남겨요.
// [작성 이유] 브라우저 폼 검사를 우회한 잘못된 데이터나 너무 긴 텍스트가 DB에 들어가는 것을 막는 최종 문지기 역할을 해요.
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

// [뜻/역할] 폼에서 `"3,7"`처럼 쉼표로 이어 보낸 팀원 회원 번호들을 검사해 숫자 배열로 돌려줘요.
// [문법]
// - `members` 필드를 아예 안 보냈으면 `null`을 돌려줘서 수정 시 기존 팀원이 유지되게 해요.
// - 작성자 본인(`n !== c.get('uid')`)과 중복 번호를 빼고 최대 5명인지, 그리고 실제로 `users` 표에 존재하는 회원인지 `SELECT COUNT(*)`로 확인해요.
// [작성 이유] 존재하지 않는 회원 번호나 자기 자신을 팀원으로 넣는 잘못된 요청을 막기 위해서예요.
async function readMembers(c, body) {
  if (typeof body.members !== 'string') return null;
  const ids = [...new Set(body.members.split(',').map(Number))].filter((n) => Number.isInteger(n) && n > 0 && n !== c.get('uid'));
  if (ids.length > 5) throw bad('팀원은 5명까지예요');
  if (!ids.length) return ids;
  const { n } = await c.env.DB.prepare(`SELECT COUNT(*) n FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).first();
  if (n !== ids.length) throw bad('없는 회원이 팀원에 들어 있어요');
  return ids;
}

// [뜻/역할] 작품의 팀원 목록을 새 목록(`ids`)으로 통째로 교체해요.
// [문법] `c.env.DB.batch([...])` 안에 기존 팀원 전체 삭제(`DELETE`)와 새 팀원 추가(`INSERT`) 쿼리들을 묶어 한 트랜잭션으로 실행해요.
// [작성 이유] 누가 빠지고 누가 새로 들어왔는지 복잡하게 비교하는 대신, 원자적(atomic)으로 한 번에 지우고 다시 넣으면 도중에 실패해도 데이터가 꼬이지 않고 깔끔하기 때문이에요.
async function saveMembers(c, pid, ids) {
  if (!ids) return;
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM project_members WHERE project_id = ?').bind(pid),
    ...ids.map((u) => c.env.DB.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?)').bind(pid, u)),
  ]);
}

// [뜻/역할] 멀티파트 업로드 요청 본문을 읽어서 `[폼값배열, 사진파일배열, 팀원번호배열]`을 한꺼번에 준비해 주는 도우미 함수예요.
// [문법] `c.req.parseBody({ all: true })`를 써서 같은 이름(`images`)으로 올라온 파일 여러 장이 배열로 모이게 해요.
// [작성 이유] 작품 등록(`POST /`)과 작품 수정(`PUT /:id`) 양쪽에서 똑같은 파싱·검증 로직을 재사용하기 위해서예요.
async function readUpload(c) {
  const body = await c.req.parseBody({ all: true });
  return [readForm(body), pickImages(body), await readMembers(c, body)];
}

// [뜻/역할] 새 작품을 등록하는 API(`POST /api/projects`)예요.
// [문법] `projects` 표에 줄을 추가한 뒤, 방금 생긴 작품 번호(`meta.last_row_id`)로 사진(`saveImages`)과 팀원(`saveMembers`)을 저장해요.
// [작성 이유] 등록이 끝나면 프론트엔드가 방금 만든 작품의 상세 페이지(`/project.html?id=번호`)로 바로 이동할 수 있도록 `{ id }`를 돌려줘요.
projects.post('/', needLogin, async (c) => {
  const [values, files, members] = await readUpload(c);
  const { meta } = await c.env.DB.prepare(`INSERT INTO projects
    (title, summary, detail, url, github, tags, cats, maker, target, is_public, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...values, c.get('uid')).run();
  await saveImages(c, meta.last_row_id, files);
  await saveMembers(c, meta.last_row_id, members);
  return c.json({ id: meta.last_row_id });
});

// [뜻/역할] 작품을 수정·삭제하거나 내 작품에 달린 감상을 지울 때, 정말 내 작품이 맞는지 확인하는 검문소 미들웨어예요.
// [문법] 작품이 없으면 `404`, 작품 주인(`p.user_id`)이 현재 로그인한 사람(`c.get('uid')`)과 다르면 `403 Forbidden`을 돌려줘요.
// [작성 이유] 남의 작품을 마음대로 고치거나 지우지 못하도록 서버에서 소유권을 강제하기 위해서예요.
async function mine(c, next) {
  const p = await c.env.DB.prepare('SELECT user_id FROM projects WHERE id = ?').bind(c.req.param('id')).first();
  if (!p) return c.json({ error: '없는 작품이에요' }, 404);
  if (p.user_id !== c.get('uid')) return c.json({ error: '내 작품만 고칠 수 있어요' }, 403);
  await next();
}

// [뜻/역할] 기존 작품을 수정하는 API(`PUT /api/projects/:id`)예요.
// [문법] 글자 정보는 항상 업데이트하고, 사진 파일(`files.length`)은 새로 골라 올렸을 때만 기존 사진을 지우고(`deleteImages`) 새 사진으로 교체해요.
// [작성 이유] 글자만 살짝 고치고 싶은데 매번 사진 파일을 다시 올리게 하면 불편하므로, 사진을 안 올리면 기존 사진이 그대로 유지되게 했어요.
projects.put('/:id', needLogin, mine, async (c) => {
  const id = Number(c.req.param('id'));
  const [values, files, members] = await readUpload(c);
  await c.env.DB.prepare(`UPDATE projects SET
    title = ?, summary = ?, detail = ?, url = ?, github = ?, tags = ?, cats = ?, maker = ?, target = ?, is_public = ?
    WHERE id = ?`).bind(...values, id).run();
  if (files.length) {
    await deleteImages(c, id);
    await saveImages(c, id, files);
  }
  await saveMembers(c, id, members);
  return c.json({ id });
});

// [뜻/역할] 내 작품을 삭제하는 API(`DELETE /api/projects/:id`)예요.
// [문법] 먼저 `deleteImages`로 R2 사진을 지운 뒤 `DELETE FROM projects WHERE id = ?`를 실행해요.
// [작성 이유] `projects` 줄을 지우면 응원·감상·팀원·북마크·신고 기록은 DB의 `ON DELETE CASCADE`로 자동 삭제되고, R2 사진은 `deleteImages`가 깔끔히 지워 줘요.
projects.delete('/:id', needLogin, mine, async (c) => {
  const id = c.req.param('id');
  await deleteImages(c, id);
  await c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ── 4. ▲ 응원(likes) 및 북마크(bookmarks) 토글 (1인 1회) ───────────────────
// [뜻/역할] 한 번 누르면 켜지고, 다시 누르면 꺼지는 토글 동작을 `likes` 표와 `bookmarks` 표에서 공통으로 처리하는 함수예요.
// [문법]
// - 먼저 `DELETE`를 시도해 보고, 지워진 줄 수(`meta.changes`)가 `0`이면 "원래 안 켜져 있었다"는 뜻이므로 `INSERT`로 새로 켜요(`on = true`).
// - 반대로 지워진 줄이 있으면 "원래 켜져 있던 걸 방금 껐다"는 뜻이므로(`on = false`) 그대로 끝내고 현재 총개수(`n`)를 세어 `[on, n]`을 돌려줘요.
// [작성 이유] `SELECT`로 있는지 먼저 확인하고 분기하는 것보다 `DELETE` 후 `meta.changes`를 확인하는 방식이 쿼리 수도 적고 동시 요청에도 안전해요. (`table` 인자에는 코드 내부의 `'likes'`와 `'bookmarks'`만 들어와요.)
async function toggle(c, table, id) {
  const uid = c.get('uid');
  const { meta } = await c.env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ? AND project_id = ?`).bind(uid, id).run();
  const on = meta.changes === 0;
  if (on) await c.env.DB.prepare(`INSERT INTO ${table} (user_id, project_id) VALUES (?, ?)`).bind(uid, id).run();
  const { n } = await c.env.DB.prepare(`SELECT COUNT(*) n FROM ${table} WHERE project_id = ?`).bind(id).first();
  return [on, n];
}

// [뜻/역할] 작품에 '▲ 응원'을 누르거나 취소하는 API(`POST /api/projects/:id/like`)예요.
// [문법] 작품 존재 여부를 확인한 뒤 `toggle(c, 'likes', id)` 결과를 `{ liked, likes }`로 돌려줘요.
// [작성 이유] 화면에서 버튼 색상(`liked`)과 응원 숫자(`likes`)를 즉시 업데이트할 수 있게 두 값을 함께 응답해요.
projects.post('/:id/like', needLogin, async (c) => {
  const id = c.req.param('id');
  if (!(await c.env.DB.prepare('SELECT 1 FROM projects WHERE id = ?').bind(id).first())) return c.json({ error: '없는 작품이에요' }, 404);
  const [liked, likes] = await toggle(c, 'likes', id);
  return c.json({ liked, likes });
});

// [뜻/역할] 작품을 내 북마크에 담거나 빼는 API(`POST /api/projects/:id/bookmark`)예요.
// [문법] 볼 수 있는 작품인지(`visible(c)`) 확인한 뒤 `toggle(c, 'bookmarks', p.id)` 결과를 `{ bookmarked, bookmarks }`로 돌려줘요.
// [작성 이유] 남의 비공개 작품이나 숨겨진 작품은 북마크할 수 없게 막고, 정상 작품만 저장하게 하기 위해서예요.
projects.post('/:id/bookmark', needLogin, async (c) => {
  const p = await visible(c);
  if (!p) return c.json({ error: '없는 작품이에요' }, 404);
  const [bookmarked, bookmarks] = await toggle(c, 'bookmarks', p.id);
  return c.json({ bookmarked, bookmarks });
});

// ── 5. 💬 한 줄 감상 (비로그인 작성 가능 + IP당 1분 5개 도배 방지) ────────
// [뜻/역할] 현재 요청한 사람이 열람할 수 있는 작품인지(`canSee`) 확인하고 작품 정보를 돌려주는 도우미 함수예요.
// [문법] 작품이 없거나 `canSee`가 거짓이면 `null`을 반환해요.
// [작성 이유] 북마크·감상 조회·감상 작성·신고 API에서 남의 비공개/숨김 작품에 접근하지 못하도록 똑같은 기준을 적용하기 위해서예요.
async function visible(c) {
  const p = await c.env.DB.prepare('SELECT id, user_id, is_public, hidden FROM projects WHERE id = ?').bind(c.req.param('id')).first();
  return p && (await canSee(c, p)) ? p : null;
}

// [뜻/역할] 작품에 달린 한 줄 감상 목록을 최신순(`ORDER BY id DESC`)으로 가져오는 API(`GET /api/projects/:id/comments`)예요.
// [문법] `ip` 열은 빼고 조회한 뒤, 지금 보는 사람이 작품 주인이면 각 감상에 `canDelete: true`를 붙여 돌려줘요.
// [작성 이유] 방문자의 IP 주소는 개인정보이므로 절대 화면에 내려보내지 않고, 작품 주인 화면에만 감상 옆 '지우기' 버튼이 나타나게 하기 위해서예요.
projects.get('/:id/comments', async (c) => {
  const p = await visible(c);
  if (!p) return c.json({ error: '없는 작품이에요' }, 404);
  const { results } = await c.env.DB.prepare('SELECT id, name, text, created_at FROM comments WHERE project_id = ? ORDER BY id DESC').bind(p.id).all();
  return c.json(results.map((g) => ({ ...g, canDelete: p.user_id === c.get('uid') })));
});

// [뜻/역할] 로그인 없이 누구나 작품에 한 줄 감상을 남기는 API(`POST /api/projects/:id/comments`)예요.
// [문법]
// - 이름(`name`)을 비우면 `'익명'`으로 채우고(최대 12자), 감상(`text`)은 1~80자인지 확인해요.
// - `created_at > datetime('now', '-1 minute')` 조건으로 같은 IP(`clientIp(c)`)가 최근 1분 동안 남긴 감상 수를 세어 5개 이상이면 `429 Too Many Requests`로 거절해요.
// [작성 이유] 회원가입 없이도気軽に(가볍게) 응원과 감상을 남기게 하되, 자동화 봇이나 악성 사용자의 도배를 막기 위해서예요.
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

// [뜻/역할] 작품 주인이 자기 작품에 달린 불쾌한 감상을 지우는 API(`DELETE /api/projects/:id/comments/:cid`)예요.
// [문법] `needLogin`과 `mine` 미들웨어로 작품 주인인지 확인한 뒤, `WHERE id = ? AND project_id = ?` 두 조건을 모두 걸어 삭제해요.
// [작성 이유] 만약 `WHERE id = ?`만 검사하면, 내 작품 주소를 대면서 `cid`에만 남의 작품 댓글 번호를 넣어 남의 댓글을 지우는 꼼수(IDOR 취약점)가 가능해지기 때문에 `project_id`까지 반드시 함께 확인해요.
projects.delete('/:id/comments/:cid', needLogin, mine, async (c) => {
  await c.env.DB.prepare('DELETE FROM comments WHERE id = ? AND project_id = ?').bind(c.req.param('cid'), c.req.param('id')).run();
  return c.json({ ok: true });
});

// ── 6. 🚩 작품 신고 (1인 1회, 3명 누적 시 자동 숨김) ───────────────────────
// [뜻/역할] 몇 명이 신고하면 작품을 자동으로 숨길지 정하는 기준값(3명)이에요.
const HIDE_AT = 3;

// [뜻/역할] 로그인한 회원이 부적절한 작품을 신고하는 API(`POST /api/projects/:id/report`)예요.
// [문법]
// - 본인 작품은 신고할 수 없고(`p.user_id === c.get('uid')`), 신고 사유(`reason`) 안의 줄바꿈/연속 공백은 `.replace(/\s+/g, ' ')`로 한 칸 공백으로 정리해 1~100자인지 검사해요(나중에 관리자 화면에서 줄바꿈으로 사유들을 묶어 읽을 때 섞이지 않게 하기 위해서예요).
// - `INSERT OR IGNORE`: 이미 같은 작품을 신고한 적이 있으면(UNIQUE 제약) 에러 대신 `meta.changes`가 `0`이 되어 `409` 에러로 안내해요.
// - 총 신고 수(`n`)가 `HIDE_AT`(3명) 이상이 되면 즉시 `projects.hidden = 1`로 바꿔 목록에서 자동으로 숨겨요.
// [작성 이유] 관리자가 24시간 대기하지 않아도 커뮤니티 구성원 3명이 신고한 위험 게시물을 즉시 임시 블라인드 처리하고, 이후 관리자가 `/admin.html`에서 검토해 복구하거나 유지할 수 있게 하기 위해서예요.
projects.post('/:id/report', needLogin, async (c) => {
  const p = await visible(c);
  if (!p) return c.json({ error: '없는 작품이에요' }, 404);
  if (p.user_id === c.get('uid')) throw bad('내 작품은 신고할 수 없어요');
  const reason = String((await readJson(c)).reason || '').replace(/\s+/g, ' ').trim();
  if (!reason || reason.length > 100) throw bad('신고 이유는 1~100자예요');
  const { meta } = await c.env.DB.prepare('INSERT OR IGNORE INTO reports (project_id, user_id, reason) VALUES (?, ?, ?)').bind(p.id, c.get('uid'), reason).run();
  if (!meta.changes) throw bad('이미 신고한 작품이에요', 409);
  const { n } = await c.env.DB.prepare('SELECT COUNT(*) n FROM reports WHERE project_id = ?').bind(p.id).first();
  if (n >= HIDE_AT) await c.env.DB.prepare('UPDATE projects SET hidden = 1 WHERE id = ?').bind(p.id).run();
  return c.json({ ok: true });
});

export default projects;
