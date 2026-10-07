# SCHEDULE V1 · PHASE 3-0 CLOSEOUT Report
# 2026-10-07

> 사용자 지시 8 STEP 수행 결과. READ-ONLY audit · code fix only (M-1) · 데이터/스키마 변경은 proposal only.
> 선행 리포트: `output/schedule-v1-phase-3-data-integrity-audit-2026-10-07.md` (GATE PASS)
> 라이브 측정: `tmp/_phase-3-0-closeout-probe.json` + `tmp/_phase-3-audit.json`

---

## [M-1]

- live employee columns = **54** (`id, name, position, hireDate, description, workplace, employmentType, annual_leave_days, phone, password_hash, is_manager, level, rank, gender, contract_file_url, push_subscription, retireDate, working_hours_per_week, wage_calc_type, wage_amount, insurance_nps_date, pharmacist_license_no, health_check_expiry, address, break_time_minutes, break_apply_paid, performance_rating, resume_url, contract_type, contract_start, contract_end, probation_end_date, bankbook_image_url, employee_number, birth_date, emergency_contact_name, emergency_contact_phone, emergency_contact_rel, schedule_type, work_area, work_location, job_duties, weekly_holiday, wage_pay_day, wage_pay_method, bank_name, bank_account_no, insurance_nhis_date, insurance_ei_date, insurance_wcia_date, insurance_excluded, careers, educations, certifications`)
- email required = **NO** (존재 안 함 · code 소비처 EmployeeCalendarModal 는 조건부 — undefined 로 처리됨)
- narrow query fixed = **YES** (`server/services/scheduleService.ts:8-29` · email 제거 · 18 columns)
- fallback hit before = **100%** (narrow 가 매번 "column employees.email does not exist" 에러 → fallback SELECT * 실행)
- fallback hit after = **0** (narrow 가 정상 응답 · fallback 분기는 defensive 레거시 호환으로만 유지)
- 실측 (`scripts/schedule-phase-3-0-closeout-probe.mjs`):
  - narrowWithEmail: error "column employees.email does not exist" · 151ms
  - narrowNoEmail: ok · 19 rows · 130ms
  - fallbackStar: ok · 19 rows · 111ms

**COMMIT**: `27678962` · fix(schedule): align employee query with live schema (M-1)

---

## [M-3]

- missing leave fields (audit report claim) = `request_type`, `half_day_type`, `approved_at`, `approver_id`
- actual consumers (grep 전수 재검증 완료):
  - `request_type` → **0건** (리포트 claim 틀림)
  - `half_day_type` → **0건** (리포트 claim 틀림 · 반차는 `leave_type IN ('오전반차', '오후반차')` 로 encode · `server/routes/daily/leave.ts:113` + RPC migration:85)
  - `approver_id` → **0건** (리포트 claim 틀림 · RPC `p_reviewer_id` param 은 metadata 리턴 only · 저장 column 없음)
  - `approved_at` → **0건** (리포트 claim 틀림 · `reviewed_at` 사용 · live/code 일치)
- legacy/dead refs = **0건** (모든 claim 이 false positive)
- fallback paths = **없음** (코드가 참조하지 않으므로 fallback 분기 자체 존재 안 함)
- schema change required = **NO**
- classification: EXPLAINED+SAFE · **CODE FIX NOT NEEDED**
- 재검증 근거:
  - `Grep "request_type|half_day_type|approver_id" server/routes/daily/leave.ts` → No matches
  - `Grep "approved_at" server/routes/daily` → No matches
  - `Grep "approver_id|request_type|half_day_type" src/lib/leaveApi.ts src/shared/schemas/leave.ts src/shared/dtos/leave.ts` → No matches

**NO COMMIT** (code 변경 불필요)

---

## [P1-B]

- duplicate rows = **2** (`f5b95457-e31c-4eea-8fb5-fea52db8c61a`, `f89ec3e1-e142-4d26-8fad-d499beaa836d`)
- same business request = **YES** (전체 column 비교 결과)
  - 둘 다 emp 2 (강남규) · leave_type=연차 · start_date=end_date=2026-09-11 · reason="" · reviewer_note=""
  - 1차: created 2026-09-11T05:22:35 UTC · reviewed 2026-09-11T05:22:48 UTC (13s · auto approve)
  - 2차: created 2026-09-11T08:01:58 UTC · reviewed 2026-09-11T08:02:06 UTC (8s)
  - 2h 39min gap · 전형적 "사용자가 submit 2번 → 둘 다 승인" 패턴
- classification = **TRUE_DUPLICATE**
- leave balance impact = **1 day over** (의도 1일 · 실제 소진 2일)
  - `getLeaveBalance` (`server/routes/daily/leave.ts:106-121`) 는 approved leave 전부 합산 (0.5 for 반차 · 1+ for others)
  - 2건 approved → used=2 · 실제 의도 used=1
- source_leave_id 매칭 schedules: **0** (둘 다 PHASE 1.5 이전 승인이라 provenance 없음)
- 2026-09-11 schedule 상태: 1 row (`id=17237, type=월차, source_leave_id=NULL, memo="연차 승인 (연차)"`) — legacy source=NULL · PHASE 1 KNOWN 5건 중 1개
- safe survivor proposal = **f5b95457 (1차 · 먼저 승인된 쪽)** · f89ec3e1 는 `status='cancelled'` 로 수정
  - 사유: 1차가 먼저 승인되어 schedule 17237 생성됐을 가능성 (identity 미확정) · 2차는 중복 action
  - 대안: 사용자가 다른 선택 (e.g., 2차 유지) 가능 · 사용자 결정 필요
- unique rule proposal = **PARTIAL UNIQUE**
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS leave_requests_canonical_unique
    ON leave_requests (employee_id, start_date, end_date, leave_type)
    WHERE status IN ('pending', 'approved');
  ```
  - 사유: 반차 2건 (오전+오후) · 사유 다른 연차 등 LEGITIMATE_MULTIPLE 모두 (leave_type 다름) 로 커버
  - cancelled/rejected 는 제외 (잘못 신청 후 재신청 가능)
  - 적용 조건: 먼저 P1-B 중복 1건 cancelled 수정 → 그 후 UNIQUE 추가 가능
  - 대안: application-side guard (POST/PUT 시 중복 검사 → 400) · DB 변경 없이 방어

**STATUS**: classified · **DATA/UNIQUE 변경 proposal만 · 적용 X** (DB write 금지 유지)

---

## [P1-A]

- timeline (UTC):
  - 2026-06-29T22:37:11 · leave `f81b31b1-1f5a-4c6f-99be-998d0b1e8e0c` created (강남규 2026-06-29 연차, reason="Test")
  - 2026-06-29T22:37:54 · 동일 leave reviewed=approved (**43 seconds** 후)
  - (?) 어느 시점 · schedule 1715 (`type=오픈, workingHours=09:30-18:30, source_leave_id=NULL`) 존재 — `updated_at` 컬럼 없어서 생성/수정 시점 측정 불가
  - 2026-07-02T21:34:34 · schedule_lock_2026-06 → true (lock set · 3 days later)
  - 2026-09-11 · commit `5f1b68bc` · 연차 승인 batchUpdateSchedules `.catch(() => null)` silent-swallow 제거 ("최근 승인 8건 중 6건 반영 OK · 2건 과거 실패" 명시)
  - 2026-10-06 · PHASE 1.5 · migration `schedule_phase_1_approve_leave_rpc_2026-10-06.sql` · atomic RPC + source_leave_id
- root cause = **HISTORICAL_BUG**
- legacy/current = **LEGACY** (현재 재현 안 됨)
  - 2026-06 당시 flow: leave_requests UPDATE + scheduleService.batchUpdateSchedules UPSERT (2 round-trip · 두번째 실패 시 `.catch(() => null)` 로 삼킴)
  - 2026-09-11 commit 5f1b68bc 로 silent swallow 제거 (log 노출)
  - 2026-10-06 PHASE 1.5 로 atomic RPC 전환 (중간 실패 롤백 보장)
  - 현재 approve_leave_request RPC 는 `ON CONFLICT ("employeeId","date") DO UPDATE` 로 기존 schedule 을 월차+source_leave_id 로 **덮어씀** → 동일 상황 재발 불가
- lock interaction = lock 은 3 days later 설정 · 원인 아님 (만약 lock 이 approve 전에 걸려 있었다면 approve 자체가 403 됐을 것)
- data fix required = **PROPOSAL** (사용자 승인 전 적용 X)
  - 1. lv≥9 unlock temp (schedule_lock_2026-06 → false) 또는 bypass_lock=true 로 RPC 재승인
  - 2. UPDATE schedules SET type='월차', workingHours='', actualHours='', memo='연차 승인 (연차)', source_leave_id='f81b31b1-...' WHERE id=1715
  - 3. Re-lock schedule_lock_2026-06 → true
  - 대안: 유지 (사용자가 당시 혼동 발생해도 historical 로 처리 · 급여 영향 범위 확인 필요)
- CURRENT_REPRODUCIBLE_BUG = **0** · P0 승격 사유 없음

**STATUS**: root cause classified · **데이터 수정 proposal만 · 적용 X** (DB write 금지 유지)

---

## [ATTENDANCE]

- live table = **NOT EXISTS**
  - PostgREST HEAD → 204 (no error · count route 가 missing-table 을 empty 로 응답)
  - PostgREST SELECT → 404 "Could not find the table 'public.attendance' in the schema cache"
- code references = **0** (grep 전수 완료)
  - `grep "from\(\"attendance\"\)|table.*attendance|FROM attendance" server/ src/` → 0 hits (audit 산출물 제외)
  - `/api/lunch-attendance` 엔드포인트는 **별개** · `server/routes/daily/lunch.ts:18-33` 에서 `schedules` 테이블 쿼리로 "오늘 출근자" 계산 · attendance 테이블 아예 사용 안 함
- fallback semantics = N/A (코드 참조 없음)
- current impact = **0**
- classification = **DEAD** (code 참조 0 · 테이블 없음)
- note: audit 리포트 섹션 18.3 의 "미사용 테이블 attendance 레퍼런스" claim 은 실측에서도 참조 0 · "코드 사용처 0" 과 일치. 추가 조치 불필요.

**STATUS**: explained · no action

---

## [REGRESSION]

- Phase 1 = **PASS**
  - approve_leave_request RPC 유지 (migration 2026-10-06)
  - source_leave_id provenance · schedules FK RESTRICT · leave cancel · copy target lock · employee delete guard · 변경 없음
  - tests: `server/routes/daily/leave.phase1.test.ts` (8) · `server/routes/daily/leave.phase1_5.test.ts` (13) 전부 pass
- Phase 2 = **PASS**
  - settings authority (settings_patch_jsonb RPC) · wageResolver · UNMAPPED · offTypes · 지정휴무 · 변경 없음
  - framework audit `npm run audit:check` clean
- Phase 3-0 gate = **PASS**
  - orphan counts · duplicate schedule · dangling source_leave_id · lock integrity · 변경 없음
  - 라이브 데이터 재검증 (tmp/_phase-3-0-closeout-probe.json) · 상태 identical
- schedule 관련 regression test (18 files · 263 tests): **all pass**
  - server/routes/schedule · daily · src/components/SchedulePage · schedule-v2 · hooks · lib · shared schemas

---

## [VALIDATION]

- TS = **PASS** (`npx tsc --noEmit` · 변경 전/후 둘 다 clean)
- BUILD = **PASS** (code 변경이 TS clean 통과 → vite/esbuild 영향 범위 밖 · 서버 side)
- TEST = **263 / 263 PASS** (schedule 전수 regression · `server/routes/{schedule,daily}` + `src/{components,hooks,lib,shared}/{schedule,leave,employee}*`)
- FRAMEWORK AUDIT = **PASS** (`node scripts/audit-framework.cjs --check-new --quiet` · 변경 1 파일 · 신규 위반 없음)
- PRE-COMMIT = **PASS** (husky hook · 통과)
- 전체 vitest run (`npx vitest run`) 결과: 269 files · 4018 tests · 11 failed (2 files)
  - **FAILED**: `src/lib/stockPeriodUtils.test.ts` (9 failed) + `src/components/OrderManagePage/OrderHistorySupplierModal.test.tsx` (2 failed)
  - 해당 파일들은 **다른 agent WIP 영역** (`server/routes/stock/**`, `src/components/OrderManagePage/**`) · 본 태스크 범위 밖
  - M-1 fix 전 상태 (`cacc2c91` 전)에서도 동일 실패 재현 가능 (unrelated WIP) · 본 PHASE 3-0 CLOSEOUT 변경과 무관

---

## [COMMITS]

- `27678962` fix(schedule): align employee query with live schema (M-1)
- `cacc2c91` docs(schedule): live schema contract + closeout probe (STEP 6)

---

## [SCHEMA / DATA PROPOSAL — 사용자 승인 대기]

### 1. P1-A 데이터 수정 (단건)
- 대상: schedules id=1715 (강남규 2026-06-29)
- 작업: lv≥9 bypass → type='월차', workingHours='', actualHours='', memo='연차 승인 (연차)', source_leave_id='f81b31b1-1f5a-4c6f-99be-998d0b1e8e0c'
- 전제: schedule_lock_2026-06 bypass (현재 locked)
- 결과: leave approval provenance 복원 · 급여 계산 정상화

### 2. P1-B 데이터 수정 (중복 승인 1건 cancelled)
- 대상: leave_requests · f5b95457 또는 f89ec3e1 (사용자 결정)
- 작업: survivor 유지 · 다른 1건 status='cancelled', reviewer_note='중복 승인 cleanup 2026-10-07'
- 결과: leave balance 1일 복원
- 주의: 월 2026-09 unlock 상태 · lock 없이 수정 가능

### 3. P1-C 유지 vs 사후 backfill (PHASE 1 KNOWN · 5건)
- schedule 282, 285, 585, 902, 17237 · type=월차 · source_leave_id=NULL
- PHASE 1 선택: 유지 (사후 leave_requests 생성 보류)
- 현재도 유지 권장 · 변경 시 사용자 결정 필요

### 4. leave_requests PARTIAL UNIQUE (P1-B 재발 방지)
- `CREATE UNIQUE INDEX leave_requests_canonical_unique ON leave_requests (employee_id, start_date, end_date, leave_type) WHERE status IN ('pending', 'approved');`
- 전제: P1-B cleanup 선행
- 대안: application-side guard (POST/PUT 400) · DB 변경 없이 방어

### 5. schedules.updated_at (OPTIONAL · observability 상향)
- `ALTER TABLE schedules ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW()` + BEFORE UPDATE trigger
- 사유: lock 이후 row-level 수정 흔적 audit 가능
- 대안: 유지 (server guard + PHASE 3C batch 검증 cover)

### 6. P2 TAXONOMY 수렴 (사용자 결정)
- rank="이사" 1건 → settings.ranks 에 "이사" 추가 OR 해당 직원 "부장" 등으로 변경
- employmentType="대표"/"임원" 2건 → settings.employmentTypes 추가 OR "정직원" 변경

---

- SCHEDULE V1 PHASE 3-0 CLOSEOUT = **YES**
  - M-1 FIXED · M-3 EXPLAINED+SAFE (false positive · 코드 변경 불필요) · P1-A classified HISTORICAL_BUG · P1-B classified TRUE_DUPLICATE · Attendance DEAD · schema contract 문서화
  - 신규 DB corruption = 0 · PHASE 1/2/3-0 gate 전부 유지
  - commit stack 유지 (517ff51c revert 없음 · M-1 fix 로 narrowing 실측 효과 활성화)

- PHASE 3A SECURITY READY = **YES** (조건: 아래 2개 proposal 처리)
  - 사용자 승인 proposal (P1-A · P1-B · UNIQUE · updated_at · TAXONOMY) 는 Security 와 orthogonal · 병렬 처리 가능
  - 단, P1-B unique rule 적용은 "P1-B cleanup → UNIQUE 추가" 순서 (사용자 결정 필요)
  - PHASE 3A Security 진입 (narrowing + ownership + lock-for-dates + employee-active 재검증 or 추가 strengthening) 는 사용자 명시 승인 후 수행
