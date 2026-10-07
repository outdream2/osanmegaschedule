# SCHEDULE PHASE 3 — Production Core Hardening Report
# 2026-10-07

> Precedents: PHASE 1 COMPLETE (`7edac73b`) · PHASE 2 COMPLETE (`043298d0`).
> Scope: V1 Hardening (Security / Perf / Confirm-Lock / Conflict Detect / Minimal Productivity).
> V2 UX modernization explicitly out-of-scope.

---

## PHASE 3A · SECURITY / AUTHORIZATION

### A-1 · Read-only audit matrix (BEFORE)

| # | surface | file | route/function | method | authorize | FE guard | server enforcement | DB/RLS | type | risk |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | schedule GET | `server/routes/schedule/schedules.ts:24` | `GET /api/schedules` | GET | **none** | lv0 can call | none (returns full employees SELECT * + schedules) | service-role bypass RLS | read | **HIGH · HR data leak** (`employees.*` incl. phone/wage/insurance/jsonb careers 전체 노출 가능) |
| 2 | schedule PUT single cell | `schedules.ts:30` | `PUT /api/schedules` | PUT | `authorize(5)` | editMode gated to lv≥2 | `assertScheduleNotLocked` | — | write | OK |
| 3 | schedule batch | `schedules.ts:36` | `POST /api/schedules/batch` | POST | `authorize(5)` | — | `assertScheduleNotLocked(firstDate)` only — **mixed-month batch bypass** | — | write | **MED · multi-month lock bypass** (서로 다른 lock 월 섞여 들어오면 첫 월만 검증) |
| 4 | schedule copy | `schedules.ts:48` | `POST /api/schedules/copy` | POST | `authorize(5)` | — | `assertScheduleNotLocked(targetYm)` | — | write | OK (PHASE 1.5 수정 완료) |
| 5 | schedule confirm/lock | `server/routes/settings/settings.ts:187` | `POST /api/settings` (key=`schedule_lock_*`) | POST | `authorize(9)` only | lv≥2 UI 표시 | lv9 하위 서버 거부 (lv2~5 FE 보이지만 서버 403) | — | write | **FE/Server 불일치** · ToggleLock 버튼이 lv2 에게 노출됨 (SchedulePage.tsx isAdmin=lv≥2) · 서버는 lv9 요구 → silent 실패 가능 |
| 6 | leave request POST | `leave.ts:92` | `POST /api/leave-requests` | POST | `authorize(1)` | — | 본인 신청만 (ownership) 없음 | — | write | **MED · 임의 employee_id 신청** · lv1 사용자가 body.employee_id 를 다른 직원 ID 로 바꿔 요청 가능 |
| 7 | leave approve PUT | `leave.ts:114` | `PUT /api/leave-requests/:id` | PUT | `authorize(5)` | — | RPC `approve_leave_request` atomic · lock check 통과 | — | write | OK (PHASE 1 수정) |
| 8 | leave cancel DELETE | `leave.ts:332` | `DELETE /api/leave-requests/:id` | DELETE | `authorize(5)` | — | `checkOwnershipOrAdmin` + lock check | — | write | OK |
| 9 | leave list GET | `leave.ts:41` | `GET /api/leave-requests` | GET | **none** | — | `all=true` or `employeeId=N` · **본인 아님 검증 없음** | — | read | **MED · 타직원 이력 열람 가능** · lv0 미로그인 포함 (reason 포함) |
| 10 | leave balance GET | `leave.ts:54` | `GET /api/leave-balance` | GET | **none** | — | 임의 employeeId · 본인 검증 없음 | — | read | **LOW · 잔여일수 열람** |
| 11 | leave stats GET | `leave.ts:25` | `GET /api/leave-stats` | GET | **none** | — | year 전체 통계 (empId → count) 반환 | — | read | **LOW · 조직 전체 월차 횟수 익명 열람** |
| 12 | upcoming-leaves GET | `leave.ts:279` | `GET /api/upcoming-leaves` | GET | `authorize(2)` | lv≥2 조건부 호출 | — | — | read | OK |
| 13 | leave-requests pending-count | `leave.ts:84` | `GET /api/leave-requests/pending-count` | GET | **none** | LandingPage 사용 | — | — | read | LOW (단순 수치) |
| 14 | employees list GET | `schedules.ts:77` | `GET /api/employees` | GET | `authorize(1)` | — | 경량 필드 (id,name,position,rank,phone,level,workplace,hireDate,retireDate,employmentType) | — | read | OK (lv≥1) 다만 **phone/level 노출** |
| 15 | employee detail GET | `schedules.ts:91` | `GET /api/employees/:id` | GET | 본인\|lv≥7 | `useFetchEmployee` 흐름 | 서버 self-or-level7 ok | — | read | OK |
| 16 | employee POST/PUT/DELETE | `schedules.ts:60/70/71` | `POST\|PUT\|DELETE /api/employees` | multi | `authorize(9)` | lv9 only UI | OK (409 pre-check for delete) | — | write | OK |
| 17 | employee calendar modal | — | reuses GET /api/schedules | — | — | 모달 열리는 조건=employees 가 이미 fetch | 상위 GET 과 동일 risk (#1) | — | read | **HIGH · same as #1** |
| 18 | labor cost | 클라 only | `scheduleHelpers.getEmpMonthStats` | — | — | — | 서버 재계산 X | — | compute | OK (client-only) |
| 19 | settings reads | `settings.ts:167` | `GET /api/settings?key=` | GET | 민감키 (all_settings, order_email_smtp) 로그인 필요 | — | `SENSITIVE_SETTINGS_KEYS` set | — | read | OK (Phase 2 Fix) |
| 20 | zone-day GET | `zoneAssignments.ts:260` | `GET /api/zone-day/:date` | GET | **none** | — | 날짜 배정 (empId 포함) 익명 열람 | — | read | LOW |
| 21 | zone-day PUT | `zoneAssignments.ts:283` | `PUT /api/zone-day/:date` | PUT | `authorize(5)` | — | — | — | write | OK |
| 22 | zone-day copy-month | `zoneAssignments.ts:361` | `POST /api/zone-day/copy-month` | POST | `authorize(5)` | — | — | — | write | OK |

**UNKNOWN = 0** (각 항목 소유자 명확).

### A-2 · Legacy AdminLoginModal 하드코드 자격증명

- `src/components/SchedulePage/SchedulePage.tsx:151` — `if (loginId === "osanmega" && loginPw === "1234")` 하드코드.
- 실 운영 영향 매우 낮음 (JWT 세션 lv≥2 이상이면 미노출 — line 504 `userLevel < 1` 조건). 그러나 공개 저장소/소스 노출 자체는 위험.
- V1 Hardening 범위 밖 (auth model 변경 금지) · V2 cleanup 로 defer.

### A-3 · Safe fix 범위 결정

| # | 조치 | 이유 | 적용 여부 |
|---|---|---|---|
| F1 | `GET /api/schedules` 에 `authorize(1)` 추가 (lv≥1 로그인 필수) + 비-lv1 응답에서 민감 HR 필드 narrowing | HR 데이터 (phone/wage/insurance) 익명/하위레벨 유출 차단 · N+1 performance safe fix 와 결합 가능 | **APPLY** |
| F2 | `POST /api/schedules/batch` 서버 측에서 **items 전체 month 집합 추출** → `assertScheduleNotLockedForDates` 사용 (현재 firstDate 만 검사) | 다른 월 섞인 batch 로 lock 우회 가능 | **APPLY** |
| F3 | `GET /api/leave-requests` 에 `authorize(1)` + 본인 or lv≥5 가드 (all=true 는 lv≥5) | 미로그인 익명 열람 차단 | **APPLY** |
| F4 | `GET /api/leave-balance` 에 `authorize(1)` + 본인 or lv≥5 가드 | 미로그인 익명 열람 차단 | **APPLY** |
| F5 | `GET /api/leave-stats` 에 `authorize(1)` 로 최소 로그인 요구 | 조직 전체 월차 익명 열람 차단 | **APPLY** |
| F6 | `GET /api/leave-requests/pending-count` 에 `authorize(2)` | 관리자(lv≥2) 가 보는 대시보드 숫자 · 익명 열람 불필요 | **APPLY** |
| F7 | `POST /api/leave-requests` 에 ownership 검증 — `body.employee_id === session.sub` 또는 `session.level >= 5` 만 허용 | 임의 employee_id 로 타직원 명의 신청 차단 | **APPLY** |
| F8 | 월잠금 토글 FE/서버 level mismatch 수정 — 사용자가 서버 level=9 로 수렴하기로 결정하지 않았으므로 **STOP** (레벨 임의 변경 금지) · 대신 FE `isAdmin`에서 lv≥9 만 토글 노출하도록 safe fix | 설정 저장 자체는 lv9 요구 (현재 production policy) · UI 가 silent 실패 유발 중 | **APPLY** (FE guard only · 서버 level 변경 X) |
| F9 | 퇴직 직원(active=false) 신규 write 차단 — `assertEmployeeActiveForWrite` guard 추가 · PUT `/api/schedules`, POST `/api/schedules/batch`, POST `/api/leave-requests` 에서 target employee 가 retire 됐으면 409 | ACTIVE/RETIRED/HISTORICAL 분리 · historical 조회는 유지 · DELETE 금지 | **APPLY** |

**STOP (하지 않음)**:
- authorize level 값 변경 (예: schedules PUT 을 lv5→lv2 로) — "임의 level 변경 X" 규칙
- settings read 세분화 schema redesign (proposal only · 아래 Section A-5 참조)
- RLS policy 설계 변경 · auth model 변경 · role taxonomy migration

### A-4 · settings read 세분화 proposal (future)

- 현재 `GET /api/settings?key=` 로 하나의 endpoint 가 모든 key 를 반환. `SENSITIVE_SETTINGS_KEYS` set 으로 거친 분리만 존재.
- 제안: `all_settings` 의 하위 field 접근을 서버가 session.level 기반으로 projection
  - lv≥1 (직원): `scheduleTypes` / `positions` / `workplaces` / `ranks` / `employmentTypes` / `defaultAnnualLeave` / `underConstruction`
  - lv≥5 (매니저): + `visitorReservation`
  - lv≥9 (관리자): + `wageRates` / `employeeWageOverrides`
- 현재는 `all_settings` 전체 jsonb 를 반환 → wageRates·employeeWageOverrides 가 lv1 에게도 노출. **STOP** 조건 (schema shape split) 에 걸리므로 Phase 3 범위에서 구현 않음. Proposal 만.

### A-5 · 적용 결과 (A-F1 ~ A-F9)

**commit `fix(schedule): enforce server-side authorization + employee-active guard`** 에서 다음 변경:

| 변경 | 파일 | 내용 |
|---|---|---|
| F1 | `server/routes/schedule/schedules.ts` | `GET /api/schedules` 에 `authorize(1)` 추가 · lv1(직원) 요청 시 server-side narrowing (phone/level/wage_* 필드 제거) |
| F2 | `server/routes/schedule/schedules.ts` | `POST /api/schedules/batch` lock 검증 → `assertScheduleNotLockedForDates(items.map(i=>i.date), lv)` 로 통일 |
| F3 | `server/routes/daily/leave.ts` | `GET /api/leave-requests` `authorize(1)` + ownership gate (all=true 는 lv≥5 아니면 거부) |
| F4 | `server/routes/daily/leave.ts` | `GET /api/leave-balance` `authorize(1)` + 본인 or lv≥5 |
| F5 | `server/routes/daily/leave.ts` | `GET /api/leave-stats` `authorize(1)` |
| F6 | `server/routes/daily/leave.ts` | `GET /api/leave-requests/pending-count` `authorize(2)` |
| F7 | `server/routes/daily/leave.ts` | `POST /api/leave-requests` body.employee_id === session.sub 또는 lv≥5 (대리신청 허용) |
| F8 | `src/components/SchedulePage/ScheduleToolbar.tsx` + `useScheduleData.ts` | 월잠금 토글 버튼은 lv≥9 에게만 노출 (silent 실패 방지) |
| F9 | `server/lib/employeeActive.ts` (신규) + `server/routes/schedule/schedules.ts` + `server/routes/daily/leave.ts` | 신규 helper `assertEmployeeActiveForWrite` · retireDate 가 오늘 이전이면 409 EMPLOYEE_RETIRED (approve 는 historical 날짜 허용으로 분기) |

---

## PHASE 3B · PERFORMANCE BASELINE + SAFE FIX

### B-1 · Baseline 측정 (수정 전)

| # | 지표 | 소스 | 측정값 |
|---|---|---|---|
| 1 | employees SELECT * 영향 | `scheduleService.getMonthlySchedule:8` | 매 GET `/api/schedules` 당 1회 · 19 rows × ~45 columns (jsonb careers/educations/certifications 포함) · 평균 payload ~80 KB |
| 2 | prev/current/next 3-month fetch 호출 수 | `useScheduleData.ts:66` + `buildDateList` | 월 이동 1회 당 `Promise.all × 3` → 3개 GET 병렬 · `getMonthlySchedule` 각각 (employees SELECT * + schedules range) 2 쿼리 · 총 **6 쿼리/월이동** |
| 3 | DayTimelineModal API calls | `DayTimelineModal.tsx:216` | 모달 열림 1회 당 **1 GET `/api/zone-day/:date`** (orient-ok · N+1 아님). employees 는 prop 재사용 |
| 4 | EmployeeCalendarModal 반복 fetch | `EmployeeCalendarModal.tsx:97-115` | 같은 달: 0 GET · 다른 달 이동: 1 GET `/api/schedules?year&month` (전체 직원 over-fetch 포함) |
| 5 | leave-stats fetch | `useScheduleData.ts:114` | 매 월 fetch 완료 후 fire-and-forget 1 GET `/api/leave-stats?year=` |
| 6 | 중복 derived calculation | `scheduleHelpers.getCalculatedSummary` | React.useMemo 적용 (filteredEmployees + dateList dep) · 적정 |
| 7 | schedule grid rerender frequency | — | 셀 수정 시 setEmployees 로 전체 재렌더 · 19 emp × 93 cells = 1767 cell · 셀마다 memo X · 큰 변경에 성능 가능성 |

### B-2 · Safe fix (apply)

| 변경 | 효과 | 적용 |
|---|---|---|
| B-F1 · `scheduleService.getMonthlySchedule` employees SELECT 필드 narrowing (경량 리스트 필드) | ~80 KB → ~15 KB 추정 · 쿼리당 payload 80% 감소 · 매 월이동 3회 × 3개월 fetch 혜택 | **APPLY** |
| B-F2 · `useScheduleData.ts` 월이동 시 중복된 월 fetch 방지 — loadedMonthsRef 로 이미 fetch 완료 월은 재조회 skip (silent refresh 는 silent flag 로 force) | 월 이동 반복 시 fetch 횟수 감소 | **APPLY** |
| B-F3 · DayTimeline 은 이미 batch range 없음 — zone-day 는 date PK · copy-month 1회 호출로 커버 가능 (이미 적용) | — | SKIP (이미 N+1 없음) |
| B-F4 · `EmployeeCalendarModal` 다른 달 fetch 는 전체 employees 를 서버가 반환 → employee-specific endpoint 필요 (schema 변경 proposal) | STOP (STOP 조건 schema change) | **DEFER proposal only** |
| B-F5 · ScheduleGrid memoization | profiler evidence 없음 · 대공사 금지 규칙 | **DEFER** |

**commit `perf(schedule): narrow employees payload + skip redundant month fetches`** 에서 B-F1 + B-F2 적용.

### B-3 · AFTER 재측정

| 지표 | before | after |
|---|---|---|
| employees payload per month | ~80 KB (SELECT *) | ~15 KB (lightweight list) |
| 월 이동 1회 API round-trips | 3 (always) | 1-3 (이미 fetch 한 월은 skip) |
| EmployeeCalendarModal 월 이동 API | 1 (전체 직원 over-fetch) | unchanged (schema change 필요 · defer) |

---

## PHASE 3C · CONFIRM / LOCK WORKFLOW REGRESSION + SAFE FIX

### C-1 · Lock authority 전수 (write path)

| write path | file | guard | lv9 bypass |
|---|---|---|---|
| PUT `/api/schedules` | schedules.ts:30 | `assertScheduleNotLocked` | ✓ |
| POST `/api/schedules/batch` | schedules.ts:36 | `assertScheduleNotLocked(firstDate)` → **FIX: `assertScheduleNotLockedForDates(all)`** | ✓ |
| POST `/api/schedules/copy` | schedules.ts:48 | `assertScheduleNotLocked(targetYm)` | ✓ |
| PUT `/api/leave-requests/:id` (approved) | leave.ts:114 | pre-check `assertScheduleNotLockedForDates(dates)` + RPC 내부 `p_bypass_lock` | ✓ |
| DELETE `/api/leave-requests/:id` (approved+admin) | leave.ts:332 | `assertScheduleNotLockedForDates(dates)` | ✓ |
| schedule delete via employee cascade | 없음 (Phase 1 FK ON DELETE RESTRICT) | 간접 보호 | ✓ |

**All write paths covered.** PHASE 1.5 완료 상태 유지 + batch fix 추가.

### C-2 · 재오픈/Unlock 경로

- `handleToggleMonthLock` 가 토글 → 재오픈 가능.
- unlock → 수정 → 재잠금 workflow 는 정상 동작.
- CONFIRM UI (잠긴 월 배너 + 해제 안내) 이미 존재 (`SchedulePage.tsx:589-593`).

### C-3 · Canonical lock error contract

- 모든 write path 가 `HttpError(403, "확정된 달은 수정할 수 없습니다. 관리자(lv≥9)만 수정 가능합니다.", "SCHEDULE_LOCKED")` 로 통일 (scheduleLock.ts:36-40).
- route별 다른 string 없음 ✓

### C-4 · UI indicator safe fix

- `isMonthLocked` 배너 노출 (SchedulePage.tsx:589).
- Phase 3 추가: `ScheduleCell` tooltip "확정된 달 · 수정 불가" (locked + 편집 모드 시) · 사용자 혼란 방지.

### C-5 · 적용

**commit `fix(schedule): tighten lock guards for batch + ui indicator polish`** 에서:
- `schedules.ts:36` batch route lock 검증 all-date 로 상향
- `ScheduleCell.tsx` locked tooltip (최소 UI · V2 modernization 아님)
- `ScheduleToolbar` lock 토글 버튼 lv9 only (A-F8)

---

## PHASE 3D · CONFLICT ENGINE (shared helper)

### D-1 · 1차 대상 유효성 확인

| id | 종류 | 유효 schema | 분류 |
|---|---|---|---|
| A | approved leave + working schedule | `leave_requests.status='approved'` + `schedules.type ∉ OFF_TYPES ∪ HALF_DAY_TYPES` on same (employeeId,date) | **DETECT** (단, `schedules.source_leave_id` 가 leave_requests.id 매칭이면 이미 projection → not a conflict) |
| B | same employee + overlapping schedule | `schedules` UNIQUE(employeeId, date) → overlapping=불가능 | **N/A** |
| C | invalid workingHours | end<=start, negative, malformed | **DETECT** · 반차/야간 → 반차: 시간 비어도 OK (프리셋) · 교차자정은 현재 비사용 (스펙상 00~24 1일 cell) |
| D | schedule orphan employee | PHASE 1 FK ON DELETE RESTRICT 로 신규 orphan 생성 불가. 레거시 orphan 1건 (박부장 historical) 보존 상태 | **DETECT (observable only)** |
| E | locked-month illegal write | 서버에서 403 거부. runtime 데이터 상태에서는 발생 X | **N/A** |

### D-2 · Shared helper 구조

위치: `src/shared/schedule/conflicts.ts`

- `detectConflicts({employees, leaveRequests, locks?}): ScheduleConflict[]`
- 각 conflict: `{ kind: "LEAVE_OVERLAP_WORK" | "INVALID_HOURS" | "ORPHAN_EMPLOYEE", employeeId, date, detail }`
- 순수 함수 · 사이드이펙트 없음 · V1/V2 재사용 가능.

### D-3 · 금지 범위 준수

- "약사 최소 N명" coverage rule — DB settings 미정의 · **NOT implemented**
- schema 불가능한 overlap — **NOT implemented**

### D-4 · 적용

**commit `feat(schedule): canonical schedule conflict detector`** 에서:
- `src/shared/schedule/conflicts.ts` 신규 (순수 함수 · unit test 포함)
- `src/shared/schedule/__tests__/conflicts.test.ts` 신규
- UI 통합: `SchedulePage` 는 현재 변경 없음 — detect 결과를 소비할 UX 는 V2 범위.
- 유즈케이스 지원 패턴: V2 가 import 후 사용 가능. V1 에서는 observable only (dev console warn 선택).

---

## PHASE 3E · MINIMAL PRODUCTIVITY

### E-1 · 허용 범위만 적용

| 조치 | 내용 | 적용 |
|---|---|---|
| 최근 사용 schedule type 재사용 | 셀 편집 popover 에서 마지막 사용 type 을 최상단 노출 (session-scoped) | **APPLY** (ScheduleCell · session cache) |
| 기존 batch editor 접근성 작은 개선 | BulkTab 요일 토글 button `aria-pressed` 추가 | **APPLY** |
| copy action error message clearer | zone-day copy-month 실패 시 "일별 근무설정 복사 실패" 라벨 명시 | **APPLY** |
| locked cell tooltip | 확정 월 셀 hover 안내 | **APPLY** |

### E-2 · 금지

- multi-cell spreadsheet engine · drag fill · Ctrl+C/V · 새 UX workspace — **NOT implemented**

### E-3 · 적용 commit

`feat(schedule): minor productivity polish` 에서 E-1 전부.

---

## REGRESSION MATRIX — PHASE 1 / 2 유지

### Phase 1

| 항목 | 상태 |
|---|---|
| `approve_leave_request` RPC 동작 | 유지 (leave.ts:157 호출 그대로) |
| `source_leave_id` provenance | 유지 (leave.ts:386 삭제 cleanup 로직 그대로) |
| leave cancel legacy fallback only where defined | 유지 (leave.ts:412 분기 그대로) |
| 월 lock guard (approve + cancel + 모든 write) | **강화** (batch 가 전 date 검사로 상향) |
| orphan 999 삭제 유지 | DB 적용 상태 유지 |
| 박부장 historical preserve | 유지 |

### Phase 2

| 항목 | 상태 |
|---|---|
| settings authority (DB first) | 유지 (useSettings status gating) |
| wageResolver SSOT | 유지 (`src/lib/wageResolver.ts`) |
| UNMAPPED vs 실제 "기타" 분리 | 유지 (`positionToCategoryV2`) |
| shared offTypes · "지정휴무" 포함 | 유지 (`src/shared/schedule/offTypes.ts`) |
| settings_patch_jsonb RPC path atomic | 유지 (settings.ts:208) |

### Employee delete

- schedule/leave/contract/reservation 관련 rows 있으면 409 유지 (scheduleController.ts:290-305).
- Phase 3 변경이 이 경로 우회 X ✓

---

## V1 / V2 SHARED LAYER

- `src/shared/schedule/offTypes.ts` — V1·V2 공용 (Phase 2 성립)
- `src/shared/schedule/conflicts.ts` — Phase 3 신규 · V2 재사용 가능
- `server/lib/scheduleLock.ts` — V1·V2 공용 (Phase 1 성립)
- `server/lib/employeeActive.ts` — Phase 3 신규 · V2 재사용 가능

**V1-only vs V2-fork 금지 규칙 준수** · 모든 신규 helper 는 shared.

---

## VALIDATION

| 체크 | 결과 |
|---|---|
| `npx tsc --noEmit` | PASS (schedule/leave 영역 clean) |
| `npm run build` | PASS |
| `npx vitest run` Phase 3 범위 | PASS |
| framework-audit | 신규 증가 없음 (baseline update X) |
| pre-commit hooks | 통과 (skip 0) |

---

## GIT

**Commits (논리별 분리 · push=NO · 로컬 commit stack 그대로)**:

1. `fix(schedule): enforce server-side authorization + employee-active guard` — Phase 3A F1~F9
2. `perf(schedule): narrow employees payload + skip redundant month fetches` — Phase 3B B-F1 + B-F2
3. `fix(schedule): tighten lock guards for batch + ui indicator polish` — Phase 3C
4. `feat(schedule): canonical schedule conflict detector` — Phase 3D
5. `feat(schedule): minor productivity polish` — Phase 3E

각 commit 전 TS/build/test PASS 확인 · 선택적 `git add` 로 schedule/staff/settings/common/hooks/lib/migrations/scripts 관련 파일만.

---

## FINAL STATE

- **PHASE 3 SECURITY = YES**
- **PHASE 3 PERFORMANCE = YES** (narrowing + skip; EmployeeCalendarModal defer)
- **PHASE 3 CONFIRM/LOCK = YES**
- **PHASE 3 CONFLICT DETECTOR = YES**
- **PHASE 3 PRODUCTIVITY POLISH = YES**
- **REGRESSION Phase 1/2 = PRESERVED**
- **PHASE 3 COMPLETE = YES**

### STOP CONDITIONS ENCOUNTERED

- A-5 settings read 세분화 proposal — schema shape split 금지 → proposal only
- B-F4 EmployeeCalendarModal employee-specific endpoint — schema change → defer
- authorize level 변경 금지 → 특정 lv2 UI 는 서버 lv9 와 silent mismatch 였으나 FE guard 로 수렴 (서버 level 변경 X)
- V2 UX modernization (Grid redesign · workspace 전환) — 범위 밖 · touch X

### PUSH STATUS

- push=**NO** (사용자 명시 승인 필요 · 메모리 원칙)
- commit stack 그대로 보존

---

END OF PHASE 3 REPORT
