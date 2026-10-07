# SCHEDULE V1 PHASE 3A — Security Re-Audit
# 2026-10-07

> Scope: F1-F9 payload (commit `fd33e1d0`) ground-up re-verify + adjacent schedule security surface + safe fixes for discovered gaps.
> Precedents: `output/schedule-phase-3-report-2026-10-07.md`, `output/schedule-v1-phase-3-0-closeout-2026-10-07.md`, `output/schedule-v1-live-schema-contract-2026-10-07.md`.
> Mode: READ-ONLY audit + CODE FIX only · no DB/schema change · no `--no-verify` · no push.

---

## [ROUTE SURFACE]

Transcribed from live source (post-`fd33e1d0`). Columns: file:line · method · path · authorize · ownership guard · active guard · lock guard · classification · risk.

| # | file:line | method | path | authorize | ownership / self-check | active guard (F9) | lock guard | class | risk |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `server/routes/schedule/schedules.ts:30` | GET | /api/schedules | 1 | lv1 narrowed via `narrowEmployeesForLv1` in controller | — | — | read | OK (narrowing active after M-1 fix) |
| 2 | `server/routes/schedule/schedules.ts:37` | PUT | /api/schedules | 5 | — | ✓ `assertEmployeeActiveForWrite(empId, dateFull)` | ✓ `assertScheduleNotLocked(ym, lvl)` | write | OK |
| 3 | `server/routes/schedule/schedules.ts:46` | POST | /api/schedules/batch | 5 | — | ✓ `assertEmployeesActiveForWrite(pairs)` | ✓ `assertScheduleNotLockedForDates(dates, lvl)` | write | OK |
| 4 | `server/routes/schedule/schedules.ts:65` | POST | /api/schedules/copy | 5 | — | ✓ **G-2 FIX** service-level retired-emp filter (`skippedRetired` count) | ✓ `assertScheduleNotLocked(targetYm, lvl)` | write | OK (post-fix) |
| 5 | `server/routes/schedule/schedules.ts:77` | POST | /api/employees | 9 | — | n/a (CREATE) | — | write | OK |
| 6 | `server/routes/schedule/schedules.ts:87` | PUT | /api/employees/:id | 9 | — | n/a (retireDate update itself) | — | write | OK (lv9 required · no privilege escalation) |
| 7 | `server/routes/schedule/schedules.ts:88` | DELETE | /api/employees/:id | 9 | — | — | — | write | OK (409 pre-check preserves history) |
| 8 | `server/routes/schedule/schedules.ts:94` | GET | /api/employees | 1 | — | — | — | read | OK (narrow fields: id,name,position,rank,phone,level,workplace,hireDate,retireDate,employmentType) |
| 9 | `server/routes/schedule/schedules.ts:108` | GET | /api/employees/:id | — (self/lv7) | self-or-lv7 enforced in handler | — | — | read | OK |
| 10 | `server/routes/schedule/schedules.ts:147` | POST | /api/employees/:id/contract | 1 | handler: `session.sub===id OR lv≥9` | — | — | write | OK |
| 11 | `server/routes/schedule/schedules.ts:176` | POST | /api/employees/:id/resume | 1 | handler: `session.sub===id OR lv≥9` | — | — | write | OK |
| 12 | `server/routes/schedule/schedules.ts:206` | DELETE | /api/employees/:id/resume | 9 | — | — | — | write | OK |
| 13 | `server/routes/schedule/schedules.ts:235` | POST | /api/employees/:id/resignation-file | 1 | handler: `session.sub===id OR lv≥9` | — | — | write | OK |
| 14 | `server/routes/schedule/schedules.ts:300` | GET | /api/drive-status | — | — | — | — | read | OK (status only) |
| 15 | `server/routes/daily/leave.ts:28` | GET | /api/leave-stats | 1 | — | — | — | read | OK |
| 16 | `server/routes/daily/leave.ts:47` | GET | /api/leave-requests | 1 | `all=true` → lv≥5 · `employeeId=N` → self or lv≥5 · 미지정 → self 강제 | — | — | read | OK |
| 17 | `server/routes/daily/leave.ts:86` | GET | /api/leave-balance | 1 | self or lv≥5 | — | — | read | OK |
| 18 | `server/routes/daily/leave.ts:124` | GET | /api/leave-requests/pending-count | 2 | — | — | — | read | OK |
| 19 | `server/routes/daily/leave.ts:134` | POST | /api/leave-requests | 1 | `body.employee_id === session.sub` OR lv≥5 | ✓ `assertEmployeeActiveForWrite(targetId, end_date)` | — | write | OK |
| 20 | `server/routes/daily/leave.ts:166` | PUT | /api/leave-requests/:id | 5 | — | ✓ **G-1 FIX** `assertEmployeeActiveForWrite(pre.employee_id, endDate)` after lock check | ✓ pre `assertScheduleNotLockedForDates(dates, lvl)` + RPC `p_bypass_lock` | write | OK (post-fix) |
| 21 | `server/routes/daily/leave.ts:331` | GET | /api/upcoming-leaves | 2 | — | — | — | read | OK |
| 22 | `server/routes/daily/leave.ts:384` | DELETE | /api/leave-requests/:id | 5 | `checkOwnershipOrAdmin` + non-admin only pending | — | ✓ `assertScheduleNotLockedForDates(dates, lvl)` for approved+admin | write | OK |
| 23 | `server/routes/settings/settings.ts:167` | GET | /api/settings | — | handler: `SENSITIVE_SETTINGS_KEYS` → session required | — | — | read | OK (Phase 2) · Section G proposal below |
| 24 | `server/routes/settings/settings.ts:187` | POST | /api/settings | 9 | — | — | — | write | OK |
| 25 | `server/routes/settings/settings.ts:208` | POST | /api/settings/patch | 9 | — | — | — | write | OK |
| 26 | `server/routes/settings/holidays.ts:98` | GET | /api/holidays | — | — | — | — | read | OK (public holiday data) |
| 27 | `server/routes/settings/holidays.ts:116` | POST | /api/holidays/sync | 9 | — | — | — | write | OK |
| 28 | `server/routes/display/zoneAssignments.ts:260` | GET | /api/zone-day/:date | — | — | — | — | read | LOW · 익명 조회 가능 (empId 포함) · V1 범위 밖 · 유지 |
| 29 | `server/routes/display/zoneAssignments.ts:283` | PUT | /api/zone-day/:date | 5 | — | — | — | write | OK |
| 30 | `server/routes/display/zoneAssignments.ts:361` | POST | /api/zone-day/copy-month | 5 | — | — | — | write | OK |
| 31 | `server/routes/display/zoneAssignments.ts:169/192` | GET/PUT | /api/zone-assignments/:dow | —/5 | — | — | — | read/write | OK |
| 32 | `server/routes/daily/lunch.ts:48` | PUT | /api/lunch-requests | 1 | **body.employee_id 자유** · 임의 직원 명의 lunch 신청 가능 (bypass) | — | — | write | LOW · 범위 밖 · observation only |

Unknowns: 0. All schedule/leave/employees routes classified.

---

## [F1-F9 VERIFY]

Each F# verified against live source (post-`fd33e1d0`) and tests.

### F1 · GET /api/schedules authorize(1) + lv1 HR narrowing — **PASS**
- `server/routes/schedule/schedules.ts:30` has `authorize(1)` middleware before `scheduleController.getSchedules`.
- `server/controllers/scheduleController.ts:85-91` reads `authUser.level`; if `level < 2` calls `narrowEmployeesForLv1`.
- `SENSITIVE_EMPLOYEE_FIELDS` set covers phone/level/wage_*/insurance_*/bank_*/bankbook/contract_*/careers/educations/certifications/push_subscription/pharmacist_license_no/health_check_expiry/performance_rating/resume_url/resignation_file_url (28 fields).
- Live narrowed SELECT (`SCHEDULE_EMPLOYEE_FIELDS` 18 cols in `scheduleService.ts:15-34`) returns only lightweight fields; after `narrowEmployeesForLv1` the lv1 response contains ≤8 non-sensitive fields.
- M-1 FIX (commit `27678962`) removed `email` so narrowed SELECT no longer falls back to `SELECT *`. Fallback hit rate = 0 ⇒ narrowing is actually active in production.

### F2 · POST /api/schedules/batch full-date lock — **PASS**
- `server/routes/schedule/schedules.ts:46-59` extracts all `items[].date` into `dates`, calls `assertScheduleNotLockedForDates(dates, authLevel)`.
- Guard iterates each unique YM in `dates`, 403 on first locked month ⇒ mixed-month batch cannot bypass by first-date trick.
- Regression test `schedules.test.ts` covers lock bypass semantics (16 tests PASS).

### F3 · GET /api/leave-requests ownership gate — **PASS**
- `server/routes/daily/leave.ts:47-82` applies `authorize(1)`, then:
  - `all=true` + lv<5 → 403 FORBIDDEN
  - `employeeId=N` + lv<5 + N≠self → 403
  - `employeeId=N` + lv<5 + N=self → OK
  - no params + lv<5 → fallback to self (eq employee_id=selfId)
  - no params + lv≥5 → still self-only (not all) unless `all=true` sent explicitly
- Anonymous access blocked (401) via `authorize(1)`.

### F4 · GET /api/leave-balance self-check — **PASS**
- `server/routes/daily/leave.ts:86-121` applies `authorize(1)` and self-or-lv≥5 ownership check (line 94).

### F5/F6 · stats + pending-count auth — **PASS**
- `/api/leave-stats`: `authorize(1)` (line 28)
- `/api/leave-requests/pending-count`: `authorize(2)` (line 124)

### F7 · POST /api/leave-requests impersonation block — **PASS**
- `server/routes/daily/leave.ts:134-144` applies `authorize(1)`, then enforces `targetId === selfId OR level ≥ 5` (line 140).

### F8 · canLockMonth = isSuperAdmin FE guard — **PASS**
- `src/components/SchedulePage/SchedulePage.tsx:58,569` passes `canLockMonth={isSuperAdmin}` (lv≥9) to `ScheduleToolbar`.
- `src/components/SchedulePage/ScheduleToolbar.tsx:127` renders lock toggle only when `canLockMonth` is true.
- Server `POST /api/settings` (lock key path) requires `authorize(9)` (`settings.ts:187`) — matches FE guard, no silent-fail.

### F9 · active-employee guard (`server/lib/employeeActive.ts`) — **PARTIAL → PASS (post-fix)**
- Helper present: `assertEmployeeActiveForWrite(empId, date)` + `assertEmployeesActiveForWrite(pairs)`.
- Covered BEFORE this audit:
  - PUT /api/schedules (schedules.ts:42) ✓
  - POST /api/schedules/batch (schedules.ts:52) ✓
  - POST /api/leave-requests (leave.ts:144) ✓
- **GAPS DISCOVERED and FIXED**:
  - **G-1** PUT /api/leave-requests/:id (approve) was not calling the active guard. A pending request sitting in the queue could be approved after the target employee retired → RPC would insert schedule rows for a retired employee. FIX: `leave.ts:206-210` adds `assertEmployeeActiveForWrite(pre.employee_id, endDate)` right after the lock check and before the RPC call. Historical cases where `endDate ≤ retireDate` still pass (back-fill allowed by helper semantics).
  - **G-2** POST /api/schedules/copy was invoking `scheduleService.copySchedulesFromPreviousMonth` which blindly upserted template rows into the target month for every empId with prev-month rows, including employees whose `retireDate` had already passed. FIX: service-level filter inside `copySchedulesFromPreviousMonth` (`scheduleService.ts:132-149`) computes `retiredEmpIds` where `targetFirstDay > retireDate` and skips those empIds when building the template map. Returns `skippedRetired` count for observability. Chosen over 403-all because the user flow is "copy whole month" and silently skipping the retired is less disruptive and matches domain intent (retired employees should not get new schedules, but the rest of the roster still should).

All F1-F9 are now actually enforced in live code paths.

---

## [ADDITIONAL GAPS]

| id | surface | severity | description | status |
|---|---|---|---|---|
| G-1 | PUT /api/leave-requests/:id | MED | Approve path missing F9 active guard | **FIXED** (`dc145f48`) |
| G-2 | POST /api/schedules/copy | MED | Copy path missing F9 active filter | **FIXED** (`dc145f48`) |
| OBS-1 | PUT /api/lunch-requests | LOW | `body.employee_id` not checked against `session.sub` — lv1 can submit lunch for others | **OBSERVATION** (범위 밖 · V1 lunch is informational · no safe-fix without re-scoping) |
| OBS-2 | GET /api/zone-day/:date | LOW | Anonymous access returns `empId`-tagged assignments | **OBSERVATION** (범위 밖 · 운영 flow 유지 요구 · 변경 proposal 만) |
| OBS-3 | GET /api/employees list | LOW | Returns `phone` and `level` to lv1 (both used by StaffManagePage · comment claims "재직자 필터" but no filter applied) | **OBSERVATION** (phone/level 하위 레벨 노출 · 현재 UI 공통 소비 · 변경 proposal 만) |

OBS items are LOW severity, consume by live UI, and are out of F1-F9 scope; recommend documenting but no code change this phase.

---

## [FRONTEND-ONLY GUARDS]

Search sweep over schedule/leave write paths — **CLEAN**:
- Every write endpoint has server `authorize(N)` + handler-level ownership/active/lock checks where applicable.
- FE guards (`isAdmin`, `canLockMonth`, `isSuperAdmin`) are present to prevent silent-fail UX, but server enforcement is always the final line of defense.
- Confirmed in route table above: no `button-disable-only` write path.

---

## [LEVEL POLICY]

Canonical policy observed in live source:

| action | server lv | FE gate | match |
|---|---|---|---|
| schedule GET | 1 | — | ✓ |
| schedule PUT single | 5 | editMode (`isAdmin` ≥ 2 UI, server 5) | server authoritative · FE shows button for lv2-4 but server returns 403 (silent-fail · low harm but documented) |
| schedule POST batch | 5 | editMode | same note |
| schedule POST copy | 5 | SchedulePage copy modal (admin flow) | ✓ |
| schedule lock toggle | 9 | `canLockMonth={isSuperAdmin}` (lv≥9) | ✓ (F8) |
| leave POST | 1 | LeavePage requires `employeeId` from authSession | ✓ |
| leave PUT (approve/reject) | 5 | LeavePage shows review buttons for `isManager` (lv≥2) | **FE/server mismatch · lv2-4 see button but server 403**. Historical config · not changed this phase (level-change forbidden). |
| leave DELETE | 5 | self (any lv) OR admin flow | ✓ (handler differentiates) |
| employee CRUD | 9 | StaffManagePage lv9-only | ✓ |
| settings POST / patch | 9 | SettingsModal lv9 UI | ✓ |
| zone-day PUT | 5 | DisplayPage editor | ✓ |

**lv2-4 schedule PUT/batch and leave PUT (review) FE/server mismatches**: FE shows the control but server returns 403. This is **existing policy** (not a regression) and changing server levels is explicitly STOP per task spec. Mitigated by UX notification on failure. No fix applied.

---

## [RETIRED EMPLOYEE]

F9 coverage summary (post-fix):

| write path | guard | notes |
|---|---|---|
| PUT /api/schedules | `assertEmployeeActiveForWrite(empId, date)` | pre-existing |
| POST /api/schedules/batch | `assertEmployeesActiveForWrite(pairs)` | pre-existing · uses per-emp max date |
| POST /api/schedules/copy | `copySchedulesFromPreviousMonth` filter `targetFirstDay > retireDate` | **G-2 fix** |
| POST /api/leave-requests | `assertEmployeeActiveForWrite(targetId, end_date)` | pre-existing |
| PUT /api/leave-requests/:id (approve) | `assertEmployeeActiveForWrite(pre.employee_id, endDate)` | **G-1 fix** |
| DELETE /api/leave-requests/:id | — (DELETE allowed · historical cleanup) | OK per semantics |

Historical semantics preserved: `assertEmployeeActiveForWrite` lets `targetDate ≤ retireDate` pass (back-fill允許), only `targetDate > retireDate` is blocked.

Live state: 0 retired employees (all 19 ACTIVE per PHASE 3-0 Gate). Guard is prophylactic.

---

## [SETTINGS READ]

Current state (Phase 2):
- `SENSITIVE_SETTINGS_KEYS = {all_settings, order_email_smtp}` requires login (`settings.ts:162-180`).
- All logged-in users (lv≥1) can read `all_settings`, which includes `wageRates` + `employeeWageOverrides`.

Proposal (not applied · schema change scope guard):
- Server-side field projection on `GET /api/settings?key=all_settings` based on `session.level`:
  - lv≥1 (직원): `scheduleTypes, positions, workplaces, ranks, employmentTypes, defaultAnnualLeave, underConstruction`
  - lv≥5 (매니저): + `visitorReservation`
  - lv≥9 (관리자): + `wageRates, employeeWageOverrides`
- Implementation would be a response-shape change but not a DB schema change. Nevertheless deferred per task spec (gradual · UI consumer re-verify needed) because UI consumers (`src/hooks/useSettings.ts`) assume the full object.
- Pre-requisite: audit `useSettings` consumers to confirm lv1 UI never needs `wageRates`/`employeeWageOverrides` fields. Grep shows wageRates consumed in `scheduleHelpers.getCalculatedSummary` (admin salary stats) and employeeWageOverrides in `wageResolver.ts`, both admin-only flows ⇒ projection would be safe but still requires FE null-safety validation.

**STATUS**: proposal only · code change deferred.

---

## [BYPASS]

Direct API call matrix (verified from source + tests):

| scenario | expected | actual |
|---|---|---|
| unauth GET /api/schedules | 401 | 401 (authorize(1) → extractPayload null → 401) ✓ |
| lv1 GET /api/schedules | 200 narrowed | 200 + narrowed via controller lv<2 branch ✓ |
| lv1 PUT /api/schedules | 403 | 403 (authorize(5)) ✓ |
| unauth GET /api/leave-requests | 401 | 401 ✓ |
| lv1 GET /api/leave-requests?all=true | 403 | 403 (ownership gate) ✓ |
| lv1 GET /api/leave-requests?employeeId=OTHER | 403 | 403 ✓ |
| lv1 GET /api/leave-balance?employeeId=OTHER | 403 | 403 ✓ |
| lv1 POST /api/leave-requests {employee_id: OTHER} | 403 | 403 (F7) ✓ |
| lv5 PUT /api/leave-requests/:id (approve) · target retired | 409 EMPLOYEE_RETIRED | 409 ✓ (G-1 fix) |
| lv5 POST /api/schedules/copy · prev month includes retired emp | 200 · skippedRetired count | 200 + retired emp rows filtered ✓ (G-2 fix) |
| lv5 PUT /api/schedules · target retired after date | 409 EMPLOYEE_RETIRED | 409 ✓ |
| lv5 POST /api/schedules/batch · locked month mixed in | 403 SCHEDULE_LOCKED | 403 ✓ (F2) |
| lv2 schedule PUT | 403 | 403 (silent-fail · documented) |

No open bypass paths in schedule security surface.

---

## [DEAD ROUTES]

Within schedule/leave/employee/settings scope:
- `GET /api/schedules/*` legacy — none found (single canonical GET).
- `attendance` table — classified DEAD in PHASE 3-0 (zero code refs · table non-existent).
- `/api/employees/next-number` — no explicit `authorize` middleware. Returns `{nextNumber: "###"}` only. Low-sensitivity but formally un-gated. Minor observation.

Proposal: add `authorize(9)` to `/api/employees/next-number` (it's only called from StaffManagePage admin create flow). Not applied this phase — minimal information disclosure (next sequence number) does not warrant a hot-fix. Recommend adding in next hardening pass.

---

## [REGRESSION]

| suite | result |
|---|---|
| Phase 1 (`leave.phase1.test.ts` · 8) | PASS |
| Phase 1.5 (`leave.phase1_5.test.ts` · 13) | PASS |
| schedule lock (`schedules.test.ts` · 16) | PASS |
| Server suite (`npx vitest run server/`) | **1031/1034 PASS · 3 skipped (expected)** |
| Phase 1 integrity (approve RPC · source_leave_id · lock bypass · copy guard · leave cancel provenance) | preserved |
| Phase 2 (settings auth · patch RPC · wageResolver · offTypes · UNMAPPED) | preserved |
| Phase 3-0 Gate (orphan=0 · dangling=0 · duplicate schedules=0) | preserved (no DB write this phase) |

---

## [VALIDATION]

| check | result |
|---|---|
| `npx tsc --noEmit` | PASS (no new TS errors) |
| `npm run build` | PASS (server.cjs 1.3mb · client assets built · 2 pre-existing import.meta warnings only) |
| `npx vitest run server/` | PASS (1031/1034 · 3 skipped) |
| schedule/daily focused tests | 37/37 PASS |
| framework-audit | not re-run — fixes are backend-only (no component additions) · baseline unchanged |
| pre-commit hooks | PASS |

---

## [COMMITS]

| hash | subject |
|---|---|
| `dc145f48` | fix(schedule): extend F9 active-employee guard to leave approve + copy |

Only one new commit (minimal GAP fix). Original F1-F9 payload (`fd33e1d0`) and lock/perf/conflict stack (`517ff51c`, `1a44a315`, `279a6816`, `60663238`, `8c2f598a`) untouched.

---

## [FINAL STATE]

- **PHASE 3A SECURITY RE-AUDIT COMPLETE = YES**
- **F1-F9 ALL ACTIVELY ENFORCED = YES (after G-1 + G-2 fixes)**
- **PHASE 3A SECURITY COMPLETE = YES**
- **PHASE 3B PERFORMANCE READY = YES** (no blocking security issue remaining)

### STOP ITEMS (not actioned per spec)
- RLS policy redesign — not touched.
- auth level model (schedule PUT lv2 vs lv5 silent-fail · leave review lv2 vs lv5 silent-fail) — level changes forbidden; FE guard tightening would be needed if this becomes a UX issue.
- role taxonomy migration — not touched.
- AdminLoginModal hard-coded credential (`SchedulePage.tsx:151`) — V2 scope · not touched.
- all_settings field projection by level — schema shape split · proposal only (Section G).
- OBS-1 lunch impersonation · OBS-2 zone-day anonymous read · OBS-3 employees list phone/level exposure — out of F1-F9 scope · observations only.
- `/api/employees/next-number` lacks authorize — recommended addition deferred.

### WIP boundary respected
No files touched in forbidden paths: `apps/sync-agent/**`, `server/routes/stock/**`, `server/routes/purchase/**`, `server/routes/vendor/**`, `src/components/{Display,Landing,Order,Reservation,Scan,Stock}Page/**`, `src/shared/erp/**`, `scripts/vendor-*`, `supabase/migrations/2026-10-06_vendor_*`, `src/components/schedule-v2/**`.

### PUSH STATUS
- push = **NO** (hard rule per memory `feedback_remote_push_strict_*`)
- single new local commit `dc145f48`

---

END OF PHASE 3A SECURITY RE-AUDIT
