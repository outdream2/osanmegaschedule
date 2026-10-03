# ERP ↔ Supabase Import Mapping · PHASE 1 분석

**작성일**: 2026-10-03 · **상태**: 초안 (ERP 2 종 Fiddler 캡쳐 대기 · Supabase WRITE 금지 단계)

## 전제 · 데이터 영역 정의

사용자 지시 기준 · ERP ↔ Supabase 는 **3 종류** 로만 분류한다.

| # | ERP 메뉴 | 기존 Excel Import | Supabase target |
|---|---|---|---|
| 1 | **사업장 상품관리** | 상품정보 Excel | `products` |
| 2 | **상품 재고 현황** | 재고 Excel | `stock_history` |
| 3 | **매입 현황** | 매입 Excel | `purchase_details` |

**아직 Supabase WRITE 금지. 이 문서는 분석만.**

---

## 결론 요약 표

| ERP 메뉴 | SOAP Method | Rows | Columns | 기존 Excel | 상태 |
|---|---|---|---|---|---|
| 사업장 상품관리 | **Inventory_Status** (분류 재확정 · 아래 참조) | 4,007 | 42 | 상품정보 (products.ts upload) | ✅ Live Query 성공 |
| 상품 재고 현황 | **미확인** · Fiddler 캡쳐 필요 | - | - | 재고 (uploadStock.ts) | ⏸ 사용자 액션 대기 |
| 매입 현황 | **Buy_Status** (경로 추정 · `SvcBuyBiz.asmx`) | - | - | 매입 (purchase.ts upload) | ⏸ Fiddler Request 캡쳐 대기 |

---

## 중요 · Inventory_Status 분류 확정 (사용자 지시 "이름만 보고 추측하지 않는다")

### Fiddler Request (`tools/iregen-bridge/samples/request.txt`) 분석
요청 파라미터 중 메뉴 식별에 결정적인 flag ·
```xml
<IsStatus>1</IsStatus>          ← 상태 조회 (활성)
<IsStoreStatus>1</IsStoreStatus> ← 매장 상태 (활성)
<IsBuyStatus>1</IsBuyStatus>     ← 매입 (활성)
<IsSaleStatus>1</IsSaleStatus>   ← 판매 (활성)
<IsStock>1</IsStock>             ← 재고 (활성)
<SearchType>TOTAL</SearchType>   ← 전체 집계
<StartDate>2026-10-01</StartDate>
<EndDate>2026-10-01</EndDate>
```

### Response 42 column 분석
- 상품 마스터: PCode · ProductName · PPCode · UnitCode · spec X · supplier (CCorpName · CtCode) · 분류 (Lcate~DcateName) · 진열 (LocationName) · 판매상태 (IsSaleStatusName) · 매입가 이력 (CostPrice · CostPrice1~4 · ConfirmDate1~3)
- 재고 이동 (기간 집계): PrvStock · BuyStock · BuyReturnStock · SaleStock · SaleReturnStock · ProductUseStock · ProductBadStock · PlusStock · MinusStock · SubdivisionPlus/Minus · StorageMoveIn/Out/AutoIn/AutoOut
- 세금: IsTax · TaxPercent

### 분류 판정
- **상품 마스터 column + 기간 집계 재고 이동 column** 양쪽을 모두 포함
- `SearchType=TOTAL` + `IsStatus/IsStock/IsBuy/IsSale` 전부 1 → **"재고현황" 성격이 강함**
- 하지만 CostPrice1~4 · ConfirmDate1~3 (매입가 변경 이력) · LocationName (진열) · 공급사 전체 (CtCode/CCorpName) 포함 → **상품 마스터 성격도 겸함**

### 판정 결론
Inventory_Status 는 ERP 메뉴 **"상품 재고 현황"** 에 가장 가까움. **다만 상품 마스터 field 가 많이 포함되어 있어 "사업장 상품관리" API 와 상당 부분 중복될 가능성** 있음. → 사용자 액션 요청 (아래 참조).

**추측 금지 원칙 준수**: 코드 수정은 보류. ERP 실제 메뉴 2 개를 각각 실행해서 Fiddler 캡쳐를 받아보기 전까진 **"상품 재고 현황 API 로 임시 분류"**.

---

## 1. 사업장 상품관리

### 기존 Excel · `상품정보` (POST `/api/upload-products`)
파일: `server/routes/stock/products.ts:366-574` · xlsx 파싱: `server/utils/xlsx.ts:xlsxToRows`

### Excel 컬럼 (COL_KEYS · 52 개 중 저장 대상만)
```
product_code, product_name, spec, display_location,
purchase_price, sale_price, profit_rate,
supplier, supplier_code, sale_status,
category, category_code,
current_stock, optimal_stock, stock_amount,
expiry_date, unit, min_order,
last_purchase_date, last_sale_date,
search_keywords, origin, wholesale_price1,
registered_at
```

### Supabase target · `products`
- **UPSERT key**: `product_code`
- **저장 column** (28 개 · 상세):
  product_code, product_name, spec, display_location, location (display 와 동일),
  purchase_price, sale_price, profit_rate,
  supplier, supplier_code, sale_status,
  category, category_code,
  current_stock, optimal_stock, min_order, unit,
  expiry_date, last_purchase_date, last_sale_date,
  search_keywords, origin, wholesale_price1,
  stock_note, registered_at, last_modified_at
- **DEAD_COLS 필터** (저장 안 함 · 30 개):
  col_i, product_type, app_registered, image_registered, preset_registered, preset_group,
  promotion_name, promotion_priority, promotion_purchase_price, promotion_sale_price,
  promotion_profit_rate, promotion_discount_rate,
  delivery_price, delivery_profit_rate, delivery_margin_rate,
  management_group, unit_type, supplier_type,
  stock_amount, point_rate, sales_commission,
  total_volume, unit_volume, connection_type,
  individual_code, individual_quantity, operator, last_modified_at

### 기존 Import 가 **건드리지 않는 Supabase column** (PROTECTED)
- `optimal_stock_backup` · ERP wipe 방어 복원용
- `hidden` · 사용자 수동 제어
- `memo · description` · 사용자 주석
- `shelf_positions` (JSONB) · inventory_checks 와 동기화 자동
- `location_assigned_at` · 자동 할당 타임스탬프
- `created_at`

### ERP API 매핑 가능 여부
- **ERP API 확정**: ⏸ 미확인 · Fiddler 캡쳐 필요
- **현재 Inventory_Status 로 커버 가능한 field** (추정 매핑):
  | Supabase | ERP (Inventory_Status) | 비고 |
  |---|---|---|
  | product_code | PCode | ✅ |
  | product_name | ProductName | ✅ |
  | supplier | CCorpName | ✅ |
  | supplier_code | CtCode | ✅ |
  | purchase_price | CostPrice | ✅ |
  | sale_price | **없음** | ❌ ERP 추가 API 필요 |
  | unit | UnitCode | ✅ |
  | display_location | LocationName | ✅ (`>` 구분자 변환) |
  | sale_status | IsSaleStatusName | ✅ |
  | category | McateName or ScateName | ⚠ 어느 레벨인지 확인 필요 |
  | category_code | **코드 미제공** · 이름만 | ❌ |
  | spec | **없음** | ❌ |
  | expiry_date | **없음** · 거래 단위 데이터에만 | ❌ · Buy_Status 또는 별도 API |
  | current_stock | **집계 재조합 필요** · PrvStock + 기간 이동 | ⚠ 공식 확정 필요 |
  | optimal_stock | **없음 · 자체 운영 데이터** | PROTECTED |

### MISSING (기존 Excel 에는 있지만 Inventory_Status 로 못 얻는 것)
- sale_price (판매가)
- category_code (분류 코드 · 이름만 제공됨)
- spec (규격)
- expiry_date (유통기한)
- origin (원산지)
- wholesale_price1 (도매단가)
- min_order (최소발주)
- search_keywords
- last_purchase_date / last_sale_date (ERP 는 CostPrice 변경일만)

### EXTRA (Inventory_Status 에는 있지만 기존 Excel/Import 는 미사용)
- PPCode (부모 코드/바코드) · 42 column 중 다수가 null
- CostPrice1~4 + ConfirmDate1~3 (매입가 이력) · UI 에서 활용 가능성 조사 필요
- IsTax · TaxPercent (과세 정보)
- 모든 재고 이동 집계 column (BuyStock · SaleStock · PlusStock · MinusStock 등 16 개)

### PROTECTED (ERP sync 가 절대 덮지 말 것)
`optimal_stock_backup` · `hidden` · `memo` · `shelf_positions` · `location_assigned_at` · `created_at`

---

## 2. 상품 재고 현황

### 기존 Excel · `재고` (POST `/api/upload-stock`)
파일: `server/routes/stock/stockManage/uploadStock.ts:31-311` · 이중 헤더 지원 (Row0 병합 카테고리 + Row1 실제 컬럼)

### Excel 컬럼 (정규식 기반 감지)
```
코드 (필수), 상품명, 공급사명, 공급사코드, 규격, 세금구분, 상품유형,
기초재고 (opening), 입고 (purchase_qty), 판매 (sale_qty),
폐기 (disposal_qty), 사내소비 (internal_qty), 재고조정 (adjustment_qty),
종료일 재고 (closing_stock),
과세 (taxable), 공급가액 (supply_amount), 부가세 (vat), 면세 (duty_free_amount), 합계 (total_amount)
```

### Supabase target · `stock_history`
- **UPSERT key**: `(snapshot_date, product_code)` · 동일 날짜·상품 덮어쓰기
- **저장 column** (22 개):
  snapshot_date, product_code, period_start_date, period_type (early/mid/late),
  supplier_code, supplier_name, product_name, spec, tax_type, product_type,
  opening_stock, purchase_qty, sale_qty, disposal_qty, internal_qty, adjustment_qty, closing_stock,
  taxable_amount, supply_amount, vat, duty_free_amount, total_amount

### 특이사항
- `snapshot_date` 는 query param 으로 받음 (Excel 안엔 없음) → **ERP sync 는 조회 시점 날짜로 자동 설정 가능**
- `period_type` 자동 판정 (DD 기준 1-10 early · 11-20 mid · 21+ late)
- `force=true` 로 기간 전체 DELETE 후 재입력 지원

### ERP API 매핑
- **ERP API 확정**: ⏸ 사용자 액션 필요 (아래 참조) · Inventory_Status 와 다를 가능성 있음
- **Inventory_Status 로 추정 매핑 (현재 데이터로 가능한 범위)**:
  | Supabase | ERP (Inventory_Status) | 비고 |
  |---|---|---|
  | product_code | PCode | ✅ |
  | product_name | ProductName | ✅ |
  | supplier_name | CCorpName | ✅ |
  | supplier_code | CtCode | ✅ |
  | spec | **없음** | ❌ |
  | tax_type | IsTax · TaxPercent 조합 | ⚠ 변환 필요 |
  | opening_stock | PrvStock | ✅ |
  | purchase_qty | BuyStock | ✅ |
  | sale_qty | SaleStock | ✅ |
  | disposal_qty | ProductBadStock | ⚠ 확인 필요 |
  | internal_qty | ProductUseStock | ⚠ 확인 필요 |
  | adjustment_qty | PlusStock + MinusStock | ⚠ 계산 공식 확정 필요 |
  | closing_stock | **계산** (opening + 모든 이동) | ⚠ 공식 확정 필요 |
  | taxable_amount | **없음** · 금액 아닌 수량만 | ❌ |
  | supply_amount | **없음** | ❌ |
  | vat | **없음** | ❌ |
  | duty_free_amount | **없음** | ❌ |
  | total_amount | **없음** | ❌ |

### MISSING (기존 Excel 에만 있는 것)
- 금액 column 전체 (taxable_amount · supply_amount · vat · duty_free_amount · total_amount)
- spec, tax_type (텍스트), product_type

### 결론
**Inventory_Status 로 재고 집계 수량은 가능하지만 금액 집계 (공급가액 · 부가세 · 합계) 는 못 얻음**. → `stock_history` 를 완전히 대체하려면 **ERP "상품 재고 현황" 메뉴 Fiddler 캡쳐 필요** · 다른 SOAP method 가능성 높음.

---

## 3. 매입 현황

### 기존 Excel · `매입` (POST `/api/upload-purchase-details`)
파일: `server/routes/purchase/purchase.ts:94-388` · 이중 헤더 + 결합 헤더 (중복 제거용) 지원

### Excel 컬럼 (정규식 기반 감지)
```
매입일자 (필수), 상품코드 (필수), 상품명, 공급사명, 공급사코드, 규격,
수량 (매입합계 수량 or 수량 · netQty = qty - returnQty),
단가 (평균매입단가), 금액 (netAmt = amt - returnAmt),
반품수량, 반품금액 (계산용만 · 저장 X),
부가세, 합계,
유통기한 (2026-09-03 추가 · 검수 시 입력)
```

### Supabase target · `purchase_details`
- **UPSERT key**: `(purchase_date, COALESCE(supplier_code,''), product_code, quantity, amount)` · ignoreDuplicates
- **저장 column** (14 개):
  purchase_date, period_start_date, period_type,
  supplier_code, supplier_name,
  product_code, product_name, spec,
  quantity, unit_price, amount, vat, total,
  expiry_date

### ERP API 매핑
- **ERP API 추정**: `SvcBuyBiz.asmx` · `Buy_Status` method (사용자 Fiddler 분석 기준)
- **Fiddler Request 캡쳐**: ⏸ 아직 없음 (사용자 액션 필요)
- **예상 흐름** (Inventory_Status 와 동일 decoder 재사용 가능성 높음):
  - 동일 SOAP envelope 구조 (`<ent>` wrapper · 118 field · 민감 값 CorpDB_nm 재사용)
  - Buy_Status 전용 field (거래일 · 거래번호 · 공급사 거래처 코드 · 수량 · 단가 · 금액 · 유통기한) 반환 기대

### MISSING (추정)
- Buy_Status 가 금액 (quantity · unit_price · amount · vat · total) 을 모두 제공하는지 **Fiddler 캡쳐로 확인 필요**
- 반품 (qty · amt) 집계가 별도 field 인지 negative value 인지 **확인 필요**
- UPSERT key 중 `quantity · amount` 를 쓰는 이유 = ERP 가 거래 번호 (DocIdx 등) 를 제공한다면 더 안전한 unique key 가능

### 결론
**추측 금지** · Buy_Status 응답 샘플이 저장되기 전까지 매핑 확정 불가. 다음 액션 명확 (아래 참조).

---

## PROTECTED Supabase Columns 전체 리스트

### products
- `optimal_stock_backup` · wipe 방어
- `optimal_stock` (옵션 · 사용자 지시 "자체 운영 데이터" · ERP sync 에서 **덮지 말 것** · 단 Excel import 는 덮어씀 → 이원화 정책 필요)
- `hidden` · 수동 토글
- `memo` · 사용자 주석
- `shelf_positions` (JSONB)
- `location_assigned_at` · 자동 할당 타임스탬프
- `created_at`
- `expiry_date` · 사용자가 직접 수정 가능 (유통기한 검수 흐름) → ERP sync 는 **빈 값일 때만** 채우기 정책 필요

### stock_history
- 집계 테이블 특성상 PROTECTED 거의 없음
- `id · created_at` · metadata 만 보존

### purchase_details
- `verified_by · verify_status · verify_note · verified_at · verified_expiring` · 검수 메타 (사용자 지시 2026-08-29) · ERP sync 가 **절대 덮지 말 것**
- `expiry_date` · 사용자 검수 시 입력 · ERP 가 제공하면 **빈 값일 때만** 채우기

### inventory_checks (별도 flow · ERP sync 대상 아님)
- 전체 column PROTECTED · 매장별 실재고 / 유통기한 입력 / 진열위치 세부 (별도 운영)

---

## MATCHED · MISSING · EXTRA · PROTECTED (사용자 지시 템플릿)

### MATCHED (ERP API 로 기존 Excel 대체 가능)
#### 사업장 상품관리 (Inventory_Status 기준)
`product_code · product_name · supplier · supplier_code · purchase_price · unit · display_location · sale_status`

#### 상품 재고 현황 (Inventory_Status 기준 · 수량 부분만)
`product_code · product_name · supplier_name · supplier_code · opening_stock · purchase_qty · sale_qty`

#### 매입 현황
**Buy_Status Fiddler 캡쳐 전까지 unknown**

### MISSING (ERP API 미제공 · 기존 Excel 만 제공)
#### 사업장 상품관리
`sale_price · category_code · spec · expiry_date · origin · wholesale_price1 · min_order · search_keywords · last_purchase_date · last_sale_date`

#### 상품 재고 현황
`spec · tax_type · taxable_amount · supply_amount · vat · duty_free_amount · total_amount` (금액 집계 전체)

#### 매입 현황
**Buy_Status Fiddler 캡쳐 전까지 unknown**

### EXTRA (ERP API 에만 있고 기존 Excel/Import 미사용)
#### Inventory_Status
`PPCode · CostPrice1~4 · ConfirmDate1~3 · IsTax · TaxPercent · 재고 이동 16 종 (BuyReturnStock · ProductUseStock · PlusStock · MinusStock · SubdivisionPlus/Minus · StorageMove* 등)`

### PROTECTED (ERP sync 가 **절대 덮지 말 것** · 사용자 지시 중요 원칙)
`products.optimal_stock_backup · products.optimal_stock · products.hidden · products.memo · products.shelf_positions · products.location_assigned_at`
`purchase_details.verified_* · purchase_details.verify_* (검수 메타)`
`inventory_checks.* (전체 · 별도 flow)`

---

## NEXT ACTION · 사용자 액션 요청 2 가지

### 액션 1 · ERP "사업장 상품관리" 메뉴 Fiddler 캡쳐
목표: 지금 쓰는 Inventory_Status 와 **다른 SOAP method 가 있는지** 확인.

방법:
1. Iregen ERP 프로그램 → `사업장 상품관리` 메뉴 클릭 → 조회
2. Fiddler 세션 리스트에서 `soap.iregen.co.kr` 호출 선택
3. **Request Raw** 전체 저장: `tools/iregen-bridge/samples/products-request.txt`
4. 저장 완료 알려주시면 저희가 비교 분석

### 액션 2 · ERP "상품 재고 현황" 메뉴 Fiddler 캡쳐
동일 방법 · 저장 경로: `tools/iregen-bridge/samples/stock-request.txt`

### 액션 3 · ERP "매입 현황" 메뉴 Fiddler 캡쳐 (Buy_Status 확정)
동일 방법 · 저장 경로: `tools/iregen-bridge/samples/buy-request.txt`

세 캡쳐 중 **먼저 1 개 저장되면** 즉시 decoder 재사용 + builder 작성 + UI 탭 추가로 PHASE 1 "LIVE QUERY 성공" 단계로 넘어감.

---

## 다음 단계용 Sync 정책 설계 (대기 중 · 참고)

사용자 지시 10 번 기준 · PHASE 2 에서 적용할 UPSERT 정책 ·

### products (사업장 상품관리)
```
WHERE product_code = ERP.PCode
IF NOT EXISTS:
  INSERT (ERP SOURCE columns only)
ELSE:
  UPDATE (ERP SOURCE columns · WEB SOURCE columns 보존)

ERP 값이 null/empty:
  COALESCE 로 기존 값 보존 (기본)
```

### stock_history (상품 재고 현황)
```
UPSERT key: (snapshot_date, product_code)
snapshot_date = ERP 조회 시점 (new Date().toISOString().slice(0,10))
전체 column 덮어쓰기 (집계 테이블 · PROTECTED 없음)
```

### purchase_details (매입 현황)
```
UPSERT key: (purchase_date, supplier_code, product_code, quantity, amount)
ignoreDuplicates: true (기존 데이터 보존)
verified_* 필드는 ERP 가 제공하지 않으므로 자동으로 유지됨
```

---

## 완료 조건 재확인 (사용자 지시)

| 체크 | 상태 |
|---|---|
| 사업장 상품관리 LIVE QUERY 성공 | ⏸ Fiddler 캡쳐 대기 (Inventory_Status 로 임시 가능 · 전용 API 확인 필요) |
| 상품 재고 현황 LIVE QUERY 성공 | ⏸ Fiddler 캡쳐 대기 |
| 매입 현황 LIVE QUERY 성공 (Buy_Status) | ⏸ Fiddler 캡쳐 대기 |
| 기존 Excel Import 3 개 Supabase mapping 분석 | ✅ 이 문서 |

**Supabase WRITE 는 PHASE 1 완료 후 PHASE 2 에서 시작.**
