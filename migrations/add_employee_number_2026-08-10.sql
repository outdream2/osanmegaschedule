-- 2026-08-10 · 사용자 요청 · 사번 (employee_number) 컬럼 신설
-- 목적:
--   직원정보(employees)와 근로계약서(employee_contracts)를 사람이 읽는 식별자로 연결
--   기존 employees.id (integer PK) 는 유지 · employee_number 는 인사 관리용 코드
--
-- 실행:
--   Supabase SQL Editor 에서 실행 · Idempotent · 여러 번 실행 안전

-- 1) employees 테이블 · 사번 컬럼
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employee_number TEXT;

COMMENT ON COLUMN employees.employee_number IS
  '사번 · 인사 관리용 식별자 · 예: EMP-001, 2026-001 · UNIQUE 권장 (수동 관리)';

-- 사번 유일성 인덱스 (NULL 허용 · 미부여 직원 존재 가능)
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_number
  ON employees(employee_number)
  WHERE employee_number IS NOT NULL;

-- 2) employee_contracts 테이블 · 사번 컬럼 (계약서 발행 시점의 사번 snapshot)
ALTER TABLE employee_contracts
  ADD COLUMN IF NOT EXISTS employee_number TEXT;

COMMENT ON COLUMN employee_contracts.employee_number IS
  '계약 발행 시점의 직원 사번 · employees.employee_number snapshot';

CREATE INDEX IF NOT EXISTS idx_ec_employee_number
  ON employee_contracts(employee_number)
  WHERE employee_number IS NOT NULL;
