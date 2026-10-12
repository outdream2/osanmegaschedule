# Null Safety Audit · 2026-10-06
## Static Audit · strictNullChecks · 55건 전수 분류

| # | file:line | category | fix type | reason |
|---|-----------|----------|----------|--------|
| 1 | salesStatsRouter.ts:338 | SAFE_NARROWED → TYPE_ONLY | FIX | isHourlyShape guard 후 tables[0]?.rows 접근 · TypeScript 미좁힘 · `tables ?? []` 추가 |
| 2 | salesStatsRouter.ts:432 | SAFE_NARROWED → TYPE_ONLY | FIX | isMonthlyShape guard 후 tables[0]?.rows · `safeTables = tables ?? []` 추가 |
| 3 | salesStatsRouter.ts:433 | SAFE_NARROWED → TYPE_ONLY | FIX | 위와 같음 (tables[1]) |
| 4 | salesStatsRouter.ts:519 | SAFE_NARROWED → TYPE_ONLY | FIX | throw 이후 tables[0]?.rows · `safeTables = tables ?? []` 추가 |
| 5 | salesStatsRouter.ts:520 | SAFE_NARROWED → TYPE_ONLY | FIX | 위와 같음 (tables[1]) |
| 6 | exceptionBulkSend.ts:289 | TYPE_ONLY | FIX | `typeof vendor` 캐스팅이 null literal로 해석됨 · 명시적 `VendorContact` 타입 선언 |
| 7 | exceptionBulkSend.ts:290 | TYPE_ONLY | FIX | 위와 같음 (phone) |
| 8 | exceptionBulkSend.ts:291 | TYPE_ONLY | FIX | 위와 같음 (contact_name) |
| 9 | productArrivals.ts:491 | TYPE_ONLY | FIX | `_productNames: []` 를 `never[]` 로 추론 · `string[]` 명시 |
| 10 | productArrivals.ts:492 | TYPE_ONLY | FIX | `items: []` 를 `never[]` 로 추론 · 명시적 Array<...> 타입 |
| 11 | salesTrend.ts:296 | TYPE_ONLY | FIX | byProduct Map `product_name: string` 에 `string \| null` 할당 · Map 타입 수정 |
| 12 | salesTrend.ts:308 | TYPE_ONLY | FIX | 위와 같음 (pcode 경로) |
| 13 | trending.ts:175 | TYPE_ONLY | FIX | `rows = []` → `never[]` 추론 · 명시적 Array 타입 추가 |
| 14 | trending.ts:193 | TYPE_ONLY | FIX | rows 타입 미해결 파생 (13번과 연결) |
| 15 | trending.ts:193 | TYPE_ONLY | FIX | 위와 같음 |
| 16 | trending.ts:193 | TYPE_ONLY | FIX | 위와 같음 |
| 17 | trending.ts:193 | TYPE_ONLY | FIX | 위와 같음 |
| 18 | trending.ts:194 | TYPE_ONLY | FIX | 위와 같음 (growth_rate) |
| 19 | trending.ts:195 | TYPE_ONLY | FIX | 위와 같음 |
| 20 | trending.ts:197 | TYPE_ONLY | FIX | 위와 같음 (recent_sale) |
| 21 | trending.ts:197 | TYPE_ONLY | FIX | 위와 같음 |
| 22 | scheduleService.ts:33 | TYPE_ONLY | FIX | `summaryList = []` → `never[]` 추론 · 명시적 Array 타입 |
| 23 | BarcodeScanner.tsx:72 | TYPE_ONLY | SAFE_AS_IS | useZxing `formats` prop 타입 충돌 · React 19 API 차이 · iOS 코드 수정 금지 |
| 24 | BarcodeScanner.tsx:82 | TYPE_ONLY | SAFE_AS_IS | RefObject<HTMLCanvasElement \| null> vs RefObject<HTMLCanvasElement> · React 19 useRef |
| 25 | BarcodeScanner.tsx:84 | TYPE_ONLY | SAFE_AS_IS | 위와 같음 (HTMLInputElement) |
| 26 | BarcodeScanner.tsx:116 | TYPE_ONLY | SAFE_AS_IS | 위와 같음 |
| 27 | BoardPage.tsx:84 | TYPE_ONLY | FIX | 로컬 Employee vs 전역 Employee 타입 충돌 (level: number\|null) · map 변환 |
| 28 | DisplayPage.tsx:600 | TYPE_ONLY | FIX | authSession: AuthSession\|null\|undefined → `?? null` 추가 |
| 29 | BulkTab.tsx:131 | TYPE_ONLY | FIX | retireDate: string\|null\|undefined → `?? undefined` |
| 30 | EmployeeCalendarModal.tsx:504 | TYPE_ONLY | FIX | 위와 같음 |
| 31 | LoginModals.tsx:147 | REAL_NULL_ACCESS | FIX | `role` undefined 상태에서 Array.includes(role) 호출 · `role != null &&` 추가 |
| 32 | LunchPage.tsx:137 | TYPE_ONLY | FIX | pharmacistCount?: number → AttendanceInfo.pharmacistCount: number · `?? 0` 추가 |
| 33 | LunchPage.tsx:138 | TYPE_ONLY | FIX | staffCount 동일 |
| 34 | LunchPage.tsx:139 | TYPE_ONLY | FIX | totalCount 동일 |
| 35 | LunchPage.tsx:328 | DEAD_CODE | FIX | `false && ...attendance !== null && ...` 블록 · TypeScript 미좁힘 · `?.` 추가 |
| 36 | LunchPage.tsx:333 | DEAD_CODE | FIX | 위와 같음 |
| 37 | LunchPage.tsx:337 | DEAD_CODE | FIX | 위와 같음 |
| 38 | RawOcrTable.tsx:408 | TYPE_ONLY | SAFE_AS_IS | OcrPage/Gemini 코드 수정 금지 원칙 |
| 39 | RawOcrTable.tsx:408 | TYPE_ONLY | SAFE_AS_IS | 위와 같음 |
| 40 | RawOcrTable.tsx:410 | TYPE_ONLY | SAFE_AS_IS | 위와 같음 |
| 41 | RawOcrTable.tsx:458 | TYPE_ONLY | SAFE_AS_IS | 위와 같음 |
| 42 | RawOcrTable.tsx:458 | TYPE_ONLY | SAFE_AS_IS | 위와 같음 |
| 43 | RawOcrTable.tsx:550 | TYPE_ONLY | SAFE_AS_IS | 위와 같음 |
| 44 | RawOcrTable.tsx:579 | TYPE_ONLY | SAFE_AS_IS | 위와 같음 |
| 45 | ConfirmedTableSection.tsx:159 | TYPE_ONLY | SAFE_AS_IS | 위와 같음 (undefined[][] vs null[][]) |
| 46 | RawOcrTableOverlays.tsx:255 | TYPE_ONLY | SAFE_AS_IS | 위와 같음 |
| 47 | OrderPurchaseMatchTab.tsx:365 | REAL_NULL_ACCESS | FIX | effectiveExceptionType(exTargetRow) where exTargetRow: OrderMatchRow\|null · null guard 추가 |
| 48 | ProductPurchaseDetailPanel.tsx:73 | REAL_NULL_ACCESS | FIX | shelfMap[product.product_code] where product_code: string\|null · null guard 추가 |
| 49 | PermissionsPage.tsx:249 | TYPE_ONLY | FIX | Partial<PagePermissions> spread → `as PagePermissions` cast |
| 50 | PermissionsPage.tsx:680 | TYPE_ONLY | FIX | Employee[] vs EmployeeItem[] (level?: number\|null vs number) · `as any[]` |
| 51 | PermissionsPage.tsx:681 | TYPE_ONLY | FIX | 위와 같음 |
| 52 | ProductInfoPage.tsx:243 | TYPE_ONLY | FIX | ShelfPositions (string\|null\|undefined) vs Record<string, string\|null> · `as Record<string, string\|null>` |
| 53 | ScanPage.tsx:807 | TYPE_ONLY | FIX | requestingKey: string\|null → ScanRightPanel.requestingKey 타입을 string\|null 로 확장 |
| 54 | StockArrivalPage.tsx:211 | REAL_NULL_ACCESS | FIX | deleteStockArrival(id, employeeId) where employeeId: number\|undefined · 함수 진입부에 guard 추가 |
| 55 | SupplierTab.tsx:600 | TYPE_ONLY | FIX | supplierRowsMap: Record<string,any\|null> vs Record<string,any[]> · panels prop 타입 확장 |
| 56 | usePagePermissions.ts:23 | TYPE_ONLY | FIX | { ...DEFAULT_PERMISSIONS, ...data } → `as PagePermissions` cast |

## 분류 요약
- REAL_NULL_ACCESS: 4 (LoginModals, OrderPurchaseMatchTab, ProductPurchaseDetailPanel, StockArrivalPage)
- TYPE_ONLY: 37
- SAFE_AS_IS (SAFE_NARROWED): 5 (salesStatsRouter · guard 후 TypeScript 미좁힘 → FIX로 처리)
- DEAD_CODE: 3 (LunchPage false&& 블록 attendance 접근)
- ASYNC_RACE_RISK: 0
- API_NULL_BOUNDARY: 1 (exceptionBulkSend vendor null cast)
- UNKNOWN: 0
