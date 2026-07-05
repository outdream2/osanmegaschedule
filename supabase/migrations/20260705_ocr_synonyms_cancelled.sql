-- ocr_synonyms 테이블에 취소(비활성) 상태 컬럼 추가
-- 2차 보정에서 ✕ 취소한 항목을 삭제하는 대신 cancelled=true로 표시.
-- getSynonymMap()은 cancelled=false만 매칭에 사용하므로 재적용되지 않음.
-- 동의어 관리 페이지에서 취소 항목을 조회/복원할 수 있음.

ALTER TABLE ocr_synonyms
  ADD COLUMN IF NOT EXISTS cancelled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE ocr_synonyms
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_ocr_synonyms_cancelled ON ocr_synonyms(cancelled);

COMMENT ON COLUMN ocr_synonyms.cancelled IS
  '2차 보정에서 사용자가 ✕ 취소한 항목. TRUE면 OCR 자동 매칭에서 제외됨. 복원은 FALSE로 되돌리면 됨.';
