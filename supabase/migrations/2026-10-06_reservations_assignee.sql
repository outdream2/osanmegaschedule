-- 2026-10-06 · 방문예약 담당자 FK 전환 (#VisitorReservationEmployeeAssignment)
--   · ADD-only · 기존 column/row 영향 0
--   · BACKFILL = NO · legacy [대상:xxx] note 유지 · 자동 매칭 금지
--   · FK ON DELETE NO ACTION (직원 삭제 시 예약 보호 · RESTRICT 와 동일 효과)
--
-- 2026-10-06 Phase 1/2/3 HARDENING (precheck 결과 반영):
--   · employees.id = BIGINT (PostgREST OpenAPI 확인) → assigned_employee_id BIGINT 일치
--   · reservations.status 컬럼 미존재 → 취소 semantics = DELETE row → partial unique 조건 그대로 유효
--   · reservations row count = 0 (migration 시점) → data loss risk 0
--   · information_schema 쿼리 전부 table_schema='public' 명시 (search_path 안정화)
--
-- 적용 방법: Supabase SQL Editor 에서 아래 전체 블록 실행 (idempotent)
-- 실행 전 pre-check (READ-ONLY):
--   SELECT COUNT(*) AS total_rows FROM public.reservations;
--   SELECT COUNT(*) AS already_added FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='reservations' AND column_name='assigned_employee_id';

-- 1. ADD columns · IF NOT EXISTS · idempotent
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS assigned_employee_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS employee_name_snapshot TEXT NULL;

-- 2. FK · ON DELETE NO ACTION
--   · 기존 FK 중복 확인 후 추가 · 명시적 public 스키마 필터
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'reservations'
      AND constraint_name = 'reservations_assigned_employee_id_fkey'
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_assigned_employee_id_fkey
      FOREIGN KEY (assigned_employee_id)
      REFERENCES public.employees(id)
      ON DELETE NO ACTION;
  END IF;
END $$;

-- 3. 성능 index · (담당자, 날짜, 시간) 조합 조회용 · 중복 체크
CREATE INDEX IF NOT EXISTS reservations_assignee_date_idx
  ON public.reservations (assigned_employee_id, date, time);

-- 4. unique partial · 고정 slot 전제 · race 방지 · 기존 NULL row 영향 없음
--   · WHERE assigned_employee_id IS NOT NULL · legacy row 제외
--   · 취소 semantics = DELETE row (status 컬럼 미존재 확인 완료) → status 조건 불필요
CREATE UNIQUE INDEX IF NOT EXISTS reservations_unique_slot_per_assignee
  ON public.reservations (assigned_employee_id, date, time)
  WHERE assigned_employee_id IS NOT NULL;

-- 적용 후 verify (READ-ONLY):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='reservations'
--       AND column_name IN ('assigned_employee_id','employee_name_snapshot');
--   SELECT constraint_name FROM information_schema.table_constraints
--     WHERE table_schema='public' AND table_name='reservations'
--       AND constraint_name='reservations_assigned_employee_id_fkey';
--   SELECT indexname FROM pg_indexes
--     WHERE schemaname='public' AND tablename='reservations'
--       AND indexname IN ('reservations_assignee_date_idx','reservations_unique_slot_per_assignee');
--   SELECT COUNT(*) FROM public.reservations;                                  -- baseline 과 동일
--   SELECT COUNT(*) FROM public.reservations WHERE assigned_employee_id IS NULL;  -- 전체 (BACKFILL=NO)
--   SELECT COUNT(*) FROM public.reservations WHERE note LIKE '[대상:%';           -- legacy 노트 그대로
