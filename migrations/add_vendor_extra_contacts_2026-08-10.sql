-- 2026-08-10 · 공급사 · 팀장·긴급연락처 필드 추가
--   기본정보에 team_leader_name · team_leader_phone · emergency_contact 3 컬럼
--   기존 contact_name/phone (담당자) 는 유지 · 별도 정보
--
-- 실행: Supabase SQL Editor 에 붙여넣기 후 Run
-- 안전: ADD COLUMN IF NOT EXISTS · 중복 실행 무해
-- 회귀: 기존 컬럼·인덱스 미변경 · 기존 라우터 정상 동작

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS team_leader_name  TEXT,
  ADD COLUMN IF NOT EXISTS team_leader_phone TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact TEXT;

-- 컬럼 코멘트 (Supabase Studio 에서 표시)
COMMENT ON COLUMN vendors.team_leader_name  IS '팀장 이름 · 담당자와 별개';
COMMENT ON COLUMN vendors.team_leader_phone IS '팀장 연락처';
COMMENT ON COLUMN vendors.emergency_contact IS '긴급 연락처 (야간·주말·비상)';

-- 사용처:
--   VendorListEditor · 기본정보 섹션 · 팀장이름·팀장전화·긴급연락처 폼 필드
--   VendorDetailModal · 조회·수정
--
-- 인덱스: 검색·조회 요구 없음 · 필요 시 별도 추가
