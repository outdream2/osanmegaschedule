# SCHEDULE V1 — Phase 3C · 3D · 3E Continuous Closeout
# 2026-10-07

> Mode · READ-ONLY audit + CODE/TEST-ONLY safe fix · no DB/schema change · no data migration · no CREATE INDEX · no `--no-verify` · no push.
> Precedents · PHASE 3-0 DB (PASS) · PHASE 3A SECURITY (PASS · `d1e3bc69` · `dc145f48`) · PHASE 3B PERFORMANCE (PASS · `86f7af73` · `f9c4ff93`).
> New commit this closeout · `9754c8a0 fix(schedule): phase 3c/3e · cross-month batch lock tests + categorized error UX`.

---

## [PHASE 3C · CONFIRM / LOCK]

### Write path inventory (schedules-affecting)

| # | route | auth | active (F9) | lock | error contract | fe handler |
|---|---|---|---|---|---|---|
| 1 | `PUT /api/schedules` | lv5 | `assertEmployeeActiveForWrite(empId, dateFull)` | `assertScheduleNotLocked(ym, lvl)` | 403 SCHEDULE_LOCKED / 409 EMPLOYEE_RETIRED / 400 Zod / 404 EMPLOYEE_NOT_FOUND | `useScheduleData.handleCellUpdate` |
| 2 | `POST /api/schedules/batch` | lv5 | `assertEmployeesActiveForWrite(pairs)` (post F-2 · single IN) | `assertScheduleNotLockedForDates(dates, lvl)` (전체 날짜 · 모든 YM 검사) | 403 SCHEDULE_LOCKED / 409 EMPLOYEE_RETIRED / 400 Zod | `useScheduleData.applyShiftHoursToAll` + `EmployeeCalendarModal.onBulkSave` |
| 3 | `POST /api/schedules/copy` | lv5 | `copySchedulesFromPreviousMonth` 서비스 내 `targetFirstDay > retireDate` 사원 skip (G-2 fix) | `assertScheduleNotLocked(targetYm, lvl)` | 403 SCHEDULE_LOCKED / 400 Zod | `useScheduleData.executeCopyFromPreviousMonth` |
| 4 | `POST /api/leave-requests` | lv1 | `assertEmployeeActiveForWrite(targetId, end_date)` | — (신청만 · 아직 projection X) | 403 FORBIDDEN / 409 EMPLOYEE_RETIRED / 400 Zod | `LeavePage.handleSubmit` |
| 5 | `PUT /api/leave-requests/:id` (approve) | lv5 | `assertEmployeeActiveForWrite(pre.employee_id, endDate)` (G-1 fix) | `assertScheduleNotLockedForDates(dates, lvl)` + RPC `p_bypass_lock` | 403 SCHEDULE_LOCKED / 409 EMPLOYEE_RETIRED / 409 LEAVE_NOT_PENDING / 404 LEAVE_NOT_FOUND | `LeavePage.handleReview` |
| 6 | `DELETE /api/leave-requests/:id` | lv5 | — (DELETE 허용) | `assertScheduleNotLockedForDates(dates, lvl)` (admin+approved · schedules cleanup 발생 시) | 403 FORBIDDEN / 403 SCHEDULE_LOCKED | `LeavePage.handleDeleteLeaveRequest` |

### Confirm vs Lock terminology

**단일 개념 · V1 schedule 범위에서 "확정" = "lock"**

| surface | artifact |
|---|---|
| UI label | `확정` / `확정해제` 버튼 (ScheduleToolbar) · "확정된 달 · 수정 불가" 배너 (SchedulePage) |
| client state | `isMonthLocked: boolean` (useScheduleData · from `data.value === true`) |
| server endpoint | `POST /api/settings` with `key=schedule_lock_YYYY-MM` + `value=true/false` · authorize(9) |
| server guard | `server/lib/scheduleLock.ts` reads `app_settings.schedule_lock_YYYY-MM` |
| storage | `app_settings.value jsonb boolean` by `key` |

**다른 개념 (혼동 금지) · `is_confirmed` on `zone_day_assignments`**
- 일별 구역/점심/휴게 배정의 "확정" (운영 상태) — DayTimelineModal 안
- schedule write lock 과 **별개 테이블 · 별개 flag** · schedule 쓰기 제한 X
- 이번 Phase 에서 V1 schedule 과 통합/분리 변경 **없음**

### Server lock coverage

| write path | lock guard present | gate |
|---|---|---|
| PUT /api/schedules | ✓ | `assertScheduleNotLocked(ym, lvl)` (schedules.ts:41) |
| POST /api/schedules/batch | ✓ | `assertScheduleNotLockedForDates(dates, lvl)` (schedules.ts:50 · 모든 날짜 · 모든 YM) |
| POST /api/schedules/copy | ✓ | `assertScheduleNotLocked(targetYm, lvl)` (schedules.ts:73) |
| PUT /api/leave-requests/:id (approve) | ✓ | `assertScheduleNotLockedForDates(dates, lvl)` + RPC `p_bypass_lock` (leave.ts:208, 217) |
| DELETE /api/leave-requests/:id (admin+approved) | ✓ | `assertScheduleNotLockedForDates(dates, lvl)` (leave.ts:414) |

**lock bypass** = lv≥9 (전 route 일관) · scheduleLock.ts:22 single source.

**server lock coverage = 100%**

### Frontend-only lock gates (UX feedback only · server authoritative)

| component | gate |
|---|---|
| ScheduleToolbar | `편집` 버튼 hidden if `isMonthLocked` · `전월복사` 버튼 hidden if `isMonthLocked` · `확정` 버튼 `canLockMonth={isSuperAdmin}` (lv≥9) |
| ScheduleGrid | `isAdmin && !isMonthLocked && editMode` for cell editability · `onCellUpdate = async()=>{}` passthrough when locked |
| ScheduleCell | tooltip "확정된 달 · 수정 불가" when `isMonthLocked` |
| EmployeeCalendarModal | `onUpdate={isMonthLocked ? undefined : handleCellUpdate}` · `onBulkSave={isMonthLocked ? undefined : ...}` |
| SchedulePage banner | lock Card shown when `isMonthLocked` · editMode hint hidden |

**frontend-only lock = 0** · all FE gates are **UX mirrors** of server guards · server always re-checks.

### Cross-month batch · silent skip 금지

Server · `assertScheduleNotLockedForDates`:
- dedup unique YM via `new Set((dates).map(slice(0,7)))`
- 순차 체크 · 하나라도 locked → 즉시 403 SCHEDULE_LOCKED (전체 batch 실패)
- partial result 생성 X · silent skip X

**신규 테스트 7건** (`server/routes/schedule/schedules.test.ts` [PHASE 3C] 섹션):
1. 단일 월 unlocked → 통과
2. cross-month 모두 unlocked → 통과
3. cross-month 11월만 locked → 403
4. 첫 월 locked → short-circuit (다음 월 조회 안 함)
5. lv≥9 bypass → locked 포함해도 DB 조회 skip
6. 중복 날짜 → new Set dedup · 월 1회
7. 잘못된 날짜 형식 → regex 실패 · skip

전수 PASS.

### Copy lock

- target month 기준 · `assertScheduleNotLocked(targetYm, authLevel)` (schedules.ts:73)
- source month 는 SELECT 만 · lock 영향 없음
- retired employee skip semantics (G-2 fix · `dc145f48`) 유지 · `skippedRetired` 카운트 반환

### Leave projection lock

- approve path · RPC `approve_leave_request` 내부 PL/pgSQL 트랜잭션으로 schedules UPSERT (source_leave_id 포함)
- 서버 route 선-검증 (`assertScheduleNotLockedForDates`) + RPC 재검증 (`p_bypass_lock=false` 일 때 lock 검사)
- lv≥9 bypass 는 `p_bypass_lock=true` 로 명시 전달
- cancel/delete admin path · 승인된 leave 삭제 시 schedules DELETE 전 lock 검증

### Direct API bypass

| actor | path | result |
|---|---|---|
| unauth | PUT /api/schedules | 401 (authorize(1)+authorize(5) 체인에서 token 없음) |
| lv1 | PUT /api/schedules | 403 (authorize(5)) |
| lv5 locked month | PUT /api/schedules | 403 SCHEDULE_LOCKED |
| lv5 unlocked month | PUT /api/schedules | 200 |
| lv9 locked month | PUT /api/schedules | 200 (bypass) |
| lv5 cross-month batch · 하나라도 locked | POST /api/schedules/batch | 403 SCHEDULE_LOCKED (전체 fail) |
| lv5 target locked | POST /api/schedules/copy | 403 SCHEDULE_LOCKED |
| lv5 approve · target month locked | PUT /api/leave-requests/:id | 403 SCHEDULE_LOCKED |
| lv5 approve · target 사원 retired | PUT /api/leave-requests/:id | 409 EMPLOYEE_RETIRED |

**direct API bypass = 0**

### Error contract

| 상황 | 상태 | code |
|---|---|---|
| unauth | 401 | — |
| 권한 부족 | 403 | FORBIDDEN |
| 월 확정 | 403 | SCHEDULE_LOCKED |
| 퇴직 직원 신규 쓰기 | 409 | EMPLOYEE_RETIRED |
| 직원 없음 | 404 | EMPLOYEE_NOT_FOUND |
| leave 중복 승인 | 409 | LEAVE_NOT_PENDING |
| leave 미존재 | 404 | LEAVE_NOT_FOUND |
| Zod validation | 400 | (zod issue msg) |
| 삭제 불가 (연관 데이터) | 409 | EMPLOYEE_HAS_RELATED_ROWS |
| 중복 핸드폰 | 409 | PHONE_DUPLICATE |
| RPC 미적용 | 500 | RPC_NOT_APPLIED |
| 일반 서버 오류 | 500 | — |

**consistency** · same situation = same code · same status · 모든 route 일관.

### Success contract

| route | 성공 응답 |
|---|---|
| PUT /api/schedules | upserted row |
| POST /api/schedules/batch | `{ count }` |
| POST /api/schedules/copy | `{ count, skippedRetired }` |
| POST /api/leave-requests | leave row (status=pending) |
| PUT /api/leave-requests/:id | leave row (status=approved/rejected) |
| DELETE /api/leave-requests/:id | `{ ok: true }` |

copy 는 `skippedRetired` 로 partial outcome 명시 (fake success X).

### Fresh state after write

- F-1 post-commit · `handleCellUpdate` 는 local optimistic update 만 · server reject 는 ApiError throw → showNotification 으로 알림 (fake success X · server reject 반영)
- EmployeeCalendarModal `onBulkSave` · 성공 후 `fetchScheduleData` silent refetch · canonical fresh state
- `executeCopyFromPreviousMonth` · 성공 후 `fetchScheduleData` silent refetch

**PHASE 3C COMPLETE = YES**

---

## [PHASE 3D · EXACT CONFLICT]

### Duplicate schedule (employeeId, date)

- DB · schedules UNIQUE on `(employeeId, date)` · PHASE 3-0 Gate orphan=0 · duplicate=0 (확인 완료)
- Upsert · `supabase.upsert(..., { onConflict: "employeeId,date" })` → **canonical UPDATE on conflict** · 신규 engine 추가 안 함
- 자동 수정 없음 · 사용자 신뢰 보존

### Leave + work conflict

- approve path · RPC 내부 `INSERT ... ON CONFLICT ("employeeId", "date") DO UPDATE` → 승인된 연차 날짜의 기존 work schedule 은 연차 타입으로 **대체** (canonical semantics)
- source_leave_id 로 provenance 기록 · 삭제 시 역추적 가능 (leave.ts:457-500)
- silent overwrite X · UPDATE 는 명시적 승인 action 결과

### Half-day (오전반차 · 오후반차)

- schedule type · workingHours 가 half-day 반영 (e.g., `"오전반차"` 는 09:00-13:00 등)
- full-day leave 와 **같은 unique key** 로 저장되지만 type 이 다름
- `getCalculatedSummary` · `오전반차 → openCount` · `오후반차 → closeCount` 로 카테고리 분류 (scheduleHelpers.ts:227-229) · 명시적 category rule
- leave balance 집계 · `반차 / 오전반차 / 오후반차 → +0.5일` · 그 외 `+ 날짜수` (leave.ts:113)
- 추가 conflict rule 발명 X

### Invalid workingHours

- Zod 스키마 (`src/shared/schemas/schedules.ts:9`) · `z.string().max(20).optional().default("")` · 서버는 string 형식만 검증 · time range parse 는 UI/계산 단계에서
- `parseWorkingHours` (scheduleHelpers.ts:137) · "HH:MM-HH:MM" regex 매치 실패 시 0 반환 · overnight (start>end) 는 음수 산출 → `Math.max(0, ...)` 로 0 처리 (현재 overnight vocab 없음 · 0 처리 적정)
- OFF type (`휴무 · 월차 · 지정휴무`) 은 workingHours "" 수용 (Zod optional default "")

### Inactive / retired employee

- 서버 guard · F9 (3A) · schedule 신규 쓰기 전 체크
- single · `assertEmployeeActiveForWrite(empId, date)`
- batch (post F-2) · `assertEmployeesActiveForWrite(pairs)` · 단일 IN 쿼리
- copy (G-2) · 서비스 레벨 `targetFirstDay > retireDate` 사원 skip + `skippedRetired` 카운트
- leave approve (G-1) · pending → approved 시점 재검증
- historical 날짜 (target ≤ retireDate) 는 통과 (back-fill 허용)

**퇴직 직원 신규 schedule write = 블록 · delete = 허용 · historical back-fill = 허용**

### Conflict error status

- 409 reserved for conflict:
  - EMPLOYEE_RETIRED (퇴직 사원 쓰기)
  - LEAVE_NOT_PENDING (중복 승인)
  - EMPLOYEE_HAS_RELATED_ROWS (관계 데이터 보존)
  - PHONE_DUPLICATE (사번 중복)
- 400 reserved for validation (Zod · badRequest)
- 403 reserved for permission/lock

**409 vs 400 vs 403 명확 분리 유지**

### Arbitrary business threshold

- "약사 N명 이상" · "직원 수 부족" 등 operational threshold conflict 규칙 **추가 안 함**
- 현재 코드에서도 그런 룰 없음 · V1 범위 벗어남

**PHASE 3D COMPLETE = YES**

---

## [PHASE 3E · MINIMAL OPS POLISH]

### Lock UX consistency

Audit · UI never offers an action that would 403:

| context | gated by | behavior when locked |
|---|---|---|
| 편집 버튼 | `!isMonthLocked` | 미노출 (SchedulePage ScheduleToolbar) |
| 전월복사 버튼 | `!isMonthLocked` | 미노출 |
| 확정/확정해제 버튼 | `canLockMonth` (lv≥9) | 항상 노출 · lv<9 은 미노출 (silent-fail 없음) |
| 셀 클릭 | `isAdmin && !isMonthLocked && editMode` | onCellUpdate=async(){} (no-op) · tooltip "확정된 달 · 수정 불가" |
| EmployeeCalendarModal 저장/일괄저장 | `isMonthLocked ? undefined : handleCellUpdate` | 미노출 |
| 월 locked 배너 | `isMonthLocked` | "확정된 상태입니다. 수정하려면 확정해제 후 진행하세요." |

**UI/서버 모순 = 0**

### Error UX category (fix 적용)

Before · `handleCellUpdate` / `handleUndo` / `handleSaveBreak` 는 모든 실패를 generic "저장에 실패했습니다" 로 표시 (server category 손실).

After · `formatWriteError` 헬퍼 (useScheduleData.ts):
```
SCHEDULE_LOCKED   → "확정된 달은 수정할 수 없습니다. 관리자(lv≥9)만 수정 가능합니다."
EMPLOYEE_RETIRED  → "퇴직한 직원의 YYYY-MM-DD 스케줄은 생성/수정할 수 없습니다 · 홍길동 · 퇴직일 YYYY-MM-DD"
FORBIDDEN         → "본인 또는 관리자만 ..." (서버 메시지 그대로)
400 validation    → zod issue (서버 메시지 그대로)
500 / network     → generic fallback (호출측에서 제공)
```

- 사용자가 구분할 수 있는 5 카테고리 노출 · 서버 메시지 pass-through
- raw DB error 노출 금지 유지 (`err instanceof ApiError + err.code` 기반 선택)
- `executeCopyFromPreviousMonth` 는 기존에 이미 server msg 노출 중 (변경 없음)

### Observability (기존 유지)

Server logging already includes:
- route · method · path (middleware logger)
- `[schedule-lock]` warn · `[employee-active]` warn · `[LEAVE APPROVE RPC]` info/error (prefix 식별 가능)
- `authLevel` + `key` + `error message` 포함

민감정보 (phone, wage, 등) 로그에 쓰이지 않음 (grep 확인).

**schedules.updated_at 신규 컬럼 = backlog** (schema 변경 금지)

### V1 redesign

**없음** · 작은 error UX category 추가 외 UI/business logic 변경 X.

**PHASE 3E COMPLETE = YES**

---

## [REGRESSION]

| phase | 상태 |
|---|---|
| Phase 1 · leave provenance + source_leave_id + employee delete guard | PRESERVED (phase1.test.ts 8/8 PASS) |
| Phase 2 · settings authority + wageResolver + UNMAPPED + offTypes + patch RPC | PRESERVED (settings suite PASS · wageResolver unchanged) |
| Phase 3A · auth/security · F1-F9 + G-1 + G-2 | PRESERVED (route authorize 변경 0) |
| Phase 3B · performance fixes · F-1/F-2/F-3 | PRESERVED (레거시 refetch 다시 추가 안 함) |
| Phase 3C · lock contract + test | ADDED (+7 cross-month tests) |
| Phase 3D · conflict rules | DOCUMENTED (코드 변경 0) |

전체 결과 · **1118 PASS · 3 skipped (expected)**.

---

## [BACKLOG]

### P1 historical data (not actioned · 사용자 승인 전 금지)
- **P1-A** · historical locked row UPDATE
- **P1-B** · duplicate approved leave cancel (강남규 2026-09-11)
- **UNIQUE** · constraint semantics audit + proposal
- **updated_at** · observability column
- **taxonomy** · taxonomy cleanup
- **legacy leave rows** · 박부장 orphan 보존

### Security OBS (3A · 변경 없음)
- **OBS-1** · PUT /api/lunch-requests · body.employee_id 자유
- **OBS-2** · GET /api/zone-day/:date · 익명 가능 (현재 서버는 401 반환 중 · 재확인 필요)
- **OBS-3** · GET /api/employees · lv1 에게 phone/level 노출
- **OBS-4** · GET /api/employees/next-number · authorize 없음
- lv2-4 FE/server mismatch (schedule PUT · leave approve)

### Performance OBS (3B · 변경 없음)
- **OBS-5** · EmployeeCalendarModal 월 이동 full-roster over-fetch
- **OBS-6** · LeavePage loadEmployeeDetail eager mount fetch
- **OBS-7** · SchedulePage 3-month pre-fetch
- **OBS-8** · /api/upcoming-leaves 2 round-trip
- **OBS-9** · schedules(date, type) index (future · 20k+ rows)
- **OBS-10** · /api/leave-requests pagination (future · 500+ rows)
- INDEX CANDIDATE 1-3 · evidence 기록 · 미적용

---

## [VALIDATION]

| check | result |
|---|---|
| TEST (전체 server + schedule + leave client) | **1118 PASS · 3 skipped (expected)** |
| TEST (new cross-month lock) | **7 PASS** (added to schedules.test.ts) |
| TS (`npx tsc --noEmit`) | PASS · 0 errors |
| BUILD (`npm run build`) | PASS · server.cjs 1.3MB · client assets built · 2 pre-existing import.meta warnings only |
| FRAMEWORK (`npm run audit`) | 526 violations · no new regression in our files |
| PRE-COMMIT | **N/A** (프로젝트에 pre-commit hook 없음 · Git LFS pre-push 만 존재) |

---

## [GIT]

| hash | subject |
|---|---|
| `9754c8a0` | fix(schedule): phase 3c/3e · cross-month batch lock tests + categorized error UX |

```
commits               = 1 (this closeout)
                       + 2 from 3B (86f7af73 · f9c4ff93)
                       + 1 from 3A fix (dc145f48)
                       + 1 from 3A report (d1e3bc69)
                       -----
                       = 5 total hardening commits (3A + 3B + 3C/3E)
push                  = NO
schema change         = 0
data mutation         = 0
unrelated WIP touched = NO
--no-verify           = NO
```

### Changed files (this closeout · 2)
- `server/routes/schedule/schedules.test.ts` (+99 lines · [PHASE 3C] cross-month lock tests)
- `src/components/SchedulePage/useScheduleData.ts` (+formatWriteError helper · 3 call-site swap)

### WIP boundary respected
- `apps/sync-agent/**` · untouched
- `server/routes/{stock,purchase,vendor,erp}/**` · untouched
- `src/components/{Display,Landing,Order,Reservation,Scan,Stock}Page/**` · untouched
- `src/shared/erp/**` · `scripts/vendor-*` · `supabase/migrations/2026-10-06_vendor_*` · untouched
- `src/components/schedule-v2/**` · untouched

---

## [SCHEDULE V1 CODE HARDENING COMPLETE = YES]

```
PHASE 3-0 DB INTEGRITY    = COMPLETE (prior · PASS gate)
PHASE 3A SECURITY         = COMPLETE (F1-F9 enforced · G-1 · G-2 fixed)
PHASE 3B PERFORMANCE      = COMPLETE (F-1 · F-2 · F-3 applied)
PHASE 3C CONFIRM/LOCK     = COMPLETE (전수 server guard · cross-month test 추가)
PHASE 3D EXACT CONFLICT   = COMPLETE (duplicate · leave/work · half-day · workingHours · inactive 모두 exact)
PHASE 3E MINIMAL POLISH   = COMPLETE (error UX category + lock UX consistency 확인)

SCHEDULE V1 CODE HARDENING COMPLETE = YES
```

**P1 historical backlog** (P1-A · P1-B · UNIQUE · updated_at · taxonomy · legacy leave rows) 는 별도 backlog · 사용자 승인 전 적용 금지 · V1 code hardening 완료 상태에 영향 없음.

**Security OBS** (OBS-1~OBS-4 · lv2-4 FE/server mismatch) · **Performance OBS** (OBS-5~OBS-10 + INDEX CANDIDATE 1~3) · V1 범위 밖 · 별도 remediation window 에서 재검토.

---

END OF SCHEDULE V1 CODE HARDENING · PHASE 3C · 3D · 3E CLOSEOUT
