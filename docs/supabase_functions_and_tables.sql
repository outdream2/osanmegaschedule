-- ═══════════════════════════════════════════════════════════════════════
-- Supabase SQL · 함수·테이블·인덱스 통합 참고 (2026-07-29)
-- 배포 절차: Supabase 대시보드 → SQL Editor → 아래 순서대로 실행
-- ═══════════════════════════════════════════════════════════════════════


-- ┌───────────────────────────────────────────────────────────────────────┐
-- │ 1. 상품입고 저장 (product_arrivals · product_arrival_items)          │
-- │    2026-07-29 · 사용자 요청 "상품입고 전체확인후 DB 저장"            │
-- └───────────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS product_arrivals (
  id BIGSERIAL PRIMARY KEY,
  arrival_date TIMESTAMPTZ DEFAULT NOW(),
  checked_by TEXT,
  checked_by_id INT,
  total_items INT DEFAULT 0,
  total_qty INT DEFAULT 0,
  match_count INT DEFAULT 0,
  mismatch_count INT DEFAULT 0,
  expiring_count INT DEFAULT 0,
  final_decision TEXT,  -- 'all_match' | 'has_mismatch'
  supplier_summary TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_arrival_items (
  id BIGSERIAL PRIMARY KEY,
  arrival_id BIGINT REFERENCES product_arrivals(id) ON DELETE CASCADE,
  product_code TEXT,
  product_name TEXT,
  supplier TEXT,
  qty INT DEFAULT 0,
  status TEXT DEFAULT 'pending', -- pending | match | mismatch | expiring
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_arrivals_date ON product_arrivals(arrival_date DESC);
CREATE INDEX IF NOT EXISTS idx_product_arrival_items_arrival ON product_arrival_items(arrival_id);
CREATE INDEX IF NOT EXISTS idx_product_arrival_items_code ON product_arrival_items(product_code);
CREATE INDEX IF NOT EXISTS idx_product_arrivals_supplier ON product_arrivals(supplier_summary);


-- ┌───────────────────────────────────────────────────────────────────────┐
-- │ 1-b. 반품요청 (return_requests)                                        │
-- │    2026-07-30 · 사용자 요청 "반품필요 리스트 → 반품요청 · 공급사별"   │
-- └───────────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS return_requests (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  product_code TEXT NOT NULL,
  product_name TEXT,
  supplier TEXT,
  qty INT DEFAULT 0,
  current_stock INT DEFAULT 0,
  purchase_price NUMERIC DEFAULT 0,
  reason TEXT,
  requested_by TEXT,
  requested_by_id INT,
  status TEXT DEFAULT 'pending'  -- pending | sent | done | cancelled
);

CREATE INDEX IF NOT EXISTS idx_return_requests_created ON return_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_return_requests_supplier ON return_requests(supplier);
CREATE INDEX IF NOT EXISTS idx_return_requests_status ON return_requests(status);
CREATE INDEX IF NOT EXISTS idx_return_requests_code ON return_requests(product_code);


-- ┌───────────────────────────────────────────────────────────────────────┐
-- │ 1-c. 실재고 · 매장1/매장2 (store_stock_2) 컬럼 추가                    │
-- │    2026-07-30 · 사용자 요청 "real_map 이 '/' 로 나뉜 경우              │
-- │                              매장1 · 매장2 별도 입력"                   │
-- └───────────────────────────────────────────────────────────────────────┘

-- inventory_checks · 기존 warehouse_stock · store_stock 에
--   store_stock_2 (매장2) 컬럼 추가 · nullable · 하위 호환
ALTER TABLE inventory_checks ADD COLUMN IF NOT EXISTS store_stock_2 INT;


-- ┌───────────────────────────────────────────────────────────────────────┐
-- │ 1-d. 공급사 분류 (vendors.category)                                    │
-- │    2026-07-30 · 사용자 요청 "위탁/선결제/회전/기타 분류 · 배지·필터"  │
-- └───────────────────────────────────────────────────────────────────────┘

-- vendors 테이블 · category 컬럼 추가 · nullable · 4가지 값
--   위탁 · 선결제 · 회전 · 기타
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS category TEXT;
CREATE INDEX IF NOT EXISTS idx_vendors_category ON vendors(category);


-- ┌───────────────────────────────────────────────────────────────────────┐
-- │ 1-e. get_stock_flow · sale_qty_month · last_purchase_qty 확장          │
-- │    2026-07-30 · 반품필요 리스트 로딩 속도 개선                        │
-- │    기존 · 서버에서 batch fetch (수십 라운드) · 5000상품 시 수초 소요  │
-- │    개선 · RPC 단일 쿼리로 처리 · <500ms                               │
-- │                                                                       │
-- │    ⚠ return type 변경이므로 · DROP FUNCTION 먼저 필요                 │
-- └───────────────────────────────────────────────────────────────────────┘

DROP FUNCTION IF EXISTS get_stock_flow(date, date);

CREATE OR REPLACE FUNCTION get_stock_flow(p_from date, p_to date)
RETURNS TABLE (
  product_code TEXT,
  product_name TEXT,
  supplier TEXT,
  spec TEXT,
  opening_stock INT,
  purchase_qty INT,
  sale_qty INT,
  disposal_qty INT,
  closing_stock INT,
  total_amount NUMERIC,
  optimal_stock INT,
  sale_price NUMERIC,
  purchase_price NUMERIC,
  current_stock INT,
  min_order INT,
  last_purchase_date TEXT,
  first_purchase_date TEXT,
  purchase_count INT,
  purchase_total_qty INT,
  purchase_total_amount NUMERIC,
  sale_qty_month INT,          -- 신규 · 최근 30일 판매량 합산
  sale_amount_month NUMERIC,   -- 신규 · 최근 30일 판매액 합산
  last_purchase_qty INT        -- 신규 · 최근 매입일의 매입 수량
)
LANGUAGE plpgsql AS $$
DECLARE
  v_month_ago date := (CURRENT_DATE - INTERVAL '30 days')::date;
BEGIN
  RETURN QUERY
  WITH sh_agg AS (
    -- stock_history · 기간 범위 aggregate
    SELECT
      sh.product_code,
      SUM(sh.opening_stock)::INT   AS opening_stock,
      SUM(sh.purchase_qty)::INT    AS purchase_qty,
      SUM(sh.sale_qty)::INT        AS sale_qty,
      SUM(sh.disposal_qty)::INT    AS disposal_qty,
      SUM(sh.closing_stock)::INT   AS closing_stock,
      SUM(sh.total_amount)::NUMERIC AS total_amount,
      MAX(sh.product_name)         AS product_name,
      MAX(sh.supplier_name)        AS supplier,
      MAX(sh.spec)                 AS spec
    FROM stock_history sh
    WHERE sh.snapshot_date >= p_from AND sh.snapshot_date <= p_to
    GROUP BY sh.product_code
  ),
  sh_month AS (
    -- 최근 30일 판매량 + 판매액
    SELECT
      sh.product_code,
      SUM(sh.sale_qty)::INT        AS sale_qty_month,
      SUM(sh.total_amount)::NUMERIC AS sale_amount_month
    FROM stock_history sh
    WHERE sh.snapshot_date >= v_month_ago AND sh.snapshot_date <= CURRENT_DATE
    GROUP BY sh.product_code
  ),
  pd_agg AS (
    -- purchase_details · 매입 이력 집계 + 최근 매입량
    SELECT
      pd.product_code,
      COUNT(DISTINCT pd.purchase_date)::INT AS purchase_count,
      MIN(pd.purchase_date)::TEXT           AS first_purchase_date,
      MAX(pd.purchase_date)::TEXT           AS last_purchase_date,
      SUM(pd.quantity)::INT                 AS purchase_total_qty,
      SUM(COALESCE(pd.total, pd.amount, 0))::NUMERIC AS purchase_total_amount
    FROM purchase_details pd
    GROUP BY pd.product_code
  ),
  pd_last AS (
    -- 각 상품 · 최근 매입일의 quantity (DISTINCT ON)
    SELECT DISTINCT ON (pd.product_code)
      pd.product_code,
      pd.quantity::INT AS last_purchase_qty
    FROM purchase_details pd
    ORDER BY pd.product_code, pd.purchase_date DESC
  )
  SELECT
    p.product_code::TEXT,
    COALESCE(sh_agg.product_name, p.product_name)::TEXT,
    COALESCE(sh_agg.supplier, p.supplier)::TEXT,
    COALESCE(sh_agg.spec, p.spec)::TEXT,
    COALESCE(sh_agg.opening_stock, 0),
    COALESCE(sh_agg.purchase_qty, 0),
    COALESCE(sh_agg.sale_qty, 0),
    COALESCE(sh_agg.disposal_qty, 0),
    COALESCE(sh_agg.closing_stock, 0),
    COALESCE(sh_agg.total_amount, 0),
    COALESCE(NULLIF(p.optimal_stock::text, '')::int, 0),
    COALESCE(p.sale_price, 0),
    COALESCE(p.purchase_price, 0),
    COALESCE(p.current_stock, 0),
    COALESCE(NULLIF(p.min_order::text, '')::int, 0),
    pd_agg.last_purchase_date,
    pd_agg.first_purchase_date,
    COALESCE(pd_agg.purchase_count, 0),
    COALESCE(pd_agg.purchase_total_qty, 0),
    COALESCE(pd_agg.purchase_total_amount, 0),
    COALESCE(sh_month.sale_qty_month, 0),
    COALESCE(sh_month.sale_amount_month, 0),
    pd_last.last_purchase_qty
  FROM products p
  LEFT JOIN sh_agg   ON sh_agg.product_code = p.product_code
  LEFT JOIN sh_month ON sh_month.product_code = p.product_code
  LEFT JOIN pd_agg   ON pd_agg.product_code = p.product_code
  LEFT JOIN pd_last  ON pd_last.product_code = p.product_code
  WHERE p.hidden IS NOT TRUE
    AND (
      sh_agg.product_code IS NOT NULL     -- 기간 내 판매 이력 있거나
      OR pd_agg.product_code IS NOT NULL   -- 매입 이력 있는 상품만
      OR COALESCE(p.current_stock, 0) > 0  -- 현재고 있는 상품
    );
END;
$$;


-- ┌───────────────────────────────────────────────────────────────────────┐
-- │ 2. 재고관리 상품현황 · 단일 SQL 조인 함수 (get_stock_flow)            │
-- │    2026-07-29 · Phase 3 (A) 로딩속도 개선 · 60~100 API → 1 RPC       │
-- │                                                                       │
-- │    호출: supabase.rpc('get_stock_flow', {                             │
-- │             p_from: '2026-06-29', p_to: '2026-07-29' })               │
-- │    성능: 기존 10~30초 → <500ms (수십배 향상)                         │
-- └───────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION get_stock_flow(p_from date, p_to date)
RETURNS TABLE (
  product_code text, product_name text, supplier text, spec text,
  opening_stock int, purchase_qty int, sale_qty int, disposal_qty int,
  closing_stock int, total_amount bigint,
  optimal_stock int, sale_price int, purchase_price int,
  current_stock int, min_order int,
  last_purchase_date date, first_purchase_date date,
  purchase_count int, purchase_total_qty int, purchase_total_amount bigint
)
LANGUAGE sql STABLE
AS $$
  WITH
  sh_filtered AS (
    SELECT *
    FROM stock_history
    WHERE snapshot_date >= p_from AND snapshot_date <= p_to
  ),
  sh_sum AS (
    SELECT
      product_code,
      MAX(product_name)   AS product_name,
      MAX(supplier_name)  AS supplier,
      MAX(spec)           AS spec,
      COALESCE(SUM(NULLIF(purchase_qty::text, '')::numeric), 0)::int  AS purchase_qty,
      COALESCE(SUM(NULLIF(sale_qty::text, '')::numeric), 0)::int      AS sale_qty,
      COALESCE(SUM(NULLIF(disposal_qty::text, '')::numeric), 0)::int  AS disposal_qty,
      COALESCE(SUM(NULLIF(total_amount::text, '')::numeric), 0)::bigint AS total_amount
    FROM sh_filtered
    GROUP BY product_code
  ),
  sh_first AS (
    SELECT DISTINCT ON (product_code)
      product_code,
      COALESCE(NULLIF(opening_stock::text, '')::numeric, 0)::int AS opening_stock
    FROM sh_filtered
    ORDER BY product_code, snapshot_date ASC
  ),
  sh_last AS (
    SELECT DISTINCT ON (product_code)
      product_code,
      COALESCE(NULLIF(closing_stock::text, '')::numeric, 0)::int AS closing_stock
    FROM sh_filtered
    ORDER BY product_code, snapshot_date DESC
  ),
  pd AS (
    SELECT
      product_code,
      MAX(purchase_date) AS last_purchase_date,
      MIN(purchase_date) AS first_purchase_date,
      COUNT(DISTINCT purchase_date)::int AS purchase_count,
      COALESCE(SUM(NULLIF(quantity::text, '')::numeric), 0)::int AS purchase_total_qty,
      COALESCE(SUM(NULLIF(COALESCE(total, amount)::text, '')::numeric), 0)::bigint AS purchase_total_amount
    FROM purchase_details
    GROUP BY product_code
  )
  SELECT
    sh_sum.product_code,
    sh_sum.product_name,
    sh_sum.supplier,
    sh_sum.spec,
    COALESCE(sh_first.opening_stock, 0),
    sh_sum.purchase_qty,
    sh_sum.sale_qty,
    sh_sum.disposal_qty,
    COALESCE(sh_last.closing_stock, 0),
    sh_sum.total_amount,
    COALESCE(NULLIF(p.optimal_stock::text, '')::numeric, 0)::int,
    COALESCE(NULLIF(p.sale_price::text, '')::numeric, 0)::int,
    COALESCE(NULLIF(p.purchase_price::text, '')::numeric, 0)::int,
    COALESCE(NULLIF(p.current_stock::text, '')::numeric, 0)::int,
    COALESCE(NULLIF(p.min_order::text, '')::numeric, 0)::int,
    pd.last_purchase_date,
    pd.first_purchase_date,
    pd.purchase_count,
    pd.purchase_total_qty,
    pd.purchase_total_amount
  FROM sh_sum
  LEFT JOIN sh_first ON sh_first.product_code = sh_sum.product_code
  LEFT JOIN sh_last  ON sh_last.product_code  = sh_sum.product_code
  LEFT JOIN products p ON p.product_code = sh_sum.product_code
  LEFT JOIN pd ON pd.product_code = sh_sum.product_code
  WHERE p.hidden IS NOT TRUE;
$$;

-- 함수 확인
-- SELECT * FROM get_stock_flow('2026-06-29'::date, '2026-07-29'::date) LIMIT 5;


-- ┌───────────────────────────────────────────────────────────────────────┐
-- │ 3. 인덱스 (성능 개선 · 없으면 추가)                                   │
-- └───────────────────────────────────────────────────────────────────────┘

CREATE INDEX IF NOT EXISTS idx_stock_history_snapshot_date ON stock_history(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_stock_history_product_code ON stock_history(product_code);
CREATE INDEX IF NOT EXISTS idx_stock_history_snapshot_product ON stock_history(snapshot_date, product_code);
CREATE INDEX IF NOT EXISTS idx_purchase_details_product_code ON purchase_details(product_code);
CREATE INDEX IF NOT EXISTS idx_purchase_details_purchase_date ON purchase_details(purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_products_product_code ON products(product_code);
CREATE INDEX IF NOT EXISTS idx_products_hidden ON products(hidden) WHERE hidden IS TRUE;


-- ┌───────────────────────────────────────────────────────────────────────┐
-- │ 참고: 기존 활용 중인 테이블 (스키마는 별도 관리 · 여기는 목록만)      │
-- └───────────────────────────────────────────────────────────────────────┘
-- products             · 상품 마스터 (ERP 기준 · xlsx 임포트)
-- stock_history        · 재고 스냅샷 이력 (일별 · 초순·중순·하순)
-- purchase_details     · 매입 세부 (거래명세서 · OCR 확정)
-- ocr_confirmed_items  · OCR 확정 아이템 (매입 세부 상위)
-- vendors              · 공급사 마스터
-- inventory_checks     · 실재고 스캔 이력 (창고·매장)
-- supplier_balances    · 공급사 잔고 (OCR 확정 시 저장)
-- order_requests       · 발주 요청
-- display_requests     · 진열 요청
-- product_arrivals     · 상품입고 헤더 (2026-07-29 · 이 파일)
-- product_arrival_items · 상품입고 아이템 (2026-07-29 · 이 파일)
-- board_posts          · 이슈공유 게시판
-- board_post_images    · 게시판 이미지
-- board_post_comments  · 게시판 댓글
-- leave_requests       · 연차 요청
-- lunch_requests       · 점심 불참
-- zone_assignments     · 매장 구역 배정
-- ocr_synonyms         · OCR 상품명 동의어
-- ocr_supplier_aliases · OCR 공급사 별칭
-- ocr_templates        · OCR 템플릿


-- ═══════════════════════════════════════════════════════════════════════
-- 배포 순서 (신규 프로젝트/DB 초기화 시)
-- ═══════════════════════════════════════════════════════════════════════
-- 1. Section 1 실행 · product_arrivals 테이블 (신규 기능)
-- 2. Section 2 실행 · get_stock_flow 함수 (성능 · 필수)
-- 3. Section 3 실행 · 인덱스 (성능 · 권장)
-- 4. Section 참고 · 나머지 테이블은 기존 프로젝트 스키마 참고
-- ═══════════════════════════════════════════════════════════════════════
