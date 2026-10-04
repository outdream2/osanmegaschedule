-- 2026-10-04 · Phase 2 · ERP PCode (상품분류코드) column 추가
--
-- ⚠⚠⚠ 자동 실행 금지 · 사용자 명시 승인 후 Supabase SQL Editor 에서 수동 실행
--
-- 파일명 접두 "future_" · 알파벳 정렬상 날짜 migration 뒤 → auto-apply 체인 안 걸림
--
-- 목적:
--   ERP Inventory_Status / Buy_Status / Sale_Status 응답에는 BarCode 가 없고 PCode 만 존재
--   (실측 재확인 · 2026-10-04 Fiddler raw response 디코드 결과 BarCode 문자열 없음)
--
--   현재 products.product_code = ERP BarCode (바코드) 로 사용 중이지만,
--   ERP Buy/Inventory/Sale 와 매칭하려면 PCode 가 필요함.
--
--   대원칙 "데이터 임의 연결 금지" (feedback_no_data_fabrication_2026-10-04) 완벽 준수를 위해
--   products.pcode 를 신규 column 으로 추가. 로컬 join 없이 ERP 응답과 직접 매칭 가능.
--
-- 설계 (Option B · 최소 변경):
--   products.product_code  (기존)  = ERP BarCode (바코드) · identity · 변경 없음
--   products.pcode         (신규)  = ERP PCode (상품분류코드) · unique nullable
--
--   → ERP 응답과 매칭:
--      · Product_List · BarCode = product_code  (기존 identity)
--      · Inventory/Buy/Sale · PCode = pcode     (신규 identity)
--
-- 영향:
--   · 기존 코드 변경 없음 · 신규 column 만 추가
--   · 외래키 테이블 (purchase_details · stock_history · inventory_checks) 영향 없음 (product_code 유지)
--   · 초기 채우기 스크립트: scripts/fill-pcode-from-product-list-2026-10-04.mjs (DRY-RUN default)
--
-- 롤백:
--   DROP INDEX IF EXISTS idx_products_pcode;
--   ALTER TABLE products DROP COLUMN IF EXISTS pcode;

BEGIN;

-- 1. pcode 열 추가 (nullable · 초기엔 전부 NULL · 채우기 스크립트로 UPDATE 예정)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS pcode TEXT;

-- 2. unique index · NULL 은 허용 (초기 미채움 상태 → 점진 채움)
--    partial index · pcode IS NOT NULL 만 unique 강제
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_pcode
  ON products (pcode)
  WHERE pcode IS NOT NULL;

-- 3. 조회 보조 index (ERP sync 시 pcode lookup 자주 발생 예상)
--    위 unique index 가 이미 lookup 가속 → 추가 index 불필요

-- 4. column comment
COMMENT ON COLUMN products.pcode IS
  'ERP 상품분류코드 (Product_List.PCode) · Inventory/Buy/Sale 응답과 매칭 identity · 2026-10-04 추가';

COMMIT;

-- 실행 후 확인:
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'products' AND column_name = 'pcode';
--
--   SELECT indexname, indexdef FROM pg_indexes
--    WHERE tablename = 'products' AND indexname LIKE '%pcode%';
