-- 2026-10-06 · 방문예약 담당자 FK 전환
--   · ADD-only · 기존 column/row 영향 0
--   · BACKFILL = NO · legacy [대상:xxx] note 유지 · 자동 매칭 금지
--   · FK ON DELETE NO ACTION (직원 삭제 시 예약 보호 · RESTRICT 와 동일 효과)
--
-- 수동 적용: Supabase SQL Editor 에서 아래 전체 블록 실행
-- 실행 전 pre-check 필수:
--   SELECT COUNT(*) AS total_rows FROM reservations;
--   SELECT COUNT(*) AS already_added FROM information_schema.columns
--     WHERE table_name='reservations' AND column_name='assigned_employee_id';

-- 1. ADD columns · IF NOT EXISTS · idempotent
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS assigned_employee_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS employee_name_snapshot TEXT NULL;

-- 2. FK · ON DELETE NO ACTION
--   · 기존 FK 중복 확인 후 추가
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'reservations'
      AND constraint_name = 'reservations_assigned_employee_id_fkey'
  ) THEN
    ALTER TABLE reservations
      ADD CONSTRAINT reservations_assigned_employee_id_fkey
      FOREIGN KEY (assigned_employee_id)
      REFERENCES employees(id)
      ON DELETE NO ACTION;
  END IF;
END $$;

-- 3. 성능 index · (담당자, 날짜, 시간) 조합 조회용 · 중복 체크
CREATE INDEX IF NOT EXISTS reservations_assignee_date_idx
  ON reservations (assigned_employee_id, date, time);

-- 4. unique partial · 고정 slot 전제 · race 방지 · 기존 NULL row 영향 없음
--   · WHERE assigned_employee_id IS NOT NULL · legacy row 제외
CREATE UNIQUE INDEX IF NOT EXISTS reservations_unique_slot_per_assignee
  ON reservations (assigned_employee_id, date, time)
  WHERE assigned_employee_id IS NOT NULL;

-- 적용 후 verify (수동):
--   SELECT COUNT(*) FROM reservations;                                           -- 변경 전과 동일
--   SELECT COUNT(*) FROM reservations WHERE assigned_employee_id IS NULL;         -- 전체 (BACKFILL=NO)
--   SELECT COUNT(*) FROM reservations WHERE note LIKE '[대상:%';                   -- legacy 노트 그대로
