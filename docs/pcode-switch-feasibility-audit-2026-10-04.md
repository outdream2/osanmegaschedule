# Pcode 전환 가능성 Audit (2026-10-04)

> READ-ONLY · 코드 변경 없음 · DB 변경 없음 · Supabase live schema 조회만 수행 (scripts/audit-products-schema-2026-10-04.mjs)

## 1. 요약 (상위 10줄)

1. **현재 상태 (2026-10-04)**: Supabase live schema 조회 결과 `products` 테이블은 61 columns · 그 중 col[0]=`product_code` (ERP BarCode = 바코드 · identity) · col[60]=`pcode` (ERP PCode · nullable · 2026-10-04 추가 완료).
2. **`product_code` 참조 규모**: 코드베이스 전수 grep 총 **1,765회 (250 files)**. 서버 602 · 클라이언트 203 · 스크립트 321 · docs 다수. `pcode` 참조는 **104회 (22 files)** · 거의 전부 ERP sync / mapping 레이어.
3. **FK 관계**: `seasonal_products.product_code → products(product_code)` + `event_products.product_code → products(product_code)` · 둘 다 `ON DELETE CASCADE ON UPDATE CASCADE` · 그 외 테이블(`purchase_details` · `stock_history` · `inventory_checks` · `return_requests` · `zone_mismatches` · `order_requests` · `display_requests` · `product_arrival_items` · `loss_tracking_daily` 등)은 **TEXT 복사** (FK 없음 · 조회 기반 조인).
4. **unique/identity**: `products.product_code` = PK · `inventory_checks.product_code` UNIQUE · `stock_history (snapshot_date, product_code)` UNIQUE · `zone_mismatches.product_code` PK · `products.pcode` partial UNIQUE (`WHERE pcode IS NOT NULL`).
5. **UI 레이블 "상품코드"**: 전부 `product_code` (= 바코드값) 를 지칭. "바코드" 레이블은 스캐너 UI 전용. **PCode(=ERP 상품분류코드)** 는 현재 UI 노출 없음 · 내부 매핑 전용.
6. **ERP 매칭 로직 (`pcodeToBarcodeMap`)**: Buy_Status.PCode → BarCode 변환 사전 · `buildPCodeToBarcodeMap()` (src/shared/erp/erpBuyMapper.ts) · 그 결과를 `purchase_details.product_code` 에 저장. **unmapped 는 payload 제외**.
7. **전환 리스크 매우 큼 (Option 1 전면)**: 1,765 참조 · 바코드 스캐너·EAN 체크디지트·상품 검색 UI 전반 · FK CASCADE 2개 · UNIQUE 제약 3개 · uploadStock/stock_history snapshot 체인 등. 공수 수 주 ~ 수 개월.
8. **현재 설계 (Option B · 공존)** 는 사용자 승인 2026-10-04 결정 · `product_code=바코드` 유지 · `pcode` 는 ERP 매칭 identity 전용 추가 column.
9. **추천**: **Option 3 (점진 전환)**. ERP sync·purchase_details ingest·sync-agent 쪽만 `pcode` lookup/write 사용 · 바코드 스캐너·UI·검색·FK·snapshot 체인은 `product_code` (바코드) 그대로 유지. 전면 전환은 비즈니스 가치 대비 리스크 과대.
10. **"전면 전환이 가능하냐"** 에 대한 답: **기술적으로 가능하나 비추천**. FK CASCADE 재설계 · UNIQUE 교체 · 과거 snapshot 데이터 (`stock_history` 53,641행 · `purchase_details` 12,939행 · `inventory_checks` 3,400행) 전수 재매핑 필수 · 바코드 스캐너 식별 체계와 ERP identity 체계 분리로 2중 lookup 필요.

---

## 2. DB · `product_code` / `pcode` 참조 테이블 (Supabase live schema 기준)

### 2.1 Core 테이블 column 전수 (실측)

| Table | rows | columns | `product_code` 위치 | `pcode` 위치 | 참고 |
|---|---:|---:|---|---|---|
| products | 7,079 | 61 | col[0] (PK · identity) | col[60] (nullable) | pcode 는 2026-10-04 추가 완료 (idx_products_pcode partial UNIQUE) |
| purchase_details | 12,939 | 21 | col[4] (TEXT · FK 없음) | — | ERP ingest 시 pcodeToBarcodeMap[PCode] 로 변환 저장 |
| stock_history | 53,641 | 24 | col[2] (TEXT · UNIQUE (snapshot_date, product_code)) | — | ERP 미사용 · xlsx 업로드 기반 |
| inventory_checks | 3,400 | 19 | col[1] (TEXT · UNIQUE) | — | 실사재고 · PROTECTED · ERP 비관여 |
| vendors | 156 | 26 | 없음 (공급사 테이블) | — | 참고용 |

### 2.2 Products.pcode 를 참조·활용하는 지점

| 위치 | 역할 |
|---|---|
| `products.pcode` column | ERP 상품분류코드 저장 (현재 전부 NULL 상태 추정 · fill-pcode-from-product-list-2026-10-04.mjs DRY-RUN 모드로 채울 예정) |
| idx_products_pcode (partial UNIQUE WHERE pcode IS NOT NULL) | NULL 다수 허용 + 채워진 값은 UNIQUE 보장 |
| src/shared/erp/erpSyncWhitelist.ts (line 45) | `pcode: { erp: "PCode", nullOverwrite: false }` · Normal Sync 시 ERP → DB write 대상 |

### 2.3 FK (REFERENCES products(product_code)) 전수

| 참조 테이블 | 컬럼 | 제약 | 파일 |
|---|---|---|---|
| seasonal_products | product_code | `REFERENCES products(product_code) ON DELETE CASCADE ON UPDATE CASCADE` | migrations/20260910_seasonal_events.sql:13 |
| event_products | product_code | `REFERENCES products(product_code) ON DELETE CASCADE ON UPDATE CASCADE` | migrations/20260910_seasonal_events.sql:66 |

> **중요**: FK 는 단 2개 테이블만. 나머지 10+ 테이블은 TEXT 복사 (느슨한 참조).  
> ON UPDATE CASCADE 덕에 `products.product_code` 값만 바뀌면 자동 전파 가능 (하지만 identity 를 재해석하는 경우가 아니라 "값 변경" 시만 발동).

### 2.4 TEXT 복사 (FK 없음) 로 `product_code` 저장하는 테이블

| 테이블 | 컬럼 | UNIQUE | 참고 |
|---|---|---|---|
| purchase_details | product_code | — | ERP Buy_Status 매칭 핵심 |
| stock_history | product_code | (snapshot_date, product_code) UNIQUE | xlsx 재고현황 |
| inventory_checks | product_code | UNIQUE | 실사재고 SSOT |
| return_requests | product_code | — | 반품요청 |
| zone_mismatches | product_code | PRIMARY KEY | 구역 불일치 |
| order_requests | product_code | — | 발주요청 |
| display_requests | product_code | — | 진열요청 |
| product_arrival_items | product_code | — | 상품입고 라인 |
| loss_tracking_daily | product_code | — | 손실추적 (잠정) |
| ocr_confirmed_items | product_code | — | OCR 확정 |
| borrowings 관련 | product_code | — | 대차 |
| 각종 RPC (get_stock_flow 등) | product_code | — | aggregate 쿼리 |

### 2.5 Indexes containing product_code

| Index | 파일 |
|---|---|
| idx_inventory_checks_code_date (product_code, checked_at DESC) | docs/supabase_functions_and_tables.sql:104 |
| stock_history_product_code_idx (product_code) | supabase/migrations/20260707_stock_history.sql:50 |
| idx_product_arrival_items_code | docs/supabase_functions_and_tables.sql:41 |
| idx_return_requests_code | docs/supabase_functions_and_tables.sql:68 |
| 그 외 다수 (perf_indexes_2026-08-05.sql / 20260903_all_in_one.sql) | — |

---

## 3. 서버 · `product_code` 참조 (grep count)

> `product_code` 문자열 참조 · server/** · 총 **602회** · 49 files.

### 3.1 서버 Hot Spots (참조 횟수 상위)

| 파일 | 참조 수 | 사용 패턴 |
|---|---:|---|
| server/routes/stock/products.ts | 71 | SELECT cols · `.eq("product_code", code)` · upsert onConflict · update by code · DELETE by code |
| server/routes/display/requests.ts | 59 | 진열요청 SELECT/INSERT |
| server/routes/stock/stockManage/topSales.ts | 42 | 매출 집계 |
| server/routes/stock/productArrivals.ts | 31 | 상품입고 저장 |
| server/routes/purchase/purchase.ts | 28 | 매입 CRUD |
| server/routes/purchase/orderPurchaseMatch.ts | 22 | 발주-매입 매칭 |
| server/utils/productInventoryQuery.ts | 15 | 재고 쿼리 공용 util |
| server/routes/purchase/supplierPayments/balance.ts | 17 | 매입 잔고 |
| server/routes/settings/events.ts | 17 | 이벤트 상품 |

### 3.2 서버 패턴 요약

- `supabase.from("products").select("product_code, ...")` · 전 테이블 공통 column
- `.eq("product_code", code)` · WHERE 매칭
- `.upsert(payload, { onConflict: "product_code" })` · UPSERT key (products 테이블)
- `.update({...}).eq("product_code", code)` · UPDATE
- JOIN pattern: in-memory `Map<product_code, X>` 로 다수 테이블 묶음
- RPC `get_stock_flow(p_from, p_to)` · PL/pgSQL · 내부에서 product_code 로 집계

### 3.3 Sync-agent (apps/sync-agent) 참조

| 파일 | 참조 | 역할 |
|---|---:|---|
| apps/sync-agent/src/main/erpSyncOrchestrator.ts | 2 | DB 전수 READ (`product_code, ...` select) + 비교 |
| apps/sync-agent/src/main/iregenSoap.ts | 1 | 응답 RowArea 에 BarCode 포함 요청 코멘트 |

---

## 4. 클라이언트 · `product_code` 참조 (grep count)

> `product_code` 문자열 참조 · src/** · 총 **203+회** · 50+ files.

### 4.1 Client Hot Spots

| 파일 | 참조 수 | 역할 |
|---|---:|---|
| src/components/OrderManagePage/ReturnListPanel.tsx | 28 | 반품리스트 |
| src/components/ProductInfoPage/ProductCreateModal.tsx | 26 | 상품 신규/수정 모달 |
| src/components/OrderManagePage/OrderRequestTab.tsx | 31 (reported in audit matrix) | 발주요청 |
| src/components/ProductInfoPage/ProductInfoPage.tsx | 21 | 상품 리스트 |
| src/components/OrderManagePage/PurchaseHistoryTab.tsx | 21 | 매입이력 |
| src/components/SeasonSettingsPage/EventProductPanel.tsx | 12 | 이벤트 상품 |
| src/components/OrderManagePage/useOrderModal.ts | 10 | 발주 모달 훅 |
| src/components/StockManagePage/FlowTab.tsx | 8 | 재고 flow |
| src/components/OrderManagePage/VendorDetailTabs.history.tsx | 8 | 공급사 이력 |

### 4.2 UI 레이블과 `product_code` 매핑

| UI 레이블 | 실제 바인딩 | 파일 예시 |
|---|---|---|
| "상품코드" | `row.product_code` (=바코드값) | BorrowingDetailPanel.tsx:396 · RealStockDetailModal.tsx:36 · ProductInfoModalStyleView.tsx:92 · ProductPurchaseDetailPanel.tsx:203 · OrderPdfPreview.tsx:158 · BorrowingPdfPreview.tsx:93 |
| "바코드" | 스캐너 입력값 (=product_code 로 저장) | BarcodeScanner.tsx:27,565 · DisplayPage.tsx:594 · ZoneDetailModal.tsx:201,205 |
| 코멘트 "바코드(=상품코드)" | 명시적 동일 선언 | ProductBasicInfoPanel.tsx:175 · ProductInfoPage.tsx:68 · schemas/products.ts:12 · productMatch.test.ts:35 |

### 4.3 Barcode 스캐너 체인

- src/components/BarcodeScanner/** · 바코드 스캔 → `product_code` 매칭 · 핵심 UX (iOS 웹앱 포함)
- 스캔값은 EAN-13 (13자리) · `products.product_code` 와 1:1
- **pcode 로 전환 시 스캐너 결과를 pcode 와 매칭하려면 변환이 필요** → UX 리스크 큼

---

## 5. 스크립트 · 매핑 · 타입

### 5.1 Scripts (scripts/**)

| 파일 | 참조 | 역할 |
|---|---:|---|
| scripts/audit-data-integrity-2026-10-01.mjs | 34 | 정합성 전수 |
| scripts/merge-product-duplicates.mjs | 23 | 중복 머지 |
| scripts/audit-duplicate-columns.mjs | 19 | 중복 column 감사 |
| scripts/normalize-barcodes.mjs | 15 | 바코드 정규화 |
| scripts/fill-pcode-from-product-list-2026-10-04.mjs | 13 (+pcode 24) | **pcode 초기 채움 (DRY-RUN default)** |
| scripts/audit-cross-endpoint-2026-10-01.mjs | 12 | 교차 endpoint 감사 |
| scripts/check-product-code-unique*.mjs | 4 | PK unique 검증 |
| scripts/merge-product-duplicates.mjs | 23 | 중복 머지 |

### 5.2 Shared schemas / types (src/shared/**)

| 파일 | 참조 | 역할 |
|---|---:|---|
| src/shared/schemas/products.ts | 4 | Zod schema · `product_code: z.string().min(1, "상품코드는 필수입니다").max(50)` |
| src/shared/schemas/productArrivals.ts · inventoryChecks.ts · displayRequests.ts · returnRequests.ts · orderRequests.ts · ocrConfirmed.ts · ocr.ts · borrowings.ts · orderPurchaseMatch.ts | 1~3 each | 각 도메인 Zod |
| src/shared/dtos/products.ts | 1 | DTO 타입 |

### 5.3 ERP mapping (src/shared/erp/**)

| 파일 | 참조 (product_code / pcode) | 역할 |
|---|---|---|
| src/shared/erp/erpSyncWhitelist.ts | 2 / 3 | **ERP_IDENTITY.productCode="BarCode"** · ERP_OWNED_PRODUCT_FIELDS.pcode="PCode" (nullOverwrite: false) · 2026-10-04 신규 |
| src/shared/erp/erpProductMapper.ts | 4 / 0 (내부 ERP PCode 는 raw access) | ERP → products payload builder |
| src/shared/erp/erpBuyMapper.ts | 4 (+pcodeToBarcodeMap 3) | **PCode → BarCode 변환 사전** · purchase_details.product_code 는 BarCode 로 저장 |
| src/shared/erp/erpValidationEngine.ts | 0 / 9 | PCode↔Barcode 다중 매핑 검증 |
| src/shared/erp/erpSupabaseDiff.ts | 3 | ERP ↔ DB diff |

---

## 6. UI 레이블 혼란 가능성

### 6.1 "상품코드" 레이블 사용처

전부 **현재 `product_code` (=바코드값)** 를 지칭 · PCode 아님.

| 파일 | 라인 | 코드 |
|---|---:|---|
| src/components/OrderManagePage/BorrowingDetailPanel.tsx | 396 | `<span>상품코드</span><div>{row.product_code}</div>` |
| src/components/OrderManagePage/BorrowingEditPanel.tsx | 450 | `<span>상품코드</span>` |
| src/components/OrderManagePage/BorrowingPdfPreview.tsx | 93 | `<th>상품코드</th>` |
| src/components/OrderManagePage/OrderPdfPreview.tsx | 158 | `<th>상품코드</th>` |
| src/components/OrderManagePage/PurchaseHistoryTab/ProductPurchaseDetailPanel.tsx | 203 | `<InfoRow label="상품코드" value={infoData.product_code}>` |
| src/components/common/ProductInfoModalStyleView.tsx | 92 | `<Row label="상품코드" value={fmt(p.product_code)}>` |
| src/components/common/ProductBasicInfoPanel.tsx | 175 | 코멘트 "바코드(=상품코드)" |
| src/components/common/ProductDetailPanel.tsx | 486 | 코멘트 (필수 정보 · 상품코드) |
| src/components/DisplayPage/RealStockDetailModal.tsx | 36 | `<Field label="상품코드" value={row.product_code}>` |
| src/components/OcrPage/SynonymsTab.tsx | 186 | `placeholder="상품코드 (필수)"` |
| src/shared/schemas/products.ts | 6 | `"상품코드는 필수입니다"` |

### 6.2 "바코드" 레이블 사용처

전부 **스캐너 UX** · 결과값은 `product_code` 에 저장.

| 파일 | 역할 |
|---|---|
| src/components/BarcodeScanner/BarcodeScanner.tsx:27,565 | 스캐너 title + 안내 |
| src/components/BarcodeScanner/handlers.ts:314 | 실패 메시지 |
| src/components/BarcodeScanner/hooks/useZBarLoop.ts | ZBar EAN 디코딩 |
| src/components/DisplayPage/DisplayPage.tsx:594 | "상품 바코드 스캔" |
| src/components/DisplayPage/ZoneDetailModal.tsx:205 | "바코드 스캔" 버튼 |
| src/components/common/IosInstallGuide.tsx:205 | iOS PWA 안내 |

### 6.3 혼란 가능 지점 (전환 가정 시 교체 대상)

| # | 지점 | 혼란 유형 |
|---|---|---|
| 1 | 모든 "상품코드" UI 라벨 | 전환 시 사용자가 "상품코드" 를 보면 (a) 바코드 그대로냐 (b) ERP PCode 로 바뀌었냐 혼동. 라벨 재설계 필수 (예: "상품코드 (ERP)" vs "바코드"). |
| 2 | BarcodeScanner → ProductSearchInput | 스캐너 결과(바코드)를 ERP PCode 와 매칭하려면 server 왕복 2회 필요 (barcode → products.pcode → ...). |
| 3 | ERP Preview UI | AdminInitialBuildPage 는 이미 BarCode/PCode 둘 다 표시 중 · 사용자 교육 완료 상태. |
| 4 | PDF 미리보기 (BorrowingPdf / OrderPdf) | 거래처에 발송되는 문서 · "상품코드" column 이 바코드인지 ERP코드인지 거래처 측 혼선. |
| 5 | OCR Synonyms | OCR 매칭 테이블의 product_code 는 바코드 전제 · PCode 전환 시 완전 재구축 필요. |

---

## 7. 전환 전략 비교

### Option 1 · 전면 전환 (products.product_code 를 PCode 로 reinterpret)

**정의**: `product_code` 라는 column 이름 유지 but 값을 ERP PCode 로 교체 · 또는 `pcode` 를 PK 로 승격 후 `product_code` 를 2차 식별자(barcode) 로 역할 바꿈.

| 항목 | 내용 |
|---|---|
| 영향 범위 | 1,765 참조 · 250 files · FK CASCADE 2개 · UNIQUE 3개 · snapshot 53,641행 재매핑 · purchase_details 12,939행 재매핑 · inventory_checks 3,400행 재매핑 · bar code 스캐너 전체 UX 재설계 |
| DB 리스크 | 매우 큼 · PK 교체 · FK CASCADE 재구축 · UNIQUE 재구축 · ON UPDATE CASCADE 1회 거대 트랜잭션 or 테이블 재생성 |
| 코드 리스크 | 전부 수정 · product_code 가 "바코드" 라고 가정한 코드 (checkdigit · EAN-13 · 바코드 스캐너) 다수 깨짐 |
| 사용자 UX 리스크 | 바코드 스캐너로 입력한 EAN-13 은 ERP PCode 가 아님 · 모든 조회 flow 2 step 됨 |
| 데이터 리스크 | 과거 snapshot 데이터는 과거 product_code (바코드) 기반 · migration 매핑 실패 시 역사 데이터 손실 |
| 공수 추정 | 3~6 person-month (전 레이어 재작업 + 역사 데이터 변환 + 회귀 테스트) |
| 추천 | ❌ 비추천 |

### Option 2 · 공존 (현재 설계 · B 안) [**현재 선택**]

**정의**: `products.product_code` = 바코드 유지 · `products.pcode` = ERP PCode 전용 · 둘 다 identity 로 사용 가능.

| 항목 | 내용 |
|---|---|
| 영향 범위 | 신규 column 1개 + partial UNIQUE index 1개 · FK/UNIQUE 재설계 없음 |
| DB 리스크 | 매우 작음 (migration future_phase2_products_pcode.sql · nullable column 추가만) |
| 코드 리스크 | 거의 없음 (기존 코드 그대로 작동) |
| 사용자 UX 리스크 | 없음 (UI 변경 없음) |
| 데이터 리스크 | 없음 (fill 스크립트 DRY-RUN 가능) |
| 공수 추정 | 1 day (migration + fill script 실행 + ERP sync whitelist 반영) |
| 추천 | ✅ 즉시 적용 (**2026-10-04 승인 상태**) |

### Option 3 · 점진 전환 (ERP sync 쪽만 PCode 사용)

**정의**: Option 2 공존 + ERP sync·purchase_details ingest·sync-agent 비교 로직만 `pcode` 를 identity 로 사용. 그 외 (UI · 검색 · 바코드 스캐너 · snapshot · 비즈니스 로직) 는 `product_code` (바코드) 그대로.

| 항목 | 내용 |
|---|---|
| 영향 범위 | ERP sync 레이어 (`src/shared/erp/**` · `server/services/erpSync/**` · `server/routes/admin/initialBuildPreview.ts` · `apps/sync-agent/**`) + Buy/Sale/Inventory 매칭 코드 |
| DB 리스크 | Option 2 와 동일 (매우 작음) |
| 코드 리스크 | 중간 · ERP sync 결과를 DB 저장 시 (pcode → product_code lookup 역방향 join 1회 필요) |
| 사용자 UX 리스크 | 없음 |
| 데이터 리스크 | 작음 (ERP 쪽만 lookup 체계 변경) |
| 공수 추정 | 1~2 weeks (buildPCodeToBarcodeMap 유지하면서 반대 방향 buildBarcodeToPCodeMap 추가 · validation 보강) |
| 추천 | ✅ **최적** (사용자 질문 "pcode 기준으로 전환" 의 안전 버전) |

### Option 비교 요약

| 기준 | Option 1 | Option 2 | Option 3 |
|---|:---:|:---:|:---:|
| 리스크 | 매우 큼 | 매우 작음 | 작음 |
| 공수 | 3~6 PM | 1 day | 1~2 weeks |
| 역사 데이터 보존 | 어려움 | 자동 | 자동 |
| 바코드 스캐너 UX | 깨짐 | 유지 | 유지 |
| ERP 매칭 완전성 | 100% | 70% (barcode join 필요한 purchase 는 unmapped drop) | 100% (pcode 기반) |
| 사용자 교육 필요 | 매우 많음 | 없음 | 거의 없음 |

---

## 8. "pcode 기준 전환" 시 수정 지점 상세 (Option 3 가정)

> 아래 지점은 "ERP 응답 ↔ Supabase 매칭" 로직 한정. UI/검색/스캐너는 건드리지 않음.

### 8.1 서버 레이어

| 파일 | 현재 로직 | pcode 전환 시 변경 |
|---|---|---|
| server/routes/admin/initialBuildPreview.ts (lines 318~329) | `buildPCodeToBarcodeMap(pl.rows)` → Buy row 를 BarCode 로 매핑 · unmapped drop | 유지 · 추가로 `pcode` null row 알림 |
| server/services/erpSync/buySyncRunner.ts (line 133) | PCode→BarCode 변환 후 `purchase_details.product_code` 저장 | 선택지 A: 유지 (ingest 시점에만 변환) · 선택지 B: `purchase_details.pcode` column 신설 후 pcode 직접 저장 (migration 필요) |
| server/services/erpSync/productSyncRunner.ts | `products` 테이블 UPSERT (onConflict=product_code) · pcode field 는 ERP_OWNED 로 함께 write | pcode 가 identity 가 되려면 `onConflict: "pcode"` 로 변경 가능 but **products 가 신규 상품 생성 시 product_code 가 바코드로 ERP 에 와야 함** (아니면 INSERT fail) |
| server/utils/purchaseDetailsQuery.ts | 모든 쿼리가 product_code 기반 | 유지 (내부 조인은 product_code = BarCode 로 OK) |
| server/routes/stock/products.ts | 상품 CRUD · product_code 기반 | 유지 |

### 8.2 Shared mapper 레이어

| 파일 | 변경 |
|---|---|
| src/shared/erp/erpBuyMapper.ts (buildPCodeToBarcodeMap · buildBuyRowFromErp) | **그대로 유지** · ingest 시 PCode→BarCode 변환 유지. 선택지 B 적용 시 신규 `buildBuyRowFromErpByPCode()` 추가 가능 |
| src/shared/erp/erpSyncWhitelist.ts | ERP_IDENTITY.productCode="BarCode" 는 그대로. 추가 identity ERP_IDENTITY.productPcode="PCode" 신설 가능 |
| src/shared/erp/erpProductMapper.ts | products INSERT 시 identity 는 BarCode (= product_code) 로 유지 · pcode 는 ERP_OWNED field 로 함께 저장 (현재 상태) |

### 8.3 API endpoints 영향

| Endpoint | 영향 유무 |
|---|---|
| /api/products/* | 영향 없음 (product_code 그대로) |
| /api/erp/sync · /api/admin/initial-build-preview | 영향 있음 (lookup 로직 보강) |
| /api/purchase/* | 영향 없음 (purchase_details.product_code 유지) |
| /api/display/* | 영향 없음 |
| /api/stock/* | 영향 없음 |
| /api/scan/* | 영향 없음 (바코드 스캐너 전용) |

### 8.4 UI 영향

**Option 3 적용 시 UI 영향 없음.** 기존 "상품코드" 라벨은 바코드 그대로 유지.

AdminInitialBuildPage 는 이미 BarCode/PCode 둘 다 preview 중 (사용자 교육 완료).

### 8.5 Option 1 (전면 전환) 가정 시 수정 지점 (참고)

> 사용자 질문 "pcode 기준으로 전환할 수 있는지" 의 **전면** 해석 시.

| 레이어 | 수정 범위 |
|---|---|
| DB migration | `products` PK 교체 · FK CASCADE 2개 재설계 · UNIQUE 3개 재구축 · snapshot 테이블 전수 재매핑 UPDATE |
| 서버 전체 | 49 files · 602 참조 · `product_code` 를 `pcode` 로 전면 교체 (의미는 ERP PCode) · 바코드는 별도 `barcode` 컬럼으로 분리 신설 필요 |
| 클라이언트 전체 | 50+ files · 203+ 참조 · UI 라벨 재설계 ("상품코드" 가 ERP PCode 를 가리키는지 명시) |
| 스크립트 전체 | 46 files · 321 참조 · 과거 분석 스크립트 깨짐 |
| 바코드 스캐너 | 스캔 결과 (EAN-13 바코드) → pcode 변환 서버 왕복 1 step 추가 (products.barcode → pcode) |
| 테스트 전체 | 모든 test fixture 재작성 |

---

## 9. 추천

### 9.1 결론

**"ERP 연동 완료 후 모든 로직을 pcode 기준으로 전환"** 질문에 대한 답:

- **전면 전환 (Option 1)** · 기술적으로 가능하나 **강하게 비추천**. 1,765 참조 · 바코드 스캐너 UX 파괴 · 역사 데이터 재매핑 리스크 큼. ROI 낮음.
- **공존 (Option 2 · 현재 상태)** · 즉시 유효. 사용자 2026-10-04 승인 상태 유지.
- **점진 전환 (Option 3 · 추천)** · ERP sync 레이어만 pcode identity 로 운용 · 그 외는 바코드(product_code) 유지. **이것이 "ERP 쪽만 pcode 기준으로 전환" 의 안전 해석**.

### 9.2 실행 로드맵 (Option 3 기준)

1. **Phase A (현재 · 완료 또는 대기 중)**
   - [x] `products.pcode` column 추가 (live schema 확인됨 · 2026-10-04)
   - [ ] `fill-pcode-from-product-list-2026-10-04.mjs` 로 pcode 전수 채움 (DRY-RUN → 사용자 승인 → WRITE)
   - [ ] ERP_OWNED_PRODUCT_FIELDS.pcode 는 whitelist 이미 반영 (erpSyncWhitelist.ts:45)

2. **Phase B (ERP sync 전체 wiring 후)**
   - [ ] `buildPCodeToBarcodeMap` 유지 (purchase_details 등 ingest 시 변환)
   - [ ] 선택지 B 검토 · `purchase_details.pcode` 신규 column 추가해 ingest 시 pcode 도 동시 저장 (디버깅/추적용) → 사용자 승인 필수
   - [ ] erpValidationEngine · PCode duplicate 알림 보강

3. **Phase C (장기 · 선택)**
   - [ ] AdminInitialBuildPage 의 "ERP 매칭 상태" 통계에 pcode-based 매칭 성공률 추가
   - [ ] 전환 요구가 명확해지면 그 때 Option 1 재평가

### 9.3 금지 사항

- `products.product_code` 를 그대로 두고 **의미만** PCode 로 재해석 금지 (silent breaking change · 바코드 스캐너 자동 깨짐)
- FK CASCADE 를 임의로 DROP 금지 (seasonal_products · event_products)
- 과거 snapshot 데이터 (`stock_history` 53,641행) 를 임의로 UPDATE 금지 (스냅샷 불변성 대원칙 위배)

### 9.4 "확인 필요" (추측 금지)

- `purchase_details.pcode` 신설 여부 · 사용자 결정 필요
- `inventory_checks.pcode` · `stock_history.pcode` 등 다른 테이블에도 pcode 를 추가할지 · **ROI 낮음 추정** · 사용자 결정 필요
- fill-pcode script 실행 시점 · ERP 전체 재조회 필요 (Product_List 7,078 rows) · 사용자 승인 필요
- 바코드 없는 ERP 상품 (ERP_MISSING_BARCODE 통계 · initialBuildPreview.ts:337~338) 처리 정책 · pcode 만 identity 로 쓰는 상품 허용 여부 · 사용자 결정 필요
