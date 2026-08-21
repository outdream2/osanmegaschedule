# Framework Audit Report (자동 생성)

> 생성 · 2026-08-21 · `scripts/audit-framework.cjs` · 매 세션 재실행
>
> **로드맵 · `docs/FRAMEWORK_ROADMAP.md` Phase 1 (인벤토리)**

## 📊 요약

| 지표 | 값 |
|---|---:|
| 스캔 파일 | 458 |
| 위반 파일 | 72 |
| 클린 파일 | 386 (84%) |
| 총 위반 개수 | 276 |

## 🚨 규칙별 위반 현황

| 규칙 | 총 위반 | 파일 수 | severity | 수정 방향 |
|---|---:|---:|---|---|
| `raw-fetch` | 86 | 29 | high | apiClient (api.get/post/put) |
| `raw-alert` | 22 | 11 | high | useToast (showError·showSuccess) |
| `raw-loader2` | 2 | 1 | medium | Spinner 프리미티브 |
| `raw-card-wrapper` | 65 | 20 | medium | Card 프리미티브 (padding·variant·clip) |
| `raw-confirm` | 57 | 26 | medium | useConfirm (ConfirmDialog 프리미티브) |
| `large-file` | 44 | 44 | high | 500+라인 · 서브 컴포넌트 분리 |

## 🔥 우선순위 파일 (weight 순 · TOP 30)

| # | 파일 | 라인 | 총 위반 | 위반 상세 |
|---:|---|---:|---:|---|
| 1 | `src/components/OcrPage/RawOcrTable.tsx` | 5274 | 137 | raw-fetch(24) · large-file(1) · raw-confirm(9) · raw-alert(5) · raw-card-wrapper(1) |
| 2 | `src/components/ContractWriterPage/ContractWriterPage.tsx` | 5465 | 66 | large-file(1) · raw-card-wrapper(13) · raw-alert(2) · raw-confirm(2) |
| 3 | `src/components/DisplayPage/DisplayPage.tsx` | 3144 | 52 | raw-fetch(8) · large-file(1) · raw-card-wrapper(2) · raw-confirm(2) |
| 4 | `src/components/OcrPage/OcrPage.tsx` | 1737 | 47 | raw-fetch(9) · large-file(1) · raw-alert(2) · raw-confirm(2) |
| 5 | `src/components/ResignationWriterPage/ResignationWriterPage.tsx` | 1241 | 44 | raw-card-wrapper(16) · large-file(1) · raw-confirm(1) |
| 6 | `src/components/LandingPage/LandingPage.tsx` | 2465 | 38 | large-file(1) · raw-fetch(3) · raw-confirm(4) · raw-card-wrapper(3) |
| 7 | `src/components/DayTimelineModal/DayTimelineModal.tsx` | 2246 | 30 | raw-fetch(5) · large-file(1) |
| 8 | `src/components/OrderManagePage/OrderManagePage.tsx` | 3206 | 28 | large-file(1) · raw-confirm(4) |
| 9 | `src/components/SalesTrendPage/SalesTrendPage.tsx` | 2675 | 27 | large-file(1) · raw-fetch(4) |
| 10 | `src/components/ContractSettingsPage/ContractSettingsPage.tsx` | 919 | 25 | raw-card-wrapper(7) · raw-confirm(3) · large-file(1) |
| 11 | `src/components/SchedulePage/SchedulePage.tsx` | 2379 | 25 | large-file(1) · raw-confirm(5) |
| 12 | `src/components/StaffManagePage/StaffManagePage.tsx` | 2727 | 23 | large-file(1) · raw-confirm(3) · raw-card-wrapper(1) |
| 13 | `src/components/RequestsPage/RequestsPage.tsx` | 1307 | 22 | large-file(1) · raw-confirm(4) · raw-loader2(2) |
| 14 | `src/components/ScanPage/ProductInfoCard.tsx` | 1014 | 21 | large-file(1) · raw-fetch(3) · raw-confirm(1) |
| 15 | `src/components/ScanPage/ScanPage.tsx` | 1163 | 19 | large-file(1) · raw-confirm(3) · raw-fetch(1) |
| 16 | `src/components/LandingPage/VendorListEditor.tsx` | 2038 | 17 | large-file(1) · raw-confirm(1) |
| 17 | `src/components/LeavePage/LeavePage.tsx` | 538 | 17 | raw-card-wrapper(6) · large-file(1) |
| 18 | `src/components/HrFormsPage/HrFormsPage.tsx` | 1123 | 16 | large-file(1) · raw-card-wrapper(2) · raw-confirm(1) |
| 19 | `src/components/ResignationApprovalPage/ResignationApprovalPage.tsx` | 411 | 15 | raw-alert(3) · raw-card-wrapper(2) · raw-confirm(1) |
| 20 | `src/components/BoardPage/BoardPage.tsx` | 1177 | 14 | large-file(1) · raw-card-wrapper(1) · raw-confirm(1) |
| 21 | `src/components/PermissionsPage/PermissionsPage.tsx` | 1089 | 14 | large-file(1) · raw-card-wrapper(1) · raw-confirm(1) |
| 22 | `src/components/ProductArrivalPage/ProductArrivalPage.tsx` | 1085 | 14 | large-file(1) · raw-confirm(2) |
| 23 | `src/components/OrderManagePage/PurchaseHistoryTab/PurchaseSubTabs.tsx` | 1214 | 12 | large-file(1) · raw-card-wrapper(1) |
| 24 | `src/components/OrderManagePage/CategoryTab.tsx` | 599 | 11 | raw-fetch(2) · large-file(1) |
| 25 | `src/components/OrderManagePage/TrendingTab.tsx` | 572 | 11 | raw-fetch(2) · large-file(1) |
| 26 | `src/components/EmployeeCalendarModal/EmployeeCalendarModal.tsx` | 955 | 10 | large-file(1) · raw-fetch(1) · raw-confirm(1) |
| 27 | `src/components/OrderManagePage/PaymentInfoTab.tsx` | 1926 | 10 | large-file(1) |
| 28 | `src/components/OrderManagePage/PurchaseHistoryTab.tsx` | 1192 | 10 | large-file(1) |
| 29 | `src/components/OrderManagePage/ReturnListPanel.tsx` | 1205 | 10 | large-file(1) |
| 30 | `src/components/StockManagePage/FlowTab.tsx` | 1111 | 10 | large-file(1) |

## 📝 모든 위반 파일 (72개)

<details><summary>펼치기 · 파일 리스트</summary>

| 파일 | 라인 | 위반 |
|---|---:|---:|
| `src/components/OcrPage/RawOcrTable.tsx` | 5274 | 137 |
| `src/components/ContractWriterPage/ContractWriterPage.tsx` | 5465 | 66 |
| `src/components/DisplayPage/DisplayPage.tsx` | 3144 | 52 |
| `src/components/OcrPage/OcrPage.tsx` | 1737 | 47 |
| `src/components/ResignationWriterPage/ResignationWriterPage.tsx` | 1241 | 44 |
| `src/components/LandingPage/LandingPage.tsx` | 2465 | 38 |
| `src/components/DayTimelineModal/DayTimelineModal.tsx` | 2246 | 30 |
| `src/components/OrderManagePage/OrderManagePage.tsx` | 3206 | 28 |
| `src/components/SalesTrendPage/SalesTrendPage.tsx` | 2675 | 27 |
| `src/components/ContractSettingsPage/ContractSettingsPage.tsx` | 919 | 25 |
| `src/components/SchedulePage/SchedulePage.tsx` | 2379 | 25 |
| `src/components/StaffManagePage/StaffManagePage.tsx` | 2727 | 23 |
| `src/components/RequestsPage/RequestsPage.tsx` | 1307 | 22 |
| `src/components/ScanPage/ProductInfoCard.tsx` | 1014 | 21 |
| `src/components/ScanPage/ScanPage.tsx` | 1163 | 19 |
| `src/components/LandingPage/VendorListEditor.tsx` | 2038 | 17 |
| `src/components/LeavePage/LeavePage.tsx` | 538 | 17 |
| `src/components/HrFormsPage/HrFormsPage.tsx` | 1123 | 16 |
| `src/components/ResignationApprovalPage/ResignationApprovalPage.tsx` | 411 | 15 |
| `src/components/BoardPage/BoardPage.tsx` | 1177 | 14 |
| `src/components/PermissionsPage/PermissionsPage.tsx` | 1089 | 14 |
| `src/components/ProductArrivalPage/ProductArrivalPage.tsx` | 1085 | 14 |
| `src/components/OrderManagePage/PurchaseHistoryTab/PurchaseSubTabs.tsx` | 1214 | 12 |
| `src/components/OrderManagePage/CategoryTab.tsx` | 599 | 11 |
| `src/components/OrderManagePage/TrendingTab.tsx` | 572 | 11 |
| `src/components/EmployeeCalendarModal/EmployeeCalendarModal.tsx` | 955 | 10 |
| `src/components/OrderManagePage/PaymentInfoTab.tsx` | 1926 | 10 |
| `src/components/OrderManagePage/PurchaseHistoryTab.tsx` | 1192 | 10 |
| `src/components/OrderManagePage/ReturnListPanel.tsx` | 1205 | 10 |
| `src/components/StockManagePage/FlowTab.tsx` | 1111 | 10 |
| `src/components/LunchPage/LunchPage.tsx` | 561 | 9 |
| `src/components/PharmacistMenuSettingsPage/PharmacistMenuSettingsPage.tsx` | 515 | 9 |
| `src/components/PharmacistPage/PharmacistPage.tsx` | 952 | 9 |
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
