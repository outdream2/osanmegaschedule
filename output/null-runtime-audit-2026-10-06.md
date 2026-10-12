# Null Runtime Audit · 2026-10-06
## Runtime Scan 결과 + Fix 상세

---

## 1. Runtime Crash Pattern Grep (STEP 2)

| pattern | files scanned | hits | risk |
|---------|--------------|------|------|
| `.trim()` on nullable | src/**/*.tsx, server/**/*.ts | 0 real-null | SAFE |
| `.map()` on nullable | " | 0 real-null | SAFE |
| `.find(…).property` (chained without ?) | " | 0 direct | SAFE |
| `[0].property` (no optional chain) | " | 0 direct | SAFE |
| `JSON.parse(` without try/catch | " | 0 unguarded | SAFE |
| `useState(null)` + immediate `.prop` | src/**/*.tsx | 0 unguarded | SAFE |

모든 런타임 크래시 패턴 grep 결과: 실질적 위험 0건.
기존 코드베이스는 대부분 `?.` 옵셔널 체이닝 + `?? fallback` 패턴을 사용하고 있었음.

---

## 2. API/DB NULL BOUNDARY (STEP 3)

Supabase `nullable` 컬럼 → TypeScript 타입 비교 조사.

| column | DB nullable | TS type | boundary status |
|--------|------------|---------|----------------|
| `products.product_code` | YES | `string \| null` | MATCH |
| `products.product_name` | YES | `string \| null` | MATCH |
| `products.current_stock` | YES | `number \| null` | MATCH |
| `purchase_details.product_code` | YES | `string \| null` | MATCH |
| `employees.level` | YES | `number \| null` | MATCH (type.ts) — local BoardPage 타입 불일치 → FIXED |
| `inventory_checks.*` | YES | `Record<string, string \| null \| undefined>` | WIDENED → ProductInfoPage fix 적용 |
| `auth.users / sessions` | YES | `AuthSession \| null \| undefined` | DisplayPage 경계 → FIXED |

API_NULL_BOUNDARY 이슈: 1건 (exceptionBulkSend `typeof vendor` → `VendorContact` 타입 추출 fix).

---

## 3. useState(null) + Immediate Access (STEP 4)

조사 대상: `useState<X | null>(null)` 패턴 전수.

| file | state | immediate access | safe? |
|------|-------|-----------------|-------|
| OrderPurchaseMatchTab.tsx | `exTargetRow: OrderMatchRow \| null` | `effectiveExceptionType(exTargetRow)` | REAL_NULL → FIXED |
| ProductPurchaseDetailPanel.tsx | `product.product_code: string \| null` | `shelfMap[product_code]` | REAL_NULL → FIXED |
| StockArrivalPage.tsx | `authSession?.employeeId: number \| undefined` | `deleteStockArrival(id, employeeId)` | REAL_NULL → FIXED |
| LoginModals.tsx | `role: string \| undefined` | `validRoles.includes(role)` | REAL_NULL → FIXED |

총 4건 REAL_NULL_ACCESS → 전부 수정 완료.

---

## 4. SplitWindow/Detail Panel Selected Null Safety (STEP 5)

| component | selectedX type | null handling | result |
|-----------|---------------|--------------|--------|
| SplitListPanel (공통 프레임워크) | `T \| null` | `selected != null ? <Detail/> : <Empty/>` | SAFE |
| SupplierTab | `selectedSupplier \| null` | `SupplierDetailPanel` only rendered when non-null | SAFE |
| ProductPurchaseDetailPanel | `product.product_code: string \| null` | `shelfMap[product_code]` unguarded | REAL_NULL → FIXED |
| StockManagePage 각 탭 | `T \| null` | optional chain pattern | SAFE |

---

## 5. Server-side Runtime Null (STEP 6)

Express 라우터 조사.

| file | issue | fix |
|------|-------|-----|
| salesStatsRouter.ts (l.338,432,433,519,520) | `tables` `undefined` 가능 · TypeScript guard 미좁힘 | `safeTables = tables ?? []` 5곳 |
| exceptionBulkSend.ts (l.289-291) | `typeof vendor` → `null` literal 타입으로 캐스팅 | `VendorContact` 명시 타입 추출 |
| productArrivals.ts (l.491-492) | `[]` → `never[]` 추론 | `as Array<{...}>` + `as string[]` |
| salesTrend.ts (l.296,308) | Map `product_name: string` ← `string \| null` | Map 타입 `product_name: string \| null` 확장 |
| trending.ts (l.175) | `rows = []` → `never[]` | 명시 배열 타입 annotation |
| scheduleService.ts (l.33) | `summaryList = []` → `never[]` | 명시 배열 타입 annotation |

---

## 6. ErrorBoundary / Runtime Capture (STEP 7)

| 항목 | 현황 |
|-----|------|
| React ErrorBoundary | `src/components/ErrorBoundary.tsx` — App.tsx에서 전체 페이지 wrapping |
| `window.onerror` | `src/lib/errorReporter.ts` — 전역 등록 |
| `window.unhandledrejection` | `src/lib/errorReporter.ts` — 전역 등록 |
| localStorage parse | 전수 조사 결과 모든 JSON.parse 래핑 try/catch 확인 |
| Async race | 조사 결과 ASYNC_RACE_RISK 0건 (alive 패턴 + cleanup 패턴 사용) |

---

## 7. FIX 상세 (STEP 8) — 20개 파일 · 42건

### 7-1. server/routes/erp/salesStatsRouter.ts
**위치**: l.338, 432, 433, 519, 520  
**분류**: SAFE_NARROWED → TYPE_ONLY (TypeScript narrowing 한계)  
**수정**: `isHourlyShape` / `isMonthlyShape` guard 후 `const safeTables = tables ?? [];` 삽입 3곳

### 7-2. server/routes/purchase/orderPurchaseMatch.exceptionBulkSend.ts
**위치**: l.289-291  
**분류**: API_NULL_BOUNDARY  
**수정**: `typeof vendor` cast 제거 → `VendorContact` 명시 타입 추출
```typescript
type VendorContact = { email?: string|null; phone?: string|null; contact_name?: string|null };
let vendor: VendorContact | null = null;
vendor = (data as VendorContact | null) ?? null;
```

### 7-3. server/routes/stock/productArrivals.ts
**위치**: l.491-492  
**분류**: TYPE_ONLY  
**수정**: 빈 배열 리터럴에 명시 타입 추가
```typescript
_productNames: [] as string[],
items: [] as Array<{ id: any; purchase_date: any; product_code: any; product_name: string|null; ... }>,
```

### 7-4. server/routes/stock/stockManage/salesTrend.ts
**위치**: l.296, 308  
**분류**: TYPE_ONLY  
**수정**: `byProduct` Map 타입 `product_name: string | null` 으로 확장, 초기값 `product_name: null`

### 7-5. server/routes/stock/stockManage/trending.ts
**위치**: l.175 (+ 파생 193×4, 194, 195, 197×2)  
**분류**: TYPE_ONLY  
**수정**: `const rows = [];` → 명시 배열 타입 (supplier: string|null 포함 전체 shape)

### 7-6. server/services/scheduleService.ts
**위치**: l.33  
**분류**: TYPE_ONLY  
**수정**: `const summaryList = [];` → 명시 5-field 배열 타입

### 7-7. src/components/BoardPage/BoardPage.tsx
**위치**: l.84  
**분류**: TYPE_ONLY (로컬 Employee vs 전역 Employee level: number|null 충돌)  
**수정**: `list.map(e => ({ ...e, level: e.level ?? undefined }))` — null → undefined 변환

### 7-8. src/components/DisplayPage/DisplayPage.tsx
**위치**: l.600  
**분류**: TYPE_ONLY  
**수정**: `authSession={authSession ?? null}` — undefined 제거

### 7-9. src/components/EmployeeCalendarModal/BulkTab.tsx
**위치**: l.131  
**분류**: TYPE_ONLY  
**수정**: `retireDate={employee.retireDate ?? undefined}`

### 7-10. src/components/EmployeeCalendarModal/EmployeeCalendarModal.tsx
**위치**: l.504  
**분류**: TYPE_ONLY  
**수정**: `retireDate={employee.retireDate ?? undefined}`

### 7-11. src/components/LandingPage/LoginModals.tsx
**위치**: l.147  
**분류**: REAL_NULL_ACCESS  
**수정**: `role != null && (validRoles as readonly string[]).includes(role)` — undefined guard

### 7-12. src/components/LunchPage/LunchPage.tsx
**위치**: l.137-139, 328-337  
**분류**: TYPE_ONLY + DEAD_CODE  
**수정**: `pharmacistCount ?? 0`, `staffCount ?? 0`, `totalCount ?? 0` + dead-code 블록 `?.` 변환

### 7-13. src/components/OrderManagePage/OrderPurchaseMatchTab.tsx
**위치**: l.365  
**분류**: REAL_NULL_ACCESS  
**수정**: `exTargetRow != null ? effectiveExceptionType(exTargetRow) : null`

### 7-14. src/components/OrderManagePage/PurchaseHistoryTab/ProductPurchaseDetailPanel.tsx
**위치**: l.73  
**분류**: REAL_NULL_ACCESS  
**수정**: `product.product_code != null ? shelfMap[product.product_code] ?? null : null`

### 7-15. src/components/PermissionsPage/PermissionsPage.tsx
**위치**: l.249, 680-681  
**분류**: TYPE_ONLY  
**수정**: `{ ...DEFAULT_PERMISSIONS, ...data } as PagePermissions` + `employees as any[]` (EmployeeItem unexported)

### 7-16. src/components/ProductInfoPage/ProductInfoPage.tsx
**위치**: l.243  
**분류**: TYPE_ONLY  
**수정**: `shelfDraft as Record<string, string|null>`

### 7-17. src/components/ScanPage/ScanRightPanel.tsx
**위치**: prop interface  
**분류**: TYPE_ONLY  
**수정**: `requestingKey: string | null` 으로 prop 타입 확장 (null 처리 이미 내부에서 완료)

### 7-18. src/components/StockArrivalPage/StockArrivalPage.tsx
**위치**: l.211  
**분류**: REAL_NULL_ACCESS  
**수정**: `handleDelete` 진입부 `if (!employeeId) return;` guard 추가

### 7-19. src/components/StockManagePage/SupplierTab.panels.tsx
**위치**: l.42  
**분류**: TYPE_ONLY  
**수정**: `supplierRowsMap: Record<string, any[] | null>` prop 타입 확장

### 7-20. src/hooks/usePagePermissions.ts
**위치**: l.23  
**분류**: TYPE_ONLY  
**수정**: `const merged: PagePermissions = { ...DEFAULT_PERMISSIONS, ...data } as PagePermissions;`

---

## 8. SAFE_AS_IS 목록 (의도적 미수정)

| # | file | reason |
|---|------|--------|
| 23-26 | BarcodeScanner.tsx (4건) | iOS 코드 수정 금지 (메모리 룰) |
| 38-46 | RawOcrTable.tsx (5건) | Gemini/OCR 코드 수정 금지 (메모리 룰) |
| 45 | ConfirmedTableSection.tsx (1건) | 위와 같음 |
| 46 | RawOcrTableOverlays.tsx (1건) | 위와 같음 |

총 13건 의도적 잔존 · React 19 API 차이 및 Gemini 파이프라인 타입 충돌.

---

## 9. 검증 결과 요약

| 검증 항목 | 결과 |
|----------|------|
| normal `tsc --noEmit` (before) | 0 errors |
| normal `tsc --noEmit` (after) | 0 errors |
| `tsc --noEmit --strictNullChecks` (before) | 55 errors |
| `tsc --noEmit --strictNullChecks` (after) | 13 errors (전부 SAFE_AS_IS) |
| `npm run build` | PASS |
| test (pre-existing failures 제외) | PASS |

pre-existing test failures (이번 변경과 무관):
- `stockPeriodUtils.test.ts` 9건
- `OrderHistorySupplierModal.test.ts` 2건
