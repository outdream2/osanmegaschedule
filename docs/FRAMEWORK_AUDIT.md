# Framework Audit Report (자동 생성)

> 생성 · 2026-08-21 · `scripts/audit-framework.cjs` · 매 세션 재실행
>
> **로드맵 · `docs/FRAMEWORK_ROADMAP.md` Phase 1 (인벤토리)**

## 📊 요약

| 지표 | 값 |
|---|---:|
| 스캔 파일 | 492 |
| 위반 파일 | 25 |
| 클린 파일 | 467 (95%) |
| 총 위반 개수 | 25 |

## 🚨 규칙별 위반 현황

| 규칙 | 총 위반 | 파일 수 | severity | 수정 방향 |
|---|---:|---:|---|---|
| `large-file-critical` | 10 | 10 | high | 2000+라인 · 시급 · 서브 컴포넌트/훅 분리 필수 |
| `large-file-warn` | 15 | 15 | medium | 800-2000라인 · 서브 컴포넌트 분리 권장 |

## 🔥 우선순위 파일 (weight 순 · TOP 30)

| # | 파일 | 라인 | 총 위반 | 위반 상세 |
|---:|---|---:|---:|---|
| 1 | `src/components/ContractWriterPage/ContractWriterPage.tsx` | 5483 | 48 | large-file-critical(1) |
| 2 | `src/components/OcrPage/RawOcrTable.tsx` | 5260 | 48 | large-file-critical(1) |
| 3 | `src/components/DisplayPage/DisplayPage.tsx` | 3127 | 32 | large-file-critical(1) |
| 4 | `src/components/OrderManagePage/OrderManagePage.tsx` | 3206 | 32 | large-file-critical(1) |
| 5 | `src/components/DayTimelineModal/DayTimelineModal.tsx` | 2242 | 24 | large-file-critical(1) |
| 6 | `src/components/LandingPage/LandingPage.tsx` | 2467 | 24 | large-file-critical(1) |
| 7 | `src/components/LandingPage/VendorListEditor.tsx` | 2038 | 24 | large-file-critical(1) |
| 8 | `src/components/SalesTrendPage/SalesTrendPage.tsx` | 2677 | 24 | large-file-critical(1) |
| 9 | `src/components/SchedulePage/SchedulePage.tsx` | 2379 | 24 | large-file-critical(1) |
| 10 | `src/components/StaffManagePage/StaffManagePage.tsx` | 2729 | 24 | large-file-critical(1) |
| 11 | `src/components/OcrPage/OcrPage.tsx` | 1216 | 6 | large-file-warn(1) |
| 12 | `src/components/OrderManagePage/PaymentInfoTab.tsx` | 1681 | 6 | large-file-warn(1) |
| 13 | `src/components/OrderManagePage/PurchaseHistoryTab/PurchaseSubTabs.tsx` | 1146 | 6 | large-file-warn(1) |
| 14 | `src/components/OrderManagePage/PurchaseHistoryTab.tsx` | 1159 | 6 | large-file-warn(1) |
| 15 | `src/components/OrderManagePage/ReturnListPanel.tsx` | 1180 | 6 | large-file-warn(1) |
| 16 | `src/components/ProductArrivalPage/ProductArrivalPage.tsx` | 1041 | 6 | large-file-warn(1) |
| 17 | `src/components/RequestsPage/RequestsPage.tsx` | 1226 | 6 | large-file-warn(1) |
| 18 | `src/components/ScanPage/ScanPage.tsx` | 1106 | 6 | large-file-warn(1) |
| 19 | `src/components/StockManagePage/FlowTab.tsx` | 1076 | 6 | large-file-warn(1) |
| 20 | `src/components/BoardPage/BoardPage.tsx` | 850 | 3 | large-file-warn(1) |
| 21 | `src/components/ContractSettingsPage/ContractSettingsPage.tsx` | 887 | 3 | large-file-warn(1) |
| 22 | `src/components/EmployeeCalendarModal/EmployeeCalendarModal.tsx` | 962 | 3 | large-file-warn(1) |
| 23 | `src/components/PermissionsPage/PermissionsPage.tsx` | 965 | 3 | large-file-warn(1) |
| 24 | `src/components/ScanPage/ProductInfoCard.tsx` | 895 | 3 | large-file-warn(1) |
| 25 | `src/components/StockManagePage/SupplierTab.tsx` | 991 | 3 | large-file-warn(1) |

## 📝 모든 위반 파일 (25개)

<details><summary>펼치기 · 파일 리스트</summary>

| 파일 | 라인 | 위반 |
|---|---:|---:|
| `src/components/ContractWriterPage/ContractWriterPage.tsx` | 5483 | 48 |
| `src/components/OcrPage/RawOcrTable.tsx` | 5260 | 48 |
| `src/components/DisplayPage/DisplayPage.tsx` | 3127 | 32 |
| `src/components/OrderManagePage/OrderManagePage.tsx` | 3206 | 32 |
| `src/components/DayTimelineModal/DayTimelineModal.tsx` | 2242 | 24 |
| `src/components/LandingPage/LandingPage.tsx` | 2467 | 24 |
| `src/components/LandingPage/VendorListEditor.tsx` | 2038 | 24 |
| `src/components/SalesTrendPage/SalesTrendPage.tsx` | 2677 | 24 |
| `src/components/SchedulePage/SchedulePage.tsx` | 2379 | 24 |
| `src/components/StaffManagePage/StaffManagePage.tsx` | 2729 | 24 |
| `src/components/OcrPage/OcrPage.tsx` | 1216 | 6 |
| `src/components/OrderManagePage/PaymentInfoTab.tsx` | 1681 | 6 |
| `src/components/OrderManagePage/PurchaseHistoryTab/PurchaseSubTabs.tsx` | 1146 | 6 |
| `src/components/OrderManagePage/PurchaseHistoryTab.tsx` | 1159 | 6 |
| `src/components/OrderManagePage/ReturnListPanel.tsx` | 1180 | 6 |
| `src/components/ProductArrivalPage/ProductArrivalPage.tsx` | 1041 | 6 |
| `src/components/RequestsPage/RequestsPage.tsx` | 1226 | 6 |
| `src/components/ScanPage/ScanPage.tsx` | 1106 | 6 |
| `src/components/StockManagePage/FlowTab.tsx` | 1076 | 6 |
| `src/components/BoardPage/BoardPage.tsx` | 850 | 3 |
| `src/components/ContractSettingsPage/ContractSettingsPage.tsx` | 887 | 3 |
| `src/components/EmployeeCalendarModal/EmployeeCalendarModal.tsx` | 962 | 3 |
| `src/components/PermissionsPage/PermissionsPage.tsx` | 965 | 3 |
| `src/components/ScanPage/ProductInfoCard.tsx` | 895 | 3 |
| `src/components/StockManagePage/SupplierTab.tsx` | 991 | 3 |

</details>

## 🎯 다음 액션 (권장)

1. `docs/FRAMEWORK_ROADMAP.md` Phase 2 · ESLint 룰 도입 · pre-commit hook
2. TOP 5 파일 · 대원칙 준수 이관 (매 커밋 격리 · TS+test 검증)
3. 주간 재실행 · 진행률 트래킹
