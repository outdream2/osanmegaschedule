-- 2026-08-30 · products.location → zone_defs.location 자동 동기화
-- 사용자 지시:
--   · products.location DISTINCT 값을 zone_defs 에 자동 등록
--   · 새 location 추가되면 zone_defs 에 자동 삽입 (트리거)
--   · 각 zone_defs row · category · detailed_category 는 매장편집으로 입력
-- DROP 없음 · ADD COLUMN + INSERT + TRIGGER · 안전

BEGIN;

-- Step 1 · location 컬럼 확인·추가 (없으면)
ALTER TABLE zone_defs
  ADD COLUMN IF NOT EXISTS location TEXT;

-- 유일 인덱스 · 중복 방지 (이미 있으면 skip)
CREATE UNIQUE INDEX IF NOT EXISTS zone_defs_location_uk
  ON zone_defs (location)
  WHERE location IS NOT NULL;

COMMENT ON COLUMN zone_defs.location IS 'products.location 매칭 · UNIQUE · 자동 동기화 대상';

-- Step 2 · 기존 zone → location 파싱 채움 (없는 것만)
UPDATE zone_defs SET location = SUBSTRING(zone FROM '진열대\s+(\S+)$')
  WHERE zone LIKE '진열대 %' AND location IS NULL;
UPDATE zone_defs SET location = SUBSTRING(zone FROM '벽면\s+(\d+)$')
  WHERE zone LIKE '벽면 %' AND location IS NULL;
UPDATE zone_defs SET location = SUBSTRING(zone FROM '카운터테마\s+(\d+)$')
  WHERE zone LIKE '카운터테마 %' AND location IS NULL;
UPDATE zone_defs SET location = '36' WHERE zone = '프로모션' AND location IS NULL;
UPDATE zone_defs SET location = '37' WHERE zone = '기능성화장품' AND location IS NULL;
UPDATE zone_defs SET location = '38' WHERE zone = '조제실' AND location IS NULL;
UPDATE zone_defs SET location = '39' WHERE zone = '화장실' AND location IS NULL;
UPDATE zone_defs SET location = '40' WHERE zone = '계산대' AND location IS NULL;
UPDATE zone_defs SET location = '41' WHERE zone = '정수기' AND location IS NULL;
UPDATE zone_defs SET location = '42' WHERE zone = '이벤트존' AND location IS NULL;

-- Step 3 · products.location DISTINCT → zone_defs 자동 등록 (자동 분류)
--   · 분류 규칙 (수정 가능 · 언제든 매장편집도에서 override):
--     1A~8B, 22    → 중앙상비약존
--     9~21, 23~27  → 상담존
--     28~40        → 뷰티식품존
--     41~46        → 카운터테마존
--     그 외         → (미분류)
INSERT INTO zone_defs (location, zone, category, cell_id)
SELECT DISTINCT
  TRIM(loc) AS location,
  CASE
    -- aisle · 1A~8B (pair) + 22 · 중앙상비약존
    WHEN TRIM(loc) ~ '^([1-8])[AB]$' THEN '중앙상비약존'
    WHEN TRIM(loc) = '22' THEN '중앙상비약존'
    -- 숫자만 · 범위별 분류
    WHEN TRIM(loc) ~ '^[0-9]+$' THEN
      CASE
        WHEN TRIM(loc)::INT BETWEEN 9  AND 21 THEN '상담존'
        WHEN TRIM(loc)::INT BETWEEN 23 AND 27 THEN '상담존'
        WHEN TRIM(loc)::INT BETWEEN 28 AND 40 THEN '뷰티식품존'
        WHEN TRIM(loc)::INT BETWEEN 41 AND 46 THEN '카운터테마존'
        ELSE '(미분류)'
      END
    ELSE '(미분류)'
  END AS zone,
  '(미입력)' AS category,
  (SELECT COALESCE(MAX(cell_id), 0) + ROW_NUMBER() OVER (ORDER BY TRIM(loc)) FROM zone_defs)::INT AS cell_id
FROM products,
     LATERAL UNNEST(STRING_TO_ARRAY(products.location, '/')) AS loc
WHERE products.location IS NOT NULL
  AND products.location != ''
  AND TRIM(loc) != ''
  AND NOT EXISTS (
    SELECT 1 FROM zone_defs z WHERE z.location = TRIM(loc)
  );

-- Step 4 · 자동 동기화 트리거 (products INSERT/UPDATE 시 · location 새로 나오면 zone_defs 삽입)
CREATE OR REPLACE FUNCTION sync_products_location_to_zone_defs()
RETURNS TRIGGER AS $$
DECLARE
  loc TEXT;
  parts TEXT[];
  next_cell INT;
  auto_zone TEXT;
BEGIN
  IF NEW.location IS NULL OR NEW.location = '' THEN
    RETURN NEW;
  END IF;

  parts := STRING_TO_ARRAY(NEW.location, '/');
  SELECT COALESCE(MAX(cell_id), 0) INTO next_cell FROM zone_defs;

  FOREACH loc IN ARRAY parts
  LOOP
    loc := TRIM(loc);
    IF loc = '' THEN CONTINUE; END IF;

    -- 자동 분류 (Step 3 규칙과 동일)
    auto_zone := CASE
      WHEN loc ~ '^([1-8])[AB]$' THEN '중앙상비약존'
      WHEN loc = '22' THEN '중앙상비약존'
      WHEN loc ~ '^[0-9]+$' THEN
        CASE
          WHEN loc::INT BETWEEN 9  AND 21 THEN '상담존'
          WHEN loc::INT BETWEEN 23 AND 27 THEN '상담존'
          WHEN loc::INT BETWEEN 28 AND 40 THEN '뷰티식품존'
          WHEN loc::INT BETWEEN 41 AND 46 THEN '카운터테마존'
          ELSE '(미분류)'
        END
      ELSE '(미분류)'
    END;

    -- zone_defs 에 없으면 자동 INSERT · 이미 있으면 skip (사용자 편집값 보존)
    INSERT INTO zone_defs (location, zone, category, cell_id)
    VALUES (loc, auto_zone, '(미입력)', next_cell + 1)
    ON CONFLICT (location) WHERE location IS NOT NULL DO NOTHING;

    IF FOUND THEN next_cell := next_cell + 1; END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_products_location ON products;
CREATE TRIGGER trg_sync_products_location
  AFTER INSERT OR UPDATE OF location ON products
  FOR EACH ROW
  EXECUTE FUNCTION sync_products_location_to_zone_defs();

-- Step 5 · 확인
SELECT COUNT(*) AS zone_defs_total,
       COUNT(location) AS with_location,
       COUNT(DISTINCT location) AS unique_locations
FROM zone_defs;

-- products.location 대비 · zone_defs 매칭 확인
SELECT COUNT(DISTINCT prod_loc) AS products_unique_locations
FROM (
  SELECT TRIM(loc) AS prod_loc
  FROM products, LATERAL UNNEST(STRING_TO_ARRAY(location, '/')) AS loc
  WHERE location IS NOT NULL AND location != '' AND TRIM(loc) != ''
) sub;

-- 새로 추가된 (미분류) row 확인
SELECT cell_id, location, zone, category
FROM zone_defs
WHERE zone = '(미분류)' OR category = '(미입력)'
ORDER BY cell_id;

COMMIT;
