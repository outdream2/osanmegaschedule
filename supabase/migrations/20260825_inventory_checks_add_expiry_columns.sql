-- 2026-08-25 · inventory_checks · 유통기한 임박 컬럼 추가
--   사용자 지시 · 유통기한 임박 모달에서 입력한 날짜 저장
--
-- 컬럼:
--   - expiry_input_date  DATE · 입력 날짜 (사용자가 임박 마킹한 날) · 기본: 오늘
--   - expiry_date        DATE · 실제 유통기한 만료일
--
-- 하위 호환:
--   두 컬럼 모두 NULL 허용 · 기존 실재고 저장 flow 무영향
--
-- PostgREST 스키마 캐시 즉시 refresh

ALTER TABLE inventory_checks ADD COLUMN IF NOT EXISTS expiry_input_date DATE;
ALTER TABLE inventory_checks ADD COLUMN IF NOT EXISTS expiry_date       DATE;

NOTIFY pgrst, 'reload schema';
