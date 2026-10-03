# 초기 데이터 구축 (Initial Data Build) · 설계 문서

**작성일**: 2026-10-03 · **상태**: 설계 · **WRITE 미구현** · 사용자 지시 "결과를 보고하고 멈춰라"
**업데이트**: 2026-10-03 저녁 · Location 정책 · RESET 분류 재검증 · READ ONLY 유지

---

## ⚠️ 2026-10-03 저녁 재검증 요약 (Product_List 조회 완료 후 최종)

| 항목 | 이전 | 저녁 상태 |
|---|---|---|
| ERP Barcode field | 미확인 | ✅ `Product_List.BarCode (col[88]) · 100% non-empty · 1:1 PCode` |
| Supabase product_code 매핑 | blocker | ✅ **93.1% exact match (3,732/4,007)** · OPTION A 확정 |
| `products.display_location` Ownership | ERP_OWNED | **ERP_DERIVED** · 사용자 플로우 확정 ([초기화 전 분석/비교] → [구축 시 변환 적용] → [이후 지속 Sync]) |
| `products.location` Ownership | PROTECTED | **ERP_DERIVED** (display_location 과 양쪽 동시 갱신 필수) |
| `location_assigned_at` | PROTECTED | **컬럼 실제 미존재 · 삭제** |
| Buy_Status unique key | 미확인 | ✅ **`(BmCode, ROWNUM)`** · 샘플 검증 완료 |
| `purchase_details` 12,939 | RESET_CONFIRMED | **RESET_CANDIDATE** (초기화 승인 + Buy_Status 전수 조회 범위 확정 전 금지) |
| `stock_history` 53,641 | RESET_CONFIRMED | **RESET_CANDIDATE** (Inventory 현재고 공식 ERP 화면 검증 전 금지) |

**사용자 Location 플로우 (2026-10-03 저녁 메시지 반영)**:
```
[초기화 전]  = 현재 Supabase display_location → 분석/비교용 · 변경 금지
[구축 실행]  = ERP 대분류+중분류 → 변환 → products.display_location (일회성)
             = 벽+21 → "21", 6매대+A → "6A", 6매대+B → "6B"
             = 웹서비스의 새 진열위치 기준
[구축 후]    = ERP → Location Sync → display_location → 웹서비스 (지속)
```

> 사용자 지시: "7,078개 중 ERP 상품과 연결되는 것, ERP에 없는 것, 오픈 전에 실제로 설정한 것, 순수 샘플을 먼저 분리해야 해. 반면 purchase_details와 stock_history가 전부 테스트/샘플이라고 확인된다면 이쪽은 초도 전환 때 실제 자료로 깨끗하게 재구축하는 쪽이 훨씬 자연스러워."

---

## 0. 목적

현재 Supabase 는 테스트/샘플 + 사용자 사전설정 + ERP 매칭 데이터가 **섞여 있음**. 실제 ERP 운영 데이터로 안전하게 전환하려면 ·
- 사용자 사전설정 (optimal_stock · memo · display_location · shelf_positions) **보존**
- 테스트/샘플 데이터 **재구축**
- ERP ↔ Supabase 매핑 **확정**

이 세 가지를 동시에 수행하는 "초기 데이터 구축" 관리자 전용 기능.

**평상시 자동동기화와 완전 별개**. 1 회성 실행 가정.

---

## 1. 분석 결과 · 현재 데이터 분류

### 1-A · products 7,078 세부 분류 (2026-10-03 저녁 · Barcode identity 기준 재계산 · ★★★)

**이전 ProductName 매칭 기반 분류는 폐기**. Barcode 93.1% 정확 매칭 기준 재분류.

| 그룹 | 개수 | 조건 (Barcode 매칭 + 운영흔적) | 처리 방침 |
|---|---|---|---|
| **ERP_MATCHED_ACTIVE** | **3,704** | ERP Barcode ✓ · 운영흔적 ✓ | **최우선 보존** · ERP_OWNED whitelist 만 UPDATE · PROTECTED (optimal_stock · memo · hidden · shelf_positions) 완전 보존 |
| **ERP_MATCHED_INACTIVE** | 28 | ERP Barcode ✓ · 운영흔적 X | ERP_OWNED UPDATE · ERP 값으로 initialize |
| **ERP_NEW** | 275 | ERP 에만 있음 · DB 신규 | 사용자 승인 후 INSERT (최근 등록 상품 15431 등) |
| **DB_ONLY_ACTIVE** | **3,293** | DB 에만 있음 · 운영흔적 ✓ | **KEEP** · 자체 등록 상품/과거 상품/테스트 상품 혼재 · 자동 DELETE 영구 금지 |
| **DB_ONLY_INACTIVE** | 53 | DB 에만 있음 · 운영흔적 X | **REVIEW** · 2026-06-26 import 당시 "-" prefix 테스트 샘플 다수 · 자동 DELETE 금지 · 사용자 수동 확인 |
| **BARCODE_CONFLICT** | **0** | 같은 Barcode·다른 상품명 | 발생 안 함 (완벽) |
| **ERP_MISSING_BARCODE** | **0** | ERP 에서 BarCode empty | 발생 안 함 (ERP 100% 입력) |

**운영흔적 판정**: `optimal_stock > 0` OR `memo 입력됨` OR `display_location 입력됨` OR `hidden=true`

**합계 검증**: 3,704 + 28 + 3,293 + 53 = 7,078 (Supabase 전체) ✓ / ERP 신규 275

**결론**: 7,078 중 **일괄 삭제 가능한 상품 거의 없음**. "SAMPLE 전수 삭제" 는 금지. 상품 identity 확정 후 **그룹별 처리**.

### 1-B · imported_at 분포 (products)
- 2026-06: 5,048 (대량 초기 Excel import)
- 2026-08: 1,970 (추가 import)
- 2026-07/09: 소량 (수동 등록)

### 1-C · purchase_details 12,939
| 항목 | 값 |
|---|---|
| 총 rows | 12,939 |
| `verified_by` 입력 | **8** (0.06%) |
| `expiry_date` 입력 | 2 (0.02%) |
| purchase_date 범위 | 2026-03-10 ~ 2026-09-27 |
| imported_at 범위 | 2026-07-15 ~ 2026-09-27 |

→ **거의 전부 미검수 · 재구축 가능** (사용자 지시대로)
→ 단 `verified_by` 입력 **8 건** 은 사용자 작업 결과 · 보존 필요 (archive)

### 1-D · stock_history 53,641
| 항목 | 값 |
|---|---|
| 총 rows | 53,641 |
| snapshot_date 범위 | 2026-03-10 ~ 2026-09-20 |

→ **월별 Excel sample · 재구축 가능** (사용자 지시대로)

### 1-E · inventory_checks 3,400
| 항목 | 값 |
|---|---|
| 총 rows | 3,400 |
| `shelf_positions` (JSONB) | **3,400 (100%)** |
| 사용자 수동 입력 (`checked_by != 'system:backfill'`) | 14 |
| 실제 재고 입력 (store1_stock 등) | 8-14 (매우 적음) |
| expiry_date | 1 |

→ **shelf_positions 는 전수 보존 필수** (사용자 설정 기반 자동 할당)
→ 실제 재고/유통기한 입력은 매우 적음 (사용자 지시 20 번 · KEEP)

### 1-F · vendors 156
| column | non-null |
|---|---|
| `note` | 151 (97%) |
| `approval_status` | 156 (100%) |
| `business_number` | 37 (24%) |
| `contact_name` | 11 |
| `phone` | 4 |
| `email` | 3 |
| `team_leader_*` / `emergency_contact` | 3 |

→ **vendors 전체 보존 필수** (사용자 지시 19 번) · ERP 는 CtCode · CCorpName 만 제공 · 연락처/승인/비고 자체 운영

---

## 2. 상품 Identity 전략 (사용자 지시 1 순위)

> 사용자 지시: "먼저 102개 필드 안에 13자리 바코드가 있는지 확인하는 게 1순위야. 만약 ERP가 PCode=12035와 함께 Barcode=8801234567890 같은 값을 이미 준다면 이야기가 훨씬 쉬워져."

### 결정 보류 (사용자 지시)
~~A. erp_pcode column 추가~~ · **보류**. Product_List 102 col 안에 바코드 field 가 있는지 먼저 확인.

### Step 1 · 바코드 field 확인 (최우선 · 다음 action)
사용자 작업 ·
1. npm run dev 재시작
2. 사업장 상품관리 탭 → **동시 조회 1** radio 선택 → **[상품 전체 조회]** 클릭 (concurrency=1 · ERP 부하 최소)
3. 터미널 로그 중 아래 블록 공유 ·
```
[iregen] Primary table 전체 102 columns:
  [  0] PCode · ...
  [  1] ...
  ...
  [101] ... · ...
```

### Step 2 · 바코드 field 발견 시 (예상)
저희 즉시 ·
- Supabase 7,078 ↔ ERP Barcode field 완전 매칭 분석
- Exact Barcode Match 수 보고 (예상: 수천 건)
- 매핑 전략 간단화 · 그대로 `products.product_code` ↔ ERP BarCode 사용 · 추가 column 불필요

### Step 3 · 바코드 field 없을 시 fallback
그제서야 `erp_pcode` column 추가 또는 매핑 테이블 결정.

### 다중 바코드 가능성 (사용자 지시 5 번)
- 1 PCode ↔ 여러 바코드 (낱개/박스/묶음) 가능성 조사 필요
- Supabase `individual_code` 162 개 (낱개 바코드) 이미 존재 · 참고 자료
- Step 2 결과에 따라 분석

---

## 3. field Ownership 재분류 (`erp-import-mapping.md` 반영)

### ERP_OWNED (products)
- `product_name`
- `supplier` · `supplier_code`
- `category` · `unit` · `brand` · `manufacturer`
- `sale_status`
- 추가: 102 col 수집 후 `sale_price · spec · origin` 등 재분류

### ERP_DERIVED (products · 2026-10-03 저녁 신설)
- **`display_location`** (ERP 대분류+중분류 → 변환) · 영향분석 조건부 적용 (뷰티/냉장고 규칙 미정 · 56 "ERP empty + DB has" 처리 미정)
- **`location`** (display_location 과 100% 동기 유지)

### PROTECTED (products)
- `optimal_stock` · `optimal_stock_backup` (99.9% 활발 운영)
- `memo` (82% 활발)
- `hidden` (사용자 토글)
- `shelf_positions` (JSONB · inventory_checks)
- ~~`location_assigned_at`~~ (**컬럼 실제 미존재 · 삭제**)
- `stock_note` · `created_at`
- `current_stock` (⚠ UNCERTAIN · 공식 검증 전 PROTECTED)

### 사용자 지시 8 번 · 가격 재확인
- `products.purchase_price` · non-null **289 (4%)** · 거의 미사용. 실제 매입가는 `purchase_details.unit_price` 사용. **ERP_OWNED 로 매번 overwrite OK**. 사용자 영향 미미. 하지만 사용자 PATCH 가능하면 PROTECTED 유지해도 됨 → **사용자 결정 대기**.
- `products.sale_price` · non-null **5,850 (82%)** · 활발 사용. 사용자가 UI PATCH 가능하면 **PROTECTED** (덮으면 작업 손실).
- ERP Product_List 안에 실제 매입가/판매가 field 있는지 **102 col 수집 후 확정**.

### 사용자 지시 9 번 · current_stock 재확인
- Inventory_Status 는 **기간 집계** (PrvStock + 이동) · 실시간 현재고 아님
- Supabase `current_stock` non-null 3,086 (43%) · 활발 운영
- **공식 검증 전 UNCERTAIN 유지** · ERP sync 대상 아님 (일단)
- 실재고는 `inventory_checks.store*_stock` 사용자 입력이 SSOT

---

## 4. 테이블별 초기 데이터 구축 처리 방침

| Table | 현재 rows | 처리 방침 | 사유 |
|---|---|---|---|
| **products** | 7,078 | **그룹별 처리** (A/B/C/D) · 일괄 DELETE 금지 | 사용자 지시 18 번 · 51 개만 순수 샘플 추정 |
| **vendors** | 156 | **KEEP 전체** · ERP 공급사 매핑만 신규 생성 | 사용자 지시 19 번 · 연락처/승인 보존 |
| **purchase_details** | 12,939 | **RESET_CANDIDATE** (2026-10-03 저녁 재분류) · Buy_Status 안정 unique key 확정 전 재구축 금지 · verified_by 입력 8 건 archive | verified 거의 미입력 · unique key (DocNo+LineSeq) 미확정 상태에서 재구축 시 중복 INSERT 위험 |
| **stock_history** | 53,641 | **RESET_CANDIDATE** (2026-10-03 저녁 재분류) · Inventory_Status 현재고 공식 ERP 화면 검증 전 재구축 금지 | 월별 Excel sample · closing_stock 공식 미검증 상태에서 재구축 시 재고 정합성 위험 |
| **inventory_checks** | 3,400 | **KEEP 전체** · shelf_positions 보존 필수 | 사용자 지시 20 번 · 운영 flow 유지 |

### products 그룹별 세부
```
[A] REAL_PRECONFIG · 2,920
    ├─ product_code (바코드) 보존
    ├─ product_name · supplier · supplier_code · category · unit · sale_status
    │  → ERP_OWNED UPDATE (NULL overwrite 금지)
    ├─ display_location · location (양쪽 동시 갱신)
    │  → ERP_DERIVED UPDATE · 전각/반각 정규화 · 뷰티/냉장고 규칙 결정 후 적용
    │    (영향: 36 same · 514 변경 · 1,574 신규 · 56 유지(KEEP) · 23 unspec KEEP · 40 창고 flip)
    │    → shelf_positions 자동 재배정 트리거 (buildInitialShelfPositions 호출 필수)
    └─ optimal_stock · memo · hidden · shelf_positions
       → 완전 보존

[B] ERP_SYNC · 30
    ├─ product_code 보존
    ├─ ERP_OWNED UPDATE (full)
    └─ PROTECTED 는 비어있어도 그대로 둠

[C] CUSTOM · 4,077
    ├─ 전체 보존 · ERP sync 영향 받지 않음
    └─ 향후 'ERP_MISSING' 상태 column 추가 가능 (PHASE 3)

[D] REVIEW · 51
    ├─ 자동 DELETE 금지 (사용자 지시 13 번)
    ├─ 사용자 수동 Review UI 제공
    └─ 사용자 결정 (DELETE / KEEP / ERP 매핑 수동)

ERP 신규 (ERP 에만 있고 Supabase 에 없음) · 1,120
    └─ 사용자 승인 후 INSERT
       (ERP_OWNED only · PROTECTED 는 DB DEFAULT or NULL)
```

### purchase_details 재구축 상세
```
1. verified_by != NULL 또는 verified_at != NULL · 8 건
   → `purchase_details_archive` 테이블로 복사 (BACKUP)
2. purchase_details 전수 DELETE
3. Buy_Status 로 INITIAL_PURCHASE_START_DATE ~ GO_LIVE_DATE 매입 전수 조회
4. INSERT · unique key 확정 후 (Buy_Status 전체 col 수집 후 결정)
```

### stock_history 재구축 상세
```
1. 전체 archive (`stock_history_archive`)
2. 전수 DELETE
3. Inventory_Status 로 재구축 or 월별 Excel 유지 결정 (사용자 승인)
```

---

## 5. "모두 초기화" 의미 재정의 (사용자 지시 16 번)

**❌ 금지**: `TRUNCATE products` · `TRUNCATE vendors` · DB 전체 wipe

**✅ 올바른 의미**:
```
ERP_REBUILDABLE 영역 (purchase_details · stock_history 중 sample 부분)
    → 안전하게 삭제 + ERP 데이터로 재구축

PROTECTED 영역 (vendors · inventory_checks · products[A/C])
    → 완전 보존

ERP_OWNED 영역 (products ERP_OWNED columns)
    → 사용자 승인 후 UPDATE
```

---

## 6. 관리자 메뉴 설계 · "초기 데이터 구축"

### 위치
웹서비스 관리자 메뉴 (lv9 전용) · 설정 or 시스템 영역

### 상태 enum
```
NOT_INITIALIZED       · 초기 상태
PREPARING             · 준비
FETCHING              · ERP 조회 중
VALIDATING            · 검증 중
PREVIEW_READY         · 미리보기 준비 완료
BACKING_UP            · 백업 중
REBUILDING            · 재구축 중
VERIFYING             · 사후 검증
COMPLETED             · 완료 (GO_LIVE_INITIALIZED_AT 기록)
FAILED                · 실패
```

### UI 7-Step Wizard (사용자 지시 23 번)

```
[초기 데이터 구축]

상태: NOT_INITIALIZED

┌─ STEP 1 · ERP 데이터 가져오기 ──────────────────────────┐
│  Product_List   [조회] · pages ?/? · rows ?            │
│  Inventory_Status [조회] · rows ?                      │
│  Buy_Status (기간 설정) [조회] · rows ?                │
│  ★ concurrency = 1 · 순차 호출 · ERP 부하 최소        │
└──────────────────────────────────────────────────────┘

┌─ STEP 2 · 검증 ─────────────────────────────────────┐
│  ERP Product count: ?                                 │
│  Duplicate PCode: 0 / Empty: 0                        │
│  Barcode field 발견 여부: YES / NO                    │
└──────────────────────────────────────────────────────┘

┌─ STEP 3 · 현재 DB 와 비교 (매핑 설계) ───────────────┐
│  바코드 Exact Match: ?                                │
│  Group A (REAL_PRECONFIG): 2,920                      │
│  Group B (ERP_SYNC):          30                      │
│  Group C (CUSTOM):         4,077                      │
│  Group D (REVIEW):            51                      │
│  ERP 신규:                 1,120                      │
└──────────────────────────────────────────────────────┘

┌─ STEP 4 · Preview (DRY-RUN · 사용자 지시 24 번) ─────┐
│  Products:                                            │
│    UPDATE 2,950 · INSERT 1,120 · NO_CHANGE 30         │
│    REVIEW 51 · CUSTOM KEEP 4,077                      │
│    Protected fields affected: 0 (반드시 0)            │
│  Purchase Details:                                    │
│    archive 8 · DELETE 12,939 · INSERT ~N              │
│  Stock History:                                       │
│    archive 53,641 · DELETE 53,641 · INSERT ?          │
│  Vendors: KEEP 156                                    │
│  Inventory Checks: KEEP 3,400                         │
└──────────────────────────────────────────────────────┘

┌─ STEP 5 · Backup ────────────────────────────────────┐
│  products_snapshot_YYYYMMDD_HHMMSS                    │
│  purchase_details_snapshot_...                        │
│  stock_history_snapshot_...                           │
│  vendors_snapshot_...                                 │
│  inventory_checks_snapshot_...                        │
│  [백업 생성] (성공 전엔 Step 6 비활성)                │
└──────────────────────────────────────────────────────┘

┌─ STEP 6 · 실행 (최종 확인) ──────────────────────────┐
│  ⚠ 현재 테스트 상품/매입/재고 데이터가                 │
│  실제 ERP 데이터로 재구축됩니다.                       │
│  (vendors · inventory_checks · optimal_stock          │
│   등 보호 대상 데이터는 유지됩니다.)                  │
│                                                       │
│  "초기 데이터 구축 실행" 문구 입력:                   │
│  [______________] [실행] (문구 일치 시만 활성)        │
└──────────────────────────────────────────────────────┘

┌─ STEP 7 · 사후 검증 ────────────────────────────────┐
│  ERP count vs DB count 전수 비교                      │
│  Duplicate / Empty / Protected changed = 0            │
│  Orphan FK = 0                                        │
│  [GO_LIVE_INITIALIZED_AT = YYYY-MM-DD HH:MM]          │
└──────────────────────────────────────────────────────┘
```

### 실행 순서 (사용자 지시 25 번)
```
ERP FETCH
→ ERP SNAPSHOT 저장 (재사용)
→ VALIDATION
→ CURRENT DB SNAPSHOT
→ DIFF
→ PREVIEW
→ BACKUP (실패 시 중단)
→ 사용자 확인 문구 입력 + 승인
→ products 그룹별 적용
→ purchase_details 재구축
→ stock_history 재구축
→ 관계 검증 (FK orphan 0)
→ 최종 검증
→ COMPLETE (GO_LIVE_INITIALIZED_AT)
```

**ERP 조회 실패 시 · 현재 DB 는 단 한 건도 변경하지 않음.**

---

## 7. ERP Snapshot 재사용 (사용자 지시 26 번)

STEP 1 에서 조회한 `Product_List · Inventory_Status · Buy_Status` 결과를 ·
- 서버 메모리 or Supabase `erp_snapshot` 임시 테이블로 저장
- STEP 2-7 전체에서 재사용
- **ERP API 재호출 없음** · 부하 최소화

---

## 8. Backup / Rollback 설계 (사용자 지시 28 번)

### Backup 대상
- products (전체)
- purchase_details (전체 · 특히 verified_by 입력 8건)
- stock_history (전체)
- vendors (전체)
- inventory_checks (전체)
- 관계 테이블 (예: `order_requests` · `supplier_payments` 등 FK 가능성)

### Backup 방법
- Supabase 안 `*_snapshot_YYYYMMDD_HHMMSS` 테이블 생성 · INSERT INTO SELECT * FROM X
- 또는 Supabase CLI pg_dump 로 로컬 파일 생성 (수동)
- Backup 성공 전에 재구축 실행 **금지**

### Rollback 방법
```sql
BEGIN;
DELETE FROM products;
INSERT INTO products SELECT * FROM products_snapshot_YYYYMMDD_HHMMSS;
-- 그 외 각 테이블 동일
COMMIT;
```

---

## 9. Partial Failure 방지 (사용자 지시 29 번)

### 전략 1 · Staging 접근
- 모든 재구축 데이터는 먼저 `*_staging` 테이블에 INSERT
- 전수 검증 후 Transaction 안에서 실제 테이블로 swap
- 중간 실패 시 staging 만 폐기 · 실제 테이블 영향 X

### 전략 2 · DB Transaction
```ts
await supabase.rpc("initial_data_build_v1", { snapshot_id });
```
- Postgres function 안에서 BEGIN/COMMIT · 전체 성공 or 전체 롤백

### 추천: 전략 2 (DB function) 가 더 안전 · 하지만 Supabase 는 긴 트랜잭션 timeout 제한 있을 수 있어 **배치 크기 조절 필요** (사용자 지시 34 번 batch_size)

---

## 10. 재실행 방지 (사용자 지시 31 번)

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 성공 시
INSERT INTO app_settings (key, value) VALUES
  ("GO_LIVE_INITIALIZED_AT", jsonb_build_object(
    "ts", NOW(),
    "operator_id", <lv9 user id>,
    "erp_product_count", 4070,
    "erp_barcode_match", <N>,
    "backup_prefix", "snapshot_YYYYMMDD_HHMMSS"
  ))
ON CONFLICT (key) DO UPDATE SET ...;
```

### 재실행 시 ·
- `GO_LIVE_INITIALIZED_AT` 존재하면 **버튼 자동 비활성**
- 재실행 원하면 lv9 관리자 재초기화 전용 메뉴 (문구 2 회 확인)
- 평상시 scheduler 는 이 기능 **절대 호출 금지**

---

## 11. 추가 위험 (사용자 지시 34 번)

### 코드 조사 기반 추가 발견

#### R-1 (HIGH) · optimal_stock_backup 복원 로직
현재 `server/routes/stock/products.ts:L515-L538` 에 **xlsx import 후 optimal_stock 자동 복원 로직** 존재. 새 PHASE 2 UPSERT 가 이 로직 bypass 하면 wipe 재발. ERP sync 는 반드시 ERP_OWNED whitelist 사용 · optimal_stock 포함 X.

#### R-2 (HIGH) · shelf_positions 자동 재배정 트리거
`products.ts:L1153-L1215` · `products.location` 변경 시 `inventory_checks.shelf_positions` 자동 재배정. ERP sync 가 location 변경하면 shelf 전수 재배정 발동 → 성능 + 사용자 설정 손실. **location 은 PROTECTED 유지 결정**.

#### R-3 (MEDIUM) · imported_at 트리거/column
products 안 `imported_at` TIMESTAMPTZ. ERP sync 가 매번 now() 로 바꾸면 "실제 import 시점" 손실. **imported_at 은 PROTECTED** 분류 추천.

#### R-4 (MEDIUM) · last_modified_at
`products.ts` 안에서 PATCH 시마다 now() 저장. ERP sync 가 override 하면 사용자 수정 흐름 추적 손실. ERP 가 ConfirmDate1 제공 시 그 값 쓸지 결정 필요.

#### R-5 (MEDIUM) · profit_rate 자동 계산
UI 가 sale_price/purchase_price 변경 시 trigger 로 profit_rate 재계산 가능성. ERP sync 가 raw 값 넣으면 계산 트리거 발동. **DB trigger 조사 필요**.

#### R-6 (LOW) · Supabase row-level batch size
Supabase REST API 는 한 번에 최대 ~1000 rows upsert 추정 · 4,000 상품 INSERT 는 4 chunk 필요. 중간 실패 시 partial state. **chunk 간 트랜잭션 or staging 필수**.

#### R-7 (LOW) · HTTP timeout
Supabase REST API default timeout 30s 이내. 큰 UPSERT 는 분할 필요.

---

## 12. 평상시 Sync 정책 (사용자 지시 33 번)

```
Product_List    · 하루 1회  · concurrency=1 · ERP_OWNED whitelist UPDATE 만
Inventory_Status · 1시간    · 수량 집계 → stock_history 또는 current_stock (공식 확정 후)
Buy_Status      · 1시간    · unique key 로 신규 INSERT 만 (중복 skip)

PROTECTED       · 항상 유지
자동 DELETE     · 영구 금지
```

**초기 데이터 구축 완료 후** 활성화. GO_LIVE_INITIALIZED_AT 가 있어야 scheduler 작동.

---

## 13. PHASE 2 READINESS

### NORMAL SYNC READY: **NO**
- product_code 매핑 전략 결정 전
- Product_List 102 col 미수집 (바코드 field 확인 1순위)
- Buy_Status 전체 col 미수집

### INITIAL DATA BUILD READY: **NO**
- 상품 identity 전략 미확정 (바코드 확인 대기)
- Buy_Status unique key 미확정
- Backup/Rollback 전략 사용자 승인 전
- UI skeleton 미구현
- DB function (atomic rebuild) 미설계
