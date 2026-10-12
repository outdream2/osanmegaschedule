-- =============================================================================
-- SCHEDULE V1 · PHASE 3-0 · DATA INTEGRITY GATE · READ-ONLY LIVE AUDIT
-- 2026-10-07
--
-- 목적: PHASE 3 (3A-3E) 보고 직후 사용자 보수적 재지시.
--       "성능 최적화보다 정합성 검사가 먼저". DB 구조 → 데이터 정합성 → relation/provenance
--       → lock → security → performance 순서로 재검증. 전부 READ-ONLY SELECT.
--
-- 안전 규칙 (사용자 명시):
--   - 모든 쿼리 SELECT 전용. INSERT/UPDATE/DELETE/ALTER/DROP/TRUNCATE/CASCADE 금지.
--   - 발견한 P0 자동 수정 금지.
--   - 이름 → ID 복구 금지. position → employee 추정 금지. schedule label 의미 추정 금지.
--   - 박부장 historical 1건 (leave_requests.id='297371b0-c0fb-4706-b783-7a42414c299c') 보존.
--
-- 실행 방법:
--   방법 A (recommended) : scripts/schedule-phase-3-data-integrity.mjs (@supabase/supabase-js)
--   방법 B (fallback)    : Supabase SQL Editor 수동 복사-실행
--
-- 참조 리포트:
--   output/schedule-architecture-audit-2026-10-06.md
--   output/schedule-phase-1-COMPLETE-2026-10-06.md
--   output/schedule-phase-2-COMPLETE-2026-10-07.md
--   output/schedule-phase-3-report-2026-10-07.md
-- =============================================================================


-- =============================================================================
-- SECTION 1 · LIVE SCHEMA SNAPSHOT (information_schema + pg_catalog)
-- =============================================================================

-- 1.1  대상 테이블 존재 + row count baseline
SELECT c.relname AS table_name,
       c.reltuples::bigint AS estimated_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'employees',
    'schedules',
    'leave_requests',
    'employee_contracts',
    'resignation_requests',
    'app_settings',
    'reservations',
    'attendance'
  )
ORDER BY c.relname;

-- 1.2  각 테이블 column + type + nullable + default (LIVE AUTHORITY)
SELECT c.table_name,
       c.column_name,
       c.data_type,
       c.udt_name,
       c.is_nullable,
       c.column_default,
       c.character_maximum_length,
       c.numeric_precision
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'employees',
    'schedules',
    'leave_requests',
    'employee_contracts',
    'resignation_requests',
    'app_settings',
    'reservations',
    'attendance'
  )
ORDER BY c.table_name, c.ordinal_position;

-- 1.3  Primary key + unique constraints
SELECT tc.table_name,
       tc.constraint_name,
       tc.constraint_type,
       string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
 AND kcu.table_schema   = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
  AND tc.table_name IN (
    'employees','schedules','leave_requests','employee_contracts',
    'resignation_requests','app_settings','reservations','attendance'
  )
GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type
ORDER BY tc.table_name, tc.constraint_type DESC;

-- 1.4  CHECK constraints
SELECT con.conname  AS constraint_name,
       rel.relname  AS table_name,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class     rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = con.connamespace
WHERE nsp.nspname = 'public'
  AND con.contype = 'c'
  AND rel.relname IN (
    'employees','schedules','leave_requests','employee_contracts',
    'resignation_requests','app_settings','reservations','attendance'
  )
ORDER BY rel.relname, con.conname;

-- 1.5  Foreign key + ON DELETE / ON UPDATE
SELECT tc.table_name    AS source_table,
       kcu.column_name  AS source_col,
       ccu.table_name   AS target_table,
       ccu.column_name  AS target_col,
       rc.delete_rule,
       rc.update_rule,
       tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
 AND kcu.table_schema   = tc.table_schema
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name
 AND rc.constraint_schema = tc.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.table_schema   = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN (
    'employees','schedules','leave_requests','employee_contracts',
    'resignation_requests','app_settings','reservations','attendance'
  )
ORDER BY tc.table_name, tc.constraint_name;

-- 1.6  Index coverage
SELECT i.schemaname,
       i.tablename,
       i.indexname,
       i.indexdef
FROM pg_indexes i
WHERE i.schemaname = 'public'
  AND i.tablename IN (
    'employees','schedules','leave_requests','employee_contracts',
    'resignation_requests','app_settings','reservations','attendance'
  )
ORDER BY i.tablename, i.indexname;


-- =============================================================================
-- SECTION 3 · ROW COUNT BASELINE (fresh)
-- =============================================================================

SELECT 'employees'            AS metric, COUNT(*) AS value FROM employees
UNION ALL SELECT 'employees_active',      COUNT(*) FROM employees WHERE "retireDate" IS NULL OR "retireDate" = ''
UNION ALL SELECT 'employees_retired',     COUNT(*) FROM employees WHERE "retireDate" IS NOT NULL AND "retireDate" <> ''
UNION ALL SELECT 'schedules_total',       COUNT(*) FROM schedules
UNION ALL SELECT 'schedules_past',        COUNT(*) FROM schedules WHERE date::date < CURRENT_DATE
UNION ALL SELECT 'schedules_today',       COUNT(*) FROM schedules WHERE date::date = CURRENT_DATE
UNION ALL SELECT 'schedules_future',      COUNT(*) FROM schedules WHERE date::date > CURRENT_DATE
UNION ALL SELECT 'leave_requests_total',  COUNT(*) FROM leave_requests
UNION ALL SELECT 'leave_approved',        COUNT(*) FROM leave_requests WHERE status = 'approved'
UNION ALL SELECT 'leave_pending',         COUNT(*) FROM leave_requests WHERE status = 'pending'
UNION ALL SELECT 'leave_rejected',        COUNT(*) FROM leave_requests WHERE status = 'rejected'
UNION ALL SELECT 'leave_cancelled',       COUNT(*) FROM leave_requests WHERE status = 'cancelled'
UNION ALL SELECT 'contracts_total',       COUNT(*) FROM employee_contracts
UNION ALL SELECT 'resignations_total',    COUNT(*) FROM resignation_requests
UNION ALL SELECT 'reservations_total',    COUNT(*) FROM reservations
UNION ALL SELECT 'app_settings_total',    COUNT(*) FROM app_settings
UNION ALL SELECT 'schedule_lock_rows',    COUNT(*) FROM app_settings WHERE key LIKE 'schedule_lock_%';


-- =============================================================================
-- SECTION 4 · EMPLOYEE MASTER INTEGRITY
-- =============================================================================

-- 4.1  Duplicate PK (impossible if PK exists · verify)
SELECT id, COUNT(*) AS cnt FROM employees GROUP BY id HAVING COUNT(*) > 1;

-- 4.2  NULL id (impossible if PK NOT NULL · verify)
SELECT COUNT(*) AS null_id_count FROM employees WHERE id IS NULL;

-- 4.3  retire 상태 분포
SELECT CASE
         WHEN "retireDate" IS NULL OR "retireDate" = '' THEN 'ACTIVE'
         WHEN "retireDate"::date > CURRENT_DATE          THEN 'RETIRE_FUTURE'
         ELSE 'RETIRED'
       END AS state,
       COUNT(*) AS n
FROM employees
GROUP BY 1
ORDER BY 1;

-- 4.4  active-with-resignation-approved
SELECT e.id, e.name, e."retireDate", r.id AS res_id, r.status
FROM employees e
JOIN resignation_requests r ON r.employee_id = e.id AND r.status = 'approved'
WHERE e."retireDate" IS NULL OR e."retireDate" = '';

-- 4.5  retired-with-future-schedule
SELECT e.id, e.name, e."retireDate", s.id AS schedule_id, s.date, s.type
FROM employees e
JOIN schedules s ON s."employeeId" = e.id
WHERE e."retireDate" IS NOT NULL AND e."retireDate" <> ''
  AND s.date::date > e."retireDate"::date
ORDER BY e.id, s.date
LIMIT 50;


-- =============================================================================
-- SECTION 5 · SCHEDULE → EMPLOYEE RELATION (목표: current/future orphan = 0)
-- =============================================================================

-- 5.1  schedules employeeId NULL
SELECT COUNT(*) AS null_employee_id FROM schedules WHERE "employeeId" IS NULL;

-- 5.2  orphan schedules (employeeId 있지만 employees 없음)
SELECT COUNT(*) AS orphan_schedules_total
FROM schedules s
LEFT JOIN employees e ON e.id = s."employeeId"
WHERE s."employeeId" IS NOT NULL AND e.id IS NULL;

-- 5.3  orphan current/future (reject gate)
SELECT COUNT(*) AS orphan_current_future
FROM schedules s
LEFT JOIN employees e ON e.id = s."employeeId"
WHERE s."employeeId" IS NOT NULL AND e.id IS NULL
  AND s.date::date >= CURRENT_DATE;

-- 5.4  orphan sample (최대 50)
SELECT s.id, s."employeeId", s.date, s.type, s."workingHours", s.source_leave_id
FROM schedules s
LEFT JOIN employees e ON e.id = s."employeeId"
WHERE s."employeeId" IS NOT NULL AND e.id IS NULL
ORDER BY s.date DESC
LIMIT 50;


-- =============================================================================
-- SECTION 6 · 박부장 KNOWN LEGACY 재확인
-- =============================================================================

-- 6.1  박부장 leave row 여전히 1건 · employee_id=3
SELECT id, employee_id, employee_name, status, start_date, end_date, half_day_type, request_type, created_at
FROM leave_requests
WHERE id = '297371b0-c0fb-4706-b783-7a42414c299c';

-- 6.2  employees.id=3 존재 여부
SELECT id, name, "retireDate" FROM employees WHERE id = 3;

-- 6.3  employee_id=3 참조 다른 row (schedules / contracts / resignations / reservations)
SELECT 'schedules' AS tbl,  COUNT(*) AS cnt FROM schedules            WHERE "employeeId" = 3
UNION ALL SELECT 'contracts',  COUNT(*) FROM employee_contracts       WHERE employee_id = 3
UNION ALL SELECT 'resignations',COUNT(*) FROM resignation_requests    WHERE employee_id = 3
UNION ALL SELECT 'reservations',COUNT(*) FROM reservations            WHERE assigned_employee_id = 3
UNION ALL SELECT 'leaves_total',COUNT(*) FROM leave_requests          WHERE employee_id = 3;


-- =============================================================================
-- SECTION 7 · LEAVE → EMPLOYEE RELATION
-- =============================================================================

-- 7.1  orphan 전체 (박부장 포함)
SELECT COUNT(*) AS orphan_leaves_total
FROM leave_requests lr
LEFT JOIN employees e ON e.id = lr.employee_id
WHERE lr.employee_id IS NOT NULL AND e.id IS NULL;

-- 7.2  NEW orphan (박부장 row 제외)
SELECT COUNT(*) AS new_orphan_leaves
FROM leave_requests lr
LEFT JOIN employees e ON e.id = lr.employee_id
WHERE lr.employee_id IS NOT NULL AND e.id IS NULL
  AND lr.id <> '297371b0-c0fb-4706-b783-7a42414c299c';

-- 7.3  NEW orphan sample
SELECT lr.id, lr.employee_id, lr.employee_name, lr.status, lr.start_date, lr.end_date, lr.created_at
FROM leave_requests lr
LEFT JOIN employees e ON e.id = lr.employee_id
WHERE lr.employee_id IS NOT NULL AND e.id IS NULL
  AND lr.id <> '297371b0-c0fb-4706-b783-7a42414c299c'
ORDER BY lr.created_at DESC
LIMIT 50;


-- =============================================================================
-- SECTION 8 · source_leave_id PROVENANCE
-- =============================================================================

-- 8.1  source_leave_id 분포
SELECT 'source_leave_id_not_null' AS metric, COUNT(*) AS value FROM schedules WHERE source_leave_id IS NOT NULL
UNION ALL SELECT 'source_leave_id_null',     COUNT(*) FROM schedules WHERE source_leave_id IS NULL;

-- 8.2  dangling source_leave_id (leave_requests.id 없음) — Phase 1 FK 추가 후 0 기대
SELECT COUNT(*) AS dangling_source_leave_id
FROM schedules s
LEFT JOIN leave_requests lr ON lr.id = s.source_leave_id
WHERE s.source_leave_id IS NOT NULL AND lr.id IS NULL;

-- 8.3  one leave → multiple schedules (expected: approved leave 날짜 수만큼. 단 과대 복제 X)
--      반나절 (half-day) 는 1-row 가능. 전일휴무 복수일 걸치면 day 수 만큼 row.
SELECT lr.id,
       lr.status,
       lr.start_date,
       lr.end_date,
       (lr.end_date::date - lr.start_date::date + 1) AS expected_days,
       COUNT(s.id) AS schedule_rows
FROM leave_requests lr
JOIN schedules s ON s.source_leave_id = lr.id
GROUP BY lr.id, lr.status, lr.start_date, lr.end_date
HAVING COUNT(s.id) > (lr.end_date::date - lr.start_date::date + 1)
ORDER BY schedule_rows DESC
LIMIT 50;


-- =============================================================================
-- SECTION 9 · LEAVE PROJECTION CONSISTENCY
-- =============================================================================

-- 9.1  approved leave 인데 schedule projection 없음 (observable only)
SELECT lr.id, lr.employee_id, lr.employee_name, lr.start_date, lr.end_date, lr.request_type, lr.half_day_type
FROM leave_requests lr
LEFT JOIN schedules s ON s.source_leave_id = lr.id
WHERE lr.status = 'approved'
  AND s.id IS NULL
ORDER BY lr.start_date DESC
LIMIT 50;

-- 9.2  approved leave 와 working schedule 동시 (같은 emp+date, type NOT IN OFF/HALF)
WITH off_types AS (SELECT UNNEST(ARRAY['휴무','월차','지정휴무','결근','오전반차','오후반차']) AS t)
SELECT lr.id       AS leave_id,
       lr.employee_id,
       s.id        AS schedule_id,
       s.date,
       s.type      AS schedule_type,
       s."workingHours"
FROM leave_requests lr
JOIN schedules s
  ON s."employeeId" = lr.employee_id
 AND s.date::date BETWEEN lr.start_date::date AND lr.end_date::date
WHERE lr.status = 'approved'
  AND s.type NOT IN (SELECT t FROM off_types)
ORDER BY s.date DESC
LIMIT 50;

-- 9.3  cancelled/rejected 인데 leave projection 아직 남음
SELECT lr.id        AS leave_id,
       lr.status,
       s.id         AS schedule_id,
       s.date,
       s.type
FROM leave_requests lr
JOIN schedules s ON s.source_leave_id = lr.id
WHERE lr.status IN ('cancelled','rejected')
ORDER BY lr.status, s.date DESC
LIMIT 50;

-- 9.4  legacy NULL source_leave_id (approve 전 저장분) · PHASE 1 KNOWN=5
SELECT COUNT(*) AS legacy_null_source_but_leave_type
FROM schedules
WHERE source_leave_id IS NULL
  AND type IN ('월차','오전반차','오후반차');


-- =============================================================================
-- SECTION 10 · SCHEDULE DUPLICATE AUDIT
-- =============================================================================

-- 10.1  duplicate (employeeId, date)
SELECT "employeeId", date, COUNT(*) AS cnt
FROM schedules
GROUP BY "employeeId", date
HAVING COUNT(*) > 1
ORDER BY cnt DESC, date DESC
LIMIT 50;

-- 10.2  duplicate (employeeId, date, type)
SELECT "employeeId", date, type, COUNT(*) AS cnt
FROM schedules
GROUP BY "employeeId", date, type
HAVING COUNT(*) > 1
ORDER BY cnt DESC, date DESC
LIMIT 50;

-- 10.3  schedules UNIQUE constraint 존재 여부 (see Section 1.3)


-- =============================================================================
-- SECTION 11 · DATE INTEGRITY
-- =============================================================================

-- 11.1  schedules NULL date
SELECT COUNT(*) AS schedules_null_date FROM schedules WHERE date IS NULL OR date = '';

-- 11.2  schedules invalid date (parse 불가)
SELECT id, "employeeId", date FROM schedules
WHERE date IS NOT NULL AND date <> ''
  AND date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
LIMIT 50;

-- 11.3  비정상 과거/미래 (예: < 2020 또는 > 2030)
SELECT COUNT(*) AS out_of_range
FROM schedules
WHERE date::date < DATE '2020-01-01' OR date::date > DATE '2030-12-31';

-- 11.4  leave_requests start > end
SELECT id, employee_id, start_date, end_date, status
FROM leave_requests
WHERE start_date::date > end_date::date
LIMIT 50;


-- =============================================================================
-- SECTION 12 · WORKING HOURS INTEGRITY
-- =============================================================================

-- 12.1  working hours 분포
SELECT 'wh_null'                      AS metric, COUNT(*) FROM schedules WHERE "workingHours" IS NULL
UNION ALL SELECT 'wh_empty',          COUNT(*) FROM schedules WHERE "workingHours" = ''
UNION ALL SELECT 'wh_valid_pattern',  COUNT(*) FROM schedules WHERE "workingHours" ~ '^[0-9]{2}:[0-9]{2}-[0-9]{2}:[0-9]{2}$';

-- 12.2  schedules 중 "working" type (OFF/HALF 가 아님) 인데 wh NULL/empty
WITH off_types AS (SELECT UNNEST(ARRAY['휴무','월차','지정휴무','결근','오전반차','오후반차']) AS t)
SELECT COUNT(*) AS working_type_without_wh
FROM schedules
WHERE type NOT IN (SELECT t FROM off_types)
  AND (("workingHours" IS NULL) OR ("workingHours" = ''));

-- 12.3  malformed wh (범위 모양이지만 start>=end)
SELECT id, "employeeId", date, type, "workingHours"
FROM schedules
WHERE "workingHours" ~ '^[0-9]{2}:[0-9]{2}-[0-9]{2}:[0-9]{2}$'
  AND (split_part("workingHours",'-',1))::time >= (split_part("workingHours",'-',2))::time
LIMIT 50;


-- =============================================================================
-- SECTION 13 · SCHEDULE TYPE INTEGRITY
-- =============================================================================

-- 13.1  schedules.type 전수
SELECT type, COUNT(*) AS cnt
FROM schedules
GROUP BY type
ORDER BY cnt DESC;

-- 13.2  app_settings 에서 scheduleTypes / offTypes (JSON)
SELECT key,
       jsonb_pretty(value::jsonb)
FROM app_settings
WHERE key = 'all_settings';


-- =============================================================================
-- SECTION 14 · TAXONOMY INTEGRITY (positions / ranks / workplaces / employmentTypes)
-- =============================================================================

-- 14.1  employees position/rank/workplace/employmentType DISTINCT
SELECT 'position' AS taxonomy, position AS value, COUNT(*) AS cnt FROM employees GROUP BY position
UNION ALL SELECT 'rank',       rank,       COUNT(*)              FROM employees GROUP BY rank
UNION ALL SELECT 'workplace',  workplace,  COUNT(*)              FROM employees GROUP BY workplace
UNION ALL SELECT 'employmentType','employmentType'||'='||COALESCE("employmentType",'(null)'),COUNT(*)
                                                                 FROM employees GROUP BY "employmentType"
ORDER BY taxonomy, cnt DESC;


-- =============================================================================
-- SECTION 15 · WAGE INTEGRITY
-- =============================================================================

-- 15.1  wageRates / employeeWageOverrides 추출 (jsonb path)
SELECT (value::jsonb -> 'wageRates')                AS wage_rates,
       (value::jsonb -> 'employeeWageOverrides')    AS employee_overrides
FROM app_settings
WHERE key = 'all_settings';

-- 15.2  overrides 가 가리키는 employee id 존재 여부는 Node audit 에서 수행 (JSON key 매칭)


-- =============================================================================
-- SECTION 16-17 · LOCK / CONFIRM DATA STRUCTURE
-- =============================================================================

-- 16.1  schedule_lock_* key 전수
SELECT key, value, updated_at
FROM app_settings
WHERE key LIKE 'schedule_lock_%'
ORDER BY key;

-- 16.2  lock key format 검증
SELECT key
FROM app_settings
WHERE key LIKE 'schedule_lock_%'
  AND key !~ '^schedule_lock_[0-9]{4}-[0-9]{2}$'
LIMIT 50;

-- 17.1  각 lock 월 안의 schedule row 중 lock 적용 이후 updated 흔적 (updated_at > lock.updated_at)
-- NOTE: schedules.updated_at 컬럼이 없을 수 있음 (Section 1.2 결과 참조). 쿼리는 best-effort.
-- (Node audit 에서 schema 유무 확인 후 적용)


-- =============================================================================
-- SECTION 18 · EMPLOYEE CONTRACT INTEGRITY
-- =============================================================================

-- 18.1  orphan contracts
SELECT COUNT(*) AS orphan_contracts
FROM employee_contracts c
LEFT JOIN employees e ON e.id = c.employee_id
WHERE c.employee_id IS NOT NULL AND e.id IS NULL;

-- 18.2  duplicate active contract (같은 emp · 종료일 NULL 복수)
SELECT employee_id, COUNT(*) AS active_cnt
FROM employee_contracts
WHERE end_date IS NULL OR end_date = ''
GROUP BY employee_id
HAVING COUNT(*) > 1
LIMIT 50;

-- 18.3  기간 start > end
SELECT id, employee_id, start_date, end_date
FROM employee_contracts
WHERE start_date IS NOT NULL AND end_date IS NOT NULL AND end_date <> ''
  AND start_date::date > end_date::date
LIMIT 50;


-- =============================================================================
-- SECTION 19 · RESIGNATION INTEGRITY
-- =============================================================================

-- 19.1  resignation approved 완료 직원의 미래 schedule
-- NOTE: resignation_requests schema (effective_date / status) 는 Section 1.2 결과 확인 후 Node audit 에서 수행


-- =============================================================================
-- SECTION 20 · RESERVATION RELATION
-- =============================================================================

-- 20.1  reservations.assigned_employee_id FK 유효성
SELECT COUNT(*) AS orphan_reservations
FROM reservations r
LEFT JOIN employees e ON e.id = r.assigned_employee_id
WHERE r.assigned_employee_id IS NOT NULL AND e.id IS NULL;

-- 20.2  퇴직직원 미래 예약 (observable only · DELETE 금지)
SELECT r.id, r.date, r.time, r.assigned_employee_id, e.name, e."retireDate"
FROM reservations r
JOIN employees e ON e.id = r.assigned_employee_id
WHERE e."retireDate" IS NOT NULL AND e."retireDate" <> ''
  AND r.date::date > e."retireDate"::date
ORDER BY r.date DESC
LIMIT 50;


-- =============================================================================
-- SECTION 21-22 · SETTINGS STRUCTURE / CROSS CHECK
-- =============================================================================

-- 21.1  app_settings key 전수
SELECT key, jsonb_typeof(value::jsonb) AS value_type, updated_at
FROM app_settings
ORDER BY key;

-- 21.2  key duplicate (PK 이면 impossible · verify)
SELECT key, COUNT(*) AS cnt
FROM app_settings
GROUP BY key
HAVING COUNT(*) > 1
LIMIT 50;

-- 22.X  Settings ↔ Data cross check (Node audit 에서 JSON parse + set 매칭)


-- =============================================================================
-- SECTION 23-25 · DELETE BEHAVIOR / FK / INDEX (see Section 1.5, 1.6)
-- =============================================================================
-- All answered by Section 1.5 (foreign keys · ON DELETE rule) and Section 1.6 (indexes).

-- =============================================================================
-- END
-- =============================================================================
