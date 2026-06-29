-- Supabase SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS display_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id text NOT NULL DEFAULT '',
  zone_label text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  requested_at timestamptz NOT NULL DEFAULT now(),
  assigned_staff_id integer,
  assigned_staff_name text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS order_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text NOT NULL DEFAULT '',
  product_name text NOT NULL DEFAULT '',
  current_stock integer,
  optimal_stock integer,
  note text NOT NULL DEFAULT '',
  requested_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zone_mismatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text NOT NULL DEFAULT '',
  product_name text NOT NULL DEFAULT '',
  spec_zone text NOT NULL DEFAULT '',
  real_zone text NOT NULL DEFAULT '',
  registered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zone_mismatches_product_code_key UNIQUE (product_code)
);
