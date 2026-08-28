# 전체 조회 기능 감사 · 2026-08-28

작성 목적: "페이지마다 결과가 다름" 사용자 지적 → 모든 상품·재고·매입 조회 API 의 데이터 소스·필터·캐시 일관성 전수 점검

---

## 섹션 1 · API 매트릭스

| API | 데이터 소스 | hidden 필터 | sale_status 필터 | 캐시 | 사용 페이지 | 상태 |
|---|---|---|---|---|---|---|
| `GET /api/stock-check` | `products` 직접 SELECT | `eq(hidden,false)` | 설정ON 시 `eq(sale_status,'판매중')` — **DB 직접 읽기 (설정값 분기)** | 없음 | 랜딩 재고확인 | 불일치(A) |
| `GET /api/products-map` | `getPublicProductMap()` = `getProductMap()` + 설정 필터 | `getProductMap`: 없음(전체fetch) → `getPublicProductMap`에서 후처리 | 설정ON 시 후처리 필터 | **TTL 30초** in-memory | ProductInfoPage, DisplayPage, StockReconciliationTab, OrderManagePage, VendorDetailModal | 불일치(B) |
| `GET /api/products-search` | `products` 직접 SELECT | 기본 `eq(hidden,false)` · `include_hidden=1` 시 제거 | **없음 (sale_status 미필터)** | 없음 | SalesTrend, OcrPage, RealStockTablePage, UnassignedProductsTab, VendorStockModal | 불일치(A)(C) |
| `GET /api/products-by-category` | `products` 직접 SELECT | `eq(hidden,false)` | **없음** | 없음 | 스캔 미등록 모달 | 낮음 |
| `GET /api/products/:code` | `products` 직접 SELECT + `inventory_checks` JOIN + `purchase_details` JOIN | 없음 (단일코드 · 조건 불필요) | 없음 | 없음 | ProductInfoPage 상세 | 양호 |
| `GET /api/inventory-latest` | `inventory_checks` (RPC 우선 · fallback: 페이지루프) | 없음 | 없음 | **Cache-Control: public,max-age=60** | DisplayPage RealStockTablePage | 양호 |
| `GET /api/purchase-details` | `purchase_details` + `products` JOIN (보강) | 없음 | 없음 | 없음 | 매입이력 탭 | 양호 |
| `GET /api/purchase-details/summary` | `purchase_details` | 없음 | 없음 | 없음 | 상품별 매입 요약 | 양호 |
| `GET /api/products/purchase-history` | `purchase_details` | 없음 | 없음 | 없음 | OCR 매칭 | 양호 |
| `GET /api/stock-manage/top-sales` | `stock_history` + `products` JOIN | `products`: hidden 후처리 제거 | **없음** | **TTL 10분** in-memory (cacheKey 포함) | SalesTrendPage, StockManagePage | 불일치(B) |
| `GET /api/stock-manage/low-stock` | `products` + `inventory_checks` JOIN | `eq(hidden,false)` | **없음** | **TTL 2분** in-memory | StockManagePage 부족재고 탭 | 중간(C) |
| `GET /api/stock-manage/suppliers` | `purchase_details` (queryPurchaseDetails 헬퍼) | 없음 | 없음 | **TTL 5분** in-memory | StockManagePage | 양호 |
| `GET /api/stock-manage/top-products` | `purchase_details` (queryPurchaseDetails 헬퍼) | 없음 | 없음 | **TTL 5분** in-memory | StockManagePage | 양호 |
| `GET /api/stock-manage/supplier-purchases` | `stock_history` | 없음 | 없음 | 없음 | SalesTrendPage 공급사 탭 | 양호 |
| `GET /api/vendors` | `vendors` | N/A | N/A | 없음 | 공급사 탭 | 양호 |
| `GET /api/return-requests` | `return_requests` | N/A | N/A | 없음 | 반품 탭 | 양호 |
| `GET /api/order-requests` | `order_requests` | N/A | N/A | 없음 | 발주요청 탭 | 양호 |
| `GET /api/inventory-checks` | `inventory_checks` | 없음 | 없음 | 없음 | 실재고 요청 탭 | 양호 |
| `GET /api/zone-mismatches` | `products` + `zone_mismatches` | `eq(hidden,false)` | **없음** | 없음 | 배치구역 불일치 | 낮음 |
| `GET /api/products/expiry-imminent` | `products` | 없음 | 없음 | 없음 | 유통기한 임박 탭 | 낮음 |

---

## 섹션 2 · 불일치 발견

### 🔴 크리티컬 — 사용자에게 잘못된 결과 표시

**[C-1] `sale_status` 필터 불일치 · stock-check vs products-map vs products-search**

- `/api/stock-check`: `app_settings` DB 직접 조회 → `setting?.value === true` 일 때만 필터 적용
- `/api/products-map` (`getPublicProductMap`): `app_settings` 5초 TTL 캐시 → `data?.value === false` 일 때만 전체 반환 (default true)
- `/api/products-search`: `sale_status` 필터 **완전 없음** · 쿼리 파라미터도 없음

결과: 동일 상품을 세 가지 API 에서 조회하면 판매중 아닌 상품 포함 여부가 다름.
구체적 영향: 랜딩 재고확인(숨길 수도 있음) vs 상품정보페이지(판매중 필터 클라이언트 후처리) vs SalesTrend 검색(무조건 전체 노출).

**[C-2] `getProductMap` · 엑셀 미등록 신규 상품이 30초 내 invisible**

- `/api/products` POST (신규 등록) 시 `resetProductCache()` 호출 → TTL 즉시 무효화: 정상
- 그러나 `/api/upload-products` (엑셀 임포트) 이후 TTL 30초 내에 `/api/products-map` 을 조회하면 TTL 미만이라도 `productMapPromise` 가 이미 완료된 경우 캐시 반환
- 실제: `resetProductCache()` 는 `productMapPromise = null` 처리 — 재시작 후 처음 30초는 TTL 기다리지 않고 즉시 fresh fetch 하므로 실제 누락보다는 30초 후 자동 갱신 방식. 테스트 등록 상품(아큐템갱년기 등)이 상품정보에서 안 보이는 원인은 `getPublicProductMap` 의 `sale_status` 후처리 + 클라이언트의 `saleActiveOnly` 이중 필터 가능성 높음.

### 🟡 중간 — UX/성능 이슈

**[M-1] `ProductInfoPage` · 이중 필터로 판매중 아닌 신규상품 누락**

- 서버: `getPublicProductMap` → 설정 ON 시 `sale_status !== '판매중'` 제거
- 클라이언트: `useSaleActiveOnly` → 또 한번 `sale_status === '판매중'` 필터
- 신규 등록 상품의 `sale_status` 가 null/미설정인 경우 양쪽 모두에서 탈락
- 페리비타 "2개 vs 1개" 문제도 이 경로: products-map(판매중 필터) vs stock-check(hidden=false + 설정조건) 가 다른 필터 적용

**[M-2] `UnassignedProductsTab` · `/api/products-search?q=&limit=1000` · q 빈 문자열 동작**

- 서버 코드 `rawQ.length < 1` 이면 즉시 `res.json([])` 반환
- 결과: UnassignedProductsTab 은 항상 빈 배열을 받음 → 미지정 상품 리스트 **완전 동작 안함**
- 파일: `server/routes/stock/products.ts` L187 `if (rawQ.length < 1) return res.json([]);`

**[M-3] `stock-manage/top-sales` · products hidden 후처리 · sale_status 미필터**

- `stock_history` 기반 조회 후 `products` 에서 hidden 제거는 하나, `sale_status` 필터 없음
- 판매중지 상품이 상위 판매 랭킹에 계속 노출될 수 있음

**[M-4] `app_settings` sale_active_only 판정 로직 비대칭**

- `stock-check`: `setting?.value === true` → 값이 없거나 null 이면 필터 **안 함** (전체 노출)
- `getPublicProductMap`: `data?.value === false` 이면 전체 반환, 그 외(null 포함) → 필터 **적용** (판매중만)
- 같은 DB 설정 값 null 에 대해 두 API 가 반대 동작 → 불일치

### 🟢 낮음 — 코드 스타일 / 경미한 일관성

**[L-1] `products-by-category` · sale_status 필터 없음**
스캔 미등록 모달 참조 용도이므로 즉각 영향은 낮으나 사용자 원칙과 불일치.

**[L-2] `products/expiry-imminent` · hidden 필터 없음**
판매중지+숨김 상품도 유통기한 임박 리스트에 노출.

**[L-3] `inventory-latest` · Cache-Control: public,max-age=60**
Render CDN 캐시 우회 불가 · 실재고 저장 직후 60초간 구 데이터 노출 가능.

---

## 섹션 3 · 통일 표준 제안

### 상품 검색 (products 테이블 단독 조회)
```
기본 필터: hidden = false
sale_status 필터: 설정 `stats.sale_active_only = true` 일 때만 eq('판매중')
판정 기준: value === false → 전체 / 그 외(null·true 포함) → 판매중만  [통일]
적용 API: /api/stock-check, /api/products-map, /api/products-search, /api/products-by-category
```

### 재고 조회 (products + inventory_checks JOIN)
```
products.current_stock: ERP 재고 (xlsx 임포트)
inventory_checks.warehouse_stock / store_stock: 직원 실재고 입력 (최신 1건)
표시 우선순위: inventory_checks 값 > products.current_stock
```

### 매입 조회 (purchase_details 단독)
```
JOIN 정책: 조회 시점에 products JOIN (supplier/product_name/spec 보강)
hidden·sale_status 필터: 매입이력은 필터 없음 (이력 보존 우선)
```

---

## 섹션 4 · 수정 우선순위

### P0 · 즉시 수정 (기능 완전 깨짐)

| 번호 | 위치 | 문제 | 수정 방향 |
|---|---|---|---|
| P0-1 | `server/routes/stock/products.ts` L187 | `q=''` 즉시 `[]` 반환 → UnassignedProductsTab 항상 빈 결과 | `q=''` 허용 후 `real_map IS NULL OR location IS NULL` 조건으로 서버 필터 추가하거나, 클라이언트에서 `/api/products-map` 으로 전환 |

### P1 · 우선 수정 (결과 불일치 · 사용자 혼란)

| 번호 | 위치 | 문제 | 수정 방향 |
|---|---|---|---|
| P1-1 | `server/routes/stock/products.ts` `/api/stock-check` L25 | `value === true` vs `getPublicProductMap` `value === false` 판정 비대칭 | `stock-check` 도 `value === false` 일 때만 전체 반환으로 통일 |
| P1-2 | `server/routes/stock/products.ts` `/api/products-search` | `sale_status` 필터 완전 없음 | `include_hidden` 파라미터처럼 `include_inactive=1` 파라미터 추가 · 기본은 판매중 필터 |
| P1-3 | `src/components/ProductInfoPage/ProductInfoPage.tsx` L442 | 서버 + 클라이언트 이중 `sale_status` 필터 → null 상태 신규상품 누락 | 서버에서 필터하면 클라이언트 필터 제거, 또는 신규상품 기본 `sale_status = '판매중'` 설정 필수화 |

### P2 · 차후 수정 (UX 이슈)

| 번호 | 위치 | 문제 | 수정 방향 |
|---|---|---|---|
| P2-1 | `server/routes/stock/products.ts` `/api/products-by-category` | `sale_status` 필터 없음 | `sale_active_only` 설정 반영 추가 |
| P2-2 | `server/routes/stock/products.ts` `/api/products/expiry-imminent` | `hidden` 필터 없음 | `.eq("hidden", false)` 추가 |
| P2-3 | `server/routes/stock/products.ts` `/api/inventory-latest` | `Cache-Control: public,max-age=60` | 실재고 POST/PATCH 시 캐시 무효화 어려운 구조 → `no-store` 또는 `private,max-age=30` 로 변경 |
| P2-4 | `server/routes/stock/stockManage.ts` `low-stock` | `sale_status` 미필터 | 판매중지 상품이 부족재고 알림에 포함될 수 있음 |

---

_감사 범위: server/routes/** (stock·purchase·display·settings) + src/components/ProductInfoPage·DisplayPage·LandingPage·StockManagePage·SalesTrendPage + hooks/useProductInfoSearch_
