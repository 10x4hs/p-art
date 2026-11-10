// [파일 개요] 빠른 동작 확인(스모크 테스트) 스크립트예요. 임시 폴더에 로컬 Cloudflare(D1·R2)를 띄우고 핵심 API를 차례로 호출해 봐요.
// [비유] 새 가게 문을 열기 전에 직원이 손님인 척 들어와서 "회원가입 → 작품 등록 → 응원 → 감상 → 탈퇴"를 한 바퀴 돌아보는 '리허설'이에요.
// [뜻/역할] 사용: npm test   (CI(GitHub Actions)에서도 같은 명령으로 돌아요. 모두 내 컴퓨터 안에서만 돌아서 Cloudflare 로그인은 필요 없어요)
// [작성 이유] 코드를 고친 뒤 중요한 기능이 망가지지 않았는지 사람이 일일이 눌러 보지 않고 1분 안에 확인하려고요.

// [뜻/역할] Node.js 기본 도구들을 가져와요: 다른 프로그램 실행(child_process), 파일(fs), 운영체제 정보(os), 경로(path), 검사(assert).
// [문법] 'node:' 접두어는 "Node.js에 기본으로 들어 있는 모듈"이라는 표시예요.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';

// [뜻/역할] 테스트용 서버를 띄울 포트와 주소예요. 평소 개발 서버(8787)와 겹치지 않게 8799를 써요.
const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
// [뜻/역할] 프로젝트 맨 위 폴더 경로예요. import.meta.dirname은 '이 파일이 있는 폴더(scripts/)'라서 '..'으로 한 칸 올라가요.
const root = path.resolve(import.meta.dirname, '..');
// [뜻/역할] npm으로 설치된 wrangler 실행 파일 경로예요.
const wrangler = path.join(root, 'node_modules', '.bin', 'wrangler');
// [뜻/역할] 운영체제 임시 폴더에 'part-test-xxxx' 같은 새 폴더를 만들어, 테스트용 DB·R2 데이터를 여기에만 저장해요.
// [작성 이유] 내가 평소 쓰는 로컬 DB(.wrangler/)를 건드리지 않고, 매번 빈 DB에서 깨끗하게 시작하려고요.
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'part-test-'));

// [뜻/역할] 1) 빈 DB에 테이블 만들기  2) 로컬 서버 띄우기
// [문법] execFileSync는 명령이 끝날 때까지 기다리고, spawn은 서버처럼 계속 도는 프로그램을 뒤에서 켜 둬요.
//        --local과 --persist-to 덕분에 인터넷의 진짜 DB가 아니라 임시 폴더의 DB에만 적용돼요. CI: '1'은 대화형 질문을 끄는 표시예요.
execFileSync(wrangler, ['d1', 'migrations', 'apply', 'p-art', '--local', '--persist-to', persist], { cwd: root, stdio: 'ignore', env: { ...process.env, CI: '1' } });
const server = spawn(wrangler, ['dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', persist, '--show-interactive-dev-session=false'], {
  cwd: root, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, CI: '1' },
});

// [뜻/역할] 가짜 사용자 두 명(a, b)의 쿠키 보관함이에요. who가 지금 누구로 요청할지 정해요.
// [작성 이유] "남의 작품은 못 지운다" 같은 검사를 하려면 서로 다른 두 사람이 필요해요.
const jars = { a: '', b: '' };
let who = 'a';
// [뜻/역할] 서버에 요청을 보내는 도우미예요. 본문이 FormData면 그대로, 아니면 JSON으로 보내고, 받은 쿠키를 지금 사용자 보관함에 저장해요.
// [문법] { ...(조건 ? {헤더} : {}) } — 조건이 맞을 때만 그 헤더를 넣는 요령이에요.
//        set-cookie 헤더의 첫 부분(sid=값)만 잘라서 다음 요청의 cookie 헤더로 보내요. 브라우저가 해 주는 일을 손으로 흉내 내는 거예요.
async function call(method, url, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(jars[who] ? { cookie: jars[who] } : {}) },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) jars[who] = set.split(';')[0];
  return { status: res.status, data: await res.json().catch(() => null), res };
}

// [뜻/역할] 서버가 다 켜질 때까지 0.2초마다 /api/health를 두드려 봐요. 최대 150번(약 30초) 기다리고, 그래도 안 뜨면 실패예요.
// [문법] try { ... } catch {} — 아직 서버가 안 떠서 fetch가 실패해도 멈추지 말고 다시 시도하라는 뜻이에요.
async function waitUp() {
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(BASE + '/api/health')).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('서버가 뜨지 않았어요');
}

// [뜻/역할] 글 칸(fields)과 사진(files)으로 작품 등록용 FormData를 만들어 주는 도우미예요.
// [문법] Object.entries(객체)는 [[키, 값], ...] 배열로 바꿔 줘요. ([k, v]) 는 그 짝을 바로 꺼내는 구조 분해예요.
const form = (fields, files = []) => {
  const f = new FormData();
  Object.entries(fields).forEach(([k, v]) => f.append(k, v));
  files.forEach((b) => f.append('images', b, 'photo.jpg'));
  return f;
};

// [뜻/역할] 실제 테스트 순서를 담은 본 함수예요.
async function main() {
  await waitUp();
  const steps = [];
  // [뜻/역할] 조건(cond)이 참이면 '✓ 이름'을 기록하고, 거짓이면 assert가 오류를 던져 테스트를 멈춰요.
  const check = (name, cond) => { assert.ok(cond, name); steps.push('✓ ' + name); };

  // [뜻/역할] 화면 파일(ASSETS)과 분야 목록(/shared/categories.js)이 잘 나오는지 확인해요.
  check('화면 파일이 열린다', (await fetch(BASE + '/')).ok && (await fetch(BASE + '/works.html')).ok);
  check('분야 목록 공유', (await (await fetch(BASE + '/shared/categories.js')).text()).includes('학교생활'));

  // [뜻/역할] 가입·로그인 규칙을 확인해요: 이메일 소문자 저장, 중복 이메일 409, 약한 비밀번호 400, 틀린 비밀번호 401, 대소문자 섞인 이메일로도 로그인.
  let r = await call('POST', '/api/signup', { email: 'Smoke@Test.com', password: 'abcd1234', nickname: '테스터' });
  check('가입 + 이메일 소문자 저장', r.status === 200 && r.data.email === 'smoke@test.com');
  check('같은 이메일 거절', (await call('POST', '/api/signup', { email: 'smoke@test.com', password: 'abcd1234', nickname: 'xx' })).status === 409);
  check('약한 비밀번호 거절', (await call('POST', '/api/signup', { email: 'a@b.co', password: 'short', nickname: 'xx' })).status === 400);
  await call('POST', '/api/logout');
  check('틀린 비밀번호 거절', (await call('POST', '/api/login', { email: 'smoke@test.com', password: 'wrong999' })).status === 401);
  check('로그인', (await call('POST', '/api/login', { email: 'SMOKE@test.com', password: 'abcd1234' })).status === 200);

  // [뜻/역할] 아주 작은 가짜 JPEG(4바이트: 시작 표시 FFD8 + 끝 표시 FFD9)를 만들어 작품과 함께 올려요.
  // [작성 이유] 진짜 사진 파일 없이도 '사진 저장 → 내려받기' 흐름을 확인할 수 있어요. '없는분야'는 서버가 버리는지 보려고 일부러 넣었어요.
  const jpg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
  r = await call('POST', '/api/projects', form({ title: '급식 레이더', summary: '오늘 급식 한 화면에', maker: '1학년', url: 'https://example.com', cats: '학교생활,없는분야' }, [jpg]));
  const id = r.data.id;
  check('작품 등록 + 사진 저장', Number.isInteger(id));
  // [뜻/역할] javascript: 주소는 위험하니 400으로 거절돼야 해요.
  check('잘못된 주소 거절', (await call('POST', '/api/projects', form({ title: 't', summary: 's', url: 'javascript:alert(1)' }))).status === 400);

  // [뜻/역할] 분야 필터, 사진 내려받기(R2 → /uploads/키), 응원 켜기를 확인해요.
  r = await call('GET', '/api/projects?cat=학교생활');
  check('분야 필터 + 없는 분야는 버림', r.data.length === 1 && r.data[0].cats.join() === '학교생활');
  const img = await fetch(BASE + r.data[0].images[0]);
  check('사진 내려받기', img.ok && img.headers.get('content-type') === 'image/jpeg');
  check('응원 켜기', (await call('POST', `/api/projects/${id}/like`)).data.liked === true);

  // [뜻/역할] 이제 두 번째 사람(b)으로 바꿔서, 로그인 없이 할 수 있는 일과 없는 일, 남의 작품 권한을 확인해요.
  who = 'b';
  check('로그아웃 상태 응원 거절', (await call('POST', `/api/projects/${id}/like`)).status === 401);
  check('로그인 없이 감상 남기기', (await call('POST', `/api/projects/${id}/comments`, { name: '친구', text: '좋아요' })).status === 200);
  check('빈 감상 거절', (await call('POST', `/api/projects/${id}/comments`, { text: '' })).status === 400);
  check('두 번째 사용자 가입', (await call('POST', '/api/signup', { email: 'other@test.com', password: 'abcd1234', nickname: '다른친구' })).status === 200);
  check('남의 작품 삭제 거절', (await call('DELETE', `/api/projects/${id}`)).status === 403);
  who = 'a';

  // [뜻/역할] 다시 작품 주인(a)으로 돌아와서 감상 삭제 → 작품 삭제 → 회원 탈퇴까지 정리해요.
  r = await call('GET', `/api/projects/${id}/comments`);
  check('작품 주인은 감상 삭제 가능', r.data[0].canDelete === true);
  check('감상 삭제', (await call('DELETE', `/api/projects/${id}/comments/${r.data[0].id}`)).status === 200);
  check('작품 삭제', (await call('DELETE', `/api/projects/${id}`)).status === 200);
  check('회원 탈퇴', (await call('DELETE', '/api/me')).status === 200 && (await call('GET', '/api/me')).data === null);

  console.log(steps.join('\n') + `\n\n모두 통과 (${steps.length}개)`);
}

// [뜻/역할] 테스트를 실행하고, 실패하면 이유를 보여 주며 종료 코드를 1로 만들어요(CI가 '실패'로 알아봐요).
//          성공하든 실패하든 마지막에는(finally) 서버를 끄고 임시 폴더를 지워요.
main()
  .catch((e) => { console.error('✗ 실패:', e.message); process.exitCode = 1; })
  .finally(() => { server.kill(); fs.rmSync(persist, { recursive: true, force: true }); });
