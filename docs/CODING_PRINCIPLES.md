# 🧱 코딩 원칙 · megatown-staff-scheduler

> **모든 코딩 · 리팩터 · 테스트 시작 전 · 이 파일 필수 숙지** (사용자 지시 · 2026-08-23)
>
> **자매 파일**: [`docs/TASKS_HANDBOOK.md`](./TASKS_HANDBOOK.md) · 태스크·완료·대기·세션 상태
>
> **최종 업데이트**: 2026-08-23

---

## 🛑 최상위 대원칙 (예외 없음)

### 🧭 대원칙 0 · 이 2파일 · 작업 전 리뷰 + 종료 시 업데이트 (2026-08-23 신설)
- **모든 작업 시작 전** · 이 파일 (`CODING_PRINCIPLES.md`) + `TASKS_HANDBOOK.md` **필수 리뷰**
- **매 태스크 완료 시** · 두 파일 즉시 갱신 (완료 이동 · 신규 프리미티브 반영 · 원칙 추가)
- 관리 파일 산재 · 컨텍스트 파악 시간 낭비 방지 · **2파일 통합 운영**
- 참고 · `.claude/memory/feedback_handbook_review_before_work.md`

### 🛑 대원칙 A · 회귀 절대 금지
- **모든 원칙 위** · 사용자 flow 100% 유지 · 기존 기능에 티끌만큼 영향 X
- 위배 시 · **즉시 원상 복구 + 재작업**
- 매 편집 · TS clean + build ✓ + test all pass 확인
- Destructive 명령 전 · 로컬 checkpoint 커밋
- 참고 · `.claude/memory/feedback_no_regression_top.md` · `feedback_no_regression_strict.md`

### 🧱 대원칙 B · 프레임워크 베이스로 모든 것 진행 (2026-08-23 재강조)
- **모든** 작업 (신규·수정·리팩터·테스트·UI·서버·문서) · **프레임워크 재사용 우선**
- 원-오프 (일회성) 코드 절대 금지
- 3곳 이상 반복 · 즉시 프리미티브 추출
- 신규 프리미티브 필요 시 · 먼저 `common/*` 또는 `hooks/*` 에 추가 후 사용
- 참고 · `.claude/memory/feedback_framework_zero_principle.md` · `feedback_framework_first_priority.md`

---

## 📚 프레임워크 프리미티브 (재사용 필수 · 43+ 개)

### UI 프리미티브 · `src/components/common/*`
| 프리미티브 | 용도 | 신규 사용 시 |
|---|---|---|
| `Modal` (v3.4) | 6 sizes (sm/md/lg-narrow/3xl/lg/xl/full) · 3 backdrops (brand/brand-strong/dark) · 3 aligns · headerBgClass · bodyPadding · cardStyle · zIndex | 인라인 modal 만들지 말 것 |
| `Card` (v2) | variant · padding · rounded · bg · borderColor · shadow | box 만들 때 |
| `Badge` | 10 tones × 3 variants × 3 shapes × 3 sizes | 라벨/상태 배지 |
| `StatusPill` | 상태 배지 (tone · size · shape · dot) | 상태 표시 |
| `Spinner` | tone (brand · zinc · white) · label | 로딩 |
| `EmptyState` | icon · title · hint | 빈 상태 |
| `SearchBar` | 검색 입력 | 검색 |
| `SortableTable` / useSortableTable | 정렬 가능한 표 | 표 정렬 |
| `PageToolbar` | icon + title + count + search + right slot (필터·액션) | 페이지 최상단 툴바 |
| `AccentBar` | 좌측 accent 3px bar | 제목 앞 accent |
| `SplitPanel` | 좌우 리사이저 (useResizablePanel 내장) | 마스터-디테일 |
| `SplitListPanel` | 마스터 좌측 리스트 (toolbar + list + loading/empty/error) · **🔥 search prop 필수** | 좌측 리스트 |
| `CollapseCard` | 접기/펴기 카드 | 접기 UI |
| `KpiCard` | KPI 지표 카드 | 통계 지표 |
| `CategoryChips` | 카테고리 chip 선택 | 필터 |
| `IconTile` | 아이콘 타일 | 헤더 아이콘 |
| `BottomSheet` (v2) | fullscreen · header 커스텀 · disableHandle | 모바일 시트 |
| `InlineLabel` | 인라인 라벨 | 필터 앞 |
| `PeriodSelector` | 기간 세그먼트 | 기간 필터 |
| `SeasonButtons` | 계절 버튼 | 계절 필터 |
| `ConfirmDialog` | 확인 다이얼로그 (useConfirm 내장) | 확인 |
| `ImageUploadField` | 이미지 업로드 | 사진 업로드 |
| `MiniCard` | 소형 카드 | 요약 카드 |
| `EmployeeProfileCard` | 직원 프로필 카드 | HR/계약서 재사용 |
| `ProductDetailPanel` | 상품 상세 우측 | 상품 상세 |
| `ProductCreateModal` | 상품 신규 등록 (initialCode/lockCode 확장) | 상품 등록 |
| `VendorCategoryBadge` | 공급사 카테고리 배지 | vendor 배지 |
| `LoadingState` | 로딩 상태 | 로딩 |

### 훅 · `src/hooks/*`
| 훅 | 용도 |
|---|---|
| `useApiCall` | 통합 try/catch + loading + toast + error 상태 |
| `useConfirm` | Promise-based 확인 다이얼로그 (ConfirmProvider 필요) |
| `useToast` | Toast + `toastClass(tone)` |
| `useKvSetting` | 서버 KV 설정 (debounce 자동 저장) |
| `useZoneDefs` | 구역 정의 · KV `zone_defs` |
| `useAuth` | 인증 · idle timeout · activity tracking |
| `useSortableTable` | 표 정렬 (Comparator · SortDir) |
| `useResizablePanel` | 좌우 폭 조절 · localStorage 저장 |
| `useSortableTabs` | 탭 재정렬 · long-press · localStorage |
| `useColumnResize` | 컬럼 폭 조절 |
| `useVendors` | 공급사 리스트 |
| `useSeasonRanges` | 계절 범위 |
| `useHiddenManager` | 숨김 상품 관리 |
| `useMobilePageLevel` | 모바일 페이지 노출 레벨 (deprecated · #188 예정) |
| `usePagePermissions` | 페이지 권한 |
| `useProductInfoSearch` | 상품 검색 |

### 라이브러리 · `src/lib/*`
| 모듈 | 용도 |
|---|---|
| `apiClient` · `api.get/post/patch/del<T>` + `ApiError` | 서버 통신 (401 자동 로그아웃 · 에러 표준화) |
| `productsCache` · `getProductsMap` · `lookupProduct` · `addCachedProduct` · `updateCachedProduct` | 상품 로컬 캐시 |
| `hangulSearch` · `matchHangul` | 한글 초성 검색 |
| `format` · `fmtWonCompact` | 통화 포맷 |
| `approvalEvents` · `dispatchApprovalChange` | 승인 이벤트 |
| `employeeApi` · `lib/contract/*` | 직원 API · 계약 helpers |

### 서버 프레임워크 · `server/**/*`
| 요소 | 용도 |
|---|---|
| `asyncHandler` | async 라우터 wrapper (Promise 자동 catch) |
| `HttpError` · `badRequest` · `unauthorized` · `forbidden` · `notFound` | 표준화 에러 |
| `errorHandler` 미들웨어 | 최종 에러 응답 (JSON) |
| `authorize(minLevel)` · `requireAuth` | 권한 미들웨어 |
| Zod 스키마 · `src/shared/schemas/*` | 서버-클라 공유 스키마 |
| `supabase` (`src/supabase/client`) | DB 클라이언트 |

---

## 🎨 UI 대원칙

### ⭐ 재강화 · UI 프리미엄 (2026-08-24 사용자 지시 · 3차 강조)
- **UI 작업 전 · 항상 UI 대원칙 숙지** · 이 섹션 + memory `feedback_ui_premium_reinforce.md`
- **UI 프레임워크 프리미티브 · 적극 활용 (필수)** · Card · Modal · GroupedListPanel · SplitListPanel · ListRow · SplitRightEmpty/Loading/Error · Badge · StatusPill · IconTile · AccentBar · InlineLabel · PeriodSelector · CategoryChips 등 45+
- **최신 기술** · React 19 · Tailwind 4 · Pretendard · GPU 가속 · frosted glass (backdrop-blur)
- **최신 인기 디자인** · Linear · Vercel · Notion · Attio · Ramp · Brex · Cursor 2026 톤
- **파스텔·이모지·촌스러움 · 절대 금지** (반복 강조)
  - ❌ 파스텔 bg-sky-50/40 · bg-amber-50/40 · bg-rose-50/40 등 · 데이터 셀 배경
  - ❌ 이모지 (📦·💰·⭐ 등) · 프로덕션 UI 사용 금지
  - ❌ 다색 배지 남발 · 색깔 뱃지 여러개 나열
- **깔끔** · 여백·정렬·통일 · monochrome base + 단일 accent
- **고급** · 딥네이비 accent · 3-layer shadow · frosted backdrop · monospace 숫자
- **세련** · 마이크로 인터랙션 · smooth 150ms · active:scale-[0.98]
- **멋지게** · 시각적 계층 · 대비 (text-ink vs text-ink-soft) · 강조 (text-brand-deep bold)
- **초고해상도** · retina · image-rendering · antialiased · font-feature-settings
- **부드러운 UI** · 애니메이션 · scroll · hover 부드럽게 · transition-all duration-150-200

### 🎨 리스트 UI 원칙 (2026-08-24 재강조)
- **🔥 리스트 = 무조건 표(테이블) 형식** (사용자 지시 · 2026-08-24)
  - `<table>` `<thead>` `<tbody>` 정식 구조
  - 헤더 있음 · 컬럼명 명시 · 정렬 화살표 (▼▲)
  - **정렬 가지런** · text-right (숫자) · text-left (문자) · text-center (액션)
  - **tabular-nums** · 숫자 컬럼 정렬 필수
  - Card 카드형 나열 지양 · 표만
- **테이블 셀 · 색깔 bg 지양** · zinc-50/40 통일 · 강조는 **text 색만**
  - 예: 부족 · `text-rose-600` (bg 없음)
  - 예: 발주금액 · `text-brand-deep font-bold` (bg 없음)
- **카테고리 그룹 헤더 (colspan) · 제거** · 서브헤더 (컬럼명) 만 유지 · 미니멀
- **그룹 · sticky 하위 헤더 row** · 공급사·카테고리 등 · 표 안에 <tr> 로 · Notion/Attio 톤
- **선택 row** · `bg-brand-tint/50` (딥네이비 톤) · rose·sky bg 지양
- **hover row** · `bg-brand-tint/25` 통일 · orange·sky 지양
- **상단 gradient accent** · `bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep` · 세션 시그니처 (랜딩 톤)
- **폰트** · thead 13px semibold uppercase · tbody 15px medium · 숫자 17px tabular-nums bold
- **hairline border** · `rgba(17,24,39,0.06)` · 셀 구분 · shadow 없음
- **참고 톤** · Linear · Attio · Notion · Ramp 2026 · "Calm Density"

### 📋 SplitPanel 우측 4대 상태 (2026-08-24 · #261)
- **SplitRightEmpty** · 좌측 미선택 시 · 아이콘+타이틀+힌트
- **SplitRightLoading** · 데이터 fetch 중 · Spinner+label
- **SplitRightError** · API 실패 · 오류 카드+재시도 버튼
- **SplitRightHeader** (후속) · SplitLeftHeader 대칭

### 🎨 UI 목업 파일 기준 (2026-08-23 재강조)
- 모든 UI 작업 · `docs/UI_MOCKUP_2026-08-21.html` 목업 기준
- PC · Mobile · 색상 · 타이포 · 간격 · 목업 톤 통일
- Linear · Vercel · Notion 2026 톤 · 파스텔 · 이모지 · 촌스러움 절대 금지

### 폰트 · 색상 · 톤
- 폰트 · Pretendard · antialiasing · GPU 가속 · 40대+ 가독성 우선 (**기본 +2 size**)
- 브랜드 · 딥네이비 (`brand-deep`) · accent · `brand-tint` (연한 배경)
- 회색 · `zinc-*` · 라인 · `border-line`
- 상태 · emerald (정상) · amber (주의) · rose (위험) · sky (정보)

### UI 변경 시 · 기능 절대 유지
- className 만 조정 · props · state · handler · API 시그니처 절대 변경 X
- 참고 · `.claude/memory/feedback_ui_only_no_func_change.md` · `feedback_framework_untouchable.md`

### 🔍 SplitListPanel · 검색창 상단 필수 (2026-08-24 · #262 · 사용자 지시)
- `SplitListPanel` 를 쓰는 **모든 곳** · 반드시 `search` + `onSearchChange` prop 세팅
- 검색창 · 리스트 위쪽에 항상 표시 (프리미티브가 자동 · 상단 헤더 2행)
- `filters` 슬롯 안에 커스텀 `<input>` 넣기 **금지** · built-in props 사용
- placeholder · 도메인 명확화 (예: "공급사명 · 코드 검색")
- 참고 · `.claude/memory/feedback_splitlist_search_required.md` · `src/components/common/SplitListPanel.tsx` 파일 상단 대원칙

---

## 🔒 안전 · 프로세스 원칙

### Git · 커밋 · 푸시
- **원격 push 절대 금지** · 사용자가 명시적으로 "push" 말할 때만
- 매 완료 · 로컬 커밋 즉시 (축적 X)
- Destructive 작업 (rm · reset --hard · force push 등) · 사용자 사전 승인
- 참고 · `.claude/memory/feedback_remote_push_strict.md` · `feedback_pre_commit_safe.md`

### 로깅
- 모든 API · 비동기 · try/catch + prefix 로그 + 원인별 status
- 서버 · console.error("[route] context:", err.message)
- 프론트 · showError(`[prefix] ${msg}`)
- 참고 · `.claude/memory/feedback_logging_principle.md`

### 세션 만료
- 401 감지 시 · 즉시 onLogout() · 배너 X
- JWT 1h · Refresh 30d
- 참고 · `.claude/memory/feedback_session_expiry.md`

### 파생 컬럼 금지
- DB · 파생 컬럼 만들지 말 것 · 있는 테이블에서 조회 우선
- 예외 · 사용자 명시 허락
- 참고 · `.claude/memory/feedback_no_derived_columns.md`

---

## 📐 코드 스타일

### 파일 크기
- 800라인 초과 · **large-file-warn** · 서브 컴포넌트 분리 검토
- Framework Phase 4 · large-file 24→2 완료 (2026-08-23)
- 신규 파일 · 500라인 이내 목표
- 참고 · `docs/FRAMEWORK_AUDIT.md`

### 분리 4-tier 원칙
- types.ts · 타입 정의
- constants.ts · 상수
- utils.ts · pure helpers
- subcomponents.tsx · 서브 컴포넌트
- 페이지 파일 · orchestration 만

### 폰트 사이즈 · +2 기본
- Claude 는 폰트 작게 하는 경향 · 항상 +2 · 40대+ 가독성
- 참고 · `.claude/memory/feedback_font_plus2_default.md`

---

## 🧪 테스트 원칙

### 모든 태스크 · 매 편집 · 테스트+버그
- 매 편집 · TS+build 필수
- 사용처 grep · 회귀 즉시 수정
- 참고 · `.claude/memory/feedback_test_bugfix_principle.md`

### 테스트 파일 위치
- 유닛 · `*.test.ts(x)` (컴포넌트 옆)
- vitest include · `vitest.config.ts` (신규 폴더 시 추가)
- jsdom · `// @vitest-environment jsdom` 지시자 opt-in
- afterEach cleanup · 다중 render 격리

### mock 패턴 (2026-08-23 세션 정립)
- **apiClient**:
  ```ts
  const mockGet = vi.fn(); const mockPost = vi.fn(); const mockPatch = vi.fn();
  vi.mock("../../lib/apiClient", () => ({
    api: { get: (...a: any[]) => mockGet(...a), post: (...a: any[]) => mockPost(...a), patch: (...a: any[]) => mockPatch(...a) },
    ApiError: class MockApiError extends Error {
      status: number; data: unknown;
      constructor(msg: string, status = 500, data: unknown = null) { super(msg); this.status = status; this.data = data; this.name = "ApiError"; }
    },
  }));
  beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); mockPatch.mockReset(); });
  ```
- **useConfirm** · `vi.mock("../../hooks/useConfirm", () => ({ useConfirm: () => async () => true }))`
- **useResizablePanel** · `vi.mock` 후 mockIsDesktop 변수로 desktop/mobile 케이스 제어
- **useToast** · 필요 시 · `vi.mock("../../hooks/useToast", () => ({ useToast: () => ({ toast: null, showSuccess: vi.fn(), showError: vi.fn() }), toastClass: () => "" }))`
- **vendorNameNormalize** 등 lib · 간단 mock · `vi.mock("../../utils/vendorNameNormalize", () => ({ displayVendorName: (s: string) => s }))`

### 다중 render / cleanup
- 다중 `render()` 파일 · **`afterEach(() => cleanup())` 필수** (jsdom 격리 · #modal-title 등 id 충돌 방지)
- 예: `import { render, cleanup } from "@testing-library/react"; afterEach(() => cleanup());`

### 확장된 콜백 시그니처
- 신규 콜백 · 기존 호출자 회귀 방지 → **optional 인자로 확장** (예: `onCreated: (code: string, product?: {...}) => void`)
- 테스트 · `expect(fn).toHaveBeenCalledWith("code", expect.objectContaining({...}))`

### 회귀 방지 원칙 (프리미티브 수정 시)
- 프리미티브 (Modal · Card · StatusPill 등) 확장 시 · **기존 사용처 grep + 신규 props 테스트 필수**
- v2/v3 확장 · 기존 v1 동작 완전 유지 · TS `size` union 타입 확장으로 처리

---

## 🗺 아키텍처 요약

### 스택
- Frontend · React 19 + Vite + TypeScript strict + Tailwind CSS v3
- Backend · Express + Zod + Supabase (Postgres)
- Deploy · Render (buildCommand: vite build + esbuild server.ts)

### 페이지 구조 (요약)
- Landing (약국·직원·매장 · 12개 메뉴)
- StaffManagePage (직원관리 · 마스터-디테일)
- OrderManagePage (발주 · 매입 · 결제 · 통계 · **매입 서브탭 7개**)
  - 매입이력 · 반품필요 · 거래명세서 · 실재고입력 · 상품입고 · **상품정보** (#177 신규 2026-08-23) · 실재고
- DisplayPage (매장 진열 · 구역 배정 · vendor 관리)
- ScanPage (실재고 입력 · 바코드 스캔 · **미등록 즉시 등록** #179)
- PermissionsPage (권한 · 메뉴 설정)
- ContractWriterPage (근로계약서 · PDF · 서명)
- HrFormsPage (인사 서류)
- 등등 (상세 · `docs/MENU_STRUCTURE.md`)

### 상세 참조
- 전체 메뉴·페이지·API·DB 스키마 · `docs/MENU_STRUCTURE.md`
- 감사 리포트 · `docs/FRAMEWORK_AUDIT.md`
- 감사 baseline · `docs/.framework-baseline.json`
- 목업 · `docs/UI_MOCKUP_2026-08-21.html`

---

## 📞 세션 재개 체크리스트

1. **이 파일 (`docs/CODING_PRINCIPLES.md`) 숙지** · 원칙·프레임워크·안전
2. **`docs/TASKS_HANDBOOK.md`** · 현재 진행·완료·대기 태스크·세션 상태
3. `docs/TASKS.md` · 상세 태스크 스펙
4. `docs/MENU_STRUCTURE.md` · 페이지·API·DB 세부
5. Git · `git log --oneline | head -30` · 최근 커밋
6. Test · `npx vitest run` · 회귀 확인
7. Audit · `node scripts/audit-framework.cjs` · 프레임워크 준수

---

## ⚠ 자주 실수하는 지점 (Anti-patterns)

- ❌ 인라인 `<div className="fixed inset-0 z-50 ...">` modal → ✅ `Modal` 프리미티브
- ❌ 인라인 fetch/axios → ✅ `api.get/post/patch<T>` (apiClient)
- ❌ 인라인 try/catch + setError · setLoading → ✅ `useApiCall`
- ❌ 인라인 debounce KV 저장 → ✅ `useKvSetting`
- ❌ 인라인 window.confirm → ✅ `useConfirm`
- ❌ 인라인 카테고리 배지 span → ✅ `Badge` or `StatusPill`
- ❌ 신규 파일에 useState/useEffect 대량 · 재사용 안 되는 로직 → ✅ 훅 추출
- ❌ 3곳 반복 UI → ✅ 프리미티브 추출
- ❌ `git add -A` · `git add .` → ✅ 특정 파일 명시 (관련 없는 파일 커밋 방지)
- ❌ 리모트 push · 명시 승인 없이 → ✅ 로컬만
- ❌ 폰트 xs/13px · 40대+ 가독성 X → ✅ 기본 +2 (sm 이상)
- ❌ 파스텔 · 이모지 배지 · 촌스러움 → ✅ Linear/Vercel/Notion 2026 톤
