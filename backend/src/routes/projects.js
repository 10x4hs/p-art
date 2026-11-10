// [파일 개요] 작품 관련 API 묶음이에요 — 목록·상세 보기, 등록·수정·삭제, ▲ 응원(좋아요), 💬 한 줄 감상(댓글).
// [비유] 전시관의 '전시 담당 직원'이에요. 작품을 벽에 걸고(등록), 바꿔 걸고(수정), 내리고(삭제), 관람객의 응원 스티커와 방명록을 관리해요.

// [뜻/역할] 필요한 도구들을 가져와요: Hono(라우터), 분야 목록, 로그인 검문소, 공용 도구들.
import { Hono } from 'hono';
import CATS from '../../../shared/categories.json';
import { needLogin } from '../session.js';
import { bad, readJson, isHttp, split, clientIp } from '../util.js';

// [뜻/역할] 작품 API만 담을 작은 Hono 앱이에요. index.js가 /api/projects 아래에 붙여요. 그래서 여기의 '/'는 실제로 /api/projects예요.
const projects = new Hono();

// ── 사진 (KV) ───────────────────────────────────────────
// [뜻/역할] 사진 검사 기준이에요: 허용하는 종류(jpg·png·webp), 한 장 최대 크기(1.5MB), 최대 장수(5장).
// [작성 이유] 화면(edit.html)이 올리기 전에 사진 크기를 미리 줄여서 보내요. 서버는 그래도 혹시 모르니 종류·크기·장수만 다시 확인해요.
//            큰 사진은 저장 공간을 많이 차지하고 화면 로딩도 느리게 만들어서, 줄인 사진만 받는 거예요.
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 1.5 * 1024 * 1024;   // 줄인 사진 기준 1.5MB
const MAX_FILES = 5;

// [뜻/역할] 폼 본문에서 'images' 칸의 파일들만 골라 검사하고, 통과한 파일 배열을 돌려줘요.
// [문법] [].concat(값) — 파일이 1개면 그 값 하나, 여러 개면 배열로 오는데, concat으로 항상 배열로 맞춰요.
//        filter((f) => f instanceof File && f.size > 0) — 진짜 파일이고 비어 있지 않은 것만 남겨요.
function pickImages(body) {
  const files = [].concat(body['images'] || []).filter((f) => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES) throw bad(`사진은 ${MAX_FILES}장까지예요`);
  // [문법] for (const f of files) — 배열의 값을 하나씩 꺼내 반복해요. includes는 배열 안에 그 값이 있는지 확인해요.
  for (const f of files) {
    if (!OK_TYPES.includes(f.type)) throw bad('jpg·png·webp 이미지만 올릴 수 있어요');
    if (f.size > MAX_BYTES) throw bad('사진이 너무 커요. 다시 골라 주세요');
  }
  return files;
}

// [뜻/역할] 사진들을 KV(IMAGES)에 저장하고, 어떤 작품(pid)의 사진인지 D1의 images 표에 기록해요.
// [비유] KV는 '이름표 붙은 사물함', images 표는 '어느 사물함이 어느 작품 것인지 적은 장부'예요.
// [문법] IMAGES.put(키, 데이터, { metadata }) — 키 자리에 데이터를 넣고, 사진 종류(type)를 부가 정보로 같이 저장해요.
//        f.arrayBuffer()는 파일 내용을 바이트 데이터로 읽어요.
// [작성 이유] 키를 crypto.randomUUID()로 무작위로 만들어서 남이 주소를 짐작할 수 없고, 같은 이름의 파일끼리 겹치지도 않아요.
async function saveImages(c, pid, files) {
  for (const f of files) {
    const key = crypto.randomUUID();
    await c.env.IMAGES.put(key, await f.arrayBuffer(), { metadata: { type: f.type } });
    await c.env.DB.prepare('INSERT INTO images (project_id, file) VALUES (?, ?)').bind(pid, key).run();
  }
}

// [뜻/역할] 한 작품의 사진을 모두 지워요: KV에서 사진 데이터를 지우고, D1의 images 표에서도 기록을 지워요.
// [작성 이유] 사진 교체(수정)와 작품 삭제에서 같이 써요. KV는 DB의 CASCADE 규칙이 닿지 않으니 직접 지워야 해요.
async function deleteImages(c, pid) {
  const { results } = await c.env.DB.prepare('SELECT file FROM images WHERE project_id = ?').bind(pid).all();
  await Promise.all(results.map((i) => c.env.IMAGES.delete(i.file)));
  await c.env.DB.prepare('DELETE FROM images WHERE project_id = ?').bind(pid).run();
}

// ── 목록 · 상세 ─────────────────────────────────────────
// [뜻/역할] 작품 정보와 함께 작성자 닉네임·사진 키 목록·응원 수·감상 수·내가 응원했는지를 SQL 한 번에 붙여서 가져오는 공통 SELECT 문이에요.
// [문법] p.* 는 projects 표의 모든 열, AS는 결과 열에 새 이름을 붙여요. (SELECT ...) 안의 작은 SELECT는 작품마다 따로 계산돼요(서브쿼리).
//        group_concat(file, ',')은 여러 줄의 사진 키를 쉼표로 이어 한 글자로 만들어요. ?1은 'bind의 첫 번째 값(내 번호)'이에요.
// [작성 이유] 작품마다 DB에 여러 번 물어보면 느리니까, 필요한 걸 한 번에 다 붙여 와요. 목록과 상세가 같이 써서 상수로 뺐어요.
const SELECT_FULL = `
  SELECT p.*,
    u.nickname AS author,
    (SELECT group_concat(file, ',') FROM (SELECT file FROM images WHERE project_id = p.id ORDER BY id)) AS image_keys,
    (SELECT COUNT(*) FROM likes WHERE project_id = p.id) AS likes,
    (SELECT COUNT(*) FROM comments WHERE project_id = p.id) AS comments,
    EXISTS(SELECT 1 FROM likes WHERE project_id = p.id AND user_id = ?1) AS liked
  FROM projects p JOIN users u ON u.id = p.user_id`;

// [뜻/역할] DB에서 꺼낸 작품 한 줄을 화면이 쓰기 좋은 모양으로 바꿔요.
//          쉼표 글자 → 배열(tags, cats), 사진 키 → '/uploads/키' 주소, 0/1 → true/false(liked), 그리고 내 작품인지(mine)를 붙여요.
// [문법] const { image_keys, ...rest } = p; — image_keys만 따로 빼고 나머지는 rest에 모아요(나머지 구조 분해).
//        { ...rest, tags: ... } — rest를 펼쳐 넣고 몇 칸만 덮어써요. !!값은 값을 true/false로 바꾸는 요령이에요.
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

// [뜻/역할] GET /api/projects — 작품 목록을 돌려줘요. 주소 뒤 ?q=검색어&cat=분야&tag=기술&user=회원번호&sort=hot|new 로 걸러요.
// GET /api/projects?q=&cat=&tag=&user=&sort=hot|new
projects.get('/', async (c) => {
  // [뜻/역할] 로그인 안 했으면 uid를 0으로 써요. 0번 회원은 없으니 '내 작품'·'내 응원'이 모두 아니게 돼요.
  const uid = c.get('uid') || 0;
  // [문법] c.req.query('이름')은 주소의 ?이름=값 을 꺼내요. 없으면 빈 글자('')로 써요.
  const q = c.req.query('q') || '', cat = c.req.query('cat') || '', tag = c.req.query('tag') || '', user = c.req.query('user') || '';
  // [뜻/역할] sort가 'hot'이나 'popular'면 응원 많은 순으로 정렬해요.
  const hot = ['hot', 'popular'].includes(c.req.query('sort'));
  // [뜻/역할] 공통 SELECT 뒤에 조건(WHERE)과 정렬(ORDER BY)을 붙여서 실행해요.
  //          조건: 공개 작품이거나 내 작품 / 검색어가 제목·소개·태그·만든 사람·추천 대상 중 하나에 포함 / 분야·태그·회원이 맞음(빈 값이면 통과).
  // [문법] ?1~?5는 bind에 넘긴 순서대로의 값이에요(같은 번호는 여러 번 써도 같은 값). LIKE '%글자%'는 '그 글자가 들어 있음'이에요.
  //        분야는 ',' || p.cats || ',' 처럼 앞뒤에 쉼표를 붙여 비교해서 '게임'으로 찾을 때 '게임개발' 같은 다른 분야가 섞이지 않게 해요.
  // [작성 이유] 정렬 방향은 ${hot ? ...} 로 코드에서 정한 두 글자 중 하나만 들어가고, 사용자 입력은 전부 bind로만 넘겨서 SQL 인젝션을 막아요.
  const { results } = await c.env.DB.prepare(`${SELECT_FULL}
    WHERE (p.is_public = 1 OR p.user_id = ?1)                                -- 공개 작품 + 내 비공개 작품
      AND (p.title LIKE ?2 OR p.summary LIKE ?2 OR p.tags LIKE ?2 OR p.maker LIKE ?2 OR p.target LIKE ?2)
      AND (?3 = '' OR ',' || p.cats || ',' LIKE '%,' || ?3 || ',%')          -- 분야: 쉼표로 감싸서 정확히 일치
      AND (?4 = '' OR ',' || p.tags || ',' LIKE '%,' || ?4 || ',%')
      AND (?5 = '' OR p.user_id = ?5)
    ORDER BY ${hot ? 'likes DESC,' : ''} p.id DESC`)
    .bind(uid, `%${q}%`, cat, tag, user).all();
  // [뜻/역할] 줄마다 shape로 모양을 바꿔서 JSON 배열로 돌려줘요.
  return c.json(results.map((p) => shape(p, uid)));
});

// [뜻/역할] 작품 번호(id) 하나로 공통 SELECT를 실행해 그 작품 한 줄을 가져오는 도우미예요.
// [문법] ?1 = 내 번호(없으면 0), ?2 = 작품 번호예요.
const findFull = (c, id) => c.env.DB.prepare(`${SELECT_FULL} WHERE p.id = ?2`).bind(c.get('uid') || 0, id).first();

// [뜻/역할] GET /api/projects/:id — 작품 상세를 돌려줘요.
// [작성 이유] 비공개 작품은 주인만 볼 수 있어요. 남에게는 '없다'(404)고 답해서 비공개 작품이 있다는 사실도 숨겨요.
projects.get('/:id', async (c) => {
  const p = await findFull(c, c.req.param('id'));
  if (!p || (!p.is_public && p.user_id !== c.get('uid'))) return c.json({ error: '없는 작품이에요' }, 404);
  return c.json(shape(p, c.get('uid')));
});

// ── 등록 · 수정 · 삭제 ──────────────────────────────────
// [뜻/역할] 폼 내용을 검사하고, DB에 저장할 값 10개를 순서대로 배열로 돌려줘요.
// [작성 이유] 화면 검사는 우회할 수 있으니 여기가 진짜 문지기예요. 등록과 수정이 같은 검사를 쓰니 함수로 묶었어요.
function readForm(body) {
  // [뜻/역할] 칸 값이 글자일 때만 그 값을, 아니면(파일이거나 없으면) 빈 글자를 돌려주는 작은 도우미예요.
  // [문법] typeof 값 === 'string' — 값의 종류가 글자인지 확인해요.
  const s = (k) => (typeof body[k] === 'string' ? body[k] : '');
  const title = s('title').trim(), summary = s('summary').trim(), detail = s('detail'), url = s('url').trim(), github = s('github').trim();
  const maker = s('maker').trim(), target = s('target').trim();
  // [뜻/역할] 칸마다 글자 수와 형식을 검사해서, 틀리면 알맞은 안내 문구로 400 오류를 던져요.
  if (!title || title.length > 40) throw bad('제목은 1~40자예요');
  if (!summary || summary.length > 100) throw bad('한 줄 소개는 1~100자예요');
  if (maker.length > 30) throw bad('만든 사람은 30자까지예요');
  if (target.length > 50) throw bad('누구에게는 50자까지예요');
  if (detail.length > 2000) throw bad('만든 이야기는 2000자까지예요');
  // [작성 이유] 체험 주소는 꼭 http(s)여야 해요. javascript: 같은 주소가 저장되면 누르는 순간 나쁜 코드가 실행될 수 있어요.
  if (!isHttp(url)) throw bad('체험 주소는 http(s)://로 시작해야 해요');
  if (github && !isHttp(github)) throw bad('GitHub 주소는 http(s)://로 시작해야 해요');
  // [뜻/역할] 태그: 쉼표로 자르고 → 공백 제거 → 빈 칸 버림 → 중복 제거(Set) → 최대 8개 → 다시 쉼표로 이어 붙여요.
  // [문법] [...new Set(배열)]은 중복을 없앤 새 배열을 만드는 요령이에요. filter(Boolean)은 빈 글자를 걸러요.
  const tags = [...new Set(s('tags').split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 8).join(',');
  // [뜻/역할] 분야: 중복을 없애고, shared/categories.json에 있는 분야만 남겨요(없는 분야는 조용히 버려요).
  const cats = [...new Set(s('cats').split(',').map((t) => t.trim()))].filter((t) => CATS.includes(t)).join(',');
  // [뜻/역할] SQL의 ? 순서에 맞춰 값 배열을 돌려줘요. is_public은 '0'이면 비공개(0), 그 밖에는 공개(1)예요.
  return [title, summary, detail, url, github, tags, cats, maker, target, s('is_public') === '0' ? 0 : 1];
}

// [뜻/역할] POST /api/projects — 새 작품을 등록해요. 로그인한 사람만 할 수 있어요.
projects.post('/', needLogin, async (c) => {
  // [뜻/역할] 사진 파일이 섞인 폼(FormData)을 읽어요.
  // [문법] parseBody({ all: true }) — 같은 이름(images)으로 여러 파일이 오면 배열로 모아 줘요.
  const body = await c.req.parseBody({ all: true });
  const values = readForm(body);
  const files = pickImages(body);
  // [뜻/역할] projects 표에 작품을 추가해요. 마지막 ?에는 작성자(내 번호)가 들어가요.
  // [문법] bind(...values, 값) — ...으로 배열 values의 10개 값을 펼쳐 넣고, 그 뒤에 내 번호를 붙여요.
  const { meta } = await c.env.DB.prepare(`INSERT INTO projects
    (title, summary, detail, url, github, tags, cats, maker, target, is_public, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...values, c.get('uid')).run();
  // [뜻/역할] 방금 생긴 작품 번호로 사진을 저장하고, 새 번호를 돌려줘요. 화면은 이 번호로 홍보 키트(kit.html)로 이동해요.
  await saveImages(c, meta.last_row_id, files);
  return c.json({ id: meta.last_row_id });
});

// [뜻/역할] '내 작품인지' 확인하는 검문소(미들웨어)예요. 작품이 없으면 404, 남의 작품이면 403(권한 없음)으로 돌려보내요.
// [작성 이유] 수정·삭제·감상 지우기 API 앞에 끼워서, 주인만 할 수 있게 지켜요.
async function mine(c, next) {
  const p = await c.env.DB.prepare('SELECT user_id FROM projects WHERE id = ?').bind(c.req.param('id')).first();
  if (!p) return c.json({ error: '없는 작품이에요' }, 404);
  if (p.user_id !== c.get('uid')) return c.json({ error: '내 작품만 고칠 수 있어요' }, 403);
  await next();
}

// [뜻/역할] PUT /api/projects/:id — 작품을 고쳐요. 로그인 검문소 → 내 작품 검문소를 차례로 통과해야 해요.
projects.put('/:id', needLogin, mine, async (c) => {
  // [문법] Number(글자)는 '12' 같은 글자를 숫자 12로 바꿔요.
  const id = Number(c.req.param('id'));
  const body = await c.req.parseBody({ all: true });
  const values = readForm(body);
  const files = pickImages(body);
  await c.env.DB.prepare(`UPDATE projects SET
    title = ?, summary = ?, detail = ?, url = ?, github = ?, tags = ?, cats = ?, maker = ?, target = ?, is_public = ?
    WHERE id = ?`).bind(...values, id).run();
  // [뜻/역할] 새 사진을 골랐을 때만 기존 사진을 지우고 새 사진으로 바꿔요. 사진을 안 고르면 기존 사진이 그대로 남아요.
  if (files.length) {                 // 새 사진을 올리면 기존 사진을 교체
    await deleteImages(c, id);
    await saveImages(c, id, files);
  }
  return c.json({ id });
});

// [뜻/역할] DELETE /api/projects/:id — 작품을 지워요. 사진(KV)을 먼저 지우고 작품 줄을 지우면, 응원·감상은 CASCADE로 같이 지워져요.
projects.delete('/:id', needLogin, mine, async (c) => {
  const id = c.req.param('id');
  await deleteImages(c, id);
  await c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();   // 응원·감상은 CASCADE로 같이 삭제
  return c.json({ ok: true });
});

// ── ▲ 응원: 누르면 켜지고, 다시 누르면 꺼진다 (1인 1회) ──
// [뜻/역할] POST /api/projects/:id/like — 응원 버튼을 토글(켜기/끄기)해요. 로그인한 사람만 할 수 있어요.
projects.post('/:id/like', needLogin, async (c) => {
  const id = c.req.param('id');
  const uid = c.get('uid');
  // [뜻/역할] 그런 작품이 없으면 404로 돌려보내요.
  if (!(await c.env.DB.prepare('SELECT 1 FROM projects WHERE id = ?').bind(id).first())) return c.json({ error: '없는 작품이에요' }, 404);
  // [뜻/역할] 일단 내 응원 기록을 지워 봐요. meta.changes는 실제로 지워진 줄 수예요.
  // [작성 이유] "있는지 확인 → 지우거나 추가" 대신 "먼저 지워 보고 결과로 판단"하면 DB에 묻는 횟수가 줄어요.
  const { meta } = await c.env.DB.prepare('DELETE FROM likes WHERE user_id = ? AND project_id = ?').bind(uid, id).run();
  const removed = meta.changes > 0;   // 지운 게 있으면 = 원래 눌려 있었음 → 끄기
  // [뜻/역할] 지운 게 없었다면 원래 안 눌려 있었던 거니까 새로 추가(켜기)해요.
  if (!removed) await c.env.DB.prepare('INSERT INTO likes (user_id, project_id) VALUES (?, ?)').bind(uid, id).run();
  // [뜻/역할] 새 응원 수를 세서, 켜졌는지와 함께 돌려줘요. 화면은 이 값으로 버튼과 숫자를 바로 바꿔요.
  // [문법] COUNT(*) n — 센 결과 열에 n이라는 이름을 붙여요. const { n } = ...으로 그 값만 꺼내요.
  const { n } = await c.env.DB.prepare('SELECT COUNT(*) n FROM likes WHERE project_id = ?').bind(id).first();
  return c.json({ liked: !removed, likes: n });
});

// ── 💬 한 줄 감상: 로그인 없이 누구나. 같은 IP는 1분에 5개까지 ──
// [뜻/역할] 주소의 작품을 '지금 이 사람이 볼 수 있는지' 확인해서, 볼 수 있으면 작품 정보를, 아니면 null을 돌려줘요.
// [작성 이유] 비공개 작품에는 주인 말고는 감상을 읽거나 남길 수 없게 하려고요.
async function visible(c) {
  const p = await c.env.DB.prepare('SELECT id, user_id, is_public FROM projects WHERE id = ?').bind(c.req.param('id')).first();
  return p && (p.is_public || p.user_id === c.get('uid')) ? p : null;
}

// [뜻/역할] GET /api/projects/:id/comments — 감상 목록을 최신순으로 돌려줘요.
// [작성 이유] 각 감상에 canDelete(지울 수 있는지)를 붙여서, 작품 주인 화면에만 삭제 버튼이 보이게 해요. ip는 개인정보라서 보내지 않아요.
projects.get('/:id/comments', async (c) => {
  const p = await visible(c);
  if (!p) return c.json({ error: '없는 작품이에요' }, 404);
  const { results } = await c.env.DB.prepare('SELECT id, name, text, created_at FROM comments WHERE project_id = ? ORDER BY id DESC').bind(p.id).all();
  return c.json(results.map((g) => ({ ...g, canDelete: p.user_id === c.get('uid') })));
});

// [뜻/역할] POST /api/projects/:id/comments — 한 줄 감상을 남겨요. 로그인 없이 누구나 쓸 수 있어요.
projects.post('/:id/comments', async (c) => {
  const p = await visible(c);
  if (!p) return c.json({ error: '없는 작품이에요' }, 404);
  const body = await readJson(c);
  // [뜻/역할] 이름을 안 적으면 '익명'으로 저장해요.
  const name = String(body.name || '').trim() || '익명';
  const text = String(body.text || '').trim();
  if (name.length > 12) throw bad('이름은 12자까지예요');
  if (!text || text.length > 80) throw bad('감상은 1~80자예요');
  // [뜻/역할] 같은 IP가 최근 1분 동안 남긴 감상 수를 세서, 5개 이상이면 429(요청이 너무 많음)로 거절해요.
  // [문법] datetime('now', '-1 minute')은 SQLite에서 '지금부터 1분 전' 시각이에요.
  // [작성 이유] 로그인 없이 쓸 수 있는 만큼, 한 사람이 감상을 도배하지 못하게 막는 장치예요.
  const ip = clientIp(c);
  const { n } = await c.env.DB.prepare("SELECT COUNT(*) n FROM comments WHERE ip = ? AND created_at > datetime('now', '-1 minute')").bind(ip).first();
  if (n >= 5) throw bad('조금 있다가 다시 남겨 주세요', 429);
  const { meta } = await c.env.DB.prepare('INSERT INTO comments (project_id, name, text, ip) VALUES (?, ?, ?, ?)').bind(p.id, name, text, ip).run();
  return c.json({ id: meta.last_row_id });
});

// [뜻/역할] DELETE /api/projects/:id/comments/:cid — 감상 하나를 지워요. 작품 주인만 지울 수 있어요(mine 검문소).
// [작성 이유] WHERE에 project_id도 같이 넣어서, 내 작품 주소로 남의 작품에 달린 감상 번호를 넣어 지우는 꼼수를 막아요.
projects.delete('/:id/comments/:cid', needLogin, mine, async (c) => {
  await c.env.DB.prepare('DELETE FROM comments WHERE id = ? AND project_id = ?').bind(c.req.param('cid'), c.req.param('id')).run();
  return c.json({ ok: true });
});

// [뜻/역할] 완성한 작품 API 묶음을 내보내요. index.js가 /api/projects에 붙여요.
export default projects;
