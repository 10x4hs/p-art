// 빠른 동작 확인: 임시 폴더에 서버를 띄우고 핵심 API를 차례로 호출한다.
// 사용: npm test   (CI에서도 같은 명령으로 돈다)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

// BASE_URL을 주면 이미 떠 있는 서버(wrangler dev, 배포 주소 등)를 검사한다: BASE_URL=http://localhost:8787 npm test
const PORT = 3999;
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const dataDir = process.env.BASE_URL ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'part-test-'));
const server = dataDir && spawn(process.execPath, [path.join(__dirname, '..', 'backend', 'server.js')], {
  env: { ...process.env, PORT, DATA_DIR: dataDir, NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'inherit'],
});

let cookie = '';
async function call(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function waitUp() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + '/api/health')).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('서버가 뜨지 않았어요');
}

async function main() {
  await waitUp();
  const steps = [];
  const check = (name, cond) => { assert.ok(cond, name); steps.push('✓ ' + name); };

  check('페이지가 열린다', (await fetch(BASE + '/')).ok && (await fetch(BASE + '/works.html')).ok);
  check('분야 목록 공유 파일', (await fetch(BASE + '/shared/categories.js')).ok);

  const email = process.env.BASE_URL ? `Smoke${Date.now()}@Test.com` : 'Smoke@Test.com';
  let r = await call('POST', '/api/signup', { email, password: 'abcd1234', nickname: '테스터' });
  check('가입 + 이메일 소문자 저장', r.status === 200 && r.data.email === email.toLowerCase());
  check('같은 이메일 거절', (await call('POST', '/api/signup', { email: email.toLowerCase(), password: 'abcd1234', nickname: 'xx' })).status === 409);
  check('약한 비밀번호 거절', (await call('POST', '/api/signup', { email: 'a@b.co', password: 'short', nickname: 'xx' })).status === 400);

  const form = new FormData();
  Object.entries({ title: '급식 레이더', summary: '오늘 급식 한 화면에', maker: '1학년', url: 'https://example.com', cats: '학교생활,없는분야' })
    .forEach(([k, v]) => form.append(k, v));
  r = await fetch(BASE + '/api/projects', { method: 'POST', body: form, headers: { cookie } }).then((x) => x.json());
  const id = r.id;
  check('작품 등록', Number.isInteger(id));

  r = await call('GET', '/api/projects?cat=학교생활');
  const found = r.data.find((p) => p.id === id);
  check('분야 필터 + 없는 분야는 버림', found && found.cats.join() === '학교생활');
  check('응원 켜기', (await call('POST', `/api/projects/${id}/like`)).data.liked === true);

  const mine = cookie; cookie = '';
  check('로그아웃 상태 응원 거절', (await call('POST', `/api/projects/${id}/like`)).status === 401);
  check('로그인 없이 감상 남기기', (await call('POST', `/api/projects/${id}/comments`, { name: '친구', text: '좋아요' })).status === 200);
  check('빈 감상 거절', (await call('POST', `/api/projects/${id}/comments`, { text: '' })).status === 400);
  cookie = mine;

  r = await call('GET', `/api/projects/${id}/comments`);
  check('작품 주인은 감상 삭제 가능', r.data[0].canDelete === true);
  check('감상 삭제', (await call('DELETE', `/api/projects/${id}/comments/${r.data[0].id}`)).status === 200);
  check('작품 삭제', (await call('DELETE', `/api/projects/${id}`)).status === 200);
  check('로그인 유지', (await call('GET', '/api/me')).data?.email === email.toLowerCase());
  check('회원 탈퇴', (await call('DELETE', '/api/me')).status === 200);

  console.log(steps.join('\n') + `\n\n모두 통과 (${steps.length}개)`);
}

main()
  .catch((e) => { console.error('✗ 실패:', e.message); process.exitCode = 1; })
  .finally(() => { if (server) { server.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); } });
