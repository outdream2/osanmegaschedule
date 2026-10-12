# Schedule 코드 데이터 흐름 + 연동 상세 리포트
# 2026-10-06

> Overview 는 `schedule-architecture-audit-2026-10-06.md` 참조.
> 이 문서는 **데이터 흐름의 각 단계** 와 **다른 feature 와의 연동 매핑** 중심.

---

## 1. 파일 트리 (Schedule 영역)

```
src/components/SchedulePage/
  SchedulePage.tsx          — 최상위 컨테이너 · state orchestration · modal 관리 (~800라인)
  ScheduleGrid.tsx          — 직원×날짜 테이블 render · 셀/행 이벤트 위임
  ScheduleCell.tsx          — 개별 셀 · popover 편집 · quick-cycle · useEditScheduleForm 의존
  ScheduleFilterBar.tsx     — position 탭 필터 + 검색창
  ScheduleToolbar.tsx       — 월 네비 + 편집모드/잠금/복사/합계 버튼
  EmployeeNameCell.tsx      — 이름 + 직군 표시 · 수정/삭제 액션 버튼
  SummaryRow.tsx            — 하단 일별 집계 행 (오픈/마감/직군별 카운트)
  SearchInsights.tsx        — 검색 결과 인사이트 배너
  UpcomingLeaveBanner.tsx   — 다가오는 연차 배너 (관리자 lv≥2 전용)
  AdminLoginModal.tsx       — 레거시 비밀번호 로그인 모달 (JWT 도입 전 잔재)
  CopyMonthModal.tsx        — 전월 복사 확인 모달 · 스케줄/일배정 선택
  scheduleHelpers.ts        — 순수 계산 함수 (buildDateList · getEmpMonthStats · 필터 · 정렬)
  useScheduleData.ts        — 모든 API fetch/mutate 훅 · employees/lock/copy state 소유
  useEditScheduleForm.ts    — 셀 편집 form state 훅 (ScheduleCell + EmployeeCalendarModal 공유)
  useDisplayZones.ts        — 물류 구역 배정 상태 · DB 읽기/쓰기 (구역 배정 페이지 연동)
  usePositionCategories.ts  — settings.wageRates 기반 동적 position 카테고리 파생
  usePopoverPosition.ts     — popover 뷰포트 위치 계산
  index.ts                  — re-export

src/components/DayTimelineModal/
  DayTimelineModal.tsx      — 날짜 클릭 타임라인 모달 · zone_day_assignments + employees 소비
  ZoneSection.tsx           — 구역 슬롯 drag UI
  WorkTimeSection.tsx       — 근무 시간 bar 표시
  HeaderBar.tsx             — 날짜 네비 + 확정 버튼
  WorkerChips.tsx           — 직원 이름 칩
  BreakTimeline.tsx         — 점심/휴게 타임라인
  useSlotHandlers.ts        — 슬롯 drag 6개 이벤트 핸들러 훅
  types.ts / utils.ts       — 타임라인 전용 타입·유틸

src/components/EmployeeCalendarModal/
  EmployeeCalendarModal.tsx — 직원 월별 스케줄 모달 · BulkTab/ZoneAssignTab/CalendarGrid/EmployeeInfoForm
  BulkTab.tsx               — 날짜 다중선택 일괄 스케줄 설정
  ZoneAssignTab.tsx         — 물류 직원 구역 배정 탭
  CalendarGrid.tsx          — 달력 UI (2026-09-23 공통 컴포넌트 분리)

src/components/ScheduleSettingsPage/
  ScheduleSettingsPage.tsx  — 기본 연차일수 직군별 설정 (관리자 lv≥9 전용)

server/routes/schedule/
  schedules.ts              — 스케줄·직원 CRUD 모든 라우터 (assertScheduleNotLocked 포함)

server/controllers/
  scheduleController.ts     — 라우터 핸들러 → 서비스 위임 클래스 (5개 메서드)

server/services/
  scheduleService.ts        — Supabase 직접 쿼리 서비스 클래스 (6개 메서드)

server/routes/daily/
  leave.ts                  — 연차 CRUD · 승인 시 scheduleService.batchUpdateSchedules 직접 호출

src/hooks/
  useSettings.ts            — app_settings DB → 클라이언트 AppSettings state (scheduleTypes, wageRates 포함)
  useUpcomingLeaves.ts      — GET /api/upcoming-leaves · schedules 테이블 기반 배너용 훅
  useLeaveManager.ts        — 직원별 연간 연차 이력 · GET /api/schedules × 12 calls
  useFetchEmployee.ts       — GET /api/employees/:id · 확장 HR 필드 공통 훅

src/shared/schemas/
  schedules.ts              — UpsertScheduleSchema · BatchScheduleSchema · CopyScheduleSchema (Zod)

src/types.ts                — Schedule · Employee · AuthSession 타입 정의
```

---

## 2. 데이터 흐름 (READ)

### 2-1. 월별 스케줄 fetch 체인

```
SchedulePage.tsx (line 400-405) useEffect [currentYear, currentMonth]
  → useScheduleData.fetchScheduleData(dateList)
    → buildDateList(year, month) → 전월/당월/익월 3개월 날짜 배열 (scheduleHelpers.ts:81)
    → 고유 YYYY-MM 추출 → Promise.all × 3개 API 호출
      → api.get("/api/schedules?year=Y&month=M") (useScheduleData.ts:68)
        → GET /api/schedules (schedules.ts:44 · Cache-Control: no-store)
          → scheduleController.getSchedules(req, res) (scheduleController.ts:10)
            → scheduleService.getMonthlySchedule(year, month) (scheduleService.ts:4)
              → supabase.from("employees").select("*").order("id")
              → supabase.from("schedules").select("*").like("date", "YYYY-MM-%")
              → in-memory JOIN: employees.map(emp => ({ ...emp, schedules: schedules.filter(s => s.employeeId === emp.id) }))
              → summaryList 계산 (오픈/마감 카운트만 · 서버 side)
              → return { employees: EmployeeWithSchedules[], summary: summaryList }
          → 200 JSON
    → 응답 병합: empMap (중복 employee 스케줄 merge) (useScheduleData.ts:72-85)
    → localStorage SK_EMPLOYEE_ORDER 기반 정렬 (useScheduleData.ts:88-103)
    → setEmployees(merged)
    → setYearLeaveStats via api.get("/api/leave-stats?year=Y") (useScheduleData.ts:114-116 · fire-and-forget)
```

**주의**: 서버 summary는 오픈/마감만 계산. 클라이언트 `getCalculatedSummary()` (scheduleHelpers.ts:160)가 SSOT — 직군별 세분화(약사/사원/창고/기타) 추가 계산.

### 2-2. 연차 통계 fetch (연도별)

```
useScheduleData.ts:114-116
  → api.get("/api/leave-stats?year=Y") · fire-and-forget (스케줄 fetch 완료 후)
    → GET /api/leave-stats (leave.ts:21)
      → supabase.from("schedules").select("employeeId").like("date","YYYY-%").eq("type","월차")
      → { empId: count } 반환 (LeaveStatsResponse)
    → setYearLeaveStats(res.data)
→ ScheduleGrid → EmployeeNameCell → 연차 카운트 배지 표시
```

**주의**: `yearLeaveStats`는 `useScheduleData`에서 소유하나 `SchedulePage`의 return 객체에 포함되어 있음. ScheduleGrid로 직접 전달되지 않고 EmployeeNameCell이 별도로 수신하는 구조.

### 2-3. 월 잠금 상태 fetch

```
SchedulePage.tsx (line 408) useEffect [currentYear, currentMonth, loadMonthLock]
  → useScheduleData.loadMonthLock() (useScheduleData.ts:331-336)
    → key = "schedule_lock_YYYY-MM"
    → api.get("/api/settings?key=schedule_lock_YYYY-MM")
      → GET /api/settings (settings.ts 파일)
        → supabase.from("app_settings").select().eq("key", key)
        → 200 { value: true|false|null }
    → setIsMonthLocked(res.data?.value === true)
```

### 2-4. 다가오는 연차 배너 fetch

```
SchedulePage.tsx (line 141) 조건: userLevel >= 2
  → useUpcomingLeaves(14, userLevel >= 2) (hooks/useUpcomingLeaves.ts:83)
    → api.get("/api/upcoming-leaves?days=14")
      → GET /api/upcoming-leaves (leave.ts:207 · authorize(2))
        → today ~ today+14 날짜 범위
        → supabase.from("schedules").select(...).in("type",["월차","오전반차","오후반차"]).gte("date",today).lte("date",toDate)
        → employees JOIN (supabase.from("employees").select("id,name").in("id", empIds))
        → { items: [{ employeeId, employeeName, date, type }] }
    → mergeConsecutive(items) → UpcomingLeaveBannerRow[]
    → setRows(merged)
  → SchedulePage.tsx (line 560) userLevel >= 2 && rows.length > 0
    → <UpcomingLeaveBanner rows={upcomingLeaveRows} />
```

### 2-5. 설정 fetch (shift types, wage rates, positions)

```
SchedulePage.tsx (line 64-71)
  → useSettings() (hooks/useSettings.ts:193)
    → useState(loadFromLocalStorage)  ← 초기값: localStorage "app_settings"
    → useEffect [] mount:
      → fetchAllSettings() → api.get("/api/settings?key=all_settings")
        → GET /api/settings (settings.ts)
          → supabase.from("app_settings").select().eq("key","all_settings")
          → { value: AppSettings JSON }
      → setSettings(dbSettings) · localStorage 업데이트
    → "settings-updated" CustomEvent 리스너 (같은 탭 다른 useSettings 인스턴스 동기화)
  → 반환: { positions, ranks, employmentTypes, workplaces, scheduleTypes, wageRates, employeeWageOverrides, ... }
```

**캐시 전략**: localStorage "app_settings" = 세션 간 캐시. DB 조회 성공 시 덮어씀. 두 단계 (즉시 localStorage + 비동기 DB override).

### 2-6. zone 배정 fetch (DayTimelineModal 열림 시)

```
DayTimelineModal.tsx 열림 (SchedulePage.tsx line 733: timelineDate 설정 시)
  → props: employees (SchedulePage가 이미 fetch한 데이터 재사용 · 별도 fetch 없음)
  → DayTimelineModal 내부 (DayTimelineModal.tsx)
    → api.get("/api/zone-day/YYYY-MM-DD")
      → GET /api/zone-day/:date (zoneAssignments.ts:~230)
        → supabase.from("zone_day_assignments").select("*").eq("date", date)
        → 없으면 { _empty: true, ...EMPTY_ROW }
      → zone_slots, lunch_slots, rest_slots, is_confirmed 수신
    → WorkTimeSection: employees prop 기반 근무 bar (schedules 직접 참조)
    → ZoneSection: zone_slots 기반 구역 슬롯
```

### 2-7. 직원 상세 fetch (EmployeeCalendarModal 다른 달 이동 시)

```
EmployeeCalendarModal.tsx (line 97-115) useEffect [year, month]
  → 조건: year !== initialYear || month !== initialMonth && not alreadyLoaded
    → api.get("/api/schedules?year=Y&month=M")
      → GET /api/schedules (동일 endpoint)
      → employees 배열에서 employee.id 매칭
      → setMonthSchedules(found.schedules)
  → 조건: year === initialYear && month === initialMonth
    → employee.schedules prop 재사용 (fetch 없음)
```

---

## 3. 데이터 흐름 (WRITE / MUTATION)

### 3-1. 셀 단건 수정 체인

```
ScheduleCell.tsx (line 62-79) popover onSave
  → useEditScheduleForm.handleSave()
    → onSave(formValues) 콜백 실행
  → ScheduleGrid props.onCellUpdate(data) 호출
  → SchedulePage.tsx onCellUpdate → useScheduleData.handleCellUpdate(data) (useScheduleData.ts:126)
    → undoStack push (이전 값 저장 · 최대 20개)
    → api.put("/api/schedules", { employeeId, date, type, workingHours, actualHours, memo })
      → PUT /api/schedules (schedules.ts:50 · authorize(5))
        → assertScheduleNotLocked(yearMonth, authLevel) (schedules.ts:26-42)
          → supabase.from("app_settings").select("value").eq("key","schedule_lock_YYYY-MM")
          → authLevel < 9 && value === true → HttpError(403, "SCHEDULE_LOCKED")
        → scheduleController.updateSchedule(req, res) (scheduleController.ts:32)
          → scheduleService.updateOrCreateSchedule(data) (scheduleService.ts:39)
            → supabase.from("schedules").upsert({...}).onConflict("employeeId,date").select().single()
            → 200 updated row
    → setEmployees optimistic update (schedules 배열 in-place 교체)
    → api.get("/api/schedules?year=Y&month=M") → setSummary 갱신 (서버 재조회)
    → showNotification("MM/DD 스케줄이 변경되었습니다.")
```

### 3-2. 일괄 저장 (BulkTab)

```
EmployeeCalendarModal.tsx BulkTab "저장" 클릭
  → onBulkSave prop (SchedulePage.tsx line 755-766)
    → api.post("/api/schedules/batch", { items: [...{ employeeId, date, type, workingHours, actualHours, memo }] })
      → POST /api/schedules/batch (schedules.ts:56 · authorize(5))
        → assertScheduleNotLocked(firstDate, authLevel)
        → scheduleController.batchUpdateSchedules(req, res) (scheduleController.ts:61)
          → scheduleService.batchUpdateSchedules(items) (scheduleService.ts:135)
            → supabase.from("schedules").upsert(rows, { onConflict:"employeeId,date" }).select()
            → { count: N }
    → showNotification("N일 일괄 스케줄 반영")
    → fetchScheduleData([...dateList, ...savedDates], true)  ← 서버 재조회
```

### 3-3. 전월 복사 체인

```
CopyMonthModal "확인" 클릭
  → SchedulePage.tsx executeCopyFromPreviousMonth(copySchedules, copyDayAssignments, dateList, closeModal)
    → 현재 월 스케줄 존재 여부 체크 (employees 로컬 state)
    → copyDayAssignments=true 이면: api.get("/api/zone-day/날짜") × N (현재 월 days)
    → 중복 데이터 있으면 useConfirm × 2중 확인
    → copySchedules=true:
      → api.post("/api/schedules/copy", { targetYear, targetMonth })
        → POST /api/schedules/copy (schedules.ts:63 · authorize(5))
          → scheduleController.copySchedules(req, res) (scheduleController.ts:80)
            → scheduleService.copySchedulesFromPreviousMonth(targetYear, targetMonth) (scheduleService.ts:66)
              → supabase.from("schedules").select("*").like("date","prevPrefix%")
              → 직원별 요일(dow)별 majority-vote 템플릿 구성
              → 대상 월 날짜 × 직원 조합으로 upsert rows 생성
              → supabase.from("schedules").upsert(rows, { onConflict:"employeeId,date" })
              → { count: N }
    → copyDayAssignments=true:
      → api.post("/api/zone-day/copy-month", { targetYear, targetMonth, overwrite })
        → POST /api/zone-day/copy-month (zoneAssignments.ts)
    → showNotification("복사 완료")
    → fetchScheduleData(dateList, true)
```

### 3-4. 월 잠금 토글 체인

```
ScheduleToolbar onToggleMonthLock 클릭
  → useScheduleData.handleToggleMonthLock() (useScheduleData.ts:338)
    → useConfirm 확인 다이얼로그 (확정 시 추가 경고)
    → key = "schedule_lock_YYYY-MM"
    → saveSetting(key, next) (lib/settingsApi.ts)
      → api.put("/api/settings", { key, value: true/false })
        → PUT /api/settings (settings.ts)
          → supabase.from("app_settings").upsert({ key, value }, { onConflict:"key" })
    → setIsMonthLocked(next)
    → showNotification("M월 스케줄이 확정/확정해제")
```

### 3-5. 연차 승인 → 스케줄 자동 반영 체인

```
LeavePage (또는 ApprovalRequestPage) 승인 버튼 클릭
  → api.put("/api/leave-requests/:id", { status:"approved", reviewer_note })
    → PUT /api/leave-requests/:id (leave.ts:110 · authorize(5))
      → supabase.from("leave_requests").update({ status, reviewer_note, reviewed_at }).eq("id", id)
      → status === "approved" 분기 (leave.ts:121):
        → scheduleType = 반차 유형이면 그대로, 아니면 "월차"
        → 날짜 배열 생성: start_date ~ end_date (compareYmd/nextKstYmd · KST off-by-one 방지)
        → scheduleService.batchUpdateSchedules(dates.map(date => ({
            employeeId: data.employee_id,
            date,
            type: scheduleType,
            workingHours: "",
            actualHours: "",
            memo: "연차 승인 (원본 leave_type)",
          })))  ← 라우터 미경유 · assertScheduleNotLocked() SKIP
          → supabase.from("schedules").upsert(rows, { onConflict:"employeeId,date" })
      → notificationsService.create({ employee_id, title:"연차 신청 승인", ... })
      → sendPushSafe({ userId, title, body, url }) (Expo 푸시)
      → webpush.sendNotification(emp.push_subscription, payload) (Web Push)
      → 관리자 전원에게 "연차 자동 반영" 인앱 알림
```

**CRITICAL**: `scheduleService.batchUpdateSchedules`를 라우터를 거치지 않고 직접 호출하므로 `assertScheduleNotLocked()`가 실행되지 않음. 잠긴 달에 연차를 승인해도 schedules에 write됨.

### 3-6. 연차 취소(관리자 삭제) → 스케줄 정리 체인

```
LeavePage 삭제 버튼 클릭 (관리자)
  → api.delete("/api/leave-requests/:id")
    → DELETE /api/leave-requests/:id (leave.ts:260 · authorize(5))
      → checkOwnershipOrAdmin 검증
      → leave_requests.delete()
      → wasApproved && isAdmin 분기 (leave.ts:275):
        → supabase.from("schedules").delete()
            .eq("employeeId", empId)
            .in("type", ["월차","오전반차","오후반차"])
            .gte("date", startDate).lte("date", endDate)
        → 실패 시 warn 로그만 (leave_requests 삭제는 이미 성공 · 부분 일관성)
```

### 3-7. 직원 등록/수정/삭제 체인

```
[등록] EmployeeFormModal "저장" 클릭
  → SchedulePage.handleAddEmployeeSubmit()
    → useScheduleData.handleAddEmployee(mode, selectedEmp, payload, zones, contractFile, applyZones, onSuccess)
      → createEmployee(payload) (lib/employeeApi.ts → api.post("/api/employees"))
        → POST /api/employees (schedules.ts:65 · authorize(9))
          → scheduleController.createEmployee → scheduleService.createEmployee
            → 사번 자동 생성 (MAX+1 · 3자리)
            → 핸드폰 중복 체크
            → 팀장 유일성 검증
            → supabase.from("employees").insert(data)
      → apiUploadContract(empId, file) (선택적)
      → applyZones(empId, name, position, zoneNums) → useDisplayZones.applyZones → DB 저장
      → fetchScheduleData(dateList, true)  ← 직원 목록 갱신

[수정] PUT /api/employees/:id (schedules.ts:75 · authorize(9))
  → scheduleController.updateEmployee → scheduleService.updateEmployee
    → 팀장 유일성 검증 (퇴직 처리 시 skip)
    → payload 구성 (undefined 필드 제외)
    → supabase.from("employees").update(payload).eq("id",id)
    → 컬럼 미존재 오류 시 해당 컬럼 제거 후 재시도 (최대 optionalKeys.length+2회)

[삭제] DELETE /api/employees/:id (schedules.ts:76 · authorize(9))
  → scheduleService.deleteEmployee
    → supabase.from("employees").delete().eq("id",id)
    → CASCADE 없음 — schedules 테이블 고아 레코드 잠재 가능성
```

### 3-8. zone 배정 저장 체인 (DayTimelineModal 확정)

```
DayTimelineModal HeaderBar "확정" 클릭
  → api.post("/api/zone-day/:date", { zone_slots, lunch_slots, rest_slots, ..., is_confirmed:true })
    → POST /api/zone-day/:date (zoneAssignments.ts:~260 · authorize(5))
      → supabase.from("zone_day_assignments").upsert({ date, ...payload }, { onConflict:"date" })
      → is_confirmed=true 이면:
        → notifyZoneAssignees(zone_slots, { title:"구역 배정 확정", ... })
          → supabase.from("employees").select("id,name,push_subscription").in("id",empIds)
          → notificationsService.create({ employee_id, title, body, type:"info" }) (인앱 알림)
          → webpush.sendNotification(push_subscription, payload) (Web Push · 만료 시 subscription null 처리)
```

### 3-9. 설정 저장 체인

```
SettingsModal onUpdate(partial) 호출
  → useSettings.update(partial) (hooks/useSettings.ts:221)
    → setSettings(prev => { ...prev, ...partial })
    → localStorage "app_settings" 즉시 업데이트
    → setTimeout(0): dispatchSettingsUpdated(next) → "settings-updated" CustomEvent
    → setTimeout(800): saveAllSettings(next)
      → saveSetting("all_settings", settings)
        → api.put("/api/settings", { key:"all_settings", value: AppSettings })
          → PUT /api/settings (settings.ts)
            → supabase.from("app_settings").upsert({ key, value }, { onConflict:"key" })
```

---

## 4. State / Hooks 관계

### useScheduleData 소유 state (useScheduleData.ts:43-51)

| state | 타입 | 설명 | 구동 UI |
|---|---|---|---|
| `employees` | `Employee[]` | 전체 직원 + 스케줄 배열 | ScheduleGrid 렌더링 SSOT |
| `summary` | `any[]` | 서버 계산 일별 요약 | 현재 미사용 (dead · setSummary만 호출) |
| `isLoading` | boolean | fetch 중 | ScheduleGrid Spinner |
| `error` | string\|null | fetch 오류 | ScheduleGrid 에러 배너 |
| `undoStack` | `UndoEntry[]` | Ctrl+Z 되돌리기 스택 (최대 20) | ScheduleToolbar undo 버튼 |
| `yearLeaveStats` | `Record<number,number>` | 연도별 월차 카운트 | EmployeeNameCell 배지 |
| `isMonthLocked` | boolean | 월 확정 상태 | ScheduleToolbar 잠금 표시 / assertScheduleNotLocked |
| `isLockLoading` | boolean | 잠금 토글 중 | ScheduleToolbar 버튼 disable |
| `isCopying` | boolean | 전월 복사 중 | ScheduleToolbar 복사 버튼 disable |

### SchedulePage 소유 local state (SchedulePage.tsx)

| state | 타입 | 설명 |
|---|---|---|
| `currentYear/Month` | number | 현재 표시 월 (월 네비 기준) |
| `isAdmin` | boolean | JWT level 기반 파생 · lv≥2이면 true |
| `editMode` | boolean | 셀 편집 모드 on/off |
| `positionTab` | string | 직군 필터 탭 |
| `searchQuery` | string | 이름 검색 |
| `sortBy/Order` | string | 정렬 기준 |
| `showSummary` | "hidden"\|"summary"\|"labor" | 합계행 표시 모드 |
| `timelineDate` | string\|null | DayTimelineModal 열기 날짜 |
| `calendarEmployee` | Employee\|null | EmployeeCalendarModal 대상 |
| `breakModal` | object\|null | BreakModal 상태 |
| `copyModal` | object | CopyMonthModal 상태 |
| `isEmpModalOpen/Mode/Form*` | multiple | EmployeeFormModal 상태 (15+개 state) |

### useSettings 소유 state (hooks/useSettings.ts:194)

| state | 타입 | 설명 | 구동 UI |
|---|---|---|---|
| `settings` | `AppSettings` | 전체 설정 SSOT | 전역 모든 컴포넌트 |
| → `scheduleTypes` | `ScheduleTypeEntry[]` | 근무 유형 + 시간 + 색상 | ScheduleCell 프리셋 / getTypeHoursMap |
| → `wageRates` | `Record<string,WageRate>` | 직군별 주중/주말 시급 | getEmpMonthStats 인건비 계산 |
| → `employeeWageOverrides` | `Record<number,WageRate>` | 직원별 시급 override | getEmpMonthStats |
| → `positions` | `string[]` | 직군 목록 | ScheduleFilterBar 탭 |
| → `defaultAnnualLeave` | object | 기본 연차일수 | ScheduleSettingsPage |

---

## 5. API 엔드포인트 전수

### Schedule 영역

| METHOD | PATH | authorize | 핸들러 | 서비스/DB |
|---|---|---|---|---|
| GET | /api/schedules | 없음 | scheduleController.getSchedules | employees SELECT * + schedules SELECT WHERE date LIKE |
| PUT | /api/schedules | lv≥5 | scheduleController.updateSchedule | schedules UPSERT onConflict(employeeId,date) |
| POST | /api/schedules/batch | lv≥5 | scheduleController.batchUpdateSchedules | schedules UPSERT rows[] |
| POST | /api/schedules/copy | lv≥5 | scheduleController.copySchedules | schedules SELECT prev + UPSERT target |
| GET | /api/employees | lv≥1 | inline (schedules.ts:82) | employees SELECT (경량 필드) |
| GET | /api/employees/next-number | 없음 | inline (schedules.ts:67) | employees SELECT employee_number |
| GET | /api/employees/:id | 본인\|lv≥7 | inline (schedules.ts:96) | employees SELECT * |
| POST | /api/employees | lv≥9 | scheduleController.createEmployee | employees INSERT |
| PUT | /api/employees/:id | lv≥9 | scheduleController.updateEmployee | employees UPDATE |
| DELETE | /api/employees/:id | lv≥9 | scheduleController.deleteEmployee | employees DELETE |
| POST | /api/employees/:id/contract | lv≥1+본인\|lv≥9 | inline (schedules.ts:135) | multer + employees UPDATE contract_file_url |
| POST | /api/employees/:id/resume | lv≥1+본인\|lv≥9 | inline (schedules.ts:164) | multer → Google Drive + employees UPDATE resume_url |
| DELETE | /api/employees/:id/resume | lv≥9 | inline (schedules.ts:194) | Drive DELETE + employees UPDATE |
| POST | /api/employees/:id/resignation-file | lv≥1+본인\|lv≥9 | inline (schedules.ts:223) | Supabase Storage\|로컬 + employees UPDATE |
| GET | /api/drive-status | 없음 | inline (schedules.ts:288) | googleDriveService.isDriveReady |

### 연동 API (schedule 과 상호작용)

| METHOD | PATH | authorize | Schedule 영향 |
|---|---|---|---|
| GET | /api/leave-stats?year= | 없음 | schedules.type="월차" COUNT → yearLeaveStats |
| GET | /api/leave-requests | 없음 | 간접 (연차 이력 조회) |
| POST | /api/leave-requests | lv≥1 | 없음 (pending 생성만) |
| PUT | /api/leave-requests/:id | lv≥5 | approved 시 scheduleService.batchUpdateSchedules 직접 호출 |
| DELETE | /api/leave-requests/:id | lv≥5 | approved+admin 시 schedules DELETE |
| GET | /api/upcoming-leaves?days= | lv≥2 | schedules 읽기 (연차 배너용) |
| GET | /api/leave-balance?employeeId= | 없음 | leave_requests approved 카운트 (schedules 미참조) |
| GET | /api/settings?key=schedule_lock_* | 없음 | app_settings → lock 상태 |
| PUT | /api/settings | 없음 | app_settings → lock 상태 저장 / 설정 변경 |
| GET | /api/zone-day/:date | 없음 | zone_day_assignments 읽기 (타임라인용) |
| POST | /api/zone-day/:date | lv≥5 | zone_day_assignments 저장 + 확정 알림 |
| POST | /api/zone-day/copy-month | lv≥5 | zone_day_assignments 전월 복사 |
| GET | /api/auth/set-password | lv≥1 | 없음 (비밀번호 설정) |

---

## 6. 연동 매핑 (feature × schedule)

### 6-1. 직원관리 ↔ Schedule

**공유 데이터**: `employees` 테이블 단일 SSOT

- **API 공유**: GET /api/employees (양쪽 동일 endpoint)
- **분리**: StaffManagePage는 `GET /api/employees` (경량) → `GET /api/employees/:id` (확장 HR) 2-단계 패턴. SchedulePage는 `GET /api/schedules` 에서 `employees SELECT *` 포함 1회 조회.
- **중복 employee 폼**: EmployeeFormModal (SchedulePage 내 · 빠른 접근) vs CreateModal (StaffManagePage · 전체 필드). `updateEmployee` API는 schedules.ts:75 단일 endpoint 공유.
- **교차 네비게이션**: SchedulePage `onEditEmployeeAtStaffManage` prop (SchedulePage.tsx:44) → EmployeeCalendarModal "직원정보 편집" 클릭 시 StaffManagePage로 `initialSelectedId` 와 함께 이동.
- **cascade 삭제**: DELETE /api/employees/:id → scheduleService.deleteEmployee → employees DELETE. schedules 테이블에 ON DELETE CASCADE 없음 → 고아 schedule row 잠재.

### 6-2. 연차 ↔ Schedule

- **승인 트리거 자동 upsert**: `leave.ts:133-149` → `scheduleService.batchUpdateSchedules` 직접 호출 → `schedules` UPSERT. `assertScheduleNotLocked()` 라우터 미경유 → **lock 우회**.
- **취소 정리**: `leave.ts:275-288` → 관리자 삭제 시 schedules DELETE (월차/반차 type 한정 · 날짜 범위).
- **SSOT 이중화**: leave_requests (신청 이력/상태/잔여 계산 SSOT) + schedules (표시용 복사본). 두 테이블이 같은 데이터를 중복 보유 — 연차 거부 후 수동 스케줄 수정 시 불일치 가능.
- **배너**: useUpcomingLeaves → schedules 직접 조회 (leave_requests 미참조).
- **연차 이력 조회** (useLeaveManager): `GET /api/schedules × 12` (1월~12월 전부) → `type IN (월차, 오전반차, 오후반차)` 로 로컬 필터. leave_requests 미사용 — schedules가 "표시 SSOT" 역할.

### 6-3. 근로계약 ↔ Schedule

- **직접 연결 없음**: employee_contracts와 schedules는 FK 없음.
- **간접 공유**: StaffDetailPanel에서 `useFetchEmployee(id)` + `GET /api/employee-contracts?employeeId=` 동시 fetch → UI 함께 표시.
- **계약 수 배지**: StaffManagePage에서 `GET /api/employee-contracts` → contractCountByEmp Map → 리스트 배지. SchedulePage에는 표시 없음.
- **연결 시나리오**: ContractWriterPage는 `employees.hireDate`, `employees.wage_*` 필드 사용 → schedule과 동일 employees 테이블 접근이지만 schedule 데이터 자체는 미사용.

### 6-4. 급여/인건비 ↔ Schedule

**계산 위치**: 순수 클라이언트 사이드 (`scheduleHelpers.ts:128-158`). 서버 재계산 없음.

**계산 흐름**:
```
getEmpMonthStats(emp, monthKey, scheduleTypes, wageRates, employeeWageOverrides)
  → emp.schedules.filter(s => s.date.startsWith(monthKey))
  → 각 s: type not in OFF_TYPES_SET ("휴무","월차","결근")
    → rawHours = parseWorkingHours(s.workingHours)  ← "HH:MM-HH:MM" 파싱
      또는 shiftHourFallback[s.type]  ← settings.scheduleTypes 기반 기본값
    → paidHours = rawHours - breakHours (emp.break_time_minutes / 60)
    → laborCost += paidHours × (isWeekend ? empRate.weekend : empRate.weekday)
      · empRate = employeeWageOverrides[emp.id] ?? wageRates[emp.position]
  → return { workDays, totalHours, laborCost }
```

**입력**: employees.schedules (type, workingHours), employees.break_time_minutes, employees.break_apply_paid, useSettings().wageRates, useSettings().employeeWageOverrides

**하드코딩 위험**: `OFF_TYPES_SET = new Set(["휴무","월차","결근"])` (scheduleHelpers.ts:126) — 신규 근무 유형 추가 시 이 Set 수동 업데이트 필요.

**표시**: ScheduleGrid → EmployeeNameCell에 `getEmpMonthStats` 결과 전달. showSummary="labor" 시 SummaryRow에도 표시.

### 6-5. 구역 배정 (zone_day_assignments) ↔ Schedule

- **결합 지점**: DayTimelineModal에서 두 데이터 소비.
  - `employees` prop (SchedulePage fetch 재사용) → 근무 bar 소스 (schedules 포함)
  - `GET /api/zone-day/:date` → zone_slots, lunch_slots, rest_slots 소스
  - DB 수준 결합 없음 · UI 수준 결합만.
- **확정 scope 차이**: schedule lock = 월 단위 (schedule_lock_YYYY-MM key). zone_day_assignments.is_confirmed = 일 단위.
- **복사 연동**: `executeCopyFromPreviousMonth`에서 `POST /api/schedules/copy` + `POST /api/zone-day/copy-month` 함께 실행 (useScheduleData.ts:406-415). 두 복사가 하나의 CopyMonthModal에서 동시에 처리.
- **useDisplayZones**: SchedulePage 마운트 시 fetchZonesFromDB → DisplayZoneSlim[] 로드. 물류 직원 EmployeeFormModal에서 구역 배정 가능.

### 6-6. 설정 (app_settings) ↔ Schedule

- **단일 키**: `all_settings` jsonb 1행에 AppSettings 전체 저장.
- **schedule 관련 설정**:
  - `scheduleTypes`: 근무 유형 목록 + 시간 + 색상 → ScheduleCell 프리셋 / getTypeHoursMap
  - `wageRates`: 직군별 시급 → getEmpMonthStats
  - `employeeWageOverrides`: 직원별 시급 override → getEmpMonthStats
  - `defaultAnnualLeave`: ScheduleSettingsPage에서 편집
- **변경 즉시 반영**: useSettings.update() → localStorage → "settings-updated" event → 같은 탭 모든 useSettings 인스턴스 동기화 → 인건비 집계 즉시 재계산 (React memo 없음).
- **별도 schedule lock 키**: `schedule_lock_YYYY-MM` → 별개 row (all_settings와 분리).

### 6-7. 알림/푸시 ↔ Schedule

schedule 변경이 직접 알림을 생성하는 경로 **없음**. 알림은 연차/구역 확정 경로에서만 발생.

| 트리거 | 알림 종류 | 수신자 | 경로 |
|---|---|---|---|
| 연차 신청 POST | 인앱+Web Push | 관리자 전원(lv≥9) | leave.ts:101-106 notificationsService.notifyAllAdmins |
| 연차 승인/반려 PUT | 인앱+Web Push+Expo Push | 신청 직원 | leave.ts:155-182 |
| 연차 승인 후 | 인앱 | 관리자 전원(신청자 제외) | leave.ts:184-199 |
| zone 확정 저장 | 인앱+Web Push | 배정된 직원들 | zoneAssignments.ts notifyZoneAssignees |
| schedule CRUD | **없음** | — | scheduleService에 createNotification 없음 |

**Expo Push (iOS)**: `sendPushSafe` (server/services/expoPushService.ts) — 연차 승인/반려 시만 호출 (leave.ts:165). schedule 직접 변경 시 미호출.

**Web Push 구독**: `employees.push_subscription` jsonb 컬럼. 만료(statusCode=410) 시 null 처리.

### 6-8. 권한 ↔ Schedule

| level | schedule 접근 권한 |
|---|---|
| 0 (미로그인) | AdminLoginModal 표시 (레거시 비밀번호) · JWT 없음 |
| 1 (직원) | GET /api/schedules 조회 가능 · 본인 행만 표시 (isEmployeeMode) · PUT/POST 불가 |
| 2-4 (매니저 경량) | GET 전체 + 읽기 · 편집 모드 접근 가능 · 직원 CRUD 불가 |
| 5+ (매니저) | PUT/POST /api/schedules 가능 · assertScheduleNotLocked 적용 |
| 7+ | GET /api/employees/:id 전체 필드 접근 |
| 9 (최고관리자) | assertScheduleNotLocked bypass · 직원 CRUD (POST/PUT/DELETE /api/employees) |

**FE 분기**:
- `isAdmin = level >= 2` → 편집 모드 버튼, 잠금 토글, 직원 CRUD 표시 (SchedulePage.tsx:54-57, 126-136)
- `isSuperAdmin = level >= 9` → 직원 삭제 버튼 활성
- `isEmployeeMode = level === 1` → ScheduleGrid에서 본인 행만 상세 표시

**서버 검증**:
- `authorize(N)` middleware → JWT authUser.level < N 이면 403
- `assertScheduleNotLocked()` → DB 직접 검증 (DevTools 우회 차단 · 2026-09-23 추가)

**RLS**: Supabase 클라이언트가 서버에서 service role key 사용 → RLS 미적용. 권한 검증은 서버 middleware 100% 책임.

### 6-9. 공지 / Approval ↔ Schedule

- schedule 확정(lock)이 공지를 생성하는 코드 **없음**. lock은 app_settings key 값 변경만.
- 연차 승인이 공지 생성 → leave.ts 참조 (위 6-7 표 참조).
- 알림 배너 (UpcomingLeaveBanner): schedules 테이블 직접 읽기. notifications 테이블 미사용.

### 6-10. 홈 (LandingPage) ↔ Schedule

**직접 schedule fetch 없음**.

- LandingPage는 `/api/requests/pending-counts` 1개 API로 승인 대기 카운트만 수신.
  - leavePendingCount = leave_requests.status="pending" 카운트
  - requestsCounts.* = 진열/발주/점심/재고/반품/사직서/거래처 카운트
  - schedule 데이터 자체는 미fetch.
- TodayStatusPanel: 연차 승인 대기 건수 배지 표시 → 클릭 시 business-manage 페이지로 이동.
- TodayRevenueKpiPanel: ERP Sales 데이터 fetch (schedule 무관).
- "스케줄표 조회" MenuCard: 클릭 시 page="schedule" 이동만 (handleMenuClick). schedule 데이터 prefetch 없음.

---

## 7. 캐시 / 메모 전략

### useScheduleData 캐시

- **캐시 없음**: 매 `fetchScheduleData` 호출마다 API 재조회.
- `employees` state = 최종 merge 결과 in-memory 보유.
- `yearLeaveStats` = 월 이동 시마다 재조회 (fire-and-forget).
- loadedKey 같은 중복 방지 메커니즘 **없음** — 같은 달을 다시 fetch하면 전체 재호출.
- `Cache-Control: no-store` 헤더 (schedules.ts:45) — HTTP 캐시 방지.

### useSettings 캐시

- **2-tier**: localStorage "app_settings" (세션 간 영속) + React state (렌더 간 동기).
- DB 조회 완료 전: localStorage 값으로 즉시 렌더.
- 저장: debounce 800ms 후 DB upsert.
- **CustomEvent 동기화**: 같은 탭 내 다른 useSettings 인스턴스 → "settings-updated" 이벤트로 동기화. 다른 탭/창은 미동기화.

### React-Query 사용

- **사용 안 함** — 전체 schedule 도메인 직접 fetch + useState 패턴.
- useFetchEmployee만 cancel-safe (requestSeqRef 패턴 · useCallback으로 구현).

### EmployeeCalendarModal 캐시

- 초기 달: parent props.employee.schedules 재사용 (fetch 없음).
- 다른 달 이동: `alreadyLoaded` 체크 (employee.schedules에 해당 달 날짜 존재 여부). 있으면 filter, 없으면 fetch.

---

## 8. 비정상 경로 / Edge Case

### 8-1. schedule.employeeId 가 존재하지 않는 employees에 없을 때 (orphan)

- 서버: `scheduleService.getMonthlySchedule`이 employees.map 기반으로 JOIN → orphan schedules 무시됨.
- FE: employees 없으면 표시 안 됨 · 자동 정리 없음.
- 직원 삭제 시 schedules가 CASCADE 없이 남는 것이 원인.

### 8-2. schedule.date 가 YYYY-MM 외 형식

- `scheduleService.getMonthlySchedule`: `.like("date","YYYY-MM-%")` 조건으로 자동 필터.
- `buildDateList`: 항상 정확한 YYYY-MM-DD 생성 → 생성 시 이상 없음.
- `UpsertScheduleSchema`: `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` 서버 검증.

### 8-3. employee.position 이 settings.positions 에 없을 때

- `getEmpMonthStats`: `settingsWageRates[emp.position]` → undefined → empRate = null → laborCost = 0. 비용 계산 누락.
- `positionToCategory`: 매핑 없으면 "기타" 반환 → "기타" 탭에 표시.
- `getTypeHoursMap`: isPharm/isLogistics/isPartTime 분기 → 해당 없으면 `entry.hours` (기본값) 사용.

### 8-4. lock=true 상태에서 lv<9 사용자가 PUT 호출

- `assertScheduleNotLocked(yearMonth, authLevel)` → DB 직접 조회 → `HttpError(403, "확정된 달은 수정할 수 없습니다.", "SCHEDULE_LOCKED")`.
- FE: `handleCellUpdate`에서 catch → `showNotification("스케줄 정보 저장에 실패했습니다.", "error")`. 락 이유 별도 표시 없음.

### 8-5. 연차 승인 중 schedule upsert 실패

- `leave.ts:133-149`: try/catch 명시. 실패 시 `HttpError(500, "연차는 승인되었으나 스케쥴 반영 실패: ...")`.
- leave_requests는 approved 상태로 저장됨 → 부분 불일치 (leave_requests=approved / schedules=미반영).
- rollback 없음 — 재처리 메커니즘 없음.

### 8-6. EmployeeCalendarModal 다른 달 이동 중 modal 닫기

- `useEffect [year, month]` (EmployeeCalendarModal.tsx:97): `api.get(...)` 호출 → 응답 전 닫으면 컴포넌트 unmount → setState 실행 시 React 경고 (메모리 누수).
- 현재 cancel-safe 처리 없음 (useFetchEmployee처럼 requestSeqRef 미사용).

### 8-7. scheduleService.getMonthlySchedule employees SELECT *

- 직원 수 × 컬럼 수 과다 SELECT. 스케줄 조회 시 임금/보험/경력 등 HR 전체 필드 포함.
- 직원 30명 기준 모든 HR jsonb 컬럼 포함 → 페이로드 과다.

---

## 9. 통계 요약

| 항목 | 수치 |
|---|---|
| Schedule 영역 파일 수 | 20개 (SchedulePage 디렉토리) + 2개 (DayTimeline, EmployeeCalendarModal) + 관련 hooks 4개 = 약 30개 파일 |
| schedule 관련 서버 파일 수 | routes/schedule/schedules.ts, controllers/scheduleController.ts, services/scheduleService.ts, routes/daily/leave.ts (일부) = 4개 |
| API 엔드포인트 수 | schedule 직접 15개 + 연동 13개 = 28개 |
| Supabase 테이블 수 | 7개 (employees, schedules, leave_requests, app_settings, zone_day_assignments, zone_dow_templates, employee_contracts) |
| Hook 수 | useScheduleData, useSettings, useUpcomingLeaves, useLeaveManager, useFetchEmployee, useDisplayZones, useEditScheduleForm, usePositionCategories, usePopoverPosition = 9개 |
| Dead state 추정 | `summary` (setSummary 호출되나 SchedulePage return 에 없음 · useScheduleData.ts:44) |
| Dead prop 추정 | DayTimelineModal.onUpdateSchedule (line 51 주석 "완전 dead") |

---

## 10. 핵심 관찰 (TL;DR)

1. **연차 승인이 schedule lock을 우회한다**: `leave.ts`에서 `scheduleService.batchUpdateSchedules`를 직접 호출하므로 `assertScheduleNotLocked()` 라우터 미통과. 확정된 달에 연차를 승인하면 schedules가 덮어써진다.

2. **schedule 데이터와 leave_requests 데이터가 이중화됨**: 연차 승인 시 schedules에 복사본 저장 → useLeaveManager는 schedules를 12개월 전부 scan해서 연차 이력 파악. leave_requests가 따로 있음에도 schedules를 SSOT처럼 사용하는 훅이 혼재.

3. **직원 삭제 시 schedules 고아 레코드 발생**: `scheduleService.deleteEmployee`가 `employees DELETE` 만 실행. schedules 테이블에 ON DELETE CASCADE 없음 → employeeId FK를 가진 스케줄 행이 삭제되지 않고 남음.

4. **getMonthlySchedule이 employees SELECT * 를 매번 실행**: 스케줄 조회마다 직원 전원의 HR 전체 필드(임금/보험/경력 jsonb 포함) SELECT. 직원 규모가 커지면 페이로드 과다.

5. **settings.wageRates 미등록 직군의 인건비가 0으로 계산**: `getEmpMonthStats`에서 `wageRates[emp.position]`가 undefined면 laborCost 합산이 전혀 안 됨. 신규 직군 추가 후 wageRates 미등록 시 합산 누락.

6. **EmployeeCalendarModal 타 달 이동 fetch cancel-safe 미처리**: 달 이동 중 모달 닫으면 unmount 후 setState 시도 → React 경고.

7. **캐시 없는 date-list 기반 3개월 다중 fetch**: `buildDateList`가 항상 전월/당월/익월 3개월 날짜를 생성 → 매 월 이동마다 `GET /api/schedules` 3회 호출. 중복 방지 로직 없음.

---

END OF REPORT
