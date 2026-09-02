-- ═══════════════════════════════════════════════════════════════════
-- 2026-09-03 · #84 · get_stock_flow RPC · COALESCE 타입 mismatch fix (사용자 지시)
--
-- 배경 · 오늘 RPC 감사 결과 · 실행 시 'COALESCE types text and integer cannot be matched'
--   · 원인 · docs/supabase_functions_and_tables.sql 원본 SQL · 일부 컬럼 타입 캐스팅 미스
--   · client fallback 있어 무응답 아니지만 · 성능 저하 (batch 조회 순차)
--
-- 이 파일 · 원본 (docs/supabase_functions_and_tables.sql L146-262) 을 정정하여 재정의
--   · text→numeric 안전 캐스팅 · COALESCE 는 동일 타입만
--   · text 필드 명시적 캐스팅 (::text)
--
-- 실행 · Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS get_stock_flow(date, date);

CREATE OR REPLACE FUNCTION get_stock_flow(p_from date, p_to date)
RETURNS TABLE (
  product_code           TEXT,
  product_name           TEXT,
  supplier               TEXT,
  spec                   TEXT,
  opening_stock          INT,
  purchase_qty           INT,
  sale_qty               INT,
  disposal_qty           INT,
  closing_stock          INT,
  total_amount           NUMERIC,
  optimal_stock          INT,
  sale_price             NUMERIC,
  purchase_price         NUMERIC,
  current_stock          INT,
  min_order              INT,
  last_purchase_date     TEXT,
  first_purchase_date    TEXT,
  purchase_count         INT,
  purchase_total_qty     INT,
  purchase_total_amount  NUMERIC,
  sale_qty_month         INT,
  sale_amount_month      NUMERIC,
  last_purchase_qty      INT
)
LANGUAGE plpgsql AS $$
DECLARE
  v_month_ago date := (CURRENT_DATE - INTERVAL '30 days')::date;
BEGIN
  RETURN QUERY
  WITH sh_agg AS (
    SELECT
      sh.product_code::TEXT AS product_code,
      COALESCE(SUM(NULLIF(sh.opening_stock::text, '')::numeric), 0)::INT      AS opening_stock,
      COALESCE(SUM(NULLIF(sh.purchase_qty::text, '')::numeric), 0)::INT       AS purchase_qty,
      COALESCE(SUM(NULLIF(sh.sale_qty::text, '')::numeric), 0)::INT           AS sale_qty,
      COALESCE(SUM(NULLIF(sh.disposal_qty::text, '')::numeric), 0)::INT       AS disposal_qty,
      COALESCE(SUM(NULLIF(sh.closing_stock::text, '')::numeric), 0)::INT      AS closing_stock,
      COALESCE(SUM(NULLIF(sh.total_amount::text, '')::numeric), 0)::NUMERIC   AS total_amount,
      MAX(sh.product_name)::TEXT   AS product_name,
      MAX(sh.supplier_name)::TEXT  AS supplier,
      MAX(sh.spec)::TEXT           AS spec
    FROM stock_history sh
    WHERE sh.snapshot_date >= p_from AND sh.snapshot_date <= p_to
    GROUP BY sh.product_code
  ),
  sh_month AS (
    SELECT
      sh.product_code::TEXT AS product_code,
      COALESCE(SUM(NULLIF(sh.sale_qty::text, '')::numeric), 0)::INT           AS sale_qty_month,
      COALESCE(SUM(NULLIF(sh.total_amount::text, '')::numeric), 0)::NUMERIC   AS sale_amount_month
    FROM stock_history sh
    WHERE sh.snapshot_date >= v_month_ago AND sh.snapshot_date <= CURRENT_DATE
    GROUP BY sh.product_code
  ),
  pd_agg AS (
    SELECT
      pd.product_code::TEXT AS product_code,
      COUNT(DISTINCT pd.purchase_date)::INT AS purchase_count,
      MIN(pd.purchase_date)::TEXT           AS first_purchase_date,
      MAX(pd.purchase_date)::TEXT           AS last_purchase_date,
      COALESCE(SUM(NULLIF(pd.quantity::text, '')::numeric), 0)::INT                             AS purchase_total_qty,
      COALESCE(SUM(NULLIF(COALESCE(pd.total, pd.amount)::text, '')::numeric), 0)::NUMERIC       AS purchase_total_amount
    FROM purchase_details pd
    GROUP BY pd.product_code
  ),
  pd_last AS (
    SELECT DISTINCT ON (pd.product_code)
      pd.product_code::TEXT AS product_code,
      COALESCE(NULLIF(pd.quantity::text, '')::numeric, 0)::INT AS last_purchase_qty
    FROM purchase_details pd
    ORDER BY pd.product_code, pd.purchase_date DESC
  )
  SELECT
    p.product_code::TEXT                                                        AS product_code,
    COALESCE(sh_agg.product_name, p.product_name)::TEXT                         AS product_name,
    COALESCE(sh_agg.supplier, p.supplier)::TEXT                                 AS supplier,
    COALESCE(sh_agg.spec, p.spec)::TEXT                                         AS spec,
    COALESCE(sh_agg.opening_stock, 0)                                           AS opening_stock,
    COALESCE(sh_agg.purchase_qty, 0)                                            AS purchase_qty,
    COALESCE(sh_agg.sale_qty, 0)                                                AS sale_qty,
    COALESCE(sh_agg.disposal_qty, 0)                                            AS disposal_qty,
    COALESCE(sh_agg.closing_stock, 0)                                           AS closing_stock,
    COALESCE(sh_agg.total_amount, 0::numeric)                                   AS total_amount,
    COALESCE(NULLIF(p.optimal_stock::text, '')::numeric, 0)::INT                AS optimal_stock,
    COALESCE(NULLIF(p.sale_price::text, '')::numeric, 0)::NUMERIC               AS sale_price,
    COALESCE(NULLIF(p.purchase_price::text, '')::numeric, 0)::NUMERIC           AS purchase_price,
    COALESCE(NULLIF(p.current_stock::text, '')::numeric, 0)::INT                AS current_stock,
    COALESCE(NULLIF(p.min_order::text, '')::numeric, 0)::INT                    AS min_order,
    pd_agg.last_purchase_date                                                   AS last_purchase_date,
    pd_agg.first_purchase_date                                                  AS first_purchase_date,
    COALESCE(pd_agg.purchase_count, 0)                                          AS purchase_count,
    COALESCE(pd_agg.purchase_total_qty, 0)                                      AS purchase_total_qty,
    COALESCE(pd_agg.purchase_total_amount, 0::numeric)                          AS purchase_total_amount,
    COALESCE(sh_month.sale_qty_month, 0)                                        AS sale_qty_month,
    COALESCE(sh_month.sale_amount_month, 0::numeric)                            AS sale_amount_month,
    pd_last.last_purchase_qty                                                   AS last_purchase_qty
  FROM products p
  LEFT JOIN sh_agg   ON sh_agg.product_code = p.product_code
  LEFT JOIN sh_month ON sh_month.product_code = p.product_code
  LEFT JOIN pd_agg   ON pd_agg.product_code = p.product_code
  LEFT JOIN pd_last  ON pd_last.product_code = p.product_code
  WHERE p.hidden IS NOT TRUE
    AND (
      sh_agg.product_code IS NOT NULL
      OR pd_agg.product_code IS NOT NULL
      OR COALESCE(NULLIF(p.current_stock::text, '')::numeric, 0) > 0
    );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 검증
--   SELECT count(*) FROM get_stock_flow('2026-08-01', '2026-09-01');
-- ═══════════════════════════════════════════════════════════════════
