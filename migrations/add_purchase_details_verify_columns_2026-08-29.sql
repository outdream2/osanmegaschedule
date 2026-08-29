-- 2026-08-29 · #198 · product_arrival_items → purchase_details 통합 · Phase 1 (DB 스키마)
--   · 사용자 크리티컬 지시 · "매입 테이블에 합쳐" · "테이블 자꾸 만들지 마"
--   · B안 · 완전 통합 · purchase_details 원본 테이블에 검수 메타 추가
--   · Phase 2 (서버 코드) · Phase 3 (UI) · Phase 4 (검증) · 별도 세션 진행
--   · Supabase 대시보드 SQL Editor 에서 실행

-- ────────────────────────────────────────────────────────────────
-- Step 1 · purchase_details 스키마 확장 · 검수 메타 5 컬럼 추가
--   · 기존 컬럼 (purchase_date · product_code · quantity · supplier_name 등) 유지
--   · 신규 컬럼 · 상품입고 검수 결과 저장
-- ────────────────────────────────────────────────────────────────
ALTER TABLE purchase_details
  ADD COLUMN IF NOT EXISTS verified_by TEXT,            -- 검수자명 (직원 이름)
  ADD COLUMN IF NOT EXISTS verify_status TEXT,          -- pending | verified | mismatch_noted (null = 미검수 · OCR 원본만)
  ADD COLUMN IF NOT EXISTS verify_note TEXT,            -- 검수 메모 (품목이상 상세)
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,     -- 검수 완료 일시
  ADD COLUMN IF NOT EXISTS verified_expiring BOOLEAN DEFAULT FALSE;  -- 유통기한 임박 여부

-- ────────────────────────────────────────────────────────────────
-- Step 2 · 인덱스 · 검수 필터 조회 성능
-- ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_purchase_verify_status ON purchase_details(verify_status)
  WHERE verify_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_verified_at ON purchase_details(verified_at DESC)
  WHERE verified_at IS NOT NULL;

-- ────────────────────────────────────────────────────────────────
-- Step 3 · 기존 product_arrival_items 데이터 마이그레이션 (1회성 · Idempotent)
--   · 원본 테이블 존재 시만 실행 (rename 후 재실행 시 스킵)
--   · status 필드에 'expiring' 케이스 포함
--   · onConflict 없이 단순 INSERT · 중복 방지 로직 별도 (검증 후)
-- ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'product_arrival_items'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'product_arrivals'
  ) THEN
    INSERT INTO purchase_details
      (purchase_date, supplier_name, product_code, product_name, quantity, unit_price, amount,
       verified_by, verify_status, verified_expiring, verified_at, imported_at)
    SELECT
      COALESCE(pa.arrival_date::DATE, pai.created_at::DATE) AS purchase_date,
      pai.supplier,
      pai.product_code,
      pai.product_name,
      pai.qty,
      0 AS unit_price,
      0 AS amount,
      pa.checked_by,
      CASE
        WHEN pai.status = 'match' THEN 'verified'
        WHEN pai.status = 'mismatch' THEN 'mismatch_noted'
        WHEN pai.status = 'expiring' THEN 'verified'
        ELSE 'pending'
      END AS verify_status,
      (pai.status = 'expiring') AS verified_expiring,
      pa.arrival_date,
      NOW()
    FROM product_arrival_items pai
    JOIN product_arrivals pa ON pa.id = pai.arrival_id;

    RAISE NOTICE 'product_arrival_items → purchase_details 마이그 완료';
  ELSE
    RAISE NOTICE 'product_arrival_items 테이블 없음 (rename 후 재실행) · Step 3 스킵';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- Step 4 · 기존 테이블 아카이브 rename (삭제 X · 2주 관찰)
--   · 롤백 필요 시 · 복원 용이
--   · 2주 후 · 별도 DROP 마이그레이션 (사용자 승인 후)
-- ────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS product_arrival_items RENAME TO _archive_product_arrival_items_20260829;
ALTER TABLE IF EXISTS product_arrivals RENAME TO _archive_product_arrivals_20260829;

-- ────────────────────────────────────────────────────────────────
-- 실행 후 확인
--   · SELECT COUNT(*) FROM purchase_details WHERE verify_status IS NOT NULL;
--     · 마이그된 검수 이력 개수
--   · SELECT COUNT(*) FROM _archive_product_arrival_items_20260829;
--     · 아카이브 · 원본 수 대조
-- ────────────────────────────────────────────────────────────────

-- Phase 2 (서버 코드) 실행 전 · 이 마이그레이션 완료 필수
--   · server/routes/stock/productArrivals.ts · purchase_details 사용으로 리팩터
--   · POST · 검수 저장 시 · purchase_details UPSERT (verify_status 매핑)
--   · GET · purchase_details WHERE verify_status IS NOT NULL 조회
--   · DELETE · verify_status · verified_by = NULL 로 unlink (soft)
