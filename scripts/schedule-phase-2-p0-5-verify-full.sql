-- Phase 2 P0-5 OPTION A · 통합 verify (단일 결과)
-- No limit 선택 후 실행
-- 1 row · 5 column 반환

WITH f AS (
  SELECT p.oid, p.proname
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'settings_patch_jsonb'
)
SELECT
  (SELECT COUNT(*)::int FROM f) AS rpc_installed,
  (SELECT pg_get_function_identity_arguments(oid)
     FROM f LIMIT 1) AS rpc_args,
  (SELECT pg_get_function_result(oid)
     FROM f LIMIT 1) AS rpc_returns,
  CASE
    WHEN (SELECT COUNT(*) FROM f) > 0
      THEN jsonb_typeof(public.settings_patch_jsonb(
             'all_settings',
             '[]'::jsonb))
    ELSE NULL
  END AS smoke_result_type,
  (SELECT updated_at
     FROM public.app_settings
    WHERE key = 'all_settings') AS all_settings_updated_at;
