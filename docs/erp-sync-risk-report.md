# ERP Sync · 위험 요소 전수 조사 보고서

**작성일**: 2026-10-03 · **상태**: PHASE 1 완료 분석 후 작성 · **PHASE 2 WRITE 전 반드시 참조**
**업데이트**: 2026-10-03 저녁 · Product_List 1회 조회 완료 · Buy_Status 검증 완료 · identity blocker 해소 · retry 정책 격차 신규 발견

---

## 🎯 2026-10-03 저녁 상태 변경 요약

| Risk | 이전 | 저녁 상태 |
|---|---|---|
| C-1 ERP Barcode field 미확인 | 🔴 CRITICAL | ✅ **해소** · `Product_List.BarCode (col[88]) · 100% non-empty · 1:1 PCode` |
| H-1 Product_List 102 col 미수집 | 🟠 HIGH | ✅ **해소** · 전수 확보 · snapshot 저장 |
| H-5 Buy_Status 중복 매입 INSERT 위험 | 🟠 HIGH | ✅ **해소** · unique key `(BmCode, ROWNUM)` 확정 |
| H-4 display_location ERP_DERIVED 전환 영향 | 🟠 HIGH | 🔄 Barcode 기준 재분석 완료 · 뷰티/냉장고 규칙만 남음 |
| H-3 sale_price overwrite 위험 | 🟠 HIGH | 🔄 PriceA = sale_price exact 94.8% 확인 · 189 different 는 사용자 결정 |

**신규 발견**:
- 🟡 **M-7 Retry 정책 격차** · 현재 코드 1s/2s/포기 · 사용자 지시 30s/60s/120s/abort · 반드시 변경 필요
- 🟡 **M-8 ERP Memo vs DB memo 분리** · Product_List.Memo (col[93]) 와 Supabase products.memo 는 완전 다른 field (DB memo = PROTECTED 유지)

**원칙**: 발견했다고 임의 수정 X · 보고만. 사용자 지시가 명확히 올 때까지 코드 변경 금지.

---

## 🔴 CRITICAL (즉시 해결 전엔 PHASE 2 진입 불가)

### C-1 · ERP Barcode field 미확인 (상품 identity 전략 blocker)

**사용자 지시 61번 반영 · 2026-10-03 재해석**:
~~"ERP PCode ↔ Supabase product_code 매칭 = 0 · CRITICAL"~~
→ **잘못된 전제**. ERP PCode (5자리 내부번호) 와 Supabase product_code (13자리 Barcode) 는 **원래 다른 체계**. 매칭 0 은 당연한 결과.

**올바른 비교**: ERP **Barcode field** (Product_List 102 col 중) ↔ Supabase `products.product_code`

**현재 상태** ·
- Inventory_Status 42 col 안에 **Barcode field 없음 확정** (PPCode 는 PCode 와 self-reference · 바코드 아님)
- Product_List 102 col 중 Barcode field 존재 여부 **미확정** (snapshot 없음)
- 저희 환경에서 ERP 재호출 불가 (사용자 지시 59번 · ERP 부하 최소화)

**발생 가능 문제** ·
- Product_List 안에 Barcode field 가 있으면 → `products.product_code` 와 직접 매칭 가능 · 수천 건 일치 예상 · 추가 column 불필요
- 없으면 → ProductName 72% + 수동 매핑 필요 · migration 요구

**관련 table/column** · `products.product_code` (= Barcode · 유지) ·  Product_List `?BarCode?` (수집 대기)

**권장 대응** (사용자 지시 반영):

| 옵션 | 설명 | 적용 조건 |
|---|---|---|
| **A** (추천) | `products.product_code` ↔ ERP Barcode 직접 매칭 · 추가 column 없음 | Product_List 안에 Barcode field 있을 때 |
| **B** | `products.erp_pcode` nullable column 신규 추가 | A 가 가능해도 PCode 보관 필요 시 (선택) |
| **C** | 별도 매핑 테이블 `erp_product_mapping (erp_pcode, barcode)` | 1 PCode : N Barcode 다중 체계일 때 |
| **D** | 다중 Barcode table `product_barcodes` | 상품 1 : 바코드 N 구조 확인 시 |

**사용자 지시 (2026-10-03)** · erp_pcode column 추가 **보류**. Product_List 102 col 수집 후 결정.
| **C** · ProductName fuzzy 매칭 | 72% 자동 + 28% 수동 · 동명이상품 위험 |
| **D** · ERP 데이터 별도 테이블 분리 (snapshot) | 기존 products 와 분리 · UI 통합 어려움 |

**추천 (2026-10-03 수정)**: ~~옵션 B~~ 보류. **Product_List 102 col 안 Barcode field 수집이 1순위**. 바코드 발견 시 옵션 A (products.product_code 유지 · 추가 column X).

---

## 🟠 HIGH

### H-1 · Product_List 102 col 중 바코드 field 미확인
**현재 구조**: Inventory_Status 42 col 에는 바코드 field 없음 (PPCode = PCode). Product_List 102 col 안에 `JAN_Code` · `BarCode` · `ProductBarCode` 같은 전용 field 있을 가능성 매우 높음.

**발생 가능 문제**: 바코드 field 가 Product_List 에 있다면 자동 매핑 가능 (옵션 A/B 가 훨씬 쉬워짐). 모르면 ProductName 매칭 72% 로 운영 → 28% 수동.

**관련**: `Product_List.?BarCode?`

**권장 대응**: 사용자 터미널 로그 공유 · 102 col 전체 확인 (저번 커밋 `495208f4` 로그 활성화 상태)

### H-2 · ProductName 매칭 동명이상품
**현재 구조**: ERP 4,070 상품 중 2,950 이 Supabase ProductName 과 1:1 매칭. 하지만 ERP 안에서도 동일 ProductName 중복 가능성 미확인 (조사 안 함).

**발생 가능 문제**: 동명이상품 (예: "박카스" 125ml vs 200ml) · 잘못된 매핑 · 가격/재고 crosstalk

**관련**: `products.product_name` · `Product_List.ProductName`

**권장 대응**: PHASE 2 매핑 전 ·
1. ERP 안 ProductName duplicate 조사
2. Supabase 안 ProductName duplicate 조사
3. 매핑 시 `(ProductName, supplier)` 조합 사용 가능 여부 검증

### H-3 · Supabase 가격 column 거의 미사용
**현재 구조**:
- `products.purchase_price` non-null: **289 / 7,078 (4%)** ⚠
- `products.sale_price` non-null: 5,850 (82%)
- 실제 매입가는 `purchase_details.unit_price` 사용

**발생 가능 문제**: ERP CostPrice 로 products.purchase_price 를 매번 덮으면 4% 데이터는 ERP 값으로, 나머지 96% 는 신규 생성. **동작 자체는 OK 지만 "ERP 가 매입가 소유" 란 가정이 맞는지 사용자 확인 필요**.

**관련**: `products.purchase_price` · `purchase_details.unit_price`

**권장 대응**: PHASE 2 전 ·
- "products.purchase_price = ERP CostPrice 매번 덮기" vs "purchase_details.unit_price 가 SSOT" 중 선택
- 사용자가 UI 에서 purchase_price PATCH 하는 흐름 있는지 확인

### H-4 · display_location · ERP 계층 → 변환 규칙 (2026-10-03 저녁 **정정 · 재분석**)

**정정 요약**: 이전 보고의 `LocationName → display_location · ERP_OWNED` 는 폐기. ERP 화면 (로케이션 상품 등록) 은 `대분류/중분류/소분류/세분류` 4-depth 계층이며, 사용자 업무규칙은 `대분류 + 중분류` 만을 `display_location` 으로 변환한다.

**현재 구조 재확인**:
- ERP LocationName 포맷: `"대분류>중분류>소분류>세분류"` (4-depth · `>` 구분자)
- Supabase `products.display_location` 포맷: `"21"` · `"6A"` · `"8B"` · `"24"` · `"7B"` 등 1~4자리 zone code (`isValidZoneCode` 통과값)
- Supabase `products.location` : `display_location` 과 100% 동기 (`loc_eq_display=3,175 · loc_ne_display=0`) · `src/lib/productLocation.ts` 가 `location` 우선 fallback `display_location`

**변환 규칙 (사용자 2026-10-03 저녁 확정)**:
```
벽 + N  →  N           예: "벽>21>전체>전체" → "21"
N매대 + Ａ/Ｂ (전각)  →  NA/NB (반각 정규화)    예: "6매대>Ａ>7열>전체" → "6A"
N매대 + A/B (반각 · 1매대만)  →  NA/NB         예: "1매대>B>2열>전체" → "1B"
뷰티·냉장고·기타 → 사용자 결정 대기 (UNSPEC)
N매대 + 뒤/앞 → "6뒤"·"5앞" (isValidZoneCode 통과 못함 · neither-class)
```

**실측 통계** (Inventory_Status 4,070 상품 기준):
- Transformable: 3,069 (75.4%)
- Empty LocationName: 824 (20.2%) ← ERP "로케이션 미지정 상품"
- Unspec Major (뷰티 156 · 냉장고 21): 177 (4.4%)
- Parse 실패: 0

**ERP ↔ Supabase display_location 비교 (ProductName 매칭 2,950 상품)**:
- exactSame: **36 (1.2%)** ← ERP-derived 와 DB 가 이미 일치
- different: **514 (17.4%)** ← ERP-derived 가 DB 와 다른 값
- bothEmpty: 747 (25.3%)
- DB empty + ERP has: **1,574 (53.4%)** ← ERP sync 로 공란 상품에 location 부여 가능
- ERP empty + DB has: 56 (1.9%) ← 자동 null 처리 **금지** (사용자 수동 입력 보존)
- ERP unspec + DB has: 23 (뷰티·냉장고) ← 사용자 결정 전 보존

**발생 가능 문제**:
1. 자동 overwrite 시 514 상품 location 변경 → shelf_positions 자동 재배정 트리거 필요
2. 창고 class flip 영향 (실측): **w1↔w2 flip 40 상품** (`w1→w2`=10 · `w2→w1`=30), neither 전환 77 상품, fromNone 1,571 상품 → shelf_positions 구조(warehouse1/warehouse2 slot) 변동
3. 전각/반각 혼재 (전각 Ａ 923건 · 반각 A 87건) · 정규화 안 하면 `6Ａ ≠ 6A` 로 저장 → `isValidZoneCode` fail → shelf_positions 미생성
4. `products.location` ↔ `display_location` 동기 미유지 시 → `productLocation.ts` 가 stale `location` 반환 → UI 가 ERP 값을 못 보여줌
5. PATCH 흐름이 `inventory_checks.shelf_positions` 를 자동 재배정하는데 (`server/routes/stock/products.ts:1156`) · sync 경로가 이 로직 bypass 하면 shelf_positions 가 stale 로 남음

**관련 테이블/컬럼**:
- `products.display_location` · `products.location` (양쪽 동시 갱신 필수)
- `inventory_checks.shelf_positions` (3,400 rows 전수 non-null · buildInitialShelfPositions 재적용 필요)
- `src/shared/warehouseZones.ts::WAREHOUSE_1_CODES` (`"24","25","26","27","7B","8A"`)
- `location_assigned_at` **컬럼 실제 미존재** (문서 유령 참조 · 삭제됨)
- `stock_history` 에는 location 관련 컬럼 없음 (영향 없음)
- `purchase_details` 에도 없음 (영향 없음)

**권장 대응**:
- `products.display_location` · `products.location` Ownership = **ERP_DERIVED 후보** · 사용자 지시 명확화 후 확정
- 56 "ERP empty + DB has" · 자동 NULL overwrite **금지** (기본 KEEP EXISTING)
- 23 "ERP unspec (뷰티·냉장고) + DB has" · 뷰티·냉장고 변환 규칙 결정 전 **KEEP EXISTING**
- 전각 Ａ/Ｂ → 반각 A/B **정규화 필수**
- Sync 경로는 반드시 ·
  1. `display_location` + `location` 동시 UPDATE
  2. `buildInitialShelfPositions` 호출 · `inventory_checks.shelf_positions` 병합 (사용자 상세위치 보존)
  3. DRY-RUN · 변경 상품 개수 · 창고 flip 개수 · neither 변환 개수 사전 리포트
- `location_assigned_at` 문서 참조는 삭제 (실제 컬럼 없음)
- shelf_positions · PROTECTED 유지 (상세 슬롯값은 사용자 소유 · 자동 재배정은 "신규 슬롯 추가/빈 슬롯 유지" 로만)

### H-5 · Buy_Status 중복 매입 거래 INSERT 위험
**현재 구조**: Buy_Status 를 1시간마다 조회하면 **같은 매입 거래가 반복 조회**. 지금 `purchase_details` UPSERT key 는 `(purchase_date, supplier_code, product_code, quantity, amount)` · ignoreDuplicates.

**발생 가능 문제**: ERP 가 동일 상품을 2 건 매입 (같은 날 · 같은 수량 · 같은 금액) 하면 UPSERT key 가 충돌하여 **2번째 거래가 누락**. 또는 ERP 에서 문서번호 (DocIdx 등) 가 제공되면 그걸로 unique 해야 안전.

**관련**: `purchase_details` UPSERT · `Buy_Status.?DocNo?`

**권장 대응**: Buy_Status 전체 col 수집 후 **문서번호 field** 확인 → unique key 를 `(doc_no, product_code)` 로 전환

---

## 🟡 MEDIUM

### M-1 · optimal_stock 100% 운영 데이터 보호
**현재 구조**: 7,069 / 7,078 (99.9%) 상품이 사용자 입력 optimal_stock 보유. ERP 가 제공 안 함.

**발생 가능 문제**: ERP sync 가 UPSERT 전체 row 로 보내면 optimal_stock → NULL 로 wipe. 이미 `optimal_stock_backup` 복원 로직 있음 (products.ts:L515) · 하지만 신규 PHASE 2 UPSERT 가 그 로직 bypass 하면 위험.

**관련**: `products.optimal_stock` · `products.optimal_stock_backup`

**권장 대응**: PHASE 2 UPDATE payload 에 optimal_stock 포함 금지 · **PROTECTED whitelist 강제**

### M-2 · Supabase 7,078 상품 중 ERP 없음 4,000+
**현재 구조**:
- ERP: 4,070 상품
- Supabase: 7,078 상품
- Supabase Only: 7,078 (ProductName 매칭 전) · 4,122 (매칭 후)

**발생 가능 문제**: Supabase 에만 있는 4,000+ 상품은 ·
- 과거 ERP 에 있었지만 지금 판매중지
- 또는 웹 자체 등록 상품
- 또는 ERP 에서 삭제된 상품

**ERP sync 가 이들을 자동 DELETE 하면 재앙**. 사용자 지시 13 번 · 자동 DELETE **절대 금지**.

**관련**: `products` 전체 7,078

**권장 대응**:
- 자동 DELETE 영구 금지
- 향후 `ERP_MISSING` 상태 column 추가 (PHASE 3 이후)
- PHASE 2 는 INSERT/UPDATE 만 · DELETE 완전 제외

### M-3 · 숫자 field null vs 0 구분
**현재 구조**: ERP CostPrice 가 `0` 또는 `null` 또는 `"0.0000000000000"` 로 올 수 있음. Supabase `purchase_price` 는 NUMERIC nullable.

**발생 가능 문제**: `0` 이 "실제 0원" 인지 "미입력" 인지 구분 불가. ERP 가 `0` 보내면 Supabase 가 `0` 으로 저장 · 과거 수동 입력 값 손실.

**관련**: `purchase_price · sale_price · profit_rate · optimal_stock · current_stock` 등 모든 숫자 column

**권장 대응**: ERP 값이 `0 / "" / null` 이면 기존 값 유지 (사용자 지시 12 번 · NULL overwrite 금지 default 확장)

### M-4 · 날짜 timezone 변환 위험
**현재 구조**: ERP ConfirmDate1 예: `"2026-09-29T16:39:59.0000000"` (KST 추정 · ISO 포맷). Supabase 는 UTC TIMESTAMPTZ.

**발생 가능 문제**: UTC 변환 시 하루 밀림 (예: `2026-09-29 16:39 KST` → `2026-09-29 07:39 UTC` OK · 하지만 `2026-09-29 02:00 KST` → `2026-09-28 17:00 UTC` 로 전날 표시)

**관련**: ERP 날짜 field (ConfirmDate1-3 · last_purchase_date 등)

**권장 대응**: ERP 날짜는 KST 가정 · DATE column 은 KST 날짜만 추출 (YYYY-MM-DD) · timezone 변환 금지

### M-5 · 공급사 (supplier) 매핑
**현재 구조**:
- ERP CCorpName 예: `"라라컴퍼니"` + CtCode `"1134"`
- Supabase products.supplier (TEXT · 7,039/7,078 non-null · 공급사명)
- Supabase vendors.company_name (156 rows · 자체 운영 · password_hash · 연락처 등)

**발생 가능 문제**:
- ERP 공급사명으로 vendors 테이블의 연락처/메모를 자동 덮으면 데이터 손실
- ERP CtCode 와 vendors.id 가 매핑 안 되어 있음

**관련**: `products.supplier · products.supplier_code · vendors.*`

**권장 대응**:
- products.supplier · supplier_code 는 ERP_OWNED
- vendors 테이블은 **전체 PROTECTED** (ERP sync 영향 X · 별도 흐름)
- vendors 신규 매핑은 사용자가 UI 에서 수동

### M-6 · hidden 과 sale_status 혼용 방지
**현재 구조**:
- Supabase `products.hidden` (BOOL · 사용자 토글 soft-delete)
- Supabase `products.sale_status` (TEXT · "판매중"/"판매중지" 등)
- ERP IsSaleStatusName 은 sale_status 와 대응

**발생 가능 문제**: ERP IsSaleStatusName="판매중지" 를 받고 Supabase hidden=true 자동 변경하면 사용자 운영 혼란.

**권장 대응**:
- sale_status 는 ERP_OWNED (overwrite 가능)
- hidden 은 **PROTECTED** · ERP 변경 금지 (사용자 지시 8-H 번)
- UI 에선 hidden OR sale_status="판매중지" 를 모두 "숨김" 으로 표시 가능

---

## 🟢 LOW

### L-1 · product_code 공백/leading-zero/타입 혼용
**현재 구조**: Supabase product_code 길이 분포 매우 다양 (1~49자리 · `"26503"` 처럼 5자리도 1 개 있음).

**발생 가능 문제**: ERP PCode 5자리와 Supabase 짧은 code (1~5자리) 가 **우연히 겹치는 경우** 잘못된 매핑. 지금 매칭 결과 0 이지만 PHASE 2 매핑 테이블 설계 시 체크.

**권장 대응**: ERP sync 는 매핑 테이블 keys 로만 작동 · 우연 매칭 X

### L-2 · col_i 가 과세구분 역할
**현재 구조**: Supabase `col_i` non-null 5,714 (81%) · 값 `"과직"` 등. 상품 Excel 의 "I" 열 (과세구분) 그대로 저장. ERP IsTax 와 매핑 가능.

**발생 가능 문제**: 미미. 그냥 지금 매핑 대상 아님.

**권장 대응**: DEAD_COLS 포함 (products.ts 이미 그렇게 처리) · ERP sync 매핑 대상 제외

### L-3 · spec field 거의 미사용 (2 rows)
**현재 구조**: `products.spec` non-null = 2 (0.03%). 거의 전부 null.

**발생 가능 문제**: ERP Product_List 가 Spec field 를 제공하면 사용자가 UI 에서 지금은 안 보지만 저장되기 시작. 사용자 요구에 맞는지 확인 필요.

**권장 대응**: PHASE 2 전 사용자 결정 · Spec 를 ERP sync 로 채울지 결정

### L-4 · Inventory_Status closing_stock 계산 공식 미검증
**현재 구조**: Inventory_Status 42 col 안에 closing_stock 없음. 사용자 지시대로 PrvStock + 모든 이동 집계. 하지만 공식이 ERP 화면과 정확히 같은지 미검증.

**권장 대응**: PHASE 2 전 실제 ERP 화면과 몇 개 상품 재고 비교 검증 · 공식 확정

---

## ⚫ GLOBAL (전역 설계 원칙)

### G-1 · 자동동기화 concurrency 정책
- Product_List: **concurrency = 1** 강제
- Inventory_Status · Buy_Status: 동시 호출 금지 · 시간 분리
- 수동 UI (사람 테스트용) 5/3/1 radio 유지

### G-2 · 부분 실패 처리
- 4,070 상품 중 일부 pagination 실패 시 **전체 재조회** · 부분 반영 금지
- fetch → validate → diff → write 순서로 설계 (atomic batch)

### G-3 · 동시 실행 방지
- Product · Inventory · Buy sync 동시 실행 금지
- 향후 global lock (예: Supabase `sync_lock` row) 추가

### G-4 · DRY-RUN 필수
- PHASE 2 WRITE 전 반드시 DRY-RUN
- `INSERT N 건 · UPDATE M 건 · NO_CHANGE X 건 · ERP_ONLY Y · SUPABASE_ONLY Z`
- PROTECTED field changed = 0 반드시 확인

### G-5 · PHASE 2 WRITE 작업 순서 (사전 설계)
```
1. 매핑 테이블 생성 (사용자 승인 후)
2. ProductName 72% 자동 매핑 초기화 (DRY-RUN 결과 사용자 승인)
3. 수동 매핑 보완 UI (28% 를 사용자가 1:1 승인)
4. PHASE 2 scheduler · concurrency=1
5. DRY-RUN 결과 검증 후 WRITE
```

---

## 📋 CRITICAL BLOCKER 요약 (2026-10-03 저녁 최종 재분류)

| # | Risk | Status |
|---|---|---|
| C-1 | ERP Barcode identity | ✅ **해소** · Product_List.BarCode (col[88]) · 100% non-empty · 1:1 PCode · Supabase 매칭 93.1% |
| H-1 | Product_List 102 col 수집 | ✅ **해소** · 전수 확보 · snapshot 저장 (`data/snapshots/product-list-2026-10-03.json`) |
| H-4 | display_location ERP_DERIVED 전환 | 🔄 **부분 해소** · Barcode 기준 재분석 완료 · 뷰티(156)·냉장고(21)·앞뒤(16) 규칙 USER DECISION 대기 |
| H-5 | Buy_Status unique key | ✅ **해소** · `(BmCode, ROWNUM)` 확정 · BmCode="12261003000009" 샘플 검증됨 |
| M-7 | Retry 정책 격차 | 🟡 신규 · 현재 1s/2s/포기 → 사용자 지시 30s/60s/120s/abort (코드 변경 금지 상태) |

**남은 blocker**:
- 뷰티·냉장고·앞뒤 Location 변환 규칙 (USER DECISION)
- 73건 "ERP empty + DB has" 처리 정책 (추천: KEEP · USER DECISION)
- 44건 CostPrice different (사용자 조정값) 처리 정책 (USER DECISION)
- 189건 PriceA different 처리 정책 (USER DECISION)
- `products.purchase_price` Ownership 확정 (ERP_OWNED vs PROTECTED)
- `products.sale_price` Ownership 확정 (ERP_OWNED vs PROTECTED)
- `current_stock` 공식 ERP 화면 검증 (USER가 5 상품 샘플 확인 필요)

## 📎 2026-10-03 저녁 분석 자료
- `scripts/fetch-product-list-2026-10-03.mjs` · Product_List 1회 조회 (concurrency=1 · 4007 rows · 102 cols)
- `scripts/analyze-barcode-2026-10-03.mjs` · BarCode field 전수 분석 · ERP↔Supabase 93.1% match
- `scripts/location-barcode-based-2026-10-03.mjs` · Barcode 기준 Location 재분석
- `scripts/analyze-prices-2026-10-03.mjs` · CostPrice/PriceA/B/C/D 전수 분석
- `scripts/fetch-buy-status-2026-10-03.mjs` · Buy_Status 2026-10-03 (5 rows · 사용자 검증값 완전 일치)
- `scripts/reclassify-products-2026-10-03.mjs` · Barcode 기준 상품 재분류
- `scripts/location-diff-2026-10-03.mjs` · (이전 ProductName 기반 · 참고용)
- `scripts/location-impact-2026-10-03.mjs` · (이전 ProductName 기반 · 참고용)
- `scripts/location-vs-display-location-2026-10-03.mjs` · products.location vs display_location 동기 상태
- `data/snapshots/product-list-2026-10-03.json` · Product_List 전체 결과
- `data/snapshots/buy-status-2026-10-03.json` · Buy_Status 2026-10-03 결과
