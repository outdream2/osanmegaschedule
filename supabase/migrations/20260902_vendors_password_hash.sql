-- ═══════════════════════════════════════════════════════════════════
-- 2026-09-02 · #178+ · vendors · password_hash 정식 컬럼 도입 (사용자 지시)
--   · 이전 · phone + ENV suffix (기본 "00") 파생 규칙 → 완전 제거
--   · 이후 · employees.password_hash 와 동일 구조 · bcrypt hash 저장
--   · 기본값 · '1234' (관리자 초기 배포용 · 첫 로그인 후 본인 변경 유도)
--   · 실행 · Supabase SQL Editor · idempotent (IF NOT EXISTS · IS NULL 조건)
-- ═══════════════════════════════════════════════════════════════════

-- 0. pgcrypto · bcrypt hash 생성용 (crypt · gen_salt)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. password_hash 컬럼 추가 · nullable · TEXT · bcrypt hash 저장 (60자)
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS password_hash TEXT NULL;

COMMENT ON COLUMN vendors.password_hash IS
  '거래처 로그인 비밀번호 (bcrypt · 기본 "1234")';

-- 2. 기존 vendor · password_hash NULL 인 행 · bcrypt(''1234'') 로 초기화
--    · gen_salt(''bf'', 12) · bcryptjs 호환 · $2a$ prefix ($2b$ 도 verify 가능)
--    · WHERE 조건 · 이미 password_hash 있는 vendor 는 유지 (idempotent · 재실행 안전)
UPDATE vendors
   SET password_hash = crypt('1234', gen_salt('bf', 12))
 WHERE password_hash IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 검증 (실행 후)
--   SELECT id, company_name, phone,
--          CASE WHEN password_hash IS NULL THEN 'NULL'
--               ELSE substr(password_hash, 1, 7) || '...' END AS hash_preview
--     FROM vendors
--    ORDER BY id;
-- ═══════════════════════════════════════════════════════════════════
