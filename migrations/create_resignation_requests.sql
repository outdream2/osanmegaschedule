-- Supabase SQL Editor에서 실행하세요
-- 사직서 제출/승인 워크플로우 · 2026-08-03 · #179+#180+#181
CREATE TABLE IF NOT EXISTS resignation_requests (
  id            bigserial PRIMARY KEY,
  employee_id   integer NOT NULL,
  employee_name text NOT NULL,
  position      text,
  hire_date     date,
  last_work_date date NOT NULL,
  reason        text NOT NULL,
  reason_detail text,
  handover_notes text,
  signature_data_url text,
  pdf_url       text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','withdrawn')),
  approved_by   text,
  approved_by_id integer,
  approved_at   timestamptz,
  reject_reason text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resignations_status   ON resignation_requests(status);
CREATE INDEX IF NOT EXISTS idx_resignations_employee ON resignation_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_resignations_created  ON resignation_requests(created_at DESC);
