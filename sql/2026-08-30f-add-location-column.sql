-- 2026-08-30 · zone_defs · location 추가 + zone 을 4가지 존으로 변경
-- 사용자 지시:
--   · location · products.location 매칭 short 코드 (1A · 22 · 35 등)
--   · zone · 4가지 존 (중앙상비약존 · 상담존 · 뷰티식품존 · 카운터테마존)
-- DROP 없음 · ALTER + UPDATE 만 · 안전

BEGIN;

-- Step 1 · location 컬럼 추가 (없으면)
ALTER TABLE zone_defs
  ADD COLUMN IF NOT EXISTS location TEXT;

COMMENT ON COLUMN zone_defs.location IS 'products.location 매칭 · short 코드 (예: 1A, 22, 35)';

-- Step 2 · location 채우기 · zone 에서 파싱
UPDATE zone_defs SET location = SUBSTRING(zone FROM '진열대\s+(\S+)$')
  WHERE zone LIKE '진열대 %' AND location IS NULL;

UPDATE zone_defs SET location = SUBSTRING(zone FROM '벽면\s+(\d+)$')
  WHERE zone LIKE '벽면 %' AND location IS NULL;

UPDATE zone_defs SET location = SUBSTRING(zone FROM '카운터테마\s+(\d+)$')
  WHERE zone LIKE '카운터테마 %' AND location IS NULL;

-- wing 라벨 · 라벨명 → 번호 매핑
UPDATE zone_defs SET location = '36' WHERE zone = '프로모션' AND location IS NULL;
UPDATE zone_defs SET location = '37' WHERE zone = '기능성화장품' AND location IS NULL;
UPDATE zone_defs SET location = '38' WHERE zone = '조제실' AND location IS NULL;
UPDATE zone_defs SET location = '39' WHERE zone = '화장실' AND location IS NULL;
UPDATE zone_defs SET location = '40' WHERE zone = '계산대' AND location IS NULL;
UPDATE zone_defs SET location = '41' WHERE zone = '정수기' AND location IS NULL;
UPDATE zone_defs SET location = '42' WHERE zone = '이벤트존' AND location IS NULL;

-- Step 3 · zone 컬럼을 4가지 존으로 재분류 (매장편집도 classifyZone 규칙)
--   중앙상비약존: 진열대 (1A~8B, 22)
--   상담존: 9~21, 23~27
--   뷰티식품존: 28~40 (wing 조제실·계산대까지)
--   카운터테마존: 41~46

UPDATE zone_defs SET zone = '중앙상비약존'
  WHERE location IN ('1A','1B','2A','2B','3A','3B','4A','4B','5A','5B','6A','6B','7A','7B','8A','8B','22');

UPDATE zone_defs SET zone = '상담존'
  WHERE location ~ '^([0-9]+)$'
    AND (
      (location::INT BETWEEN 9 AND 21) OR
      (location::INT BETWEEN 23 AND 27)
    );

UPDATE zone_defs SET zone = '뷰티식품존'
  WHERE location ~ '^([0-9]+)$'
    AND location::INT BETWEEN 28 AND 40;

UPDATE zone_defs SET zone = '카운터테마존'
  WHERE location ~ '^([0-9]+)$'
    AND location::INT BETWEEN 41 AND 46;

-- Step 4 · 확인
SELECT cell_id, location, zone, category,
       LEFT(COALESCE(detailed_category, ''), 40) AS detail
FROM zone_defs
ORDER BY cell_id;

-- 존별 카운트
SELECT zone, COUNT(*) AS cnt
FROM zone_defs
GROUP BY zone
ORDER BY zone;

-- location NULL 있는지
SELECT COUNT(*) FILTER (WHERE location IS NULL) AS null_location,
       COUNT(*) FILTER (WHERE zone IS NULL) AS null_zone
FROM zone_defs;

COMMIT;
