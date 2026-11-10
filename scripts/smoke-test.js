// [파일 개요] 스모크 테스트예요(npm test). 임시 폴더에 로컬 D1·R2를 띄우고 가입 → 등록 → 응원 → 감상 → 팀원·북마크·신고 → 탈퇴를 한 바퀴 돌아봐요.
// 모두 내 컴퓨터에서만 돌아서 Cloudflare 로그인은 필요 없어요.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const root = path.resolve(import.meta.dirname, '..');
const wrangler = path.join(root, 'node_modules', '.bin', 'wrangler');
// 평소 로컬 DB(.wrangler/)를 건드리지 않게 매번 빈 임시 폴더에서 시작해요.
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'part-test-'));
const env = { ...process.env, CI: '1' };   // CI=1: 대화형 질문 끄기
const ADMIN = 'boss@test.com';              // 이 테스트에서만 쓰는 관리자 이메일(ADMIN_EMAILS)

execFileSync(wrangler, ['d1', 'migrations', 'apply', 'p-art', '--local', '--persist-to', persist], { cwd: root, stdio: 'ignore', env });
const server = spawn(wrangler, ['dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', persist, '--var', `ADMIN_EMAILS:${ADMIN}`, '--show-interactive-dev-session=false'], {
  cwd: root, stdio: ['ignore', 'ignore', 'inherit'], env,
});

// 사용자별(a, b, …) 쿠키 보관함이에요. call()이 브라우저처럼 sid 쿠키를 저장해서 다시 보내요.
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

// 서버가 뜰 때까지 0.2초마다 최대 30초 기다려요.
async function waitUp() {
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(BASE + '/api/health')).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('서버가 뜨지 않았어요');
}

const form = (fields, files = []) => {
  const f = new FormData();
  Object.entries(fields).forEach(([k, v]) => f.append(k, v));
  files.forEach((b) => f.append('images', b, 'photo.jpg'));
  return f;
};

async function main() {
  await waitUp();
  const steps = [];
  const check = (name, cond) => { assert.ok(cond, name); steps.push('✓ ' + name); };

  check('화면 파일이 열린다', (await fetch(BASE + '/')).ok && (await fetch(BASE + '/works.html')).ok);
  check('분야 목록 공유', (await (await fetch(BASE + '/shared/categories.js')).text()).includes('학교생활'));

  const pages = ['/', '/works.html', '/project.html', '/edit.html', '/profile.html', '/kit.html', '/login.html', '/signup.html', '/admin.html'];
  const html = await Promise.all(pages.map(async (u) => (await fetch(BASE + u)).text()));
  check('모든 화면에 기본 공유 미리보기(og·twitter)', html.every((h) => h.includes('property="og:image" content="https://') && h.includes('name="twitter:card"')));
  check('임시 저장 코드(edit.html)', html[3].includes('part-draft:'));
  check('사이트 미리보기 iframe(project.html)', html[2].includes('sandbox="allow-scripts allow-forms allow-same-origin allow-popups"'));

  let r = await call('POST', '/api/signup', { email: 'Smoke@Test.com', password: 'abcd1234', nickname: '테스터' });
  check('가입 + 이메일 소문자 저장', r.status === 200 && r.data.email === 'smoke@test.com');
  const aid = r.data.id;
  check('같은 이메일 거절', (await call('POST', '/api/signup', { email: 'smoke@test.com', password: 'abcd1234', nickname: 'xx' })).status === 409);
  check('약한 비밀번호 거절', (await call('POST', '/api/signup', { email: 'a@b.co', password: 'short', nickname: 'xx' })).status === 400);
  await call('POST', '/api/logout');
  check('틀린 비밀번호 거절', (await call('POST', '/api/login', { email: 'smoke@test.com', password: 'wrong999' })).status === 401);
  check('로그인', (await call('POST', '/api/login', { email: 'SMOKE@test.com', password: 'abcd1234' })).status === 200);

  // 4바이트짜리 가짜 JPEG예요. '없는분야'는 서버가 버리는지 보려고 넣었어요.
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

  // ── 팀원 지정 (FR-07) ──
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

  // ── 조회수 (FR-21) · 북마크 (FR-18) ──
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

  // ── 공유 미리보기 (FR-20): 공개 작품은 그 작품의 제목이 og:title에 들어가요 ──
  const og = async () => (await fetch(`${BASE}/project.html?id=${id}`)).text();
  let page = await og();
  check('작품 페이지 og:title = 작품 제목', page.includes('<meta property="og:title" content="급식 레이더">') && page.includes('<title>급식 레이더 · PART</title>'));
  check('확장자 없는 /project도 같은 미리보기', (await (await fetch(`${BASE}/project?id=${id}`)).text()).includes('content="급식 레이더"'));
  check('없는 작품은 기본 미리보기', (await (await fetch(`${BASE}/project.html?id=999999`)).text()).includes('<meta property="og:title" content="PART'));

  // ── 신고 · 숨김 (FR-22) ──
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

  // ── 관리자 (FR-22) ──
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

main()
  .catch((e) => { console.error('✗ 실패:', e.message); process.exitCode = 1; })
  .finally(() => { server.kill(); fs.rmSync(persist, { recursive: true, force: true }); });
