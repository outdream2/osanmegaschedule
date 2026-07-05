-- 직원 퇴사일 컬럼 추가
-- 근무표에서 입사일 이전과 퇴사일 이후에는 근무 배정 불가 (프론트엔드 회색처리)
-- null 이면 현직으로 간주
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS "retireDate" TEXT NULL;

COMMENT ON COLUMN employees."retireDate" IS '퇴사일 (YYYY-MM-DD). NULL이면 현직.';
