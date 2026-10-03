# Initial Data Build · Architecture 설계 문서

**작성일**: 2026-10-03 저녁 · **상태**: 설계 완성 · WRITE 미구현 · DB WRITE 금지 중
**목적**: ERP SOAP → Supabase 실제 운영 데이터 전환 설계 완성 · 실행은 사용자 명시 승인 후 별도 단계

---

## 1. 설계 원칙 (핵심 요약)

### 1-1. "무엇을 가져올 수 있느냐" 는 해결됐다
- Product Identity: `products.product_code ↔ Product_List.BarCode` · 93.1% match (3,732 / 4,007) · conflict 0 · 1:1 완벽
- Buy transaction unique key: `BmCode + ROWNUM` · 사용자 ERP 화면값 완전 일치 검증 (1,045,000원 ✓)
- Location transform: 대분류+중분류 변환 · 전각→반각 정규화 · 75.4% 자동 변환

### 1-2. "무엇을 버리고 무엇을 살릴 것이냐" 가 핵심
- stock_history 53,641 · **광범위 분석 백본** (최소 10개 server route 사용) · sample 아님 · **KEEP + GO-LIVE 이후 신규 쌓기**
- purchase_details 12,939 · **대규모 과거 매입 데이터** (56억원 · 7개월) · sample 아님 · **KEEP + GO-LIVE 이후 신규 쌓기**
- products 7,078 · 그룹별 처리 (ERP_MATCHED_ACTIVE 3,704 · ERP_NEW 275 · DB_ONLY_ACTIVE 3,293 · DB_ONLY_INACTIVE 53)
- vendors 156 · KEEP 전수
- inventory_checks 3,400 · KEEP + shelf_positions MERGE

### 1-3. Location 예외는 지금 결정하지 않음
- 뷰티 156 · 냉장고 21 · N매대+뒤앞 16 · **LOCATION_REVIEW 분리**
- Preview 에서 사용자가 선택 · 선택 전까지 기존 DB display_location KEEP

---

## 2. Initial Data Build Flow (전체 실행 흐름)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 0 · PREPARING                                                      │
│  - 사전 요구사항 체크 (migration bm_code/row_num 적용 · 백업 공간 · 권한)   │
│  - ERP 설정 (CorpDB_nm 등) 확인                                          │
│  - Supabase 연결 확인                                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 1 · FETCHING (concurrency=1 · retry 30s/60s/120s/abort)            │
│  - Product_List 전수 조회 → data/snapshots/product-list-{YYYY-MM-DD}.json│
│  - Buy_Status (사용자 선택 기간) → data/snapshots/buy-status-*.json       │
│  - Inventory_Status (NowStock 검증용) → 기존 snapshot 재사용 가능          │
│  - ERP WRITE 없음 · 모든 응답 로컬 저장                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 2 · VALIDATING                                                     │
│  - Barcode 100% non-empty · 1:1 PCode 재확인                             │
│  - BmCode+ROWNUM unique 재확인                                            │
│  - Barcode conflict 0 재확인                                              │
│  - Transform 가능 여부 (Location · 뷰티/냉장고/앞뒤 REVIEW 분리)             │
│  - CRITICAL blocker 발견 시 ABORT                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 3 · PREVIEW_READY (DRY-RUN · DB WRITE 없음)                        │
│  - Preview 화면 생성 (아래 섹션 21 참조)                                   │
│  - 사용자 결정 수집: Location REVIEW · Price REVIEW · Buy 범위             │
│  - CRITICAL blocker 0 확인                                                │
│  - 사용자 "실행" 버튼 명시 승인 대기                                        │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓                 (사용자 승인)
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 4 · BACKING_UP                                                     │
│  - Supabase snapshot tables 생성 (아래 섹션 18 참조)                       │
│  - 성공 확인 전 다음 단계 금지                                              │
│  - 실패 시 FAILED (롤백 불필요 · WRITE 전)                                │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 5 · APPLYING_PRODUCTS                                              │
│  - ERP_MATCHED_ACTIVE 3,704 · ERP_OWNED whitelist UPDATE                 │
│  - ERP_MATCHED_INACTIVE 28 · 동일                                         │
│  - ERP_NEW 275 · INSERT (ERP_OWNED + ERP_DERIVED only)                   │
│  - DB_ONLY_ACTIVE 3,293 · KEEP (no-op)                                   │
│  - DB_ONLY_INACTIVE 53 · KEEP (no-op · REVIEW 상태 flag)                 │
│  - Location transform + shelf_positions MERGE                             │
│  - 실패 시 Rollback (STEP 7 참조)                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 6 · APPLYING_PURCHASES (옵션 A 추천)                                │
│  - 과거 purchase_details KEEP (12,939 rows · 7개월 · 56억원)              │
│  - GO-LIVE 날짜 이후 ERP Buy_Status 만 INSERT (bm_code+row_num unique)   │
│  - 중복 방지: ON CONFLICT (bm_code, row_num) DO NOTHING                  │
│  - 실패 시 Rollback                                                       │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 7 · APPLYING_INVENTORY (NowStock 사용 추천 · 공식 걷어내기)            │
│  - 각 상품 products.current_stock ← Product_List.NowStock                 │
│  - inventory_checks.store*_stock · 완전 보존 (실사재고 · 별개 개념)         │
│  - stock_history · KEEP 전체 (분석 백본) · GO-LIVE 이후 신규 쌓기          │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 8 · VERIFYING                                                      │
│  - 각 테이블 row count · 핵심 field null율 검증                            │
│  - ERP 매칭 상품 Barcode 중복 0 재확인                                     │
│  - 사용자 샘플 검증 (10개 상품 비교)                                        │
│  - 실패 시 FAILED → Rollback 옵션 제공                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 9 · COMPLETED                                                      │
│  - GO_LIVE_INITIALIZED_AT 기록 (관리자 테이블 or system_settings)          │
│  - 성공 리포트 (변경 수 · INSERT/UPDATE/KEEP 통계)                         │
│  - Backup tables 보관 기간 결정 (추천: 30일)                               │
│  - Normal Sync scheduler 활성화 조건 안내                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2-1. State Machine

```
PREPARING → FETCHING → VALIDATING → PREVIEW_READY
                                        ↓ (user approve)
                                  BACKING_UP
                                        ↓
                              APPLYING_PRODUCTS
                                        ↓
                             APPLYING_PURCHASES
                                        ↓
                            APPLYING_INVENTORY
                                        ↓
                                 VERIFYING
                                        ↓
                                COMPLETED

실패 시: 각 단계 → FAILED
         FAILED 에서 Rollback 가능 (STEP 5~7 적용 후만)
```

---

## 3. Product Plan

### 3-1. Identity (최종 확정)
```
products.product_code  ↔  ERP Product_List.BarCode
                       (추가 column 없음 · 매핑 테이블 없음)
```

### 3-2. 그룹별 전략

| 그룹 | 개수 | 전략 | 변경 범위 |
|---|---|---|---|
| ERP_MATCHED_ACTIVE | 3,704 | ERP_OWNED whitelist UPDATE | product_name · supplier · supplier_code · category · unit · sale_status · brand · manufacturer · last_purchase_date · last_sale_date (10 field) + display_location/location + shelf_positions MERGE |
| ERP_MATCHED_INACTIVE | 28 | 동일 UPDATE | 동일 |
| ERP_NEW | 275 | INSERT | product_code (= BarCode) + ERP_OWNED + ERP_DERIVED · PROTECTED는 NULL |
| DB_ONLY_ACTIVE | 3,293 | KEEP (no-op) | 변경 없음 |
| DB_ONLY_INACTIVE | 53 | KEEP (no-op) | 변경 없음 · REVIEW 리스트에 표시 |
| BARCODE_CONFLICT | 0 | 발생 안 함 | - |
| ERP_MISSING_BARCODE | 0 | 발생 안 함 | - |

### 3-3. Sync Whitelist (초안)

```ts
// src/shared/erpSyncWhitelist.ts (설계만 · 코드 미작성)
export const ERP_IDENTITY = { productCode: "BarCode" } as const;

export const ERP_OWNED_PRODUCT_FIELDS = Object.freeze({
  product_name:        { erp: "ProductName",      nullOverwrite: false },
  supplier:            { erp: "CorpNameView",     nullOverwrite: false },
  supplier_code:       { erp: "CtCode",           nullOverwrite: false },
  unit:                { erp: "UnitCode",         nullOverwrite: false },
  sale_status:         { erp: "SaleStatusName",   nullOverwrite: false },
  brand:               { erp: "Brand",            nullOverwrite: false },
  manufacturer:        { erp: "Maker",            nullOverwrite: false },
  last_purchase_date:  { erp: "LastBuyDate",      nullOverwrite: false },
  last_sale_date:      { erp: "LastSaleDate",     nullOverwrite: false },
  // category 는 LcateName/McateName/ScateName/DcateName 중 하나 (설계 섹션 5 참조)
});

export const ERP_DERIVED_PRODUCT_FIELDS = Object.freeze({
  display_location:    { source: "LocationName", transform: "majorPlusMiddle" },
  location:            { source: "LocationName", transform: "majorPlusMiddle" }, // 양쪽 동시 UPDATE
});

export const PROTECTED_PRODUCT_FIELDS = Object.freeze([
  "optimal_stock",
  "optimal_stock_backup",
  "memo",
  "hidden",
  "stock_note",
  "imported_at",
  // display_location/location 은 ERP_DERIVED (payload 에 포함 but 변환 로직 필수)
  // shelf_positions 는 inventory_checks 테이블 (products 아님)
]);

// 명시적 UPDATE payload 생성 · spread 금지
export function buildErpUpdatePayload(erpRow: ProductListRow, dbRow: Product) {
  const payload: Partial<Product> = {};
  for (const [col, { erp, nullOverwrite }] of Object.entries(ERP_OWNED_PRODUCT_FIELDS)) {
    const erpVal = erpRow[erp];
    const dbVal = dbRow[col];
    if (!nullOverwrite && (erpVal == null || erpVal === "")) continue; // ERP empty 는 skip
    if (erpVal === dbVal) continue; // 같으면 skip
    payload[col] = erpVal;
  }
  // ERP_DERIVED 추가 (변환 적용)
  const derivedLoc = transformLocation(erpRow.LocationName);
  if (derivedLoc != null) {
    payload.display_location = derivedLoc;
    payload.location = derivedLoc;
  }
  return payload;
}
```

### 3-4. category 소스 결정 (설계)

Product_List 는 LcateName/McateName/ScateName/DcateName 4-depth 를 제공.

| 후보 | 설명 | 매핑 |
|---|---|---|
| McateName (중분류) | 현재 추정 매핑 (기존 Excel import 호환) | → products.category |
| LcateName+McateName | 2-depth 조합 | → "건강>종합비타민" 등 |

**추천**: McateName (기존 호환) · 사용자 승인 전 확정 보류 · 필요 시 Preview 에서 조정

---

## 4. Location Plan

### 4-1. 자동 변환 (76.6%)

| 패턴 | 조건 | 결과 |
|---|---|---|
| 벽 + Middle | 대분류="벽" | display_location = Middle (전각→반각 정규화) |
| N매대 + Middle | 대분류 ~ /^(\d+)매대$/ | display_location = N + Middle |

### 4-2. LOCATION_REVIEW (사용자 Preview 결정)

| 그룹 | 개수 | 추천 선택지 | Preview Flag |
|---|---|---|---|
| 뷰티 (대분류="뷰티") | 156 | A. 뷰티1~7  B. 32~34 유지  C. B1~B7  D. 사용자 입력 | LOCATION_REVIEW_BEAUTY |
| 냉장고 (대분류="냉장고") | 21 | A. 냉장고  B. 14 유지  C. REF | LOCATION_REVIEW_FRIDGE |
| N매대+뒤/앞 | 16 | A. 6뒤/5앞  B. 6R/5F  C. 뷰티+ 흡수 | LOCATION_REVIEW_REAR_FRONT |

### 4-3. ERP Location Missing (761 상품)

| 상태 | 처리 |
|---|---|
| ERP empty + DB has | KEEP EXISTING · NULL overwrite 금지 |
| ERP empty + DB empty | 그대로 유지 |
| ERP empty + DB has (73건 Barcode matched) | KEEP · Preview 에 "미확정 location" 리스트 |

### 4-4. 변환 코드 (설계)

```ts
// src/shared/erpLocationTransform.ts (설계)
export function transformLocation(locationName: string | null | undefined): {
  derived: string | null;
  reason: "ok_wall" | "ok_madae" | "review_beauty" | "review_fridge" | "review_rear_front" | "empty" | "unknown";
  reviewFlag?: string;
} {
  if (!locationName || !locationName.trim()) return { derived: null, reason: "empty" };
  const parts = locationName.split(">").map(s => s.trim());
  const [major = "", middle = ""] = parts;
  if (!middle) return { derived: null, reason: "empty" };
  const normMiddle = middle
    .replace(/Ａ/g, "A").replace(/Ｂ/g, "B").replace(/Ｃ/g, "C").replace(/Ｄ/g, "D");
  if (major === "벽") return { derived: normMiddle, reason: "ok_wall" };
  const m = major.match(/^(\d+)매대$/);
  if (m) {
    if (normMiddle === "뒤" || normMiddle === "앞") {
      return { derived: null, reason: "review_rear_front", reviewFlag: "LOCATION_REVIEW_REAR_FRONT" };
    }
    return { derived: m[1] + normMiddle, reason: "ok_madae" };
  }
  if (major === "뷰티") return { derived: null, reason: "review_beauty", reviewFlag: "LOCATION_REVIEW_BEAUTY" };
  if (major === "냉장고") return { derived: null, reason: "review_fridge", reviewFlag: "LOCATION_REVIEW_FRIDGE" };
  return { derived: null, reason: "unknown" };
}
```

### 4-5. shelf_positions MERGE (사용자 상세 보존)

```ts
// server/utils/shelfPositionAssign.ts 기존 로직 그대로 활용
//   buildInitialShelfPositions(newLocation, categoryCode) → auto slots
//   기존 shelf_positions MERGE · 신규 slot 만 null 추가 · 기존 사용자 입력 보존
//   불필요 slot 자동 삭제 금지

async function applyLocationChange(productCode, newLocation) {
  const existing = await fetchInventoryCheck(productCode);
  const existingPos = existing?.shelf_positions ?? {};
  const autoSlots = buildInitialShelfPositions(newLocation, categoryCode);
  const merged = { ...existingPos };
  for (const key of Object.keys(autoSlots)) {
    if (!(key in merged)) merged[key] = null;  // 신규 slot · 사용자 편집 대기
  }
  // 기존 사용자 입력 slot 전부 보존 · 자동 삭제 금지
  await updateInventoryCheck(productCode, { shelf_positions: merged });
}
```

---

## 5. Price Plan

### 5-1. 분류 (Preview Decision)

| 그룹 | 조건 | 처리 |
|---|---|---|
| PRICE_MATCH | ERP = DB (sale_price 94.8% · purchase_price 5%) | KEEP |
| PRICE_DB_EMPTY | DB empty · ERP has (purchase_price 93%) | 자동 ERP 값 적용 |
| PRICE_DIFFERENT_SALE | sale_price ≠ PriceA | USER DECISION (189건) · Preview 에서 ERP VALUE / KEEP CURRENT 선택 |
| PRICE_DIFFERENT_PURCHASE | purchase_price ≠ CostPrice | USER DECISION (44건) · 동일 선택 |

### 5-2. 자동 처리 가능 (사용자 간섭 없음)
- PRICE_MATCH: 변경 불필요
- PRICE_DB_EMPTY: ERP 값 자동 적용 (null overwrite 아님 · empty → has 안전)

### 5-3. USER DECISION (총 233건 · sale 189 + purchase 44)
- Preview UI 에서 바코드별 리스트
- 각 항목 체크박스: `[x] ERP VALUE 적용` or `[x] 기존 유지`
- 기본값: 기존 유지 (안전)

---

## 6. Purchase Plan

### 6-1. 현재 상태

```
purchase_details:
  Total: 12,939 rows
  Date range: 2026-03-10 ~ 2026-09-27
  Monthly: 03=3,804 · 04=2,821 · 05=2,288 · 06=2,244 · 07=1,775 · 09=7
  Amount: 5,632,116,237 (56.3억원)
  Qty: 1,079,265
  Unique suppliers: 89
  verified_by: 8 (사용자 검수)
  expiry_date: 2
```

### 6-2. 실제 사용처 (19 server routes)
- purchaseHistory · 상품 매입 이력
- supplierPayments/balance · 공급사 잔액 계산
- supplierPayments/purchaseDetail · 공급사 매입 상세
- supplierPayments/purchaseSummary · 공급사 매입 요약
- vat · VAT 매입 계산
- productHistory/purchaseInfoBatch · 상품 상세 매입
- stockManage/topProducts · TOP 매입 상품
- stockManage/supplierPurchases · 공급사별 매입 집계
- orderPurchaseMatch · 발주-매입 매칭
- expiryAggregation · 유통기한 집계
- productArrivals · 입고 처리

→ purchase_details 는 **광범위 분석 백본** · sample 아님

### 6-3. 추천 전략: OPTION A (KEEP + GO-LIVE 이후 신규)

**추천 사유**:
- 과거 6개월 데이터는 분석/통계에서 사용 중
- ERP 전기간 재조회는 ERP 서버 과부하 (약 7개월 × 매일 조회 = 수백 호출)
- 사용자 verified_by 8건 손실 방지
- GO-LIVE 이후부터 "진짜 운영" 매입 쌓임

**실행**:
```
INITIAL_PURCHASE_START_DATE = GO_LIVE_DATE
- 과거 purchase_details 전체 KEEP
- GO_LIVE_DATE 이후 Buy_Status 조회 (bm_code + row_num unique key)
- 중복 방지: ON CONFLICT (bm_code, row_num) DO NOTHING
```

### 6-4. ERP 호출 비용

| 전략 | 호출 횟수 | ERP 부하 | 안전성 |
|---|---|---|---|
| OPTION A (GO-LIVE 이후만) | 매일 1 call | 매우 낮음 | ★★★★★ |
| OPTION B (최근 1개월 재구축) | 30 calls | 낮음 | ★★★ |
| OPTION C (최근 3개월) | 90 calls | 중간 | ★★ |
| OPTION D (7개월 전수) | 200+ calls | 높음 | ★ |

**추천: OPTION A**

### 6-5. 필요한 Migration

```sql
-- (아직 실행 금지 · 설계만)
ALTER TABLE purchase_details
  ADD COLUMN IF NOT EXISTS bm_code TEXT,
  ADD COLUMN IF NOT EXISTS row_num INT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_details_bm_row
  ON purchase_details (bm_code, row_num)
  WHERE bm_code IS NOT NULL AND row_num IS NOT NULL;

-- 과거 데이터는 bm_code=NULL · UPSERT 중복 방지에만 사용
-- 신규 ERP 매입만 bm_code + row_num 필수
```

---

## 7. Inventory Plan (★ 결정적 발견)

### 7-1. NowStock vs Inventory 공식 비교

```
Comparable (PCode intersection): 4,006
NowStock == Full Formula exact: 2,008 (50.12%)
PrvStock == NowStock : 1,807 yes / 2,199 no
모든 기간 이동 == 0: 2,805 (70%)
|NowStock - Full Formula| 분포:
  0:        2,008
  1-10:     1,612
  11-100:   336
  101-1000: 50
  >1000:    0
```

### 7-2. 해석: NowStock = 실시간 현재고

Different samples 공통 패턴:
- 거의 모든 경우 `NowStock < 공식결과` (공식결과가 더 큼)
- Inventory snapshot 은 10/3 08:00 생성 · 조회 기간 설정 과거
- NowStock 는 **조회 시점의 실시간 재고** (조회 기간 이후 매출 반영)

### 7-3. 추천: 복잡한 공식 걷어내기

```
current_stock SSOT = Product_List.NowStock
```

**장점**:
- 단일 field · 공식 계산 불필요
- 조회 시점 실시간 재고
- Inventory_Status 42-col 공식 걷어낼 수 있음
- Normal Sync 로직 극도로 단순화

**단점**:
- 조회 시점 재고라 "일 마감 재고" 와 다를 수 있음
- 사용자 ERP 화면 샘플 검증 필요

### 7-4. USER CONFIRM: 5개 상품 샘플

ERP 화면 "상품재고현황" 에서 다음 5 PCode 의 현재고를 확인:

```
PCode    ProductName                           NowStock(ERP SOAP)   PrvStock
10001    삼양연고 100g                          ?                     ?
12035    젤리잘크톤(망고맛) 15g*30포            ?  (최근 매입된 상품)   ?
10805    비티엘라캡슐 60PTP*2ea                ?  (최근 매입된 상품)   ?
```

(최종 선정은 데이터셋에서 재고 0 · 일반 · 최근매입 · 최근판매 · 조정이 있는 상품 5개 분산 선정 예정)

사용자 ERP 화면값 == Product_List.NowStock 이면 "공식 걷어내기" 확정.

### 7-5. inventory_checks 는 완전 분리

```
products.current_stock   ← Product_List.NowStock      (ERP 전산재고 · ERP_OWNED)
inventory_checks.*_stock ← 사용자 실사 재고            (실제 매장/창고 재고 · PROTECTED)
```

두 개념은 완전 분리 · ERP sync 가 inventory_checks 를 건드리지 않음.

---

## 8. Stock History Plan

### 8-1. 현재 상태

```
Total: 53,641 rows
Date range: 2026-03-10 ~ 2026-09-20
Monthly: 03=8,237 · 04=9,115 · 05=9,378 · 06=9,956 · 07=16,946 · 09=9
period_type: early 18,579 · mid 19,131 · late 15,923 · (null) 8
closing_stock≠0: 53,258 (99.3%)
sale_qty>0: 43,102 (80.4%)
purchase_qty>0: 12,672 (23.6%)
```

### 8-2. 실제 사용처 (10 server routes)
- optimalStock (적정 재고 계산)
- salesAutoRecommend (최근 30일 판매량 기반 자동 발주)
- stockManage/supplierPurchases · topSales · salesTrend · trending · stockRaw · snapshotSummary
- purchase/supplierPayments/balance (판매원가 계산)
- purchase/vat (매출 VAT)

→ stock_history 는 **분석 백본** · 과거 데이터 KEEP 가치 있음

### 8-3. 추천 전략: KEEP 전체 + GO-LIVE 이후 신규

```
INITIAL_STOCK_HISTORY_START_DATE = GO_LIVE_DATE
- 과거 stock_history 전체 KEEP (53,641 rows · 7개월)
- GO-LIVE 이후 ERP 월말 snapshot 로 신규 쌓기
- 또는 매일 Inventory_Status 조회로 일별 snapshot
```

### 8-4. ERP → stock_history 매핑 (설계)

```
stock_history 는 현재 "월별 상/중/하 snapshot" 구조.
ERP Inventory_Status 는 "조회 기간 집계" 구조.

가능한 매핑:
  snapshot_date      ← 조회 종료일 (예: 2026-10-10)
  period_type        ← early(1~10) / mid(11~20) / late(21~월말) 자동 분류
  product_code       ← Product_List.BarCode (join via PCode)
  product_name       ← ProductName
  closing_stock      ← Product_List.NowStock (NowStock 전략 채택 시)
  purchase_qty       ← Inventory_Status.BuyStock
  sale_qty           ← Inventory_Status.SaleStock
  disposal_qty       ← Inventory_Status.ProductBadStock
  internal_qty       ← Inventory_Status.ProductUseStock
  adjustment_qty     ← Inventory_Status.PlusStock - MinusStock
```

### 8-5. 월별 반복 조회는 Phase 3 (현재 설계만)

이번 Initial Data Build 에서는 stock_history 신규 데이터 INSERT 하지 않음. GO-LIVE 이후 scheduler 설계 때 반영.

---

## 9. Protected Data

### 9-1. products (payload 포함 절대 금지)

```
optimal_stock           · 99.9% 운영 데이터 (7,069/7,078)
optimal_stock_backup    · ERP wipe 방어 복원용
memo                    · 82% 사용자 메모 (5,836/7,078) · ERP Memo 와 완전 분리
hidden                  · 100% 사용자 토글 (soft-delete) · sale_status 와 분리
stock_note              · current_stock 파싱 실패 fallback
imported_at             · metadata (immutable)
```

### 9-2. vendors (전수)

```
company_name · contact_name · phone · email · category · note · business_number ·
approval_status · team_leader_* · emergency_contact · order_method · region ·
invoice_method · password_hash · special_notes · ... (24 column 전수)
```

- ERP 는 supplier_name/code 만 제공 · vendors 테이블 자체는 자체 운영
- ERP sync 가 vendors 를 건드리지 않음

### 9-3. inventory_checks (전수)

```
warehouse1_stock · warehouse2_stock · store1_stock · store2_stock · store3_stock
store1_zone · store2_zone · store3_zone
shelf_positions           ← 사용자 상세 slot 입력 보존 · MERGE 로직만
expiry_date · expiry_input_date
checked_by · note · checked_at · status · system_stock
```

- shelf_positions 는 Location 변경 시 자동 slot 추가 MERGE (기존 사용자 값 보존)
- 그 외 전부 사용자 실사 데이터 · PROTECTED

### 9-4. purchase_details (metadata)

```
verified_by · verify_status · verify_note · verified_at · verified_expiring
expiry_date (사용자 검수 시 입력)
```

- 사용자 검수 완료 데이터 (8건) · 전수 보존
- Buy_Status INSERT 시 verified_* 는 payload 자체에 포함 금지

---

## 10. Backup Plan

### 10-1. 추천: Supabase snapshot tables

```sql
-- (아직 실행 금지 · 설계만)
CREATE TABLE products_snapshot_20261003_200000 AS SELECT * FROM products;
CREATE TABLE purchase_details_snapshot_20261003_200000 AS SELECT * FROM purchase_details;
CREATE TABLE stock_history_snapshot_20261003_200000 AS SELECT * FROM stock_history;
CREATE TABLE inventory_checks_snapshot_20261003_200000 AS SELECT * FROM inventory_checks;
CREATE TABLE vendors_snapshot_20261003_200000 AS SELECT * FROM vendors;
```

**근거**:
- Supabase 는 동일 DB 안 CREATE TABLE AS 가 가장 빠름 (수초~수십초)
- 실패 시 즉시 복원 가능 (`INSERT INTO products SELECT * FROM products_snapshot_...`)
- RLS/trigger 는 복사 안 되지만 데이터 복원엔 영향 없음

### 10-2. 대안 비교

| 방법 | 속도 | 복원 편의 | 비용 | 추천 |
|---|---|---|---|---|
| snapshot tables | 매우 빠름 | 간편 (INSERT SELECT) | DB 공간 추가 (~500MB) | ★★★★★ |
| pg_dump | 느림 | SQL 복원 필요 | 로컬 파일 | ★★★ |
| JSON/CSV export | 중간 | 커스텀 복원 로직 필요 | 로컬 파일 | ★★ |

### 10-3. 검증

```
-- Backup 성공 확인
SELECT 
  (SELECT COUNT(*) FROM products) AS orig,
  (SELECT COUNT(*) FROM products_snapshot_20261003_200000) AS snap;
-- orig === snap 이어야 다음 단계 진행
```

### 10-4. 보관 기간

- 추천: GO-LIVE 후 30일 보관 · 안정화 확인 후 DROP
- 사용자 명시 DROP 전까지 유지

---

## 11. Rollback Plan

### 11-1. 상태별 Rollback 전략

| 상태 | Rollback 방법 |
|---|---|
| STEP 0~3 (FETCHING/VALIDATING/PREVIEW) | 불필요 (WRITE 전) |
| STEP 4 (BACKING_UP 실패) | snapshot tables DROP · 재시도 or 사용자 중단 |
| STEP 5 (APPLYING_PRODUCTS 실패) | products 복원: `TRUNCATE products; INSERT INTO products SELECT * FROM products_snapshot_...;` |
| STEP 6 (APPLYING_PURCHASES 실패) | STEP 5 복원 + purchase_details 복원 |
| STEP 7 (APPLYING_INVENTORY 실패) | STEP 5+6 복원 + current_stock 복원 (products_snapshot 에서) |

### 11-2. Atomicity

**단일 거대 transaction 위험**:
- Supabase 는 10초+ transaction 시 timeout 가능
- products 7,078 UPDATE + purchase_details INSERT + inventory UPDATE 를 하나의 TX 로 묶으면 lock contention 발생

**추천 전략**: **Step 단위 Checkpoint**
- 각 STEP 성공 후 상태 저장 (예: `admin_initial_build_state` 테이블)
- 실패 시 사용자 재시작 가능
- 실패 지점 이후만 재실행

```sql
-- (아직 실행 금지 · 설계만)
CREATE TABLE IF NOT EXISTS admin_initial_build_state (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_step TEXT NOT NULL,
  completed_steps JSONB NOT NULL DEFAULT '[]',
  error_log JSONB,
  completed_at TIMESTAMPTZ
);
```

### 11-3. Partial Failure 금지

- 각 STEP 내부는 **batch 처리** · chunk 500 · 실패 시 전체 STEP 복원
- 1개 batch 실패해도 전체 STEP rollback (일부만 적용된 상태 금지)

---

## 12. DRY-RUN Preview Design

### 12-1. Preview 섹션 (UI 와이어프레임)

```
┌─────────────────────────────────────────────────────────────────┐
│  Initial Data Build Preview · 2026-10-10 20:00                  │
│                                                                   │
│  [PRODUCTS]                                                       │
│    ERP_MATCHED_ACTIVE:   3,704   → UPDATE                        │
│    ERP_MATCHED_INACTIVE: 28      → UPDATE                        │
│    ERP_NEW:              275     → INSERT                        │
│    DB_ONLY_ACTIVE:       3,293   → KEEP (no-op)                  │
│    DB_ONLY_INACTIVE:     53      → KEEP · REVIEW 리스트           │
│    BARCODE_CONFLICT:     0       ✓                               │
│                                                                   │
│  [LOCATION]                                                       │
│    자동 변환 (벽/N매대):  3,069                                    │
│    DB empty + ERP has:   1,637  → 신규 부여                      │
│    exactSame:            105                                       │
│    different:            1,182  → ERP 값으로 교체                 │
│    ERP empty + DB has:   73     → KEEP EXISTING                   │
│    Warehouse Class Flip: 124    → shelf_positions 자동 재배정     │
│    [REVIEW]                                                       │
│      뷰티:         156  [사용자 선택: ___]                         │
│      냉장고:       21   [사용자 선택: ___]                         │
│      N매대+뒤앞:   16   [사용자 선택: ___]                         │
│                                                                   │
│  [PRICE]                                                          │
│    sale_price match:     3,538                                    │
│    sale_price different: 189   [SELECT ERP / KEEP CURRENT]        │
│    purchase_price match: 197                                      │
│    purchase_price DB-empty: 3,472  → 자동 ERP 값 적용              │
│    purchase_price different: 44  [SELECT ERP / KEEP CURRENT]      │
│                                                                   │
│  [PURCHASE]                                                       │
│    Current purchase_details: 12,939 (2026-03-10 ~ 2026-09-27)    │
│    Strategy: KEEP ALL · GO-LIVE 이후 Buy_Status 매일 조회           │
│    Required Migration: bm_code · row_num column 추가               │
│    Expected ERP calls (GO-LIVE 이후 매일 1 call): 365/년           │
│                                                                   │
│  [INVENTORY]                                                      │
│    current_stock source: Product_List.NowStock (추천)              │
│    USER CONFIRM: 5 샘플 상품 ERP 화면 검증 (NowStock == ERP 화면값)│
│    inventory_checks (실사재고): 전수 KEEP · 영향 없음                │
│                                                                   │
│  [STOCK HISTORY]                                                  │
│    Current rows: 53,641 (2026-03 ~ 2026-07 · 분석 백본)           │
│    Strategy: KEEP ALL · GO-LIVE 이후 월별 신규 (Phase 3 설계)       │
│                                                                   │
│  [BACKUP]                                                         │
│    Method: Supabase snapshot tables                               │
│    Tables: products · purchase_details · stock_history ·          │
│            inventory_checks · vendors                              │
│    Retention: 30일 후 사용자 명시 DROP                              │
│                                                                   │
│  [CRITICAL BLOCKERS]                                              │
│    (0 blockers · READY TO EXECUTE)                                │
│                                                                   │
│  [USER DECISIONS]                                                 │
│    [ ] 뷰티 Location 선택                                          │
│    [ ] 냉장고 Location 선택                                        │
│    [ ] N매대+뒤앞 Location 선택                                    │
│    [ ] sale_price different 189건 처리 (일괄 ERP / 일괄 KEEP / 개별) │
│    [ ] purchase_price different 44건 처리                          │
│    [ ] NowStock 검증 완료 확인                                     │
│    [ ] GO-LIVE 날짜 확정                                           │
│                                                                   │
│  [RETRY POLICY]                                                   │
│    Current code: 1s → 2s → abort                                  │
│    Target: 30s → 60s → 120s → abort                               │
│    Required: iregenSoap.ts:792 RETRY_DELAYS_SEC = [30, 60, 120]   │
│                                                                   │
│  [실행 버튼]  (모든 USER DECISIONS 완료 시 활성화)                   │
└─────────────────────────────────────────────────────────────────┘
```

### 12-2. Critical Conditions (실행 버튼 비활성 조건)

- BARCODE_CONFLICT > 0
- Migration bm_code/row_num 미적용
- Backup 공간 부족
- USER DECISIONS 미완료
- ERP 설정 미완료 (CorpDB_nm 등)
- NowStock 검증 미완료

---

## 13. ERP Load Estimate

| 단계 | API | Calls | 소요시간 (concurrency=1) |
|---|---|---|---|
| STEP 1 Product_List | SvcProductBiz | 81 (pageSize=50 · 4,007 rows) | 약 4분 |
| STEP 1 Buy_Status (GO-LIVE 당일) | SvcBuyBiz | 1 | 1초 |
| STEP 1 Inventory_Status (NowStock 검증) | SvcInventoryBiz | 1 (snapshot 재사용 가능) | 수초 |
| **Total** | | **~83 calls** | **~4분** |

GO-LIVE 이후 Normal Sync:
- Product_List: 매일 1 call (81 pages · 4분)
- Buy_Status: 매일 1 call
- Inventory_Status: 매일 1 call (snapshot 재사용 or 신규 조회 선택)
- **총 매일 ~83 calls** · ERP 서버 부하 매우 낮음

---

## 14. Required Migrations (최소)

### 14-1. 반드시 필요

```sql
-- Migration 1 · purchase_details 에 ERP transaction key 추가
ALTER TABLE purchase_details
  ADD COLUMN IF NOT EXISTS bm_code TEXT,
  ADD COLUMN IF NOT EXISTS row_num INT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_details_bm_row
  ON purchase_details (bm_code, row_num)
  WHERE bm_code IS NOT NULL AND row_num IS NOT NULL;

COMMENT ON COLUMN purchase_details.bm_code IS 'ERP Buy_Status.BmCode · 매입문서 ID';
COMMENT ON COLUMN purchase_details.row_num IS 'ERP Buy_Status.ROWNUM · 문서 내 라인 번호';
```

### 14-2. 선택적 (관리 편의)

```sql
-- Migration 2 · Initial Data Build 상태 관리 (선택)
CREATE TABLE IF NOT EXISTS admin_initial_build_state (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_step TEXT NOT NULL,
  completed_steps JSONB NOT NULL DEFAULT '[]',
  error_log JSONB,
  completed_at TIMESTAMPTZ,
  go_live_initialized_at TIMESTAMPTZ
);
```

### 14-3. 명시적 금지

```
ALTER TABLE products ADD COLUMN erp_pcode ...   -- 금지 (Barcode 로 완전 식별 가능)
ALTER TABLE products ADD COLUMN erp_location_name ...  -- 금지 (LocationName raw 저장 불필요)
CREATE TABLE erp_product_mapping ...  -- 금지 (OPTION A · 추가 매핑 테이블 불필요)
CREATE TABLE product_barcodes ...  -- 금지 (1:1 완벽 · 다중 Barcode 없음)
```

---

## 15. Retry Policy (Current vs Target)

### 15-1. 현재 코드

```ts
// apps/sync-agent/src/main/iregenSoap.ts:792
const delay = attempt * 1000;  // 1s → 2s → 3s · 하지만 maxAttempts=3 (attempt 3=실패)
```

실질 재시도: **1초 → 2초 → 포기**

### 15-2. 사용자 목표

```ts
const RETRY_DELAYS_SEC = [30, 60, 120];  // 30s → 60s → 120s → abort
```

### 15-3. 변경 위치 (Phase 2 구현 시)

```
apps/sync-agent/src/main/iregenSoap.ts:770  fetchProductPageWithRetry()
  ├─ delay 계산 부분 ·  attempt * 1000  →  RETRY_DELAYS_SEC[attempt-1] * 1000
  └─ maxAttempts · 3 → 4 (초기 1회 + retry 3회)

같은 변경 필요 함수:
  apps/sync-agent/src/main/iregenSoap.ts  callSoap() 호출 모든 지점
    - Product_List pagination
    - Buy_Status 조회
    - Inventory_Status 조회
```

**이번 단계 변경 금지** · Phase 2 구현 시 적용.

---

## 16. 최종 Blocker 분류

### 16-1. Technical Blockers (코드/DB)
- Migration bm_code/row_num 적용 (사용자 승인 후)
- Retry 정책 코드 변경 (사용자 승인 후)
- Initial Data Build 실행 코드 작성 (사용자 승인 후)
- Preview UI 작성 (사용자 승인 후)
- Rollback 로직 작성 (사용자 승인 후)

### 16-2. User Decisions (사용자 결정 필요)
- 뷰티 Location 규칙 (156 상품)
- 냉장고 Location 규칙 (21 상품)
- N매대+뒤앞 Location 규칙 (16 상품)
- sale_price different 189건 처리 방침
- purchase_price different 44건 처리 방침
- NowStock 검증 (5 샘플 ERP 화면값 확인)
- GO-LIVE 날짜 확정
- Backup retention 기간 승인

### 16-3. 둘 다 아님 (이미 해결)
- Product Identity: ✅ OPTION A 확정
- Barcode conflict: ✅ 0 확인
- Buy transaction unique: ✅ (BmCode, ROWNUM)
- Location transform (벽/매대): ✅ 알고리즘 확정
- Protected whitelist: ✅ 식별 완료

---

## 17. Readiness

### 17-1. Normal Sync Readiness

**Status**: READY WITH USER DECISIONS

**이유**:
- 기술 blocker 모두 해결 (identity · unique key · transform · whitelist)
- 사용자 결정 7건 (Location 3 + Price 2 + NowStock 검증 1 + GO-LIVE 1) 만 남음
- 결정 완료 후 즉시 구현 가능

### 17-2. Initial Data Build Readiness

**Status**: READY WITH USER DECISIONS

**이유**:
- Architecture 설계 완성
- Backup/Rollback 설계 완성
- State Machine 설계 완성
- Preview 설계 완성
- 사용자 결정 7건 + 1 migration + 1 retry 수정만 남음

### 17-3. 명시적 실행 전 조건

```
[ ] 1. Migration bm_code/row_num 적용 (사용자 승인)
[ ] 2. Retry 코드 수정 (iregenSoap.ts)
[ ] 3. User Decisions 7건 모두 완료
[ ] 4. Preview Critical Blockers = 0
[ ] 5. 사용자 "실행" 명시 승인
```
