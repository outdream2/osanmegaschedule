-- 2026-09-20 · 사용자 지시 · 진열요청 · 요청자(requester) 정보 저장
-- ⚠️  Supabase SQL Editor 에서 직접 실행 (대원칙 · 파괴적 SQL X · IF NOT EXISTS 안전)
-- 사용자 실행 후 · 서버 코드 (server/routes/display/requests.ts) 자동 활성

ALTER TABLE display_requests
  ADD COLUMN IF NOT EXISTS requested_by_id INTEGER,
  ADD COLUMN IF NOT EXISTS requested_by_name TEXT;

-- 검증
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'display_requests' AND column_name IN ('requested_by_id', 'requested_by_name');
