-- 2026-08-30 · zone_defs · products.location DISTINCT 만 등록 (분류·카테고리는 앱에서 처리)

ALTER TABLE zone_defs ADD COLUMN IF NOT EXISTS location TEXT UNIQUE;
ALTER TABLE zone_defs ALTER COLUMN zone DROP NOT NULL;
ALTER TABLE zone_defs ALTER COLUMN category DROP NOT NULL;

INSERT INTO zone_defs (location, cell_id)
SELECT DISTINCT TRIM(loc),
  (SELECT COALESCE(MAX(cell_id), 0) FROM zone_defs) + ROW_NUMBER() OVER (ORDER BY TRIM(loc))
FROM products, LATERAL UNNEST(STRING_TO_ARRAY(products.location, '/')) AS loc
WHERE products.location IS NOT NULL AND TRIM(loc) != ''
ON CONFLICT (location) DO NOTHING;

SELECT COUNT(*) AS total FROM zone_defs;
