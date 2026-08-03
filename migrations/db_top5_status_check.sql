-- =============================================================
-- migrations/db_top5_status_check.sql
-- 생성일: 2026-08-03
-- 용도: Priority 5 · status 컬럼 CHECK 제약 추가
--
-- 대상 테이블 / 허용값 (코드 라우터에서 확인된 실제 whitelist 기준):
--   leave_requests          · pending | approved | rejected
--   return_requests         · pending | sent | done | cancelled
--   display_requests        · pending | done
--   inventory_checks        · pending | done
--   product_arrival_items   · pending | match | mismatch
--
-- 제외 테이블:
--   order_requests          · status 컬럼 없음 (스키마에 미포함)
--   zone_mismatches         · status 컬럼 없음
--   resignation_requests    · 이미 CHECK 제약 존재 (create_resignation_requests.sql 참조)
--
-- 실행: Supabase SQL Editor 에 전체 붙여넣고 Run
-- 멱등성: DO $$...END$$ + IF NOT EXISTS 패턴 · 재실행 안전
-- 주의: 이미 허용값 외 데이터가 있으면 ADD CONSTRAINT 가 실패함
--       실행 전 하단 사전 확인 쿼리 먼저 실행 권장
-- 롤백: 하단 ROLLBACK 블록 참조
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 사전 확인 쿼리 (실행 후 결과가 0 행이어야 제약 추가 안전)
-- 실행하고 결과를 눈으로 확인 · 0행이면 아래 제약 추가 진행
-- ─────────────────────────────────────────────────────────────

-- leave_requests 비허용 status 값 확인
SELECT 'leave_requests' AS tbl, status, COUNT(*) AS cnt
  FROM leave_requests
 WHERE status NOT IN ('pending', 'approved', 'rejected')
 GROUP BY status;

-- return_requests 비허용 status 값 확인
SELECT 'return_requests' AS tbl, status, COUNT(*) AS cnt
  FROM return_requests
 WHERE status NOT IN ('pending', 'sent', 'done', 'cancelled')
 GROUP BY status;

-- display_requests 비허용 status 값 확인
SELECT 'display_requests' AS tbl, status, COUNT(*) AS cnt
  FROM display_requests
 WHERE status NOT IN ('pending', 'done')
 GROUP BY status;

-- inventory_checks 비허용 status 값 확인
SELECT 'inventory_checks' AS tbl, status, COUNT(*) AS cnt
  FROM inventory_checks
 WHERE status NOT IN ('pending', 'done')
 GROUP BY status;

-- product_arrival_items 비허용 status 값 확인
SELECT 'product_arrival_items' AS tbl, status, COUNT(*) AS cnt
  FROM product_arrival_items
 WHERE status NOT IN ('pending', 'match', 'mismatch')
 GROUP BY status;


-- =============================================================
-- CHECK 제약 추가 (사전 확인 쿼리 결과가 모두 0행인 경우에만 실행)
-- =============================================================

-- ── 1. leave_requests ───────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'leave_requests'::regclass
       AND contype = 'c'
       AND conname = 'leave_requests_status_check'
  ) THEN
    ALTER TABLE leave_requests
      ADD CONSTRAINT leave_requests_status_check
        CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

-- ── 2. return_requests ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'return_requests'::regclass
       AND contype = 'c'
       AND conname = 'return_requests_status_check'
  ) THEN
    ALTER TABLE return_requests
      ADD CONSTRAINT return_requests_status_check
        CHECK (status IN ('pending', 'sent', 'done', 'cancelled'));
  END IF;
END $$;

-- ── 3. display_requests ─────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'display_requests'::regclass
       AND contype = 'c'
       AND conname = 'display_requests_status_check'
  ) THEN
    ALTER TABLE display_requests
      ADD CONSTRAINT display_requests_status_check
        CHECK (status IN ('pending', 'done'));
  END IF;
END $$;

-- ── 4. inventory_checks ─────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'inventory_checks'::regclass
       AND contype = 'c'
       AND conname = 'inventory_checks_status_check'
  ) THEN
    ALTER TABLE inventory_checks
      ADD CONSTRAINT inventory_checks_status_check
        CHECK (status IN ('pending', 'done'));
  END IF;
END $$;

-- ── 5. product_arrival_items ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'product_arrival_items'::regclass
       AND contype = 'c'
       AND conname = 'product_arrival_items_status_check'
  ) THEN
    ALTER TABLE product_arrival_items
      ADD CONSTRAINT product_arrival_items_status_check
        CHECK (status IN ('pending', 'match', 'mismatch'));
  END IF;
END $$;

-- ── 제약 추가 확인 쿼리 (실행 후 5개 행이 나와야 정상) ────
SELECT conrelid::regclass AS tbl, conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
 WHERE conname IN (
   'leave_requests_status_check',
   'return_requests_status_check',
   'display_requests_status_check',
   'inventory_checks_status_check',
   'product_arrival_items_status_check'
 )
 ORDER BY tbl;


-- =============================================================
-- ROLLBACK (제약 추가 후 문제 발생 시)
-- ALTER TABLE leave_requests          DROP CONSTRAINT IF EXISTS leave_requests_status_check;
-- ALTER TABLE return_requests         DROP CONSTRAINT IF EXISTS return_requests_status_check;
-- ALTER TABLE display_requests        DROP CONSTRAINT IF EXISTS display_requests_status_check;
-- ALTER TABLE inventory_checks        DROP CONSTRAINT IF EXISTS inventory_checks_status_check;
-- ALTER TABLE product_arrival_items   DROP CONSTRAINT IF EXISTS product_arrival_items_status_check;
-- =============================================================
