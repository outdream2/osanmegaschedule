-- 2026-10-06 · 매입 단가변동 조회 RPC
--
-- 핵심 보장 (사용자 지시):
--   · LAG() 계산 → 그 후 월 필터 (cross-month 보존)
--     예: 10월만 보고 있어도 9월 마지막 단가와 비교 가능
--   · supplier_code IS NOT NULL 전제 · NULL 끼리 묶지 않음
--   · ordering: purchase_date, bm_code NULLS LAST, row_num NULLS LAST, id
--     (legacy xlsx 66% NULL 이므로 id fallback 필수)
--   · 유효 purchase: quantity > 0 AND unit_price > 0 AND supplier_code IS NOT NULL
--   · variance list 는 PRICE_INCREASE / PRICE_DECREASE 만 (UNCHANGED/FIRST 제외)
--   · stale review 감지: review 당시 snapshot ≠ 현재 variance → effective = PENDING
--
-- Arguments:
--   p_months_list      "YYYY-MM,YYYY-MM" · NULL = 전체
--   p_change_type      'PRICE_INCREASE'|'PRICE_DECREASE'|NULL(both)
--   p_review_status    'PENDING'|'CONFIRMED_CHANGE'|'NEEDS_CHECK'|'RESOLVED'|NULL(all)
--   p_supplier_search  supplier_name / supplier_code ILIKE
--   p_product_search   product_name / product_code ILIKE
--   p_sort             'recent' (default) | 'amount' | 'rate'
--   p_page             1-based
--   p_page_size        default 50 · max 200

CREATE OR REPLACE FUNCTION get_purchase_price_variance(
  p_months_list      TEXT    DEFAULT NULL,
  p_change_type      TEXT    DEFAULT NULL,
  p_review_status    TEXT    DEFAULT NULL,
  p_supplier_search  TEXT    DEFAULT NULL,
  p_product_search   TEXT    DEFAULT NULL,
  p_sort             TEXT    DEFAULT 'recent',
  p_page             INT     DEFAULT 1,
  p_page_size        INT     DEFAULT 50
) RETURNS TABLE (
  purchase_detail_id           BIGINT,
  previous_purchase_detail_id  BIGINT,
  product_code                 TEXT,
  product_name                 TEXT,
  supplier_code                TEXT,
  supplier_name                TEXT,
  purchase_date                DATE,
  previous_price               NUMERIC,
  current_price                NUMERIC,
  price_difference             NUMERIC,
  change_rate                  NUMERIC,
  change_type                  TEXT,
  bm_code                      TEXT,
  row_num                      INT,
  review_status                TEXT,
  review_note                  TEXT,
  reviewed_by                  TEXT,
  reviewed_at                  TIMESTAMPTZ,
  effective_review_status      TEXT,
  total_count                  BIGINT,
  -- 2026-10-06 · 사용자 섹션 13 CRITICAL
  --   badge = 현재 filter 범위 안 effective_review_status='PENDING' 전체 건수
  --   현재 page 의 PENDING count 사용 금지 (page_size=20, pending=47 → badge=47)
  pending_count                BIGINT
)
LANGUAGE sql
STABLE
AS $$
  WITH valid_history AS (
    -- 섹션 3,5,6: 유효 purchase 만 chain 대상
    SELECT
      pd.id,
      pd.purchase_date,
      pd.product_code,
      pd.supplier_code,
      pd.supplier_name,
      pd.product_name,
      pd.unit_price,
      pd.bm_code,
      pd.row_num
    FROM purchase_details pd
    WHERE pd.quantity > 0
      AND pd.unit_price > 0
      AND pd.supplier_code IS NOT NULL
      AND pd.product_code IS NOT NULL
  ),
  with_prev AS (
    -- 섹션 6: LAG 계산을 월 필터 전에 적용 (cross-month 보존)
    SELECT
      *,
      LAG(unit_price) OVER w AS prev_price,
      LAG(id)         OVER w AS prev_id
    FROM valid_history
    WINDOW w AS (
      PARTITION BY product_code, supplier_code
      ORDER BY purchase_date,
               bm_code  NULLS LAST,
               row_num  NULLS LAST,
               id
    )
  ),
  variance AS (
    SELECT
      id   AS purchase_detail_id,
      prev_id AS previous_purchase_detail_id,
      product_code,
      product_name,
      supplier_code,
      supplier_name,
      purchase_date,
      prev_price AS previous_price,
      unit_price AS current_price,
      (unit_price - prev_price) AS price_difference,
      CASE WHEN prev_price IS NOT NULL AND prev_price > 0
           THEN ROUND((unit_price - prev_price) / prev_price * 100, 2)
           ELSE NULL
      END AS change_rate,
      CASE
        WHEN prev_price IS NULL              THEN 'FIRST_PURCHASE'
        WHEN unit_price > prev_price          THEN 'PRICE_INCREASE'
        WHEN unit_price < prev_price          THEN 'PRICE_DECREASE'
        ELSE                                       'UNCHANGED'
      END AS change_type,
      bm_code,
      row_num
    FROM with_prev
  ),
  joined AS (
    SELECT
      v.*,
      rev.status                                  AS review_status,
      rev.note                                    AS review_note,
      rev.reviewed_by,
      rev.reviewed_at,
      -- 섹션 15 stale review protection
      --   review snapshot ≠ 현재 variance → effective = PENDING
      CASE
        WHEN rev.status IS NULL THEN 'PENDING'
        WHEN rev.reviewed_previous_purchase_detail_id IS DISTINCT FROM v.previous_purchase_detail_id
          OR rev.reviewed_previous_price           IS DISTINCT FROM v.previous_price
          OR rev.reviewed_current_price            IS DISTINCT FROM v.current_price
          THEN 'PENDING'
        ELSE rev.status
      END AS effective_review_status
    FROM variance v
    LEFT JOIN purchase_price_reviews rev
      ON rev.purchase_detail_id = v.purchase_detail_id
  ),
  filtered AS (
    SELECT *
    FROM joined
    WHERE change_type IN ('PRICE_INCREASE', 'PRICE_DECREASE')
      AND (p_months_list IS NULL
           OR to_char(purchase_date, 'YYYY-MM')
              = ANY (string_to_array(p_months_list, ',')))
      AND (p_change_type IS NULL OR change_type = p_change_type)
      AND (p_review_status IS NULL OR effective_review_status = p_review_status)
      AND (p_supplier_search IS NULL
           OR supplier_name ILIKE '%' || p_supplier_search || '%'
           OR supplier_code ILIKE '%' || p_supplier_search || '%')
      AND (p_product_search IS NULL
           OR COALESCE(product_name, '') ILIKE '%' || p_product_search || '%'
           OR product_code ILIKE '%' || p_product_search || '%')
  ),
  counted AS (
    SELECT *,
      COUNT(*) OVER () AS total_count,
      -- 섹션 13 CRITICAL · 전체 filtered 안 effective PENDING count
      --   page 와 무관 · badge SSOT
      COUNT(*) FILTER (WHERE effective_review_status = 'PENDING') OVER () AS pending_count
    FROM filtered
  )
  SELECT
    purchase_detail_id,
    previous_purchase_detail_id,
    product_code,
    product_name,
    supplier_code,
    supplier_name,
    purchase_date,
    previous_price,
    current_price,
    price_difference,
    change_rate,
    change_type,
    bm_code,
    row_num,
    review_status,
    review_note,
    reviewed_by,
    reviewed_at,
    effective_review_status,
    total_count,
    pending_count
  FROM counted
  ORDER BY
    -- 섹션 26: default 'recent' · ties broken by purchase_date / id
    CASE WHEN p_sort = 'amount'
         THEN -ABS(COALESCE(price_difference, 0))     END ASC,
    CASE WHEN p_sort = 'rate'
         THEN -ABS(COALESCE(change_rate, 0))          END ASC,
    purchase_date      DESC,
    purchase_detail_id DESC
  OFFSET GREATEST(0, (COALESCE(p_page, 1) - 1) * LEAST(COALESCE(p_page_size, 50), 200))
  LIMIT LEAST(COALESCE(p_page_size, 50), 200);
$$;

-- 2026-10-06 · 상세 expand 전용 · 특정 (product_code, supplier_code) 의 최근 N건 history
--   섹션 22: N+1 금지 · batch endpoint 는 아니지만 1 (product,supplier) 당 1 query 로 전체
CREATE OR REPLACE FUNCTION get_purchase_price_history(
  p_product_code  TEXT,
  p_supplier_code TEXT,
  p_limit         INT DEFAULT 10
) RETURNS TABLE (
  purchase_detail_id BIGINT,
  purchase_date      DATE,
  unit_price         NUMERIC,
  quantity           NUMERIC,
  bm_code            TEXT,
  row_num            INT
)
LANGUAGE sql
STABLE
AS $$
  SELECT pd.id, pd.purchase_date, pd.unit_price, pd.quantity, pd.bm_code, pd.row_num
  FROM purchase_details pd
  WHERE pd.product_code = p_product_code
    AND pd.supplier_code = p_supplier_code
    AND pd.quantity > 0
    AND pd.unit_price > 0
  ORDER BY pd.purchase_date DESC,
           pd.bm_code  DESC NULLS LAST,
           pd.row_num  DESC NULLS LAST,
           pd.id       DESC
  LIMIT LEAST(COALESCE(p_limit, 10), 50);
$$;
