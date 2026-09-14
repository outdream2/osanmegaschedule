-- 2026-09-14 · #139 · 실재고 · 매장2 재고 컬럼 추가
--   · 사용자 지시 · 매장은 3개까지 지원 (매장1·매장2·매장3)
--   · 기존 DB · store_stock (매장1) · store3_stock (매장3) 만 존재
--   · store_stock_2 (매장2) 컬럼 미배포 → 매장2 재고 저장 불가
--
-- ⚠️ 파괴 X · ADD COLUMN IF NOT EXISTS · 안전
-- 실행 방법 · Supabase 콘솔 → SQL Editor → 아래 SQL 붙여넣기 → RUN

ALTER TABLE inventory_checks
  ADD COLUMN IF NOT EXISTS store_stock_2 INTEGER;

-- 검증 · SELECT (실행 후 · null 반환되면 성공)
-- SELECT store_stock, store_stock_2, store3_stock FROM inventory_checks LIMIT 1;
