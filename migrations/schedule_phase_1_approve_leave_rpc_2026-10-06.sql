-- 2026-10-06 · PHASE 1 / 1.5 · 연차 승인 ATOMIC RPC
--
-- 목적:
--   원래 서버에서 (1) leave_requests UPDATE + (2) scheduleService.batchUpdateSchedules UPSERT 를
--   두 번의 Supabase round-trip 으로 실행 → 중간 실패 시 부분 불일치 (leave=approved · schedules=미반영).
--   본 RPC 는 두 작업을 하나의 PL/pgSQL 트랜잭션으로 묶어 어느 단계 실패 시 전체 롤백.
--
-- PHASE 1.5 변경사항:
--   · 파라미터 재설계 (p_bypass_lock) · 서버 route 가 명시적으로 bypass 여부 전달
--   · schedule type 결정은 RPC 안에서 수행 (leave_type 기반) · 서버 중복 제거
--   · source_leave_id 저장 추가 (PHASE 1.5 · 10) · 생성된 schedules 가 어느 leave_request 로부터 왔는지 역추적 가능
--   · ON CONFLICT (employeeId, date) DO UPDATE 시 source_leave_id 도 함께 설정 (덮어쓴 schedule 의 provenance 명시)
--
-- 서버는 아래와 같이 호출:
--   const { error } = await supabase.rpc("approve_leave_request", {
--     p_request_id: id,
--     p_reviewer_id: authSession.employeeId,
--     p_reviewer_note: reviewer_note ?? "",
--     p_bypass_lock: authSession.level >= 9,
--   });
--
-- 알림/푸시 발송은 RPC 성공(commit) 이후 서버에서 별도로 호출.
-- 알림 실패는 approval 트랜잭션 롤백 대상이 아님.
--
-- 적용 선행 조건:
--   [ ] schedules 에 source_leave_id UUID NULL 컬럼 추가 (migrations/schedule_phase_1_5_source_leave_id_2026-10-06.sql)
--   [ ] schedules UNIQUE/PK (employeeId, date) 확인
--   [ ] leave_requests.status pending/approved/rejected 사용
--
-- 적용은 사용자 승인 후 Supabase SQL Editor 수동 실행.
-- 적용 전에는 서버가 호출 시 Supabase "function not found" 오류 반환 → 사용자가 DB migration 선 적용 → 코드 deploy.
--
-- 안전 정책:
--   · ON DELETE CASCADE 금지 (PHASE 1.5 FK 섹션 11 참조)
--   · 알림/푸시 는 RPC 밖에서 서버 수행
--   · 서버 수준 ownership/permission check 는 RPC 외부에서 수행

CREATE OR REPLACE FUNCTION approve_leave_request(
  p_request_id uuid,
  p_reviewer_id integer,
  p_reviewer_note text DEFAULT '',
  p_bypass_lock boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_request leave_requests%ROWTYPE;
  v_date date;
  v_month text;
  v_lock_value jsonb;
  v_schedule_type text;
  v_memo text;
  v_count integer := 0;
BEGIN
  -- 1. 요청 row 잠금 + 읽기 (concurrent 승인 방지)
  SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LEAVE_NOT_FOUND: leave request % not found', p_request_id
      USING ERRCODE = 'NO_DATA_FOUND';
  END IF;

  -- 2. 상태 가드 · pending 이 아니면 중복 승인 거부 (idempotency)
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'LEAVE_NOT_PENDING: current status is %', v_request.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 3. 월별 lock 재검증 (bypass=false 호출자만 · 서버 route 는 이미 사전 검증 · RPC 안 중복 안전장치)
  --    각 날짜의 YYYY-MM 추출 → schedule_lock_YYYY-MM 조회 → true 이면 abort
  IF p_bypass_lock = false THEN
    v_date := v_request.start_date;
    WHILE v_date <= v_request.end_date LOOP
      v_month := to_char(v_date, 'YYYY-MM');
      SELECT value INTO v_lock_value FROM app_settings WHERE key = 'schedule_lock_' || v_month;
      IF v_lock_value::text = 'true' THEN
        RAISE EXCEPTION 'SCHEDULE_LOCKED: month % is locked', v_month
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      v_date := v_date + 1;
    END LOOP;
  END IF;

  -- 4. schedule type 결정 (leave_type 기반)
  --    오전반차 · 오후반차 → 그대로 · 그 외 → 월차
  IF v_request.leave_type IN ('오전반차', '오후반차') THEN
    v_schedule_type := v_request.leave_type;
  ELSE
    v_schedule_type := '월차';
  END IF;
  v_memo := '연차 승인 (' || v_request.leave_type || ')';

  -- 5. leave_requests 상태 업데이트
  UPDATE leave_requests
     SET status = 'approved',
         reviewer_note = COALESCE(p_reviewer_note, ''),
         reviewed_at = NOW()
   WHERE id = p_request_id;

  -- 6. schedules UPSERT (날짜별 1 row) · source_leave_id 함께 저장
  --    ON CONFLICT ("employeeId", "date") DO UPDATE
  --    기존 수동 수정 schedules 가 있으면 type/source_leave_id 를 연차 승인본으로 덮어씀
  --    (사용자 지시: provenance 추적 가능하도록 매 승인에 source_leave_id 보장)
  v_date := v_request.start_date;
  WHILE v_date <= v_request.end_date LOOP
    INSERT INTO schedules ("employeeId", "date", "type", "workingHours", "actualHours", memo, source_leave_id)
    VALUES (
      v_request.employee_id,
      v_date::text,
      v_schedule_type,
      '',
      '',
      v_memo,
      p_request_id
    )
    ON CONFLICT ("employeeId", "date") DO UPDATE
      SET "type" = EXCLUDED."type",
          "workingHours" = EXCLUDED."workingHours",
          "actualHours" = EXCLUDED."actualHours",
          memo = EXCLUDED.memo,
          source_leave_id = EXCLUDED.source_leave_id;
    v_date := v_date + 1;
    v_count := v_count + 1;
  END LOOP;

  -- 7. 함수 종료 시 commit · 어느 하나 실패하면 전체 롤백 (EXCEPTION propagation)
  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'employee_id', v_request.employee_id,
    'schedule_type', v_schedule_type,
    'dates_count', v_count,
    'reviewer_id', p_reviewer_id
  );
END;
$$;

COMMENT ON FUNCTION approve_leave_request IS
  '2026-10-06 PHASE 1 / 1.5 · 연차 승인 ATOMIC RPC · leave_requests UPDATE + schedules UPSERT + source_leave_id provenance 를 하나의 트랜잭션으로 수행. 알림/푸시는 서버에서 commit 이후 별도 호출.';

-- 서버 호출 매핑 (routes/daily/leave.ts):
--   const { data, error } = await supabase.rpc("approve_leave_request", {
--     p_request_id: req.params.id,
--     p_reviewer_id: authSession.employeeId,
--     p_reviewer_note: reviewer_note ?? "",
--     p_bypass_lock: authSession.level >= 9,
--   });
--   if (error) {
--     const msg = error.message ?? "";
--     if (/SCHEDULE_LOCKED/.test(msg)) throw new HttpError(403, "확정된 달은 수정할 수 없습니다.", "SCHEDULE_LOCKED");
--     if (/LEAVE_NOT_FOUND/.test(msg)) throw new HttpError(404, "연차 요청을 찾을 수 없습니다.", "NOT_FOUND");
--     if (/LEAVE_NOT_PENDING/.test(msg)) throw new HttpError(409, "이미 처리된 요청입니다.", "LEAVE_NOT_PENDING");
--     throw new HttpError(500, msg);
--   }
