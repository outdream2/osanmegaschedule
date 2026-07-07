-- 목적:
--   1. 기존 stock_history 행들의 period_start_date 를 snapshot_date 로부터 역산해 채움
--      (dd ≤ 10 → 초순 → start = YYYY-MM-01)
--      (dd ≤ 20 → 중순 → start = YYYY-MM-11)
--      (dd 그 이상 → 하순 → start = YYYY-MM-21)
--   2. period_type 도 함께 backfill
--   3. app_settings.stock_import_log 로그 엔트리에도 start_date/period_type 채워 임포트목록 UI 에 표시되게
--   4. period_start_date 인덱스 추가 (재임포트 시 DELETE 성능)
--
-- 안전: 이미 값이 있으면 덮어쓰지 않음 (WHERE ... IS NULL)

-- (1) stock_history rows backfill
UPDATE public.stock_history
   SET period_start_date =
         CASE
           WHEN EXTRACT(DAY FROM snapshot_date) <= 10 THEN date_trunc('month', snapshot_date)::date
           WHEN EXTRACT(DAY FROM snapshot_date) <= 20 THEN (date_trunc('month', snapshot_date) + interval '10 days')::date
           ELSE                                            (date_trunc('month', snapshot_date) + interval '20 days')::date
         END
 WHERE period_start_date IS NULL;

UPDATE public.stock_history
   SET period_type =
         CASE
           WHEN EXTRACT(DAY FROM snapshot_date) <= 10 THEN 'early'
           WHEN EXTRACT(DAY FROM snapshot_date) <= 20 THEN 'mid'
           ELSE                                            'late'
         END
 WHERE period_type IS NULL;

-- (2) 성능 인덱스
CREATE INDEX IF NOT EXISTS stock_history_period_start_idx
  ON public.stock_history (period_start_date DESC);

-- (3) app_settings.stock_import_log JSON 배열의 각 엔트리에도 start_date · period_type 백필
-- (snapshot_date 로부터 역산)
DO $$
DECLARE
  v_logs jsonb;
  v_new  jsonb := '[]'::jsonb;
  v_e    jsonb;
  v_snap date;
  v_start date;
  v_period text;
BEGIN
  SELECT value INTO v_logs
    FROM app_settings WHERE key = 'stock_import_log';

  IF v_logs IS NULL OR jsonb_typeof(v_logs) <> 'array' THEN
    RETURN;
  END IF;

  FOR v_e IN SELECT * FROM jsonb_array_elements(v_logs) LOOP
    -- 이미 start_date 있으면 그대로 유지
    IF v_e ? 'start_date' AND v_e->>'start_date' IS NOT NULL THEN
      v_new := v_new || v_e;
      CONTINUE;
    END IF;

    IF v_e ? 'snapshot_date' AND v_e->>'snapshot_date' IS NOT NULL THEN
      v_snap := (v_e->>'snapshot_date')::date;
      IF EXTRACT(DAY FROM v_snap) <= 10 THEN
        v_start := date_trunc('month', v_snap)::date;
        v_period := 'early';
      ELSIF EXTRACT(DAY FROM v_snap) <= 20 THEN
        v_start := (date_trunc('month', v_snap) + interval '10 days')::date;
        v_period := 'mid';
      ELSE
        v_start := (date_trunc('month', v_snap) + interval '20 days')::date;
        v_period := 'late';
      END IF;
      v_new := v_new || jsonb_set(
        jsonb_set(v_e, '{start_date}', to_jsonb(v_start::text)),
        '{period_type}', to_jsonb(v_period)
      );
    ELSE
      v_new := v_new || v_e;
    END IF;
  END LOOP;

  UPDATE app_settings
     SET value = v_new,
         updated_at = now()
   WHERE key = 'stock_import_log';
END $$;

-- (4) 검증용 select
-- SELECT snapshot_date, period_start_date, period_type, count(*)
--   FROM stock_history GROUP BY 1,2,3 ORDER BY 1 DESC;

NOTIFY pgrst, 'reload schema';
