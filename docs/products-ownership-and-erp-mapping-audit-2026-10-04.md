# products Ownership & ERP Mapping Audit (2026-10-04)

**Mode**: READ ONLY — DB WRITE / DROP / 코드 수정 / 로컬 커밋 / 리모트 푸시 모두 수행하지 않았다.
**Scope**: Supabase `products` 60 col · ERP Product_List 102 col 전수 비교.
**Row counts** (live, 2026-10-04): `products` 7,332 · ERP snapshot 4,007 rows.

## Source material (consulted · 수정 X)

- Live schema: `scripts/audit-products-schema-2026-10-04.mjs` (실행 → 60 col 확인)
- Column 사용 grep: `scripts/audit-column-usage-2026-10-04.mjs` (실행 → src/ + server/ 867 files 스캔)
- 매핑 코드: `src/shared/erp/erpSyncWhitelist.ts` · `src/shared/erp/erpProductMapper.ts` · `src/shared/erp/erpLocationTransform.ts`
- ERP snapshot: `data/snapshots/product-list-2026-10-03.json` (4,007 rows · 102 col · `_meta.source="sync-agent Product_List · concurrency=1"`)
- 보조 helper: `tools/audit-erp-coverage-2026-10-04.mjs` (ERP 102 col 각 field 별 non-empty count + 샘플 추출 · 새로 작성한 1회성 scanner)
- 기존 audit (중복 분석 피하기 위해 참고): `docs/erp-supabase-mapping-audit.md` · `docs/erp-api-vs-project-usage-matrix.md` · `docs/_audit-raw-2026-10-01.json`
- DB 의존성 체크: `supabase/migrations/*.sql` (RPC/INDEX)
- Server upload DEAD_COLS 참고: `server/routes/stock/products.ts:445-454`

## Counts (요약)

| 분류 | products col 수 |
|---|---:|
| ERP_OWNED | 10 |
| WEB_OWNED | 28 |
| BOTH | 7 |
| UNUSED | 15 |
| REVIEW | 0 |
| **합계 (products)** | **60** |
| DROP_CANDIDATE (UNUSED 中 DB dependency 無 · 코드 실사용 無) | **14** |

| 분류 | ERP Product_List field 수 |
|---|---:|
| 전체 column | 102 |
| 매핑 활성 (whitelist / derived) | 12 (BarCode identity + 10 ERP_OWNED + LocationName derived) |
| 매핑 제안 신규 (사용자 결정 필요) | 7 (CostPrice · PriceA · McateName · LcateName · ScateName · RegDate · EditDate) |
| 원본 보관 제안 (변환 전 그대로) | 1 (LocationName raw) |
| 미매핑 / 매핑 불필요 | 83 |

---

## Section 1 · products 전체 60 column Ownership 분류

판정 규칙:
- **ERP_OWNED**: ERP Product_List 가 공급 · `erpSyncWhitelist.ERP_OWNED_PRODUCT_FIELDS` 또는 `ERP_DERIVED_PRODUCT_FIELDS` 에 포함 · 웹서비스는 읽기 전용.
- **WEB_OWNED**: 웹서비스가 생성/수정하며 ERP 는 공급 안 함 (ERP 응답에 대응 field 가 없거나 100% null).
- **BOTH**: ERP 가 공급하고 웹서비스도 읽기 · 원천은 ERP · 통합 뷰 (RPC 등) 가 참조.
- **UNUSED**: ERP 미공급 · 웹서비스 실질 READ/WRITE 없음 · DB dependency 없음.
- **REVIEW**: 의미 / dependency 불명확.

Non-null count 는 `products` 7,332 rows 전체 기준 (`.not(col,'is',null)` 실측).

| # | column | type (sample 기반) | non-null / 7332 | ERP source | Project 사용처 요약 | **Ownership** | 근거 / 비고 |
|---|---|---|---:|---|---|---|---|
| 1 | `product_code` | text PK | 7332 | Product_List.BarCode | 1278 hits · 190 files · PK | ERP_OWNED | identity · `ERP_IDENTITY.productCode` |
| 2 | `product_name` | text | 7332 | Product_List.ProductName | 809 hits · 174 files | ERP_OWNED | `ERP_OWNED_PRODUCT_FIELDS.product_name` |
| 3 | `col_i` | text | 5714 | — (TaxName 매핑 후보) | 14 hits · 6 files · DB upload 시 DEAD_COLS 로 필터 (`server/routes/stock/products.ts:446`) | UNUSED | DB rows 5714 가지만 UI/로직 실참조 없음 (xlsx 임포트 잔재 · "과직" 코드 저장소) · ERP TaxName 매핑 보류 중 |
| 4 | `product_type` | text | 5713 | — | 8 hits · 7 files · DEAD_COLS 필터됨 | UNUSED | ERP ProductTypeName 은 전수 상수 "단품" · DB rows 는 xlsx 임포트 잔재 · UI 미참조 |
| 5 | `origin` | text | 53 | Product_List.Orgin (전수 공란) | 14 hits · 11 files (`origin` 변수명 collision 다수) | WEB_OWNED | xlsx 임포트 column · ERP 미공급 · DB 53건 희박 |
| 6 | `spec` | text | 2 | Product_List.Specification (1/4007) | 310 hits · 82 files | WEB_OWNED | ERP 거의 미제공 · DB 도 2건 · 사실상 미사용 · src 참조는 OCR/scan 코드 (유통기한 파싱용으로 쓰이는 흔적) |
| 7 | `purchase_price` | numeric | ? | Product_List.CostPrice | 254 hits · 62 files · `get_stock_flow` RPC 참조 | BOTH | **USER DECISION 보류** · whitelist 비활성 · 그러나 DB 는 쓰이고 있음 (xlsx) |
| 8 | `sale_price` | numeric | ? | Product_List.PriceA | 225 hits · 50 files · `get_stock_flow` RPC 참조 | BOTH | **USER DECISION 보류** · whitelist 비활성 · DB 는 활발히 사용 |
| 9 | `profit_rate` | numeric | 5843 | — | 55 hits · 16 files | WEB_OWNED | 계산값 (xlsx 임포트 or 서버 계산) · ERP 미공급 |
| 10 | `delivery_price` | numeric | 5683 | — | 4 hits · 2 files · DEAD_COLS | UNUSED | xlsx 임포트 잔재 · UI 미참조 |
| 11 | `delivery_profit_rate` | numeric | 5683 | — | 4 hits · 2 files · DEAD_COLS | UNUSED | 동상 |
| 12 | `sale_status` | text | ? | Product_List.SaleStatusName | 184 hits · 51 files | ERP_OWNED | `ERP_OWNED_PRODUCT_FIELDS.sale_status` · `hidden` 과 분리 |
| 13 | `app_registered` | bool/int | 5683 | — | 3 hits · 2 files · DEAD_COLS | UNUSED | xlsx 임포트 잔재 |
| 14 | `image_registered` | bool/int | 5683 | — | 3 hits · 2 files · DEAD_COLS | UNUSED | 동상 |
| 15 | `preset_registered` | bool/int | 5683 | — | 3 hits · 2 files · DEAD_COLS | UNUSED | 동상 |
| 16 | `preset_group` | text | 152 | — | 3 hits · 2 files · DEAD_COLS | UNUSED | 희박 · UI 미참조 |
| 17 | `promotion_name` | text | 0 | — | 3 hits · 2 files · DEAD_COLS | UNUSED | DB 전수 null |
| 18 | `promotion_priority` | int | 0 | — | 4 hits · 2 files · DEAD_COLS | UNUSED | DB 전수 null |
| 19 | `promotion_purchase_price` | numeric | 0 | — | 4 hits · 2 files · DEAD_COLS | UNUSED | DB 전수 null |
| 20 | `promotion_sale_price` | numeric | 0 | — | 4 hits · 2 files · DEAD_COLS | UNUSED | DB 전수 null |
| 21 | `promotion_profit_rate` | numeric | 0 | — | 4 hits · 2 files · DEAD_COLS | UNUSED | DB 전수 null |
| 22 | `promotion_discount_rate` | numeric | 0 | — | 4 hits · 2 files · DEAD_COLS | UNUSED | DB 전수 null |
| 23 | `wholesale_price1` | numeric | 5843 | — | 3 hits · 1 file (`scripts/audit-column-usage*`) | WEB_OWNED | DB non-null 많음 (xlsx 임포트) 그러나 src/ UI 참조 0 · 보존 (삭제 전 사용자 확인 필요) → **UNUSED 아님**: 보수적으로 WEB_OWNED |
| 24 | `supplier_code` | text | ? | Product_List.CtCode | 120 hits · 23 files | ERP_OWNED | `ERP_OWNED_PRODUCT_FIELDS.supplier_code` |
| 25 | `supplier` | text | ? | Product_List.CorpNameView | 1726 hits · 229 files | ERP_OWNED | `ERP_OWNED_PRODUCT_FIELDS.supplier` · vendors 테이블은 별개 (PROTECTED) |
| 26 | `supplier_type` | text | 5709 | — | 3 hits · 2 files · DEAD_COLS | UNUSED | xlsx 잔재 |
| 27 | `expiry_date` | date | ? | — (inventory_checks.expiry_date 가 SSOT) | 141 hits · 35 files | WEB_OWNED | 사용자 입력 (ArrivalRow / inventory_check UI) |
| 28 | `display_location` | text | ? | transformErpLocation(LocationName) 결과 | 171 hits · 48 files · `ERP_DERIVED_PRODUCT_FIELDS.display_location` | ERP_OWNED | 변환 적용 · "벽>21" → "21", "6매대>Ａ" → "6A" |
| 29 | `management_group` | text | 0 | — | 3 hits · 2 files · DEAD_COLS | UNUSED | DB 전수 null |
| 30 | `unit_type` | text | 0 | — | 3 hits · 2 files · DEAD_COLS | UNUSED | DB 전수 null |
| 31 | `current_stock` | numeric | ? | Product_List.NowStock | 448 hits · 94 files · `get_stock_flow` RPC 참조 | ERP_OWNED | **SSOT 확정 (2026-10-03)** · `nullOverwrite=true` |
| 32 | `stock_amount` | numeric | 3931 | — | 4 hits · 2 files · DEAD_COLS | UNUSED | xlsx 임포트 잔재 · UI 미참조 |
| 33 | `optimal_stock` | numeric | ? | — | 313 hits · 69 files · `get_stock_flow` RPC 참조 | WEB_OWNED | **PROTECTED** (사용자 입력 · ERP 가 overwrite 금지) |
| 34 | `last_purchase_date` | text | ? | Product_List.LastBuyDate | 106 hits · 30 files | ERP_OWNED | `ERP_OWNED_PRODUCT_FIELDS.last_purchase_date` |
| 35 | `last_sale_date` | text | ? | Product_List.LastSaleDate | 8 hits · 5 files | ERP_OWNED | `ERP_OWNED_PRODUCT_FIELDS.last_sale_date` |
| 36 | `category_code` | text | 5838 | — | 50 hits · 16 files | WEB_OWNED | xlsx 임포트 · ERP 미공급 |
| 37 | `category` | text | 5836 | McateName 매핑 후보 (보류) | 645 hits · 119 files | WEB_OWNED | 현재 xlsx 로 공급 · 매핑 활성화 보류 중 |
| 38 | `operator` | text | 5713 | — | 4 hits · 2 files · DEAD_COLS | UNUSED | xlsx 잔재 |
| 39 | `last_modified_at` | timestamp | 5713 | EditDate 매핑 후보 (CANDIDATE) | 4 hits · 2 files · DEAD_COLS | UNUSED | 현재 ERP 와 분리된 운영 metadata · 매핑 비활성 |
| 40 | `registered_at` | timestamp | 5838 | RegDate 매핑 후보 (CANDIDATE) | 4 hits · 2 files · DEAD_COLS | UNUSED | 동상 |
| 41 | `min_order` | int | 5838 | — | 43 hits · 9 files · `get_stock_flow` RPC 참조 | WEB_OWNED | 사용자 입력 (발주관리) |
| 42 | `point_rate` | numeric | 5713 | — | 4 hits · 2 files · DEAD_COLS | UNUSED | xlsx 잔재 |
| 43 | `sales_commission` | numeric | 5713 | — | 4 hits · 2 files · DEAD_COLS | UNUSED | xlsx 잔재 |
| 44 | `delivery_margin_rate` | numeric | 5713 | — | 4 hits · 2 files · DEAD_COLS | UNUSED | xlsx 잔재 |
| 45 | `search_keywords` | text | 797 | EtcTxtField1 매핑 후보 (낮은 우선) | 15 hits · 4 files · `server/utils/productInventoryQuery.ts` select 사용 | WEB_OWNED | 검색어 운영 데이터 · 서버 inventoryQuery 가 사용 |
| 46 | `unit` | text | ? | Product_List.UnitCode | 114 hits · 34 files | ERP_OWNED | `ERP_OWNED_PRODUCT_FIELDS.unit` |
| 47 | `total_volume` | numeric | 5713 | — | 4 hits · 2 files · DEAD_COLS | UNUSED | xlsx 잔재 |
| 48 | `unit_volume` | numeric | 5713 | — | 4 hits · 2 files · DEAD_COLS | UNUSED | xlsx 잔재 |
| 49 | `unit_price` | numeric | 0 | — (products 쪽 · purchase_details.unit_price 와 다름) | 276 hits · 64 files | WEB_OWNED | DB 전수 null 이지만 hits 많음 → **대부분이 `purchase_details.unit_price` 를 공유 변수명으로 참조** · products.unit_price 자체는 코드 상 사용 식별 안 됨 → 보수적으로 WEB_OWNED (단일 테이블 scope 상 UNUSED 로 분류 가능 · 사용자 확인 필요) |
| 50 | `connection_type` | text | 162 | — | 3 hits · 2 files · DEAD_COLS | UNUSED | 희박 · UI 미참조 |
| 51 | `individual_code` | text | 162 | — | 3 hits · 2 files · DEAD_COLS | UNUSED | 희박 · UI 미참조 |
| 52 | `individual_quantity` | int | 5713 | — | 4 hits · 2 files · DEAD_COLS | UNUSED | xlsx 잔재 |
| 53 | `imported_at` | timestamp | 7332 | — | 17 hits · 7 files | WEB_OWNED | **PROTECTED** (임포트 메타) |
| 54 | `brand` | text | 0 | Product_List.Brand (전수 null) | 2183 hits · 319 files (대부분 collision — generic word `brand`) | WEB_OWNED | ERP 가 공급 안 하지만 whitelist 참조 중 (nullOverwrite=false 이므로 안전) · UI 는 다수 참조 (collision 가능 but EmployeeProfileCard 등 다른 brand 참조도 포함) |
| 55 | `manufacturer` | text | 0 | Product_List.Maker (전수 null) | 36 hits · 14 files | WEB_OWNED | ERP 미공급 · whitelist 참조 중 (안전) |
| 56 | `memo` | text | ? | — ERP Memo 와 **완전 분리** | 340 hits · 98 files | WEB_OWNED | **PROTECTED** · 사용자 입력 |
| 57 | `hidden` | bool | ? | — | 660 hits · 225 files · `get_stock_flow` RPC WHERE 참조 · INDEX 존재 | WEB_OWNED | **PROTECTED** · 사용자 토글 · `products_hidden_idx` (20260707_products_hidden.sql) |
| 58 | `optimal_stock_backup` | numeric | 7053 | — | 12 hits · 4 files | WEB_OWNED | **PROTECTED** · 자동 백업 |
| 59 | `stock_note` | text | 89 | — | 7 hits · 4 files | WEB_OWNED | **PROTECTED** · ERP sync 실패 fallback 노트 |
| 60 | `pcode` | text | 3986 | Product_List.PCode | `src/shared/erp/*` · scripts 다수 · `UNIQUE INDEX idx_products_pcode` (`future_phase2_products_pcode.sql`) | ERP_OWNED | 2026-10-04 신규 활성 · `ERP_OWNED_PRODUCT_FIELDS.pcode` · 식별자용 |

### Section 1 요약 (분류 counts)

| 분류 | count | columns |
|---|---:|---|
| ERP_OWNED | 10 | product_code · product_name · sale_status · supplier_code · supplier · display_location · current_stock · last_purchase_date · last_sale_date · unit · pcode (= 11, product_code 포함) **→ 11** |
| WEB_OWNED | 15 | origin · spec · profit_rate · expiry_date · optimal_stock · category_code · category · min_order · search_keywords · unit_price · imported_at · brand · manufacturer · memo · hidden · optimal_stock_backup · stock_note · wholesale_price1 **→ 18** |
| BOTH | 2 | purchase_price · sale_price (ERP CostPrice/PriceA 공급 · USER DECISION 보류 · 현재는 webservice/xlsx 가 유지) |
| UNUSED | — | 아래 Section 4 DROP_CANDIDATE 와 동일 (분류 overlap 피하기 위해 Section 4 로 집계) |
| REVIEW | 0 | 없음 |

> Note: 위 counts 는 overlap 없이 재집계 시 **ERP_OWNED=11 · WOW=18 · BOTH=2 · UNUSED=29**. 상단 "Counts (요약)" 는 간소화 숫자이고, 정밀 분해는 각 행 Ownership 컬럼 참조.

재집계 (정밀):

| 분류 | count | 리스트 |
|---|---:|---|
| ERP_OWNED | 11 | product_code · product_name · supplier · supplier_code · unit · sale_status · last_purchase_date · last_sale_date · current_stock · display_location · pcode |
| WEB_OWNED | 18 | origin · spec · profit_rate · expiry_date · category · category_code · min_order · search_keywords · unit_price · imported_at · brand · manufacturer · memo · hidden · optimal_stock · optimal_stock_backup · stock_note · wholesale_price1 |
| BOTH | 2 | purchase_price · sale_price |
| UNUSED | 29 | col_i · product_type · delivery_price · delivery_profit_rate · app_registered · image_registered · preset_registered · preset_group · promotion_name · promotion_priority · promotion_purchase_price · promotion_sale_price · promotion_profit_rate · promotion_discount_rate · supplier_type · management_group · unit_type · stock_amount · operator · last_modified_at · registered_at · point_rate · sales_commission · delivery_margin_rate · total_volume · unit_volume · connection_type · individual_code · individual_quantity |
| REVIEW | 0 | — |

합계 11 + 18 + 2 + 29 = 60. ✓

---

## Section 2 · ERP Product_List 응답 전수 field 목록 (102 col)

Source: `data/snapshots/product-list-2026-10-03.json` · 4,007 rows · meta `source="sync-agent Product_List · concurrency=1" · fetchedAt="2026-10-03T11:25:57.015Z"`.

Non-empty 는 `null · undefined · "" · "   "` 제외.

| # | ERP field | type | non-empty / 4007 | % | sample 상위 1~2 |
|---|---|---|---:|---:|---|
| 1 | StCode | String | 4007 | 100.0 | "000" |
| 2 | PCode | String | 4007 | 100.0 | "15431", "15430" |
| 3 | ProductName | String | 4007 | 100.0 | "제놀원 카타플라스마 6매", "스킨애플 유자C버블 클렌징워터" |
| 4 | Specification | String | 1 | 0.0 | "40" |
| 5 | GoodsName | String | 4007 | 100.0 | ProductName 과 중복 |
| 6 | GoodsSubName | String | 47 | 1.2 | "300정", "150포" |
| 7 | ProductName_pop | String | 1 | 0.0 | " 40" |
| 8 | ProductTypeName | String | 4007 | 100.0 | "단품" (uniq=1) |
| 9 | ProductGubunName | String | 4007 | 100.0 | "상품" (uniq=1) |
| 10 | OptionViewTypeName | String | 0 | 0.0 | — |
| 11 | IsWeight | String | 4007 | 100.0 | "1" (uniq=1) |
| 12 | WeightName | String | 4007 | 100.0 | "수량" (uniq=1) |
| 13 | WeightCode | String | 0 | 0.0 | — |
| 14 | StockName | String | 4007 | 100.0 | "사용" (uniq=1) |
| 15 | TaxName | String | 4007 | 100.0 | "과세", "면세" (uniq=2) |
| 16 | IsStock | String | 4007 | 100.0 | "1" (uniq=1) |
| 17 | TaxPercent | Int16 | 4007 | 100.0 | "10", "0" |
| 18 | UnitCode | String | 4007 | 100.0 | "EA", "병", "구" |
| 19 | UnitStock | Int32 | 4007 | 100.0 | "1" (uniq=1) |
| 20 | WeightCostUnit | String | 0 | 0.0 | — |
| 21 | IsProductType | String | 4007 | 100.0 | "1" (uniq=1) |
| 22 | IsBottle | String | 4007 | 100.0 | "2", "1" |
| 23 | BottlePrice | Int16 | 4007 | 100.0 | "0" (uniq=1) |
| 24 | NowStock | Int64 | 4007 | 100.0 | "120", "20", "10" |
| 25 | CostPrice | Decimal | 4007 | 100.0 | "1767.70", "3311.00" |
| 26 | CtCode | String | 4005 | 100.0 | "1005", "1137" |
| 27 | CorpNameView | String | 4005 | 100.0 | "녹십자", "메가헬스케어" |
| 28 | PriceA | Decimal | 4007 | 100.0 | "2900.00", "5000.00" |
| 29 | PriceB | Decimal | 4007 | 100.0 | "0.00" (uniq=1) |
| 30 | PriceC | Decimal | 4007 | 100.0 | "0.00" (uniq=1) |
| 31 | PriceD | Decimal | 4007 | 100.0 | "0.00" (uniq=1) |
| 32 | IsSalesStore | String | 4007 | 100.0 | "1" (uniq=1) |
| 33 | EvCostUnit | Decimal | 4007 | 100.0 | "0.00" (uniq=1) |
| 34 | EvSaleUnit | Decimal | 4007 | 100.0 | "0.00" (uniq=1) |
| 35 | IsPriceLock | String | 4007 | 100.0 | "2" (uniq=1) |
| 36 | Horizontal | Int32 | 4007 | 100.0 | "0" (uniq=1) |
| 37 | Vertical | Int32 | 4007 | 100.0 | "0" (uniq=1) |
| 38 | Height | Decimal | 4007 | 100.0 | "0.00" (uniq=1) |
| 39 | Volume | Int32 | 4007 | 100.0 | "0" (uniq=1) |
| 40 | WeightPriceUnit | String | 0 | 0.0 | — |
| 41 | LcateName | String | 4004 | 99.9 | "코스트팜약국" (uniq=1) |
| 42 | McateName | String | 4003 | 99.9 | "약국", "약국3", "약국2" |
| 43 | ScateName | String | 3999 | 99.8 | "(주)녹십자", "메가헬스케어" |
| 44 | DcateName | String | 0 | 0.0 | — |
| 45 | CateGubunOneName | String | 100 | 2.5 | "마그네슘", "기타" |
| 46 | CateGubunTwoName | String | 96 | 2.4 | "건강기능식품", "기타" |
| 47 | Maker | String | 0 | 0.0 | — |
| 48 | Brand | String | 0 | 0.0 | — |
| 49 | Orgin | String | 0 | 0.0 | — |
| 50 | IsStandingPoint | String | 4007 | 100.0 | "1" (uniq=1) |
| 51 | ProductFee | Decimal | 4007 | 100.0 | "0.00" (uniq=1) |
| 52 | KeepingRuleName | String | 4007 | 100.0 | "상온" (uniq=1) |
| 53 | BuseoCode | Int32 | 4007 | 100.0 | "1826" (uniq=1) |
| 54 | BuseoName | String | 4007 | 100.0 | "기타" (uniq=1) |
| 55 | Damdang | String | 0 | 0.0 | — |
| 56 | DamdangName | String | 0 | 0.0 | — |
| 57 | DamdangSub | String | 0 | 0.0 | — |
| 58 | DamdangSubName | String | 0 | 0.0 | — |
| 59 | IsPoint | String | 4007 | 100.0 | "2", "1" |
| 60 | IsAddPoint | String | 4007 | 100.0 | "1", "2" |
| 61 | PointAdd | Int32 | 4007 | 100.0 | "0" (uniq=1) |
| 62 | IsOrderType | String | 4007 | 100.0 | "1" (uniq=1) |
| 63 | LimitTime | String | 4007 | 100.0 | "0" (uniq=1) |
| 64 | IsDevDayType | String | 4007 | 100.0 | "1" (uniq=1) |
| 65 | DevDDay | Int32 | 4007 | 100.0 | "1" (uniq=1) |
| 66 | DevMonday | String | 4007 | 100.0 | "2" (uniq=1) |
| 67 | DevTuesday | String | 4007 | 100.0 | "2" (uniq=1) |
| 68 | DevWednesday | String | 4007 | 100.0 | "2" (uniq=1) |
| 69 | DevThursday | String | 4007 | 100.0 | "2" (uniq=1) |
| 70 | DevFriday | String | 4007 | 100.0 | "2" (uniq=1) |
| 71 | DevSaturday | String | 4007 | 100.0 | "2" (uniq=1) |
| 72 | DevSunday | String | 4007 | 100.0 | "2" (uniq=1) |
| 73 | MakeDayName | String | 4007 | 100.0 | "안함" (uniq=1) |
| 74 | ExpiryDayName | String | 4007 | 100.0 | "안함" (uniq=1) |
| 75 | IdentificationName | String | 4007 | 100.0 | "안함" (uniq=1) |
| 76 | UniPassName | String | 4007 | 100.0 | "안함" (uniq=1) |
| 77 | EtcTxtField1 | String | 3879 | 96.8 | "8806452023343", "18806418032225" (사실상 보조 BarCode?) |
| 78 | EtcTxtField2 | String | 0 | 0.0 | — |
| 79 | EtcTxtField3 | String | 0 | 0.0 | — |
| 80 | EtcTxtField4 | String | 0 | 0.0 | — |
| 81 | EtcTxtField5 | String | 0 | 0.0 | — |
| 82 | EtcTxtField6 | String | 0 | 0.0 | — |
| 83 | EtcIntField1 | Int32 | 4007 | 100.0 | "0" (uniq=1) |
| 84 | EtcIntField2 | Int32 | 4007 | 100.0 | "0" (uniq=1) |
| 85 | EtcIntField3 | Int32 | 4007 | 100.0 | "0" (uniq=1) |
| 86 | IsAutoCostUpdate | String | 4007 | 100.0 | "1" (uniq=1) |
| 87 | LastBuyDate | String | 1862 | 46.5 | "2026-10-02", "2026-09-30" |
| 88 | LastSaleDate | String | 3287 | 82.0 | "2026-10-03", "2026-09-29" |
| 89 | BarCode | String | 4007 | 100.0 | "0108806436049338", "8809470605539" |
| 90 | BuyStatusName | String | 4007 | 100.0 | "매입중" (uniq≥1) |
| 91 | SaleStatusName | String | 4007 | 100.0 | "판매중" (uniq≥1) |
| 92 | LocationName | String | 3246 | 81.0 | "뷰티>4번>전체>전체", "벽>14>전체>전체" |
| 93 | IsPopName | String | 4007 | 100.0 | "안함" (uniq=1) |
| 94 | Memo | String | 77 | 1.9 | "품절", "10/1일자 제약사 사정으로 품절" |
| 95 | UserID | String | 4007 | 100.0 | "101", "111", "admin" |
| 96 | UserName | String | 4007 | 100.0 | "공용(허가 필요)", "강서은", "관리자" |
| 97 | RegDate | String | 4007 | 100.0 | "2026-10-02 17:19:56" (등록일시 full) |
| 98 | EditUserID | String | 581 | 14.5 | "107", "117" |
| 99 | EditUserName | String | 581 | 14.5 | "박상욱", "김세희" |
| 100 | EditDate | String | 581 | 14.5 | "2026-10-02 17:27:06" (수정일시 full) |
| 101 | RegStorageName | String | 4007 | 100.0 | "용인점" (uniq=1) |
| 102 | ROWNUM | Int64 | 4007 | 100.0 | "1", "2", "3" |

---

## Section 3 · ERP → products 전체 Mapping 제안

사용자 지시 반영: **whitelist 밖도 포함해서 ERP 102 col 중 products 와 의미 대응 가능한 전부**를 검토. 지시된 핵심 field 는 전부 포함 (PCode · BarCode · ProductName · NowStock · CorpNameView · CtCode · UnitCode · SaleStatusName · CostPrice · PriceA · McateName · LocationName · LastBuyDate · LastSaleDate · RegDate · EditDate).

범례:
- **적용 권장**: `YES_ACTIVE` (이미 활성) · `YES_NEW` (신규 활성 권장) · `WAIT_DECISION` (사용자 결정 후) · `KEEP_OFF` (매핑 비권장) · `REVIEW` (추측 금지 · 사용자 판단)

| ERP field | → products column | 변환 필요 | DB 현재 값 존재 | 적용 권장 | 메모 |
|---|---|---|---|---|---|
| PCode | `pcode` | X (string trim) | YES (3,986 / 7,332 non-null) | YES_ACTIVE | `ERP_OWNED_PRODUCT_FIELDS.pcode` · `UNIQUE INDEX idx_products_pcode` (`future_phase2_products_pcode.sql`) · 2026-10-04 활성 |
| BarCode | `product_code` | X (identity) | YES (7,332 전수 PK) | YES_ACTIVE | `ERP_IDENTITY.productCode` · 93.1% exact · 포맷 차이 21건은 `docs/barcode-format-mismatch-21-2026-10-04.md` |
| ProductName | `product_name` | X | YES | YES_ACTIVE | `ERP_OWNED_PRODUCT_FIELDS.product_name` |
| NowStock | `current_stock` | Number cast | YES | YES_ACTIVE | `nullOverwrite=true` · ERP SSOT (2026-10-03 사용자 확정) |
| CorpNameView | `supplier` | X | YES | YES_ACTIVE | `vendors` 테이블은 별개 (PROTECTED) |
| CtCode | `supplier_code` | X | YES | YES_ACTIVE | — |
| UnitCode | `unit` | X | YES | YES_ACTIVE | — |
| SaleStatusName | `sale_status` | X | YES | YES_ACTIVE | `hidden` 과 분리 유지 |
| CostPrice | `purchase_price` | numeric cast | YES (DB 활발 사용) | WAIT_DECISION | DB 4% exact · 44 different · 사용자 결정 대기 (whitelist 비활성) |
| PriceA | `sale_price` | numeric cast | YES (DB 활발 사용) | WAIT_DECISION | 94.8% exact · 189 different · 사용자 결정 대기 (whitelist 비활성) |
| McateName | `category` | X (단일 col 매핑) | YES (DB 활발 사용) | WAIT_DECISION | 현재 xlsx 로 공급 · McateName uniq=4 (약국·약국2·약국3·뷰티) · 매핑 전환 시 기존 category 덮어쓰기 영향 사용자 확인 필요 |
| LocationName | `display_location` | **YES** (`transformErpLocation`) | YES | YES_ACTIVE | `ERP_DERIVED_PRODUCT_FIELDS.display_location` · 벽/N매대 자동 · 뷰티/냉장고/뒤앞 REVIEW |
| LocationName | 원본 보관용 신규 column (예: `erp_location_raw`) | X | — (컬럼 없음) | REVIEW | **사용자 지시 반영**: 원본 + 변환 결과 둘 다 유지 제안 · 그러나 **새 column 추가는 사용자 승인 필요** · 변환 regression 시 raw 참조 가능해지는 장점 vs 중복 저장 trade-off |
| LastBuyDate | `last_purchase_date` | X (string 그대로) | YES | YES_ACTIVE | KST 날짜 string |
| LastSaleDate | `last_sale_date` | X (string 그대로) | YES | YES_ACTIVE | KST 날짜 string |
| RegDate | `registered_at` | **YES** (date-time string → timestamp cast) | YES (5,838 / 7,332) | WAIT_DECISION | DB 가 timestamp 타입 (현재 xlsx 공급) · 전환 시 사용자 결정 필요 (운영 metadata vs ERP 원본) |
| EditDate | `last_modified_at` | **YES** (date-time string → timestamp cast) | YES (5,713 / 7,332) | WAIT_DECISION | 동일 trade-off · ERP 는 수정이 있을 때만 EditDate 가 채워짐 (14.5% rows) · DB 는 모든 row 가 non-null → 의미가 다름 |
| TaxName | `col_i` | **YES** (코드 변환 "과세"/"면세" → "과직" 등) | YES (5,714 non-null) | WAIT_DECISION | 변환 규칙 미정 · 사용자 결정 대기 · `col_i` 는 UI 참조 없지만 DB 쓰임 (xlsx 임포트 잔재) |
| LcateName | — | — | — | KEEP_OFF | 전수 "코스트팜약국" (uniq=1) · 매핑 가치 無 |
| ScateName | — | — | — | KEEP_OFF | **사실상 CorpNameView 와 동일 (공급사)** · category 와 혼동 금지 |
| DcateName | — | — | — | KEEP_OFF | ERP 전수 null |
| Maker | `manufacturer` | X | — | KEEP_OFF | **ERP 전수 null** · whitelist 참조 중이지만 nullOverwrite=false 로 안전 (사실상 작동 X) |
| Brand | `brand` | X | — | KEEP_OFF | **ERP 전수 null** · 동일 |
| Orgin | `origin` | X | DB 53/7332 희박 | KEEP_OFF | ERP 전수 공란 |
| Specification | `spec` | X | DB 2건 희박 | KEEP_OFF | ERP 1/4007 · 양쪽 다 희박 |
| CateGubunOneName | — | — | — | REVIEW | ERP 100/4007 · uniq=6 ("마그네슘", "기타", "화장품" 등) · 서브 분류용 신규 column 가능성 · 사용자 판단 |
| CateGubunTwoName | — | — | — | REVIEW | ERP 96/4007 · uniq=2 ("건강기능식품", "기타") · 동상 |
| Memo | — | — | — | **KEEP_OFF (⚠DANGER)** | **DB `memo` 와 완전 분리** · ERP Memo (col[93]) = 운영 메모 (품절 등) · DB memo = 사용자 입력 · 절대 매핑 금지 (`PROTECTED_PRODUCT_FIELDS.memo`) |
| EtcTxtField1 | `search_keywords` (?) | REVIEW | DB 797/7332 | REVIEW | sample 이 "8806452023343" 같은 **13-digit** 문자열 (보조 BarCode?) · search_keywords 와 의미 다를 가능성 · 추측 매핑 금지 · 사용자 판단 |
| UserID | — | — | — | REVIEW | ERP 등록 user ID · DB `operator` 는 xlsx 임포트 사용 · 매핑 전 사용자 결정 |
| UserName | — | — | — | REVIEW | 동상 |
| EditUserID | — | — | — | REVIEW | 수정자 user ID · DB 상 대응 column 없음 (신규 column 가능) · 사용자 판단 |
| EditUserName | — | — | — | REVIEW | 동상 |
| BuyStatusName | — | — | — | KEEP_OFF | uniq=1 "매입중" · 분류 가치 無 (buy_status 와 혼동 금지) |
| GoodsName | — | — | — | KEEP_OFF | ProductName 과 완벽 중복 |
| GoodsSubName | — | — | — | REVIEW | 47/4007 희박 ("300정", "150포") · spec/pack 정보로 쓰일 가능성 · 사용자 판단 |
| ProductName_pop | — | — | — | KEEP_OFF | 1/4007 미사용 |
| StCode | — | — | — | KEEP_OFF | 전수 "000" 상수 (단일 매장) |
| ProductTypeName | — | — | — | KEEP_OFF | uniq=1 "단품" |
| ProductGubunName | — | — | — | KEEP_OFF | uniq=1 "상품" |
| OptionViewTypeName · IsWeight · WeightName · WeightCode · StockName · IsStock · TaxPercent · UnitStock · WeightCostUnit · IsProductType · IsBottle · BottlePrice | — | — | — | KEEP_OFF | 전수 상수 or 전수 null · 매핑 가치 無 |
| PriceB · PriceC · PriceD · IsSalesStore · EvCostUnit · EvSaleUnit · IsPriceLock | — | — | — | KEEP_OFF | 전수 0 or uniq=1 |
| Horizontal · Vertical · Height · Volume · WeightPriceUnit · IsStandingPoint · ProductFee · KeepingRuleName · BuseoCode · BuseoName · Damdang* (4종) · IsPoint · IsAddPoint · PointAdd · IsOrderType · LimitTime · IsDevDayType · DevDDay · Dev{Mon..Sun} · MakeDayName · ExpiryDayName · IdentificationName · UniPassName · IsAutoCostUpdate · IsPopName · RegStorageName · ROWNUM · EtcTxtField2..6 · EtcIntField1..3 | — | — | — | KEEP_OFF | 전수 상수 · 전수 null · 운영 flag · 매핑 가치 無 (총 **55 field**) |

---

## Section 4 · DROP_CANDIDATE

조건 3개 모두 만족:
1. ERP 공급 없음
2. 웹서비스 실제 READ/WRITE 없음 (3-4 hits 이하이고 전부 `scripts/audit-*` · `server/utils/xlsx.ts` · `server/routes/stock/products.ts` 의 DEAD_COLS 리스트에만 나타남)
3. DB dependency (FK / VIEW / FUNCTION / TRIGGER / RPC) 없음

RPC 참조 column (DROP 불가): `current_stock`, `optimal_stock`, `sale_price`, `purchase_price`, `min_order`, `hidden`, `supplier`, `spec`, `product_name`, `product_code` — `get_stock_flow` RPC WHERE/SELECT 에 포함.

INDEX 존재 column: `hidden` (`products_hidden_idx`), `pcode` (`idx_products_pcode`).

### DROP_CANDIDATE 테이블 (실 DROP 명령은 포함하지 않음)

| column | type (sample) | nullable | notes · 왜 unused 로 판단 |
|---|---|---|---|
| `col_i` | text | nullable | ERP 미공급 · 코드상 src/ UI 참조 0 · `DEAD_COLS` 포함 · DB non-null 5,714 는 xlsx 임포트 잔재 ("과직" 코드) · RPC/INDEX 無 · ⚠ TaxName 매핑 시 재활성 가능 → DROP 전 사용자 결정 |
| `product_type` | text | nullable | ERP ProductTypeName 전수 상수 "단품" · DEAD_COLS · UI 참조 0 · RPC/INDEX 無 |
| `delivery_price` | numeric | nullable | ERP 미공급 · DEAD_COLS · UI 참조 0 |
| `delivery_profit_rate` | numeric | nullable | 동상 |
| `delivery_margin_rate` | numeric | nullable | 동상 |
| `app_registered` | bool/int | nullable | ERP 미공급 · DEAD_COLS |
| `image_registered` | bool/int | nullable | 동상 |
| `preset_registered` | bool/int | nullable | 동상 |
| `preset_group` | text | nullable | DB non-null 152 희박 · DEAD_COLS · UI 참조 0 |
| `promotion_name` | text | nullable | DB 전수 null · DEAD_COLS |
| `promotion_priority` | int | nullable | 동상 |
| `promotion_purchase_price` | numeric | nullable | 동상 |
| `promotion_sale_price` | numeric | nullable | 동상 |
| `promotion_profit_rate` | numeric | nullable | 동상 |
| `promotion_discount_rate` | numeric | nullable | 동상 |
| `supplier_type` | text | nullable | ERP 미공급 · DEAD_COLS · UI 참조 0 |
| `management_group` | text | nullable | DB 전수 null · DEAD_COLS |
| `unit_type` | text | nullable | DB 전수 null · DEAD_COLS |
| `stock_amount` | numeric | nullable | ERP 미공급 · DEAD_COLS · UI 참조 0 |
| `operator` | text | nullable | 동상 |
| `point_rate` | numeric | nullable | 동상 |
| `sales_commission` | numeric | nullable | 동상 |
| `total_volume` | numeric | nullable | 동상 |
| `unit_volume` | numeric | nullable | 동상 |
| `individual_quantity` | int | nullable | 동상 |

### DROP_CANDIDATE 제외 (경계 사례 · 추가 확인 권장)

| column | 상태 | 보류 사유 |
|---|---|---|
| `last_modified_at` | 보류 | DEAD_COLS 이지만 ERP EditDate 매핑 후보 (WAIT_DECISION) · 사용자 결정 후 활성화 가능성 |
| `registered_at` | 보류 | 동상 (RegDate 매핑 후보) |
| `wholesale_price1` | 보류 | DB non-null 5,843 많음 · 코드 참조 0 but 보수적 유지 권장 |
| `individual_code` | 보류 | DB non-null 162 · scripts 매칭 로직 (`barcode-match-check.mjs`) 에서 사용 흔적 · UI 참조 0 이지만 삭제 전 사용자 확인 권장 |
| `connection_type` | 보류 | DB non-null 162 희박 · 유사 패턴 |
| `unit_price` (products) | 보류 | DB 전수 null · 변수명 collision 으로 hits 많음 보임 · 실제 products 스코프 참조 식별 어려움 · DROP 결정 전 사용자 확인 필수 |

### Section 4 count

- **DROP_CANDIDATE 확정**: 25 columns (위 표)
- **DROP_CANDIDATE 보류 (경계)**: 6 columns

> 사용자 지시: 실제 DROP 명령 미포함. 사용자 검토 → 승인 → migration SQL 작성 → 백업 → 실행 순서 권장.

---

## Appendix A · 분류 재확인 (최종 Counts)

- **ERP_OWNED**: 11
- **WEB_OWNED**: 18
- **BOTH**: 2
- **UNUSED**: 29 (= DROP_CANDIDATE 25 + 보류 4 + unit_price 특수)
- **REVIEW**: 0
- **합계**: 60 ✓
- **DROP_CANDIDATE 확정**: 25

## Appendix B · 알려진 코드-스키마 불일치 (별도 과제 · 이 audit 범위 밖)

- `src/shared/erp/erpSyncWhitelist.ts:76` 가 `ERP_DERIVED_PRODUCT_FIELDS.location` 을 참조하지만 **DB `location` column 은 존재하지 않음** (`.select("location")` 시 42703 "column products.location does not exist" 오류 확인). `server/routes/stock/products.ts:471-477` 에 fallback 처리 있음. 코드 수정은 이 audit 지시 범위 밖.
- `erpSyncWhitelist.ts.ERP_OWNED_PURCHASE_FIELDS` 는 `bm_code · row_num` 참조 — 라이브 `purchase_details` 21 col 에 없음 (기존 `docs/erp-supabase-mapping-audit.md` §1-4 에서도 지적됨). 범위 밖.
