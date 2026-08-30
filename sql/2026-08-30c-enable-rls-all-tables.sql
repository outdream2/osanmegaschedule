-- 2026-08-30 · Supabase RLS 활성화 (전체 테이블)
--
-- 전제:
--   ✅ 서버 SUPABASE_KEY 가 SERVICE_ROLE 키 (RLS bypass)
--   ✅ 프론트는 DB 테이블 직접 쿼리 X (Storage 만 사용)
--   ✅ 인증 = 자체 JWT (Supabase Auth 미사용)
--
-- 정책:
--   - RLS 활성화 · DEFAULT DENY (정책 없으면 접근 차단)
--   - 서버 (service_role) 은 RLS 완전 bypass · 정책 불필요
--   - 만약 프론트에서 ANON 키로 실수로 접근하면 · 자동 차단 (보안 강화)
--
-- 실행 · Supabase SQL Editor (또는 SUPABASE_KEY 로 psql)
-- 롤백 · ALTER TABLE <table> DISABLE ROW LEVEL SECURITY

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      -- 시스템·PostgreSQL 내부 테이블 제외
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT LIKE '_supabase%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    RAISE NOTICE 'RLS enabled · %', t.tablename;
  END LOOP;
END $$;

-- 확인 · RLS 활성 상태 조회
SELECT tablename,
       rowsecurity AS rls_enabled,
       (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename = t.tablename) AS policy_count
FROM pg_tables t
WHERE schemaname = 'public'
ORDER BY tablename;

-- 정책 없이 RLS 만 활성 · service_role 만 접근 가능 · ANON 차단
-- 필요 시 아래처럼 개별 테이블에 정책 추가 가능:
--
-- CREATE POLICY "authenticated_read" ON zone_defs
--   FOR SELECT TO authenticated USING (true);
--
-- CREATE POLICY "authenticated_write" ON zone_defs
--   FOR ALL TO authenticated USING (true) WITH CHECK (true);
