-- ═══════════════════════════════════════════════════════════════════
-- 2026-09-02 · #79 · bulk_send_order_requests RPC · UUID 대응 (사용자 지시)
--
-- 배경 · 2026-09-01 원본 RPC (BIGINT[]) · order_requests.id 는 UUID · 타입 mismatch
--        + 컬럼명 `id` 파라미터명 `id` 충돌 · "column reference 'id' is ambiguous" 오류
--
-- 수정 · 파라미터 UUID[] · 파라미터명 p_request_ids · 명확한 참조
--
-- 실행 · Supabase Dashboard > SQL Editor · 아래 전체 실행
-- ═══════════════════════════════════════════════════════════════════

-- 1) 기존 BIGINT 시그니처 RPC 삭제 (타입 mismatch · 무용지물)
DROP FUNCTION IF EXISTS bulk_send_order_requests(BIGINT[]);

-- 2) 신규 UUID 시그니처 RPC · 파라미터명 명확화
CREATE OR REPLACE FUNCTION bulk_send_order_requests(p_request_ids UUID[])
RETURNS TABLE (updated_id UUID, updated_status TEXT) AS $$
BEGIN
  RETURN QUERY
    UPDATE order_requests o
       SET status  = 'ordered',
           sent_at = NOW()
     WHERE o.id = ANY(p_request_ids)
       AND o.status = 'requested'
    RETURNING o.id, o.status;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════
-- 검증
--   · 존재 확인 · SELECT proname, pg_get_function_identity_arguments(oid)
--                  FROM pg_proc WHERE proname = 'bulk_send_order_requests';
--   · 실행 테스트 · SELECT * FROM bulk_send_order_requests(ARRAY['fake-uuid']::UUID[]);
-- ═══════════════════════════════════════════════════════════════════
