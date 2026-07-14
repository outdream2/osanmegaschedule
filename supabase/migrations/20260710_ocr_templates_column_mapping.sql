-- ocr_templates 테이블에 column_mapping 컬럼 추가
-- 원본 컬럼 순서 유지 배열 · "" (빈 문자열) = 제외 · 나머지는 표준 필드명
-- 예: ["품명","","수량","단가","금액","유통기한"]
--   → 원본 6개 컬럼 중 1번째("") 제외, 나머지 5개를 순서대로 [품명,수량,단가,금액,유통기한]

ALTER TABLE ocr_templates
  ADD COLUMN IF NOT EXISTS column_mapping JSONB;

COMMENT ON COLUMN ocr_templates.column_mapping IS
  '원본 컬럼 순서 유지 배열 · "" = 제외 · 프론트 매핑 UI에서 사용자가 지정';
