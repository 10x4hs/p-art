// ============================================================================
// [파일 개요] PART 프로젝트 전체가 처음부터 끝까지 제대로 작동하는지 자동으로 검증하는
// 스모크 테스트(End-to-End 통합 테스트, `npm test`) 스크립트예요.
// - 내 컴퓨터의 임시 폴더(`os.tmpdir()`)에 깨끗한 로컬 D1 데이터베이스와 로컬 R2 버킷을 띄운 뒤,
//   실제 `wrangler dev` 서버를 켜고 59가지 시나리오(화면 열림 → 가입·로그인 → 작품 등록·사진 업로드 →
//   응원·감상 → 팀원·조회수·북마크·OG 미리보기 → 신고 3회 자동 숨김·관리자 복구 → 작품 삭제·회원 탈퇴)를
//   차례대로 실행해 확인해요.
// - 모든 과정이 내 컴퓨터 안에서만 돌아가므로 Cloudflare 계정 로그인이나 인터넷 연결 없이도 언제든 실행할 수 있어요.
// [비유] 전시관을 손님에게 열기 전에, 로봇 관람객(a, b, c, d, 관리자 boss)을 보내 모든 스위치와 창구를 하나씩 다 눌러 보게 하는 자동 점검 로봇이에요.
// ============================================================================

// [뜻/역할] Node.js에 기본 내장된 자식 프로세스 실행(`spawn`, `execFileSync`), 파일 시스템(`fs`), 운영체제 임시 폴더(`os`), 경로 계산(`path`), 참/거짓 단언 검사(`assert`) 모듈을 불러와요.
// [문법] `'node:...'` 접두사를 붙이면 외부 패키지가 아니라 Node.js 표준 내장 모듈임을 명확히 나타내요.
// [작성 이유] 별도의 무거운 테스트 프레임워크(Jest 등)를 설치하지 않고 Node.js 기본 기능만으로 빠르고 가볍게 테스트를 돌리기 위해서예요.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';

// [뜻/역할] 테스트 서버를 띄울 포트 번호(`8799`), 기본 주소(`BASE`), 프로젝트 루트 경로(`root`), 로컬 `wrangler` 실행 파일 경로를 준비해요.
// [문법] `import.meta.dirname`은 현재 파일(`scripts/smoke-test.js`)이 있는 폴더 경로이고, `'..'`로 한 단계 올라가 프로젝트 루트 폴더를 찾아요.
// [작성 이유] 평소에 개발할 때 쓰는 `npm run dev` 기본 포트(`8787`)와 겹치지 않도록 테스트 전용 포트(`8799`)를 따로 써요.
const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const root = path.resolve(import.meta.dirname, '..');
const wrangler = path.join(root, 'node_modules', '.bin', 'wrangler');

// [뜻/역할] 매 테스트마다 완전히 비어 있는 새 임시 폴더(`persist`)를 만들고, 환경 변수와 테스트용 관리자 이메일(`ADMIN`)을 설정해요.
// [문법] `fs.mkdtempSync(path.join(os.tmpdir(), 'part-test-'))`는 운영체제 임시 폴더 안에 겹치지 않는 새 폴더를 만들어 경로를 돌려줘요.
// [작성 이유] 평소 개발할 때 쓰는 로컬 DB(`.wrangler/`) 데이터를 건드리지 않고, 언제 실행해도 항상 똑같은 초기 상태에서 100% 재현 가능한 테스트를 하기 위해서예요.
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'part-test-'));
const env = { ...process.env, CI: '1' };
const ADMIN = 'boss@test.com';

// [뜻/역할] ① 방금 만든 임시 폴더(`persist`)에 D1 마이그레이션(`0001_init.sql`, `0002_features.sql`)을 먼저 적용하고, ② 그 폴더와 관리자 이메일 변수(`ADMIN_EMAILS`)를 연결해 `wrangler dev` 테스트 서버를 백그라운드 자식 프로세스로 실행해요.
// [문법]
// - `execFileSync`: 마이그레이션이 완전히 끝날 때까지 기다려요(동기 실행).
// - `spawn`: 서버는 계속 떠 있어야 하므로 비동기 프로세스로 띄우고 `server` 변수에 담아 둬요(테스트가 끝나면 `server.kill()`로 종료해요).
// [작성 이유] 실제 배포 환경과 똑같은 Cloudflare Workers + D1 + R2 런타임 위에서 모든 API와 HTML을 진짜로 검증하기 위해서예요.
execFileSync(wrangler, ['d1', 'migrations', 'apply', 'p-art', '--local', '--persist-to', persist], { cwd: root, stdio: 'ignore', env });
const server = spawn(wrangler, ['dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', persist, '--var', `ADMIN_EMAILS:${ADMIN}`, '--show-interactive-dev-session=false'], {
  cwd: root, stdio: ['ignore', 'ignore', 'inherit'], env,
});

// [뜻/역할] 여러 가상 사용자(`'a'`, `'b'`, `'c'`, `'d'`, `'boss'`, `'guest'`)의 로그인 쿠키(`sid`)를 각각 따로 보관하는 쿠키 병(`jars`)과 요청 도우미 함수(`call`)예요.
// [문법]
// - `who` 변수에 현재 행동할 사용자 이름을 넣으면, `call()`이 자동으로 `jars[who]`의 쿠키를 요청 헤더에 실어 보내고, 서버가 새 `set-cookie`를 주면 다시 `jars[who]`에 저장해요.
// - 응답 상태 코드(`status`)와 JSON 데이터(`data`)를 묶어 돌려줘요.
// [작성 이유] Node.js의 기본 `fetch`는 브라우저처럼 쿠키를 자동 저장하지 않기 때문에, 여러 명의 사용자가 번갈아 로그인하고 권한을 시험하는 상황을 흉내 내기 위해서예요.
const jars = {};
let who = 'a';
async function call(method, url, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(jars[who] ? { cookie: jars[who] } : {}) },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) jars[who] = set.split(';')[0];
  return { status: res.status, data: await res.json().catch(() => null) };
}

// [뜻/역할] 방금 띄운 `wrangler dev` 서버가 준비될 때까지 0.2초(200ms) 간격으로 최대 30초(150번) 동안 `/api/health`를 찔러 보며 기다리는 함수예요.
// [문법] `fetch(BASE + '/api/health')`가 성공(`ok`)하면 즉시 반환하고, 끝까지 안 뜨면 에러를 던져요.
// [작성 이유] 컴퓨터 성능에 따라 서버가 켜지는 데 1~5초가 걸릴 수 있어서, 무조건 정해진 시간을 기다리는 대신 준비되자마자 바로 테스트를 시작하기 위해서예요.
async function waitUp() {
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(BASE + '/api/health')).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('서버가 뜨지 않았어요');
}

// [뜻/역할] 작품 등록·수정 API에 보낼 멀티파트 `FormData`(글자 필드들 + 사진 파일들)를 간편하게 만들어 주는 도우미 함수예요.
const form = (fields, files = []) => {
  const f = new FormData();
  Object.entries(fields).forEach(([k, v]) => f.append(k, v));
  files.forEach((b) => f.append('images', b, 'photo.jpg'));
  return f;
};

// [뜻/역할] 59가지 테스트 항목을 순서대로 실행하는 메인 함수예요.
async function main() {
  await waitUp();
  const steps = [];
  // [뜻/역할] 조건(`cond`)이 참인지 검사(`assert.ok`)하고, 통과하면 `steps` 목록에 `'✓ 항목이름'`을 기록해요.
  const check = (name, cond) => { assert.ok(cond, name); steps.push('✓ ' + name); };

  // ── 1. 정적 화면 파일 및 공유 메타 태그 확인 (5개 항목) ──
  check('화면 파일이 열린다', (await fetch(BASE + '/')).ok && (await fetch(BASE + '/works.html')).ok);
  check('분야 목록 공유', (await (await fetch(BASE + '/shared/categories.js')).text()).includes('학교생활'));

  const pages = ['/', '/works.html', '/project.html', '/edit.html', '/profile.html', '/kit.html', '/login.html', '/signup.html', '/admin.html'];
  const html = await Promise.all(pages.map(async (u) => (await fetch(BASE + u)).text()));
  check('모든 화면에 기본 공유 미리보기(og·twitter)', html.every((h) => h.includes('property="og:image" content="https://') && h.includes('name="twitter:card"')));
  check('임시 저장 코드(edit.html)', html[3].includes('part-draft:'));
  check('사이트 미리보기 iframe(project.html)', html[2].includes('sandbox="allow-scripts allow-forms allow-same-origin allow-popups"'));

  // ── 2. 회원가입 · 로그인 · 비밀번호 검증 (5개 항목) ──
  let r = await call('POST', '/api/signup', { email: 'Smoke@Test.com', password: 'abcd1234', nickname: '테스터' });
  check('가입 + 이메일 소문자 저장', r.status === 200 && r.data.email === 'smoke@test.com');
  const aid = r.data.id;
  check('같은 이메일 거절', (await call('POST', '/api/signup', { email: 'smoke@test.com', password: 'abcd1234', nickname: 'xx' })).status === 409);
  check('약한 비밀번호 거절', (await call('POST', '/api/signup', { email: 'a@b.co', password: 'short', nickname: 'xx' })).status === 400);
  await call('POST', '/api/logout');
  check('틀린 비밀번호 거절', (await call('POST', '/api/login', { email: 'smoke@test.com', password: 'wrong999' })).status === 401);
  check('로그인', (await call('POST', '/api/login', { email: 'SMOKE@test.com', password: 'abcd1234' })).status === 200);

  // ── 3. 작품 등록 · 사진(R2) 업로드 · 응원 · 감상 · 권한 검사 (12개 항목) ──
  // [뜻/역할] 4바이트짜리 최소 JPEG 바이트(`0xff, 0xd8, 0xff, 0xd9`)로 사진 업로드를 시험하고, 목록에 없는 분야(`'없는분야'`)를 서버가 자동으로 걸러내는지 함께 확인해요.
  const jpg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
  r = await call('POST', '/api/projects', form({ title: '급식 레이더', summary: '오늘 급식 한 화면에', maker: '1학년', url: 'https://example.com', cats: '학교생활,없는분야' }, [jpg]));
  const id = r.data.id;
  check('작품 등록 + 사진 저장', Number.isInteger(id));
  check('잘못된 주소 거절', (await call('POST', '/api/projects', form({ title: 't', summary: 's', url: 'javascript:alert(1)' }))).status === 400);

  r = await call('GET', '/api/projects?cat=학교생활');
  check('분야 필터 + 없는 분야는 버림', r.data.length === 1 && r.data[0].cats.join() === '학교생활');
  const img = await fetch(BASE + r.data[0].images[0]);
  check('사진 내려받기', img.ok && img.headers.get('content-type') === 'image/jpeg');
  check('응원 켜기', (await call('POST', `/api/projects/${id}/like`)).data.liked === true);

  who = 'b';
  check('로그아웃 상태 응원 거절', (await call('POST', `/api/projects/${id}/like`)).status === 401);
  check('로그인 없이 감상 남기기', (await call('POST', `/api/projects/${id}/comments`, { name: '친구', text: '좋아요' })).status === 200);
  check('빈 감상 거절', (await call('POST', `/api/projects/${id}/comments`, { text: '' })).status === 400);
  check('두 번째 사용자 가입', (await call('POST', '/api/signup', { email: 'other@test.com', password: 'abcd1234', nickname: '다른친구' })).status === 200);
  check('남의 작품 삭제 거절', (await call('DELETE', `/api/projects/${id}`)).status === 403);
  who = 'a';

  r = await call('GET', `/api/projects/${id}/comments`);
  check('작품 주인은 감상 삭제 가능', r.data[0].canDelete === true);
  check('감상 삭제', (await call('DELETE', `/api/projects/${id}/comments/${r.data[0].id}`)).status === 200);

  // ── 4. 함께 만든 팀원 지정 및 검색 (7개 항목) ──
  const fields = { title: '급식 레이더', summary: '오늘 급식 한 화면에', url: 'https://example.com', cats: '학교생활' };
  r = await call('GET', '/api/users?q=' + encodeURIComponent('다른'));
  check('닉네임으로 회원 찾기(이메일은 안 보임)', r.status === 200 && r.data.length === 1 && r.data[0].nickname === '다른친구' && !('email' in r.data[0]));
  const bid = r.data[0].id;
  check('빈 검색어 거절', (await call('GET', '/api/users?q=')).status === 400);
  check('없는 회원은 팀원 거절', (await call('PUT', `/api/projects/${id}`, form({ ...fields, members: `${bid},999999` }))).status === 400);
  check('팀원 6명 이상 거절', (await call('PUT', `/api/projects/${id}`, form({ ...fields, members: '11,12,13,14,15,16' }))).status === 400);
  check('팀원 저장(주인·중복은 빼요)', (await call('PUT', `/api/projects/${id}`, form({ ...fields, members: `${bid},${bid},${aid}` }))).status === 200);
  r = await call('GET', `/api/projects/${id}`);
  check('상세에 팀원 목록', JSON.stringify(r.data.members) === JSON.stringify([{ id: bid, nickname: '다른친구' }]));
  check('팀원으로 참여한 작품 목록', (await call('GET', `/api/projects?member=${bid}`)).data.map((p) => p.id).join() === String(id));

  // ── 5. 조회수 증가 규칙 및 북마크 토글 (8개 항목) ──
  who = 'b';
  check('남이 보면 조회수 +1', (await call('GET', `/api/projects/${id}`)).data.views === 1);
  who = 'a';
  check('주인이 보면 조회수 그대로', (await call('GET', `/api/projects/${id}`)).data.views === 1);
  who = 'b';
  r = await call('POST', `/api/projects/${id}/bookmark`);
  check('북마크 켜기', r.data.bookmarked === true && r.data.bookmarks === 1);
  check('내 북마크 목록', (await call('GET', '/api/projects?bookmarked=1')).data.map((p) => p.id).join() === String(id));
  check('상세에 북마크 여부·수', (await call('GET', `/api/projects/${id}`)).data.bookmarked === true);
  check('북마크 끄기', (await call('POST', `/api/projects/${id}/bookmark`)).data.bookmarked === false);
  who = 'guest';
  check('로그아웃 상태 북마크 거절', (await call('POST', `/api/projects/${id}/bookmark`)).status === 401);
  check('로그아웃 상태 북마크 목록 거절', (await call('GET', '/api/projects?bookmarked=1')).status === 401);

  // ── 6. 동적 Open Graph 공유 미리보기 (`backend/src/og.js`) (3개 항목) ──
  const og = async () => (await fetch(`${BASE}/project.html?id=${id}`)).text();
  let page = await og();
  check('작품 페이지 og:title = 작품 제목', page.includes('<meta property="og:title" content="급식 레이더">') && page.includes('<title>급식 레이더 · PART</title>'));
  check('확장자 없는 /project도 같은 미리보기', (await (await fetch(`${BASE}/project?id=${id}`)).text()).includes('content="급식 레이더"'));
  check('없는 작품은 기본 미리보기', (await (await fetch(`${BASE}/project.html?id=999999`)).text()).includes('<meta property="og:title" content="PART'));

  // ── 7. 작품 신고 및 3명 누적 시 자동 숨김 처리 (8개 항목) ──
  who = 'b';
  check('빈 신고 이유 거절', (await call('POST', `/api/projects/${id}/report`, { reason: ' ' })).status === 400);
  check('신고하기', (await call('POST', `/api/projects/${id}/report`, { reason: '광고 같아요' })).status === 200);
  check('같은 작품 두 번 신고 거절', (await call('POST', `/api/projects/${id}/report`, { reason: '또' })).status === 409);
  who = 'a';
  check('내 작품은 신고 불가', (await call('POST', `/api/projects/${id}/report`, { reason: '테스트' })).status === 400);
  for (const n of ['c', 'd']) {
    who = n;
    await call('POST', '/api/signup', { email: `${n}@test.com`, password: 'abcd1234', nickname: '신고자' + n });
    await call('POST', `/api/projects/${id}/report`, { reason: '이상해요 ' + n });
  }
  who = 'guest';
  check('신고 3명이면 숨김: 남에겐 404', (await call('GET', `/api/projects/${id}`)).status === 404);
  check('숨긴 작품은 목록에서 빠짐', !(await call('GET', '/api/projects')).data.some((p) => p.id === id));
  page = await og();
  check('숨긴 작품은 기본 미리보기', !page.includes('급식 레이더') && page.includes('<meta property="og:title" content="PART'));
  who = 'a';
  r = await call('GET', `/api/projects/${id}`);
  check('주인은 숨긴 작품을 볼 수 있음', r.status === 200 && r.data.hidden === 1);

  // ── 8. 관리자 검토 · 숨김 해제 · 작품 삭제 · 회원 탈퇴 (11개 항목) ──
  check('일반 회원은 isAdmin false', (await call('GET', '/api/me')).data.isAdmin === false);
  check('일반 회원은 관리 API 거절', (await call('GET', '/api/admin/reports')).status === 403);
  who = 'boss';
  r = await call('POST', '/api/signup', { email: ADMIN, password: 'abcd1234', nickname: '관리자' });
  check('관리자 이메일은 isAdmin true', r.data.isAdmin === true && (await call('GET', '/api/me')).data.isAdmin === true);
  r = await call('GET', '/api/admin/reports');
  const rep = r.data.find((x) => x.id === id);
  check('신고 목록(건수·이유)', r.status === 200 && rep.reports === 3 && rep.hidden === 1 && rep.reasons.includes('광고 같아요'));
  check('관리자는 숨긴 작품을 볼 수 있음', (await call('GET', `/api/projects/${id}`)).status === 200);
  check('잘못된 숨김 값 거절', (await call('POST', `/api/admin/projects/${id}/hide`, { hidden: 2 })).status === 400);
  check('관리자가 숨김 풀기', (await call('POST', `/api/admin/projects/${id}/hide`, { hidden: 0 })).status === 200);
  check('신고 지우기', (await call('DELETE', `/api/admin/projects/${id}/reports`)).status === 200 && !(await call('GET', '/api/admin/reports')).data.length);
  who = 'guest';
  check('숨김을 풀면 다시 보임', (await call('GET', `/api/projects/${id}`)).status === 200);
  who = 'a';
  check('작품 삭제', (await call('DELETE', `/api/projects/${id}`)).status === 200);
  check('회원 탈퇴', (await call('DELETE', '/api/me')).status === 200 && (await call('GET', '/api/me')).data === null);

  console.log(steps.join('\n') + `\n\n모두 통과 (${steps.length}개)`);
}

// [뜻/역할] `main()`을 실행하고, 성공하든 실패하든 마지막(`finally`)에는 반드시 테스트 서버(`server.kill()`)를 끄고 임시 폴더(`persist`)를 깨끗이 지워요.
main()
  .catch((e) => { console.error('✗ 실패:', e.message); process.exitCode = 1; })
  .finally(() => { server.kill(); fs.rmSync(persist, { recursive: true, force: true }); });
