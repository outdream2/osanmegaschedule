# 프레임워크 준수 전면 감사 · 2026-08-30

> 생성 · 2026-08-30 · 조사 전용 (코드 미수정)
> 도구 · `scripts/audit-framework.cjs` + `scripts/audit-server.cjs` 재실행 + 수동 grep
> 참고 · `docs/FRAMEWORK_COMPLIANCE_2026-08-29.md` · `docs/SERVER_AUDIT.md` · `docs/FRAMEWORK_AUDIT.md`

---

## 0. 종합 스코어카드

| 영역 | 스캔 | 위반 | 준수율 | 이전 대비 |
|---|---:|---:|---:|---|
| 프론트 프리미티브 (audit-framework) | 755 파일 | 1 파일 · 1건 | **99.9%** | 8건 → 1건 (SettingsModal 정리 완료) |
| 서버 라우트 (audit-server) | 41 파일 · 246 라우트 | 115건 (high 20) | **53%** (라우트 기준) | 131 → 115건 개선 |
| Server `throw new Error` | routes/ | 32건 · 5 파일 | — | HttpError 원칙 위배 |
| 프론트 raw fetch | src/ | 실질 0건 (예외 인프라만) | 100% | 안정 |
| `window.alert/confirm` | src/ | alert 1건 (iOS SSO fallback) | 99% | window.confirm 0건 |

---

## 1. 프론트 · 프리미티브 위반 (audit-framework 결과)

**총 1 파일 · 1건 · 클린 99.9%** — baseline 대비 회귀 없음.

| # | 파일:라인 | 규칙 | 수정 방향 |
|---:|---|---|---|
| 1 | `src/components/BarcodeScanner/BarcodeScanner.tsx:422` | raw-alert | `useToast.showError()` |

> iOS 코드 절대 미수정 원칙 · 다만 L422 는 SSO 토큰 발급 실패 fallback · WebView 밖 · useToast 교체 가능성 재검토 필요.

### 프리미티브 채택률 (참고 · 8-29 감사에서 조사)

| 프리미티브 | 채택 파일 수 | 상태 |
|---|---:|---|
| Card | 137 | 완전 확산 |
| Spinner | 133 | 완전 확산 |
| SectionCard | 9 | 채택중 |
| SplitListPanel | 5 | 정상 |
| BottomSheet | 5 | 정상 |
| GradientAccent | 1 | **미확산** (36건 인라인 잔존) |
| ActionBar | 0 | **미채택** (67건 sticky-bottom 잔존) |

### 잔존 인라인 패턴

- `<Loader2 ... animate-spin />` 인라인 · 4곳 (Spinner 미사용)
  - `src/components/OrderManagePage/CategoryTab.tsx:473`
  - `src/components/OrderManagePage/OrderRequestTab.tsx:188`
  - `src/components/SalesTrendPage/ZoneCategoryContent.tsx:343`
  - `src/components/StockManagePage/LossHistoryTab.tsx:222`
- raw-card-wrapper 매치는 대부분 `<input>·<select>·<textarea>·<ul>` (audit skip 정상)

---

## 2. 서버 · 라우트 위반 (audit-server 결과)

**총 41 파일 · 246 라우트 · 115 위반 (high 20 · medium 95)**

### 🔴 high · no-authorize (20건 · 권한 우회 위험)

| 파일 | 라우트 (라인) |
|---|---|
| `server/routes/ocr/ocr.ts` | POST/PATCH/DELETE 12건 (L379/530/562/581/594/635/658/683/708/730/1545/1614/1750/1761) |
| `server/routes/purchase/vendors.ts` | POST /api/upload-vendors (L19) |
| `server/routes/settings/settings.ts` | POST /api/blocked-slots (L163) · POST /api/zones (L199) |
| `server/routes/staff/hrForms.ts` | POST /api/hr-forms (L125) |
| `server/routes/stock/stockArrivals.ts` | POST /api/anon-push-subscribe (L190) |
| `server/routes/board/clientErrors.ts` | POST /api/client-errors (L24) |

### 🟡 medium · no-validate-body (89건 · Zod 검증 없음)

TOP 파일:
- `server/routes/ocr/ocr.ts` — 13건
- `server/routes/display/requests.ts` — 9건
- `server/routes/purchase/vendors.ts` — 7건
- `server/routes/settings/settings.ts` — 8건
- `server/routes/board/board.ts` — 6건
- `server/routes/stock/products.ts` — 6건
- `server/routes/board/notifications.ts` — 5건
- `server/routes/stock/stockArrivals.ts` — 5건
- `server/routes/schedule/schedules.ts` — 5건
- `server/routes/display/zoneAssignments.ts` · `zoneDefs.ts` — 각 3건
- `server/routes/payment/borrowings.ts` — 3건
- `server/routes/staff/employeeContracts.ts` · `contractClauses.ts` · `hrForms.ts` — 각 1-2건

### 🟡 medium · no-async-handler (6건 · 에러 표준 미준수)

- `server/routes/ocr/ocr.ts` L371(health) · L373(ocr-ping) · L730(POST /api/ocr)
- `server/routes/schedule/schedules.ts` L18/20/21/22/24/34/35 (schedules + employees 계열 7건 · asyncHandler 없이 wire)

### 🔴 hidden · `throw new Error(...)` 32건 (HttpError 미사용)

| 파일 | 건수 |
|---|---:|
| `server/routes/stock/stockManage.ts` | 11 |
| `server/routes/purchase/supplierPayments.ts` | 13 |
| `server/routes/purchase/vat.ts` | 5 |
| `server/routes/purchase/purchase.ts` | 4 |
| `server/routes/stock/products.ts` | 1 |

> `throw new Error(error.message)` 패턴 · Supabase 오류 그대로 raw Error 로 던짐 · HttpError(500, ...) 로 교체 필요.

---

## 3. 프론트 API 호출 (apiClient 준수)

- `apiClient` / `api.get/post/patch/del/put` — **다수 채택**
- raw `fetch("/api/…")` — **실질 0건** (모두 예외 인프라)
  - `apiClient.ts` (자체 refresh)
  - `main.tsx` · `App.tsx` (앱 초기화 · logout · 401 loop 회피)
  - `errorReporter.ts` (window.onerror · apiClient loop 회피)
  - `productsCache.ts` · `zoneLabels.ts` (정적 파일)
  - `OcrPage.tsx` · `geminiEngine.ts` (OCR SSE 스트리밍)
  - `useFetch.ts` (공용 훅 · 내부 fetch)
  - `HrFormsPage/utils.tsx:42` (원격 URL blob 다운로드 · CORS 회피)
  - `cloudinaryUpload.ts` (Cloudinary 외부 API)

### window.alert / window.confirm

- `window.confirm` — **0건** (SettingsModal 2건 정리 완료 · 5229d87d)
- `alert(...)` — 1건 · `BarcodeScanner.tsx:422` (iOS SSO 실패 fallback)

---

## 4. 타입 안전성

| 항목 | src (test 제외) | server (test 제외) |
|---|---:|---:|
| `as any` | 130 파일 · 343건 | 42 파일 · 174건 |
| `: any` | 109 파일 · 409건 | (측정 미실시) |
| `@ts-ignore` / `@ts-nocheck` | **0건** | **0건** |

### TOP 10 · `as any` 남용 (프론트 · test 제외)

| # | 파일 | 건수 |
|---:|---|---:|
| 1 | `src/components/OrderManagePage/PurchaseHistoryTab.tsx` | 14 |
| 2 | `src/components/OrderManagePage/ReturnListPanel.tsx` | 10 |
| 3 | `src/components/OrderManagePage/OrderManagePage.modals.tsx` | 8 |
| 4 | `src/components/StaffManagePage/StaffManagePage.tsx` | 5 |
| 5 | `src/components/OrderManagePage/OrderManagePage.tsx` | 7 |
| 6 | `src/components/OcrPage/OcrPage.tsx` | 7 |
| 7 | `src/components/OcrPage/RawOcrTable/RawOcrCellRenderer.tsx` | 6 |
| 8 | `src/components/OrderManagePage/ReturnRequestModal.tsx` | 6 |
| 9 | `src/components/SalesTrendPage/SupplierTrendTab.tsx` | 6 |
| 10 | `src/components/StockManagePage/SupplierTab.panels.tsx` | 7 |

### TOP 5 · `as any` 남용 (서버)

| # | 파일 | 건수 |
|---:|---|---:|
| 1 | `server/routes/display/requests.ts` | 31 |
| 2 | `server/routes/purchase/vat.ts` | 17 |
| 3 | `server/routes/purchase/supplierPayments.ts` | 9 |
| 4 | `server/routes/stock/products.ts` | 8 |
| 5 | `server/routes/purchase/vendors.ts` · `zoneAssignments.ts` | 각 8 |

---

## 5. 대형 파일 (Line Threshold)

- baseline 등재 (audit-framework `large-file-warn` · 800+ 라인)
  - `src/components/SettingsModal/SettingsModal.tsx` — 911L
  - `src/components/OrderManagePage/VendorDetailTabs.tsx` — 819L
  - `src/components/ScanPage/ProductInfoCard.tsx` — 843L
  - `src/components/DisplayPage/RealStockTablePage.tsx` — 777L
- **서버 · 2000+ 라인 (critical)**
  - `server/routes/stock/stockManage.ts` — 2272L
  - `server/routes/ocr/ocr.ts` — 1767L (audit 대상 밖 · 서버는 large-file 규칙 미적용)

---

## 6. TOP 10 · 즉시 조치 필요 (우선순위)

| # | 카테고리 | 대상 | 조치 | 소요 |
|---:|---|---|---|---|
| 1 | 🔴 서버 authorize | `server/routes/ocr/ocr.ts` (12건 · L379~L1761) | POST/PATCH/DELETE 전체에 `authorize()` 추가 | 中 |
| 2 | 🔴 서버 authorize | `server/routes/settings/settings.ts` L163/L199 | `POST /api/blocked-slots · /api/zones` authorize | 小 |
| 3 | 🔴 서버 authorize | `server/routes/purchase/vendors.ts:19` · `staff/hrForms.ts:125` | 관리자 전용으로 승격 | 小 |
| 4 | 🔴 서버 authorize | `server/routes/stock/stockArrivals.ts:190` (anon-push) | 익명 허용 vs authorize 정책 결정 필요 | 小 |
| 5 | 🔴 HttpError | `server/routes/stock/stockManage.ts` (11건 raw Error) | `throw new HttpError(500, err.message)` 로 교체 | 中 |
| 6 | 🔴 HttpError | `server/routes/purchase/supplierPayments.ts` (13건 raw Error) | 상동 · 트랜잭션 롤백 로그 병행 | 中 |
| 7 | 🟡 asyncHandler | `server/routes/schedule/schedules.ts` (7건) | 라우트 wire 를 `asyncHandler(controller)` 로 감싸기 | 小 |
| 8 | 🟡 validateBody | `server/routes/display/requests.ts` (9건 · display/order 계열) | `shared/schemas/display*.ts` 생성 · Zod 적용 | 中 |
| 9 | 🟡 프론트 프리미티브 | `BarcodeScanner.tsx:422` alert · Loader2 인라인 4건 | useToast + Spinner 교체 (iOS 무영향 검증) | 小 |
| 10 | 🟡 타입 안전 | `server/routes/display/requests.ts` (`as any` 31건) | Supabase 응답 타입 명시 · Zod parse 결과 활용 | 中 |

---

## 7. 준수 잘된 영역 (참고)

- ✅ **daily 계열** · `leave.ts` · `lunch.ts` · `reservations.ts` — 위반 0건 (asyncHandler + authorize + validateBody 완전 채택)
- ✅ **auth.ts** — HttpError 15건 · asyncHandler 11건 · validateBody 4건 (표준 준수)
- ✅ **프론트 apiClient** — raw fetch 실질 0건 · 인프라 예외만
- ✅ **@ts-ignore/nocheck** — 프론트/서버 전체 0건
- ✅ **useConfirm** — window.confirm 0건 완전 이관
- ✅ **audit-framework 준수율** — 755파일 중 754파일 클린 (99.9%)

---

## 8. 다음 세션 권장 순서

1. **오늘** — TOP 5 (OCR/Settings/Vendors/HrForms authorize 추가 · 1개 라우트 = 1개 커밋 · 회귀 검증)
2. **다음** — TOP 6-7 (stockManage / supplierPayments HttpError · schedules asyncHandler)
3. **중기** — TOP 8-10 (validateBody + as any 타입 정리)
4. **audit-server 재실행** · high 0건 도달 시 CI 필수화 (`npm run audit:server`)
5. **audit-framework baseline 갱신** · BarcodeScanner alert 처리 후

---

## 9. 참고 파일 경로

- 감사 도구
  - `D:\antigravity_projects\megatown-staff-scheduler\scripts\audit-framework.cjs`
  - `D:\antigravity_projects\megatown-staff-scheduler\scripts\audit-server.cjs`
- 자동 생성 리포트
  - `D:\antigravity_projects\megatown-staff-scheduler\docs\FRAMEWORK_AUDIT.md`
  - `D:\antigravity_projects\megatown-staff-scheduler\docs\SERVER_AUDIT.md`
  - `D:\antigravity_projects\megatown-staff-scheduler\docs\.framework-baseline.json`
- 이전 세션 리포트
  - `D:\antigravity_projects\megatown-staff-scheduler\docs\FRAMEWORK_COMPLIANCE_2026-08-29.md`
- 원칙 문서
  - `D:\antigravity_projects\megatown-staff-scheduler\docs\CODING_PRINCIPLES.md`
  - `D:\antigravity_projects\megatown-staff-scheduler\docs\FRAMEWORK.md`
  - `D:\antigravity_projects\megatown-staff-scheduler\docs\TASKS_HANDBOOK.md`
