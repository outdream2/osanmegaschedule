-- 2026-09-09 · 진열요청 · 상품별 dedup 스펙
-- 재요청 시 · 신규 insert 하지 않고 · 기존 pending 요청의 request_count 증가
-- 첫 요청일(first_requested_at) 유지 · 최근 요청일(requested_at) 재요청마다 갱신
-- 담당자(assigned_staff_id/name) · 최근 요청자로 덮어씀

ALTER TABLE display_requests
  ADD COLUMN IF NOT EXISTS request_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS first_requested_at timestamptz;

-- 기존 데이터 백필 · 첫 요청일 = 기존 requested_at
UPDATE display_requests
   SET first_requested_at = requested_at
 WHERE first_requested_at IS NULL;
