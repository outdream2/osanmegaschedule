ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS working_hours TEXT;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS annual_leave_days INTEGER;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS probation_end_date DATE;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS base_wage_type TEXT;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS base_wage_amount INTEGER;
