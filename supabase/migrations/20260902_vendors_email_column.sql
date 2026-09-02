-- ═══════════════════════════════════════════════════════════════════
-- 2026-09-02 · 사용자 지시 · vendors · email 컬럼 정식 추가
--   · 배경 · 클라이언트 & 서버 코드는 vendors.email 사용 중이나 · 실제 DB 컬럼 부재
--   · 결과 · PATCH 시 · Supabase "column does not exist" 오류 · 전체 UPDATE revert
--          · 사용자가 5필드 (팀장·긴급·이메일 등) 입력 → 저장 안 됨 이슈
--   · 실행 · Supabase SQL Editor · idempotent (IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS email TEXT NULL;

COMMENT ON COLUMN vendors.email IS
  '거래처 발주용 이메일 (승인 필수 5필드 중 하나)';

-- ═══════════════════════════════════════════════════════════════════
-- 검증
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'vendors' AND column_name = 'email';
-- ═══════════════════════════════════════════════════════════════════
