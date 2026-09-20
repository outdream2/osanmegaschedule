-- 2026-09-20 · 사용자 지시 · 테스트로 시작하는 모든 상품 · 판매 50개 데이터 추가
-- ⚠️  Supabase SQL Editor 에서 실행
-- 사전 확인 · 대상 상품 개수 확인 후 실행
-- 사전 백업 · Supabase Dashboard > Database > Backups (기본 자동)

-- 1. 대상 확인 (실행 전)
-- SELECT product_code, product_name, supplier
-- FROM products
-- WHERE product_name LIKE '테스트%'
-- ORDER BY product_name;

-- 2. 실행 · 오늘 날짜 스냅샷 · sale_qty = 50 (기존 값 덮어씀)
INSERT INTO stock_history (
  snapshot_date,
  product_code,
  product_name,
  supplier_name,
  spec,
  opening_stock,
  purchase_qty,
  sale_qty,
  disposal_qty,
  closing_stock,
  total_amount
)
SELECT
  CURRENT_DATE,
  p.product_code,
  p.product_name,
  p.supplier,
  p.spec,
  COALESCE(p.current_stock, 0) + 50,   -- opening = current + sold (역산)
  0,                                    -- purchase_qty
  50,                                   -- sale_qty · 사용자 지시
  0,                                    -- disposal_qty
  COALESCE(p.current_stock, 0),         -- closing = 현재고 그대로
  50 * COALESCE(p.sale_price, 0)        -- 판매액 = 50 × 판매가
FROM products p
WHERE p.product_name LIKE '테스트%'
ON CONFLICT (snapshot_date, product_code) DO UPDATE
SET
  sale_qty     = 50,
  total_amount = 50 * COALESCE((SELECT sale_price FROM products WHERE product_code = stock_history.product_code), 0);

-- 3. 검증 · 실행 후
-- SELECT product_code, product_name, sale_qty, closing_stock, total_amount
-- FROM stock_history
-- WHERE snapshot_date = CURRENT_DATE
--   AND product_name LIKE '테스트%'
-- ORDER BY product_name;
