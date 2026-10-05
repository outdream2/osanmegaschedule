-- 2026-10-04 · stock_history → ERP Inventory_Status 전환 (Phase 1)
--
-- 사용자 승인 (2026-10-04):
--   · XLSX 재고 import 폐기 → xlsx unique (snapshot_date, product_code) DROP
--   · 1:1 의미 column RENAME 6개 (데이터 보존)
--   · ERP 세분화 신규 column 14개 추가 (nullable)
--   · pcode backfill (BarCode → PCode · lookup · 93.58% 성공 · 미매칭 null 유지)
--   · ERP partial unique (period_start, period_end, st_code, pcode) WHERE 둘 다 non-null
--   · 기존 53,641 rows DELETE 금지
--   · 중복 상품정보 · 금액 · period_type · product_code 유지 (Phase 2 평가)
--
-- 선행 조건:
--   · 이 SQL 실행 전에 source code 전환 PR 머지 완료
--   · 실행은 사용자가 Supabase SQL Editor 에서 수동 수행 (자동 실행 X)

BEGIN;

-- ── A. 신규 column 추가 (nullable · 안전) ─────────────────────────────
ALTER TABLE public.stock_history
  ADD COLUMN IF NOT EXISTS st_code    TEXT,
  ADD COLUMN IF NOT EXISTS pcode      TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS buy_return_stock         NUMERIC,
  ADD COLUMN IF NOT EXISTS storage_move_in          NUMERIC,
  ADD COLUMN IF NOT EXISTS storage_move_out         NUMERIC,
  ADD COLUMN IF NOT EXISTS storage_move_auto_in     NUMERIC,
  ADD COLUMN IF NOT EXISTS storage_move_auto_out    NUMERIC,
  ADD COLUMN IF NOT EXISTS sale_return_stock        NUMERIC,
  ADD COLUMN IF NOT EXISTS product_use_stock        NUMERIC,
  ADD COLUMN IF NOT EXISTS product_return_use_stock NUMERIC,
  ADD COLUMN IF NOT EXISTS product_return_bad_stock NUMERIC,
  ADD COLUMN IF NOT EXISTS plus_stock               NUMERIC,
  ADD COLUMN IF NOT EXISTS minus_stock              NUMERIC,
  ADD COLUMN IF NOT EXISTS subdivision_plus         NUMERIC,
  ADD COLUMN IF NOT EXISTS subdivision_minus        NUMERIC;

-- ── B. pcode backfill (BarCode → PCode · 93.58% 매칭 · 미매칭 null 유지) ──
UPDATE public.stock_history sh
SET pcode = p.pcode
FROM public.products p
WHERE sh.pcode IS NULL
  AND sh.product_code = p.product_code
  AND p.pcode IS NOT NULL;

-- ── C. 1:1 의미 column RENAME (6개 · 데이터 그대로 유지) ──────────────
ALTER TABLE public.stock_history RENAME COLUMN period_start_date TO period_start;
ALTER TABLE public.stock_history RENAME COLUMN snapshot_date     TO period_end;
ALTER TABLE public.stock_history RENAME COLUMN opening_stock     TO prv_stock;
ALTER TABLE public.stock_history RENAME COLUMN purchase_qty      TO buy_stock;
ALTER TABLE public.stock_history RENAME COLUMN sale_qty          TO sale_stock;
ALTER TABLE public.stock_history RENAME COLUMN disposal_qty      TO product_bad_stock;

-- ── D. XLSX unique 제거 (XLSX import 폐기) ────────────────────────────
ALTER TABLE public.stock_history
  DROP CONSTRAINT IF EXISTS stock_history_snapshot_product_uniq;

-- ── E. index 재구성 ───────────────────────────────────────────────────
DROP INDEX IF EXISTS public.stock_history_snapshot_date_idx;
DROP INDEX IF EXISTS public.stock_history_period_start_idx;
CREATE INDEX stock_history_period_end_idx
  ON public.stock_history (period_end DESC);
CREATE INDEX stock_history_period_start_idx
  ON public.stock_history (period_start DESC);
CREATE INDEX stock_history_pcode_idx
  ON public.stock_history (pcode);

-- ── F. ERP identity partial unique index ──────────────────────────────
CREATE UNIQUE INDEX stock_history_erp_identity_uniq
  ON public.stock_history (period_start, period_end, st_code, pcode)
  WHERE pcode IS NOT NULL AND st_code IS NOT NULL;

-- ── G. Column 설명 ────────────────────────────────────────────────────
COMMENT ON COLUMN public.stock_history.period_start IS
  'ERP envelope StartDate · 기존 period_start_date 를 RENAME';
COMMENT ON COLUMN public.stock_history.period_end IS
  'ERP envelope EndDate · 기존 snapshot_date 를 RENAME';
COMMENT ON COLUMN public.stock_history.prv_stock IS
  'ERP PrvStock · 기존 opening_stock 을 RENAME';
COMMENT ON COLUMN public.stock_history.buy_stock IS
  'ERP BuyStock · 기존 purchase_qty 를 RENAME';
COMMENT ON COLUMN public.stock_history.sale_stock IS
  'ERP SaleStock · 기존 sale_qty 를 RENAME';
COMMENT ON COLUMN public.stock_history.product_bad_stock IS
  'ERP ProductBadStock · 기존 disposal_qty 를 RENAME';
COMMENT ON COLUMN public.stock_history.pcode IS
  '상품 relation 공식 identity · products.pcode 참조 · BarCode(product_code)와 다른 값';
COMMENT ON COLUMN public.stock_history.st_code IS
  'ERP StCode 지점코드 (ERP 전용 · xlsx 과거 데이터는 null)';
COMMENT ON COLUMN public.stock_history.product_code IS
  'BarCode (레거시 xlsx 데이터 보존용) · ERP sync 는 저장 안 함 · Phase 2 DROP 평가';
COMMENT ON COLUMN public.stock_history.period_type IS
  'xlsx 과거 데이터 전용 (early/mid/late) · ERP sync 는 저장 안 함 · Phase 2 DROP 평가';

NOTIFY pgrst, 'reload schema';

COMMIT;
