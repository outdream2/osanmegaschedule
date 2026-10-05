-- 2026-10-04 · Phase 2 · ERP 날짜 column 2개 추가
--
-- ⚠⚠⚠ 자동 실행 금지 · 사용자 명시 승인 후 Supabase SQL Editor 에서 수동 실행
--
-- 파일명 접두 "future_" · 알파벳 정렬상 날짜 migration 뒤 → auto-apply 체인 안 걸림
--
-- 목적:
--   ERP Product_List.RegDate / EditDate 를 Supabase 에 보관
--   기존 products.registered_at (date) / last_modified_at (date) 와 **의미/타입 다름**:
--     · registered_at (date)       = 상품 Supabase 최초 등록일 (문자열 YYYY-MM-DD)
--     · last_modified_at (date)    = DB row 수정일 또는 상품정보 수정일 (문자열 YYYY-MM-DD)
--     · ERP RegDate (timestamptz)  = ERP 에서 상품 등록 시각 (2026-09-29T16:39:59)
--     · ERP EditDate (timestamptz) = ERP 에서 상품정보 마지막 수정 시각
--
-- 사용자 2026-10-04 명시 승인:
--   products.registered_at / last_modified_at 은 이번 작업에서 **삭제하지 않음**
--   신규 column 2개 추가로 ERP 날짜를 분리 보관
--
-- 영향:
--   · 기존 코드 변경 없음 · 신규 column 2개 추가만
--   · 외래키 영향 없음
--   · unique constraint 없음 (date 는 중복 많음)
--
-- 롤백:
--   ALTER TABLE products DROP COLUMN IF EXISTS erp_registered_at;
--   ALTER TABLE products DROP COLUMN IF EXISTS erp_modified_at;

BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS erp_registered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS erp_modified_at TIMESTAMPTZ;

COMMENT ON COLUMN products.erp_registered_at IS
  'ERP Product_List.RegDate (ERP 에서 상품 최초 등록 시각) · 2026-10-04 추가';
COMMENT ON COLUMN products.erp_modified_at IS
  'ERP Product_List.EditDate (ERP 에서 상품정보 마지막 수정 시각) · 2026-10-04 추가';

COMMIT;

-- 실행 후 확인:
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'products' AND column_name IN ('erp_registered_at', 'erp_modified_at');
