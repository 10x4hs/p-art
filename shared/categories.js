// [파일 개요] 작품 분야 목록 공용 파일 — 프론트엔드(브라우저)와 백엔드(Node.js 서버)가 이 파일 단 하나를 같이 읽어요.
// [비유] 홀 메뉴판과 주방 주문서가 함께 보는 '공통 메뉴판 원본'이에요. 분야를 추가하거나 바꿀 때 이 파일 한 곳만 고치면 양쪽에 동시에 반영돼요!

// [뜻/역할] 함수를 만들자마자 그 자리에서 즉시 실행(IIFE)해서, 내부 변수들이 바깥 전역 공간을 어지럽히지 않게 감싸 줘요.
// [문법] (function (매개변수) { ... })(인자); — 마지막의 `(this)`가 첫 줄의 `root` 자리로 들어가요(브라우저에서는 `window` 객체가 됨).
// [작성 이유] Node.js와 브라우저 양쪽 환경에서 모두 에러 없이 동작하는 UMD(Universal Module Definition) 패턴을 구현하기 위해서예요.
(function (root) {
  // [뜻/역할] PART 전시관에서 사용할 5가지 공식 작품 분야를 배열에 정의해요.
  // [문법] const CATS = ['문자열1', '문자열2', ...];
  // [작성 이유] 홈·전시관의 필터 버튼, 작품 등록 화면의 선택 칩, 서버의 허용 분야 검사가 모두 이 배열을 기준으로 돌아가요.
  const CATS = ['웹사이트', '게임', '학교생활', '공부', '도구'];

  // [뜻/역할] 만약 지금 이 파일을 읽고 있는 곳이 Node.js(백엔드 서버)라면 `module.exports`로 배열을 내보내요.
  // [문법] typeof module !== 'undefined' && module.exports — 브라우저에는 `module`이라는 변수가 없으므로 `typeof`로 안전하게 존재 여부를 먼저 확인해요.
  // [작성 이유] `backend/routes/projects.js`에서 `const CATS = require('../../shared/categories')`로 불러올 수 있게 해 줘요.
  if (typeof module !== 'undefined' && module.exports) module.exports = CATS;

  // [뜻/역할] 그렇지 않고 브라우저(`<script src="/shared/categories.js">`)에서 읽혔다면 전역 객체(`window.CATS`)에 걸어 두어요.
  // [문법] else root.CATS = CATS;
  // [작성 이유] 뒤이어 실행되는 `app.js`와 각 HTML 페이지 스크립트에서 `CATS`라는 이름으로 바로 꺼내 쓸 수 있게 해 줘요.
  else root.CATS = CATS;
})(this);
