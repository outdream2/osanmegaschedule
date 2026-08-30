-- 2026-08-30 · zone_defs · 사용자 5개 컬럼 확정
-- 순서: 구역 · 카테고리 · 상세카테고리 · 셀아이디 · 담당자
-- 실행 · Supabase SQL Editor

-- Step 1 · 기존 zone_defs 백업 (안전) · 이관 후 DROP
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'zone_defs') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'zone_defs_v1_backup') THEN
      EXECUTE 'ALTER TABLE zone_defs RENAME TO zone_defs_v1_backup';
    ELSE
      EXECUTE 'DROP TABLE zone_defs';
    END IF;
  END IF;
END $$;

-- Step 2 · 새 zone_defs · 5개 컬럼 (+ id PK · updated_at)
CREATE TABLE zone_defs (
  id                  SERIAL PRIMARY KEY,
  zone                TEXT NOT NULL,                     -- 구역 (예: "진열대 1A", "벽면 22")
  category            TEXT NOT NULL,                     -- 카테고리
  detailed_category   TEXT,                              -- 상세카테고리 (매장구역도 hover)
  cell_id             INT UNIQUE NOT NULL,               -- 셀아이디 · 매장구역도 셀 넘버 (1-54)
  assigned_staff_ids  INT[] DEFAULT ARRAY[]::INT[],     -- 담당자 (employees.id 배열)
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE  zone_defs                   IS '매장구역도·매장구역편집 단일 소스 (2026-08-30)';
COMMENT ON COLUMN zone_defs.zone              IS '구역 (예: 진열대 1A)';
COMMENT ON COLUMN zone_defs.category          IS '카테고리 (매장구역도 셀에 표시)';
COMMENT ON COLUMN zone_defs.detailed_category IS '상세카테고리 (hover 팝업)';
COMMENT ON COLUMN zone_defs.cell_id           IS '매장구역도 셀 위치 · 1-54 순차 넘버링';
COMMENT ON COLUMN zone_defs.assigned_staff_ids IS '담당자 employees.id 배열';

-- Step 3 · 백업에서 이관 (백업 있을 때만)
DO $$
DECLARE
  r RECORD;
  next_cell INT := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'zone_defs_v1_backup') THEN
    RETURN;
  END IF;

  -- 상단 벽면 (21→9)
  FOR r IN SELECT * FROM zone_defs_v1_backup WHERE num BETWEEN 9 AND 21 ORDER BY num DESC LOOP
    next_cell := next_cell + 1;
    INSERT INTO zone_defs (cell_id, zone, category, detailed_category)
    VALUES (next_cell, COALESCE(r.label, '벽면 ' || r.num), COALESCE(r.category, ''), r.description);
  END LOOP;

  -- 중앙 진열대 22
  FOR r IN SELECT * FROM zone_defs_v1_backup WHERE num = 22 LOOP
    next_cell := next_cell + 1;
    INSERT INTO zone_defs (cell_id, zone, category, detailed_category)
    VALUES (next_cell, COALESCE(r.label, '진열대 22'), COALESCE(r.category, ''), r.description);
  END LOOP;

  -- 중앙 진열대 8B/8A → 1B/1A
  FOR r IN SELECT * FROM zone_defs_v1_backup WHERE num BETWEEN 1 AND 8 ORDER BY num DESC LOOP
    next_cell := next_cell + 1;
    INSERT INTO zone_defs (cell_id, zone, category, detailed_category)
    VALUES (next_cell, '진열대 ' || r.num || 'B',
            COALESCE(r.sub_b, r.category, ''), COALESCE(r.description_b, r.description));
    next_cell := next_cell + 1;
    INSERT INTO zone_defs (cell_id, zone, category, detailed_category)
    VALUES (next_cell, '진열대 ' || r.num || 'A',
            COALESCE(r.sub_a, r.category, ''), COALESCE(r.description_a, r.description));
  END LOOP;

  -- 하단 벽면 (23→34)
  FOR r IN SELECT * FROM zone_defs_v1_backup WHERE num BETWEEN 23 AND 34 ORDER BY num ASC LOOP
    next_cell := next_cell + 1;
    INSERT INTO zone_defs (cell_id, zone, category, detailed_category)
    VALUES (next_cell, COALESCE(r.label, '벽면 ' || r.num), COALESCE(r.category, ''), r.description);
  END LOOP;

  -- 수직 윙 (35→46)
  FOR r IN SELECT * FROM zone_defs_v1_backup WHERE num BETWEEN 35 AND 46 ORDER BY num ASC LOOP
    next_cell := next_cell + 1;
    INSERT INTO zone_defs (cell_id, zone, category, detailed_category)
    VALUES (next_cell, COALESCE(r.label, ''), COALESCE(r.category, ''), r.description);
  END LOOP;
END $$;

-- Step 4 · 빠진 셀 · seed 로 보충 (54개 완성 · 2026-07-07 값)
INSERT INTO zone_defs (cell_id, zone, category)
SELECT s.cell_id, s.zone, s.category
FROM (VALUES
  (1,  '벽면 21', '콜라겐'),
  (2,  '벽면 20', '비타민C'),
  (3,  '벽면 19', '철분제'),
  (4,  '벽면 18', '임산부·갱년기영양제'),
  (5,  '벽면 17', '잇몸건강'),
  (6,  '벽면 16', '혈액순환·혈당개선'),
  (7,  '벽면 15', '뇌기능개선'),
  (8,  '벽면 14', '눈영양제'),
  (9,  '벽면 13', 'ORS·부스터'),
  (10, '벽면 12', '아르기닌'),
  (11, '벽면 11', '알부민·아미노산'),
  (12, '벽면 10', '간기능개선제'),
  (13, '벽면 9',  '종합비타민'),
  (14, '진열대 22', '의료기기·냉각시트·찜질기'),
  (15, '진열대 8B', '반창고·거즈·붕대·마스크'),
  (16, '진열대 8A', '칫솔·치약·구강용품'),
  (17, '진열대 7B', '보호대·벌레기피제·살충제'),
  (18, '진열대 7A', '파스'),
  (19, '진열대 6B', '남성용품·금연·모발'),
  (20, '진열대 6A', '여성용품·미용·립밤'),
  (21, '진열대 5B', '피부관련제품·다한증·여드름·기미'),
  (22, '진열대 5A', '구내염 연고·피부·무좀·와상·멍·외용제'),
  (23, '진열대 4B', '경옥고·공진단·우황청심원'),
  (24, '진열대 4A', '멀미약·구충제·다래끼·염증약'),
  (25, '진열대 3B', '해열진통제·다래끼·염증약·안약'),
  (26, '진열대 3A', '변비약·치질약·붓기·수면유도제'),
  (27, '진열대 2B', '소화제·지사제·위염·복통'),
  (28, '진열대 2A', '어린이감기약·키즈용품'),
  (29, '진열대 1B', '기침·가래·알러지·안약·한방감기약'),
  (30, '진열대 1A', '종합감기·목감기·트로키·목스프레이·코감기·비강스프레이'),
  (31, '벽면 23', '동물의약품'),
  (32, '벽면 24', '마그네슘·수면'),
  (33, '벽면 25', '탈모·전립선'),
  (34, '벽면 26', '화장품'),
  (35, '벽면 27', '항산화제'),
  (36, '벽면 28', '칼슘·비타민'),
  (37, '벽면 29', '콘드로이친·MSM'),
  (38, '벽면 30', '오메가3'),
  (39, '벽면 31', '유산균'),
  (40, '벽면 32', '어린이영양제'),
  (41, '벽면 33', '면역증강'),
  (42, '벽면 34', '한방제품'),
  (43, '벽면 35', '냉장의약품'),
  (44, '프로모션', '프로모션·이벤트 상품'),
  (45, '기능성화장품', '기능성화장품·미용'),
  (46, '조제실', '조제실 (약사 전용)'),
  (47, '화장실', '(시설)'),
  (48, '계산대', '계산대 (POS)'),
  (49, '정수기', '(시설)'),
  (50, '이벤트존', '이벤트·프로모션 상품'),
  (51, '카운터테마 43', '카운터테마'),
  (52, '카운터테마 44', '카운터테마'),
  (53, '카운터테마 45', '카운터테마'),
  (54, '카운터테마 46', '카운터테마')
) AS s(cell_id, zone, category)
WHERE NOT EXISTS (SELECT 1 FROM zone_defs z WHERE z.cell_id = s.cell_id);

-- Step 5 · 이관 후 백업 DROP (사용자 지시)
DROP TABLE IF EXISTS zone_defs_v1_backup;

-- 확인
SELECT cell_id, zone, category,
       LEFT(COALESCE(detailed_category, ''), 30) AS detail,
       assigned_staff_ids
FROM zone_defs
ORDER BY cell_id;

SELECT COUNT(*) AS total FROM zone_defs;  -- 54 예상
