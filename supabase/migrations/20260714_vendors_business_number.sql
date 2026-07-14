-- 2026-07-14: vendors 테이블에 사업자번호 컬럼 추가
-- 공급사관리 xlsx 에 이미 있는 필드 · OCR 공급사 매칭 정확도 향상 목적

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS business_number TEXT;

-- 사업자번호 형식 (10자리 숫자 · 하이픈 제거해서 저장)
-- 예: "310-18-05493" → "3101805493"
CREATE INDEX IF NOT EXISTS vendors_business_number_idx
  ON vendors (business_number)
  WHERE business_number IS NOT NULL;
