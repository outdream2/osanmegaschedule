-- migrations/add_employees_full_profile_2026-08-13.sql
-- 2026-08-13 · #직원정보 저장 오류 fix · birth_date 등 employees 확장 컬럼 일괄 추가
--   · 사용자 오류: "Could not find the 'birth_date' column of 'employees' in the schema cache"
--   · StaffManagePage · EmployeeInfoForm · ContractWriterPage 에서 참조되는 필드 전부
--   · IF NOT EXISTS · 중복 실행 안전
--
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣고 Run
-- 실행 후 재시작 불필요 (스키마 캐시 · 다음 요청 시 자동 갱신)

ALTER TABLE employees
  -- 기본 인적사항
  ADD COLUMN IF NOT EXISTS birth_date              date,
  ADD COLUMN IF NOT EXISTS gender                  text,
  ADD COLUMN IF NOT EXISTS address                 text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name  text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS emergency_contact_rel   text,
  -- 근무 정보
  ADD COLUMN IF NOT EXISTS schedule_type           text,
  ADD COLUMN IF NOT EXISTS work_area               text,
  ADD COLUMN IF NOT EXISTS work_location           text,
  ADD COLUMN IF NOT EXISTS job_duties              text,
  ADD COLUMN IF NOT EXISTS working_hours_per_week  numeric(4,1),
  ADD COLUMN IF NOT EXISTS break_time_minutes      integer DEFAULT 60,
  ADD COLUMN IF NOT EXISTS break_apply_paid        boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekly_holiday          text    DEFAULT '일요일',
  -- 계약 정보
  ADD COLUMN IF NOT EXISTS contract_type           text,
  ADD COLUMN IF NOT EXISTS contract_start          date,
  ADD COLUMN IF NOT EXISTS contract_end            date,
  ADD COLUMN IF NOT EXISTS probation_end_date      date,
  -- 임금 · 정산
  ADD COLUMN IF NOT EXISTS wage_calc_type          text,
  ADD COLUMN IF NOT EXISTS wage_amount             integer,
  ADD COLUMN IF NOT EXISTS wage_pay_day            text,
  ADD COLUMN IF NOT EXISTS wage_pay_method         text    DEFAULT '계좌이체',
  ADD COLUMN IF NOT EXISTS bank_name               text,
  ADD COLUMN IF NOT EXISTS bank_account_no         text,
  -- 4대보험
  ADD COLUMN IF NOT EXISTS insurance_nps_date      date,
  ADD COLUMN IF NOT EXISTS insurance_nhis_date     date,
  ADD COLUMN IF NOT EXISTS insurance_ei_date       date,
  ADD COLUMN IF NOT EXISTS insurance_wcia_date     date,
  ADD COLUMN IF NOT EXISTS insurance_excluded      boolean DEFAULT false,
  -- 자격 · 경력
  ADD COLUMN IF NOT EXISTS pharmacist_license_no   text,
  ADD COLUMN IF NOT EXISTS health_check_expiry     date,
  ADD COLUMN IF NOT EXISTS careers                 jsonb   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS educations              jsonb   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS certifications          jsonb   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS performance_rating      text;

-- (참고) annual_leave_days · 별도 마이그레이션 파일에 존재 (add_employees_annual_leave_days_2026-08-12.sql)
