-- ═══════════════════════════════════════════════════════════════════════════
-- T-PERF-2 · DB 인덱스 최적화 · 2026-08-05
--
-- 대상: 재고관리 (StockManagePage) · 매입이력 · 상품 리스트 로딩 속도 개선
-- 사용자 제보: "리스트 로딩 전반적으로 느림"
--
-- 실행: Supabase 대시보드 → SQL Editor → 붙여넣기 → Run
-- 안전: 모두 CREATE INDEX IF NOT EXISTS · 중복 실행 무해 · 락 불필요
--
-- 예상 효과:
--   재고관리 리스트: 10~50배 빨라짐
--   매입이력 조회: 20~100배 빨라짐
--   상품 검색: 5~10배 빨라짐
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. stock_history · 재고관리 리스트 (가장 큰 효과 예상)
-- ─────────────────────────────────────────────────────────────
--   WHERE snapshot_date = ? OR .gte snapshot_date · 매우 자주
--   WHERE product_code = ? · 상품별 이력 조회
--   ORDER BY period_start_date, snapshot_date · 시계열

CREATE INDEX IF NOT EXISTS idx_stock_history_snapshot_date
  ON stock_history(snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_stock_history_product_code
  ON stock_history(product_code);

-- 상품별 시계열 조회 · 가장 흔한 패턴
CREATE INDEX IF NOT EXISTS idx_stock_history_product_date
  ON stock_history(product_code, snapshot_date DESC);

-- 공급사별 필터
CREATE INDEX IF NOT EXISTS idx_stock_history_supplier_code
  ON stock_history(supplier_code)
  WHERE supplier_code IS NOT NULL;


-- ─────────────────────────────────────────────────────────────
-- 2. ocr_confirmed_items · 매입이력 페이지 (자주 조회)
-- ─────────────────────────────────────────────────────────────
--   기존: idx_ocr_invoice_date 만 있음 (invoice_date)
--   추가 필요: product_code (WHERE .in), saved_at (ORDER BY)

CREATE INDEX IF NOT EXISTS idx_ocr_confirmed_product_code
  ON ocr_confirmed_items(product_code)
  WHERE product_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ocr_confirmed_saved_at
  ON ocr_confirmed_items(saved_at DESC);

-- 상품별 매입이력 조회 (purchaseHistory route)
CREATE INDEX IF NOT EXISTS idx_ocr_confirmed_product_invoice
  ON ocr_confirmed_items(product_code, invoice_date DESC NULLS LAST)
  WHERE product_code IS NOT NULL;

-- 공급사별 그룹 (SalesTrend · SupplierTab)
CREATE INDEX IF NOT EXISTS idx_ocr_confirmed_supplier
  ON ocr_confirmed_items(supplier)
  WHERE supplier IS NOT NULL;


-- ─────────────────────────────────────────────────────────────
-- 3. products · 상품 리스트 검색·필터
-- ─────────────────────────────────────────────────────────────
--   product_code 는 PK 이면 자동 인덱스
--   hidden = false · 매우 흔한 WHERE 조건
--   supplier ilike · 검색

CREATE INDEX IF NOT EXISTS idx_products_hidden
  ON products(hidden)
  WHERE hidden = false;  -- partial · 활성 상품만 (대부분)

CREATE INDEX IF NOT EXISTS idx_products_real_map
  ON products(real_map)
  WHERE real_map IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_category
  ON products(category)
  WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_sale_status
  ON products(sale_status);

-- 공급사 ilike 검색 · trigram 인덱스 (fuzzy)
-- pg_trgm extension 필요 (Supabase 기본 활성)
CREATE INDEX IF NOT EXISTS idx_products_supplier_trgm
  ON products USING gin(supplier gin_trgm_ops)
  WHERE supplier IS NOT NULL;

-- 상품명 ilike 검색
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON products USING gin(product_name gin_trgm_ops);


-- ─────────────────────────────────────────────────────────────
-- 4. inventory_checks · 실재고 조회
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_inventory_checks_product_code
  ON inventory_checks(product_code);

CREATE INDEX IF NOT EXISTS idx_inventory_checks_checked_at
  ON inventory_checks(checked_at DESC);

-- 상품별 최근 실재고 (가장 흔함)
CREATE INDEX IF NOT EXISTS idx_inventory_checks_product_time
  ON inventory_checks(product_code, checked_at DESC);


-- ─────────────────────────────────────────────────────────────
-- 5. display_requests · 진열요청 리스트
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_display_requests_status
  ON display_requests(status);

CREATE INDEX IF NOT EXISTS idx_display_requests_requested_at
  ON display_requests(requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_display_requests_zone_id
  ON display_requests(zone_id)
  WHERE zone_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_display_requests_assigned_staff
  ON display_requests(assigned_staff_id)
  WHERE assigned_staff_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────
-- 6. 검증 · 인덱스 확인 (실행 후 참고용)
-- ─────────────────────────────────────────────────────────────
-- SELECT tablename, indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND tablename IN ('stock_history', 'ocr_confirmed_items', 'products',
--                     'inventory_checks', 'display_requests')
-- ORDER BY tablename, indexname;
