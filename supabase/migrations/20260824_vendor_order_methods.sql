-- ═══════════════════════════════════════════════════════════════════
-- #178 · vendors 컬럼 추가 + order_method 값 일괄 UPDATE (52 vendor)
-- 작성일: 2026-08-24 · 사용자 제공 데이터
-- 실행: Supabase Dashboard > SQL Editor > 이 파일 전체 복사 · Run 클릭 (한 번에 완료)
-- 특징: idempotent (여러 번 실행 안전) · 트랜잭션 처리 (실패 시 자동 롤백)
-- ═══════════════════════════════════════════════════════════════════
BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- 1) 컬럼 추가 (없으면 · IF NOT EXISTS)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS order_method   TEXT NULL,
  ADD COLUMN IF NOT EXISTS region         TEXT NULL,
  ADD COLUMN IF NOT EXISTS invoice_method TEXT NULL,
  ADD COLUMN IF NOT EXISTS order_status   TEXT NULL,
  ADD COLUMN IF NOT EXISTS special_notes  TEXT NULL;

COMMENT ON COLUMN vendors.order_method   IS '주문 방식 (사이트 URL · 이메일 · 전화 등)';
COMMENT ON COLUMN vendors.region         IS '지역';
COMMENT ON COLUMN vendors.invoice_method IS '거래명세서 방식';
COMMENT ON COLUMN vendors.order_status   IS '주문 현황';
COMMENT ON COLUMN vendors.special_notes  IS '발주 특이사항';

-- ────────────────────────────────────────────────────────────────────
-- 2) order_method UPDATE · 52 vendor (19개 값 · 33개 NULL)
--    매칭 · company_name (정확 · 없으면 skip · 후속 신규 등록)
-- ────────────────────────────────────────────────────────────────────
UPDATE vendors SET order_method = '고려은단 폐쇄몰'      WHERE company_name = '고려은단';
UPDATE vendors SET order_method = '광동제약 약국몰'      WHERE company_name = '광동제약';
UPDATE vendors SET order_method = '녹십자 프리미온'      WHERE company_name = '녹십자';
UPDATE vendors SET order_method = 'theSHOP'              WHERE company_name = '대웅제약';
UPDATE vendors SET order_method = '온다몰, 일부직거래'   WHERE company_name = '대원제약';
UPDATE vendors SET order_method = 'DAPmall - 메인'       WHERE company_name = '동아제약';
UPDATE vendors SET order_method = '동화eMall, 일부직거래' WHERE company_name = '동화약품';
UPDATE vendors SET order_method = '팜스트리트'           WHERE company_name = '보령컨슈머';
UPDATE vendors SET order_method = '바로팜 | 홈'          WHERE company_name = '비알피랩스(아워팜)';
UPDATE vendors SET order_method = '셀로몰'               WHERE company_name = '셀로닉스';
UPDATE vendors SET order_method = '소조몰'               WHERE company_name = '신일제약';
UPDATE vendors SET order_method = '뉴트라몰'             WHERE company_name = '엠아이에이뉴트라';
UPDATE vendors SET order_method = 'HMP몰'                WHERE company_name = '온라인팜';
UPDATE vendors SET order_method = '유한팜'               WHERE company_name = '유한양행';
UPDATE vendors SET order_method = '새로팜'               WHERE company_name = '일동제약';
UPDATE vendors SET order_method = '플랫팜'               WHERE company_name = '종근당';
UPDATE vendors SET order_method = 'JW중외제약 온라인몰'  WHERE company_name = '중외제약';
UPDATE vendors SET order_method = '바로팜 | 홈'          WHERE company_name = '코오롱제약';
UPDATE vendors SET order_method = '현대약품몰, 직거래'   WHERE company_name = '현대약품';

-- ────────────────────────────────────────────────────────────────────
-- 3) 확인 · 매칭 성공 vendor · 미매칭 vendor 리포트
-- ────────────────────────────────────────────────────────────────────
-- (참고 SELECT · 실행 안 됨 · SQL Editor 에서 별도 실행 시 사용)
--
-- SELECT company_name, order_method
--   FROM vendors
--  WHERE company_name IN (
--    '고려은단','광동제약','녹십자','대웅제약','대원제약','동아제약','동화약품',
--    '보령컨슈머','비알피랩스(아워팜)','셀로닉스','신일제약','엠아이에이뉴트라',
--    '온라인팜','유한양행','일동제약','종근당','중외제약','코오롱제약','현대약품'
--  )
--  ORDER BY company_name;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- 실행 후 확인 (선택 · 별도 실행)
-- ═══════════════════════════════════════════════════════════════════
-- 컬럼 확인
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'vendors' AND column_name IN
--    ('order_method','region','invoice_method','order_status','special_notes');
--
-- UPDATE 결과 확인 (19개 예상)
-- SELECT COUNT(*) FROM vendors WHERE order_method IS NOT NULL;
--
-- 미매칭 검사 · 아래 33개 vendor 는 DB 에 있어야 함 (없으면 신규 등록 필요)
-- SELECT unnest(ARRAY[
--   'KJD바이오','CMG제약','경남제약','경방신약','고려제약','동국제약','동성제약',
--   '동아오츠카','디알에스','마더스팜','매일유업','박카스','삼일제약','삼진제약',
--   '신신제약','에프앤디넷(더팜)','영진약품','원광제약(주)','유유제약','익수제약',
--   '일양약품','제이컴퍼니','제일헬스사이언스','조아제약','쥴릭파마','지오영',
--   '컨디션','태극제약','한가람약품','한국코와','한독','한산바이오팜(주)','한풍제약'
-- ]) AS name
-- EXCEPT
-- SELECT company_name FROM vendors;
