-- 거래처 테이블
CREATE TABLE IF NOT EXISTS vendors (
  id            SERIAL PRIMARY KEY,
  company_name  TEXT NOT NULL,
  contact_name  TEXT,
  phone         TEXT UNIQUE,
  category      TEXT,
  note          TEXT,
  password_hash TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 예약 테이블에 거래처 연결 컬럼 추가
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL;
