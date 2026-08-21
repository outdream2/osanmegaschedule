# Framework Audit Report (자동 생성)

> 생성 · 2026-08-21 · `scripts/audit-framework.cjs` · 매 세션 재실행
>
> **로드맵 · `docs/FRAMEWORK_ROADMAP.md` Phase 1 (인벤토리)**

## 📊 요약

| 지표 | 값 |
|---|---:|
| 스캔 파일 | 458 |
| 위반 파일 | 73 |
| 클린 파일 | 385 (84%) |
| 총 위반 개수 | 363 |

## 🚨 규칙별 위반 현황

| 규칙 | 총 위반 | 파일 수 | severity | 수정 방향 |
|---|---:|---:|---|---|
| `raw-fetch` | 91 | 31 | high | apiClient (api.get/post/put) |
| `raw-alert` | 104 | 25 | high | useToast (showError·showSuccess) |
| `raw-loader2` | 2 | 1 | medium | Spinner 프리미티브 |
| `raw-card-wrapper` | 65 | 20 | medium | Card 프리미티브 (padding·variant·clip) |
| `raw-confirm` | 57 | 26 | medium | useConfirm (ConfirmDialog 프리미티브) |
| `large-file` | 44 | 44 | high | 500+라인 · 서브 컴포넌트 분리 |

## 🔥 우선순위 파일 (weight 순 · TOP 30)

| # | 파일 | 라인 | 총 위반 | 위반 상세 |
|---:|---|---:|---:|---|
| 1 | `src/components/OcrPage/RawOcrTable.tsx` | 5274 | 137 | raw-fetch(24) · large-file(1) · raw-confirm(9) · raw-alert(5) · raw-card-wrapper(1) |
| 2 | `src/components/StaffManagePage/StaffManagePage.tsx` | 2717 | 77 | raw-alert(18) · large-file(1) · raw-confirm(3) · raw-card-wrapper(1) |
| 3 | `src/components/DisplayPage/DisplayPage.tsx` | 3134 | 76 | raw-fetch(8) · raw-alert(8) · large-file(1) · raw-card-wrapper(2) · raw-confirm(2) |
| 4 | `src/components/DayTimelineModal/DayTimelineModal.tsx` | 2228 | 75 | raw-alert(15) · raw-fetch(5) · large-file(1) |
| 5 | `src/components/ContractWriterPage/ContractWriterPage.tsx` | 5465 | 66 | large-file(1) · raw-card-wrapper(13) · raw-alert(2) · raw-confirm(2) |
| 6 | `src/components/LandingPage/LandingPage.tsx` | 2455 | 65 | raw-alert(9) · large-file(1) · raw-fetch(3) · raw-confirm(4) · raw-card-wrapper(3) |
| 7 | `src/components/OrderManagePage/OrderManagePage.tsx` | 3196 | 49 | raw-alert(7) · large-file(1) · raw-confirm(4) |
| 8 | `src/components/OcrPage/OcrPage.tsx` | 1737 | 47 | raw-fetch(9) · large-file(1) · raw-alert(2) · raw-confirm(2) |
| 9 | `src/components/ResignationWriterPage/ResignationWriterPage.tsx` | 1241 | 44 | raw-card-wrapper(16) · large-file(1) · raw-confirm(1) |
| 10 | `src/components/BoardPage/BoardPage.tsx` | 1167 | 32 | raw-alert(6) · large-file(1) · raw-card-wrapper(1) · raw-confirm(1) |
| 11 | `src/components/PermissionsPage/PermissionsPage.tsx` | 1089 | 32 | raw-alert(6) · large-file(1) · raw-card-wrapper(1) · raw-confirm(1) |
| 12 | `src/components/RequestsPage/RequestsPage.tsx` | 1297 | 28 | large-file(1) · raw-confirm(4) · raw-alert(2) · raw-loader2(2) |
| 13 | `src/components/SalesTrendPage/SalesTrendPage.tsx` | 2675 | 27 | large-file(1) · raw-fetch(4) |
| 14 | `src/components/ContractSettingsPage/ContractSettingsPage.tsx` | 919 | 25 | raw-card-wrapper(7) · raw-confirm(3) · large-file(1) |
| 15 | `src/components/SchedulePage/SchedulePage.tsx` | 2379 | 25 | large-file(1) · raw-confirm(5) |
| 16 | `src/components/LunchPage/LunchPage.tsx` | 564 | 21 | raw-fetch(4) · large-file(1) · raw-card-wrapper(2) |
| 17 | `src/components/PharmacistMenuSettingsPage/PharmacistMenuSettingsPage.tsx` | 509 | 21 | raw-alert(4) · large-file(1) · raw-card-wrapper(1) · raw-confirm(1) |
| 18 | `src/components/ScanPage/ProductInfoCard.tsx` | 1014 | 21 | large-file(1) · raw-fetch(3) · raw-confirm(1) |
| 19 | `src/components/HrFormsPage/HrFormsPage.tsx` | 1117 | 19 | large-file(1) · raw-card-wrapper(2) · raw-alert(1) · raw-confirm(1) |
| 20 | `src/components/ScanPage/ScanPage.tsx` | 1163 | 19 | large-file(1) · raw-confirm(3) · raw-fetch(1) |
| 21 | `src/components/LandingPage/VendorListEditor.tsx` | 2038 | 17 | large-file(1) · raw-confirm(1) |
| 22 | `src/components/LeavePage/LeavePage.tsx` | 538 | 17 | raw-card-wrapper(6) · large-file(1) |
| 23 | `src/components/ProductArrivalPage/ProductArrivalPage.tsx` | 1085 | 17 | large-file(1) · raw-confirm(2) · raw-alert(1) |
| 24 | `src/components/ResignationApprovalPage/ResignationApprovalPage.tsx` | 411 | 15 | raw-alert(3) · raw-card-wrapper(2) · raw-confirm(1) |
| 25 | `src/components/StockManagePage/FlowTab.tsx` | 1101 | 13 | large-file(1) · raw-alert(1) |
| 26 | `src/components/common/EmployeeProfileCard.tsx` | 347 | 12 | raw-alert(3) · raw-fetch(1) |
| 27 | `src/components/OrderManagePage/PurchaseHistoryTab/PurchaseSubTabs.tsx` | 1214 | 12 | large-file(1) · raw-card-wrapper(1) |
| 28 | `src/components/PharmacistPage/PharmacistPage.tsx` | 942 | 12 | large-file(1) · raw-alert(1) · raw-card-wrapper(1) · raw-confirm(1) |
| 29 | `src/components/OrderManagePage/CategoryTab.tsx` | 599 | 11 | raw-fetch(2) · large-file(1) |
| 30 | `src/components/OrderManagePage/TrendingTab.tsx` | 572 | 11 | raw-fetch(2) · large-file(1) |

## 📝 모든 위반 파일 (73개)

<details><summary>펼치기 · 파일 리스트</summary>

| 파일 | 라인 | 위반 |
|---|---:|---:|
| `src/components/OcrPage/RawOcrTable.tsx` | 5274 | 137 |
| `src/components/StaffManagePage/StaffManagePage.tsx` | 2717 | 77 |
| `src/components/DisplayPage/DisplayPage.tsx` | 3134 | 76 |
| `src/components/DayTimelineModal/DayTimelineModal.tsx` | 2228 | 75 |
| `src/components/ContractWriterPage/ContractWriterPage.tsx` | 5465 | 66 |
| `src/components/LandingPage/LandingPage.tsx` | 2455 | 65 |
| `src/components/OrderManagePage/OrderManagePage.tsx` | 3196 | 49 |
| `src/components/OcrPage/OcrPage.tsx` | 1737 | 47 |
| `src/components/ResignationWriterPage/ResignationWriterPage.tsx` | 1241 | 44 |
| `src/components/BoardPage/BoardPage.tsx` | 1167 | 32 |
| `src/components/PermissionsPage/PermissionsPage.tsx` | 1089 | 32 |
| `src/components/RequestsPage/RequestsPage.tsx` | 1297 | 28 |
| `src/components/SalesTrendPage/SalesTrendPage.tsx` | 2675 | 27 |
| `src/components/ContractSettingsPage/ContractSettingsPage.tsx` | 919 | 25 |
| `src/components/SchedulePage/SchedulePage.tsx` | 2379 | 25 |
| `src/components/LunchPage/LunchPage.tsx` | 564 | 21 |
| `src/components/PharmacistMenuSettingsPage/PharmacistMenuSettingsPage.tsx` | 509 | 21 |
| `src/components/ScanPage/ProductInfoCard.tsx` | 1014 | 21 |
| `src/components/HrFormsPage/HrFormsPage.tsx` | 1117 | 19 |
| `src/components/ScanPage/ScanPage.tsx` | 1163 | 19 |
| `src/components/LandingPage/VendorListEditor.tsx` | 2038 | 17 |
| `src/components/LeavePage/LeavePage.tsx` | 538 | 17 |
| `src/components/ProductArrivalPage/ProductArrivalPage.tsx` | 1085 | 17 |
| `src/components/ResignationApprovalPage/ResignationApprovalPage.tsx` | 411 | 15 |
| `src/components/StockManagePage/FlowTab.tsx` | 1101 | 13 |
| `src/components/common/EmployeeProfileCard.tsx` | 347 | 12 |
| `src/components/OrderManagePage/PurchaseHistoryTab/PurchaseSubTabs.tsx` | 1214 | 12 |
| `src/components/PharmacistPage/PharmacistPage.tsx` | 942 | 12 |
| `src/components/OrderManagePage/CategoryTab.tsx` | 599 | 11 |
| `src/components/OrderManagePage/TrendingTab.tsx` | 572 | 11 |
| `src/components/EmployeeCalendarModal/EmployeeCalendarModal.tsx` | 955 | 10 |
| `src/components/OrderManagePage/PaymentInfoTab.tsx` | 1926 | 10 |
| `src/components/OrderManagePage/PurchaseHistoryTab.tsx` | 1192 | 10 |
| `src/components/OrderManagePage/ReturnListPanel.tsx` | 1205 | 10 |
| `src/App.tsx` | 552 | 8 |
| `src/components/StockManagePage/SupplierTab.tsx` | 995 | 8 |
| `src/hooks/useLeaveManager.ts` | 125 | 8 |
| `src/components/BrandingSettingsPage/BrandingSettingsPage.tsx` | 636 | 7 |
| `src/components/SettingsModal/SettingsModal.tsx` | 690 | 7 |
| `src/components/ApprovalCenterPage/ApprovalCenterPage.tsx` | 111 | 6 |
| `src/components/BarcodeScanner/handlers.ts` | 321 | 6 |
| `src/components/BusinessManagePage/BusinessManagePage.tsx` | 250 | 6 |
| `src/components/common/features/VendorInfoModal.tsx` | 103 | 6 |
| `src/components/DisplayPage/DisplayRequestPanel.tsx` | 330 | 6 |
| `src/components/OcrPage/RawOcrTable/useHandleMatchPage.ts` | 301 | 6 |
| `src/components/OcrPage/RawOcrTable/useSaveConfirmed.ts` | 310 | 6 |
| `src/components/StockManagePage/StockReconciliationTab.tsx` | 419 | 6 |
| `src/main.tsx` | 98 | 6 |
| `src/components/BarcodeScanner/BarcodeScanner.tsx` | 538 | 5 |
| `src/components/common/ProductDetailPanel.tsx` | 646 | 5 |
| `src/components/layout/AppNavHeader.tsx` | 773 | 5 |
| `src/components/layout/SideNav.tsx` | 503 | 5 |
| `src/components/OrderManagePage/VendorDetailTabs.tsx` | 768 | 5 |
| `src/components/ReservationPage/ReservationPage.tsx` | 744 | 5 |
| `src/components/ui/sidebar.tsx` | 703 | 5 |
| `src/components/VatPreparePage/VatPreparePage.tsx` | 764 | 5 |
| `src/components/common/EmployeeInfoForm.tsx` | 484 | 4 |
| `src/components/common/features/PurchaseHistoryModal.tsx` | 129 | 3 |
| `src/components/OcrPage/geminiEngine.ts` | 38 | 3 |
| `src/components/OcrPage/RawOcrTable/SupplierChangeDialog.tsx` | 112 | 3 |
| `src/components/OcrPage/RawOcrTable/useAutoTemplateSave.ts` | 41 | 3 |
| `src/components/OcrPage/RawOcrTable/usePurchaseHistoryMatch.ts` | 130 | 3 |
| `src/components/OrderManagePage/OrderHistoryTab.tsx` | 241 | 3 |
| `src/components/PharmacistPage/PdfViewerModal.tsx` | 241 | 3 |
| `src/components/StockManagePage/DiffTab.tsx` | 410 | 3 |
| `src/components/StockManagePage/ProductPurchaseHistoryModal.tsx` | 104 | 3 |
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
