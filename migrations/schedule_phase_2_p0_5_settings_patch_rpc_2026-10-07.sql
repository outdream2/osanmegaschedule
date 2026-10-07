-- migrations/schedule_phase_2_p0_5_settings_patch_rpc_2026-10-07.sql
-- 2026-10-07 · Schedule Phase 2 · P0-5 OPTION A · atomic jsonb_set RPC
-- Status: PRODUCTION-READY · 사용자 수동 apply (Supabase SQL Editor)
--
-- Purpose
--   app_settings (key, value jsonb) 전체 upsert 패턴을 path-level patch 로 대체.
--   서로 다른 top-level path 를 동시 쓰기해도 lost update 발생 X (DB atomic).
--
-- Invariants
--   · value 컬럼은 jsonb 로 유지 (스키마 변경 없음)
--   · updated_at 은 매 patch 적용 시 now() 로 갱신
--   · patches 가 빈 배열이면 row 변경 없음 (smoke test 안전)
--   · path 는 jsonb array of text 로 전달 (예: ["wageRates","약사"])
--
-- Semantics
--   · 서로 다른 top-level path 동시 쓰기 → 둘 다 반영 (jsonb_set path-level)
--   · 같은 path 동시 쓰기 → last-write-wins (명시적 trade-off · 허용)
--   · row 없으면 INSERT (jsonb_set 적용된 상태)
--   · row 있으면 UPDATE value = jsonb_set(value, path, value, true) · 각 patch 순차
--
-- Call shape
--   SELECT settings_patch_jsonb(
--     'all_settings',
--     '[{"path":["wageRates","약사"],"value":{"weekday":35000,"weekend":40000}}]'::jsonb
--   );
--   → returns jsonb (최종 app_settings.value)

CREATE OR REPLACE FUNCTION public.settings_patch_jsonb(
  p_key text,
  p_patches jsonb
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  patch jsonb;
  path_arr text[];
  patch_value jsonb;
  final_value jsonb;
BEGIN
  -- 유효성: patches 는 jsonb array 여야 함
  IF p_patches IS NULL OR jsonb_typeof(p_patches) <> 'array' THEN
    RAISE EXCEPTION 'p_patches must be a jsonb array (got %)', jsonb_typeof(p_patches);
  END IF;

  -- 빈 배열이면 현재 값 그대로 반환 (영향 없음 · smoke test 안전)
  IF jsonb_array_length(p_patches) = 0 THEN
    SELECT value INTO final_value FROM public.app_settings WHERE key = p_key;
    RETURN COALESCE(final_value, '{}'::jsonb);
  END IF;

  -- row 없으면 bootstrap: 빈 {} 로 INSERT 후 patch 순차 적용
  INSERT INTO public.app_settings (key, value, updated_at)
  VALUES (p_key, '{}'::jsonb, now())
  ON CONFLICT (key) DO NOTHING;

  -- 각 patch 를 순차 적용 (단일 트랜잭션 · atomic)
  FOR patch IN SELECT * FROM jsonb_array_elements(p_patches)
  LOOP
    -- path 유효성 검사
    IF patch->'path' IS NULL OR jsonb_typeof(patch->'path') <> 'array' THEN
      RAISE EXCEPTION 'patch.path must be a jsonb array (got %)', jsonb_typeof(patch->'path');
    END IF;
    IF jsonb_array_length(patch->'path') = 0 THEN
      RAISE EXCEPTION 'patch.path must not be empty';
    END IF;

    -- path 를 text[] 로 변환
    SELECT array_agg(elem #>> '{}' ORDER BY ord)
      INTO path_arr
      FROM jsonb_array_elements(patch->'path') WITH ORDINALITY AS t(elem, ord);

    -- patch.value (jsonb) 추출
    patch_value := patch->'value';
    IF patch_value IS NULL THEN
      RAISE EXCEPTION 'patch.value must be present (use jsonb null if intended)';
    END IF;

    -- jsonb_set · 존재하지 않는 중간 path 자동 생성 (create_missing=true)
    UPDATE public.app_settings
       SET value = jsonb_set(COALESCE(value, '{}'::jsonb), path_arr, patch_value, true),
           updated_at = now()
     WHERE key = p_key;
  END LOOP;

  -- 최종 value 반환
  SELECT value INTO final_value FROM public.app_settings WHERE key = p_key;
  RETURN COALESCE(final_value, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.settings_patch_jsonb(text, jsonb) IS
  'Phase 2 P0-5 · Atomic jsonb_set patch for app_settings · 2026-10-07 · prevents whole-JSON lost update between different paths.';
