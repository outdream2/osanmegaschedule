# Framework Audit Report — 2026-09-01

> 조사·리포트 전용 · 수정 없음
> 감사 범위: frontend (src/) + backend (server/routes/) 전체

---

## 1. 프레임워크 프리미티브 사용 현황

### 1-1. common/ 프리미티브 수량

`src/components/common/` 에 **62개** 컴포넌트/모듈 (test 제외) 확인.

주요 카테고리:
- Split 패밀리: SplitListPanel, SplitPanel, SplitRightHeader, SplitRightEmpty, SplitRightError, SplitRightLoading, SplitRightTabs, SplitLeftHeader (8개)
- 레이아웃: PageContainer, PageHeader, PageToolbar, ActionBar, Toolbar, SectionCard, CollapseCard (7개)
- 입력: Button, IconButton, SearchBar, StepperInput, FilterBar, FilterSortBar, SearchFilterChips (7개)
- 데이터표시: KpiCard, MiniCard, ListRow, TableList, StatusPill, Badge, AccentBar, GradientAccent (8개)
- 피드백: Spinner, EmptyState, LoadingState, ListLoading, Modal, ConfirmDialog, NotificationToast (7개)
- 기타: Card, GroupedListPanel, Breadcrumb, FieldLabel, SectionLabel, InlineLabel, IconTile, Hero, TabBar, SortableHeader, ResizableHeader, SegmentedControl, SeasonButtons, EmployeeChip, VendorCategoryBadge, VendorInfoHeader, ProductClassFilter, ProductDetailHero, PurchaseHistoryList 등

### 1-2. apiClient 사용처 (api.get/post/put/delete)

**60개 파일** 에서 `api.(get|post|put|delete)` 호출 확인 → 핵심 클라이언트 계층 충분히 확산.

### 1-3. 인라인 fetch() 잔여 현황

실제 fetch() 호출 파일 **14개** (test 제외):

| 파일 | 용도 | 예외 여부 |
|---|---|---|
| `src/App.tsx` | `/api/auth/logout` (fire-and-forget) | 의도적 · best effort |
| `src/main.tsx` (2건) | `/api/auth/refresh` + brand_identity 초기로드 | bootstrap 단계 · apiClient 미초기화 |
| `src/constants/zoneLabels.ts` | `/api/zone-labels` 모듈 초기화 | 모듈 레벨 호출 · 훅 불가 |
| `src/hooks/useFetch.ts` | 범용 fetch 훅 내부 구현 | 인프라 레이어 · 정상 |
| `src/lib/apiClient.ts` (2건) | refresh + health check 내부 | 핵심 인프라 · 정상 |
| `src/lib/cloudinaryUpload.ts` | 외부 Cloudinary API | 외부 서비스 · 정상 |
| `src/lib/errorReporter.ts` | `/api/client-errors` (에러 리포터) | 순환 방지 목적 · 정상 |
| `src/lib/contract/index.ts` | `api.get/post` (apiClient 사용) | comment 오류 · fetch 미사용 |
| `src/lib/productsCache.ts` | `/products.json` static 파일 | 정적 에셋 · 정상 |
| `src/components/OcrPage/geminiEngine.ts` | `/api/ocr` | Gemini 엔진 전용 · 변경 금지 |
| `src/components/OcrPage/OcrPage.tsx` | `/api/ocr?stream=1` SSE 스트림 | 스트리밍 특수 케이스 |
| `src/components/HrFormsPage/utils.tsx` | HR form download URL | 단순 GET · apiClient 이관 가능 |

**실제 미해결 인라인 fetch: 1건** (`HrFormsPage/utils.tsx`) — apiClient 이관 후보.

---

## 2. API 통합 상태

### 2-1. 라우터 파일 현황

- 총 route 파일 (*.ts, test 제외): **47개**
- 총 endpoint 수 (`router.(get|post|put|patch|delete)` 합계): **263개**

주요 도메인별 endpoint 수:
| 도메인 | 파일 | endpoint 수 |
|---|---|---|
| stock/stockManage | stockManage.ts (2332L) | 17 |
| ocr | ocr.ts (1767L) | 25 |
| schedule | schedules.ts | 15 |
| settings | settings.ts | 12 |
| board | board.ts | 12 |
| stock/products | products.ts (798L) | 15 |
| display/requests | requests.ts (975L) | 17 |
| purchase/supplierPayments | supplierPayments.ts (1042L) | 11 |

### 2-2. 프레임워크 준수 현황

| 항목 | 적용 파일 수 / 전체 | 비율 |
|---|---|---|
| asyncHandler | 41 / 47 | 87% |
| HttpError | 39 / 47 | 83% |
| Zod 검증 | 6 / 47 | **13%** ← 위험 |
| authorize | 36 / 47 | 77% |
| raw try{} 내부 | 25파일 · 115건 | 혼재 |

**Zod 적용률 13% — 가장 큰 위험.** Zod 없는 41개 파일에서 req.body/params 직접 접근 중.

### 2-3. authorize 미적용 파일 (11개)

`clientErrors.ts` (의도적 익명 허용), `vat.ts`, `purchaseHistory.ts`, `purchase.ts`, `stockArrivals.ts`, `lossTracking.ts`, `referenceValues.ts`, `staff.ts`, `settings.ts`, `autoImport.ts`, `systemConfig.ts` — 각각 확인 필요.

### 2-4. select('*') 잔여

**11개 파일**에서 `.select("*")` 사용 — 과도한 컬럼 전송 위험:
`products.ts`, `requests.ts`, `stockManage.ts`, `ocrConfirmed.ts`, `borrowings.ts`, `ocr.ts`, `zoneAssignments.ts`, `productCache.ts`, `scheduleService.ts`, `employeeContracts.ts`, `supabaseFetchAll.ts`

---

## 3. 공통 훅·모듈 확산

### 3-1. hooks/ 현황 (69개, test 포함)

핵심 훅 (사용처 다수):
- `useApiCall` — 60개 파일 사용 (핵심 뮤테이션 훅)
- `useApiQuery` — 광범위 사용
- `useToast` — 전역 알림
- `useKvSetting` — KV DB 연동 설정 (다수 훅에서 wrapping)

도메인 훅 (단일 목적):
- `useVendors`, `useReferenceValues`, `useZoneDefs`, `useSeasonRanges` 등

### 3-2. lib/ 현황

`src/lib/` — 약 50개 파일:
- `format.ts` (fmtWon/fmtDate) — 9파일 통합 완료
- `apiClient.ts` — 60개 파일 사용
- `contract/index.ts` — localStorage 캐시 + DB 병행 (2-계층 구조 의도적)
- `payroll/` — 독립 급여계산 모듈

### 3-3. storageKeys.ts

`src/lib/storageKeys.ts` — localStorage key 상수 중앙화 확인. 그러나 `src/lib/contract/index.ts`는 별도 상수로 독자 정의 → 통합 후보.

---

## 4. 데이터 정합성

### 4-1. real_map 컬럼

`real_map` — 서버 **11개 파일**에서 정상 참조 확인. `productCache.ts`에서 `realMap: row.real_map` 올바른 매핑 유지.

### 4-2. warehouse_stock 잔여 참조

**34개 파일, 97건** 에서 `warehouse_stock` 참조 — 대부분 **클라이언트 코드** (StockManagePage, ScanPage, DisplayPage, RequestsPage 등) + migration SQL 파일.

- migration SQL 파일들: `20260803_..._5split_zones.sql`, `20260824_..._add_store_stock_2.sql` — 히스토리 파일 정상
- 서버 routes (products.ts, stockManage.ts, lossTracking.ts, requests.ts): 실제 쿼리에서 사용 중 → DROP 여부 사용자 확인 필요

### 4-3. contract localStorage 잔여

`src/lib/contract/index.ts` — `CONTRACT_SETTINGS_KEY`, `JOB_WAGES_KEY`, `CONTRACT_CLAUSES_KEY` 3개 localStorage key 사용 중. 단, DB 우선 + localStorage 캐시 폴백 2-계층 구조로 구현됨 (T-DB-Migrate-LocalStorage 2026-08-06). **대원칙 위반 여부 판단 필요**: 도메인 데이터가 localStorage에 잔류 가능.

### 4-4. KV 이관 (Batch 3)

`useKvSetting` 훅 사용 파일 다수 확인 → KV→DB 이관 완료 경로로 작동 중. localStorage 직접 사용하는 UI 상태성 키(탭 순서, 컬럼폭, 사이드바 등)는 정책상 localStorage 허용 항목.

---

## 5. 대형 파일

### 5-1. 서버 (700L+)

| 파일 | 라인 수 | 위험도 |
|---|---|---|
| `server/routes/stock/stockManage.ts` | **2,332L** | 높음 · 17 endpoint |
| `server/routes/ocr/ocr.ts` | **1,767L** | 높음 · 25 endpoint · Gemini 연동 |
| `server/routes/purchase/supplierPayments.ts` | **1,042L** | 중간 · 11 endpoint |
| `server/routes/display/requests.ts` | **975L** | 중간 · 17 endpoint |
| `server/routes/stock/products.ts` | **798L** | 중간 |
| `server/routes/purchase/vendors.ts` | **551L** | 중간 |
| `server/routes/purchase/purchase.ts` | **698L** | 중간 |

### 5-2. 클라이언트 (700L+)

| 파일 | 라인 수 | 비고 |
|---|---|---|
| `src/components/OcrPage/RawOcrTable.tsx` | **800L** (+ `/RawOcrTable/` 서브디렉터리) | audit baseline · 분리 진행 중 |
| `src/components/DisplayPage/DisplayPage.tsx` | **797L** | 2713→797 분리 완료 |
| `src/components/OrderManagePage/OrderManagePage.tsx` | **722L** | 요주의 |
| `src/components/StockManagePage/FlowTab.tsx` | **640L** | audit baseline |

---

## 프레임워크 준수 등급

| 영역 | 등급 | 근거 |
|---|---|---|
| 클라이언트 프리미티브 재사용 | **A** | 62개 primitives · apiClient 60파일 · 인라인 fetch 1건만 |
| 서버 asyncHandler / HttpError | **B** | 87% / 83% · 미적용 6~8파일 존재 |
| 서버 Zod 검증 | **C** | 13% · 41개 파일 미적용 |
| 서버 authorize | **B** | 77% · 의도적 예외 포함 시 실질 A |
| 대형 파일 분리 | **B** | 서버 stockManage 2332L / ocr 1767L 미분리 |
| 데이터 정합성 | **B** | warehouse_stock 잔여 · contract localStorage 캐시 |

---

## 미해결 위험 항목 (사용자 결정 필요)

1. **Zod 미적용 41개 route 파일** — req.body 무검증. 보안/안정성 위험. 우선순위 높음.
2. **`server/routes/stock/stockManage.ts` 2332L** — 단일 파일 17 endpoint. 분리 여부 결정 필요.
3. **`warehouse_stock` 97건 참조** — DROP 완료 여부 불명확. 서버 routes 4개 파일에서 실제 쿼리 사용 중.
4. **`src/lib/contract/index.ts` localStorage 도메인 데이터** — `contract-writer-settings`, `contractJobWages:v1`, `contractClauses:v1` 3개 키 → "대원칙 · 도메인 데이터 DB 저장" 위반 후보. 단, DB 우선 폴백 구조이므로 사용자 판단 필요.
5. **`HrFormsPage/utils.tsx` 인라인 fetch** — apiClient 이관 가능 · 저위험 · 단순 작업.

---

## 개선 우선순위

1. **Zod 검증 확산 (P0)** — 보안 · 41개 파일 · `z.object + validateBody 미들웨어` 패턴 적용
2. **stockManage.ts 분리 (P1)** — 2332L → 도메인별 서브 파일 (재고조정 / 매장재고 / 실재고 / etc.)
3. **contract localStorage 정리 (P2)** — DB 우선 구조 유지하면서 localStorage 캐시 제거 or 정책 문서화
4. **warehouse_stock 잔여 확인 (P2)** — DROP 완료 여부 DB 스키마 확인 후 코드 정리
5. **HrFormsPage fetch 이관 (P3)** — 단순 1건 · apiClient 대체 30분 작업
