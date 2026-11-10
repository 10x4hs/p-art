// [파일 개요] auth.js·projects.js가 같이 쓰는 작은 도구 모음이에요.

// throw bad('메시지') 하면 index.js의 onError가 { error } + 상태 코드(기본 400)로 응답해요.
export function bad(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

// 본문 JSON이 깨졌으면 500 대신 빈 객체를 줘서, 뒤의 입력 검사가 400으로 거절하게 해요.
export const readJson = (c) => c.req.json().catch(() => ({}));
// http(s) 주소만 허용해서 javascript: 같은 위험한 링크를 막아요.
export const isHttp = (u) => /^https?:\/\/\S+$/.test(u);
// DB의 "HTML,CSS" 글자를 ['HTML', 'CSS'] 배열로 바꿔요.
export const split = (v) => (v ? v.split(',') : []);
// 감상 도배 방지용 IP예요. 로컬에선 헤더가 없어서 'local'이에요.
export const clientIp = (c) => c.req.header('cf-connecting-ip') || 'local';

// 관리자 = 이메일이 ADMIN_EMAILS(쉼표로 구분, wrangler.jsonc의 vars)에 들어 있는 회원이에요.
export const isAdminEmail = (c, email) =>
  String(c.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((e) => e.trim()).filter(Boolean).includes(email);

// 지금 로그인한 사람이 관리자인지 확인해요.
export async function isAdmin(c) {
  if (!c.get('uid')) return false;
  const u = await c.env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(c.get('uid')).first();
  return !!u && isAdminEmail(c, u.email);
}
