// 여러 라우트가 같이 쓰는 작은 도구

// 입력이 잘못됐을 때 던지는 오류. index.js의 onError가 { error } JSON + 상태 코드로 바꿔 보낸다
export function bad(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// 요청 본문(JSON)을 안전하게 읽기 — 비었거나 깨졌으면 빈 객체
export const readJson = (c) => c.req.json().catch(() => ({}));

export const isHttp = (u) => /^https?:\/\/\S+$/.test(u);
export const split = (v) => (v ? v.split(',') : []);

// 접속한 사람의 IP (Cloudflare가 헤더로 알려 준다. 내 컴퓨터에서는 'local')
export const clientIp = (c) => c.req.header('cf-connecting-ip') || 'local';
