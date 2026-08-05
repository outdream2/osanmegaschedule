-- ═══════════════════════════════════════════════════════════════════════════
-- zone_labels 테이블 생성 · 2026-08-05
--
-- 원인: 서버 로그 · [zone-labels GET] Could noㅁt find the table 'public.zone_labels'
-- 원인: docs/supabase_functions_and_tables.sql 에는 스키마 있지만 실제 DB 에 미생성
--
-- 실행: Supabase 대시보드 → SQL Editor → 붙여넣기 → Run
-- 안전: CREATE TABLE IF NOT EXISTS + ON CONFLICT · 중복 실행 무해
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS zone_labels (
  zone_id TEXT PRIMARY KEY,          -- "1A", "1B", "9", "22", "35" 등 (내부 원본)
  number INT NOT NULL,               -- UI 표시 번호 (1~60)
  sub_label TEXT,                    -- 선택적 · 카테고리·이름
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 인덱스
CREATE INDEX IF NOT EXISTS idx_zone_labels_number ON zone_labels(number);

-- 3. 초기 seed (기본값 반영 · 이미 데이터 있으면 skip)
INSERT INTO zone_labels (zone_id, number) VALUES
  ('1A',1),('1B',2),('2A',3),('2B',4),('3A',5),('3B',6),
  ('4A',7),('4B',8),('5A',9),('5B',10),('6A',11),('6B',12),
  ('7A',13),('7B',14),('8A',15),('8B',16),
  ('9',17),('10',18),('11',19),('12',20),('13',21),('14',22),
  ('15',23),('16',24),('17',25),('18',26),('19',27),('20',28),('21',29),
  ('22',30),
  ('23',31),('24',32),('25',33),('26',34),('27',35),('28',36),
  ('29',37),('30',38),('31',39),('32',40),('33',41),('34',42),
  ('35',43),('36',44),('37',45),('38',46),('39',47),('40',48),('41',49),('42',50)
ON CONFLICT (zone_id) DO NOTHING;

-- 4. 검증
-- SELECT COUNT(*) FROM zone_labels;  -- 50 이면 seed 성공
