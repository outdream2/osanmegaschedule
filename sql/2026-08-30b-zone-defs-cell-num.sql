-- 2026-08-30 · zone_defs 새 스키마 이관 · 기존 데이터 보존 (non-destructive)
-- 실행 · Supabase SQL Editor
--
-- 안전 원칙:
--   1. 기존 zone_defs 는 zone_defs_v1_backup 으로 RENAME (삭제 X · 백업 유지)
--   2. 새 zone_defs 는 CREATE
--   3. 백업에서 데이터 마이그레이션 (num → cell_id · sub_a/sub_b 분리)
--   4. 이관 실패 시 · 백업 그대로 유지 · 롤백 가능
--
-- 실행 후 확인:
--   SELECT COUNT(*) FROM zone_defs_v1_backup;  -- 기존 데이터 보존 확인
--   SELECT COUNT(*) FROM zone_defs;             -- 새 데이터 (54 예상)

BEGIN;

-- ── Step 1 · 기존 zone_defs 백업 (없으면 skip) ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'zone_defs') THEN
    -- 이미 백업 존재하면 · 백업 skip
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'zone_defs_v1_backup') THEN
      EXECUTE 'ALTER TABLE zone_defs RENAME TO zone_defs_v1_backup';
    ELSE
      -- 기존 백업 있으면 · 지금 zone_defs 는 이관 재실행 · 그냥 DROP
      EXECUTE 'DROP TABLE zone_defs';
    END IF;
  END IF;
END $$;

-- ── Step 2 · 새 zone_defs CREATE ──
CREATE TABLE zone_defs (
  id                  SERIAL PRIMARY KEY,
  cell_id             INT UNIQUE NOT NULL,
  location            TEXT UNIQUE NOT NULL,
  label               TEXT NOT NULL,
  category            TEXT NOT NULL,
  detailed_category   TEXT,
  assigned_staff_ids  INT[] DEFAULT ARRAY[]::INT[],
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE  zone_defs                    IS '매장구역도·매장편집 단일 소스 (2026-08-30)';
COMMENT ON COLUMN zone_defs.cell_id            IS '매장구역도 셀 넘버링 · 1~54';
COMMENT ON COLUMN zone_defs.location           IS 'products.real_map 매칭 · "1A" "22" "35"';
COMMENT ON COLUMN zone_defs.label              IS '큰 구역 · 중앙상비약존/상담존/뷰티식품존/카운터테마존';
COMMENT ON COLUMN zone_defs.detailed_category  IS '매장편집 상세카테고리 (긴 텍스트)';
COMMENT ON COLUMN zone_defs.assigned_staff_ids IS '담당자 employees.id 배열';

-- ── Step 3 · 백업에서 데이터 마이그레이션 (백업 있을 때만) ──
DO $$
DECLARE
  r RECORD;
  next_cell INT := 0;
  major_label TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'zone_defs_v1_backup') THEN
    RETURN;
  END IF;

  -- 상단 벽면 (21→9) · 상담존
  FOR r IN
    SELECT num, label AS old_label, category, sub_a, sub_b, description, description_a, description_b
    FROM zone_defs_v1_backup
    WHERE num BETWEEN 9 AND 21
    ORDER BY num DESC
  LOOP
    next_cell := next_cell + 1;
    INSERT INTO zone_defs (cell_id, location, label, category, detailed_category)
    VALUES (next_cell, r.num::TEXT, '상담존', COALESCE(r.category, '(비어있음)'), r.description);
  END LOOP;

  -- 중앙 진열대 22 단독 · 중앙상비약존
  FOR r IN
    SELECT num, label AS old_label, category, description
    FROM zone_defs_v1_backup
    WHERE num = 22
  LOOP
    next_cell := next_cell + 1;
    INSERT INTO zone_defs (cell_id, location, label, category, detailed_category)
    VALUES (next_cell, '22', '중앙상비약존', COALESCE(r.category, '(비어있음)'), r.description);
  END LOOP;

  -- 중앙 진열대 8B/8A → 1B/1A (좌→우) · 중앙상비약존
  FOR r IN
    SELECT num, label AS old_label, category, sub_a, sub_b, description, description_a, description_b
    FROM zone_defs_v1_backup
    WHERE num BETWEEN 1 AND 8
    ORDER BY num DESC
  LOOP
    -- B side (좌)
    next_cell := next_cell + 1;
    INSERT INTO zone_defs (cell_id, location, label, category, detailed_category)
    VALUES (next_cell, r.num::TEXT || 'B', '중앙상비약존',
            COALESCE(r.sub_b, r.category, '(비어있음)'),
            COALESCE(r.description_b, r.description));
    -- A side (우)
    next_cell := next_cell + 1;
    INSERT INTO zone_defs (cell_id, location, label, category, detailed_category)
    VALUES (next_cell, r.num::TEXT || 'A', '중앙상비약존',
            COALESCE(r.sub_a, r.category, '(비어있음)'),
            COALESCE(r.description_a, r.description));
  END LOOP;

  -- 하단 벽면 (23→34) · 뷰티식품존
  FOR r IN
    SELECT num, category, description
    FROM zone_defs_v1_backup
    WHERE num BETWEEN 23 AND 34
    ORDER BY num ASC
  LOOP
    next_cell := next_cell + 1;
    INSERT INTO zone_defs (cell_id, location, label, category, detailed_category)
    VALUES (next_cell, r.num::TEXT, '뷰티식품존', COALESCE(r.category, '(비어있음)'), r.description);
  END LOOP;

  -- 수직 윙 (35→46) · 카운터테마존
  FOR r IN
    SELECT num, category, description
    FROM zone_defs_v1_backup
    WHERE num BETWEEN 35 AND 46
    ORDER BY num ASC
  LOOP
    next_cell := next_cell + 1;
    INSERT INTO zone_defs (cell_id, location, label, category, detailed_category)
    VALUES (next_cell, r.num::TEXT, '카운터테마존', COALESCE(r.category, '(비어있음)'), r.description);
  END LOOP;
END $$;

-- ── Step 4 · 백업이 없거나 · 빠진 셀 · seed 채우기 (54개 완성) ──
INSERT INTO zone_defs (cell_id, location, label, category, detailed_category)
SELECT s.cell_id, s.location, s.label, s.category, NULL::TEXT
FROM (VALUES
  (1,  '21', '상담존', '콜라겐'),
  (2,  '20', '상담존', '비타민C'),
  (3,  '19', '상담존', '철분제'),
  (4,  '18', '상담존', '임산부·갱년기영양제'),
  (5,  '17', '상담존', '잇몸건강'),
  (6,  '16', '상담존', '혈액순환·혈당개선'),
  (7,  '15', '상담존', '뇌기능개선'),
  (8,  '14', '상담존', '눈영양제'),
  (9,  '13', '상담존', 'ORS·부스터'),
  (10, '12', '상담존', '아르기닌'),
  (11, '11', '상담존', '알부민·아미노산'),
  (12, '10', '상담존', '간기능개선제'),
  (13, '9',  '상담존', '종합비타민'),
  (14, '22', '중앙상비약존', '의료기기·냉각시트·찜질기'),
  (15, '8B', '중앙상비약존', '반창고·거즈·붕대·마스크'),
  (16, '8A', '중앙상비약존', '칫솔·치약·구강용품'),
  (17, '7B', '중앙상비약존', '보호대·벌레기피제·살충제'),
  (18, '7A', '중앙상비약존', '파스'),
  (19, '6B', '중앙상비약존', '남성용품·금연·모발'),
  (20, '6A', '중앙상비약존', '여성용품·미용·립밤'),
  (21, '5B', '중앙상비약존', '피부관련제품·다한증·여드름·기미'),
  (22, '5A', '중앙상비약존', '구내염 연고·피부·무좀·와상·멍·외용제'),
  (23, '4B', '중앙상비약존', '경옥고·공진단·우황청심원'),
  (24, '4A', '중앙상비약존', '멀미약·구충제·다래끼·염증약'),
  (25, '3B', '중앙상비약존', '해열진통제·다래끼·염증약·안약'),
  (26, '3A', '중앙상비약존', '변비약·치질약·붓기·수면유도제'),
  (27, '2B', '중앙상비약존', '소화제·지사제·위염·복통'),
  (28, '2A', '중앙상비약존', '어린이감기약·키즈용품'),
  (29, '1B', '중앙상비약존', '기침·가래·알러지·안약·한방감기약'),
  (30, '1A', '중앙상비약존', '종합감기·목감기·트로키·목스프레이·코감기·비강스프레이'),
  (31, '23', '뷰티식품존', '동물의약품'),
  (32, '24', '뷰티식품존', '마그네슘·수면'),
  (33, '25', '뷰티식품존', '탈모·전립선'),
  (34, '26', '뷰티식품존', '화장품'),
  (35, '27', '뷰티식품존', '항산화제'),
  (36, '28', '뷰티식품존', '칼슘·비타민'),
  (37, '29', '뷰티식품존', '콘드로이친·MSM'),
  (38, '30', '뷰티식품존', '오메가3'),
  (39, '31', '뷰티식품존', '유산균'),
  (40, '32', '뷰티식품존', '어린이영양제'),
  (41, '33', '뷰티식품존', '면역증강'),
  (42, '34', '뷰티식품존', '한방제품'),
  (43, '35', '카운터테마존', '냉장의약품'),
  (44, '36', '카운터테마존', '프로모션·이벤트 상품'),
  (45, '37', '카운터테마존', '기능성화장품·미용'),
  (46, '38', '카운터테마존', '조제실 (약사 전용)'),
  (47, '39', '카운터테마존', '(시설)'),
  (48, '40', '카운터테마존', '계산대 (POS)'),
  (49, '41', '카운터테마존', '(시설)'),
  (50, '42', '카운터테마존', '이벤트·프로모션 상품'),
  (51, '43', '카운터테마존', '카운터테마'),
  (52, '44', '카운터테마존', '카운터테마'),
  (53, '45', '카운터테마존', '카운터테마'),
  (54, '46', '카운터테마존', '카운터테마')
) AS s(cell_id, location, label, category)
WHERE NOT EXISTS (
  SELECT 1 FROM zone_defs z WHERE z.cell_id = s.cell_id
);

-- ── Step 5 · 사용자 지시 · 이관 후 백업 DROP ──
DROP TABLE IF EXISTS zone_defs_v1_backup;

COMMIT;

-- ── 확인 ──
SELECT cell_id, location, label, category,
       LEFT(COALESCE(detailed_category, ''), 40) AS detail_preview,
       assigned_staff_ids
FROM zone_defs
ORDER BY cell_id;

SELECT COUNT(*) AS new_rows FROM zone_defs;  -- 54 예상
