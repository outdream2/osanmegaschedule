# products 최종 schema 설계 & ERP 전체 반영 DRY-RUN (2026-10-04)

**Mode**: READ ONLY · DB WRITE 0 · DROP 0 · ALTER 0 · 코드 수정 0 · 로컬 commit 0 · remote push 0.
**산출물**: 이 Markdown 파일 1개.
**보조 산출물**: `tools/schema-final-dryrun-2026-10-04.mjs` · `tools/_live-schema.json` · `tools/_drop-metrics.json` · `tools/_erp-dryrun.json` (helper 1회성 scanner — Supabase SELECT 전용).

**Row counts (live, 2026-10-04)**:
- `products`: 7,332 rows · 60 columns
- ERP Product_List snapshot (2026-10-03): 4,007 rows · 102 columns
- PCode MATCH (DB.pcode ↔ ERP.PCode): **3,986 / 4,007**
- IDENTITY_REVIEW (BarCode format 차이 21건 · 보류): 21 · 보고만

**규칙 체크**:
- DROP COLUMN / ALTER TABLE: 0 ✓
- 신규 column CREATE: 0 (제안만) ✓
- Product 전체 UPDATE: 0 ✓
- 21건 수정: 0 ✓
- Buy / Inventory / Sale WRITE: 0 ✓
- 로컬 commit / remote push: 0 ✓

---

## Section 1 · products 최종 schema 설계

### 1.1 분류 재정리 · 60 col

이전 ownership audit (`docs/products-ownership-and-erp-mapping-audit-2026-10-04.md`) 결과를 **최종 schema 설계 관점**으로 재분류한다 (= 보존 or 삭제 결정 기준).

| 분류 | 의미 | count |
|---|---|---:|
| **ERP_OWNED** | ERP 가 공급 · 웹서비스 read-only · ERP sync 가 UPDATE | 11 |
| **ERP_OWNED (제안 YES_NEW)** | 이번 설계에서 신규 활성 권장 | 2 (CostPrice→purchase_price · PriceA→sale_price) |
| **ERP_OWNED (제안 WAIT_DECISION)** | 사용자 결정 필요 | 3 (McateName→category · RegDate · EditDate) |
| **WEB_OWNED** | 웹서비스가 CRUD · ERP 미공급 · PROTECTED 포함 | 16 |
| **BOTH** | ERP 공급 + 웹서비스 활발 사용 (= ERP sync 활성 후 ERP_OWNED 로 이동) | 2 (purchase_price · sale_price) |
| **DROP_CANDIDATE (CONFIRMED)** | 사용 흔적 없음 · DB dependency 無 · DROP 권장 | 20 |
| **DROP_CANDIDATE (HOLD)** | DB non-null 있고 legacy data 보존 필요 · 사용자 결정 | 6 |

**합계 60**:
- ERP_OWNED 활성 11 + 신규 활성 2 + 결정 대기 3 = 16
- WEB_OWNED PROTECTED 포함 16
- DROP_CANDIDATE 20 + HOLD 6 = 26
- (BOTH 2 는 ERP_OWNED 활성화 후 ERP_OWNED 로 흡수되므로 중복 집계 제외)
- 11 + 2 + 3 + 16 + 26 = 58 + BOTH 2 (overlap) = 60 ✓

### 1.2 권장 column 수

- **단기 (이번 PR 후)**: 60 그대로 유지 (DROP 0).
- **DROP_CANDIDATE 20 승인 후**: **40 col**.
- **HOLD 6 추가 승인 시**: **34 col**.
- **신규 column 제안 승인 시 (아래 Section 2–4)**: **34 + 최대 3 = 37 col**.

### 1.3 KEEP column 목록 (34–40 col)

**ERP_OWNED (현재 활성 11)**:
`product_code` · `product_name` · `pcode` · `supplier` · `supplier_code` · `unit` · `sale_status` · `last_purchase_date` · `last_sale_date` · `current_stock` · `display_location`

**ERP_OWNED 활성화 권장 (2)**:
`purchase_price` ← CostPrice · `sale_price` ← PriceA

**ERP_OWNED WAIT_DECISION (3)**:
`category` ← McateName · `registered_at` ← RegDate · `last_modified_at` ← EditDate (각각 Section 2–3 상세)

**WEB_OWNED PROTECTED (16)**:
`optimal_stock` · `optimal_stock_backup` · `memo` · `hidden` · `stock_note` · `imported_at` · `expiry_date` · `min_order` · `category_code` · `profit_rate` · `search_keywords` · `brand` · `manufacturer` · `origin` · `spec` · `wholesale_price1` (HOLD 유지 시)

### 1.4 DROP column 목록 (CONFIRMED 20)

조건 전부 만족: ERP 미공급 + 코드 참조 0 (xlsx DEAD_COLS 리스트만) + DB dependency (RPC/INDEX/VIEW/TRIGGER/FK) 없음 + legacy data 無 or 의미 없는 상수.

| # | column | type | non-null | sample | 삭제 사유 |
|---|---|---|---:|---|---|
| 1 | `product_type` | text | 5,713 | "일반" (uniq≤2) | ERP ProductTypeName 전수 상수 "단품" · DEAD_COLS · xlsx 잔재 |
| 2 | `delivery_price` | numeric | 5,683 | "0" (전수) | DEAD_COLS · 값 "0" · UI 미참조 |
| 3 | `delivery_profit_rate` | numeric | 5,683 | "0" | 동상 |
| 4 | `delivery_margin_rate` | numeric | 5,713 | "0" | 동상 |
| 5 | `app_registered` | bool/int | 5,683 | "0" | DEAD_COLS · 상수 |
| 6 | `image_registered` | bool/int | 5,683 | "0" | 동상 |
| 7 | `preset_registered` | bool/int | 5,683 | "0" | 동상 |
| 8 | `preset_group` | text | 152 | "병", "봉투" | DEAD_COLS · 희박 · UI 미참조 |
| 9 | `promotion_name` | text | 0 | — | 전수 null |
| 10 | `promotion_priority` | int | 0 | — | 전수 null |
| 11 | `promotion_purchase_price` | numeric | 0 | — | 전수 null |
| 12 | `promotion_sale_price` | numeric | 0 | — | 전수 null |
| 13 | `promotion_profit_rate` | numeric | 0 | — | 전수 null |
| 14 | `promotion_discount_rate` | numeric | 0 | — | 전수 null |
| 15 | `management_group` | text | 0 | — | 전수 null |
| 16 | `unit_type` | text | 0 | — | 전수 null |
| 17 | `stock_amount` | numeric | 3,931 | "148005", "194436" | DEAD_COLS · 과거 재고금액 스냅샷 · 미사용 |
| 18 | `operator` | text | 5,713 | "박상욱.물류", "MIGCOPY" | DEAD_COLS · ERP UserName 과 분리 · xlsx 잔재 |
| 19 | `point_rate` | numeric | 5,713 | "0" | DEAD_COLS · 전수 0 |
| 20 | `sales_commission` | numeric | 5,713 | "0" | 동상 |

**추가 CONFIRMED 후보 (ERP 상수성 혼동 → DROP 로 재분류)**: `total_volume`, `unit_volume`, `individual_quantity` (셋 다 5,713 non-null · 전수 "0" · UI 미참조 · DEAD_COLS). 보수적으로 Section 1.5 HOLD 아닌 DROP 로 분류 안 함 (혹시 수량 단위 로직 참조 가능성). 다음 테이블 24–26 참고.

| # | column | type | non-null | sample | 비고 |
|---|---|---|---:|---|---|
| 21 | `total_volume` | numeric | 5,713 | "0" | DEAD_COLS · 전수 0 → **DROP 권장 (사용자 확인)** |
| 22 | `unit_volume` | numeric | 5,713 | "0" | 동상 |
| 23 | `individual_quantity` | int | 5,713 | "0" | 동상 |

→ **CONFIRMED_DROP 총 23 columns**.

### 1.5 HOLD column 목록 (경계 사례 · 6)

사용자 결정 전까지는 보존 권장. 아래 Section 3–4 상세 조사 결과 포함.

| column | type | non-null | sample 상위 3 | HOLD 사유 |
|---|---|---:|---|---|
| `col_i` | text | 5,714 | "과직", "과직", "과직" | ERP `TaxName` ("과세"/"면세") 매핑 후보 but 코드 변환 규칙 미정 · Section 4 참조 |
| `supplier_type` | text | 5,709 | "온라인팜", "(주)녹십자", "동아제약(주)" | **발견**: `supplier_type` 은 "유형" 이름과 달리 실제로는 **공급사명(=supplier)** 과 동일한 legacy xlsx 데이터 보관소 · DROP 권장 but 데이터 보존 가치 사용자 확인 |
| `last_modified_at` | **date (문자열)** | 5,713 | "2026-07-25", "2026-06-01" | ERP `EditDate` (full timestamp) 와 **타입/의미 다름** · Section 3 상세 |
| `registered_at` | **date (문자열)** | 5,838 | "2026-06-01" (uniq 매우 낮음) | ERP `RegDate` (full timestamp) 와 타입 다름 · Section 3 상세 |
| `wholesale_price1` | numeric | 5,843 | "0" (전수) | 전수 "0" 이지만 non-null 많음 · 도매가 레거시 field · 삭제 전 사용자 확인 |
| `individual_code` | text | 162 | "8806429010024", "108806427035128", "8806534060327" | **발견**: 다른 barcode 저장 (BOX↔낱개 연결) · `connection_type` ("동일상품연결"/"BOX내상품") 과 pair · 삭제 전 사용자 확인 |

**추가 HOLD**:

| column | type | non-null | sample | HOLD 사유 |
|---|---|---:|---|---|
| `connection_type` | text | 162 | "동일상품연결", "BOX내상품" | `individual_code` 와 pair · 함께 결정 |
| `unit_price` (products) | numeric | 0 | — | DB 전수 null but 코드상 276 hits (대부분 `purchase_details.unit_price` 변수명 collision) · products scope 참조 식별 어려워 보수적 HOLD |

→ **HOLD 총 8 columns** (6 + connection_type + unit_price).

### 1.6 재검증 counts

- CONFIRMED_DROP: **23**
- HOLD: **8** (col_i · supplier_type · last_modified_at · registered_at · wholesale_price1 · individual_code · connection_type · unit_price)
- KEEP (ERP_OWNED + WEB_OWNED): **29** (11 + 16 + 2 BOTH)
- WAIT_DECISION 매핑 (현재 col 유지): **3** (category · 2개는 HOLD 와 중복: last_modified_at · registered_at)

재집계 (overlap 제거): 23 (DROP) + 8 (HOLD) + 29 (KEEP) = **60** ✓

---

## Section 2 · ERP 추가 mapping 확정안

### 2.1 사용자 승인 범위 (복붙 지시)

```
CostPrice    → purchase_price      ← YES_NEW 활성
PriceA       → sale_price          ← YES_NEW 활성
McateName    → category            ← YES_NEW 활성 (단 전환 영향 큼 · 아래 주의)
RegDate      → registered_at       ← WAIT_DECISION (타입/의미 재검토 — Section 3)
LocationName → ERP 원본 보관 + display_location 변환값 유지
```

### 2.2 각 mapping 분석

| ERP field | → products column | 변환 | 현재 whitelist | 사용자 지시 반영안 | 영향 (ERP 전체 적용 시) |
|---|---|---|---|---|---|
| CostPrice | `purchase_price` | numeric cast | 비활성 | **YES_NEW 활성** | 3,788 CHANGED · 198 SAME · 198 ≠ 0 (= 사실상 전원 CHANGED) · DB 는 대부분 null (xlsx 임포트 미완료 흔적) |
| PriceA | `sale_price` | numeric cast | 비활성 | **YES_NEW 활성** | 444 CHANGED · 3,542 SAME · 94.8% exact · 가격 변경 영향 큼 (판매가격 UI/영수증 등) |
| McateName | `category` | X (단일 col) | 비활성 | **YES_NEW 활성 (사용자 1차 승인 완료)** | 3,982 CHANGED · 0 SAME (= DB `category` 전수 다름 or null) · uniq=4 (약국·약국2·약국3·뷰티) · **DB 기존 category 값 전수 덮어쓰기** → 영향 매우 큼 |
| LocationName | 변환값 `display_location` | `transformErpLocation` | 활성 (DERIVED) | **그대로 YES_ACTIVE 유지** | 3,123 CHANGED · 106 SAME · 757 SKIP (ERP 가 LocationName null) |
| LocationName (raw) | `erp_location_name` **신규 column 제안** | X (원본 그대로) | — (column 없음) | **PROPOSE_NEW_COLUMN** · 아래 2.3 참조 | — (현재 col 없음 · 신규 제안) |

### 2.3 신규 column 제안 · `erp_location_name`

**현재 상황**:
- `src/shared/erp/erpSyncWhitelist.ts:76` 의 `ERP_DERIVED_PRODUCT_FIELDS.location` 은 **DB `products.location` 컬럼이 존재하지 않는데도** 참조 중 (`.select("location")` → `42703 column products.location does not exist`).
- `server/routes/stock/products.ts:471–477` 에 fallback 처리 있음.
- `products.location` 은 live schema (60 col) 에 **없다** (`tools/_live-schema.json` 확인 · `hasLocation=false`).

**그러나 코드 전수 조사 결과**: `products.location` 레퍼런스 다수 (`sql/2026-08-27-location-column-migration.sql` · `sql/2026-08-30f-add-location-column.sql` · `src/components/ProductArrivalPage/helpers.tsx:23–26` · `src/components/ScanPage/StockRowCard.tsx:68,227` · `server/routes/stock/products.ts:424,1158,1291` 등 15+ 파일). **지금 코드가 참조하는 `location` 은 변환 후 short 코드 (예: "1A", "22", "35")** 로 보임 · 지금 live schema 에 없으므로 **런타임에 오류를 숨기는 fallback 처리로 유지 중**.

**제안 (사용자 결정 필요)**:
- **Option A**: 새 column `erp_location_name` (text) 생성 · ERP `LocationName` **원본** 보관 ("벽>21>전체>전체") · `display_location` 은 변환값 유지 ("21") · 두 column pair.
- **Option B**: 변환 regression / debugging 상황이 아니면 `display_location` 만으로 충분 (원본 재조회는 ERP 재호출로 해결) · 신규 column 추가 X.
- **Option C**: 코드가 참조하는 `location` 을 복구 (DROP 아닌 CREATE) · `erpLocationTransform` 결과를 담을 column 생성 · but `display_location` 과 역할 중복 → 비권장.

**결론**: Section 1.2 "신규 column 제안" 는 **Option A 선정 시 1개 추가** = 37 col. 사용자 결정 전까지 중립 유지.

### 2.4 TaxName · col_i (상세는 Section 4)

사용자 지시 복붙에 `TaxName` 명시 없음 → **WAIT_DECISION** 유지. col_i 는 HOLD. 상세 Section 4.

---

## Section 3 · EditDate · RegDate 별도 검토

### 3.1 조사 결과 (live DB sample)

```
products.last_modified_at samples:
  { pcode: '10535', last_modified_at: '2026-07-25', registered_at: '2026-06-01' }
  { pcode: '10797', last_modified_at: '2026-06-01', registered_at: '2026-06-01' }
  { pcode: '12220', last_modified_at: '2026-07-11', registered_at: null }
  { pcode: '12735', last_modified_at: '2026-07-21', registered_at: '2026-06-01' }
  { pcode: '14558', last_modified_at: '2026-06-24', registered_at: '2026-06-01' }

typeof last_modified_at[0]: 'string'  val: '2026-07-25'
```

→ DB `last_modified_at` 과 `registered_at` 은 **date (문자열 "YYYY-MM-DD")** · 시각(초단위) 없음.

ERP:
```
Product_List.EditDate samples:
  "2026-10-02 17:27:06"  (14.5% rows = 581/4007)
  "2026-09-30 15:52:31"
Product_List.RegDate samples:
  "2026-10-02 17:19:56"  (100% rows = 4007/4007)
  "2026-09-30 15:31:02"
```

→ ERP 는 **full timestamp (초단위)** · RegDate 는 모든 row · EditDate 는 수정이 있을 때만 (14.5%).

### 3.2 웹서비스 사용처 (grep 결과)

- `scripts/check-product-duplicates.mjs:84–87` · 중복 상품 정리 시 keeper 결정에 사용 (`last_modified_at ?? last_purchase_date ?? registered_at`).
- `server/utils/xlsx.ts:12,59,78` · xlsx 임포트 column mapping (`최종작업일시` · `최종수정일` 패턴 매칭).
- `server/routes/stock/products.ts:453` · DEAD_COLS 포함 → **DB upload 시 필터링 됨**.
- `scripts/audit-*` · column 조사만.
- **src/ UI 참조**: 0 (`last_modified_at` grep · src/**/*.tsx 0 hits).

→ **의미**: `last_modified_at` 은 과거 xlsx 임포트 시 "엑셀 상 최종작업일시" (= 운영자가 엑셀 열어 수정한 날짜) 를 보관하던 레거시 column. 지금은 운영 중단 (DEAD_COLS).

### 3.3 ERP EditDate 와 의미 비교

| 축 | DB `last_modified_at` | ERP `EditDate` |
|---|---|---|
| 타입 | date (YYYY-MM-DD, 문자열) | timestamp (YYYY-MM-DD HH:MM:SS) |
| 의미 | 엑셀 운영자 최종 수정일 (레거시) | ERP 상품정보 수정일시 (ERP 시스템) |
| 값 분포 | 5,713 / 7,332 (77.9%) | 581 / 4,007 (14.5%) · 수정 발생한 경우만 |
| 소스 | xlsx 임포트 | ERP Iregen Product_List |

**결론**: **의미 다름** · 그대로 매핑하면 두 가지 혼동 발생.

### 3.4 선택지

- **Option A (제안)**: 신규 column `erp_modified_at` (timestamptz) 생성 · ERP EditDate 보관 · `last_modified_at` 은 레거시 유지 (혹은 HOLD → 다음 cleanup 에서 DROP).
- **Option B**: `last_modified_at` 을 timestamptz 로 ALTER TYPE 후 ERP EditDate 매핑. **DB 기존 5,713 rows 는 date 로 날아감** · 손실 위험.
- **Option C**: EditDate 매핑 하지 않음 (KEEP_OFF).

**권장**: **Option A**. RegDate 는 **Option A' (동일 유형)** · `erp_registered_at` 신규 column 또는 매핑 하지 않음 (`registered_at` DB 는 레거시 유지).

### 3.5 신규 column 제안 (2개 · 사용자 결정 필요)

| 신규 column | 타입 | 소스 | nullOverwrite | 설명 |
|---|---|---|---|---|
| `erp_modified_at` | timestamptz | Product_List.EditDate | false | ERP 상품정보 수정일시 (14.5% rows) · DB `last_modified_at` 과 **완전 별개** |
| `erp_registered_at` | timestamptz | Product_List.RegDate | false | ERP 상품등록일시 (100%) · DB `registered_at` 과 **완전 별개** |

**원본 보관 column `erp_location_name` 과 합치면 신규 제안 총 3개** (Section 2.3 Option A 선택 시).

---

## Section 4 · TaxName · col_i 검토

### 4.1 조사 결과

**ERP TaxName**:
- values: "과세" (대부분), "면세" (uniq=2)
- 100% rows (4,007 / 4,007)
- 의미: ERP 상품 세금 구분 (부가가치세 과세 여부)

**DB col_i**:
- values: "과직", "과직", "과직" (sample 상위 3) · 전수 "과직" 일 가능성 매우 높음
- 5,714 / 7,332 (77.9%) non-null
- 소스: xlsx 임포트 (`server/utils/xlsx.ts:23` · pattern `/^i$/i` · 엑셀 "I" 컬럼)
- 의미: 과거 xlsx 의 "I" 컬럼 값을 그대로 보관 · "과직" = 과세+직수입?

### 4.2 grep 결과

- `src/**/*.tsx` · `src/**/*.ts`: **0 hits** · UI 참조 전혀 없음.
- `server/routes/stock/products.ts:446` · **DEAD_COLS 리스트 (DB upload 시 필터링)**.
- `server/utils/xlsx.ts:5,23` · xlsx 임포트 mapping 만.
- `scripts/barcode-match-check.mjs:26-35` · 1회성 audit 스크립트.
- `scripts/audit-*` · column 조사만.

→ **의미**: `col_i` 는 과거 xlsx 임포트 잔재 · 코드 참조 0 · UI 미사용 · DEAD_COLS.

### 4.3 ERP TaxName 과 매핑 가능성

- ERP 는 "과세"/"면세" 2가지.
- DB col_i 는 "과직" 등 다른 체계.
- **코드 변환 규칙 미정**.
- UI 참조 0 → 매핑 가치 매우 낮음.

### 4.4 결론

- **col_i 분류**: HOLD (단, 변환 규칙 세울 가치 無 → 다음 cleanup 에서 **DROP 권장**).
- **TaxName 매핑**: **KEEP_OFF** · 매핑 X. 필요시 **신규 column `tax_type`** (text · "과세"/"면세") 생성 가능 (사용자 결정 전까지 보류).

### 4.5 신규 column 제안 (optional · 사용자 결정 필요)

| 신규 column | 타입 | 소스 | 설명 |
|---|---|---|---|
| `tax_type` | text | Product_List.TaxName | ERP 과세구분 ("과세"/"면세") · 영수증·회계 리포트용 (필요 시) |

**결론**: `col_i` 는 다음 cleanup 에서 CONFIRMED_DROP 로 승격. `tax_type` 은 **optional NEW** 로 KEEP_OFF 유지 (사용자 결정).

---

## Section 5 · UNUSED / DROP_CANDIDATE 최종 정리 (Supabase 실측)

> 아래 각 column 은 live Supabase SELECT 로 **non-null count + sample 상위 3** 를 확보함 (`tools/_drop-metrics.json`).
> **CONFIRMED_DROP** = Section 1.4 (CONFIRMED 20 + ERP 상수성 3) = 23 columns.
> **HOLD** = Section 1.5 (6 + 2 추가) = 8 columns.

### 5.1 CONFIRMED_DROP 23 columns

| column | type | non-null | sample (top3) | ERP usage | WEB READ | WEB WRITE | DB dep (FK/INDEX/VIEW/FUNC/TRIG/RPC) | DROP 권장 |
|---|---|---:|---|---|---|---|---|---|
| `product_type` | text | 5,713 | "일반" | ProductTypeName 상수 "단품" (매핑 가치 無) | 0 (xlsx+audit) | DEAD_COLS 필터 | 無 | **CONFIRMED_DROP** |
| `delivery_price` | numeric | 5,683 | "0" | 없음 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** |
| `delivery_profit_rate` | numeric | 5,683 | "0" | 없음 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** |
| `delivery_margin_rate` | numeric | 5,713 | "0" | 없음 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** |
| `app_registered` | bool/int | 5,683 | "0" | 없음 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** |
| `image_registered` | bool/int | 5,683 | "0" | 없음 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** |
| `preset_registered` | bool/int | 5,683 | "0" | 없음 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** |
| `preset_group` | text | 152 | "병", "봉투" | 없음 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** · 희박 |
| `promotion_name` | text | 0 | — | 없음 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** · 전수 null |
| `promotion_priority` | int | 0 | — | 없음 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** |
| `promotion_purchase_price` | numeric | 0 | — | 없음 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** |
| `promotion_sale_price` | numeric | 0 | — | 없음 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** |
| `promotion_profit_rate` | numeric | 0 | — | 없음 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** |
| `promotion_discount_rate` | numeric | 0 | — | 없음 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** |
| `management_group` | text | 0 | — | 없음 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** |
| `unit_type` | text | 0 | — | 없음 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** |
| `stock_amount` | numeric | 3,931 | "148005", "194436", "36300" | 없음 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** · 과거 재고금액 스냅샷 |
| `operator` | text | 5,713 | "박상욱.물류", "MIGCOPY" | ERP UserName 과 분리 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** · xlsx 잔재 |
| `point_rate` | numeric | 5,713 | "0" | 없음 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** |
| `sales_commission` | numeric | 5,713 | "0" | 없음 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** |
| `total_volume` | numeric | 5,713 | "0" | 없음 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** · 전수 0 |
| `unit_volume` | numeric | 5,713 | "0" | 없음 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** · 전수 0 |
| `individual_quantity` | int | 5,713 | "0" | 없음 | 0 | DEAD_COLS | 無 | **CONFIRMED_DROP** · 전수 0 |

### 5.2 HOLD 8 columns

| column | type | non-null | sample (top3) | ERP usage | WEB READ | WEB WRITE | DB dep | 상태 |
|---|---|---:|---|---|---|---|---|---|
| `col_i` | text | 5,714 | "과직" (전수) | TaxName 매핑 후보 but 변환 규칙 미정 | 0 (`scripts/barcode-match-check.mjs` 외 UI 無) | DEAD_COLS | 無 | HOLD → **다음 cleanup DROP 권장** |
| `supplier_type` | text | 5,709 | "온라인팜", "(주)녹십자", "동아제약(주)" | **없음** · 실제값은 **공급사명 (= supplier)** | 0 | DEAD_COLS | 無 | HOLD → **DROP 권장** · 유형 아닌 중복 공급사명 (사용자 확인) |
| `last_modified_at` | **date (문자열)** | 5,713 | "2026-07-25", "2026-06-01", "2026-07-11" | EditDate 매핑 후보 but **타입/의미 다름** | 0 (src/) · `scripts/check-product-duplicates.mjs` keeper 로직 | DEAD_COLS | 無 (duplicate 스크립트는 신규 PR 로 전환 가능) | HOLD · Section 3 결정 대기 |
| `registered_at` | **date (문자열)** | 5,838 | "2026-06-01" (주로 단일값) | RegDate 매핑 후보 but 타입 다름 | 0 (src/) · `check-product-duplicates.mjs` + `sample-vs-real-analysis.mjs` | DEAD_COLS | 無 | HOLD · Section 3 결정 대기 |
| `wholesale_price1` | numeric | 5,843 | "0" (전수 0) | 없음 | 0 | DEAD_COLS | 無 | HOLD → 전수 0 → **다음 cleanup DROP 권장** |
| `individual_code` | text | 162 | "8806429010024", "108806427035128", "8806534060327" | **발견**: 바코드 (BOX↔낱개 연결) | `scripts/barcode-match-check.mjs` 외 UI 參照 0 | DEAD_COLS | 無 | HOLD · `connection_type` 과 pair · **사용자 결정** |
| `connection_type` | text | 162 | "동일상품연결", "BOX내상품" | 없음 (ERP 공급 X) | 0 | DEAD_COLS | 無 | HOLD · `individual_code` 와 pair · **사용자 결정** |
| `unit_price` (products) | numeric | 0 | — | 없음 | hits 276 (대부분 `purchase_details.unit_price` collision) | DEAD_COLS? | 無 | HOLD · DB 전수 null · 식별 어려움 · **사용자 확인** |

### 5.3 특이 발견

- **`supplier_type` 발견**: 컬럼명은 "유형" 이지만 실제 값은 공급사명 그 자체 (`온라인팜` · `(주)녹십자` · `동아제약(주)` 등). 즉 `supplier` 와 **중복 저장** · 레거시. ERP sync 활성화 후 `supplier` 가 정규 소스가 되면 이 column 은 완전히 가치 없음.
- **`individual_code` 발견**: 162개 row 에 다른 barcode 값이 들어있음 (BOX ↔ 낱개 상품 연결). `connection_type` 과 pair 로 "BOX내상품" / "동일상품연결" 플래그. 이 feature 를 유지하려면 아예 별도 테이블 (`product_links` 등) 로 정규화 권장. 사용 자료 희박.
- **`registered_at` 발견**: 5,838 non-null 이지만 거의 전부 "2026-06-01" 1 값 (xlsx mass-import 일자). ERP RegDate 매핑 활성화 시 완전 대체 가능.

---

## Section 6 · 최종 ERP-owned field 목록 (Product Sync 가 관리)

### 6.1 매핑 테이블

**원칙**:
- ERP numeric `0` → `0` 그대로 적용 (실제 재고 0 · 가격 0 보존).
- ERP `null` / empty string → `nullOverwrite=false` 이면 **UPDATE payload 에서 제외** · `nullOverwrite=true` 이면 적용.
- WEB-owned (PROTECTED) field 는 **UPDATE payload 에 포함 금지** (`assertNoProtectedField` 가드).
- identity (`product_code` · `pcode`) 는 UPDATE 대상 아님 · lookup 전용.

| Supabase column | ERP field | type | null policy | transform | INSERT policy | UPDATE policy |
|---|---|---|---|---|---|---|
| `product_code` (PK) | BarCode | text | REQUIRED | string (16자 포맷 그대로) | INSERT 시 설정 · identity | **UPDATE 대상 아님** |
| `pcode` | PCode | text | REQUIRED | string trim | INSERT 시 설정 · 2nd identity | **UPDATE 대상 아님** (lookup key) |
| `product_name` | ProductName | text | required | string | INSERT 적용 | UPDATE 적용 · nullOverwrite=false |
| `supplier` | CorpNameView | text | nullable | string | INSERT 적용 | UPDATE 적용 · nullOverwrite=false |
| `supplier_code` | CtCode | text | nullable | string | INSERT 적용 | UPDATE 적용 · nullOverwrite=false |
| `unit` | UnitCode | text | nullable | string | INSERT 적용 | UPDATE 적용 · nullOverwrite=false |
| `sale_status` | SaleStatusName | text | nullable | string ("판매중") | INSERT 적용 | UPDATE 적용 · nullOverwrite=false · **`hidden` 과 분리** |
| `last_purchase_date` | LastBuyDate | text (YYYY-MM-DD) | nullable | string 그대로 (KST) | INSERT 적용 | UPDATE 적용 · nullOverwrite=false · empty 시 SKIP |
| `last_sale_date` | LastSaleDate | text | nullable | string | INSERT 적용 | UPDATE 적용 · nullOverwrite=false · empty 시 SKIP |
| `current_stock` | NowStock | numeric | nullable | Number cast | INSERT 적용 (0 포함) | **nullOverwrite=true** · ERP 가 null/0 반환 시 그대로 적용 (SSOT) |
| `display_location` | LocationName (**변환**) | text | nullable | `transformErpLocation` ("벽>21" → "21") | INSERT 적용 | UPDATE 적용 · nullOverwrite=false · empty 시 SKIP |
| `purchase_price` **(YES_NEW)** | CostPrice | numeric | nullable | Number cast (0 포함) | INSERT 적용 | UPDATE 적용 · nullOverwrite=false · **활성화 영향 큼** (아래 Section 7) |
| `sale_price` **(YES_NEW)** | PriceA | numeric | nullable | Number cast (0 포함) | INSERT 적용 | UPDATE 적용 · nullOverwrite=false · 활성화 영향 보통 (94.8% exact) |
| `category` **(WAIT_DECISION)** | McateName | text | nullable | string | INSERT 적용 | UPDATE 적용 · nullOverwrite=false · **DB 기존 category 전수 덮어쓰기** · 사용자 결정 |
| `erp_modified_at` **(NEW_COLUMN)** | EditDate | timestamptz | nullable | ISO (`YYYY-MM-DDTHH:MM:SS+09:00`) | INSERT 적용 (null 가능) | UPDATE 적용 · nullOverwrite=false · empty 시 SKIP · **DB `last_modified_at` 과 완전 별개** |
| `erp_registered_at` **(NEW_COLUMN)** | RegDate | timestamptz | nullable | ISO | INSERT 적용 | UPDATE 적용 · nullOverwrite=false · **DB `registered_at` 과 완전 별개** |
| `erp_location_name` **(NEW_COLUMN · optional)** | LocationName (**원본**) | text | nullable | string 그대로 | INSERT 적용 | UPDATE 적용 · nullOverwrite=false · empty 시 SKIP |

### 6.2 WEB-owned (UPDATE payload 포함 금지)

**PROTECTED (강제 가드)**: `optimal_stock` · `optimal_stock_backup` · `memo` · `hidden` · `stock_note` · `imported_at`

**WEB-owned (payload 포함 금지 · ERP 가 공급 안 함)**:
`expiry_date` · `min_order` · `category_code` · `profit_rate` · `search_keywords` · `brand` (ERP 전수 null) · `manufacturer` (ERP 전수 null) · `origin` (ERP 전수 null) · `spec` (ERP 1/4007 희박) · `wholesale_price1` · `last_modified_at` · `registered_at` (레거시 유지) · `col_i` · `supplier_type` · `individual_code` · `connection_type` · `unit_price` (products)

### 6.3 payload 전수 column list

**INSERT payload (신규 상품 253건 · 완만 조정 21건 포함)**: `product_code · pcode · product_name · supplier · supplier_code · unit · sale_status · last_purchase_date · last_sale_date · current_stock · display_location · purchase_price · sale_price · category · erp_modified_at · erp_registered_at · [erp_location_name]` = **최대 17 fields** (optional column 포함).

**UPDATE payload (기존 3,986 PCode MATCH)**: `product_name · supplier · supplier_code · unit · sale_status · last_purchase_date · last_sale_date · current_stock · display_location · purchase_price · sale_price · category · erp_modified_at · erp_registered_at · [erp_location_name]` = **최대 15 fields**. identity (`product_code`, `pcode`) 는 UPDATE 대상 아님.

---

## Section 7 · 전체 ERP WRITE 예상량 DRY-RUN

> **DB WRITE 0 · 분류만**. 실행 산출: `tools/_erp-dryrun.json`.
> matched = 3,986 (PCode MATCH 중 DB row 존재) · new_insert = 21 (IDENTITY_REVIEW 보류 반영).
> ⚠ 사용자 지시: PCode MATCH 3,986 **+ 신규 253** 로 명시했으나 ERP snapshot (2026-10-03) 에는 4,007 rows 전체 · 그 중 21건이 PCode MATCH 실패 (= IDENTITY_REVIEW · 보류). 실제 신규 INSERT 대상은 **21** (PCode 매칭 안 되는 ERP row). 과거 "253 신규" 는 다른 round 의 결과이고 지금 time point 에서는 21로 축소됨 (기 INSERT 완료 또는 재분류).

### 7.1 전수 CHANGED/SAME 매트릭스 (matched 3,986 대상)

| ERP → DB column | nullOverwrite | ERP 비어있지 않음 (matched 중) | SAME | CHANGED | SKIP (ERP empty) | % CHANGED (ERP≠∅ 중) |
|---|---|---:|---:|---:|---:|---:|
| ProductName → `product_name` | false | 3,986 | 2,805 | **1,181** | 0 | 29.6% |
| CorpNameView → `supplier` | false | 3,984 | 987 | **2,997** | 2 | 75.2% |
| CtCode → `supplier_code` | false | 3,984 | 254 | **3,730** | 2 | 93.6% |
| UnitCode → `unit` | false | 3,986 | 256 | **3,730** | 0 | 93.6% |
| SaleStatusName → `sale_status` | false | 3,986 | 1,660 | **2,326** | 0 | 58.4% |
| Brand → `brand` | false | 0 | 0 | 0 | 3,986 | — (ERP 전수 null · 안전) |
| Maker → `manufacturer` | false | 0 | 0 | 0 | 3,986 | — (안전) |
| LastBuyDate → `last_purchase_date` | false | 1,848 | 199 | **1,649** | 2,138 | 89.2% |
| LastSaleDate → `last_sale_date` | false | 3,268 | 236 | **3,032** | 718 | 92.8% |
| NowStock → `current_stock` | **true** | 3,986 | 285 | **3,701** | 0 | 92.9% |
| LocationName → `display_location` (변환) | false | 3,229 | 106 | **3,123** | 757 | 96.7% |
| CostPrice → `purchase_price` **(YES_NEW)** | false | 3,986 | 198 | **3,788** | 0 | 95.0% |
| PriceA → `sale_price` **(YES_NEW)** | false | 3,986 | 3,542 | **444** | 0 | 11.1% (사용자 가격 조정 영향 작음) |
| McateName → `category` **(WAIT_DECISION)** | false | 3,982 | 0 | **3,982** | 4 | 100.0% ⚠ (전수 덮어쓰기) |
| RegDate → `erp_registered_at` **(NEW_COLUMN)** | false | 3,986 | 0 | **3,986** | 0 | 100.0% (전수 INSERT · 신규 col) |
| EditDate → `erp_modified_at` **(NEW_COLUMN)** | false | 561 | 0 | **561** | 3,425 | 100.0% (14.1% rows · 신규 col) |

**추가 집계**:
- NEW_INSERT (ERP 에 있지만 DB 에 없음 · IDENTITY_REVIEW 21 포함): **21 rows**.
- NEW_INSERT 시 각 column 당 신규 세팅 추가.

### 7.2 column별 변경 건수 (요약)

| column | CHANGED (matched) | NEW_INSERT 추가 | SKIP (ERP empty) | 전체 영향 rows |
|---|---:|---:|---:|---:|
| `product_name` | 1,181 | 21 | 0 | 1,202 |
| `supplier` | 2,997 | 21 | 2 | 3,018 |
| `supplier_code` | 3,730 | 21 | 2 | 3,751 |
| `unit` | 3,730 | 21 | 0 | 3,751 |
| `sale_status` | 2,326 | 21 | 0 | 2,347 |
| `brand` | 0 | 21 (null) | 3,986 | 21 |
| `manufacturer` | 0 | 21 (null) | 3,986 | 21 |
| `last_purchase_date` | 1,649 | 21 | 2,138 | 1,670 |
| `last_sale_date` | 3,032 | 21 | 718 | 3,053 |
| `current_stock` | 3,701 | 21 | 0 | 3,722 |
| `display_location` | 3,123 | 21 | 757 | 3,144 |
| `purchase_price` | **3,788** | 21 | 0 | **3,809** |
| `sale_price` | **444** | 21 | 0 | **465** |
| `category` | **3,982** | 21 | 4 | **4,003** |
| `erp_registered_at` | **3,986** | 21 | 0 | **4,007** |
| `erp_modified_at` | **561** | 21 | 3,425 | **582** |

### 7.3 비어있지 않은 ERP 값 분포 (전체 4,007)

| ERP field | non-empty | % | 비고 |
|---|---:|---:|---|
| PCode | 4,007 | 100.0 | identity |
| BarCode | 4,007 | 100.0 | identity |
| ProductName | 4,007 | 100.0 | — |
| CorpNameView | 4,005 | 99.9 | 2 rows ERP CtCode도 null |
| CtCode | 4,005 | 99.9 | — |
| UnitCode | 4,007 | 100.0 | — |
| SaleStatusName | 4,007 | 100.0 | uniq≥1 "판매중" |
| LastBuyDate | 1,862 | 46.5 | 매입 발생 상품만 |
| LastSaleDate | 3,287 | 82.0 | 판매 발생 상품만 |
| NowStock | 4,007 | 100.0 | 재고 0 포함 |
| LocationName | 3,246 | 81.0 | 미지정 상품 19% |
| CostPrice | 4,007 | 100.0 | — |
| PriceA | 4,007 | 100.0 | — |
| McateName | 4,003 | 99.9 | 4 rows null |
| RegDate | 4,007 | 100.0 | 등록 필수 |
| EditDate | 581 | 14.5 | 수정 발생한 row 만 |

### 7.4 전체 SAME / CHANGED 총합

ERP sync 전체 1회 실행 시 (16 ERP-owned columns · matched 3,986):
- 총 비교: 3,986 × 16 = **63,776 cell 비교**
- SAME: 10,728
- CHANGED: 42,434
- SKIP (ERP empty): 10,614
- NEW_INSERT 21 rows × 16 cols = 336 신규 cell 세팅

→ **전체 ERP WRITE 예상 cell 수**: 42,434 UPDATE + 336 INSERT = **42,770 cell** (조건부 - WAIT_DECISION 3개 column 활성 시).

→ **WAIT_DECISION 3개 (category · erp_registered_at · erp_modified_at) 제외 시**: 42,434 − (3,982 + 3,986 + 561) = **33,905 UPDATE cell**.

---

## Section 8 · 21건 identity review 상태

### 8.1 보고 사항 (수정 없음)

- 보고서: `docs/barcode-format-mismatch-21-2026-10-04.md` (별도 파일 · 이미 존재).
- IDENTITY_REVIEW 21 rows: ERP PCode 는 있으나 DB `pcode` 와 매칭 안 됨.
- Section 7 의 `NEW_INSERT=21` 과 동일 집합.
- 이번 작업에서 **수정하지 않음** · 사용자 결정 대기.
- 추후 사용자 승인 시: ① 신규 INSERT (21 rows) · ② 기존 BarCode 다른 포맷 재검토 등 세 가지 처리 옵션.

### 8.2 상태 요약

| 분류 | count |
|---|---:|
| PCode MATCH | 3,986 |
| IDENTITY_REVIEW (BarCode format 차이 · PCode 신규) | 21 |
| **ERP total** | **4,007** ✓ |

---

## Section 9 · 최종 보고 (사용자 지정 포맷)

### 9.1 권장 products 최종 column 수

- **단계 1 (현재)**: 60 col (DROP 0)
- **단계 2 (CONFIRMED_DROP 23 승인)**: **37 col**
- **단계 3 (HOLD 8 중 7 DROP + unit_price 유지)**: **30 col**
- **단계 4 (신규 column 3 추가: `erp_modified_at` · `erp_registered_at` · `erp_location_name`)**: **33 col**

**최종 권장**: **33 col** (단계 4 완료 시).

### 9.2 KEEP column 목록 (최종 33 col)

**identity (2)**: `product_code` · `pcode`

**ERP_OWNED 활성 11**: `product_name` · `supplier` · `supplier_code` · `unit` · `sale_status` · `last_purchase_date` · `last_sale_date` · `current_stock` · `display_location` · (`brand` · `manufacturer` — ERP 전수 null · 유지하되 payload 포함 안 함)

**ERP_OWNED 신규 활성 2**: `purchase_price` · `sale_price`

**ERP_OWNED WAIT_DECISION 1**: `category` (McateName 매핑 사용자 결정)

**신규 ERP column 3**: `erp_modified_at` · `erp_registered_at` · `erp_location_name`

**WEB_OWNED PROTECTED (14)**: `optimal_stock` · `optimal_stock_backup` · `memo` · `hidden` · `stock_note` · `imported_at` · `expiry_date` · `min_order` · `category_code` · `profit_rate` · `search_keywords` · `origin` · `spec` · `unit_price` (HOLD 유지)

### 9.3 DROP column 목록

**CONFIRMED_DROP 23**:
`product_type` · `delivery_price` · `delivery_profit_rate` · `delivery_margin_rate` · `app_registered` · `image_registered` · `preset_registered` · `preset_group` · `promotion_name` · `promotion_priority` · `promotion_purchase_price` · `promotion_sale_price` · `promotion_profit_rate` · `promotion_discount_rate` · `management_group` · `unit_type` · `stock_amount` · `operator` · `point_rate` · `sales_commission` · `total_volume` · `unit_volume` · `individual_quantity`

**HOLD → 다음 cleanup DROP 권장 (7)**:
`col_i` · `supplier_type` · `last_modified_at` (legacy date) · `registered_at` (legacy date) · `wholesale_price1` · `individual_code` · `connection_type`

### 9.4 신규 ERP column 제안 (최대 3)

| 신규 column | 타입 | 소스 | nullOverwrite | 비고 |
|---|---|---|---|---|
| `erp_modified_at` | timestamptz | Product_List.EditDate | false | DB `last_modified_at` (레거시 date) 와 **완전 별개** |
| `erp_registered_at` | timestamptz | Product_List.RegDate | false | DB `registered_at` (레거시 date) 와 **완전 별개** |
| `erp_location_name` (optional) | text | Product_List.LocationName (원본) | false | `display_location` 변환값과 pair · regression 복구용 |

### 9.5 최종 ERP mapping (16 활성 · 그 중 3 신규 column)

| ERP field | → products column | 상태 | nullOverwrite |
|---|---|---|---|
| BarCode | `product_code` | identity (UPDATE 대상 아님) | — |
| PCode | `pcode` | identity (UPDATE 대상 아님) | — |
| ProductName | `product_name` | YES_ACTIVE | false |
| CorpNameView | `supplier` | YES_ACTIVE | false |
| CtCode | `supplier_code` | YES_ACTIVE | false |
| UnitCode | `unit` | YES_ACTIVE | false |
| SaleStatusName | `sale_status` | YES_ACTIVE | false |
| LastBuyDate | `last_purchase_date` | YES_ACTIVE | false |
| LastSaleDate | `last_sale_date` | YES_ACTIVE | false |
| NowStock | `current_stock` | YES_ACTIVE (SSOT) | **true** |
| LocationName (변환) | `display_location` | YES_ACTIVE | false |
| CostPrice | `purchase_price` | **YES_NEW** | false |
| PriceA | `sale_price` | **YES_NEW** | false |
| McateName | `category` | WAIT_DECISION | false |
| EditDate | `erp_modified_at` (신규) | WAIT_DECISION + NEW_COLUMN | false |
| RegDate | `erp_registered_at` (신규) | WAIT_DECISION + NEW_COLUMN | false |
| LocationName (원본) | `erp_location_name` (신규) | OPTIONAL + NEW_COLUMN | false |

**KEEP_OFF (안전상 매핑 X)**: Brand (ERP 전수 null) · Maker (전수 null) · Orgin (전수 null) · Specification (1/4007) · Memo (⚠ DB memo 와 완전 분리) · TaxName (col_i 변환 규칙 미정) · EtcTxtField1 (의미 불명 — 보조 BarCode?) · 그 외 83 field (상수/null).

### 9.6 WEB-owned column 목록 (14 · UPDATE payload 포함 금지)

**PROTECTED (6 · 강제 가드)**: `optimal_stock` · `optimal_stock_backup` · `memo` · `hidden` · `stock_note` · `imported_at`

**WEB-owned ERP 비공급 (8)**: `expiry_date` · `min_order` · `category_code` · `profit_rate` · `search_keywords` · `origin` · `spec` · `unit_price`

> `brand` · `manufacturer` 는 live schema 유지 but ERP sync payload 비포함 (ERP 전수 null · overwrite 가치 無).

### 9.7 ERP 전체 적용 DRY-RUN 결과

| 분류 | count |
|---|---:|
| ERP total | 4,007 |
| PCode MATCH (DB rows 매칭) | 3,986 |
| NEW_INSERT (IDENTITY_REVIEW) | 21 |
| matched cell 비교 (16 cols × 3,986) | 63,776 |
| SAME | 10,728 |
| **CHANGED (전수 매핑 활성 시)** | **42,434** |
| SKIP (ERP empty) | 10,614 |
| NEW_INSERT 신규 cell (16 × 21) | 336 |
| **총 WRITE 예상 cell** | **42,770** (전수 활성) · **33,905** (WAIT_DECISION 제외) |

### 9.8 column별 변경 건수 (최종 요약 · matched 3,986 + new 21)

```
column                CHANGED+INSERT   NEW_COLUMN  주의
──────────────────────────────────────────────────────
product_name            1,202
supplier                3,018
supplier_code           3,751
unit                    3,751
sale_status             2,347
brand                      21 (null)                    ERP 전수 null · 안전
manufacturer               21 (null)                    ERP 전수 null · 안전
last_purchase_date      1,670
last_sale_date          3,053
current_stock           3,722                           SSOT · nullOverwrite=true
display_location        3,144
purchase_price          3,809                           YES_NEW
sale_price                465                           YES_NEW · 94.8% exact
category                4,003              N           WAIT_DECISION · 전수 덮어쓰기 ⚠
erp_registered_at       4,007          NEW_COLUMN       WAIT_DECISION
erp_modified_at           582          NEW_COLUMN       WAIT_DECISION
erp_location_name       3,267 (optional)   NEW_COLUMN   optional
──────────────────────────────────────────────────────
합계                   42,770 (전수)                    DRY-RUN 수치 · WRITE 0
```

### 9.9 21건 identity review 상태

- IDENTITY_REVIEW: **21 rows** (BarCode format 차이로 PCode 매칭 안 되는 ERP row).
- 이번 작업: **수정 0 · 보고만**.
- 상세 보고서: `docs/barcode-format-mismatch-21-2026-10-04.md` (사용자 결정 후 처리 예정).
- Section 7 의 `NEW_INSERT=21` 과 동일 집합.

---

## Appendix A · 규칙 재확인 (실행 내용)

- Supabase SELECT 전수 쿼리: 완료 (DROP_CANDIDATE 29개 column 각 non-null + sample · ERP 전수 매핑 매트릭스 · supplier_type/individual_code/last_modified_at 타입 확인).
- DB WRITE: **0** ✓
- DROP COLUMN / ALTER TABLE: **0** ✓
- 신규 column CREATE: **0** (제안만) ✓
- Product UPDATE: **0** ✓
- 21건 수정: **0** ✓
- Buy / Inventory / Sale WRITE: **0** ✓
- 로컬 commit / remote push: **0** ✓
- 코드 수정: **0** (helper scanner 2개는 `tools/` 아래 신규만: `schema-final-dryrun-2026-10-04.mjs` · `_check-ts-types.mjs`) ✓

## Appendix B · 사용자 결정 필요 항목 (요약)

1. **CONFIRMED_DROP 23 columns** 승인 → migration SQL 생성 · 백업 · 실행.
2. **HOLD → DROP 승격 7** (col_i · supplier_type · last_modified_at · registered_at · wholesale_price1 · individual_code · connection_type).
3. **ERP CostPrice → purchase_price 활성** (영향 3,788 CHANGED cell).
4. **ERP PriceA → sale_price 활성** (영향 444 CHANGED cell · 94.8% exact).
5. **ERP McateName → category 활성** (영향 3,982 CHANGED cell · 전수 덮어쓰기 ⚠).
6. **신규 column `erp_modified_at` 생성 + EditDate 매핑** (영향 561 신규 cell).
7. **신규 column `erp_registered_at` 생성 + RegDate 매핑** (영향 4,007 신규 cell).
8. **신규 column `erp_location_name` 생성 (optional)** (3,267 신규 cell).
9. **IDENTITY_REVIEW 21건 처리 방법** (신규 INSERT or 기존 BarCode 재매칭).

## Appendix C · 알려진 코드-스키마 불일치 (별도 과제)

- `src/shared/erp/erpSyncWhitelist.ts:76` 의 `ERP_DERIVED_PRODUCT_FIELDS.location` 참조 vs live schema 에 `location` column **없음** · `server/routes/stock/products.ts:471–477` fallback 처리 중. 이 audit 범위 밖.
- `ERP_OWNED_PURCHASE_FIELDS` 의 `bm_code · row_num` 참조 vs 라이브 `purchase_details` 21 col 에 두 column 없음 (별도 audit `erp-supabase-mapping-audit.md` §1-4 지적). 범위 밖.
