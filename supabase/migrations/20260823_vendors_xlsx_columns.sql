-- ═══════════════════════════════════════════════════════════════════
-- #178 Phase A · vendors 5 신규 컬럼 (xlsx 마스터 시트)
-- 작성일: 2026-08-23
-- 사용자 결정: 첫 시트만 · vendor_order_templates 신설 X · 로그인 DB 저장 X
-- 실행 · Supabase Dashboard > SQL Editor · 또는 psql -f 이 파일
-- ═══════════════════════════════════════════════════════════════════

-- 1. 5 신규 컬럼 · IF NOT EXISTS · idempotent
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS order_method   TEXT NULL;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS region         TEXT NULL;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS invoice_method TEXT NULL;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS order_status   TEXT NULL;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS special_notes  TEXT NULL;

-- 2. 인덱스 · special_notes 있는 vendor · 검색·필터 빠름 (partial index)
CREATE INDEX IF NOT EXISTS idx_vendors_special_notes
  ON vendors ((special_notes IS NOT NULL))
  WHERE special_notes IS NOT NULL;

-- 3. 코멘트 (선택 · docs)
COMMENT ON COLUMN vendors.order_method   IS '주문 방식 (사이트 URL · 이메일 · 전화 등)';
COMMENT ON COLUMN vendors.region         IS '지역 (예: "서울 · 강남" · "경기 · 오산")';
COMMENT ON COLUMN vendors.invoice_method IS '거래명세서 방식 (이메일 · 팩스 · 지참 등)';
COMMENT ON COLUMN vendors.order_status   IS '주문 현황 (정상 · 임시중단 · 종료)';
COMMENT ON COLUMN vendors.special_notes  IS '발주 특이사항 (경고 톤 배너 노출 대상)';

-- ═══════════════════════════════════════════════════════════════════
-- 애플리케이션 로직 (참고)
-- ═══════════════════════════════════════════════════════════════════
-- 1) 로그인 규칙 (사용자 결정 · DB 저장 X)
--    · 로그인 ID = vendors.phone (담당자 핸드폰 · 하이픈 제거·숫자만)
--    · 비번 = phone + ENV VENDOR_PW_SUFFIX (기본 "00" · 예: 0101234567800)
--    · 서버 파생 · src/lib/vendorPassword.ts (Phase C-계정 기능 시)
--
-- 2) xlsx 임포트
--    · npm run import:vendors:dry  # 파싱 결과만 · DB 변경 없음
--    · npm run import:vendors      # 실제 실행 · UPDATE/INSERT
--    · 매칭 키: company_name (정확) → phone fallback
--
-- 3) UI (Phase D)
--    · VendorDetailModal · 5 신규 필드 편집 · special_notes 는 CollapseCard
--    · 발주요청 페이지 · 공급사 선택 시 · special_notes 있으면 · 경고 배너

-- ═══════════════════════════════════════════════════════════════════
-- 확인 SQL (마이그레이션 후 실행)
-- ═══════════════════════════════════════════════════════════════════
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'vendors'
--    AND column_name IN ('order_method','region','invoice_method','order_status','special_notes');

-- ═══════════════════════════════════════════════════════════════════
-- 롤백 SQL (문제 발생 시 · 사용자 승인 필수)
-- ═══════════════════════════════════════════════════════════════════
-- DROP INDEX IF EXISTS idx_vendors_special_notes;
-- ALTER TABLE vendors
--   DROP COLUMN IF EXISTS special_notes,
--   DROP COLUMN IF EXISTS order_status,
--   DROP COLUMN IF EXISTS invoice_method,
--   DROP COLUMN IF EXISTS region,
--   DROP COLUMN IF EXISTS order_method;
