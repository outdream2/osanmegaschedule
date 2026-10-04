# ERP ↔ Supabase Mapping Audit (2026-10-04)

**Scope**: 4 ERP SOAP APIs (Product_List · Inventory_Status · Buy_Status · Sale_Status) ↔ Supabase (products · purchase_details · stock_history · inventory_checks · vendors).
**Mode**: READ ONLY audit. No code changed, no DB writes, no migrations. See §13 for top findings.

Source material (consulted, not re-run):
- `src/shared/erp/erpSyncWhitelist.ts` · `src/shared/erp/erpProductMapper.ts` · `src/shared/erp/erpBuyMapper.ts` · `src/shared/erp/erpLocationTransform.ts`
- `apps/sync-agent/src/main/iregenSoap.ts` (lines ~500, 537, 589, 834, 1050, 1149)
- `scripts/audit-products-schema-2026-10-04.mjs` (re-ran · live DB schema confirmed)
- `data/snapshots/product-list-2026-10-03.json` (4,007 rows · 102 col)
- `data/snapshots/buy-status-2026-10-03.json` (5 rows · 51 col · BmCode=12261003000009)
- `C:\Users\USER\AppData\Roaming\megatown-sync-agent\erp-cache\inventory-status\candidate.json.gz` (4,007 rows · 42 col · 2026-10-04 00:50 KST)
- `C:\Users\USER\AppData\Roaming\megatown-sync-agent\erp-cache\buy-status\candidate.json.gz` (0 rows · 2026-10-04 01:11 KST — empty day, snapshot from 10-03 used instead)
- `C:\Users\USER\AppData\Roaming\megatown-sync-agent\erp-cache\product-list\` (empty — no cached snapshot; `data/snapshots/product-list-2026-10-03.json` used)
- `tools/iregen-bridge/samples/sale-request.txt` (SOAP envelope only — no response captured)
- `docs/erp-import-mapping.md` · `docs/erp-sync-risk-report.md` · `docs/_audit-raw-2026-10-01.json`

---

## 1. Executive Summary

1. **Current whitelist is sound for what it covers (11 product fields + 11 purchase fields + location derivation).** No wrong existing mapping was found: every entry in `ERP_OWNED_PRODUCT_FIELDS` and `ERP_OWNED_PURCHASE_FIELDS` matches ERP semantics.
2. **~90 of 102 Product_List columns are unused by the current mapping**, but most are legitimately garbage (90% have `uniqueCount=1` across 4,007 rows — ERP template defaults). Only a handful are useful (see §8).
3. **Sale_Status is NOT integrated**: no SOAP code in `iregenSoap.ts`, no response snapshot anywhere, and **no Supabase sales table exists** (`sales`, `sale_history`, `sales_history`, `sale_details`, `pos_sales`, `daily_sales`, `monthly_sales`, `sales_summary`, `sales_records` all return "table not found"). This is a greenfield area — new DB structure required.
4. **Buy_Status 51-col scheme has 2 missing DB targets that purchase_details cannot represent today**: `BmCode` and `ROWNUM` identity columns. The whitelist references `bm_code` / `row_num` as if they exist — **but the live `purchase_details` schema has only 21 columns and neither of those columns are present**. Any UPSERT by (bm_code, row_num) will fail. **CRITICAL BLOCKER.**
5. **Inventory_Status 42-col has already been intentionally un-mapped** (user decision 2026-10-03: NowStock in Product_List is SSOT for `current_stock`; Inventory_Status is purchase/sale/move analytics only). This is correct — no DB target should be added.
6. **CostPrice / PriceA (purchase_price / sale_price) are intentionally held outside the whitelist** pending user decision. Non-null coverage in DB is 4% (purchase_price) / 82% (sale_price). Decision deferred.
7. **Category (McateName / Lcate name tree) is intentionally held** pending user decision. 4 McateName distinct values (약국 · 약국2 · 약국3 · 뷰티) — low selectivity, but DcateName is 100% null so useful detail only lives in McateName + ScateName.
8. **BarCode identity (93.1%)** is confirmed stable: Product_List.BarCode 100% non-empty, 1:1 with PCode, matches `products.product_code` at 93.1% exact.
9. **Dangerous similar-named field**: ERP `Memo` (Product_List col[93]) vs DB `products.memo`. These are completely different concepts (ERP = legacy field, 77 non-empty rows; DB = user annotation, 82% non-empty). Already correctly marked PROTECTED, but any future "obvious" mapping must be refused.
10. **Buy_Status BmCode/ROWNUM identity is intact in ERP** (unique per `(BmCode, ROWNUM)`), but the DB table has NO column to receive it. Current `purchase_details` ignore-duplicates uses a weak natural key (`purchase_date, supplier_code, product_code, quantity, amount`) which **loses duplicates** when the same line is purchased twice on one day.

---

## 2. Supabase Schema (live, 2026-10-04)

**products** · rows=7,079 · cols=60
```
id, product_code (PK · bar code), product_name, col_i, product_type, origin, spec, purchase_price,
sale_price, profit_rate, delivery_price, delivery_profit_rate, sale_status, app_registered,
image_registered, preset_registered, preset_group, promotion_name, promotion_priority,
promotion_purchase_price, promotion_sale_price, promotion_profit_rate, promotion_discount_rate,
wholesale_price1, supplier_code, supplier, supplier_type, expiry_date, display_location,
management_group, unit_type, current_stock, stock_amount, optimal_stock, last_purchase_date,
last_sale_date, category_code, category, operator, last_modified_at, registered_at, min_order,
point_rate, sales_commission, delivery_margin_rate, search_keywords, unit, total_volume,
unit_volume, unit_price, connection_type, individual_code, individual_quantity, imported_at,
brand, manufacturer, memo, hidden, optimal_stock_backup, location, stock_note
```

**purchase_details** · rows=12,939 · cols=21
```
id, purchase_date, supplier_code, supplier_name, product_code, product_name, spec, quantity,
unit_price, amount, vat, total, imported_at, period_start_date, period_type, verified_by,
verify_status, verify_note, verified_at, verified_expiring, expiry_date
```
⚠ `bm_code` and `row_num` referenced by `erpSyncWhitelist.ts` are **NOT present** in the live schema.

**stock_history** · rows=53,641 · cols=24
```
id, snapshot_date, product_code, supplier_code, supplier_name, product_name, spec, opening_stock,
purchase_qty, sale_qty, disposal_qty, internal_qty, adjustment_qty, closing_stock, taxable_amount,
supply_amount, vat, duty_free_amount, total_amount, created_at, tax_type, product_type,
period_type, period_start_date
```

**inventory_checks** · rows=3,400 · cols=19 (**全体 PROTECTED** — user physical count table)
```
id, product_code, product_name, store1_stock, system_stock, checked_by, note, status, checked_at,
warehouse1_stock, warehouse2_stock, store3_stock, store1_zone, store2_zone, store3_zone,
shelf_positions, expiry_date, store_stock_2, store2_stock
```

**vendors** · rows=156 · cols=26 (**全体 PROTECTED** — web-owned)
```
id, company_name, contact_name, phone, category, note, password_hash, created_at, business_number,
vat_included, manager_name, manager_phone, emergency_phone, team_leader_name, team_leader_phone,
emergency_contact, approval_status, approval_requested_at, approved_at, approved_by, order_method,
region, invoice_method, order_status, special_notes, email
```

**No sales-related table exists** — queried: `sales`, `sale_history`, `sales_history`, `sale_details`, `pos_sales`, `daily_sales`, `monthly_sales`, `sales_summary`, `sales_records` → all return "table not found".

---

## 3. Product_List Mapping (102 columns · snapshot 4,007 rows)

Classification keys for Match Rate (per 4,007 rows): `uniqueCount` of 1 = template constant / unused. `nonEmpty` = how many rows have a real value.

| ERP Col | ERP Type | Sample Value | DB Table | DB Col | DB Type | Status | Match Rate | Notes |
|---|---|---|---|---|---|---|---|---|
| StCode | String | "000" | — | — | — | UNUSED_ERP | 4007/4007 uniq=1 | 매장 코드 상수 · 단일 매장 환경 |
| PCode | String | "15431" | — | — | — | UNUSED_ERP | 4007/4007 | ERP internal id · 보관 不 필요 (BarCode 로 식별) · identity.purchaseKey 외 사용처 없음 |
| ProductName | String | "제놀원 카타플라스마 6매" | products | product_name | text | CONFIRMED | 4007/4007 | nullOverwrite=false |
| Specification | String | "" | — | — | — | NO_ERP_SOURCE | 1/4007 | ERP 가 거의 미제공 · DB spec 도 2/7079 · 매핑 불필요 |
| GoodsName | String | 상품명 | — | — | — | UNUSED_ERP | 4007 uniq=4006 | ProductName 과 거의 동일 (중복) |
| GoodsSubName | String | 서브명 | — | — | — | UNUSED_ERP | 47/4007 | 희박 · 매핑 가치 낮음 |
| ProductName_pop | String | "" | — | — | — | UNUSED_ERP | 1/4007 | POP 디스플레이용 · 미사용 |
| ProductTypeName | String | "단품" | — | — | — | UNUSED_ERP | 4007 uniq=1 | 상수 · 미사용 |
| ProductGubunName | String | "상품" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| OptionViewTypeName | String | null | — | — | — | UNUSED_ERP | 0/4007 | 공란 전수 |
| IsWeight | String | "1" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| WeightName | String | "수량" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| WeightCode | String | null | — | — | — | UNUSED_ERP | 0/4007 | 공란 전수 |
| StockName | String | "사용" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| TaxName | String | "과세" / "면세" | products | col_i (?) | text | CANDIDATE | uniq=2 | DB col_i 가 과세구분 역할 (`과직`) · ERP TaxName 과 매핑 가능 · 사용자 결정 필요 |
| IsStock | String | "1" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| TaxPercent | Int16 | "10" | — | — | — | UNUSED_ERP | uniq=2 | 과세율 상수 (10/0) · DB 미사용 |
| UnitCode | String | "EA" | products | unit | text | CONFIRMED | uniq=4 (EA/포/병/구) | nullOverwrite=false |
| UnitStock | Int32 | "1" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| WeightCostUnit | String | null | — | — | — | UNUSED_ERP | 0 | 공란 |
| IsProductType | String | "1" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| IsBottle | String | "2" | — | — | — | UNUSED_ERP | uniq=2 | 공병 여부 · DB 미사용 |
| BottlePrice | Int16 | 0 | — | — | — | UNUSED_ERP | uniq=1 | 공병가격 전수 0 |
| NowStock | Int64 | "120" | products | current_stock | numeric | CONFIRMED | 4007 uniq=487 | **nullOverwrite=true** · ERP SSOT 확정 (2026-10-03) |
| CostPrice | Decimal | "1767.70" | products | purchase_price | numeric | CANDIDATE | 4007 uniq=1484 | **USER DECISION 대기** · DB 4% 사용 · 활성화 보류 |
| CtCode | String | "1005" | products | supplier_code | text | CONFIRMED | 4005/4007 uniq=92 | nullOverwrite=false |
| CorpNameView | String | "녹십자" | products | supplier | text | CONFIRMED | 4005/4007 uniq=92 | nullOverwrite=false · vendors 테이블은 PROTECTED (별개) |
| PriceA | Decimal | "2900.00" | products | sale_price | numeric | CANDIDATE | 4007 uniq=333 | **USER DECISION 대기** · 94.8% exact match · 189 different |
| PriceB | Decimal | 0 | — | — | — | UNUSED_ERP | uniq=1 | 전수 0 · NOT_USED |
| PriceC | Decimal | 0 | — | — | — | UNUSED_ERP | uniq=1 | 전수 0 · NOT_USED |
| PriceD | Decimal | 0 | — | — | — | UNUSED_ERP | uniq=1 | 전수 0 · NOT_USED |
| IsSalesStore | String | "1" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| EvCostUnit | Decimal | 0 | — | — | — | UNUSED_ERP | uniq=1 | 전수 0 |
| EvSaleUnit | Decimal | 0 | — | — | — | UNUSED_ERP | uniq=1 | 전수 0 |
| IsPriceLock | String | "2" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| Horizontal | Int32 | 0 | — | — | — | UNUSED_ERP | uniq=1 | 전수 0 |
| Vertical | Int32 | 0 | — | — | — | UNUSED_ERP | uniq=1 | 전수 0 |
| Height | Decimal | 0 | — | — | — | UNUSED_ERP | uniq=1 | 전수 0 |
| Volume | Int32 | 0 | — | — | — | UNUSED_ERP | uniq=1 | 전수 0 |
| WeightPriceUnit | String | null | — | — | — | UNUSED_ERP | 0 | 공란 |
| LcateName | String | "코스트팜약국" | products | category (?) | text | CANDIDATE | 4004 uniq=1 | 대분류 · 전수 상수 · 저가치 |
| McateName | String | "약국" / "약국2" / "약국3" / "뷰티" | products | category (?) | text | CANDIDATE | 4003 uniq=4 | **USER DECISION 대기** · category 매핑 1순위 후보 |
| ScateName | String | "(주)녹십자" | — | — | — | UNUSED_ERP | 3999 uniq=92 | **사실상 CorpNameView 와 동일 (공급사)** · category 와 혼동 금지 |
| DcateName | String | null | — | — | — | UNUSED_ERP | 0/4007 | 공란 전수 |
| CateGubunOneName | String | 희박 | — | — | — | UNUSED_ERP | 100/4007 uniq=6 | 저가치 |
| CateGubunTwoName | String | 희박 | — | — | — | UNUSED_ERP | 96/4007 uniq=2 | 저가치 |
| Maker | String | null | products | manufacturer | text | NO_ERP_SOURCE | 0/4007 | **ERP 가 미제공** · whitelist 는 참조 중 (buildErpProductPayload) · 영향: NULL overwrite 안 함 (nullOverwrite=false) → 안전하지만 사실상 작동 안 함 |
| Brand | String | null | products | brand | text | NO_ERP_SOURCE | 0/4007 | **ERP 가 미제공** · whitelist 는 참조 중 · 동일 (NULL skip) |
| Orgin | String | "" | products | origin | text | NO_ERP_SOURCE | 0/4007 | ERP 가 미제공 · DB origin 희박 |
| IsStandingPoint | String | "1" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| ProductFee | Decimal | 0 | — | — | — | UNUSED_ERP | uniq=1 | 전수 0 |
| KeepingRuleName | String | "상온" | — | — | — | UNUSED_ERP | uniq=1 | 상수 (상온) · 저가치 |
| BuseoCode | Int32 | "1826" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| BuseoName | String | "기타" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| Damdang | String | null | — | — | — | UNUSED_ERP | 0 | 공란 |
| DamdangName | String | null | — | — | — | UNUSED_ERP | 0 | 공란 |
| DamdangSub | String | null | — | — | — | UNUSED_ERP | 0 | 공란 |
| DamdangSubName | String | null | — | — | — | UNUSED_ERP | 0 | 공란 |
| IsPoint | String | "2" | — | — | — | UNUSED_ERP | uniq=2 | 저가치 |
| IsAddPoint | String | "1" | — | — | — | UNUSED_ERP | uniq=2 | 저가치 |
| PointAdd | Int32 | 0 | — | — | — | UNUSED_ERP | uniq=1 | 전수 0 |
| IsOrderType | String | "1" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| LimitTime | String | "0" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| IsDevDayType | String | "1" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| DevDDay | Int32 | 1 | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| DevMonday~DevSunday | String × 7 | "2" | — | — | — | UNUSED_ERP | uniq=1 | 요일별 발주 상수 전부 "2" |
| MakeDayName | String | "안함" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| ExpiryDayName | String | "안함" | — | — | — | UNUSED_ERP | uniq=1 | 상수 · 유통기한 ERP 미사용 명시 |
| IdentificationName | String | "안함" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| UniPassName | String | "안함" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| EtcTxtField1 | String | 상품명 변형 | — | — | — | UNUSED_ERP | 3879 uniq=3865 | ⚠ 거의 유니크 but 명확한 의미 모름 · search_keywords 후보 가능성 |
| EtcTxtField2~6 | String | null | — | — | — | UNUSED_ERP | 0 | 공란 전수 |
| EtcIntField1~3 | Int32 | 0 | — | — | — | UNUSED_ERP | uniq=1 | 전수 0 |
| IsAutoCostUpdate | String | "1" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| LastBuyDate | String | "2026-10-02" | products | last_purchase_date | date | CONFIRMED | 1862/4007 uniq=30 | KST date string · nullOverwrite=false |
| LastSaleDate | String | null | products | last_sale_date | date | CONFIRMED | 3287/4007 uniq=33 | KST date string · nullOverwrite=false |
| BarCode | String | "0108806436049338" | products | product_code | text (PK) | CONFIRMED | 4007/4007 (unique) | ERP_IDENTITY · 93.1% match |
| BuyStatusName | String | "매입중" | — | — | — | UNUSED_ERP | uniq=1 | 상수 · 매입 상태 (판매와 분리) |
| SaleStatusName | String | "판매중" | products | sale_status | text | CONFIRMED | 4007 uniq=1 (snapshot) | nullOverwrite=false · ERP 전체 가 "판매중" (판매중지 는 ERP 가 아예 미반환 가능성) · hidden 과 완전 분리 |
| LocationName | String | "벽>21>전체>전체" | products | display_location + location | text | CONFIRMED (DERIVED) | 3246/4007 uniq=175 | `transformErpLocation` 거쳐서 "21" 또는 "6A" 로 변환 · display_location + location 동시 UPDATE |
| IsPopName | String | "안함" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| Memo | String | 희박 | — | — | — | UNUSED_ERP (⚠DANGER) | 77/4007 uniq=42 | ⚠ **DB memo 와 완전 분리** · PROTECTED_PRODUCT_FIELDS 에 명시 · 매핑 금지 |
| UserID | String | "101" | — | — | — | UNUSED_ERP | uniq=3 | ERP 등록자 · 미사용 |
| UserName | String | "공용(허가 필요)" | — | — | — | UNUSED_ERP | uniq=4 | ERP 등록자명 · 미사용 |
| RegDate | String | "2026-10-02 17:19:56" | products | registered_at (?) | timestamptz | CANDIDATE | 4007 uniq=143 | ERP 등록일시 · 사용자 결정 대기 (현재 미매핑) |
| EditUserID | String | "107" | — | — | — | UNUSED_ERP | 581/4007 uniq=7 | ERP 최종수정자 |
| EditUserName | String | "박상욱" | — | — | — | UNUSED_ERP | 581/4007 uniq=8 | ERP 최종수정자명 |
| EditDate | String | "2026-10-02 17:27:06" | products | last_modified_at (?) | timestamptz | CANDIDATE | 581/4007 uniq=581 | ERP 최종수정일시 · 사용자 결정 대기 |
| RegStorageName | String | "용인점" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| ROWNUM | Int64 | "1" | — | — | — | UNUSED_ERP | per-row | 서버측 pagination 순번 · 저장 無의미 |

**Confirmed count** (actually in `ERP_OWNED_PRODUCT_FIELDS` + derived): **11** (product_name, supplier, supplier_code, unit, sale_status, brand, manufacturer, last_purchase_date, last_sale_date, current_stock, display_location/location).

**Candidate count** (seen in whitelist comments but inactive): **4** (purchase_price=CostPrice, sale_price=PriceA, category=McateName, taxation=TaxName).

**Candidate additions** (new): **3** (registered_at=RegDate, last_modified_at=EditDate, search_keywords=EtcTxtField1).

**No ERP source** (whitelist references but ERP returns null 100%): **3** (brand=Maker, manufacturer=Maker, origin=Orgin).

---

## 4. Inventory_Status Mapping (42 columns · snapshot 4,007 rows)

**Status**: Already de-mapped by user decision (2026-10-03). Not used for current_stock calculation. Snapshot kept for analytics (opening/moves/sales). All classifications below are **UNUSED_ERP** on the write path; they could inform `stock_history` but current `stock_history` is populated from monthly Excel, not from this API.

| ERP Col | ERP Type | Sample Value | DB Table | DB Col | DB Type | Status | Match Rate | Notes |
|---|---|---|---|---|---|---|---|---|
| PPCode | String | null | — | — | — | UNUSED_ERP | 71/4007 | self-ref · bar code 아님 |
| PCode | String | "10001" | — | — | — | UNUSED_ERP | 4007 | PCode→BarCode 매핑은 Product_List 로만 처리 |
| ProductName | String | "삼양연고 100g" | — | — | — | UNUSED_ERP | 4007 | Product_List 와 중복 |
| IsTax | String | "과세" | — | — | — | UNUSED_ERP | uniq=2 | 중복 (Product_List.TaxName) |
| TaxPercent | String | "10" | — | — | — | UNUSED_ERP | uniq=2 | 중복 |
| UnitCode | String | "EA" | — | — | — | UNUSED_ERP | uniq=4 | 중복 |
| StCode | String | "000" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| StorageName | String | "용인점" | — | — | — | UNUSED_ERP | uniq=1 | 상수 |
| IsSaleStatusName | String | "판매중" | — | — | — | UNUSED_ERP | uniq=1 | 중복 (Product_List.SaleStatusName) |
| CtCode | String | "1134" | — | — | — | UNUSED_ERP | uniq=92 | 중복 |
| CCorpName | String | "라라컴퍼니" | — | — | — | UNUSED_ERP | uniq=92 | 중복 (Product_List.CorpNameView) |
| IsBuyerType | String | "일반매입" | — | — | — | UNUSED_ERP | uniq=3 | 저가치 |
| LcateName | String | "코스트팜약국" | — | — | — | UNUSED_ERP | uniq=1 | 중복 |
| McateName | String | "약국2" | — | — | — | UNUSED_ERP | uniq=4 | 중복 |
| ScateName | String | "라라컴퍼니" | — | — | — | UNUSED_ERP | uniq=92 | 중복 |
| DcateName | String | null | — | — | — | UNUSED_ERP | 0/4007 | 공란 전수 |
| LocationName | String | "벽>21>전체>전체" | — | — | — | UNUSED_ERP | — | 중복 (Product_List 가 사용) |
| CostPrice | Decimal | "5243.00" | — | — | — | UNUSED_ERP | — | 중복 (Product_List 가 CANDIDATE) |
| CostPrice1 | Decimal | "5243.00" | — | — | — | UNUSED_ERP | — | 과거 매입단가 1 · 미사용 |
| ConfirmDate1 | DateTime | "2026-09-29T16:39:59" | — | — | — | UNUSED_ERP | — | 과거 매입 확정일 · 미사용 |
| CostPrice2~4 | Decimal | null | — | — | — | UNUSED_ERP | 0 | 과거 매입단가 2~4 · 미사용 |
| ConfirmDate2~3 | DateTime | null | — | — | — | UNUSED_ERP | 0 | 미사용 |
| PrvStock | Decimal | "13.00" | — | — | — | UNUSED_ERP | — | 기간 시작재고 · (옛 current_stock 공식 입력 · 폐기) |
| BuyStock | Decimal | "0" | — | — | — | UNUSED_ERP | 0 non-zero | 기간 매입량 (snapshot 당일 전부 0) |
| BuyReturnStock | Decimal | "0" | — | — | — | UNUSED_ERP | — | 매입반품 |
| StorageMoveIn/Out | Decimal | "0" | — | — | — | UNUSED_ERP | — | 창고 이동 |
| StorageMoveAutoIn/Out | Decimal | "0" | — | — | — | UNUSED_ERP | — | 자동 이동 |
| SaleStock | Decimal | "0" | — | — | — | UNUSED_ERP | 11 non-zero | 기간 판매량 |
| SaleReturnStock | Decimal | "0" | — | — | — | UNUSED_ERP | — | 판매반품 |
| ProductUseStock | Decimal | "0" | — | — | — | UNUSED_ERP | — | 소모 |
| ProductReturnUseStock | Decimal | "0" | — | — | — | UNUSED_ERP | — | 소모반납 |
| ProductBadStock | Decimal | "0" | — | — | — | UNUSED_ERP | — | 불량 |
| ProductReturnBadStock | Decimal | "0" | — | — | — | UNUSED_ERP | — | 불량반납 |
| PlusStock | Decimal | "0.00" | — | — | — | UNUSED_ERP | 0 non-zero | 조정+ |
| MinusStock | Decimal | "0.00" | — | — | — | UNUSED_ERP | 0 non-zero | 조정- |
| SubdivisionMinus | Decimal | "0" | — | — | — | UNUSED_ERP | — | 분할- |
| SubdivisionPlus | Decimal | "0" | — | — | — | UNUSED_ERP | — | 분할+ |

**Confirmed**: 0 (intentional). **Unresolved**: 0 (user decision complete).

---

## 5. Buy_Status Mapping (51 columns · snapshot 5 rows · BmCode=12261003000009)

| ERP Col | ERP Type | Sample Value | DB Table | DB Col | DB Type | Status | Match Rate | Notes |
|---|---|---|---|---|---|---|---|---|
| CorpCode | String | "30009" | — | — | — | UNUSED_ERP | const | 상수 |
| BmCode | String | "12261003000009" | purchase_details | **bm_code** | — | **DB SCHEMA GAP** | — | ⚠ erpSyncWhitelist 는 참조 중 but **DB 에 컬럼 없음** · 신규 추가 필요 |
| BuyMonth | String | "2026/10" | — | — | — | UNUSED_ERP | — | YYYY/MM · BuyDate 로 도출 가능 |
| BuyDate | String | "2026-10-03" | purchase_details | purchase_date | date | CONFIRMED | 1/1 | nullOverwrite=false |
| StCode | String | "000" | — | — | — | UNUSED_ERP | const | 상수 |
| StorageName | String | "용인점" | — | — | — | UNUSED_ERP | const | 상수 |
| BuseoCode | String | "1826" | — | — | — | UNUSED_ERP | const | 상수 |
| BuseoName | String | "기타" | — | — | — | UNUSED_ERP | const | 상수 |
| DamDang | String | "101" | — | — | — | UNUSED_ERP | — | 담당자 ID |
| DamDangName | String | "공용(허가 필요)" | — | — | — | UNUSED_ERP | — | 담당자명 |
| CtCode | String | "1058" | purchase_details | supplier_code | text | CONFIRMED | — | nullOverwrite=false |
| CorpNameView | String | "조아제약(vat미포함)" | purchase_details | supplier_name | text | CONFIRMED | — | nullOverwrite=false |
| IsSupport | String | "" | — | — | — | UNUSED_ERP | — | 지원여부 |
| TotalCnt | String | "5" | — | — | — | UNUSED_ERP | — | 문서 line 수 (매입 1건당 반복) |
| ConfirmUserID/Name | String | 담당자 | — | — | — | UNUSED_ERP | — | 매입 확정자 |
| ConfirmDate | DateTime | "2026-10-03 14:18:28" | — | — | — | UNUSED_ERP | — | 매입 확정일시 (candidate) |
| Remark | String | "" | — | — | — | UNUSED_ERP | — | 비고 (candidate for note) |
| IsStatus | String | "9" | — | — | — | UNUSED_ERP | const | 상태 코드 |
| IsStatusName | String | "매입완료" | — | — | — | UNUSED_ERP | const | 상태명 |
| IsBiz | String | " " | — | — | — | UNUSED_ERP | — | 사업자 여부 |
| UserID/Name | String | 등록자 | — | — | — | UNUSED_ERP | — | 등록자 |
| RegDate | DateTime | "2026-10-03 12:15:54" | — | — | — | UNUSED_ERP | — | 등록일시 (candidate) |
| EditUserID/Name/Date | String | 수정자 | — | — | — | UNUSED_ERP | — | 수정자 (candidate) |
| PCode | String | "12035" | purchase_details | product_code | text | CONFIRMED | — | **별도 처리**: PCode → BarCode 변환 (buildPCodeToBarcodeMap) · 그 후 product_code 저장 |
| ProductName | String | "젤리잘크톤(망고맛) 15g*30포" | purchase_details | product_name | text | CONFIRMED | — | nullOverwrite=false |
| Specification | String | "" | purchase_details | spec | text | CONFIRMED | 0/5 | nullOverwrite=false · 사실상 공란 |
| ProductWeight | String | "0.00" | — | — | — | UNUSED_ERP | — | 무게 · DB 미사용 |
| UnitCode | String | "EA" | — | — | — | UNUSED_ERP | — | DB purchase_details 에 unit 컬럼 없음 |
| UnitCost | String | "16500.00" | purchase_details | unit_price | numeric | CONFIRMED | — | nullOverwrite=false |
| UnitSale | String | "19000.00" | — | — | — | UNUSED_ERP | — | 매입 시점 판매단가 · 저장 X |
| StockCnt | String | "10.00" | purchase_details | quantity | numeric | CONFIRMED | — | nullOverwrite=false |
| TotalStock | String | "10" | — | — | — | UNUSED_ERP | — | 총재고 · 저장 X |
| BuyPrice | String | "150000.00" | purchase_details | amount | numeric | CONFIRMED | — | VAT 제외 공급가 |
| BuyTax | String | "15000.00" | purchase_details | vat | numeric | CONFIRMED | — | nullOverwrite=false |
| TaxExemption | String | "0.00" | — | — | — | UNUSED_ERP | — | 면세 공급가 · DB 미매핑 |
| BuyTotal | String | "165000.00" | purchase_details | total | numeric | CONFIRMED | — | VAT 포함 총액 |
| Lcate | String | "1" | — | — | — | UNUSED_ERP | — | 대분류 ID |
| LcateName | String | "코스트팜약국" | — | — | — | UNUSED_ERP | — | 중복 |
| McateName | String | "약국" | — | — | — | UNUSED_ERP | — | 중복 |
| ScateName | String | "조아제약(주)(vat미포함)" | — | — | — | UNUSED_ERP | — | 공급사명 중복 |
| DcateName | String | null | — | — | — | UNUSED_ERP | 0 | 공란 |
| CorpBizNo | String | "000-00-00000" | — | — | — | UNUSED_ERP | — | 사업자번호 · vendors 는 PROTECTED |
| ReturnCodeName | String | null | — | — | — | UNUSED_ERP | 0 | 반품코드 · 공란 |
| MakeDay | String | "" | — | — | — | UNUSED_ERP | 0 | 제조일 · 공란 |
| ExpiryDay | String | "" | — | — | — | UNUSED_ERP | 0 | ⚠ 유통기한 ERP 미제공 (PROTECTED 됨) |
| Identification | String | "" | — | — | — | UNUSED_ERP | 0 | 식별코드 · 공란 |
| ROWNUM | String | "1" | purchase_details | **row_num** | — | **DB SCHEMA GAP** | — | ⚠ erpSyncWhitelist 는 참조 중 but **DB 에 컬럼 없음** · 신규 추가 필요 |

**DB Identity Ready?** → **NO**. `bm_code` 와 `row_num` 둘 다 DB 에 존재하지 않음. Current `erpBuyMapper.ts` 가 payload 에 포함시키지만 upsert 시 실패하거나 ignored.

---

## 6. Sale_Status Mapping

**ERP API: NOT INTEGRATED** · `apps/sync-agent/src/main/iregenSoap.ts` 에 Sale_Status 함수 **없음**. Only envelope sample at `tools/iregen-bridge/samples/sale-request.txt` (SvcSaleBiz.asmx · SOAPAction "Sale_Status" · ent 블록만 캡쳐 · 응답 없음).

**Supabase target: NOT FOUND** · `sales`, `sale_history`, `sales_history`, `sale_details`, `pos_sales`, `daily_sales`, `monthly_sales`, `sales_summary`, `sales_records` 전부 존재하지 않음.

Envelope sample 에서 추론 가능한 Sale_Status 요청 파라미터 (응답 columns 아님):
- 기간: `StartDate`/`EndDate` (default: 당일)
- 집계: `DataColumns = "SaleTotal,Margin,TotalStock"` · `RowArea = "BuyerCorpNameView,ProductName,UnitCost,UnitSale,SaleDate"`
- 식별자 요청: `CorpCode`, `StCode`, `IsStatus=9`
- 상품정보: 아마도 응답에 PCode·ProductName·UnitCost·UnitSale·SaleTotal·Margin 등 반환 예상 (Buy_Status 와 유사 구조 추정)

**Confirmed**: 0 · **Candidate**: 0 (응답 캡쳐 전 추정 금지) · **DB Schema Gap**: `sales` 테이블 전체 신규 설계 필요.

Recommendation: §13.7 참조.

---

## 7. Unmapped Supabase Columns (per table)

### products (60 cols) · 매핑 상태

| DB Col | Status | 사유 |
|---|---|---|
| id | NO_ERP_SOURCE | DB 자동 증가 PK |
| product_code | CONFIRMED (identity) | = BarCode |
| product_name | CONFIRMED | = ProductName |
| col_i | CANDIDATE | TaxName 매핑 가능 (현재 X) |
| product_type | NO_ERP_SOURCE | Excel import 운영 · ERP ProductTypeName 은 상수 |
| origin | NO_ERP_SOURCE | ERP Orgin 전수 공란 |
| spec | NO_ERP_SOURCE | ERP Specification 1/4007 · DB 2/7079 |
| purchase_price | CANDIDATE | CostPrice 매핑 보류 |
| sale_price | CANDIDATE | PriceA 매핑 보류 |
| profit_rate | CALCULATED (?) | 자체 공식 (ERP 미제공) · 확정 필요 |
| delivery_price · delivery_profit_rate · delivery_margin_rate | WEB_OWNED | 배송가 · DB 자체 운영 |
| sale_status | CONFIRMED | = SaleStatusName |
| app_registered · image_registered · preset_registered · preset_group | WEB_OWNED | 앱/이미지/프리셋 운영 |
| promotion_* (6개) | WEB_OWNED | 프로모션 · ERP 미제공 |
| wholesale_price1 | WEB_OWNED | 도매가 · ERP 미제공 |
| supplier_code | CONFIRMED | = CtCode |
| supplier | CONFIRMED | = CorpNameView |
| supplier_type | WEB_OWNED | 공급사 구분 · DB 자체 |
| expiry_date | WEB_OWNED | DB 미사용 (0/7079) · inventory_checks.expiry_date 가 SSOT |
| display_location | CONFIRMED (DERIVED) | ← transformErpLocation(LocationName) |
| management_group | WEB_OWNED | 관리 그룹 · DB 자체 |
| unit_type | WEB_OWNED | 단위 유형 · ERP UnitCode 와 다름 |
| current_stock | CONFIRMED | = NowStock · nullOverwrite=true |
| stock_amount | WEB_OWNED | 재고금액 · DB 자체 |
| optimal_stock | PROTECTED | 사용자 직접 입력 (99.9%) |
| last_purchase_date | CONFIRMED | = LastBuyDate |
| last_sale_date | CONFIRMED | = LastSaleDate |
| category_code | NO_ERP_SOURCE | ERP 는 category code 아닌 name 만 제공 |
| category | CANDIDATE | McateName 매핑 보류 |
| operator | WEB_OWNED | 담당 · DB 자체 |
| last_modified_at | CANDIDATE | EditDate 매핑 가능 (현재 X) |
| registered_at | CANDIDATE | RegDate 매핑 가능 (현재 X) |
| min_order · point_rate · sales_commission | WEB_OWNED | DB 자체 |
| search_keywords | CANDIDATE | EtcTxtField1 매핑 가능성 (uniq=3865) |
| unit | CONFIRMED | = UnitCode |
| total_volume · unit_volume · unit_price | WEB_OWNED | 부피/단가 · DB 자체 |
| connection_type | WEB_OWNED | 연계 유형 · DB 자체 |
| individual_code · individual_quantity | WEB_OWNED | 낱개 바코드 · DB 자체 |
| imported_at | PROTECTED | 임포트 메타 |
| brand | NO_ERP_SOURCE | ERP Brand 전수 null |
| manufacturer | NO_ERP_SOURCE | ERP Maker 전수 null |
| memo | PROTECTED | ⚠ ERP Memo 와 다름 · 사용자 입력 (82%) |
| hidden | PROTECTED | 사용자 토글 |
| optimal_stock_backup | PROTECTED | 자동 백업 |
| location | CONFIRMED (DERIVED) | display_location 과 동시 UPDATE |
| stock_note | PROTECTED | current_stock 파싱 실패 fallback |

### purchase_details (21 cols)

| DB Col | Status | 사유 |
|---|---|---|
| id | NO_ERP_SOURCE | 자동 PK |
| purchase_date | CONFIRMED | = BuyDate |
| supplier_code / supplier_name | CONFIRMED | = CtCode / CorpNameView |
| product_code | CONFIRMED | PCode → BarCode 변환 |
| product_name | CONFIRMED | = ProductName |
| spec | CONFIRMED | = Specification |
| quantity | CONFIRMED | = StockCnt |
| unit_price | CONFIRMED | = UnitCost |
| amount | CONFIRMED | = BuyPrice |
| vat | CONFIRMED | = BuyTax |
| total | CONFIRMED | = BuyTotal |
| imported_at | PROTECTED | 임포트 메타 |
| period_start_date · period_type | WEB_OWNED | Excel 임포트 기간 메타 |
| verified_by · verify_status · verify_note · verified_at · verified_expiring | PROTECTED | 사용자 검수 메타 |
| expiry_date | PROTECTED | 사용자 검수 시 입력 |

**신규 필요 DB 컬럼**: `bm_code (text)`, `row_num (int)` · `UNIQUE (bm_code, row_num)` → §11

### stock_history (24 cols)

전체 Excel 월별 임포트 운영. **Inventory_Status 를 stock_history 로 쓸지 미정** · 현재 매핑 **없음**. 사용자 결정 전 미기재. 모든 컬럼 (snapshot_date, product_code, opening_stock, purchase_qty, sale_qty, 등) 은 Inventory_Status 42-col 과 **상당 overlap** 하지만 공식 매핑 미정의.

### inventory_checks (19 cols)

**전체 PROTECTED** (사용자 지시 2026-10-03): 사용자 실사재고. ERP sync 대상 아님.

### vendors (26 cols)

**전체 PROTECTED**: 자체 운영 (ID/비밀번호 파생 포함). ERP CorpBizNo 를 받아도 vendors 는 overwrite 금지.

---

## 8. Unused ERP Columns (유용성 분류)

### Product_List

**유용 CANDIDATE** (현재 미매핑 but 매핑 가치):
- `TaxName` → products.col_i (과세/면세)
- `McateName` → products.category (약국/약국2/약국3/뷰티 분류)
- `RegDate` → products.registered_at (ERP 등록일시)
- `EditDate` → products.last_modified_at (ERP 수정일시)
- `EtcTxtField1` → products.search_keywords (uniq=3865 · 어떤 자유 텍스트인지 ERP 화면 확인 필요)

**중복** (다른 field 로 이미 제공):
- GoodsName (= ProductName)
- ScateName (= 공급사명 CorpNameView)
- CostPrice1 / ConfirmDate1 (과거 매입단가 · Inventory_Status 와 중복)

**내부 상수** (uniq=1 · ERP template default):
- StCode / BuseoCode / BuseoName / RegStorageName · LcateName (모두 "용인점"/"코스트팜약국" 단일)
- ProductTypeName · ProductGubunName · StockName · IsStock · IsStandingPoint · KeepingRuleName · MakeDayName · ExpiryDayName · UniPassName · IdentificationName · BuyStatusName · SaleStatusName · IsPopName · IsSalesStore · IsPriceLock
- Dev* 요일별 발주 7개
- EvCostUnit · EvSaleUnit · BottlePrice · PointAdd · ProductFee · Horizontal · Vertical · Height · Volume
- EtcIntField1~3
- DevDDay · LimitTime · IsDevDayType · IsOrderType · IsAutoCostUpdate · UnitStock · IsWeight · IsProductType · WeightName

**Unknown / 공란 전수**:
- WeightCode · WeightCostUnit · WeightPriceUnit · OptionViewTypeName · Damdang · DamdangName · DamdangSub · DamdangSubName · DcateName · Maker · Brand · Orgin (0/4007)
- EtcTxtField2~6 · GoodsSubName (47) · ProductName_pop (1) · Memo (77 · DANGER)
- PriceB · PriceC · PriceD (전수 0)

**Not-needed** (ERP 내부 메타):
- ROWNUM · PCode · UserID · UserName · EditUserID · EditUserName · PPCode

### Inventory_Status

**유용 CANDIDATE** (현재 미매핑 but future stock_history 연계 가능):
- `PrvStock` + 모든 이동량 → 기간 재고 재구성 (현재 Excel 임포트가 담당)
- `CostPrice1` + `ConfirmDate1` → 매입단가 변경 이력 (purchase_details 와 중복 가능)

**중복**: PCode · ProductName · IsTax · TaxPercent · UnitCode · StCode · StorageName · IsSaleStatusName · CtCode · CCorpName · LocationName · LcateName · McateName · ScateName · DcateName · CostPrice (Product_List 와 전부 중복)

**Unknown / 공란 전수**: DcateName · CostPrice2~4 · ConfirmDate2~3

**Not-needed**: PPCode · IsBuyerType (uniq=3 저가치) · SubdivisionMinus/Plus (분할 단위 재고 · 사용자 미사용)

### Buy_Status

**유용 CANDIDATE**:
- `BmCode` + `ROWNUM` → **DB 신규 컬럼** · unique key (CRITICAL)
- `ConfirmDate` → purchase_details.confirmed_at 가능 (신규)
- `Remark` → purchase_details.note / remark 가능 (신규)
- `UnitSale` → 매입 시점 판매단가 · 분석 용도 (저장 가치 애매)

**중복**: PCode (→BarCode 변환) · ProductName · Specification · UnitCode · CtCode · CorpNameView · Lcate · LcateName · McateName · ScateName · DcateName · CorpBizNo

**내부 상수**: CorpCode · StCode · StorageName · BuseoCode · BuseoName · IsStatus · IsStatusName · IsBiz

**Unknown / 공란**: ReturnCodeName · MakeDay · ExpiryDay (⚠ ERP 가 유통기한 미제공 확정) · Identification · DcateName · DamDang · DamDangName · ConfirmUserID/Name · UserID/Name · EditUserID/Name · IsSupport · Remark · ProductWeight · TaxExemption · TotalStock · TotalCnt · BuyMonth

---

## 9. Candidate Mappings (사용자 결정 필요)

| ERP Col | DB Target | 추천 | 블로커 |
|---|---|---|---|
| Product_List.CostPrice | products.purchase_price | **활성** 추천 (사용자 PATCH 거의 없음 · 4%) | 44 different · 사용자 조정값 손실 리스크 |
| Product_List.PriceA | products.sale_price | **보류** 추천 (사용자 PATCH 활발 · 82%) | 189 different · 사용자 조정값 손실 리스크 (더 큼) |
| Product_List.McateName | products.category | **활성** 추천 (ERP 가 더 세분화된 운영) | 기존 Excel category 와 매핑 재확인 필요 |
| Product_List.TaxName | products.col_i | **보류** (col_i 는 "과직" 코드 · 변환 규칙 필요) | 변환 로직 미정 |
| Product_List.RegDate | products.registered_at | **활성** 추천 (null overwrite 금지로 안전) | 없음 |
| Product_List.EditDate | products.last_modified_at | **보류** (sync 자체가 last_modified 트리거 가능 · 혼동) | 매번 ERP sync 가 덮으면 "ERP 최종수정일" 이 됨 → 의미 변경 |
| Product_List.EtcTxtField1 | products.search_keywords | **보류** (의미 미확인) | ERP 화면 확인 필요 |
| Buy_Status.BmCode | purchase_details.bm_code | **활성** 필수 (unique key) | **DB 컬럼 신규 생성 필요** (§11) |
| Buy_Status.ROWNUM | purchase_details.row_num | **활성** 필수 (unique key) | **DB 컬럼 신규 생성 필요** (§11) |
| Buy_Status.ConfirmDate | purchase_details.confirmed_at | 보류 | DB 컬럼 없음 · 신규 가능 |
| Buy_Status.Remark | purchase_details.remark | 보류 | DB 컬럼 없음 · 신규 가능 |

---

## 10. Protected / Web-Owned Fields

### products.PROTECTED (whitelist assertNoProtectedField 로 payload 침투 차단)

```
optimal_stock           — 사용자 입력 99.9%
optimal_stock_backup    — 자동 백업
memo                    — ⚠ ERP Memo (col[93]) 와 완전 분리 · 사용자 82%
hidden                  — soft-delete 토글
stock_note              — current_stock 파싱 실패 fallback
imported_at             — 임포트 메타
```

### products.WEB_OWNED (whitelist 밖 · ERP 가 애초에 매핑 시도 X)

```
delivery_price · delivery_profit_rate · delivery_margin_rate
app_registered · image_registered · preset_registered · preset_group
promotion_name · promotion_priority · promotion_purchase_price · promotion_sale_price
promotion_profit_rate · promotion_discount_rate
wholesale_price1 · supplier_type · management_group · unit_type · stock_amount
operator · min_order · point_rate · sales_commission
total_volume · unit_volume · unit_price · connection_type
individual_code · individual_quantity · expiry_date (products 테이블 0% 사용)
profit_rate (CALCULATED 가능성 · 사용자 확정 필요)
```

### purchase_details.PROTECTED

```
verified_by · verify_status · verify_note · verified_at · verified_expiring
expiry_date (사용자 검수 입력 · ERP ExpiryDay 전수 공란)
imported_at
```

### inventory_checks (전체 PROTECTED)

```
전체 19 cols (사용자 실사재고 운영 · ERP sync 대상 아님)
```

### vendors (전체 PROTECTED)

```
전체 26 cols (자체 운영 · ID/비밀번호 파생 포함)
```

---

## 11. DB Schema Gaps

### CRITICAL

**purchase_details 테이블**:
- `bm_code TEXT NOT NULL` 신규 필요
- `row_num INT NOT NULL` 신규 필요
- `UNIQUE (bm_code, row_num)` 제약 신규 필요

**이유**: 현재 `erpSyncWhitelist.ts::ERP_IDENTITY.purchaseKey = { bmCode: "BmCode", rowNum: "ROWNUM" }` 그리고 `erpBuyMapper.ts::buildBuyRowFromErp()` 가 payload 에 `bm_code`/`row_num` 포함시킴. **DB 에 컬럼 없으므로 upsert 시 Supabase 가 "could not find column" 에러**. Phase 2 WRITE 전 반드시 migration.

**현재 임시 대안 unique key**: `(purchase_date, supplier_code, product_code, quantity, amount)` → 같은 날 같은 상품 2건 매입이면 두 번째가 silently drop.

### HIGH

**신규 테이블 `sales` (가칭)** · Sale_Status 응답 저장용 (§13.7).

### MEDIUM

**purchase_details 선택적 신규 컬럼**:
- `confirmed_at TIMESTAMPTZ` ← Buy_Status.ConfirmDate (사용자 결정)
- `remark TEXT` ← Buy_Status.Remark (사용자 결정)

**products 선택적 신규 컬럼**: 현재 모두 존재 (registered_at · last_modified_at · category · brand · manufacturer 등 전부 live schema 에서 확인됨).

### LOW

**없음** · brand/manufacturer/origin 컬럼은 존재하지만 ERP 가 미제공 (NO_ERP_SOURCE) · DB 삭제 不 필요 (Excel 임포트 쪽에서 사용 가능).

---

## 12. Recommended Final Mapping (ready-to-code whitelist)

### Product_List → products (현재 whitelist 유지 + 신규 활성 추천)

**현재 활성 (CONFIRMED · 유지)**:
```typescript
product_name       ← ProductName       (nullOverwrite: false)
supplier           ← CorpNameView      (nullOverwrite: false)
supplier_code      ← CtCode            (nullOverwrite: false)
unit               ← UnitCode          (nullOverwrite: false)
sale_status        ← SaleStatusName    (nullOverwrite: false)
last_purchase_date ← LastBuyDate       (nullOverwrite: false · KST date)
last_sale_date     ← LastSaleDate      (nullOverwrite: false · KST date)
current_stock      ← NowStock          (nullOverwrite: true · ERP SSOT)
display_location   ← transform(LocationName)   (DERIVED · 벽/매대 규칙)
location           ← display_location  (동시 UPDATE)
```

**현재 활성이지만 ERP 가 미제공 (사실상 작동 안 함 · 삭제 추천)**:
```typescript
brand         ← Brand   (ERP 100% null · whitelist 제거 추천)
manufacturer  ← Maker   (ERP 100% null · whitelist 제거 추천)
```

**사용자 결정 후 활성 추천**:
```typescript
category      ← McateName    (nullOverwrite: false · 약국/약국2/약국3/뷰티)
purchase_price ← CostPrice    (nullOverwrite: false · 44 조정값 리스크)
sale_price    ← PriceA        (⚠ 보류 추천 · 189 조정값 리스크)
registered_at ← RegDate       (nullOverwrite: false · 안전)
```

### Buy_Status → purchase_details (DB migration 후 활성 가능)

**사용자 결정 + DB migration 후**:
```typescript
// DB migration 필요: ALTER TABLE purchase_details ADD COLUMN bm_code text, row_num int,
//                    ADD CONSTRAINT purchase_details_bm_rownum_unique UNIQUE (bm_code, row_num);
purchase_date  ← BuyDate
supplier_code  ← CtCode
supplier_name  ← CorpNameView
product_code   ← pcodeToBarcodeMap[PCode]
product_name   ← ProductName
spec           ← Specification
quantity       ← StockCnt
unit_price     ← UnitCost
amount         ← BuyPrice
vat            ← BuyTax
total          ← BuyTotal
bm_code        ← BmCode    (NEW)
row_num        ← ROWNUM    (NEW)
```

### Inventory_Status · 매핑 없음 (유지)

### Sale_Status · 매핑 없음 · §13.7 참조

---

## 13. Important Findings

### 13.1 Wrong Existing Mappings

**없음** · 현재 whitelist 는 전부 정확.

### 13.2 Missing Mappings (현재 whitelist 가 빠뜨린 것)

- **category** ← McateName (사용자 결정 보류 상태 · 코드 주석에 명시됨)
- **registered_at** ← RegDate (사용자 미논의)
- **last_modified_at** ← EditDate (사용자 미논의 · 매번 sync 가 덮으면 의미 변질 리스크)
- **search_keywords** ← EtcTxtField1 (ERP 화면 확인 필요)
- **TaxName** ← col_i (변환 규칙 필요)

### 13.3 Useful ERP Fields (현재 whitelist 밖 but 가치 있음)

| ERP Col | 가치 | 비고 |
|---|---|---|
| McateName | HIGH | category 매핑 · 사용자 결정만 하면 바로 활성 |
| RegDate | MEDIUM | registered_at · 등록일시 안정 |
| EditDate | LOW | 매번 sync 가 "ERP 최종수정" 으로 덮기 때문에 의미 변질 |
| EtcTxtField1 | UNKNOWN | 3865 unique · 어떤 자유 텍스트인지 모름 |
| ConfirmDate (Buy) | LOW | 매입 확정일시 · purchase_date 와 중복 가능 |
| Remark (Buy) | LOW | 비고 · 샘플 전부 공란 |
| BmCode (Buy) | **CRITICAL** | unique key · DB 신규 컬럼 필수 |
| ROWNUM (Buy) | **CRITICAL** | unique key · DB 신규 컬럼 필수 |

### 13.4 Dangerous Similar-Named Fields

| ERP Col | DB Col | 위험 | 현재 대응 |
|---|---|---|---|
| Product_List.Memo | products.memo | 완전 다른 field · ERP = 레거시 (77 non-empty) · DB = 사용자 주석 (5836 non-empty) | ✅ PROTECTED_PRODUCT_FIELDS 에 명시 · 매핑 금지 |
| Product_List.LocationName | products.location | ERP = 4-depth 계층 string · DB = zone code | ✅ transformErpLocation 변환 적용 중 |
| Product_List.SaleStatusName | products.hidden | hidden 과 혼용 금지 | ✅ sale_status 는 ERP_OWNED · hidden 은 PROTECTED |
| Buy_Status.ExpiryDay | purchase_details.expiry_date | ERP 가 전수 공란 → 자동 overwrite 하면 사용자 검수값 wipe | ✅ expiry_date PROTECTED |
| Inventory_Status.* 재고량 | products.current_stock | 42-col 공식으로 계산한 재고 ≠ Product_List.NowStock | ✅ 사용자 결정으로 Inventory_Status 비사용 확정 |
| Buy_Status.PCode vs purchase_details.product_code | ERP PCode (5자리 내부) ≠ DB product_code (바코드) | ✅ pcodeToBarcodeMap 로 변환 중 (unmapped 는 payload 제외) |
| Product_List.ScateName | products.category | ScateName 은 공급사명 (uniq=92 = CtCode 와 1:1) · category 매핑 금지 | ✅ 매핑 안 함 (주의 환기만) |

### 13.5 DB Schema Gaps

- **purchase_details.bm_code · row_num 컬럼 미존재** (CRITICAL · §11)
- **sales 테이블 전체 미존재** (Sale_Status 대비 · §13.7)
- 선택적: purchase_details.confirmed_at · remark

### 13.6 Mappings OK As-Is

- **Product_List → products** 활성 10개 field (product_name/supplier/supplier_code/unit/sale_status/last_purchase_date/last_sale_date/current_stock/display_location/location) 는 전부 CONFIRMED. 유지.
- **Buy_Status → purchase_details** 활성 11개 field (purchase_date 등) 는 전부 CONFIRMED. **단 bm_code · row_num 은 DB 컬럼 생성 전까지 작동 안 함**.
- **PROTECTED 체크 로직** (`assertNoProtectedField`) · 올바름.
- **nullOverwrite 정책** · current_stock 만 true · 올바름.
- **transformErpLocation 변환** · 벽/매대 규칙 올바름 · 뷰티/냉장고 REVIEW 처리 올바름.

### 13.7 Sale API · New DB Structure Needed?

**YES · 완전 신규 설계 필요.**

Sale_Status 는 ·
- SOAP 호출 함수 **없음** (`iregenSoap.ts` 에 queryXxx 함수 X)
- 응답 샘플 **없음** (envelope 캡쳐만)
- DB 수신 테이블 **없음** (sales/sale_history/pos_sales 전부 미존재)

제안 설계 (사용자 결정 전 proposal only):

**Option A · 거래 단위 테이블** (Buy_Status 와 대칭):
```sql
CREATE TABLE sales (
  id BIGSERIAL PRIMARY KEY,
  sale_date DATE NOT NULL,
  sale_doc_id TEXT,          -- 매출 문서 ID (BmCode 대응)
  row_num INT,               -- 라인 번호
  product_code TEXT,
  product_name TEXT,
  quantity NUMERIC,
  unit_price NUMERIC,
  unit_cost NUMERIC,         -- 매출 시점 매입단가 (UnitCost)
  unit_sale NUMERIC,         -- 매출 시점 판매단가 (UnitSale)
  sale_amount NUMERIC,       -- 공급가 (SalePrice)
  sale_tax NUMERIC,
  sale_total NUMERIC,
  margin NUMERIC,
  supplier_code TEXT,
  supplier_name TEXT,
  imported_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (sale_doc_id, row_num)
);
```

**Option B · 일별 집계** (stock_history 와 유사):
```sql
CREATE TABLE sales_daily (
  id BIGSERIAL PRIMARY KEY,
  sale_date DATE NOT NULL,
  product_code TEXT NOT NULL,
  sale_qty NUMERIC,
  sale_total NUMERIC,
  margin NUMERIC,
  cogs NUMERIC,              -- 매출원가 (판매원가 공식용)
  UNIQUE (sale_date, product_code)
);
```

→ **사용자 결정 전까지는 Sale_Status 통합 보류 추천**. SOAP 응답 1회 수집 후 column 구조 확정 → DB migration 설계 → 그 다음 통합.

---

## Appendix A · 사용된 Snapshot 상세

- Product_List: `data/snapshots/product-list-2026-10-03.json` · 4,007 rows · 102 cols · 수집일 2026-10-03 저녁 (concurrency=1 · 232.6s)
- Buy_Status: `data/snapshots/buy-status-2026-10-03.json` · 5 rows · 51 cols · BmCode=12261003000009 (사용자 ERP 화면 완전 일치 검증)
- Inventory_Status: `erp-cache/inventory-status/candidate.json.gz` · 4,007 rows · 42 cols · 2026-10-04 00:50 KST
- Buy_Status 2026-10-04: `erp-cache/buy-status/candidate.json.gz` · 0 rows · 당일 매입 없음 (10-03 snapshot 로 분석)
- Product_List 2026-10-04: `erp-cache/product-list/` 비어있음 (10-03 snapshot 로 분석)

## Appendix B · 안전 체크

- [x] Supabase INSERT / UPDATE / DELETE: 없음
- [x] Supabase 테이블/컬럼 추가: 없음
- [x] Migration 실행: 없음
- [x] 소스 코드 수정: 없음 (whitelist/mapper 그대로)
- [x] Snapshot 변경: 없음
- [x] ERP SOAP 호출: 없음 (기존 snapshot 재분석만)
- [x] 리모트 푸시: 없음
