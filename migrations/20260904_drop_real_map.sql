-- 2026-09-04 · real_map 컬럼 제거 (사용자 지시 · 전체 프로젝트에서 완전 제거)
-- ⚠️  Supabase SQL Editor에서 직접 실행할 것
-- 사전 확인: SELECT COUNT(*) FROM products WHERE real_map IS NOT NULL;
ALTER TABLE products DROP COLUMN IF EXISTS real_map;
