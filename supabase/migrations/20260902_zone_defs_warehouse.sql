-- ═══════════════════════════════════════════════════════════════════
-- 2026-09-02 · #74 · zone_defs · warehouse 컬럼 신규 (사용자 지시)
--   · 배경 · 현재 · src/lib/warehouseZoneMap.ts · 하드코딩 매핑
--     · 창고1: 24·25·26·27·7B·8A
--     · 창고2: 28·29·30·31·32·33·34·35·36·37·38·39·40
--     · 매장: 나머지 (1A~7A · 9~23 등)
--   · 이후 · zone_defs.warehouse 컬럼 정식 도입 · DB 기반 매핑
--   · 실행 · Supabase SQL Editor · idempotent
-- ═══════════════════════════════════════════════════════════════════

-- 1. warehouse 컬럼 추가 · enum-like text · nullable (미분류 zone 은 null)
ALTER TABLE zone_defs
  ADD COLUMN IF NOT EXISTS warehouse TEXT NULL
    CHECK (warehouse IS NULL OR warehouse IN ('창고1', '창고2'));

COMMENT ON COLUMN zone_defs.warehouse IS
  '이 구역이 소속된 창고 · 창고1/창고2 (사용자 지시 · 2026-09-02 · 창고1=24·25·26·27·7B·8A · 나머지 모두 창고2)';

-- 2. 초기 backfill (사용자 지시 · 2026-09-02)
--    · 창고1: 24 · 25 · 26 · 27 · 7B · 8A (6개)
--    · 창고2: 나머지 모두
UPDATE zone_defs SET warehouse = '창고1'
 WHERE UPPER(TRIM(location)) IN ('24', '25', '26', '27', '7B', '8A');

UPDATE zone_defs SET warehouse = '창고2'
 WHERE (warehouse IS NULL OR warehouse != '창고1')
   AND location IS NOT NULL AND TRIM(location) != '';

-- 3. 조회용 index (자주 사용 · warehouse별 필터)
CREATE INDEX IF NOT EXISTS idx_zone_defs_warehouse
  ON zone_defs (warehouse) WHERE warehouse IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 검증 (실행 후)
--   SELECT location, zone, warehouse FROM zone_defs
--    WHERE warehouse IS NOT NULL
--    ORDER BY warehouse, location;
--
--   SELECT warehouse, COUNT(*) FROM zone_defs GROUP BY warehouse;
-- ═══════════════════════════════════════════════════════════════════
