-- 2026-09-03 · 상품입고 · 유통기한 저장 · purchase_details.expiry_date
--   · 사용자 지시 · "현재고 단가도 기본으로 들어가야해. 매입후에 현재고 수량에 반영이 안돼"
--   · 상품입고 검수 시 · unit_price + expiry_date + current_stock 자동 반영 fix
--   · idempotent · IF NOT EXISTS · 재실행 안전

ALTER TABLE purchase_details
  ADD COLUMN IF NOT EXISTS expiry_date DATE NULL;

COMMENT ON COLUMN purchase_details.expiry_date IS
  '유통기한 · 상품입고 검수 시 · ArrivalRowCard 유통기한 입력 필드에서 저장';

CREATE INDEX IF NOT EXISTS idx_purchase_details_expiry_date
  ON purchase_details (expiry_date) WHERE expiry_date IS NOT NULL;
