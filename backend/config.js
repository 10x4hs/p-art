// 서버 설정을 한곳에 모은다. 배포할 때는 환경변수로 바꾼다.
const path = require('path');
const fs = require('fs');

const isProd = process.env.NODE_ENV === 'production';
// DB 파일과 업로드 사진이 들어가는 폴더. Railway에서는 볼륨을 붙인 경로(예: /data)로 지정한다.
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (isProd && !process.env.SECRET) {
  console.error('SECRET 환경변수가 없어요. 배포 환경에서는 꼭 설정해 주세요.');
  process.exit(1);
}

module.exports = {
  isProd,
  PORT: Number(process.env.PORT) || 3000,
  SECRET: process.env.SECRET || 'part-dev-only',
  DATA_DIR,
  UPLOAD_DIR,
  DB_FILE: path.join(DATA_DIR, 'part.db'),
  FRONTEND_DIR: path.join(__dirname, '..', 'frontend'),
  SHARED_DIR: path.join(__dirname, '..', 'shared'),
};
