-- 2026-08-30 · 사용자 지시 · zone_defs KV → 정식 DB 테이블 이관
-- 이유 · JSON blob (settings.zone_defs) · 원본 테이블 우선 대원칙 위배
-- 기능 · 매장구역도 카테고리·서브라벨·상세설명 관리
-- Seed · 2026-07-07 (한달전) 값 · 사용자가 요청한 원복본
--
-- 실행 순서 (Supabase SQL Editor):
--   1. 아래 CREATE TABLE 실행
--   2. INSERT ... SEED 실행 (36개 zone)
--   3. 서버 재시작 · /api/zone-defs 라우터 자동 인식
--   4. 확인 후 · settings.zone_defs KV row DELETE (선택 · 하위호환 폴백 유지 시 유보)

BEGIN;

CREATE TABLE IF NOT EXISTS zone_defs (
  num           INT         PRIMARY KEY,
  label         TEXT        NOT NULL,
  category      TEXT        NOT NULL,
  section       TEXT        NOT NULL CHECK (section IN ('aisle','bottom_wall','top_wall','left_wall','wing','event')),
  sub_a         TEXT,
  sub_b         TEXT,
  sub_c         TEXT,
  description   TEXT,
  description_a TEXT,
  description_b TEXT,
  description_c TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  zone_defs               IS '매장구역도 정의 · 이전 settings.zone_defs KV 승격 (2026-08-30)';
COMMENT ON COLUMN zone_defs.num           IS 'zone 번호 (PK)';
COMMENT ON COLUMN zone_defs.sub_a         IS 'A 서브존 카테고리 (예: 진열대 1A)';
COMMENT ON COLUMN zone_defs.sub_b         IS 'B 서브존 카테고리 (예: 진열대 1B)';
COMMENT ON COLUMN zone_defs.sub_c         IS 'C 서브존 카테고리 (예: 계산대 40C)';
COMMENT ON COLUMN zone_defs.description   IS '단독 zone hover 상세';
COMMENT ON COLUMN zone_defs.description_a IS '서브 A hover 상세';

-- ── Seed · 2026-07-07 (한달전) 카테고리 값 ────────────────────────────
--   사용자 지시 · 한달 전 값으로 복원
--   중앙 진열대 (aisle 22, 1-8)
--   상단 벽면 (top_wall 9-21, 35)
--   하단 벽면 (bottom_wall 23-34)
--   수직윙 (wing 36-41, event 42)

INSERT INTO zone_defs (num, label, category, section, sub_a, sub_b, sub_c) VALUES
  -- 중앙 진열대
  (22, '진열대 22', '의료기기·냉각시트·찜질기', 'aisle', NULL, NULL, NULL),
  (8,  '진열대 8',  '칫솔·치약·구강용품 / 반창고·거즈·붕대·마스크', 'aisle',
       '칫솔·치약·구강용품', '반창고·거즈·붕대·마스크', NULL),
  (7,  '진열대 7',  '파스 / 보호대·벌레기피제·살충제', 'aisle',
       '파스', '보호대·벌레기피제·살충제', NULL),
  (6,  '진열대 6',  '여성용품·미용·립밤 / 남성용품·금연·모발', 'aisle',
       '여성용품·미용·립밤', '남성용품·금연·모발', NULL),
  (5,  '진열대 5',  '구내염 연고·피부·무좀·와상·멍·외용제 / 피부관련제품·다한증·여드름·기미', 'aisle',
       '구내염 연고·피부·무좀·와상·멍·외용제', '피부관련제품·다한증·여드름·기미', NULL),
  (4,  '진열대 4',  '멀미약·구충제·다래끼·염증약 / 경옥고·공진단·우황청심원', 'aisle',
       '멀미약·구충제·다래끼·염증약', '경옥고·공진단·우황청심원', NULL),
  (3,  '진열대 3',  '변비약·치질약·붓기·수면유도제 / 해열진통제·다래끼·염증약·안약', 'aisle',
       '변비약·치질약·붓기·수면유도제', '해열진통제·다래끼·염증약·안약', NULL),
  (2,  '진열대 2',  '어린이감기약·키즈용품 / 소화제·지사제·위염·복통', 'aisle',
       '어린이감기약·키즈용품', '소화제·지사제·위염·복통', NULL),
  (1,  '진열대 1',  '종합감기·목감기·트로키·목스프레이·코감기·비강스프레이 / 기침·가래·알러지·안약·한방감기약', 'aisle',
       '종합감기·목감기·트로키·목스프레이·코감기·비강스프레이', '기침·가래·알러지·안약·한방감기약', NULL),

  -- 상단 벽면 (21 → 9)
  (21, '벽면 21', '콜라겐',              'top_wall', NULL, NULL, NULL),
  (20, '벽면 20', '비타민C',             'top_wall', NULL, NULL, NULL),
  (19, '벽면 19', '철분제',              'top_wall', NULL, NULL, NULL),
  (18, '벽면 18', '임산부·갱년기영양제',   'top_wall', NULL, NULL, NULL),
  (17, '벽면 17', '잇몸건강',            'top_wall', NULL, NULL, NULL),
  (16, '벽면 16', '혈액순환·혈당개선',    'top_wall', NULL, NULL, NULL),
  (15, '벽면 15', '뇌기능개선',          'top_wall', NULL, NULL, NULL),
  (14, '벽면 14', '눈영양제',            'top_wall', NULL, NULL, NULL),
  (13, '벽면 13', 'ORS·부스터',         'top_wall', NULL, NULL, NULL),
  (12, '벽면 12', '아르기닌',            'top_wall', NULL, NULL, NULL),
  (11, '벽면 11', '알부민·아미노산',      'top_wall', NULL, NULL, NULL),
  (10, '벽면 10', '간기능개선제',        'top_wall', NULL, NULL, NULL),
  (9,  '벽면 9',  '종합비타민',          'top_wall', NULL, NULL, NULL),
  (35, '벽면 35', '냉장의약품',          'top_wall', NULL, NULL, NULL),

  -- 하단 벽면 (23 → 34)
  (23, '벽면 23', '동물의약품',           'bottom_wall', NULL, NULL, NULL),
  (24, '벽면 24', '마그네슘·수면',        'bottom_wall', NULL, NULL, NULL),
  (25, '벽면 25', '탈모·전립선',         'bottom_wall', NULL, NULL, NULL),
  (26, '벽면 26', '화장품',              'bottom_wall', NULL, NULL, NULL),
  (27, '벽면 27', '항산화제',            'bottom_wall', NULL, NULL, NULL),
  (28, '벽면 28', '칼슘·비타민',         'bottom_wall', NULL, NULL, NULL),
  (29, '벽면 29', '콘드로이친·MSM',      'bottom_wall', NULL, NULL, NULL),
  (30, '벽면 30', '오메가3',             'bottom_wall', NULL, NULL, NULL),
  (31, '벽면 31', '유산균',              'bottom_wall', NULL, NULL, NULL),
  (32, '벽면 32', '어린이영양제',        'bottom_wall', NULL, NULL, NULL),
  (33, '벽면 33', '면역증강',            'bottom_wall', NULL, NULL, NULL),
  (34, '벽면 34', '한방제품',            'bottom_wall', NULL, NULL, NULL),

  -- 수직윙 · 이벤트
  (36, '프로모션',    '프로모션·이벤트 상품', 'wing',  NULL, NULL, NULL),
  (37, '기능성화장품', '기능성화장품·미용',   'wing',  NULL, NULL, NULL),
  (38, '조제실',      '조제실 (약사 전용)',  'wing',  NULL, NULL, NULL),
  (39, '화장실',      '(시설)',             'wing',  NULL, NULL, NULL),
  (40, '계산대',      '계산대 (POS) · 3구역', 'wing',
       '카운터 1', '카운터 2', '카운터 3'),
  (41, '정수기',      '(시설)',             'wing',  NULL, NULL, NULL),
  (42, '이벤트존',    '이벤트·프로모션 상품', 'event', NULL, NULL, NULL)
ON CONFLICT (num) DO NOTHING;  -- 이미 존재하면 건드리지 않음 · 재실행 안전

-- 확인
SELECT num, label, category, section FROM zone_defs ORDER BY
  CASE section
    WHEN 'aisle' THEN 1
    WHEN 'top_wall' THEN 2
    WHEN 'bottom_wall' THEN 3
    WHEN 'wing' THEN 4
    WHEN 'event' THEN 5
    ELSE 6
  END,
  num;

COMMIT;
