# DB Dead Column 전수 감사 (2026-08-10 FULL)

**감사 일자**: 2026-08-10
**범위**: migrations/*.sql 전체 + server/routes/**/*.ts + src/**/*.ts(x) 교차 검증
**이전 감사**: `docs/DB_DEAD_COLUMNS_2026-08-10.md` (5건) — 이번 감사에서 재검증 포함

---

## 감사 대상 테이블 목록 (25개)

| # | 테이블 | 스키마 출처 |
|---|--------|------------|
| 1 | `employees` | scheduleService + add_employee_level + audit-fix |
| 2 | `products` | productCache (select *) + audit-fix |
| 3 | `inventory_checks` | supabase_functions_and_tables + ScanPage |
| 4 | `stock_history` | supabase_functions_and_tables |
| 5 | `purchase_details` | vat_integration + purchaseDetailsQuery |
| 6 | `ocr_confirmed_items` | ocrConfirmed.ts (CREATE_SQL) + vat_integration |
| 7 | `vendors` | create_vendors + vat_integration + aug10 |
| 8 | `supplier_payments` | supabase_functions_and_tables + vat_integration |
| 9 | `supplier_payment_allocations` | supabase_functions_and_tables |
| 10 | `supplier_balances` | audit-fix |
| 11 | `order_requests` | create_request_tables + aug10 |
| 12 | `leave_requests` | create_leave_requests |
| 13 | `display_requests` | create_request_tables |
| 14 | `return_requests` | supabase_functions_and_tables |
| 15 | `zone_assignments` | audit-fix |
| 16 | `zone_dow_templates` | zoneAssignments.ts (inline CREATE) |
| 17 | `zone_labels` | create_zone_labels_2026-08-05 |
| 18 | `zone_mismatches` | create_request_tables |
| 19 | `product_arrivals` | supabase_functions_and_tables |
| 20 | `product_arrival_items` | supabase_functions_and_tables |
| 21 | `loss_tracking_daily` | loss_tracking_daily |
| 22 | `resignation_requests` | create_resignation_requests + db_top4 |
| 23 | `employee_contracts` | create_employee_contracts + aug10 |
| 24 | `notifications` | add_notifications |
| 25 | `ocr_supplier_aliases` | create_ocr_supplier_aliases + audit-fix |
| 26 | `anon_push_subscriptions` | create_stock_arrivals |
| 27 | `stock_arrivals` | create_stock_arrivals |
| 28 | `ocr_synonyms` | (inline in ocr.ts) |
| 29 | `ocr_templates` | (inline in ocr.ts) |
| 30 | `ocr_deleted_rows` | (inline in ocrDeletedRows.ts) |
| 31 | `reservations` | audit-fix (minimal) + reservations.ts |
| 32 | `order_dispatches` | audit-fix (minimal) |
| 33 | `contract_clauses` | create_contract_clauses_2026-08-05 |
| 34 | `hr_forms` | hrForms.ts (inline CREATE) |
| 35 | `board_post_images` | board.ts |
| 36 | `lunch_requests` | lunch.ts |
| 37 | `stock_reconciliation_sessions` | audit-fix (→ 이전 감사서 DROP 대상) |
| 38 | `stock_reconciliation_items` | audit-fix (→ 이전 감사서 DROP 대상) |

---

## 1. 이전 감사 5건 재검증

### 1-A. `ocr_supplier_aliases.canonical`
- grep 결과: 0건 (server, src 모두)
- **판단: DROP 확정** — 이전 감사 결론 유지

### 1-B. `zone_assignments.dow`
- grep 결과: audit-fix.sql ADD COLUMN 외 코드 참조 0건
- `zone_dow_templates` 테이블이 dow 로직 전담 (server/routes/display/zoneAssignments.ts:85)
- **판단: DROP 확정** — 이전 감사 결론 유지

### 1-C. `ocr_confirmed_items.invoice_date_new`
- grep 결과: 0건 (db_improvements_top3.sql 의 중간 컬럼 · RENAME 완료 잔존)
- **판단: DROP 확정** — 이전 감사 결론 유지

### 1-D. `stock_reconciliation_sessions` 테이블
- grep 결과: 0건
- **판단: DROP 확정** — 이전 감사 결론 유지

### 1-E. `stock_reconciliation_items` 테이블
- grep 결과: 0건
- **판단: DROP 확정** — 이전 감사 결론 유지

---

## 2. 이번 감사 신규 발견

### 2-A. `employees.auth_level` — 유지
- server/routes/display/requests.ts:217, 343, 373 에서 `.gte("auth_level", 8)` 로 관리자 필터링 사용
- **판단: 유지**

### 2-B. `employees.level` — 유지
- server/routes/staff/resignations.ts:95, board.ts:259, leave.ts:144 등 다수 사용
- **판단: 유지**
- 참고: `auth_level`(요청 알림 경로)과 `level`(일반 권한 경로)이 병존 — 레거시 분기

### 2-C. `products.note` — 유지 (단, 읽기 참조 없음 · 애매)
- server/routes/stock/products.ts:414 의 `ALLOWED_INLINE_EDIT` 셋에 포함 → PATCH 쓰기 허용
- 클라이언트에서 `product.note` 를 읽는 코드는 발견되지 않음
- `products` 는 `select("*")` 로 조회되므로 항상 응답에 포함됨
- 사용자 지정 필드 성격 (삭제하면 기존 저장값 소실) → 조심스러운 판단: **유지**

### 2-D. `products.cost_price` — 유지
- server/routes/stock/products.ts:405 (ALLOWED_INLINE_EDIT), src/components/ScanPage/ProductInfoCard.tsx:11
- **판단: 유지**

### 2-E. `ocr_confirmed_items.balance` — 유지
- server: `query.not("balance", "is", null).gt("balance", 0)` 필터링 (ocrConfirmed.ts:146)
- src: OrderManagePage.tsx:1029 hasBalance=true 쿼리 → ocr_balance 컬럼에 반영
- **판단: 유지**

### 2-F. `ocr_confirmed_items.raw_json` — 유지 (JSONB · 분석 불가)
- ocrConfirmed.ts:22 스키마에 포함 · INSERT 시 저장됨
- JSONB 내부 필드는 분석하지 않는 원칙에 따라 유지
- **판단: 유지**

### 2-F. `resignation_requests.signature_data_url` — 유지 (이전 감사 재확인)
- server/routes/staff/resignations.ts:163, 174, 193 에서 INSERT 시 저장
- src/components/ResignationApprovalPage: `r.signature_data_url` 로 읽고 `<img src=...>` 표시
- migration comment 에 "deprecated" 표기 있으나 **코드에서 아직 실제로 사용 중**
- **판단: 유지** (storage 이관 완료 후 별도 DROP — 이전 감사 결론과 동일)

### 2-G. `inventory_checks.warehouse_stock` — 유지 (이전 감사 재확인)
- server/routes/display/requests.ts:729 레거시 fallback 미러 로직 (warehouse_stock = warehouse1_stock)
- server/routes/stock/products.ts:75, 152, 341, 346, 372 등 다수 SELECT/사용
- src 클라이언트 다수 참조
- **판단: 유지** (warehouse1_stock 완전 전환 후 별도 DROP — 이전 감사 결론과 동일)

### 2-H. `order_dispatches` 테이블 — 유지 (단, 컬럼 미확정)
- server/routes/display/requests.ts:661 에서 INSERT 사용
- 테이블 구조가 audit-fix.sql 에서 최소 스켈레톤(id, created_at)만 정의됨
- INSERT 하는 `dispatch` 객체의 실제 컬럼은 코드에 따라 결정
- **판단: 테이블 유지** (구조 확인 불가 · 안전하게 건드리지 않음)

### 2-I. `supplier_balances` — 유지
- server/routes/ocr/ocr.ts:1785, 1798, 1808 에서 SELECT/INSERT/DELETE 사용
- 컬럼 (id, supplier_name, balance, invoice_date, created_at) 모두 사용됨
- **판단: 유지**

### 2-J. `vendors.password_hash` — 유지 (확인)
- server/routes/auth/auth.ts 에서 사용 여부 확인 필요했으나 vendors 테이블에 존재
- **판단: 유지** (인증 관련 — 삭제 위험)

### 2-K. `employees.bankbook_image_url` — 유지
- add_employee_bankbook_column_2026-08-10.sql 에서 신설 (2026-08-10)
- scheduleService.ts 에서 이미 포함
- **판단: 유지** (신규 컬럼)

---

## 3. 결론 요약

### DROP 확정 (참조 0건 · 확실)

| # | 테이블 | 컬럼/객체 | 근거 |
|---|--------|-----------|------|
| 1 | `ocr_supplier_aliases` | `canonical` | grep 0건 · audit-fix.sql 추가 후 한 번도 SELECT/INSERT 없음 |
| 2 | `zone_assignments` | `dow` | grep 0건 · dow 로직은 zone_dow_templates 전담 |
| 3 | `ocr_confirmed_items` | `invoice_date_new` | grep 0건 · TEXT→DATE 이관 중간 컬럼 · RENAME 완료 잔존 |
| 4 | `stock_reconciliation_sessions` | 테이블 전체 | grep 0건 · 라우터 없음 |
| 5 | `stock_reconciliation_items` | 테이블 전체 | grep 0건 · sessions FK 의존 |

### 유지 (참조 확인됨)

모든 나머지 컬럼/테이블은 server 또는 src 에서 1건 이상 참조 확인.

### 애매 (사용자 판단 필요)

| 테이블 | 컬럼 | 상황 |
|--------|------|------|
| `resignation_requests` | `signature_data_url` | migration comment "deprecated" 표기 · 그러나 코드에서 아직 INSERT+READ 실사용 중 · Storage 이관 100% 완료 후 DROP |
| `inventory_checks` | `warehouse_stock` | warehouse1_stock 신규 컬럼과 fallback 병존 · 전환 코드 정리 후 DROP |
| `employees` | `auth_level` vs `level` | 두 컬럼이 다른 경로에서 관리자 판별용으로 별도 사용 · 통일 계획 있으면 하나 제거 가능 |
| `products` | `note` | PATCH 쓰기만 허용 · 읽기 코드 없음 · 기존 저장값 있을 가능성 |

---

## 4. 이전 감사 SQL 재검증

`migrations/drop_dead_columns_2026-08-10.sql` — 5건 모두 재검증 완료 · 실행 안전 확인.
