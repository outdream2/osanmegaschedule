-- 2026-08-24 · inventory_checks 실재고 저장 실패 fix
--   에러: Could not find the 'store_stock_2' column of 'inventory_checks' in the schema cache
--
-- 원인:
--   store_stock_2 (매장2 · legacy 컬럼) 이 일부 DB 에 누락.
--   docs/supabase_functions_and_tables.sql 79행 에서 문서화만 됨 · migration 파일 없음.
--   서버 폴백은 신규 컬럼만 stripping 하고 · legacy store_stock_2 미대응.
--
-- 해결:
--   레거시 legacy 컬럼 3종 모두 IF NOT EXISTS 로 안전 추가.
--   이후 재저장 시 정상 동작 · 기존 데이터 무영향.

ALTER TABLE inventory_checks ADD COLUMN IF NOT EXISTS warehouse_stock INT;
ALTER TABLE inventory_checks ADD COLUMN IF NOT EXISTS store_stock     INT;
ALTER TABLE inventory_checks ADD COLUMN IF NOT EXISTS store_stock_2   INT;

-- PostgREST 스키마 캐시 refresh (컬럼 추가 후 즉시 반영)
NOTIFY pgrst, 'reload schema';
