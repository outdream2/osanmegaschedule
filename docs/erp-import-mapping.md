# ERP ↔ Excel Import ↔ Supabase · PHASE 1 최종 분석

**작성일**: 2026-10-03 · **상태**: PHASE 1 분석 완료 · **PHASE 2 READY: NO** (사유: product_code 체계 불일치)

---

## 🎯 2026-10-03 추가 발견 · ProductName 72% 매칭 가능

| 매칭 방식 | 결과 |
|---|---|
| product_code 완전 일치 | **0** |
| ERP PPCode = PCode (바코드 아님 확인) | 70/70 self-ref |
| **ERP ProductName ↔ Supabase ProductName** | **2,950 / 4,070 (72%) 완전 일치** |
| ERP → SB match 못 함 (ERP 신규 또는 변형) | 1,120 |
| SB → ERP match 못 함 (자체 등록 or 변형) | 4,122 |
| Supabase `col_i` non-null | 5,714 (과세구분 "과직" · 바코드 아님) |
| Supabase `individual_code` non-null | 162 (낱개 바코드) |

**샘플 매칭**:
```
Supabase: 8806265020416 "디판버그"   ← 13자리 바코드
ERP:      PCode=12220    "디판버그"  ← 5자리 ERP 내부번호
          → ProductName 로 1:1 매핑 가능
```

**결론**: 사용자 추측 "바코드 연결" 은 Product_List 102 col 안에 **BarCode / JAN_Code** 같은 field 가 포함되어 있을 가능성 매우 높음 (아직 수집 X). 수집 전까진 **ProductName 72% 자동 매칭 + 28% 수동 매핑** 가능.

**LocationName → display_location (사용자 지시 5 번)**: ERP_OWNED 확정 · shelf_positions · location_assigned_at 은 PROTECTED 유지

---

## 🚨 CRITICAL FINDING · ERP ↔ Supabase product_code 완전 불일치

| 체계 | ERP (Inventory_Status) | Supabase (products) |
|---|---|---|
| 전체 rows | 4,070 | **7,078** |
| 코드 체계 | 내부 상품번호 | 바코드 (GTIN) |
| 길이 분포 | **5자리 (100%)** | 13자리 82% · 16자리 · 14자리 · 12자리 · 8자리 등 매우 다양 |
| 샘플 | `10001` `10005` `15291` | `8806999064908` `8806011615453` ... |
| **product_code 교집합** | **0 (ZERO)** | **0** |

**Supabase 샘플 row**:
```
product_code: "8806999064908"  ← 바코드
product_name: "유판씨 톡톡 비타민C (레몬)"
supplier: "중외제약(vat미포함)"
display_location: "37"
optimal_stock: 0 (사용자 입력)
hidden: false
...
```

**ERP Inventory_Status 샘플 row**:
```
PCode: "10001"              ← ERP 내부 5자리
ProductName: "삼양연고 100g"
CCorpName: "라라컴퍼니"
LocationName: "벽>21>전체>전체"
```

### 함의

**product_code 매핑 테이블 없이는 ERP sync 불가능**. 그대로 UPSERT 하면 ·
- 7,078 Supabase 상품 **그대로** · 수정 X · ERP 와 매핑 X
- ERP 4,070 상품이 **신규 INSERT** · Supabase 는 7,078 + 4,070 = 11,148 상품으로 폭증
- 두 체계가 **완전 분리** 상태 유지

→ **PHASE 2 설계 전 사용자 결정 필수**.

---

## 📊 Supabase 현재 상태 (READ ONLY audit)

| Table | Rows | 비고 |
|---|---|---|
| `products` | **7,078** | ERP 4,070 보다 많음 · 바코드 체계 |
| `vendors` | **156** | 사용자/Excel 운영 |
| `purchase_details` | **12,939** | 사용자 Excel + OCR + 검수 |
| `stock_history` | **53,641** | 재고 Excel 월별 |
| `inventory_checks` | **3,400** | 자체 운영 (실재고/유통기한/진열) |

### products non-null 분포 (핵심)

| Column | non-null | 비고 |
|---|---|---|
| product_code | 7,078 (100%) | PK · 바코드 |
| product_name | 7,072 (99.9%) | |
| **optimal_stock** | **7,069 (99.9%)** | 사용자 매우 활발 |
| **optimal_stock_backup** | 7,053 (99.7%) | ERP wipe 방어 |
| **hidden** | 7,078 (100%) | 사용자 토글 |
| supplier | 7,039 (99.4%) | |
| **memo** | 5,836 (82%) | 사용자 주석 활발 |
| sale_price | 5,850 (82%) | |
| **purchase_price** | **289 (4.1%)** | ⚠ 대부분 미사용 |
| display_location | 3,175 (44%) | |
| current_stock | 3,086 (43%) | |
| spec | 2 (0.03%) | ⚠ 거의 미사용 |
| expiry_date | 0 (0%) | products 에선 미사용 · inventory_checks 쪽 사용 |

**관찰**:
- `optimal_stock · memo · hidden` · 사용자가 **매우 활발히 운영** · PROTECTED 100% 확정
- `purchase_price` · Supabase 거의 안 씀 · 실제 매입가는 `purchase_details.unit_price` 사용
- `expiry_date` · products 안엔 0 · `inventory_checks.expiry_date` 와 `purchase_details.expiry_date` 사용
- `spec` · 거의 미사용 (2 rows) · Supabase 상품에 규격 저장 안 함

---

## 🔎 ERP vs Supabase 비교 분석 (사용자 지시 14 번)

```
ERP Total (Inventory_Status):  4,070
Supabase Total (products):     7,078

Both:              0  ← ★ product_code 체계 불일치
ERP Only:      4,070  ← Supabase 에 매칭되는 상품 없음
Supabase Only: 7,078  ← ERP 에 매칭되는 상품 없음
```

**product_name 매칭**: 미실행 (fuzzy 매칭은 사용자 지시 "추측 금지" 와 상충 · 위험).

### 가능한 매칭 전략 (사용자 결정 필요)

| 옵션 | 방식 | Pros | Cons |
|---|---|---|---|
| **A** | **신규 매핑 table** `erp_product_mapping (erp_pcode PK, product_code FK)` | 기존 UI/바코드 스캔 그대로 · 안전 | 수동 매핑 7,078 개 작업 (혹은 fuzzy 자동 + 사용자 승인) |
| **B** | Supabase products 에 `erp_pcode` column 추가 | 간단 | 역시 매핑 작업 필요 |
| **C** | Supabase product_code 를 ERP PCode 로 교체 (대규모 migration) | - | ⚠ 매우 위험 · 기존 UI/주문/바코드 전부 깨짐 |
| **D** | ERP 데이터를 별도 테이블로 저장 (snapshot) · 기존 products 와 분리 | 안전 | ERP → products 연결 안 됨 · 사용자 의도와 불일치 |

**추천**: **옵션 A** · 매핑 테이블 신규 · 1 회 매핑 작업 후 지속 유지

---

## 📋 PHASE 1 ERP API 확정

### Product_List
| 항목 | 값 |
|---|---|
| Total Columns | 102 (사용자 검증) |
| Confirmed | 11 (아래) |
| Missing (추정) | 1-2 (`category_code` · `expiry_date`) |
| Uncertain | **8+ · 수집 대기** |
| Protected | 7 (products 자체 운영 column) |

**Confirmed mapping** (Inventory_Status 와 공통 field 기반):
```
PCode             → 상품코드    → (매핑 필요) products.product_code 아님
ProductName       → 상품명      → products.product_name
CCorpName         → 공급사      → products.supplier
CtCode            → 공급사코드  → products.supplier_code
CostPrice         → 매입단가    → products.purchase_price (현재 거의 미사용)
UnitCode          → 단위        → products.unit
IsSaleStatusName  → 판매상태    → products.sale_status
LocationName      → 진열위치    → products.display_location (⚠ 사용자 수동 입력도)
McateName (추정)  → 분류        → products.category
```

**Uncertain 8+** (102 col 수집 후 확정): `sale_price · spec · origin · wholesale_price1 · min_order · search_keywords · registered_at · last_purchase_date · last_sale_date`

### Inventory_Status (완전 확정)
| 항목 | 값 |
|---|---|
| Total Columns | 42 (`inventory-full-full.json`) |
| ERP_OWNED (수량 집계) | 10 |
| MISSING | 7 (spec · product_type · 금액 집계 5종) |
| UNCERTAIN | 1 (tax_type 변환) |
| CALCULATED | 1 (closing_stock 공식) |
| PROTECTED | 0 (집계 테이블) |

### Buy_Status
| 항목 | 값 |
|---|---|
| Total Columns | ? · 수집 대기 |
| Confirmed | 0 (column 이름 미확정 · 값 자체는 ERP 화면과 일치) |
| Uncertain | 12 |
| Protected | 5 (`verified_by · verify_status · verify_note · verified_at · verified_expiring`) |

**값 일치 확인됨**: 상품코드 `10805 · 10812 · 12031 · 12035 · 12036` · 수량 10/건 · 총 50

---

## 🛡️ PROTECTED COLUMNS 전체 리스트

### products
| column | 사용 화면 | 보호 이유 |
|---|---|---|
| `optimal_stock` | OrderPage (발주 필요 판정) · ProductListPage 인라인 편집 | 사용자가 **99.9% 활발 입력** · ERP 미제공 |
| `optimal_stock_backup` | 자동 (optimal_stock 과 함께) | ERP wipe 방어 복원용 |
| `hidden` | ProductListPage 숨김 필터 · soft-delete | 사용자 수동 토글 · 100% 운영 |
| `memo` | ProductInfoPage 비고 | 사용자 수동 입력 · 82% 사용 |
| `location` | shelf_positions 자동 배정 기초 | 사용자 수동 · ERP LocationName 과 체계 차이 가능성 |
| `display_location` | 진열위치 조회 · display_request 매칭 | 사용자 수동 (`"37"` 처럼 ERP `"벽>21>전체>전체"` 와 포맷 완전 다름) |
| `current_stock` | 재고 조회 | ⚠ UNCERTAIN · ERP sync 대상 아닐 가능성 (inventory_checks 가 real stock 담당) |
| `sale_price` | 주문가 · ProductListPage PATCH | 사용자 PATCH 가능 (82% 사용) · ERP 가 매번 덮으면 수동 수정 손실 |
| `purchase_price` | 상품 상세 · ProductListPage PATCH | 사용자 PATCH 가능 (4% 사용 · 거의 미사용) · ERP CostPrice 로 덮어도 영향 미미 |
| `sale_status` | 판매중/판매중지 필터 | PATCH 인라인 · 사용자 수동 |
| `stock_note` | current_stock 파싱 실패 fallback | 자체 운영 |
| `created_at` | metadata | immutable |

### vendors (ERP 제공 안 함 · 전부 사용자/Excel 운영)
`company_name · contact_name · phone · email · category · note · business_number · approval_status · team_leader_* · emergency_contact · order_method · region · invoice_method · password_hash · ... (24 column 전체)`

### purchase_details (검수 메타)
`verified_by · verify_status · verify_note · verified_at · verified_expiring · expiry_date` (사용자 검수 시 입력)

### inventory_checks (**전체 PROTECTED · ERP sync 대상 아님**)
`warehouse1_stock · warehouse2_stock · store1_stock · store2_stock · store3_stock · store1_zone · store2_zone · store3_zone · shelf_positions · expiry_date · expiry_input_date · checked_by · note · checked_at · status · system_stock`

---

## 🔁 ERP_OWNED COLUMNS 전체 리스트

### products (ERP sync 가 UPDATE 가능 · product_code 매핑 전제)

| Supabase column | ERP source | 기존 Excel source |
|---|---|---|
| product_name | Product_List.ProductName / Inventory.ProductName | 상품명 |
| supplier | Product_List.CCorpName / Inventory.CCorpName | 공급사 |
| supplier_code | Product_List.CtCode / Inventory.CtCode | 공급사코드 |
| category | McateName (추정) | 분류 |
| unit | UnitCode | 단위 |
| brand | Product_List.? (수집 대기) | 브랜드 |
| manufacturer | Product_List.? (수집 대기) | 제조사 |

**UNCERTAIN (수집 후 확정)**: `sale_price · spec · origin · wholesale_price1 · min_order · search_keywords · registered_at · last_purchase_date · last_sale_date`

### stock_history (전체 ERP_OWNED · 사용자 운영 column 없음)
`snapshot_date · period_start_date · period_type · product_code · product_name · supplier_code · supplier_name · opening_stock · purchase_qty · sale_qty · disposal_qty · internal_qty · adjustment_qty · closing_stock · taxable_amount · supply_amount · vat · duty_free_amount · total_amount · tax_type · product_type · spec`

### purchase_details (매입 거래 raw)
`purchase_date · supplier_code · supplier_name · product_code · product_name · spec · quantity · unit_price · amount · vat · total · period_start_date · period_type`

---

## ❓ UNCERTAIN COLUMNS

| table.column | 사유 |
|---|---|
| products.current_stock | ERP Inventory_Status 는 집계 (PrvStock + 이동), 실재고는 inventory_checks · 어느 쪽이 current_stock 소유? |
| products.profit_rate | 계산 공식 (CALCULATED) 가능성 · trigger/함수 확인 필요 |
| products.category_code | ERP 는 code 아닌 이름만 제공 가능성 |
| products.last_purchase_date | ERP 가 ConfirmDate 로 제공 가능성 (수집 대기) |
| products.last_sale_date | ERP 미제공 가능성 |
| products.registered_at | ERP 제공 여부 미확정 |

---

## 🧪 DRY-RUN 설계 (코드 미구현 · 설계만)

PHASE 2 에서 사용할 구조 ·

```ts
interface ProductDiff {
  erp_pcode: string;             // ERP PCode
  supabase_product_code?: string; // 매핑된 Supabase 바코드 (매핑 테이블 조회)
  action: "INSERT" | "UPDATE" | "NO_CHANGE" | "ERP_ONLY_NO_MAPPING" | "SUPABASE_ONLY";
  updates?: Array<{
    column: string;
    oldValue: unknown;
    newValue: unknown;
    isProtected: boolean; // true 이면 UPDATE payload 에서 제외
  }>;
}
```

### UPDATE payload 생성 규칙
```ts
const ERP_OWNED_COLUMNS = new Set([
  "product_name", "supplier", "supplier_code", "category", "unit", "brand", "manufacturer",
  // UNCERTAIN 는 사용자 결정 후 추가
]);

function buildUpdatePayload(erpRow: ProductListRow, dbRow: Product) {
  const payload: Partial<Product> = {};
  for (const col of ERP_OWNED_COLUMNS) {
    const erpVal = mapErpToDb(col, erpRow);
    const dbVal = dbRow[col];
    if (erpVal === null || erpVal === undefined || erpVal === "") continue; // NULL overwrite 금지
    if (erpVal === dbVal) continue; // same · 변경 없음
    payload[col] = erpVal;
  }
  return payload; // PROTECTED column 포함 X · 전체 row spread 금지
}
```

### 신규 INSERT 규칙
```ts
function buildInsertPayload(erpRow: ProductListRow) {
  // ERP_OWNED 만 포함 · PROTECTED 는 DB DEFAULT or NULL
  return {
    product_code: /* 매핑 테이블로 결정된 바코드 또는 ERP PCode (사용자 결정) */,
    product_name: erpRow.ProductName,
    supplier: erpRow.CCorpName,
    supplier_code: erpRow.CtCode,
    unit: erpRow.UnitCode,
    sale_status: erpRow.IsSaleStatusName,
    // optimal_stock · hidden · memo · display_location · ... PROTECTED 는 생략
  };
}
```

### DELETE 금지
사용자 지시 13 번 · ERP 에 없는 Supabase 상품을 자동 DELETE **절대 금지**. 상태 column (`ERP_MISSING` 등) 신규 추가는 PHASE 3 이후.

---

## 📈 EXISTING DATA IMPACT 예측 (사용자 지시 양식)

**product_code 매핑 테이블이 없는 현재 상태**로 ERP Sync 를 실행하면 ·

```
UPDATE 대상 기존 rows:        0  (매핑 없음)
INSERT 대상 신규 rows:    4,070  (전체 ERP 상품이 신규로 INSERT 됨)
NO CHANGE:                     0
ERP Only:                 4,070
Supabase Only:            7,078

Protected values affected:     0 (INSERT 만 하면 기존 7,078 영향 X)
```

→ **매핑 전까진 UPDATE 가 사실상 작동 안 함**. INSERT 만 하면 4,070 상품이 **중복 INSERT 되어** Supabase 상품 수가 11,148 로 폭증. **잘못된 결과**.

---

## 🚦 PHASE 2 READY: **NO**

### 사유 (사용자 지시 양식)

1. **🚨 product_code 체계 불일치** (최중요 · BLOCKER)
   - ERP PCode (5자리) ↔ Supabase product_code (바코드)
   - 교집합 0
   - 매핑 전략 결정 전 ERP sync 불가능
   - **사용자 지시 필요**: A/B/C/D 옵션 중 선택

2. **Product_List 102 col 전체 미수집**
   - sale_price · spec · origin 등 UNCERTAIN 8+ 확정 불가
   - 사용자 터미널 로그 공유 필요 (저번 커밋 `495208f4` 로 자동 출력 설정)

3. **Buy_Status 전체 col 미수집**
   - purchase_details UPSERT 매핑 작성 불가
   - 매입 현황 조회 1 회 터미널 로그 공유 필요

4. **current_stock · profit_rate · category_code · last_purchase_date · last_sale_date UNCERTAIN**
   - 각각 ERP 제공 여부 미확정
   - calculated 인지 ERP_OWNED 인지 명확화 필요

### PHASE 2 진입 체크리스트
- [ ] 사용자 결정 · product_code 매핑 전략 (A/B/C/D 중 선택)
- [ ] Product_List 102 col 전체 수집 → UNCERTAIN 8+ → CONFIRMED/MISSING
- [ ] Buy_Status 전체 col 수집
- [ ] 매핑 테이블 또는 erp_pcode column 신규 설계 (옵션 A/B 선택 시)
- [ ] 사용자 PHASE 2 (Supabase WRITE) 명시 승인

---

## 🚨 자동동기화 정책 (사용자 지시 재확인)

- **Product_List 자동동기화**: `concurrency = 1` **고정** (ERP 부하 최소화)
- **수동 검증 UI** 5/3/1 radio: **유지** (사람이 성능 테스트할 때만 5 사용)
- 자동 scheduler 는 `queryProductList({ concurrency: 1 })` **강제**
- memory 저장: `feedback_product_list_sync_concurrency_2026-10-03.md`

---

## 📂 조사 자료 (이번 분석에서 사용)

- `tools/iregen-bridge/output/inventory-full-full.json` · ERP 4,070 상품 전체 · 42 col 전체
- `scripts/supabase-readonly-audit.mjs` · Supabase 5 테이블 · row count · null 비율 · sample
- `scripts/erp-supabase-diff.mjs` · 교집합 분석 · Both=0 확인
- `scripts/sb-code-dist.mjs` · product_code 길이 분포
- `server/routes/stock/products.ts` (1348 라인 · xlsx + CRUD · ERP 호환 지점)
- `server/routes/stock/stockManage/uploadStock.ts` · 재고 Excel
- `server/routes/purchase/purchase.ts` · 매입 Excel
- `server/routes/stock/display/requests.ts` · 진열 요청/승인
- `server/routes/stock/inventoryChecks/*` · 실재고/유통기한

---

## 안전 체크 (사용자 지시 18 번)
- [x] Supabase INSERT / UPDATE / UPSERT / DELETE · **없음** (READ ONLY audit만)
- [x] migration · **없음**
- [x] scheduler 구현 · **없음**
- [x] SOAP request 변경 · **없음**
- [x] decoder 변경 · **없음**
- [x] pagination · **변경 없음**
- [x] concurrency · **변경 없음**
- [x] 기존 XLSX importer · **변경 없음**
- [x] 현재 데이터 정리/삭제 · **없음**
