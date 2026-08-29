# 상품·재고·매입 조회 통일 표준

**작성일**: 2026-08-29 · **태스크**: #170  
**목적**: 각 페이지별 조회 소스·컬럼·필터 불일치를 정리하고 향후 리팩터(#168)의 근거를 확립한다.

---

## 표 1 · 원본 테이블 — 파생 테이블 금지

| 원본 테이블 | 역할 | 금지 파생 |
|---|---|---|
| `products` | 상품 마스터 (ERP 임포트) | localStorage 캐시, 클라 lookup map |
| `inventory_checks` | 직원 입력 실재고 (창고1/2·매장1/2/3) | `_archive_` 구 테이블 |
| `purchase_details` | 매입 원본 (엑셀·OCR 임포트) | `product_arrival_items` (→ #198 통합 완료) |
| `vendors` | 공급사 마스터 | supplier_name 파생 컬럼 |
| `app_settings` | KV 전역 설정 (sale_active_only 등) | — |

**원칙**: 파생 테이블·파생 컬럼 신설 시 반드시 사용자 승인 필요 (#184 대원칙).

---

## 표 2 · 공용 함수 — 시그니처·사용처

| 함수 | 파일 | 시그니처 | TTL/정책 | 주요 사용처 |
|---|---|---|---|---|
| `getProductMap()` | `server/productCache.ts:155` | `() → Promise<Record<string, ProductInfo>>` | 30초 TTL · 전체 상품 (hidden 포함) | 내부용 (hidden 포함) |
| `getPublicProductMap()` | `server/productCache.ts:224` | `() → Promise<Record<string, ProductInfo>>` | getProductMap + hidden=false + sale_active_only 필터 | products-map, 공개 endpoint 전용 |
| `resetProductCache()` | `server/productCache.ts:29` | `() → void` | 즉시 무효화 | products 편집 후 반드시 호출 |
| `invalidateSaleActiveOnlyCache()` | `server/productCache.ts:217` | `() → void` | saleActiveOnly 5초 캐시 즉시 무효화 | settings POST 후 호출 |
| `clearLowStockCache()` | `server/routes/stock/stockManage.ts:47` | `() → void` | 2분 TTL · inventory_checks 변경 시 무효화 | inventory-checks POST/PATCH/DELETE 후 |
| `queryPurchaseDetails(opts)` | `server/utils/purchaseDetailsQuery.ts:126` | `(opts: PdQueryOptions) → Promise<PdRow[]>` | 캐시 없음 · 매번 조회 | supplier NULL → vendors/products fallback 3단계 자동 해결 |

**`PdQueryOptions` 필드**: `sinceYmd?: string` · `supplier?: string` · `includeVat?: boolean`

---

## 표 3 · 페이지별 조회 매핑

| 페이지/기능 | API 엔드포인트 | 조회 테이블 | 파일:라인 | 필터 |
|---|---|---|---|---|
| 랜딩 재고확인 | `GET /api/stock-check` | `products` 직접 | `products.ts:22` | `hidden=false` + `sale_active_only` + `ilike(product_name)` |
| 매장>상품>상품현황 | `GET /api/products-map` | `getPublicProductMap()` | `products.ts:39` | hidden=false + sale_active_only (자동) |
| 매장>상품>실재고 테이블 | `GET /api/inventory-latest` | `inventory_checks` (RPC: DISTINCT ON) | `products.ts:71` | get_inventory_latest RPC → fallback 페이지루프 |
| 매장>상품>상품정보 | `GET /api/products/:code` | `products` + `inventory_checks` JOIN + `purchase_details` | `products.ts:574` | product_code 단건 · inventory_checks 최신 1건 · purchase_details 최신 1건 |
| 매장>매입>공급사별 | `GET /api/stock-manage/suppliers` | `queryPurchaseDetails()` | `stockManage.ts:53` | sinceYmd (days 파라미터) |
| 매장>판매>상품현황(top-sales) | `GET /api/stock-manage/top-sales` | `stock_history` + `purchase_details` JOIN | `stockManage.ts:491` | snapshot_date·months·supplier 필터 · 10분 캐시 |
| 매장>발주>품절임박 | `GET /api/stock-manage/low-stock` | `products` + `inventory_checks` JOIN | `stockManage.ts:1481` | current_stock < optimal_stock · 2분 캐시 |
| 공급사 결제 | `GET /api/supplier-payments/...` | `queryPurchaseDetails()` | `supplierPayments.ts:373,427,1117` | supplier + sinceYmd |
| 거래처 목록 | `GET /api/vendors` | `vendors` + `queryPurchaseDetails({})` | `vendors.ts:156` | 전체 조회 후 결제 집계 |
| 상품입고 검수 | `GET /api/product-arrivals` | `purchase_details` WHERE `verify_status IS NOT NULL` | `productArrivals.ts:164` | verified_at date + verified_by 그룹핑 |
| 스캔 | `GET /api/products-map` + `GET /api/inventory-latest` | 위와 동일 | — | — |
| 상품검색 | `GET /api/products-search` | `products` + `inventory_checks` + `purchase_details` | `products.ts:189` | ilike + hidden=false + sale_active_only |

---

## 표 4 · 캐시 무효화 — 필수 호출 지점

| 트리거 이벤트 | 필수 호출 함수 | 현재 구현 지점 |
|---|---|---|
| products 편집 (PATCH/POST/upsert) | `resetProductCache()` | `products.ts:468,519,644,690,759,822` |
| products.real_map 편집 | `resetProductCache()` | `products.ts:644` |
| 적정재고 일괄 재계산 | `resetProductCache()` | `products.ts:690` |
| inventory_checks POST (실재고 저장) | `clearLowStockCache()` | `requests.ts:854` |
| inventory_checks 일괄 저장 | `clearLowStockCache()` | `requests.ts:950` |
| inventory_checks PATCH/DELETE | `clearLowStockCache()` | `requests.ts:969,976` |
| `stats.sale_active_only` 설정 변경 | `invalidateSaleActiveOnlyCache()` + `resetProductCache()` | `settings.ts:115,116` |

**주의**: `clearLowStockCache` 4지점 모두 `scheduleSnapshotBackground()` 와 함께 호출된다. 누락 시 low-stock 결과가 2분간 stale 유지된다.

---

## 표 5 · 신규 리팩터 체크리스트

| # | 확인 항목 | 기준 |
|---|---|---|
| 1 | 원본 테이블만 사용하는가? | `products` · `inventory_checks` · `purchase_details` 직접 조회 — 파생 테이블 신설 금지 |
| 2 | 공용 함수를 재사용하는가? | 상품맵 → `getPublicProductMap()` · 매입 → `queryPurchaseDetails()` — 직접 supabase 쿼리 반복 금지 |
| 3 | JOIN을 서버에서 수행하는가? | 클라이언트 lookup (`products-map` 받아 for-loop 매칭) 금지 — 서버 JOIN으로 처리 |
| 4 | 캐시 무효화 지점이 모두 포함됐는가? | products 편집 → `resetProductCache()` · inventory 편집 → `clearLowStockCache()` · 설정 변경 → `invalidateSaleActiveOnlyCache()` |
| 5 | `hidden` + `sale_active_only` 필터가 반영됐는가? | 공개 endpoint → `getPublicProductMap()` 사용 또는 `hidden=false` + `eq("sale_status","판매중")` 명시 |

---

## 부록 · 위반 사례 분석

### C-2 · productMapCache TTL 만료 후 stale promise 재사용 (#197)
- **원인**: TTL 만료 후 `productMapCache=null` 처리했지만 `productMapPromise` 를 null로 초기화하지 않아, 완료된 이전 promise가 재사용됨
- **수정**: `products.ts:161` — TTL 만료 시 `productMapPromise = null` 동시 처리, `p.finally()`로 promise 자동 해제 (`productCache.ts:192`)

### C-5 · stats.sale_active_only 설정 변경 후 캐시 미반영 (#197)
- **원인**: KV 설정 POST 시 `saleActiveOnlyCache` (5초 TTL)가 즉시 무효화되지 않아 최대 5초간 이전 필터 결과 유지
- **수정**: `settings.ts:114-116` — key=`stats.sale_active_only` 일 때 `invalidateSaleActiveOnlyCache()` + `resetProductCache()` 즉시 호출

### 페리비타 개수 불일치 (#163 → 해결)
- **원인**: `/api/stock-check` 는 `hidden=false` 필터 적용 · `/api/products-map` (구버전) 은 hidden 필터 없음 → 숨김 상품 포함 여부 차이
- **수정**: `getPublicProductMap()` 에 `hidden !== true` 필터 통일 (`productCache.ts:228-231`)

### purchase_details verify_* 컬럼 통합 (#198)
- **원인**: `product_arrivals` + `product_arrival_items` 별도 테이블 운영 → 매입 원본(purchase_details)과 이중 저장
- **수정**: 두 테이블 → `_archive_` rename · `productArrivals.ts` 전면 재작성 · `purchase_details.verify_status / verified_by / verified_at` 컬럼 활용

---

**향후 작업**: #168 (매입·재고 JOIN 통합) 리팩터 시 이 문서 기준으로 설계·검증한다.
