-- ═══════════════════════════════════════════════════════════════════
-- 2026-09-03 · #83 · get_inventory_latest RPC · warehouse_stock DROP 대응 (사용자 지시)
--
-- 배경 · inventory_checks 스키마 변경 (2026-08-31)
--   · 이전 · warehouse_stock (단일) · store_stock · store_stock_2 · store_stock_3
--   · 현재 · warehouse1_stock · warehouse2_stock · store_stock · store3_stock
--     (store2 컬럼 자체 삭제됨 · store3_stock 남아있음)
--
-- 이 RPC · 오늘 실행 결과 · 'column warehouse_stock does not exist'
--   → client fallback 있어 무응답 아니지만 · 성능 저하 (batch fetch 수십 라운드)
--
-- 이후 · 현재 스키마 반영 · warehouse1_stock + warehouse2_stock + store_stock + store3_stock
--
-- 실행 · Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS get_inventory_latest();

CREATE OR REPLACE FUNCTION get_inventory_latest()
RETURNS TABLE (
  product_code       TEXT,
  warehouse1_stock   INT,
  warehouse2_stock   INT,
  store_stock        INT,
  store3_stock       INT,
  store1_zone        TEXT,
  store2_zone        TEXT,
  store3_zone        TEXT,
  checked_at         TIMESTAMPTZ
)
LANGUAGE sql AS $$
  SELECT DISTINCT ON (ic.product_code)
    ic.product_code::TEXT,
    COALESCE(NULLIF(ic.warehouse1_stock::text, '')::numeric, 0)::INT AS warehouse1_stock,
    COALESCE(NULLIF(ic.warehouse2_stock::text, '')::numeric, 0)::INT AS warehouse2_stock,
    COALESCE(NULLIF(ic.store_stock::text, '')::numeric, 0)::INT      AS store_stock,
    COALESCE(NULLIF(ic.store3_stock::text, '')::numeric, 0)::INT     AS store3_stock,
    ic.store1_zone::TEXT,
    ic.store2_zone::TEXT,
    ic.store3_zone::TEXT,
    ic.checked_at
  FROM inventory_checks ic
  WHERE ic.product_code IS NOT NULL
  ORDER BY ic.product_code, ic.checked_at DESC NULLS LAST;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 검증
--   SELECT * FROM get_inventory_latest() LIMIT 5;
-- ═══════════════════════════════════════════════════════════════════
