# SCHEDULE PHASE 2 — Settings Framework Audit
# 2026-10-06

> READ-ONLY AUDIT. No schema change. No code change unless listed in [SAFE FIX].
> Precedent: PHASE 1 COMPLETE (commit `7edac73b`).
> Scope: `app_settings` KV, `useSettings` hook, Schedule/Staff/Reservation/Contract settings consumers.

---

## SECTION 1 — [DB] `app_settings` schema & key inventory

### 1.1 Schema (observed via code — Supabase table)

Columns (as used in code, exact CREATE TABLE SQL not present in repo migrations):
- `key` text PK · unique identifier (`onConflict: "key"` upsert everywhere)
- `value` jsonb · any JSON (bool / number / string / object / array)
- `updated_at` timestamptz · set manually in `upsert(..., updated_at: new Date().toISOString())`

Columns NOT present (verified by all upsert payloads):
- `updated_by` — NONE. No column, no code setter. Changes are anonymous.
- `version` / `revision` — NONE. No optimistic concurrency token.
- `created_at` — Not referenced in code.
- `audit_log` / `history` table — NONE.

### 1.2 Full key inventory (grep `eq("key"` + schema list)

Keys used in production code (`app_settings`):

| key | Writer file:line | Reader file:line | Scope | Type |
|---|---|---|---|---|
| `all_settings` | `src/hooks/useSettings.ts:234-236` (whole-object) | `useSettings.ts:222-230`, `server/routes/staff/staff.ts:22`, `server/routes/daily/reservations.ts:27`, `server/routes/daily/reservationAvailability.ts:35` | BUSINESS_CRITICAL (whole AppSettings JSON) | object |
| `schedule_lock_YYYY-MM` | `src/components/SchedulePage/useScheduleData.ts` (via `saveSetting`) | `server/lib/scheduleLock.ts:28` | BUSINESS_CRITICAL (lock gate) | bool |
| `season_ranges` | `server/routes/settings/settings.ts:148` | `settings.ts:73`, product/stock queries | BUSINESS_CRITICAL | object |
| `storage_locations` | `settings.ts:138` | `settings.ts:106` | BUSINESS_CRITICAL (상품 위치 매핑) | array |
| `optimal_stock_days` | `settings.ts:125` | `settings.ts:118`, stock refill cron | BUSINESS_CRITICAL | number |
| `optimal_stock_period_days` | (no writer in grep) | `server/lib/optimalStock.ts:248` | BUSINESS_CRITICAL | number |
| `page_permissions` | `settings.ts:188` | `settings.ts:179` | BUSINESS_CRITICAL (lv guard) | object |
| `zone_groups` | `settings.ts:204` | `settings.ts:195` | PRESENTATION/BUSINESS | array |
| `blocked_slots_{date}` | `settings.ts:233` | `settings.ts:217` | BUSINESS (slot block) | object (per-day) |
| `order_email_smtp` | `settings.ts:390` + boot sync | `settings.ts:269` | BOOTSTRAP (env-first) | object |
| `stats.sale_active_only` | via POST `/api/settings` | `productCache.ts:216`, `products.ts:46/112/241/268`, `salesAutoRecommend.ts`, `productInventoryQuery.ts:77` | BUSINESS_CRITICAL | bool |
| `event_category_rules` | `eventCategoryRules.ts:159` | `eventCategoryRules.ts:72`, `salesAutoRecommend.ts:68` | BUSINESS | object |
| `product_import_log` | `autoImport.ts:122`, `products.ts:596` | same | LEGACY (logs) | object |
| `purchase_import_log` | `purchase.ts:398/442` | same | LEGACY (logs) | object |
| `stock_import_log` | `periodCoverage.ts:13`, `uploadStock.ts:16` | same | LEGACY | object |
| `company_info` | `requests.ts:933`, `borrowings.ts:144`, `orderPurchaseMatch.exceptionBulkSend.ts:43` | same | BUSINESS | object |
| CONFIG_KEY (auto-import) | `autoImport.ts:55` | same | BUSINESS | object |
| STATUS_KEY (auto-import) | `autoImport.ts:169` | same | BUSINESS | object |

### 1.3 `all_settings` JSON structure (`AppSettings` from `src/hooks/useSettings.ts:49-64`)

```ts
{
  positions: string[],                   // SchedulePage · DayTimelineModal · EmployeeInfoForm option source
  ranks?: string[],                      // SettingsModal RanksTab · optional (back-compat)
  employmentTypes: string[],             // ["정직원","계약직","알바"]
  workplaces: string[],                  // ["매장","창고"]
  scheduleTypes: ScheduleTypeEntry[],    // {type, hours, pharmHours, logisticsHours, partTimeHours, color?}[]
  wageRates: Record<string, WageRate>,   // key = position (약사/캐셔/...) + 임의 확장
  employeeWageOverrides: Record<number, WageRate>, // key = employees.id
  underConstruction?: boolean,
  defaultAnnualLeave?: { pharmacist: number, default: number },
  visitorReservation?: {
    assigneeEmployeeIds: number[],       // 2026-10-06 · 하드코드 "대표/이사" 제거 완료
    slotMinutes: number,
    bufferMinutes: number,
    useEmployeeSchedule: boolean,
    maxConcurrentBookings?, allowSameDayBooking?, advanceDays?,
  },
}
```

### 1.4 Observed row count (code evidence)

Single row `key='all_settings'` is the business-authority KV for Schedule/Staff/Reservation.
Multi-row design is only used for monthly lock (`schedule_lock_YYYY-MM`) and per-date blocked slots (`blocked_slots_{date}`). No other PHASE 2 critical setting uses multi-row.

### 1.5 updated_at / version / revision

- `updated_at`: set on every upsert (client wall clock, not DB `now()`).
- `version` / `revision`: NOT present. No optimistic concurrency.
- Consequence: Section 5 (RACE / lost update) is a REAL risk.

---

## SECTION 2 — [SETTINGS] key inventory per business concern

| canonical name | DB key | field path | type | default | writer | reader | business critical | local cache | hardcoded fallback |
|---|---|---|---|---|---|---|---|---|---|
| positions | all_settings | `.positions` | string[] | `["약사","캐셔","물류","대표","임원"]` (useSettings.ts:81) | SettingsModal `PositionsTab` | SchedulePage · DayTimelineModal · EmployeeInfoForm · EmployeeFormModal · reference-values merge | BUSINESS | YES (localStorage `app_settings`) | YES (DEFAULT_SETTINGS.positions) + ALSO `src/constants/jobCategories.ts:5 POSITIONS` |
| ranks | all_settings | `.ranks` | string[] | `["대표","부장","팀장","과장","대리","사원"]` (useSettings.ts:83) | SettingsModal `RanksTab` + employee rename side-effect | SettingsModal · EmployeeFormModal (via useReferenceValues) | BUSINESS | YES | YES + `src/constants/jobCategories.ts:6 RANKS` (NINE-value "", 대표, 이사, ...) — DIFFERENT SET |
| employmentTypes | all_settings | `.employmentTypes` | string[] | `["정직원","계약직","알바"]` | SettingsModal (no tab currently exposed) | EmployeeInfoForm | PRESENTATION/BUSINESS | YES | YES + `jobCategories.ts:8 CONTRACT_TYPES` (DIFFERENT: `["정규직","계약직","알바","일용","인턴"]`) |
| workplaces | all_settings | `.workplaces` | string[] | `["매장","창고"]` | SettingsModal `WorkplacesTab` | EmployeeInfoForm · SchedulePage sort | BUSINESS | YES | YES + `jobCategories.ts:7 WORKPLACES` (`["매장","창고","본사","기타"]`) |
| scheduleTypes | all_settings | `.scheduleTypes` | ScheduleTypeEntry[] | 9 preset (DEFAULT_SCHEDULE_TYPES, `src/constants/index.ts:17-27`) | SettingsModal `ScheduleTypesTab` | SchedulePage · ScheduleCell · ScheduleGrid · DayTimelineModal · scheduleHelpers (hours lookup) | BUSINESS_CRITICAL (labor calc source) | YES | YES (DEFAULT_SCHEDULE_TYPES) |
| wageRates | all_settings | `.wageRates` | `Record<position,{weekday,weekend}>` | `{}` | SettingsModal (wage tab in SchedulePage) | scheduleHelpers.getEmpMonthStats · ContractWriter wage auto · usePositionCategories | BUSINESS_CRITICAL | YES | NO explicit fallback — `defaultWageForPosition()` (useSettings.ts:76-78) returns hardcoded pharm/staff rate **when wageRate for a position is absent** |
| employeeWageOverrides | all_settings | `.employeeWageOverrides` | `Record<employees.id, WageRate>` | `{}` | SettingsModal + ContractSettings | scheduleHelpers.getEmpMonthStats · ContractWriter · EmployeeProfileCard | BUSINESS_CRITICAL | YES | NO |
| defaultAnnualLeave | all_settings | `.defaultAnnualLeave` | `{pharmacist:number, default:number}` | `{pharmacist:3, default:12}` | ScheduleSettingsPage | server employee create (annual_leave_days seed) | BUSINESS | YES | YES (DEFAULT_ANNUAL_LEAVE) |
| underConstruction | all_settings | `.underConstruction` | bool | false | SettingsModal (admin) | LandingPage · guards | PRESENTATION | YES | NO |
| visitorReservation | all_settings | `.visitorReservation` | object | `{assigneeEmployeeIds:[], slotMinutes:30, bufferMinutes:10, useEmployeeSchedule:true}` | SettingsModal `VisitorReservationTab` | ReservationPage · server/staff.ts · reservations.ts · reservationAvailability.ts | BUSINESS_CRITICAL | YES | YES (DEFAULT_VISITOR_RESERVATION) |

Classification:
- BUSINESS_CRITICAL = scheduleTypes, wageRates, employeeWageOverrides, defaultAnnualLeave, visitorReservation, schedule_lock_*, page_permissions, stats.sale_active_only, optimal_stock_days
- PRESENTATION = scheduleTypes.color, zone_groups (display order only), underConstruction
- BOOTSTRAP = order_email_smtp (env-first)
- LEGACY = *_import_log
- UNUSED = none observed

**UNKNOWN = 0** (every key has a traceable owner).

---

## SECTION 3 — [useSettings] 전수조사 (`src/hooks/useSettings.ts`)

### 3.1 Mount flow (lines 245-271)
```
1. useState(loadFromLocalStorage)                         // SYNC read from localStorage ← initial render
2. useEffect(() => fetchAllSettings().then(setSettings))  // ASYNC override from DB
3. useEffect(settings-updated event listener)             // same-tab cross-instance sync
```

### 3.2 Answers

**A. localStorage 가 DB 보다 먼저 render 만 하는가?**
NO — localStorage은 initial render 뿐 아니라, DB fetch 결과(mount effect)와 CustomEvent payload를 **동일 setItem** 하므로 (lines 256, 267, 278), localStorage는 지속적으로 사용되는 BUSINESS CACHE 역할. 단, DB가 응답하면 즉시 덮어쓴다 (line 255 `setSettings(dbSettings)`).

**B. business calculation 에 localStorage 값이 사용되는가?**
YES, 가능. mount 직후 DB fetch 완료 전까지 (수백 ms) 모든 소비자 (SchedulePage labor calc, ScheduleGrid summary, usePositionCategories) 는 `loadFromLocalStorage()` 결과를 **그대로 계산에 사용**. 특히 로그인 후 LandingPage → Schedule 로 바로 이동 시 캐시가 신선하지 않을 수 있음. **"DB fetch 실패 → localStorage 값으로 계산 계속" 규칙 위반 가능.**

**C. DB fetch 실패 시 localStorage 가 authority 가 되는가?**
YES. `fetchAllSettings()` (lines 222-230) 에서 try/catch 로 모두 삼키고 null 반환 → `useEffect`에서 null 이면 skip (line 254) → **localStorage/DEFAULT_SETTINGS 로 Schedule/Reservation/Wage 계산이 그대로 진행**. 네트워크 실패도, Supabase 500 도, authorize 실패도 모두 silent fallback.
PHASE 2 사용자 금지 규칙 위반 (명시 금지: "DB fetch 실패 → localStorage 값으로 계산 계속").

**D. DB response 와 default 를 merge 하는가?**
YES — `mergeWithDefaults(parsed)` (lines 189-210) 는 매 field 를 defaults 와 섞음. 특히:
- `positions.length > 0 ? parsed.positions : DEFAULT_SETTINGS.positions` → DB가 명시적으로 **빈 배열로 저장** 하면 default 로 fall back (의도치 않은 복원 가능).
- `migrateScheduleTypes` legacy string[] → ScheduleTypeEntry[] migration 포함.
- color 없는 scheduleType 은 `DEFAULT_SCHEDULE_TYPES` 색상으로 backfill (line 185).

**E. whole-object save 인가?**
YES. `saveAllSettings(s)` (line 234) → `saveSetting(DB_KEY, s)` → `POST /api/settings {key:"all_settings", value: entireAppSettings}`. 매 저장 시 **AppSettings 전체 jsonb 를 통째로 덮어쓴다**.

**F. partial patch 인가?**
NO. `update(partial)` (lines 273-294) 는 client-side merge 로 `next = {...prev, ...partial}` 를 만들고 **next 전체** 를 서버에 저장. 2명이 다른 field 를 동시에 저장하면 lost update.

**추가 발견 — debounce + stale `settingsRef`:**
`setTimeout(() => saveAllSettings({...settingsRef.current, ...partial}), 800)` (line 288-291). 800ms 안에 여러 번 `update` 호출 → `settingsRef.current` 가 매번 최신 (line 248) 이므로 last-write 로 수렴하지만, 다른 탭에서의 변경은 보이지 않음 → cross-tab 변경을 덮어씀.

---

## SECTION 4 — [FALLBACK] BUSINESS vs PRESENTATION

### 4.1 BUSINESS FALLBACK (금지 대상 — DB authority 위반)

| 위치 | 소스 | 설명 |
|---|---|---|
| `src/hooks/useSettings.ts:212-220` `loadFromLocalStorage()` | localStorage `app_settings` | mount 직후 ~ DB fetch 완료 전 window 에 BUSINESS CRITICAL 소비자가 캐시 값으로 계산 |
| `src/hooks/useSettings.ts:224-229` `fetchAllSettings()` catch block | silent `null` | DB 실패 시 UX 상 아무 알림 없음, localStorage 그대로 사용 |
| `src/hooks/useSettings.ts:76-78` `defaultWageForPosition()` | hardcoded `{35000/40000}` 약사 · `{10030/12000}` 그 외 | ContractWriter · useContractLoad.ts:115 에서 `settings.wageRates?.[pos] ?? defaultWageForPosition(pos)` → **wageRates 미등록 position 에 하드코드 시급 적용** · 사용자 금지 규칙 위반 ("hardcoded label/default 로 업무 계산") |
| `src/components/SchedulePage/scheduleHelpers.ts:126` `OFF_TYPES_SET = new Set(["휴무","월차","결근"])` | 하드코드 (shared/offTypes.ts 미사용) | labor calc + workDays 집계 시 OFF 판정. **"지정휴무" 가 빠져있어** staff.ts/lunch.ts 쪽 OFF 정의와 불일치. |
| `src/components/SchedulePage/scheduleHelpers.ts:181` `["휴무","월차","결근"].includes(type)` | 중복 하드코드 | 같은 OFF 판정이 두 번 복제 — "지정휴무" 다시 누락 |
| `src/components/SchedulePage/scheduleHelpers.ts:320` `TODAY_OFF_TYPES = new Set(["휴무","월차","지정휴무","결근","오전반차","오후반차"])` | 또 다른 OFF 집합 | 정렬용. 반차 포함 — 다른 OFF 집합과 또 다름 |
| `src/components/SchedulePage/ScheduleCell.tsx:277-278` `WORK_TYPES`/`OFF_TYPES` | 하드코드 inline | 프리셋 UI preset 분류 |
| `src/components/LunchPage/LunchPage.tsx:67` `OFF_TYPES = new Set(["휴무","월차","지정휴무","결근","오전반차","오후반차"])` | 하드코드 | 점심 신청 가능 판정 (반차 포함) |
| `src/components/DayTimelineModal/types.ts:22` `SKIP_TYPES = new Set(["휴무","월차","지정휴무"])` | 하드코드 | TimelineModal skip 집합 (결근 미포함 — 또 다름) |
| `src/components/DisplayPage/DisplayPage.helpers.ts:94` `SKIP_TYPES = new Set(["휴무","월차","지정휴무"])` | 하드코드 duplicate | DisplayPage 매장구역도 |
| `server/routes/daily/lunch.ts:12` `OFF_TYPES = ["휴무","월차","지정휴무","결근","오전반차","오후반차"]` | 하드코드 (shared 미사용) | 서버쪽 점심 attendance |
| `src/components/SchedulePage/scheduleHelpers.ts:30-38` `POSITION_TO_CATEGORY` | 하드코드 매핑 | position → category · wageRates 와 별도 매핑 소스 (SSOT 2개) |
| `src/components/SchedulePage/usePositionCategories.ts:20` fallback `["약사","사원","창고","매장"]` | 하드코드 (wageRates 비어있을 때) | 필터 탭 레거시 순서 |
| `src/components/SchedulePage/scheduleHelpers.ts:299` `getPositionGroup` 하드코드 | 하드코드 | 정렬용 (약사 2, 캐셔/진열/사원/물류 3, else 1) · settings 무시 |
| `src/components/SchedulePage/useEditScheduleForm.ts:40` `SCHEDULE_CYCLE = ["오픈","미들","마감","휴무"]` | 하드코드 | 셀 cycle 클릭 — settings.scheduleTypes 무시 |
| `src/components/SchedulePage/useScheduleData.ts:205,217` `breakModal.type || "휴무"` | 하드코드 default | break modal 저장 시 type 미설정 → "휴무" (business write default) |
| `src/components/SchedulePage/ScheduleCell.tsx:70` `formValues.type || "휴무"` | 하드코드 | 셀 저장 default |
| `src/constants/jobCategories.ts:5-9` POSITIONS/RANKS/WORKPLACES | 하드코드 상수 | `useReferenceValues` 가 DB DISTINCT 와 merge · 사용자 생성 position 자동 포함 · 하지만 하드코드 상수가 상단에 공존하여 SSOT 모호 |

### 4.2 PRESENTATION FALLBACK (허용)

| 위치 | 설명 |
|---|---|
| `src/constants/index.ts:81-124` `SCHEDULE_COLORS` | hardcoded Tailwind classname (bg/text/border) · 라벨용 색 preset — settings.scheduleTypes.color 와 별개 (하지만 fallback 참조 Point) |
| `src/constants/index.ts:17-27` `DEFAULT_SCHEDULE_TYPES` 색상 | 신규 scheduleType 추가 시 UI preset — BUSINESS 는 아님 |
| `src/constants/index.ts:45-57` `COLOR_PRESETS` | SettingsModal 색상 picker preset |

### 4.3 count

- BUSINESS fallback 하드코드 지점: **18개**
- PRESENTATION fallback 지점: **3개**
- HARDCODED SCHEDULE OFF 집합 (서로 다름): **7개** (`scheduleHelpers.ts` x3, `ScheduleCell.tsx`, `LunchPage.tsx`, `DayTimelineModal/types.ts`, `DisplayPage.helpers.ts`, 서버 `lunch.ts`) — 공식 `src/shared/schedule/offTypes.ts` 는 **서버 3개 route 만** 사용 중

### 4.4 PHASE 2 위반 유형

- "DB setting 없음 → hardcoded label/default 로 업무 계산" → `defaultWageForPosition` + `useSettings` catch-null 조합
- "schedule type 불명 → 문자열 includes("휴무") 등으로 추정" → OFF 집합 7개 분산
- "position mapping 실패 → '기타'" → `scheduleHelpers.ts:51` `positionToCategory` 리턴 "기타" · `usePositionCategories.ts:45` 동일 패턴
- "employee role 없음 → rank/title 에서 임의 category 추론" → `scheduleHelpers.ts:299 getPositionGroup` + `BulkTab.tsx`/`EmployeeNameCell.tsx` 패턴은 position 만 사용 (덜 심각)

---

## SECTION 5 — [RACE] whole-JSON overwrite audit

### 5.1 PUT semantics

Client (`useSettings.update()`):
```
1. setSettings(prev => next)                       // local merge
2. setTimeout(saveAllSettings(settingsRef.current + partial), 800)
3. POST /api/settings { key: "all_settings", value: ENTIRE_APP_SETTINGS_OBJECT }
```

Server (`server/routes/settings/settings.ts:163-176`):
```
upsert({ key, value, updated_at: now }, { onConflict: "key" })
```

### 5.2 Lost update scenarios

**S1. 두 관리자 동시 편집**
- 관리자 A: 환경설정 → `positions` 추가 → `update({positions: [...prev, "신규"]})`
- 관리자 B (동시): `wageRates` 수정 → `update({wageRates: {...}})`
- 각자 `settingsRef.current + partial` → 각자 로컬 merge → 각자 전체 jsonb POST
- B 가 나중 저장이면 B의 로컬 base (A 변경 수신 전) 이므로 A의 position 추가가 **사라짐**
- 서버에 version/revision 없음, If-Match 없음, 서버 머지 없음 → **lost update CONFIRMED**

**S2. 같은 탭 다중 debounce**
- 사용자가 800ms 안에 wage weekday + weekend 를 각각 input 변경
- 두 번째 debounce 가 첫 번째를 clearTimeout → 안전 (단일 호출만 발생)
- 결과: 같은 탭 내에서는 safe.

**S3. 다른 탭 (same user)**
- Tab 1: positions 변경 (debounce 중)
- Tab 2: wage 변경 (즉시 POST)
- Tab 1 의 timer 만료 → Tab 1 로컬 (Tab 2의 wage 변경 포함 X) 전체 POST → Tab 2 변경 **덮어씀**
- `settings-updated` CustomEvent 는 **same window 전용** (window.dispatchEvent) — cross-tab 아님. BroadcastChannel/storage event 미사용.
- **lost update CONFIRMED**

**S4. 서버 crash / network blip**
- `fetchAllSettings` catch → null → localStorage 유지 → 사용자가 어떤 설정이든 수정 → debounce POST → 성공 시 **네트워크 복구 전의 변경을 서버에 덮어씀** (사용자 모름)

### 5.3 Mitigation (현재 없음)

- updated_at 비교 없음
- version/revision 없음
- 서버 머지 없음 (단일 `upsert`)
- RLS 없음 (public key 로 upsert — authorize(9) 뿐)
- Audit log 없음 → lost update 복구 불가

**결론**: `all_settings` 는 whole-object jsonb POST + no concurrency token → PHASE 2 금지 규칙 ("whole-object overwrite lost settings") 위반 가능.

---

## SECTION 6 — [TAXONOMY] position / rank / category 사용처

### 6.1 Position usage (전수조사)

Source | kind | notes
---|---|---
`employees.position` (DB column, text) | canonical identity | 유일한 position SSOT
`settings.positions` (all_settings.positions) | option list | SettingsModal · EmployeeInfoForm 입력
`src/constants/jobCategories.ts:5 POSITIONS` | hardcoded | useReferenceValues merge base, EmployeeInfoForm fallback
`useReferenceValues()` (`/api/reference-values`) | DB DISTINCT + hardcoded merge | OrderManagePage, EmployeeFormModal → **다른 소스** (settings 와 별개)
`POSITION_TO_CATEGORY` (`scheduleHelpers.ts:30`) | hardcoded 매핑 | 약사/캐셔/진열/사원/물류/창고/매장 → 매장/사원/창고/약사
`usePositionCategories` (`SchedulePage/usePositionCategories.ts:16`) | derive from `wageRates` keys | 필터 탭 — SchedulePage 전용 · 다른 페이지 쓰지 않음
`isPharmPosition` / `isLogisticsPosition` / `isWarehousePosition` / `isStorePosition` / `isPartTimeEmployment` / `isOtherPosition` (`src/lib/employeeCategory.ts`) | string helper | DayTimelineModal, SchedulePage, scheduleHelpers
`getPositionGroup` (`scheduleHelpers.ts:297`) | 하드코드 sort group | 1/2/3 numeric group (약사=2, 사원/캐셔/진열/물류=3, else=1)

**중복 소스**:
- `settings.positions` (DB) ≠ `jobCategories.POSITIONS` (하드코드) ≠ `useReferenceValues.positions` (DB DISTINCT 머지)
- 3 소스 중 어느 것이 SSOT 인지 코드가 결정하지 못함
- 캐셔는 settings.positions 에 **없음** (`["약사","캐셔","물류","대표","임원"]` 가 Default · "캐셔" 있음 confirmed) → OK
- 하지만 `jobCategories.POSITIONS = ["약사","캐셔","진열","물류","거래처","기타"]` 는 **"진열" 포함** · settings.positions default 는 "진열" 없음 → 소스에 따라 UI 가 다르게 보임

### 6.2 Rank usage

- `employees.rank` (DB) — canonical
- `settings.ranks` (optional) default `["대표","부장","팀장","과장","대리","사원"]`
- `jobCategories.RANKS` = `["", "대표", "이사", "부장", "팀장", "과장", "약사", "사원", "알바"]` (9개 · "이사"+"약사"+"알바" 추가 · "대리" 없음)
- 두 소스 서로 모순 ("이사" ↔ "대리", 상관 매핑 없음)
- `server/routes/staff/staff.ts` 는 **rank 를 UI 노출용으로만 사용** (하드코드 "대표/이사" 제거됨 · 2026-10-06)

### 6.3 Work category (집계용)

- `MonthlySummary` type (`src/types.ts`) 필드: `pharmacistCount`, `staffCount`, `otherCount`, `logisticsCount`, `warehouseCount` — 하드코드 schema
- `getCalculatedSummary` (`scheduleHelpers.ts:160`) 가 position 을 보고 분류 → `isPharmPosition` + `isOtherPosition` + `positionToCategory` 조합
- Category SSOT: **없음**. position + hardcoded 매핑 + wageRates keys 가 혼용.

### 6.4 Conflicts

- `settings.positions` 는 **list of available positions** 이지, `settings.categories` 가 아님. 하지만 `usePositionCategories` 는 **wageRates keys 를 category 로 간주** → wageRates 안 올린 position (e.g. "대표", "임원") 은 자동으로 "기타" 로 분류.
- 사용자 금지 규칙 "position mapping 실패 → '기타'" 위반.

### 6.5 "기타" fallback 발생 지점

| 지점 | 조건 |
|---|---|
| `scheduleHelpers.ts:46,51` `positionToCategory` | position empty OR POSITION_TO_CATEGORY 에 없고 "물류" 미포함 |
| `scheduleHelpers.ts:196` `getCalculatedSummary` | positionToCategory 가 "기타" 반환 시 `otherCount++` |
| `scheduleHelpers.ts:271` `buildFilteredEmployees` 탭 "기타" | 명시적 분기 |
| `usePositionCategories.ts:37` `positionToCategoryDynamic` | wageRateKeys 매칭 실패 |
| `scheduleHelpers.ts:299` `getPositionGroup` | 약사 아님, 캐셔/진열/사원/물류 아님 → 1 (가장 낮은 그룹) · "기타" 라벨은 아니지만 정렬상 동일 효과 |
| `isOtherPosition` (`employeeCategory.ts:10`) | `position === "기타" || position === "알바" || employmentType === "알바"` |

**사용자 지적한 "대표/임원 → 기타" 는 다음 경로로 발생**:
1. `settings.positions` default 에 "대표" / "임원" 있음
2. `wageRates` 에 "대표" / "임원" key 없음 (관리자가 설정 안 함)
3. `getCalculatedSummary` → `isPharmPosition("대표")=false` → `isOtherPosition("대표", "정직원")=false` ("기타" or "알바" 아님) → `positionToCategory("대표")=` POSITION_TO_CATEGORY 에 없음 + "물류" 미포함 → **"기타"**
4. ScheduleGrid summary 하단 `otherCount++`

이는 사용자 금지 규칙 ("rank/title 에서 임의 category 추론", "position mapping 실패 → 기타") 위반.

---

## SECTION 7 — "대표/임원 → 기타" 문제 상세

### 7.1 Mapping 실패 지점 (전수)

| 파일:라인 | 코드 | 영향 |
|---|---|---|
| `src/components/SchedulePage/scheduleHelpers.ts:46-52` | `if (!pos) return "기타"; ... return "기타";` | summary · 필터 분기 |
| `src/components/SchedulePage/usePositionCategories.ts:37-45` | `if (!pos) return "기타"; ... return "기타";` | 동적 카테고리 매칭 실패 시 |
| `src/components/SchedulePage/scheduleHelpers.ts:196` | `if (cat === "기타") { otherCount++; }` | summary 숫자 왜곡 |
| `src/lib/employeeCategory.ts:10` | `isOtherPosition` 하드코드 조건 | lunch · schedule · timeline 공통 |

### 7.2 Rank/title 과 work category 혼용

- `employees.rank` 는 UI 표시용 (약사 '약국장' 등) — 혼용 지점은 없음 (verified).
- 하지만 `jobCategories.RANKS` 에 "약사" 가 포함되어 있어 rank 와 position 이 혼동되는 **데이터** 가 생길 수 있음 (사용자 입력 시).
- `staff.ts` 에서 rank 를 노출 (하드코드 라벨 제거됨 · 2026-10-06).

### 7.3 UNMAPPED_POSITION 분리 가능 지점

**분리 후보**:
- `positionToCategory` 리턴 변경: `"기타"` → `"UNMAPPED"` (consumer 가 명시적으로 처리)
- `getCalculatedSummary` 리턴 `MonthlySummary` 에 `unmappedCount` 추가 (schema 확장)
- `usePositionCategories` 반환 배열에 `"UNMAPPED"` 추가 (settings 가 완전하지 않을 때 UI 노출)

**STOP (immediate migration 금지)**:
- MonthlySummary schema 변경 → 리포트/CSV/notification 영향
- `taxonomy schema migration` 금지 리스트에 명시

**SAFE 범위 (schema 변경 없이)**:
- 매핑 실패 시 `console.warn("[position] unmapped", pos)` 추가 → observable
- 필터 탭 "기타" 그룹 안에서 unmapped 를 **라벨링** (DOM dataset 등)

---

## SECTION 8 — [WAGE] wageRates 구조

### 8.1 Key 성격

`wageRates: Record<string, WageRate>` — key = **position 문자열 그대로** (ContractWriter · useWageAuto.ts:62-68 라인 확인).

사용 패턴:
- SettingsModal: UI 에서 "직군별 시급" 섹션으로 노출 → key 를 position 과 동일시
- `getEmpMonthStats` (scheduleHelpers.ts:140): `settingsWageRates[emp.position]` 로 lookup
- `usePositionCategories` (usePositionCategories.ts:16-23): `Object.keys(wageRates)` 를 **category** 로 재해석 → position/category 2중 역할

### 8.2 wageRates 가 category source 인가?

**YES, 혼용 중.**
- 원래 설계: wageRates key = position
- #342 (2026-09-23) 이후: `usePositionCategories` 가 wageRates keys 를 "공식 카테고리" 로 선언 (주석 line 11)
- 결과: wageRates 는 compensation table 이면서 taxonomy table 임

### 8.3 taxonomy vs compensation 분리 가능성

**가능**. 설계:
- `settings.positions`: 공식 position 리스트 (현재 존재)
- `settings.wageRates`: compensation only (현재 존재)
- `settings.categories` (신규 field, 선택적): 필터/집계용 category 리스트 + mapping

하지만 **PHASE 2 STOP 리스트에 "taxonomy schema migration" 명시** → **AUDIT 만, migration X**.

---

## SECTION 9 — [EMPLOYEE WAGE OVERRIDE]

### 9.1 Identity

`employeeWageOverrides: Record<number, WageRate>` — key = `employees.id` (sanitize at `useSettings.ts:109-118`).

**confirm**: identity 는 ID (not name). SettingsModal `addEmployeeOverride` (SettingsModal.tsx:345-357) 에서 `Number(selectedEmpId)` 로 저장 — safe.

### 9.2 Priority chain

Site A — `scheduleHelpers.ts:140` `getEmpMonthStats`:
```
empRate = overrides[emp.id] ?? wageRates[emp.position] ?? null
```
- override → position base → **null → labor cost = 0** (line 150 `if (empRate && paidHours > 0)`)
- "시급 미설정" 명시 없음 — 사용자가 label 없이 0원 처리 → PHASE 2 금지 ("등록되지 않은 position → labor cost 0") · "시급 미설정" 로 바꿔야 함

Site B — `useContractLoad.ts:115`:
```
rate = override ?? positionRate ?? (rawPos ? defaultWageForPosition(rawPos) : null)
```
- override → position base → **defaultWageForPosition** (hardcoded 35000/40000 or 10030/12000) → **business fallback** · 사용자 금지 규칙 위반

Site C — `useContractActions.ts:97-101`: 동일 패턴.

### 9.3 Flow consistency

- SchedulePage (labor cost): `null` 반환 → 0원
- ContractWriter (근로계약서): hardcoded 시급 반환
- **동일 position 에 대한 임금 계산이 두 페이지에서 다름** → PHASE 2 "CALCULATION ONE" 원칙 위반

---

## SECTION 10 — [LABOR COST TRACE]

### 10.1 Flow

```
schedules.workingHours (text, HH:MM-HH:MM)
    + emp.break_time_minutes (default 60)
    + emp.break_apply_paid (default true)
    + settings.scheduleTypes (hours fallback)
    + settings.wageRates[emp.position] (weekday/weekend)
    + settings.employeeWageOverrides[emp.id] (priority)
    + weekend detection: new Date(s.date).getDay() === 0 || 6
         ↓
scheduleHelpers.getEmpMonthStats
    → { workDays, totalHours, laborCost }
         ↓
ScheduleGrid (per-employee column stat)
ScheduleGrid summary row (position-level sum · lines 110-114)
```

### 10.2 Duplicates (CALCULATION SSOT 후보)

- **단일 함수** `getEmpMonthStats` (scheduleHelpers.ts:128-158) 가 SSOT · 다른 곳에서 복제된 계산은 **없음** (grep 검증).
- 하지만 **weekend detection** 은 UTC off-by-one 버그 가능 (phase 0 output 라인 524 기록). `new Date(s.date).getDay()` — KST 환경에서 UTC midnight parse → -1 shift.

### 10.3 Dashboard / Summary

- ScheduleGrid.tsx:108-114 position 그룹별 (약사/사원/기타) sum 3 번 호출 — 각각 `getEmpMonthStats` 재호출 → O(N·3) → N=19 수용 가능
- SummaryRow (`SchedulePage/SummaryRow.tsx`) 는 `getCalculatedSummary` 결과만 수신 — 별도 labor 계산 없음

### 10.4 SSOT 판정

- `getEmpMonthStats` 는 **유일한 labor calc 함수**. SSOT ✓
- 다만 inputs (wageRates, overrides, scheduleTypes) 모두 `useSettings` 소비자에게 **prop 으로 전달** → prop 통로 다수 (SchedulePage → ScheduleGrid → scheduleHelpers) — refactor 가능하나 schema 수준 변경 아님.

---

## SECTION 11 — [missing wage]

### 11.1 패턴 전수

| 파일:라인 | 패턴 | 결과 |
|---|---|---|
| `scheduleHelpers.ts:140-154` | `overrides[id] ?? wageRates[pos] ?? null` → `if (empRate) ...` else 0 | labor = 0 (라벨 없음) |
| `useContractLoad.ts:115` | `override ?? positionRate ?? defaultWageForPosition(pos) ?? null` | hardcoded 시급 |
| `useContractActions.ts:97-101` | 동일 | 동일 |
| `useWageAuto.ts:68-71` | `positionRate ?? defaultWageForPosition(pos)` | 동일 |
| `EmployeeProfileCard.tsx` | wageRates presence 로 "미등록" 안내 | **GOOD** (라벨 있음) |

### 11.2 "시급 미설정" 전환 가능성

- `getEmpMonthStats` 리턴에 `wageMissing: boolean` 추가 (schema 유지, 소비자 변경 X)
- ScheduleGrid 요약 셀 "시급 미설정" 배지 추가 가능 (UI 변경)

**현재 PHASE 2 STOP 리스트**: "ambiguous position/category mapping" 금지, UI 변경 금지 **단, settings consumer 의 fallback 제거/UNMAPPED 표시는 safe fix 범위** 로 명시 → SAFE FIX 로 추가 가능.

---

## SECTION 12 — [SCHEDULE TYPES] AUDIT

### 12.1 Structure (`src/hooks/useSettings.ts:9-16`)

```ts
interface ScheduleTypeEntry {
  type: string;           // identity (string label)
  hours: string;          // 기본 HH:MM-HH:MM
  pharmHours: string;     // 약사 override
  logisticsHours: string; // 물류 override
  partTimeHours: string;  // 알바 override
  color?: string;         // hex
}
```

**identity = `type` 문자열** (not code / not ID). label 변경 = 신규 타입 생성.

### 12.2 Consumers

| 소비자 | 접근 패턴 |
|---|---|
| `ScheduleCell.tsx` | `scheduleTypeEntries` prop → `activeScheduleTypes` map · `WORK_TYPES`/`OFF_TYPES` set 과 교집합 |
| `ScheduleGrid.tsx` | `settingsScheduleTypes` → `getEmpMonthStats` 로 전달 |
| `DayTimelineModal.tsx` | `useSettings().positions` 만 사용 (scheduleTypes 안 씀) · `TYPE_ORDER` hardcode |
| `scheduleHelpers.ts:95` `getTypeHoursMap` | position/employmentType 에 따라 pharmHours/logisticsHours/partTimeHours 선택 |
| labor cost | `getTypeHoursMap` 결과를 workingHours fallback 으로 사용 (line 146) |
| leave | NOT consumer — leave_type 은 별도 enum (`src/components/LeavePage/LeavePage.tsx:73 LEAVE_TYPES`) |
| reservation | `isOffType` (shared) 로 schedules.type 체크 — scheduleTypes label 자체 미사용 |
| summary | `getCalculatedSummary` 는 "오픈","미들","마감","오전반차","오후반차","휴무","월차","결근" 하드코드 (lines 177-181) · scheduleTypes 전체 iterate 안 함 → **신규 schedule type 추가 시 summary 에 반영 X** |
| filter | ScheduleFilterBar — scheduleTypes 자체는 안 쓰고 position-based 필터만 |

### 12.3 Identity migration (STOP)

- type 문자열 변경 → `schedules.type` 전체 rename 필요 → migration · PHASE 2 STOP 리스트.
- `isWorking`/`isLeave`/`isOff`/`isPartialDay` boolean flag 는 ScheduleTypeEntry 에 없음 → 하드코드 OFF_TYPES set 들로 추측 → PHASE 2 금지 패턴.

---

## SECTION 13 — [OFF_TYPES] 하드코드 전수 (Section 4 추가 요약)

| 파일:라인 | 집합 | 포함 요소 |
|---|---|---|
| `src/shared/schedule/offTypes.ts:13` **공식** | OFF_TYPES const | 휴무·월차·지정휴무·결근 |
| `src/shared/schedule/offTypes.ts:16` **공식** | HALF_DAY_TYPES | 오전반차·오후반차 |
| `src/shared/schedule/offTypes.ts:19` **공식** | WORK_TYPES | 오픈·미들·마감·오픈마감 |
| `server/routes/daily/reservations.ts:17` | import shared ✓ | — |
| `server/routes/daily/reservationAvailability.ts:11` | import shared ✓ | — |
| `server/routes/staff/staff.ts:10` | import shared ✓ | — |
| `server/routes/daily/lunch.ts:12` | **duplicate hardcode** `["휴무","월차","지정휴무","결근","오전반차","오후반차"]` (OFF+HALF 결합) | miss shared |
| `src/components/SchedulePage/scheduleHelpers.ts:126` | **duplicate hardcode** `["휴무","월차","결근"]` | **"지정휴무" 미포함** → data mismatch |
| `src/components/SchedulePage/scheduleHelpers.ts:181` | **duplicate hardcode** `["휴무","월차","결근"]` | 동일 miss |
| `src/components/SchedulePage/scheduleHelpers.ts:320` | **duplicate hardcode** `["휴무","월차","지정휴무","결근","오전반차","오후반차"]` (TODAY_OFF_TYPES) | all-off 집합 |
| `src/components/SchedulePage/ScheduleCell.tsx:277-278` | **duplicate hardcode** WORK=`["오픈","미들","마감","오전반차","오후반차"]` OFF=`["휴무","월차","지정휴무","결근"]` | — |
| `src/components/LunchPage/LunchPage.tsx:67` | **duplicate hardcode** `["휴무","월차","지정휴무","결근","오전반차","오후반차"]` | miss shared |
| `src/components/DayTimelineModal/types.ts:22` | **duplicate hardcode** `SKIP_TYPES = ["휴무","월차","지정휴무"]` | **"결근" 미포함** |
| `src/components/DisplayPage/DisplayPage.helpers.ts:94` | **duplicate hardcode** 동일 | 동일 miss |
| `src/components/SchedulePage/useEditScheduleForm.ts:40` | SCHEDULE_CYCLE `["오픈","미들","마감","휴무"]` | 셀 cycle 하드코드 |
| `src/hooks/useLeaveManager.ts:42` | `["월차","오전반차","오후반차"]` | LEAVE_TYPES_SET · 다른 분류 |

**충돌 요약**:
- OFF 포함 "지정휴무": shared ✓, scheduleHelpers.ts:126/181 ✗ → labor cost 가 "지정휴무" 를 **work day 로 집계** · 임금 계산 오류 가능
- OFF 포함 "결근": shared ✓, DayTimelineModal/types.ts ✗ · DisplayPage.helpers.ts ✗ → 결근 날 TimelineModal/DisplayPage 에서 **직원이 보임**
- SchedulePage/ScheduleCell/LunchPage 는 반차를 OFF 에 포함 → 반차는 반나절 OFF 이지만 집합 분류상 "지금 근무 안 하는 사람" 으로 처리 (semantic 다른 case 마다 다름)

### 13.1 공식 shared helper 사용률

- 서버: 3/4 route 사용 (`reservations`, `reservationAvailability`, `staff`) · `lunch.ts` 는 미사용
- 클라이언트: **0/5 사용** (scheduleHelpers, ScheduleCell, LunchPage, DayTimelineModal, DisplayPage.helpers)
- 공식 shared `OFF_TYPES` 는 서버 전용으로 사용 중, 클라는 **전혀 사용 안 함** → PHASE 2 금지 ("문자열 includes 추정") 위반

---

## SECTION 14 — Schedule type metadata 제안 (AUDIT 결과만 · migration X)

### 14.1 설계 제안 (ScheduleTypeEntry 확장)

```ts
interface ScheduleTypeEntry {
  code: string;                 // identity (ASCII) · migration path: existing type → code
  label: string;                // 기존 type → label 로 rename (UI only)
  isWorking: boolean;           // true: 오픈/미들/마감/오픈마감
  isLeave: boolean;             // true: 월차/반차
  isOff: boolean;               // true: 휴무/지정휴무/결근
  isPartialDay: boolean;        // true: 오전반차/오후반차
  startTime?: string;           // "10:00"
  endTime?: string;             // "18:00"
  pharmHours?/logisticsHours?/partTimeHours?: string;
  color?: string;
}
```

### 14.2 왜 지금 migration 하지 않는가

- STOP: scheduleTypes identity migration
- `schedules.type` 는 label 로 저장 (text) → identity 변경 시 **전수 rename** 필요
- `leave_requests.leave_type` 과 매핑 필요
- UI 변경 수반

### 14.3 SAFE path (schema 변경 없이)

- 클라 `src/shared/schedule/offTypes.ts` 를 **클라 소비자 전수에서 사용** (OFF/HALF/WORK)
- `scheduleHelpers.ts` 의 3개 OFF 하드코드 → shared helper 호출로 교체 (SAFE FIX 후보)

---

## SECTION 15 — [반차 semantics]

### 15.1 DB 표현

- `schedules.type` = "오전반차" / "오후반차"
- `leave_requests.leave_type` = "오전반차" / "오후반차" / "반차"
- `settings.scheduleTypes` 에 두 entry 존재 (DEFAULT_SCHEDULE_TYPES[4], [5]) — hours 는 빈 문자열

### 15.2 workingHours 처리

- `scheduleHelpers.ts:146` `wh = s.workingHours || shiftHourFallback[s.type] || ""`
- settings.scheduleTypes[반차].hours = "" (default) → fallback 도 "" → labor 계산 시 **반차는 workingHours 가 schedules row 에 직접 저장되어 있지 않으면 0 시간** 처리
- shared `isHalfDayType` (offTypes.ts:33) 는 reservation 가능 여부 판정 전용 — labor 계산에 사용 안 됨

### 15.3 authority

- workingHours 문자열이 **authority** (empty 시 fallback)
- schedule type label (반차 label) 자체는 "반차구나" 라는 의미만 — 자동 시간 생성 안 함
- 하드코드 추가 **금지** · PHASE 2 원칙 유지 ✓

---

## SECTION 16 — Schedule 메인 consumers (settings read 경로)

| 컴포넌트 | useSettings fields | 비고 |
|---|---|---|
| `SchedulePage.tsx:63-71` | positions · employmentTypes · workplaces · scheduleTypes · wageRates · employeeWageOverrides · update | 메인 orchestrator |
| `ScheduleGrid.tsx` | props: settingsScheduleTypes · settingsWageRates · settingsEmployeeWageOverrides | prop forward from SchedulePage |
| `ScheduleCell.tsx` | props: scheduleTypeEntries · activeScheduleTypes | SchedulePage pass-down |
| `ScheduleFilterBar.tsx` | 간접 (wageRates keys → usePositionCategories) | position 탭 |
| `ScheduleToolbar.tsx` | 없음 (lock 상태만 ScheduleData hook 로부터) | — |
| `SummaryRow.tsx` | 없음 (getCalculatedSummary 결과만) | — |
| `DayTimelineModal.tsx:325` | positions only | #89 settings.positions 순회 |
| `EmployeeCalendarModal` | 없음 (schedules prop 기반) | — |
| `UpcomingLeaveBanner` | 없음 | — |
| `useScheduleData` | useSettings call 없음, settings-updated event listener 없음 | **stale** |
| `useEditScheduleForm` | 없음 (SCHEDULE_CYCLE 하드코드) | — |
| `scheduleHelpers.ts` | parameter 로 받음 (SSOT 유지) | — |

**중복 소스 없음** · 모두 `SchedulePage.useSettings` 결과를 prop 으로 drill down.

---

## SECTION 17 — Employee 관리 consumers

| 컴포넌트 | useSettings | useReferenceValues | 하드코드 |
|---|---|---|---|
| `StaffManagePage.tsx` | 없음 (useFetchEmployee 가 전체 HR 필드 조회) | 없음 | 없음 |
| `StaffDetailPanel.tsx:119` | `settings` (전체 객체 접근) | 없음 | — |
| `EmployeeFormModal.tsx:113` | 없음 | `positions · ranks · workplaces` (DB DISTINCT + hardcoded merge) | — |
| `CreateModal.tsx` | — | — | (TBD · 전수 미확인) |
| `EmployeeInfoForm.tsx:236` | `positions: settingsPositions` + fallback POSITIONS (jobCategories) | 없음 | positionOptions |
| `EmployeeProfileCard.tsx:52` | `settings` (wageRates 등 전체) | 없음 | — |

**중복 Options Source (duplicate source)**:
- SchedulePage 쪽 EmployeeFormModal → `useReferenceValues` 사용
- StaffManagePage 쪽 EmployeeInfoForm (via StaffDetailPanel) → `useSettings().positions` 사용
- **같은 직원 폼이 두 다른 source 에서 options 를 가져옴** · PHASE 2 "SOURCE ONE" 원칙 위반

---

## SECTION 18 — Reservation integration

| 지점 | 접근 | 비고 |
|---|---|---|
| `ReservationPage.tsx:90` | `useSettings().visitorReservation` | slot/buffer/assignee IDs |
| `server/routes/staff/staff.ts:17-58` | `app_settings all_settings.visitorReservation.assigneeEmployeeIds` | server loader, employees 재직 체크 |
| `server/routes/daily/reservations.ts:23-33` | 동일 | assigneeIds 로드 |
| `server/routes/daily/reservationAvailability.ts:31-45` | 동일 + slotMinutes + bufferMinutes + useEmployeeSchedule | sanitize 로직 own copy |

**OFF semantics 공유**: `isOffType` (shared) ✓ 서버 3곳 사용 ✓
- 반차는 `isHalfDayType` 서버에서 사용 ✓
- 클라 ReservationPage.tsx 는 OFF 체크 함수 미사용 (staff availability 는 서버 fetch 결과만 노출)

**중복 sanitize 로직**: 서버 reservationAvailability.ts 가 settings 를 다시 sanitize (`loadVisitorReservationSettings`) — 클라 `useSettings.sanitizeVisitorReservation` 와 **의미 중복** (타입 체크 로직 복제). 서버에서는 **DB 직접 읽기만** 하므로 사용자가 UI 를 거치지 않고 DB 조작하면 sanitize 가 2 곳에서 각각 필요.

---

## SECTION 19 — [PROPAGATION]

### 19.1 설정 변경 이벤트

- `window.dispatchEvent(new CustomEvent("settings-updated", {detail: AppSettings}))` — `useSettings.ts:239-243`
- 매 `update(partial)` 호출 시 2 번 발생:
  1. 즉시 (setTimeout 0) — line 284
  2. debounce (800ms) 후 server 저장 완료 시 — line 292
- 수신자: 모든 **same-window** `useSettings` 인스턴스 (line 262-271) — setSettings + localStorage overwrite

### 19.2 Cross-tab

- **없음**. storage event listener 없음, BroadcastChannel 없음.
- Tab A 가 "positions" 변경 → Tab B 는 다음 **mount 때 DB fetch** 전까지 몰름.
- Tab B 의 editor 가 Tab A 변경 전 base 로 저장하면 Section 5 S3 lost update.

### 19.3 Full refresh 필요 case

- Tab B 의 wageRates/positions/scheduleTypes 가 반영되려면: 페이지 refresh OR Tab B 가 fetch 를 트리거하는 라우팅 변화.
- `useScheduleData` 는 settings-updated 를 **listen 안 함** → settings 변경 후 useScheduleData 가 재 fetch 안 함. 그러나 scheduleTypes 변경은 ScheduleGrid 재렌더에만 영향 (data 는 schedules DB · settings 무관).

### 19.4 실제 cross-tab 필요성

- 관리자 2 명이 서로 다른 PC/탭에서 환경설정 수정 가능 → **lost update 방지 필요** → cross-tab 또는 server side merge 필수
- 현재 설계는 "single admin, single tab" 가정 — 운영 현실과 불일치

---

## SECTION 20 — [STALE SETTINGS]

### 20.1 Stale window

| 설정 변경 | 영향 받는 소비자 | 변경 반영까지 |
|---|---|---|
| wageRates | SchedulePage ScheduleGrid · ContractWriter | same-tab: 즉시 (settings-updated) · other-tab: refresh |
| scheduleTypes | ScheduleCell · ScheduleGrid · scheduleHelpers | same-tab: 즉시 · other-tab: refresh |
| visitorReservation | ReservationPage · server staff.ts | **클라: same-tab 즉시 (CustomEvent) · 서버: 매 요청마다 DB 직접 조회** (서버 캐시 없음) → stale 없음 |
| positions | EmployeeInfoForm · SchedulePage filter tabs · DayTimelineModal | same-tab 즉시 · other-tab refresh |
| schedule_lock_YYYY-MM | ScheduleToolbar · 서버 assertScheduleNotLocked | server: 매 요청 조회 (실시간) · client: `useScheduleData` 가 mount 시 fetch → 다른 탭에서 lock 토글 시 **current tab 모름** |

### 20.2 Risk 식별

- Stale labor cost: 관리자가 wageRates 를 수정 후 사장에게 **보여주는 ScheduleGrid 는 즉시 반영** (same tab). 다른 PC 의 사장 view 는 refresh 전까지 구 데이터.
- Stale lock state: Tab 1 에서 lock 해제 후 Tab 2 에서 편집하려 하면 server 는 unlocked (실시간) · Tab 2 UI 는 locked 상태로 edit UI 숨김 → UX 혼란.

---

## SECTION 21 — [AUTH write path]

### 21.1 Frontend write path

- SettingsModal / ScheduleSettingsPage / ReservationPage → `useSettings.update()` → `saveSetting()` → `POST /api/settings`
- 서버 `authorize(9)` → 관리자 전용

### 21.2 Direct Supabase 호출

grep: 클라에서 `supabase.from("app_settings")` 직접 호출 **없음** (verified)

### 21.3 Boundary

- Frontend → Express `/api/settings` → Supabase ✓ (recommended path)
- 서버에서 app_settings 직접 조회는 Section 1.2 참조 (18 keys · 서버 전용)

### 21.4 보안

- `POST /api/settings` body `{key, value: unknown}` → authorize(9) · Zod validate (UpsertSettingSchema accepts `z.unknown()`)
- key / value 모두 자유 → **관리자가 임의 key 로 임의 jsonb 저장 가능** → 설계 결함 (strict allowlist 없음)
- 결과: 관리자가 실수로 `key="all_settings"` 에 잘못된 shape 저장 → 전체 서비스 영향 (mergeWithDefaults 가 복구 시도하지만 scheduleTypes 등 복잡 필드 손상 가능)

---

## SECTION 22 — [AUTHORIZATION]

| key | READ | WRITE | RLS |
|---|---|---|---|
| GET /api/settings?key=X | public (no auth) | — | NO |
| POST /api/settings | — | authorize(9) | NO |
| POST /api/settings/order-email | authorize(9) | authorize(9) | NO |
| POST /api/settings/order-email/test | — | authorize(9) | NO |
| POST /api/settings/season-ranges | — | authorize(9) | NO |
| GET /api/permissions | public | — | NO |
| POST /api/permissions | — | authorize(9) | NO |
| GET /api/zone-groups | public | — | NO |
| PUT /api/zone-groups | — | authorize(9) | NO |
| GET /api/blocked-slots | public | — | NO |
| POST /api/blocked-slots | — | authorize(5) | NO |
| POST /api/zones | — | authorize(5) | NO |
| GET /api/reference-values | public | — | NO |

### 22.1 Issues

- `GET /api/settings?key=all_settings` 는 **public** → 비로그인 사용자도 wageRates, positions, visitorReservation 조회 가능
- SMTP 설정은 GET 도 authorize(9) ✓ (좋음)
- `POST /api/blocked-slots` authorize(5) → 직원 레벨이 가능 (예약 시스템)
- RLS 전부 비활성 (Supabase service role key 사용 → RLS 우회) → DB 레벨 보호 없음

### 22.2 Frontend 숨김만?

- SettingsModal 노출은 `authSession.level >= 7` 또는 `>= 9` 기반 — frontend check
- 서버 authorize(9) 는 ✓ 적용되어 있음 → **FAIL 수준은 아님** (서버 가드 유효)
- 단 GET 이 public 인 것은 noise · 민감 데이터 유출 가능 (wageRates!)

---

## SECTION 23 — [AUDIT HISTORY]

- `app_settings` 에 audit log 컬럼 없음 (updated_by, change_reason, previous_value 없음)
- 별도 테이블 (예: `app_settings_history`) 없음 (grep 검증)
- 누가/언제/무엇을 변경했는지 **복구 불가능**
- 사용자 지시 금지: "이번 Phase 바로 audit log framework 안 만듦" → P2/P3 후보로만 보고

---

## SECTION 24 — [localStorage]

Settings 관련 localStorage keys:

| key | 분류 | 용도 | authority? |
|---|---|---|---|
| `app_settings` | **BUSINESS_CACHE** | useSettings initial state + 매 update 저장 | Section 3-B 참조 · mount 직후 ~ DB fetch 완료 전까지 **business authority** |
| `megatown_auth_session` (SK_AUTH_SESSION) | SESSION | JWT · level · employeeId | authority for session |
| SK_KV_SESSION_IDLE_TIMEOUT | KV_CACHE | idle timeout minute 설정 캐시 | business cache (idle logout) |
| other `src/components/...localStorage.setItem` | PRESENTATION_CACHE | 예: sort order, view preference | OK |

**BUSINESS_CACHE 문제**:
- `app_settings` localStorage 는 Section 3-C 금지 규칙 위반 가능 (DB fetch 실패 시 계산 authority 가 됨)

### 24.1 PRESENTATION_CACHE 는 OK

- useSettings.ts:256,267,278 — localStorage 를 **최신 DB 값으로 덮어씀** → 다음 세션에서 "최근 보여진 값" 유지 (프레젠테이션 성격)
- 하지만 **"최근 보여진 값으로 계산 지속"** 하기 때문에 BUSINESS 로 분류

---

## SECTION 25 — [DEFAULT_*] 전수조사

| 상수 | 파일 | 분류 | 비고 |
|---|---|---|---|
| `DEFAULT_SETTINGS` | `src/hooks/useSettings.ts:80-90` | BOOTSTRAP seed + runtime fallback | DB 없을 때 사용 — PHASE 2 금지 ("hardcoded default 로 업무 계산") 소비자 측 사용 시 위반 |
| `DEFAULT_SCHEDULE_TYPES` | `src/constants/index.ts:17-27` | BOOTSTRAP seed | 9 타입 fallback |
| `DEFAULT_PHARMACIST_WAGE` | `src/hooks/useSettings.ts:72` | **runtime fallback** | **PHASE 2 금지 위반 가능** (사용처 Section 11 참조) |
| `DEFAULT_STAFF_WAGE` | `src/hooks/useSettings.ts:73` | 동일 | 동일 |
| `DEFAULT_ANNUAL_LEAVE` | `src/hooks/useSettings.ts:29` | BOOTSTRAP seed | 신규 직원 등록 시 seed |
| `DEFAULT_VISITOR_RESERVATION` | `src/hooks/useSettings.ts:42-47` | BOOTSTRAP seed + runtime fallback | server + client 각자 다시 sanitize |
| `POSITIONS` | `src/constants/jobCategories.ts:5` | **duplicate hardcoded** | useReferenceValues 머지 base · settings.positions 와 중복 |
| `RANKS` | `src/constants/jobCategories.ts:6` | 동일 duplicate | 9 vs 6 아이템 불일치 |
| `WORKPLACES` | `src/constants/jobCategories.ts:7` | 동일 | 2 vs 4 아이템 불일치 |
| `CONTRACT_TYPES` | `src/constants/jobCategories.ts:8` | 동일 | settings.employmentTypes 와 중복 (다른 값) |
| `JOB_CATEGORIES` | `src/constants/jobCategories.ts:9` | hardcoded taxonomy | `["약사","매장","창고","기타"]` · 사용처 없음 (dead or research-only) |
| `COLOR_PRESETS` | `src/constants/index.ts:45-57` | PRESENTATION | OK |
| `SCHEDULE_COLORS` | `src/constants/index.ts:81-124` | PRESENTATION fallback | Tailwind className · OK |
| `DEFAULT_COLOR` | `src/constants/index.ts:127` | PRESENTATION | OK |
| `DEFAULT_STORAGE_LOCATIONS` | `src/shared/schemas/settings.ts` | BOOTSTRAP seed | storage_locations 없을 때 |

### 25.1 Runtime fallback 제거 후보

**P0 제거 후보**:
- `DEFAULT_PHARMACIST_WAGE` / `DEFAULT_STAFF_WAGE` + `defaultWageForPosition()` ← **BUSINESS fallback 금지 규칙 위반** · ContractWriter 소비자 3곳 (`useContractLoad.ts:115`, `useContractActions.ts:97-101`, `useWageAuto.ts:68-71`) 수정 필요

**P1 제거 후보**:
- `useSettings.loadFromLocalStorage()` 가 `DEFAULT_SETTINGS` 반환하는 분기 → **DB fetch 전까지 null 반환 + UNCONFIGURED UI** 로 변경 가능 (하지만 UI 변경 수반 → SAFE 범위 미달)

**P2 (duplicate 해소)**:
- `jobCategories.POSITIONS/RANKS/WORKPLACES` → settings 로 통합 · useReferenceValues 폐기 또는 settings 기반으로 전환

---

## SECTION 26 — [DB-FIRST INVARIANT]

### 26.1 현재 흐름

```
app_settings DB (jsonb)
    ↓ (public GET /api/settings?key=all_settings)
useSettings.fetchAllSettings()
    ↓ (silent catch null)
useSettings mergeWithDefaults
    ↓ (localStorage write)
useState in each hook instance
    ↓ (prop drill or context N/A)
Schedule / Staff / Reservation / Contract consumers
```

### 26.2 Invariant 위반

- DB fetch 실패 → localStorage/DEFAULT 로 **business 계산 지속** → PHASE 2 "DB FIRST" 원칙 위반
- `settings-updated` 가 cross-tab 미지원 → 복수 소비자 간 **DB 가 아닌 CustomEvent 로 동기화**
- 서버 사이드 (lunch.ts, settings-related server routes) 는 **매 요청마다 DB 조회** → 서버는 DB-first ✓ · 클라만 캐시-first 상태

### 26.3 Shared settings layer 가 필요한가

- 현재 settings 는 `useSettings` 훅 (React hook)이 유일한 접근 레이어 — 모든 소비자 통일 ✓
- 하지만 "shared settings layer" (예: `src/lib/settingsLoader.ts`) 가 **없음** → 서버/스크립트/백그라운드에서 settings 접근할 때 각자 로직 재구현 (`server/routes/staff/staff.ts:17-58`, `server/routes/daily/reservations.ts:23-33`, `server/routes/daily/reservationAvailability.ts:31-45` 각자 inline parse)
- → shared helper `loadAllSettings()` 서버 전용 신규 가능 (SAFE 범위, 신규 util 하나 추가)

---

## SECTION 27 — [AUDIT OUTPUT]

**리포트 파일**: `D:\antigravity_projects\megatown-staff-scheduler\output\schedule-phase-2-settings-audit-2026-10-06.md` (이 문서)

---

## SECTION 28 — [FINDING PRIORITY]

### P0 (즉시 개선 · schema 미변경)

1. **BUSINESS fallback — DB fetch 실패 시 localStorage 로 계산 지속** (useSettings.ts:224-229, 212-220)
   - 금지 규칙 위반: "DB fetch 실패 → localStorage 값으로 계산 계속"
   - 영향: 네트워크 blip 시 사용자 몰래 구 데이터로 임금/스케줄 집계

2. **`defaultWageForPosition()` hardcoded wage fallback** (useSettings.ts:76-78 + ContractWriter 3곳)
   - 금지 규칙 위반: "hardcoded label/default 로 업무 계산"
   - 영향: wageRates 미등록 직군에 **임의 시급 35000/40000 또는 10030/12000** 자동 적용

3. **"대표/임원" position → "기타" 자동 분류** (scheduleHelpers.ts:51 + usePositionCategories.ts:45)
   - 금지 규칙 위반: "position mapping 실패 → 기타"
   - 영향: SchedulePage summary · 필터 탭에서 "기타" 수가 실제 OPS 와 불일치 (대표/임원 섞여 들어감)

4. **OFF_TYPES 하드코드 7곳 분산 · 공식 shared helper 클라 미사용** (Section 13 참조)
   - 금지 규칙 위반: "schedule type 불명 → 문자열 includes 추정"
   - 영향: "지정휴무" 가 labor cost 집계에 포함 (scheduleHelpers.ts:126 miss) → 임금 과대/과소

5. **whole-object save → lost update race** (useSettings.ts:234-236 + server:163-176)
   - 영향: 복수 관리자 동시 편집 시 소리 없이 설정 손실 · 복구 불가 (audit log 없음)

### P1 (duplicate / propagation / taxonomy inconsistency)

- 중복 options source: `settings.positions` vs `jobCategories.POSITIONS` vs `useReferenceValues.positions` (3 소스)
- 중복 rank source: `settings.ranks` vs `jobCategories.RANKS` (서로 다른 아이템 집합)
- 중복 contract type source: `settings.employmentTypes` vs `jobCategories.CONTRACT_TYPES` (다른 값)
- SettingsModal 에 `employmentTypes` 편집 탭 노출 안 됨 (TABS 배열에 없음) → DB 값은 EmployeeInfoForm 이 사용하지만 편집 UI 없음
- cross-tab stale: Section 19 (BroadcastChannel 미사용)
- `labor cost = 0` silent (scheduleHelpers.ts:150 if empRate) → UX 상 "시급 미설정" 라벨 필요
- MonthlySummary.otherCount 가 UNMAPPED 와 "진짜 기타" 혼합 → observability 결여

### P2 (presentation / cleanup / noncritical)

- `JOB_CATEGORIES` (jobCategories.ts:9) grep 결과 사용처 없음 (test only) → dead
- `blocked_slots_{date}` 는 date 당 key 생성 → 오래된 날짜 cleanup 로직 없음 (schema 는 OK · 운영 cleanup only)
- `*_import_log` (3개) — audit log 성격, settings KV 에 저장되고 있음 (schema 리팩터 후보)
- audit log 미존재 (Section 23)
- RLS 미활성 (service_role 로만 접근 · 설계상 의도되었으나 명시 문서 없음)

---

## SECTION 29 — [SAFE FIX AFTER AUDIT]

### 29.1 Applied in this phase

**없음 (전면 AUDIT 모드)**. 아래 safe fix 는 **코드 수정 가능 범위**만 식별 — 사용자 승인 후 별도 세션에서 수행.

### 29.2 Safe fix 범위 (schema 변경 X · UI 변경 최소)

| 번호 | 변경 | 파일 | 변경 유형 |
|---|---|---|---|
| SF-1 | `scheduleHelpers.ts` OFF 하드코드 3곳 → shared `isOffType` 로 교체 | `src/components/SchedulePage/scheduleHelpers.ts:126,181,320` | import 추가 + Set 조회 교체 |
| SF-2 | `ScheduleCell.tsx` 하드코드 OFF/WORK → shared helper 로 교체 | `src/components/SchedulePage/ScheduleCell.tsx:277-282` | 동일 |
| SF-3 | `LunchPage.tsx` 하드코드 OFF → shared `isOffType` + `isHalfDayType` 조합 | `src/components/LunchPage/LunchPage.tsx:67,164` | 동일 |
| SF-4 | `server/routes/daily/lunch.ts` → shared helper 사용 | `server/routes/daily/lunch.ts:12,25` | 동일 |
| SF-5 | `DayTimelineModal/types.ts` SKIP_TYPES → shared `isOffType` 또는 OFF+결근 Set | `src/components/DayTimelineModal/types.ts:22` | 동일 |
| SF-6 | `DisplayPage.helpers.ts` SKIP_TYPES → shared | `src/components/DisplayPage/DisplayPage.helpers.ts:94` | 동일 (단, 다른 agent WIP · touch 금지) |
| SF-7 | `useSettings.ts` fetchAllSettings catch → `showError` toast + 상태 flag 노출 (business consumer 가 UNCONFIGURED 처리 가능) | `src/hooks/useSettings.ts:222-230` | API 확장 (loading/error state 노출) |
| SF-8 | `ContractWriter` 3곳 `defaultWageForPosition()` 제거 · "시급 미설정" 라벨 | `useContractLoad.ts:115`, `useContractActions.ts:97-101`, `useWageAuto.ts:68-71` | 로직 변경 (UI 영향 있음 → UI 변경 금지 범위 걸침 → **DEFERRED**) |
| SF-9 | `scheduleHelpers.getEmpMonthStats` → `wageMissing: boolean` 리턴 추가 (ScheduleGrid 소비자 미구현 X · 호환) | `scheduleHelpers.ts:128` | 리턴 shape 확장 (호환) |
| SF-10 | `positionToCategory` 리턴 유지하되 console.warn 추가 (observability) | `scheduleHelpers.ts:45` | log only |
| SF-11 | 공용 서버 util `loadAllSettings()` 신규 (3곳 중복 로직 통합) | `server/lib/appSettings.ts` 신규 | 신규 util · 소비자 유지 |

### 29.3 Deferred (schema / UI 변경 포함 — 사용자 승인 필요)

| 번호 | 변경 | 이유 |
|---|---|---|
| D-1 | ScheduleTypeEntry 에 isWorking/isLeave/isOff flag 추가 | identity migration · STOP 리스트 |
| D-2 | wageRates 와 positions 분리 (categories 신설) | taxonomy schema migration · STOP |
| D-3 | all_settings → multi-row (positions / scheduleTypes / wageRates 각각 key) | all_settings → multi-key migration · STOP |
| D-4 | updated_by / version 컬럼 추가 (lost update 해결) | schema 변경 · STOP |
| D-5 | `jobCategories.ts` 상수 제거 + useReferenceValues 폐기 → settings 통합 | duplicate options source · UI 영향 · 사용자 승인 필요 |
| D-6 | `MonthlySummary.unmappedCount` 추가 | schema 확장 + UI 영향 |
| D-7 | audit log 테이블 추가 | 신규 테이블 · STOP (Section 23) |
| D-8 | cross-tab BroadcastChannel 추가 | 신규 subsystem · UI 영향 없음이지만 설계 변경 |

---

## SECTION 30 — [PHASE 2 구현 우선순위]

AUDIT 결과를 반영한 2A-2G 순서 제안 (사용자 승인 후 각 단계별 승인):

- **2A (DB authority 선언)**: `useSettings` DB fetch 실패 분기 명시 — error state 노출, consumer 가 UNCONFIGURED 처리. SAFE SF-7 + ContractWriter 3곳 fallback 제거 (D-5 대신 isolated fix). 테스트 추가.
- **2B (OFF taxonomy 통일)**: shared `offTypes.ts` 를 **클라 전수** 사용 (SF-1 ~ SF-6). "지정휴무" 포함 완전 통일.
- **2C (scheduleTypes metadata — 하드코드 OFF 집합 제거 전제 조건)**: ScheduleTypeEntry 에 isOff/isLeave boolean flag 추가 (D-1 후보 · 하지만 **optional 로 추가** 하면 migration 불필요 · identity 유지).
- **2D (wage SSOT)**: `defaultWageForPosition` 제거 (SF-8), `getEmpMonthStats` 에 wageMissing flag (SF-9), UI "시급 미설정" 라벨.
- **2E (연동 / propagation)**: 서버 공용 util `loadAllSettings()` (SF-11). cross-tab BroadcastChannel (D-8).
- **2F (taxonomy consolidation)**: `jobCategories.ts` 중복 상수 제거 (D-5).
- **2G (auth/history)**: GET `/api/settings?key=all_settings` 로그인 요구화 (관리자 wage 유출 방지). audit log 테이블 신설 (D-7 · 사용자 승인 필요).

**Phase 2 는 AUDIT 로 끝. 2A~2G 는 각 세션 승인 후 개별 수행.**

---

## SECTION 31 — [TEST MATRIX]

| id | 시나리오 | 기대 결과 |
|---|---|---|
| T-A | DB fetch 실패 (503 mock) + 사용자가 ScheduleGrid 접속 | labor cost · 요약 "DB 설정 로드 실패" 표시 · 계산 금지 |
| T-B | wageRates 가 wageRates["약사"]만 설정됨 · 캐셔 사원 ScheduleGrid 접속 | labor cost = 0 **라벨 "시급 미설정"** 표시 |
| T-C | 사용자 position = "대표" (settings.positions 에 존재 · wageRates 미등록) | SchedulePage 필터 탭 **"UNMAPPED" 또는 "대표"** 그룹 노출 · "기타" 자동 흡수 금지 |
| T-D | leave_type = "지정휴무" 인 schedules 행 생성 → labor 계산 | **지정휴무는 workDays 집계에서 제외** (현재 miss) |
| T-E | 반차 schedules.workingHours 미설정 | labor = 0 · UI 에서 "workingHours 미설정" 안내 |
| T-F | Tab A 가 wageRates 수정 · Tab B 는 변경 전에 scheduleTypes 수정 → 각각 저장 | 서버가 lost update 방어 (If-Match / 머지) 또는 명시적 경고 |
| T-G | 관리자 A 가 wage 변경 후 다른 PC 관리자 B 가 F5 → settings 최신 적용 확인 | 반영 OK |
| T-H | override 를 `name=김철수` 로 추가 (실수) · ID 변경 | override 는 ID 기반 저장 — 이름 재매칭 X · 테스트로 identity 보증 |

---

## SECTION 32 — [PERFORMANCE]

### 32.1 현재 DB 조회 패턴

- 서버: 매 요청마다 app_settings 1 row 조회 (reservations.ts, reservationAvailability.ts, staff.ts, schedule-lock) → **per-request DB round trip × 3-4** → 모든 schedule/reservation API 가 common cost 보유
- 클라: mount 당 1 번 (`useSettings`) · localStorage cache

### 32.2 Per-cell DB 조회?

- `scheduleHelpers.ts:128 getEmpMonthStats` 는 settings 를 **argument 로 받음** → cell 당 DB 조회 **없음** ✓
- settings propagation 은 prop drill · O(1) · N+1 없음

### 32.3 SF-11 효과

- `loadAllSettings()` util 하나로 서버 쪽 중복 코드 제거 (3 → 1) · 성능 영향 없음 (여전히 매 요청 1 row)
- 서버 캐시 (예: 5초 TTL) 는 사용자 대원칙 "실시간 정확성" 과 충돌 → 추가 금지

---

## SECTION 33 — [GIT SAFETY]

- 이 phase 는 AUDIT only · 코드 변경 없음 · 신규 파일 1개 (이 리포트)
- commit 불필요 (output/*.md 는 .gitignore 가 아니라 추적되는 경우도 있음 — 확인 필요)
- 다른 agent WIP (`apps/sync-agent`, `server/routes/stock/**`, `server/routes/purchase/**`, `server/routes/vendor/**`, `src/components/{Display,Landing,Order,Reservation,Scan,Stock}Page/**`, `src/shared/erp/**`, `scripts/vendor-*`, `supabase/migrations/2026-10-06_vendor_*`) → **touch 전무** ✓
- stash 미사용 · --no-verify 미사용 · baseline 변경 없음 ✓
- push 금지 ✓

---

## SECTION 34 — [FINAL AUDIT REPORT]

```markdown
# SCHEDULE PHASE 2 — Settings Framework Audit
# 2026-10-06

## [DB]
- app_settings schema = (key text PK, value jsonb, updated_at timestamptz) · updated_by/version/revision 없음
- all_settings rows = 1 row (whole AppSettings JSON) + 월별 schedule_lock_YYYY-MM rows + per-date blocked_slots_{date} rows
- json structure = AppSettings (useSettings.ts:49-64) · positions/ranks/employmentTypes/workplaces/scheduleTypes/wageRates/employeeWageOverrides/underConstruction/defaultAnnualLeave/visitorReservation
- updated_at = 매 upsert 시 client wall clock 저장 (서버 now() 아님)
- version/revision = NONE (optimistic concurrency 없음)

## [useSettings]
- DB authority = formal 하게는 DB · 실제로는 localStorage initial read + silent null fallback → **BUSINESS fallback 가능**
- localStorage = STORAGE_KEY="app_settings" · fetchAllSettings 응답, settings-updated 이벤트, update(partial) 매 호출 시 overwrite
- merge order = DEFAULT_SETTINGS ← localStorage(mount sync) ← DB fetch(mount async) ← CustomEvent(same-window)
- error behavior = catch null · 사용자 UI 알림 없음 · consumer 는 localStorage/DEFAULT 로 계산 지속 (금지 규칙 위반)
- save semantics = whole-object jsonb POST /api/settings {key:"all_settings", value: entireAppSettings} · 800ms debounce · partial patch NO

## [SETTINGS]
- positions = string[] · default ["약사","캐셔","물류","대표","임원"] · wageRates 와 별개
- ranks = optional string[] · default ["대표","부장","팀장","과장","대리","사원"] · jobCategories.RANKS 와 상이 (9 vs 6)
- employmentTypes = string[] · default ["정직원","계약직","알바"] · SettingsModal 탭 미노출
- workplaces = string[] · default ["매장","창고"] · jobCategories.WORKPLACES 와 상이 (2 vs 4)
- scheduleTypes = ScheduleTypeEntry[] · default DEFAULT_SCHEDULE_TYPES 9개 · identity=type string · isOff/isLeave boolean flag 없음
- wageRates = Record<position,{weekday,weekend}> · 기본 {} · defaultWageForPosition 하드코드 fallback
- overrides = Record<employees.id, WageRate> · 기본 {} · 올바른 ID 기반 identity ✓
- hours = scheduleTypes[].hours/pharmHours/logisticsHours/partTimeHours · workingHours authority 우선
- visitorReservation = {assigneeEmployeeIds[], slotMinutes, bufferMinutes, useEmployeeSchedule, ...} · 하드코드 "대표/이사" 2026-10-06 제거 완료

## [TAXONOMY]
- position = employees.position (DB · text) · settings.positions / jobCategories.POSITIONS / useReferenceValues.positions **3 소스**
- rank = employees.rank (DB · text) · settings.ranks / jobCategories.RANKS **2 소스**
- work category = **SSOT 없음** · positionToCategory + wageRates keys + isPharm/isOther 혼용
- conflicts = settings default vs jobCategories 하드코드 간 아이템 집합 상이 (positions: "진열" 유무, ranks: "이사"/"대리" 상호 교체, workplaces: "본사"/"기타" 유무, contractTypes: 완전 상이)
- "기타" fallback = scheduleHelpers.ts:51, usePositionCategories.ts:45 · 매핑 실패 자동 흡수 · 금지 규칙 위반

## [SCHEDULE TYPES]
- identity = type string · migration 어려움
- hardcoded labels = scheduleHelpers.ts:126,181,320 + ScheduleCell.tsx:277-278 + LunchPage.tsx:67 + DayTimelineModal/types.ts:22 + DisplayPage.helpers.ts:94 + 서버 lunch.ts:12 (**클라 전수 shared helper 미사용**)
- off handling = 하드코드 OFF 집합 **7개 분산** · "지정휴무"/"결근" 포함 여부가 소비자마다 다름 · 공식 shared/schedule/offTypes.ts 는 서버 3곳만 사용
- partial day = 반차 workingHours authority · 하드코드 추가 없음 (현 상태 유지)
- shared helper coverage = **서버 3/4** (reservations, reservationAvailability, staff · lunch.ts 미사용) · **클라 0/5** (전무)

## [WAGE]
- base source = settings.wageRates[position]
- override source = settings.employeeWageOverrides[employees.id] (ID 기반 identity ✓)
- missing wage behavior = scheduleHelpers.ts:150 label 없이 0원 · ContractWriter 는 defaultWageForPosition hardcoded fallback (금지 위반)
- calculation duplicates = **단일 SSOT getEmpMonthStats** (scheduleHelpers.ts:128) · ContractWriter 는 별개 use case (근로계약서) · laborCost 로직 복제 없음

## [PROPAGATION]
- same page = React state · 즉시
- cross page = same-window CustomEvent "settings-updated" · 즉시
- same tab = CustomEvent ✓
- cross tab = **NONE** (BroadcastChannel/storage event 미사용) · lost update 가능
- refresh needed = cross tab 변경 반영에는 refresh 필요

## [AUTH]
- read = GET /api/settings 전부 public (**wageRates/visitorReservation 비로그인 조회 가능**)
- write = POST /api/settings authorize(9) 관리자 전용
- server enforcement = ✓ (단, GET public 은 보안 공백)

## [RACE]
- whole JSON overwrite = YES (POST /api/settings 는 전체 value 덮어쓰기)
- lost update risk = HIGH (cross-tab · 동시 관리자 · 네트워크 복구 중 저장)

## [FALLBACK]
- business fallback count = **18개** (hardcode / default / silent catch 합산)
- presentation fallback count = **3개** (color presets)
- hardcoded schedule fallback = **7곳** (OFF/HALF/WORK set) · 서로 상이
- localStorage authority = YES (DB fetch 실패 시 + mount window 안에서)

## [SAFE FIX]
- applied = (none this phase · AUDIT only)
- deferred = SF-1 ~ SF-11 (상세는 Section 29.2) · D-1 ~ D-8 (schema/UI 영향 · Section 29.3)

## [STOP ITEMS]
- schema = app_settings 컬럼 추가 (updated_by/version), audit log 테이블, scheduleTypes identity migration, taxonomy migration, bulk settings data rewrite, all_settings → multi-key split
- taxonomy migration = positions/categories 분리 금지
- bulk data rewrite = schedules.type / leave_requests.leave_type 일괄 변경 금지

## [VALIDATION]
- TS = `npx tsc --noEmit` → PASS (no output · errors=0)
- BUILD = not executed (AUDIT only · 코드 변경 없음)
- TEST = not executed (코드 변경 없음)

---

- PHASE 2 AUDIT COMPLETE = YES
- PHASE 2 CODE COMPLETE = NO (SAFE FIX 미적용 · 사용자 승인 대기)
```

---

## 부록 A — Settings consumer 전수 (파일:라인)

| 소비자 | 접근 포인트 |
|---|---|
| `src/hooks/useSettings.ts` | 정의 자체 |
| `src/hooks/useSettings.test.ts` | 테스트 |
| `src/components/SettingsModal/SettingsModal.tsx` | 편집기 전체 |
| `src/components/SettingsModal/tabs/PositionsTab.tsx` | positions 편집 |
| `src/components/SettingsModal/tabs/RanksTab.tsx` | ranks 편집 |
| `src/components/SettingsModal/tabs/WorkplacesTab.tsx` | workplaces 편집 |
| `src/components/SettingsModal/tabs/ScheduleTypesTab.tsx` | scheduleTypes 편집 |
| `src/components/SettingsModal/tabs/VisitorReservationTab.tsx` | visitorReservation 편집 |
| `src/components/SettingsModal/tabs/AccountTab.tsx` | 계정 (settings 외) |
| `src/components/ScheduleSettingsPage/ScheduleSettingsPage.tsx:30` | defaultAnnualLeave 편집 |
| `src/components/SchedulePage/SchedulePage.tsx:63-71` | positions/employmentTypes/workplaces/scheduleTypes/wageRates/overrides |
| `src/components/SchedulePage/ScheduleFilterBar.tsx` | wageRates (via usePositionCategories) |
| `src/components/SchedulePage/usePositionCategories.ts` | wageRates keys → category |
| `src/components/common/EmployeeProfileCard.tsx:52` | settings (wageRates presence check) |
| `src/components/common/EmployeeInfoForm.tsx:236` | positions |
| `src/components/DayTimelineModal/DayTimelineModal.tsx:325` | positions |
| `src/components/ContractSettingsPage/ContractSettingsPage.tsx:130` | wageRates (edit via update) |
| `src/components/ContractWriterPage/useContractLoad.ts:28` | 전체 settings |
| `src/components/ContractWriterPage/useWageAuto.ts` | wageRates/overrides |
| `src/components/ContractWriterPage/useContractActions.ts` | wageRates/overrides |
| `src/components/StaffManagePage/StaffDetailPanel.tsx:119` | 전체 settings |
| `src/components/ReservationPage/ReservationPage.tsx:90` | visitorReservation |
| `src/components/PermissionsPage/PermissionsPage.tsx:130` | 전체 settings (page permissions 별도 KV) |
| `src/components/LandingPage/LandingPage.tsx:222` | underConstruction |

## 부록 B — 서버 settings 소비자

| route | key(s) |
|---|---|
| `server/routes/settings/settings.ts` | 전체 KV API |
| `server/routes/settings/autoImport.ts` | CONFIG_KEY, STATUS_KEY, product_import_log |
| `server/routes/settings/eventCategoryRules.ts` | event_category_rules |
| `server/routes/staff/staff.ts` | all_settings.visitorReservation.assigneeEmployeeIds |
| `server/routes/daily/reservations.ts` | all_settings.visitorReservation.assigneeEmployeeIds |
| `server/routes/daily/reservationAvailability.ts` | all_settings.visitorReservation.{slotMinutes,bufferMinutes,useEmployeeSchedule,assigneeEmployeeIds} |
| `server/routes/daily/lunch.ts` | 하드코드 OFF 사용 · settings 미참조 |
| `server/lib/scheduleLock.ts` | schedule_lock_YYYY-MM |
| `server/lib/optimalStock.ts` | optimal_stock_period_days |
| `server/productCache.ts` | stats.sale_active_only |
| `server/routes/stock/products.ts` (4곳) | stats.sale_active_only, product_import_log |
| `server/routes/stock/salesAutoRecommend.ts` | event_category_rules |
| `server/routes/stock/stockManage/periodCoverage.ts` | stock_import_log |
| `server/routes/stock/stockManage/uploadStock.ts` | stock_import_log |
| `server/utils/productInventoryQuery.ts` | stats.sale_active_only |
| `server/routes/purchase/purchase.ts` | purchase_import_log, company_info |
| `server/routes/purchase/orderPurchaseMatch.exceptionBulkSend.ts` | company_info |
| `server/routes/payment/borrowings.ts` | company_info (서버 테이블 "settings" 호칭 사용 — 다른 테이블인지 확인 필요) |
| `server/routes/display/requests.ts` | company_info |
| `server/routes/reference/referenceValues.ts` | NO settings · employees DISTINCT values |

> **NOTE**: `server/routes/payment/borrowings.ts:144` 가 `supabase.from("settings")` (단수 "settings") 를 호출함 — 다른 모든 소비자는 `"app_settings"` 사용. 테이블명 오타 or 별도 테이블 가능성 — 별도 조사 필요. (이번 phase scope 외 — 보고만.)

---

### 끝. SAFE FIX 적용 여부: NO (전면 AUDIT · 코드 미변경).
