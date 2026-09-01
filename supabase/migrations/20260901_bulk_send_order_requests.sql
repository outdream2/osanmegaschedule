-- 2026-09-01 · bulk_send_order_requests RPC
-- status='requested' 인 발주요청을 한 번의 UPDATE로 ordered 처리 (atomic)
-- SQL 실행: Supabase Dashboard > SQL Editor > 아래 전체 선택 후 Run

CREATE OR REPLACE FUNCTION bulk_send_order_requests(request_ids BIGINT[])
RETURNS TABLE (id BIGINT, status TEXT) AS $$
BEGIN
  RETURN QUERY
    UPDATE order_requests
       SET status  = 'ordered',
           sent_at = NOW()
     WHERE id = ANY(request_ids)
       AND status = 'requested'
    RETURNING order_requests.id, order_requests.status;
END;
$$ LANGUAGE plpgsql;
