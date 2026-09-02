-- ═══════════════════════════════════════════════════════════════════
-- 2026-09-03 · ALL-IN-ONE · 오늘 신규 migration 9개 통합 (사용자 편의)
-- Supabase Dashboard > SQL Editor · 전체 선택 후 Run · 한 번에 완료
--
-- 포함 migration:
--   1. vendors.team_leader_name/phone/emergency_contact 컬럼 (팀장 정보)
--   2. vendors.password_hash 컬럼 · bcrypt · 기본 '1234'
--   3. vendors.email 컬럼 (발주용)
--   4. vendors.approval_status 리셋 옵션 (dry-run · 필요 시 UNCOMMENT)
--   5. credit_cards 테이블 · 카드 결제 관리 · supplier_payments.card_id FK
--   6. zone_defs.warehouse 컬럼 · 창고1/창고2 · 상품입고·실재고 자동 필터
--   7. bulk_send_order_requests RPC · UUID 지원 · 파라미터명 명확화
--   8. get_inventory_latest RPC · 현재 스키마 반영 (warehouse_stock DROP 대응)
--   9. get_stock_flow RPC · COALESCE 타입 캐스팅 통일
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- 0. pgcrypto (bcrypt · gen_salt · crypt)
-- ═══════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ═══════════════════════════════════════════════════════════════════
-- 1. vendors · 팀장 필드 3개 · idempotent
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS team_leader_name  TEXT NULL;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS team_leader_phone TEXT NULL;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS emergency_contact TEXT NULL;

COMMENT ON COLUMN vendors.team_leader_name  IS '팀장 이름 (담당자 상급자)';
COMMENT ON COLUMN vendors.team_leader_phone IS '팀장 전화번호 (담당자 연락 안 될 때)';
COMMENT ON COLUMN vendors.emergency_contact IS '비상 연락처 (예비)';


-- ═══════════════════════════════════════════════════════════════════
-- 2. vendors · password_hash 컬럼 + 기본값 '1234' backfill
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS password_hash TEXT NULL;
COMMENT ON COLUMN vendors.password_hash IS '거래처 로그인 비밀번호 (bcrypt · 기본 "1234")';

UPDATE vendors
   SET password_hash = crypt('1234', gen_salt('bf', 12))
 WHERE password_hash IS NULL;


-- ═══════════════════════════════════════════════════════════════════
-- 3. vendors · email 컬럼 (발주용)
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS email TEXT NULL;
COMMENT ON COLUMN vendors.email IS '거래처 발주용 이메일 (승인 필수 5필드 중 하나)';


-- ═══════════════════════════════════════════════════════════════════
-- 4. vendors · approval_status 리셋 (dry-run · 필요 시 아래 UPDATE UNCOMMENT)
-- ═══════════════════════════════════════════════════════════════════
-- 아래 UPDATE 는 자동 승인된 vendors 를 초기화 (승인 요청 이력 없는 것만)
-- 필요 시에만 UNCOMMENT
-- UPDATE vendors
--    SET approval_status = NULL, approved_at = NULL, approved_by = NULL
--  WHERE approval_status = 'approved' AND approval_requested_at IS NULL;


-- ═══════════════════════════════════════════════════════════════════
-- 5. credit_cards 테이블 + supplier_payments.card_id FK
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS credit_cards (
  id           SERIAL PRIMARY KEY,
  issuer       TEXT NOT NULL,
  alias        TEXT NULL,
  last4        VARCHAR(4) NULL,
  billing_day  INT NOT NULL DEFAULT 15 CHECK (billing_day BETWEEN 1 AND 31),
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  note         TEXT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_cards_active
  ON credit_cards (active) WHERE active = TRUE;

COMMENT ON TABLE  credit_cards IS '카드 결제 관리 · 등록된 카드 마스터';
COMMENT ON COLUMN credit_cards.issuer      IS '카드사 (BC · 국민 · 삼성 · 현대 · 신한 · 롯데 · 하나 · 우리 · 농협 · 씨티 · 기타)';
COMMENT ON COLUMN credit_cards.alias       IS '별칭 · 사용자 지정 (예: 법인 삼성 SDI)';
COMMENT ON COLUMN credit_cards.last4       IS '카드 번호 뒷 4자리';
COMMENT ON COLUMN credit_cards.billing_day IS '결제일 (1-31) · 차월 결제 예정액 계산 기준';

ALTER TABLE supplier_payments
  ADD COLUMN IF NOT EXISTS card_id INT NULL
    REFERENCES credit_cards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_payments_card_id
  ON supplier_payments (card_id) WHERE card_id IS NOT NULL;

COMMENT ON COLUMN supplier_payments.card_id IS
  '결제 카드 FK · credit_cards.id · 결제방법=card 시 · nullable';


-- ═══════════════════════════════════════════════════════════════════
-- 6. zone_defs.warehouse 컬럼 (창고1 6개 · 나머지 창고2)
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE zone_defs
  ADD COLUMN IF NOT EXISTS warehouse TEXT NULL
    CHECK (warehouse IS NULL OR warehouse IN ('창고1', '창고2'));

COMMENT ON COLUMN zone_defs.warehouse IS
  '이 구역이 소속된 창고 · 창고1/창고2 (사용자 규칙 · 창고1=24·25·26·27·7B·8A · 나머지 모두 창고2)';

-- 창고1 backfill (6개)
UPDATE zone_defs SET warehouse = '창고1'
 WHERE UPPER(TRIM(location)) IN ('24', '25', '26', '27', '7B', '8A');

-- 창고2 backfill (나머지)
UPDATE zone_defs SET warehouse = '창고2'
 WHERE (warehouse IS NULL OR warehouse != '창고1')
   AND location IS NOT NULL AND TRIM(location) != '';

CREATE INDEX IF NOT EXISTS idx_zone_defs_warehouse
  ON zone_defs (warehouse) WHERE warehouse IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════
-- 7. bulk_send_order_requests RPC · UUID 지원 · 파라미터명 명확화
-- ═══════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS bulk_send_order_requests(BIGINT[]);
DROP FUNCTION IF EXISTS bulk_send_order_requests(UUID[]);

CREATE OR REPLACE FUNCTION bulk_send_order_requests(p_request_ids UUID[])
RETURNS TABLE (updated_id UUID, updated_status TEXT) AS $$
BEGIN
  RETURN QUERY
    UPDATE order_requests o
       SET status  = 'ordered',
           sent_at = NOW()
     WHERE o.id = ANY(p_request_ids)
       AND o.status = 'requested'
    RETURNING o.id, o.status;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════════
-- 8. get_inventory_latest RPC · 현재 스키마 반영
--    (warehouse_stock DROP · store_stock_2 DROP)
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
-- 9. get_stock_flow RPC · COALESCE 타입 캐스팅 통일
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
-- 검증 (실행 후)
-- ═══════════════════════════════════════════════════════════════════
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'vendors' AND column_name IN ('email','password_hash','team_leader_name','team_leader_phone','emergency_contact');
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'zone_defs' AND column_name = 'warehouse';
-- SELECT warehouse, COUNT(*) FROM zone_defs GROUP BY warehouse;
-- SELECT * FROM credit_cards LIMIT 5;
-- SELECT proname, pg_get_function_identity_arguments(oid)
--   FROM pg_proc WHERE proname IN ('bulk_send_order_requests','get_inventory_latest','get_stock_flow');
-- ═══════════════════════════════════════════════════════════════════
