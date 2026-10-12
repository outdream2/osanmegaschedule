-- supabase/migrations/2026-10-06_vendor_canonicalization_stage_a.sql
-- 사용자 승인 2026-10-06 · VENDOR ERP CANONICALIZATION Stage A
--
-- 목적: ERP BuyCustomer_List 기준으로 vendors 테이블에 canonical columns 추가.
--
-- STAGE A (이 Migration):
--   · 신규 canonical columns 추가 (nullable · 기본값 없음)
--   · 기존 WEB 컬럼 값을 canonical column 으로 copy
--   · legacy column (company_name · business_number · category · note) 은 그대로 유지
--     → production 운영 중단 없이 "코드 전환 완료 후" STAGE B 에서 DROP 예정
--
-- STAGE B (별도 Migration · 코드 전수 전환 완료 후):
--   · legacy columns DROP
--
-- 전제:
--   · "schema 변경 금지" 원칙이 이번 작업 승인으로 명시 해제됨
--   · vendors 테이블의 WEB-only 20개 컬럼은 그대로 보존 (overwrite/drop 금지)
--   · ct_code = ERP 거래처 canonical identity · UNIQUE (108/108 ERP 쪽 distinct 확인)
--
-- 영향 범위: 코드 refactor 는 후속 commit 에서 수행 (STAGE A' · 60+ 파일)

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. 신규 ERP canonical columns 추가 (nullable)
-- ────────────────────────────────────────────────────────────

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS ct_code             TEXT,
  ADD COLUMN IF NOT EXISTS corp_name_view      TEXT,
  ADD COLUMN IF NOT EXISTS corp_biz_no         TEXT,
  ADD COLUMN IF NOT EXISTS scate_name          TEXT,
  ADD COLUMN IF NOT EXISTS remark              TEXT,
  -- 운영가치 높은 ERP 전용 7개 (사용자 승인)
  ADD COLUMN IF NOT EXISTS president           TEXT,
  ADD COLUMN IF NOT EXISTS join_date           DATE,
  ADD COLUMN IF NOT EXISTS buyer_type_name     TEXT,
  ADD COLUMN IF NOT EXISTS buyer_status_name   TEXT,
  ADD COLUMN IF NOT EXISTS payment_type_name   TEXT,
  ADD COLUMN IF NOT EXISTS payment_gubun_name  TEXT,
  ADD COLUMN IF NOT EXISTS payment_date        INT;

-- ────────────────────────────────────────────────────────────
-- 2. ct_code UNIQUE 제약 (nullable 허용 · WEB-only vendor 는 null 가능)
-- ────────────────────────────────────────────────────────────
-- Postgres UNIQUE 제약은 NULL 값 복수 허용 → WEB-only vendor 다수 nullable 공존 OK

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'vendors_ct_code_unique' AND conrelid = 'vendors'::regclass
  ) THEN
    ALTER TABLE vendors ADD CONSTRAINT vendors_ct_code_unique UNIQUE (ct_code);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. 기존 WEB 컬럼 값을 canonical column 으로 copy (overwrite 하지 않음)
-- ────────────────────────────────────────────────────────────
-- 기존 corp_name_view 등이 이미 수동으로 채워진 경우 (예: 이전 작업 흔적) overwrite 하지 않도록 COALESCE

UPDATE vendors
   SET corp_name_view = COALESCE(corp_name_view, company_name)
 WHERE company_name IS NOT NULL;

UPDATE vendors
   SET corp_biz_no = COALESCE(corp_biz_no, business_number)
 WHERE business_number IS NOT NULL;

UPDATE vendors
   SET scate_name = COALESCE(scate_name, category)
 WHERE category IS NOT NULL;

UPDATE vendors
   SET remark = COALESCE(remark, note)
 WHERE note IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 4. 인덱스 (조회 최적화)
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_vendors_corp_biz_no    ON vendors (corp_biz_no)    WHERE corp_biz_no    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendors_corp_name_view ON vendors (corp_name_view) WHERE corp_name_view IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 5. 검증 쿼리 (수행 후 확인용 · 주석 처리된 참고용)
-- ────────────────────────────────────────────────────────────
--
--   SELECT
--     count(*)                              AS total,
--     count(company_name)                   AS legacy_name,
--     count(corp_name_view)                 AS new_name,
--     count(business_number)                AS legacy_bz,
--     count(corp_biz_no)                    AS new_bz,
--     count(ct_code)                        AS ct_code_populated
--   FROM vendors;
--
--   · total == legacy_name == new_name 이어야 함
--   · ct_code_populated 는 아직 0 (ERP sync 실행 전)

COMMIT;

-- ────────────────────────────────────────────────────────────
-- ROLLBACK (실수 시)
-- ────────────────────────────────────────────────────────────
--
-- BEGIN;
--   ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_ct_code_unique;
--   DROP INDEX IF EXISTS idx_vendors_corp_biz_no;
--   DROP INDEX IF EXISTS idx_vendors_corp_name_view;
--   ALTER TABLE vendors
--     DROP COLUMN IF EXISTS ct_code,
--     DROP COLUMN IF EXISTS corp_name_view,
--     DROP COLUMN IF EXISTS corp_biz_no,
--     DROP COLUMN IF EXISTS scate_name,
--     DROP COLUMN IF EXISTS remark,
--     DROP COLUMN IF EXISTS president,
--     DROP COLUMN IF EXISTS join_date,
--     DROP COLUMN IF EXISTS buyer_type_name,
--     DROP COLUMN IF EXISTS buyer_status_name,
--     DROP COLUMN IF EXISTS payment_type_name,
--     DROP COLUMN IF EXISTS payment_gubun_name,
--     DROP COLUMN IF EXISTS payment_date;
-- COMMIT;
