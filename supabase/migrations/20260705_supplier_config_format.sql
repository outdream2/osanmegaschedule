-- 공급사별 잔고항목 지정 테이블 확장
-- balance_field 외에 거래명세표 형식(컬럼 순서/헤더 매핑) 함께 저장
-- OCR 다음 실행 시 자동 적용용

ALTER TABLE supplier_balance_configs
  ADD COLUMN IF NOT EXISTS column_layout JSONB DEFAULT NULL;

COMMENT ON COLUMN supplier_balance_configs.column_layout IS
  '공급사별 거래명세표 컬럼 순서/매핑. { "col_order": [0,3,1,...], "headers": ["품명","수량",...] } 형태';
