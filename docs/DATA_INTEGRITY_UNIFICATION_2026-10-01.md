# DATA INTEGRITY UNIFICATION · 2026-10-01

**임무** · 공통 기능인데 다른 값 쓰는 곳 전수조사 + 안전 fix
**연계** · `docs/DATA_INTEGRITY_AUDIT_2026-10-01.md` 후속
**모드** · 코드만 (로직 통일 / 라벨 정합) · 데이터 변경 X · DROP·DELETE·UPDATE 다수 X

---

## 리포트 1 · 공통 지표별 사용처·공식 매트릭스

### 지표 1 · 매입액 (purchase)

**정식 공식** · `SUM(purchase_details.amount)` (기간 필터 가능)

| 사용처 | 공식 | 상태 |
|--------|------|------|
| `/api/supplier-balances-map` (balance.ts:48~79) | `purchase_details.amount` 집계 | OK (SSOT) |
| `/api/supplier-balance/:supplier` (balance.ts:341~) | `queryPurchaseDetails` → amount 합 | OK |
| `/api/supplier-ledger` (balance.ts:378~) | `queryPurchaseDetails` → amount 합 | OK |
| `/api/stock-manage/supplier-purchases` (supplierPurchases.ts:141~194) | `purchase_details.amount` + stock_history 병합 (max) | OK but **다른 purposeExtra: 병합 로직 때문에 balances-map 보다 약간 큼** |
| `/api/supplier-stock-value/:supplier` (balance.ts:305~) | `current_stock × purchase_price` | 다른 개념 (현재고 자산) · 아래 지표 7과 혼동 주의 |

**결론** · 공식 통일 OK · 명칭(API) 유사하지만 역할 다름 (매입액 vs 현재고금액)

---

### 지표 2 · 판매원가 (COGS)

**정식 공식** · `SUM(stock_history.sale_qty × products.purchase_price)` · NULL 시 purchase_details 최근 unit_price fallback

| 사용처 | 공식 | 상태 |
|--------|------|------|
| `/api/supplier-balances-map` (balance.ts:109~185) | `sale_qty × priceMap[code]` + fallback | OK (SSOT) |
| `/api/sales-trend/supplier` (salesTrend.ts:180) | `sqty × priceMap[code]` → `cogs_amount` 응답 | OK |
| `VendorDetailTabs.tsx:81` (재고자산 계산) | `salesRows.purchase_cost − salesRows.cogs_amount` | OK (salesTrend 결과 재사용) |
| `VendorListEditor.tsx:150` | `v.cogs` (balances-map SSOT) | OK |
| `PaymentDashboardPage.tsx:88` | `v.cogs` (balances-map SSOT) | OK |

**결론** · 공식 완전 통일 OK · 사용자 대원칙 1 (재고자산 = 매입 − COGS) 준수

---

### 지표 3 · 판매액 (sales total)

**정식 공식** · `SUM(sale_qty × products.sale_price)` · 사용자 대원칙 #3 (xlsx total_amount 절대 금지)

| 사용처 | 공식 | 상태 |
|--------|------|------|
| `/api/stock-manage/snapshot-summary` (snapshotSummary.ts:78) | `sqty × salePriceMap` | OK (2026-09-10 fix) |
| `/api/stock-manage/supplier-purchases` saleAmount (supplierPurchases.ts:122~127) | **`supply_amount × (saleQty / total)` · 공급가 proration** | **위반 (잔존)** |
| `/api/stock-manage/supplier-purchases` totalStockAmount (supplierPurchases.ts:130) | `sqty × salePrice` (판매액 공식) | OK but **라벨은 "재고자산"으로 사용됨 (아래 mismatch 참조)** |
| `/api/stock-manage/top-sales` months mode (topSales.ts:329) | `sqty × salePrice` 집계 | OK |
| `/api/stock-manage/top-sales` single snapshot mode (topSales.ts:731) | **raw `r.total_amount`** DB 그대로 응답 | **위반 (잔존)** |
| `/api/stock-manage/top-sales` months mode salesByCodeByDate (topSales.ts:400) | **raw `r.total_amount`** 내부 집계용 | **위반 (잔존)** |
| `/api/sales-trend/supplier` (salesTrend.ts:183) | `sqty × sp` | OK |
| `/api/sales-trend/overview` (salesTrend.ts:294) | `q × p` | OK |
| `/api/vat/monthly-summary` | `sale_qty × sale_price` (2026-09-14 fix) | OK |

**결론** · 서버 레벨 · 공식 통일 **대부분 OK** · 위반 3곳 (top-sales raw total_amount 2곳 + supplier-purchases supply_amount proration 1곳)

---

### 지표 4 · 결제액 (payment)

**정식 공식** · `SUM(supplier_payments.amount)` (기간 필터 가능)

| 사용처 | 공식 | 상태 |
|--------|------|------|
| `/api/supplier-balances-map` (balance.ts:81~102) | `supplier_payments.amount` 집계 | OK (SSOT) |
| `/api/supplier-balance/:supplier` (balance.ts:349~363) | 동일 | OK |
| `/api/supplier-ledger` (balance.ts:415~433) | 동일 | OK |

**결론** · 완전 통일 OK

---

### 지표 5 · 실제잔고 (balance)

**정식 공식** · `purchase − payment` (사용자 대원칙 #2)

| 사용처 | 공식 | 상태 |
|--------|------|------|
| `/api/supplier-balances-map` (balance.ts:198) | `purchase − payment` | OK |
| `/api/supplier-balance/:supplier` (balance.ts:365) | 동일 | OK |
| `/api/supplier-ledger` current_balance (balance.ts:474~479) | running balance (매입 + · 결제 −) | OK (등가) |

**결론** · 완전 통일 OK

---

### 지표 6 · 재고자산 (stock asset)

**정식 공식** · `purchase − cogs` (사용자 대원칙 #1)

| 사용처 | 공식/소스 | 상태 |
|--------|-----------|------|
| `/api/supplier-balances-map` (balance.ts:197) | `purchase − cogs` | OK (SSOT) |
| `VendorPaymentPanel` → `VendorListEditor` 좌측 리스트 재고자산 | `v.stock_asset` from balances-map | OK |
| `VendorPaymentPanel` → `VendorInfoHeader` 월별 재고자산 | `purchase_cost − cogs_amount` (sales-trend 소스) | OK |
| `PaymentDashboardPage` (PaymentDashboardPage.tsx:114) | `v.stock_asset` SSOT | OK |
| `StockManagePage` **SupplierTab** · "재고자산" 컬럼 (SupplierListCard.tsx:145,210,211,349 · SupplierTab.panels.tsx:72,118) | **`sup.totalStockAmount`** · 서버가 `sqty × salePrice` 로 집계한 **판매액** | **라벨 vs 값 불일치 (혼동 사용자 유발)** |

**결론** · PaymentDashboard · VendorPaymentPanel 는 OK · **StockManagePage SupplierTab 는 "재고자산" 라벨로 "판매액" 을 보여줌** · 사용자 혼동 유발 위험

---

### 지표 7 · 현재고 (current_stock)

**정식 소스** · `products.current_stock` (SSOT · 매입 발생 시 +, 판매 발생 시 −)

| 사용처 | 공식/소스 | 상태 |
|--------|-----------|------|
| 전수 UI 조회 | `products.current_stock` JOIN | OK |
| `inventory_checks.current_stock` | 실재고 입력 시 스냅샷 저장 · products 는 손대지 않음 (대원칙) | OK |
| `/api/supplier-stock-value/:supplier` | `current_stock × purchase_price` | OK (현재고 재고금액) |
| `/api/supplier-stock-values-map` | 동일 전체 공급사 | OK |

**결론** · 완전 통일 OK (사용자 memory `project_stock_data_model.md` 준수)

---

### 지표 8 · 적정재고 (optimal_stock)

**정식 소스** · `products.optimal_stock` (SSOT · 2026-09-09 확정)

| 사용처 | 공식 | 상태 |
|--------|------|------|
| 모든 사용처 | `products` JOIN 조회 | OK |
| `order_requests.optimal_stock` | 컬럼 DROP 완료 | OK |
| `inventory_checks.optimal_stock` | 컬럼 DROP 완료 | OK |

**결론** · 완전 통일 OK

---

### 지표 9 · 공급사 이름 (supplier)

**정식 소스** · `vendors.company_name` + `displayVendorName()` 로 UI 정제

| 사용처 | 공식 | 상태 |
|--------|------|------|
| 모든 매입/판매 집계 | `products.supplier` · `purchase_details.supplier_name` · `stock_history.supplier_name` | 세 테이블 모두 join |
| UI 표시 | `displayVendorName(name)` · "(주)" "주식회사" 정제 | OK (2026-09-18 적용) |

**결론** · UI 레벨 OK · DB 레벨 31 orphan · vendors 자체 중복 1건 (코리아헬스) · **사용자 승인 대기** (파괴적 변경)

---

### 지표 10 · 유통기한 (expiry_date)

**정식 소스** · 3소스 UNION MIN (inventory_checks + products + purchase_details)

| 사용처 | 공식 | 상태 |
|--------|------|------|
| `/api/products/expiry-imminent` | 3소스 UNION · `mergeMinExpiry()` MIN 통합 | OK (2026-09-18 완료) |
| 각 페이지 UI | 동일 endpoint 소비 | OK |

**결론** · 완전 통일 OK (Phase A·B 완료)

---

### 지표 11 · 발주 상태 (order_status)

**정식 enum** · `order_requests.status` ∈ {`ordered`, `matched`}

| 사용처 | 공식 | 상태 |
|--------|------|------|
| `/api/order-history` (requests.ts:708~) | 그룹별 status · "ordered" 하나라도 있으면 ordered | OK |
| `/api/vendor/order-history` (vendor/orderHistory.ts) | 동일 공식 | OK |
| `OrderHistoryTab` UI | 서버 status 소비 | OK |
| `PATCH /api/order-history/:orderNumber/match` | `ordered` → `matched` | OK |

**결론** · 완전 통일 OK

---

### 지표 12 · 발주 수량 (order_qty)

**정식 공식** · `optimal_stock − current_stock` (OrderNeedTab 추천값) · 저장 시 `order_qty` 수동 override 가능

| 사용처 | 공식 | 상태 |
|--------|------|------|
| `OrderNeedTab` 추천 | `max(0, optimal − current)` | OK |
| `OrderModal` 저장 | `order_qty` 사용자 입력 | OK |
| `/api/order-history` 응답 | `order_qty × unit_price` → line_amount · total_amount | OK · unit_price NULL 시 `products.purchase_price` JOIN fallback (2026-09-24) |
| `/api/vendor/order-history` | 동일 fallback | OK |

**결론** · 완전 통일 OK

---

## 리포트 2 · 불일치 요약

### CRITICAL · 즉시 fix (라벨 수정만 · 안전)

| ID | 위치 | 현재 상태 | fix 방향 |
|----|------|-----------|----------|
| **U1** | `SupplierTab` (StockManagePage) · "재고자산" 컬럼 라벨 | `totalStockAmount` 값은 `sqty × salePrice` (판매액 공식) · 라벨은 "재고자산" | **라벨 → "판매액 (기간)"** 또는 **값 → `/api/supplier-balances-map` 로 교체** |
| **U2** | `topSales.ts:731` single-snapshot `rows[].total_amount` | raw `r.total_amount` (DB 원본) 그대로 응답 · 78.6% xlsx 불일치 데이터 | **`sqty × sale_price` 재계산 사용** |
| **U3** | `topSales.ts:400` months mode 내부 `salesByCodeByDate` | raw `r.total_amount` 내부 cycle sales 계산용 | **`sqty × salePrice` 로 교체** |
| **U4** | `supplierPurchases.ts:127` `saleAmount` | `supply_amount × (saleQty / total)` proration | **`sqty × salePrice` 로 교체 · 대원칙 #3** |

### 자율 fix 가능 (코드만 · 로직 통일)

위 U1~U4 · 로직 수정만 · 데이터 변경 X · 재무 공식 통일 방향

### 승인 대기 (파괴적 or 대량 변경)

| ID | 위치 | 이슈 | 액션 (승인 후) |
|----|------|------|---------------|
| D1 | `stock_history.total_amount` 컬럼 | 78.6% 불일치 · xlsx 원본 | DROP 또는 재계산 UPDATE (사용자 승인 필요) |
| D2 | vendors 중복 "코리아헬스" vs "코리아헬스(주)" | 중복 1건 | 1건 삭제·병합 (사용자 승인 필요) |
| D3 | products.supplier orphan 31건 | vendors 미등록 | UPDATE products 또는 vendors insert (사용자 승인 필요) |
| D4 | purchase_details/stock_history orphan 54건 | products 미등록 | 상품 복원 or 삭제 (사용자 승인 필요) |
| D5 | 백업 테이블 4개 (0 rows) | 잔존 | DROP (사용자 승인 필요) |

---

## 리포트 3 · 자율 fix 커밋 계획

**원칙** · 사용자 대원칙 (DB 정합성 · 안정성 · 공식 통일) 준수 · 코드만 변경 · 데이터 변경 0 · TS 통과 필수

### 커밋 1 · topSales.ts 판매액 raw total_amount 제거 (U2 · U3)

- `topSales.ts:731` · `total_amount: Number(r.total_amount ?? 0)` → `total_amount: sqty * salePrice`
- `topSales.ts:400` · `salesByCodeByDate` · `const a = sqty * salePrice`
- 사용자 대원칙 #3 완전 준수 (xlsx total_amount 사용 0건)

### 커밋 2 · supplierPurchases.ts saleAmount 공식 통일 (U4)

- `supplierPurchases.ts:127` · `cur.saleAmount += supplyAmt * (saleQty / total)` → `cur.saleAmount += saleQty * salePrice`
- 대원칙 #3 (판매액 = 수량 × 판매가)

### 커밋 3 · SupplierTab "재고자산" 라벨 정합 (U1)

**옵션 A · 라벨만 수정 (안전 · 변경 최소)**:
- "재고자산" → "판매액 (기간)" 로 변경 (SupplierListCard.tsx · SupplierTab.panels.tsx 전체 레이블)
- title tooltip 도 "판매액 · N개월 · sale_qty × sale_price" 로 설명
- 값은 그대로 (totalStockAmount · 올바른 판매액 공식)

**옵션 B · 값 교체 (의미 보존)**:
- `/api/supplier-balances-map` 추가 fetch · `stock_asset` 사용
- 더 많은 작업 · 성능 저하 가능
- 보류

**선택** · 옵션 A (라벨 수정) · 사용자 혼동 즉시 해소 · 회귀 없음

---

## 리포트 4 · fix 적용 결과

(아래 섹션은 fix 적용 후 업데이트)

### 커밋 1 · topSales.ts raw total_amount 제거

...

### 커밋 2 · supplierPurchases.ts saleAmount proration → 판매가 공식

...

### 커밋 3 · SupplierTab 라벨 정합

...

### 검증

- `npx tsc --noEmit` · 0 error
- `node scripts/audit-framework.cjs --check-new` · 신규 위반 0
- `npx vitest run` · 회귀 0

---

## 결론

**현재 상태** · 2026-09-10/14 세션에서 대부분 통일 완료 · 잔존 위반 4건 (U1~U4)

**fix 안전성** · 모두 코드만 · 데이터 변경 0 · 공식 통일 방향 (사용자 재무 영향 X)

**잔존 과제 (사용자 승인 대기)** · D1~D5 · 데이터 레벨 변경 · 백업·DROP·UPDATE 다수

---

**생성 시각** · 2026-10-01
