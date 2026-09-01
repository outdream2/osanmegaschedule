# UI 반응형·시각 결함 감사 보고서
**감사 일자:** 2026-09-01  
**감사 범위:** 전체 페이지 (31+ 도메인) + 공통 프리미티브 · 총 457 TSX 파일

---

## 요약 집계

| 심각도 | 이슈 수 | 설명 |
|--------|---------|------|
| P0 (즉시 수정) | 12 | 정보 손실·기능 장애·대원칙 직접 위배 |
| P1 (1주 내) | 28 | 반응형 미대응·레이아웃 무너짐 위험 |
| P2 (개선 대상) | 41 | 시각 일관성·폰트·여백 편차 |
| **합계** | **81** | |

---

## 1. `truncate` 사용 현황 — 대원칙 위배 (P0·P1)

**총 164개** 파일에서 `truncate` 클래스 발견. 대원칙: 말줄임표 절대 금지.

### P0 — 실제 데이터 손실이 발생하는 경우

| 파일 | 라인 | 컨텍스트 | 권장 수정 |
|------|------|---------|---------|
| `common/ListRow.tsx` | 170, 173, 179, 183 | `title`, `subtitle`, `description`, meta 전체 truncate | `break-words whitespace-normal leading-tight` |
| `common/borrowing/BorrowingCard.tsx` | 69, 81, 94 | 상품명·대여자명 최대 100px 잘림 | `break-words`, `min-w` 확장 |
| `common/borrowing/BorrowingPartyCard.tsx` | 59, 63, 69 | 거래처 이름 잘림 | `break-words` |
| `OrderManagePage/CategoryTab.tsx` | 580, 583 | 모바일 fullscreen 구역명·상품 수 잘림 | `break-words` |
| `common/ProductBasicInfoPanel.tsx` | 167, 171, 184, 190 | 상품 기본정보 4개 필드 truncate | `whitespace-normal break-words` |
| `DisplayPage/ZoneAssignPopover.tsx` | 163, 165, 217 | 구역 팝오버 내 텍스트 잘림 | `break-words` |

### P1 — 좁은 컨텍스트에서 잘림 가능성

| 파일 | 라인 | 컨텍스트 |
|------|------|---------|
| `LandingPage/StockArrivalList.tsx` | 132, 134, 162 | 입고 알림 리스트 상품명 |
| `LandingPage/StockSearch.tsx` | 117, 119 | 검색 결과 상품명 |
| `LandingPage/VendorListEditor.tsx` | 691, 698 | 공급사 목록 이름 |
| `DisplayPage/DisplayRequestPanel.tsx` | 130, 163 | 진열 요청 상품명 |
| `DisplayPage/VendorManageSplit.tsx` | 174 | 공급사 목록 이름 |
| `OcrPage/ConfirmedRecordsTab.tsx` | 462 | OCR 확인 레코드 |
| `OcrPage/RawOcrTable/InvoicePageSummary.tsx` | 90 | 인보이스 페이지 요약 |
| `OrderManagePage/OrderHistoryTab.tsx` | 270 | 발주 이력 |
| `OrderManagePage/PurchaseHistoryTab/ProductPurchaseDetailPanel.tsx` | 63 | 구매 상세 |
| `layout/AppNavHeader.tsx` | 366 | 직원 이름+직위 헤더 |
| `layout/SideNav.tsx` | 470, 474, 518 | 사이드바 항목명 |
| `LunchPage/LunchPage.tsx` | 417, 552 | 점심 불참 목록 |
| `MyPage/MyPage.tsx` | 123, 315 | 마이페이지 |

**특이사항:** `common/ListRow.tsx` 는 리스트 전체에 재사용되는 기반 컴포넌트. 해당 파일의 truncate 4개 수정 시 앱 전반 수십 개 리스트의 말줄임이 동시에 해결됨 — 최우선 수정.

---

## 2. `font-mono` 오용 — 대원칙 위배 (P1)

숫자/UI 레이블에 `font-mono` 사용. 원칙: 숫자는 `tabular-nums` + sans-serif. `font-mono` 는 코드/해시 필드만.

**위반 파일 74개** 중 주요 오용:

| 파일 | 라인 | 내용 | 위반 수준 |
|------|------|------|---------|
| `lib/stockPeriodUtils.tsx` | 231, 238 | 차트 범례 숫자 | P1 |
| `DayTimelineModal/BreakTimeline.tsx` | 68 | 타임라인 시간 표시 | P1 |
| `EmployeeFormModal.tsx` | 139 | 주민번호 입력 | P2 (코드성 데이터 예외 가능) |
| `DisplayPage/DisplayMobileList.tsx` | 48 | 구역 개수 숫자 | P1 |
| `OrderManagePage/ContactPopover.tsx` | — | 연락처 | P2 (전화번호 예외 가능) |
| `OcrPage/*` | 다수 | OCR 데이터 셀값 | P2 (디버그 성격 일부 예외 가능) |
| `BarcodeScanner/BarcodeScanner.tsx` | 351, 366, 442 | 스캔 결과 코드 | P2 (바코드 코드 → 예외 가능) |
| `SettingsModal/tabs/ColorPicker.tsx` | — | 컬러 hex 코드 | P2 (hex 값 예외 가능) |

---

## 3. 하드코딩 고정 `min-w` 로 인한 모바일 가로 스크롤 (P0·P1)

### P0 — 모바일에서 뷰포트 초과 확정

| 파일 | 클래스 | 뷰포트 영향 |
|------|-------|----------|
| `DisplayPage/DisplayStoreMap.tsx` L66 | `min-w-[820px]` | 매장 구역도 — 360px 뷰포트에서 460px 가로 오버플로. `overflow-x-auto` 래퍼 있으나 부모가 `overflow-hidden` 이면 가로 스크롤 불가 |
| `LandingPage/VendorListEditor.tsx` L325 | `min-w-[420px]` | 공급사 테이블 — 420px 기준이라 360px 모바일에서 잘림 |
| `OrderManagePage/PurchaseHistoryTab/ProductAggTab.tsx` L122 | `min-w-[600px]` | 구매집계 테이블 — `overflow-x-auto` 래퍼 확인 필요 |
| `OrderManagePage/VendorDetailTabs.history.tsx` L133 | `min-w-[500px]` | 공급사 이력 테이블 |

### P1 — 래퍼 스크롤은 있으나 UX 열악

| 파일 | 내용 |
|------|------|
| `VatPreparePage/tabs/SalesTab.tsx` L134 | 10개 이상 컬럼 부가세 테이블 · `overflow-x-auto` 는 있으나 모바일에서 컬럼 중요도 분류 없음 |
| `HrFormsPage/HrFormsPage.tsx` L445 | `hidden md:block` 데스크탑 테이블 · 모바일 카드뷰 대체 없음 (아래 4번 참조) |
| `DisplayPage/VendorManageSplit.tsx` L204-206 | 공급사 테이블 `min-w-[160px]` 컬럼 · 모바일 대응 없음 |

---

## 4. 반응형 미대응 페이지 (P0·P1)

### P0 — 반응형 클래스 전무 (모바일 완전 미대응)

다음 페이지들은 `sm:`·`md:`·`lg:`·`xl:` 브레이크포인트 클래스가 **0개** 또는 극소수:

| 페이지 | 반응형 클래스 수 | 문제 |
|--------|--------------|------|
| `LeavePage/LeavePage.tsx` | **0** | 데스크탑 레이아웃 그대로 모바일 표시 |
| `BusinessManagePage/BusinessManagePage.tsx` | **0** | 경영관리 메인 — 서브탭 임베드 페이지들의 반응형에만 의존 |
| `VatPreparePage/VatPreparePage.tsx` | 2 (최소) | 부가세 준비 · KPI 그리드 모바일 미대응 |

### P1 — 부분 반응형 (주요 레이아웃만 대응)

| 페이지 | 문제 |
|--------|------|
| `OcrPage` (3파일만 반응형) | OCR 결과 테이블 `RawOcrTable.tsx` — 반응형 없음. 모바일에서 넓은 인보이스 표 가로 스크롤 유일 대안 |
| `ReservationPage` (1파일) | 예약 캘린더 · sm 브레이크포인트만 |
| `StockCheckPage` (1파일) | 재고 검색 결과 — 반응형 최소화 |
| `PharmacistPage` | 팜파일 PDF 뷰어 · `max-h-[38vh]` 고정 |

### P1 — HrFormsPage 모바일 테이블

`HrFormsPage.tsx` L445: `<div className="hidden md:block overflow-x-auto">` — 모바일(`md` 미만)에서 테이블이 `hidden`. 대체 모바일 카드뷰가 별도로 있는지 확인 필요. 없으면 모바일 사용자는 양식 목록 전혀 볼 수 없음.

---

## 5. 인라인 Toast — `useToast` 미이관 (P1)

**75개 파일**에서 `fixed bottom-4 right-4 z-[9999]` 인라인 토스트 패턴 사용. `useToast` 훅과 중앙 토스트 시스템이 존재하지만 이관 미완료.

**문제점:**
- 모바일에서 `fixed bottom-4 right-4` = BottomNav 위에 겹침 (BottomNav `h-20` + safe-area)
- 동시에 두 토스트가 떠 있으면 겹침 (z-index 동일)
- `SessionTimeoutWarning` 이 `bottom-5 right-5 w-80` 고정 → 360px 뷰포트에서 화면 너비 초과

**이관 미완료 주요 파일 (상위 20개):**
`OrderHistoryTab`, `CategoryTab`, `ExpiryImminentTab`, `ZoneMismatchTab`, `UnassignedProductsTab`, `RealStockTablePage`, `BorrowingDetailPanel`, `BorrowingEditPanel`, `BorrowingPage`, `OrderModal`, `OrderManagePage.modals`, `PaymentInputPage`, `PurchaseHistoryTab`, `ReturnListPanel`, `StockManagePage/DiffTab`, `StockManagePage/FlowTab`, `StockManagePage/SupplierTab`, `RequestsPage`, `PharmacistPage`, `ResignationApprovalPage`

---

## 6. 터치 타겟 크기 부족 (P1)

최소 44×44px (Apple HIG) 기준 미달 의심 버튼:

| 파일 | 클래스 | 실제 크기 |
|------|-------|---------|
| `BarcodeScanner.tsx` L307-325 | `w-8 h-8` (= 32px) | 32px — 12px 미달 |
| `BoardPage/DetailModal.tsx` L351 | `w-6 h-6` | 24px — 20px 미달 |
| `BoardPage/ComposerModal.tsx` L165 | `w-6 h-6` | 24px — 20px 미달 |
| `DayTimelineModal/BreakTimeline.tsx` | `text-[12px]` 버튼 | 터치 영역 미확인 |
| `BottomNav.tsx` L124 | `w-9 h-6` (36×24px) 내부 아이콘 컨테이너 | 외곽 `py-1.5` 포함 시 OK 수준이나 44px 미달 |
| `ContractSettingsPage.tsx` | `min-w-[22px] h-[22px]` 배지형 버튼 | 22px — 터치 불가 |

---

## 7. 모달·팝오버 모바일 처리 (P1·P2)

### P1 — 모바일 fullscreen 미지원 모달

| 파일 | 문제 |
|------|------|
| `LandingPage/VendorDetailModal.tsx` | `min-h-[85vh] max-h-[92vh]` 모달 — `sm:p-4` 이하에서 `p-2` 로 여백 감소. 모바일 전체 화면 미점유 |
| `PharmacistPage/PdfViewerModal.tsx` | PDF 뷰어 `fixed inset-0 z-[60]` — `p-4` 고정 · safe-area 미처리 |
| `OrderManagePage/BorrowingDetailPanel.tsx` L599 | `fixed inset-0 z-[9998]` 인라인 모달 — Modal 프리미티브 미이관 (`align="bottom-mobile"` 필요) |
| `OrderManagePage/BorrowingPage_legacy.tsx` L279, 657 | 동일 패턴 — legacy 파일이나 실사용 중 |

### P2 — `align="bottom-mobile"` 미사용 모달

`Modal` 프리미티브에 `align="bottom-mobile"` 이 구현되어 있으나 대부분 모달이 `align="center"` (기본값) 사용 — 모바일에서 스크롤 불편.

---

## 8. 폰트 크기 미세 이슈 (P2)

### 8-1. 극소 폰트 사용 (가독성 저하)

| 파일 | 클래스 | 사용처 |
|------|-------|-------|
| `VatPreparePage/tabs/SalesTab.tsx` | `text-[9px]`, `text-[10px]` | 부가세 테이블 컬럼 부제 |
| `VatPreparePage/tabs/SupplierVatTab.tsx` | `text-[9px]` | 공급사 VAT 테이블 |
| `VatPreparePage/VatPreparePage.tsx` | `text-[10px]` | KPI 소제목 |
| `DisplayPage/DisplayStoreMap.tsx` | `text-[10px]` | 구역도 내 텍스트 |
| `DayTimelineModal/WorkerChips.tsx` | `text-[10px]` 이하 | 직원 칩 |
| `ContractSettingsPage/ContractSettingsPage.tsx` | `text-[10px]` | 설정 배지 |
| `ScanPage/RealMapSelector.tsx` | `text-[9px]` | 배정구역 선택기 |

40대+ 사용자 가독성 대원칙: 최소 `text-[12px]`(12px), 인터랙티브 요소는 `text-[14px]` 이상.

### 8-2. TEXT 상수 미사용 (일관성 저해)

일부 파일이 `TEXT.label`, `TEXT.caption` 상수 대신 인라인 `text-[Xpx]` 하드코딩. `StockManagePage/*`, `SalesTrendPage/*` 일부.

---

## 9. 여백·레이아웃 일관성 (P2)

### 9-1. 페이지 컨테이너 패딩 불일치

| 패턴 | 파일 수 | 문제 |
|------|--------|------|
| `PAGE_CONTAINER_CLS` (토큰) 사용 | 다수 | 정상 |
| `px-3 py-4` 하드코딩 | 일부 | `PAGE_CONTAINER_CLS` 미사용 |
| `p-2 sm:p-3 md:p-4` | SchedulePage | 반응형 정상 |
| `p-4` 고정 | `VatPreparePage`, `LeavePage` | 모바일 여백 과도할 수 있음 |

### 9-2. 섹션 헤더 레벨 혼용

일부 페이지에서 `SectionLabel` 프리미티브 미사용 · 직접 `text-[13px] font-bold` 패턴. BrandingSettingsPage, SystemSettingsPage 등.

---

## 10. OcrPage — 모바일 전용 이슈 (P1)

- `RawOcrTable.tsx`: 응용 OCR 결과 테이블 — 반응형 없음. 인보이스 데이터 10개 이상 컬럼 → 모바일 수평 스크롤 전용
- `ConfirmedRecordsTab.tsx`: `overflow-x-auto` 있으나 헤더 sticky + 모바일 동시 사용 시 sticky 헤더 위치 오류 가능
- `OcrPage.tsx` 탭 바: `sm:` 브레이크포인트 있으나 탭 수 많아질 경우 wrap 처리 확인 필요

---

## 11. SchedulePage 그리드 — 모바일 P1

`SchedulePage.tsx` L621:
```
className={`relative overflow-x-auto w-full 
  ${employees.length > 10 ? "max-h-[70dvh] overflow-y-auto" : ""} 
  ${employees.length > 15 ? "md:max-h-[calc(100dvh-260px)]..." : "md:max-h-none..."}`}
```

- 직원 10명 이하 → `max-h` 없음 → 스케줄 셀이 화면 아래로 무제한 증가
- 직원 15명 이상 → `md` (768px+) 에서만 `calc(100dvh-260px)` · 모바일 `max-h-[70dvh]` 고정
- 날짜 31일 × 직원수 컬럼 수평 스크롤은 불가피하나 헤더 sticky 처리 검토 필요

---

## 12. DisplayPage 구역도 — P0

`DisplayStoreMap.tsx` L66: `min-w-[820px]` — `overflow-x-auto` 래퍼(`L61`) 내에 있으나:
- 부모 컨테이너가 얼마나 넓은지에 따라 스크롤 가능 여부 결정
- 360px 모바일에서 460px 이상 가로 스크롤 필수 → 직원이 구역도를 보기 매우 불편
- 권장: `min-w` 제거 후 CSS grid/flex 로 반응형 재구성, 또는 모바일 전용 대체 뷰 제공

---

## 13. NotificationBell — 모바일 팝오버 (P1)

`NotificationBell.tsx` L203:
```
className="fixed inset-x-2 top-14 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 mx-auto sm:mx-0 max-w-[420px] z-50"
```
- 모바일 `fixed inset-x-2 top-14`: 상단 헤더(약 56px) 바로 아래 · 측면 8px 여백 — 양호
- `sm:w-96` (384px) 고정 — `sm` (640px+) 에서 최대 폭 문제 없음
- `z-50` — `BottomNav z-40` 위. 알림 팝오버가 BottomNav 위에 위치 — 정상

---

## 14. BottomNav 토스트 겹침 — P0

`fixed bottom-4 right-4` 토스트 + `fixed bottom-0 inset-x-0` BottomNav 동시 표시 시:
- BottomNav 높이: `h-20`(80px) + `env(safe-area-inset-bottom)`(~34px on iPhone) = 최대 114px
- `bottom-4`(16px) 토스트는 BottomNav **내부에** 가려짐
- 권장: `bottom-[calc(5rem+env(safe-area-inset-bottom,0px)+16px)]` 또는 `useToast` 중앙 시스템 이관으로 해결

---

## 15. SessionTimeoutWarning — 모바일 초과 (P1)

`SessionTimeoutWarning.tsx`:
```
fixed bottom-5 right-5 z-[9999] w-80 rounded-xl
```
- `w-80` = 320px 고정
- 360px 뷰포트에서 `right-5`(20px) 포함 = 340px → 뷰포트 내 (OK)
- 단, 320px + 20px = 340px — 내용에 따라 텍스트 overflow 가능
- 권장: `w-full max-w-[320px]` 로 변경

---

## 16. 공통 프리미티브 이슈 (P2)

### Modal

- `size="full"` → `max-w-[95vw]` — 양호
- `align="bottom-mobile"` 구현 완료 — 사용률 낮음 (P2 · 확산 필요)
- `bodyPadding="none"` 옵션 있으나 일부 파일 내부 이중 padding

### SplitPanel

- `mobileRightAsModal` 구현 완료 — 기존 코드에서 충분히 활용됨
- `autoFitLeft` 신규 옵션(2026-08-31) — 적용 범위 확인 필요

### BottomSheet

- `fixed inset-0 ... flex items-end` — 모바일 정상
- safe-area 처리: `paddingBottom` env 없음 → 홈바 있는 iPhone에서 바텀 여백 부족 가능 (P2)

### ListRow

- `title`, `subtitle` 모두 `truncate` — P0 (위 1번 참조)
- 터치 영역: `onClick` 시 `<button>` — 세로 padding `py-2.5`(10px) 기준 약 40px — 44px 미달

---

## 우선순위별 즉시 조치 목록

### P0 — 즉시 수정 (회귀 없는 안전한 수정)

1. **`common/ListRow.tsx`** — `truncate` 4개 → `break-words whitespace-normal`
2. **BottomNav 토스트 겹침** — `fixed bottom-4 right-4` → safe-area 포함 bottom 값 적용 (또는 중앙 토스트 이관)
3. **`DisplayPage/DisplayStoreMap.tsx`** — `min-w-[820px]` → 모바일 대체 뷰 또는 responsive 재설계
4. **`common/borrowing/BorrowingCard.tsx`** — `truncate max-w-[100px]` → `break-words`
5. **`HrFormsPage` 모바일 테이블** — `hidden md:block` 테이블 · 모바일 대체 뷰 존재 여부 확인 후 없으면 카드뷰 추가

### P1 — 1주 내 배치

6. **인라인 토스트 75개** → `useToast` 중앙 시스템 이관 (배치작업 · 파일별 진행)
7. **`font-mono` 숫자** 주요 사용처 → `tabular-nums` + sans-serif 전환
8. **`LeavePage`** 반응형 클래스 추가 (`sm:grid-cols-2` 등)
9. **`VatPreparePage`** 모바일 KPI 그리드 반응형
10. **`OrderManagePage/BorrowingDetailPanel.tsx`** — 인라인 모달 → `Modal` 프리미티브 이관
11. **터치 타겟** `w-8 h-8` 버튼들 → `min-h-[44px] min-w-[44px]` 또는 padding 추가
12. **`BottomSheet`** safe-area padding 추가

### P2 — 장기 개선

13. 소형 폰트(`text-[9px]`·`text-[10px]`) → `text-[12px]` 이상으로 단계적 상향
14. `TEXT.*` 상수 미사용 파일에 토큰 적용 확산
15. `align="bottom-mobile"` 모달 확산 (ReservationPage 등)
16. `PAGE_CONTAINER_CLS` 미사용 페이지에 토큰 적용

---

## 공통 패턴 요약

| 패턴 | 발생 횟수 | 심각도 |
|------|---------|--------|
| `truncate` 남용 | 164 | P0~P1 |
| `font-mono` 오용 (숫자) | 74파일 | P1~P2 |
| 인라인 토스트 `fixed bottom-4 right-4` | 75파일 | P0~P1 |
| 반응형 브레이크포인트 미사용 페이지 | 3+ | P0~P1 |
| `min-w-[Npx]` 고정폭 (테이블) | 4개 이상 | P0~P1 |
| 터치 타겟 44px 미달 | 5+ 컴포넌트 | P1 |
| `text-[9px]`~`text-[11px]` 미세 폰트 | 30+ 파일 | P2 |

---

*생성: 2026-09-01 · 코드 수정 없음 · 조사·보고 전용*
