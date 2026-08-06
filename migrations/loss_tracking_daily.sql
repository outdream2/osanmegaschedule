-- migrations/loss_tracking_daily.sql
-- 2026-08-06 · T-LOSS-HISTORY · 손실추적 (DiffTab) 날짜별 이력 저장
--
-- 목적:
--   - 매일 실재고 집계 시점의 손실 스냅샷 (ERP - 실재고)
--   - 기간별 손실액 집계 · 공급사별 Top10 · 일자별 추이 차트
--   - 자동 저장 (POST /api/inventory-checks 성공 시 fire-and-forget)
--
-- 정의:
--   loss = erp_stock - actual_stock  (양수: 손실 · 음수: 초과)
--   loss_value = loss × purchase_price (원가 기준 손실액)
--
-- UNIQUE (snapshot_date, product_code): 같은 날짜 재저장은 upsert (덮어쓰기)

CREATE TABLE IF NOT EXISTS loss_tracking_daily (
  id             BIGSERIAL PRIMARY KEY,
  snapshot_date  DATE      NOT NULL,
  product_code   TEXT      NOT NULL,
  product_name   TEXT,
  supplier       TEXT,
  erp_stock      INT,
  actual_stock   INT,
  loss           INT,                       -- erp - actual (양수: 손실)
  purchase_price NUMERIC,
  sale_price     NUMERIC,
  loss_value     NUMERIC,                   -- loss × purchase_price
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (snapshot_date, product_code)
);

CREATE INDEX IF NOT EXISTS loss_tracking_daily_date_idx
  ON loss_tracking_daily (snapshot_date DESC);

CREATE INDEX IF NOT EXISTS loss_tracking_daily_supplier_idx
  ON loss_tracking_daily (supplier);

CREATE INDEX IF NOT EXISTS loss_tracking_daily_date_supplier_idx
  ON loss_tracking_daily (snapshot_date DESC, supplier);
