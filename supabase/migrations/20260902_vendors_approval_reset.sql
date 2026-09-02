-- ═══════════════════════════════════════════════════════════════════
-- 2026-09-02 · 사용자 지시 · 승인 상태 초기화 (관리자 승인 흐름 정착 위해)
--   · 배경 · 과거 xlsx 임포트 · 초기 배포 과정에서 · approval_status='approved' 자동 설정된 vendor 다수
--   · 실제 관리자 승인 flow 를 거치지 않았음
--   · 리셋 · approval_requested_at 이 NULL 인 (요청조차 없는) vendor 만 → 'unregistered' 취급 (NULL)
--   · 실제로 요청/승인/거절 이력이 있는 vendor 는 유지
--
-- 실행: Supabase SQL Editor (사용자 확인 후 실행)
-- ═══════════════════════════════════════════════════════════════════

-- 1. approval_requested_at 이 NULL 이면서 approval_status='approved' 인 vendor 확인 (실행 전 조회 · dry run)
--    SELECT id, company_name, approval_status, approved_at, approval_requested_at
--      FROM vendors
--     WHERE approval_status = 'approved' AND approval_requested_at IS NULL
--     ORDER BY id;

-- 2. 실제 리셋 (원하는 경우만 UNCOMMENT 하여 실행)
-- UPDATE vendors
--    SET approval_status = NULL,
--        approved_at = NULL,
--        approved_by = NULL
--  WHERE approval_status = 'approved'
--    AND approval_requested_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 검증 (실행 후)
--   SELECT approval_status, COUNT(*) FROM vendors GROUP BY approval_status;
-- ═══════════════════════════════════════════════════════════════════
