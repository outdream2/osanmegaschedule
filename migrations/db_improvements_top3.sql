-- =============================================================
-- migrations/db_improvements_top3.sql
-- 생성일: 2026-08-03
-- 용도: DB 개선 Top 1-3 (invoice_date 타입 변환 · inventory-latest RPC · warehouse_stock 확인)
-- 실행: Supabase SQL Editor 에 전체 붙여넣고 Run
-- 순서: Priority 1 → Priority 3 → Priority 2 확인쿼리
--       (Priority 2 실제 컬럼 drop 은 별도 태스크 · 여기서는 검증만)
-- 롤백: 각 블록 상단 ROLLBACK 주석 참조
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- Priority 1 · ocr_confirmed_items.invoice_date TEXT → DATE
-- 위험도: 중간
--   · 유효하지 않은 날짜 문자열은 NULL 로 처리됨
--   · 롤백: 아래 "Priority 1 ROLLBACK" 블록 참조
-- ─────────────────────────────────────────────────────────────
BEGIN;

-- 1-a. 새 DATE 컬럼 추가 (IF NOT EXISTS 멱등)
ALTER TABLE ocr_confirmed_items
  ADD COLUMN IF NOT EXISTS invoice_date_new DATE;

-- 1-b. 유효한 YYYY-MM-DD 형식 값만 복사 · 나머지는 NULL
UPDATE ocr_confirmed_items
   SET invoice_date_new =
         CASE
           WHEN invoice_date ~ '^\d{4}-\d{2}-\d{2}$'
           THEN invoice_date::date
           ELSE NULL
         END
 WHERE invoice_date_new IS NULL;  -- 재실행 시 이미 채워진 행은 건너뜀

COMMIT;

-- 1-c. 데이터 확인 (실행 후 결과를 눈으로 확인 · 문제없으면 1-d 진행)
SELECT
  COUNT(*)                                       AS total_rows,
  COUNT(invoice_date)                            AS old_text_non_null,
  COUNT(invoice_date_new)                        AS new_date_non_null,
  COUNT(*) FILTER (
    WHERE invoice_date IS NOT NULL
      AND invoice_date_new IS NULL
  )                                              AS converted_to_null   -- 이 숫자가 크면 데이터 검토 필요
FROM ocr_confirmed_items;

-- 1-d. 기존 컬럼 삭제 · 새 컬럼 rename (확인 후 실행)
--      아래 3줄을 선택 실행 · 위 확인 쿼리에서 converted_to_null 이 허용 범위일 때만

BEGIN;
ALTER TABLE ocr_confirmed_items DROP COLUMN IF EXISTS invoice_date;
ALTER TABLE ocr_confirmed_items RENAME COLUMN invoice_date_new TO invoice_date;
COMMIT;

-- 1-e. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_ocr_invoice_date
  ON ocr_confirmed_items (invoice_date);

-- ── Priority 1 ROLLBACK (사용 시: 위 단계 실행 전에 실행)
-- BEGIN;
-- ALTER TABLE ocr_confirmed_items ADD COLUMN IF NOT EXISTS invoice_date TEXT;
-- UPDATE ocr_confirmed_items
--    SET invoice_date = invoice_date_new::text
--  WHERE invoice_date IS NULL AND invoice_date_new IS NOT NULL;
-- ALTER TABLE ocr_confirmed_items DROP COLUMN IF EXISTS invoice_date_new;
-- COMMIT;


-- ─────────────────────────────────────────────────────────────
-- Priority 3 · get_inventory_latest RPC
-- 위험도: 낮음 (읽기 전용 함수 · 기존 데이터 변경 없음)
--   · OR REPLACE 로 재실행 가능 · 완전 멱등
--   · 롤백: DROP FUNCTION get_inventory_latest();
--
-- 반환값:
--   product_code      TEXT
--   warehouse_stock   INT    ← warehouse1_stock 우선 · 없으면 warehouse_stock (레거시 fallback)
--   store_stock       INT    ← store_stock (매장1)
--   checked_at        TIMESTAMPTZ
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_inventory_latest()
RETURNS TABLE (
  product_code    TEXT,
  warehouse_stock INT,
  store_stock     INT,
  checked_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT ON (product_code)
    product_code,
    -- warehouse1_stock 신규 컬럼 우선 · null 이면 레거시 warehouse_stock fallback
    COALESCE(warehouse1_stock, warehouse_stock)  AS warehouse_stock,
    store_stock,
    checked_at
  FROM inventory_checks
  ORDER BY product_code, checked_at DESC;
$$;

-- 실행 확인 (RPC 생성 후)
-- SELECT * FROM get_inventory_latest() LIMIT 5;

-- ── Priority 3 ROLLBACK
-- DROP FUNCTION IF EXISTS get_inventory_latest();


-- ─────────────────────────────────────────────────────────────
-- Priority 2 · warehouse_stock / warehouse1_stock 동기 확인
-- 위험도: 없음 (SELECT 전용 · 데이터 변경 없음)
--   · 결과가 0 이면 두 컬럼이 완전히 동일 → 이후 warehouse_stock 컬럼 제거 안전
--   · 결과가 0 보다 크면 코드 수정 완료 후 재확인 필요
-- ─────────────────────────────────────────────────────────────

-- 2-a. 불일치 행 개수 확인
SELECT COUNT(*) AS mismatch_count
  FROM inventory_checks
 WHERE warehouse_stock IS DISTINCT FROM warehouse1_stock;

-- 2-b. 불일치 샘플 (최대 20행 · 원인 파악용)
SELECT id, product_code, checked_at,
       warehouse_stock, warehouse1_stock
  FROM inventory_checks
 WHERE warehouse_stock IS DISTINCT FROM warehouse1_stock
 ORDER BY checked_at DESC
 LIMIT 20;

-- 2-c. 컬럼 drop 은 여기서 실행하지 않음 · 코드에서 warehouse_stock 참조 정리 후 별도 태스크에서 실행
-- 컬럼 drop 예시 (나중에 사용):
-- ALTER TABLE inventory_checks DROP COLUMN IF EXISTS warehouse_stock;
