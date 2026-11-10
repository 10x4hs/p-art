// [파일 개요] 자동 스모크 테스트(Smoke Test) 스크립트 — 임시 폴더에 진짜 서버와 새 DB를 띄우고, 회원가입부터 작품 등록·필터·응원·감상·삭제까지 16가지 핵심 흐름을 차례대로 검증해요.
// [비유] 전시관 문을 손님에게 열기 전에, 로봇 손님이 먼저 들어와서 회원가입부터 작품 걸기·응원·방명록·삭제까지 16가지 버튼을 직접 다 눌러 보고 이상이 없는지 확인하는 '자동 점검 로봇'이에요.
// 사용: npm test   (GitHub Actions CI에서도 똑같은 명령으로 실행돼요)

// [뜻/역할] 새로운 프로그램(여기서는 우리 백엔드 서버)을 자식 프로세스로 실행하기 위해 `spawn` 함수를 불러와요.
// [문법] const { spawn } = require('child_process');
// [작성 이유] 테스트 스크립트 안에서 테스트 전용 서버를 별도로 켰다가 테스트가 끝나면 자동으로 끄기 위해서예요.
const { spawn } = require('child_process');

// [뜻/역할] 파일/폴더 다루기(`fs`), 운영체제 임시 폴더 경로 알기(`os`), 경로 합치기(`path`), 참/거짓 검증하기(`assert`) Node.js 기본 도구들을 불러와요.
// [문법] require('fs'), require('os'), require('path'), require('assert')
// [작성 이유] 외부 테스트 라이브러리(Jest 등)를 무겁게 설치하지 않고도 Node.js 내장 도구만으로 깔끔하게 통합 테스트를 돌리기 위해서예요.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

// [뜻/역할] 테스트 서버가 사용할 포트 번호(3999)와 검사할 주소(BASE)를 정해요. `BASE_URL`을 주면 그 주소를 검사해요.
// [문법] process.env.BASE_URL || `http://localhost:${PORT}` — 앞의 값이 없으면 뒤의 값을 써요.
// [작성 이유] 내 컴퓨터의 Express 서버뿐 아니라 `wrangler dev`(8787)나 실제 배포 주소도 같은 테스트로 확인하기 위해서예요.
//            예) BASE_URL=https://p-art.swx2.workers.dev npm test
const PORT = 3999;
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;

// [뜻/역할] 운영체제의 임시 폴더(`os.tmpdir()`) 안에 `part-test-무작위글자` 이름으로 새 빈 폴더를 만들어요. BASE_URL이 있으면 서버를 띄우지 않으니 만들지 않아요(null).
// [문법] fs.mkdtempSync(접두사경로)
// [작성 이유] 우리가 실제로 쓰던 `data/part.db`를 건드리지 않고, 매번 깨끗한 새 DB에서 테스트한 뒤 끝나면 폴더째 지우기 위해서예요!
const dataDir = process.env.BASE_URL ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'part-test-'));

// [뜻/역할] Node.js(`process.execPath`)로 `backend/server.js`를 실행해요. 이때 환경변수로 포트(3999)와 임시 데이터 폴더(`dataDir`)를 넣어 줘요.
// [문법] dataDir && spawn(...) — dataDir이 null이면 서버를 띄우지 않고 server도 null이 돼요.
// [작성 이유] 실제 운영 서버와 100% 똑같은 코드가 임시 폴더를 바라보며 돌아가게 하기 위해서예요.
const server = dataDir && spawn(process.execPath, [path.join(__dirname, '..', 'backend', 'server.js')], {
  env: { ...process.env, PORT, DATA_DIR: dataDir, NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'inherit'],
});

// [뜻/역할] 서버가 보내 준 로그인 세션 쿠키를 저장해 둘 변수예요(브라우저의 쿠키 보관함 역할).
let cookie = '';

// [뜻/역할] 테스트 서버에 JSON 요청을 보내고, 쿠키가 오면 챙겨 두고, 응답 상태 코드와 데이터를 돌려주는 도우미 함수예요.
// [문법] async function call(method, url, body) { ... }
// [작성 이유] `node`의 `fetch`는 브라우저처럼 쿠키를 자동으로 저장하지 않기 때문에, `set-cookie` 헤더를 직접 읽어서 다음 요청의 `cookie` 헤더에 넣어 주어야 로그인 상태가 유지돼요.
async function call(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  // [뜻/역할] 서버가 새 세션 쿠키(`set-cookie`)를 내려보냈다면 세미콜론(`;`) 앞부분(`connect.sid=...`)만 잘라서 `cookie` 변수에 기억해요.
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  // [뜻/역할] HTTP 상태 코드(`status`)와 JSON 본문(`data`)을 묶어 돌려줘요.
  return { status: res.status, data: await res.json().catch(() => null) };
}

// [뜻/역할] 방금 켠 자식 서버가 준비될 때까지 최대 5초(0.1초 간격 × 50번) 동안 `/api/health`를 찔러 보며 기다리는 함수예요.
// [문법] for 루프 안에서 `fetch`가 성공(`ok`)하면 즉시 `return`하고, 아직 안 켜졌으면 100ms 기다렸다가 다시 시도해요.
// [작성 이유] `spawn`으로 서버를 켜자마자 바로 테스트 요청을 보내면 서버가 아직 포트를 열기 전이라 연결 실패가 나기 때문이에요.
async function waitUp() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + '/api/health')).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('서버가 뜨지 않았어요');
}

// [뜻/역할] 16가지 시나리오를 순서대로 실행하고 검증하는 메인 테스트 함수예요.
async function main() {
  // [뜻/역할] 먼저 서버가 완전히 켜질 때까지 기다려요.
  await waitUp();
  const steps = [];
  // [뜻/역할] 조건(`cond`)이 참인지 검사(`assert.ok`)하고, 통과하면 체크 표시(`✓`)와 함께 목록에 기록해요. 거짓이면 즉시 에러를 던져 테스트를 멈춰요.
  const check = (name, cond) => { assert.ok(cond, name); steps.push('✓ ' + name); };

  // [검증 1] 홈(`/`)과 전시관(`/works.html`) 정적 HTML 페이지가 200 OK로 잘 열리는지 확인해요.
  check('페이지가 열린다', (await fetch(BASE + '/')).ok && (await fetch(BASE + '/works.html')).ok);
  // [검증 2] 프론트·백엔드 공용 분야 파일(`/shared/categories.js`)이 잘 내려오는지 확인해요.
  check('분야 목록 공유 파일', (await fetch(BASE + '/shared/categories.js')).ok);

  // [검증 3] 대소문자가 섞인 이메일로 가입했을 때 200 성공이 뜨고 소문자로 바뀌어 저장되는지 확인해요(이때 `cookie`에 로그인 세션이 저장됨).
  // [작성 이유] 배포 주소처럼 DB가 계속 남는 곳에서는 같은 이메일이 이미 있을 수 있어서, BASE_URL이 있으면 매번 다른 이메일(`Date.now()`)을 써요.
  const email = process.env.BASE_URL ? `Smoke${Date.now()}@Test.com` : 'Smoke@Test.com';
  let r = await call('POST', '/api/signup', { email, password: 'abcd1234', nickname: '테스터' });
  check('가입 + 이메일 소문자 저장', r.status === 200 && r.data.email === email.toLowerCase());
  // [검증 4] 이미 가입한 이메일로 또 가입하려고 하면 409(Conflict)로 거절하는지 확인해요.
  check('같은 이메일 거절', (await call('POST', '/api/signup', { email: email.toLowerCase(), password: 'abcd1234', nickname: 'xx' })).status === 409);
  // [검증 5] 숫자가 없거나 8자 미만인 약한 비밀번호(`short`)로 가입하려고 하면 400(Bad Request)으로 거절하는지 확인해요.
  check('약한 비밀번호 거절', (await call('POST', '/api/signup', { email: 'a@b.co', password: 'short', nickname: 'xx' })).status === 400);

  // [검증 6] 로그인 쿠키를 들고 `FormData`로 작품을 등록했을 때 정수 번호(`id`)가 잘 발급되는지 확인해요(분야에 `'학교생활,없는분야'`를 넣어 봄).
  const form = new FormData();
  Object.entries({ title: '급식 레이더', summary: '오늘 급식 한 화면에', maker: '1학년', url: 'https://example.com', cats: '학교생활,없는분야' })
    .forEach(([k, v]) => form.append(k, v));
  r = await fetch(BASE + '/api/projects', { method: 'POST', body: form, headers: { cookie } }).then((x) => x.json());
  const id = r.id;
  check('작품 등록', Number.isInteger(id));

  // [검증 7] `cat=학교생활`로 조회했을 때 방금 올린 작품이 검색되고, 목록에 없던 `'없는분야'`는 서버가 알아서 걸러내 `'학교생활'`만 남았는지 확인해요.
  r = await call('GET', '/api/projects?cat=학교생활');
  // [작성 이유] 배포 DB에는 다른 작품이 있을 수 있어서, 개수 대신 방금 올린 작품(`id`)을 찾아서 확인해요.
  const found = r.data.find((p) => p.id === id);
  check('분야 필터 + 없는 분야는 버림', found && found.cats.join() === '학교생활');
  // [검증 8] 작품에 ▲ 응원을 눌렀을 때 `liked: true`가 되는지 확인해요.
  check('응원 켜기', (await call('POST', `/api/projects/${id}/like`)).data.liked === true);

  // [역할 전환] 잠깐 로그인 쿠키를 치워(`cookie = ''`) 로그인하지 않은 방문자 상태를 흉내 내요.
  const mine = cookie; cookie = '';
  // [검증 9] 비로그인 상태에서 응원을 누르면 401(Unauthorized)로 거절하는지 확인해요.
  check('로그아웃 상태 응원 거절', (await call('POST', `/api/projects/${id}/like`)).status === 401);
  // [검증 10] 비로그인 상태에서도 한 줄 감상(방명록)은 200 OK로 잘 남겨지는지 확인해요.
  check('로그인 없이 감상 남기기', (await call('POST', `/api/projects/${id}/comments`, { name: '친구', text: '좋아요' })).status === 200);
  // [검증 11] 내용이 비어 있는 감상은 400으로 거절하는지 확인해요.
  check('빈 감상 거절', (await call('POST', `/api/projects/${id}/comments`, { text: '' })).status === 400);
  // [역할 복귀] 다시 작품 주인의 로그인 쿠키(`mine`)를 복구해요.
  cookie = mine;

  // [검증 12] 작품 주인이 감상 목록을 조회하면 `canDelete: true`(삭제 권한)가 붙어 오는지 확인해요.
  r = await call('GET', `/api/projects/${id}/comments`);
  check('작품 주인은 감상 삭제 가능', r.data[0].canDelete === true);
  // [검증 13] 작품 주인이 해당 감상을 삭제하면 200 OK로 지워지는지 확인해요.
  check('감상 삭제', (await call('DELETE', `/api/projects/${id}/comments/${r.data[0].id}`)).status === 200);
  // [검증 14] 마지막으로 작품을 삭제하면 200 OK로 지워지는지 확인해요.
  check('작품 삭제', (await call('DELETE', `/api/projects/${id}`)).status === 200);
  // [검증 15] 여러 요청을 거친 뒤에도 쿠키 하나로 로그인이 그대로 유지되는지 확인해요.
  check('로그인 유지', (await call('GET', '/api/me')).data?.email === email.toLowerCase());
  // [검증 16] 회원 탈퇴가 되는지 확인해요. 배포 주소에서 테스트해도 가짜 계정이 남지 않게 마지막에 지워요.
  check('회원 탈퇴', (await call('DELETE', '/api/me')).status === 200);

  // [뜻/역할] 16가지 검사가 모두 통과했음을 터미널에 멋지게 출력해요.
  console.log(steps.join('\n') + `\n\n모두 통과 (${steps.length}개)`);
}

// [뜻/역할] `main()`을 실행하고, 만약 하나라도 실패(`.catch`)하면 에러를 출력하고 종료 코드를 1(실패)로 설정해요. 성공하든 실패하든 마지막(`.finally`)에는 직접 띄운 서버가 있으면(BASE_URL 없이 실행했을 때) 반드시 끄고(`server.kill()`) 임시 폴더(`dataDir`)를 깨끗이 지워요.
main()
  .catch((e) => { console.error('✗ 실패:', e.message); process.exitCode = 1; })
  .finally(() => { if (server) { server.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); } });
