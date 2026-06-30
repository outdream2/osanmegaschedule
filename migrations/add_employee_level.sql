-- Supabase SQL Editor에서 실행하세요
-- 직원 레벨 컬럼 추가 (0-9: 1=직원, 7=관리자, 8=대표, 9=최고관리자)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1;
