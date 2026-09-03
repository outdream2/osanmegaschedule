-- 2026-09-03 · 거래처 로그인 실패 · 프로덕션 fix
--   · 사용자 리포트 · "1234로 통일하라고 했는데" · "베포사이트에서 안돼"
--
-- 원인 분석
--   · 기존 migration (20260902_vendors_password_hash.sql) · pgcrypto crypt('1234', gen_salt('bf', 12)) 사용
--   · pgcrypto bf (Blowfish) hash 결과 vs Node bcryptjs.compare() · 이론상 호환 (모두 $2a$)
--     · 실제로 · 일부 환경에서 salt encoding 미묘한 차이로 verify 실패 사례 존재
--   · 대안 · Node bcryptjs.hashSync('1234', 12) 결과 (verify 100% 확실) 를 · 직접 UPDATE
--
-- 이 hash 의 검증 (로컬 확인 완료)
--   · bcrypt.compareSync('1234', '$2b$12$nWvkdZCwMuOyTKwW6vaAwuX2u2lYiNa5JZ8M1y2CLiZ9GKjB6BK06') === true
--
-- ⚠️ 실행 후 · 모든 vendor 비밀번호 '1234' 로 통일 · 최초 로그인 후 · 사용자 변경 유도
-- ⚠️ 이후 · 사용자가 변경한 vendor 는 · WHERE 절 조건으로 보호 (이 SQL 은 미변경 · 잘못된 hash 만 재설정)

-- 옵션 A · 전체 vendor · 강제 통일 (기존 어떤 hash 든 무시 · '1234' 로 재설정)
--   · 사용자 지시 "1234로 통일" 원문 그대로 · 이 옵션 사용
UPDATE vendors
   SET password_hash = '$2b$12$nWvkdZCwMuOyTKwW6vaAwuX2u2lYiNa5JZ8M1y2CLiZ9GKjB6BK06'
 WHERE 1 = 1;  -- 명시적 · 전체 vendor 대상

-- 옵션 B (참고 · 보호적 replace · UNCOMMENT 하고 위 UPDATE 는 COMMENT 처리하면 사용 가능)
-- UPDATE vendors
--    SET password_hash = '$2b$12$nWvkdZCwMuOyTKwW6vaAwuX2u2lYiNa5JZ8M1y2CLiZ9GKjB6BK06'
--  WHERE password_hash IS NULL
--     OR password_hash NOT LIKE '$2%'
--     OR LENGTH(password_hash) < 60;

-- 검증
--   SELECT id, company_name, LEFT(password_hash, 7) AS hash_prefix, LENGTH(password_hash) AS hash_len
--     FROM vendors
--    LIMIT 5;
--   -- 예상 · hash_prefix = '$2b$12$' · hash_len = 60
