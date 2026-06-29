-- Supabase SQL Editor에서 실행하세요
CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id integer NOT NULL,
  employee_name text NOT NULL,
  leave_type text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  reviewer_note text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz
);
