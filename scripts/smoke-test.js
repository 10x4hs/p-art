// 빠른 동작 확인: 임시 폴더에 로컬 Cloudflare(D1·KV)를 띄우고 핵심 API를 차례로 호출한다.
// 사용: npm test   (CI에서도 같은 명령으로 돈다. Cloudflare 로그인은 필요 없음)
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const root = path.resolve(import.meta.dirname, '..');
const wrangler = path.join(root, 'node_modules', '.bin', 'wrangler');
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'part-test-'));

// 1) 빈 DB에 테이블 만들기  2) 로컬 서버 띄우기
execFileSync(wrangler, ['d1', 'migrations', 'apply', 'p-art', '--local', '--persist-to', persist], { cwd: root, stdio: 'ignore', env: { ...process.env, CI: '1' } });
const server = spawn(wrangler, ['dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', persist, '--show-interactive-dev-session=false'], {
  cwd: root, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, CI: '1' },
});

const jars = { a: '', b: '' };
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
  return { status: res.status, data: await res.json().catch(() => null), res };
}

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

  let r = await call('POST', '/api/signup', { email: 'Smoke@Test.com', password: 'abcd1234', nickname: '테스터' });
  check('가입 + 이메일 소문자 저장', r.status === 200 && r.data.email === 'smoke@test.com');
  check('같은 이메일 거절', (await call('POST', '/api/signup', { email: 'smoke@test.com', password: 'abcd1234', nickname: 'xx' })).status === 409);
  check('약한 비밀번호 거절', (await call('POST', '/api/signup', { email: 'a@b.co', password: 'short', nickname: 'xx' })).status === 400);
  await call('POST', '/api/logout');
  check('틀린 비밀번호 거절', (await call('POST', '/api/login', { email: 'smoke@test.com', password: 'wrong999' })).status === 401);
  check('로그인', (await call('POST', '/api/login', { email: 'SMOKE@test.com', password: 'abcd1234' })).status === 200);

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
  check('작품 삭제', (await call('DELETE', `/api/projects/${id}`)).status === 200);
  check('회원 탈퇴', (await call('DELETE', '/api/me')).status === 200 && (await call('GET', '/api/me')).data === null);

  console.log(steps.join('\n') + `\n\n모두 통과 (${steps.length}개)`);
}

main()
  .catch((e) => { console.error('✗ 실패:', e.message); process.exitCode = 1; })
  .finally(() => { server.kill(); fs.rmSync(persist, { recursive: true, force: true }); });
