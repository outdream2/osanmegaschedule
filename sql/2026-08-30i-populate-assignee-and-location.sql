-- 2026-08-30i · zone_defs.assignee 초기 populate + location 백필
--   1. 백업
--   2. zone_defs.location 백필 (zone 라벨 파싱)
--   3. zone_assignments.employee_name → zone_defs.assignee 이관 (매칭)

BEGIN;

-- 1. 백업 (파괴 작업 아니지만 안전 원칙)
CREATE TABLE IF NOT EXISTS zone_defs_bak_2026_08_30i AS SELECT * FROM zone_defs;

-- 2. location 백필 · zone 라벨에서 파싱
UPDATE zone_defs
SET location = CASE
  -- "진열대 1A" · "진열대 8B" → "1A" · "8B"
  WHEN zone ~ '^진열대\s+(\d+)([ABC])$' THEN REGEXP_REPLACE(zone, '^진열대\s+(\d+)([ABC])$', '\1\2')
  -- "진열대 22" · "진열대 40" → "22" · "40"
  WHEN zone ~ '^진열대\s+(\d+)$' THEN REGEXP_REPLACE(zone, '^진열대\s+(\d+)$', '\1')
  -- "벽면 21" · "벽면 9" → "21" · "9"
  WHEN zone ~ '^벽면\s+(\d+)$' THEN REGEXP_REPLACE(zone, '^벽면\s+(\d+)$', '\1')
  -- 특수 라벨
  WHEN zone = '계산대 A' THEN '40'
  WHEN zone IN ('프로모션', '기능성화장품', '조제실', '화장실', '정수기', '이벤트존') THEN zone
  ELSE zone
END
WHERE location IS NULL AND zone IS NOT NULL AND zone != '';

-- 3. zone_assignments.employee_name → zone_defs.assignee 이관
--    · zone_id "1" → location "1" or "1A" or "1B" (진열대 전체)
--    · zone_id "1A" → location "1A" 직접 매칭
--    · zone_id "40" → location "40" (계산대)
UPDATE zone_defs zd
SET assignee = jsonb_build_array(za.employee_name)
FROM zone_assignments za
WHERE za.employee_name IS NOT NULL
  AND za.employee_name != ''
  AND (
       zd.location = za.zone_id
    OR zd.location = za.zone_id || 'A'
    OR zd.location = za.zone_id || 'B'
    OR zd.location = za.zone_id || 'C'
  )
  AND (zd.assignee IS NULL OR jsonb_array_length(zd.assignee) = 0);

-- 4. 결과 확인
SELECT cell_id, location, zone, category, assignee
FROM zone_defs
WHERE assignee IS NOT NULL AND jsonb_array_length(assignee) > 0
ORDER BY cell_id;

COMMIT;
