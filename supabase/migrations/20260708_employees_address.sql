-- =============================================================================
-- employees.address 컬럼 추가 — 마이페이지에서 본인 주소 수정 지원
-- 생성일: 2026-07-08
-- 실행 방법: Supabase Dashboard > SQL Editor 에서 실행
-- =============================================================================

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS address TEXT DEFAULT NULL;
