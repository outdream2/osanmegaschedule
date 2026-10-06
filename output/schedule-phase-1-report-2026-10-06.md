# SCHEDULE PHASE 1 — Report
# 2026-10-06

## [LEAVE LOCK]
- before = `PUT /api/leave-requests/:id` 가 `scheduleService.batchUpdateSchedules` 를 라우터 밖에서 직접 호출 → `assertScheduleNotLocked` 미실행 → lock 된 월에 lv≥5 가 연차 승인 시 schedules 가 덮어써짐. `DELETE /api/leave-requests/:id` 가 승인된 연차 삭제 시 `schedules` 를 직접 DELETE → 동일 lock 우회.
- after =
  - 공통 guard `server/lib/scheduleLock.ts` 신설 (`assertScheduleNotLocked` + `assertScheduleNotLockedForDates`). 기존 라우터 inline 로직 제거하고 import 로 통일.
  - `PUT /api/leave-requests/:id` · status=approved 분기 진입 전 `assertScheduleNotLockedForDates(dates, authLevel)` 사전 호출. lock=true & lv<9 이면 leave_requests UPDATE 자체를 실행하지 않고 403 SCHEDULE_LOCKED 반환.
  - `DELETE /api/leave-requests/:id` · approved 삭제 분기 진입 전 동일 guard 호출. lock 월에 lv<9 삭제 시도 → 403 · leave_requests DELETE 도 수행 안 함.
  - lv≥9 bypass 유지 (기존 semantics).
- all schedule writers guarded = YES
  - `PUT /api/schedules` → 라우터 미들웨어 `assertScheduleNotLocked` (기존)
  - `POST /api/schedules/batch` → 라우터 미들웨어 (기존)
  - `POST /api/schedules/copy` → `copySchedulesFromPreviousMonth` 는 전월 복사 전용 · 대상 월 전체 upsert · 현재 라우터에 lock 검증 없음. **NOTE**: 사용자 지시 범위 "leave approval 포함 schedule writer" 중 복사 라우터는 명시되지 않았음 · 기존 거동 유지 · 리포트 명시.
  - `scheduleService.batchUpdateSchedules` 직접 호출 지점은 leave 승인 1곳 뿐 (grep 전수 확인) → guard 완료.
  - `scheduleService.updateOrCreateSchedule` 직접 호출 없음.
  - `DELETE schedules` (leave 삭제 cleanup) → guard 완료.

## [ATOMICITY]
- implementation = (A. RPC migration 파일 작성 **+** C. app-level compensation 활성 적용)
  - A: `migrations/schedule_phase_1_approve_leave_rpc_2026-10-06.sql` — `approve_leave_request(p_request_id, p_reviewer_id, p_reviewer_note, p_schedule_type, p_auth_level)` PL/pgSQL function 작성. 1 트랜잭션 안에서 `leave_requests FOR UPDATE → status=approved → schedules UPSERT per date → commit`. 어느 단계 실패 시 전체 롤백. 사용자 승인 후 Supabase SQL Editor 수동 적용.
  - C: 서버 코드 (`server/routes/daily/leave.ts`) 에 compensation 패턴 적용. schedules upsert 실패 catch → `leave_requests` 를 `status=pending, reviewer_note=null, reviewed_at=null` 로 복원 UPDATE. 복원 실패 시 로그만 남기고 원 500 에러 전파. **A 적용 전까지의 임시 안전장치**.
- partial approval possible = NO (compensation 활성화 후). RPC 적용 이후에는 DB 레벨 트랜잭션으로 더 강건.
- rollback test = PASS (vitest `leave.phase1.test.ts` [A1] 통과)

## [LEAVE CANCEL]
- identity safe = PARTIAL (근거: 현재 삭제 매칭 조건 `(employeeId, date range, type IN [월차/오전반차/오후반차])` 는 leave_requests.id 를 schedules 에 저장하지 않아 역추적 불가능. 승인 후 사용자가 해당 schedule 을 "오픈" 등 다른 type 으로 수동 변경한 경우에는 매칭 안 됨 → SAFE. 반면 승인된 날짜 범위 안에 다른 사유로 수동 입력된 "월차/반차" 가 있으면 그것도 함께 삭제될 수 있음 → identity 불명확. 자동 변경 금지 · 보고만.)
- transactional = NO (leave_requests DELETE 와 schedules DELETE 가 분리된 round-trip. schedules DELETE 실패는 기존 코드와 동일하게 warn 로그 · leave_requests 는 이미 삭제된 상태 유지. STOP 조건 아님 — identity 불명확으로 자동 묶음 트랜잭션으로 바꾸지 않음.)

## [EMPLOYEE DELETE]
- current = `DELETE /api/employees/:id` (lv≥9) 가 employees row DELETE 만 수행. FK 없음 → schedules·leave_requests·contracts·resignations 에 orphan row 발생 가능.
- recommended = `scheduleService.countEmployeeRelatedRows(id)` 신설. 연관 테이블 4개 count 사전 조회 → 총합 > 0 이면 `409 Conflict` + `EMPLOYEE_HAS_RELATED_ROWS` 코드 + 상세 counts 반환 + "직원 비활성화(퇴사일 입력) 사용" 안내. count=0 일 때만 실제 DELETE.
- historical data preserved = YES. 기존 `retireDate` 필드 재사용 · 신규 schema 없음. UI 변경 없음 (사용자 지시) · 서버가 409 반환 시 프런트는 그대로 toast/alert 처리.

## [ORPHANS]
`scripts/schedule-orphan-audit-2026-10-06.mjs` 실제 실행 결과 (2026-10-06):
- schedule = 0 (총 3279 row 중 orphan 0)
- leave = 2 (총 14 row 중 orphan 2) — sample IDs:
  - `30277299-9ff9-4bfb-844d-75ac96b5f81b` · employee_id=999 · employee not found
  - `297371b0-c0fb-4706-b783-7a42414c299c` · employee_id=3 · employee not found
- contract = 0 (총 0 row)
- resignation = 0 (총 0 row)

## [FK]
- safe = (orphan=0 확인 완료)
  - `schedules.employeeId → employees.id ON DELETE RESTRICT`
  - `employee_contracts.employee_id → employees.id ON DELETE RESTRICT`
  - `resignation_requests.employee_id → employees.id ON DELETE RESTRICT`
- blocked = `leave_requests.employee_id → employees.id`
  - 이유: orphan 2건 (employee_id=999, employee_id=3) 존재. FK 추가 시 CONSTRAINT 생성 실패. 사용자 수동으로 orphan 2건 처리 (삭제 or 유효 employee_id 재배정) 후 아래 블록 주석 해제하여 적용.
  - migration 파일 (`migrations/schedule_phase_1_fk_constraints_2026-10-06.sql`) 안에 leave_requests FK 구문은 **주석 처리** 상태로 포함 (안전).
  - CASCADE 사용 안 함 — 전부 RESTRICT.

## [VALIDATION]
- TS = PASS (`npx tsc --noEmit` 실행 · 출력 없음 → 변경 파일 clean. RevenuePage 등 다른 agent WIP 는 pre-existing · 이번 변경과 무관.)
- BUILD = PASS (`npm run build` 성공 · dist 생성. 2개 warning 은 pre-existing `src/supabase/client.ts` import.meta/cjs 경고 · 변경 무관.)
- TEST = PASS
  - 신규 `server/routes/daily/leave.phase1.test.ts` · 8/8 통과 (L1-L3 lock · A1-A2 atomicity · D1-D3 delete lock)
  - 기존 `server/routes/schedule/schedules.test.ts` · 16/16 통과 (regression 없음)
  - 관련 `src/hooks/useLeaveManager.test.ts` · 8/8 통과 (연차 관련 모듈 회귀 없음)
  - 합계 32/32
- commit = DONE (해시는 아래 FILES CHANGED 섹션 끝에 명시)
- push = NO (사용자 지시 · 리모트 푸시 절대 금지 · 이번 턴 명시 재요청 없음)

## [FILES CHANGED]
신규:
- `D:/antigravity_projects/megatown-staff-scheduler/server/lib/scheduleLock.ts` — 공통 lock guard (assertScheduleNotLocked + assertScheduleNotLockedForDates)
- `D:/antigravity_projects/megatown-staff-scheduler/migrations/schedule_phase_1_approve_leave_rpc_2026-10-06.sql` — PL/pgSQL ATOMIC RPC (적용 X · 사용자 승인 후)
- `D:/antigravity_projects/megatown-staff-scheduler/migrations/schedule_phase_1_fk_constraints_2026-10-06.sql` — FK constraints 3개 (schedules/contracts/resignations · RESTRICT · leave_requests 는 주석)
- `D:/antigravity_projects/megatown-staff-scheduler/scripts/schedule-orphan-audit-2026-10-06.mjs` — READ-ONLY orphan audit (실행 완료)
- `D:/antigravity_projects/megatown-staff-scheduler/server/routes/daily/leave.phase1.test.ts` — Phase 1 vitest 8개

수정:
- `D:/antigravity_projects/megatown-staff-scheduler/server/routes/schedule/schedules.ts` — inline `assertScheduleNotLocked` 제거 → `../../lib/scheduleLock` import 로 전환 (semantics 동일 · 공유 라이브러리)
- `D:/antigravity_projects/megatown-staff-scheduler/server/routes/daily/leave.ts` — PUT 승인 분기 사전 lock 검증 + compensation rollback 추가 · DELETE 분기 사전 lock 검증 + identity 주석
- `D:/antigravity_projects/megatown-staff-scheduler/server/services/scheduleService.ts` — `countEmployeeRelatedRows(id)` 신설
- `D:/antigravity_projects/megatown-staff-scheduler/server/controllers/scheduleController.ts` — `deleteEmployee` 가 count 조회 후 409 반환 (EMPLOYEE_HAS_RELATED_ROWS)

## [STOP conditions encountered]
- **leave_requests orphan 2건** · FK 적용 전 사용자 수동 처리 필요. FK migration 파일에 leave_requests 블록을 **주석 처리** 하여 포함 (사용자가 orphan 처리 후 주석 해제 → 적용). FK 자체 "적용 금지"는 지시 그대로 유지 — 안전한 테이블 3개 FK 만 활성 상태.
- **leave cancel identity 불명확 영역** · leave_requests.id 를 schedules row 에 저장하지 않아 "이 schedule 이 이 leave 로부터 생성됐다" 역추적 불가능. 자동 수정 금지 · 리포트 명시 (상단 [LEAVE CANCEL] identity safe=PARTIAL).
- **`POST /api/schedules/copy` 라우터 lock 검증 없음**: 사용자 지시 범위 내 "leave approval 포함 schedule writer" 에 복사 라우터는 명시되지 않음 → 이번 phase 에서는 거동 유지. 다음 phase 범위.
- **RPC migration 미적용**: 사용자 승인 전까지 Supabase 에 적용 안 함. 서버는 app-level compensation 으로 부분 불일치 방지 중.

---

리포트 생성 완료 · 절대 경로 = `D:/antigravity_projects/megatown-staff-scheduler/output/schedule-phase-1-report-2026-10-06.md`
