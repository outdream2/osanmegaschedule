-- 2026-10-06 · 사용자 지시 · 발주매입대조 · 이상 처리완료 workflow
--
-- 목적:
--   match_status (자동 매칭 결과 + 사용자 override) 와
--   resolution_status (업무 처리 완료 여부) 를 분리.
--
--   예: 수량 부족 (match_status=exception, exception_type=qty_short)
--       → 담당자가 "거래처 품절 10개, 추가입고 없음 확인" 처리완료 (resolution_status=resolved)
--
-- 원칙:
--   · 처리완료가 매칭 성공으로 바뀌지 않음 (match_status 유지 · resolution 별도)
--   · 기존 데이터 backfill 없음 · NULL = open 으로 해석
--   · exception_note (왜 이상인지) 와 resolution_note (어떻게 처리했는지) 분리
--
-- 영향:
--   · 신규 컬럼만 추가 · 기존 컬럼 변경 없음
--   · 기존 행 전부 resolution_status = NULL (= open) 로 시작
--   · 기존 매칭 flow 영향 0

BEGIN;

ALTER TABLE order_requests
  ADD COLUMN IF NOT EXISTS resolution_status TEXT NULL,
  ADD COLUMN IF NOT EXISTS resolved_at       TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS resolved_by       INT NULL,
  ADD COLUMN IF NOT EXISTS resolution_note   TEXT NULL;

COMMENT ON COLUMN order_requests.resolution_status IS
  '업무 처리 상태 · NULL (= open · 미처리) · "resolved" (처리완료) · match_status 와 독립';

COMMENT ON COLUMN order_requests.resolved_at IS
  '처리완료 시각 · ERP 재동기화로 자동 변경 금지';

COMMENT ON COLUMN order_requests.resolved_by IS
  '처리자 (employee_id) · auth user';

COMMENT ON COLUMN order_requests.resolution_note IS
  '처리 내용 자유기입 · 예: "거래처 품절 10개 추가입고 없음 확인" · exception_note (왜 이상인지) 와 분리';

-- 조회 효율용 partial index · resolved 건 조회 (이상목록 "처리완료" 필터)
CREATE INDEX IF NOT EXISTS idx_order_requests_resolution_status
  ON order_requests (resolution_status)
  WHERE resolution_status IS NOT NULL;

COMMIT;

-- 적용 확인:
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'order_requests'
--      AND column_name IN ('resolution_status','resolved_at','resolved_by','resolution_note');
