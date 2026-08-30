-- 2026-08-30h · zone_defs 정합성 정리 · Option 1 (사용자 승인)
--   1. 전체 백업 (zone_defs_bak_2026_08_30h)
--   2. Set B 껍데기 rows 삭제 (zone/category 비어있고 location 만 있는 sync 결과물)
--   3. location UNIQUE 제약 해제 (cell_id 가 자연 키 · location 은 참조용)
--   4. assignee JSONB 컬럼 신규 (담당자 · AssigneePicker 배지)
--   5. zone 라벨 공백 정규화 ("진열대 8 B" → "진열대 8B")
--   6. cell=30 "1A" → "진열대 1A" 복구
--   7. 결과 확인

BEGIN;

-- 1. 백업 (파괴 작업 전 필수 · 사용자 원칙)
CREATE TABLE IF NOT EXISTS zone_defs_bak_2026_08_30h AS
SELECT * FROM zone_defs;

-- 2. Set B 껍데기 rows 삭제 (49개 예상 · cell_id >= 143)
DELETE FROM zone_defs
WHERE (zone IS NULL OR zone = '')
  AND (category IS NULL OR category = '')
  AND location IS NOT NULL;

-- 3. location UNIQUE 제약 해제
ALTER TABLE zone_defs DROP CONSTRAINT IF EXISTS zone_defs_location_key;

-- 4. assignee 컬럼 신규 (JSONB 배열 · 복수 담당자 · 배지 UI 매칭)
ALTER TABLE zone_defs ADD COLUMN IF NOT EXISTS assignee JSONB DEFAULT '[]'::jsonb;

-- 5. zone 라벨 정규화 · "진열대 8 B" → "진열대 8B"
UPDATE zone_defs
SET zone = REGEXP_REPLACE(zone, '진열대\s+(\d+)\s+([ABC])', '진열대 \1\2')
WHERE zone ~ '진열대\s+\d+\s+[ABC]';

-- 6. cell=30 "1A" → "진열대 1A" (원본 라벨 복구)
UPDATE zone_defs SET zone = '진열대 1A' WHERE cell_id = 30 AND zone = '1A';

-- 7. 결과 요약 · 각 라벨 카테고리 확인
SELECT
  cell_id,
  zone,
  category,
  LEFT(COALESCE(detailed_category, ''), 40) AS detail,
  assignee
FROM zone_defs
ORDER BY cell_id
LIMIT 100;

COMMIT;

-- 롤백 방법:
-- BEGIN;
-- TRUNCATE zone_defs;
-- INSERT INTO zone_defs SELECT * FROM zone_defs_bak_2026_08_30h;
-- COMMIT;
