# DATA INTEGRITY AUDIT · 2026-10-01

**감사자** · Claude (ally73@gmail.com 요청 · 2026-10-01)
**스코프** · 전체 프로젝트 · 10 영역 · 사용자 대원칙 1~12 매핑
**모드** · 조사 전용 (read-only) · 수정·커밋 X · 리포트만

## 산출물 파일

- `docs/DATA_INTEGRITY_AUDIT_2026-10-01.md` · 본 리포트
- `docs/_audit-raw-2026-10-01.json` · 원본 JSON (스크립트 출력)
- `scripts/audit-data-integrity-2026-10-01.mjs` · 메인 감사 스크립트
- `scripts/audit-vendor-match-2026-10-01.mjs` · 공급사 매칭 조사 보조

---

## 리포트 1 · 전체 요약

| # | 영역 | 상태 | 심각도 | 핵심 발견 |
|---|------|------|--------|-----------|
| 1 | SSOT 위반 (optimal_stock) | **OK** | – | `inventory_checks.optimal_stock`·`order_requests.optimal_stock` 컬럼 모두 미존재 → SSOT (products) 유지 |
| 2 | 파생 컬럼 (`stock_history.total_amount`) | **위반** | HIGH | 5000 샘플 중 3932 (78.6%) 가 `sale_qty × sale_price` 와 불일치 · xlsx 원본값 저장 상태 · 사용자 대원칙 3 위반 |
| 3 | 공식 등식 (재고자산·실제잔고·판매액) | **OK** | – | 샘플 10 공급사 · `/api/supplier-balances-map` 수식과 재계산 결과 일치 (매입−COGS, 매입−결제) |
| 4 | xlsx `total_amount` 사용 | **부분 OK** | MEDIUM | 서버는 `sale_qty × sale_price` 로 집계 (대원칙 준수) · 단 **컬럼 자체는 DB 에 잔존** · `snapshotSummary` 라우트 1곳에서 raw 값 그대로 응답 (BC) |
| 5 | 공급사 이중화 잔존 | **경고** | HIGH | `products.supplier` 31개 orphan · `vendors` 테이블 자체에 "코리아헬스" / "코리아헬스(주)" 중복 1건 · 매칭 가능 orphan 4개 (다원엠디·복산나이스·천호바이오·한신약품) |
| 6 | 유통기한 3소스 UNION | **OK** | – | `/api/products/expiry-imminent` 3소스 (ic·products·purchase_details) UNION · MIN 통합 구현 완료 · 단 `inventory_checks.expiry_input_date` 컬럼 미생성 (schema 는 선언, DB 미반영) |
| 7 | optimal_stock SSOT | **OK** | – | 영역 1과 동일 · master 단일 소스 |
| 8 | 문자열에 날짜 저장 | **OK** | – | products.memo / inventory_checks.note / order_requests.note 모두 0건 (스캔 완료) |
| 9 | 매입액·결제액·판매액 계산 통일 | **경고** | MEDIUM | `/api/supplier-balances-map` 와 `/api/supplier-balance/:supplier` 에서 매입액/결제액 공식은 동일 · 그러나 **판매액 계산** 은 endpoint 별로 혼재 (일부 raw `total_amount` 사용 잔존) |
| 10 | FK · 참조 무결성 | **경고** | HIGH | **백업 테이블 4개 모두 0 rows** (잔존 가능 · 정리 대상) · `purchase_details.product_code` orphan 41건 · `stock_history` orphan distinct codes 13건 · 모두 `products` 에 없는 코드 |

### 심각도 분포
- **CRITICAL** · 없음
- **HIGH** · 3 (영역 2 파생 total_amount · 영역 5 공급사 미등록 · 영역 10 purchase_details/stock_history orphan)
- **MEDIUM** · 2 (영역 4 total_amount 라우트 잔존 · 영역 9 판매액 혼재)
- **LOW** · 0

---

## 리포트 2 · 영역별 상세

### 영역 1 · SSOT 위반 검증 (optimal_stock) · **OK**

**사용자 대원칙 매핑** · #9 (optimal_stock 단일 소스) · #10 (파생 컬럼 금지)

**조사 결과**
- `products.optimal_stock` 존재 (SSOT · OK)
- `products.optimal_stock_backup` 존재 (xlsx 임포트 wipe 방어용 · 2026-07-07 마이그레이션)
- `inventory_checks.optimal_stock` **컬럼 미존재** (OK · 2026-09-09 DROP 됨)
- `order_requests.optimal_stock` **컬럼 미존재** (OK · 2026-09-09 DROP 됨 · 코드/스키마에서는 제거 완료)
- 코드 레벨 · `server/lib/optimalStock.ts:165` · `syncOrderRequestsOptimalStock` 는 no-op (의도된 deprecation)

**이슈**
- `migrations/create_request_tables.sql:20` · 원본 CREATE 문에 `optimal_stock integer` 여전히 포함 (레거시 · 신규 환경 재생성 시 재발 가능)
- `products.optimal_stock_backup` · xlsx 임포트 wipe 방어용 · 역할 다르므로 SSOT 위반 아님

**결론** · 운영 DB 레벨에서 OK · 레거시 CREATE 스크립트만 정리 필요

---

### 영역 2 · 파생 컬럼 조사 · **위반 (HIGH)**

**사용자 대원칙 매핑** · #3 (판매액 = 수량 × 단가) · #10/#11 (파생 컬럼 금지)

**발견 · `stock_history.total_amount`**
- 5000 샘플 분석 결과 · **sale_qty × sale_price 와 매칭 1건 · 불일치 3932건 (78.6%)**
- xlsx 임포트 시 외부 원본 `total_amount` 그대로 저장 · 수량 변동이나 가격 수정 반영 안 됨
- 예시 (실제 DB 샘플):
  - 상품 8806011615453 · sale_qty=978 · total=3,831,630 · expected=5,574,600 · delta=−1,742,970
  - 상품 8806723002329 · sale_qty=783 · total=16,799,200 · expected=1,879,200 · delta=+14,920,000

**영향 범위**
- `server/routes/stock/stockManage/snapshotSummary.ts:731` · 응답에 raw `total_amount` 그대로 포함
- 그 외 핵심 집계 라우트는 이미 `sale_qty × sale_price` 로 재계산 (`supplierPurchases.ts:130/329` 주석도 "xlsx total_amount 사용 금지" 명시)
- UI 측 (`src/components/StockManagePage/*`) · `total_amount` 참조 36개 파일 중 상당수가 서버에서 재계산된 값 사용 · 다만 snapshot 기반 로직은 raw 값에 노출 가능

**사용자 대원칙 위반 매핑** · #3 "판매액 = 판매수량 × 판매단가" · xlsx total_amount 금지

**권장 fix**
1. `snapshotSummary.ts` 응답에서 `total_amount` 필드 제거 (파생 재계산 값만 노출)
2. `stock_history.total_amount` 컬럼 자체를 drop 하거나 "deprecated · 사용 금지" 로 명시
3. UI 전수조사 · raw `total_amount` 참조 시 수량×단가 재계산

---

### 영역 3 · 공식 등식 샘플 검증 · **OK**

**사용자 대원칙 매핑** · #1 (재고자산) · #2 (실제잔고) · #3 (판매액)

**검증 공식**
- 재고자산 = 매입액 − 판매원가(COGS)
- 실제잔고 = 매입액 − 결제액

**샘플 결과 (상위 10 공급사 · 전체 기간)**

| 공급사 | 매입액 | 결제액 | COGS | 재고자산 | 실제잔고 |
|--------|--------|--------|------|----------|----------|
| (유)한풍제약 | 37,330,005 | 0 | 3,942,500 | 33,387,505 | 37,330,005 |
| (주)녹십자 | 300,457,182 | 0 | 79,630,914 | 220,826,268 | 300,457,182 |
| (주)대웅제약 | 240,629,250 | 0 | 847,980 | 239,781,270 | 240,629,250 |
| (주)마더스팜 | 68,685,050 | 0 | 14,006,400 | 54,678,650 | 68,685,050 |
| (주)아이월드제약 | 2,961,120 | 0 | 0 | 2,961,120 | 2,961,120 |

**결론** · 재계산 결과가 `/api/supplier-balances-map` 응답 공식과 완전 일치 · 대원칙 1·2 준수

**주의** · 샘플 공급사 중 다수가 **결제액 0** · 이는 공식 위반이 아니라 운영 데이터에서 결제 입력이 거의 없음 (supplier_payments 3건 뿐)

---

### 영역 4 · xlsx `total_amount` 사용 조사 · **부분 OK (MEDIUM)**

**사용자 대원칙 매핑** · #3 (판매액 = 수량 × 단가 · xlsx total_amount 금지)

**서버 라우트 전수**
| 파일 | 라인 | 사용 패턴 | 상태 |
|------|------|-----------|------|
| `supplierPurchases.ts` | 130, 329 | `agg.total_amount += sqty * sale_price` (파생) | **OK** |
| `topSales.ts` | 128~131 | `salesTrend` · `cur.totalStockAmount += saleQty * salePrice` (파생) | **OK** |
| `snapshotSummary.ts` | 731 | `total_amount: Number(r.total_amount ?? 0)` (raw 노출) | **위반** |
| `salesTrend.ts` | – | `total_amount` 참조 | 미확인 (추가 검증 필요) |
| `vendor/orderHistory.ts` | 98 | `g.total_amount += qty * price` (파생) | **OK** |
| `purchaseSummary.ts` | 179 | `agg.total_amount += r.amount` (purchase_details.amount 집계 · 매입액) | **OK** (판매액 아님) |
| `uploadStock.ts` | – | xlsx 임포트 시 total_amount DB 저장 | **위반 소스** |

**UI 레벨 참조 36 파일** · 서버 응답 소비 쪽은 대부분 서버 재계산값 사용

**권장 fix**
- `uploadStock.ts` · xlsx 임포트 시 `total_amount` 저장 중단 (null 로)
- `snapshotSummary.ts` · raw 응답 제거

---

### 영역 5 · 공급사 이중화 잔존 · **경고 (HIGH)**

**사용자 대원칙 매핑** · #4 (공급사 유효성) · #12 (이중화 통합 완료)

**현재 distinct 수**
| 테이블 | distinct 수 |
|--------|-------------|
| products.supplier | 165 |
| purchase_details.supplier_name | 89 |
| stock_history.supplier_name | 94 |
| supplier_payments.supplier_name | 2 |
| vendors.company_name | 156 |

**발견 1 · vendors 테이블 자체에 중복 1건**
```
"코리아헬스" (vendor)
"코리아헬스(주)" (vendor)
```
displayVendorName() 적용 시 둘 다 "코리아헬스" 로 정규화 → **vendors 테이블 자체에 duplicate**

**발견 2 · products.supplier · vendors 와 미매칭 31건 (orphan)**

**복원 가능 (displayVendorName 매칭 성공) · 4건** · raw 데이터 미등록
- 다원엠디 → (주)다원엠디
- 복산나이스 → 주식회사 복산나이스
- 천호바이오 → 주식회사 천호바이오
- 한신약품 → 한신약품 주식회사

**복원 불가 (vendors 완전 미등록) · 27건**
```
CMG, HMP, ㅇㅇㅇㄱ, 고려은단, 대웅, 대원, 동국, 디딤푸드, 마더스,
메가타운, 메가헬스케어, 바로팜 비알피랩스, 바로팜 켄뷰, 바로팜직접주문,
보령컨슈머, 에프앤디넷, 엠아이에이뉴트라_, 제일헬스, 주식회사 소연,
쥴릭파마, 지오영, 컨디션, 켄뷰, 코오롱제약, 한가람약품,
한신바이오팜, 한풍제약
```
※ 노이즈 데이터 (CMG · ㅇㅇㅇㄱ · 엠아이에이뉴트라_) 혼재

**발견 3 · purchase_details · stock_history · 매장 자체명 포함**
- `메가타운약국(평택)` · `메가헬스케어` · `테스` · `미상` · vendors 미등록

**발견 4 · 백업 테이블 4개 모두 0 rows (잔존)**
```
products_backup_20260925 · 0 rows
purchase_details_backup_20260925 · 0 rows
stock_history_backup_20260925 · 0 rows
supplier_payments_backup_20260925 · 0 rows
```
2026-09-25 공급사 통합 작업 후 생성 · 데이터 없음 (DROP 안전)

**사용자 대원칙 위반 매핑** · #4 "공급사 vendors 유효성 검증 필수" · 31건 orphan

**권장 fix**
1. **CRITICAL** · vendors 중복 fix · "코리아헬스" or "코리아헬스(주)" 중 하나 삭제 (실제 데이터 확인 후)
2. 복원 가능 4건 · `products.supplier` 값을 정식 vendors.company_name 으로 UPDATE (SSOT 통일)
3. 복원 불가 27건 · 사용자 리뷰 후 신규 vendors 등록 or 유효 vendor 로 재분류
4. 백업 테이블 4개 · 0 rows 확인 후 DROP (사용자 승인 필수)
5. 매장 자체명 (`메가타운약국(평택)` 등) · 자가 공급 분류 or vendors 추가 등록 결정

---

### 영역 6 · 유통기한 3소스 UNION · **OK**

**사용자 대원칙 매핑** · #7 (3소스 통합) · #8 (문자열 날짜 금지)

**컬럼 존재**
| 컬럼 | 상태 |
|------|------|
| `products.expiry_date` | 존재 (legacy · 임포트 저장) |
| `inventory_checks.expiry_date` | 존재 (SSOT · DATE 타입) |
| `inventory_checks.expiry_input_date` | **미존재** |
| `purchase_details.expiry_date` | 존재 (Phase A · DATE · 2026-09-03) |

**이슈 · `inventory_checks.expiry_input_date`**
- schema 선언 (`src/shared/schemas/inventoryChecks.ts:32`) · `expiry_input_date` 필드 허용
- 마이그레이션 (`20260908_add_inventory_checks_expiry_columns.sql`) · `expiry_date` 만 추가 · `expiry_input_date` 추가 안 됨
- 실제 DB 에 컬럼 없음 → zodValidate 통과 후 insert 시 silent drop 가능

**UNION 구현** · `server/routes/stock/products.ts:722` `/api/products/expiry-imminent`
- 1단계 · inventory_checks (SSOT)
- 2단계 · products (legacy)
- 3단계 · purchase_details (verified_expiring=true)
- `mergeMinExpiry()` 유틸로 MIN 통합 (2026-09-18)
- Phase A (DB DATE 컬럼) · Phase B (서버 UNION) 완료 상태

**권장 fix**
- `expiry_input_date` 컬럼 · DB 추가 or schema 에서 제거 (schema vs DB 정합성)

---

### 영역 7 · optimal_stock SSOT · **OK**

영역 1과 중복 · products.optimal_stock 유일 소스 · 다른 테이블 컬럼 없음

---

### 영역 8 · 문자열 날짜 저장 조사 · **OK**

**스캔 결과**
- `products.memo` · 날짜/유통기한 문자열 포함: **0건**
- `inventory_checks.note` · 0건
- `order_requests.note` · 0건

**결론** · 사용자 대원칙 #8 완전 준수

---

### 영역 9 · 매입액·결제액·판매액 계산 로직 통일 · **경고 (MEDIUM)**

**사용자 대원칙 매핑** · #5 (단일 endpoint) · 공식 통일

**매입액 계산**
- `/api/supplier-balances-map` · `purchase_details.amount` 합계 · OK
- `/api/supplier-balance/:supplier` · `queryPurchaseDetails` 유틸 · amount 합계 · OK
- → **매입액 공식 통일 OK**

**결제액 계산**
- 두 endpoint 모두 `supplier_payments.amount` 합계 · OK
- → **결제액 공식 통일 OK**

**판매액 계산 · 혼재**
- `supplierPurchases.ts` · `sqty × sale_price` (대원칙 준수)
- `topSales.ts` · `saleQty × salePrice` (대원칙 준수)
- `snapshotSummary.ts` · raw `total_amount` (**위반**)
- OrderHistory 쪽 (UI 소비) · 서버 재계산값 신뢰

**COGS 계산**
- `/api/supplier-balances-map` · `stock_history.sale_qty × products.purchase_price` · fallback 으로 purchase_details.unit_price 최근값 사용 · OK
- 단, 재고자산 KPI 를 노출하는 다른 endpoint 가 있는지 추가 전수조사 필요

**권장 fix**
- `snapshotSummary.ts` · raw `total_amount` 제거 · 재계산값으로 응답
- 공식 설명 문서화 · `docs/CALCULATION_FORMULAS.md` 신설 권장

---

### 영역 10 · FK · UNIQUE · 참조 무결성 · **경고 (HIGH)**

**사용자 대원칙 매핑** · #6 (DB 정합성 절대 유지)

**조사 결과**

| 테이블 | 총 레코드 | orphan | 비율 |
|--------|-----------|--------|------|
| order_requests → products | 7 | **0** | 0.0% |
| purchase_details → products | 12,939 | **41** | 0.32% |
| inventory_checks → products | 3,400 | **0** | 0.0% |
| stock_history → products (distinct) | 3,632 | **13** | 0.36% |

**orphan 샘플 · purchase_details**
```
id=19301 code=00004097
id=19996 code=8809825182425
id=20033 code=00002945
id=20283 code=0629262003712
id=20755 code=8806006155674
id=21009 code=8806105405496
id=21155 code=8806416079621
id=25919 code=00000800
id=26417 code=8809232573557
```

**orphan 샘플 · stock_history**
```
00000444, 2880658502297, 2880658503119, 8800276318951,
8806022202680, 8806433062828, 8806433062927, 8806433063023,
8806458000331, 8809315489911 ...
```

**원인 추정**
- xlsx 임포트 · 상품 마스터 미등록 상태에서 매입/판매 이력만 저장
- 상품 삭제 후 매입/stock_history 는 남아 있음
- 바코드 변경 시 old code 가 purchase_details 에 잔존

**FK 상태**
- `supabase/migrations/*` 검토 · `purchase_details.product_code → products.product_code` **FK 제약 없음**
- `stock_history.product_code → products.product_code` · **FK 제약 없음**
- 결과 · 참조 무결성이 어플리케이션 레벨에만 의존

**사용자 대원칙 위반 매핑** · #6 "참조 무결성 100%"

**권장 fix**
1. orphan 41건 (purchase_details) + 13건 (stock_history) 분석 · 상품 복원 or 데이터 정리
2. 신규 insert 시 서버에서 products 존재 검증 로직 추가
3. 신규 FK 제약 추가 전에 orphan 정리 필수 (추가 시 insert 실패 가능)

---

## 리포트 3 · 액션 아이템

### CRITICAL · 즉시 fix 필요
*없음* (운영 중단급 이슈 없음)

### HIGH · 다음 세션 fix

| # | 영역 | 액션 |
|---|------|------|
| H1 | 영역 5 | **vendors 테이블 중복 fix** · "코리아헬스" vs "코리아헬스(주)" · 사용자 리뷰 후 1개 삭제·병합 |
| H2 | 영역 10 | **orphan 레코드 정리** · purchase_details 41건 · stock_history 13 distinct codes · 사용자 리뷰 후 복원 or 삭제 |
| H3 | 영역 2 | **`stock_history.total_amount` 파생값 fix** · snapshotSummary 응답에서 raw 제거 · uploadStock 저장 중단 |
| H4 | 영역 5 | **복원 가능 공급사 4건 통일** · products.supplier UPDATE (다원엠디 → (주)다원엠디 등) |

### MEDIUM · 추후 정리

| # | 영역 | 액션 |
|---|------|------|
| M1 | 영역 5 | 복원 불가 공급사 27건 · 사용자 리뷰 · 노이즈 데이터 삭제 or 신규 vendors 등록 |
| M2 | 영역 5 | 백업 테이블 4개 (0 rows) · DROP (사용자 승인) |
| M3 | 영역 4 | `snapshotSummary.ts` 응답 `total_amount` 필드 제거 |
| M4 | 영역 6 | `inventory_checks.expiry_input_date` · DB 추가 or schema 제거 |
| M5 | 영역 9 | 계산 공식 문서화 · `docs/CALCULATION_FORMULAS.md` 신설 |
| M6 | 영역 10 | FK 제약 추가 (orphan 정리 후) · `purchase_details`·`stock_history` → `products` |

### LOW · 모니터링

| # | 영역 | 액션 |
|---|------|------|
| L1 | 영역 1 | `migrations/create_request_tables.sql` 레거시 CREATE 문 · `optimal_stock` 컬럼 제거 (신규 환경 재생성 방어) |

---

## 리포트 4 · DB 스냅샷 (2026-10-01 05:03 UTC)

### 주요 테이블 레코드 수
| 테이블 | rows |
|--------|------|
| products | 7,078 |
| vendors | 156 |
| stock_history | 53,641 |
| purchase_details | 12,939 |
| supplier_payments | **3** |
| order_requests | 7 |
| inventory_checks | 3,400 |
| ocr_confirmed_items | 31 |
| display_requests | 2 |
| stock_arrivals | 3 |
| credit_cards | 2 |
| notifications | 204 |
| push_tokens | 1 |
| employees | 19 |
| borrowings | 0 |
| return_requests | 0 |

### 백업 테이블 (2026-09-25 통합 작업 후)
| 테이블 | rows |
|--------|------|
| products_backup_20260925 | 0 |
| purchase_details_backup_20260925 | 0 |
| stock_history_backup_20260925 | 0 |
| supplier_payments_backup_20260925 | 0 |

**모두 0 rows** · DROP 안전 (사용자 승인 필요)

### orphan 레코드 요약
| 참조 | orphan | 전체 | 비율 |
|------|--------|------|------|
| purchase_details → products | 41 | 12,939 | 0.32% |
| stock_history → products (distinct code) | 13 | 3,632 | 0.36% |
| order_requests → products | 0 | 7 | 0% |
| inventory_checks → products | 0 | 3,400 | 0% |

### 공급사 데이터 분산
| 테이블.컬럼 | distinct 공급사 수 |
|-------------|-------------------|
| products.supplier | 165 |
| purchase_details.supplier_name | 89 |
| stock_history.supplier_name | 94 |
| supplier_payments.supplier_name | 2 |
| vendors.company_name | 156 |

### vendors 테이블 자체 중복
- "코리아헬스" vs "코리아헬스(주)" · displayVendorName 적용 시 둘 다 "코리아헬스"

---

## 사용자 대원칙 매핑 요약

| 대원칙 | 상태 | 상세 |
|--------|------|------|
| #1 재고자산 = 매입액 − 판매원가 | ✅ 준수 | /api/supplier-balances-map · stock_asset = purchase − cogs |
| #2 실제잔고 = 매입액 − 결제액 | ✅ 준수 | /api/supplier-balances-map · balance = purchase − payment |
| #3 판매액 = 수량 × 단가 | ⚠️ 부분 위반 | snapshotSummary.ts · uploadStock.ts · raw total_amount 잔존 |
| #4 공급사 vendors 유효성 | ⚠️ 위반 | 31개 orphan 공급사 · vendors 자체 중복 1건 |
| #5 공통 기능 단일 endpoint | ✅ 준수 | 매입액·결제액 공식 통일 (단 판매액 혼재) |
| #6 DB 정합성 유지 | ⚠️ 위반 | purchase_details/stock_history orphan 54건 · FK 미설정 |
| #7 유통기한 3소스 통합 | ✅ 준수 | /api/products/expiry-imminent · UNION + MIN |
| #8 문자열 날짜 저장 금지 | ✅ 준수 | 전수 스캔 0건 |
| #9 optimal_stock 단일 소스 | ✅ 준수 | products.optimal_stock 유일 · 다른 컬럼 DROP 완료 |
| #10 파생 컬럼 금지 | ⚠️ 위반 | stock_history.total_amount · xlsx 원본 저장 (78.6% 불일치) |
| #11 원본 테이블 우선 | ✅ 준수 | 재계산 로직 다수 적용 |
| #12 공급사 이중화 통합 | ⚠️ 부분 | 백업 테이블 잔존 · 신규 orphan 발생 |

---

## 결론

**전반 평가 · B+**
- 대원칙 1·2·7·8·9·11 완전 준수 (6/12)
- 대원칙 3·4·6·10·12 부분 위반 (5/12 경고)
- 대원칙 5 거의 준수 (1/12)

**가장 시급한 이슈 (사용자 리뷰 요청)**
1. **vendors 중복 코리아헬스 1건** · 삭제 or 병합 결정
2. **백업 테이블 4개 (0 rows)** · DROP 승인
3. **공급사 orphan 31건** · 복원 4건 즉시 가능 · 나머지 27건 리뷰
4. **purchase_details/stock_history orphan 54건** · 상품 복원 or 삭제 결정
5. **stock_history.total_amount 파생값 오류** · snapshotSummary 라우트 응답 수정

**다음 세션 액션**
- 사용자가 리포트 리뷰 후 → 각 액션 아이템 승인 → fix 세션 분리 실행
- 수정 작업은 반드시 사용자 명시 승인 후 진행 (최상위 대원칙)
- 파괴적 SQL (DROP TABLE 등) 은 사전 백업 확인 필수

---

**생성 시각** · 2026-10-01 05:03 UTC
**감사 소요** · 약 5분 (스크립트 실행 포함)
**감사 방식** · read-only · SELECT/COUNT 만 · 데이터 변경 없음
