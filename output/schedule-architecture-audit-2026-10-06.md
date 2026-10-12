# Schedule / Staff Architecture Audit — 2026-10-06
# PHASE 0 · READ-ONLY

---

## [ACTIVE SCREENS]

### 1. 메인 월간 스케줄
- **ROUTE**: `App.tsx` page=`"schedule"` → `PAGE_MAP["schedule"]` (line 334)
- **ENTRY COMPONENT**: `src/components/SchedulePage/SchedulePage.tsx`
- **CHILD COMPONENTS**:
  - `ScheduleFilterBar` — position 탭 + 검색
  - `ScheduleToolbar` — 월 네비 + 편집/잠금/복사/합계 버튼
  - `ScheduleGrid` — 전체 테이블 (직원 × 날짜)
  - `ScheduleCell` — 개별 셀 (popover 편집)
  - `EmployeeNameCell` — 이름 + 직군 표시
  - `SummaryRow` — 하단 일별 집계 행
  - `UpcomingLeaveBanner` — 관리자(lv≥2) 전용 다가오는 연차 배너
  - `SearchInsights` — 검색 결과 인사이트
- **HOOK**: `useScheduleData` (fetch/mutate), `useDisplayZones`, `useSettings`, `useUpcomingLeaves`
- **API**:
  - `GET /api/schedules?year=&month=` — 전체 직원 + 월별 스케줄
  - `PUT /api/schedules` — 셀 단건 upsert
  - `POST /api/schedules/batch` — 일괄 upsert
  - `POST /api/schedules/copy` — 전월 복사
  - `GET /api/leave-stats?year=` — 연도별 직원별 월차 카운트
  - `GET /api/settings?key=schedule_lock_YYYY-MM` — 월 잠금 상태
  - `PUT /api/settings` — 월 잠금 저장
  - `GET /api/upcoming-leaves?days=N` — 다가오는 연차 배너용
- **SERVER ROUTE**: `server/routes/schedule/schedules.ts`
- **SERVICE**: `server/services/scheduleService.ts` — `getMonthlySchedule`, `updateOrCreateSchedule`, `batchUpdateSchedules`, `copySchedulesFromPreviousMonth`
- **DB TABLE**: `employees`, `schedules`, `app_settings` (schedule_lock_* key)

### 2. 날짜 클릭 → 일일 근무 Timeline Modal
- **ENTRY COMPONENT**: `src/components/DayTimelineModal/DayTimelineModal.tsx`
- **TRIGGER**: `ScheduleGrid` → `onSetTimelineDate` → `SchedulePage.timelineDate` state → 조건부 렌더
- **CHILD COMPONENTS**: `HeaderBar`, `WorkTimeSection`, `ZoneSection`, `WorkerChips`, `BreakTimeline`
- **HOOK**: `useSlotHandlers` (zone_day_assignments 드래그 슬롯 핸들러), `useSettings`
- **API**:
  - `GET /api/zone-day/:date` — 일별 배정 불러오기 (zone_day_assignments)
  - `POST /api/zone-day/:date` — 일별 배정 저장 (is_confirmed 포함)
- **SERVER ROUTE**: `server/routes/display/zoneAssignments.ts`
- **SERVICE**: 직접 supabase 쿼리 (별도 서비스 없음)
- **DB TABLE**: `zone_day_assignments`
- **SCHEDULE DATA SOURCE**: `employees` prop으로 전달 (SchedulePage에서 fetch한 데이터 재사용 — 별도 fetch 없음)
- **NOTE**: `onUpdateSchedule` prop (line 52)은 Modal 내에서 실제 호출 없음. 주석에 "완전 dead" 명시 (line 51).

### 3. 직원 이름 클릭 → 직원 월별 스케줄 Modal (EmployeeCalendarModal)
- **ENTRY COMPONENT**: `src/components/EmployeeCalendarModal/EmployeeCalendarModal.tsx`
- **TRIGGER**: `ScheduleGrid` → `onEmployeeNameClick` → `calendarEmployee` state
- **CHILD COMPONENTS**: `BulkTab`, `ZoneAssignTab`, `CalendarGrid`, `EmployeeInfoForm`, `EmployeeProfileCard`
- **HOOK**: `useEditScheduleForm`, `useConfirm`, `useToast`
- **API**:
  - `GET /api/schedules?year=&month=` — 초기 year/month 이외 다른 달로 이동 시만 추가 fetch
  - `POST /api/schedules/batch` — 일괄 저장 (`onBulkSave` prop을 통해 SchedulePage로 위임)
  - `PUT /api/schedules` — 단건 저장 (`onUpdate` prop으로 위임)
- **SERVER ROUTE**: `server/routes/schedule/schedules.ts` (동일)
- **SCHEDULE DATA SOURCE**: `employee` prop에서 받은 `employee.schedules` 재사용 → 같은 달이면 별도 fetch 없음. 다른 달 이동 시만 `GET /api/schedules` 추가 호출 (line 109).

### 4. 직원관리 목록 (StaffManagePage)
- **ROUTE**: `business-manage` → `BusinessManagePage.tsx` → 내부 tab
- **ENTRY COMPONENT**: `src/components/StaffManagePage/StaffManagePage.tsx`
- **CHILD COMPONENTS**: `StaffListPanel`, `StaffListRow`, `StaffToolbar`, `StaffDetailPanel`, `StaffMobileDetail`, `CreateModal`
- **HOOK**: `useSortableTable`, `useColumnResize`, `useLeaveManager`, `useFetchEmployee`
- **API**:
  - `GET /api/employees` — 재직 직원 목록 (list view용 경량 fields)
  - `GET /api/employee-contracts` — 계약서 카운트 배지용
- **SERVER ROUTE**: `server/routes/schedule/schedules.ts` (GET /api/employees)
- **DB TABLE**: `employees`, `employee_contracts`

### 5. 직원관리 상세 (StaffDetailPanel)
- **ENTRY COMPONENT**: `src/components/StaffManagePage/StaffDetailPanel.tsx`
- **CHILD COMPONENTS**: `StaffConditionsSection`, `StaffLeaveSection`, `EmployeeProfileCard`
- **HOOK**: `useFetchEmployee` — `GET /api/employees/:id` (확장 HR 전체 필드)
- **API**:
  - `GET /api/employees/:id` — 전체 HR 필드 (본인 or lv≥7만)
  - `GET /api/employee-contracts?employeeId=` — 계약서 이력
- **SERVER ROUTE**: `server/routes/schedule/schedules.ts`
- **DB TABLE**: `employees` (select *), `employee_contracts`

### 6. 연차 신청 (LeavePage - apply mode)
- **ROUTE**: `leave` → `LeavePage.tsx` (mode="apply" or "both")
- **ENTRY COMPONENT**: `src/components/LeavePage/LeavePage.tsx`
- **API**:
  - `GET /api/leave-requests?employeeId=` — 본인 이력
  - `POST /api/leave-requests` — 신청 생성
  - `DELETE /api/leave-requests/:id` — 신청 취소
- **SERVER ROUTE**: `server/routes/daily/leave.ts`
- **DB TABLE**: `leave_requests`

### 7. 연차 승인 (LeavePage - approval mode / BusinessManagePage)
- **ROUTE**: `business-manage` → `ApprovalRequestPage` 또는 `LeavePage` mode="approval"
- **API**:
  - `GET /api/leave-requests?all=true` — 전체 직원 대기 목록
  - `PUT /api/leave-requests/:id` — 승인(approved)/반려(rejected) + 스케줄 자동 반영
- **SERVER ROUTE**: `server/routes/daily/leave.ts` (line 110)
- **DB TABLE**: `leave_requests`, `schedules` (승인 시 자동 upsert)
- **CRITICAL**: 연차 승인 시 `scheduleService.batchUpdateSchedules` 직접 호출 → `schedules` 테이블 자동 반영. 해당 경로는 `assertScheduleNotLocked` 라우터를 우회함 (서비스 직접 호출).

### 8. 스케줄 설정 (ScheduleSettingsPage)
- **ROUTE**: `schedule-settings`
- **ENTRY COMPONENT**: `src/components/ScheduleSettingsPage/ScheduleSettingsPage.tsx`
- **기능**: 직군별 기본 연차일수 설정 (약사/그 외 구분)
- **API**: `PUT /api/settings` (key=`all_settings`, value=AppSettings JSON)
- **SERVER ROUTE**: `server/routes/settings/settings.ts`
- **DB TABLE**: `app_settings`
- **NOTE**: 근무 유형(오픈/미들/마감 등) 시간 편집은 `SettingsModal` (SchedulePage 내 설정 버튼) 에서 처리. ScheduleSettingsPage는 연차일수만 담당.

### 9. 근무시간 계산 / 인건비 계산
- **COMPONENT**: `src/components/SchedulePage/scheduleHelpers.ts` 내 `getEmpMonthStats()` + `getCalculatedSummary()`
- **위치**: 클라이언트 사이드 순수 계산 함수 — 별도 API 없음
- **인건비 공식**: `paidHours × wageRate` (직군별 주중/주말 시급 적용)
- **데이터 소스**: `useSettings().wageRates` (app_settings DB → 클라이언트 메모리)
- **NOTE**: 근무시간 파싱은 `parseWorkingHours()` — `HH:MM-HH:MM` 포맷 전제. 휴게시간 차감 (`break_time_minutes`, `break_apply_paid` 컬럼 기반).

### 10. 직원 등록/수정/퇴사
- **ENTRY**: `EmployeeFormModal.tsx` (SchedulePage 내), `CreateModal.tsx` (StaffManagePage 내)
- **API**:
  - `POST /api/employees` — 신규 (lv≥9 전용)
  - `PUT /api/employees/:id` — 수정 (lv≥9 전용)
  - `DELETE /api/employees/:id` — 삭제 (lv≥9 전용, 스케줄 전체 cascade 삭제)
  - `POST /api/employees/:id/contract` — 계약서 파일 업로드
  - `POST /api/employees/:id/resume` — 이력서 Drive 업로드
- **SERVER ROUTE**: `server/routes/schedule/schedules.ts`
- **SERVICE**: `scheduleService.createEmployee`, `scheduleService.updateEmployee`, `scheduleService.deleteEmployee`
- **DB TABLE**: `employees`

### 11. Schedule 확정 Workflow
- **TRIGGER**: `ScheduleToolbar` → `onToggleMonthLock` → `useScheduleData.handleToggleMonthLock`
- **API**: `PUT /api/settings` (key=`schedule_lock_YYYY-MM`, value=true/false)
- **서버 검증**: `assertScheduleNotLocked()` — `PUT /api/schedules`, `POST /api/schedules/batch` 호출 시 server-side lock 체크 (lv≥9은 bypass)
- **SCOPE**: 월 단위 (YYYY-MM 키)
- **DB TABLE**: `app_settings` (key-value)

---

## [DB TABLES]

### employees (기본 스키마 + 누적 ALTER 컬럼)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | integer PK | auto-increment |
| name | text NOT NULL | 표시 이름 |
| position | text | 약사/캐셔/물류/진열/기타 |
| rank | text | 대표/부장/팀장/과장/사원 |
| employmentType | text | 정직원/계약직/알바 |
| hireDate | text | YYYY-MM-DD (text 저장 주의) |
| retireDate | text/null | YYYY-MM-DD |
| description | text | |
| workplace | text | 매장/창고 |
| gender | text | 남/여 |
| phone | text | 로그인 ID로 사용 (unique) |
| address | text | |
| birth_date | date | 2026-08-13 추가 |
| annual_leave_days | integer DEFAULT 15 | 2026-08-12 추가 |
| level | integer DEFAULT 1 | 0-9 권한 레벨 |
| employee_number | text | 사번 3자리 |
| contract_file_url | text | |
| resume_url | text | Drive 링크 |
| bankbook_image_url | text | |
| resignation_file_url | text | |
| break_time_minutes | integer DEFAULT 60 | 2026-08-13 추가 |
| break_apply_paid | boolean DEFAULT true | 2026-08-13 추가 |
| emergency_contact_* | text | 3개 컬럼 |
| contract_type / start / end | text / date / date | |
| wage_* | text / integer | 임금 관련 5컬럼 |
| insurance_* | date | 4대보험 4컬럼 |
| pharmacist_license_no | text | |
| careers / educations / certifications | jsonb | |
| performance_rating | text | |
| push_subscription | jsonb/object | 웹푸시 구독 정보 |
| resigned_at | timestamptz | staff.ts 참조 |

**NOTE**: `hireDate` / `retireDate`가 text 타입으로 저장됨. migrations에서 컬럼 정식 타입 확인 필요 (CREATE TABLE 원본 없음 — 초기 테이블 생성 migration이 누락됨).

---

### schedules

| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | (implicit, bigserial 추정) | |
| employeeId | integer FK→employees.id | camelCase 컬럼명 주의 |
| date | text | YYYY-MM-DD (text · not DATE type) |
| type | text | 오픈/미들/마감/오픈마감/오전반차/오후반차/휴무/월차/결근 |
| workingHours | text | "HH:MM-HH:MM" 형식 |
| actualHours | text | |
| memo | text DEFAULT '' | JSON 또는 자유 문자열 |
| UNIQUE | (employeeId, date) | upsert onConflict 기반 확인 |

---

### leave_requests

| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | uuid PK | gen_random_uuid() |
| employee_id | integer NOT NULL | employees.id |
| employee_name | text NOT NULL | 비정규화 스냅샷 — 이름 변경 시 불일치 위험 |
| leave_type | text NOT NULL | 연차/반차/오전반차/오후반차/월차/병가/특별휴가 |
| start_date | date NOT NULL | |
| end_date | date NOT NULL | |
| reason | text DEFAULT '' | |
| status | text DEFAULT 'pending' | pending/approved/rejected |
| reviewer_note | text DEFAULT '' | |
| created_at | timestamptz | |
| reviewed_at | timestamptz | |

---

### employee_contracts

| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | bigserial PK | |
| employee_id | integer NOT NULL | employees.id |
| employee_name | text NOT NULL | 비정규화 스냅샷 |
| contract_type | text | |
| start_date / end_date | date | |
| pdf_url | text NOT NULL | |
| pdf_size | integer | |
| storage_path / storage | text | supabase/local |
| approved_by | text | 감사용 이름 스냅샷 |
| approved_by_id | integer | |
| created_at | timestamptz NOT NULL | |

---

### resignation_requests

| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | bigserial PK | |
| employee_id | integer NOT NULL | |
| employee_name | text NOT NULL | 비정규화 스냅샷 |
| position | text | |
| hire_date / last_work_date | date | |
| reason / reason_detail | text | |
| handover_notes | text | |
| signature_data_url | text | |
| pdf_url | text | |
| status | text CHECK (pending/approved/rejected/withdrawn) | |
| approved_by | text | |
| approved_by_id | integer | |
| approved_at | timestamptz | |
| reject_reason | text | |
| created_at | timestamptz NOT NULL | |

---

### app_settings (KV 스토어)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| key | text PK | all_settings / schedule_lock_YYYY-MM / 기타 |
| value | jsonb | boolean (lock) or AppSettings JSON |
| updated_at | timestamptz 추정 | |

---

### zone_day_assignments (DayTimelineModal)

스키마는 `server/routes/display/zoneAssignments.ts` line 117 CREATE TABLE에 정의됨 (migration 파일 아닌 코드 내 embed):
```sql
CREATE TABLE IF NOT EXISTS zone_day_assignments (
  date text NOT NULL,
  zone_slots jsonb DEFAULT '{}',
  lunch_slots jsonb DEFAULT '{}',
  rest_slots jsonb DEFAULT '{}',
  is_confirmed boolean DEFAULT false,
  PRIMARY KEY (date)
)
```

---

### contract_clauses

- `migrations/create_contract_clauses_2026-08-05.sql`에 정의. 스케줄 영역과 직접 관계 없음 (ContractWriterPage 전용).

---

## [EMPLOYEE IDENTITY]

```
canonical_employee_identity = employees.id (integer PK)
name_identity_usage_count   = 3 테이블에서 비정규화 스냅샷으로 사용 (leave_requests.employee_name, employee_contracts.employee_name, resignation_requests.employee_name)
ambiguous_employee_links    = leave_requests.employee_name + employee_id 병행 저장 — employee_id가 FK이나 외래키 제약 없음 (CREATE TABLE에 REFERENCES 없음)
```

### 세부 사항

1. **schedules 테이블**: `employeeId` (integer) — id 기반 조인. 이름 직접 저장 없음. **SAFE**

2. **leave_requests 테이블**: `employee_id` (integer) + `employee_name` (text NOT NULL) 병행 저장.
   - 승인 자동 스케줄 반영 시 `employee_id` 사용 (line 136 `leave.ts`)
   - 연차 승인/반려 알림 발송 시 `employee_name` 스냅샷 사용 (이름 변경 시 오래된 이름 표시)
   - **RISK**: 이름 변경 후 기존 leave_requests 기록의 `employee_name`이 구 이름을 유지

3. **employee_contracts / resignation_requests**: 동일 패턴 (id + name 스냅샷)

4. **leave.ts `GET /api/upcoming-leaves`** (line 249-251): `schedules` → `employeeId`로 `employees.name` JOIN. **SAFE** (이름 항상 최신).

5. **AdminLoginModal에 하드코딩된 자격증명** (`SchedulePage.tsx` line 151):
   ```ts
   if (loginId === "osanmega" && loginPw === "1234")
   ```
   이것은 JWT 세션과 별개의 레거시 관리자 로그인. `authSession.level >= 2`이면 이미 관리자 모드이므로 이 버튼 자체는 미노출(line 502). **보안 위험: 하드코딩 자격증명**.

---

## [SCHEDULE SSOT]

### 데이터 흐름 및 소스

```
schedules 테이블 (Supabase)
        ↓
GET /api/schedules?year=&month=
        ↓
scheduleService.getMonthlySchedule()
  → employees 전체 + schedules WHERE date LIKE 'YYYY-MM-%'
  → in-memory JOIN: emp.id === schedule.employeeId
        ↓
useScheduleData.fetchScheduleData()
  → employees[] (각 emp.schedules 배열 포함)
        ↓
SchedulePage state [employees]
        ↓
 ┌─────────────────────────────────────────────────┐
 │ ScheduleGrid (메인 표)                          │ — SAME DATA
 │ DayTimelineModal (props로 employees 전달)       │ — SAME DATA (prop passthrough)
 │ EmployeeCalendarModal (같은 달: prop 재사용)    │ — SAME DATA
 │              (다른 달: GET /api/schedules 추가) │ — ADDITIONAL FETCH
 └─────────────────────────────────────────────────┘
```

**SSOT**: `schedules` DB 테이블 (단일)  
**DUPLICATED_SOURCE**: 없음. 메인/일일/직원 모달 모두 동일 API에서 fetch한 데이터 재사용.  
다만 `EmployeeCalendarModal`이 다른 달로 이동 시 추가 GET 호출하며, 그 결과가 로컬 `monthSchedules` state에만 저장됨 — 부모 `SchedulePage.employees` state와 비동기.

---

## [LEAVE SSOT]

```
leave_requests 테이블 (Supabase)
    SSOT-1 for 연차 신청/이력/잔여 계산

schedules 테이블 (Supabase)
    SSOT-2 for 실제 근무표 연차 표시
```

### 연차 승인 플로우에서의 이중 쓰기

`PUT /api/leave-requests/:id` (status=approved) 시:
1. `leave_requests.status` → `approved` 업데이트
2. `scheduleService.batchUpdateSchedules(dates, type="월차"|"오전반차"|"오후반차")` → `schedules` upsert

승인 이후 두 테이블 모두에 데이터 존재:
- `leave_requests`: 연차 신청 및 승인 이력 원본
- `schedules`: 근무표 표시용 복사본

### leave 삭제 시 cleanup

`DELETE /api/leave-requests/:id` (관리자, 이미 승인된 건) 시:
- `leave_requests` 삭제 후 `schedules`에서 해당 날짜 월차/반차 행도 삭제 (line 277-288)
- 일반 직원은 `pending` 상태만 삭제 가능 (schedules cleanup 없음)

**LEAVE SSOT 결론**: 이중 소스 관리지만 의도적 설계. `leave_requests`=신청/이력/잔여, `schedules`=표시용. 단, 연차 승인 이후 schedules 반영 실패 시 500 반환하여 부분 일관성 방지됨 (line 148).

---

## [SHIFT TYPES]

### DB vs Template vs Hardcode 분류

| 유형 | 저장 방식 | SSOT |
|------|-----------|------|
| 오픈 | app_settings(DB) 또는 DEFAULT_SCHEDULE_TYPES 상수 fallback | `useSettings().scheduleTypes` |
| 미들 | 동일 | `useSettings().scheduleTypes` |
| 마감 | 동일 | `useSettings().scheduleTypes` |
| 오픈마감 | 동일 | `useSettings().scheduleTypes` |
| 오전반차 | 동일 | `useSettings().scheduleTypes` |
| 오후반차 | 동일 | `useSettings().scheduleTypes` |
| 휴무 | 동일 | `useSettings().scheduleTypes` |
| 월차 | 동일 | `useSettings().scheduleTypes` |
| 결근 | 동일 | `useSettings().scheduleTypes` |

**DEFAULT_SCHEDULE_TYPES** (`src/constants/index.ts` line 17-27): 9가지 타입 상수. DB에 app_settings key=`all_settings`에 없으면 이 기본값으로 fallback.

**각 타입의 시간 (hours 필드)**: `useSettings().scheduleTypes` → DB에 저장된 사용자 정의값 우선. 직군별 override: `pharmHours` (약사), `logisticsHours` (물류), `partTimeHours` (알바).

**하드코딩된 타입 참조** (코드 내 직접 문자열 사용):
- `scheduleHelpers.ts` line 126: `OFF_TYPES_SET = new Set(["휴무","월차","결근"])` — 인건비 계산 제외
- `scheduleHelpers.ts` lines 177-178: `"오픈"`, `"미들"`, `"마감"` — summary 카운트 
- `scheduleHelpers.ts` line 181: `["휴무","월차","결근"]` — OFF 판정
- `leave.ts` line 122: `["오전반차","오후반차"]` → leave_type → schedule type 매핑
- `scheduleService.ts` line 87: `new Date(sched.date + "T00:00:00").getDay()` — copy 시 요일 추출
- `staff.ts` line 12: `OFF_TYPES = ["휴무","월차","지정휴무","오전반차","오후반차"]` — 예약 가능 여부

**RISK**: 이 하드코딩 타입 목록들이 `settings.scheduleTypes`에 신규 타입을 추가해도 자동으로 업데이트되지 않음. 관리자가 새 shift type 추가 시 일부 집계/필터 로직에서 누락될 수 있음.

**"2시간연장"** 타입: DEFAULT_SCHEDULE_TYPES에 없음. 별도 처리 코드 없음. 사용자 필요 시 settings에서 추가하는 커스텀 타입으로 처리 예정으로 보임.

---

## [ROLE TAXONOMY]

### Canonical 컬럼

| 목적 | 컬럼 | 위치 | SSOT |
|------|------|------|------|
| 직군(기능) | `employees.position` | DB | 약사/캐셔/물류/진열/기타 + 커스텀 |
| 직급(계급) | `employees.rank` | DB | 대표/부장/팀장/과장/사원 + 커스텀 |
| 권한 레벨 | `employees.level` | DB | 0-9 integer |
| 고용형태 | `employees.employmentType` | DB | 정직원/계약직/알바 |
| 근무지 | `employees.workplace` | DB | 매장/창고 |

### 카테고리 분류 (스케줄 집계용)

`src/lib/employeeCategory.ts` 및 `scheduleHelpers.ts`:
```
약사 → isPharmPosition (position === "약사")
물류 → isLogisticsPosition (position.includes("물류"))
창고 → isWarehousePosition (물류 포함 OR position === "창고")
매장(사원) → isStorePosition (캐셔/진열/매장 includes)
기타 → isOtherPosition (position === "기타" OR employmentType === "알바")
```

### "기타" 중복 표시 가능 원인

`positionToCategory()` (`scheduleHelpers.ts` line 45):
```ts
const exact = POSITION_TO_CATEGORY[pos]; // 약사/캐셔/진열/사원/물류/창고/매장 exact match
if (exact) return exact;
if (pos.includes("물류")) return "창고";
return "기타";  // 나머지 모두 기타
```

- `settings.positions` 기본값 = `["약사", "캐셔", "물류", "대표", "임원"]` (line 61)
- `"대표"`, `"임원"` 포지션을 가진 직원은 POSITION_TO_CATEGORY 매핑에 없음 → 모두 `"기타"` 분류
- 스케줄 필터 탭에서 "기타" 그룹에 집약됨

`#342` (2026-09-23) 동적 카테고리 기능 추가로 `settings.wageRates` keys를 category 기반으로 활용하나, wageRates에 없는 직군은 여전히 기타 취급.

---

## [CONFIRM FLOW]

### 월별 확정 (schedule_lock)

1. **UI Trigger**: `ScheduleToolbar` → `onToggleMonthLock` 버튼 (lv≥2 이상 노출)
2. **Client**: `useScheduleData.handleToggleMonthLock` → `saveSetting(key, bool)` → `PUT /api/settings`
3. **Server**: `server/routes/settings/settings.ts` → `app_settings` upsert
4. **Lock key format**: `schedule_lock_YYYY-MM` (예: `schedule_lock_2026-10`)
5. **Read**: 월 로드 시 `GET /api/settings?key=schedule_lock_YYYY-MM` → `app_settings` 조회

### 서버사이드 Lock 검증 (R-1 · 2026-09-23 추가)

`server/routes/schedule/schedules.ts` line 22-42:
- `PUT /api/schedules` 및 `POST /api/schedules/batch` 호출 시 `assertScheduleNotLocked()` 실행
- `app_settings` 직접 조회 → lock=true이고 authLevel < 9 → `403 SCHEDULE_LOCKED`
- **lv≥9 관리자는 lock bypass** (긴급 수정 목적)
- **우회 경로**: 연차 승인 자동 스케줄 반영 (`scheduleService.batchUpdateSchedules` 직접 호출)은 라우터를 거치지 않아 lock 검증 없음 → lock된 달에도 연차 승인 시 schedules 쓰기 가능 (코드 line 25 주석에 명시됨)

### 일일 확정 (zone_day_assignments.is_confirmed)

- DayTimelineModal `POST /api/zone-day/:date` body에 `is_confirmed: true` 포함 시 DB 저장
- 확정 저장 시 배정된 직원들에게 알림 발송 (`zoneAssignments.ts` line 346-352)
- 이 확정은 구역 배정(zone_day_assignments)에만 적용 — schedules 테이블과 별개

---

## [DUPLICATED LOGIC]

### 1. 직원 등록/수정 — 두 곳에 폼 존재

| 위치 | 컴포넌트 | 필드 |
|------|---------|------|
| SchedulePage | `EmployeeFormModal.tsx` | 기본 HR 필드 (이름/직군/직급/고용형태/입퇴사/연락처/연차/레벨/구역) |
| StaffManagePage | `CreateModal.tsx` + `StaffDetailPanel` 편집 폼 | 전체 HR 필드 (기본 + 임금/계약/보험/경력/자격) |

`SchedulePage`의 `EmployeeFormModal`은 경량 버전 — zone 배정 연동 특수 로직 포함.  
`StaffManagePage`의 상세 편집은 `useFetchEmployee`로 전체 HR 필드 로드.  
두 폼은 서로 다른 `updateEmployee*` 함수 사용 — `EmployeeFormModal` → `updateEmployeeFull`, `StaffManagePage` → `updateEmployee`.

**실질적 중복**: 같은 직원 데이터를 수정하는 두 경로가 존재. `SchedulePage`에서 수정 후 `StaffManagePage`로 넘어가는 `onEditEmployeeAtStaffManage` prop으로 넘기는 통합 워크플로우 구현됨 (`SchedulePage.tsx` line 339).

### 2. 연차 잔여 계산 — 두 가지 방식

- `GET /api/leave-balance`: `leave_requests` (approved) 기반 정확한 계산 (weight 0.5 포함)
- `GET /api/leave-stats?year=`: `schedules` 테이블 type=`월차` 카운트 (반차 미포함 · 중복 가능)

`useScheduleData`는 `leave-stats`를 사용 (schedules 기반 · 경량). `LeavePage`의 잔여 표시는 `leave-balance`를 사용 (leave_requests 기반 · 정확).

### 3. 스케줄 타입 목록 정의 — 두 군데

- `src/constants/index.ts` `DEFAULT_SCHEDULE_TYPES` — 9개 상수 (fallback)
- `app_settings` DB key=`all_settings` — 사용자 커스텀 (runtime SSOT)
- `useSettings` 훅이 DB 우선, DB 없으면 상수 fallback

---

## [DATE/TIME]

### 서버 (Express / Node.js — Render 배포 환경 UTC)

| 패턴 | 파일:라인 | 위험도 |
|------|---------|--------|
| `getKstYmd()` — UTC+9 고정 오프셋 | `server/lib/kstDate.ts` | **SAFE** |
| `nextKstYmd()` — 문자열 파싱, UTC arithmetic | `server/lib/kstDate.ts` | **SAFE** |
| `new Date(sched.date + "T00:00:00").getDay()` | `scheduleService.ts` line 86,110 | **위험**: T00:00:00 → 로컬 타임존 파싱. Render(UTC)에서는 정상이나 로컬(KST) 실행 시 getDay() 결과 동일 → OK. |
| `new Date(String(r.start_date) + "T00:00:00")` | `leave.ts` line 71-72 | **위험 낮음**: date 컬럼(date type) → `'YYYY-MM-DD'` string으로 반환 → 로컬 timezone으로 파싱 → getTime() 차이 계산용만 (일 수 계산) → OK |
| `new Date(\`${today}T00:00:00Z\`)` | `leave.ts` line 213 | **SAFE** (Z suffix로 UTC 명시) |
| `new Date(String(r.date + "T00:00:00Z")` | `useUpcomingLeaves.ts` line 66-67 | **SAFE** (Z suffix) |

### 클라이언트

| 패턴 | 파일:라인 | 위험도 |
|------|---------|--------|
| `new Date(dateStr + "T00:00:00")` | `scheduleHelpers.ts` line 70 (getDayDetails) | **중간**: 날짜 표시 목적 (요일 계산). KST 로컬에서는 OK. 서버가 UTC면 클라이언트도 로컬 → 최종 getDay() 정상. |
| `new Date(s.date)` | `scheduleHelpers.ts` line 151 (인건비 주말 계산) | **위험**: ISO date string `'YYYY-MM-DD'` → UTC midnight 파싱 → KST에서 getDay() 전날 요일 반환 가능. **실제 증상**: 일요일 인건비가 토요일 주말요금으로 계산될 수 있음. |
| `getTodayStr()` | `scheduleHelpers.ts` line 61-67 | **위험**: `new Date()` 로컬 timezone 기반. UTC Render 배포 + KST 브라우저 → 클라이언트에서 정상. 서버 렌더링 없으므로 문제 없음. |

**핵심 위험**: `scheduleHelpers.ts` line 151 `new Date(s.date)` — `'YYYY-MM-DD'` 파싱 → UTC midnight → `getDay()` KST 환경에서 -1 shift. **일요일(0)이 토요일(6)로 인식되는 off-by-one 버그 잠재**.

---

## [NULL RISKS]

### Crash 가능 경로

1. **`scheduleHelpers.ts` line 172-174** — `emp.hireDate`가 text이고 `currentDate < emp.hireDate` 비교. hireDate가 `null` 또는 `undefined`이면 `null < "2026-10-06"` → `false` → skip (안전). hireDate 빈 문자열이면 `"" < "2026-10-06"` → `true` → 렌더 제외. **SAFE** (의도와 다를 수 있으나 crash 없음).

2. **`ScheduleCell.tsx` line 12** — `schedule?: Schedule` optional prop. 셀이 undefined schedule로 렌더 → `useEditScheduleForm({ initialSchedule: schedule ?? null })` → null safe. **SAFE**.

3. **`EmployeeCalendarModal.tsx` line 82** — `employee.position.includes("물류")`. `employee.position`이 `undefined`이면 `TypeError: Cannot read properties of undefined`. `Employee` 타입상 `position: string` (required) → DB에서 null 반환 시 crash. **위험 낮음** (DB 제약 없으나 scheduleService.createEmployee에 position 필수 검증).

4. **`getEmpMonthStats` line 140** — `settingsEmployeeWageOverrides[emp.id] ?? settingsWageRates[emp.position] ?? null`. `empRate`이 null이면 `laborCost` 계산 skip (0 반환). **SAFE** (null check 있음).

5. **`scheduleService.ts` `copySchedulesFromPreviousMonth` line 86** — `new Date(sched.date + "T00:00:00").getDay()`. sched.date가 null이면 `"nullT00:00:00"` → Invalid Date → getDay()=NaN → empDowMap.set(sched.employeeId, NaN-keyed Map). 실질적 영향 없으나 data corruption 가능. **위험 낮음** (schedules.date는 upsert 시 필수값).

6. **`leave.ts` line 250-251** — `nameMap[Number(r.employeeId)] ?? String(r.employeeId)`. employeeId가 employees 테이블에 없으면 ID 숫자 문자열 반환. **SAFE** (crash 없음, 표시 불량).

7. **`StaffManagePage.tsx` line 157-158** — `GET /api/employees` 응답 형식 차이 처리:
   ```ts
   Array.isArray(data) ? data : (Array.isArray(data?.employees) ? data.employees : [])
   ```
   방어적 코드로 SAFE.

8. **`scheduleService.ts` `getMonthlySchedule` line 21** — `const employeesWithSchedules = (employees ?? []).map(emp => ({ ...emp, schedules: (schedules ?? []).filter(s => s.employeeId === emp.id) }))`. null safe. **SAFE**.

---

## [N+1]

### 메인 월간 스케줄 — `scheduleService.getMonthlySchedule`

```sql
-- Query 1: 전체 직원
SELECT * FROM employees ORDER BY id

-- Query 2: 해당 월 전체 스케줄 (직원별 분리 없음)
SELECT * FROM schedules WHERE date LIKE 'YYYY-MM-%'
```

**패턴**: 2 queries — Range query. N+1 없음. 직원 수(19명)에 무관하게 쿼리 2개.  
**재조합**: 서버 in-memory filter `schedules.filter(s => s.employeeId === emp.id)`.

### EmployeeCalendarModal — 다른 달 이동

```
GET /api/schedules?year=Y&month=M  (전체 직원 + 해당 월)
```

다른 달 이동 시마다 전체 직원 스케줄 재fetch. employee 1명에 대한 조회지만 서버는 전체 직원 데이터를 반환 → 불필요한 오버페치. **N+1은 아니나 오버페치 이슈**.

### useScheduleData.fetchScheduleData — 다중 월

`buildDateList`가 현재 월 ±1개월(3개월)을 생성 → `Promise.all(months.map(...))` → 최대 3개 GET 요청 병렬 실행. **병렬 처리로 N+1 없음**.

### `executeCopyFromPreviousMonth` — zone-day 확인

```ts
const results = await Promise.all(days.map(d => api.get(`/api/zone-day/${d}`)));
```

**31개 병렬 GET 요청** (당월 일 수만큼). zone_day_assignments는 date PK이므로 range query API 없음 → 불가피한 N개 요청. **개선 기회**: `GET /api/zone-day/month?year=&month=` range endpoint 추가 시 1 query로 통합 가능.

### leave-balance API

직원별 `GET /api/leave-balance?employeeId=N` — 1명씩 호출. 현재 StaffManagePage에서 선택된 직원 1명에게만 호출되므로 **N+1 없음**.

---

## [DEAD CODE]

### Schedule/Staff 영역 내 Dead Code

1. **`DayTimelineModal` `onUpdateSchedule` prop** (line 52-57): "완전 dead" 명시 주석 (line 51). 선언은 있으나 Modal 내부에서 호출 없음. Props 인터페이스에만 존재.

2. **`SchedulePage.tsx` line 683-684**:
   ```ts
   {(() => { void spContact; return null; })()}
   ```
   `useContactInfo()` hook 결과 `spContact`를 사용하지 않고 void로 버림 — dead hook usage. 주석 "사용하지 않는 hook · silent"

3. **`SchedulePage.tsx` `isMonthLocked`** — 편집 모드 시 `isMonthLocked && !editMode` 분기 존재하나 `isMonthLocked && isAdmin` 조합의 일부 분기는 `applyShiftHoursToAll`에서만 의미있음.

4. **`useScheduleData.ts` `yearLeaveStats` state** — `setYearLeaveStats`에 저장되나 return 값에 포함되어도 (`yearLeaveStats` line 449에 없음 — return에서 제외됨) 실제 사용처에서 import되지 않음. **완전 dead state**.

5. **`useScheduleData.ts` `summary` state** — `setSummary`에 저장되고 return에 포함되나 `SchedulePage.tsx`에서 `summary`를 destructure하지 않음 (line 87의 destructure에 `summary` 없음). **Dead exported state** — SchedulePage에서 미사용.

6. **`AdminLoginModal` 하드코딩 로그인** — JWT level ≥ 2 이면 관리자 로그인 버튼 자체 미노출 (line 502-509). 레거시 fallback으로 `userLevel < 1` 인 경우만 표시. 실 운영에서 사용 빈도 매우 낮음.

---

## [SCHEMA RISKS]

1. **`employees.hireDate` / `retireDate` 컬럼 타입 불명확**: 초기 CREATE TABLE migration 파일 없음. 코드에서 `text` 타입으로 취급하나 Supabase 스키마 실제 타입 확인 필요. `retireDate` column 없을 때 fallback 코드가 `scheduleService.ts` line 186-189에 존재함 — 컬럼 부재 가능성 시사.

2. **`schedules.date` 컬럼이 text 타입**: `DATE` 타입이 아님 (LIKE 쿼리로 필터링 — `like("date", "YYYY-MM-%")`). DATE 타입이라면 범위 인덱스 효율적. 현재 19명 × 약 31일 = ~589 row/월이므로 성능 문제 없으나 확장 시 인덱스 설계 필요.

3. **`schedules.employeeId` 외래키 제약 없음**: 코드상 `ON CONFLICT (employeeId, date)` 사용하므로 UNIQUE constraint는 있으나 employees.id로의 FK constraint 없음 → 직원 삭제 시 schedules 고아 row 가능. `scheduleController.deleteEmployee`에서 명시적 cleanup 없음 (Supabase cascade 미적용 추정).

4. **`leave_requests.employee_id` FK constraint 없음**: CREATE TABLE에 `REFERENCES employees(id)` 없음. employee 삭제 시 leave_requests 고아 row 가능.

5. **`zone_day_assignments` 스키마가 코드 내 embed**: migration 파일이 아닌 `zoneAssignments.ts` 내 SQL 문자열로 정의. 테이블 없으면 503 with CREATE SQL 응답 — self-healing 설계이나 버전 관리 어려움.

6. **`app_settings` schedule_lock 키의 scope 설계**: 월 단위 key-value 저장. 대량 월 데이터 누적 시 단일 테이블 scan 부담 없으나 old lock keys 정리 로직 없음.

---

## [TARGET RECOMMENDATION]
### PHASE 1 (DB SSOT) 진입을 위한 결정사항 및 순서

**P0. 선행 결정 (설계 확정)**
1. `employees.hireDate`/`retireDate` 컬럼 실제 DB 타입 확인 → `DATE` 타입이면 코드 수정 없이 OK, `text`이면 타입 변환 migration 필요
2. `schedules.employeeId` + `schedules.date` FK 및 INDEX 상태 확인 (Supabase 대시보드)

**P1. 즉시 개선 가능 (안전)**
1. `schedules.date` 컬럼에 index 추가: `CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(date);`
2. `scheduleHelpers.ts` line 151의 `new Date(s.date)` → `new Date(s.date + "T00:00:00")` 로 변경 → UTC off-by-one 방지
3. `useScheduleData.ts` dead state `yearLeaveStats` / `summary` 정리

**P2. 고려 필요**
1. `GET /api/zone-day/month?year=&month=` range endpoint 추가 → 31개 N+1 병렬 요청 → 1 query
2. `EmployeeCalendarModal` 다른 달 이동 시 전체 직원 over-fetch → employee-specific schedule endpoint 고려
3. `employees.hireDate`/`retireDate` → `DATE` 컬럼 타입 migration (정렬/인덱스 효율)

**P3. 장기 (schema 변경)**
1. `schedules.employeeId` FK constraint + ON DELETE CASCADE 추가
2. `leave_requests.employee_id` FK constraint 추가
3. `AdminLoginModal` 하드코딩 자격증명 제거 → JWT level 기반 관리자 모드만 유지

---

## 최종 판정

- **BLOCKER** = 없음 (즉시 서비스 중단 수준의 결함 없음). 단, `scheduleHelpers.ts` line 151 UTC off-by-one은 인건비 계산 오류로 이어질 수 있어 수정 권고.

- **SAFE_TO_REFACTOR** =
  - `useScheduleData.ts` dead state 제거 (`yearLeaveStats`, `summary`)
  - `DayTimelineModal` `onUpdateSchedule` dead prop 제거
  - `SchedulePage.tsx` `spContact` dead hook usage 제거
  - `scheduleHelpers.ts` `new Date(s.date)` → `new Date(s.date + "T00:00:00")` 수정

- **SCHEMA_CHANGE_REQUIRED** = YES
  - `schedules.date` 인덱스 추가 (성능)
  - `schedules.employeeId` FK constraint 추가 (정합성)
  - `leave_requests.employee_id` FK constraint 추가 (정합성)
  - `employees.hireDate`/`retireDate` 타입 확인 (text → date migration 검토)

- **DESTRUCTIVE_CHANGE_REQUIRED** = NO (FK 추가 시 고아 row 있으면 사전 정리 필요하나 현재 운영 데이터 확인 전 판단 불가)

**PHASE 0 COMPLETE**
