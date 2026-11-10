// [파일 개요] 작품 페이지 공유 미리보기(Open Graph)예요. 카톡·SNS는 JS를 실행하지 않아서,
// /project.html?id=번호 를 보낼 때 서버가 미리 og 태그를 그 작품의 제목·소개·사진으로 바꿔 줘요.

// 공개 + 숨기지 않은 작품만 미리보기에 써요. 첫 사진 키(img)도 같이 가져와요.
async function findPublic(c) {
  const id = c.req.query('id') || '';
  if (!/^\d+$/.test(id)) return null;
  return c.env.DB.prepare(`SELECT p.id, p.title, p.summary,
      (SELECT file FROM images WHERE project_id = p.id ORDER BY id LIMIT 1) AS img
    FROM projects p WHERE p.id = ? AND p.is_public = 1 AND p.hidden = 0`).bind(id).first();
}

export async function projectPage(c) {
  // Static Assets는 /project.html을 /project로 돌려보내서(html_handling), 처음부터 /project를 받아 와요.
  const page = await c.env.ASSETS.fetch(new URL('/project', c.req.url));
  // DB가 실패해도 페이지는 기본 미리보기 그대로 열려야 해요.
  const p = await findPublic(c).catch((e) => (console.error(e), null));
  if (!p || !page.ok) return page;
  const origin = new URL(c.req.url).origin;
  const img = origin + (p.img ? '/uploads/' + p.img : '/img/hero.jpg');
  const meta = {
    description: p.summary,
    'og:title': p.title, 'og:description': p.summary, 'og:image': img, 'og:url': `${origin}/project.html?id=${p.id}`,
    'twitter:title': p.title, 'twitter:description': p.summary, 'twitter:image': img,
  };
  // HTMLRewriter는 글자를 알아서 이스케이프해서 제목에 "나 <가 있어도 안전해요.
  const out = new HTMLRewriter()
    .on('title', { element: (el) => el.setInnerContent(`${p.title} · PART`) })
    .on('meta', { element: (el) => {
      const k = el.getAttribute('property') || el.getAttribute('name');
      if (Object.hasOwn(meta, k)) el.setAttribute('content', meta[k]);
    } })
    .transform(page);
  const res = new Response(out.body, out);
  res.headers.delete('etag');   // 작품마다 내용이 달라서 파일 ETag를 쓰면 안 돼요
  return res;
}
