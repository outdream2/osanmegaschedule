# SCHEDULE PHASE 1.5 — Report
# 2026-10-06

PHASE 1 (commit `fbff9e69`) 의 후속 integrity 마무리. 사용자 지시 17 섹션 전수 수행. 어떠한 destructive DB operation 또는 production RPC migration 적용도 수행하지 않음.

---

## [ORPHANS]

**Forensic 조사 결과** (`scripts/schedule-orphan-forensic-2026-10-06.mjs` · READ-ONLY · 2026-10-06 실행):

### 999 (leave_id = `30277299-9ff9-4bfb-844d-75ac96b5f81b`)
- `employee_id = 999` · `employee_name = "테스트"` (DB 저장은 UTF-8 로 보이지만 로그에는 "�׽�Ʈ" mojibake 로 뜸 → 원 KSX-1001 저장가능성)
- `leave_type = "연차"` · `start_date = end_date = 2026-07-10` · `status = approved`
- `created_at = 2026-06-29T07:12:26Z` · `reviewed_at = 2026-06-29T07:12:56Z`
- 조사:
  - `employees` 에서 `id=999` 없음 (hard delete 흔적 or 애초에 없었음)
  - 해당 날짜 범위 (2026-07-10) `schedules` row 0건
  - `employee_contracts.employee_id=999` 0건
  - `resignation_requests.employee_id=999` 0건
  - `leave_requests.employee_id=999` 전체 1건 (본 row 뿐)
  - `schedules.employeeId=999` 최근 20건 0건
  - 매칭 notifications 0건
  - 현재 employees 전체 (id 분포: 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 18, 19, 21, 23, 24, 26) · "테스트" 이름 일치 0건
- **classification = B. 테스트 데이터 가능성 높음 (판별 불가 E 보류)**
  - 근거: id=999 가 메가타운 실제 직원 ID 패턴 (최대 26) 밖 · 이름이 "테스트" (일반 테스트 라벨) · 다른 활동 전무 · 승인/신청이 29초 간격 (관리자 self-approve 흔적)
  - 그러나 "명확한 증거 (예: test 플래그 컬럼)" 가 없으므로 E 로 보류 가능 · 사용자 판단 필요
- **recommended action 999 = `DELETE FROM leave_requests WHERE id = '30277299-9ff9-4bfb-844d-75ac96b5f81b'` · 사용자 승인 후**
  - 이유: 다른 활동 전무 · 삭제 시 schedules/notifications 변화 없음 · 테스트 패턴
  - **자동 처리 금지** · 사용자 명시 승인 전 실행 X

### 3 (leave_id = `297371b0-c0fb-4706-b783-7a42414c299c`)
- `employee_id = 3` · `employee_name = "박부장"`
- `leave_type = "연차"` · `start_date = end_date = 2026-07-02` · `status = approved`
- `created_at = 2026-07-02T15:30:44Z` · `reviewed_at = 2026-07-02T21:32:15Z`
- 조사:
  - `employees` 에서 `id=3` 없음 (hard delete 흔적) · 현재 id 분포 1, 2, 4, ... 로 id=3 slot 비어있음
  - 해당 날짜 범위 (2026-07-02) `schedules` row 0건
  - `employee_contracts.employee_id=3` 0건
  - `resignation_requests.employee_id=3` 0건
  - `leave_requests.employee_id=3` 전체 1건 (본 row 뿐)
  - `schedules.employeeId=3` 최근 20건 0건
  - 매칭 notifications 0건
  - 현재 employees 에서 "박부장" 이름 정확/부분 일치 0건
- **classification = E. 판별 불가**
  - 근거: id=3 는 과거 실제 사용된 ID 가능성이 있음 (id 분포 중간 삽입) · 그러나 어떤 직원이었는지 확정 불가 (현재 "박부장" 이름 매칭 0건)
  - "박부장" 은 실제 직책 성씨 패턴이지만 **이름 유사도 매칭 금지** (사용자 지시) · 다른 "박*" 직원으로 재배정하지 않음
  - 다른 활동 전무 (schedule/contract/resignation 0건) · "A. 실제 삭제된 과거 직원" 가능성은 있지만 명확 증거 부족
- **recommended action 3 = 사용자 결정 필요 · 두 옵션:**
  - 옵션 A: `DELETE FROM leave_requests WHERE id = '297371b0-c0fb-4706-b783-7a42414c299c'` · "과거 직원 흔적 정리" 로 간주
  - 옵션 B: 보존 유지 · FK 미설정 · 역사적 참고용으로 남김
  - **자동 처리 금지** · 사용자 명시 승인 전 실행 X

---

## [RPC]

- **SQL audit** (`migrations/schedule_phase_1_approve_leave_rpc_2026-10-06.sql`): PASS
  - `SELECT * FROM leave_requests WHERE id = p_request_id FOR UPDATE` · identity lock 확보
  - `status <> 'pending'` guard · idempotency 보장 (중복 승인 방지)
  - `p_bypass_lock = false` 시 `app_settings.schedule_lock_YYYY-MM` 재검증 · 날짜별 iteration
  - `leave_type` 기반 schedule type 결정 (오전반차/오후반차/월차) · 서버 중복 로직 제거
  - `leave_requests` UPDATE → `schedules` UPSERT (`ON CONFLICT (employeeId, date) DO UPDATE`) · 단일 트랜잭션
  - `source_leave_id = p_request_id` 저장 · provenance 추적 (PHASE 1.5 신규)
  - `RAISE EXCEPTION` 사용 (SCHEDULE_LOCKED / LEAVE_NOT_FOUND / LEAVE_NOT_PENDING) · 서버에서 message 매칭하여 적절 status 반환
  - 알림/푸시 미포함 (사용자 지시 그대로 · 서버에서 commit 후 수행)
  - CASCADE 없음

- **caller wired = YES** (`server/routes/daily/leave.ts` PUT 핸들러)
  - `supabase.rpc("approve_leave_request", { p_request_id, p_reviewer_id, p_reviewer_note, p_bypass_lock })` 로 교체
  - app-level compensation 블록 **제거** (RPC 가 atomicity 보장 · 중복 compensation 유지 금지)
  - RPC error 매핑:
    - `SCHEDULE_LOCKED` → 403
    - `LEAVE_NOT_FOUND` → 404
    - `LEAVE_NOT_PENDING` → 409
    - `function does not exist` → 500 `RPC_NOT_APPLIED` (명확 안내 메시지)
    - 그 외 → 500
  - 서버 route 사전 lock 검증 유지 (명확 에러 메시지) · RPC 내부 재검증은 중복 안전장치
  - 반려(rejected) 분기는 schedules 미영향 → 기존 단순 UPDATE 유지

- **atomic = YES** (RPC 레벨 PL/pgSQL 트랜잭션 · 어느 단계 실패 시 전체 롤백)

- **production applied = NO**
  - 사유: 사용자 승인 전까지 Supabase SQL Editor 수동 실행 금지 (STOP 조건)
  - 적용 순서 (사용자 orchestrate):
    1. `migrations/schedule_phase_1_5_source_leave_id_2026-10-06.sql` 적용 (schedules.source_leave_id 컬럼 추가)
    2. `migrations/schedule_phase_1_approve_leave_rpc_2026-10-06.sql` 적용 (RPC 재생성)
    3. 서버 code deploy (이번 commit)
  - 적용 전 서버 호출 시: `function approve_leave_request does not exist` → 서버 500 `RPC_NOT_APPLIED` → 사용자 안내

---

## [COPY LOCK]

`POST /api/schedules/copy` 에 target month lock 검증 추가 (`server/routes/schedule/schedules.ts`).

- source month (전월) lock 은 **읽기** 이므로 영향 없음 → 검증 skip (사용자 지시 그대로)
- `zone_day_assignments.is_confirmed` 와 schedule month lock 은 **다른 의미** · 임의 결합 없음 (사용자 지시 준수)
- `copySchedulesFromPreviousMonth` 내부 algorithm (요일 majority / upsert / zone copy) 변경 없음

Test 결과:
- **manager locked = PASS**: `[COPY-2]` locked target + lv5 → 403 (SCHEDULE_LOCKED)
- **superadmin = PASS**: `[COPY-3]` locked target + lv9 → bypass 성공
- **unlocked = PASS**: `[COPY-1]` unlocked target → 통과
- **tests = 3 PASS / 0 FAIL** (`server/routes/daily/leave.phase1_5.test.ts` [COPY LOCK] describe)

---

## [LEAVE PROVENANCE]

- **source_leave_id proposal**:
  - `ALTER TABLE schedules ADD COLUMN source_leave_id uuid NULL;`
  - default NULL · 레거시 수동 schedule row 호환
  - partial index: `CREATE INDEX idx_schedules_source_leave_id ON schedules(source_leave_id) WHERE source_leave_id IS NOT NULL;`
  - 저장:  RPC 가 ATOMIC APPROVE 시 매 schedule row 에 `source_leave_id = p_request_id` 세팅
  - 삭제: `DELETE /api/leave-requests/:id` 가 `source_leave_id` 매칭 → provenance 기반 cleanup · 매칭 0건이면 레거시 (NULL + employeeId/date/type) 폴백

- **safe backfill = 3** (`scripts/schedule-source-leave-backfill-dryrun-2026-10-06.mjs` 실행 결과)
- **unmapped = 4** (수동 schedule or 레거시 미기록 연차)
- **ambiguous = 1** (`schedule_id=17237 emp=2 date=2026-09-11 type=월차` · 매칭 leave 2건)
- **UPDATE 수행 안 함** · 사용자 승인 후 명시적 지시 필요

### FK 정책 (Section 11)

- `leave_requests.id` 는 uuid PK
- 현재 workflow: leave hard-delete (`DELETE /api/leave-requests/:id`) 존재
- 세 옵션 비교:

| 옵션 | 설명 | 장점 | 단점 | 영향 |
|------|------|------|------|------|
| **A. cancel transaction + RESTRICT** | leave DELETE 시 서버가 source_leave_id rows 선삭제 → leave DELETE | DB 레벨 정합성 강건 · 역사 보존 (schedules 쪽) 어려움 | 서버 코드 2-step 트랜잭션 필요 · 실패 시 compensation 로직 필요 | 현재 `DELETE` 핸들러에 이미 cleanup 코드 있음 (provenance 매칭) · 이 흐름을 트랜잭션 묶음으로 격상 가능 |
| **B. hard delete 금지 (soft "cancelled")** | leave_requests.status 에 `cancelled` 추가 · DELETE 는 수행 안 함 | 역사 100% 보존 · FK 영구 유효 · provenance 추적 영구 가능 | schema 변경 큼 · UI (ApprovalRequestPage, LeavePage) 전수 수정 필요 · list/filter 로직 변경 | 기존 UI 호환 X · 범위 큼 |
| **C. ON DELETE SET NULL** | leave DELETE 시 schedule.source_leave_id → NULL 자동 | FK 유지 + 단순 · 서버 코드 변경 최소 | 삭제 후 schedule 가 "출처 모름" 상태로 남음 · provenance 영구 유실 | 현재 cleanup 코드가 schedule 도 함께 삭제하므로 SET NULL 효과는 거의 없음 (삭제 후 schedule 자체 없음) |

- **추천: A (cancel transaction + ON DELETE RESTRICT)**
  - 근거:
    - 현재 코드에 이미 provenance 매칭 cleanup 이 적용됨 (route 쪽 2-step 흐름)
    - RESTRICT FK 는 DB 레벨 안전장치 역할 (서버 코드 bug 로 cleanup 누락 시 leave DELETE 차단)
    - 역사 보존 요구는 "schedule 쪽 보존" 보다 "leave_requests 쪽 보존" (approved→cancelled) 가 더 중요 (B 옵션) 이지만 범위 큼
    - A 는 "현재 코드와 호환 + 안전장치" 최소 비용
  - 적용 시점: section 10 migration 적용 완료 + orphan 처리 완료 후 별도 migration (SQL 샘플 리포트 하단 [DB ACTIONS WAITING APPROVAL] 참조)
  - 자동 적용 금지 · 사용자 승인 후 적용

---

## [FK]

**(2026-10-06 orphan audit 재실행 결과 동일 · PHASE 1 보고서와 변동 없음)**

- **safe now** (orphan=0 · 적용 안전 but production 적용은 사용자 승인 필요):
  - `schedules.employeeId → employees.id ON DELETE RESTRICT ON UPDATE RESTRICT`
    - total=3279 · orphan=0 · type=integer→integer 매칭
  - `employee_contracts.employee_id → employees.id ON DELETE RESTRICT`
    - total=0 · orphan=0
  - `resignation_requests.employee_id → employees.id ON DELETE RESTRICT`
    - total=0 · orphan=0
  - CASCADE 없음 (사용자 지시) · 모두 RESTRICT
  - migration 파일: `migrations/schedule_phase_1_fk_constraints_2026-10-06.sql`

- **blocked**:
  - `leave_requests.employee_id → employees.id`
    - 사유: orphan 2건 (id=999, id=3 · forensic 결과 상단 [ORPHANS] 참조)
    - migration 파일 안에 **주석 처리** 유지 · orphan 처리 완료 후 사용자가 주석 해제하여 적용
    - 이름 유사도/fuzzy matching 금지 (사용자 지시 재확인)

---

## [EMPLOYEE DELETE]

- **409 = DONE** (PHASE 1 에서 `scheduleController.deleteEmployee` 가 `countEmployeeRelatedRows` 사전 조회 후 total>0 이면 409 `EMPLOYEE_HAS_RELATED_ROWS` + counts 반환)
- **frontend message = DONE**
  - `src/lib/employeeApi.ts` · `deleteEmployee` 에서 `ApiError + code=EMPLOYEE_HAS_RELATED_ROWS` → `EmployeeDeleteError` 로 변환 · export
  - `src/components/StaffManagePage/StaffManagePage.tsx` · `deleteEmployee` 핸들러에서 `EmployeeDeleteError` 분기 · 명확 메시지 노출:
    > "근무/연차/계약 등 이력이 있는 직원은 삭제할 수 없습니다. 퇴직 처리해주세요 (직원 상세에서 [퇴사일] 입력). 상세: ..."
  - `retireDate` 기존 workflow 재사용 (사용자 지시) · 새 framework 신설 X
- **historical preservation = YES**: 서버가 409 로 삭제 자체를 차단 · schedules/leave_requests/contracts/resignations 전부 보존

---

## [VALIDATION]

- **TS = PASS**
  - `npx tsc --noEmit` 실행
  - 변경 파일 전부 clean (leave.ts, scheduleLock.ts, schedules.ts, employeeApi.ts, StaffManagePage.tsx)
  - 1 pre-existing TS error 발견: `src/components/ReservationPage/ReservationPage.tsx(223,42)` · readonly AvailabilitySlot[] 타입 불일치 · 이번 commit 과 무관한 다른 agent WIP (현재 git status 에 modified 로 표시됨) · touch 금지 (사용자 지시 범위 밖)

- **BUILD = PASS**
  - `npm run build` 성공 · dist 전체 번들 생성
  - server.cjs 1.3mb · 2 warnings (`src/supabase/client.ts` import.meta · pre-existing · 변경 무관)

- **TEST = PASS (59/59)**
  - `server/routes/daily/leave.phase1_5.test.ts` · **신규** · **13/13** PASS
    - [A] unlocked · lv5 approve · source_leave_id 저장
    - [B] locked month · lv5 · SCHEDULE_LOCKED · leave 상태 유지
    - [C] schedule upsert 실패 · 전체 롤백 · schedule 변화 없음
    - [D] invalid request_id · LEAVE_NOT_FOUND
    - [E] multi-day 3일 · 전부 생성 · source_leave_id 동일
    - [F] lv≥9 bypass_lock · locked month → 승인 성공
    - [G] 이미 approved · LEAVE_NOT_PENDING (idempotency)
    - [COPY-1] unlocked target · 통과
    - [COPY-2] locked target + lv5 · SCHEDULE_LOCKED
    - [COPY-3] locked target + lv9 · bypass
    - [DEL-1] provenance 매칭 · 수동 schedule 보존
    - [DEL-2] provenance 0 · 레거시 (empId, date, type) fallback
    - [DEL-3] 수동 변경 · skip
  - `server/routes/daily/leave.phase1.test.ts` · 기존 · **8/8** PASS (회귀 없음)
  - `server/routes/schedule/schedules.test.ts` · 기존 · **16/16** PASS (회귀 없음)
  - `src/hooks/useLeaveManager.test.ts` · 기존 · **8/8** PASS (회귀 없음)
  - `src/lib/employeeApi.test.ts` · 기존 · **14/14** PASS (`EmployeeDeleteError` 변경에도 기존 사용 pattern 영향 없음)
  - 합계 **59/59**

---

## [DB ACTIONS WAITING APPROVAL]

사용자 승인 전까지 수행하지 않음. 적용 순서:

1. **orphan 처리** (사용자 결정 · 두 옵션 중 1택)
   ```sql
   -- 옵션 1: 두 orphan 모두 삭제
   DELETE FROM leave_requests WHERE id = '30277299-9ff9-4bfb-844d-75ac96b5f81b';
   DELETE FROM leave_requests WHERE id = '297371b0-c0fb-4706-b783-7a42414c299c';
   -- 옵션 2: 테스트 (999) 만 삭제 · 박부장 (id=3) 은 보존
   DELETE FROM leave_requests WHERE id = '30277299-9ff9-4bfb-844d-75ac96b5f81b';
   ```

2. **source_leave_id 컬럼 추가** (`migrations/schedule_phase_1_5_source_leave_id_2026-10-06.sql`)
   ```sql
   ALTER TABLE schedules ADD COLUMN IF NOT EXISTS source_leave_id uuid NULL;
   CREATE INDEX IF NOT EXISTS idx_schedules_source_leave_id ON schedules(source_leave_id) WHERE source_leave_id IS NOT NULL;
   ```

3. **approve_leave_request RPC 재생성** (`migrations/schedule_phase_1_approve_leave_rpc_2026-10-06.sql`)
   - 신규 파라미터: `p_bypass_lock boolean` · 반환: `jsonb`
   - source_leave_id 저장 포함

4. **FK constraints 적용** (`migrations/schedule_phase_1_fk_constraints_2026-10-06.sql`)
   - schedules / employee_contracts / resignation_requests → RESTRICT (이미 활성)
   - leave_requests FK 는 **1 완료 후** 주석 해제하여 적용

5. **(선택) 레거시 schedules backfill**
   - 3 safe · 1 ambiguous · 4 unmapped
   - safe 3건만 수동 UPDATE 수행:
     ```sql
     -- 예시 (실제 매칭 ID 는 scripts/schedule-source-leave-backfill-dryrun-2026-10-06.mjs 재실행하여 확인 필요)
     UPDATE schedules SET source_leave_id = '<leave_uuid>' WHERE id = <schedule_pk>;
     ```
   - ambiguous 1건은 사용자 수동 확인 후 결정 (`schedule_id=17237 emp=2 date=2026-09-11`)

6. **(선택) source_leave_id FK 적용 (옵션 A 추천)**
   ```sql
   -- orphan source_leave_id 가 없는 상태에서만 적용
   ALTER TABLE schedules
     ADD CONSTRAINT fk_schedules_source_leave
     FOREIGN KEY (source_leave_id) REFERENCES leave_requests(id)
     ON DELETE RESTRICT;
   ```

---

## [FILES CHANGED]

### 신규 (PHASE 1.5)
- `D:/antigravity_projects/megatown-staff-scheduler/migrations/schedule_phase_1_5_source_leave_id_2026-10-06.sql` — schedules.source_leave_id 컬럼 + index migration
- `D:/antigravity_projects/megatown-staff-scheduler/scripts/schedule-orphan-forensic-2026-10-06.mjs` — orphan 2건 forensic audit (READ-ONLY)
- `D:/antigravity_projects/megatown-staff-scheduler/scripts/schedule-orphan-check-names-2026-10-06.mjs` — employees 이름 매칭 보조 조사 (READ-ONLY)
- `D:/antigravity_projects/megatown-staff-scheduler/scripts/schedule-schema-inspect-2026-10-06.mjs` — schema READ-ONLY 조사
- `D:/antigravity_projects/megatown-staff-scheduler/scripts/schedule-source-leave-backfill-dryrun-2026-10-06.mjs` — backfill dry-run (safe/unmapped/ambiguous count)
- `D:/antigravity_projects/megatown-staff-scheduler/server/routes/daily/leave.phase1_5.test.ts` — RPC + copy lock + provenance cleanup 테스트 13개

### 수정 (PHASE 1.5)
- `D:/antigravity_projects/megatown-staff-scheduler/migrations/schedule_phase_1_approve_leave_rpc_2026-10-06.sql` — 파라미터 재설계 (`p_bypass_lock boolean`) · source_leave_id 저장 추가 · 반환 jsonb · 에러 코드 명시
- `D:/antigravity_projects/megatown-staff-scheduler/migrations/schedule_phase_1_fk_constraints_2026-10-06.sql` — leave_requests orphan forensic 결과 반영 (주석 블록 설명 보강)
- `D:/antigravity_projects/megatown-staff-scheduler/server/routes/daily/leave.ts` — PUT 핸들러 RPC canonical 교체 · compensation 제거 · DELETE 핸들러 provenance 기반 cleanup + 레거시 fallback
- `D:/antigravity_projects/megatown-staff-scheduler/src/lib/employeeApi.ts` — `EmployeeDeleteError` export · 409 EMPLOYEE_HAS_RELATED_ROWS 변환
- `D:/antigravity_projects/megatown-staff-scheduler/src/components/StaffManagePage/StaffManagePage.tsx` — `EmployeeDeleteError` 분기 처리 · 명확 메시지 노출
- `D:/antigravity_projects/megatown-staff-scheduler/server/routes/schedule/schedules.ts` — POST /api/schedules/copy 에 target month lock 검증 추가

---

## [STOP conditions encountered]

- **orphan 자동 삭제 X** · 사용자 승인 전까지 2건 보존. forensic 결과만 리포트에 명시.
- **production RPC migration 미적용** · 사용자 승인 후 Supabase SQL Editor 수동 실행 필요.
- **production FK migration 미적용** · 사용자 승인 후 수동 실행 필요 (orphan 처리 선행).
- **source_leave_id migration 미적용** · 사용자 승인 후 수동 실행 필요 (RPC migration 선행).
- **source_leave_id backfill UPDATE X** · dry-run count 만 보고 · 사용자 승인 전 실행 X.
- **ReservationPage TS error** (pre-existing, 다른 agent WIP) · touch 금지 (사용자 지시 범위 밖) · 리포트에만 명시.
- **이름 유사도 매칭 금지** 유지 · 박부장 (id=3) 을 다른 직원에 매핑하지 않음.
- **push = NO** · 커밋만 로컬 수행.

---

- PHASE 1 CODE COMPLETE = YES
- PHASE 1.5 CODE COMPLETE = YES
- PHASE 1 DB COMPLETE = NO (DB actions waiting)
- PHASE 1.5 DB COMPLETE = NO (DB actions waiting)
- PHASE 1 COMPLETE = NO (DB migration 적용 전까지)
- PHASE 1.5 COMPLETE = NO (DB migration 적용 전까지)
