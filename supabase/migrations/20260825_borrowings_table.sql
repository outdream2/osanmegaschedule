-- 2026-08-25 · 차용 (borrowings) 테이블 생성
-- 사용자 지시 · 결제 > 차용입력 페이지 · 공급사↔약국 간 상품 차용 기록
--
-- 시나리오:
--   - 공급사가 임시로 상품을 빌려주거나 · 약국이 상품을 빌려서 나중에 반환/결제하는 경우
--   - 상품 · 수량 · 일자 · 사유 · 서명 (이미지) · 반환 예정일 · 상태 (open|settled|cancelled)
--   - 상태 open = 미해결 · settled = 반환·결제 완료 · cancelled = 취소
--
-- 컬럼:
--   id             · 자동증가 PK
--   created_at     · 자동 timestamp
--   direction      · 'lend'(대여 · 공급사→약국) | 'borrow'(차용 · 약국→공급사)
--   supplier       · 상대 공급사명 (텍스트 · vendors 조인 없이 flat)
--   product_code   · 상품코드 (products 조인 없이 flat)
--   product_name   · 상품명 (스냅샷)
--   qty            · 수량
--   unit_price     · 단가 (참고 · 정산 시 사용)
--   due_date       · 반환/정산 예정일 (nullable)
--   note           · 사유·메모
--   signature_url  · 서명 이미지 URL (Supabase Storage 등)
--   status         · 'open' | 'settled' | 'cancelled'
--   settled_at     · 정산 완료 시각 (nullable)
--   created_by     · 등록자 이름
--   created_by_id  · 등록자 ID
--
-- IF NOT EXISTS · 안전 · 재실행 가능

CREATE TABLE IF NOT EXISTS public.borrowings (
  id             BIGSERIAL PRIMARY KEY,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  direction      TEXT NOT NULL DEFAULT 'lend' CHECK (direction IN ('lend', 'borrow')),
  supplier       TEXT,
  product_code   TEXT,
  product_name   TEXT,
  qty            INTEGER NOT NULL DEFAULT 0,
  unit_price     NUMERIC(12, 2),
  due_date       DATE,
  note           TEXT,
  signature_url  TEXT,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled', 'cancelled')),
  settled_at     TIMESTAMPTZ,
  created_by     TEXT,
  created_by_id  BIGINT
);

-- 조회 성능
CREATE INDEX IF NOT EXISTS idx_borrowings_created_at ON public.borrowings (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_borrowings_supplier   ON public.borrowings (supplier);
CREATE INDEX IF NOT EXISTS idx_borrowings_status     ON public.borrowings (status);

-- RLS · 기본 정책 (서버 라우터 경유 · 자유 접근)
ALTER TABLE public.borrowings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "borrowings_all" ON public.borrowings;
CREATE POLICY "borrowings_all" ON public.borrowings
  FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
