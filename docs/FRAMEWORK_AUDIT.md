# Framework Audit Report (자동 생성)

> 생성 · 2026-10-04 · `scripts/audit-framework.cjs` · 매 세션 재실행
>
> **로드맵 · `docs/FRAMEWORK_ROADMAP.md` Phase 1 (인벤토리)**

## 📊 요약

| 지표 | 값 |
|---|---:|
| 스캔 파일 | 1123 |
| 위반 파일 | 98 |
| 클린 파일 | 1025 (91%) |
| 총 위반 개수 | 527 |

## 🚨 규칙별 위반 현황

| 규칙 | 총 위반 | 파일 수 | severity | 수정 방향 |
|---|---:|---:|---|---|
| `large-file-warn` | 14 | 14 | medium | 800-2000라인 · 서브 컴포넌트 분리 권장 |
| `no-raw-console-server` | 274 | 28 | medium | logger.info / logger.warn / logger.error (server/lib/logger.ts) |
| `no-any-server` | 237 | 67 | medium | 구체 타입 · unknown + type guard · zod 스키마 추론 |
| `prefer-modal-primitive` | 2 | 2 | medium | Modal 프리미티브 (src/components/common/Modal.tsx) |

## 🔥 우선순위 파일 (weight 순 · TOP 30)

| # | 파일 | 라인 | 총 위반 | 위반 상세 |
|---:|---|---:|---:|---|
| 1 | `server/ocr/pipeline/stages/03-vendor-match.ts` | 684 | 140 | no-raw-console-server(70) |
| 2 | `server/routes/ocr/coreRouter.ts` | 741 | 102 | no-raw-console-server(41) · no-any-server(20) |
| 3 | `server/ocr/parsing/parse.ts` | 2998 | 74 | no-raw-console-server(31) · no-any-server(12) |
| 4 | `server/ocr/engines/ppuPaddle.ts` | 729 | 71 | no-raw-console-server(33) · no-any-server(5) |
| 5 | `server/routes/ocr/parseRouter.ts` | 186 | 33 | no-raw-console-server(13) · no-any-server(7) |
| 6 | `server/ocr/pipeline/stages/05-normalize.ts` | 248 | 25 | no-raw-console-server(12) · no-any-server(1) |
| 7 | `server/routes/display/requests.ts` | 1600 | 20 | no-any-server(20) |
| 8 | `server/ocr/pipeline/stages/09-totals.ts` | 147 | 18 | no-raw-console-server(9) |
| 9 | `server/ocr/tables/slanetTable.ts` | 278 | 16 | no-raw-console-server(5) · no-any-server(6) |
| 10 | `server/ocr/tables/tableLayout.ts` | 171 | 16 | no-raw-console-server(7) · no-any-server(2) |
| 11 | `server/routes/purchase/purchase.ts` | 723 | 11 | no-any-server(11) |
| 12 | `server/routes/stock/salesAutoRecommend.ts` | 378 | 11 | no-raw-console-server(4) · no-any-server(3) |
| 13 | `server/ocr/pipeline/stages/04-template.ts` | 43 | 10 | no-raw-console-server(5) |
| 14 | `server/routes/ocr/helpers.ts` | 264 | 10 | no-raw-console-server(5) |
| 15 | `server/ocr/logging/diagnostics.ts` | 246 | 9 | no-raw-console-server(4) · no-any-server(1) |
| 16 | `server/ocr/pipeline/stages/02-ocr-engine.ts` | 99 | 9 | no-raw-console-server(4) · no-any-server(1) |
| 17 | `server/ocr/tables/tableStructure.ts` | 126 | 9 | no-raw-console-server(3) · no-any-server(3) |
| 18 | `server/routes/purchase/vendors.ts` | 639 | 9 | no-any-server(9) |
| 19 | `server/ocr/parsing/preprocess.ts` | 159 | 8 | no-raw-console-server(4) |
| 20 | `server/ocr/pipeline/runner.ts` | 78 | 8 | no-raw-console-server(4) |
| 21 | `server/routes/board/board.ts` | 519 | 8 | no-any-server(8) |
| 22 | `server/routes/settings/eventCategoryRules.ts` | 169 | 8 | no-raw-console-server(4) |
| 23 | `server/ocr/logging/fieldMatchLog.ts` | 229 | 7 | no-raw-console-server(2) · no-any-server(3) |
| 24 | `src/components/LeavePage/LeavePage.tsx` | 1397 | 6 | large-file-warn(1) |
| 25 | `src/components/OrderManagePage/PurchaseHistoryTab.tsx` | 1051 | 6 | large-file-warn(1) |
| 26 | `src/components/ProductInfoPage/ProductInfoPage.tsx` | 1119 | 6 | large-file-warn(1) |
| 27 | `server/ocr/pipeline/stages/08-verify.ts` | 34 | 6 | no-raw-console-server(3) |
| 28 | `server/routes/purchase/supplierPayments/balance.ts` | 502 | 6 | no-any-server(6) |
| 29 | `server/routes/purchase/supplierPayments/purchaseDetail.ts` | 170 | 6 | no-any-server(6) |
| 30 | `server/routes/purchase/vat.ts` | 553 | 6 | no-any-server(6) |

## 📝 모든 위반 파일 (98개)

<details><summary>펼치기 · 파일 리스트</summary>

| 파일 | 라인 | 위반 |
|---|---:|---:|
| `server/ocr/pipeline/stages/03-vendor-match.ts` | 684 | 140 |
| `server/routes/ocr/coreRouter.ts` | 741 | 102 |
| `server/ocr/parsing/parse.ts` | 2998 | 74 |
| `server/ocr/engines/ppuPaddle.ts` | 729 | 71 |
| `server/routes/ocr/parseRouter.ts` | 186 | 33 |
| `server/ocr/pipeline/stages/05-normalize.ts` | 248 | 25 |
| `server/routes/display/requests.ts` | 1600 | 20 |
| `server/ocr/pipeline/stages/09-totals.ts` | 147 | 18 |
| `server/ocr/tables/slanetTable.ts` | 278 | 16 |
| `server/ocr/tables/tableLayout.ts` | 171 | 16 |
| `server/routes/purchase/purchase.ts` | 723 | 11 |
| `server/routes/stock/salesAutoRecommend.ts` | 378 | 11 |
| `server/ocr/pipeline/stages/04-template.ts` | 43 | 10 |
| `server/routes/ocr/helpers.ts` | 264 | 10 |
| `server/ocr/logging/diagnostics.ts` | 246 | 9 |
| `server/ocr/pipeline/stages/02-ocr-engine.ts` | 99 | 9 |
| `server/ocr/tables/tableStructure.ts` | 126 | 9 |
| `server/routes/purchase/vendors.ts` | 639 | 9 |
| `server/ocr/parsing/preprocess.ts` | 159 | 8 |
| `server/ocr/pipeline/runner.ts` | 78 | 8 |
| `server/routes/board/board.ts` | 519 | 8 |
| `server/routes/settings/eventCategoryRules.ts` | 169 | 8 |
| `server/ocr/logging/fieldMatchLog.ts` | 229 | 7 |
| `src/components/LeavePage/LeavePage.tsx` | 1397 | 6 |
| `src/components/OrderManagePage/PurchaseHistoryTab.tsx` | 1051 | 6 |
| `src/components/ProductInfoPage/ProductInfoPage.tsx` | 1119 | 6 |
| `server/ocr/pipeline/stages/08-verify.ts` | 34 | 6 |
| `server/routes/purchase/supplierPayments/balance.ts` | 502 | 6 |
| `server/routes/purchase/supplierPayments/purchaseDetail.ts` | 170 | 6 |
| `server/routes/purchase/vat.ts` | 553 | 6 |
| `server/routes/stock/stockManage/topSales.ts` | 771 | 6 |
| `server/lib/auditLogger.ts` | 79 | 5 |
| `server/routes/display/zoneDefs.ts` | 173 | 5 |
| `server/routes/ocr/diagRouter.ts` | 54 | 5 |
| `server/routes/payment/borrowings.ts` | 308 | 5 |
| `server/routes/stock/productArrivals.ts` | 669 | 5 |
| `server/utils/xlsx.ts` | 251 | 5 |
| `server/ocr/pipeline/stages/10-fallback.ts` | 79 | 4 |
| `server/routes/ocr/matchRouter.ts` | 161 | 4 |
| `server/routes/settings/events.ts` | 278 | 4 |
| `server/routes/settings/settings.ts` | 483 | 4 |
| `server/routes/stock/lossTracking.ts` | 297 | 4 |
| `server/routes/stock/products.ts` | 1349 | 4 |
| `server/services/googleDriveService.ts` | 466 | 4 |
| `src/components/LandingPage/LandingPage.tsx` | 805 | 3 |
| `src/components/LandingPage/VendorListEditor.tsx` | 852 | 3 |
| `src/components/OrderManagePage/OrderManagePage.tsx` | 871 | 3 |
| `src/components/OrderManagePage/PaymentInputPage.tsx` | 979 | 3 |
| `src/components/OrderManagePage/ReturnListPanel.tsx` | 801 | 3 |
| `src/components/OrderManagePage/SalesRecommendationPanel.tsx` | 873 | 3 |
| `src/components/ProductArrivalPage/ProductArrivalPage.tsx` | 937 | 3 |
| `src/components/SalesTrendPage/DashboardCharts.tsx` | 948 | 3 |
| `src/components/SalesTrendPage/DashboardTab.tsx` | 811 | 3 |
| `src/components/ScanPage/ScanPage.tsx` | 964 | 3 |
| `src/components/SchedulePage/SchedulePage.tsx` | 802 | 3 |
| `server/controllers/scheduleController.ts` | 294 | 3 |
| `server/productCache.ts` | 400 | 3 |
| `server/routes/settings/holidays.ts` | 254 | 3 |
| `server/services/scheduleService.ts` | 356 | 3 |
| `src/components/NotificationBell.tsx` | 334 | 2 |
| `src/components/OrderManagePage/EventProductAddModal.tsx` | 103 | 2 |
| `server/ocr/engines/gemini.ts` | 146 | 2 |
| `server/ocr/pipeline/benchmark.ts` | 177 | 2 |
| `server/ocr/pipeline/stages/01-preprocess.ts` | 24 | 2 |
| `server/ocr/pipeline/stages/06-math-fill.ts` | 34 | 2 |
| `server/ocr/pipeline/stages/07-filter.ts` | 25 | 2 |
| `server/ocr/pipeline/stages/10b-rearrange.ts` | 69 | 2 |
| `server/routes/daily/leave.ts` | 294 | 2 |
| `server/routes/display/zoneAssignments.ts` | 424 | 2 |
| `server/routes/display/zoneLabels.ts` | 106 | 2 |
| `server/routes/ocr/templatesRouter.ts` | 38 | 2 |
| `server/routes/purchase/returnRequests.ts` | 200 | 2 |
| `server/routes/purchase/supplierPayments/payments.ts` | 243 | 2 |
| `server/routes/purchase/supplierPayments/purchaseSummary.ts` | 238 | 2 |
| `server/routes/staff/employeeContracts.ts` | 607 | 2 |
| `server/routes/stock/stockManage/salesTrend.ts` | 304 | 2 |
| `server/services/notificationsService.ts` | 273 | 2 |
| `server/lib/optimalStock.ts` | 258 | 1 |
| `server/lib/ownershipCheck.ts` | 41 | 1 |
| `server/ocr/parsing/metadataKV.ts` | 407 | 1 |
| `server/ocr/parsing/schema.ts` | 279 | 1 |
| `server/ocr/pipeline/types.ts` | 119 | 1 |
| `server/routes/daily/reservations.ts` | 54 | 1 |
| `server/routes/display/mismatches.ts` | 128 | 1 |
| `server/routes/purchase/creditCards.ts` | 178 | 1 |
| `server/routes/purchase/ocrDeletedRows.ts` | 112 | 1 |
| `server/routes/purchase/purchaseHistory.ts` | 110 | 1 |
| `server/routes/purchase/supplierBalanceConfig.ts` | 87 | 1 |
| `server/routes/settings/autoImport.ts` | 413 | 1 |
| `server/routes/staff/contractClauses.ts` | 168 | 1 |
| `server/routes/staff/staff.ts` | 90 | 1 |
| `server/routes/stock/stockManage/periodCoverage.ts` | 53 | 1 |
| `server/routes/stock/stockManage/productHistory.ts` | 44 | 1 |
| `server/routes/stock/stockManage/stockRaw.ts` | 41 | 1 |
| `server/routes/stock/stockManage/trending.ts` | 259 | 1 |
| `server/routes/stock/stockManage/uploadStock.ts` | 314 | 1 |
| `server/utils/productInventoryQuery.ts` | 282 | 1 |
| `server/utils/purchaseDetailsQuery.ts` | 243 | 1 |

</details>

## 🎯 다음 액션 (권장)

1. `docs/FRAMEWORK_ROADMAP.md` Phase 2 · ESLint 룰 도입 · pre-commit hook
2. TOP 5 파일 · 대원칙 준수 이관 (매 커밋 격리 · TS+test 검증)
3. 주간 재실행 · 진행률 트래킹
