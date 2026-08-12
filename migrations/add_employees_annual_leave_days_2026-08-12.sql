-- 2026-08-12 · employees 테이블 · annual_leave_days 컬럼 추가
--
-- 배경:
--   · GET /api/leave-balance (server/routes/daily/leave.ts:50) 가
--     employees.annual_leave_days 를 조회함
--   · 하지만 마이그레이션 이력에 이 컬럼 추가 SQL 이 없음
--   · 코드가 `emp?.annual_leave_days ?? 15` 로 null-safe · 런타임 에러는 없으나
--     저장값 무시하고 항상 default 15 반환됨
--
-- 실행 방법 · Supabase Dashboard → SQL Editor → 아래 실행
-- 안전 · IF NOT EXISTS · 중복 실행 무해

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS annual_leave_days INTEGER NOT NULL DEFAULT 15;

-- 확인
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'employees' AND column_name = 'annual_leave_days';
