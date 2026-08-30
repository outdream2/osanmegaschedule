-- 2026-08-30 · 긴급 · 매장구역편집 상세카테고리 복구
-- KV (settings.zone_defs) 에 남아있는 사용자 편집 데이터를 zone_defs 테이블로 이관
--
-- 배경:
--   2026-08-30b SQL 실행 시 · zone_defs 새 스키마 생성 · seed 로 채움
--   기존 편집 데이터 (description/description_a/b/c/sub_a/b/c) 는
--   KV (settings.zone_defs) 에도 저장되어 있음 · 안전 백업
--
-- 실행 · Supabase SQL Editor

BEGIN;

-- Step 1 · KV 데이터 확인
SELECT
  jsonb_array_length(value::jsonb) AS kv_row_count,
  jsonb_pretty(value::jsonb->0) AS kv_first_row_sample
FROM settings
WHERE key = 'zone_defs';

-- Step 2 · KV 데이터를 zone_defs.detailed_category 로 복구
-- KV row 형태 · { num, label, category, sub_a, sub_b, description, description_a, description_b, ... }
-- 매핑 규칙:
--   · KV num=X 이면서 sub 없음 → zone_defs 에서 zone='벽면 X' 또는 zone='진열대 X' → description
--   · KV num=X 이면서 sub_a 있음 → zone_defs 에서 zone LIKE '% XA' → description_a
--   · KV num=X 이면서 sub_b 있음 → zone_defs 에서 zone LIKE '% XB' → description_b
--   · wing (36-42 · num) · 라벨 매핑 · 프로모션·기능성화장품 등

DO $$
DECLARE
  kv_data JSONB;
  kv_row JSONB;
  kv_num INT;
  kv_desc TEXT;
  kv_desc_a TEXT;
  kv_desc_b TEXT;
  kv_desc_c TEXT;
  kv_sub_a TEXT;
  kv_sub_b TEXT;
  updated_count INT := 0;
BEGIN
  -- KV 로드
  SELECT value::jsonb INTO kv_data FROM settings WHERE key = 'zone_defs';
  IF kv_data IS NULL THEN
    RAISE NOTICE '⚠️ settings.zone_defs KV 데이터 없음 · 복구 불가';
    RETURN;
  END IF;

  RAISE NOTICE '✅ KV 데이터 발견 · % rows · 이관 시작', jsonb_array_length(kv_data);

  -- 각 KV row 순회
  FOR kv_row IN SELECT * FROM jsonb_array_elements(kv_data)
  LOOP
    kv_num    := (kv_row->>'num')::INT;
    kv_desc   := kv_row->>'description';
    kv_desc_a := kv_row->>'descriptionA';
    kv_desc_b := kv_row->>'descriptionB';
    kv_desc_c := kv_row->>'descriptionC';
    kv_sub_a  := kv_row->>'subA';
    kv_sub_b  := kv_row->>'subB';

    -- 서브가 없으면 · 단독 zone 업데이트 · description
    IF kv_sub_a IS NULL AND kv_sub_b IS NULL AND kv_desc IS NOT NULL AND kv_desc != '' THEN
      -- 진열대 22 또는 벽면 N
      UPDATE zone_defs
         SET detailed_category = kv_desc,
             updated_at = NOW()
       WHERE zone IN ('벽면 ' || kv_num, '진열대 ' || kv_num);
      GET DIAGNOSTICS updated_count = ROW_COUNT;
      IF updated_count > 0 THEN
        RAISE NOTICE '  → 벽면/진열대 % · description 복구', kv_num;
      END IF;

      -- wing 라벨 (36-42) · 별도 매핑
      IF kv_num BETWEEN 36 AND 42 THEN
        UPDATE zone_defs SET detailed_category = kv_desc, updated_at = NOW()
        WHERE zone IN (
          CASE kv_num
            WHEN 36 THEN '프로모션'
            WHEN 37 THEN '기능성화장품'
            WHEN 38 THEN '조제실'
            WHEN 39 THEN '화장실'
            WHEN 40 THEN '계산대'
            WHEN 41 THEN '정수기'
            WHEN 42 THEN '이벤트존'
          END
        );
      END IF;
    END IF;

    -- A/B 서브 있으면 · 각각 · description_a/b
    IF kv_desc_a IS NOT NULL AND kv_desc_a != '' THEN
      UPDATE zone_defs
         SET detailed_category = kv_desc_a,
             updated_at = NOW()
       WHERE zone = '진열대 ' || kv_num || 'A';
      GET DIAGNOSTICS updated_count = ROW_COUNT;
      IF updated_count > 0 THEN
        RAISE NOTICE '  → 진열대 %A · descriptionA 복구', kv_num;
      END IF;
    END IF;

    IF kv_desc_b IS NOT NULL AND kv_desc_b != '' THEN
      UPDATE zone_defs
         SET detailed_category = kv_desc_b,
             updated_at = NOW()
       WHERE zone = '진열대 ' || kv_num || 'B';
      GET DIAGNOSTICS updated_count = ROW_COUNT;
      IF updated_count > 0 THEN
        RAISE NOTICE '  → 진열대 %B · descriptionB 복구', kv_num;
      END IF;
    END IF;

    IF kv_desc_c IS NOT NULL AND kv_desc_c != '' THEN
      UPDATE zone_defs
         SET detailed_category = kv_desc_c,
             updated_at = NOW()
       WHERE zone = '진열대 ' || kv_num || 'C';
    END IF;

    -- 서브 카테고리도 복구 (기존 편집 sub_a/sub_b → zone_defs.category · 서브 row)
    IF kv_sub_a IS NOT NULL AND kv_sub_a != '' THEN
      UPDATE zone_defs
         SET category = kv_sub_a,
             updated_at = NOW()
       WHERE zone = '진열대 ' || kv_num || 'A';
    END IF;
    IF kv_sub_b IS NOT NULL AND kv_sub_b != '' THEN
      UPDATE zone_defs
         SET category = kv_sub_b,
             updated_at = NOW()
       WHERE zone = '진열대 ' || kv_num || 'B';
    END IF;
  END LOOP;
END $$;

-- Step 3 · 복구 확인
SELECT cell_id, zone, category,
       LEFT(COALESCE(detailed_category, ''), 60) AS detail_preview,
       CASE WHEN detailed_category IS NOT NULL THEN '✅' ELSE '⚠️' END AS restored
FROM zone_defs
ORDER BY cell_id;

-- 카운트
SELECT
  COUNT(*) AS total_zones,
  COUNT(detailed_category) AS with_detail,
  COUNT(*) - COUNT(detailed_category) AS without_detail
FROM zone_defs;

COMMIT;
