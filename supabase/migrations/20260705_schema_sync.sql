-- =============================================================================
-- 메가타운 약국 통합 관리 시스템 — 스키마 동기화 마이그레이션
-- 생성일: 2026-07-05
-- 실행 방법: Supabase Dashboard > SQL Editor 에서 전체 붙여넣기 후 실행
-- 주의: 기존 데이터를 삭제하지 않음 (ADD COLUMN / CREATE TABLE IF NOT EXISTS 만 사용)
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. employees 테이블 — 누락 컬럼 추가
-- ─────────────────────────────────────────────────────────────────────────────
-- push_subscription: Web Push API 구독 정보 (notifications.ts, leave.ts, stockArrivals.ts)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS push_subscription JSONB DEFAULT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. zone_dow_templates 테이블 — 신규 생성
--    (요일별 근무 배치 JSONB 템플릿. zoneAssignments.ts 전용)
--    zone_assignments 테이블은 settings.ts 의 zone_id 기반 구역 배치 테이블로 유지.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zone_dow_templates (
  dow            INTEGER PRIMARY KEY CHECK (dow BETWEEN 0 AND 6),
  zone_slots     JSONB   NOT NULL DEFAULT '{}',
  lunch_slots    JSONB   NOT NULL DEFAULT '{}',
  rest_slots     JSONB   NOT NULL DEFAULT '{}',
  lunch_offset   INTEGER NOT NULL DEFAULT 0,
  rest_offset    INTEGER NOT NULL DEFAULT 0,
  lunch_interval INTEGER NOT NULL DEFAULT 30,
  rest_interval  INTEGER NOT NULL DEFAULT 30,
  lunch_count    INTEGER NOT NULL DEFAULT 1,
  rest_count     INTEGER NOT NULL DEFAULT 1,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. supplier_balance_configs 테이블 — 신규 생성
--    (supplierBalanceConfig.ts 전용: 공급처별 잔액 필드 매핑)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_balance_configs (
  supplier_name  TEXT PRIMARY KEY,
  balance_field  TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. vendors 테이블 — 신규 생성
--    (vendors.ts, auth.ts: 거래처 로그인 및 관리)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_name  TEXT        NOT NULL,
  contact_name  TEXT,
  phone         TEXT,
  category      TEXT,
  note          TEXT,
  password_hash TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 전화번호 중복 방지 (로그인 ID로 사용)
CREATE UNIQUE INDEX IF NOT EXISTS vendors_phone_unique
  ON vendors (phone)
  WHERE phone IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. zone_mismatches 테이블 — 신규 생성
--    (mismatches.ts: products.real_map ≠ products.spec 불일치 레거시 보관)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zone_mismatches (
  product_code  TEXT PRIMARY KEY,
  product_name  TEXT NOT NULL DEFAULT '',
  spec_zone     TEXT NOT NULL DEFAULT '',
  real_zone     TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. notifications 테이블 확인 (이미 존재 확인됨, 컬럼 검증만)
--    현재 컬럼: id, employee_id, title, body, type, read, created_at — 정상
-- ─────────────────────────────────────────────────────────────────────────────
-- 추가 작업 없음

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. leave_requests 테이블 확인 (이미 존재 확인됨, 컬럼 검증만)
--    현재 컬럼: id(uuid), employee_id, employee_name, leave_type,
--              start_date, end_date, reason, status, reviewer_note,
--              created_at, reviewed_at — 정상
-- ─────────────────────────────────────────────────────────────────────────────
-- 추가 작업 없음

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. stock_arrivals 테이블 확인 (이미 존재 확인됨, 컬럼 검증만)
--    현재 컬럼: id, title, body, created_by_id, created_at,
--              scheduled_at, broadcast_sent — 정상
-- ─────────────────────────────────────────────────────────────────────────────
-- 추가 작업 없음

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. ocr_confirmed_items 테이블 확인 (이미 존재 확인됨, 컬럼 검증만)
--    현재 컬럼: id, saved_at, supplier, product_name, product_code,
--              quantity, unit_price, amount, balance, expiry_date,
--              memo, raw_json, created_at — 정상
-- ─────────────────────────────────────────────────────────────────────────────
-- 추가 작업 없음

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. schedules 테이블 확인 (이미 존재 확인됨)
--     현재 컬럼: id, employeeId, date, type, workingHours, actualHours, memo — 정상
-- ─────────────────────────────────────────────────────────────────────────────
-- 추가 작업 없음

-- =============================================================================
-- 실행 결과 확인용 SELECT
-- =============================================================================
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = t.table_name) AS col_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN (
    'employees', 'schedules', 'zone_assignments', 'zone_dow_templates',
    'supplier_balance_configs', 'vendors', 'zone_mismatches',
    'notifications', 'leave_requests', 'stock_arrivals',
    'ocr_confirmed_items', 'lunch_requests', 'anon_push_subscriptions',
    'app_settings', 'products'
  )
ORDER BY table_name;
