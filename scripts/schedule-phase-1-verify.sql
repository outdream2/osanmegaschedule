-- SCHEDULE PHASE 1 DB CLOSEOUT · verify
-- Supabase SQL Editor 상단 "No limit" 선택 후 실행
-- 12 row 결과 (ord · metric · value · expected) 반환

SELECT * FROM (
  SELECT 1 AS ord,
    'orphan_999_remaining' AS metric,
    (SELECT COUNT(*)::text FROM leave_requests
      WHERE id = '30277299-9ff9-4bfb-844d-75ac96b5f81b') AS value,
    '0' AS expected
  UNION ALL
  SELECT 2,
    'orphan_bak_preserved',
    (SELECT COUNT(*)::text FROM leave_requests
      WHERE id = '297371b0-c0fb-4706-b783-7a42414c299c'),
    '1'
  UNION ALL
  SELECT 3,
    'source_leave_id_column',
    (SELECT CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name='schedules'
         AND column_name='source_leave_id'
    ) THEN 'YES' ELSE 'NO' END),
    'YES'
  UNION ALL
  SELECT 4,
    'source_leave_id_index',
    (SELECT CASE WHEN EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE indexname='idx_schedules_source_leave_id'
    ) THEN 'YES' ELSE 'NO' END),
    'YES'
  UNION ALL
  SELECT 5,
    'approve_leave_request_rpc',
    (SELECT CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc
       WHERE proname='approve_leave_request'
    ) THEN 'YES' ELSE 'NO' END),
    'YES'
  UNION ALL
  SELECT 6,
    'safe_backfill_rows',
    (SELECT COUNT(*)::text FROM schedules
      WHERE source_leave_id IS NOT NULL),
    '3'
  UNION ALL
  SELECT 7,
    'remaining_null_leave_schedules',
    (SELECT COUNT(*)::text FROM schedules
      WHERE source_leave_id IS NULL
        AND type IN ('월차','오전반차','오후반차')),
    '5'
  UNION ALL
  SELECT 8,
    'dangling_source_leave_id',
    (SELECT COUNT(*)::text FROM schedules s
      WHERE s.source_leave_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM leave_requests l
           WHERE l.id = s.source_leave_id
        )),
    '0'
  UNION ALL
  SELECT 9,
    'fk_schedules_employee',
    (SELECT CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname='fk_schedules_employee'
    ) THEN 'YES' ELSE 'NO' END),
    'YES'
  UNION ALL
  SELECT 10,
    'fk_employee_contracts_employee',
    (SELECT CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname='fk_employee_contracts_employee'
    ) THEN 'YES' ELSE 'NO' END),
    'YES'
  UNION ALL
  SELECT 11,
    'fk_resignation_requests_employee',
    (SELECT CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname='fk_resignation_requests_employee'
    ) THEN 'YES' ELSE 'NO' END),
    'YES'
  UNION ALL
  SELECT 12,
    'fk_schedules_source_leave',
    (SELECT CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname='fk_schedules_source_leave'
    ) THEN 'YES' ELSE 'NO' END),
    'YES'
) t
ORDER BY ord;
