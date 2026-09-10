-- 20260910_seasonal_events.sql
-- #52 · #54 · 계절·이벤트 상품·카테고리 마스터 테이블
-- 2026-09-10 · 사용자 지시 · 정합성 최우선 · 정규 테이블 (FK · UNIQUE · CHECK)
--   · 상품 or 카테고리 · 둘 중 하나만 (XOR)
--
-- ═════════════════════════════════════════════════════════
-- 1. seasonal_products · 계절별 상품·카테고리
-- ═════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seasonal_products (
  id SERIAL PRIMARY KEY,
  season TEXT NOT NULL CHECK (season IN ('spring', 'summer', 'fall', 'winter')),
  -- 2026-09-10 · 사용자 지시 · 상품 or 카테고리 · XOR (둘 중 하나만)
  product_code TEXT REFERENCES products(product_code) ON DELETE CASCADE ON UPDATE CASCADE,
  category TEXT,                                      -- 카테고리 기반 매핑 (products.category)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  -- XOR 제약 · 상품 OR 카테고리 · 둘 다 NULL·둘 다 NOT NULL 금지
  CONSTRAINT seasonal_products_xor
    CHECK (
      (product_code IS NOT NULL AND category IS NULL)
      OR (product_code IS NULL AND category IS NOT NULL AND length(trim(category)) > 0)
    ),
  -- 중복 방지 · 각 season + (product_code or category)
  CONSTRAINT seasonal_products_unique
    UNIQUE (season, product_code, category)
);

CREATE INDEX IF NOT EXISTS idx_seasonal_products_season
  ON seasonal_products (season);
CREATE INDEX IF NOT EXISTS idx_seasonal_products_product
  ON seasonal_products (product_code) WHERE product_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_seasonal_products_category
  ON seasonal_products (category) WHERE category IS NOT NULL;

-- ═════════════════════════════════════════════════════════
-- 2. events · 이벤트 마스터 (명절·공휴일·수능·개학·매장 특화)
-- ═════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,                                 -- 예: "추석 2026" · "수능 2026"
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  type TEXT NOT NULL DEFAULT 'custom'
    CHECK (type IN ('public_holiday', 'traditional_holiday', 'school', 'custom', 'seasonal')),
  auto_detected BOOLEAN NOT NULL DEFAULT false,       -- true = API 자동 감지 · false = 수동
  source TEXT,                                        -- API 소스 (예: 'data.go.kr')
  note TEXT,                                          -- 관리자 메모
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS idx_events_dates
  ON events (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_events_type ON events (type);

-- ═════════════════════════════════════════════════════════
-- 3. event_products · 이벤트-상품·카테고리 매핑 (다대다)
-- ═════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS event_products (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- 2026-09-10 · 사용자 지시 · 상품 or 카테고리 · XOR
  product_code TEXT REFERENCES products(product_code) ON DELETE CASCADE ON UPDATE CASCADE,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT event_products_xor
    CHECK (
      (product_code IS NOT NULL AND category IS NULL)
      OR (product_code IS NULL AND category IS NOT NULL AND length(trim(category)) > 0)
    ),
  CONSTRAINT event_products_unique
    UNIQUE (event_id, product_code, category)
);

CREATE INDEX IF NOT EXISTS idx_event_products_event
  ON event_products (event_id);
CREATE INDEX IF NOT EXISTS idx_event_products_product
  ON event_products (product_code) WHERE product_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_products_category
  ON event_products (category) WHERE category IS NOT NULL;

-- ═════════════════════════════════════════════════════════
-- 검증
-- ═════════════════════════════════════════════════════════
-- SELECT tablename, indexname FROM pg_indexes
-- WHERE tablename IN ('seasonal_products', 'events', 'event_products')
-- ORDER BY tablename, indexname;
--
-- SELECT conname, contype FROM pg_constraint
-- WHERE conrelid::regclass::text IN ('seasonal_products', 'events', 'event_products');
