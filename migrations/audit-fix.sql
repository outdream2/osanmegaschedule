-- =============================================================
-- migrations/audit-fix.sql
-- 생성일: 2026-07-18  (node scripts/audit-db-schema.mjs 실행 결과)
-- 용도: 코드가 요구하지만 DB에 없는 테이블/컬럼을 한 번에 생성
-- 실행: Supabase SQL Editor 에 전체 붙여넣고 Run
-- 멱등성: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS 사용
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. 누락 테이블 생성
-- ─────────────────────────────────────────────────────────────

-- 1-A. stock_reconciliation_sessions (재고검증 세션)
CREATE TABLE IF NOT EXISTS stock_reconciliation_sessions (
  id                   SERIAL PRIMARY KEY,
  session_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier             TEXT,
  title                TEXT,
  status               TEXT NOT NULL DEFAULT 'draft',
  source_confirmed_ids INTEGER[],
  memo                 TEXT,
  created_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at         TIMESTAMPTZ
);

-- 1-B. stock_reconciliation_items (재고검증 항목)
CREATE TABLE IF NOT EXISTS stock_reconciliation_items (
  id                       SERIAL PRIMARY KEY,
  session_id               INTEGER NOT NULL
                             REFERENCES stock_reconciliation_sessions(id) ON DELETE CASCADE,
  product_code             TEXT NOT NULL,
  product_name             TEXT,
  receiving_qty            NUMERIC,
  invoice_qty              NUMERIC,
  erp_qty                  NUMERIC,
  receiving_note           TEXT,
  invoice_note             TEXT,
  erp_note                 TEXT,
  receiving_confirmed_by   TEXT,
  receiving_confirmed_at   TIMESTAMPTZ,
  invoice_confirmed_by     TEXT,
  invoice_confirmed_at     TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, product_code)
);

-- 1-C. supplier_balances (공급사 잔고)
CREATE TABLE IF NOT EXISTS supplier_balances (
  id            BIGSERIAL PRIMARY KEY,
  supplier_name TEXT NOT NULL,
  balance       NUMERIC,
  invoice_date  DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS supplier_balances_supplier_idx
  ON supplier_balances (supplier_name, created_at DESC);

-- 1-D. order_dispatches (발주 처리 이력)
CREATE TABLE IF NOT EXISTS order_dispatches (
  id           BIGSERIAL PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 실제 컬럼 구조는 server/routes/requests.ts 의 dispatch 객체를 참고해서 추가 필요
-- 현재 코드: supabase.from("order_dispatches").insert([dispatch]) · dispatch 구조 미확정

-- 1-E. zone_mismatches (구역 불일치)
CREATE TABLE IF NOT EXISTS zone_mismatches (
  product_code TEXT PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1-F. reservations (예약)
CREATE TABLE IF NOT EXISTS reservations (
  id         BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 코드에서 count-only 조회만 발견됨 · 실제 컬럼은 추가 확인 필요

-- ─────────────────────────────────────────────────────────────
-- 2. 누락 컬럼 추가
-- ─────────────────────────────────────────────────────────────

-- 2-A. products 테이블
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cost_price    NUMERIC,
  ADD COLUMN IF NOT EXISTS note          TEXT;

-- 2-B. vendors 테이블
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS email         TEXT;

-- 2-C. employees 테이블
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS auth_level    INTEGER DEFAULT 0;

-- 2-D. ocr_supplier_aliases 테이블
--   canonical: 정규화된 공급사명 (alias 의 대표 이름)
ALTER TABLE ocr_supplier_aliases
  ADD COLUMN IF NOT EXISTS canonical     TEXT;

-- 2-E. zone_assignments 테이블
--   dow: day-of-week (요일별 배정구역 키)
--   테이블이 존재하지만 dow 컬럼이 없음 → 기존 구조 확인 후 추가
ALTER TABLE zone_assignments
  ADD COLUMN IF NOT EXISTS dow           INTEGER;
-- 기존 PK/UK 가 다른 컬럼이라면 별도 조정 필요

-- ─────────────────────────────────────────────────────────────
-- 3. 선택적 인덱스 (성능)
-- ─────────────────────────────────────────────────────────────

-- purchase_details 중복 방지 인덱스 (upsert onConflict 에 사용됨)
-- 이미 존재할 수 있으므로 IF NOT EXISTS
CREATE UNIQUE INDEX IF NOT EXISTS purchase_details_dedupe_idx
  ON purchase_details (purchase_date, COALESCE(supplier_code, ''), product_code, quantity, amount);

CREATE INDEX IF NOT EXISTS purchase_details_product_date_idx
  ON purchase_details (product_code, purchase_date DESC);

CREATE INDEX IF NOT EXISTS purchase_details_supplier_date_idx
  ON purchase_details (supplier_name, purchase_date DESC);

-- =============================================================
-- 완료 확인용 쿼리 (선택)
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- ORDER BY table_name;
-- =============================================================
