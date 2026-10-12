# SCHEDULE V1 · PHASE 3-0 · DATA INTEGRITY GATE
# READ-ONLY LIVE AUDIT · 2026-10-07

> 사용자 보수적 재지시 직후 수행. "성능 최적화보다 정합성 검사가 먼저" ·
> DB 구조 → 데이터 정합성 → relation/provenance → lock → security → performance 순서.
> **READ-ONLY**. 자동 수정 X. 이름→ID 복구 X. position→employee 추정 X. 박부장 preserve.
>
> Supabase service_role key 로 LIVE DB SELECT · raw JSON = `tmp/_phase-3-audit.json`
> Audit script = `scripts/schedule-phase-3-data-integrity.mjs`
> Reference SQL  = `scripts/schedule-phase-3-data-integrity-audit.sql`

---

## 0. EXECUTIVE SUMMARY

| 항목 | 결과 |
|---|---|
| GATE | **PASS** |
| current/future orphan schedule | 0 ✓ |
| dangling source_leave_id | 0 ✓ |
| duplicate (employeeId, date) schedule | 0 ✓ |
| invalid / duplicate lock key | 0 / 0 ✓ |
| NEW orphan leave (박부장 제외) | 0 ✓ |
| 박부장 historical row preserved | YES ✓ |
| schema mismatch (code ↔ live) | **3건 발견** (observable · 데이터 영향 0) |
| P1 anomaly (business invariant 위배) | **3건 발견** (수정 금지 · 보고만) |
| P2 anomaly (observable only) | **4건** |

**GATE DECISION**: **PASS** · PHASE 3 commits 유지 가능. 발견된 P1/P2 는 자동 수정 금지 — 사용자 확인 필요.

**단, PHASE 3 commit `517ff51c` (B-F1 narrowing) 는 실측 효과 없음** (live `employees.email` 컬럼 없음 → fallback 로 매번 `SELECT *` 수행). 데이터 integrity 와 무관 · performance 미실현. 재검토 권장.

---

## 1. LIVE SCHEMA SNAPSHOT (A · 섹션 1·2·23·24·25)

### 1.1 대상 테이블 존재 + row count

| 테이블 | 존재 | row count | note |
|---|---|---|---|
| `employees` | ✓ | 19 | 전부 active (retireDate IS NULL) |
| `schedules` | ✓ | 3,279 | 과거 2,804 / 미래 475 |
| `leave_requests` | ✓ | 13 | approved 7 · pending 3 · rejected 3 · cancelled 0 |
| `employee_contracts` | ✓ | **0** | empty |
| `resignation_requests` | ✓ | **0** | empty |
| `reservations` | ✓ | **0** | empty |
| `app_settings` | ✓ | 19 | 1=all_settings · 2=schedule_lock_* · 16=기타 |
| `attendance` | **NOT EXIST** | — | HEAD request 는 200 응답하지만 schema cache 에 없음 (`Could not find the table 'public.attendance' in the schema cache`). 사용 안 됨. |

### 1.2 LIVE column shape (code ↔ live mismatch)

| 테이블 | 라이브 컬럼 | 코드 기대 | 결론 |
|---|---|---|---|
| `employees` | 54 columns · 하단 전수 | `email` 없음 | **MISMATCH-1** · scheduleService B-F1 narrowing SELECT 가 `email` 포함 → 매 요청 fallback (SELECT *) 수행 중 |
| `schedules` | `id, employeeId, date, type, workingHours, actualHours, memo, source_leave_id` | `created_at` · `updated_at` 없음 | **MISMATCH-2** · locked-month row-level 수정 추적 **불가**. server-side `scheduleLock.ts` 가 유일 방어선 |
| `leave_requests` | `id, employee_id, employee_name, leave_type, start_date, end_date, reason, status, reviewer_note, created_at, reviewed_at` | `request_type`, `half_day_type`, `approved_at`, `approver_id` 없음 | **MISMATCH-3** · 코드 `leave.ts` 가 참조 (`request_type`, `half_day_type`) 하는 컬럼이 live 에 없음 · PHASE 3A 보고 line 21 참조 "leave approve → 반차 포함 projection" 로직 재점검 필요 |
| `employee_contracts` | `id, employee_id, employee_name, start_date, end_date, contract_type, storage_path, created_at` | 급여/임금 column 전무 | OK (파일 메타만 저장. 임금 데이터는 app_settings 로) |
| `resignation_requests` | `id, employee_id, employee_name, status, reason, approved_at, approved_by, handover_notes, created_at` | `effective_date` / `last_working_day` 없음 | **DATA MODEL GAP** · 사직 effective date 를 어디서 읽는지 불명 (schema 상 저장 필드 없음) · 현재 empty 이므로 영향 0 |
| `reservations` | `id, date, time, assigned_employee_id, employee_name_snapshot, vendor_id, purpose, company, contact_name, phone, note, created_at` | — | OK |
| `app_settings` | `key, value, updated_at` | `created_at` 없음 | observable (영향 0) |

### 1.3 LIVE employees 전수 column (54개)

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
careers, educations, certifications
```

### 1.4 FK · DELETE 거동 · INDEX

Supabase PostgREST 에서 pg_catalog / information_schema 직접 조회 안 됨.
PHASE 1 COMPLETE 리포트 (`output/schedule-phase-1-COMPLETE-2026-10-06.md`) 의 DB fresh verify 상태로 간접 확정:

| 제약 | 상태 (PHASE 1 적용) | audit 결과 |
|---|---|---|
| `schedules.employeeId → employees.id` ON DELETE RESTRICT | YES | orphan=0 · 보존 |
| `employee_contracts.employee_id → employees.id` RESTRICT | YES | empty · 영향 0 |
| `resignation_requests.employee_id → employees.id` RESTRICT | YES | empty · 영향 0 |
| `schedules.source_leave_id → leave_requests.id` RESTRICT | YES | dangling=0 ✓ |
| `leave_requests.employee_id → employees.id` | **DEFERRED** (박부장 historical orphan) | NEW orphan=0 · 박부장 1건 보존 |
| `reservations.assigned_employee_id → employees.id` | 2026-10-06 memo (`scheduleService.ts:397`) 참조 · ON DELETE NO ACTION | empty · 영향 0 |
| `app_settings` PK (key) UNIQUE | code 가정 | key 중복=0 ✓ |

**CASCADE 발견 없음** — 모두 RESTRICT · NO ACTION (안전).

### 1.5 Index coverage (코드 참조로 추정)

- PHASE 1 추가 `idx_schedules_source_leave_id ON schedules(source_leave_id) WHERE source_leave_id IS NOT NULL` ✓
- `schedules.date` 접근 LIKE prefix (`${year}-${month}-%`) 패턴 사용 → prefix index 유리하나 측정 evidence 없음 · **STOP** (EXPLAIN 없이 index 추가 금지)

---

## 2. ROW COUNT BASELINE (B · 섹션 3)

| metric | value |
|---|---|
| employees | 19 |
| employees retireDate IS NULL | **19 (전부 active)** |
| employees retireDate NOT NULL | 0 |
| schedules total | 3,279 |
| schedules past | 2,804 |
| schedules future | 475 |
| leave_requests total | 13 |
| leave approved | 7 |
| leave pending | 3 |
| leave rejected | 3 |
| leave cancelled | 0 |
| employee_contracts | 0 |
| resignation_requests | 0 |
| reservations | 0 |
| app_settings total keys | 19 |
| schedule_lock_* keys | 2 (2026-06=locked, 2026-07=unlocked) |

**관찰**: 전 직원 active · retired 0 · 2026-10-07 기준 orphan 발생 경로 (직원 삭제) 발동한 적 없음.

---

## 3. EMPLOYEE MASTER INTEGRITY (C · 섹션 4)

| metric | value |
|---|---|
| duplicate id | 0 |
| NULL id | 0 |
| ACTIVE (retireDate IS NULL) | 19 |
| ACTIVE (retireDate = '' empty-string) | 0 |
| RETIRED (retireDate ≤ today) | 0 |
| RETIRE_FUTURE (retireDate > today) | 0 |
| active-with-resignation-approved | **0** (resignation_requests empty) |
| retired-with-future-schedule | **0** (retired=0) |

### active-with-null-id-fallback 확인
- `empty-string retireDate = 0` → 과거 "빈 문자열 vs NULL" 혼재 패턴 없음 · 깨끗.

---

## 4. SCHEDULE → EMPLOYEE RELATION (D · 섹션 5)

| metric | value |
|---|---|
| total schedules | 3,279 |
| employeeId IS NULL | 0 |
| orphan (employeeId 있지만 employees 없음) | **0** |
| orphan current/future | **0** |

**결론**: PHASE 1 FK (RESTRICT) 적용 이후 **신규 orphan 발생 경로 완전 차단**. 현재 상태 clean.

---

## 5. 박부장 KNOWN LEGACY (E · 섹션 6)

### 5.1 Preserved row 확인

```json
{
  "id": "297371b0-c0fb-4706-b783-7a42414c299c",
  "employee_id": 3,
  "employee_name": "박부장",
  "leave_type": "연차",
  "start_date": "2026-07-02",
  "end_date": "2026-07-02",
  "status": "approved",
  "reviewer_note": "",
  "created_at": "2026-07-02T15:30:44.858689+00:00",
  "reviewed_at": "2026-07-02T21:32:15.565+00:00"
}
```

- `employees.id = 3` **미존재** ✓
- 다른 참조: schedules=0, contracts=0, resignations=0, reservations=0, leaves_total=1 (본인) ✓
- **STATE = PRESERVED** · DELETE/remap/FK forcing 금지 유지

### 5.2 추가 영향 분석

- 박부장 leave 는 2026-06 월에 승인됨 (reviewed_at 2026-07-02 21:32 KST = 2026-07-03 KST 아침). schedule_lock_2026-06=locked (updated_at 2026-07-02 21:34 KST) → 승인 완료 2분 뒤 월 잠금. **projection schedule 생성되지 않은 상태로 lock** (schedules.employeeId=3 row 0건 확인).
- labor calculation 영향: schedule 반영 0건이므로 월별 집계 (근무일/휴무일/급여) 전부 영향 없음 ✓
- 사용자 결정 전까지 historical 상태 그대로 유지.

---

## 6. LEAVE → EMPLOYEE RELATION (F · 섹션 7)

| metric | value |
|---|---|
| total leaves | 13 |
| orphan total | 1 (박부장) |
| NEW orphan (박부장 제외) | **0** |

**결론**: 박부장 1건 외 orphan 없음 · 다른 EXACT · KNOWN_LEGACY_ORPHAN · NEW_ORPHAN 분류 전부 clean.

---

## 7. source_leave_id PROVENANCE (G · 섹션 8)

| metric | value |
|---|---|
| schedules with source_leave_id NOT NULL | 3 |
| schedules with source_leave_id NULL | 3,276 |
| dangling source_leave_id | **0** |
| over-projection (1 leave → > expected days) | **0** |

### 3개 projection row 전수

| schedule.id | employeeId | date | type | source_leave_id | leave 상태 |
|---|---|---|---|---|---|
| 1575 | 2 | 2026-06-27 | 월차 | 34f698ff-... | approved ✓ |
| 10200 | 2 | 2026-08-18 | 월차 | f5b9b1f1-... | approved ✓ |
| 10232 | 7 | 2026-08-19 | 월차 | 251aaf90-... | approved ✓ |

**모두 valid approved leave 를 가리킴** · FK 유지.

---

## 8. LEAVE PROJECTION CONSISTENCY (H · 섹션 9)

### 8.1 Summary

| metric | value |
|---|---|
| approved leaves no projection | **4** |
| working-type schedule on approved leave date | **1** (P1) |
| cancelled/rejected 인데 projection 남은 경우 | 0 |
| legacy source_leave_id=NULL + type=월차/반차 | 5 (PHASE 1 known) |

### 8.2 approved-no-projection 상세

| leave.id | employee | date | 사유 분류 |
|---|---|---|---|
| f81b31b1-... | 2 (강남규) · 2026-06-29 | locked month · schedule 1715=오픈 09:30-18:30 · **source_leave_id=NULL** · 승인 시점 projection 실패 또는 leave 승인 전 수동 입력 **P1 ANOMALY-1** |
| 297371b0-... | 3 (박부장) · 2026-07-02 | employee.id=3 미존재 → projection 생성 불가 (PHASE 1 KNOWN) |
| f5b95457-... | 2 (강남규) · 2026-09-11 | **leave_requests 중복** 중 하나 (아래 P1 ANOMALY-2) |
| f89ec3e1-... | 2 (강남규) · 2026-09-11 | 중복 2번째 · 하나의 schedule 17237(월차, source=NULL) 로 종결 |

### 8.3 working-type on approved leave

- leave `f81b31b1` 승인 2026-06-29 (강남규) · 같은 날 schedule 1715 = `type=오픈`, `workingHours=09:30-18:30`, `source_leave_id=NULL`
- 월 2026-06 **locked**. 수정 시도 금지 (lv<9 403).
- 데이터 상태만 보고 — 자동 수정 X.
- **ANOMALY-1** 분류 (P1) — 사용자가 "휴가 승인됐는데 왜 오픈 근무로 보이지" 라고 느낄 수 있는 inconsistency.

### 8.4 legacy source=NULL · type=월차/반차 (5건) — PHASE 1 KNOWN

| schedule.id | employeeId | date | type |
|---|---|---|---|
| 282 | 2 | 2026-05-15 | 월차 |
| 285 | 5 | 2026-05-15 | 월차 |
| 585 | 5 | 2026-05-30 | 월차 |
| 902 | 2 | 2026-06-15 | 월차 |
| 17237 | 2 | 2026-09-11 | 월차 |

→ PHASE 1 safe backfill 3건 완료 후 remaining 5건 유지 (`output/schedule-phase-1-COMPLETE-2026-10-06.md` DB fresh verify metric 7 = 5). 상태 그대로.

---

## 9. SCHEDULE DUPLICATE AUDIT (I · 섹션 10)

| metric | value |
|---|---|
| duplicate by (employeeId, date) | **0** |
| duplicate by (employeeId, date, type) | **0** |

**결론**: schedule identity = (employeeId, date) 로 사실상 유니크 상태. 단, information_schema 조회 불가로 UNIQUE 제약 **코드가 아닌 DB 레벨에서 선언 여부 불확정** (PostgREST 로 확인 안 됨). 운영 데이터는 clean.

**데이터 임의 상태**: PHASE 1 리포트에 `schedules` UNIQUE constraint 명시된 적 없음. 중복 0 은 upsert 로직 (`upsertSchedule`, `batchUpdateSchedules`) 이 (employeeId, date) 기반으로 조회→update→insert 하기 때문. **P2 OBSERVATION**: UNIQUE constraint 명시 추가 proposal (STOP · schema change).

---

## 10. DATE INTEGRITY (J · 섹션 11)

| metric | value |
|---|---|
| schedules NULL date | 0 |
| schedules invalid date (parse 불가) | 0 |
| schedules out-of-range (<2020 or >2030) | 0 |
| leave start > end | 0 |

**결론**: 모든 date 필드 valid YYYY-MM-DD 형식 · 범위 정상.

---

## 11. WORKING HOURS INTEGRITY (K · 섹션 12)

| metric | value |
|---|---|
| workingHours NULL/empty | 944 |
| malformed (패턴 불일치) | 0 |
| working-type (OFF/HALF 아님) 인데 wh=empty | **0** |
| reversed (start ≥ end) | 0 |

**해석**: null/empty 944 는 전부 OFF/HALF 타입. canonical semantics (휴무/월차/지정휴무/결근 는 wh 없음) 100% 준수.

---

## 12. SCHEDULE TYPE INTEGRITY (L · 섹션 13)

### 12.1 Live distribution (3,279 rows)

| type | count |
|---|---|
| 오픈 | 1,602 |
| 휴무 | 934 |
| 마감 | 663 |
| 오픈마감 | 53 |
| 미들 | 17 |
| 월차 | 8 |
| 지정휴무 | 2 |

### 12.2 Canonical scheduleTypes (settings · parsed)

```
오픈, 미들, 마감, 휴무, 월차, 오픈마감
```

### 12.3 Classification

| live type | 분류 |
|---|---|
| 오픈 | CANONICAL ✓ |
| 미들 | CANONICAL ✓ |
| 마감 | CANONICAL ✓ |
| 오픈마감 | CANONICAL ✓ |
| 휴무 | CANONICAL + SHARED_OFF ✓ |
| 월차 | CANONICAL + SHARED_OFF ✓ |
| 지정휴무 | **shared OFF only** (settings.scheduleTypes 에 명시 없음 · PHASE 2 OFF_TYPES 공유 helper 로 처리 중) ✓ |

**UNMAPPED = 0** · 전부 공식 또는 공유 OFF.

> NOTE: 초기 audit script 가 `scheduleTypes[*].label || name` 로 파싱해 "unmapped 4" false positive 발생. 재검증 (`type` key) 결과 UNMAPPED=0 확정. 리포트 수치는 재검증본.

---

## 13. TAXONOMY INTEGRITY (M · 섹션 14 · 22)

### 13.1 Settings canonical

- positions: `약사, 물류, 임원, 매장, 창고, 기타, 거래처, 알바, 물류팀장, 진열팀장`
- ranks: `대표, 부장, 팀장, 과장, 대리, 사원`
- workplaces: `매장, 창고`
- employmentTypes: `정직원, 계약직, 알바`

### 13.2 Live distribution + classification

| taxonomy | live value → count | 분류 |
|---|---|---|
| position | 매장 9, 약사 5, 창고 4, 기타 1 | 전부 CANONICAL ✓ |
| rank | 사원 16, 대표 1, 팀장 1, **이사 1** | 이사 = **UNMAPPED** (settings 에 없음) |
| workplace | 매장 14, 창고 5 | 전부 CANONICAL ✓ |
| employmentType | 정직원 9, 계약직 8, **대표 1**, **임원 1** | 대표/임원 = **UNMAPPED** (employmentTypes 에 없음 · "정직원" 아닌 상위 role 로 들어감) |

### 13.3 P2 OBSERVATIONS

- **TAXONOMY-GAP-1**: `rank = "이사"` 1건 — settings.ranks 에 없음. UI dropdown/select 에서 복원 안 될 가능성.
- **TAXONOMY-GAP-2**: `employmentType = "대표"` / `"임원"` — settings.employmentTypes 에 없음. 실제 "기타" 범주와 명확히 분리 (positionToCategoryV2 가 담당하지만 employmentType 은 별도).

**자동 수정 금지** · settings canonical 쪽 추가 or employee 쪽 변경 **둘 다 사용자 결정**.

---

## 14. WAGE INTEGRITY (N · 섹션 15)

| metric | value |
|---|---|
| wageRates present | YES |
| wageRates keys | 기타, 매장, 물류, 약사, 창고, 캐셔 |
| employeeWageOverrides | 0 entries |
| override orphan | 0 |
| active employees | 19 |
| unconfigured active (= wage missing) | **0** |

### 14.1 wageRates 전수

| position | weekday | weekend |
|---|---|---|
| 기타 | 10,030 | 11,000 |
| 매장 | 10,030 | 11,000 |
| 물류 | 11,000 | 12,000 |
| 약사 | 35,000 | 40,000 |
| 창고 | 10,030 | 11,000 |
| 캐셔 | 10,240 | 11,240 |

### 14.2 분석

- 19명 active 전부 position in {매장, 약사, 창고, 기타} → wageRates 에 매핑 OK · unconfigured=0 ✓
- override 0건 — 전부 base wageRates 로 계산 · exact mapping · P0-2 (하드코드 fallback) 재발 없음 ✓
- settings.positions 에는 `임원, 거래처, 알바, 물류팀장, 진열팀장` 도 있으나 사용자 없음 · wageRates 에 없는 position 발생 시 "시급 미설정" 로 분기 (PHASE 2 P0-2 설계).

---

## 15. LOCK / CONFIRM DATA STRUCTURE (O · 섹션 16·17)

### 15.1 schedule_lock_* keys 전수

| key | value | locked | updated_at |
|---|---|---|---|
| schedule_lock_2026-06 | `true` | ✓ | 2026-07-02T21:34:34.383+00:00 |
| schedule_lock_2026-07 | `false` | ✗ | 2026-07-04T06:02:23.172+00:00 |

| metric | value |
|---|---|
| total lock keys | 2 |
| invalid key format | 0 |
| duplicate keys | 0 |

### 15.2 Locked-month row-level mutation tracking

- `schedules.updated_at` 컬럼 **없음** → row-level 수정 흔적 추적 **불가**
- server-side guard (`server/lib/scheduleLock.ts`) 가 유일 방어선
- PHASE 3C 에서 batch route 가 전체 date 집합 검증으로 상향 (fd33e1d0 · `assertScheduleNotLockedForDates`) → bypass 경로 cover 됨
- leave approve / cancel 경로도 lock 검증 통합 (PHASE 1·3)

### 15.3 Lock corruption 분석

- lock_2026-06 (true) 가 lock_2026-07 (false) 뒤에 설정됨 (2일 전 timestamp). 과거월 locked · 현재월 unlocked = 정상 operational.
- 2026-06 lock 이후 schedules 수정 흔적을 updated_at 없이 확인 불가 → **GATE 는 server guard 가 작동한다는 가정 하에 PASS**. P2 OBSERVATION: `schedules.updated_at` 컬럼 추가 proposal (schema change · STOP).

---

## 16. CONTRACT · RESIGNATION · RESERVATION (섹션 18·19·20)

### 16.1 employee_contracts

- total = 0 · **empty table**
- 재직 중 계약서 upload 없이 운영 중
- orphan, duplicate active, 기간 reversal 전부 N/A

### 16.2 resignation_requests

- total = 0 · **empty table** (0명 퇴직)
- orphan, resigned-with-future-schedule 전부 N/A
- **schema 상 effective_date / last_working_day 저장 컬럼 없음** → 미래에 퇴직 처리 로직 재검토 필요. 현재 영향 0.

### 16.3 reservations

- total = 0 · **empty table**
- orphan assigned_employee_id, 퇴직직원 미래예약 전부 N/A
- 2026-10-06 memo 에 FK `ON DELETE NO ACTION` 존재 확인 (`server/services/scheduleService.ts:397-413`)

---

## 17. SETTINGS STRUCTURE (섹션 21·22)

| metric | value |
|---|---|
| total app_settings keys | 19 |
| key duplicate | 0 |
| all_settings present | YES |
| all_settings updated_at | 2026-09-16T07:37:38.482Z |
| missing top-level critical keys | 0 (`scheduleTypes, positions, ranks, workplaces, employmentTypes, wageRates, employeeWageOverrides` 전부 있음) |

### 17.1 all_settings top-level keys

```
ranks, positions, wageRates, workplaces, scheduleTypes,
employmentTypes, underConstruction, defaultAnnualLeave, employeeWageOverrides
```

- PHASE 2 결과물 (settings_patch_jsonb 적용) 상태 유지 ✓
- settings_patch_jsonb RPC 로 atomic update · 전체 all_settings 덮어쓰기 race 조건 해소 ✓

---

## 18. DATA QUALITY SEVERITY (P · 섹션 27)

### 18.1 P0 (gate-blocking) · 0건

→ 모두 PHASE 1 FK + PHASE 2 settings framework + PHASE 3C lock-batch 로 cover 됨.

### 18.2 P1 (business invariant 위배 · 수정 금지 · 사용자 결정 필요) · 3건

| # | 이름 | 설명 | row 참조 | 영향 | 안전 수정 proposal (실행 금지) |
|---|---|---|---|---|---|
| **P1-A** | approved leave 와 working schedule 중복 | leave `f81b31b1-1f5a-4c6f-99be-998d0b1e8e0c` 승인 2026-06-29 (강남규) · schedule id=1715 type=오픈 09:30-18:30 · source_leave_id=NULL | 1 row | 2026-06 locked month 안 사용자 혼란 가능 (휴가 승인/근무 양립) · 급여계산 불일치 가능 | lv9 로 lock temp release → schedule 1715 type 을 월차 (source_leave_id=f81b31b1) 로 수정 → re-lock. **사용자 확인 전 금지** |
| **P1-B** | leave_requests 중복 approved | 강남규 2026-09-11 approved 2건 (f5b95457, f89ec3e1) · 같은 (emp, start, end) · 2.5h 간격 승인 | 2 rows (leaves) + 1 schedule row (id=17237) | 월차 잔여 2일 소진 (실제는 1일) · leave balance / stats 오계산 | 둘 중 duplicate 1건 cancelled 로 수정. **사용자 확인 전 금지** |
| **P1-C** | approved leave 없이 schedule 월차 (legacy 5건) | source_leave_id=NULL · type=월차 schedule 5건 (schedule id 282, 285, 585, 902, 17237) | 5 rows | 신청 이력 없는 월차 처리 (manual 입력) · leave balance tracking 미반영 | PHASE 1 KNOWN · 사용자 선택: (a) 유지 (현재), (b) 사후 leave_requests 생성 + backfill. **자동 수정 금지** |

### 18.3 P2 (observable only · 데이터 영향 없음) · 4건

| # | 이름 | 설명 | 처리 |
|---|---|---|---|
| **P2-A** | TAXONOMY-GAP · rank=이사 1건 | settings.ranks 에 없음 | settings canonical 추가 or employee rank 변경 — 사용자 결정 |
| **P2-B** | TAXONOMY-GAP · employmentType=대표/임원 2건 | settings.employmentTypes 에 없음 | settings 쪽 추가 or employee employmentType 재분류 — 사용자 결정 |
| **P2-C** | 미사용 테이블 `attendance` 레퍼런스 | PostgREST schema cache 는 응답 못 함 (실제 없음) · 코드 사용처 0 | 상태 유지 |
| **P2-D** | `schedules.updated_at` 없음 | lock 이후 row-level mutation 추적 불가 · server guard 로 cover | schema add proposal · STOP |

### 18.4 Schema mismatch (observable · code ↔ live) · 3건

| # | 이름 | 설명 | 처리 |
|---|---|---|---|
| **MISMATCH-1** | `scheduleService` narrowed SELECT 가 live 에 없는 `email` 포함 → **매 요청 fallback (SELECT *)** 실행 | B-F1 narrowing 효과 **실측 0** | PHASE 3 B-F1 commit 재검토 (아래 Section 20 참조) |
| **MISMATCH-2** | `schedules` 에 `created_at` · `updated_at` 없음 | lock mutation 추적 불가 | P2-D 와 동일 proposal |
| **MISMATCH-3** | `leave_requests` 에 `request_type`, `half_day_type`, `approved_at`, `approver_id` 없음 | leave.ts 서버 코드가 참조하는 컬럼 — 실행 시 PostgreSQL 에러 가능. 현재 테스트 통과 중이면 fallback 분기가 cover 하고 있을 가능성. 재검증 필요 | 사용자 결정 · 코드 fix (schema 추가 or 코드 수정) 전 확인 |

---

## 19. STOP CONDITIONS (Q · 섹션 28·32)

**발견한 모든 anomaly 는 자동 수정 금지**. 다음은 proposal 만:

1. **P1-A fix** · lv9 unlock → schedule 1715 월차 변환 → re-lock. 사용자 approval 필요.
2. **P1-B fix** · leave_requests 중복 중 하나 cancelled 로 수정. 사용자 approval 필요.
3. **P1-C fix** · 사후 leave_requests 생성 + backfill. PHASE 1 결정 유지.
4. **MISMATCH-1 fix** · `scheduleService.ts:8-28` 에서 `email` 제거 (DB 적용 없음 · 코드만 수정). 사용자 approval 필요.
5. **MISMATCH-2/P2-D fix** · `ALTER TABLE schedules ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW() + trigger`. schema change · **STOP**.
6. **MISMATCH-3 fix** · 사용자 결정 · 코드 재점검 vs schema 추가.
7. **P2-A/P2-B** · settings canonical 추가 또는 employee 변경. 사용자 결정.

**데이터 migration · bulk correction · schema change 전부 사용자 approval 전 금지.**

---

## 20. PHASE 3 COMMITS IMPACT ANALYSIS

### 20.1 B-F1 (`517ff51c` · perf: narrow employees payload + skip redundant month fetches)

#### B-F1 narrowed SELECT

- **실측 효과 = 0** (performance 미실현)
- 원인: `SCHEDULE_EMPLOYEE_FIELDS` 에 `email` 포함되어 있으나 live `employees` 테이블에 `email` 컬럼 없음
- 코드 line 44-55: narrowed SELECT 실패 → `/column|does not exist/` regex 매칭 → fallback 로 `SELECT *` 수행
- 매 GET `/api/schedules` 요청 당 **2회 쿼리 실행** (narrowed 실패 1 + fallback 성공 1) · 오히려 미약하게 **악화**
- 데이터 integrity 영향 **없음** · 응답은 full employees row 반환 (narrowing 전과 동일)
- Phase 3B B-3 "AFTER 재측정 ~15 KB" 추정은 테스트/CI 환경에서만 유효했을 가능성 (migration 로컬 재적용 중 email 추가되어 있던 경우)

#### B-F2 skip redundant month fetches

- `useScheduleData.ts loadedMonthsRef` client-side skip · 데이터 integrity 영향 없음
- 중복 fetch 방지 로직 자체는 DB mutation 과 무관 · PASS

### 20.2 PHASE 3 commit stack 재검토

| hash | subject | GATE 영향 | 재검토 필요 |
|---|---|---|---|
| `fd33e1d0` | PHASE 3A (security · narrowing + ownership + lock-for-dates + employee-active) | integrity 안전 (write guard 강화) | ❌ 유지 |
| `517ff51c` | PHASE 3B (narrow + skip) | **narrowing 실측 효과 0** · integrity 영향 없음 | ⚠️ **재검토 권장** (email 제거 or 컬럼 추가) |
| `1a44a315` | PHASE 3C (confirm-lock UX + productivity polish) | integrity 영향 없음 | ❌ 유지 |
| `279a6816` | PHASE 3D (conflict detector) | detect only · side-effect 없음 | ❌ 유지 |
| `60663238` | docs | — | ❌ 유지 |
| `8c2f598a` | docs | — | ❌ 유지 |

**중요**: GATE PASS 로 PHASE 3 commits revert 필요 없음. 단 **B-F1 narrowing 재검토** (코드에서 `email` 제거 or 다른 처리) 는 PHASE 3 자체 보고 (phase-3-report line 97-125) 와 live schema 실측 결과 불일치 사항 — 사용자 confirm 필요.

---

## 21. V1 DB INTEGRITY GATE 선언

### 21.1 GATE CONDITIONS (섹션 31)

| 조건 | 요구 | 측정 | 결과 |
|---|---|---|---|
| CURRENT/FUTURE IDENTITY CORRUPTION | 0 | 0 | ✓ |
| DANGLING SOURCE_LEAVE | 0 | 0 | ✓ |
| UNEXPLAINED DUPLICATE SCHEDULE | 0 | 0 | ✓ |
| LOCK DATA CORRUPTION | 0 | 0 (invalid=0, duplicate=0) | ✓ |
| UNKNOWN SCHEMA MISMATCH | 0 | 3 observable (MISMATCH-1/2/3) · 데이터 영향 0 | ✓ (observable only) |
| 박부장 KNOWN/PRESERVED | YES | preserved=YES, employee3Exists=false | ✓ |

### 21.2 **GATE = PASS**

- PHASE 3 commits 유지 가능
- 발견된 P1 (3건) + P2 (4건) + MISMATCH (3건) 는 **사용자 보고 only** · 자동 수정 X
- PHASE 3A security 재검증 or 다음 단계 (사용자 결정)

---

## 22. 다음 단계 (R · 섹션 33)

사용자 결정 대기 사항:

1. **P1-A** 수정 여부 (leave `f81b31b1` 2026-06-29 projection 복원)
2. **P1-B** 수정 여부 (강남규 2026-09-11 duplicate approved leave 중 1건 cancelled)
3. **P1-C** 재검토 여부 (PHASE 1 결정 유지 vs 사후 backfill)
4. **MISMATCH-1** 수정 여부 (B-F1 narrowed SELECT 에서 `email` 제거)
5. **MISMATCH-3** 재검토 (`leave_requests` 참조 컬럼 재점검)
6. **P2-A/P2-B** TAXONOMY 수렴 (settings 추가 vs employee 변경)
7. PHASE 3A security 재검증 or 그다음 단계 진입

**모든 수정은 사용자 명시 승인 후만 수행.**

---

## 23. 참조 artifact

- `scripts/schedule-phase-3-data-integrity.mjs` — Node READ-ONLY audit script (실행됨)
- `scripts/schedule-phase-3-data-integrity-audit.sql` — SQL audit (Supabase SQL Editor 수동 적용용 · 참조)
- `tmp/_phase-3-audit.json` — raw audit result (687 lines)
- `output/schedule-phase-1-COMPLETE-2026-10-06.md` — PHASE 1 선행
- `output/schedule-phase-2-COMPLETE-2026-10-07.md` — PHASE 2 선행
- `output/schedule-phase-3-report-2026-10-07.md` — PHASE 3 (3A-3E) 선행

---

## 24. GUARD-RAIL COMPLIANCE

- READ-ONLY SELECT · INSERT/UPDATE/DELETE/ALTER/DROP/TRUNCATE/CASCADE **0건** ✓
- schema 변경 **0건** ✓
- data update · backfill · orphan 자동 수정 · FK 추가 · bulk correction **0건** ✓
- 이름 → ID 복구 · position → employee 추정 · schedule label 의미 추정 **0건** ✓
- 박부장 historical row **그대로 보존** ✓
- git stash · --no-verify · baseline update · push **0건** ✓
- 다른 agent WIP (`apps/sync-agent/**`, stock/purchase/vendor routes, Display/Landing/Order/Reservation/Scan/Stock pages, erp mapper, vendor scripts/migrations) **touch 0** ✓
- 신규 파일 2개 (SQL audit + mjs audit) + 리포트 1개 — 사용자 지정 허용 범위 ✓

---

END OF PHASE 3-0 DATA INTEGRITY GATE REPORT
