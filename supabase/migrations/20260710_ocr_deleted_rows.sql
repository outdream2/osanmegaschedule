-- OCR 1차보정에서 사용자가 삭제한 행을 영구 기억.
-- 다음 스캔부터 같은 서명(공급사 + 정규화된 품명)의 행은 자동으로 필터링됨.

CREATE TABLE IF NOT EXISTS ocr_deleted_rows (
  id            BIGSERIAL PRIMARY KEY,
  supplier_norm TEXT NOT NULL,   -- normSupplier 로 정규화된 공급사명
  name_norm     TEXT NOT NULL,   -- 소문자·공백·특수문자 제거된 품명 서명
  signature     TEXT GENERATED ALWAYS AS (supplier_norm || '|' || name_norm) STORED,
  supplier_raw  TEXT,            -- 참고용 원본 공급사
  name_raw      TEXT,            -- 참고용 원본 품명
  deleted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- UNIQUE constraint 는 별도 인덱스로 (GENERATED 컬럼에 인라인 UNIQUE 불가)
CREATE UNIQUE INDEX IF NOT EXISTS ocr_deleted_rows_signature_uniq
  ON ocr_deleted_rows (signature);

CREATE INDEX IF NOT EXISTS idx_ocr_deleted_rows_supplier
  ON ocr_deleted_rows (supplier_norm);

COMMENT ON TABLE ocr_deleted_rows IS
  '사용자가 1차보정 테이블에서 삭제한 행 · 다음 스캔 시 자동 필터';
