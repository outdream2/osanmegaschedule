# SCHEDULE PHASE 2 — Implementation Report
# 2026-10-07

> Settings Framework · P0-1 ~ P0-4 safe fix 적용 + P0-5 proposal 작성.
> 선행: Phase 2 Settings Audit (`output/schedule-phase-2-settings-audit-2026-10-06.md`, 1,144 줄).
> 상태: PHASE 2 CODE COMPLETE = YES (P0-1 ~ P0-4) · P0-5 = PROPOSAL ONLY (production apply 금지).

---

## FINAL REPORT

### DB AUTHORITY

- `useSettings` 는 DB fetch 결과를 FetchResult discriminated union (ready / empty / error) 로 처리
- `status`: `"loading" | "ready" | "error"` + `errorMessage` + `isReady` shortcut 추가 노출
- `status === "ready"` 일 때만 business 계산 authority (empty bootstrap 도 ready · DB 응답 성공했으나 row 없음 → DEFAULT seed 노출 허용)
- DB fetch 실패 → `status="error"` · `errorMessage` 설정 · 소비자가 UX "설정 정보를 불러오지 못했습니다." + 계산 금지 분기 가능
- localStorage overwrite 은 DB fetch 성공 시 또는 settings-updated event dispatch 시에만 발생 (presentation/cache only)
- 서버 reader (lunch · reservations · reservationAvailability · staff) 는 매 요청 DB 직접 조회 유지 (서버 측 DB-first 미회귀 유지)

### WAGE

- 하드코드 wage runtime fallback 전면 제거 (약사 35000/40000 · 그 외 10030/12000)
- `src/lib/wageResolver.ts` 신규 · 공통 SSOT · `resolveEmployeeWage(employeeId, position, settings) → { status, wage, source }`
- 우선순위: `employeeWageOverrides[employees.id]` (exact) → `wageRates[position]` (exact · 임의 매핑 금지) → `UNCONFIGURED`
- `defaultWageForPosition()`, `DEFAULT_PHARMACIST_WAGE`, `DEFAULT_STAFF_WAGE` 은 `@deprecated` 로 유지 (SettingsModal preset 전용)
- `scheduleHelpers.getEmpMonthStats` 는 `wageConfigured: boolean` 리턴 (laborCost=0 vs unknown 구분)
- ContractWriter 3 소비자 (`useContractLoad.ts` / `useContractActions.ts` / `useWageAuto.ts`) 는 `resolveEmployeeWage` 사용 · unconfigured 이면 form `weekdayHourly/weekendHourly` 변경 X · 사용자 수동 입력 안내
- override identity = `employees.id` 유지 (name fallback 금지 · 검증 테스트 추가)

### TAXONOMY

- `positionToCategoryV2` 신규 · UNMAPPED 분리 · canonical "기타" vs mapping 실패 "UNMAPPED" 구분
  - canonical "기타" position → "기타"
  - 매핑 성공 (약사/캐셔/진열/사원/물류/창고/매장) → 해당 category
  - 빈 position / 매핑 실패 (대표 · 임원 · 신규 직군) → `"UNMAPPED"`
- `getCalculatedSummary` 는 V2 사용 · `MonthlySummary.otherCount` 스키마 유지하되 UNMAPPED 발생 시 `console.warn` 로 observable 추적
- 레거시 `positionToCategory` 는 그대로 유지 (하위 호환 · 기존 소비자 regression 방지)
- 서버 테이블명 오타 fix: `server/routes/payment/borrowings.ts:144` `supabase.from("settings")` → `"app_settings"` (CASE B · 프로젝트 전수 "app_settings" 일원화)
- `jobCategories.ts` 상수 제거는 UI 영향 커서 deferred (D-5 · PHASE 2 STOP 리스트 외 범위)

### SCHEDULE TYPES

- 클라/서버 공통 `src/shared/schedule/offTypes.ts` (`OFF_TYPES`, `HALF_DAY_TYPES`, `WORK_TYPES`, `isOffType`, `isHalfDayType`, `isWorkType`, `isAvailableDay`) · 서버/클라 공용 위치 유지 (이미 shared 위치)
- 클라이언트 하드코드 7곳 → shared helper 사용 통일:
  - `scheduleHelpers.ts:126` · `OFF_TYPES_SET` 에 "지정휴무" 추가 (regression bug fix) · `isOffType` 사용 (workDays + labor)
  - `scheduleHelpers.ts:181` · getCalculatedSummary · `isOffType` 사용
  - `scheduleHelpers.ts:320` · TODAY_OFF_TYPES → `isOffType ∪ isHalfDayType`
  - `ScheduleCell.tsx:277-278` · WORK/OFF Set → shared WORK_TYPES ∪ HALF_DAY_TYPES / OFF_TYPES
  - `LunchPage.tsx:67` · isLunchSkipType helper · `isOffType ∪ isHalfDayType`
  - `DayTimelineModal/types.ts:22` · SKIP_TYPES → shared OFF_TYPES (결근 포함 bug fix)
  - `server/routes/daily/lunch.ts:12` · `isOffType / isHalfDayType` 사용
- `DisplayPage.helpers.ts:94` SKIP_TYPES 는 touch 금지 WIP · 미변경 (deferred · 다른 agent WIP 영역)
- scheduleTypes identity migration 금지 (STOP 리스트)
- 반차 workingHours authority 유지 · 하드코드 추가 없음

### LABOR

- `scheduleHelpers.getEmpMonthStats` 단일 SSOT · `{ workDays, totalHours, laborCost, wageConfigured }` 리턴
- OFF (지정휴무 포함) 는 workDays/laborCost 집계 X · `isOffType` SSOT 사용
- 반차는 workingHours authority (DB 저장값) · 자동 계산 하드코드 추가 없음
- break 처리 기존 로직 유지 (`break_time_minutes` + `break_apply_paid`)
- wageConfigured=false 시 laborCost=0 반환 · 소비자가 "시급 미설정" UX 분기 가능 (schema 변경 없음)

### EMPLOYEE MANAGEMENT

- Schedule ↔ Employee Management options source 통일은 D-5 (duplicate options source · `jobCategories.ts` 상수 제거) deferred
- Current state 유지: EmployeeFormModal (schedule 쪽) → useReferenceValues · EmployeeInfoForm (staff manage 쪽) → useSettings.positions · 두 소스 공존 유지
- STOP 리스트: label 저장 identity migration 금지 → DB `employees.position` text 저장 그대로

### VISITOR RESERVATION

- 이미 완료 (2026-10-06 커밋 7c6349c7 + 2aaf3340 + 83061d87) · 하드코드 "대표/이사" 제거 완료 상태
- `useSettings.visitorReservation` business setting authority 확인 완료
- 0/1/다명 semantics 미변경 (`assigneeEmployeeIds: number[]` 그대로)
- schedule availability (reservationAvailability.ts) 가 shared `isOffType / isHalfDayType` 사용 중 ✓

### PROPAGATION

- `settings-updated` CustomEvent 재사용 (useSettings 저장 후 즉시 + debounce 후 2회 dispatch · 동일 window 안 소비자 즉시 동기화)
- same-tab · 동일 window · 즉시 ✓
- cross-tab BroadcastChannel 는 deferred D-8 (범위 외 · 설계 변경)
- 저장 성공 후 fresh DB query 는 cross-tab 변경이 들어오면 다음 fetch 시 반영 (서버 라우트는 매 요청 DB 조회)

### SECURITY

- `GET /api/settings?key=X` 민감 keys 는 로그인 사용자만 접근
  - 민감: `all_settings` (wageRates/visitorReservation 포함) · `order_email_smtp` (SMTP 자격)
  - 공개 유지: `page_permissions` · `zone_groups` · `storage_locations` · `blocked_slots_*` · `event_category_rules` · `company_info` (vendor/landing 호환)
- `POST /api/settings` 는 기존 `authorize(9)` 유지
- 서버 세션 체크 `getSession(req)` 로 401 Unauthenticated 응답 (frontend-only guard 의존 제거)

### P0-5 CONCURRENCY (PROPOSAL)

- `migrations/schedule_phase_2_p0_5_proposal_2026-10-07.sql` 작성 · production apply 금지
- **OPTION A** (추천) · DB atomic JSON path update (jsonb_set RPC) · 최소 변경 · 다른 path 간 lost update 즉시 해결
- **OPTION B** · Optimistic concurrency (revision/updated_at + If-Match) · 완전 방지 · UX 복잡
- **OPTION C** · Multi-key rows split · 설계 재정비 · migration 범위 최대 · STOP 리스트 명시
- 추천 순서: A → B → C
- STOP · production RPC/schema apply · all_settings → multi-key migration · bulk settings data rewrite

### FALLBACK

- 하드코드 wage runtime fallback (18개 중 BUSINESS fallback) 제거 완료
  - `defaultWageForPosition` runtime 호출 지점 3곳 (`useContractLoad` · `useContractActions` · `useWageAuto`) 전부 제거
  - `useSettings.ts` export 는 @deprecated 로 유지 (SettingsModal preset 전용 · 테스트 호환)
- DB fetch 실패 → localStorage 로 business 계산 지속 패턴 제거 (status=error flag 노출)
- `scheduleHelpers.ts` OFF 하드코드 Set 3개 · `isOffType` SSOT 로 교체
- `ScheduleCell` / `LunchPage` / `DayTimelineModal` / server `lunch.ts` 하드코드 OFF 전부 shared helper 로 교체
- `positionToCategoryV2` · UNMAPPED 분리 (매핑 실패 자동 흡수 제거 · observable warn)
- Presentation fallback (`SCHEDULE_COLORS` · `COLOR_PRESETS` · `DEFAULT_COLOR`) 는 유지 (허용 범위)

### VALIDATION

- `npx tsc --noEmit` → PASS (0 errors)
- `npm run build` → PASS (brotli + server bundle 생성 완료 · 사전 존재 import.meta cjs warning 외 정상)
- `npx vitest run` 관련 테스트 → PASS
  - Phase 2 신규/수정 테스트: 53 tests passed (wageResolver + useSettings + scheduleHelpers + DayTimelineModal/types)
  - Schedule/Lunch/DayTimeline/Hooks 범위 광역 run: 45 files · **530 tests passed**
- `node scripts/audit-framework.cjs --check-new` → **PASS** · 526 위반 (baseline 527) · 신규 증가 없음
- pre-commit hook 모두 통과 (skip 없음)

### GIT

- 다른 agent WIP 보존 ✓ (touch 금지 영역 전부 미변경):
  - `apps/sync-agent/**` 미변경
  - `server/routes/stock/**` 미변경
  - `server/routes/purchase/**` 미변경
  - `server/routes/vendor/**` 미변경
  - `src/components/{Display,Landing,Order,Reservation,Scan,Stock}Page/**` 미변경 (Reservation 은 변경 금지로 유지 · `useSettings.visitorReservation` 접근은 유지)
  - `src/shared/erp/**` 미변경
  - `scripts/vendor-*` 미변경
  - `supabase/migrations/2026-10-06_vendor_*` 미변경
- git stash 사용 없음 ✓
- `--no-verify` 사용 없음 ✓
- baseline 업데이트 없음 ✓
- CASCADE 작업 없음 ✓
- push 실행 없음 ✓
- 선택적 `git add` 로 Phase 2 파일만 스테이징 ✓

### 커밋 Hash List

| hash | subject |
|---|---|
| `719610a6` | fix(settings): require canonical DB settings for business logic |
| `984a5899` | fix(schedule): remove hardcoded wage fallbacks |
| `6f1d45bb` | fix(schedule): unify non-working schedule semantics |
| `5747cbaf` | fix(settings): enforce settings API authorization and correct table typo |
| `51321ab6` | docs(settings): P0-5 whole JSON lost update proposal |

### 최종 상태 선언

- PHASE 2 CODE COMPLETE = **YES** (P0-1 ~ P0-4 safe fix 전부 적용 · 53 신규/업데이트 테스트 통과)
- PHASE 2 PROPOSAL COMPLETE = **YES** (P0-5 proposal 작성 · migrations/schedule_phase_2_p0_5_proposal_2026-10-07.sql)
- Production apply 금지 범위: P0-5 proposal · taxonomy schema migration · scheduleTypes identity migration · bulk settings data rewrite · DB shape split · all_settings → multi-key migration (전부 STOP 리스트 명시)
- 다음 세션 작업 후보 (deferred):
  - D-5 · `jobCategories.ts` 중복 options source 제거 (UI 영향 커서 사용자 승인 필요)
  - D-6 · `MonthlySummary.unmappedCount` schema 분리
  - D-7 · audit log 테이블 신설 (`app_settings_history`)
  - D-8 · cross-tab BroadcastChannel propagation
  - P0-5 production apply (OPTION A → B → C 사용자 결정 후)

---

## 테스트 매트릭스 결과

| id | 시나리오 | 결과 |
|---|---|---|
| T-A | DB fetch 실패 (503 mock) | `status="error"`, `errorMessage` 설정 ✓ |
| T-B | wageRates 미등록 position | `wageConfigured=false`, laborCost=0 (UI 분기 가능) ✓ |
| T-C | position "대표" + wageRates 미등록 | `positionToCategoryV2 === "UNMAPPED"` + console.warn ✓ |
| T-D | 지정휴무 schedules row | `workDays`+0 · laborCost 계산 skip ✓ |
| T-E | 반차 workingHours 미설정 | labor 계산 skip (workingHours authority 유지) ✓ |
| T-F | 두 관리자 동시 저장 | 아직 lost update 가능 (P0-5 proposal 로 해결 예정) · 변경 없음 |
| T-G | wage 변경 후 refetch | 반영 OK (서버 매 요청 DB 조회) ✓ |
| T-H | override 는 ID 기반 identity | 유지 · wageResolver.test.ts 로 검증 ✓ |

---

## 파일 변경 요약

**신규 (3)**:
- `src/lib/wageResolver.ts` (73 lines) · wage SSOT
- `src/lib/wageResolver.test.ts` (97 lines) · 9 tests
- `src/components/SchedulePage/scheduleHelpers.test.ts` (155 lines) · 12 tests
- `migrations/schedule_phase_2_p0_5_proposal_2026-10-07.sql` (138 lines) · PROPOSAL

**수정 (9)**:
- `src/hooks/useSettings.ts` (+52/-5) · status flag · fetch result discriminated union · defaultWageForPosition deprecated
- `src/hooks/useSettings.test.ts` (+36/-0) · Phase 2 status 테스트 4건
- `src/components/ContractWriterPage/useContractLoad.ts` (+9/-4) · resolveEmployeeWage 사용
- `src/components/ContractWriterPage/useContractActions.ts` (+12/-9) · resolveEmployeeWage 사용
- `src/components/ContractWriterPage/useWageAuto.ts` (+19/-11) · resolveEmployeeWage 사용 · configured flag
- `src/components/SchedulePage/scheduleHelpers.ts` (+56/-15) · isOffType SSOT · positionToCategoryV2 · wageConfigured
- `src/components/SchedulePage/ScheduleCell.tsx` (+6/-3) · shared OFF/WORK types
- `src/components/LunchPage/LunchPage.tsx` (+8/-1) · isLunchSkipType helper
- `src/components/DayTimelineModal/types.ts` (+5/-1) · SKIP_TYPES shared
- `src/components/DayTimelineModal/types.test.ts` (+8/-4) · 결근 포함 검증
- `server/routes/daily/lunch.ts` (+6/-2) · isOffType SSOT
- `server/routes/payment/borrowings.ts` (+1/-1) · settings → app_settings 오타 fix
- `server/routes/settings/settings.ts` (+22/-2) · 민감 keys GET auth

**Line count**:
- 신규 파일: 463 라인
- 수정 파일: +240 / -58 변경량

---

### 끝.

PHASE 2 CODE COMPLETE = YES (P0-1 ~ P0-4) · PHASE 2 PROPOSAL COMPLETE = YES (P0-5)
NO push · NO baseline update · NO stash · NO --no-verify · NO WIP touch · NO CASCADE
