# Framework Audit Report (자동 생성)

> 생성 · 2026-08-21 · `scripts/audit-framework.cjs` · 매 세션 재실행
>
> **로드맵 · `docs/FRAMEWORK_ROADMAP.md` Phase 1 (인벤토리)**

## 📊 요약

| 지표 | 값 |
|---|---:|
| 스캔 파일 | 458 |
| 위반 파일 | 58 |
| 클린 파일 | 400 (87%) |
| 총 위반 개수 | 181 |

## 🚨 규칙별 위반 현황

| 규칙 | 총 위반 | 파일 수 | severity | 수정 방향 |
|---|---:|---:|---|---|
| `raw-fetch` | 8 | 7 | high | apiClient (api.get/post/put) |
| `raw-alert` | 5 | 3 | high | useToast (showError·showSuccess) |
| `raw-loader2` | 2 | 1 | medium | Spinner 프리미티브 |
| `raw-card-wrapper` | 65 | 20 | medium | Card 프리미티브 (padding·variant·clip) |
| `raw-confirm` | 57 | 26 | medium | useConfirm (ConfirmDialog 프리미티브) |
| `large-file` | 44 | 44 | high | 500+라인 · 서브 컴포넌트 분리 |

## 🔥 우선순위 파일 (weight 순 · TOP 30)

| # | 파일 | 라인 | 총 위반 | 위반 상세 |
|---:|---|---:|---:|---|
| 1 | `src/components/ContractWriterPage/ContractWriterPage.tsx` | 5483 | 60 | large-file(1) · raw-card-wrapper(13) · raw-confirm(2) |
| 2 | `src/components/OcrPage/RawOcrTable.tsx` | 5258 | 50 | large-file(1) · raw-confirm(9) · raw-card-wrapper(1) |
| 3 | `src/components/ResignationWriterPage/ResignationWriterPage.tsx` | 1241 | 44 | raw-card-wrapper(16) · large-file(1) · raw-confirm(1) |
| 4 | `src/components/LandingPage/LandingPage.tsx` | 2467 | 29 | large-file(1) · raw-confirm(4) · raw-card-wrapper(3) |
| 5 | `src/components/DisplayPage/DisplayPage.tsx` | 3127 | 28 | large-file(1) · raw-card-wrapper(2) · raw-confirm(2) |
| 6 | `src/components/OrderManagePage/OrderManagePage.tsx` | 3206 | 28 | large-file(1) · raw-confirm(4) |
| 7 | `src/components/ContractSettingsPage/ContractSettingsPage.tsx` | 919 | 25 | raw-card-wrapper(7) · raw-confirm(3) · large-file(1) |
| 8 | `src/components/SchedulePage/SchedulePage.tsx` | 2379 | 25 | large-file(1) · raw-confirm(5) |
| 9 | `src/components/StaffManagePage/StaffManagePage.tsx` | 2727 | 23 | large-file(1) · raw-confirm(3) · raw-card-wrapper(1) |
| 10 | `src/components/RequestsPage/RequestsPage.tsx` | 1307 | 22 | large-file(1) · raw-confirm(4) · raw-loader2(2) |
| 11 | `src/components/LandingPage/VendorListEditor.tsx` | 2038 | 17 | large-file(1) · raw-confirm(1) |
| 12 | `src/components/LeavePage/LeavePage.tsx` | 538 | 17 | raw-card-wrapper(6) · large-file(1) |
| 13 | `src/components/OcrPage/OcrPage.tsx` | 1768 | 17 | large-file(1) · raw-confirm(2) · raw-fetch(1) |
| 14 | `src/components/HrFormsPage/HrFormsPage.tsx` | 1123 | 16 | large-file(1) · raw-card-wrapper(2) · raw-confirm(1) |
| 15 | `src/components/ScanPage/ScanPage.tsx` | 1165 | 16 | large-file(1) · raw-confirm(3) |
| 16 | `src/components/DayTimelineModal/DayTimelineModal.tsx` | 2242 | 15 | large-file(1) |
| 17 | `src/components/SalesTrendPage/SalesTrendPage.tsx` | 2677 | 15 | large-file(1) |
| 18 | `src/components/BoardPage/BoardPage.tsx` | 1177 | 14 | large-file(1) · raw-card-wrapper(1) · raw-confirm(1) |
| 19 | `src/components/PermissionsPage/PermissionsPage.tsx` | 1089 | 14 | large-file(1) · raw-card-wrapper(1) · raw-confirm(1) |
| 20 | `src/components/ProductArrivalPage/ProductArrivalPage.tsx` | 1085 | 14 | large-file(1) · raw-confirm(2) |
| 21 | `src/components/OrderManagePage/PurchaseHistoryTab/PurchaseSubTabs.tsx` | 1214 | 12 | large-file(1) · raw-card-wrapper(1) |
| 22 | `src/components/ScanPage/ProductInfoCard.tsx` | 1015 | 12 | large-file(1) · raw-confirm(1) |
| 23 | `src/components/OrderManagePage/PaymentInfoTab.tsx` | 1926 | 10 | large-file(1) |
| 24 | `src/components/OrderManagePage/PurchaseHistoryTab.tsx` | 1192 | 10 | large-file(1) |
| 25 | `src/components/OrderManagePage/ReturnListPanel.tsx` | 1205 | 10 | large-file(1) |
| 26 | `src/components/StockManagePage/FlowTab.tsx` | 1111 | 10 | large-file(1) |
| 27 | `src/components/StockManagePage/SupplierTab.tsx` | 1005 | 10 | large-file(1) |
| 28 | `src/components/LunchPage/LunchPage.tsx` | 561 | 9 | large-file(1) · raw-card-wrapper(2) |
| 29 | `src/components/PharmacistMenuSettingsPage/PharmacistMenuSettingsPage.tsx` | 515 | 9 | large-file(1) · raw-card-wrapper(1) · raw-confirm(1) |
| 30 | `src/components/PharmacistPage/PharmacistPage.tsx` | 952 | 9 | large-file(1) · raw-card-wrapper(1) · raw-confirm(1) |

## 📝 모든 위반 파일 (58개)

<details><summary>펼치기 · 파일 리스트</summary>

| 파일 | 라인 | 위반 |
|---|---:|---:|
| `src/components/ContractWriterPage/ContractWriterPage.tsx` | 5483 | 60 |
| `src/components/OcrPage/RawOcrTable.tsx` | 5258 | 50 |
| `src/components/ResignationWriterPage/ResignationWriterPage.tsx` | 1241 | 44 |
| `src/components/LandingPage/LandingPage.tsx` | 2467 | 29 |
| `src/components/DisplayPage/DisplayPage.tsx` | 3127 | 28 |
| `src/components/OrderManagePage/OrderManagePage.tsx` | 3206 | 28 |
| `src/components/ContractSettingsPage/ContractSettingsPage.tsx` | 919 | 25 |
| `src/components/SchedulePage/SchedulePage.tsx` | 2379 | 25 |
| `src/components/StaffManagePage/StaffManagePage.tsx` | 2727 | 23 |
| `src/components/RequestsPage/RequestsPage.tsx` | 1307 | 22 |
| `src/components/LandingPage/VendorListEditor.tsx` | 2038 | 17 |
| `src/components/LeavePage/LeavePage.tsx` | 538 | 17 |
| `src/components/OcrPage/OcrPage.tsx` | 1768 | 17 |
| `src/components/HrFormsPage/HrFormsPage.tsx` | 1123 | 16 |
| `src/components/ScanPage/ScanPage.tsx` | 1165 | 16 |
| `src/components/DayTimelineModal/DayTimelineModal.tsx` | 2242 | 15 |
| `src/components/SalesTrendPage/SalesTrendPage.tsx` | 2677 | 15 |
| `src/components/BoardPage/BoardPage.tsx` | 1177 | 14 |
| `src/components/PermissionsPage/PermissionsPage.tsx` | 1089 | 14 |
| `src/components/ProductArrivalPage/ProductArrivalPage.tsx` | 1085 | 14 |
| `src/components/OrderManagePage/PurchaseHistoryTab/PurchaseSubTabs.tsx` | 1214 | 12 |
| `src/components/ScanPage/ProductInfoCard.tsx` | 1015 | 12 |
| `src/components/OrderManagePage/PaymentInfoTab.tsx` | 1926 | 10 |
| `src/components/OrderManagePage/PurchaseHistoryTab.tsx` | 1192 | 10 |
| `src/components/OrderManagePage/ReturnListPanel.tsx` | 1205 | 10 |
| `src/components/StockManagePage/FlowTab.tsx` | 1111 | 10 |
| `src/components/StockManagePage/SupplierTab.tsx` | 1005 | 10 |
| `src/components/LunchPage/LunchPage.tsx` | 561 | 9 |
| `src/components/PharmacistMenuSettingsPage/PharmacistMenuSettingsPage.tsx` | 515 | 9 |
| `src/components/PharmacistPage/PharmacistPage.tsx` | 952 | 9 |
| `src/App.tsx` | 552 | 8 |
| `src/hooks/useLeaveManager.ts` | 125 | 8 |
| `src/components/BrandingSettingsPage/BrandingSettingsPage.tsx` | 636 | 7 |
| `src/components/EmployeeCalendarModal/EmployeeCalendarModal.tsx` | 957 | 7 |
| `src/components/SettingsModal/SettingsModal.tsx` | 690 | 7 |
| `src/components/BarcodeScanner/handlers.ts` | 321 | 6 |
| `src/components/ResignationApprovalPage/ResignationApprovalPage.tsx` | 421 | 6 |
| `src/main.tsx` | 98 | 6 |
| `src/components/BarcodeScanner/BarcodeScanner.tsx` | 538 | 5 |
| `src/components/common/ProductDetailPanel.tsx` | 646 | 5 |
| `src/components/layout/AppNavHeader.tsx` | 773 | 5 |
| `src/components/layout/SideNav.tsx` | 503 | 5 |
| `src/components/OrderManagePage/CategoryTab.tsx` | 603 | 5 |
| `src/components/OrderManagePage/TrendingTab.tsx` | 574 | 5 |
| `src/components/OrderManagePage/VendorDetailTabs.tsx` | 768 | 5 |
| `src/components/ReservationPage/ReservationPage.tsx` | 744 | 5 |
| `src/components/ui/sidebar.tsx` | 703 | 5 |
| `src/components/VatPreparePage/VatPreparePage.tsx` | 764 | 5 |
| `src/components/common/EmployeeInfoForm.tsx` | 484 | 4 |
| `src/components/OcrPage/geminiEngine.ts` | 38 | 3 |
| `src/components/OcrPage/RawOcrTable/useSaveConfirmed.ts` | 309 | 3 |
| `src/constants/zoneLabels.ts` | 124 | 3 |
| `src/lib/contract/index.ts` | 339 | 3 |
| `src/lib/productsCache.ts` | 38 | 3 |
| `src/components/NotificationBell.tsx` | 286 | 2 |
| `src/components/SchedulePage/ScheduleFilterBar.tsx` | 129 | 2 |
| `src/components/StockArrivalPage/StockArrivalPage.tsx` | 496 | 2 |
| `src/components/ZoneLabelsEditor/ZoneLabelsEditor.tsx` | 493 | 2 |

</details>

## 🎯 다음 액션 (권장)

1. `docs/FRAMEWORK_ROADMAP.md` Phase 2 · ESLint 룰 도입 · pre-commit hook
2. TOP 5 파일 · 대원칙 준수 이관 (매 커밋 격리 · TS+test 검증)
3. 주간 재실행 · 진행률 트래킹
