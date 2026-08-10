-- 2026-08-10 · #EMP-BANKBOOK · employees.bankbook_image_url 정식 컬럼 추가
-- 배경:
--   StaffManagePage · EmployeeCalendarModal (직원정보 탭) · 통장사본 첨부 · 이미 UI 구현
--   현재 서버는 silent drop (컬럼 없으면 무시) · 실제 저장 안됨
--   Employee 타입에도 없어 (as any) 로 접근 중 · 정식화 필요
--
-- 실행:
--   Supabase SQL Editor 에서 실행
--   Idempotent · 여러 번 실행 안전

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS bankbook_image_url TEXT;

COMMENT ON COLUMN employees.bankbook_image_url IS
  '통장사본 · base64 dataURL 또는 Supabase Storage URL · 인건비 이체 검증용';
