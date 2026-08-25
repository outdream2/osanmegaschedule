-- ═══════════════════════════════════════════════════════════════════
-- #192 · 거래처 승인 flow · vendors 테이블 확장
-- 작성일: 2026-08-23 · 수정: DO EXCEPTION → IF NOT EXISTS 방식
-- 실행 · Supabase Dashboard > SQL Editor · 또는 psql -f 이 파일
-- ═══════════════════════════════════════════════════════════════════

-- 1. approval_status ENUM 타입 · 존재 확인 후 생성
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_approval_status') THEN
    CREATE TYPE vendor_approval_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END
$$;

-- 2. vendors 테이블 · 4 신규 컬럼 추가 (IF NOT EXISTS 안전)
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS approval_status vendor_approval_status NOT NULL DEFAULT 'approved';

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS approval_requested_at TIMESTAMPTZ NULL;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS approved_by INTEGER NULL REFERENCES employees(id) ON DELETE SET NULL;

-- 3. 기존 vendors · 모두 approved 로 처리 (하위 호환)
--    이미 등록된 공급사는 승인된 것으로 간주 · 신규 승인 flow 만 pending 시작
UPDATE vendors
   SET approval_status = 'approved',
       approved_at = COALESCE(approved_at, NOW())
 WHERE approval_status = 'approved'
   AND approved_at IS NULL;

-- 4. 인덱스 · 승인 대기 조회 빠름 (partial index)
CREATE INDEX IF NOT EXISTS idx_vendors_approval_status_pending
  ON vendors (approval_status)
  WHERE approval_status = 'pending';

-- 5. approved_by 조회 인덱스 (누가 승인했는지 추적)
CREATE INDEX IF NOT EXISTS idx_vendors_approved_by
  ON vendors (approved_by)
  WHERE approved_by IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 애플리케이션 로직 (참고)
-- ═══════════════════════════════════════════════════════════════════
-- 신규 vendor 등록 시 · 애플리케이션 레벨에서 명시:
--   INSERT INTO vendors (..., approval_status) VALUES (..., 'pending');
--
-- 승인 요청 (Step 2):
--   UPDATE vendors SET approval_requested_at = NOW() WHERE id = ?;
--
-- 관리자 승인 (Step 3):
--   UPDATE vendors
--      SET approval_status = 'approved',
--          approved_at = NOW(),
--          approved_by = ?
--    WHERE id = ?;
--
-- 관리자 거절:
--   UPDATE vendors
--      SET approval_status = 'rejected',
--          approved_at = NOW(),
--          approved_by = ?
--    WHERE id = ?;

-- ═══════════════════════════════════════════════════════════════════
-- 롤백 SQL (문제 발생 시 · 사용자 승인 필수)
-- ═══════════════════════════════════════════════════════════════════
-- DROP INDEX IF EXISTS idx_vendors_approved_by;
-- DROP INDEX IF EXISTS idx_vendors_approval_status_pending;
-- ALTER TABLE vendors
--   DROP COLUMN IF EXISTS approved_by,
--   DROP COLUMN IF EXISTS approved_at,
--   DROP COLUMN IF EXISTS approval_requested_at,
--   DROP COLUMN IF EXISTS approval_status;
-- DROP TYPE IF EXISTS vendor_approval_status;
