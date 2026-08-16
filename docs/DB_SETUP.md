# DB Setup Guide · 2026-08-16

> **목적**: 신규 Supabase 프로젝트 · DB 스키마 셋업 안내
> **범위**: 40개 테이블 · 49개 SQL 마이그레이션 · 실행 순서

---

## ⚠ 중요 · 누락 테이블 (수동 생성 필요)

**마이그레이션에 없는 · 사용중 테이블 (18개)** — Supabase 대시보드에서 수동 생성 or 기존 DB 스키마 복제 필요:

### 핵심 (CORE · 앱 부팅 필수)
| 테이블 | 용도 | 주요 컬럼 (server 코드 참조) |
|--------|------|--------|
| **employees** | 직원 (로그인·스케줄 기반) | id, name, position, phone, password_hash, level, employmentType, hireDate, retireDate, workplace, rank, gender, address, employee_number, annual_leave_days, bankbook_image_url, contract_type, contract_start, contract_end, probation_end_date, birth_date, emergency_contact_name, memo, level, resume_url |
| **schedules** | 월간 스케줄 | id, employeeId, date, type, workingHours (JSONB) |
| **products** | 상품 마스터 | code, name, spec, supplier, current_stock, optimal_stock, min_stock, real_map, hidden |
| **app_settings** | KV 설정 저장소 | key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMP |

### 매입·재고
| 테이블 | 용도 |
|--------|------|
| **purchase_details** | 매입 상세 (vat_amount, supply_amount 컬럼 추가됨) |
| **ocr_confirmed_items** | OCR 확정 아이템 |
| **ocr_templates** | OCR 템플릿 |
| **ocr_synonyms** | OCR 동의어 (cancelled 컬럼 추가됨) |
| **product_arrivals** + **product_arrival_items** | 상품 입고 |
| **inventory_checks** | 실재고 체크 (5분할 컬럼 추가됨) |
| **return_requests** | 반품 요청 |
| **supplier_payment_allocations** | 결제 할당 |

### 일상
| 테이블 | 용도 |
|--------|------|
| **reservations** | 예약 (vendor 관련 추가 컬럼) |
| **lunch_requests** | 점심 불참 |
| **hr_forms** | HR 서류 업로드 |

### 게시판
| 테이블 | 용도 |
|--------|------|
| **board_post_comments** | 댓글 |
| **board_post_reactions** | 리액션 |

---

## 마이그레이션에 있는 · 명시 생성 테이블 (22개)

| 테이블 | 파일 |
|--------|------|
| anon_push_subscriptions | migrations/create_stock_arrivals.sql |
| board_posts, board_post_images | supabase/migrations/20260708_board.sql |
| contract_clauses | migrations/create_contract_clauses_2026-08-05.sql |
| display_requests, order_requests, zone_mismatches | migrations/create_request_tables.sql |
| employee_contracts | migrations/create_employee_contracts.sql |
| leave_requests | migrations/create_leave_requests.sql |
| loss_tracking_daily | migrations/loss_tracking_daily.sql |
| notifications | migrations/add_notifications.sql |
| ocr_deleted_rows | supabase/migrations/20260710_ocr_deleted_rows.sql |
| ocr_supplier_aliases | migrations/create_ocr_supplier_aliases.sql |
| order_dispatches | migrations/audit-fix.sql |
| pharmacist_menu_items | supabase/migrations/20260803_pharmacist_menu_items.sql |
| resignation_requests | migrations/create_resignation_requests.sql |
| stock_arrivals | migrations/create_stock_arrivals.sql |
| stock_history | supabase/migrations/20260707_stock_history.sql |
| stock_reconciliation_sessions/items | migrations/audit-fix.sql |
| supplier_balance_configs | supabase/migrations/20260705_schema_sync.sql |
| supplier_balances | migrations/audit-fix.sql (또는 20260706_missing_schema.sql) |
| vendors | migrations/create_vendors.sql (또는 20260705_schema_sync.sql) |
| zone_dow_templates | supabase/migrations/20260705_schema_sync.sql |
| zone_day_assignments | supabase/migrations/20260706_missing_schema.sql |
| zone_labels | migrations/create_zone_labels_2026-08-05.sql |

---

## 실행 순서 (신규 DB 셋업)

### Step 1 · 누락 테이블 수동 생성
Supabase 대시보드 → SQL Editor · 위 "누락 테이블 (18개)" 각각 CREATE TABLE
- 특히 `employees`, `schedules`, `products`, `app_settings` 는 · 앱 부팅에 필수
- 다음 세션에서 스키마 SQL 완성 예정 (server 코드 참조 · 컬럼 목록 위 문서화됨)

### Step 2 · 초기 스키마 (supabase/migrations/ · 시간순)
```
20260705_schema_sync.sql
20260705_employees_retire_date.sql
20260705_ocr_synonyms_cancelled.sql
20260705_supplier_config_format.sql
20260705_zone_assignments_dow.sql
20260706_missing_schema.sql
20260707_optimal_stock_backup.sql
20260707_period_start_backfill.sql
20260707_products_hidden.sql
20260707_stock_history.sql
20260707_stock_history_start_date.sql
20260708_board.sql
20260708_employees_address.sql
20260710_ocr_deleted_rows.sql
20260710_ocr_templates_column_mapping.sql
20260714_vendors_business_number.sql
20260803_inventory_checks_5split_zones.sql
20260803_pharmacist_menu_items.sql
```

### Step 3 · 확장 마이그레이션 (migrations/ · 카테고리별)

**테이블 생성**:
```
create_vendors.sql
create_leave_requests.sql
create_stock_arrivals.sql
create_employee_contracts.sql
create_contract_clauses_2026-08-05.sql
create_resignation_requests.sql
create_request_tables.sql
create_ocr_supplier_aliases.sql
create_zone_labels_2026-08-05.sql
add_notifications.sql (테이블 생성)
create_branding_storage_2026-08-12.sql
audit-fix.sql
loss_tracking_daily.sql
```

**컬럼 추가** (2026-08 이후):
```
add_employee_level.sql
add_stock_arrivals_scheduling.sql
add_vendor_extra_contacts_2026-08-10.sql
add_order_dispatch_columns_2026-08-10.sql
add_contract_work_terms_2026-08-10.sql
add_employee_bankbook_column_2026-08-10.sql
add_employee_number_2026-08-10.sql
add_employees_annual_leave_days_2026-08-12.sql
add_employees_full_profile_2026-08-13.sql
```

**개선·정리·성능**:
```
db_improvements_top3.sql
db_top4_signature_storage.sql
db_top5_status_check.sql
vat_integration.sql
rpc_only_2026-08-05.sql
perf_indexes_2026-08-05.sql
perf_indexes_2026-08-06.sql
perf_indexes_leave_requests_2026-08-12.sql
drop_dead_columns_2026-08-10_FULL.sql
```

---

## 중복·정리 완료

- ❌ 삭제: `drop_dead_columns_2026-08-10.sql` (FULL 버전에 병합됨 · 2026-08-16)
- ✓ CREATE TABLE IF NOT EXISTS 는 중복 실행 무해:
  - `vendors` · `zone_mismatches` · `supplier_balances` · 중복 CREATE 안전

---

## TODO · Phase 2 (다음 세션)

- **누락 테이블 SQL 작성** · server 코드 컬럼 참조로 역추론
- **fresh-install.sql** · 단일 파일 통합 (누락 + 기존 병합 + 순서)
- **Supabase CLI 도입 검토** · migration 자동 적용 (`supabase db push`)

---

## 문서 관리

- 신규 마이그레이션 추가 시 · 이 문서에 항목 추가
- 삭제·통합 시 · 이력 기록
- 다음 갱신 · 누락 테이블 스키마 완성 시
