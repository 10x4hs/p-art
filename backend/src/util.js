// [파일 개요] 여러 라우트(auth.js, projects.js)가 같이 쓰는 작은 도구들을 모아 둔 파일이에요.
// [비유] 교실 뒤 '공용 사물함'이에요. 가위·풀처럼 누구나 꺼내 쓰는 도구가 들어 있어요.

// [뜻/역할] 입력이 잘못됐을 때 던질(throw) 오류 객체를 만들어 돌려줘요. 기본 상태 코드는 400(잘못된 요청)이에요.
// [문법] function bad(message, status = 400) — `= 400`은 값을 안 넘기면 400을 쓰라는 '기본 매개변수'예요.
//        new Error(message)로 오류를 만들고, e.status에 상태 코드를 붙여 둬요.
// [작성 이유] 라우트에서는 `throw bad('메시지')` 한 줄만 쓰면, index.js의 onError가 이 status를 보고 { error } JSON + 상태 코드로 바꿔 보내 줘요.
export function bad(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// [뜻/역할] 요청 본문(JSON)을 안전하게 읽어요. 본문이 비었거나 JSON 모양이 깨졌으면 에러 대신 빈 객체 {}를 돌려줘요.
// [문법] c.req.json()은 Promise를 돌려주고, .catch(() => ({}))는 실패하면 빈 객체로 바꿔 줘요. `({})`처럼 괄호로 감싸야 객체로 인식돼요.
// [작성 이유] 이상한 요청 하나 때문에 서버가 500 오류를 내지 않고, 뒤의 입력 검사에서 차분히 400으로 거절하게 하려고요.
export const readJson = (c) => c.req.json().catch(() => ({}));

// [뜻/역할] 주소가 http:// 또는 https:// 로 시작하고 공백이 없는지 검사해요.
// [문법] /^https?:\/\/\S+$/ — `s?`는 s가 있어도 없어도 됨, `\/`는 / 글자, `\S+`는 공백이 아닌 글자 1개 이상이에요.
// [작성 이유] `javascript:alert(1)` 같은 위험한 주소를 작품 링크로 저장하지 못하게 막아요.
export const isHttp = (u) => /^https?:\/\/\S+$/.test(u);
// [뜻/역할] "HTML,CSS" 같은 쉼표 글자를 ['HTML', 'CSS'] 배열로 바꿔요. 값이 비었으면 빈 배열이에요.
// [작성 이유] DB에는 태그·분야를 쉼표로 이은 글자 하나로 저장하고, 화면에는 배열로 보내기 때문이에요.
export const split = (v) => (v ? v.split(',') : []);

// [뜻/역할] 접속한 사람의 IP 주소를 알아내요.
// [문법] c.req.header('이름')은 요청 헤더 값을 꺼내요. Cloudflare는 진짜 접속자 IP를 'cf-connecting-ip' 헤더로 알려 줘요.
// [작성 이유] 한 줄 감상 도배 방지(같은 IP는 1분에 5개까지)에 써요. 내 컴퓨터(로컬)에서는 이 헤더가 없을 수 있어서 'local'로 대신해요.
export const clientIp = (c) => c.req.header('cf-connecting-ip') || 'local';
