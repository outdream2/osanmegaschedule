-- 2026-08-12 · leave_requests 인덱스 · 성능 (권장)
--
-- 배경:
--   · leave_requests 테이블에 인덱스가 없음 (create_leave_requests.sql 기준)
--   · GET /api/leave-balance    · WHERE employee_id = ? AND status = 'approved'
--   · GET /api/leave-requests   · WHERE employee_id = ? ORDER BY created_at DESC
--   · GET /api/leave-requests/pending-count · WHERE status = 'pending'
--   · 직원 수 증가 · leave 요청 누적 시 seq scan 발생 · 응답 지연 가능
--
-- 실행 방법 · Supabase Dashboard → SQL Editor → 아래 실행
-- 안전 · IF NOT EXISTS · 중복 실행 무해

-- 조회 · WHERE employee_id = ? AND status = 'approved' (leave-balance 계산)
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_status
  ON leave_requests(employee_id, status);

-- 조회 · WHERE status = 'pending' (관리자 대기 카운트)
CREATE INDEX IF NOT EXISTS idx_leave_requests_status
  ON leave_requests(status);

-- 조회 · ORDER BY created_at DESC (본인 이력 · 관리자 전체 목록)
CREATE INDEX IF NOT EXISTS idx_leave_requests_created_at
  ON leave_requests(created_at DESC);

-- 확인
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'leave_requests';
