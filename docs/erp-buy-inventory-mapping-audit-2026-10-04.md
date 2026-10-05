# ERP Buy_Status + Inventory_Status ↔ Supabase 매핑 READ-ONLY Audit

- **작성일**: 2026-10-04
- **범위**: ERP SOAP (`SvcBuyBiz.Buy_Status`, `SvcInventoryStockBiz.Inventory_Status`) 실측 응답 vs Supabase live schema
- **방법**: READ ONLY · DB WRITE 0 · code 수정 0 · UI 변경 0 · identity 생성 0
- **실측 소스**:
  - Buy_Status · Fiddler raw (`tools/iregen-bridge/samples/buy-response.txt`) decoder 재디코드 · **200 rows / 51 cols** · 2026-10-04 오전 캡처
  - Inventory_Status · 로컬 snapshot (`%APPDATA%/megatown-sync-agent/erp-cache/inventory-status/candidate.json.gz`) · **4,007 rows / 42 cols** · 2026-10-04 09:39 KST
  - Supabase · `.env` 서비스 롤 키로 `.from(table).select("*").limit(1)` · 10월 4일 라이브 조회
- **금지 사항 준수**: BmCode / ROWNUM 는 Buy snapshot 안에 실존 확인 후만 매핑 후보로 유지, 그 외 추측 매핑 전면 배제.

---

## 상태 코드 정의 (이 5 종만 사용)

- `MATCH` · ERP 필드와 Supabase 컬럼이 **의미·값 수준에서 동일하게 연결 가능**이 재확인됨 (코드/whitelist 또는 실제 샘플 대조)
- `POSSIBLE` · 데이터 성격은 유사하나 **의미 확인 필요** (단위·시점·소유권 불명확)
- `NO_TARGET` · ERP 반환하지만 Supabase 쪽에 **대응 컬럼이 아직 없음** (schema 추가 없이는 저장 불가)
- `DB_ONLY` · Supabase 쪽에만 존재, ERP 응답에 없음
- `IGNORE_CANDIDATE` · ERP 반환하지만 **저장 불필요** (전수 null, 노이즈, 로컬 결정이 있는 메타)

---

## [1] Buy_Status 실측 column (51개)

decoded via `tools/iregen-bridge/bin/Debug/net48/iregen-decoder.exe` on `tools/iregen-bridge/samples/buy-response.txt` → `tmp/buy-decode/output/inventory-full.json` (`NewDataSet.Table`, rowCount=200).

| # | ERP 컬럼 | 타입 (ADO.NET) | null/200 | 샘플 값 |
|---|---|---|---|---|
| 0  | CorpCode | System.String | 0 | `30009` |
| 1  | **BmCode** | System.String | 0 | `12261003000011`, `12261003000010`, `12261003000009` |
| 2  | BuyMonth | System.String | 0 | `2026/10` |
| 3  | BuyDate | System.String | 0 | `2026-10-02`, `2026-10-01`, `2026-10-03` |
| 4  | StCode | System.String | 0 | `000` |
| 5  | StorageName | System.String | 0 | `용인점` |
| 6  | BuseoCode | System.Int32 | 0 | `1826` |
| 7  | BuseoName | System.String | 0 | `기타` |
| 8  | DamDang | System.String | 0 | `101` |
| 9  | DamDangName | System.String | 0 | `공용(허가 필요)` |
| 10 | CtCode | System.String | 0 | `1092`, `1119`, `1058` |
| 11 | CorpNameView | System.String | 0 | `대지인팜`, `삼일제약`, `조아제약(vat미포함)` |
| 12 | IsSupport | System.String | **200** | (전수 공백) |
| 13 | TotalCnt | System.Int32 | 0 | `17`, `1`, `5` |
| 14 | ConfirmUserID | System.String | 0 | `101` |
| 15 | ConfirmUserName | System.String | 0 | `공용(허가 필요)` |
| 16 | ConfirmDate | System.String | 0 | `2026-10-04 10:02:09` |
| 17 | Remark | System.String | **200** | (전수 공백) |
| 18 | IsStatus | System.String | 0 | `9` |
| 19 | IsStatusName | System.String | 0 | `매입완료` |
| 20 | IsBiz | System.String | 0 | `1`, ` ` |
| 21 | UserID | System.String | 0 | `101` |
| 22 | UserName | System.String | 0 | `공용(허가 필요)` |
| 23 | RegDate | System.String | 0 | `2026-10-03 14:52:31` |
| 24 | EditUserID | System.String | 0 | `101` |
| 25 | EditUserName | System.String | 0 | `공용(허가 필요)` |
| 26 | EditDate | System.String | 0 | `2026-10-04 10:02:09` |
| 27 | **PCode** | System.String | 0 | `11043`, `11424`, `11207` |
| 28 | ProductName | System.String | 0 | `리뉴후레쉬용액(355ml)` |
| 29 | Specification | System.String | 195 | `10EA`, `2EA` |
| 30 | ProductWeight | System.Decimal | 0 | `0.00` |
| 31 | UnitCode | System.String | 0 | `EA`, `BOX(10)`, `BOX(2)` |
| 32 | UnitCost | System.Decimal | 0 | `4102.00`, `5140.00`, `540.00` |
| 33 | UnitSale | System.Decimal | 0 | `5000.00`, `6800.00`, `600.00` |
| 34 | StockCnt | System.Decimal | 0 | `24.00`, `12.00`, `120.00` |
| 35 | TotalStock | System.Int32 | 0 | `24`, `12`, `120` |
| 36 | BuyPrice | System.Decimal | 0 | `89498.00`, `56073.00`, `58909.00` |
| 37 | BuyTax | System.Decimal | 0 | `8950.00`, `5607.00`, `5891.00` |
| 38 | TaxExemption | System.Decimal | 0 | `0.00` |
| 39 | BuyTotal | System.Decimal | 0 | `98448.00`, `61680.00`, `64800.00` |
| 40 | Lcate | System.Int16 | 0 | `1` |
| 41 | LcateName | System.String | 0 | `코스트팜약국` |
| 42 | McateName | System.String | 0 | `약국2`, `약국`, `약국3` |
| 43 | ScateName | System.String | 0 | `대지인팜`, `삼일제약` |
| 44 | DcateName | System.String | **200** | (전수 null) |
| 45 | CorpBizNo | System.String | 0 | `000-00-00000` |
| 46 | ReturnCodeName | System.String | **200** | (전수 null) |
| 47 | MakeDay | System.String | **200** | (전수 공백) |
| 48 | ExpiryDay | System.String | **200** | (전수 공백) |
| 49 | Identification | System.String | **200** | (전수 공백) |
| 50 | **ROWNUM** | System.Int64 | 0 | `1`, `2`, `3` |

> **확인**: `BmCode` + `ROWNUM` 모두 **snapshot 안에 실존** (전수 non-null). unique transaction key 로 유효.

---

## [2] Supabase 매입 schema 실측

### 2-1 `purchase_details` (rows=12,939 · cols=21)

| # | 컬럼 | 샘플 값 / 성격 | 사용처 (grep) |
|---|---|---|---|
| 0  | `id` | serial PK (`33743`, `24842`) | PK |
| 1  | `purchase_date` | `2026-07-30` (date) | 전수 사용 (purchaseHistory, supplierPayments, …) |
| 2  | `supplier_code` | `0018` (nullable) | matching / display |
| 3  | `supplier_name` | `온라인팜` | display |
| 4  | `product_code` | `0108806435080516` (**13자리 Barcode** · ERP PCode 아님) | FK to products.product_code |
| 5  | `product_name` | `두피앤액 30ml` | display |
| 6  | `spec` | `21` (nullable) | display |
| 7  | `quantity` | `1`, `2` (int) | 계산 |
| 8  | `unit_price` | `10500` (nullable) | 계산 |
| 9  | `amount` | `21000` (nullable) | 계산 (공급가) |
| 10 | `vat` | `0` (nullable) | 계산 |
| 11 | `total` | `21000` (nullable) | 계산 (VAT 포함) |
| 12 | `imported_at` | timestamptz | 감사 메타 · **PROTECTED** |
| 13 | `period_start_date` | `2026-04-21` (date, nullable) | XLSX 기간 upload |
| 14 | `period_type` | `late` (nullable) | XLSX 기간 분류 |
| 15 | `verified_by` | `강남규` (사용자) | **PROTECTED** |
| 16 | `verify_status` | `verified` | **PROTECTED** |
| 17 | `verify_note` | — | **PROTECTED** |
| 18 | `verified_at` | timestamptz | **PROTECTED** |
| 19 | `verified_expiring` | boolean | **PROTECTED** |
| 20 | `expiry_date` | date (nullable) | 사용자 검수 입력 · **PROTECTED** |

> **중요**: `bm_code`, `row_num` 컬럼은 live schema 에 **없음** (`.select("bm_code,row_num")` 로 재확인 — error). 코드 (`server/services/erpSync/buySyncRunner.ts:30-39`) 는 `MIGRATION_REQUIRED` 로 차단 상태.
> Migration SQL 파일은 `supabase/migrations/future_phase2_erp_sync_bm_code_row_num.sql` 에 존재 (자동 실행 X · 사용자 승인 대기).

### 2-2 매입 관련 다른 테이블
- `supplier_balances` (76 rows, 5 cols) — 공급처 월별 잔액 집계 (ERP sync 대상 아님, 수동 입력)
- `supplier_payments` (3 rows, 10 cols) — 결제 이력 (사용자 입력)
- `vendors` (156 rows, 26 cols) — 공급처 마스터 (ERP CtCode / CorpNameView 등 lookup 대상)
- `order_requests` (7 rows, 23 cols) — 발주 요청 (ERP Buy 와 별개 흐름)

이 중 ERP Buy_Status 를 **직접 저장받는 테이블은 `purchase_details` 하나**.

---

## [3] Buy_Status ↔ Supabase 매핑표

실측 whitelist (`src/shared/erp/erpSyncWhitelist.ts`) 와 실측 샘플을 교차 검증한 결과.

| ERP API 컬럼 | ERP 실제값 예시 | Supabase table | Supabase column | Supabase type | 매핑 상태 | 판단 근거 |
|---|---|---|---|---|---|---|
| BmCode | `12261003000011` | purchase_details | `bm_code` | TEXT (**미생성**) | **NO_TARGET** | 코드/whitelist 에서 unique key 로 설계 완료 (`erpSyncWhitelist.ts:32,110`), live schema 에 아직 없음. Migration (`future_phase2_erp_sync_bm_code_row_num.sql`) 수동 승인 대기 |
| ROWNUM | `1`, `2`, `3` | purchase_details | `row_num` | INT (**미생성**) | **NO_TARGET** | 상동 (BmCode 쌍) |
| PCode | `11043` | — | — | — | **IGNORE_CANDIDATE** | `product_code` 에 직접 저장 X · PCode→BarCode 변환 후 `product_code` 로 저장 (products.pcode 사전 사용, `erpBuyMapper.ts:75-77,100-102`) |
| ProductName | `리뉴후레쉬용액(355ml)` | purchase_details | `product_name` | text | **MATCH** | whitelist L103, 매입 시점 상품명 보존 목적 |
| Specification | `10EA`, (195/200 null) | purchase_details | `spec` | text | **MATCH** | whitelist L104 |
| UnitCode | `EA`, `BOX(10)` | — | — | — | **NO_TARGET** | purchase_details 에 unit 컬럼 없음 (products.unit 만 존재). 매입 라인 단위 저장 안 함 (현 설계) |
| UnitCost | `4102.00` | purchase_details | `unit_price` | numeric | **MATCH** | whitelist L106 |
| UnitSale | `5000.00` | — | — | — | **IGNORE_CANDIDATE** | 매입 시점의 판매가 참고값 · purchase_details 에 저장 안 함. `products.sale_price` 와 혼선 방지 |
| StockCnt | `24.00` | purchase_details | `quantity` | int4 | **MATCH** | whitelist L105 (numeric cast). ERP StockCnt=Decimal · DB quantity=int (반올림) |
| TotalStock | `24` | — | — | — | **IGNORE_CANDIDATE** | StockCnt 와 사실상 동일 (int 캐스트). 중복 저장 안 함 |
| BuyPrice | `89498.00` | purchase_details | `amount` | numeric | **MATCH** | whitelist L107 (공급가 · VAT 제외) |
| BuyTax | `8950.00` | purchase_details | `vat` | numeric | **MATCH** | whitelist L108 |
| TaxExemption | `0.00` | — | — | — | **IGNORE_CANDIDATE** | 전수 0 · 면세 상품 전용. 현재는 vat/amount 조합으로 충분 |
| BuyTotal | `98448.00` | purchase_details | `total` | numeric | **MATCH** | whitelist L109 (VAT 포함 총액). amount+vat 로 재계산 가능하나 ERP 서버 계산치를 신뢰 |
| BuyDate | `2026-10-02` | purchase_details | `purchase_date` | date | **MATCH** | whitelist L99 |
| CtCode | `1092` | purchase_details | `supplier_code` | text (nullable) | **MATCH** | whitelist L100. 현재 12,939 중 `supplier_code=null` 다수 존재 → ERP sync 로 보강 가능 |
| CorpNameView | `대지인팜` | purchase_details | `supplier_name` | text | **MATCH** | whitelist L101 |
| ProductWeight | `0.00` (전수) | — | — | — | **IGNORE_CANDIDATE** | 전수 0 · 공산품 매입에서 무의미 |
| CorpBizNo | `000-00-00000` (전수 더미) | — | — | — | **IGNORE_CANDIDATE** | 전수 더미값. vendors.business_number 에 벤더 마스터로 저장되는 흐름이 별도로 존재 |
| BuyMonth | `2026/10` | — | — | — | **IGNORE_CANDIDATE** | BuyDate 로부터 derivable. 저장 불필요 |
| StCode | `000` | — | — | — | **IGNORE_CANDIDATE** | 단일 매장 운영 (전수 `000`). 다점포 전환 전에는 저장 X |
| StorageName | `용인점` | — | — | — | **IGNORE_CANDIDATE** | StCode 와 동일 (전수 `용인점`) |
| CorpCode | `30009` (전수) | — | — | — | **IGNORE_CANDIDATE** | 테넌트 ID. 단일 테넌트. 저장 X |
| BuseoCode / BuseoName | `1826 / 기타` (전수 동일) | — | — | — | **IGNORE_CANDIDATE** | 전수 동일 값. 부서 구분 사용 안 함 |
| DamDang / DamDangName | `101 / 공용(허가 필요)` | — | — | — | **POSSIBLE** | 담당자 ID/명. 현재 저장 안 함. 추후 vendors.manager 또는 신규 column 필요 시 재검토 |
| TotalCnt | `17` | — | — | — | **POSSIBLE** | 전표 라인 수 (same BmCode 내). ROWNUM 과 조합하면 재계산 가능 · 저장 가치 낮음 |
| ConfirmUserID / ConfirmUserName | `101 / 공용(허가 필요)` | — | — | — | **POSSIBLE** | 매입 확정자. 감사 로그 필요 시 추가 column |
| ConfirmDate | `2026-10-04 10:02:09` | — | — | — | **POSSIBLE** | 매입 확정 시각. 현재 purchase_details 는 `verified_at` (PROTECTED, 사용자용) 와 분리 보존 필요 |
| IsStatus | `9` (전수) | — | — | — | **IGNORE_CANDIDATE** | `9=매입완료` 만 반환 (status filter). 저장 가치 없음 |
| IsStatusName | `매입완료` (전수) | — | — | — | **IGNORE_CANDIDATE** | 상동 |
| IsBiz | `1` 또는 ` ` | — | — | — | **IGNORE_CANDIDATE** | 사업자 여부 flag. vendors 쪽에 이미 vat_included 보유 |
| UserID / UserName | `101 / 공용(허가 필요)` | — | — | — | **POSSIBLE** | 전표 등록자. 감사 로그 필요 시 추가 column |
| RegDate | `2026-10-03 14:52:31` | — | — | — | **POSSIBLE** | 전표 등록 시각. 저장하면 cross-check 가능 (purchase_date 와 별개) |
| EditUserID / EditUserName | `101 / 공용(허가 필요)` | — | — | — | **POSSIBLE** | 수정자. 상동 |
| EditDate | `2026-10-04 10:02:09` | — | — | — | **POSSIBLE** | 전표 수정 시각 |
| Lcate | `1` | — | — | — | **IGNORE_CANDIDATE** | LcateName 숫자 코드. LcateName 과 중복 |
| LcateName / McateName / ScateName | `코스트팜약국 / 약국2 / 대지인팜` | — | — | — | **POSSIBLE** | products.category / products.management_group 과 매입 시점 분류 보존 여부 결정 필요 (현재 저장 안 함) |
| DcateName | 전수 null | — | — | — | **IGNORE_CANDIDATE** | 전수 null |
| IsSupport | 전수 공백 | — | — | — | **IGNORE_CANDIDATE** | 전수 공백 |
| Remark | 전수 공백 | — | — | — | **IGNORE_CANDIDATE** | 전수 공백 (ERP UI 에서 비고 입력 안 하는 운영) |
| ReturnCodeName | 전수 null | — | — | — | **IGNORE_CANDIDATE** | 전수 null (반품 전표 미포함 쿼리) |
| MakeDay | 전수 공백 | — | — | — | **IGNORE_CANDIDATE** | 제조일 · ERP 입력 X. purchase_details.expiry_date 사용자 입력과 분리 |
| ExpiryDay | 전수 공백 | — | — | — | **IGNORE_CANDIDATE** | 유통기한 · ERP 입력 X. 사용자 입력 유지 |
| Identification | 전수 공백 | — | — | — | **IGNORE_CANDIDATE** | 식별 코드 · 미사용 |

### Supabase DB_ONLY 컬럼 (purchase_details)

| Supabase column | 성격 | ERP 대응 | 상태 |
|---|---|---|---|
| id | serial PK | — | **DB_ONLY** |
| imported_at | 감사 timestamp | — | **DB_ONLY** (PROTECTED) |
| period_start_date | XLSX 업로드 기간 | — | **DB_ONLY** (매입 upload UI 전용) |
| period_type | XLSX 기간 분류 (`early`/`mid`/`late`) | — | **DB_ONLY** |
| verified_by | 사용자 검수자 | — | **DB_ONLY** (PROTECTED, `erpSyncWhitelist.ts:115`) |
| verify_status | 사용자 검수 상태 | — | **DB_ONLY** (PROTECTED) |
| verify_note | 사용자 검수 메모 | — | **DB_ONLY** (PROTECTED) |
| verified_at | 사용자 검수 시각 | — | **DB_ONLY** (PROTECTED) |
| verified_expiring | 유통기한 임박 flag | — | **DB_ONLY** (PROTECTED) |
| expiry_date | 사용자 입력 유통기한 | ExpiryDay (전수 공백) | **DB_ONLY** (PROTECTED, ERP 미사용) |

---

## [4] Inventory_Status 실측 column (42개)

`%APPDATA%/megatown-sync-agent/erp-cache/inventory-status/candidate.json.gz` · 4,007 rows.

| # | ERP 컬럼 | null/4007 | 샘플 값 |
|---|---|---|---|
| 0  | PPCode | **3,936** | `15286`, `15287` (약 1.8% non-null) |
| 1  | PCode | 0 | `10001`, `10004`, `10005` |
| 2  | ProductName | 0 | `삼양연고 100g`, `밀프로정 dog` |
| 3  | IsTax | 0 | `과세`, `면세` |
| 4  | TaxPercent | 0 | `10`, `0` |
| 5  | UnitCode | 0 | `EA`, `포`, `병` |
| 6  | StCode | 0 | `000` (전수) |
| 7  | StorageName | 0 | `용인점` (전수) |
| 8  | IsSaleStatusName | 0 | `판매중` (전수) |
| 9  | CtCode | 2 | `1134`, `1092` |
| 10 | CCorpName | 2 | `라라컴퍼니`, `대지인팜` |
| 11 | IsBuyerType | 0 | `일반매입`, `판매분수수료`, `-` |
| 12 | LcateName | 3 | `코스트팜약국` |
| 13 | McateName | 4 | `약국2`, `약국`, `약국3` |
| 14 | ScateName | 7 | `라라컴퍼니`, `대지인팜` |
| 15 | DcateName | **4,007** | (전수 null) |
| 16 | LocationName | 757 | `벽>21>전체>전체`, `6매대>Ｂ>7열>전체` |
| 17 | CostPrice | 0 | `5243.0000000000000` |
| 18 | CostPrice1 | 2,146 | `5243.0000000000000` |
| 19 | ConfirmDate1 | 2,146 | `2026-09-29T16:39:59` |
| 20 | CostPrice2 | **4,007** | (전수 null) |
| 21 | ConfirmDate2 | **4,007** | (전수 null) |
| 22 | CostPrice3 | 4,000 | `3251.11`, `2323.33` |
| 23 | ConfirmDate3 | 4,000 | `2026-10-04T00:15:02` |
| 24 | CostPrice4 | **4,007** | (전수 null) |
| 25 | PrvStock | 0 | `0.00` (대부분 0) |
| 26 | BuyStock | 0 | `36`, `0`, `70` |
| 27 | BuyReturnStock | 0 | `0`, `31`, `25` |
| 28 | StorageMoveIn | 0 | `0` (전수) |
| 29 | StorageMoveOut | 0 | `0` (전수) |
| 30 | StorageMoveAutoIn | 0 | `0` (전수) |
| 31 | StorageMoveAutoOut | 0 | `0` (전수) |
| 32 | SaleStock | 0 | `31`, `3`, `0` |
| 33 | SaleReturnStock | 0 | `1`, `0`, `5` |
| 34 | ProductUseStock | 0 | `0`, `1`, `2` |
| 35 | ProductReturnUseStock | 0 | `0` (전수) |
| 36 | ProductBadStock | 0 | `0` (전수) |
| 37 | ProductReturnBadStock | 0 | `0` (전수) |
| 38 | PlusStock | 0 | `0.00`, `19.00`, `30.00` |
| 39 | MinusStock | 0 | `0.00`, `1.00`, `34.00` |
| 40 | SubdivisionMinus | 0 | `0`, `245`, `71` |
| 41 | SubdivisionPlus | 0 | `0`, `336`, `245` |

> **의미**: Inventory_Status 는 "**특정 기간 (default: 당월) 집계된 재고 변동량**" 보고서. 42-column 재고변동 공식은:
> `PrvStock + BuyStock − BuyReturnStock − SaleStock + SaleReturnStock − ProductUseStock + ProductReturnUseStock − ProductBadStock + ProductReturnBadStock + StorageMoveIn − StorageMoveOut + StorageMoveAutoIn − StorageMoveAutoOut + PlusStock − MinusStock − SubdivisionMinus + SubdivisionPlus = (기말 집계 재고)`
> 그러나 사용자 지시 2026-10-03 재확인: **current_stock SSOT 는 Product_List.NowStock** (Inventory_Status 로 계산 X).

---

## [5] Supabase 재고 schema 실측

### 5-1 `products.current_stock` 등 (products 62 cols 중 재고 관련)
| 컬럼 | type | 성격 |
|---|---|---|
| product_code | text (PK) | identity (BarCode) |
| pcode | text (unique) | ERP PCode |
| current_stock | numeric | **SSOT = Product_List.NowStock** (사용자 2026-10-03 확정) |
| stock_amount | numeric | 재고금액 (수동 계산) |
| optimal_stock | numeric | 사용자 적정재고 · **PROTECTED** |
| last_purchase_date | date | ERP LastBuyDate |
| last_sale_date | date | ERP LastSaleDate |
| stock_note | text | 사용자 메모 · **PROTECTED** |

### 5-2 `stock_history` (rows=53,641 · cols=24)
XLSX 업로드로 적재되는 **기간 스냅샷 테이블**. ERP Inventory_Status 로부터의 자동 sync 코드 **없음** (grep 결과: `stock_history.insert` 는 `uploadStock.ts` 뿐).

| # | 컬럼 | 샘플 | 의미 |
|---|---|---|---|
| 0 | id | serial | PK |
| 1 | snapshot_date | `2026-05-20` | 기간 종료 날짜 |
| 2 | product_code | `8806011615453` (Barcode) | FK |
| 3 | supplier_code | `0085` | 공급처 코드 |
| 4 | supplier_name | `박카스` | 공급처명 |
| 5 | product_name | `박카스디 10병` | 상품명 (스냅샷) |
| 6 | spec | `왼쪽드링크` | 규격 |
| 7 | opening_stock | 571 | 기초재고 |
| 8 | purchase_qty | 1090 | 매입량 |
| 9 | sale_qty | 978 | 판매량 |
| 10 | disposal_qty | 0 | 폐기 |
| 11 | internal_qty | 0 | 내부사용 |
| 12 | adjustment_qty | 0 | 조정 |
| 13 | closing_stock | 683 | 기말재고 |
| 14 | taxable_amount | 3,831,630 | 과세매출 |
| 15 | supply_amount | 3,483,300 | 공급가 |
| 16 | vat | 348,330 | 부가세 |
| 17 | duty_free_amount | 0 | 면세매출 |
| 18 | total_amount | 3,831,630 | 총매출 |
| 19 | created_at | timestamptz | 등록시각 |
| 20 | tax_type | `과직` | 과세구분 |
| 21 | product_type | `수량` | 상품유형 |
| 22 | period_type | `mid` | 기간유형 |
| 23 | period_start_date | `2026-05-11` | 기간 시작 |

Unique key: **(snapshot_date, product_code)** (upsert onConflict in `uploadStock.ts:236`).

### 5-3 `inventory_checks` (rows=3,400 · cols=19)
사용자 실사재고 테이블. **PROTECTED** · ERP 가 overwrite 금지 (사용자 2026-10-03 확정).

| 컬럼 | 성격 |
|---|---|
| id, product_code, product_name, note, status, checked_at, checked_by | 메타 |
| system_stock | 시스템 비교값 |
| store1_stock, store2_stock, store3_stock, store_stock_2 | 매장별 실사 수량 (**PROTECTED**) |
| warehouse1_stock, warehouse2_stock | 창고별 실사 수량 (**PROTECTED**) |
| store1_zone, store2_zone, store3_zone, shelf_positions | 위치 jsonb |
| expiry_date | 사용자 입력 유통기한 |

---

## [6] Inventory_Status ↔ Supabase 매핑표

**현재 Supabase 쪽에 "Inventory_Status 를 저장하는 테이블" 자체가 없음** (grep 결과 ERP sync 코드 0, whitelist 0, 신규 history table 설계 금지).
따라서 거의 전 field 가 `NO_TARGET` 또는 `IGNORE_CANDIDATE`. **단, product-level 식별자/카테고리/위치/원가는 products 테이블의 기존 컬럼에 매핑 가능.**

| ERP API 컬럼 | ERP 실제값 예시 | Supabase table | Supabase column | Supabase type | 매핑 상태 | 판단 근거 |
|---|---|---|---|---|---|---|
| PCode | `10001` | products | `pcode` | text (UNIQUE) | **MATCH** | identity lookup (`erpSyncWhitelist.ts:43`). INSERT 때만 WRITE, UPDATE 금지 |
| PPCode | `15286` (3,936/4,007 null) | — | — | — | **IGNORE_CANDIDATE** | 하위 분해 PCode. 전수 4,007 중 71개만 non-null → 분해품 특이 case. 저장 가치 낮음 (추후 재검토 필요 시 **POSSIBLE** 재분류) |
| ProductName | `삼양연고 100g` | products | `product_name` | text | **MATCH** | whitelist L45 (Product_List 와 동일 source) |
| IsTax | `과세`/`면세` | — | — | — | **POSSIBLE** | products 에 과세구분 전용 컬럼 없음. tax_type 저장은 stock_history 쪽에만 (`tax_type` 컬럼) · 상품 마스터에 저장할지 미결정 |
| TaxPercent | `10`/`0` | — | — | — | **POSSIBLE** | 상동 (IsTax derivable) |
| UnitCode | `EA`, `포`, `병` | products | `unit` | text | **MATCH** | whitelist L48 (Product_List 와 동일 source) |
| StCode | `000` (전수) | — | — | — | **IGNORE_CANDIDATE** | 단일 매장 (전수 `000`) |
| StorageName | `용인점` (전수) | — | — | — | **IGNORE_CANDIDATE** | 전수 동일 |
| IsSaleStatusName | `판매중` (전수) | products | `sale_status` | text | **MATCH** | whitelist L49. Product_List.SaleStatusName 와 동일 origin 추정 (의미 확인 완료 — Product Sync 에서 이미 소비) |
| CtCode | `1134`, `1092` | products | `supplier_code` | text | **MATCH** | whitelist L47 |
| CCorpName | `라라컴퍼니`, `대지인팜` | products | `supplier` | text | **MATCH** | whitelist L46 (CorpNameView == CCorpName; Product_List 쪽은 `CorpNameView` key) |
| IsBuyerType | `일반매입`/`판매분수수료`/`-` | — | — | — | **POSSIBLE** | 매입 유형. 현재 저장 없음. vendors 또는 products 쪽 flag 로 저장할지 미결정 |
| LcateName | `코스트팜약국` | — | — | — | **IGNORE_CANDIDATE** | 전수 `코스트팜약국` (최상위 분류) |
| McateName | `약국2`, `약국`, `약국3` | products | `category` | text | **MATCH** | whitelist L58 (Product_List 와 동일) |
| ScateName | `라라컴퍼니`, `대지인팜` | — | — | — | **POSSIBLE** | 소분류 (대부분 공급처명 = ScateName). 저장 안 함. products.supplier 와 중복 가능 → 저장 가치 낮음 |
| DcateName | 전수 null | — | — | — | **IGNORE_CANDIDATE** | 전수 null |
| LocationName | `벽>21>전체>전체` | products | `display_location` | text | **MATCH** | whitelist L62 (raw 저장, 변환 없음 · 2026-10-04 확정) |
| CostPrice | `5243.0000000000000` | products | `purchase_price` | numeric | **MATCH** | whitelist L56 (Product_List.CostPrice 와 동일 source) |
| CostPrice1 | `5243.0000000000000` (2,146 null) | — | — | — | **IGNORE_CANDIDATE** | 가격 변동 이력 1차. 저장은 **별도 history 설계 금지** (사용자 지시) |
| ConfirmDate1 | `2026-09-29T16:39:59` | — | — | — | **IGNORE_CANDIDATE** | CostPrice1 쌍 · 상동 |
| CostPrice2 | 전수 null | — | — | — | **IGNORE_CANDIDATE** | 전수 null |
| ConfirmDate2 | 전수 null | — | — | — | **IGNORE_CANDIDATE** | 전수 null |
| CostPrice3 | `3251.11` (4,000/4,007 null) | — | — | — | **IGNORE_CANDIDATE** | 7개만 non-null. 노이즈 수준 |
| ConfirmDate3 | 상동 | — | — | — | **IGNORE_CANDIDATE** | 상동 |
| CostPrice4 | 전수 null | — | — | — | **IGNORE_CANDIDATE** | 전수 null |
| PrvStock | `0.00` (대부분 0) | — | — | — | **POSSIBLE** | 기초재고 (기간 시작 시점 재고). stock_history.opening_stock 이 이미 존재 · 기간이 ERP vs XLSX 불일치 → 저장하려면 별도 period 저장 필요 (**사용자 지시 "새 history 설계 금지"** → 당분간 저장 X) |
| BuyStock | `36`, `0`, `70` | — | — | — | **POSSIBLE** | 매입 수량 (기간 집계). stock_history.purchase_qty 와 성격 유사 · 기간 정의 상이 → 저장 안 함 (상동) |
| BuyReturnStock | `0`, `31`, `25` | — | — | — | **POSSIBLE** | 매입반품 (기간 집계). stock_history 는 반품을 분리 저장 안 함 → **의미 확인 필요** |
| StorageMoveIn | `0` (전수) | — | — | — | **IGNORE_CANDIDATE** | 매장간 이동 입고 · 단일점포 → 전수 0 |
| StorageMoveOut | `0` (전수) | — | — | — | **IGNORE_CANDIDATE** | 상동 |
| StorageMoveAutoIn | `0` (전수) | — | — | — | **IGNORE_CANDIDATE** | 자동이동 입고 · 전수 0 |
| StorageMoveAutoOut | `0` (전수) | — | — | — | **IGNORE_CANDIDATE** | 상동 |
| SaleStock | `31`, `3`, `0` | — | — | — | **POSSIBLE** | 판매 수량 (기간 집계). stock_history.sale_qty 와 성격 유사 (상동 — 기간 정의 상이) |
| SaleReturnStock | `1`, `0`, `5` | — | — | — | **POSSIBLE** | 판매반품 (기간 집계). stock_history 는 분리 저장 안 함 → 의미 확인 필요 |
| ProductUseStock | `0`, `1`, `2` | — | — | — | **POSSIBLE** | 상품 사용 (내부 소진). stock_history.internal_qty 와 성격 유사 |
| ProductReturnUseStock | `0` (전수) | — | — | — | **IGNORE_CANDIDATE** | 내부 사용 반품 · 전수 0 |
| ProductBadStock | `0` (전수) | — | — | — | **IGNORE_CANDIDATE** | 불량 수량 · 전수 0 (stock_history.disposal_qty 와 성격 유사하지만 ERP 실측 0) |
| ProductReturnBadStock | `0` (전수) | — | — | — | **IGNORE_CANDIDATE** | 상동 |
| PlusStock | `0.00`, `19.00`, `30.00` | — | — | — | **POSSIBLE** | 재고 수동 가산. stock_history.adjustment_qty 와 성격 유사 · 부호 분리 |
| MinusStock | `0.00`, `1.00`, `34.00` | — | — | — | **POSSIBLE** | 재고 수동 감산. 상동 (adjustment_qty = PlusStock − MinusStock 조합 가능) |
| SubdivisionMinus | `0`, `245`, `71` | — | — | — | **POSSIBLE** | 분해/분할 감 (하위 상품 생성). products.individual_code / individual_quantity 와 연관 추정 · 의미 확인 필요 |
| SubdivisionPlus | `0`, `336`, `245` | — | — | — | **POSSIBLE** | 분해/분할 증 · 상동 |

### 중요한 교차 확인
Product_List 의 `NowStock` 가 `current_stock` SSOT 이고 (2026-10-03 확정),
Inventory_Status 42-column 공식으로 재계산하지 **않음** (사용자 지시).
→ 즉 Inventory_Status 는 현재 **"뷰(view) 성격 조회만, 저장 매핑 없음"** 상태 유지.

### Supabase DB_ONLY 재고 컬럼 요약

| 테이블 | 컬럼 | 이유 |
|---|---|---|
| products | current_stock | ERP Inventory_Status 로 계산 X · Product_List.NowStock 사용 (DB_ONLY 측면에서 Inventory_Status 로는 **DB_ONLY**) |
| products | stock_amount | 수동 계산 금액 |
| products | optimal_stock | 사용자 PROTECTED |
| products | stock_note | 사용자 PROTECTED |
| stock_history | opening/closing/purchase/sale/disposal/internal/adjustment_qty | **XLSX 월별 스냅샷 전용** · ERP Inventory_Status 와 기간/정의 불일치 → DB_ONLY |
| stock_history | taxable/supply/vat/duty_free/total_amount | 상동 (XLSX 전용) |
| inventory_checks | store*_stock, warehouse*_stock, shelf_positions, store*_zone | 사용자 실사 전용 · **PROTECTED** |

---

## [7] Product_List vs Inventory_Status 중복 분석 (현재고 · 변동)

필드 성격별로 Product_List 와 Inventory_Status 가 겹치는 지점.

| 필드 성격 | Product_List field | Inventory_Status field | Supabase field | 의미 | 중복 여부 |
|---|---|---|---|---|---|
| 상품 identity | `PCode` | `PCode` | `products.pcode` | ERP 상품 ID | **동일** (양쪽에서 PK) |
| 상품명 | `ProductName` | `ProductName` | `products.product_name` | 상품명 | **동일** (SSOT=Product_List) |
| 공급처 코드 | `CtCode` | `CtCode` | `products.supplier_code` | 공급처 ID | **동일** |
| 공급처명 | `CorpNameView` | `CCorpName` | `products.supplier` | 공급처명 | **동일 의미, key 이름만 다름** |
| 단위 | `UnitCode` | `UnitCode` | `products.unit` | 단위 | **동일** |
| 과세 | `IsTax`/`TaxPercent` (추정) | `IsTax`/`TaxPercent` | — | 과세구분 | 동일 |
| 매입가 | `CostPrice` | `CostPrice` | `products.purchase_price` | 현재 매입가 | **동일 의미 · 동시 저장 X** (SSOT=Product_List) |
| 판매가 | `PriceA` | — | `products.sale_price` | 판매가 | Inventory_Status 에 없음 |
| 중분류 | `McateName` | `McateName` | `products.category` | 중분류 | **동일** |
| 매장분류 | `LcateName`/`ScateName`/`DcateName` | `LcateName`/`ScateName`/`DcateName` | — | 대/소/세분류 | 동일 (Inventory_Status 쪽에 LcateName 추가 반환) |
| 매장 ID | `StCode`/`StorageName` | `StCode`/`StorageName` | — | 매장 | 동일 (전수 단일점포) |
| 판매상태 | `SaleStatusName` | `IsSaleStatusName` | `products.sale_status` | 판매중 flag | **동일 의미, key 이름만 다름** |
| **현재고** | `NowStock` ★ | *(derivable: PrvStock+BuyStock−...)* | `products.current_stock` | 현재고 | **Product_List=SSOT**. Inventory_Status 42-col 공식 **사용 안 함** (사용자 확정) |
| 기초(전일/기초)재고 | — | `PrvStock` | `stock_history.opening_stock` (XLSX) | 기간 시작 재고 | **별 소스** (ERP≠XLSX 기간) |
| 매입 (기간 집계) | — | `BuyStock` | `stock_history.purchase_qty` (XLSX) | 기간 매입량 | **별 소스** |
| 매입반품 | — | `BuyReturnStock` | — | 기간 매입반품 | **Supabase 없음** |
| 판매 (기간 집계) | — | `SaleStock` | `stock_history.sale_qty` (XLSX) | 기간 판매량 | **별 소스** |
| 판매반품 | — | `SaleReturnStock` | — | 기간 판매반품 | **Supabase 없음** |
| 재고증가 | — | `PlusStock` | `stock_history.adjustment_qty` (XLSX, +방향) | 수동 가산 | **별 소스** |
| 재고감소 | — | `MinusStock` | `stock_history.adjustment_qty` (XLSX, −방향) | 수동 감산 | **별 소스** |
| 내부사용 | — | `ProductUseStock` | `stock_history.internal_qty` (XLSX) | 내부 소진 | **별 소스** |
| 폐기 | — | `ProductBadStock` (전수 0) | `stock_history.disposal_qty` (XLSX) | 폐기 | **별 소스** |
| 매장간이동 | — | `StorageMoveIn/Out` (전수 0) | — | 매장간 이동 | 단일점포 → 사용 X |
| 분해 | — | `SubdivisionPlus/Minus` | `products.individual_code/quantity` (연관?) | 분해/분할 | **의미 확인 필요** |
| 매입일 | `LastBuyDate` | — | `products.last_purchase_date` | 최근 매입 | Product_List 만 |
| 판매일 | `LastSaleDate` | — | `products.last_sale_date` | 최근 판매 | Product_List 만 |
| 상품분해 identity | `PPCode` (추정) | `PPCode` | — | 하위 분해 PCode | 1.8% non-null · 노이즈 수준 |
| 위치 | `LocationName` | `LocationName` | `products.display_location` | 진열 위치 | **동일** |

### 핵심 교차 결론
1. **상품 마스터 성격**(product_name, supplier, category, unit, sale_status, current_stock, purchase_price, location) 는 Product_List 와 Inventory_Status 가 **완전 중복**. SSOT=Product_List (현재 Product Sync 로 처리).
2. **재고 변동량**(BuyStock/SaleStock/BuyReturnStock/… 20여개) 는 Inventory_Status 전용. Supabase 쪽은 XLSX 기반 `stock_history` 가 유일 대응이지만 **기간 정의가 상이** (ERP 당월 집계 vs XLSX 사용자 지정 period). 현재는 서로 **별 소스**로 공존, 자동 sync 코드 없음.
3. **매입거래 identity**(BmCode/ROWNUM) 는 Buy_Status 전용 (Inventory_Status 는 집계값만 반환, 전표 단위 X).

---

## [8] 결론

### A. 기존 Supabase 컬럼만으로 바로 매핑 가능한 것 (MATCH)

#### Buy_Status → `purchase_details` (whitelist 완료 · migration SQL 승인 후 즉시 가능)
| ERP | Supabase | 상태 |
|---|---|---|
| BuyDate | purchase_details.purchase_date | MATCH |
| CtCode | purchase_details.supplier_code | MATCH |
| CorpNameView | purchase_details.supplier_name | MATCH |
| ProductName | purchase_details.product_name | MATCH |
| Specification | purchase_details.spec | MATCH |
| StockCnt | purchase_details.quantity | MATCH |
| UnitCost | purchase_details.unit_price | MATCH |
| BuyPrice | purchase_details.amount | MATCH |
| BuyTax | purchase_details.vat | MATCH |
| BuyTotal | purchase_details.total | MATCH |
| PCode (**변환**) → BarCode | purchase_details.product_code | MATCH (PCode→BarCode 변환 후) |

#### Inventory_Status → `products` (상품 마스터 성격만, 집계값은 저장 안 함)
| ERP | Supabase | 상태 |
|---|---|---|
| PCode | products.pcode (identity, UPDATE 금지) | MATCH |
| ProductName | products.product_name | MATCH |
| UnitCode | products.unit | MATCH |
| IsSaleStatusName | products.sale_status | MATCH |
| CtCode | products.supplier_code | MATCH |
| CCorpName | products.supplier | MATCH |
| McateName | products.category | MATCH |
| LocationName | products.display_location | MATCH |
| CostPrice | products.purchase_price | MATCH |

> Inventory_Status 를 통한 상품 마스터 sync 는 Product_List 와 **거의 100% 중복**이므로, **별도 sync 구현 불필요** (Product Sync 가 이미 커버).

---

### B. ERP 에만 있고 Supabase 에 없는 것 (NO_TARGET)

| ERP 필드 | 설명 | 조치 |
|---|---|---|
| Buy_Status.BmCode | 매입 전표 ID (unique key 1/2) | **Migration 필요** · `supabase/migrations/future_phase2_erp_sync_bm_code_row_num.sql` 수동 승인 대기 |
| Buy_Status.ROWNUM | 매입 라인 번호 (unique key 2/2) | **Migration 필요** · 상동 |
| Buy_Status.UnitCode | 매입 라인 단위 | NO_TARGET · 저장 결정 유보 (현재 purchase_details 에 단위 컬럼 없음) |
| Inventory_Status.BuyStock | 기간 매입 집계 | NO_TARGET · stock_history 기간 정의 상이 (사용자 지시 "새 history 설계 금지") |
| Inventory_Status.BuyReturnStock | 기간 매입반품 집계 | NO_TARGET · 상동 |
| Inventory_Status.SaleReturnStock | 기간 판매반품 집계 | NO_TARGET · 상동 |
| Inventory_Status.PlusStock/MinusStock | 수동 재고 가감 | NO_TARGET · 상동 |
| Inventory_Status.SubdivisionPlus/Minus | 분해 가감 | NO_TARGET · 의미 확인 선행 필요 |

---

### C. Supabase 에만 있고 ERP 에 없는 것 (DB_ONLY)

| 테이블 | 컬럼 | 소유권 |
|---|---|---|
| purchase_details | id | serial PK |
| purchase_details | imported_at | 감사 메타 (PROTECTED) |
| purchase_details | period_start_date, period_type | XLSX 기간 upload 전용 |
| purchase_details | verified_by, verify_status, verify_note, verified_at, verified_expiring, expiry_date | 사용자 검수 (**PROTECTED**) |
| products | current_stock | Product_List.NowStock SSOT (Inventory_Status 로는 계산 X) |
| products | stock_amount, optimal_stock, optimal_stock_backup, stock_note, memo, hidden | 사용자 운영 (PROTECTED) |
| stock_history | 전 24 cols | XLSX 월별 스냅샷 전용 (ERP sync 코드 0건) |
| inventory_checks | store*_stock, warehouse*_stock, shelf_positions, store*_zone, expiry_date | 사용자 실사 (**PROTECTED**) |

---

### D. 의미 확인 필요 (POSSIBLE)

| ERP 필드 | Supabase 후보 | 확인 포인트 |
|---|---|---|
| Buy_Status.ConfirmDate | — | ERP 매입 "확정" 시각이 purchase_details.verified_at (사용자 검수) 과 **다른 개념**임을 유지할지, 신규 column (예: `confirmed_at`) 를 열지 결정 |
| Buy_Status.RegDate / EditDate | — | 전표 등록/수정 시각 저장 여부 결정 |
| Buy_Status.UserID / ConfirmUserID / EditUserID | — | 감사 로그 column 추가 여부 |
| Buy_Status.DamDang / DamDangName | — | 벤더 담당자 저장 위치 (vendors.manager_name 또는 신규) |
| Buy_Status.LcateName / McateName / ScateName | — | 매입 시점 분류 보존 여부 (상품 분류 변경에 영향받지 않는 historical 분류) |
| Inventory_Status.IsTax / TaxPercent | — | 상품 과세구분 저장 여부 (현재 stock_history.tax_type 만 존재, 상품 마스터 쪽은 없음) |
| Inventory_Status.IsBuyerType | — | 매입 유형 저장 (vendors 쪽? products 쪽?) |
| Inventory_Status.PrvStock / BuyStock / SaleStock / ProductUseStock | stock_history.* | 기간 정의 통일 가능한지, 또는 ERP 당월 집계만 별도 테이블 필요한지 결정 |
| Inventory_Status.BuyReturnStock / SaleReturnStock | — | 반품을 별도 column 으로 분리 저장할지, (−) 부호로 흡수할지 |
| Inventory_Status.PlusStock / MinusStock | stock_history.adjustment_qty | 부호 통합 저장 vs 분리 저장 (현재 adjustment_qty 는 단일 컬럼) |
| Inventory_Status.SubdivisionPlus / SubdivisionMinus | products.individual_code / individual_quantity (?) | 분해 상품 관계 메타가 products 쪽에 이미 있는지 vs 거래 로그로 저장할지 |
| Inventory_Status.PPCode | — | 하위분해 상품 identity. products 쪽 분해 관계 모델링 필요 시 재검토 |

---

### E. 저장 불필요 (IGNORE_CANDIDATE)

- **단일 테넌트/매장 상수**: CorpCode(=30009), StCode(=000), StorageName(=용인점), BuseoCode(=1826), BuseoName(=기타)
- **전수 null / 공백**: Buy_Status.{IsSupport, Remark, DcateName, ReturnCodeName, MakeDay, ExpiryDay, Identification, CorpBizNo(=더미)}, Inventory_Status.{DcateName, CostPrice2, ConfirmDate2, CostPrice4, StorageMoveIn/Out/AutoIn/AutoOut, ProductReturnUseStock, ProductBadStock, ProductReturnBadStock}
- **파생 가능 / 중복**: Buy_Status.{BuyMonth(BuyDate 파생), TotalCnt(ROWNUM 집계), TotalStock(StockCnt int 캐스트), UnitSale(판매가 참고치), TaxExemption(전수 0), ProductWeight(전수 0), Lcate(LcateName 코드쌍), IsStatus/IsStatusName(=9/매입완료 고정 filter)}, Inventory_Status.{PPCode(1.8% non-null · 노이즈), CostPrice1/3+ConfirmDate1/3(이력 변동 저장 금지), LcateName(전수 코스트팜약국), ScateName(공급처명과 중복)}
- **단일점포 상수**: Inventory_Status.{StorageMove*}

---

## 추가 발견 사항

1. **Buy snapshot 캐시 상태**: `candidate.json.gz` 는 2026-10-04 09:31 KST 생성 당시 `rowCount=0` (ERP 호출이 당일 매입만 조회하도록 default 되어 있고 호출 시점 당일 매입 없었음). **Fiddler raw buy-response.txt 는 2026-10-04 11:27 KST 캡처분이 200 rows 로 유효** → 본 audit 는 Fiddler raw 를 decoder 로 재디코드한 결과 사용.
2. **코드/schema gap 확인**:
   - `src/shared/erp/erpSyncWhitelist.ts` + `erpBuyMapper.ts` + `buySyncRunner.ts` 는 완성되어 있으나 live `purchase_details` 에 **bm_code / row_num 컬럼 미생성** → runner 가 `blocked=true, blockReason="MIGRATION_REQUIRED"` 반환.
   - 즉 Buy_Status sync 는 **"migration 1개 수동 승인 즉시 실행 가능"** 상태.
3. **Inventory_Status 는 저장 매핑 자체가 코드에 없음**: ERP SOAP 호출 (`iregenSoap.ts:queryInventoryStatus`), snapshot 저장 (`erp-cache/inventory-status/`) 까지만 구현. UI 는 조회만 (`ErpSection.tsx`). stock_history 로의 변환/저장 코드 0건. 현재 "조회 전용"이 설계 상태.
4. **12,939 기존 purchase_details**: `bm_code=NULL, row_num=NULL` 로 유지 예정 (migration 코멘트 L12-13, 사용자 지시 "과거 데이터 KEEP").
5. **사용자 2026-10-03 재확정 유지**: current_stock SSOT = Product_List.NowStock. Inventory_Status 42-col 공식으로 재계산 **금지**. 본 audit 결론과 일치.

---

## 참고 파일 (READ ONLY)

- ERP Buy: `tools/iregen-bridge/samples/buy-response.txt` (Fiddler raw, 200 rows)
- ERP Buy snapshot: `%APPDATA%/megatown-sync-agent/erp-cache/buy-status/candidate.json.gz` (2026-10-04 09:31, 0 rows)
- ERP Inventory snapshot: `%APPDATA%/megatown-sync-agent/erp-cache/inventory-status/candidate.json.gz` (2026-10-04 09:39, 4,007 rows)
- Decoder: `tools/iregen-bridge/bin/Debug/net48/iregen-decoder.exe`
- Buy sync 코드: `server/services/erpSync/buySyncRunner.ts`
- Buy mapper: `src/shared/erp/erpBuyMapper.ts`
- Whitelist: `src/shared/erp/erpSyncWhitelist.ts`
- Buy migration (대기): `supabase/migrations/future_phase2_erp_sync_bm_code_row_num.sql`
- Stock upload (XLSX): `server/routes/stock/stockManage/uploadStock.ts`

---

**END OF AUDIT**
