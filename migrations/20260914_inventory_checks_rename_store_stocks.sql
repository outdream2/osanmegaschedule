-- 2026-09-14 · #139 · inventory_checks · 매장 재고 컬럼명 통일 rename
--   · 사용자 지시 · "수정해. 맞춰"
--
-- Before:
--   store_stock         (매장1)
--   store_stock_2       (매장2)
--   store3_stock        (매장3)
--
-- After (통일 · warehouseN_stock 규칙과 동일):
--   store1_stock (매장1)
--   store2_stock (매장2)
--   store3_stock (매장3 · 유지)
--
-- ⚠️ CRITICAL · RENAME · 실행 전 백업 권장
-- 실행 방법 · Supabase 콘솔 → SQL Editor → 아래 실행

-- 1) store_stock → store1_stock
ALTER TABLE inventory_checks
  RENAME COLUMN store_stock TO store1_stock;

-- 2) store_stock_2 → store2_stock
ALTER TABLE inventory_checks
  RENAME COLUMN store_stock_2 TO store2_stock;

-- 3) 검증 (SELECT 성공 시 · 통일 완료)
-- SELECT store1_stock, store2_stock, store3_stock FROM inventory_checks LIMIT 1;
