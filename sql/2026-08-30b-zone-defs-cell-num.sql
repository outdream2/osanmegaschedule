-- 2026-08-30 · 사용자 지시 · zone_defs 스키마 단순화
-- 새 구조 · 4개 컬럼만 · 구역·카테고리·상세카테고리·셀넘버
--   · num · row 고유 ID (SERIAL · 편집·삭제 안전)
--   · cell_id · 매장구역도 셀 위치 (TEXT · "1A", "1B", "22", "35" 등 · 재배치 가능)
--   · label · 구역명
--   · category · 카테고리
--   · detailed_category · 상세카테고리 (이전 description · sub 통합)
--   · section · 지도 섹션 (aisle/top_wall/bottom_wall/wing/event)
-- 이전 sub_a/sub_b/sub_c · 제거 (각 서브존이 별도 row 로 승격)
-- 실행 · Supabase SQL Editor · 순서 그대로

BEGIN;

-- ── Step 1 · cell_id · detailed_category · assigned_staff_ids 컬럼 추가 ─────
ALTER TABLE zone_defs
  ADD COLUMN IF NOT EXISTS cell_id TEXT,
  ADD COLUMN IF NOT EXISTS detailed_category TEXT,
  ADD COLUMN IF NOT EXISTS assigned_staff_ids INT[] DEFAULT ARRAY[]::INT[];

COMMENT ON COLUMN zone_defs.assigned_staff_ids IS '이 셀에 배정된 담당자 employees.id 배열 (여러 명 가능 · 빈 배열=미배정)';

-- ── Step 2 · 기존 sub 없는 row · cell_id = num · detailed_category = description ─
UPDATE zone_defs
   SET cell_id = num::TEXT,
       detailed_category = description
 WHERE cell_id IS NULL
   AND sub_a IS NULL
   AND sub_b IS NULL;

-- ── Step 3 · aisle 서브 row 분리 (sub_a → A row · sub_b → B row · sub_c → C row) ─
--   · 원본 row 은 A 로 변환 · category=sub_a · detailed=description_a · cell_id=numA
--   · sub_b/sub_c 는 신규 row 로 INSERT
--   · num 은 auto increment 아니므로 · max+1 계산 필요
DO $$
DECLARE
  r RECORD;
  next_num INT;
BEGIN
  SELECT COALESCE(MAX(num), 0) INTO next_num FROM zone_defs;

  FOR r IN
    SELECT * FROM zone_defs
    WHERE (sub_a IS NOT NULL OR sub_b IS NOT NULL OR sub_c IS NOT NULL)
      AND cell_id IS NULL
  LOOP
    -- A 서브 · 원본 row 를 A 로 변환
    IF r.sub_a IS NOT NULL THEN
      UPDATE zone_defs
         SET cell_id = r.num::TEXT || 'A',
             category = r.sub_a,
             detailed_category = r.description_a,
             label = COALESCE(r.label, '') || ' A'
       WHERE num = r.num;
    ELSE
      -- sub_a 없으면 원본 유지 · cell_id = num
      UPDATE zone_defs
         SET cell_id = r.num::TEXT,
             detailed_category = r.description
       WHERE num = r.num;
    END IF;

    -- B 서브 · 신규 row
    IF r.sub_b IS NOT NULL THEN
      next_num := next_num + 1;
      INSERT INTO zone_defs (num, cell_id, label, category, detailed_category, section)
      VALUES (
        next_num,
        r.num::TEXT || 'B',
        COALESCE(r.label, '') || ' B',
        r.sub_b,
        r.description_b,
        r.section
      );
    END IF;

    -- C 서브 · 신규 row
    IF r.sub_c IS NOT NULL THEN
      next_num := next_num + 1;
      INSERT INTO zone_defs (num, cell_id, label, category, detailed_category, section)
      VALUES (
        next_num,
        r.num::TEXT || 'C',
        COALESCE(r.label, '') || ' C',
        r.sub_c,
        r.description_c,
        r.section
      );
    END IF;
  END LOOP;
END $$;

-- ── Step 4 · cell_id UNIQUE 인덱스 · 셀 위치 중복 방지 ─────
CREATE UNIQUE INDEX IF NOT EXISTS zone_defs_cell_id_uk
  ON zone_defs (cell_id)
  WHERE cell_id IS NOT NULL;

-- ── Step 5 · 미사용 컬럼 제거 (sub_a/b/c · description·A/B/C) ─────
ALTER TABLE zone_defs
  DROP COLUMN IF EXISTS sub_a,
  DROP COLUMN IF EXISTS sub_b,
  DROP COLUMN IF EXISTS sub_c,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS description_a,
  DROP COLUMN IF EXISTS description_b,
  DROP COLUMN IF EXISTS description_c;

-- ── 확인 ─────
SELECT num, cell_id, label, category, detailed_category, section
FROM zone_defs
ORDER BY section, cell_id;

COMMIT;
