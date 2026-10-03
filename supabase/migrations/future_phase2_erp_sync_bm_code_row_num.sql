-- 2026-10-03 저녁 · Phase 2 · ERP Buy_Status → purchase_details unique key column 추가
--
-- ⚠⚠⚠ 자동 실행 금지 · 사용자 명시 승인 후 Supabase SQL Editor 에서 수동 실행
--
-- 파일명 접두 "future_" · 알파벳 정렬상 날짜 migration 뒤 → auto-apply 체인 안 걸림
--
-- 목적:
--   ERP Buy_Status 매입 거래의 unique key (BmCode + ROWNUM) 를 purchase_details 에 저장
--   같은 날짜 · 동일 상품 · 동일 수량 · 동일 금액 매입이 두 번 발생해도 중복 INSERT 방지
--
-- 과거 데이터 호환:
--   기존 12,939 rows 는 bm_code = NULL · row_num = NULL 로 유지
--   억지로 backfill 하지 않음 (ERP 매입 history 전수 재조회 금지 정책)
--
-- 되돌리기:
--   DROP INDEX IF EXISTS idx_purchase_details_bm_row;
--   ALTER TABLE purchase_details DROP COLUMN IF EXISTS row_num;
--   ALTER TABLE purchase_details DROP COLUMN IF EXISTS bm_code;

ALTER TABLE purchase_details
  ADD COLUMN IF NOT EXISTS bm_code TEXT,
  ADD COLUMN IF NOT EXISTS row_num INT;

-- Partial unique index: ERP 매입만 unique 제약 (과거 Excel 데이터는 NULL 허용)
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_details_bm_row
  ON purchase_details (bm_code, row_num)
  WHERE bm_code IS NOT NULL AND row_num IS NOT NULL;

COMMENT ON COLUMN purchase_details.bm_code IS 'ERP Buy_Status.BmCode · 매입 문서 ID · (bm_code, row_num) unique';
COMMENT ON COLUMN purchase_details.row_num IS 'ERP Buy_Status.ROWNUM · 문서 내 라인 번호 · (bm_code, row_num) unique';
