// ============================================================================
// [파일 개요] 작품 상세 페이지(`/project.html?id=번호`)를 카카오톡·슬랙·디스코드·트위터(X) 등에 공유할 때,
// 그 작품의 제목·한 줄 소개·대표 사진이 미리보기 카드(Open Graph)로 예쁘게 뜨도록 서버에서 HTML 메타 태그를 바꿔 주는 파일이에요.
// [비유] 선물 상자(HTML)를 택배(메신저)로 보내기 전에, 상자 겉면의 이름표(`<meta property="og:...">`)에
//   "이 안에는 ○○ 작품이 들어 있어요"라고 작품 이름과 사진을 미리 붙여서 내보내는 포장 담당자예요.
// ============================================================================

// [뜻/역할] 주소의 `?id=번호` 쿼리 파라미터를 읽어, '공개(`is_public = 1`)'이면서 '숨김 처리되지 않은(`hidden = 0`)' 작품의 제목·소개·첫 번째 사진 키(`img`)를 DB에서 찾아와요.
// [문법]
// - `/^\d+$/.test(id)`로 `id`가 숫자로만 이루어졌는지 먼저 확인해요.
// - 서브쿼리 `(SELECT file FROM images WHERE project_id = p.id ORDER BY id LIMIT 1)`로 해당 작품의 첫 번째 사진 키만 함께 가져와요.
// [작성 이유] 비공개 작품이나 신고로 숨겨진 작품은 링크를 공유하더라도 메신저 미리보기에 제목이나 사진이 유출되면 안 되기 때문에, 공개 작품만 조회해요.
async function findPublic(c) {
  const id = c.req.query('id') || '';
  if (!/^\d+$/.test(id)) return null;
  return c.env.DB.prepare(`SELECT p.id, p.title, p.summary,
      (SELECT file FROM images WHERE project_id = p.id ORDER BY id LIMIT 1) AS img
    FROM projects p WHERE p.id = ? AND p.is_public = 1 AND p.hidden = 0`).bind(id).first();
}

// [뜻/역할] `/project` 또는 `/project.html` 요청을 받아 `frontend/project.html` 원본에 작품별 Open Graph 메타 태그를 채워 넣은 뒤 응답해요.
// [문법]
// - `c.env.ASSETS.fetch(new URL('/project', c.req.url))`: Cloudflare Static Assets에서 원본 HTML 파일을 가져와요(`html_handling` 기본 동작 때문에 `/project.html` 대신 `/project`로 요청해야 리다이렉트 없이 바로 본문을 받아요).
// - Cloudflare Workers 내장 `HTMLRewriter`로 `<title>`과 `<meta>` 태그를 스트리밍 방식으로 실시간 치환해요.
// [작성 이유]
// - 메신저 미리보기 봇은 브라우저처럼 자바스크립트(`fetch('/api/projects/...')`)를 실행하지 않고 처음 받은 HTML의 `<meta>` 태그만 읽어요.
// - `HTMLRewriter`의 `.setInnerContent()`와 `.setAttribute()`는 특수문자(`"`, `<`, `>`)를 자동으로 안전하게 이스케이프해 주어 XSS 걱정이 없어요.
// - 작품마다 HTML 내용이 달라지므로 정적 파일의 원래 `etag` 헤더는 지워서(`res.headers.delete('etag')`) 잘못된 캐시가 쓰이지 않게 해요.
export async function projectPage(c) {
  const page = await c.env.ASSETS.fetch(new URL('/project', c.req.url));
  const p = await findPublic(c).catch((e) => (console.error(e), null));
  if (!p || !page.ok) return page;
  const origin = new URL(c.req.url).origin;
  const img = origin + (p.img ? '/uploads/' + p.img : '/img/hero.jpg');
  const meta = {
    description: p.summary,
    'og:title': p.title, 'og:description': p.summary, 'og:image': img, 'og:url': `${origin}/project.html?id=${p.id}`,
    'twitter:title': p.title, 'twitter:description': p.summary, 'twitter:image': img,
  };
  const out = new HTMLRewriter()
    .on('title', { element: (el) => el.setInnerContent(`${p.title} · PART`) })
    .on('meta', { element: (el) => {
      const k = el.getAttribute('property') || el.getAttribute('name');
      if (Object.hasOwn(meta, k)) el.setAttribute('content', meta[k]);
    } })
    .transform(page);
  const res = new Response(out.body, out);
  res.headers.delete('etag');
  return res;
}
