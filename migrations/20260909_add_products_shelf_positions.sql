-- 2026-09-09 · #15 · products.shelf_positions 마스터 컬럼 추가
--   · 상세구역 (층·칸·순서) 마스터 데이터 · 상품별 · JSONB
--   · key=location code (store1·warehouse1 등) · value=3자리 문자열 or null
--   · 예 · {"store1":"111","warehouse1":"105"}
--   · 편집 · PATCH /api/products/:code/shelf-positions
--   · 원칙 · 적정재고 단일 소스 원칙과 동일 · products 마스터 유일 · inventory_checks 스냅샷 금지

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS shelf_positions JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN products.shelf_positions IS
  '상세구역 · JSONB · key=location code (store1·warehouse1 등) · value=3자리 (층·칸·순서 · A~Z, 0~9)';

-- (선택) 기존 inventory_checks 스냅샷에서 최신 데이터 백필 (필요 시 별도 실행)
-- UPDATE products p
-- SET shelf_positions = ic.shelf_positions
-- FROM (
--   SELECT DISTINCT ON (product_code) product_code, shelf_positions
--   FROM inventory_checks
--   WHERE shelf_positions IS NOT NULL AND shelf_positions != '{}'::jsonb
--   ORDER BY product_code, checked_at DESC
-- ) ic
-- WHERE p.product_code = ic.product_code
--   AND (p.shelf_positions IS NULL OR p.shelf_positions = '{}'::jsonb);
