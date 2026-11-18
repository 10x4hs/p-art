-- [파일 개요] 회원에 학번·이름·가입일을 더해요. 기존 표와 열은 그대로 두고 덧붙이기만 해요.
-- 적용: npx wrangler d1 migrations apply p-art --local  (배포 DB는 --remote, main 머지 때 자동)

-- 학번(예: 10101 = 1학년 1반 1번)과 진짜 이름이에요. 본인과 관리자만 볼 수 있고, 공개 프로필에는 나오지 않아요.
-- 이미 가입한 회원은 빈 칸('')으로 시작하고, 내 정보(profile.html)에서 채울 수 있어요.
ALTER TABLE users ADD COLUMN student_no TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN real_name  TEXT DEFAULT '';

-- 가입한 때예요. SQLite는 ALTER로 CURRENT_TIMESTAMP 기본값을 못 붙여서, 가입할 때 auth.js가 직접 적어요.
ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT '';
