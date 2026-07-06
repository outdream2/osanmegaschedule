-- 재고현황 스냅샷 저장 테이블
-- 초순(1-10)/중순(11-20)/하순(21-말일) 기간별로 xlsx 업로드 시 각 상품 행을 저장
-- (snapshot_date, product_code)에 UNIQUE 제약 → 같은 날짜+상품은 덮어쓰기(upsert)

-- ── 1. 테이블 없으면 생성 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_history (
  id               BIGSERIAL PRIMARY KEY,
  snapshot_date    DATE        NOT NULL,
  product_code     TEXT        NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. 누락 컬럼 안전하게 추가 (이미 있으면 skip) ─────────────────────
ALTER TABLE public.stock_history
  ADD COLUMN IF NOT EXISTS period_type      TEXT,
  ADD COLUMN IF NOT EXISTS supplier_code    TEXT,
  ADD COLUMN IF NOT EXISTS supplier_name    TEXT,
  ADD COLUMN IF NOT EXISTS product_name     TEXT,
  ADD COLUMN IF NOT EXISTS spec             TEXT,
  ADD COLUMN IF NOT EXISTS tax_type         TEXT,
  ADD COLUMN IF NOT EXISTS product_type     TEXT,
  ADD COLUMN IF NOT EXISTS opening_stock    NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_qty     NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sale_qty         NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disposal_qty     NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS internal_qty     NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustment_qty   NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closing_stock    NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_amount   NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supply_amount    NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat              NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duty_free_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount     NUMERIC DEFAULT 0;

-- ── 3. UNIQUE 제약 (없을 때만) ─────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stock_history_snapshot_product_uniq'
  ) THEN
    ALTER TABLE public.stock_history
      ADD CONSTRAINT stock_history_snapshot_product_uniq
      UNIQUE (snapshot_date, product_code);
  END IF;
END $$;

-- ── 4. 조회용 인덱스 ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS stock_history_snapshot_date_idx ON public.stock_history (snapshot_date DESC);
CREATE INDEX IF NOT EXISTS stock_history_product_code_idx  ON public.stock_history (product_code);
CREATE INDEX IF NOT EXISTS stock_history_supplier_idx      ON public.stock_history (supplier_name);
CREATE INDEX IF NOT EXISTS stock_history_supplier_code_idx ON public.stock_history (supplier_code);

-- ── 5. RLS 비활성 (서비스 롤 접근) ─────────────────────────────
ALTER TABLE public.stock_history DISABLE ROW LEVEL SECURITY;

-- ── 6. Supabase 스키마 캐시 리로드 ─────────────────────────────
-- PostgREST는 스키마를 캐싱하므로 새 컬럼 추가 후 알림 필요.
NOTIFY pgrst, 'reload schema';
