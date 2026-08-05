-- =====================================================================
-- migrations/rpc_only_2026-08-05.sql
-- 생성일: 2026-08-05
-- 용도: 안전한 RPC 함수만 · invoice_date 타입 변환 스킵 (이미 이관됨 or 컬럼 미존재)
-- 실행: Supabase SQL Editor 에 전체 붙여넣기 → Run
-- 안전: CREATE OR REPLACE · 중복 실행 무해
-- =====================================================================

-- ─────────────────────────────────────────────────────────────
-- get_inventory_latest RPC · 상품별 최신 실재고 (효율)
--   · 재고관리 페이지 로딩 · 10배+ 빨라짐 (서버 페이지루프 fallback 대체)
--   · warehouse1_stock 우선 · 없으면 warehouse_stock (레거시)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_inventory_latest()
RETURNS TABLE (
  product_code    TEXT,
  warehouse_stock INT,
  store_stock     INT,
  checked_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT ON (product_code)
    product_code,
    COALESCE(warehouse1_stock, warehouse_stock) AS warehouse_stock,
    store_stock,
    checked_at
  FROM inventory_checks
  ORDER BY product_code, checked_at DESC;
$$;

COMMENT ON FUNCTION get_inventory_latest IS
  '상품별 최신 실재고 (checked_at DESC 최상위) · 재고관리 페이지 로딩 최적화';

-- ─────────────────────────────────────────────────────────────
-- 검증 쿼리 (선택)
-- ─────────────────────────────────────────────────────────────
-- SELECT * FROM get_inventory_latest() LIMIT 5;
-- SELECT COUNT(*) FROM get_inventory_latest();

-- ─────────────────────────────────────────────────────────────
-- 롤백 (필요 시)
-- ─────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS get_inventory_latest();
