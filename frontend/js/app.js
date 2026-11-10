// [파일 개요] 프론트엔드 공통 스크립트 — 8개 HTML 페이지가 모두 함께 쓰는 필수 도구, 서버 통신(`api`), 상단 메뉴(`nav`), 작품 카드(`card`), 응원 처리, 단계별 입력 폼(`stepForm`)을 모아 둔 파일이에요.
// [비유] 모든 전시실에 공통으로 쓰이는 '만능 공구함'이에요. 액자 틀(`card`)이나 안내판(`nav`)을 여기 한곳에 만들어 두어 어느 방에서든 똑같이 꺼내 써요.

// [뜻/역할] CSS 선택자(`s`)로 화면 요소(DOM) 하나를 빠르게 찾는 짧은 별명 함수예요.
// [문법] const $ = (s, el = document) => el.querySelector(s); — `el`을 안 넘기면 문서 전체(`document`)에서 찾고, 넘기면 그 요소 안에서만 찾아요.
// [작성 이유] `document.querySelector('#nav')`처럼 매번 길게 쓰지 않고 `$('#nav')`로 간결하게 쓰기 위해서예요.
const $ = (s, el = document) => el.querySelector(s);

// [뜻/역할] CSS 선택자(`s`)에 해당하는 모든 화면 요소를 찾아 진짜 배열(Array)로 돌려주는 함수예요.
// [문법] [...el.querySelectorAll(s)] — `querySelectorAll`이 돌려주는 NodeList를 전개 연산자(`...`)로 감싸서 `.map()`, `.forEach()` 등을 마음껏 쓸 수 있는 배열로 바꿔요.
// [작성 이유] 여러 개의 버튼이나 카드를 한꺼번에 다룰 때 편리하기 때문이에요.
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// [뜻/역할] 사용자가 입력한 글자 속에 HTML 특수기호(`&`, `<`, `>`, `"`, `'`)가 있으면 안전한 문자 엔티티로 바꿔 주는 보안 함수(이스케이프)예요.
// [문법] 정규식 `/[&<>"']/g`로 다섯 기호를 모두 찾아 대응표 객체에서 안전한 글자로 치환해요.
// [작성 이유] 누군가 작품 제목이나 방명록에 `<script>해킹코드</script>`를 넣었을 때, 다른 사람 브라우저에서 그 코드가 실행되는 XSS(교차 사이트 스크립팅) 공격을 완벽히 막기 위해서예요!
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// [뜻/역할] 현재 브라우저 주소창의 물음표 뒤(`?id=3&cat=게임`)에서 원하는 이름(`k`)의 값을 꺼내 주는 함수예요.
// [문법] new URLSearchParams(location.search).get(k)
// [작성 이유] 상세 페이지나 수정 페이지가 "지금 몇 번 작품을 보여 줘야 하지?"(`param('id')`)를 쉽게 알 수 있게 해 줘요.
const param = (k) => new URLSearchParams(location.search).get(k);

// [참고] CATS(분야 목록)는 이 파일보다 먼저 불러오는 `/shared/categories.js`에서 전역 변수로 제공돼요.

// [뜻/역할] 사용자가 작품 사진을 한 장도 안 올렸을 때 대신 보여 줄 기본 대표 사진 경로예요.
// [문법] const FALLBACK_IMG = '/img/hero.jpg';
// [작성 이유] 사진이 없는 작품이라도 전시관 카드의 레이아웃이 깨지지 않고 멋지게 보이게 하기 위해서예요.
const FALLBACK_IMG = '/img/hero.jpg';

// [뜻/역할] 작품 번호(`id`)를 받아 그 작품의 전체 인터넷 주소(예: `https://.../project.html?id=3`)를 만들어 주는 함수예요.
// [문법] `${location.origin}/project.html?id=${id}` — `location.origin`은 현재 사이트의 도메인 주소예요.
// [작성 이유] '주소 복사' 버튼이나 홍보 키트 문구를 만들 때 어느 서버(내 컴퓨터든 실제 배포 도메인이든)에서나 맞는 주소를 만들기 위해서예요.
const pageUrl = (id) => `${location.origin}/project.html?id=${id}`;

// [뜻/역할] 백엔드 서버(`/api/...`)에 요청을 보내고 응답 JSON을 받아 오는 공통 비동기 함수예요.
// [문법] async function api(url, method = 'GET', body) { ... } — method를 안 적으면 기본으로 `'GET'` 요청을 보내요.
// [작성 이유] `fetch`를 부를 때마다 헤더 설정, JSON 변환, 에러 처리를 반복해서 쓰지 않고 한 함수로 통일하기 위해서예요.
async function api(url, method = 'GET', body) {
  // [뜻/역할] `fetch`에 넘길 옵션 객체를 만들고 요청 방식(GET/POST/PUT/DELETE)을 담아요.
  const opts = { method };
  // [뜻/역할] 보내는 데이터(`body`)가 사진을 포함한 `FormData` 상자라면 헤더 건드리지 않고 그대로 담아요(브라우저가 자동으로 multipart 경계선을 붙여 줌).
  if (body instanceof FormData) opts.body = body;
  // [뜻/역할] 일반 객체 데이터라면 `'Content-Type': 'application/json'` 헤더를 붙이고 JSON 글자로 변환(`JSON.stringify`)해서 담아요.
  else if (body) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
  // [뜻/역할] 서버에 요청을 보내고 응답이 도착할 때까지 기다려요(`await`).
  const res = await fetch(url, opts);
  // [뜻/역할] 응답 본문을 JSON 객체로 풀어요. 혹시 JSON이 아니더라도 에러가 나지 않게 빈 객체(`{}`)로 대체해요.
  const data = await res.json().catch(() => ({}));
  // [뜻/역할] 만약 서버 응답이 성공(200번대, `res.ok`)이 아니라면, 서버가 보낸 에러 문구(`data.error`)와 상태 코드(`res.status`)를 담아 에러(`throw e`)를 던져요.
  // [작성 이유] 부른 쪽의 `try ... catch (err)` 블록으로 즉시 점프해서 사용자에게 에러 원인을 보여 줄 수 있게 해요.
  if (!res.ok) { const e = new Error(data.error || '잠시 후 다시 해 주세요'); e.status = res.status; throw e; }
  // [뜻/역할] 성공했다면 서버가 보낸 데이터를 그대로 돌려줘요.
  return data;
}

// [뜻/역할] 화면 테마를 어두운 화면(기본)과 밝은 화면(`light` 클래스) 사이에서 전환하고 브라우저에 기억시키는 함수예요.
// [문법] classList.toggle('light', 불리언) — 두 번째 인자가 true면 클래스를 붙이고, false면 떼어요.
// [작성 이유] 사용자가 밝은 화면을 골랐다면 다른 페이지로 이동하거나 새로고침해도 계속 밝은 화면이 유지되게(`localStorage`) 하기 위해서예요.
function setTheme(light) {
  // [뜻/역할] `<html>` 태그(`document.documentElement`)에 `light` 클래스를 붙이거나 떼어요.
  document.documentElement.classList.toggle('light', light);
  // [뜻/역할] 브라우저 저장소(`localStorage`)에 현재 테마를 기록해요(시크릿 모드 등에서 막혀 있어도 에러가 안 나게 `try-catch`로 감쌈).
  try { localStorage.setItem('theme', light ? 'light' : 'dark'); } catch {}
  // [뜻/역할] 상단 메뉴의 테마 버튼 모양(달 `☾` / 해 `☀`)과 스크린 리더용 설명(`aria-label`)을 현재 상태에 맞게 바꿔요.
  const b = $('#themeBtn');
  if (b) { b.textContent = light ? '☾' : '☀'; b.setAttribute('aria-label', light ? '어두운 화면으로' : '밝은 화면으로'); }
}

// [뜻/역할] 화면 상단에 떠 있는 유리 모양 내비게이션 바(`#nav`)를 그리고, 현재 로그인한 사용자 정보를 돌려주는 비동기 함수예요.
// [문법] async function nav() { ... }
// [작성 이유] 모든 페이지가 똑같은 상단 메뉴를 공유하면서, 로그인 여부에 따라 왼쪽 링크를 `닉네임` 또는 `Login / Sign up`으로 다르게 보여 주기 위해서예요.
async function nav() {
  // [뜻/역할] 서버에 `/api/me`를 물어봐서 지금 로그인한 사용자 정보를 가져와요(실패하면 `null`).
  const user = await api('/api/me').catch(() => null);
  // [뜻/역할] 현재 화면이 밝은 테마인지 확인해요.
  const light = document.documentElement.classList.contains('light');
  // [뜻/역할] HTML 파일의 `<div id="nav"></div>` 자리를 완성된 `<nav>` 태그로 통째로 갈아 끼워요(`outerHTML`).
  $('#nav').outerHTML = `<nav class="nav glass" id="nav" aria-label="PART 메뉴">
    <a class="logo" href="/" aria-label="PART 처음으로" style="text-decoration:none"><span class="wm"><span class="p">P</span><span class="art">ART</span></span></a>
    <div class="auth">${user
      ? `<a class="auth-link nav-me" href="/profile.html?id=${user.id}">${esc(user.nickname)}</a>`
      : `<a class="auth-link" href="/login.html">Login</a><a class="auth-link" href="/signup.html">Sign up</a>`}</div>
    <div class="nav-links">
      <a class="nav-link" href="/works.html">전시관</a>
      <a class="nav-link" href="/#how">사용법</a>
    </div>
    <button class="theme-btn" id="themeBtn" type="button" aria-label="${light ? '어두운 화면으로' : '밝은 화면으로'}">${light ? '☾' : '☀'}</button>
    <a class="btn btn-hot" href="/edit.html">내 작품 걸기</a>
  </nav>`;
  // [뜻/역할] 테마 전환 버튼을 누르면 현재 테마의 반대로 바뀌도록 클릭 이벤트를 연결해요.
  $('#themeBtn').onclick = () => setTheme(!document.documentElement.classList.contains('light'));
  // [뜻/역할] 확인된 로그인 사용자 객체(`user`)를 돌려줘서, 부른 페이지(`edit.html`, `profile.html`)가 한 번 더 `/api/me`를 부르지 않고 바로 재사용할 수 있게 해요.
  return user;
}

// [뜻/역할] 모든 페이지 맨 아래에 들어갈 공통 바닥글(Footer) HTML 문자열이에요.
// [문법] const FOOTER = `<footer ...>...</footer>`;
// [작성 이유] 각 페이지에서 `$('#foot').outerHTML = FOOTER;` 한 줄로 바닥글을 통일하기 위해서예요.
const FOOTER = `<footer class="wrap foot">
  <p><b style="color:var(--ink);font-weight:500">PART</b> — Project + Art, 우리 학교 학생 작품 전시관</p>
  <p>사진: Unsplash, StockSnap, rawpixel (CC0)</p>
</footer>`;

// [뜻/역할] 화면 아래쪽 가운데에 1.9초 동안 부드럽게 떴다가 사라지는 알림창(Toast)을 띄워 주는 함수예요.
// [문법] clearTimeout(toastTimer) 후 setTimeout(..., 1900)으로 타이머를 재설정해요.
// [작성 이유] 브라우저 기본 `alert()` 창은 화면을 멈추게 하고 디자인도 투박해서, 전시관 분위기에 맞는 유리 스타일 알림창을 만든 거예요.
let toastTimer;
function toast(msg) {
  // [뜻/역할] 이미 만들어진 `#toast` 요소가 있는지 찾고, 없으면 새로 만들어서 `<body>` 끝에 붙여요.
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast glass'; t.setAttribute('role', 'status'); document.body.append(t); }
  // [뜻/역할] 알림 문구를 넣고 숨김 클래스(`hide`)를 제거해 화면에 보여 줘요.
  t.textContent = msg; t.classList.remove('hide');
  // [뜻/역할] 이전에 돌아가던 숨김 타이머가 있으면 취소하고, 새로 1.9초(1900ms) 뒤에 숨겨지도록 예약해요.
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hide'), 1900);
}

// [뜻/역할] 원하는 글자(`text`)를 사용자의 클립보드에 복사하고 성공 알림(`ok`)을 띄워 주는 비동기 함수예요.
// [문법] await navigator.clipboard.writeText(text);
// [작성 이유] 작품 상세 페이지의 '주소 복사'와 홍보 키트의 '문구 복사'에서 공통으로 쓰기 위해서예요.
async function copyText(text, ok) {
  try { await navigator.clipboard.writeText(text); toast(ok); }
  catch { toast('복사가 막혀 있어요. 글자를 직접 선택해 주세요'); }
}

// [뜻/역할] 작품이 등록된 지 만 하루(24시간 = 86,400,000밀리초)가 안 지났는지 계산해 `true`/`false`를 돌려주는 함수예요.
// [문법] SQLite의 UTC 시각(`YYYY-MM-DD HH:MM:SS`)을 ISO 표준 형식(`YYYY-MM-DDTHH:MM:SSZ`)으로 바꾼 뒤 현재 시각(`Date.now()`)에서 빼요.
// [작성 이유] 방금 올라온 따끈따끈한 작품 카드 왼쪽 위에 `New` 배지를 달아 주기 위해서예요.
const isNew = (p) => Date.now() - new Date(p.created_at.replace(' ', 'T') + 'Z').getTime() < 86400000;

// [뜻/역할] 작품의 첫 번째 사진을 돌려주고, 올린 사진이 없으면 기본 사진(`FALLBACK_IMG`)을 돌려줘요.
const imgOf = (p) => p.images[0] || FALLBACK_IMG;

// [뜻/역할] 작품에 적힌 '만든 사람'(`p.maker`)을 돌려주고, 비어 있으면 계정 닉네임(`p.author`)을 돌려줘요.
const makerOf = (p) => p.maker || p.author;

// [뜻/역할] 응원 버튼 안에 들어갈 삼각형(▲) 아이콘 SVG 태그와 응원 버튼 HTML을 만들어 주는 함수예요.
// [문법] `data-cheer="${p.id}"` 속성으로 어느 작품의 응원 버튼인지 표시하고, `aria-pressed="${p.liked}"`로 내가 이미 눌렀는지(주황색 활성화)를 표시해요.
// [작성 이유] 카드 안의 작은 응원 버튼(`wide = false`)과 상세 페이지의 넓은 응원 버튼(`wide = true`)을 같은 함수로 만들기 위해서예요.
const UP_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5 L14.5 11.5 H1.5 Z"></path></svg>';
const upBtn = (p, wide) => `<button class="up${wide ? ' up-wide' : ''}" data-cheer="${p.id}" aria-pressed="${p.liked}" aria-label="${esc(p.title)} 응원하기, 지금 ${p.likes}개">${UP_SVG}<b>${p.likes}</b>${wide ? '응원' : ''}</button>`;

// [뜻/역할] 작품 데이터 객체(`p`) 하나를 받아 전시관 액자 모양의 `<article class="card">` HTML 문자열로 바꿔 주는 함수예요.
// [문법] 템플릿 리터럴 안에서 모든 사용자 입력값에 반드시 `esc()`를 씌워 안전하게 끼워 넣어요.
// [작성 이유] 홈, 전시관, 프로필, 홍보 키트 4곳에서 모두 이 함수 하나로 카드를 그려서, 카드 디자인을 고칠 때 여기 한 곳만 수정하면 되게 했어요.
function card(p) {
  return `<article class="card">
    <a class="card-img" href="/project.html?id=${p.id}" aria-label="${esc(p.title)} 작품 보기" tabindex="-1"><img src="${esc(imgOf(p))}" alt="${esc(p.title)} 대표 사진" loading="lazy"></a>
    <div class="card-top"><span class="pill glass mono">${esc(p.cats[0] || '작품')}</span>${
      !p.is_public ? '<span class="pill glass mono private">비공개</span>' : isNew(p) ? '<span class="pill glass mono" style="color:var(--ink)">New</span>' : ''}</div>
    <div class="card-bar glass">
      <div class="card-t"><h3><a href="/project.html?id=${p.id}" style="text-decoration:none">${esc(p.title)}</a></h3><p>${esc(p.summary)}</p>
        <p class="mono"><a href="${esc(p.url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">▶ 바로 해 보기</a> · ${esc(makerOf(p))}</p></div>
      ${upBtn(p)}
    </div></article>`;
}

// [뜻/역할] 문서 전체에서 `data-cheer` 속성이 붙은 ▲ 응원 버튼 클릭을 감지해 서버에 응원 토글을 요청하고 화면 숫자를 즉시 갱신해요.
// [문법] 이벤트 위임(Event Delegation) — 버튼마다 일일이 이벤트를 달지 않고 `document`에 단 하나만 달아서 `e.target.closest('[data-cheer]')`로 찾아요.
// [작성 이유] 서버에서 데이터를 받아 와 나중에 동적으로 그려진 카드들의 응원 버튼도 별도 연결 없이 자동으로 동작하게 하기 위해서예요!
document.addEventListener('click', async (e) => {
  // [뜻/역할] 클릭된 지점에서 가장 가까운 `[data-cheer]` 버튼을 찾고, 응원 버튼이 아니면 그냥 넘어가요.
  const btn = e.target.closest('[data-cheer]');
  if (!btn) return;
  // [뜻/역할] 버튼에 적힌 작품 번호(`data-cheer="3"` → `id = "3"`)를 꺼내요.
  const id = btn.dataset.cheer;
  try {
    // [뜻/역할] 서버에 응원 토글(`POST /api/projects/:id/like`)을 요청해요.
    const r = await api(`/api/projects/${id}/like`, 'POST');
    // [뜻/역할] 화면에 있는 같은 작품의 모든 응원 버튼(`[data-cheer="3"]`)과 응원 숫자 표시(`[data-cheers="3"]`, 히어로 카드·이번주의 작품·사이드바 등)를 한꺼번에 새 숫자로 바꿔요!
    $$(`[data-cheer="${id}"]`).forEach((b) => { b.setAttribute('aria-pressed', r.liked); b.querySelector('b').textContent = r.likes; });
    $$(`[data-cheers="${id}"]`).forEach((el) => (el.textContent = r.likes));
    // [뜻/역할] 응원이 켜졌는지 취소되었는지 토스트 알림을 띄워요.
    toast(r.liked ? '응원을 보냈어요' : '응원을 취소했어요');
  } catch (err) {
    // [뜻/역할] 만약 로그인하지 않은 상태(401 에러)에서 눌렀다면 안내를 띄우고 0.9초 뒤 로그인 화면으로 보내 줘요(`?next=`에 현재 주소를 담아 로그인 후 원래 보던 곳으로 돌아오게 함!).
    if (err.status === 401) { toast('로그인하면 응원할 수 있어요'); setTimeout(() => (location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search)), 900); }
    else toast(err.message);
  }
});

// [뜻/역할] 로그인(`login.html`)과 가입(`signup.html`)에서 한 번에 한 칸씩만 깔끔하게 입력받는 단계별 폼(Step Form) 생성기예요.
// [문법] steps 배열(`[{ ph, type, auto, mode, check }]`)과 최종 완료 콜백 `done(vals)`을 받아요.
// [작성 이유] 복잡한 입력칸을 한 화면에 다 늘어놓지 않고, 대화하듯 하나씩 물어보는 세련된 UX를 로그인과 가입 양쪽에서 재사용하기 위해서예요.
const ARROW = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>';
function stepForm(steps, done, { counter = false } = {}) {
  // [뜻/역할] 현재 몇 번째 단계인지 가리키는 번호(`i = 0`)와 각 단계에 입력한 값들을 모아 둘 배열(`vals`)을 준비해요.
  let i = 0; const vals = [];
  const box = $('#step');
  // [뜻/역할] 현재 단계(`i`)에 맞는 입력칸과 안내 메시지를 화면에 그리는 내부 함수예요.
  const show = (msg = '') => {
    const s = steps[i];
    // [뜻/역할] 위쪽 영역(`.auth-top`: 단계 번호와 '이전' 버튼)을 항상 고정 높이(76px)로 유지해서, 1단계에서 2단계로 넘어갈 때 입력칸 위치가 위아래로 덜컥거리며 움직이지 않게 해요!
    box.innerHTML = `<div class="auth-top">
        ${counter ? `<p class="auth-step">${i + 1} / ${steps.length}</p>` : ''}
        <button class="back${i ? '' : ' is-off'}" type="button" ${i ? '' : 'tabindex="-1" aria-hidden="true"'}><span aria-hidden="true">←</span>${esc(i ? (counter ? '이전' : vals[0]) : '이전')}</button>
      </div>
      <form><label class="big-pill"><span class="vh">${esc(s.ph)}</span>
        <input type="${s.type || 'text'}" placeholder="${esc(s.ph)}" value="${esc(vals[i] || '')}" autocomplete="${s.auto || 'off'}"${s.mode ? ` inputmode="${s.mode}"` : ''}>
        <button class="go" type="submit" aria-label="${i < steps.length - 1 ? '다음' : '완료'}">${ARROW}</button></label></form>
      <p class="auth-msg" role="status">${esc(msg)}</p>`;
    // [뜻/역할] 단계가 바뀌면 사용자가 마우스를 다시 클릭할 필요 없이 바로 타이핑할 수 있게 입력칸에 포커스를 줘요.
    $('input', box).focus();
    // [뜻/역할] 2단계 이상(`i > 0`)일 때 '이전' 버튼을 누르면 지금 적은 값을 임시 보관하고 이전 단계(`i--`)로 돌아가요.
    if (i) $('.back', box).addEventListener('click', () => { vals[i] = $('input', box).value; i--; show(); });
    // [뜻/역할] 엔터를 치거나 화살표 버튼을 눌렀을 때(submit) 현재 칸을 검사하고 다음 단계 또는 최종 완료(`done`)를 실행해요.
    $('form', box).onsubmit = async (e) => {
      // [뜻/역할] 폼 제출 시 페이지가 새로고침되는 브라우저 기본 동작을 막아요.
      e.preventDefault();
      vals[i] = $('input', box).value;
      try {
        // [뜻/역할] 해당 단계에 검사 함수(`s.check`)가 있으면 실행해요. 규칙에 어긋나면 에러가 던져져 아래 `catch`로 가요.
        s.check?.(vals[i], vals);
        // [뜻/역할] 아직 마지막 단계가 아니면 다음 단계(`i++`)를 보여 주고, 마지막 단계면 모아 둔 값 전체(`vals`)를 `done` 함수에 넘겨 서버에 요청해요.
        if (i < steps.length - 1) { i++; show(); } else await done(vals);
      } catch (err) { $('.auth-msg', box).textContent = err.message; }
    };
  };
  // [뜻/역할] 처음 1단계(`i = 0`) 화면을 그려요.
  show();
  // [뜻/역할] 서버 응답 에러(예: 409 이미 가입한 이메일)가 났을 때 특정 단계(`n`)로 강제로 되돌아가며 에러 문구를 띄울 수 있게 `{ goTo }` 제어 객체를 돌려줘요.
  return { goTo: (n, msg) => { i = n; show(msg); } };
}
