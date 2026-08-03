-- 2026-08-03 · 실재고입력 (ScanPage) 5분리 + 매장 구역 저장
--
-- 기존 컬럼:
--   warehouse_stock  (레거시 · 단일 창고)
--   store_stock      (매장1 · 하위 호환)
--   store_stock_2    (매장2 · 하위 호환)
--
-- 신규 컬럼 (Phase 3+4):
--   warehouse1_stock · warehouse2_stock · store3_stock
--   store1_zone      · store2_zone      · store3_zone
--
-- 서버 라우터 (server/routes/requests.ts) 는 신규+레거시 mirror 저장하도록 대응됨.
-- 컬럼 미존재 DB 에서도 다운그레이드 저장 · 자동 폴백.

ALTER TABLE inventory_checks ADD COLUMN IF NOT EXISTS warehouse1_stock INT;
ALTER TABLE inventory_checks ADD COLUMN IF NOT EXISTS warehouse2_stock INT;
ALTER TABLE inventory_checks ADD COLUMN IF NOT EXISTS store3_stock     INT;

ALTER TABLE inventory_checks ADD COLUMN IF NOT EXISTS store1_zone TEXT;
ALTER TABLE inventory_checks ADD COLUMN IF NOT EXISTS store2_zone TEXT;
ALTER TABLE inventory_checks ADD COLUMN IF NOT EXISTS store3_zone TEXT;

-- 기존 데이터 하위 호환 · warehouse_stock → warehouse1_stock 백필 (컬럼 비어있는 행만)
UPDATE inventory_checks
   SET warehouse1_stock = warehouse_stock
 WHERE warehouse1_stock IS NULL
   AND warehouse_stock IS NOT NULL;
