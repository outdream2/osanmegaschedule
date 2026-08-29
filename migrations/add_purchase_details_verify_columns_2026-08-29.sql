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
-- Step 3 · 기존 product_arrival_items 데이터 마이그레이션 (1회성)
--   · 상품입고 검수 이력 · purchase_details 로 UPSERT
--   · 중복 방지 · onConflict (purchase_date + supplier_code + product_code + quantity + amount)
--   · match/mismatch/expiring → verify_status 매핑
-- ────────────────────────────────────────────────────────────────
INSERT INTO purchase_details
  (purchase_date, supplier_name, product_code, product_name, quantity,
   verified_by, verify_status, verified_expiring, verified_at, imported_at)
SELECT
  COALESCE(pa.arrival_date::DATE, pai.created_at::DATE),
  pai.supplier,
  pai.product_code,
  pai.product_name,
  pai.qty,
  pa.checked_by,
  CASE
    WHEN pai.status = 'match' AND COALESCE(pai.expiring, false) = false THEN 'verified'
    WHEN pai.status = 'mismatch' THEN 'mismatch_noted'
    WHEN pai.expiring = true THEN 'verified'  -- 기한임박 · verified 로 · verified_expiring=true 로 구분
    ELSE 'pending'
  END,
  COALESCE(pai.expiring, false),
  pa.arrival_date,
  NOW()
FROM product_arrival_items pai
JOIN product_arrivals pa ON pa.id = pai.arrival_id
ON CONFLICT (purchase_date, COALESCE(supplier_code,''), product_code, quantity, amount)
  DO UPDATE SET
    verify_status = EXCLUDED.verify_status,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    verified_expiring = EXCLUDED.verified_expiring;

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
