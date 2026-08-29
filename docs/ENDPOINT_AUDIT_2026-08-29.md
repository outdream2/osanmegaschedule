# Endpoint Audit · 2026-08-29
서버 API 중복·불일치 조사 리포트 (megatown-staff-scheduler)

- 스캔 범위 · `server/routes/**/*.ts` (총 ~200 endpoint) + `src/**/*.{ts,tsx}` fetch 호출
- 판정 규칙 · "같은 기능이면 같은 endpoint" (사용자 대원칙)
- 표기 · file:line · 라우터 파일 기준

---

## 1. 상품 조회·검색 · 6개 endpoint (통합 여지 최다)

| Endpoint | 서버 파일:라인 | 응답 형태 | 소비자 |
|---|---|---|---|
| `GET /api/products-map` | stock/products.ts:39 | Record<code, Product> 전체 map (~수천건) | ProductInfoPage:483, LandingPage/VendorDetailModal:72, DisplayPage/RealStockTablePage:142, OcrPage/RawOcrTable/useMatchingState:53, DisplayPage/useDisplayData:127, StockManagePage/StockReconciliationTab:151 |
| `GET /api/products-search?q=` | stock/products.ts:143 | Product[] · 검색 (최대 40) | useProductInfoSearch:41, RawOcrCellRenderer:439, LandingPage/VendorStockModal:78, DisplayPage/UnassignedProductsTab:54, SalesTrendPage/SalesTrendPage:89, SalesTrendPage/StockFlowPanel:277, OcrPage/useReextractProductName:89,142, OcrPage/useRowCallbacks:77 |
| `GET /api/products-by-category?category=` | stock/products.ts:123 | Product[] (최대 100) | ProductCreateModal:187 |
| `GET /api/stock-check?q=` | stock/products.ts:22 | Product[] · 검색 (최대 25) | LandingPage/StockSearch:56, StockCheckPage/StockCheckPage:109 |
| `GET /api/products/:code` | stock/products.ts:530 | Product · 단건 | normalizeProduct:61, ProductInfoPage:530, OrderManagePage:230/248/278, ReturnListPanel:213 |
| `GET /api/stock-manage/product-info?code=` | stock/stockManage.ts:1560 | { product, stock_history, inventory_checks } · 단건 + 이력 | (**소비처 없음**) |

**판정 · 통합 권장** ★★
- `/api/stock-check` vs `/api/products-search` · 두 endpoint 모두 product-name 부분검색 + hidden=false + sale_status 필터 (완전 동일 목적) · **stock-check 는 25건 · products-search 는 40건**. 정합 근거 없음.
  - 권장 · `/api/products-search` 유일 유지 · `stock-check` 제거 (LandingPage/StockCheckPage 마이그레이션) · **위험도 낮음** (같은 컬럼)
- `/api/products-by-category` vs `/api/products-search?supplier=` · 부분검색 + 카테고리/공급사 필터 · products-search 로 `category` 파라미터 추가하면 흡수 가능 · **위험도 중간** (ProductCreateModal 단독 사용 · 응답 컬럼 셋 다름)
- `/api/stock-manage/product-info` · **dead endpoint · 소비처 없음** · 삭제 권장 · **위험도 낮음**

**차이 있음** (통합 X)
- `/api/products-map` · 전체 map · in-memory cache (getPublicProductMap) 필요 · 유지
- `/api/products/:code` · 단건 · authorize + latest fields · 유지

---

## 2. 직원 조회 · 2개 endpoint (미정의 GET 존재)

| Endpoint | 서버 파일:라인 | 소비자 |
|---|---|---|
| `POST /api/employees` | schedule/schedules.ts:24 | employeeApi.ts:118, EmployeeFormModal |
| `PUT /api/employees/:id` | schedule/schedules.ts:34 | employeeApi.ts:97,109, PermissionsPage:328, SettingsModal:204,237 |
| `DELETE /api/employees/:id` | schedule/schedules.ts:35 | employeeApi.ts:127 |
| `GET /api/employees/:id` | schedule/schedules.ts:40 | useEmploymentStatus:36, ApprovalRequestPage:183 |
| `GET /api/employees/next-number` | schedule/schedules.ts:26 | EmployeeFormModal:104 |
| `GET /api/employees/latest-contract` | staff/employeeContracts.ts:179 | EmployeeProfileCard:60 |
| `GET /api/schedules?year=&month=` | schedule/schedules.ts:18 | LunchPage:149, EmployeeCalendarModal:104, PermissionsPage:213, SchedulePage/useScheduleData:65, useLeaveManager:51 |
| **⚠ `GET /api/employees` (미정의)** | (없음) | BoardPage:79 (실패 대상) |

**판정**
- 🐛 **버그 · BoardPage.tsx:79** · `GET /api/employees` 호출하지만 서버 미정의 · silently 404 (catch로 무시). 다른 컴포넌트는 `/api/schedules` 응답의 `employees` 필드로 리스트 확보. **BoardPage 를 `/api/schedules` 로 통일** · **위험도 낮음**
- `/api/staff-availability` · `/api/staff-monthly` · 직원 리스트가 아닌 스케줄 파생 조회 · 별개

---

## 3. 재고 관련 · 5개 endpoint (혼재)

| Endpoint | 서버 파일:라인 | 목적 | 소비자 |
|---|---|---|---|
| `GET /api/inventory-latest` | stock/products.ts:71 | 코드별 최신 실재고 map | RealStockTablePage:143, useDisplayData:128 |
| `GET /api/inventory-checks` | display/requests.ts:741 | 실재고 이력 rows (모든 컬럼) | StockReconciliationTab:150, RequestsPage:299, ReturnListPanel:99, ScanPage:369,461, ProductInfoCard:133, useOrderManageData:86 |
| `POST /api/inventory-checks` | display/requests.ts:759 | 실재고 저장 (upsert · 최신 1건) | InventoryEditModal:96, RealStockTablePage:292, ProductInfoCard:165, ExpiryDateModal:75,101, ScanPage |
| `POST /api/inventory-checks/bulk` | display/requests.ts:877 | 대량 실재고 저장 | ScanPage:481,523 |
| `GET /api/stock-arrivals` · `POST` · `PATCH` · `DELETE` | stock/stockArrivals.ts:83+ | 입고 알림 게시판 (실재고와 무관) | StockArrivalPage, StockArrivalList |
| `POST /api/product-arrivals` | stock/productArrivals.ts:49 | 발주 대비 입고 등록 | ProductArrivalPage:607 |
| `GET /api/stock-manage/low-stock` | stock/stockManage.ts:1481 | 재고부족 리스트 (파생) | DiffTab:142, RequestsPage:277, useOrderManageData:71 |

**판정 · 이미 통합됨** (구조상 분리 타당)
- `/api/inventory-latest` (map) vs `/api/inventory-checks` (rows) · 응답 형태 다름 · fetch 패턴 다름 · 유지
- `/api/stock-arrivals` (알림용) vs `/api/product-arrivals` (물리적 입고) · 도메인 완전 상이 · 유지
- ⚠ 이름 혼동 · `stock-arrivals` = **입고 알림 게시판** · `product-arrivals` = **입고 실물 등록** · 코멘트에 명시 필요

---

## 4. 매입/발주 · 4개 endpoint 그룹

| Endpoint | 서버 파일:라인 | 목적 | 소비자 |
|---|---|---|---|
| `GET /api/purchase-details` | purchase/purchase.ts:472 | ERP 매입 raw rows (필터·페이지) | PurchaseHistoryModal:49, PurchaseHistoryTab:262,371,448, ProductPurchaseHistoryModal:29, PurchaseHistorySection:24, VendorDetailModal:162 |
| `GET /api/products/purchase-history?codes=` | purchase/purchaseHistory.ts:29 | 코드별 매입 통계 (latest/avg/min/max) | usePurchaseHistoryMatch:61, useOrderModal:75, useOrderManageData:54, VendorDetailModal:90 |
| `GET /api/order-requests` · `POST` · `DELETE` | display/requests.ts:427-540 | 주문요청 (매장→관리자 상신) | OrderManagePage, RequestsPage, ScanPage/ProductInfoCard, ProductDetailPanel:580 |
| `GET /api/order-history` | display/requests.ts:470 | 주문 이력 조회 | (grep 결과 소비처 명시 없음 · 내부 use 가능) |
| `GET /api/purchase-details/import-log` · `/coverage` · `/summary` | purchase/purchase.ts:386+ | 임포트 로그·요약 | UploadDataModal |

**판정 · 통합 권장** ★
- `/api/purchase-details` vs `/api/products/purchase-history` · **둘 다 `purchase_details` 테이블 조회**
  - 전자 · rows 반환 · 필터 자유
  - 후자 · 코드 in() · 코드별 통계 계산
  - 계산이 서버에서 필요한 이유 = 성능 (bulk in) · 완전 통합은 어려움
  - 권장 · 후자를 전자의 `?stats=1&codes=` 옵션으로 병합 · **위험도 중간** (5개 컴포넌트 · shape 다름)

---

## 5. 공급사(Vendors/Suppliers) · 11개 endpoint (혼재 심각)

| Endpoint | 서버 파일:라인 | 소비자 |
|---|---|---|
| `GET /api/vendors` | purchase/vendors.ts:114 | useVendors:36, VendorApprovalPanel:57 |
| `POST /api/vendors` · `PATCH` · `DELETE` · `/:id/approve` 등 | vendors.ts:221+ | NewVendorModal, VendorDetailModal, RequestsPage/VendorApprovalPanel |
| `GET /api/supplier-balance/:supplier` | purchase/supplierPayments.ts:365 | VendorDetailModal:126 |
| `GET /api/supplier-balances` | ocr/ocr.ts:1741 | SupplierTab:393, PaymentInputPage:130, RawOcrTable:467 |
| `POST /api/supplier-balances` | ocr/ocr.ts:1750 | useSynonymCallbacks:95 |
| `GET /api/supplier-balance-configs` | purchase/supplierBalanceConfig.ts:32 | BalanceConfigTab:21, OcrPage:83 |
| `PUT /api/supplier-balance-configs` | purchase/supplierBalanceConfig.ts:51 | OcrPage:109 |
| `GET /api/supplier-payments` · `POST` · `PATCH` · `DELETE` · `/pending-count` · `/latest-per-supplier` | purchase/supplierPayments.ts:84+ | VendorDetailModal, PaymentRegisterModal, PaymentEntryForm, LandingPage |
| `GET /api/supplier-ledger` | purchase/supplierPayments.ts:412 | VendorDetailModal:128, VendorDetailTabs:68 |
| `GET /api/supplier-open-invoices` | purchase/supplierPayments.ts:547 | PaymentRegisterModal:79 |
| `GET /api/supplier-purchase-summary` | purchase/supplierPayments.ts:611 | PurchaseHistoryTab:145, SupplierTab:414 |
| `GET /api/supplier-purchase-detail` | purchase/supplierPayments.ts:890 | VendorDetailTabs:94 |
| `GET /api/supplier-monthly-breakdown` | purchase/supplierPayments.ts:1092 | (grep hit 없음 · 미사용 가능성) |
| `GET /api/stock-manage/supplier-purchases` | stock/stockManage.ts:108 | VendorListEditor:110, SupplierTrendTab:97, SupplierTab:381 |
| `GET /api/stock-manage/suppliers` | stock/stockManage.ts:53 | (grep hit 없음) |

**판정 · 이름 규칙 불일치** ★
- **`/api/vendors/*` (마스터 CRUD)** vs **`/api/supplier-*` (거래·잔액·이력)** · 서로 다른 개념이나 사용자 관점에서 "공급사"라는 단일 도메인 · **명명 규칙 · vendor 통일 or supplier 통일 · 권장 vendor** (프론트 useVendors/VendorDetailModal 다수)
- **`/api/supplier-balances` (OCR 라우터)** vs **`/api/supplier-balance/:supplier`** (payments 라우터) · **경로 오해 유발** · 파일 위치도 이질 (ocr/ocr.ts 안에 supplier balance 라우트가 있는 것 자체가 오설계)
- 통합 권장 (경로 이관 · 응답 shape 유지) · **위험도 중간** (다수 파일)
- `/api/stock-manage/suppliers`, `/api/supplier-monthly-breakdown` · **dead endpoints** · 제거 검토

---

## 6. KV/Settings · 3개 endpoint

| Endpoint | 서버 파일:라인 | 소비자 |
|---|---|---|
| `GET /api/settings?key=` · `POST /api/settings` | settings/settings.ts:96,105 | useKvSetting:143,153, useSettings:156,167, useSidebar:137, LunchPage:150,181, PharmacistPage:85,108, PermissionsPage:74, main.tsx:69, contract/index.ts:76,113, useScheduleData:333,345, UploadDataModal:99 (다수) |
| `GET /api/settings/season-ranges` · `POST` | settings/settings.ts:81,86 | useSeasonRanges:69,90 |
| `GET /api/system-config` · `POST` | settings/systemConfig.ts:40,60 | SystemSettingsPage:112,136 |
| `GET /api/permissions` · `POST` | settings/settings.ts:121,128 | (grep 별도) |

**판정 · 이미 통합됨** (역할 분리 명확)
- `/api/settings` (KV 범용) · `/api/system-config` (전역 시스템) · `/api/permissions` (권한) · 각 도메인 분리 타당
- ⚠ 잔재 · `/api/settings/season-ranges` 는 KV 로 흡수 가능하나 · zod 검증·level>=9 재검증 있어 유지 합리 · **통합 불필요**

---

## 7. 기타 · 목적 유사 endpoint

### 7.1 Pending-count 시리즈 · 이름 규칙 불일치
| Endpoint | 파일:라인 |
|---|---|
| `GET /api/leave-requests/pending-count` | daily/leave.ts:73 |
| `GET /api/resignations/pending-count` | staff/resignations.ts:136 |
| `GET /api/supplier-payments/pending-count` | purchase/supplierPayments.ts:175 |
| `GET /api/requests/pending-counts` (**s 붙음**) | display/requests.ts:17 |

**판정** · 마지막 `pending-counts` 만 복수형 · 나머지는 단수 · **규칙 통일 필요 (단수 pending-count)** · **위험도 낮음** (라우트 경로 변경 · 1건만 소비)

### 7.2 Order 시리즈 · 개념 혼재
- `/api/order-requests` · 재고 부족 → 주문요청 (매장 상신용)
- `/api/order-history` · 주문 이력
- `/api/product-arrivals/compare/orders` · 발주 대비 입고 매칭
- ⚠ 사용자가 "order" 를 "발주"로 이해할 수 있으나 실제 코드는 "매장 요청" · **주석 정리 필요 · 통합 불필요**

### 7.3 OCR 그룹 · 파일 응집도 양호
`/api/ocr-*` · `/api/ocr/*` 접두어 혼재 (`ocr.ts:373-1761` 참고) · 후자는 `/parse-local`, `/parse-gemini`, `/last-log` 로 하위 리소스 · 규칙 명확 · 통합 불필요

### 7.4 Push 알림
- `POST /api/push-subscribe` (인증) · `POST /api/anon-push-subscribe` (비로그인) · 사용자 특성 다름 · 유지

---

## 종합 · 통합 권장 TOP 5 (우선순위)

| 순위 | 조치 | 위험도 | 영향 파일 수 | 근거 |
|---|---|---|---|---|
| **1** | `/api/stock-check` **제거** · `/api/products-search` 로 통일 | 낮음 | 2 (StockSearch · StockCheckPage) | 완전 동일 목적 · 정합 근거 없음 |
| **2** | BoardPage.tsx:79 `/api/employees` 호출 → `/api/schedules` 응답 employees 필드 사용 (또는 서버 GET 신설) | 낮음 | 1 (BoardPage) | **버그** · 현재 404 silent fail |
| **3** | `/api/stock-manage/product-info`, `/api/stock-manage/suppliers`, `/api/supplier-monthly-breakdown` **dead endpoint 제거** | 낮음 | 0 (소비처 없음) | 3개 엔드포인트 정리 · 라우터 슬림화 |
| **4** | `pending-counts` (복수) → `pending-count` (단수) 규칙 통일 | 낮음 | 1 (requests.ts:17 + 소비처) | 일관성 |
| **5** | 공급사 도메인 · `/api/supplier-*` (payments/ledger/balances) → `/api/vendors/*` 하위로 이관 검토 (예: `/api/vendors/:id/payments`) | 중간 | 10+ | vendor·supplier 이름 혼재 · 사용자 원칙 위배. **대규모 리팩터 · 신중 검토** |

### 낮은 우선순위 (일단 유지)
- `/api/purchase-details` vs `/api/products/purchase-history` · 통계 계산 서버 위임 필요 · 통합 시 shape breaking · 별도 태스크
- `/api/products-by-category` vs `/api/products-search?category=` · 파라미터 추가 흡수 가능 · 응답 컬럼 셋 상이 (`profit_rate` 유무)
- `/api/settings/season-ranges` 를 KV 로 흡수 · zod 검증 있어 별도 유지 합리

---

## 소소한 관찰
- **파일 위치 오설계** · `server/routes/ocr/ocr.ts:1741` 안에 `/api/supplier-balances` CRUD 존재. → `purchase/supplierBalances.ts` 로 이동 권장.
- **레거시 mirror** · `inventory_checks` 의 `warehouse_stock` (레거시) vs `warehouse1_stock` (신규) 병존 · 서버에서 자동 mirror. 신규 컬럼으로 완전 이관 시 mirror 제거 가능.
- **product patch 창구 단일** · PATCH `/api/products/:code` 로 9+ 필드 (hidden · location · sale_status · real_map · expiry_date 등) 처리 · 통일 잘 되어있음. 예외 · `PATCH /api/products/:code/realmap` 서브라우트 (ScanPage 만 사용) · 삭제 후 일반 PATCH 로 통일 가능 · 위험도 낮음.
