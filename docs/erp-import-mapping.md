# ERP ↔ Excel Import ↔ Supabase · PHASE 1 최종 분석

**작성일**: 2026-10-03 · **상태**: PHASE 1 분석 완료 · **PHASE 2 READY: NO**
**업데이트**: 2026-10-03 저녁 · Location 정책 정정 · identity 비교 재해석 · READ ONLY 유지

---

## ⚠️ 2026-10-03 저녁 · 사용자 지시 재해석 (중요)

이전 보고의 다음 두 가지는 **잘못된 전제** 였으므로 폐기한다.

| 폐기된 표현 | 사유 |
|---|---|
| `ERP PCode ↔ Supabase product_code 매칭 0 · CRITICAL blocker` | PCode (ERP 내부번호) 와 Supabase product_code (BARCODE) 는 **원래 다른 체계** · 매칭 0 은 당연 |
| `LocationName → display_location · ERP_OWNED 확정` | LocationName 전체 문자열 그대로 저장 아님 · ERP 는 **대분류>중분류>소분류>세분류** 계층 · 업무규칙은 **대분류+중분류 → display_location** 변환 |

**현재 올바른 identity 비교**:
`ERP Product_List.BarCode (col[88]) ↔ Supabase products.product_code (= BARCODE)`

**현재 올바른 Location 변환**:
`ERP 대분류 + 중분류 (전각 Ａ/Ｂ → 반각 A/B 정규화) → products.display_location`

**사용자 Location 플로우 확정 (2026-10-03 저녁 메시지)**:
```
[초기화 전]   = 현재 display_location → 분석/비교 전용 · 변경 금지
[초기 데이터 구축]
              = ERP 대분류+중분류 → 변환 → display_location (일회성 적용 · 사용자 승인 후)
              = 벽+21 → "21"
              = 6매대+A → "6A"
              = 6매대+B → "6B"
              = 웹서비스의 새 진열위치 기준
[초기화 후]   = ERP → Location Sync → display_location → 웹서비스 (지속 Sync)
```

---

## ✅ 2026-10-03 저녁 Product_List 1회 조회 완료 (concurrency=1)

- Endpoint: `SvcProductBiz.asmx` · SOAPAction: `Product_List`
- Snapshot: `data/snapshots/product-list-2026-10-03.json` (6.2MB+)
- Rows: **4,007** (PCode unique · duplicate=0 · empty=0)
- Pages: 81 (pageSize=50, last page 7 rows)
- Elapsed: 232.6s (concurrency=1, 평균 soap+decode 300~5000ms per page · retry 0건)
- Primary table: `Table1` · **102 columns 전수 확보**
- Metadata table: `Table` · Column1="4007" (totalCount)
- ERP 서버 영향: 1회 호출만 수행 · 재조회 없이 모든 분석 재사용 중

### Buy_Status 1회 조회 완료 (2026-10-03)
- Endpoint: `SvcBuyBiz.asmx` · SOAPAction: `Buy_Status`
- Snapshot: `data/snapshots/buy-status-2026-10-03.json`
- Rows: 5 (문서 BmCode=`12261003000009`, 라인 ROWNUM 1~5)
- 사용자 ERP 화면 검증값 **완전 일치**:
  - PCode 10805(비티엘라) 10/242,000 · 10812(훼마틴) 10/330,000 · 12031(츄어블비타민D) 10/143,000 · 12035(젤리잘크톤망고) 10/165,000 · 12036(젤리잘크톤블루) 10/165,000
  - 합계: 50 qty · **1,045,000원** ✓
- Primary columns: 51 · unique key 후보 확정

---

## 🎯 Product Identity · OPTION A 추천 확정 (근거 확보)

### ERP BarCode field 분석

| 항목 | 값 |
|---|---|
| Field | `Product_List.BarCode (col[88]) · System.String` |
| Non-empty | **4,007 / 4,007 (100%)** |
| Empty | 0 |
| Unique | 4,007 |
| Duplicate | 0 |
| Non-numeric | 4 (`S0033279537634` 등 특수 코드) |
| Length distribution | 8:47 · 11:1 · 12:95 · **13:3,214 (80%)** · 14:255 · 15:1 · 16:391 · 20:3 |
| PCode : BarCode cardinality | **1:1 (완벽)** |

### ERP BarCode ↔ Supabase products.product_code

| 비교 | 값 |
|---|---|
| ERP BarCode non-empty | 4,007 |
| Supabase products | 7,078 |
| **Exact Barcode Match** | **3,732 (93.1%)** |
| ERP Only (Supabase 없음) | 275 |
| Supabase Only (ERP 없음) | 3,346 |
| **BARCODE_CONFLICT** (같은 Barcode·다른 상품명) | **0** |
| Name conflict samples | 0 |

### 추천: OPTION A 확정
```
products.product_code  ↔  ERP Product_List.BarCode
                         (추가 column 없음 · 매핑 테이블 없음 · 다중 Barcode 없음)
```

- 상품 identity 전략 blocker **해소**
- ERP PCode 저장 **불필요** (BarCode 로 완전 식별)
- erp_pcode column 추가 **불필요**
- product_barcodes 다중 테이블 **불필요** (1 PCode : 1 BarCode 100%)

### Product_List vs Inventory_Status row count 차이 해명

| | Rows |
|---|---|
| Product_List (SvcProductBiz) | **4,007** |
| Inventory_Status (SvcInventoryBiz) | 4,070 |
| Both | 4,006 |
| Product_List Only | 1 (PCode=15431 "제놀원 카타플라스마" · 조회시점 신규) |
| Inventory_Status Only | 64 (전부 SaleStatus="판매중" · Inventory 가 상품외 재고도 포함) |

→ Product_List 는 `IsSaleStatus=1` filter 로 좀 더 좁은 집합 · 사실상 동일 데이터 소스

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

**LocationName → display_location (2026-10-03 저녁 정정)**: `ERP_DERIVED` **후보** · 자동 overwrite 전 영향분석 필수. 실측 결과 ·
- ERP ↔ Supabase ProductName 매칭 2,950 상품 중 · ERP-derived display_location 과 Supabase display_location **exactSame=36 (1.2%) · different=514 (17.4%)** · DB empty + ERP has = 1,574 (53.4%) · ERP empty + DB has = 56 (1.9%)
- `products.location` · `products.display_location` 100% 동기 (3,175 상품 모두 `location === display_location`) · ERP sync 시 **양쪽 동시 갱신 필수** (아니면 UI 가 stale `location` 읽음 · `src/lib/productLocation.ts` location 우선)
- `location_assigned_at` 컬럼 **실제 DB 에 없음** (문서 유령 참조 · 정정)
- `inventory_checks.shelf_positions` 3,400 rows 모두 non-null · 창고 class flip (w1↔w2) 40 건 · neither-class 77 건 · fromNone 1,571 건 (shelf_positions 자동 재생성 범위)

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

**사용자 지시 (2026-10-03 · 추천 보류)**: ~~옵션 A/B 결정~~ · **1순위는 Product_List 102 col 안 바코드 field 확인**. 바코드 발견 시 ·
- 그대로 `products.product_code` ↔ ERP BarCode 직접 매칭 (추가 column X)
- 수천 건 자동 매칭 가능 예상

바코드 없을 때만 옵션 B (erp_pcode column 추가) 또는 C (매핑 테이블) 재검토.

**다음 action**: `npm run dev` 재시작 → 사업장 상품관리 조회 (concurrency=1) → 터미널 로그 `[iregen] Primary table 전체 102 columns:` 공유.

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

## 📋 Product_List 102 columns 전수 확정 (2026-10-03 저녁)

```
[  0] StCode             String   · 매장 코드 (000)
[  1] PCode              String   · ERP 내부 상품번호 (ERP_IDENTITY)
[  2] ProductName        String   · 상품명                                       → ERP_OWNED
[  3] Specification      String   · 규격 (UNCERTAIN · DB spec 거의 미사용)
[  4] GoodsName          String   · (UNCERTAIN)
[  5] GoodsSubName       String   · (UNCERTAIN)
[  6] ProductName_pop    String   · POP 상품명 (UNCERTAIN)
[  7] ProductTypeName    String   · 상품유형명
[  8] ProductGubunName   String   · 구분명
[  9] OptionViewTypeName String   · 옵션 뷰 타입
[ 10] IsWeight           String   · 중량 여부
[ 11] WeightName         String   · 중량명
[ 12] WeightCode         String   · 중량 코드
[ 13] StockName          String   · 재고명
[ 14] TaxName            String   · 과세구분명
[ 15] IsStock            String   · 재고 사용 여부
[ 16] TaxPercent         Int16    · 과세율
[ 17] UnitCode           String   · 단위                                          → ERP_OWNED
[ 18] UnitStock          Int32    · 단위 재고
[ 19] WeightCostUnit     String   · 중량 비용 단위
[ 20] IsProductType      String   · 상품유형 여부
[ 21] IsBottle           String   · 공병 여부
[ 22] BottlePrice        Int16    · 공병 가격
[ 23] NowStock           Int64    · ERP 전산 실시간 현재고 → products.current_stock · ERP_OWNED ★ 확정 2026-10-03
[ 24] CostPrice          Decimal  · 매입단가                                       → ERP_OWNED (97%+ 입력)
[ 25] CtCode             String   · 공급사 코드                                    → ERP_OWNED
[ 26] CorpNameView       String   · 공급사명                                       → ERP_OWNED
[ 27] PriceA             Decimal  · 판매가 A (= Supabase sale_price · 94.8% match) → ERP_OWNED
[ 28] PriceB             Decimal  · (0 전수 · NOT_USED)
[ 29] PriceC             Decimal  · (0 전수 · NOT_USED)
[ 30] PriceD             Decimal  · (0 전수 · NOT_USED)
[ 31] IsSalesStore       String   · 판매 가능 여부
[ 32] EvCostUnit         Decimal  · (0 전수 · NOT_USED)
[ 33] EvSaleUnit         Decimal  · (0 전수 · NOT_USED)
[ 34] IsPriceLock        String   · 가격 잠금
[ 35] Horizontal         Int32    · 가로 (UNCERTAIN)
[ 36] Vertical           Int32    · 세로 (UNCERTAIN)
[ 37] Height             Decimal  · 높이 (UNCERTAIN)
[ 38] Volume             Int32    · 부피 (UNCERTAIN)
[ 39] WeightPriceUnit    String   · 중량 가격 단위
[ 40] LcateName          String   · 대분류                                         → ERP_OWNED (category 후보)
[ 41] McateName          String   · 중분류                                         → ERP_OWNED (category 후보)
[ 42] ScateName          String   · 소분류                                         → ERP_OWNED (category 후보)
[ 43] DcateName          String   · 세분류                                         → ERP_OWNED (category 후보)
[ 44] CateGubunOneName   String   · (NOT_USED)
[ 45] CateGubunTwoName   String   · (NOT_USED)
[ 46] Maker              String   · 제조사                                         → ERP_OWNED (manufacturer 후보)
[ 47] Brand              String   · 브랜드                                         → ERP_OWNED (brand 후보)
[ 48] Orgin              String   · 원산지 (UNCERTAIN · DB origin 매핑)
[ 49] IsStandingPoint    String   · 유통점 여부
[ 50] ProductFee         Decimal  · 상품 수수료
[ 51] KeepingRuleName    String   · 보관 규칙명
[ 52] BuseoCode          Int32    · 부서 코드
[ 53] BuseoName          String   · 부서명
[ 54] Damdang            String   · 담당자 ID
[ 55] DamdangName        String   · 담당자명
[ 56] DamdangSub         String   · 부담당자 ID
[ 57] DamdangSubName     String   · 부담당자명
[ 58] IsPoint            String   · 포인트 여부
[ 59] IsAddPoint         String   · 추가 포인트
[ 60] PointAdd           Int32    · 포인트 추가값
[ 61] IsOrderType        String   · 주문 타입
[ 62] LimitTime          String   · 제한 시간
[ 63] IsDevDayType       String   · 발주일 타입
[ 64] DevDDay            Int32    · 발주 D-Day
[ 65-71] DevMon~DevSun   String   · 요일별 발주 (NOT_USED)
[ 72] MakeDayName        String   · 제조일 라벨
[ 73] ExpiryDayName      String   · 유통기한 라벨
[ 74] IdentificationName String   · 식별 라벨
[ 75] UniPassName        String   · UniPass 라벨
[ 76-81] EtcTxtField1~6  String   · 사용자 정의 텍스트
[ 82-84] EtcIntField1~3  Int32    · 사용자 정의 숫자
[ 85] IsAutoCostUpdate   String   · 매입가 자동 갱신 여부
[ 86] LastBuyDate        String   · 마지막 매입일                                  → ERP_OWNED (last_purchase_date)
[ 87] LastSaleDate       String   · 마지막 판매일                                  → ERP_OWNED (last_sale_date)
[ 88] BarCode            String   · ★★★ 바코드 (ERP_IDENTITY) · 100% non-empty · 1:1 PCode ★★★
[ 89] BuyStatusName      String   · 매입 상태명
[ 90] SaleStatusName     String   · 판매 상태명                                    → ERP_OWNED (sale_status)
[ 91] LocationName       String   · 진열위치 (대분류>중분류>소분류>세분류)         → ERP_DERIVED (대분류+중분류 변환)
[ 92] IsPopName          String   · POP 사용 여부
[ 93] Memo               String   · ERP 메모 (주의 · DB memo 와 완전 분리 · DB memo = PROTECTED)
[ 94] UserID             String   · 등록자 ID
[ 95] UserName           String   · 등록자명
[ 96] RegDate            String   · 등록일시
[ 97] EditUserID         String   · 수정자 ID
[ 98] EditUserName       String   · 수정자명
[ 99] EditDate           String   · 수정일시
[100] RegStorageName     String   · 등록 매장명
[101] ROWNUM             Int64    · DB 조회 순번 (서버측 pagination · NOT_USED)
```

**Confirmed mapping** (Inventory_Status 와 공통 field 기반):
```
PCode             → 상품코드    → ERP 내부 식별자 · Supabase product_code 아님 · 보관 여부 미정 (erp_pcode 추가 보류)
ProductName       → 상품명      → products.product_name              · ERP_OWNED (NULL overwrite 금지)
CCorpName         → 공급사      → products.supplier                   · ERP_OWNED (vendors 테이블 보호)
CtCode            → 공급사코드  → products.supplier_code              · ERP_OWNED
CostPrice         → 매입단가    → products.purchase_price (4% · 거의 미사용) · UNCERTAIN · 사용자 결정
UnitCode          → 단위        → products.unit                       · ERP_OWNED
IsSaleStatusName  → 판매상태    → products.sale_status                · ERP_OWNED (hidden 과 분리)
LocationName      → (대분류+중분류 변환) → products.display_location + products.location · ERP_DERIVED (영향분석 통과 전 보류)
McateName (추정)  → 분류        → products.category                   · ERP_OWNED
BarCode (102 col) → 바코드      → products.product_code 와 직접 비교  · identity 결정 핵심 (수집 대기)
```

### Location 변환 규칙 (사용자 확정 2026-10-03 저녁 · ERP 화면 "로케이션 상품 등록" 기준)

```
IF 대분류 == "벽":
   display_location = 중분류 (전각 Ａ/Ｂ → 반각 A/B)
   예: "벽>21>전체>전체" → "21"

ELSE IF 대분류 ~ /^([0-9]+)매대$/:
   display_location = 숫자 + 중분류 (전각 Ａ/Ｂ → 반각 A/B)
   예: "6매대>Ａ>7열>전체" → "6A"
       "1매대>B>2열>전체"  → "1B"

ELSE: UNSPEC (뷰티·냉장고 등) · 사용자 결정 대기
   예: "뷰티>1번>오른쪽>1열" → ?
       "냉장고>전체>전체>전체" → ?
       "6매대>뒤>...>..." → "6뒤" (isValidZoneCode 통과 못함 · neither)
```

**ERP 전체 상품 변환 통계 (Inventory_Status 4,070 기준)**:
- Transformable (벽/N매대): **3,069 (75.4%)**
- Empty LocationName: **824 (20.2%)**  ← ERP "로케이션 미지정 상품목록"
- Unspec Major (뷰티 156 · 냉장고 21): **177 (4.4%)**
- No middle: 0
- Full-width Ａ/Ｂ: 923 / 891 · Half-width A/B: 87 / 112 → 정규화 필수
- 1매대 는 전부 반각 A/B · 2~9매대 는 전부 전각 Ａ/Ｂ · 사람 수동 입력 흔적

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
| `location` | shelf_positions 자동 배정 · productLocation.ts 1순위 | **ERP_DERIVED 후보** (display_location 과 100% 동기) · ERP sync 시 양쪽 동시 갱신 또는 location 신규 ERP sync 범위에서 명시 보호 결정 필요 |
| `display_location` | 진열위치 조회 · display_request 매칭 · xlsx 임포트 시 location 쪽에도 동시 저장 | **ERP_DERIVED 후보** · 영향 분석 결과: ERP-derived 전환 시 1,571 상품에 신규 location 부여 · 514 상품 변경 · 40 상품 창고 class flip · 77 상품 none(유효코드 아님) · PATCH 흐름이 shelf_positions 자동 재배정 트리거 (`server/routes/stock/products.ts:1156`) · sync 경로 설계 시 이 로직 포함 필수 |
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
