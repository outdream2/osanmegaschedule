-- 2026-08-29 · product_arrival_items 테이블에 expiring 컬럼 추가
--   · 상품입고 · 유통기한 임박 boolean 필드 (status 와 독립)
--   · 서버 코드 (server/routes/stock/productArrivals.ts) 에서 이미 사용중
--   · Supabase 대시보드 SQL Editor 에서 실행

ALTER TABLE product_arrival_items
  ADD COLUMN IF NOT EXISTS expiring BOOLEAN DEFAULT FALSE;

-- 실행 후 · Supabase 스키마 캐시 자동 갱신 (필요 시 · 대시보드에서 · Reload schema)
