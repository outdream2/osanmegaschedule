-- Notifications table for per-user alerts
-- Compatible with future push notification integration (push_subscription on employees table)

CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  body        TEXT,
  type        TEXT    NOT NULL DEFAULT 'info',  -- 'info' | 'success' | 'warning' | 'alert'
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_employee_id ON notifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at  ON notifications(created_at DESC);
