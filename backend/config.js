// [파일 개요] PART 서버 설정 모음 — 포트 번호, 비밀키, 데이터 폴더 경로를 한곳에서 정해요.
// [비유] 식당의 '운영 수칙표'예요. 몇 번 문을 열지(PORT), 창고는 어디에 둘지(DATA_DIR)를 적어 두고 주방 전체가 같이 봐요.

// [뜻/역할] 파일·폴더 경로를 운영체제(Mac/Windows/Linux)에 맞게 안전하게 이어 주는 Node.js 기본 도구(path)를 가져와요.
// [문법] const 이름 = require('모듈이름'); — 다른 도구를 불러와 상수(const)에 담는 CommonJS 문법이에요.
// [작성 이유] '/'나 '\'를 직접 글자로 이어 붙이면 운영체제마다 경로가 깨질 수 있어서 path 도구를 써요.
const path = require('path');

// [뜻/역할] 컴퓨터의 파일과 폴더를 만들고 읽고 지우는 Node.js 기본 도구(fs = File System)를 가져와요.
// [문법] const fs = require('fs');
// [작성 이유] 서버가 켜질 때 사진 저장 폴더(uploads/)가 없으면 자동으로 만들어야 하기 때문이에요.
const fs = require('fs');

// [뜻/역할] 지금 서버가 실제 서비스(배포 환경)로 돌아가고 있는지 확인해서 true 또는 false로 저장해요.
// [문법] process.env는 환경변수(서버 바깥에서 넣어 주는 설정값) 객체이고, ===는 값과 자료형이 모두 같은지 비교하는 연산자예요.
// [작성 이유] 내 컴퓨터(개발 중)와 실제 인터넷 서버(Railway)에서 보안 설정(비밀키 강제, https 쿠키 등)을 다르게 해야 해서예요.
const isProd = process.env.NODE_ENV === 'production';

// [뜻/역할] DB 파일과 업로드된 사진이 저장될 데이터 폴더의 절대 경로를 정해요.
// [문법] A || B는 A가 비어 있으면 B를 쓴다는 뜻이에요. __dirname은 현재 파일(config.js)이 있는 폴더(backend/)이고, '..'은 한 칸 위 폴더예요.
// [작성 이유] Railway 배포 서버에서는 영구 디스크 볼륨(/data)을 쓰고, 내 컴퓨터에서는 프로젝트 안의 data/ 폴더를 자동으로 쓰게 하려고요.
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));

// [뜻/역할] 사용자가 올린 작품 사진들이 들어갈 폴더 경로(data/uploads)를 만들어요.
// [문법] path.join(폴더1, 폴더2)로 두 경로를 하나로 합쳐요.
// [작성 이유] DB 파일과 사진 파일을 한 데이터 폴더(DATA_DIR) 안에 깔끔하게 모아 두면 백업과 관리가 쉬워요.
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

// [뜻/역할] 서버가 켜질 때 UPLOAD_DIR(과 그 상위 폴더인 DATA_DIR)이 실제로 없으면 그 자리에서 바로 폴더를 만들어요.
// [문법] fs.mkdirSync(경로, { recursive: true }) — Sync는 끝날 때까지 기다린다는 뜻이고, recursive: true는 상위 폴더까지 한 번에 만들고 이미 있어도 에러를 내지 않는 옵션이에요.
// [작성 이유] 처음 실행했을 때 data/uploads 폴더가 없으면 DB를 열거나 사진을 저장할 때 서버가 멈춰 버리기 때문이에요.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// [뜻/역할] 실제 배포 환경(isProd)인데도 환경변수 SECRET(쿠키 서명용 비밀키)이 설정되지 않았다면 경고를 찍고 서버를 즉시 종료해요.
// [문법] if (조건1 && !조건2) { ... } — &&는 둘 다 참일 때, !는 반대로(없을 때)라는 뜻이에요.
// [작성 이유] 누구나 아는 기본 비밀키로 실제 서비스를 운영하면 해커가 로그인 쿠키를 가짜로 만들어 남의 계정으로 들어올 수 있어서 아예 서버가 안 켜지게 막는 안전장치예요.
if (isProd && !process.env.SECRET) {
  // [뜻/역할] 터미널 에러창에 왜 서버가 꺼졌는지 빨간 경고 문구를 출력해요.
  // [문법] console.error('문자열');
  // [작성 이유] 배포 로그를 보고 관리자가 "아, SECRET 환경변수를 넣어야 하는구나!"라고 바로 알 수 있게 해요.
  console.error('SECRET 환경변수가 없어요. 배포 환경에서는 꼭 설정해 주세요.');
  // [뜻/역할] 프로그램을 실패 상태(코드 1)로 즉시 끝내요.
  // [문법] process.exit(1); — 0은 정상 종료, 1 이상의 숫자는 오류로 인한 종료를 뜻해요.
  // [작성 이유] 위험한 상태로 서버가 계속 돌아가는 것을 원천 차단하기 위해서예요.
  process.exit(1);
}

// [뜻/역할] 이 파일에서 계산한 설정값들을 하나의 객체로 묶어서 다른 파일들이 가져다 쓸 수 있게 내보내요.
// [문법] module.exports = { 키: 값, ... }; — 이름과 변수명이 같으면(예: isProd) 한 번만 써도 돼요(단축 속성명).
// [작성 이유] server.js, db.js, routes/*.js 등이 설정값을 각자 따로 적지 않고 이 파일 하나만 바라보게(Single Source of Truth) 하기 위해서예요.
module.exports = {
  // [뜻/역할] 배포 환경 여부(true/false)를 내보내요.
  // [문법] isProd: isProd의 축약형이에요.
  // [작성 이유] server.js에서 https 전용 쿠키(secure) 옵션을 켤지 결정할 때 써요.
  isProd,
  // [뜻/역할] 서버가 열 포트 번호예요. 환경변수 PORT가 있으면 숫자로 바꿔 쓰고, 없으면 기본값 3000번을 써요.
  // [문법] Number(값) || 3000 — 환경변수는 항상 글자(문자열)로 들어오므로 Number()로 숫자로 바꿔요.
  // [작성 이유] Railway 같은 클라우드 서버는 자기들이 정해 준 포트 번호를 환경변수로 넣어 주기 때문이에요.
  PORT: Number(process.env.PORT) || 3000,
  // [뜻/역할] 로그인 세션 쿠키에 도장을 찍을 비밀키예요. 환경변수가 없으면 개발용 기본 문자열을 써요.
  // [문법] process.env.SECRET || 'part-dev-only'
  // [작성 이유] 내 컴퓨터에서 개발할 때는 매번 환경변수를 넣기 번거로우니 개발용 기본값을 둔 거예요.
  SECRET: process.env.SECRET || 'part-dev-only',
  // [뜻/역할] 데이터 폴더 경로를 내보내요.
  // [문법] 객체 단축 속성명
  // [작성 이유] 서버 시작 로그에 현재 데이터가 어디 저장되는지 보여 주기 위해 써요.
  DATA_DIR,
  // [뜻/역할] 업로드 사진 폴더 경로를 내보내요.
  // [문법] 객체 단축 속성명
  // [작성 이유] 사진을 저장(projects.js)하거나 보여 주고 지울 때(server.js, auth.js) 위치를 알아야 해서예요.
  UPLOAD_DIR,
  // [뜻/역할] SQLite 데이터베이스 파일(part.db)의 전체 경로를 내보내요.
  // [문법] path.join(DATA_DIR, 'part.db')
  // [작성 이유] db.js에서 정확히 이 파일 이름을 열어 데이터를 읽고 쓰기 위해서예요.
  DB_FILE: path.join(DATA_DIR, 'part.db'),
  // [뜻/역할] 브라우저 화면 파일들(HTML, CSS, JS)이 들어 있는 frontend/ 폴더 경로예요.
  // [문법] path.join(__dirname, '..', 'frontend')
  // [작성 이유] server.js에서 사용자가 접속했을 때 화면 파일들을 그대로 꺼내 주기 위해서예요.
  FRONTEND_DIR: path.join(__dirname, '..', 'frontend'),
  // [뜻/역할] 프론트엔드와 백엔드가 함께 쓰는 shared/ 폴더 경로예요.
  // [문법] path.join(__dirname, '..', 'shared')
  // [작성 이유] 브라우저에서도 /shared/categories.js 주소로 분야 목록을 받아 갈 수 있게 열어 두려고요.
  SHARED_DIR: path.join(__dirname, '..', 'shared'),
};
