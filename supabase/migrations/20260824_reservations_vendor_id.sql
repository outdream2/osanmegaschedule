-- ═══════════════════════════════════════════════════════════════════
-- reservations.vendor_id 컬럼 추가 · 500 error 원인 해결
-- 작성일: 2026-08-24
-- 원인: 2026-07-02 (커밋 44fd7822) · 서버 코드는 vendor_id SELECT · DB 컬럼 없음
--       · GET /api/reservations?date=... 매 호출 500 (column reservations.vendor_id does not exist)
-- 실행 · Supabase Dashboard > SQL Editor · idempotent (IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════

-- 1) 컬럼 추가 · vendor_id (nullable · 기존 예약은 NULL)
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS vendor_id UUID NULL;

-- 2) 외래키 (선택 · vendors.id UUID 인 경우만)
-- ALTER TABLE reservations
--   ADD CONSTRAINT reservations_vendor_id_fkey
--   FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;

-- 3) 인덱스 · vendor_id 로 조회 (선택 · 저트래픽이면 생략)
CREATE INDEX IF NOT EXISTS idx_reservations_vendor_id
  ON reservations (vendor_id)
  WHERE vendor_id IS NOT NULL;

-- 4) 코멘트
COMMENT ON COLUMN reservations.vendor_id IS '공급사 예약 시 vendors.id 참조 (nullable · 일반 예약 NULL)';

-- ═══════════════════════════════════════════════════════════════════
-- 확인 SQL (실행 후)
-- ═══════════════════════════════════════════════════════════════════
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'reservations'
--    AND column_name = 'vendor_id';

-- ═══════════════════════════════════════════════════════════════════
-- 롤백 (사용자 승인 필수)
-- ═══════════════════════════════════════════════════════════════════
-- DROP INDEX IF EXISTS idx_reservations_vendor_id;
-- ALTER TABLE reservations DROP COLUMN IF EXISTS vendor_id;
