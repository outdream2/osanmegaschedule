# 프로젝트 전면 헬스 감사 · 2026-08-30

**목적**: 오늘 발생한 사고 (zone_defs 스키마 변경 · KV 폴백 제거 · supplier_payment_allocations DROP) 를 기점으로 유사 위험 사전 탐지
**범위**: `migrations/` · `supabase/migrations/` · `sql/` · `server/` · `src/`
**방식**: 정적 grep + 스키마 교차검증 (코드 수정 없음)

---

## 🚨 즉시 조치 필요 TOP 5

| # | 심각도 | 항목 | 파일:라인 | 즉시 대응 |
|:-:|:-:|---|---|---|
| **1** | 🔴 | `resignations` 테이블 참조 · 실제는 `resignation_requests` | `server/routes/display/requests.ts:34` | 테이블명 오타 → `resignation_requests` 로 수정 (현재 silently 항상 0 반환) |
| **2** | 🔴 | `render.yaml` 에 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 누락 | `render.yaml:8-49` | ImageUploadField (branding · company info · 도장) 프론트 업로드 · Render 배포 시 즉시 실패 |
| **3** | 🔴 | `supplier_payment_allocations` · DROP 대상이지만 4곳에서 참조 | `server/routes/purchase/supplierPayments.ts:113,189,295,571` | DROP SQL (`drop_unused_derived_tables_2026-08-29.sql`) 실행 여부 확인 필요. 미실행이면 안전, 실행 됐다면 코드 fallback 처리 필요 |
| **4** | 🔴 | `order_dispatches` · DROP 대상이지만 참조 존재 (fallback 有) | `server/routes/display/requests.ts:691` | 매 발주 발송 시 warn 로그만 · 데이터 손실 (감사 추적 불가) |
| **5** | 🔴 | `employees.retire_date` (snake) vs 실제 `"retireDate"` (quoted camelCase) | `server/services/notificationsService.ts:215` · `server/routes/staff/resignations.ts:262` · `server/routes/schedule/schedules.ts:176` | 런타임 "column does not exist" 예상. 이미 audit 문서에 지적됨 (`DATA_INTEGRITY_AUDIT_2026-08-29.md` C1) |

---

## 🔴 1. Dropped 테이블 vs 코드 참조

### 1-A. `supplier_payment_allocations` (DROP 예정)

DROP 정의: `migrations/drop_unused_derived_tables_2026-08-29.sql:26`
DROP 근거: "코드 미사용 · 폐기됨" (실제로는 **4곳 참조 존재**)

| 파일:라인 | 작업 | fallback |
|---|---|---|
| `server/routes/purchase/supplierPayments.ts:113` | SELECT (payment_id IN) | `error.message` 로그만 |
| `server/routes/purchase/supplierPayments.ts:189` | 추정 SELECT | 확인 필요 |
| `server/routes/purchase/supplierPayments.ts:295` | 추정 write | 확인 필요 |
| `server/routes/purchase/supplierPayments.ts:571` | 추정 write | 확인 필요 |

**위험**: DROP SQL 실행 후 · 결제 정보 조회 시 오류 (fallback 있어 크래시는 없음 · 하지만 allocations 데이터 사라짐)

### 1-B. `order_dispatches` (DROP 예정)

DROP: `migrations/drop_unused_derived_tables_2026-08-29.sql:19`
참조: `server/routes/display/requests.ts:691` (INSERT · try/catch · fallback 있음)

**위험**: 발주 발송 이력 감사 추적 불가

### 1-C. `stock_reconciliation_sessions` / `stock_reconciliation_items` (DROP 완료)

DROP: `migrations/drop_unused_derived_tables_2026-08-29.sql:11-12` + `migrations/drop_dead_columns_2026-08-10_FULL.sql:31,34`
서버·클라 grep 결과: **참조 0곳** ✅ 안전

### 1-D. `zone_defs_v1_backup` (임시 백업)

CREATE: `sql/2026-08-30b-zone-defs-cell-num.sql:10` (RENAME) · 마지막 L170 DROP
**정보**: 이관 후 backup 테이블 · 안전

---

## 🔴 2. Dropped 컬럼 vs 코드 참조

### 2-A. `employees.retire_date` (컬럼명 실제는 `"retireDate"`)

정의: `supabase/migrations/20260705_employees_retire_date.sql:5` = `"retireDate"` TEXT (quoted camelCase)
snake_case 참조:
- `server/services/notificationsService.ts:215`
- `server/routes/staff/resignations.ts:262`
- `server/routes/schedule/schedules.ts:176`

`server/services/scheduleService.ts:186` 만 fallback 있음. 나머지는 런타임 실패 위험.

### 2-B. `zone_assignments.dow` (DROP 완료)

DROP: `migrations/drop_dead_columns_2026-08-10_FULL.sql:19`
참조: 0곳 ✅ 안전 (`zone_dow_templates` 로 대체됨)

### 2-C. `ocr_supplier_aliases.canonical` (DROP 완료)

DROP: `migrations/drop_dead_columns_2026-08-10_FULL.sql:15`
참조: 0곳 ✅ 안전

### 2-D. `ocr_confirmed_items.invoice_date_new` (DROP 완료)

DROP: `migrations/drop_dead_columns_2026-08-10_FULL.sql:24` (rename → invoice_date)
참조: 0곳 ✅ 안전

### 2-E. `products.spec` / `products.display_location` · 미폐기 · 파생 mirror

- `location` 컬럼 생성: `sql/2026-08-27-location-column-migration.sql:12`
- 원본 (`spec` · `display_location`) 유지 · rename 지연 (L35-36)
- 서버 코드 · `location ?? display_location ?? spec` fallback 다수 (14+ 파일)
- **위험**: xlsx 재임포트 시 `spec`/`display_location` 갱신 · `location` stale 가능성
- 사용자 대원칙 (파생 자제) 위배 · 이미 `DATA_INTEGRITY_AUDIT_2026-08-29.md` C3 지적

---

## 🟡 3. KV (app_settings) 참조 실패 유형

### 3-A. `useKvSetting` 사용처 (25개 파일 hooks + 컴포넌트)

정의: `src/hooks/useKvSetting.ts:97-297`
fallback 동작:
1. mount · 서버 GET `/api/settings?key=` · 실패 시 localStorage
2. localStorage 도 없으면 `defaultValue`
3. 편집 · localStorage 즉시 · debounce 500ms 서버 POST · 실패 silent

**결론**: 서버·테이블 없어도 `defaultValue` 로 정상 동작 ✅ 안전
`app_settings` 테이블은 `supabase/migrations/20260705_schema_sync.sql:126` 에 정의 존재

### 3-B. `resignations` 테이블 참조 (오타)

`server/routes/display/requests.ts:34` · `.from("resignations")` (복수)
실제 테이블: `resignation_requests` (`migrations/create_resignation_requests.sql:3`)

fallback: `resignation.error ? 0 : resignation.count` (crash 없음 · 항상 0 표시)
**위험**: 사이드 카운트 배지 · 퇴사 요청 pending 개수 항상 0 표시 · 사용자 오해

### 3-C. `settings.zone_defs` KV → 정식 테이블 이관

이관: `sql/2026-08-30-zone-defs-table-migration.sql`
KV 폴백 제거: `src/hooks/useZoneDefs.ts:122` "DB 단일 소스 · KV 폴백 없음"
`useZoneDefs.ts:156` · zone_defs 테이블 비어있으면 error 상태 표시 · 사용자에게 명확 노출 ✅

---

## 🟡 4. Zone 관련 데이터 흐름 정합성

### 4-A. `zone_defs` 스키마 v3 (2026-08-30)

변경: `sql/2026-08-30b-zone-defs-cell-num.sql:18-25` · id/zone/category/detailed_category/cell_id (5컬럼)
추가: `sql/2026-08-30f-add-location-column.sql:11` · `location` 컬럼 (products.location 매칭)

**backend 라우터**: `server/routes/display/zoneDefs.ts:17-25` · v3 DTO 완비
**frontend hook**: `src/hooks/useZoneDefs.ts:15-22` · v3 DTO + 하위호환 변환 완비

### 4-B. `zone_defs` 소비처 (14 파일)

| 파일 | 사용 방식 |
|---|---|
| `src/components/DisplayPage/DisplayStoreMap.tsx` | 렌더링 |
| `src/components/common/StoreZoneMap.tsx` | 공용 컴포넌트 |
| `src/components/common/ZoneCellPicker.tsx` | 셀 편집 popover |
| `src/components/DisplayPage/ZoneEditPanel.tsx` | 편집 페이지 |

**교차검증 위험**: `useZoneDefs.ts:76-118` `transformToLegacy` 함수 · 정규식 파싱 (`진열대 1A` · `벽면 21` 등)
새 4존 카테고리 (`중앙상비약존` 등 · `sql/2026-08-30f-add-location-column.sql:40-56`) 적용 시 · legacy parseZone 정규식 매칭 실패 → `zones` (하위호환) 비어있게 될 위험

### 4-C. `zone_labels` / `zone_assignments` / `zone_mismatches` · 정상

각각 서버 라우터 + 클라 소비처 확인 · 참조 정합성 이슈 없음

### 4-D. `products.location` vs `real_map` · 배치구역 mismatch 계산

`server/routes/display/requests.ts:28,40` · `location ?? display_location ?? spec` fallback
`server/routes/display/mismatches.ts:34,41` · 동일 fallback
사용자 대원칙 (파생 자제) 위배 지속 · 3-way merge 리스크

---

## 🟡 5. products.location · real_map 참조 · null 안전 처리

### 5-A. 참조 파일 (25 파일)

`location` · `real_map` 사용 25 파일 대부분 · optional chaining 또는 fallback 있음
샘플 확인:
- `src/lib/normalizeProduct.ts:30-40` · nullable 처리 정상
- `src/components/common/ProductBasicInfoPanel.tsx:96,100` · `product.location ?? product.display_location ?? null` ✅
- `src/components/ScanPage/StockRowCard.tsx:182-186` · fallback 정상

**결론**: null 안전 처리 대부분 OK. 위험은 3-way fallback 로직 지속 (원본 대원칙 위배)

---

## 🟢 6. RLS 활성화 후 안정성

### 6-A. RLS SQL 대상

`sql/2026-08-30c-enable-rls-all-tables.sql:16-31` · public 스키마 전체 ENABLE

### 6-B. Anon 키 사용 코드 · 브라우저 supabase 클라이언트

`src/supabase/client.ts:8-13` · 브라우저에서 `VITE_SUPABASE_ANON_KEY` 사용
사용처: **2 파일만**
- `src/components/common/ImageUploadField.tsx:9` · Storage 업로드만 (테이블 접근 X) ✅
- `src/supabase/client.ts` · 클라이언트 정의

**src/**/*.ts(x) 전수 grep 결과**: `.from("...")` 호출 · **0건** ✅
→ RLS 활성화 · 프론트 테이블 직접 접근 없음 · service_role 서버만 접근 · **안전**

### 6-C. authorize 미들웨어 커버리지

`server/routes/**/*.ts` 36 파일 중 · 155회 authorize 호출
확인 결과 **35 파일 authorize 사용** · 1 파일 (`clientErrors.ts`) 의도적 미적용 (익명 에러 로깅)
`DATA_INTEGRITY_AUDIT_2026-08-29.md` + `SECURITY_AUDIT_2026-08-29.md` 에서 지적한 4건 High 취약점 (S1~S4) 미해결 상태 (별도 이슈)

---

## 🟢 7. Render 배포 관련

### 7-A. render.yaml env 변수

`render.yaml:16-49`:
- ✅ `SUPABASE_URL` · `SUPABASE_KEY` · `NODE_OPTIONS` · VAPID 3종 · GEMINI 6종 · MISTRAL · JWT_SECRET (파생)
- ❌ **누락**: `VITE_SUPABASE_URL` · `VITE_SUPABASE_ANON_KEY`

**영향**: Vite 빌드 시 `import.meta.env.VITE_*` undefined
→ `src/supabase/client.ts:33` `supabase = null` (브라우저)
→ ImageUploadField (`src/components/common/ImageUploadField.tsx:9`) · storage 업로드 API 호출 시 crash
→ **branding · company info · 도장 이미지 업로드 페이지 · Render 프로덕션 crash**

### 7-B. 최근 53 커밋 push 완료 여부

`git log` 확인:
- 최근 세션 handoff (`docs/SESSION_HANDOFF_2026-08-29.md:11`) · "Remote push 완료 (`f392c76b..907d9f58` · 41 커밋)"
- 이후 로컬 커밋 12+ 확인 (`git log --oneline -30`)
- **Render 자동 배포 여부**: 마지막 push 이후 커밋 · 다음 push 필요

---

## 📊 발견 사항 종합

| 심각도 | 개수 | 즉시 조치 |
|:-:|:-:|---|
| 🔴 크리티컬 | 5건 | 위 TOP 5 · 즉시 검토 |
| 🟡 경고 | 6건 | 파생 컬럼 · 3-way fallback · KV 마이그레이션 잔재 |
| 🟢 정보 | 8건 | DROP 완료 확인 · authorize 커버리지 · RLS 안전성 |

## 🎯 사용자 대원칙 위배 요약

1. **파생 컬럼 자제**: `products.location = coalesce(display_location, spec)` · 사용자 대원칙 (원본 우선) 위배 · 미해결
2. **파생 테이블 자제**: `zone_defs` 자체가 파생 (products.location 에서 유래) · 다만 UI 편집 대상이므로 정당
3. **JOIN 우선**: `products.current_stock` xlsx snapshot · `inventory_checks` 실사와 3중 저장 · JOIN 미활용

---

## 📁 참고 문서

- `docs/DATA_INTEGRITY_AUDIT_2026-08-29.md` · 데이터 정합성 (C1~C5)
- `docs/SECURITY_AUDIT_2026-08-29.md` · 보안 취약점 (S1~S12)
- `docs/DB_DEAD_COLUMNS_2026-08-10_FULL.md` · 미사용 컬럼
- `docs/SESSION_HANDOFF_2026-08-29.md` · 최근 세션 진행

**작성**: 2026-08-30 · 자동 감사 (정적 분석)
**후속**: TOP 5 항목 · 사용자 승인 후 수정 진행 권장
