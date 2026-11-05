// 모든 페이지가 같이 쓰는 작은 도구들
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const param = (k) => new URLSearchParams(location.search).get(k);
// CATS(분야 목록)는 /shared/categories.js에서 온다 — 각 HTML이 app.js보다 먼저 불러온다
const FALLBACK_IMG = '/img/hero.jpg';
const pageUrl = (id) => `${location.origin}/project.html?id=${id}`;

// 서버 호출: JSON이든 폼(FormData)이든 보내고, 실패하면 오류 문구로 예외를 던진다
async function api(url, method = 'GET', body) {
  const opts = { method };
  if (body instanceof FormData) opts.body = body;
  else if (body) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || '잠시 후 다시 해 주세요'); e.status = res.status; throw e; }
  return data;
}

// 어두운 화면이 기본, 버튼으로 밝은 화면 전환 (선택은 이 브라우저에 기억)
function setTheme(light) {
  document.documentElement.classList.toggle('light', light);
  try { localStorage.setItem('theme', light ? 'light' : 'dark'); } catch {}
  const b = $('#themeBtn');
  if (b) { b.textContent = light ? '☾' : '☀'; b.setAttribute('aria-label', light ? '어두운 화면으로' : '밝은 화면으로'); }
}

// 떠 있는 상단 메뉴. 로그인 여부에 따라 왼쪽 링크가 달라진다
async function nav() {
  const user = await api('/api/me').catch(() => null);
  const light = document.documentElement.classList.contains('light');
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
  $('#themeBtn').onclick = () => setTheme(!document.documentElement.classList.contains('light'));
  return user;
}

const FOOTER = `<footer class="wrap foot">
  <p><b style="color:var(--ink);font-weight:500">PART</b> — Project + Art, 우리 학교 학생 작품 전시관</p>
  <p>사진: Unsplash, StockSnap, rawpixel (CC0)</p>
</footer>`;

// 아래쪽에 잠깐 뜨는 알림
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

// 하루 안에 올라온 작품은 New
const isNew = (p) => Date.now() - new Date(p.created_at.replace(' ', 'T') + 'Z').getTime() < 86400000;
const imgOf = (p) => p.images[0] || FALLBACK_IMG;
const makerOf = (p) => p.maker || p.author;

const UP_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5 L14.5 11.5 H1.5 Z"></path></svg>';
const upBtn = (p, wide) => `<button class="up${wide ? ' up-wide' : ''}" data-cheer="${p.id}" aria-pressed="${p.liked}" aria-label="${esc(p.title)} 응원하기, 지금 ${p.likes}개">${UP_SVG}<b>${p.likes}</b>${wide ? '응원' : ''}</button>`;

// 작품 카드 하나 (디자인의 .card)
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

// ▲ 응원 버튼(어디에 있든 공통): 눌러서 켜고 끈다. 같은 작품의 버튼은 모두 같이 바뀐다
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
    if (err.status === 401) { toast('로그인하면 응원할 수 있어요'); setTimeout(() => (location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search)), 900); }
    else toast(err.message);
  }
});

// 로그인·가입: 한 칸씩 입력받는 폼. steps = [{ ph, type, auto, mode, check }]
const ARROW = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>';
function stepForm(steps, done, { counter = false } = {}) {
  let i = 0; const vals = [];
  const box = $('#step');
  const show = (msg = '') => {
    const s = steps[i];
    // 위쪽 칸(단계 표시·이전 버튼)은 항상 같은 높이로 자리를 잡아 두어서, 단계가 바뀌어도 입력칸이 움직이지 않는다
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
