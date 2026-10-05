-- ═══════════════════════════════════════════════════════════════════
-- Phase 2 · get_stock_flow RPC · column rename + pcode 추가 (사용자 승인 2026-10-04)
--
-- 배경
--   · XLSX 폐기 결정 (2026-10-04) 이후 · stock_history 컬럼 네이밍 재정의
--   · 사용자 지시 · "모든 코드 변경" · 반환 column 이름도 신규 이름으로 통일
--   · products.pcode 를 상품 relation 공식 identity 로 승격 (PCode 1차 identity 선언)
--
-- Column rename 적용
--   sh.snapshot_date       → sh.period_end
--   sh.period_start_date   → sh.period_start
--   sh.opening_stock       → sh.prv_stock
--   sh.purchase_qty        → sh.buy_stock
--   sh.sale_qty            → sh.sale_stock
--   sh.disposal_qty        → sh.product_bad_stock
--
-- 유지 (RENAME 아님)
--   closing_stock · total_amount · product_name · supplier_name · spec · product_code
--
-- 신규 반환 column
--   pcode TEXT (products.pcode 기준 상품 relation 공식화)
--
-- stock_history 집계·JOIN 전환 (사용자 승인 2026-10-04)
--   GROUP BY sh.product_code      → GROUP BY sh.pcode
--   JOIN sh_agg.product_code=p.product_code → sh_agg.pcode = p.pcode
--   JOIN sh_month.product_code=p.product_code → sh_month.pcode = p.pcode
--   purchase_details JOIN 은 기존 product_code 기준 유지 (사용자 명시)
--
-- WHERE 조건 변경
--   WHERE sh.snapshot_date → WHERE sh.period_end (p_from, p_to 범위)
--
-- 실행 · Supabase SQL Editor (수동 실행 · Phase 2 진입 시점)
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS get_stock_flow(date, date);

CREATE OR REPLACE FUNCTION public.get_stock_flow(p_from date, p_to date)
RETURNS TABLE (
  product_code           TEXT,
  pcode                  TEXT,
  product_name           TEXT,
  supplier               TEXT,
  spec                   TEXT,
  prv_stock              INT,
  buy_stock              INT,
  sale_stock             INT,
  product_bad_stock      INT,
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
  sale_stock_month       INT,
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
      sh.pcode::TEXT AS pcode,
      COALESCE(SUM(NULLIF(sh.prv_stock::text, '')::numeric), 0)::INT           AS prv_stock,
      COALESCE(SUM(NULLIF(sh.buy_stock::text, '')::numeric), 0)::INT           AS buy_stock,
      COALESCE(SUM(NULLIF(sh.sale_stock::text, '')::numeric), 0)::INT          AS sale_stock,
      COALESCE(SUM(NULLIF(sh.product_bad_stock::text, '')::numeric), 0)::INT   AS product_bad_stock,
      COALESCE(SUM(NULLIF(sh.closing_stock::text, '')::numeric), 0)::INT       AS closing_stock,
      COALESCE(SUM(NULLIF(sh.total_amount::text, '')::numeric), 0)::NUMERIC    AS total_amount,
      MAX(sh.product_name)::TEXT   AS product_name,
      MAX(sh.supplier_name)::TEXT  AS supplier,
      MAX(sh.spec)::TEXT           AS spec
    FROM stock_history sh
    WHERE sh.period_end >= p_from AND sh.period_end <= p_to
      AND sh.pcode IS NOT NULL
    GROUP BY sh.pcode
  ),
  sh_month AS (
    SELECT
      sh.pcode::TEXT AS pcode,
      COALESCE(SUM(NULLIF(sh.sale_stock::text, '')::numeric), 0)::INT          AS sale_stock_month,
      COALESCE(SUM(NULLIF(sh.total_amount::text, '')::numeric), 0)::NUMERIC    AS sale_amount_month
    FROM stock_history sh
    WHERE sh.period_end >= v_month_ago AND sh.period_end <= CURRENT_DATE
      AND sh.pcode IS NOT NULL
    GROUP BY sh.pcode
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
    p.pcode::TEXT                                                               AS pcode,
    COALESCE(sh_agg.product_name, p.product_name)::TEXT                         AS product_name,
    COALESCE(sh_agg.supplier, p.supplier)::TEXT                                 AS supplier,
    COALESCE(sh_agg.spec, p.spec)::TEXT                                         AS spec,
    COALESCE(sh_agg.prv_stock, 0)                                               AS prv_stock,
    COALESCE(sh_agg.buy_stock, 0)                                               AS buy_stock,
    COALESCE(sh_agg.sale_stock, 0)                                              AS sale_stock,
    COALESCE(sh_agg.product_bad_stock, 0)                                       AS product_bad_stock,
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
    COALESCE(sh_month.sale_stock_month, 0)                                      AS sale_stock_month,
    COALESCE(sh_month.sale_amount_month, 0::numeric)                            AS sale_amount_month,
    pd_last.last_purchase_qty                                                   AS last_purchase_qty
  FROM products p
  LEFT JOIN sh_agg   ON sh_agg.pcode        = p.pcode
  LEFT JOIN sh_month ON sh_month.pcode      = p.pcode
  LEFT JOIN pd_agg   ON pd_agg.product_code = p.product_code
  LEFT JOIN pd_last  ON pd_last.product_code = p.product_code
  WHERE p.hidden IS NOT TRUE
    AND (
      sh_agg.pcode IS NOT NULL
      OR pd_agg.product_code IS NOT NULL
      OR COALESCE(NULLIF(p.current_stock::text, '')::numeric, 0) > 0
    );
END;
$$;

-- PostgREST 스키마 리로드 (반환 TABLE 변경 반영)
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════
-- 검증
--   SELECT count(*) FROM get_stock_flow('2026-08-01', '2026-09-01');
--   SELECT product_code, pcode, prv_stock, buy_stock, sale_stock, product_bad_stock
--     FROM get_stock_flow('2026-08-01', '2026-09-01') LIMIT 5;
-- ═══════════════════════════════════════════════════════════════════
