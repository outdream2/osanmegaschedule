-- =============================================================================
-- 메가타운 약국 — 누락 스키마 보완 마이그레이션
-- 생성일: 2026-07-06  (직접 DB 접속 감사 후 작성)
-- 실행 방법: Supabase Dashboard > SQL Editor 에서 전체 붙여넣기 후 실행
-- 안전: 기존 데이터 삭제 없음 (CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS 만 사용)
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. zone_day_assignments 테이블 — 신규 생성
--    날짜별 근무 배정 확정 저장 테이블.
--    PUT /api/zone-day/:date 가 이 테이블에 upsert 하는데, 테이블이 없어서
--    사용자가 "확정 저장 실패"를 반복적으로 경험하는 직접 원인.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zone_day_assignments (
  date           TEXT        PRIMARY KEY,               -- 'YYYY-MM-DD'
  zone_slots     JSONB       NOT NULL DEFAULT '{}',
  lunch_slots    JSONB       NOT NULL DEFAULT '{}',
  rest_slots     JSONB       NOT NULL DEFAULT '{}',
  lunch_offset   INTEGER     NOT NULL DEFAULT 0,
  rest_offset    INTEGER     NOT NULL DEFAULT 0,
  lunch_interval INTEGER     NOT NULL DEFAULT 30,
  rest_interval  INTEGER     NOT NULL DEFAULT 30,
  lunch_count    INTEGER     NOT NULL DEFAULT 1,
  rest_count     INTEGER     NOT NULL DEFAULT 1,
  is_confirmed   BOOLEAN     NOT NULL DEFAULT false,    -- 확정 여부
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE zone_day_assignments IS '날짜별 근무 배정 확정 저장. PUT /api/zone-day/:date 에서 upsert.';
COMMENT ON COLUMN zone_day_assignments.is_confirmed IS '확정 저장 여부. true이면 화면에 잠금 표시.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. supplier_balances 테이블 — 신규 생성
--    OCR 명세서에서 추출한 공급처별 잔고(누계 미수금) 기록.
--    GET /api/supplier-balances, POST /api/supplier-balances 에서 사용.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_balances (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  supplier_name  TEXT        NOT NULL,
  invoice_date   DATE,                                  -- 명세서 날짜 (nullable)
  balance        NUMERIC     NOT NULL,                  -- 잔고 금액
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE supplier_balances IS 'OCR 명세서에서 추출한 공급처별 잔고 누적 기록.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. employees."retireDate" 컬럼 — 추가
--    퇴사일. NULL이면 현직. 프론트엔드에서 퇴사일 이후 날짜의 근무 배정을 회색 처리.
--    주의: 기존 hireDate 컬럼처럼 camelCase 따옴표 필수.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS "retireDate" TEXT NULL;

COMMENT ON COLUMN employees."retireDate" IS '퇴사일 (YYYY-MM-DD). NULL이면 현직.';


-- =============================================================================
-- 실행 결과 확인 (실행 후 아래 SELECT 결과로 검증)
-- =============================================================================
SELECT
  table_name,
  (
    SELECT COUNT(*)
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = t.table_name
  ) AS col_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN (
    'zone_day_assignments',
    'supplier_balances'
  )
ORDER BY table_name;

-- employees.retireDate 존재 확인
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'employees'
  AND column_name = 'retireDate';
