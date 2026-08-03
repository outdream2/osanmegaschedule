-- migrations/vat_integration.sql
-- 2026-08-03 · VAT 통합 · #193 (데이터+레이아웃)
--   목적: 공급사별 VAT 포함/미포함 설정 · 거래명세서·결제 raw 데이터에 VAT/공급가액 저장
--         · 나중에 부가세 신고 시 정확한 매입·매출 세액 산출
--   멱등성: ADD COLUMN IF NOT EXISTS · 재실행 안전
--   실행: Supabase SQL Editor 에서 그대로 실행

-- ─────────────────────────────────────────────────────────────────
-- 1) vendors · 공급사별 VAT 포함 여부 (거래명세서 총액 기준)
-- ─────────────────────────────────────────────────────────────────
--   true  · 총액에 VAT 포함 (VAT = amount / 11)
--   false · 총액은 공급가액만  (VAT = amount * 0.1 · 별도과세)
--   null  · 미설정 (VendorListEditor.detectVatIncluded 로 회사명·비고에서 유추)
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS vat_included boolean;
COMMENT ON COLUMN vendors.vat_included IS 'VAT 포함 여부 · true=총액에 VAT 포함 · false=별도과세 · null=미설정';

-- ─────────────────────────────────────────────────────────────────
-- 2) ocr_confirmed_items · 거래명세서 raw · VAT 금액 · 공급가액
-- ─────────────────────────────────────────────────────────────────
--   OCR 이 amount(총액) 만 캡처하는 경우 · vat_amount·supply_amount 는 vendor.vat_included 로 계산
--   OCR 이 별도로 부가세 라인을 캡처하면 직접 저장
ALTER TABLE ocr_confirmed_items ADD COLUMN IF NOT EXISTS vat_amount numeric DEFAULT 0;
ALTER TABLE ocr_confirmed_items ADD COLUMN IF NOT EXISTS supply_amount numeric DEFAULT 0;
COMMENT ON COLUMN ocr_confirmed_items.vat_amount    IS '부가세 금액 · 0 이면 vendor.vat_included 로 계산';
COMMENT ON COLUMN ocr_confirmed_items.supply_amount IS '공급가액 · 0 이면 amount - vat_amount';

-- ─────────────────────────────────────────────────────────────────
-- 3) purchase_details · 매입상세 · VAT 금액 · 공급가액 (이미 있을 수 있음)
-- ─────────────────────────────────────────────────────────────────
--   기존 purchase_details.vat 컬럼과 별개 · 표준 명칭 vat_amount · supply_amount 로 통일
ALTER TABLE purchase_details ADD COLUMN IF NOT EXISTS vat_amount numeric DEFAULT 0;
ALTER TABLE purchase_details ADD COLUMN IF NOT EXISTS supply_amount numeric DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────
-- 4) supplier_payments · 결제 · 세금계산서 발행 시 VAT 금액 별도 기록
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS vat_amount numeric DEFAULT 0;
ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS tax_invoice_no text;
COMMENT ON COLUMN supplier_payments.vat_amount     IS '세금계산서 상 VAT 금액 (결제금액에 포함되어 있으면 amount/11)';
COMMENT ON COLUMN supplier_payments.tax_invoice_no IS '전자세금계산서 승인번호 (홈택스 조회용)';
