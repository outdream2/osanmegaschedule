-- ═══════════════════════════════════════════════════════════════════
-- 2026-09-02 · #178 확장 · vendors · 팀장 필드 추가 (사용자 지시)
-- 사용자 지시: 담당자 + 팀장 (이름 · 전화번호) · 조회·저장·표시 모두 통일
-- 실행: Supabase Dashboard > SQL Editor · 또는 psql -f 이 파일
-- ═══════════════════════════════════════════════════════════════════

-- 1. 팀장 필드 · IF NOT EXISTS · idempotent
--    (기존 add_vendor_extra_contacts_2026-08-10.sql 에서 이미 team_leader_name · team_leader_phone · emergency_contact 추가됨 확인)
--    이 파일 · 참조 · Supabase 이미 실행됐다면 skip
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS team_leader_name   TEXT NULL;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS team_leader_phone  TEXT NULL;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS emergency_contact  TEXT NULL;

-- 2. 코멘트 (문서 · 선택)
COMMENT ON COLUMN vendors.team_leader_name  IS '팀장 이름 (담당자 상급자)';
COMMENT ON COLUMN vendors.team_leader_phone IS '팀장 전화번호 (담당자 연락 안 될 때)';
COMMENT ON COLUMN vendors.emergency_contact IS '비상 연락처 (예비)';

-- ═══════════════════════════════════════════════════════════════════
-- 검증 · 실행 후 · SELECT column_name FROM information_schema.columns
--                  WHERE table_name = 'vendors' ORDER BY ordinal_position;
-- ═══════════════════════════════════════════════════════════════════
