// [파일 개요] 모든 페이지가 함께 쓰는 공통 도구예요: 서버 통신(api), 상단 메뉴(nav), 작품 카드(card), 응원, 검색 필터, 단계별 입력 폼.
// CATS(분야 목록)는 이 파일보다 먼저 불러오는 /shared/categories.js가 만들어 줘요.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
// 사용자가 쓴 글을 HTML에 넣기 전에 특수기호를 바꿔서, 남이 넣은 <script>가 실행되지 않게 막아요(XSS 방지).
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const param = (k) => new URLSearchParams(location.search).get(k);
const FALLBACK_IMG = '/img/hero.jpg';
const pageUrl = (id) => `${location.origin}/project.html?id=${id}`;
const toLogin = () => (location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search));

// 서버에 요청하고 JSON을 받아요. 실패하면 서버의 에러 문구와 상태 코드(err.status)를 담아 에러를 던져요.
async function api(url, method = 'GET', body) {
  const opts = { method };
  if (body instanceof FormData) opts.body = body; // 사진이 든 FormData는 브라우저가 헤더를 알아서 붙여요
  else if (body) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || '잠시 후 다시 해 주세요'); e.status = res.status; throw e; }
  return data;
}

// 밝은/어두운 화면을 바꾸고 브라우저에 기억해요(시크릿 모드에서 저장이 막혀도 괜찮게 try로 감싸요).
function setTheme(light) {
  document.documentElement.classList.toggle('light', light);
  try { localStorage.setItem('theme', light ? 'light' : 'dark'); } catch {}
  const b = $('#themeBtn');
  if (b) { b.textContent = light ? '☾' : '☀'; b.setAttribute('aria-label', light ? '어두운 화면으로' : '밝은 화면으로'); }
}

// 상단 메뉴와 바닥글을 그리고, 로그인한 사용자(없으면 null)를 돌려줘요.
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

// 화면 아래에 1.9초 동안 떴다 사라지는 알림이에요.
let toastTimer;
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast glass'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.classList.remove('hide');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hide'), 1900);
}

async function copyText(text, ok) {
  try { await navigator.clipboard.writeText(text); toast(ok); }
  catch { toast('복사가 막혀 있어요. 글자를 직접 선택해 주세요'); }
}

// DB 시각(UTC 'YYYY-MM-DD HH:MM:SS')을 읽어 올린 지 24시간이 안 됐으면 New 배지를 달아요.
const isNew = (p) => Date.now() - new Date(p.created_at.replace(' ', 'T') + 'Z').getTime() < 86400000;
const imgOf = (p) => p.images[0] || FALLBACK_IMG;
const makerOf = (p) => p.maker || p.author;

// ▲ 응원 버튼이에요. wide면 상세 페이지용 넓은 버튼이 돼요.
const upBtn = (p, wide) => `<button class="up${wide ? ' up-wide' : ''}" data-cheer="${p.id}" aria-pressed="${p.liked}" aria-label="${esc(p.title)} 응원하기, 지금 ${p.likes}개"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5 L14.5 11.5 H1.5 Z"></path></svg><b>${p.likes}</b>${wide ? '응원' : ''}</button>`;

// 작품 하나를 카드 HTML로 바꿔요. 사용자가 쓴 값은 모두 esc()로 감싸요.
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

// 응원 버튼 클릭은 document 한 곳에서 받아요(이벤트 위임). 나중에 그린 카드도 따로 연결할 필요가 없어요.
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-cheer]');
  if (!btn) return;
  const id = btn.dataset.cheer;
  try {
    const r = await api(`/api/projects/${id}/like`, 'POST');
    // 같은 작품의 버튼과 숫자([data-cheers])가 화면 여러 곳에 있을 수 있어서 모두 바꿔요.
    $$(`[data-cheer="${id}"]`).forEach((b) => { b.setAttribute('aria-pressed', r.liked); b.querySelector('b').textContent = r.likes; });
    $$(`[data-cheers="${id}"]`).forEach((el) => (el.textContent = r.likes));
    toast(r.liked ? '응원을 보냈어요' : '응원을 취소했어요');
  } catch (err) {
    if (err.status === 401) { toast('로그인하면 응원할 수 있어요'); setTimeout(toLogin, 900); }
    else toast(err.message);
  }
});

// 홈과 전시관이 함께 쓰는 검색창(#q)·정렬 버튼·분야 칩이에요. 조건이 바뀌면 list()를 다시 불러요.
function filters(state, list) {
  const chips = () => ($('#chips').innerHTML = ['', ...CATS].map((c) =>
    `<button type="button" class="chip" data-cat="${c}" aria-pressed="${state.cat === c}">${c || '전체'}</button>`).join(''));
  const sorts = () => $$('[data-sort]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.sort === state.sort));
  $('#chips').onclick = (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; state.cat = b.dataset.cat; chips(); list(); };
  $$('[data-sort]').forEach((b) => (b.onclick = () => { state.sort = b.dataset.sort; sorts(); list(); }));
  // 글자마다 서버를 부르지 않고, 입력을 멈추고 0.25초 뒤에 검색해요(디바운스).
  let qt;
  $('#q').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value.trim(); list(); }, 250); };
  chips(); sorts();
}

// 없는 작품·사용자일 때 보여 주는 안내 상자예요.
const notFound = (msg) => `<div class="empty glass"><p>${msg}</p><a class="btn btn-hot" href="/">전시관으로</a></div>`;

// 작품 목록을 그리고, 비어 있으면 안내 상자를 보여 줘요.
const grid = (rows, state) => ($('#grid').innerHTML = rows.length ? rows.map(card).join('') :
  `<div class="empty glass"><p>${state.q || state.cat ? '찾는 작품이 아직 없어요.' : '아직 걸린 작품이 없어요.'}</p><a class="btn btn-hot" href="/edit.html">첫 번째로 걸어 보기</a></div>`);

// 로그인·가입에서 한 칸씩 묻는 폼이에요. steps의 check가 에러를 던지면 그 문구를 보여 줘요.
const ARROW = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>';
function stepForm(steps, done, { counter = false } = {}) {
  let i = 0; const vals = [];
  const box = $('#step');
  const show = (msg = '') => {
    const s = steps[i];
    // .auth-top은 높이가 고정이라 단계가 바뀌어도 입력칸이 들썩이지 않아요.
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
  // 서버 에러가 나면 goTo(단계, 문구)로 그 단계로 돌아가요.
  return { goTo: (n, msg) => { i = n; show(msg); } };
}
