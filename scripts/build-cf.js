// Cloudflare 배포용: frontend/ 와 shared/ 를 dist/public/ 하나로 모은다 (Static Assets는 폴더 하나만 받는다)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist', 'public');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'frontend'), out, { recursive: true });
fs.cpSync(path.join(root, 'shared'), path.join(out, 'shared'), { recursive: true });
console.log('built →', path.relative(root, out));
