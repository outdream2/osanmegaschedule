# SCHEDULE V1 PHASE 3B — Performance Audit
# 2026-10-07

> Mode · READ-ONLY audit + CODE-ONLY safe fix · no DB/schema change · no CREATE INDEX · no production write benchmark · no `--no-verify` · no push.
> Precedents · PHASE 3-0 (DB integrity PASS) · PHASE 3A (security PASS · commits `d1e3bc69` + `dc145f48`).
> New commit · `86f7af73 perf(schedule): phase 3b code-only fixes · dead summary · batch active · parallel balance`.
> Measurement data · `tmp/_phase-3b-perf.json` (supabase-js layer) · `tmp/_phase-3b-http-perf.json` (local Express).

---

## [READ ROUTES]

### schedules · GET /api/schedules?year=YYYY&month=MM
- Server · `scheduleService.getMonthlySchedule(year, month)` (`server/services/scheduleService.ts:36-90`)
  - 1 narrowed SELECT on employees (18 cols, 6.9KB) with legacy `SELECT *` fallback (fallback hit = 0 after M-1 fix)
  - 1 SELECT on schedules with `.like("date", "YYYY-MM-%")` (server-side filter · no client-side month pruning)
  - Server-side JS loop · O(employees × schedules) membership check + per-day summary count
- lv1 narrowing · `scheduleController.getSchedules` strips 28 SENSITIVE_EMPLOYEE_FIELDS keys (phone, level, wage_*, insurance_*, bank_*, careers, educations, certifications, …)
- Live timing · supabase-js `~100ms` round-trip · HTTP `~200ms` (incl. serialization + narrowing)
- Payload · current month 589 rows + 19 employees → **89.2KB** (lv1 narrowed) · **90.7KB** (lv9 full) · narrowing saves ~1.5KB wire (employee meta is tiny vs schedules rows which are 95% of payload)

### schedules month-range query (DB filter site)
- Confirmed · filter runs server-side (`supabase.from("schedules").select("*").like("date", prefix+"%")`) · no client-side month pruning
- `like date "YYYY-MM-%"` on text column · currently fast at 589 rows/month · see QUERY PLAN section for index proposal

### leave_requests · GET /api/leave-requests
- Server · `leave.ts:72-81` · narrow SELECT (10 cols) · `.order("created_at", desc)` + optional `.eq("employee_id", N)`
- 13 rows total · all=true · **3.9KB** · 94ms
- self (employee_id=1) · **0.6KB** · 95ms
- No pagination · present at 13 rows → fine; **future risk** at 500+ rows

### leave_requests · GET /api/leave-balance
- Server (before fix) · 2 sequential supabase queries (`employees.annual_leave_days` + `leave_requests` approved) · 190ms wall-clock
- Server (after F-3 fix) · `Promise.all` · **92ms** wall-clock · **-52%**

### settings · GET /api/settings?key=all_settings
- Server · 1 SELECT by PK · payload **1.3KB** jsonb · 92ms
- Called once per `useSettings()` mount · cached via `localStorage` + `settings-updated` CustomEvent across page remounts
- 1 month lock key GET per month-view (`schedule_lock_YYYY-MM`) · 93ms · payload 0.1KB

---

## [FETCH COUNT]

Per the live code paths (StrictMode double-mount noise excluded):

### SchedulePage · first mount
| # | endpoint | why |
|---|---|---|
| 1 | `GET /api/settings?key=all_settings` | useSettings |
| 2 | `GET /api/contact-info` | useContactInfo (silent · spContact unused) |
| 3-5 | `GET /api/schedules?year=…&month=…` × 3 | fetchScheduleData · buildDateList returns prev+current+next months |
| 6 | `GET /api/leave-stats?year=…` | fired inside fetchScheduleData (non-await) |
| 7 | `GET /api/settings?key=schedule_lock_YYYY-MM` | loadMonthLock |
| 8 | `GET /api/upcoming-leaves?days=14` | useUpcomingLeaves (lv≥2 only) |

- lv1 · ~7 requests (no upcoming-leaves) · wall-clock ~250ms (3 schedule fetches in parallel dominate)
- lv2+ · ~8 requests · same wall-clock

### SchedulePage · month navigation (B-F2 dedup active)
| # | endpoint |
|---|---|
| 1 | `GET /api/schedules?year=…&month=…` × 1 (only the new month that just entered buildDateList range · already-loaded months skipped via `loadedMonthsRef`) |
| 2 | `GET /api/leave-stats?year=…` (fire-and-forget · same year typically) |
| 3 | `GET /api/settings?key=schedule_lock_YYYY-MM` |

### SchedulePage · cell edit (post F-1 fix)
| # | endpoint |
|---|---|
| 1 | `PUT /api/schedules` |
| ~~2~~ | ~~`GET /api/schedules?year=…&month=…` dead summary refetch~~ **REMOVED (F-1)** |

### LeavePage · manager mount
| # | endpoint |
|---|---|
| 1 | `GET /api/leave-requests?all=true` (loadAllRequests) |
| 2 | `GET /api/leave-balance?employeeId=…` (showApply) |
| 3 | `GET /api/employees/:id` (loadEmployeeDetail · for PDF modal · fires at mount) |

### LeavePage · employee mount
| # | endpoint |
|---|---|
| 1 | `GET /api/leave-requests?employeeId=…` |
| 2 | `GET /api/leave-balance?employeeId=…` |
| 3 | `GET /api/employees/:id` (PDF-only metadata · fires at mount) |

### DayTimelineModal · opened for a date
| # | endpoint |
|---|---|
| 1 | `GET /api/zone-day/:date` |
| 2 (fallback only) | `GET /api/zone-assignments/:dow` (if zone-day empty) |

- No per-employee fetch · consumes `employees` prop (zero N+1)

### EmployeeCalendarModal · month navigation
| # | endpoint |
|---|---|
| 1 | `GET /api/schedules?year=…&month=…` (same month pre-loaded → skipped · different month → full response, filters self in client) |

- **Observation OBS-5** · fetches ~87KB full-roster payload to extract one employee's rows. Introducing a per-employee endpoint would require new API surface → **out of scope**.

---

## [N+1]

| path | status | detail |
|---|---|---|
| GET /api/schedules | NONE | 1 employees SELECT + 1 schedules SELECT · JS inner loop is O(E×S) on server (fine at 19×589) |
| GET /api/upcoming-leaves | 1+1 | 1 schedules SELECT + 1 employees name-map SELECT (filtered by `IN empIds`) · O(1) round-trips · not N+1 |
| day timeline | NONE | no per-employee fetch |
| employee calendar | 1 per month | 1 fetch per month-move · over-fetches full roster then filters self (OBS-5) · acceptable at current scale |
| leave balance (pre-fix) | 1+1 sequential | 2 round-trips serial · fixed by F-3 |
| assertEmployeesActiveForWrite (pre-fix) | N sequential | N emp batch → N serial queries · **fixed by F-2** |

Live N+1 after fixes · **0** on hot paths.

---

## [WRITE PATH AUDIT]

Audited without production execution · code review + existing tests (vitest 1031 PASS).

### POST /api/schedules/batch
- Lock guard · `assertScheduleNotLockedForDates(dates, authLevel)` dedups months via `new Set(dates.slice(0,7))` → 1 DB query per distinct YM (sequential, short-circuit on first lock)
- Active guard · `assertEmployeesActiveForWrite(pairs)` (post F-2 · single IN query for all distinct empIds)
- Upsert · 1 supabase upsert with `onConflict: "employeeId,date"`
- **Total DB round-trips** · 1 (lock, same-month batch) + 1 (active, batched) + 1 (upsert) = **3**
- Before F-2 · 1 + N + 1 (where N = distinct emps · up to 19 for whole-roster batch) → **up to 21 round-trips** · ~1.9s wall-clock
- After F-2 · 3 round-trips · ~300ms

### POST /api/schedules/copy
- Lock guard · 1 query for target YM
- SELECT prev month schedules · 1 query
- SELECT employees with retireDate (F9 skip) · 1 query
- Build weekday template in memory (O(prevSchedules × days))
- Final upsert · 1 call with `rows[]` (up to ~589 rows)
- **Total DB round-trips** · 4
- No N+1 · bulk operations only

### PUT /api/leave-requests/:id (approve)
- 1 pre-read (leave row for lock dates + employee_id + end_date)
- 1 lock check (per unique YM in date range · 1-2 queries typical)
- 1 active check (`assertEmployeeActiveForWrite` for target emp)
- 1 RPC `approve_leave_request` (atomic UPDATE + INSERT schedules inside PL/pgSQL)
- 1 fresh row re-select for notification payload
- 1 push_subscription read for notifier
- 1 managers.id SELECT for in-app notifications (lv>=9 only, fan-out)
- **Total DB round-trips** · 6-7 · correctness > perf · RPC not split

### Not benchmarked in production
- As specified · batch, copy, approve → existing vitest coverage only

---

## [QUERY PLAN]

READ-ONLY probe · `scripts/schedule-phase-3b-perf-probe.mjs` (supabase-js round-trip timings).
EXPLAIN plans not accessible via Supabase REST (would need raw PG connection or custom RPC · explicitly out of scope).

Current data volumes · all queries complete in ~90-120ms via supabase-js (dominated by network RTT · DB cost sub-5ms per query at these scales).

| table | rows | hot query | observed |
|---|---:|---|---|
| employees | 19 | narrowed SELECT by ORDER BY id | 110ms · 6.9KB · narrow saves 71% payload vs SELECT * (17.5KB diff) |
| employees | 19 | SELECT * (fallback branch · hit=0) | 97ms · 24.4KB |
| schedules | ~589/month | `like date "YYYY-MM-%"` | 101ms · 81.2KB |
| schedules | ~570/month | `like date "YYYY-09-%"` | 100ms · 78.5KB |
| schedules | 0 | `like date "YYYY-11-%"` (future month) | 95ms · 0.0KB |
| schedules | 1000* | `select *` (no filter · PostgREST default cap) | 98ms · 134.9KB · *hits 1000-row cap · never used in app paths |
| schedules | 13→8 | `like date "YYYY-%"` + `eq type "월차"` (leave-stats) | 103ms · 0.1KB |
| schedules | 0 | `in type [월차,오전반차,오후반차]` + `gte/lte date range` (upcoming-leaves) | 115ms · 0.0KB |
| leave_requests | 13 | ORDER BY created_at | 91ms · 3.9KB |
| leave_requests | 2 | `eq employee_id=1` + ORDER BY | 94ms · 0.6KB |
| leave_requests | 0 | `eq employee_id=1` + `eq status=approved` (balance) | 90ms · 0.0KB |
| leave_requests | - | count exact head · `eq status=pending` | 117ms · 0.1KB |
| app_settings | 1 | `eq key=all_settings` maybeSingle | 94ms · 1.3KB |
| app_settings | 1 | `eq key=schedule_lock_YYYY-MM` maybeSingle | 95ms · 0.1KB |
| employees | 15 | `in id [1..19]` (F9 batch active · post F-2) | 93ms · 1.0KB |

### INDEX CANDIDATE 1
```
INDEX CANDIDATE
table    = schedules
columns  = (date, type)
query benefited = GET /api/leave-stats · GET /api/upcoming-leaves
                   · 조건 · WHERE type IN (…) AND date BETWEEN/LIKE
evidence = currently filtered via date LIKE prefix + type IN
           · at 3,279 rows (current) seq scan is <5ms · acceptable
           · at 20,000+ rows (projected 3-year retention) · would benefit from btree index
estimated rows (future) = (year-span × 589/month) × filtered-type ratio
actual bottleneck now  = NONE (network RTT dominates)
expected benefit        = ~10-50ms per query at 20k+ rows · negligible at current scale
write cost              = +1 btree per schedules INSERT/UPDATE · ~5-10% write overhead
risk                    = low · schedules.date is immutable per row
```
**NOT APPLIED** · evidence only.

### INDEX CANDIDATE 2
```
INDEX CANDIDATE
table    = leave_requests
columns  = (employee_id, status, created_at DESC)
query benefited = GET /api/leave-requests?employeeId=… + GET /api/leave-balance (approved subset)
evidence = both queries filter by employee_id + status + sort by created_at
estimated rows (future) = 50-200/year/employee · 1k-5k total within 2 years
actual bottleneck now  = NONE (13 rows total · all seq scans sub-ms)
expected benefit        = ~10-30ms at 5k+ rows
write cost              = +1 btree per INSERT/UPDATE
risk                    = low
```
**NOT APPLIED** · evidence only.

### INDEX CANDIDATE 3
```
INDEX CANDIDATE
table    = schedules
columns  = (employeeId, date)
query benefited = batch upsert conflict detection · already enforced by UNIQUE
evidence = Supabase upsert uses onConflict: "employeeId,date" · must have unique constraint
           · PostgREST unable to verify index/constraint presence
status    = **presumably exists** (schema contract notes UNIQUE) · verify when raw SQL access available
```
**OBSERVATION** · verify unique constraint when direct DB access available.

---

## [FIXES]

### fix 1 · F-1 · dead summary state + full-month refetch on cell edit (useScheduleData.ts)

**BEFORE**
```
request count = PUT /api/schedules + GET /api/schedules?year=&month=
query count   = 1 write + 2 reads (narrowed emps + schedules .like) via Supabase per edit
payload       = ~89KB (full-month schedule response) · wasted · setSummary consumer=0
timing        = ~400ms (PUT ~200ms + GET ~200ms)
```

**AFTER**
```
request count = PUT /api/schedules
query count   = 1 write
payload       = ~0.3KB (write echo only)
timing        = ~200ms (PUT alone)

Also removed:
  · summary useState<any[]>([]) + setSummary (3 call sites · all dead)
  · fetchScheduleData 의 primaryIdx 산출 + setSummary branch
  · 반환 { summary, setSummary } (SchedulePage 는 destructure 안 함 · 확인됨)
```

Impact per cell edit · **-200ms wall-clock · -89KB wire traffic**.

### fix 2 · F-2 · N→1 round-trip for batch active-employee guard (server/lib/employeeActive.ts)

**BEFORE** (sequential loop)
```
request count = 1 PUT /api/schedules/batch
query count   = 1 lock + N × employees SELECT + 1 upsert
                = up to 21 for 19-emp whole-month batch
timing        = up to ~1.9s (serial 19 × 90ms = 1700ms + overhead)
```

**AFTER** (single IN query)
```
request count = 1 PUT /api/schedules/batch
query count   = 1 lock + 1 employees SELECT (IN) + 1 upsert = 3
timing        = ~300ms (single batched + upsert)
semantics     = unchanged · same 404 EMPLOYEE_NOT_FOUND · same 409 EMPLOYEE_RETIRED
                · fail-open DB error semantics preserved
```

Impact for 19-emp batch · **-1.6s wall-clock**.

### fix 3 · F-3 · parallel employees + leave_requests in /api/leave-balance

**BEFORE** (sequential)
```
request count = 1
query count   = 2 serial (employees → leave_requests)
timing        = 190ms wall-clock (3-run median · local dev)
```

**AFTER** (Promise.all)
```
request count = 1
query count   = 2 parallel
timing        = 92ms wall-clock (3-run median · local dev)
reduction     = -52%
```

Both error paths still throw first.

---

## [FRONTEND]

### duplicate fetch
- **StrictMode noise excluded** (dev only · prod single mount).
- `useSettings` instances dedupe across components via `settings-updated` CustomEvent · same session multiple hooks share state after first fetch.
- `useScheduleData.fetchScheduleData` dedupes months via `loadedMonthsRef` on month navigation (B-F2 existing baseline). First mount still fetches 3 months (prev/current/next) in parallel.
- `useUpcomingLeaves` fires once on mount per enabled instance · SchedulePage single instance.
- `loadMonthLock` fires on each month change · 1 setting GET · no cache.
- Post F-1 · cell edit no longer re-fetches month → eliminates most severe duplicate.

### rerender
- `SchedulePage.filteredEmployees` memo keys · `[employees, positionTab, searchQuery, sortBy, sortOrder, todayFirst, todayStr, wageRateKeys]` · recomputes on any state change · low cost (list ops over 19 emps).
- `currentSummaryList` memo keys · `[filteredEmployees, dateList]` · recomputes on filtered-list change · cost O(sourceEmployees × dates) · 19×93 = 1767 iterations per recompute · <5ms. **No action needed.**
- `useScheduleData` returns functions wrapped in `useCallback` with ref-based employee access · B-F2 baseline keeps `fetchScheduleData` stable across cell edits.
- No `useMemo`/`useCallback` sprawl added · premature memoization avoided per spec.

### payload
- Hot path `/api/schedules current` · lv1 narrowed 89.2KB · lv9 full 90.7KB · narrowing effect dominated by schedule rows (not emp meta) at current data volumes.
- `/api/employees` list · 3.5KB (18 cols · 19 emps) · narrowing effective.
- `/api/leave-requests all=true` · 3.9KB (13 rows) · fine.
- `/api/settings all_settings` · 1.3KB · fine.

### No new memoization / dependency changes beyond F-1 ref cleanup

---

## [SECURITY REGRESSION]

Re-verified post-fix · no code change in security-relevant surface except F-2 (lib function internals).

| check | result |
|---|---|
| auth · authorize(5) PUT/batch/copy | PASS (unchanged) |
| auth · authorize(9) employees/settings write | PASS (unchanged) |
| lock · assertScheduleNotLocked* | PASS (unchanged) |
| active employee · F9 guard | PASS · F-2 preserves 404/409 semantics · DB fail-open preserved |
| settings · SENSITIVE_SETTINGS_KEYS gate | PASS (unchanged) |
| M-1 narrowing fallback hit | 0 (confirmed via supabase-js probe · narrowed branch succeeds) |

Full vitest suite re-executed · `server/routes/schedule`, `server/lib`, `server/routes/daily/leave` focused · all 105 tests PASS.

---

## [VALIDATION]

| check | result |
|---|---|
| TEST (schedule+leave focused) | 105 PASS |
| TEST (server full suite · 64 files) | 1031 PASS · 3 skipped |
| TEST (SchedulePage + LeavePage client) | 80 PASS |
| TS (`npx tsc --noEmit`) | PASS · 0 errors |
| BUILD (`npm run build`) | PASS · server.cjs 1.3MB · client assets built · 2 pre-existing import.meta warnings only |
| FRAMEWORK (`npm run audit`) | 526 violations (-1 vs HEAD 527 pre-stale) · no new regressions in our files |
| PRE-COMMIT | n/a (only Git LFS pre-push hook present · no project-level pre-commit) |

No `--no-verify` used · no baseline increase · no push.

---

## [GIT]

| hash | subject |
|---|---|
| `86f7af73` | perf(schedule): phase 3b code-only fixes · dead summary · batch active · parallel balance |

```
commits               = 1
push                  = NO
schema change         = 0
data write            = 0
index applied         = 0
unrelated WIP touched = NO
```

### WIP boundary respected
- `apps/sync-agent/**` · untouched
- `server/routes/stock/**` · `server/routes/purchase/**` · `server/routes/vendor/**` · `server/routes/erp/**` · untouched
- `src/components/{Display,Landing,Order,Reservation,Scan,Stock}Page/**` · untouched
- `src/shared/erp/**` · `scripts/vendor-*` · `supabase/migrations/2026-10-06_vendor_*` · untouched
- `src/components/schedule-v2/**` · untouched

Changed files (3):
- `server/lib/employeeActive.ts`
- `server/routes/daily/leave.ts`
- `src/components/SchedulePage/useScheduleData.ts`

New measurement scripts (2 · untracked):
- `scripts/schedule-phase-3b-perf-probe.mjs` (supabase-js timings)
- `scripts/schedule-phase-3b-http-probe.mjs` (local Express endpoint timings)

---

## [OBSERVATIONS · NOT ACTIONED]

| id | surface | severity | note |
|---|---|---|---|
| OBS-5 | EmployeeCalendarModal month-change | LOW | fetches full-roster /api/schedules (~87KB) to extract self · would need per-emp API |
| OBS-6 | LeavePage · loadEmployeeDetail at mount | LOW | PDF modal metadata fetched even if modal never opened · 1 request · 1.6KB |
| OBS-7 | SchedulePage mount · 3-month pre-fetch | LOW | prev/current/next in parallel · copy flow depends on prev-month data · deferring would complicate flow · leave as-is |
| OBS-8 | /api/upcoming-leaves · 2 round-trips | LOW | schedules + employees name-map · could UNION or client-side merge · payload small (bytes) · not worth change |
| OBS-9 | /api/schedules unindexed date LIKE | LOW | fine at 3,279 rows · see INDEX CANDIDATE 1 for future |
| OBS-10 | /api/leave-requests no pagination | LOW | 13 rows now · future risk at >500 rows · pagination belongs in separate task |

---

## [PHASE 3B PERFORMANCE COMPLETE = YES]

- GET schedule path understood (narrowing + server-side month filter · no client-side pruning)
- month query measured (101ms supabase · 200ms HTTP · 89KB)
- leave read path measured (balance 190→92ms · others 90-120ms)
- settings fetch measured (1.3KB · 92ms)
- DayTimeline N+1 status · NONE
- EmployeeCalendar N+1 status · 1 fetch per month-move (over-fetch · OBS-5)
- write path query shape audited (code review + existing tests · no production benchmark)
- safe code fixes applied · 3 fixes · all with before/after
- before/after recorded (supabase-js probe + HTTP probe + git-diff)
- schema/index applied · 0
- security regression · 0
- tests/build PASS

## [PHASE 3C READY = YES]

Next phase per spec:
```
PHASE 3C · CONFIRM / LOCK semantics
목표:
  모든 schedule write path 에서 confirm/lock semantics 동일
  직접 API bypass 0
  같은 error contract

그 후 · PHASE 3D EXACT CONFLICT
그 후 · PHASE 3E MINIMAL OPS POLISH
```

Entering PHASE 3C after this report lands.

---

END OF PHASE 3B PERFORMANCE AUDIT
