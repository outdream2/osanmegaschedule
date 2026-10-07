# SCHEDULE V1 · LIVE SCHEMA CONTRACT
# 2026-10-07

> PHASE 3-0 CLOSEOUT 산출물. 라이브 Supabase 테이블 전수 컬럼 · code consumer 매핑.
> `tmp/_phase-3-audit.json` + `tmp/_phase-3-0-closeout-probe.json` 측정값 기반.
> **본 문서는 설명이지 schema change 가 아님.** 변경 proposal 은 섹션 7 참조.

---

## 1. employees (54 columns · 19 rows)

### 1.1 Live columns
```
id, name, position, hireDate, description, workplace, employmentType, annual_leave_days,
phone, password_hash, is_manager, level, rank, gender, contract_file_url, push_subscription,
retireDate, working_hours_per_week, wage_calc_type, wage_amount, insurance_nps_date,
pharmacist_license_no, health_check_expiry, address, break_time_minutes, break_apply_paid,
performance_rating, resume_url, contract_type, contract_start, contract_end,
probation_end_date, bankbook_image_url, employee_number, birth_date, emergency_contact_name,
emergency_contact_phone, emergency_contact_rel, schedule_type, work_area, work_location,
job_duties, weekly_holiday, wage_pay_day, wage_pay_method, bank_name, bank_account_no,
insurance_nhis_date, insurance_ei_date, insurance_wcia_date, insurance_excluded,
careers (jsonb), educations (jsonb), certifications (jsonb)
```

### 1.2 Required / Optional
- PK: `id` (int)
- Required (empty-string or null not acceptable in app logic): `id`, `name`, `position`, `hireDate`, `workplace`, `employmentType`
- Nullable: `retireDate`, `address`, `rank`, `email` (**MISSING in live**), `annual_leave_days`, `level`, `break_*`, `wage_*`, `insurance_*`, `contract_*`, `probation_end_date`, `birth_date`, `emergency_*`, `password_hash`, `push_subscription`, `pharmacist_license_no`, `health_check_expiry`, `performance_rating`, `resume_url`, `bankbook_image_url`, `employee_number`, `schedule_type`, `work_area`, `work_location`, `job_duties`, `weekly_holiday`, `wage_pay_day`, `wage_pay_method`, `bank_name`, `bank_account_no`, `insurance_excluded`
- JSONB columns: `careers`, `educations`, `certifications`, `push_subscription`

### 1.3 Not in live (code assumes but DB omits)
- **`email`** — `src/types.ts:42` declares optional, `src/components/EmployeeCalendarModal` reads conditionally. **No live column.** PHASE 3-0 CLOSEOUT: removed from `SCHEDULE_EMPLOYEE_FIELDS` (M-1 fix).
- **`resident_number`** — `src/types.ts:43` declares, no live column. No read site in schedule flow.
- **`primary_focus`, `primary_focus_percent`** — `src/types.ts:55-57` declares (#186), no live column. Observable only.
- **`role`** — `src/components/StaffManagePage/StaffManagePage.tsx:292` reads, no live column. Observable only.

### 1.4 Relations
- `schedules.employeeId → employees.id` ON DELETE RESTRICT (PHASE 1 applied)
- `employee_contracts.employee_id → employees.id` RESTRICT
- `resignation_requests.employee_id → employees.id` RESTRICT
- `reservations.assigned_employee_id → employees.id` NO ACTION
- `leave_requests.employee_id → employees.id` **DEFERRED** (박부장 historical orphan 보존)

### 1.5 Code consumers (schedule flow)
- `server/services/scheduleService.ts:8-29` → `SCHEDULE_EMPLOYEE_FIELDS` narrowed SELECT (post M-1: 18 cols)
- `server/routes/schedule/*` → `/api/schedules` GET returns `employees[].schedules[]`
- `src/components/SchedulePage/useScheduleData.ts:85` → consumes GET /api/schedules
- `src/components/EmployeeCalendarModal/EmployeeCalendarModal.tsx:109` → re-fetches GET /api/schedules per month
- `src/types.ts:30-58` → `Employee` interface
- `src/lib/employeeApi.ts` → `/api/employees/:id` detail (StaffDetailPanel · 전체 컬럼)

---

## 2. schedules (8 columns · 3,279 rows)

### 2.1 Live columns
```
id (int PK), employeeId (int FK), date (text YYYY-MM-DD), type (text),
workingHours (text), actualHours (text), memo (text), source_leave_id (uuid, nullable)
```

### 2.2 Required / Optional
- PK: `id` (int, auto-increment)
- Required: `employeeId`, `date`, `type`
- Nullable: `workingHours` (empty string acceptable for OFF types), `actualHours`, `memo`, `source_leave_id`
- UNIQUE: **`(employeeId, date)`** — Supabase upsert `onConflict: "employeeId,date"` 사용 (`server/services/scheduleService.ts:102`). RPC `ON CONFLICT ("employeeId", "date") DO UPDATE` 전제 (migrations/schedule_phase_1_approve_leave_rpc_2026-10-06.sql:115). PostgREST 로 constraint 선언 verify 불가 · 운영 데이터 중복 0 (schedule_phase_3_data_integrity audit)

### 2.3 Not in live
- `created_at`, `updated_at` **없음** → lock 이후 row-level 수정 흔적 추적 불가 (observable only · server guard 가 쓰기 통제)

### 2.4 Relations
- `employeeId → employees.id` RESTRICT (PHASE 1)
- `source_leave_id → leave_requests.id` RESTRICT (PHASE 1.5)
- Index: `idx_schedules_source_leave_id ON schedules(source_leave_id) WHERE source_leave_id IS NOT NULL` (PHASE 1)

### 2.5 Code consumers
- `server/services/scheduleService.ts:58-67` → GET monthly schedule
- `server/services/scheduleService.ts:*` → upsert, batch, copy (lock-aware)
- `server/routes/schedule/schedules.ts` → endpoints
- `server/routes/daily/leave.ts:437-497` → provenance-based cleanup on leave DELETE
- `server/routes/daily/leave.ts:343-350` → GET /api/upcoming-leaves (reads from schedules not leave_requests)
- `migrations/schedule_phase_1_approve_leave_rpc_2026-10-06.sql` → RPC INSERT/UPDATE with source_leave_id

### 2.6 Canonical type values (live distribution)
```
오픈 1602 · 휴무 934 · 마감 663 · 오픈마감 53 · 미들 17 · 월차 8 · 지정휴무 2
```
Settings canonical: `오픈, 미들, 마감, 휴무, 월차, 오픈마감` + shared OFF: `지정휴무`

---

## 3. leave_requests (11 columns · 13 rows)

### 3.1 Live columns
```
id (uuid PK), employee_id (int FK · 박부장 1건 orphan 보존 · DEFERRED),
employee_name (text snapshot), leave_type (text),
start_date (date YYYY-MM-DD), end_date (date YYYY-MM-DD),
reason (text), status (text: pending/approved/rejected/cancelled),
reviewer_note (text), created_at (timestamptz), reviewed_at (timestamptz, nullable)
```

### 3.2 Required / Optional
- PK: `id` (uuid)
- Required: `id`, `employee_id`, `employee_name`, `leave_type`, `start_date`, `end_date`, `status`
- Nullable: `reason` (empty acceptable), `reviewer_note` (empty acceptable), `reviewed_at` (null until review)
- Status enum: `pending`, `approved`, `rejected`, `cancelled`

### 3.3 Not in live (audit report false positives · 모두 **코드도 참조 안 함** · OK)
- `request_type` — not in live · not in code (grep 재검증 완료)
- `half_day_type` — not in live · not in code · 반차는 `leave_type IN ('오전반차', '오후반차')` 로 encode
- `approver_id` — not in live · not in code · RPC `p_reviewer_id` 는 param-only · 저장 안 함
- `approved_at` — not in live · not in code · `reviewed_at` 사용 (live/code 일치)

### 3.4 Relations
- `employee_id → employees.id` **DEFERRED** (박부장 historical row 보존 목적)
- Referenced BY `schedules.source_leave_id` RESTRICT

### 3.5 Code consumers
- `server/routes/daily/leave.ts` (GET /api/leave-requests, POST, PUT, DELETE)
- `src/lib/leaveApi.ts` + `src/hooks/useLeaveManager.ts`
- `src/shared/schemas/leave.ts` (zod)
- `src/shared/dtos/leave.ts` (DTO)
- `migrations/schedule_phase_1_approve_leave_rpc_2026-10-06.sql` → `approve_leave_request` RPC

### 3.6 Business invariants (OBSERVED · NOT enforced by schema)
- Canonical identity for approved leave projection: `(employee_id, start_date..end_date, leave_type, status)`.
  - If same (employee_id, start_date, end_date, leave_type) 가 둘 다 `status='approved'` 이면 중복 승인 → leave balance over-count.
  - 현재 live 에 1건 발견 (P1-B · `f5b95457` + `f89ec3e1` · 강남규 2026-09-11).
- Semantic rule: 반차 = `leave_type IN ('오전반차', '오후반차')` · 0.5일 소진 · 그 외 full-day

---

## 4. app_settings (3 columns · 19 rows)

### 4.1 Live columns
```
key (text PK), value (jsonb), updated_at (timestamptz)
```

### 4.2 Required / Optional
- PK: `key` (text, unique)
- Required: `key`, `value`
- Nullable: `updated_at` (defaults to NOW())
- Not in live: `created_at` (observable only)

### 4.3 Known keys
- `all_settings` → jsonb containing: `ranks, positions, wageRates, workplaces, scheduleTypes, employmentTypes, underConstruction, defaultAnnualLeave, employeeWageOverrides`
- `schedule_lock_YYYY-MM` → jsonb boolean (`true` = locked)
- 15+ other setting keys

### 4.4 Code consumers
- `server/lib/scheduleLock.ts` → lock read + guard
- `server/services/settingsService.ts` → settings get/patch (settings_patch_jsonb RPC)
- `src/lib/settingsApi.ts` + `src/hooks/useSettings.ts` → client

---

## 5. Lock storage · app_settings.schedule_lock_YYYY-MM

### 5.1 Shape
- key: `schedule_lock_<YYYY>-<MM>` (예: `schedule_lock_2026-06`)
- value: `true` (locked) · `false` (unlocked) · 없으면 unlocked

### 5.2 Current live state
- `schedule_lock_2026-06` = `true` (updated_at 2026-07-02T21:34:34.383+00:00)
- `schedule_lock_2026-07` = `false` (updated_at 2026-07-04T06:02:23.172+00:00)
- 그 외 월은 key 없음 → unlocked

### 5.3 Validation
- key format regex: `/^schedule_lock_\d{4}-(0[1-9]|1[0-2])$/`
- audit 결과: invalid=0 · duplicate=0

### 5.4 Server guard
- `server/lib/scheduleLock.ts:assertScheduleNotLockedForDates(dates, authLevel)` → lv≥9 bypass
- 경로: schedule PUT · schedule POST batch · schedule copy · leave approve · leave delete (approved)

---

## 6. Supporting tables (empty)

### 6.1 employee_contracts
- columns: `id, employee_id, employee_name, start_date, end_date, contract_type, storage_path, created_at`
- FK: `employee_id → employees.id` RESTRICT
- live rows: 0

### 6.2 resignation_requests
- columns: `id, employee_id, employee_name, status, reason, approved_at, approved_by, handover_notes, created_at`
- FK: `employee_id → employees.id` RESTRICT
- live rows: 0
- note: `effective_date` / `last_working_day` 저장 컬럼 없음 → 저장 모델 재검토 필요 (영향 0 while empty)

### 6.3 reservations
- columns: `id, date, time, assigned_employee_id, employee_name_snapshot, vendor_id, purpose, company, contact_name, phone, note, created_at`
- FK: `assigned_employee_id → employees.id` NO ACTION
- live rows: 0

### 6.4 attendance (NOT a live table)
- PostgREST HEAD request → 204 (count route 가 empty response)
- SELECT → 404 "Could not find the table 'public.attendance' in the schema cache"
- **표면상 존재 X · 실제 사용 X**
- Code references (grep 전수 완료): **0건** · 테이블 자체 참조 없음
- `/api/lunch-attendance` 엔드포인트는 `schedules` 테이블에서 "오늘 출근자" 계산 · 별개
- CLASSIFICATION: **DEAD** (code 참조 0 · 테이블 없음 · 영향 0)

---

## 7. Proposed schema changes (require user approval · NOT applied)

### 7.1 schedules.updated_at (OBSERVE option)
- `ALTER TABLE schedules ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW()` + trigger on UPDATE
- 이유: lock 이후 row-level 수정 흔적 추적 (server guard 가 쓰기를 통제하지만 audit 가능성 상향)
- 대안: 유지 (server guard + PHASE 3C batch route 전체 date 집합 검증으로 cover)

### 7.2 leave_requests UNIQUE on canonical identity (DUPLICATE guard)
- 후보 1: `UNIQUE(employee_id, start_date, end_date, leave_type) WHERE status IN ('pending','approved')` (partial unique)
- 후보 2: application-side guard — pending/approved 상태에 같은 (emp, start, end, leave_type) 존재 시 400 (더 완만)
- 이유: P1-B 재발 방지 (중복 승인 → leave balance over-count)
- 대안: 유지 + 매뉴얼 모니터링

### 7.3 resignation_requests effective_date
- 저장 column 없음 → 미래 퇴직 처리 로직에서 참조 가능한 field 필요
- 현재 영향 0 (empty table)
- 적용 보류 (사용자 결정)

---

END OF LIVE SCHEMA CONTRACT
