# 데이터 정합성 전수 감사 (2026-08-29)

**범위**: `migrations/*.sql` · `supabase/migrations/*.sql` · `sql/*.sql` · `server/**/*.ts` · `src/**/*.ts(x)`
**목적**: 미사용/오참조 컬럼 · FK 정책 · DTO·DB 불일치 · null 안전성 · 중복 저장
**방식**: 정적 grep + 스키마 교차검증 (코드 수정 없음)

---

## 🔴 크리티컬 (5건) — 즉시 수정 검토

| # | 항목 | 위치 | 원인 · 영향 |
|---|---|---|---|
| C1 | `employees.retire_date` vs `"retireDate"` **컬럼명 불일치** | DB: `supabase/migrations/20260705_employees_retire_date.sql:5` = `"retireDate"` TEXT (camelCase-quoted) · 코드는 `retire_date` snake · `retireDate` 혼용 | 실제 DB 컬럼은 `"retireDate"`. `server/services/notificationsService.ts:215` `select("id, retire_date")`, `server/routes/staff/resignations.ts:262` `update({ retire_date })`, `server/routes/schedule/schedules.ts:176` `select("... retire_date, ...")` — **snake_case 참조 6+ 곳** → 런타임 "column does not exist" 예상. `scheduleService.ts:186` 에는 fallback 로직이 있으나 다른 경로에는 없음 |
| C2 | `reservations.vendor_id` **타입 불일치** UUID vs vendors.id INT/BIGINT | `supabase/migrations/20260824_reservations_vendor_id.sql:11` = `UUID` · `create_vendors.sql:3` = `SERIAL` · `20260705_schema_sync.sql:50` = `BIGINT IDENTITY` · Zod `reservation.ts:13` = `vendorId: z.number()` | FK 실행 불가 (파일 내 FK 코멘트 처리됨 L15-16). Zod 는 number 요구, DB 는 UUID 저장. 데이터 형변환 실패 시 500 · orphan 예약 발생 위험 |
| C3 | `products.location` vs `spec` / `display_location` **파생 3중 저장** | `sql/2026-08-27-location-column-migration.sql:19` `location = coalesce(display_location, spec)` · 원본 컬럼 미제거 (L35-36) | 원본과 어긋날 수 있음 (사용자 대원칙 위배 · 파생 자제). 3-way sync 없음 → xlsx 재임포트 시 `spec`/`display_location` 만 갱신되고 `location` 이 stale 될 수 있음 |
| C4 | `inventory_checks.warehouse_stock` vs `warehouse1_stock` **레거시 mirror** | `supabase/migrations/20260803_inventory_checks_5split_zones.sql` · 서버에서 두 컬럼 동시 write mirror | DB 이중 저장 · 사용자 대원칙 (원본 우선) 위배. DEAD_COLUMNS_2026-08-10 에 이미 애매로 표기 · 아직 미해결 |
| C5 | `stock_note` 컬럼 · 서버 write · 클라 read 0건 | `sql/2026-08-27-stock-note-column.sql:9` · `server/utils/xlsx.ts:216-220` INSERT · `src/**` grep 0건 | 데이터가 저장되지만 UI 어디에도 표시 안 됨 → 데이터 손실 방지 목적이 무의미. 오참조/미사용 사이 |

---

## 1. 미사용 컬럼 (참조 0건)

| 심각도 | 테이블 | 컬럼 | 근거 |
|:-:|---|---|---|
| 🟢 | `ocr_supplier_aliases` | `canonical` | DEAD_COLUMNS 확정 · migrations/audit-fix.sql:102 ADD 후 SELECT/INSERT 0 (재확인) |
| 🟢 | `zone_assignments` | `dow` | dow 로직은 `zone_dow_templates` 전담 (`server/routes/display/zoneAssignments.ts:85`) |
| 🟢 | `ocr_confirmed_items` | `invoice_date_new` | TEXT→DATE 이관 중간 · RENAME 후 잔존 · grep 0 |
| 🟢 | `products` | `stock_note` | write only · client read 0 (C5 참조) |
| 🟡 | `products` | `note` | server `ALLOWED_INLINE_EDIT` (products.ts:414) PATCH 만 · client read 0 · DEAD_COLUMNS_FULL 재확인 |
| 🟢 | `_archive_product_arrival_items_20260829` / `_archive_product_arrivals_20260829` | 테이블 전체 | 2026-08-29 rename · 2주 관찰용 (예상) |
| 🟢 | `stock_reconciliation_sessions` / `stock_reconciliation_items` | 테이블 전체 | 2026-08-29 DROP 마이그 (drop_unused_derived_tables_2026-08-29.sql) 실행 후 완료 |

**수정 방향**: 이미 DEAD_COLUMNS_FULL 에 정리됨 · 사용자 승인 후 순차 DROP

---

## 2. 오참조 컬럼 (스키마 없는 컬럼 참조)

| 심각도 | 참조 위치 | 컬럼 | 실제 스키마 |
|:-:|---|---|---|
| 🔴 | `server/services/notificationsService.ts:215,220` · `server/routes/staff/resignations.ts:262` · `server/routes/schedule/schedules.ts:176` | `employees.retire_date` | DB 는 `"retireDate"` TEXT (quoted camelCase · supabase/migrations/20260705_employees_retire_date.sql) — **참조 실패 예상** |
| 🔴 | Zod `src/shared/schemas/reservation.ts:13` `vendorId: z.number()` | `reservations.vendor_id` = UUID | 형변환 실패 시 500 (C2) |
| 🟡 | `server/utils/productInventoryQuery.ts:173` `select("... category_code, ... sale_status, ... expiry_date, ... brand, manufacturer, search_keywords, ...")` | products 위 7개 컬럼 | migrations 어디에도 정의 없음 · 실제 DB 에 어떻게 만들어졌는지 문서화 부재 (xlsx 임포트 자동 생성 추정) · 검증 필요 |
| 🟡 | `src/shared/schemas/products.ts:22` 주석 "cost_price · note 컬럼 없음 → 제거" | `products.cost_price` · `products.note` | `migrations/audit-fix.sql:88-89` 는 두 컬럼 ADD · 실제 DB 에 있으나 schema 는 제거 · **schema-DB 불일치 상반된 관찰** — 어느 쪽이 사실인지 확인 필요 |

**수정 방향**: C1 · 서버 코드 grep 후 snake→camel 일괄 rename (feature branch) · 또는 마이그레이션으로 컬럼 rename 통일

---

## 3. 파생 컬럼 남용

| 심각도 | 테이블 · 컬럼 | 파생식 | 위험 |
|:-:|---|---|---|
| 🔴 | `products.location` | `coalesce(display_location, spec)` | 원본 갱신 시 자동 sync 없음 (C3) |
| 🔴 | `products.current_stock` | xlsx 스냅샷 · 실시간 재고와 별도 · `inventory_checks` 실사값과 불일치 가능 | UI 다수 곳에서 `products.current_stock` 을 최신값처럼 사용 (`server/utils/productInventoryQuery.ts:222` · `stockManage.ts:557`) · 실사와 차이 |
| 🟡 | `loss_tracking_daily.loss` / `loss_value` | `loss = erp - actual` · `loss_value = loss × purchase_price` (미그레이션 L23-26) | 원본 (erp_stock · actual_stock · purchase_price) 변경 시 stale · daily 스냅샷이므로 재계산 정책만 명확하면 안전 |
| 🟡 | `stock_history.total_amount` | 서버에서 xlsx 합계로 저장 · vat + supply_amount 파생 가능 | 부가세 정책 (`vendors.vat_included`) 변경 시 재계산 안 됨 |
| 🟢 | `product_arrivals.match_count · mismatch_count · expiring_count` | items 상태 집계 (archived 테이블) | 아카이브됨 |

**수정 방향**: `products.location` · xlsx 임포트 pipeline 에서 매 upsert 시 재계산 · 또는 view 로 대체. `products.current_stock` · UI 에서 `inventory_checks` 최신값 join 우선

---

## 4. FK CASCADE 정책 누락 · 위험

| 심각도 | FK | 현재 | 판단 |
|:-:|---|---|---|
| 🟡 | `employee_contracts.employee_id` → employees(id) | **FK 없음** (EMPLOYEE_INTEGRATION_AUDIT_2026-08-29.md:131 확인) | 이력 보존 목적 · 앱은 소프트 삭제 (retireDate) · FK 없어도 안전이라 판단됨 (기존 audit) |
| 🟡 | `leave_requests.employee_id` → employees(id) | **FK 없음** | 상동 · 이력 보존 |
| 🟡 | `resignation_requests.employee_id` → employees(id) | **FK 없음** | 상동 |
| 🟡 | `schedules.employeeId` → employees(id) | **FK 없음** · JSONB 컬럼 | 소프트 삭제 시 orphan 스케줄 존재 가능 |
| 🟡 | `zone_assignments` · `zone_labels` · `zone_dow_templates` | employees FK 없음 | 배정 대상 직원 삭제 시 orphan JSONB slots |
| 🟢 | `notifications.employee_id` → employees(id) | `ON DELETE CASCADE` | 정상 |
| 🟢 | `board_posts` 계열 · `product_arrival_items` · `supplier_payment_allocations` | 각각 CASCADE / SET NULL | 정상 |
| 🔴 | `reservations.vendor_id` → vendors(id) | **FK 미설정 (주석 처리 · 타입 불일치 C2)** | orphan 예약 · 잘못된 vendor 참조 방치 |
| 🟡 | `stock_arrivals.created_by_id` → employees(id) | `ON DELETE SET NULL` | 정상 |

**수정 방향**: hard delete 정책 확정 후 · 필요 FK 추가 · reservations.vendor_id 타입 통일 (INT / UUID) 이 선행

---

## 5. DTO ↔ DB 불일치

| 심각도 | Zod 스키마 | DB 컬럼 | 불일치 |
|:-:|---|---|---|
| 🟡 | `employeeContracts.ts:6` `employee_id: nullable().optional()` | `create_employee_contracts.sql:16` `employee_id INT NOT NULL` | Zod null 허용 · DB NOT NULL → INSERT 실패 |
| 🟡 | `productArrivals.ts:10` `status: enum(["match","mismatch","pending"])` | `docs/supabase_functions_and_tables.sql:35` `status TEXT DEFAULT 'pending'` (주석: pending·match·mismatch·**expiring**) | Zod 에 "expiring" 누락 · 클라에서 `expiring: boolean` 별도 필드로 우회 · 정합성 취약 (테이블은 아카이브됨) |
| 🟡 | `products.ts:22` 주석 · `cost_price · note` 제거 | `audit-fix.sql:88-89` ADD | 스키마 편집이 DB 상태 반영 X · Zod 로 검증되면 정상 값 rejected 될 수 있음 |
| 🟡 | `vendors.ts:12` `email: nullable().or(z.literal(""))` | `create_vendors.sql` 컬럼 없음 · `audit-fix.sql:93` 후 추가 | 컬럼은 존재하나 초기 스키마와 다름 · 사용은 정상 |
| 🟢 | `reservation.ts:13` `vendorId: z.number()` | `reservations.vendor_id UUID` (C2) | number ↔ UUID 형변환 실패 |
| 🟡 | `leave.ts:6` `employee_id: union([string, number])` | `create_leave_requests.sql:4` `employee_id integer NOT NULL` | string 통과 시 서버 라우터에서 파싱 실패 가능 |
| 🟡 | `board.ts:11` `post_type: default("question")` | `20260708_board.sql:10` `NOT NULL DEFAULT 'question'` · CHECK 없음 | 유효값 (`question|issue|memo`) 검증 X · Zod 도 그냥 string · 오타 통과 |

**수정 방향**: Zod schema 엄격 매칭 · 상반된 상태는 우선 실제 DB 확인 (Supabase SQL Editor `information_schema.columns`) 후 통일

---

## 6. Null 안전성 취약점

| 심각도 | 위치 | 현상 |
|:-:|---|---|
| 🟡 | `productInventoryQuery.ts:222` `current_stock: p.current_stock != null ? Number(...) : null` | 안전한 처리 (샘플로 확인) |
| 🟡 | 다수 UI (product.spec · product.location) | Zod 는 nullable · UI 코드에서 optional chaining 없이 `product.location.trim()` 형태 사용 가능성 · 개별 확인 필요 |
| 🟡 | `resignation_requests.signature_data_url` | migration "deprecated" · 코드 여전히 `<img src={r.signature_data_url}>` (`ResignationApprovalPage`) · null 시 broken img · DEAD_COLUMNS_2026-08-10 재확인 |
| 🟡 | `reservations.vendor_id` UUID · 일반 예약 NULL | `vendorId?: number` 클라 로직에서 null 케이스 처리 미확인 |
| 🟢 | `notifications.employee_id` nullable · CASCADE | 안전 |

**수정 방향**: Zod 로 검증되지 않는 UI 표시 지점 · optional chaining + fallback ("-" 등) 일관 적용

---

## 7. 동일 데이터 중복 저장

| 심각도 | 대상 | 원본 | 스냅샷 저장 | 위험 |
|:-:|---|---|---|---|
| 🔴 | `warehouse_stock` (레거시) vs `warehouse1_stock` (신규) | inventory_checks | mirror 저장 | C4 |
| 🔴 | `products.location` vs `display_location` / `spec` | products | 3중 저장 | C3 |
| 🟡 | 다수 테이블 `employee_name` 스냅샷 | employees.name | `leave_requests` · `resignation_requests` · `employee_contracts` · `product_arrivals.checked_by` · `stock_arrivals.created_by` · `borrowings.created_by` · `return_requests.requested_by` · `supplier_payments.created_by` | employees.name 변경 시 과거 이력 stale (일부는 이력 보존 목적이므로 의도적 · **결혼 등 개명 시 어떤 사람인지 헷갈릴 위험**) |
| 🟡 | 다수 테이블 `product_name` 스냅샷 | products.product_name | `stock_history` · `purchase_details` · `loss_tracking_daily` · `return_requests` · `borrowings` · `zone_mismatches` · `order_requests` | 상품명 변경 시 이력 stale — 이력 보존이 목적이면 정상, 조회 목적이면 stale |
| 🟡 | `supplier_name` 스냅샷 | vendors.company_name | `purchase_details` · `stock_history` · `supplier_payments` · `supplier_balances` · `return_requests` · `borrowings` · `ocr_supplier_aliases` | 공급사명 변경 시 조인 실패 · `vendors.id` FK 없음 |
| 🟡 | `purchase_details.vat` (구) vs `vat_amount` (신) | · | 두 컬럼 병존 · `vat_integration.sql:30` 주석: "표준 명칭으로 통일" | 미정 |
| 🟡 | `products.hidden` (bool) vs `products.sale_status='판매중지'` | · | 두 신호 병존 · `20260707_products_hidden.sql` + `mark-all-products-suspended-2026-08-29.sql` | 하나로 통일 필요 |
| 🟡 | `products.expiry_date` vs `inventory_checks.expiry_date` | · | 두 곳 저장 · `ExpiryDateModal.tsx:82,107` products PATCH · `20260825_inventory_checks_add_expiry_columns.sql` inventory_checks 도 저장 | 어긋날 수 있음 |
| 🟡 | `employees.contract_file_url` · `resume_url` · `resignation_file_url` | 파일 URL 마스터는 별도 테이블 (`employee_contracts`) | 최신 URL 을 마스터 컬럼에 mirror · 이력은 별도 | 마스터 파일 삭제/재생성 시 mirror 갱신 로직 필요 (현재 `schedules.ts:85` 확인됨) |

**수정 방향**: 스냅샷 컬럼 → FK id 로 대체 · JOIN 조회 · 이력 보존이 목적이면 컬럼 코멘트 명시. `products.hidden` vs `sale_status` · 한쪽 폐기

---

## 부록 A · vendors PK 타입 상충

- `create_vendors.sql:3` = `SERIAL PRIMARY KEY` (INT)
- `20260705_schema_sync.sql:50` = `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`
- 실제 DB · 어느 마이그레이션이 나중에 실행됐는지 불명 · **Supabase 대시보드 확인 필요**
- `reservations.vendor_id UUID` (C2) · vendors PK 가 INT/BIGINT 라면 FK 불가

## 부록 B · camelCase 컬럼 (quoted) — 관례 위배

| 테이블 | 컬럼 |
|---|---|
| `employees` | `"retireDate"` · `hireDate` (추정) |
| `schedules` | `employeeId` · `workingHours` · `actualHours` |

- Postgres 관례 위배 · SQL 작성 시 항상 double-quote 필요 · 오타 위험 (C1)
- 이관 어렵지만 · 신규 코드는 snake_case fallback 로직 필수

## 부록 C · 로우 카운트 미확인 (조사 한계)

- 실제 DB 접속 없이 grep 만 사용 · row-level anomaly (orphan id · null vs empty string) 는 조사 불가
- Supabase SQL Editor 에서 아래 쿼리로 검증 권장:
  ```sql
  -- retire_date 컬럼 실제 존재 여부
  SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'employees' AND column_name IN ('retire_date', 'retireDate');
  -- reservations.vendor_id 실제 데이터형
  SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'reservations' AND column_name = 'vendor_id';
  -- products 신규 컬럼 존재 (category_code · sale_status · profit_rate 등)
  SELECT column_name FROM information_schema.columns
   WHERE table_name = 'products'
   ORDER BY column_name;
  ```

---

## 요약

- **크리티컬 5건**: retire_date 컬럼명 · reservations.vendor_id 타입 · products.location 파생 · warehouse_stock mirror · stock_note write-only
- **미사용 4~5건**: DEAD_COLUMNS_FULL 재확인 · 사용자 승인 후 DROP 안전
- **오참조 다수**: retire_date · vendorId · products 신규 컬럼 · schema-DB 불일치
- **파생 남용 2건**: products.location · current_stock · 원본 우선 대원칙 위배
- **FK 정책**: 소프트 삭제 위주라 대부분 안전 · reservations.vendor_id 만 위험
- **DTO 불일치 7건**: 대부분 nullable/CHECK 관련 · employee_contracts.employee_id NOT NULL 우선 처리
- **중복 저장 8건**: 스냅샷 컬럼 대부분 이력 보존 목적 (의도적) · warehouse_stock · location · vat 는 정리 필요

**다음 단계**: 크리티컬 5건 · 사용자 승인 후 · retire_date 통일 → reservations.vendor_id 타입 결정 → products.location pipeline 정리 → warehouse_stock 이관 완료 → stock_note DROP or 표시 UI 추가
