-- scripts/schedule-phase-2-p0-5-verify.sql
-- 2026-10-07 · Schedule Phase 2 · P0-5 OPTION A · READ-ONLY verify
--
-- Usage
--   Supabase SQL Editor 에서 전체 복사 실행 → 결과 agent 에 공유.
--
-- 이 스크립트는 영향 없음 (READ-ONLY · empty patches smoke call).
-- settings_patch_jsonb(key, '[]'::jsonb) 는 row 변경 없이 현재 value 반환.

-- 1) 함수 설치 확인
SELECT
  p.proname        AS function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,
  pg_catalog.pg_get_function_result(p.oid)             AS returns,
  l.lanname        AS language,
  obj_description(p.oid, 'pg_proc')                    AS comment
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_language  l ON l.oid = p.prolang
WHERE n.nspname = 'public' AND p.proname = 'settings_patch_jsonb';

-- 2) Smoke call · 빈 patches · row 변경 없이 현재 value 반환
--    all_settings 가 존재하면 그 값 반환 · 없으면 '{}' 반환
--    주의: 함수 로직 상 bootstrap INSERT 는 patches 길이 > 0 일 때만 실행됨 ·
--          빈 배열이면 SELECT only 로 READ-ONLY 보장
SELECT public.settings_patch_jsonb('all_settings', '[]'::jsonb) AS smoke_result;

-- 3) app_settings row (verify 안정성 체크 · 변경 없음 확인)
SELECT key, jsonb_typeof(value) AS value_type, updated_at
  FROM public.app_settings
 WHERE key = 'all_settings';
