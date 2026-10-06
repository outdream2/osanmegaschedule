-- 2026-10-06 · PHASE 1 · 연차 승인 ATOMIC RPC
--
-- 목적:
--   현재 PUT /api/leave-requests/:id (status=approved) 는 서버에서
--     1) leave_requests UPDATE
--     2) scheduleService.batchUpdateSchedules → schedules UPSERT
--   를 두 번의 Supabase round-trip 으로 수행 → 중간 실패 시 부분 불일치 (leave=approved · schedules=미반영)
--
-- 이 RPC 는 두 작업을 하나의 PL/pgSQL 트랜잭션 안에서 실행 → 어느 단계 실패하든 전체 롤백.
-- 서버는 아래와 같이 호출:
--   const { data, error } = await supabase.rpc("approve_leave_request", {
--     p_request_id: id,
--     p_reviewer_id: authUser.sub,
--     p_reviewer_note: reviewer_note ?? "",
--     p_schedule_type: scheduleType,
--     p_auth_level: authLevel,
--   });
--
-- 알림/푸시 발송은 RPC 성공(commit) 이후 서버에서 별도로 호출.
-- 알림 실패는 approval 트랜잭션 롤백 대상이 아님.
--
-- 적용은 사용자 승인 후 Supabase SQL Editor 에서 수동 실행.
-- 적용 전에는 서버가 app-level compensation (routes/daily/leave.ts) 으로 부분 불일치 방지.
--
-- 안전 체크리스트 (적용 전):
--   [ ] schedules 테이블의 PK/UNIQUE 가 ("employeeId", "date") 임을 확인
--   [ ] leave_requests.status 가 pending → approved → rejected 중 하나만 쓰이는 상태인지 확인
--   [ ] 월 lock (schedule_lock_YYYY-MM) 검증은 서버에서 사전 호출 (RPC 는 lv<9 lock 재검증 수행 · 중복 안전장치)
--   [ ] CASCADE 없음 (요청 삭제가 RPC 안에서 schedules 를 자동 삭제하지 않음)

CREATE OR REPLACE FUNCTION approve_leave_request(
  p_request_id uuid,
  p_reviewer_id integer,
  p_reviewer_note text DEFAULT '',
  p_schedule_type text DEFAULT '월차',
  p_auth_level integer DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_request leave_requests%ROWTYPE;
  v_date date;
  v_month text;
  v_lock_value jsonb;
BEGIN
  -- 1. 요청 row 잠금 + 읽기 (concurrent 승인 방지)
  SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'leave request not found: %', p_request_id USING ERRCODE = 'NO_DATA_FOUND';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'leave request not pending (current status: %)', v_request.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 2. 월별 lock 재검증 (lv<9 호출자만 · 서버 route 는 이미 사전 검증했지만 RPC 안에서 재검증 안전장치)
  --    각 날짜의 YYYY-MM 추출 → schedule_lock_YYYY-MM 조회 → true 이면 abort
  IF p_auth_level < 9 THEN
    v_date := v_request.start_date;
    WHILE v_date <= v_request.end_date LOOP
      v_month := to_char(v_date, 'YYYY-MM');
      SELECT value INTO v_lock_value FROM app_settings WHERE key = 'schedule_lock_' || v_month;
      IF v_lock_value::text = 'true' THEN
        RAISE EXCEPTION 'schedule locked for month % (SCHEDULE_LOCKED)', v_month
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      v_date := v_date + 1;
    END LOOP;
  END IF;

  -- 3. leave_requests 상태 업데이트
  UPDATE leave_requests
     SET status = 'approved',
         reviewer_note = COALESCE(p_reviewer_note, ''),
         reviewed_at = NOW()
   WHERE id = p_request_id;

  -- 4. schedules UPSERT (날짜별 1 row)
  --    ON CONFLICT ("employeeId", "date") DO UPDATE
  --    기존 수동 수정 schedules 가 있으면 type 을 연차로 덮어씀 (기존 동작 유지)
  v_date := v_request.start_date;
  WHILE v_date <= v_request.end_date LOOP
    INSERT INTO schedules ("employeeId", "date", "type", "workingHours", "actualHours", memo)
    VALUES (
      v_request.employee_id,
      v_date::text,
      p_schedule_type,
      '',
      '',
      '연차 승인 (' || v_request.leave_type || ')'
    )
    ON CONFLICT ("employeeId", "date") DO UPDATE
      SET "type" = EXCLUDED."type",
          "workingHours" = EXCLUDED."workingHours",
          "actualHours" = EXCLUDED."actualHours",
          memo = EXCLUDED.memo;
    v_date := v_date + 1;
  END LOOP;

  -- 5. 함수 종료 시 commit · 어느 하나 실패하면 전체 롤백 (EXCEPTION propagation)
END;
$$;

COMMENT ON FUNCTION approve_leave_request IS
  '2026-10-06 PHASE 1 · 연차 승인 ATOMIC RPC · leave_requests UPDATE + schedules UPSERT 를 하나의 트랜잭션으로 수행. 알림/푸시는 서버에서 commit 이후 별도 호출.';

-- 사용 예 (서버 쪽에서 교체 시 참고):
--   const { error } = await supabase.rpc("approve_leave_request", {
--     p_request_id: req.params.id,
--     p_reviewer_id: authUser.sub,
--     p_reviewer_note: reviewer_note ?? "",
--     p_schedule_type: scheduleType,  // '월차' | '오전반차' | '오후반차'
--     p_auth_level: authLevel,
--   });
--   if (error) {
--     if (/SCHEDULE_LOCKED/.test(error.message)) throw new HttpError(403, "확정된 달은 수정할 수 없습니다.", "SCHEDULE_LOCKED");
--     throw new HttpError(500, error.message);
--   }
