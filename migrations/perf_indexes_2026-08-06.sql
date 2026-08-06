-- 2026-08-06 · T-DB-Audit (db-connector) · A등급 즉시 개선
-- 잘 조회되는 컬럼 · 인덱스 미추가 4건 · Supabase SQL Editor 에서 실행
-- 소요 시간 예상 · 각 10~30초 (테이블 크기 따라)
-- 안전 · IF NOT EXISTS · 반복 실행 무해

-- ─────────────────────────────────────────────────────────────────
-- 1. supplier_payments · 공급사별 결제 이력 조회 (PaymentInfoTab · 결제탭)
--    · GET /api/supplier-payments?supplier=X · WHERE supplier_name = ? ORDER BY payment_date DESC
--    · GET /api/supplier-payments/latest-per-supplier · ORDER BY payment_date DESC
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_date
  ON supplier_payments(supplier_name, payment_date DESC);

-- ─────────────────────────────────────────────────────────────────
-- 2. supplier_payment_allocations · payment_id 기반 IN 조회·JOIN
--    · SELECT * FROM supplier_payment_allocations WHERE payment_id IN (...)
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_supplier_alloc_payment_id
  ON supplier_payment_allocations(payment_id);

-- ─────────────────────────────────────────────────────────────────
-- 3. purchase_details · supplier_code 대체 조회 (supplier_name NULL 6307행 대응)
--    · Partial index · NULL 제외 · 사이즈 최소화
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_purchase_supplier_code
  ON purchase_details(supplier_code)
  WHERE supplier_code IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- 4. loss_tracking_daily · 상품별 최근 스냅샷 조회 (T-LOSS-HISTORY)
--    · GET /api/loss-tracking?product_code=X ORDER BY snapshot_date DESC
--    · UNIQUE (snapshot_date, product_code) 이미 있으나 · product 기준 조회 최적화용
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_loss_tracking_product
  ON loss_tracking_daily(product_code, snapshot_date DESC);

-- ─────────────────────────────────────────────────────────────────
-- 확인 (선택 · 인덱스 생성 확인)
-- ─────────────────────────────────────────────────────────────────
-- SELECT indexname, tablename, indexdef
--   FROM pg_indexes
--  WHERE indexname IN (
--    'idx_supplier_payments_supplier_date',
--    'idx_supplier_alloc_payment_id',
--    'idx_purchase_supplier_code',
--    'idx_loss_tracking_product'
--  )
--  ORDER BY tablename, indexname;
