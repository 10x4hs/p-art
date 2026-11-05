// 작품 분야 목록 — 프론트(브라우저)와 백엔드(Node)가 이 파일 하나를 같이 쓴다.
// 분야를 바꾸려면 여기만 고치면 된다.
(function (root) {
  const CATS = ['웹사이트', '게임', '학교생활', '공부', '도구'];
  if (typeof module !== 'undefined' && module.exports) module.exports = CATS;   // Node: require('../shared/categories')
  else root.CATS = CATS;                                                        // 브라우저: <script src="/shared/categories.js">
})(this);
