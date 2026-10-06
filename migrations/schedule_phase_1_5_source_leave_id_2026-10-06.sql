-- 2026-10-06 · PHASE 1.5 · schedules.source_leave_id 컬럼 추가
--
-- 목적:
--   연차 승인에 의해 생성된 schedules row 가 어느 leave_requests 로부터 생성됐는지
--   역추적 가능하도록 FK-like 참조 컬럼 추가.
--
-- 효과:
--   · 연차 cancel 시 (employeeId, date range, type) 매칭이 아닌 source_leave_id 매칭으로 정확한 cleanup
--   · 수동으로 입력된 schedule 과 연차 승인본 명확히 구분
--   · 사용자가 승인 후 수동 변경한 schedule 은 ON CONFLICT UPDATE 시 source_leave_id 갱신되지만
--     이는 provenance 가 명확한 "연차 승인본" 임을 의미 · 재승인/재배정 추적 가능
--
-- 안전 정책:
--   · NULL 허용 (레거시 수동 schedule row 호환) · default NULL
--   · FK 미설정 (section 11 결정에 따라 추후 추가 or SET NULL 정책 적용 가능)
--   · ON DELETE CASCADE 금지 (사용자 지시 · 역사적 데이터 보존)
--
-- 적용 순서:
--   1. 이 migration 실행 (schedules.source_leave_id 추가)
--   2. approve_leave_request RPC 재생성 (migrations/schedule_phase_1_approve_leave_rpc_2026-10-06.sql · source_leave_id 저장 포함)
--   3. 서버 코드 deploy (routes/daily/leave.ts · PUT 핸들러 RPC 호출로 교체)
--
-- 롤백:
--   DROP INDEX IF EXISTS idx_schedules_source_leave_id;
--   ALTER TABLE schedules DROP COLUMN IF EXISTS source_leave_id;

BEGIN;

ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS source_leave_id uuid NULL;

COMMENT ON COLUMN schedules.source_leave_id IS
  '2026-10-06 PHASE 1.5 · 이 schedule row 가 어떤 leave_requests 로부터 생성됐는지 참조 · NULL=수동 입력 · UUID=연차 승인본';

CREATE INDEX IF NOT EXISTS idx_schedules_source_leave_id
  ON schedules(source_leave_id)
  WHERE source_leave_id IS NOT NULL;

-- FK 는 section 11 결정 후 별도 migration 으로 추가
-- 옵션 A (RESTRICT · 사용자가 cancel 트랜잭션으로 source_leave_id rows 선삭제)
-- 옵션 B (hard delete 금지 · "cancelled" 상태로 유지)
-- 옵션 C (SET NULL · leave 삭제 시 schedule.source_leave_id → NULL)
--
-- 리포트 (output/schedule-phase-1_5-report-2026-10-06.md) 의 [LEAVE PROVENANCE / FK] 참조.

COMMIT;

-- 검증 쿼리 (적용 후):
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name='schedules' AND column_name='source_leave_id';
--
--   SELECT indexname, indexdef FROM pg_indexes
--    WHERE tablename='schedules' AND indexname LIKE '%source_leave%';
