-- 2026-08-25 · 반품 요청 테이블 생성 (사용자 보고 · 전송 실패)
--   에러: Could not find the table 'public.return_requests' in the schema cache
--
-- 서버 라우터 (server/routes/purchase/returnRequests.ts) 는 이미 정의됨
-- 컬럼 · id · created_at · product_code · product_name · supplier · qty
--         current_stock · purchase_price · reason · requested_by · requested_by_id · status
--
-- IF NOT EXISTS · 안전 · 재실행 가능

CREATE TABLE IF NOT EXISTS public.return_requests (
  id             BIGSERIAL PRIMARY KEY,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  product_code   TEXT NOT NULL,
  product_name   TEXT,
  supplier       TEXT,
  qty            INTEGER NOT NULL DEFAULT 0,
  current_stock  INTEGER,
  purchase_price NUMERIC(12, 2),
  reason         TEXT,
  requested_by   TEXT,
  requested_by_id BIGINT,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'done', 'cancelled'))
);

-- 조회 성능 · created_at DESC · supplier · status
CREATE INDEX IF NOT EXISTS idx_return_requests_created_at
  ON public.return_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_return_requests_supplier
  ON public.return_requests (supplier);
CREATE INDEX IF NOT EXISTS idx_return_requests_status
  ON public.return_requests (status);

-- RLS · 기본 정책 (Supabase anon key 접근 허용 · 서버 라우터 통해 검증)
ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "return_requests_all" ON public.return_requests;
CREATE POLICY "return_requests_all" ON public.return_requests
  FOR ALL USING (true) WITH CHECK (true);

-- PostgREST 스키마 캐시 refresh (테이블 추가 후 즉시 반영)
NOTIFY pgrst, 'reload schema';
