-- 2026-09-08 · inventory_checks · 유통기한 임박 저장 컬럼 추가
--   · ExpiryDateModal 저장 시 · POST /api/inventory-checks 에서 사용
--   · expiry_input_date · 유통기한 입력한 날짜 (오늘 or 임의)
--   · expiry_date · 실제 유통기한 (만료일)
ALTER TABLE inventory_checks ADD COLUMN IF NOT EXISTS expiry_input_date DATE;
ALTER TABLE inventory_checks ADD COLUMN IF NOT EXISTS expiry_date DATE;
