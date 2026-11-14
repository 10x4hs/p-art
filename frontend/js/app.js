// ============================================================================
// [파일 개요] 모든 화면(HTML 파일 9개)이 공통으로 불러와 쓰는 프론트엔드 만능 도구 상자예요.
// - DOM 요소 찾기(`$`, `$$`), XSS 방지 이스케이프(`esc`), 서버 API 통신(`api`),
//   밝은/어두운 테마 전환(`setTheme`), 상단 내비게이션 바·하단 푸터 그리기(`nav`),
//   토스트 알림(`toast`), 클립보드 복사(`copyText`), 작품 카드 렌더링(`card`),
//   ▲ 응원 클릭 처리, 검색·정렬·분야 필터(`filters`), 단계별 로그인·가입 폼(`stepForm`)이 들어 있어요.
// - 분야 목록(`window.CATS`)은 이 파일보다 먼저 실행되는 `/shared/categories.js`가 채워 줘요.
// [비유] 모든 전시실(페이지)에 공통으로 비치된 조명 스위치·안내판·작품 액자 틀·무전기 모음이에요.
// ============================================================================

// [뜻/역할] CSS 선택자로 HTML 요소 하나(`$`) 또는 여러 개를 배열로(`$$`) 찾아 주는 짧은 별명 함수예요.
// [문법] `el.querySelector(s)`는 첫 번째 요소 하나를, `[...el.querySelectorAll(s)]`는 찾은 NodeList를 진짜 배열로 펼쳐 돌려줘요.
// [작성 이유] 매번 긴 `document.querySelector(...)`를 치지 않고 `$('#nav')`처럼 짧고 읽기 쉽게 쓰기 위해서예요.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// [뜻/역할] 사용자가 입력한 글자(제목·소개·닉네임·감상 등)를 HTML에 끼워 넣기 전에 특수기호(`&`, `<`, `>`, `"`, `'`)를 안전한 문자(HTML 엔티티)로 바꿔 주는 함수예요.
// [문법] 정규식 `/[&<>"']/g`로 5가지 위험 기호를 모두 찾아 대응표 객체에서 바꾼 글자로 치환해요.
// [작성 이유] 누군가 작품 제목이나 댓글에 `<script>악성코드</script>`를 적어 올렸을 때, 다른 사람 브라우저에서 그 코드가 실행되는 해킹(XSS 공격)을 완벽히 막기 위해서예요.
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// [뜻/역할] 현재 브라우저 주소창의 쿼리 스트링(`?id=3&sort=hot`)에서 원하는 이름(`k`)의 값을 꺼내요.
// [문법] `new URLSearchParams(location.search).get(k)` 내장 웹 API를 사용해요.
// [작성 이유] `/project.html?id=3`에서 작품 번호 `3`을 쉽게 읽기 위해서예요.
const param = (k) => new URLSearchParams(location.search).get(k);

// [뜻/역할] 사진을 올리지 않은 작품에 대신 보여 줄 기본 대표 이미지 경로예요.
const FALLBACK_IMG = '/img/hero.jpg';

// [뜻/역할] 작품 번호(`id`)를 받아 공유할 전체 웹 주소(`https://.../project.html?id=번호`)를 만들고(`pageUrl`), 로그인이 필요할 때 원래 보던 페이지 주소(`?next=...`)를 달아 로그인 화면으로 보내는(`toLogin`) 함수예요.
// [문법] `encodeURIComponent`로 현재 경로와 쿼리를 안전하게 인코딩해 `?next=` 뒤에 붙여요.
// [작성 이유] 응원이나 북마크를 누르다 로그인 화면으로 갔을 때, 로그인 직후 원래 보던 작품 페이지로 자동 복귀시켜 주기 위해서예요.
const pageUrl = (id) => `${location.origin}/project.html?id=${id}`;
const toLogin = () => (location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search));

// [뜻/역할] 백엔드 서버(`/api/...`)에 요청을 보내고 JSON 응답을 받아 오는 공통 통신 함수예요.
// [문법]
// - `body instanceof FormData`: 사진 파일이 담긴 `FormData`는 브라우저가 자동으로 멀티파트 경계선(`boundary`) 헤더를 붙여야 하므로 `Content-Type`을 직접 지정하지 않고 그대로 넘겨요.
// - 일반 객체 `body`는 `JSON.stringify(body)`로 문자열로 바꾸고 `'Content-Type': 'application/json'` 헤더를 붙여요.
// - 응답이 실패(`!res.ok`)하면 서버가 보낸 `data.error` 문구와 상태 코드(`res.status`)를 담은 `Error`를 던져요(`throw`).
// [작성 이유] 모든 페이지에서 `fetch`·JSON 변환·에러 처리를 중복 작성하지 않고 `await api('/api/projects')` 한 줄로 깔끔하게 쓰기 위해서예요.
async function api(url, method = 'GET', body) {
  const opts = { method };
  if (body instanceof FormData) opts.body = body;
  else if (body) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || '잠시 후 다시 해 주세요'); e.status = res.status; throw e; }
  return data;
}

// [뜻/역할] 화면을 밝은 테마(`light = true`) 또는 어두운 테마(`light = false`)로 바꾸고 브라우저 저장소(`localStorage`)에 기억해 둬요.
// [문법] `<html>` 태그(`document.documentElement`)에 `.light` 클래스를 토글하고, 상단 테마 버튼(`#themeBtn`) 아이콘을 달(`☾`)이나 해(`☀`)로 바꿔요.
// [작성 이유] 사용자가 다른 페이지로 이동하거나 새로고침해도 내가 고른 테마가 그대로 유지되게 하기 위해서예요(사파리 시크릿 모드 등에서 `localStorage`가 막혀도 에러가 안 나게 `try`로 감쌌어요).
function setTheme(light) {
  document.documentElement.classList.toggle('light', light);
  try { localStorage.setItem('theme', light ? 'light' : 'dark'); } catch {}
  const b = $('#themeBtn');
  if (b) { b.textContent = light ? '☾' : '☀'; b.setAttribute('aria-label', light ? '어두운 화면으로' : '밝은 화면으로'); }
}

// [뜻/역할] 모든 페이지의 상단 메뉴 바(`#nav`)와 하단 바닥글(`#foot`)을 그리고, 현재 로그인한 사용자 정보(비로그인이면 `null`)를 돌려줘요.
// [문법]
// - `await api('/api/me').catch(() => null)`로 로그인 상태를 확인해요.
// - 로그인한 경우 닉네임과 내 프로필 링크를 보여 주고, 관리자(`user.isAdmin`)이면 `'관리'`(`/admin.html`) 링크를 추가로 표시해요.
// - 비로그인 상태면 `Login`과 `Sign up` 링크를 보여 줘요.
// [작성 이유] 9개 HTML 파일마다 똑같은 메뉴 바와 푸터 코드를 복사해 넣지 않고, 이 함수 하나로 일관되게 관리하기 위해서예요.
async function nav() {
  $('#foot').outerHTML = `<footer class="wrap foot">
  <p><b style="color:var(--ink);font-weight:500">PART</b> — Project + Art, 우리 학교 학생 작품 전시관</p>
  <p>사진: Unsplash, StockSnap, rawpixel (CC0)</p>
</footer>`;
  const user = await api('/api/me').catch(() => null);
  const light = document.documentElement.classList.contains('light');
  $('#nav').outerHTML = `<nav class="nav glass" id="nav" aria-label="PART 메뉴">
    <a class="logo" href="/" aria-label="PART 처음으로" style="text-decoration:none"><span class="wm"><span class="p">P</span><span class="art">ART</span></span></a>
    <div class="auth">${user
      ? `${user.isAdmin ? '<a class="auth-link" href="/admin.html">관리</a>' : ''}<a class="auth-link nav-me" href="/profile.html?id=${user.id}">${esc(user.nickname)}</a>`
      : `<a class="auth-link" href="/login.html">Login</a><a class="auth-link" href="/signup.html">Sign up</a>`}</div>
    <div class="nav-links">
      <a class="nav-link" href="/works.html">전시관</a>
      <a class="nav-link" href="/#how">사용법</a>
    </div>
    <button class="theme-btn" id="themeBtn" type="button" aria-label="${light ? '어두운 화면으로' : '밝은 화면으로'}">${light ? '☾' : '☀'}</button>
    <a class="btn btn-hot" href="/edit.html">내 작품 걸기</a>
  </nav>`;
  $('#themeBtn').onclick = () => setTheme(!document.documentElement.classList.contains('light'));
  return user;
}

// [뜻/역할] 화면 아래쪽 중앙에 1.9초 동안 부드럽게 떴다가 사라지는 작은 알림창(토스트)을 띄워요.
// [문법] `#toast` 요소가 없으면 처음 한 번 만들어서 `document.body`에 붙이고, `setTimeout`으로 1900밀리초 뒤에 `.hide` 클래스를 붙여 숨겨요.
// [작성 이유] 브라우저 기본 `alert()` 창은 화면을 멈추고 디자인도 투박하므로, 전시관 분위기에 어울리는 유리 질감(`.glass`) 알림을 보여 주기 위해서예요.
let toastTimer;
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast glass'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.classList.remove('hide');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hide'), 1900);
}

// [뜻/역할] 전달받은 글자(`text`)를 클립보드에 복사하고 성공 토스트(`ok`)를 띄워 줘요.
// [문법] `navigator.clipboard.writeText(text)` 비동기 함수를 호출해요.
// [작성 이유] 작품 주소 공유 버튼과 홍보 키트 문구 복사 버튼에서 공통으로 사용하기 위해서예요.
async function copyText(text, ok) {
  try { await navigator.clipboard.writeText(text); toast(ok); }
  catch { toast('복사가 막혀 있어요. 글자를 직접 선택해 주세요'); }
}

// [뜻/역할] 작품이 등록된 지 24시간(86,400,000밀리초) 이내인지 확인(`isNew`), 대표 사진 주소 결정(`imgOf`), 만든 사람 표기 결정(`makerOf`)을 해 주는 작은 도우미 함수들이에요.
// [문법] SQLite의 UTC 시각 문자열(`YYYY-MM-DD HH:MM:SS`) 중간 공백을 `'T'`로 바꾸고 끝에 `'Z'`(UTC 표시)를 붙여 `new Date(...)`로 정확히 읽어요.
// [작성 이유] 방금 올린 따끈따끈한 작품에 `New` 배지를 달아 주고, 사진을 안 올렸으면 기본 사진(`FALLBACK_IMG`)을, 만든 사람 칸을 비웠으면 작성자 닉네임(`p.author`)을 대신 보여 주기 위해서예요.
const isNew = (p) => Date.now() - new Date(p.created_at.replace(' ', 'T') + 'Z').getTime() < 86400000;
const imgOf = (p) => p.images[0] || FALLBACK_IMG;
const makerOf = (p) => p.maker || p.author;

// [뜻/역할] 삼각형 모양의 '▲ 응원' 버튼 HTML 문자열을 만들어 돌려줘요.
// [문법] `data-cheer="${p.id}"`에 작품 번호를, `aria-pressed="${p.liked}"`에 내가 이미 응원했는지 여부를 넣고, `wide`가 참이면 상세 페이지용 넓은 캡슐 버튼(`.up-wide`)으로 만들어요.
// [작성 이유] 작품 목록 카드와 작품 상세 페이지 양쪽에서 똑같은 응원 버튼을 그리되 크기만 다르게 재사용하기 위해서예요.
const upBtn = (p, wide) => `<button class="up${wide ? ' up-wide' : ''}" data-cheer="${p.id}" aria-pressed="${p.liked}" aria-label="${esc(p.title)} 응원하기, 지금 ${p.likes}개"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5 L14.5 11.5 H1.5 Z"></path></svg><b>${p.likes}</b>${wide ? '응원' : ''}</button>`;

// [뜻/역할] 작품 객체(`p`) 하나를 받아 전시관 액자 모양의 카드(`<article class="card">`) HTML로 변환해요.
// [문법]
// - 모든 사용자 입력값(`title`, `summary`, `url`, `maker` 등)은 `esc()`로 감싸서 넣어요.
// - 상태에 따라 오른쪽 위 배지(`.card-top`)에 `'숨김'`(`p.hidden`), `'비공개'`(`!p.is_public`), 또는 `'New'`(`isNew(p)`)를 표시해요.
// [작성 이유] 홈, 전시관, 프로필, 홍보 키트 페이지가 모두 이 함수 하나로 작품 카드를 똑같이 그려 내기 위해서예요.
function card(p) {
  return `<article class="card">
    <a class="card-img" href="/project.html?id=${p.id}" aria-label="${esc(p.title)} 작품 보기" tabindex="-1"><img src="${esc(imgOf(p))}" alt="${esc(p.title)} 대표 사진" loading="lazy"></a>
    <div class="card-top"><span class="pill glass mono">${esc(p.cats[0] || '작품')}</span>${
      p.hidden ? '<span class="pill glass mono private">숨김</span>' : !p.is_public ? '<span class="pill glass mono private">비공개</span>' : isNew(p) ? '<span class="pill glass mono" style="color:var(--ink)">New</span>' : ''}</div>
    <div class="card-bar glass">
      <div class="card-t"><h3><a href="/project.html?id=${p.id}" style="text-decoration:none">${esc(p.title)}</a></h3><p>${esc(p.summary)}</p>
        <p class="mono"><a href="${esc(p.url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">▶ 바로 해 보기</a> · ${esc(makerOf(p))}</p></div>
      ${upBtn(p)}
    </div></article>`;
}

// [뜻/역할] 페이지 어디에서든 '▲ 응원' 버튼(`[data-cheer]`)을 누르면 서버에 응원 토글 요청을 보내고 화면의 숫자와 색상을 즉시 바꿔 주는 전역 클릭 리스너예요.
// [문법]
// - `e.target.closest('[data-cheer]')`: 클릭한 지점에서 가장 가까운 응원 버튼을 찾는 '이벤트 위임(Event Delegation)' 패턴이에요.
// - 한 화면에 같은 작품이 여러 곳(예: 홈 히어로 스택 + 이번 주의 작품 + 목록 카드)에 떠 있을 수 있으므로 `$$('[data-cheer="번호"]')`와 `$$('[data-cheers="번호"]')`를 모두 찾아 숫자를 동시에 맞춰 줘요.
// [작성 이유] 카드를 새로 그릴 때마다 버튼에 일일이 클릭 이벤트를 다시 걸지 않아도 언제나 자동으로 작동하게 하기 위해서예요. 비로그인(`401`)이면 안내 토스트를 띄운 뒤 로그인 화면으로 보내 줘요.
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-cheer]');
  if (!btn) return;
  const id = btn.dataset.cheer;
  try {
    const r = await api(`/api/projects/${id}/like`, 'POST');
    $$(`[data-cheer="${id}"]`).forEach((b) => { b.setAttribute('aria-pressed', r.liked); b.querySelector('b').textContent = r.likes; });
    $$(`[data-cheers="${id}"]`).forEach((el) => (el.textContent = r.likes));
    toast(r.liked ? '응원을 보냈어요' : '응원을 취소했어요');
  } catch (err) {
    if (err.status === 401) { toast('로그인하면 응원할 수 있어요'); setTimeout(toLogin, 900); }
    else toast(err.message);
  }
});

// [뜻/역할] 홈(`index.html`)과 전시관(`works.html`)에서 함께 쓰는 검색창(`#q`), 정렬 버튼(`[data-sort]`), 분야 칩(`#chips`)을 초기화하고 이벤트로 연결해 줘요.
// [문법]
// - 분야 칩이나 정렬 버튼을 누르면 `state` 객체를 바꾸고 `list()`를 다시 호출해요.
// - 검색창(`#q.oninput`)은 타이핑할 때마다 요청을 보내지 않고, 손가락을 멈추고 0.25초(250ms) 뒤에 `list()`를 부르는 '디바운스(Debounce)' 기법을 써요.
// [작성 이유] 한글 자음·모음을 치는 도중에 불필요한 API 요청이 수십 번 날아가는 것을 막아 서버 부담을 줄이고 화면 깜빡임을 없애기 위해서예요.
function filters(state, list) {
  const chips = () => ($('#chips').innerHTML = ['', ...CATS].map((c) =>
    `<button type="button" class="chip" data-cat="${c}" aria-pressed="${state.cat === c}">${c || '전체'}</button>`).join(''));
  const sorts = () => $$('[data-sort]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.sort === state.sort));
  $('#chips').onclick = (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; state.cat = b.dataset.cat; chips(); list(); };
  $$('[data-sort]').forEach((b) => (b.onclick = () => { state.sort = b.dataset.sort; sorts(); list(); }));
  let qt;
  $('#q').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value.trim(); list(); }, 250); };
  chips(); sorts();
}

// [뜻/역할] 없는 작품이거나 없는 회원 프로필일 때 보여 줄 빈 안내 상자 HTML을 만들어요.
const notFound = (msg) => `<div class="empty glass"><p>${msg}</p><a class="btn btn-hot" href="/">전시관으로</a></div>`;

// [뜻/역할] 작품 배열(`rows`)을 받아 `#grid` 영역에 카드들을 그리고, 만약 조건에 맞는 작품이 하나도 없으면 친절한 안내 문구와 '첫 번째로 걸어 보기' 버튼을 보여 줘요.
const grid = (rows, state) => ($('#grid').innerHTML = rows.length ? rows.map(card).join('') :
  `<div class="empty glass"><p>${state.q || state.cat ? '찾는 작품이 아직 없어요.' : '아직 걸린 작품이 없어요.'}</p><a class="btn btn-hot" href="/edit.html">첫 번째로 걸어 보기</a></div>`);

// [뜻/역할] 로그인(`login.html`)과 회원가입(`signup.html`)에서 질문을 한 번에 한 칸씩만 물어보는 대화형 단계별 폼을 만들어 주는 함수예요.
// [문법]
// - `steps` 배열(각 단계의 안내문 `ph`, 입력 타입 `type`, 검사 함수 `check`)을 받아 현재 단계 `i`의 입력칸을 그려요.
// - 엔터를 치거나 화살표 버튼(`.go`)을 누르면 `s.check(현재값, 전체값)`을 실행하고, 통과하면 다음 단계(`i++`)로 넘어가거나 마지막 단계면 `done(vals)`를 호출해요.
// - 서버에서 에러(예: 이미 가입된 이메일 409)가 오면 반환된 `{ goTo }` 함수로 원하는 단계로 즉시 되돌아가 에러 문구를 띄워요.
// [작성 이유] 입력칸이 여러 개 늘어선 복잡한 폼 대신 한 번에 하나씩만 집중해서 입력하게 해 가입·로그인 경험을 훨씬 깔끔하게 만들기 위해서예요.
const ARROW = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>';
function stepForm(steps, done, { counter = false } = {}) {
  let i = 0; const vals = [];
  const box = $('#step');
  const show = (msg = '') => {
    const s = steps[i];
    box.innerHTML = `<div class="auth-top">
        ${counter ? `<p class="auth-step">${i + 1} / ${steps.length}</p>` : ''}
        <button class="back${i ? '' : ' is-off'}" type="button" ${i ? '' : 'tabindex="-1" aria-hidden="true"'}><span aria-hidden="true">←</span>${esc(i ? (counter ? '이전' : vals[0]) : '이전')}</button>
      </div>
      <form><label class="big-pill"><span class="vh">${esc(s.ph)}</span>
        <input type="${s.type || 'text'}" placeholder="${esc(s.ph)}" value="${esc(vals[i] || '')}" autocomplete="${s.auto || 'off'}"${s.mode ? ` inputmode="${s.mode}"` : ''}>
        <button class="go" type="submit" aria-label="${i < steps.length - 1 ? '다음' : '완료'}">${ARROW}</button></label></form>
      <p class="auth-msg" role="status">${esc(msg)}</p>`;
    $('input', box).focus();
    if (i) $('.back', box).addEventListener('click', () => { vals[i] = $('input', box).value; i--; show(); });
    $('form', box).onsubmit = async (e) => {
      e.preventDefault();
      vals[i] = $('input', box).value;
      try {
        s.check?.(vals[i], vals);
        if (i < steps.length - 1) { i++; show(); } else await done(vals);
      } catch (err) { $('.auth-msg', box).textContent = err.message; }
    };
  };
  show();
  return { goTo: (n, msg) => { i = n; show(msg); } };
}
