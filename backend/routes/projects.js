// [파일 개요] 작품 전시관 핵심 라우터 — 작품 목록 검색·필터·정렬, 상세 조회, 작품 등록·수정·삭제, ▲ 응원 토글, 💬 한 줄 감상(방명록)을 담당해요.
// [비유] 전시관의 '큐레이터'예요. 작품을 접수받아 액자에 걸고(등록), 관람객이 원하는 조건으로 작품을 찾아 주고(목록), 응원 스티커와 방명록을 관리해요.

// [뜻/역할] 작품 관련 주소들을 묶어 줄 Express 라우터 객체를 만들어요.
// [문법] const router = require('express').Router();
// [작성 이유] `server.js`에서 `/api/projects` 주소 뒤에 붙일 세부 규칙들을 이 파일에 모으기 위해서예요.
const router = require('express').Router();

// [뜻/역할] 브라우저가 `FormData`로 보낸 사진 파일(multipart/form-data)을 받아 디스크에 저장해 주는 `multer` 라이브러리를 불러와요.
// [문법] const multer = require('multer');
// [작성 이유] `express.json()`은 글자(JSON)만 읽을 수 있고 사진 같은 파일은 못 읽기 때문에 파일 전용 도구인 multer가 꼭 필요해요.
const multer = require('multer');

// [뜻/역할] 파일 경로를 안전하게 합치는 `path` 도구와 파일을 삭제하는 `fs` 도구를 불러와요.
// [문법] const path = require('path'); const fs = require('fs');
// [작성 이유] 작품을 수정하거나 삭제할 때 기존 사진 파일의 경로를 찾아 디스크에서 지우기 위해서예요.
const path = require('path');
const fs = require('fs');

// [뜻/역할] SQLite 데이터베이스 연결 객체(`db`)와 사진 저장 폴더 경로(`UPLOAD_DIR`)를 가져와요.
// [문법] require('../db'), require('../config')
// [작성 이유] 작품 정보는 DB에 넣고, 사진은 UPLOAD_DIR 폴더에 넣기 위해서예요.
const db = require('../db');
const { UPLOAD_DIR } = require('../config');

// [뜻/역할] 프론트엔드와 백엔드가 같이 쓰는 공식 분야 목록(`['웹사이트', '게임', ...]`)을 가져와요.
// [문법] const CATS = require('../../shared/categories');
// [작성 이유] 사용자가 목록에 없는 이상한 분야 이름을 몰래 보내더라도 서버에서 걸러내기 위해서예요.
const CATS = require('../../shared/categories');

// [뜻/역할] `auth.js`에서 만들어 둔 로그인 확인 검문소(`needLogin`) 함수를 가져와요.
// [문법] const { needLogin } = require('./auth');
// [작성 이유] 작품 등록, 수정, 삭제, 응원하기는 로그인한 회원만 할 수 있게 막기 위해서예요.
const { needLogin } = require('./auth');

// [뜻/역할] 업로드를 허용할 이미지 종류(MIME 타입)와 그때 붙일 안전한 파일 확장자를 짝지어 둔 표예요.
// [문법] 객체 리터럴 `{ '타입': '.확장자' }`
// [작성 이유] `.exe`나 `.html` 같은 위험한 파일을 사진인 척 올리는 해킹을 막고, 파일 이름 확장자도 서버가 직접 안전하게 붙이기 위해서예요.
const OK_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// [뜻/역할] 사진을 어디에, 어떤 이름으로, 몇 장·몇 MB까지 받을지 규칙을 정한 multer 업로드 미들웨어를 만들어요.
// [문법] multer({ storage, limits, fileFilter })
// [작성 이유] 라우터에서 `upload.array('images', 5)` 한 줄로 사진 저장과 용량·형식 검사를 자동으로 끝내기 위해서예요.
const upload = multer({
  // [뜻/역할] 파일을 메모리가 아닌 하드디스크(`UPLOAD_DIR`)에 직접 저장하는 방식을 설정해요.
  // [문법] multer.diskStorage({ destination, filename })
  // [작성 이유] 파일 이름이 서로 겹치지 않게 고유한 새 이름을 지어 주기 위해서예요.
  storage: multer.diskStorage({
    // [뜻/역할] 사진이 저장될 폴더를 `data/uploads/`로 지정해요.
    destination: UPLOAD_DIR,
    // [뜻/역할] 저장될 파일 이름을 `현재시각-무작위영문숫자.확장자`(예: `1730000000-k9x2p1.jpg`)로 지어요.
    // [문법] Date.now()는 현재 밀리초, Math.random().toString(36).slice(2)는 36진수(0~9, a~z) 난수 문자열이에요.
    // [작성 이유] 여러 학생이 똑같이 `스크린샷.png`라는 이름으로 사진을 올려도 덮어써지지 않게 하기 위해서예요.
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + OK_TYPES[file.mimetype]),
  }),
  // [뜻/역할] 사진 한 장당 최대 크기(5MB = 5 * 1024 * 1024 바이트)와 한 번에 올릴 수 있는 최대 장수(5장)를 제한해요.
  // [문법] limits: { fileSize: 바이트수, files: 개수 }
  // [작성 이유] 너무 큰 원본 사진을 올려서 서버 디스크가 금방 차버리거나 페이지가 느려지는 것을 막기 위해서예요.
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  // [뜻/역할] 올라온 파일이 `OK_TYPES`(jpg, png, webp)에 속하는지 검사해서, 아니면 에러를 던져 거부해요.
  // [문법] fileFilter: (req, file, cb) => cb(에러또는null, 통과여부)
  // [작성 이유] 허용된 이미지 파일만 서버에 저장되도록 문지기 역할을 해요.
  fileFilter: (req, file, cb) => cb(OK_TYPES[file.mimetype] ? null : new Error('jpg·png·webp 이미지만 올릴 수 있어요'), true),
});

// [뜻/역할] 주소(URL)가 `http://` 또는 `https://`로 시작하고 공백이 없는지 검사하는 함수예요.
// [문법] /^https?:\/\/\S+$/.test(u) — `s?`는 s가 있거나 없거나(http 또는 https), `\S+`는 공백 아닌 글자가 1개 이상이라는 뜻이에요.
// [작성 이유] 체험 주소에 `javascript:alert(1)` 같은 해킹 코드를 넣거나 잘못된 주소를 넣는 것을 막기 위해서예요.
const isHttp = (u) => /^https?:\/\/\S+$/.test(u);

// [뜻/역할] DB에 쉼표로 이어져 저장된 글자(예: `"HTML,CSS"`)를 배열(`['HTML', 'CSS']`)로 쪼개고, 빈 글자면 빈 배열(`[]`)을 돌려줘요.
// [문법] (v) => (v ? v.split(',') : []) — 빈 문자열 `""`에 그냥 `.split(',')`을 하면 `[""]`(길이 1)이 되어 버리므로 삼항 연산자로 먼저 확인해요!
// [작성 이유] 프론트엔드가 다루기 편하도록 태그와 분야를 깔끔한 배열 형태로 바꿔 주기 위해서예요.
const split = (v) => (v ? v.split(',') : []);

// [뜻/역할] DB의 `projects` 표에서 꺼낸 기본 작품 행(`p`)에 작성자 닉네임, 사진 경로 배열, 총 응원 수, 내가 응원했는지 여부, 감상 수, 내 작품인지 여부를 덧붙여 완성된 작품 객체로 꾸며 줘요(Decorate).
// [문법] function decorate(p, uid) { return { ...p, 추가속성들 }; } — `...p`는 기존 작품 속성을 그대로 복사해 펼쳐 놓는 전개 구문(Spread)이에요.
// [작성 이유] 작품 목록(`GET /`)과 작품 상세(`GET /:id`) 모두 화면에 똑같은 모양의 풍성한 작품 데이터가 필요하므로 공통 함수로 묶었어요.
function decorate(p, uid) {
  return {
    // [뜻/역할] `projects` 테이블의 원래 열들(id, user_id, title, summary, detail, url, github, maker, target, is_public, created_at)을 그대로 복사해요.
    ...p,
    // [뜻/역할] 쉼표 문자열이던 `tags`와 `cats`를 배열로 바꿔서 덮어써요.
    tags: split(p.tags),
    cats: split(p.cats),
    // [뜻/역할] 작품을 올린 회원(`p.user_id`)의 현재 닉네임을 `users` 표에서 찾아 붙여요.
    author: db.prepare('SELECT nickname FROM users WHERE id = ?').get(p.user_id).nickname,
    // [뜻/역할] 이 작품에 첨부된 사진 파일 이름들을 찾아 앞에 `/uploads/`를 붙인 웹 주소 배열로 만들어요.
    images: db.prepare('SELECT file FROM images WHERE project_id = ?').all(p.id).map((i) => '/uploads/' + i.file),
    // [뜻/역할] `likes` 표에서 이 작품이 받은 총 응원(▲) 개수를 세어 숫자로 넣어요.
    likes: db.prepare('SELECT COUNT(*) n FROM likes WHERE project_id = ?').get(p.id).n,
    // [뜻/역할] 지금 보는 사용자(`uid`)가 이 작품에 이미 응원을 눌렀는지 확인해 `true` 또는 `false`(`!!`)로 넣어요.
    liked: !!db.prepare('SELECT 1 FROM likes WHERE project_id = ? AND user_id = ?').get(p.id, uid),
    // [뜻/역할] `comments` 표에서 이 작품에 달린 한 줄 감상(방명록) 개수를 세어 넣어요.
    comments: db.prepare('SELECT COUNT(*) n FROM comments WHERE project_id = ?').get(p.id).n,
    // [뜻/역할] 이 작품의 주인이 지금 로그인한 나(`uid`)와 같은지 비교해 `true`/`false`로 알려 줘요.
    // [작성 이유] 상세 페이지에서 내 작품일 때만 '고치기', '내리기', '홍보 키트' 버튼을 보여 주기 위해서예요.
    mine: p.user_id === uid,
  };
}

// [뜻/역할] `GET /api/projects` — 검색어(`q`), 기술 태그(`tag`), 분야(`cat`), 특정 작성자(`user`), 정렬(`sort`) 조건에 맞는 작품 목록을 돌려줘요.
// [문법] router.get('/', (req, res) => { ... });
// [작성 이유] 홈 화면(`index.html`), 전시관(`works.html`), 프로필(`profile.html`)에서 작품 목록을 불러올 때 모두 이 하나의 API를 써요.
router.get('/', (req, res) => {
  // [뜻/역할] 주소 물음표 뒤의 쿼리 스트링(`?q=급식&cat=학교생활&sort=hot`)을 꺼내고, 안 들어온 값은 기본값으로 채워요.
  // [문법] const { q = '', ... } = req.query;
  // [작성 이유] 어떤 조건이 생략되어도 SQL 에러 없이 전체 검색이 되도록 기본값을 빈 문자열로 두었어요.
  const { q = '', tag = '', cat = '', user = '', sort = 'new' } = req.query;
  // [뜻/역할] 현재 로그인한 사용자의 번호를 꺼내요(비로그인이면 `undefined`).
  const uid = req.session.uid;
  // [뜻/역할] 조건에 맞는 작품들을 SQL 쿼리 한 번으로 조회해요.
  // [문법] `@이름`은 better-sqlite3의 이름 있는 바인딩 파라미터(Named Parameter)예요.
  // [작성 이유] 여러 검색 조건(공개 여부, 키워드, 분야, 태그, 작성자, 정렬)을 DB에서 한 번에 빠르게 필터링하기 위해서예요.
  const rows = db.prepare(`
    SELECT p.* FROM projects p
    WHERE (p.is_public = 1 OR p.user_id = @uid)
      AND (p.title LIKE @q OR p.summary LIKE @q OR p.tags LIKE @q OR p.maker LIKE @q OR p.target LIKE @q)
      AND (@cat = '' OR ',' || p.cats || ',' LIKE '%,' || @cat || ',%')
      AND (@tag = '' OR ',' || p.tags || ',' LIKE '%,' || @tag || ',%')
      AND (@user = '' OR p.user_id = @user)
    ORDER BY ${(sort === 'popular' || sort === 'hot') ? '(SELECT COUNT(*) FROM likes WHERE project_id = p.id) DESC,' : ''} p.id DESC
  `).all({ uid: uid || 0, q: `%${q}%`, tag, cat, user });
  // [SQL 상세 해설]
  // 1) `(p.is_public = 1 OR p.user_id = @uid)`: 공개 작품이거나, 비공개라도 내 작품이면 보여 줘요(내 프로필에서 확인용).
  // 2) `LIKE @q`: 제목·한줄소개·태그·만든사람·추천대상 중 어디든 검색어(`%검색어%`)가 포함되어 있으면 찾아요.
  // 3) `',' || p.cats || ',' LIKE '%,' || @cat || ',%'`: SQL에서 `||`는 글자 이어 붙이기예요. 앞뒤에 쉼표를 붙여 `",게임,도구,"`로 만든 뒤 `",게임,"`을 찾으면 다른 단어의 일부와 헷갈리지 않고 정확히 일치하는 분야만 찾아요!
  // 4) `ORDER BY`: 인기순(`hot`/`popular`)이면 응원 수 내림차순(`DESC`) 후 최신순(`p.id DESC`)으로 정렬해요.

  // [뜻/역할] 찾은 작품 행마다 `decorate()`로 부가 정보를 붙여 JSON 배열로 응답해요.
  res.json(rows.map((p) => decorate(p, uid)));
});

// [뜻/역할] `GET /api/projects/:id` — 작품 번호(`:id`)로 작품 하나의 상세 정보를 돌려줘요.
// [문법] router.get('/:id', (req, res) => { ... });
// [작성 이유] 작품 상세 페이지(`project.html`), 수정 페이지(`edit.html`), 홍보 키트(`kit.html`)에서 특정 작품 정보를 불러올 때 써요.
router.get('/:id', (req, res) => {
  // [뜻/역할] id로 작품을 찾아요.
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  // [뜻/역할] 작품이 없거나, 비공개(`!p.is_public`)인데 작품 주인도 아니라면(`p.user_id !== req.session.uid`) 404 에러를 돌려줘요.
  // [작성 이유] 남의 비공개 작품을 주소창에 숫자만 찍어서 몰래 보는 것을 막기 위해서예요.
  if (!p || (!p.is_public && p.user_id !== req.session.uid)) return res.status(404).json({ error: '없는 작품이에요' });
  // [뜻/역할] 통과하면 `decorate()`로 꾸며서 JSON으로 보내요.
  res.json(decorate(p, req.session.uid));
});

// [뜻/역할] 작품을 등록하거나 수정할 때 폼 입력값(`req.body`)을 꼼꼼히 검사하고 깨끗하게 다듬어 돌려주는 함수예요.
// [문법] 문제가 있으면 `throw new Error('문구')`로 예외를 던져요(그러면 `server.js`의 에러 처리기가 받아 400 응답을 보내고 업로드된 파일도 지워 줌).
// [작성 이유] 등록(`POST /`)과 수정(`PUT /:id`)에서 똑같은 입력 검사 규칙을 공유하기 위해서예요.
function readForm(body) {
  // [뜻/역할] 폼에서 온 값들을 꺼내고 없으면 기본값을 채워요.
  const { title = '', summary = '', detail = '', url = '', github = '', tags = '', cats = '', maker = '', target = '', is_public = '1' } = body;
  // [뜻/역할] 필수값과 글자 수 제한을 하나씩 검사해요.
  if (!title.trim() || title.length > 40) throw new Error('제목은 1~40자예요');
  if (!summary.trim() || summary.length > 100) throw new Error('한 줄 소개는 1~100자예요');
  if (maker.length > 30) throw new Error('만든 사람은 30자까지예요');
  if (target.length > 50) throw new Error('누구에게는 50자까지예요');
  if (detail.length > 2000) throw new Error('만든 이야기는 2000자까지예요');
  // [뜻/역할] 배포 주소(필수)와 GitHub 주소(선택, 입력했을 때만)가 `http://` 또는 `https://`로 시작하는지 검사해요.
  if (!isHttp(url)) throw new Error('배포 주소는 http(s)://로 시작해야 해요');
  if (github && !isHttp(github)) throw new Error('GitHub 주소는 http(s)://로 시작해야 해요');
  // [뜻/역할] 기술 태그를 쉼표로 쪼개고 → 공백 제거 → 빈칸 제거(`filter(Boolean)`) → 중복 제거(`new Set`) → 최대 8개까지만 잘라 다시 쉼표로 합쳐요.
  const cleanTags = [...new Set(tags.split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 8).join(',');
  // [뜻/역할] 분야도 중복을 제거하고, 공식 분야 목록(`CATS`)에 있는 값만 남겨(`filter((c) => CATS.includes(c))`) 쉼표로 합쳐요.
  const cleanCats = [...new Set(cats.split(',').map((t) => t.trim()))].filter((c) => CATS.includes(c)).join(',');
  // [뜻/역할] DB에 바로 넣을 수 있게 정제된 객체를 돌려줘요. `is_public`은 `'0'`일 때만 숫자 `0`, 나머지는 `1`로 바꿔요.
  return { title: title.trim(), summary: summary.trim(), detail, url, github, tags: cleanTags, cats: cleanCats, maker: maker.trim(), target: target.trim(), is_public: is_public === '0' ? 0 : 1 };
}

// [뜻/역할] 업로드된 사진 파일들의 이름을 `images` 테이블에 한 줄씩 저장하는 도우미 함수예요.
// [문법] files.forEach((f) => db.prepare('INSERT ...').run(pid, f.filename));
// [작성 이유] 작품 등록과 사진 교체(수정) 양쪽에서 똑같이 쓰기 위해서예요.
const addImages = (pid, files) =>
  files.forEach((f) => db.prepare('INSERT INTO images (project_id, file) VALUES (?, ?)').run(pid, f.filename));

// [뜻/역할] `POST /api/projects` — 로그인 확인(`needLogin`) → 사진 최대 5장 저장(`upload.array`) → 폼 검사(`readForm`) → DB 저장을 수행해요.
// [문법] router.post('/', 미들웨어1, 미들웨어2, 핸들러);
// [작성 이유] `edit.html`에서 새 작품을 걸 때 호출되는 창구예요.
router.post('/', needLogin, upload.array('images', 5), (req, res) => {
  // [뜻/역할] 폼 데이터를 검사하고 정제해요.
  const f = readForm(req.body);
  // [뜻/역할] `projects` 표에 새 작품을 저장하고 생성된 작품 번호(`id`)를 받아요.
  const id = db.prepare(`INSERT INTO projects (user_id, title, summary, detail, url, github, tags, cats, maker, target, is_public)
    VALUES (@uid, @title, @summary, @detail, @url, @github, @tags, @cats, @maker, @target, @is_public)`).run({ uid: req.session.uid, ...f }).lastInsertRowid;
  // [뜻/역할] 첨부된 사진이 있다면 `images` 표에 연결해 저장해요.
  addImages(id, req.files);
  // [뜻/역할] 새로 생긴 작품 번호 `{ id }`를 돌려줘서 프론트엔드가 홍보 키트(`/kit.html?id=...`)로 이동할 수 있게 해요.
  res.json({ id });
});

// [뜻/역할] 작품을 수정·삭제하거나 방명록을 지우기 전에 "이 작품이 진짜 내 작품이 맞나?" 확인하는 검문소(미들웨어)예요.
// [문법] function mine(req, res, next) { ... }
// [작성 이유] 다른 학생의 작품을 마음대로 고치거나 지우지 못하게 서버에서 권한(Authorization)을 검사하기 위해서예요.
function mine(req, res, next) {
  // [뜻/역할] 주소의 `:id`로 작품을 찾아요.
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  // [뜻/역할] 작품이 아예 없으면 404(Not Found) 에러를 보내요.
  if (!p) return res.status(404).json({ error: '없는 작품이에요' });
  // [뜻/역할] 작품은 있는데 작성자(`p.user_id`)가 로그인한 나(`req.session.uid`)와 다르면 403(Forbidden, 권한 없음) 에러를 보내요.
  if (p.user_id !== req.session.uid) return res.status(403).json({ error: '내 작품만 고칠 수 있어요' });
  // [뜻/역할] 내 작품이 맞으면 다음 처리 함수로 통과시켜요.
  next();
}

// [뜻/역할] `PUT /api/projects/:id` — 내 작품의 글과 사진을 수정해요.
// [문법] router.put('/:id', needLogin, mine, upload.array('images', 5), (req, res) => { ... });
// [작성 이유] `edit.html?id=...`에서 작품을 고치고 '저장하기'를 눌렀을 때 실행돼요.
router.put('/:id', needLogin, mine, upload.array('images', 5), (req, res) => {
  // [뜻/역할] 수정된 폼 입력값을 검사해요.
  const f = readForm(req.body);
  // [뜻/역할] `projects` 표의 글 정보를 새 값으로 업데이트해요.
  db.prepare(`UPDATE projects SET title=@title, summary=@summary, detail=@detail, url=@url, github=@github, tags=@tags, cats=@cats, maker=@maker, target=@target, is_public=@is_public
    WHERE id=@id`).run({ id: req.params.id, ...f });
  // [뜻/역할] 만약 새로 올린 사진 파일이 1장이라도 있다면(`req.files.length`), 옛날 사진 파일과 DB 기록을 지우고 새 사진으로 교체해요.
  // [작성 이유] 사진을 새로 안 골랐을 때는 기존 사진이 그대로 유지되게 하고, 새로 골랐을 때만 깔끔하게 갈아 끼우기 위해서예요.
  if (req.files.length) {
    db.prepare('SELECT file FROM images WHERE project_id = ?').all(req.params.id).forEach((i) => fs.rmSync(path.join(UPLOAD_DIR, i.file), { force: true }));
    db.prepare('DELETE FROM images WHERE project_id = ?').run(req.params.id);
    addImages(req.params.id, req.files);
  }
  // [뜻/역할] 수정된 작품 번호를 숫자로 변환(`+req.params.id`)해 돌려줘요.
  res.json({ id: +req.params.id });
});

// [뜻/역할] `DELETE /api/projects/:id` — 내 작품과 첨부된 사진 파일을 모두 삭제해요.
// [문법] router.delete('/:id', needLogin, mine, (req, res) => { ... });
// [작성 이유] 상세 페이지에서 '내리기' 버튼을 눌렀을 때 작품을 전시관에서 완전히 내리기 위해서예요.
router.delete('/:id', needLogin, mine, (req, res) => {
  // [뜻/역할] 디스크(`data/uploads/`)에 저장된 이 작품의 사진 파일들을 먼저 지워요.
  db.prepare('SELECT file FROM images WHERE project_id = ?').all(req.params.id).forEach((i) => fs.rmSync(path.join(UPLOAD_DIR, i.file), { force: true }));
  // [뜻/역할] `projects` 표에서 작품을 지워요(연결된 images, likes, comments 행들은 CASCADE로 자동 삭제됨).
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  // [뜻/역할] 삭제 성공을 응답해요.
  res.json({ ok: true });
});

// [뜻/역할] `POST /api/projects/:id/like` — ▲ 응원을 누르면 켜지고, 이미 누른 상태에서 또 누르면 꺼지는 토글(Toggle) API예요.
// [문법] router.post('/:id/like', needLogin, (req, res) => { ... });
// [작성 이유] 어느 화면에서든 카드의 ▲ 버튼을 눌렀을 때 1인 1회 응원을 처리하기 위해서예요.
router.post('/:id/like', needLogin, (req, res) => {
  // [뜻/역할] [내 회원번호, 작품번호] 배열을 준비해요.
  const args = [req.session.uid, req.params.id];
  // [뜻/역할] 먼저 `likes` 표에서 내 응원 기록을 지워 보고, 실제로 지워진 줄 수(`.changes`)를 확인해요.
  // [문법] 이미 응원했었다면 1줄이 지워져 `done`은 1이 되고, 응원한 적이 없었다면 지워진 게 없어 `done`은 0이 돼요.
  const done = db.prepare('DELETE FROM likes WHERE user_id = ? AND project_id = ?').run(...args).changes;
  // [뜻/역할] 만약 지워진 게 없다면(`!done`, 즉 응원 안 한 상태였다면) 새로 응원 기록을 추가(INSERT)해요.
  // [작성 이유] SELECT로 먼저 확인하지 않고도 DELETE 시도 한 번으로 '있으면 끄고, 없으면 켜는' 토글을 가장 간결하게 구현하는 기법이에요!
  if (!done) db.prepare('INSERT INTO likes (user_id, project_id) VALUES (?, ?)').run(...args);
  // [뜻/역할] 현재 내 응원 상태(`liked`: 새로 켜졌으면 true, 꺼졌으면 false)와 변경된 총 응원 수(`likes`)를 돌려줘요.
  res.json({ liked: !done, likes: db.prepare('SELECT COUNT(*) n FROM likes WHERE project_id = ?').get(req.params.id).n });
});

// [뜻/역할] 방명록을 보거나 쓰기 전에, 해당 작품이 실제로 존재하고 볼 권한이 있는지(공개 작품이거나 내 작품인지) 확인하는 도우미 함수예요.
// [문법] 조건이 맞으면 작품 객체 `p`를, 아니면 `null`을 돌려줘요.
// [작성 이유] 비공개 작품에는 남이 방명록을 읽거나 달 수 없도록 보호하기 위해서예요.
const visible = (req) => {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  return p && (p.is_public || p.user_id === req.session.uid) ? p : null;
};

// [뜻/역할] `GET /api/projects/:id/comments` — 특정 작품의 한 줄 감상(방명록) 목록을 최신순으로 돌려줘요.
// [문법] router.get('/:id/comments', (req, res) => { ... });
// [작성 이유] 작품 상세 페이지 하단에 친구들이 남긴 감상들을 보여 주기 위해서예요.
router.get('/:id/comments', (req, res) => {
  // [뜻/역할] 볼 수 있는 작품인지 확인해요.
  const p = visible(req);
  if (!p) return res.status(404).json({ error: '없는 작품이에요' });
  // [뜻/역할] 해당 작품의 감상들을 최근에 쓴 순서(`id DESC`)대로 가져와요(IP 주소는 개인정보이므로 빼고 조회!).
  const rows = db.prepare('SELECT id, name, text, created_at FROM comments WHERE project_id = ? ORDER BY id DESC').all(p.id);
  // [뜻/역할] 지금 보는 사람이 이 작품의 주인이라면 각 감상에 `canDelete: true`를 붙여서 돌려줘요.
  // [작성 이유] 작품 주인 화면에만 방명록 옆에 '지우기' 버튼이 나타나게 하기 위해서예요.
  res.json(rows.map((c) => ({ ...c, canDelete: p.user_id === req.session.uid })));
});

// [뜻/역할] `POST /api/projects/:id/comments` — 로그인 없이 누구나 작품에 한 줄 감상을 남겨요(단, 도배 방지로 같은 IP는 1분에 5개까지).
// [문법] router.post('/:id/comments', (req, res) => { ... });
// [작성 이유] 친구들이 번거롭게 가입하지 않고도 카톡 링크를 타고 들어와 바로 감상을 남길 수 있게 진입 장벽을 낮춘 거예요.
router.post('/:id/comments', (req, res) => {
  // [뜻/역할] 볼 수 있는 작품인지 확인해요.
  const p = visible(req);
  if (!p) return res.status(404).json({ error: '없는 작품이에요' });
  // [뜻/역할] 이름을 꺼내 공백을 지우고, 이름을 안 적었으면 자동으로 `'익명'`으로 설정해요.
  const name = String(req.body.name || '').trim() || '익명';
  // [뜻/역할] 감상 내용을 꺼내 앞뒤 공백을 제거해요.
  const text = String(req.body.text || '').trim();
  // [뜻/역할] 이름 길이(최대 12자)와 감상 길이(1~80자)를 검사해요.
  if (name.length > 12) return res.status(400).json({ error: '이름은 12자까지예요' });
  if (!text || text.length > 80) return res.status(400).json({ error: '감상은 1~80자예요' });
  // [뜻/역할] 같은 접속 IP(`req.ip`)로 최근 1분(`datetime('now', '-1 minute')`) 동안 남긴 감상이 몇 개인지 세어 봐요.
  // [문법] SQLite의 날짜 계산 함수 `datetime('now', '-1 minute')`을 사용해요.
  // [작성 이유] 비회원 작성을 허용하되, 매크로나 장난으로 방명록을 도배하는 것을 막기 위해서예요.
  const recent = db.prepare("SELECT COUNT(*) n FROM comments WHERE ip = ? AND created_at > datetime('now', '-1 minute')").get(req.ip).n;
  // [뜻/역할] 1분 안에 이미 5개 이상 썼다면 429(Too Many Requests, 요청 너무 많음) 에러를 돌려줘요.
  if (recent >= 5) return res.status(429).json({ error: '조금 있다가 다시 남겨 주세요' });
  // [뜻/역할] 검사를 통과하면 `comments` 표에 감상을 저장하고 새 번호 `{ id }`를 돌려줘요.
  const id = db.prepare('INSERT INTO comments (project_id, name, text, ip) VALUES (?, ?, ?, ?)').run(p.id, name, text, req.ip).lastInsertRowid;
  res.json({ id });
});

// [뜻/역할] `DELETE /api/projects/:id/comments/:cid` — 작품 주인(`needLogin` + `mine`)이 자기 작품에 달린 특정 감상(`:cid`)을 지워요.
// [문법] router.delete('/:id/comments/:cid', needLogin, mine, (req, res) => { ... });
// [작성 이유] 비회원이 남기는 방명록 특성상, 부적절하거나 장난스러운 댓글이 달리면 작품 주인이 직접 관리(삭제)할 수 있어야 하기 때문이에요.
router.delete('/:id/comments/:cid', needLogin, mine, (req, res) => {
  // [뜻/역할] 감상 번호(`id = ?`)와 작품 번호(`project_id = ?`)가 모두 일치하는 행을 지워요.
  db.prepare('DELETE FROM comments WHERE id = ? AND project_id = ?').run(req.params.cid, req.params.id);
  res.json({ ok: true });
});

// [뜻/역할] 완성된 작품 라우터를 내보내요.
module.exports = router;
