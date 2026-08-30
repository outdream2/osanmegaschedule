# 테스트 · 버그 헌트 리포트 · 2026-08-30

> 실행: 로컬 · Windows PowerShell · Node debugger 부착 (Windows 환경) · 결과는 stderr/stdout 필터링 후 수집
> 목적: 조사·리포트만 · 코드 수정 X

---

## 1. TypeScript 컴파일 (`npx tsc --noEmit`)

- **결과: 클린 · exit 0**
- 오류 0건 · warning 0건
- `tsconfig` strict mode 유지 상태에서 · 컴파일 이슈 없음

---

## 2. Vitest 전체 실행 (`npm test -- --run`)

| 지표 | 값 |
|---|---:|
| 파일 총 | 232 |
| 파일 통과 | 229 |
| 파일 실패 | 3 |
| 테스트 총 | 3382 |
| 테스트 통과 | 3374 |
| 테스트 실패 | **8** |
| Unhandled Errors | 10 (모두 pipeline.e2e 관련) |
| Duration | 61.33s (import 365.89s · env 669.05s) |

### 실패 파일 · 실패 테스트 상세

#### FAIL-1 · `src/components/common/BottomSheet.test.tsx` (1 실패)
| # | 테스트 | 라인 | 이유 |
|---:|---|---:|---|
| 1 | `이벤트 > open=false · body scroll 복원` | 126 | `document.body.style.overflow` 가 여전히 `hidden` (기대: `auto`) |

- **원인: 코드 vs 테스트 · 코드 변경 (BottomSheet.tsx L119-126 · 2026-08-29 #171 P2 fix)**
- `setTimeout(..., 260)` 로 cleanup 을 지연 (iOS Safari momentum scroll 버그 방지 목적)
- 테스트는 `act()` 로 sync 즉시 검증 → 260ms 미대기 · 실패
- **어느 쪽 문제**: 테스트가 sync 검증 · 코드는 의도적으로 async 지연 → **테스트 미갱신 (회귀 아님 · 코드 개선의 부산물)**

#### FAIL-2 · `src/components/common/SplitRightHeader.test.tsx` (1 실패)
| # | 테스트 | 라인 | 이유 |
|---:|---|---:|---|
| 1 | `v9 gradient accent > topAccent=true · gradient span 렌더` | 41 | `container.querySelector("span[aria-hidden]")` = null |

- **원인: 코드 리팩터 (SplitRightHeader.tsx L65 · 2026-08-29 P0)**
- 이전: inline `<span aria-hidden ...>` · 이후: `<GradientAccent />` 프리미티브 교체
- `GradientAccent.tsx` (L54) 는 `aria-hidden` 속성 미지정 (프리미티브 신설 시 누락)
- **어느 쪽 문제**: **코드 문제 (a11y 누락)** · 프리미티브 GradientAccent 에 `aria-hidden` 추가 필요 (span 은 시각 장식만이므로 스크린리더 제외 필수)

#### FAIL-3 · `src/components/layout/BottomNav.test.tsx` (6 실패)
| # | 테스트 | 라인 | 이유 |
|---:|---|---:|---|
| 1 | `5탭 렌더 > 홈·스케줄·요청·이슈·더보기` | 21 | `"요청"` 텍스트 없음 (실제: `홈·스케줄·이슈·더보기`만 · 4탭) |
| 2 | `onNavigate > 요청 탭 클릭` | 52 | 요청 버튼 자체가 없어 `btn` = undefined · `fireEvent.click(undefined)` |
| 3 | `더보기 sheet > 더보기 클릭 · sheet 열림` | 70 | 시트에 `"상품스캔"` 미노출 |
| 4 | `더보기 sheet > manager · 매장관리·연차승인 노출` | 89 | `"매장관리"` 미노출 (실제: `매장·상품·매장진열·경영·직원관리` 등 서브탭 라벨) |
| 5 | `더보기 sheet > admin(lv9) · 권한관리 노출` | 100 | `"권한관리"` 미노출 (실제: `메뉴 설정` 로 라벨 변경) |
| 6 | `더보기 sheet > sheet 안 tile 클릭 · 점심불참` | 150 | 첫 매칭 버튼이 `"승인요청"` (group header) · 실제 `점심불참` 타일 대신 그룹 헤더가 먼저 매칭 |

- **원인: 코드 대규모 리팩터 (2026-08-29 #196 Phase 2 · SIDE_NAV_GROUPS 자동 파생)**
- BottomNav 는 이제 `SIDE_NAV_GROUPS` 를 파생 · 하단 4탭 = `["landing","schedule","requests","board"]` 를 `DERIVED_TOP_TABS` 에서 찾음
- 그러나 SIDE_NAV_GROUPS 에 `topTab.key: "requests"` 인 그룹이 **없음** (Chat 아이콘 "요청목록" 은 `business` 그룹 내부 item 일 뿐) → **filter 결과에서 사라져 · 실제로는 하단이 3탭 + 더보기 (4개)** 만 렌더
- 라벨도 변경됨: `상품스캔` → `상품` · `매장관리` → `매장`/`상품` · `권한관리` → `메뉴 설정` · `연차승인` → `연차신청` · `점심불참` → 여전히 있으나 sheet 그룹 헤더 `승인요청` 이 button 안이라 클릭 매칭이 그룹 헤더에 먼저 걸림
- **어느 쪽 문제**:
  - `요청` 하단 탭 누락은 **코드 문제** (BOTTOM_TAB_KEYS 에 있는 "requests" 가 DERIVED_TOP_TABS 파생에 없어 잃어버림 · #196 리팩터 회귀)
  - 라벨 변경은 **테스트 미갱신** (사용자 지시로 라벨 변경 · 테스트가 옛 문자열 그대로)
  - sheet tile 클릭 매칭 오류는 **테스트 오류** (button-in-button 구조로 리팩터되어 · 더 구체적 selector 필요)

### Unhandled Errors (10건 · 모두 `server/ocr/pipeline/__tests__/pipeline.e2e.test.ts`)

- **원인**: `server/productCache.ts:168` · `supabase.from("products")` 호출에서 `supabase = null`
- pipeline stage 05-normalize → `getProductMap()` → `supabase` 클라이언트 미초기화 (test 환경 · env 미로드)
- fixture-based E2E 는 통과하지만 · 백그라운드에서 promise reject 발생 · 테스트 결과에는 영향 X (통과 판정)
- **테스트가 통과했지만 잠재 위험**: 실제 프로덕션에서 `supabase` null 인 경우 pipeline 크래시 · **null-guard 필요**

---

## 3. Framework Audit (`node scripts/audit-framework.cjs`)

| 지표 | 값 |
|---|---:|
| 스캔 파일 | 755 |
| 위반 파일 | **1** |
| 총 위반 개수 | **1** |

### 위반 상세

| 파일 | 라인 | 규칙 | severity | 수정 방향 |
|---|---:|---|---|---|
| `src/components/BarcodeScanner/BarcodeScanner.tsx` | 593 | `raw-alert` | high | `useToast (showError/showSuccess)` 로 교체 |

- audit-framework 는 대원칙 위반 1건만 잔존 · 전체 754/755 클린 (100% 근접)

---

## 4. 실패 테스트 · 회귀 vs 사전 실패

| # | 테스트 | 오늘 변경? | 회귀? | 사전 실패? | 카테고리 |
|---:|---|---|---|---|---|
| 1 | BottomSheet body scroll | Y (2026-08-29 #171 P2) | 코드 개선 부산물 (의도됨) | N | 테스트 미갱신 |
| 2 | SplitRightHeader gradient | Y (2026-08-29 P0 GradientAccent 이관) | **Yes · a11y 회귀** | N | 코드 (aria-hidden 누락) |
| 3 | BottomNav 요청탭 | Y (2026-08-29 #196 Phase 2) | **Yes · 요청 탭 소실 회귀** | N | 코드 (BOTTOM_TAB_KEYS 매칭 실패) |
| 4-8 | BottomNav 라벨/구조 5건 | Y (2026-08-29 #193/#196) | 사용자 지시 라벨 변경 · 부분 회귀 | N | 혼합 (테스트 라벨 미갱신 + button-in-button selector 문제) |

**요약**:
- 사전 실패: 0건
- **오늘 도입된 회귀 (즉시 fix 필요)**: 2건
  1. BottomNav 하단 "요청" 탭 완전 소실 → 모바일 사용자 승인요청 화면 접근 불가 (더보기 시트를 통해서만 · 사용자 flow 손상)
  2. GradientAccent 프리미티브 `aria-hidden` 누락 → 스크린리더에 장식 span 노출 (WCAG 위반)
- 나머지 6건: 테스트 문자열/구조 미갱신 (기능 자체는 사용자 지시대로 변경됨)

---

## 5. 버그 후보 · 코드 검색 결과

### 5.1 `@ts-ignore` · `@ts-nocheck` · `@ts-expect-error`
- **결과: 0건** · 클린 · 강조할 만 함

### 5.2 `TODO` · `FIXME` · `HACK` · `XXX` 주석
- `src/components/EmployeeCalendarModal/ZoneAssignTab.tsx:3` · `TODO Phase 2 · zone defs 서버 저장` → **이미 완료** (오늘 zone_defs 마이그레이션 완료 · 주석만 남음 · 청소 필요)
- 나머지 매칭: 대부분 문자열 리터럴 (`"X,XXX원"` 포맷 예시) · 실제 TODO 아님

### 5.3 `console.error` · `console.warn` (임시·잊혀진 것 후보)
- 총 71건 · 41개 파일 · 대부분 정당한 error 로깅 (`useToast` 붙어 있음)
- **주의할 곳**:
  - `src/App.tsx:3` · `src/main.tsx:1` · 부트스트랩 · 정상
  - `src/hooks/usePushSubscription.ts:3` · push subscribe 실패 로깅 · 정상
  - `src/hooks/useSettings.ts:1` · settings load 실패 · 정상
  - `src/components/OcrPage/OcrPage.tsx:110` · `.catch(console.error)` · **catch 만 로깅 · UX toast 없음 · 개선 여지**

---

## 6. TOP 10 버그 후보 · 즉시 fix 필요

| 순위 | 위치 | 카테고리 | 심각도 | 설명 |
|---:|---|---|---|---|
| 1 | `src/components/layout/BottomNav.tsx:36` (BOTTOM_TAB_KEYS) | **회귀** | 🔴 Critical | 하단 "요청" 탭 소실 · 모바일 승인요청 접근 손상 (BOTTOM_TAB_KEYS 의 "requests" 를 DERIVED_TOP_TABS 에서 못 찾음 · SIDE_NAV_GROUPS 에 topTab.key="requests" 그룹 없음) |
| 2 | `server/productCache.ts:168` | **잠재 크래시** | 🔴 Critical | `supabase` null 시 unhandled rejection · null-guard 부재 (test 10 errors · 프로덕션 리스크) |
| 3 | `src/components/common/GradientAccent.tsx:54` | **a11y 회귀** | 🟠 High | `aria-hidden` 속성 누락 · 시각 장식 span 이 스크린리더에 노출 (SplitRightHeader 이관 시 소실) |
| 4 | `src/components/BarcodeScanner/BarcodeScanner.tsx:593` | 프레임워크 위반 | 🟠 High | raw-alert 잔존 (audit 유일 위반) · useToast 로 교체 |
| 5 | `src/components/common/BottomSheet.tsx:119-126` | 테스트 커버리지 손실 | 🟡 Medium | 260ms setTimeout cleanup · 테스트 sync 검증 실패 · 통합 시나리오 확인 필요 (iOS 실기기 검증) |
| 6 | `src/components/layout/BottomNav.test.tsx` (6건) | 테스트 미갱신 | 🟡 Medium | 라벨 변경 (권한관리→메뉴 설정 등) · sheet button-in-button selector · 테스트 갱신 필요 |
| 7 | `src/components/common/SplitRightHeader.test.tsx:40` | 테스트 selector | 🟢 Low | `span[aria-hidden]` selector · 프리미티브 aria-hidden 픽스 후 자동 통과 (#3 fix 로 해결) |
| 8 | `src/components/EmployeeCalendarModal/ZoneAssignTab.tsx:3` | 잊혀진 TODO | 🟢 Low | zone_defs 서버 저장 완료 후 · TODO 주석 잔존 · 청소 |
| 9 | `src/components/OcrPage/OcrPage.tsx:110` | UX 개선 | 🟢 Low | `.catch(console.error)` 만 · 사용자 toast 없음 |
| 10 | `src/hooks/useScheduleData.ts` (9건 console.error) | UX 개선 | 🟢 Low | 다수 catch 에 useToast 병행 여부 확인 (일부만 안내되면 · 사용자 혼란) |

---

## 7. 세션 재개 시 우선순위

1. **#1 BottomNav 요청탭 소실** · 회귀 · 사용자 flow 손상 · **최우선**
   - fix 방향 A: `approvals` 그룹의 `topTab.key` 를 `"requests"` 로 변경 (라우팅 확인 필요)
   - fix 방향 B: `BOTTOM_TAB_KEYS = ["landing","schedule","approval-request","board"]` 로 교체
2. **#2 productCache null-guard** · 잠재 크래시 · pipeline 안정성
3. **#3 GradientAccent aria-hidden** · a11y 회귀 · 1-line fix
4. **#4 BarcodeScanner raw-alert** · framework audit 마지막 위반
5. 테스트 갱신 (BottomNav 6건 · SplitRightHeader 1건 · BottomSheet 1건)

---

## 부록 · 실행 커맨드 요약

```
npx tsc --noEmit         # exit 0 · 클린
npm test -- --run        # 8 failed / 3374 passed · 10 unhandled
node scripts/audit-framework.cjs  # 1 violation
```

- **총 실행 시간**: 약 3분 (tsc ~40s · vitest ~61s · audit ~10s)
- **환경**: Windows 11 · Node debugger 부착 (테스트 결과에는 영향 없음)
