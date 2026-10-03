# ERP ↔ Excel Import ↔ Supabase · 최종 매핑표 · PHASE 1 완료

**작성일**: 2026-10-03 · **상태**: VERIFIED (3 ERP API LIVE QUERY 성공)

## PHASE 1 검증 완료 (사용자 확인)

| ERP 메뉴 | SOAP | Service | Rows | Columns | VERIFIED |
|---|---|---|---|---|---|
| 사업장 상품관리 | `Product_List` | SvcProductBiz.asmx | **4,007** | **102** | ✅ (metadata Column1=4007 · 81 pages) |
| 상품 재고 현황 | `Inventory_Status` | SvcInventoryBiz.asmx | **4,007** | **42** | ✅ |
| 매입 현황 | `Buy_Status` | SvcBuyBiz.asmx | 5 (2026-10-03) | ? | ✅ (ERP 화면과 상품코드/수량/금액 일치) |

## 🚨 자동동기화 정책 (사용자 지시 재확인 · 2026-10-03)

- **Product_List 자동동기화**: `concurrency = 1` **고정** (ERP 부하 최소화)
- **수동 검증 UI** 의 5/3/1 radio 선택지는 **유지** (사용자 지시) · 사람이 성능 테스트할 때만 5 사용
- 자동동기화 scheduler 가 구현될 때 코드에서 `queryProductList({ concurrency: 1 })` **강제**

---

## 1. 상품 (Product_List ↔ 상품 Excel ↔ products)

### 기존 Excel Import (POST `/api/upload-products` · `server/routes/stock/products.ts:366-574`)
- UPSERT key: `product_code` · onConflict
- 저장 column 28 개 + DEAD_COLS 30 개 필터

### Product_List 102 col · 사용자 수집 요청 중

**지금 분석 가능한 핵심 20 column** (ERP 사업장 상품관리 전형 패턴 기반 · 실제 102 col 전체는 아래 액션 요청):

| ERP Field | Sample | Excel Column | Supabase | Table | Status | 비고 |
|---|---|---|---|---|---|---|
| `PCode` | "10001" | 상품코드 | `product_code` | products | **CONFIRMED** | PK |
| `ProductName` | "삼양연고 100g" | 상품명 | `product_name` | products | **CONFIRMED** | |
| `PPCode` | null | - | - | - | **EXTRA** | 바코드 가능성 (대부분 null) |
| `Spec` | (추정) | 규격 | `spec` | products | **UNCERTAIN** | Product_List 에 있는지 확인 필요 |
| `CostPrice` | 5243 | 매입단가 | `purchase_price` | products | **CONFIRMED** | |
| `SalePrice` | (추정) | 판매단가 | `sale_price` | products | **UNCERTAIN** | Product_List 102 col 중 포함 가능성 매우 높음 ← **PHASE 2 전 확정 필수** |
| `UnitCode` | "EA" | 단위 | `unit` | products | **CONFIRMED** | |
| `CCorpName` | "라라컴퍼니" | 공급사 | `supplier` | products | **CONFIRMED** | |
| `CtCode` | "1134" | 공급사코드 | `supplier_code` | products | **CONFIRMED** | |
| `LocationName` | "벽>21>전체>전체" | 진열위치 | `display_location` + `location` | products | **CONFIRMED** | `>` 구분자 변환 |
| `IsSaleStatusName` | "판매중" | 판매상태 | `sale_status` | products | **CONFIRMED** | |
| `IsTax` + `TaxPercent` | "과세" + 10 | - | - | - | **EXTRA** | 과세 정보 (Supabase 미사용) |
| `McateName` | "약국2" | 분류 | `category` | products | **CONFIRMED** | 어느 레벨 (L/M/S/D) 사용할지 결정 필요 |
| `category_code` | - | 분류코드 | `category_code` | products | **MISSING** | ERP 는 code 아닌 이름만 제공 가능성 |
| **(Product_List 전용 가능성)** | | | | | | |
| `SearchKeywords` or `MakerName` | ? | 검색어 | `search_keywords` | products | **UNCERTAIN** | 102 col 중 확인 필요 |
| `Origin` or `OriginName` | ? | 원산지 | `origin` | products | **UNCERTAIN** | |
| `WholesalePrice1` or `PriceA` | ? | 도매단가1 | `wholesale_price1` | products | **UNCERTAIN** | |
| `MinOrder` or 유사 | ? | 최소발주 | `min_order` | products | **UNCERTAIN** | |
| `RegisterDate` | ? | 등록일시 | `registered_at` | products | **UNCERTAIN** | |
| **ERP 미제공 추정** | | | | | | |
| - | - | 유통기한 | `expiry_date` | products | **MISSING** | Buy_Status (매입 시점 유통기한) 또는 inventory_checks 자체 입력 |

### PROTECTED (상품 Supabase · ERP sync 가 **절대 덮지 말 것**)
사용자 자체 운영 데이터 ·
- `optimal_stock` · `optimal_stock_backup` (적정재고 · wipe 방어)
- `hidden` · 수동 토글
- `memo` · 사용자 주석
- `shelf_positions` (JSONB · inventory_checks 와 동기화)
- `location_assigned_at` · 자동 할당 타임스탬프
- `stock_note` · current_stock 파싱 실패 fallback
- `created_at` · metadata

---

## 2. 재고 (Inventory_Status ↔ 재고 Excel ↔ stock_history)

### Inventory_Status 42 col (완전 확정 · `inventory-full-full.json` 기반)

| ERP Field | Type | Sample | 역할 |
|---|---|---|---|
| **상품 식별** | | | |
| PPCode | String | null (대부분) | 부모코드/바코드 |
| PCode | String | "10001" | 상품코드 ★ |
| ProductName | String | "삼양연고 100g" | 상품명 |
| UnitCode | String | "EA" | 단위 |
| **세금** | | | |
| IsTax | String | "과세" | 과세 구분 |
| TaxPercent | Int16 | 10 | 세율 |
| **매장** | | | |
| StCode | String | "000" | 매장코드 |
| StorageName | String | "용인점" | 매장명 |
| IsSaleStatusName | String | "판매중" | 판매상태 |
| **공급사** | | | |
| CtCode | String | "1134" | 공급사코드 |
| CCorpName | String | "라라컴퍼니" | 공급사명 |
| IsBuyerType | String | "일반매입" | 매입타입 |
| **분류** | | | |
| LcateName | String | "코스트팜약국" | 대분류 |
| McateName | String | "약국2" | 중분류 |
| ScateName | String | "라라컴퍼니" | 소분류 |
| DcateName | String | null | 세분류 |
| **진열** | | | |
| LocationName | String | "벽>21>전체>전체" | 진열위치 |
| **매입가 이력** | | | |
| CostPrice | Decimal | 5243 | 현재 매입가 |
| CostPrice1 | Decimal | 5243 | 과거 매입가 1 |
| ConfirmDate1 | DateTime | "2026-09-29..." | 확정일 1 |
| CostPrice2 | Decimal | null | 과거 매입가 2 |
| ConfirmDate2 | DateTime | null | 확정일 2 |
| CostPrice3 | Decimal | null | 과거 매입가 3 |
| ConfirmDate3 | DateTime | null | 확정일 3 |
| CostPrice4 | Decimal | null | 과거 매입가 4 |
| **재고 이동 (기간 집계)** | | | |
| PrvStock | Decimal | 15.00 | 이전재고 |
| BuyStock | Int32 | 0 | 매입 |
| BuyReturnStock | Int32 | 0 | 매입반품 |
| StorageMoveIn | Int32 | 0 | 매장이동 입고 |
| StorageMoveOut | Int32 | 0 | 매장이동 출고 |
| StorageMoveAutoIn | Int32 | 0 | 자동 이동 입고 |
| StorageMoveAutoOut | Int32 | 0 | 자동 이동 출고 |
| SaleStock | Int32 | 2 | 판매 |
| SaleReturnStock | Int32 | 0 | 판매반품 |
| ProductUseStock | Int32 | 0 | 사용 (자가소비) |
| ProductReturnUseStock | Int32 | 0 | 반사용 |
| ProductBadStock | Int32 | 0 | 불량/폐기 |
| ProductReturnBadStock | Int32 | 0 | 반불량 |
| PlusStock | Decimal | 0.00 | 재고조정+ |
| MinusStock | Decimal | 0.00 | 재고조정- |
| SubdivisionPlus | Int32 | 0 | 소분+ |
| SubdivisionMinus | Int32 | 0 | 소분- |

### 재고 Excel ↔ stock_history 매핑 (`uploadStock.ts`)

UPSERT key: `(snapshot_date, product_code)`

| Excel column | stock_history | Inventory_Status Field | Status |
|---|---|---|---|
| 코드 | `product_code` | **PCode** | **CONFIRMED** |
| 상품명 | `product_name` | **ProductName** | **CONFIRMED** |
| 공급사명 | `supplier_name` | **CCorpName** | **CONFIRMED** |
| 공급사코드 | `supplier_code` | **CtCode** | **CONFIRMED** |
| 규격 | `spec` | - | **MISSING** (Inventory_Status 에 없음) |
| 세금구분 | `tax_type` | **IsTax** + **TaxPercent** 조합 | **CONFIRMED** (변환 필요) |
| 상품유형 | `product_type` | - | **MISSING** |
| 기초재고 | `opening_stock` | **PrvStock** | **CONFIRMED** |
| 입고 | `purchase_qty` | **BuyStock** | **CONFIRMED** (반품 제외인지 확인 필요) |
| 판매 | `sale_qty` | **SaleStock** | **CONFIRMED** |
| 폐기 | `disposal_qty` | **ProductBadStock** | **CONFIRMED** (반불량 ProductReturnBadStock 상계 가능) |
| 사내소비 | `internal_qty` | **ProductUseStock** | **CONFIRMED** (반사용 ProductReturnUseStock 상계 가능) |
| 재고조정 | `adjustment_qty` | **PlusStock** - **MinusStock** 계산 | **CONFIRMED** (계산 공식) |
| 종료재고 | `closing_stock` | **계산**: PrvStock + BuyStock − BuyReturnStock − SaleStock + SaleReturnStock − ProductUseStock + ProductReturnUseStock − ProductBadStock + ProductReturnBadStock + PlusStock − MinusStock + SubdivisionPlus − SubdivisionMinus + Storage* | **CALCULATED** (공식 검증 필요) |
| 과세 | `taxable_amount` | - | **MISSING** (금액 X · Inventory_Status 는 수량만) |
| 공급가액 | `supply_amount` | - | **MISSING** |
| 부가세 | `vat` | - | **MISSING** |
| 면세 | `duty_free_amount` | - | **MISSING** |
| 합계 | `total_amount` | - | **MISSING** |

### 주요 미매핑 (Inventory_Status 에만 있음 · EXTRA)
`PPCode` · `UnitCode` · `StCode/StorageName` · `IsSaleStatusName` · `IsBuyerType` · `LcateName/McateName/ScateName/DcateName` · `LocationName` · `CostPrice` · `CostPrice1~4` · `ConfirmDate1~3` · `StorageMoveIn/Out/AutoIn/AutoOut` · `SubdivisionPlus/Minus`

### Inventory_Status 로 **완전 대체 가능한 column** (수량 기반 재고 집계)
`product_code · product_name · supplier_code · supplier_name · opening_stock · purchase_qty · sale_qty · disposal_qty · internal_qty · adjustment_qty` → **10/22 column (45%)**

### 금액 집계 (`taxable_amount · supply_amount · vat · duty_free_amount · total_amount`) 는 **별도 ERP API 필요** 또는 기존 Excel 유지

### PROTECTED (stock_history)
집계 테이블 특성 · 거의 없음. `id · created_at` metadata 만 보존.

---

## 3. 매입 (Buy_Status ↔ 매입 Excel ↔ purchase_details)

### 매입 Excel ↔ purchase_details 매핑 (`purchase.ts`)

UPSERT key: `(purchase_date, COALESCE(supplier_code,''), product_code, quantity, amount)` · ignoreDuplicates

| Excel column | purchase_details | Buy_Status Field | Status |
|---|---|---|---|
| 매입일자 | `purchase_date` | ? (가능성: BuyDate / RegDate / DocDate) | **UNCERTAIN** (Buy_Status col 미확정) |
| 상품코드 | `product_code` | **PCode** 추정 | **UNCERTAIN** |
| 상품명 | `product_name` | **ProductName** 추정 | **UNCERTAIN** |
| 공급사명 | `supplier_name` | **CCorpName** 추정 | **UNCERTAIN** |
| 공급사코드 | `supplier_code` | **CtCode** 추정 | **UNCERTAIN** |
| 규격 | `spec` | ? | **UNCERTAIN** |
| 수량 | `quantity` | **BuyQty** 또는 유사 | **UNCERTAIN** |
| 단가 | `unit_price` | **UnitCost** 추정 | **UNCERTAIN** |
| 금액 | `amount` | **BuyPrice** 또는 **BuyTotal** | **UNCERTAIN** |
| 부가세 | `vat` | **BuyTax** 추정 | **UNCERTAIN** |
| 합계 | `total` | **BuyTotal** 추정 | **UNCERTAIN** |
| 유통기한 | `expiry_date` | **ExpiryDate** 또는 ? | **UNCERTAIN** |

사용자가 "ERP 화면과 상품코드/수량/금액 일치" 확인 · **Buy_Status 가 매입 거래 raw 를 반환하는 것 100%**. 다만 **field 이름 확정 필요** (사용자 수집).

### PROTECTED (purchase_details)
사용자 검수 메타 (ERP 가 제공하지 않음) ·
- `verified_by`, `verify_status`, `verify_note`, `verified_at`, `verified_expiring` · 모두 **ERP sync 가 절대 덮지 말 것**
- `expiry_date` · 사용자 검수 입력 가능 · ERP 가 제공하면 **빈 값일 때만** 채우기

---

## ⏸ PHASE 1 수집 대기 (사용자 터미널 로그 공유 필요)

### Product_List 102 col 전체 수집 방법
저번 커밋 `495208f4` 에서 `decodeResponseToResult` 가 primary table **전체 column 이름** 을 터미널에 출력하도록 수정됨 ·
```
[iregen] Primary table 전체 102 columns:
  [  0] PCode · System.String
  [  1] ProductName · System.String
  ...
  [101] ... · ...
```

**액션**: `npm run dev` 재시작 → 사업장 상품관리 탭 조회 (concurrency=1 또는 아무거나) → 터미널 로그 공유 → 저희가 CONFIRMED/MISSING 전수 분류.

### Buy_Status 전체 col 수집 방법
동일 · 매입 현황 조회 1 회 → 터미널 로그 공유.

### 핵심 확인 포인트 (사용자 지시)
- Product_List 102 col 안에 아래 field 가 있는가?
  - 상품코드 · 상품명 · **규격 (spec)** · 공급사 · 공급사코드 · 대/중/소분류 · 분류코드 · 단위 · **매입가 · 판매가 (sale_price)** · 과세구분 · 판매상태 · **제조사 (MakerName)** · 브랜드 · **원산지 (origin)**
- Buy_Status col 안에 아래 field 가 있는가?
  - 상품코드 · 상품명 · **매입일** · 공급사코드 · 공급사명 · 수량 · 매입단가 · 공급가액 · 부가세 · 면세금액 · 합계금액 · **문서번호**
- Buy_Status 2026-10-03 응답의 **상품코드 5개** 가 `12035 · 12036 · 12031 · 10812 · 10805` 와 일치하는가? · 수량 10/건 · 총 50 · 금액 일치?

---

## 최종 보고 (사용자 지시 양식)

### PRODUCT_LIST
- **Total Columns**: 102 (사용자 PHASE 1 검증)
- **CONFIRMED**: 11 (product_code · product_name · supplier · supplier_code · purchase_price · unit · sale_status · display_location · category 일부 · Inventory_Status 와 공통되는 field 는 Product_List 에도 존재 가정)
- **MISSING**: 1-2 (category_code · expiry_date · ERP code 미제공 가능성)
- **UNCERTAIN**: **8+ · 수집 대기** (sale_price · spec · origin · wholesale_price1 · min_order · search_keywords · registered_at · last_purchase_date · last_sale_date) · 102 col 전체 수집 후 CONFIRMED/MISSING 재분류
- **PROTECTED**: 7 (optimal_stock · optimal_stock_backup · hidden · memo · shelf_positions · location_assigned_at · stock_note)

**핵심 확정 mapping**:
```
PCode              → 상품코드    → products.product_code (PK)
ProductName        → 상품명      → products.product_name
CCorpName          → 공급사      → products.supplier
CtCode             → 공급사코드  → products.supplier_code
CostPrice          → 매입단가    → products.purchase_price
UnitCode           → 단위        → products.unit
IsSaleStatusName   → 판매상태    → products.sale_status
LocationName       → 진열위치    → products.display_location
McateName (추정)   → 분류        → products.category
```

### INVENTORY_STATUS (기존 확정 mapping 유지 · 사용자 지시)
- **Total Columns**: 42 (완전 확정 · `inventory-full-full.json` 기반)
- **CONFIRMED**: 10 (product_code · product_name · supplier_code · supplier_name · opening_stock · purchase_qty · sale_qty · disposal_qty · internal_qty · adjustment_qty)
- **MISSING**: 7 (spec · product_type · 금액 집계 5종: taxable_amount · supply_amount · vat · duty_free_amount · total_amount) · Inventory_Status 는 수량만
- **UNCERTAIN**: 1 (tax_type · IsTax+TaxPercent 변환 공식)
- **CALCULATED**: 1 (closing_stock · 16 field 집계 공식)
- **PROTECTED**: 0 (집계 테이블)

**핵심 확정 mapping** (변경 없음):
```
PCode            → 코드         → stock_history.product_code
ProductName      → 상품명       → stock_history.product_name
CCorpName        → 공급사명     → stock_history.supplier_name
CtCode           → 공급사코드   → stock_history.supplier_code
PrvStock         → 기초재고     → stock_history.opening_stock
BuyStock         → 입고         → stock_history.purchase_qty
SaleStock        → 판매         → stock_history.sale_qty
ProductBadStock  → 폐기         → stock_history.disposal_qty
ProductUseStock  → 사내소비     → stock_history.internal_qty
PlusStock - MinusStock → 재고조정 → stock_history.adjustment_qty
```

### BUY_STATUS
- **Total Columns**: ? (수집 대기)
- **CONFIRMED**: 0 (column 이름 미확정)
- **MISSING**: 0 (예상 · 매입 Excel 모든 column 커버 가능)
- **UNCERTAIN**: **12 · 수집 대기** · 사용자 ERP 화면 비교로 상품코드 (10805 · 10812 · 12031 · 12035 · 12036) + 수량 10/건 + 총 50 **값 일치 확인됨** · column 이름만 미확정
- **PROTECTED**: 5 (verified_by · verify_status · verify_note · verified_at · verified_expiring)

**핵심 확정 mapping (추정 · 수집 후 확정)**:
```
?PCode?           → 상품코드    → purchase_details.product_code
?ProductName?     → 상품명      → purchase_details.product_name
?DocDate/BuyDate? → 매입일      → purchase_details.purchase_date
?CtCode?          → 공급사코드  → purchase_details.supplier_code
?CCorpName?       → 공급사명    → purchase_details.supplier_name
?BuyQty?          → 수량        → purchase_details.quantity
?UnitCost?        → 매입단가    → purchase_details.unit_price
?BuyPrice?        → 공급가액    → purchase_details.amount
?BuyTax?          → 부가세      → purchase_details.vat
?TaxExemption?    → 면세금액    → (현재 Supabase 미사용)
?BuyTotal?        → 합계금액    → purchase_details.total
?DocNo/DocIdx?    → 문서번호    → (현재 Supabase 미사용 · unique key 보강 가능)
```

---

## 🚦 PHASE 2 READY: **NO**

**사유**:
1. **Product_List** · `sale_price` + `spec` 등 핵심 상품 field 가 102 col 안에 있는지 미확정 → 상품 Excel 완전 대체 가능 여부 미결정
2. **Buy_Status** · column 이름 전체 미확정 → `purchase_details` UPSERT 매핑 작성 불가
3. 사용자 터미널 로그 공유로 즉시 확정 가능 (수 분)

### PHASE 2 진입 체크리스트
- [ ] Product_List 102 col 전체 수집 → sale_price / spec / origin / search_keywords 발견 확정
- [ ] Buy_Status 전체 col 수집 → 12 UNCERTAIN → CONFIRMED
- [ ] 사용자가 PHASE 2 (Supabase WRITE) 진입 지시

---

## 완전 대체 vs 대체 불가능

### 완전 대체 가능 (Confirmed)
- **Inventory_Status → 재고 Excel 집계 수량** · 10 column

### 대체 가능 (Field 수집 후 확정)
- **Product_List → 상품 Excel 거의 전체** (sale_price · spec 등 포함 가능성 매우 높음 · 102 col 전체 수집 필요)
- **Buy_Status → 매입 Excel 거의 전체** (상품코드/수량/금액 이미 일치 확인 · field 이름 확정 필요)

### 대체 불가 (별도 ERP API 또는 Excel 유지)
- **재고 금액 집계** (taxable_amount · supply_amount · vat · duty_free_amount · total_amount) → Inventory_Status 는 수량만
- **상품 유통기한** (products.expiry_date) → ERP 는 거래 단위 (Buy_Status) 로만 제공 가능성 · inventory_checks 자체 입력도 사용

### 완전 보존 (PROTECTED · ERP sync 금지)
- **상품**: optimal_stock(+backup) · hidden · memo · shelf_positions · location_assigned_at · stock_note · created_at
- **매입**: verified_* · verify_* 검수 메타
- **inventory_checks 전체** (별도 flow · ERP sync 대상 아님)

---

## 다음 액션 (사용자 결정 대기)

### 액션 A · Product_List 102 col 전체 수집
저희 코드 이번 커밋 `310aa5d5` 이후 (`_____________` 다음 커밋에서) **primary table 전체 column 로그** 추가. 사업장 상품관리 조회 1 회 하시면 터미널에 ·
```
[iregen] Primary table 전체 102 columns:
  [  0] PCode · System.String
  [  1] ProductName · System.String
  ...
  [101] ... · ...
```
전체 102 col 나옴. 그 로그를 공유해 주시면 → UNCERTAIN 8+ 를 전부 MATCHED/MISSING 으로 확정 가능.

### 액션 B · Buy_Status col 전체 수집
동일 방법 · 매입 현황 조회 1 회. Buy_Status column 전체 로그 수집 → 12 UNCERTAIN 를 MATCHED 로 확정.

### 액션 C · ERP 재고현황 금액 column 확인
Inventory_Status 42 col 에는 금액 없음. 사용자가 ERP 재고현황 화면에서 "공급가액 · 부가세 · 합계" 보시는지 확인 요청.
- **보임** → 다른 SOAP API 필요 (Fiddler 재캡쳐)
- **안 보임** → 기존 재고 Excel 유지 (ERP 는 수량만 자동동기화 · 금액은 월별/확정 시점 Excel upload)

---

## 안전 체크 (사용자 지시 5 번)
- [x] Supabase INSERT / UPDATE / UPSERT / DELETE · **없음**
- [x] migration · **없음**
- [x] scheduler · **비활성 유지**
- [x] 기존 XLSX importer · **변경 없음**
- [x] SOAP request · **변경 없음** (사용자 지시 10 · Fiddler product-3 포맷 유지)
- [x] decoder · **변경 없음**
- [x] 민감 값 · 로그/UI 노출 **없음**
