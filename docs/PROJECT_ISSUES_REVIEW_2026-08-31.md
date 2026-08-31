# 전체 프로젝트 문제점 리뷰 리포트 · 2026-08-31

> **작성**: 2026-08-31 · 정적 분석 · 파일 편집 없음 (Read/Grep/Glob 만)
> **베이스**: `docs/PROJECT_HEALTH_AUDIT_2026-08-30.md` · `docs/FRAMEWORK_COMPLIANCE_AUDIT_2026-08-30.md` · `docs/DATA_INTEGRITY_AUDIT_2026-08-29.md` · `docs/SECURITY_AUDIT_2026-08-29.md` · `docs/TASKS_STATUS_2026-08-31.md`
> **재실행**: `npm run audit` (audit-framework + audit-server) · `npx vitest run` · grep 전수

---

## 0. 종합 스코어카드 (2026-08-31 현재)

| 영역 | 지표 | 값 | 트렌드 |
|---|---|---:|:-:|
| 프론트 프리미티브 준수율 | audit-framework | **759 파일 중 757 클린 (99.7%)** | ↑ (8→2 위반) |
| 서버 라우트 감사 | audit-server | **41 파일 · 246 라우트 · 115 위반 (high 20)** | → (개선 없음) |
| Vitest 테스트 | pass rate | **3370/3382 (99.6%) · 232 파일 중 3 파일 실패** | → |
| `as any` (프론트) | 파일:건수 | 130 파일 · 343건 | ↑ (개선 여지) |
| `@ts-ignore` | 전체 | **0건** | ✅ |
| window.confirm | 프론트 | **0건** | ✅ (SettingsModal 정리 완료) |
| raw fetch | 프론트 | 실질 **0건** (인프라 예외만) | ✅ |
| 대형 서버 파일 (2000L+) | 개수 | 2건 (stockManage 2272L · ocr 1767L) | → |

---

## 1. 데이터 정합성 (High Priority)

### 1-1. products · 3 필드 삼중 저장 문제 · 🔴 High

- **파일**: `sql/2026-08-27-location-column-migration.sql` L12 · `src/lib/normalizeProduct.ts:30-40` · `src/components/common/ProductBasicInfoPanel.tsx:96` · `src/hooks/useHiddenManager.ts:1` (real_map 사용)
- **문제**: `products.location` · `products.display_location` · `products.spec` · `products.real_map` 4개 필드 · 진짜 진열 위치가 어느 것인지 불명확
  - `location` (2026-08-27 신설 · normalized) · 최우선
  - `display_location` (기존 mirror) · rename 지연
  - `spec` (원본) · xlsx import 소스
  - `real_map` · **135건 사용 (src/ 전체 47 파일)** · scan/mismatches 이외로도 확산
- **근거 · Grep**:
  - `real_map` · **src/ 47 파일 · 146회** (스코프 초과 · #13 진행 중)
  - `display_location` · 8 서버 파일 · 9 프론트 파일
  - `location ?? display_location ?? spec` fallback 패턴 · `server/routes/display/requests.ts` · `mismatches.ts` (14+ 곳)
- **영향**: xlsx 재임포트 시 `spec`/`display_location` 갱신 · `location` stale 위험 · 4-way 동기화 부담
- **조치**:
  - 즉시: 진짜 원본 확정 (사용자 결정 필요 · 아마 `location` 단일)
  - 단기: `real_map` → `location` 매핑 헬퍼 프리미티브 · fallback 통일
  - 장기: `spec`/`display_location` 컬럼 rename · 단일 필드 이관 (#13 완료 · 6-10h)
- **관련 태스크**: #10 · #13

### 1-2. zone_defs · zone_assignments 연동 부재 · 🟡 Medium

- **파일**: `sql/2026-08-30b-zone-defs-cell-num.sql` · `src/hooks/useZoneDefs.ts:76-118` (transformToLegacy 정규식 파싱)
- **문제**: zone_defs (54 rows · v3 스키마 · location/assignee 이관 완료) · schedules `zone_assignments` 와 참조 무결성 없음
  - zone_defs v3 4존 카테고리 (`중앙상비약존` 등) 신규 · `useZoneDefs.ts` legacy 정규식 (`진열대 1A` · `벽면 21`) 매칭 실패 위험
- **영향**: 스케줄 · 구역배정 · 배치구역 mismatch 계산 결과 불일치
- **조치**: `zone_defs.zone_key` FK 추가 · legacy parseZone 정규식 4존 카테고리 대응 (2-3h)

### 1-3. vendors vs purchase_details.supplier_name · 정규화 이중 저장 · 🟡 Medium

- **파일**: `server/routes/purchase/` 5 파일 · 76회 `supplier_name/supplier_id/vendor_id` 참조
- **문제**: `purchase_details.supplier_name` (텍스트) vs `vendors.company_name` (마스터) · 두 소스 병존
- **근거 · Grep 결과**:
  - `server/routes/purchase/supplierPayments.ts` · 39건
  - `server/routes/purchase/vat.ts` · 11건
  - `server/routes/purchase/supplierBalanceConfig.ts` · 13건
- **영향**: 공급사 rename · 매입이력 UI 표시 불일치 · displayVendorName 헬퍼 필요
- **조치**: `getDisplaySupplierName(row, vendorsMap)` 프리미티브 추출 · `matchesSupplierQuery` 와 함께 정형화 (#11 확산)

### 1-4. inventory · 3중 저장 (창고1/2·매장1/2/3) · 🟡 Medium

- **파일**: `src/components/ScanPage/StockRowCard.tsx:182-186` · `products.current_stock` xlsx snapshot · `inventory_checks` 실사
- **문제**: 3중 저장 (xlsx snapshot · 스캔 실사 · 파생 슬롯) · JOIN 대신 파생 컬럼 다수
- **영향**: 재고 정확도 사용자 대원칙 (원본·JOIN 우선) 위배
- **조치**: `inventory_checks` 단일 소스로 통합 · `current_stock` 파생 view · 별도 세션 (#10 확장)

### 1-5. purchase_details vs orders vs receiving · 3-way 정합성 미검증 · 🟡 Medium

- **파일**: `docs/LARGE_TASKS_STATUS_2026-08-31.md:38` · #10 진행 대기
- **문제**: 발주(orders) → 매입(purchase_details) → 입고(receiving) 3-way 데이터 · 자동 검증 없음
- **조치**: 검증 스크립트 (`scripts/audit-purchase-3way.mjs`) 작성 · 조사 위주 · 4-8h

---

## 2. Endpoint 중복·불일치 (Medium)

### 2-1. `/api/products*` 중복 라우트 · 🟡 Medium

- **파일**: `server/routes/stock/products.ts`
- **라우트 (13개 · 유사 스코프)**:
  - `GET /api/products-map` (L39) · 전체 배열 · 진열도 페이지용
  - `GET /api/products-by-category` (L130) · 카테고리 필터
  - `GET /api/products-search` (L150) · 텍스트 검색
  - `GET /api/products/expiry-imminent` (L502)
  - `GET /api/products/hidden` (L521)
  - `GET /api/products/:code` (L537) · 단건 조회
  - `GET /api/products/realmap-check` (L486)
  - `POST /api/products` · `PATCH /api/products/:code` 등
- **관련**: 매입이력에서 `purchase-history` · `/api/products/purchase-history` (purchaseHistory.ts:29) 별도
- **영향**: 프론트에서 어느 것 쓸지 혼란 · #19 태스크 조사 대기 · #28 스캔·실재고 endpoint 통합 blocked
- **조치**: `docs/PRODUCT_ENDPOINT_COMPARISON.md` 작성 · 각 endpoint scope/필드 명세 · Zod schema 통일 (4-6h)

### 2-2. `supabase.from("products")` 파일 분산 · 🟡 Medium

- **파일 · 5개 파일 · 18회 참조**:
  - `server/routes/stock/products.ts` · 13회
  - `server/routes/display/requests.ts` · 1회
  - `server/routes/display/mismatches.ts` · 1회
  - `server/productCache.ts` · 1회
  - `server/lib/optimalStock.ts` · 2회
- **문제**: 상품 조회 로직 3 도메인 분산 · normalize 규칙 중복
- **조치**: `server/lib/productQuery.ts` 추출 · findProduct(code) · listProducts(filter) 통합 (#16 대형)

### 2-3. matchesSupplierQuery · matchesProductQuery 확산 (진행중) · 🟢 Low

- **완료**: `OrderHistoryTab` · `BorrowingPage` (커밋 da010aec)
- **남은 후보 · Grep 결과**:
  - `ExpiryImminentTab` (placeholder "상품·공급사·구역 검색" · 인라인)
  - `DisplayPage/RealStockTablePage.tsx` L518 · 인라인 검색
  - `UnassignedProductsTab.tsx` L129 · 인라인
  - 약 8-12 파일 후보 (docs/LARGE_TASKS_STATUS_2026-08-31.md:53)
- **조치**: `.filter(r => r.supplier?.toLowerCase().includes(q))` → `matchesSupplierQuery` 교체 · 안전 · 2-3h

### 2-4. 도메인 라우트 분산 · 🟢 Low (별도 세션)

- **파일 · server/routes/ · 40 파일 · 260 router.get/post/patch/put/delete**
- **TOP 파일**:
  - `ocr/ocr.ts` · 25회
  - `stock/stockManage.ts` · 17회
  - `stock/products.ts` · 16회
  - `display/requests.ts` · 17회
- **조치**: 도메인 단위 통합 · `products.ts` 단일 · `vendors.ts` 단일 · #16 대형 (별도 세션)

---

## 3. 프레임워크 준수 (Low)

### 3-1. audit-framework · 프론트 클린 99.7% · 🟢

- **위반 · 2 파일 · 2건**:
  1. `src/components/BarcodeScanner/BarcodeScanner.tsx:422` · raw-alert (iOS SSO fallback · 정당한 예외 검토 중)
  2. `src/components/OrderManagePage/OrderNeedTab.tsx` · large-file-warn (824L · 서브 분리 권장)
- **조치**: 위 2건 baseline 등재 후 · CI 필수화 · 신규 위반 차단

### 3-2. audit-server · 서버 라우트 53% 준수 · 🔴 High

- **핵심 위반 · 115건**:
  - 🔴 **no-authorize · 20건 (권한 우회 위험)**:
    - `server/routes/ocr/ocr.ts` · 12건 (L379~L1761)
    - `server/routes/settings/settings.ts` · L163/L199
    - `server/routes/purchase/vendors.ts:19` · `staff/hrForms.ts:125`
    - `server/routes/stock/stockArrivals.ts:190` (anon-push · 정책 결정 필요)
    - `server/routes/board/clientErrors.ts:24` (익명 로깅 · 의도적)
  - 🟡 **no-validate-body · 89건 (Zod 검증 없음)**:
    - `ocr/ocr.ts` · 13건 · `display/requests.ts` · 9건 · `vendors.ts` · 7건 · `settings.ts` · 8건
  - 🟡 **no-async-handler · 6건**:
    - `ocr/ocr.ts` L371/L373/L730 · `schedules.ts` L18/L20/L21/L22/L24/L34/L35
- **조치**:
  - 즉시: OCR/Settings/Vendors authorize 추가 (1 라우트 = 1 커밋 · 회귀 검증) · 2-4h
  - 단기: shared/schemas/* 생성 · validateBody 확산 · 6-8h

### 3-3. HttpError 미사용 · `throw new Error` 32건 · 🔴 High

- **파일**:
  - `server/routes/stock/stockManage.ts` · 11건
  - `server/routes/purchase/supplierPayments.ts` · 13건
  - `server/routes/purchase/vat.ts` · 5건
  - `server/routes/purchase/purchase.ts` · 4건
- **문제**: `throw new Error(error.message)` · Supabase 오류 raw 전파 · 500 status 통일 안됨
- **조치**: `throw new HttpError(500, err.message)` 로 교체 · 2-3h

### 3-4. as any 남용 · 🟡 Medium

- **프론트 · 130 파일 · 343건** · 서버 · 42 파일 · 174건
- **TOP 프론트**:
  - `PurchaseHistoryTab.tsx` · 14건
  - `ReturnListPanel.tsx` · 10건
  - `OrderManagePage.modals.tsx` · 8건
- **TOP 서버**:
  - `display/requests.ts` · 31건
  - `purchase/vat.ts` · 17건
- **조치**: Zod parse 결과 활용 · Supabase 응답 타입 명시 · 파일별 순차 정리

---

## 4. 성능 (Medium)

### 4-1. 대형 파일 · 렌더 리스크 · 🟡 Medium

- **프론트 800+ 라인 파일 · 12개**:
  - `OrderNeedTab.tsx` · 823L
  - `RawOcrTable.tsx` · 799L
  - `EmployeeCalendarModal.tsx` · 798L
  - `PurchaseHistoryTab.tsx` · 797L
  - `DisplayPage.tsx` · 796L
  - `AppNavHeader.tsx` · 793L
  - `ScanPage.tsx` · 788L
  - `SchedulePage.tsx` · 786L
  - `HrFormsPage.tsx` · 779L
  - `ContractSettingsPage.tsx` · 779L
  - `DayTimelineModal.tsx` · 776L
  - `ResignationWriterPage.tsx` · 770L
- **문제**: 큰 함수형 컴포넌트 · re-render 시 전체 계산 · React.memo 미사용
- **조치**: `React.memo` · `useMemo` · `useCallback` 채택 확대 · 서브컴포넌트 분리 (파일별 큰 리팩터 · 각 4-8h)

### 4-2. purchase_details 12,933 rows · 클라이언트 필터 · 🟡 Medium

- **파일**: `docs/TASKS_STATUS_2026-08-31.md:97` · #26 완료 이력
- **문제**: 12,933 rows 클라이언트에서 필터 · 페이지네이션 부재
- **조치**: 서버 페이지네이션 + 커서 기반 · Zod 응답 스키마 정의 · 4-6h

### 4-3. N+1 · /api/products-map 매 로드 · 🟡 Medium

- **파일**: `src/lib/productsCache.ts` · 캐시 층 존재
- **문제**: 여러 페이지 mount 시 매번 호출 가능성 · TTL 정책 불분명
- **조치**: TanStack Query 통합 or `productsCache.ts` TTL 정형화 (`useApiQuery` 활용) · 2-3h

### 4-4. 서버 대형 파일 · 🟡 Medium

- `stockManage.ts` · 2272L · 라우트 17개
- `ocr/ocr.ts` · 1767L · 라우트 25개
- **조치**: 도메인 서브파일 분리 (#16)

---

## 5. 보안 (Low · RLS 완료)

### 5-1. ✅ RLS 활성화 완료 (#12)

- `sql/2026-08-30c-enable-rls-all-tables.sql:16-31` · public 스키마 전체
- 프론트 `.from("...")` **0건** · 브라우저 supabase 클라이언트 안전 (Storage 업로드만 · ImageUploadField)

### 5-2. 🔴 render.yaml env 누락 (다시 확인 필요)

- **파일**: `render.yaml` L8-49
- **누락**: `VITE_SUPABASE_URL` · `VITE_SUPABASE_ANON_KEY`
- **영향**: Render 배포 시 · `import.meta.env.VITE_*` undefined → ImageUploadField crash
- **관련**: `src/supabase/client.ts:33` · supabase = null (브라우저)
- **조치**: `render.yaml` env 추가 · 15분 · Render 재배포

### 5-3. authorize 커버리지 20건 gap · 🔴 High (섹션 3-2 참조)

### 5-4. SECURITY_AUDIT S1~S4 High 취약점 미해결 · 🔴 High

- **참고**: `docs/SECURITY_AUDIT_2026-08-29.md` (별도 이슈 · 후속 확인 필요)

---

## 6. UX/UI 일관성 (Medium)

### 6-1. 폰트 사이즈 +2 원칙 · 준수 여부 · 🟡

- **완료 이력** (`docs/TASKS_STATUS_2026-08-31.md`):
  - #27 · 매입이력 폰트 +3
  - #47 · 목업 파일 14개 폰트 +2
  - #33 · 발주요청목록 폰트 +2
- **미확인**: LandingPage · SchedulePage · SettingsModal · 관리자 페이지
- **조치**: `grep -r "text-xs\|text-sm"` 로 소형 폰트 파일 리스트 · 순차 확대

### 6-2. 목업 대비 실제 페이지 톤 차이 · 🟡 Medium

- **참고 목업**: `docs/UI_MOCKUP_2026-08-21.html` · `docs/UI_MOCKUP_STAFF_DETAIL_V9_2026-08-24.html` · `docs/UI_MOCKUP_HR_FORMS_2026-08-27.html` · `docs/UI_MOCKUP_BORROWING_REDESIGN_2026-08-30.html`
- **미적용 상태**:
  - #46 직원 상세정보 (StaffDetailPanel 560L · 큰 리팩터)
  - #48 HrFormsPage (779L · 큰 리팩터)
  - #37 반품 페이지 SplitListPanel 완전 이관
  - #9 차용등록 재설계 (Phase A SQL 대기)
- **조치**: 페이지별 큰 리팩터 · 4-8h/페이지 (별도 세션)

### 6-3. SplitListPanel 페이지별 넓이 불일치 · 🟢

- **완료** (#37 partial 96141334): 반품 페이지 max-w-[1360px] 통일
- **남은 것**: ReturnListPanel 자체 SplitListPanel 이관

### 6-4. 사이드바 활성 표시 · 🟢 (완료 #51)

### 6-5. GradientAccent · ActionBar 미확산 · 🟡

- GradientAccent · **1 파일만 채택** (36건 인라인 잔존)
- ActionBar · **0 파일 채택** (67건 sticky-bottom 잔존)
- **조치**: 확산 세션 · 프리미티브 적용 · 3-4h

### 6-6. 인라인 Loader2 · 4곳 (Spinner 미사용) · 🟢 Low

- `OrderManagePage/CategoryTab.tsx:473`
- `OrderManagePage/OrderRequestTab.tsx:188`
- `SalesTrendPage/ZoneCategoryContent.tsx:343`
- `StockManagePage/LossHistoryTab.tsx:222`
- **조치**: `<Spinner>` 교체 · 20분

---

## 7. 태스크 상태 (2026-08-31)

- 참고: `docs/TASKS_STATUS_2026-08-31.md` · `docs/LARGE_TASKS_STATUS_2026-08-31.md`
- 완료: 30+ 태스크 · 진행중: 5 (#9 · #10 · #11 · #13 · #18) · 대기: 13
- **대형 스코프 (별도 세션)**:
  - #9 · 차용등록 재설계 · SQL 대기 · 8-24h
  - #13 · real_map → location · 110 파일 · 6-10h
  - #14 · KV → DB (부분) · 조사 위주 · 2-4h
  - #16 · API 재구성 · 별도 세션
  - #46 · #48 · UI 목업 적용 · 각 4-8h

---

## 8. 테스트·안정성

### 8-1. Vitest · 3382 tests · pass 3370 · 실패 12 (0.35%) · 🟡

- **파일 실패 · 3 파일 · 12 tests**:
  - `ProductInfoPage.test.tsx` 계열 · waitFor timeout "타이레놀" · async 초기화 이슈
- **위험**: async 테스트 flakiness · CI 안정성 저해
- **조치**: 실패 3 파일 특정 · MSW mock 안정화 · 1-2h

### 8-2. 커버리지 낮은 파일 · 미측정 · 🟡

- **조치**: `npx vitest --coverage` · TOP 20 미커버 파일 리스트 · 별도 세션

### 8-3. 회귀 위험 파일 · 대형 · `as any` 다수 · 🟡

- **파일** (섹션 3-4 · 4-1 교차):
  - `PurchaseHistoryTab.tsx` (797L · 14 as any)
  - `OrderNeedTab.tsx` (823L · large-file)
  - `ReturnListPanel.tsx` (10 as any)
  - `display/requests.ts` (980L · 31 as any · 9 validate 누락)
- **조치**: pre-commit hook · TS + build + test 필수

---

## 9. 리스크 · 급한 것

### 9-1. 🔴 Render 배포 blocker · VITE_SUPABASE_URL 누락

- 다음 push 시 · 프로덕션에서 ImageUploadField crash
- **조치**: `render.yaml` env 추가 (15분)

### 9-2. 🔴 OCR 라우트 authorize 12건 gap

- POST/PATCH/DELETE 익명 허용 · 관리자 전용으로 승격 필요
- **조치**: 순차 authorize(9) 추가 · 2h

### 9-3. 🟡 3-way fallback 지속

- `location ?? display_location ?? spec` · xlsx 재임포트 시 · location stale
- **조치**: #13 진행 · 스코프 축소

### 9-4. 🟡 stockManage.ts · supplierPayments.ts · HttpError 미사용 32건

- 500 status 통일 안됨 · 에러 리포팅 부정확
- **조치**: 순차 교체 · 2-3h

### 9-5. 🟢 사용자 flow 붕괴 · 없음 (RLS · SplitListPanel · matchesSupplier 진행중 안전)

---

## 10. 추천 우선순위 · TOP 10

| # | 심각도 | 항목 | 근거 · 파일:라인 | 영향 | 조치 · 예상 |
|---:|:-:|---|---|---|---|
| **1** | 🔴 | render.yaml VITE_SUPABASE_URL 누락 | `render.yaml:8-49` | 배포 시 ImageUploadField crash · 브랜딩·회사정보·도장 업로드 실패 | 즉시 env 추가 · 15분 |
| **2** | 🔴 | OCR 라우트 authorize 12건 누락 | `server/routes/ocr/ocr.ts:379~1761` | 익명 POST/PATCH/DELETE · 권한 우회 위험 | 즉시 authorize(9) 추가 · 2h |
| **3** | 🔴 | Settings·Vendors·HrForms authorize 4건 | `settings.ts:163,199` · `vendors.ts:19` · `hrForms.ts:125` | 관리자 전용 우회 | 즉시 · 1h |
| **4** | 🔴 | HttpError 미사용 · raw Error 32건 | `stockManage.ts` (11) · `supplierPayments.ts` (13) · `vat.ts` (5) · `purchase.ts` (4) | 500 status 통일 · 에러 리포팅 부정확 | 순차 교체 · 3h |
| **5** | 🔴 | products 3+1 필드 정합성 (location/display_location/spec/real_map) | `sql/2026-08-27-location-column-migration.sql` · `src/` 47 파일 real_map | 재임포트 시 stale · 4-way 동기 부담 · #13 진행 | 원본 확정 · fallback 정형화 · 4-8h |
| **6** | 🟡 | 서버 validateBody 89건 누락 | `ocr/ocr.ts` (13) · `display/requests.ts` (9) · `vendors.ts` (7) | Zod 검증 없이 body 수용 · 타입 안전 저하 | shared/schemas 생성 · 6-8h |
| **7** | 🟡 | Vitest 12 tests 실패 (ProductInfoPage) | `ProductInfoPage.test.tsx:210` waitFor timeout | CI flakiness · 회귀 감지 저해 | MSW mock 안정화 · 1-2h |
| **8** | 🟡 | matchesSupplierQuery 확산 · 8-12 파일 남음 | `ExpiryImminentTab` · `RealStockTablePage:518` · `UnassignedProductsTab:129` | 검색 UX 불일치 · #11 진행 | 순차 교체 · 2-3h |
| **9** | 🟡 | 대형 프론트 파일 · React.memo 미사용 · 12파일 800L+ | `OrderNeedTab.tsx` (823) · `PurchaseHistoryTab.tsx` (797) 등 | re-render 성능 저하 | 서브 분리 · memo 채택 · 4-8h/파일 (별도 세션) |
| **10** | 🟡 | as any 남용 · 프론트 343건 · 서버 174건 | `PurchaseHistoryTab` (14) · `display/requests.ts` (31) | 타입 안전 저하 · 리팩터 회귀 위험 | 파일별 순차 · Zod parse 결과 활용 |

---

## 11. 요약 · 다음 세션 권장

**즉시 (안전 · 1일 이내)**:
1. `render.yaml` · VITE_SUPABASE_URL·ANON_KEY 추가 (15분)
2. OCR·Settings·Vendors·HrForms authorize 16건 (3h)
3. HttpError 교체 · stockManage·supplierPayments·vat·purchase (3h)
4. Vitest 12 tests fix (1-2h)
5. `matchesSupplierQuery` 확산 8-12 파일 (2-3h)

**단기 (검증 필요 · 3-5일)**:
6. shared/schemas · validateBody 89건 확산
7. products endpoint 스코프 정리 (#19 · docs 작성)
8. real_map → location fallback 정형화 (#13 부분)
9. GradientAccent·ActionBar 확산

**대형 (별도 세션)**:
10. #9 차용등록 Phase A (SQL 실행 후)
11. #46/#48 목업 적용 (직원 상세 · HR 양식)
12. #16 API 재구성
13. 대형 프론트 파일 리팩터 (React.memo · 서브 분리)

---

## 12. 참고 문서

- `docs/PROJECT_HEALTH_AUDIT_2026-08-30.md` · 헬스 감사 (5 TOP 크리티컬)
- `docs/FRAMEWORK_COMPLIANCE_AUDIT_2026-08-30.md` · 프레임워크 준수
- `docs/DATA_INTEGRITY_AUDIT_2026-08-29.md` · 데이터 정합성 (C1~C5)
- `docs/SECURITY_AUDIT_2026-08-29.md` · 보안 (S1~S12)
- `docs/DB_DEAD_COLUMNS_2026-08-10_FULL.md` · 미사용 컬럼
- `docs/TASKS_STATUS_2026-08-31.md` · 태스크 현황
- `docs/LARGE_TASKS_STATUS_2026-08-31.md` · 대형 태스크
- `docs/MENU_STRUCTURE.md` · 전체 페이지·API 카탈로그 (단일 소스)
- `docs/FRAMEWORK_AUDIT.md` · `docs/SERVER_AUDIT.md` · 자동 감사

---

**작성**: 2026-08-31 · Read/Grep/Glob 정적 분석 · 파일 편집 없음
**갱신 트리거**: TOP 10 중 3건 이상 조치 완료 시 · 재리뷰
