# 아키텍처 문서

**작성 · 2026-09-01 · P3 종합 개선**

megatown-staff-scheduler 프로젝트의 시스템 구조 · 데이터 흐름 · 프레임워크 개요를 정리한다.

---

## 시스템 개요

**megatown-staff-scheduler** 는 오산 메가타운 코스트팜 약국 체인의 통합 운영 관리 웹앱이다.

**주요 도메인**
- 직원 · 스케줄 · 근태 · 인사 계약
- 재고 · 진열 · 매입 · 발주 · 반품
- OCR 거래명세서 인식 (Gemini)
- 공급사 정산 · VAT · 결제
- 승인 · 알림 · 게시판

**사용 기술**
- **프론트엔드** · React 18 · Vite 6 · TypeScript · Tailwind CSS 4 · shadcn/ui
- **백엔드** · Node.js 20 · Express · TypeScript (tsx)
- **DB** · Supabase (PostgreSQL) · JS SDK
- **인증** · JWT (bcryptjs · jsonwebtoken)
- **OCR** · Google Gemini API + ONNX Runtime (barcode)
- **알림** · Web Push (web-push) · Kakao Talk API
- **테스트** · Vitest · Testing Library · JSDOM
- **배포** · Render (render.yaml)

---

## 폴더 구조

```
megatown-staff-scheduler/
├── src/                      # React 프론트엔드 (Vite build)
├── server/                   # Express 백엔드 (tsx dev · esbuild build)
├── server.ts                 # Express 진입점 · route 등록 · CORS · 정적 파일
├── shared/                   # 서버·클라이언트 공유 (zod schemas · TS types)
├── scripts/                  # audit-framework · import-vendors · migration
├── docs/                     # 개발 문서
├── migrations/               # Supabase SQL (수동 실행)
├── supabase/                 # 클라이언트 SDK 설정
├── sql/                      # 백업·복원용 SQL
├── public/                   # 정적 파일 (favicon · manifest · pwa)
├── uploads/                  # 업로드 임시 저장 (배포 시 초기화)
├── data/                     # SQLite 등 로컬 데이터 (레거시)
├── dist/                     # 빌드 산출물 · Vite frontend · esbuild server
├── package.json
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.json
└── render.yaml               # Render 배포 설정
```

### 프론트엔드 (`src/`)

```
src/
├── App.tsx                   # 최상위 · Page enum · SidebarProvider · 인증 게이트
├── main.tsx                  # ReactDOM.render + ToastProvider + ErrorBoundary
├── index.css                 # Tailwind base · 전역 CSS · 스크롤 잠금 규칙
├── types.ts                  # 공용 TS 타입 (Employee · Schedule 등)
│
├── components/
│   ├── common/               # 43+ 프리미티브 (프레임워크의 심장)
│   │   ├── Modal.tsx
│   │   ├── BottomSheet.tsx
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Panel.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── SearchBar.tsx
│   │   ├── EmptyState.tsx
│   │   ├── FieldLabel.tsx
│   │   ├── IconButton.tsx
│   │   ├── IconTile.tsx
│   │   ├── StatusPill.tsx
│   │   ├── StepperInput.tsx
│   │   ├── TableList.tsx
│   │   ├── SplitListPanel.tsx
│   │   ├── SegmentedControl.tsx
│   │   ├── GradientAccent.tsx
│   │   ├── SectionCard.tsx
│   │   ├── PageContainer.tsx
│   │   └── features/         # 도메인 특화 컴포지트 (VendorSearchModal 등)
│   ├── layout/               # AppNavHeader · SideNav · sideNavGroups
│   ├── ui/                   # shadcn/ui 원본 (수정 자제 · sidebar / tooltip 등)
│   └── <PageName>/           # 페이지별 폴더
│       ├── <PageName>.tsx
│       ├── <PageName>.test.tsx
│       ├── <SubTab>.tsx
│       └── hooks/
│
├── hooks/                    # 공용 훅
│   ├── useApiQuery.ts        # 데이터 fetch + 캐시
│   ├── useApiCall.ts         # POST/PUT/DELETE
│   ├── useToast.ts           # Toast 알림
│   ├── useConfirm.ts         # ConfirmDialog Promise 래퍼
│   ├── useAuth.ts            # JWT 세션 관리
│   ├── usePagePermissions.ts # 페이지별 권한
│   └── use-mobile.ts         # 모바일 감지
│
├── lib/                      # 도메인 로직 · 순수 함수
│   ├── apiClient.ts          # axios · 401 자동 로그아웃
│   ├── storageKeys.ts        # localStorage 키 상수
│   ├── permissions.ts        # 권한 파생 로직
│   ├── contract/             # 근로계약서 계산
│   ├── employeeApi.ts        # 직원 CRUD
│   ├── productsCache.ts      # 상품 prefetch
│   └── errorMessage.ts       # 에러 메시지 매핑
│
├── shared/                   # 서버 공유 (schemas · types)
│   └── schemas/              # Zod 스키마 (POST body 검증)
│
├── styles/
│   └── tokens.ts             # TEXT · PAGE_CONTAINER_CLS 등
│
├── supabase/
│   └── client.ts             # Supabase JS SDK 클라이언트
│
├── constants/                # zoneLabels 등 상수
├── images/                   # 이미지 리소스
├── utils/                    # 순수 유틸
└── keys/                     # 암호화 키 (gitignore)
```

### 백엔드 (`server/`)

```
server/
├── routes/                   # 40+ 라우트 파일 · 도메인 서브폴더
│   ├── auth/                 # 로그인 · JWT · SSO · vendor-login
│   ├── board/                # 게시판 · 댓글 · 이미지 · 반응
│   ├── daily/                # 연차 (leave) · 점심 불참 (lunch)
│   ├── display/              # 진열 요청 · 존 배정 · 존 라벨
│   ├── notification/         # 알림 · Push · Web Push
│   ├── ocr/                  # OCR · Gemini · 확정 · 매칭 · aliases · templates
│   ├── payment/              # 차용 (borrowings)
│   ├── purchase/             # 매입 · 공급사 · 결제 · VAT · 반품 · 잔고 config
│   ├── reference/            # 참조 데이터
│   ├── schedule/             # 스케줄 · 예약
│   ├── settings/             # 앱 설정 · 시스템 config
│   ├── staff/                # 직원 · 계약 · 인사 문서 · 조항
│   └── stock/                # 재고 · 입고 · 상품 · 손실
│       └── stockManage/      # 통계 · 추이 · 커버리지 · 배치
│
├── middleware/               # Express 미들웨어
│   ├── asyncHandler.ts       # try/catch 자동
│   ├── errorHandler.ts       # HttpError · badRequest · notFound
│   ├── requireAuth.ts        # JWT 검증 · authorize(level)
│   └── zodValidate.ts        # validateBody(Schema)
│
├── services/                 # 도메인 서비스 (외부 API · 알림)
│   ├── notificationsService.ts
│   ├── scheduleService.ts
│   ├── kakaoService.ts
│   └── smsService.ts
│
├── lib/                      # 서버 순수 로직
│   ├── ownershipCheck.ts     # checkOwnershipOrAdmin
│   ├── auditLogger.ts        # audit · auditContext
│   └── pagination.ts         # parsePagination · paginatedResponse
│
└── utils/                    # DB 헬퍼
    ├── supabaseFetchAll.ts   # 1000행 cap 우회 · range 페이지네이션
    └── purchaseDetailsQuery.ts # 매입 상세 fallback 조회
```

---

## 데이터 흐름

### 예시 · 진열 요청 조회 (GET /api/display-requests)

```
[Browser]
    │
    ▼
[React] DisplayPage/RealStockTablePage.tsx
    │  useApiQuery("/api/display-requests")
    ▼
[hooks/useApiQuery.ts]  # SWR 스타일 · 캐시 + revalidate
    │
    ▼
[lib/apiClient.ts]  # axios · Authorization: Bearer <JWT>
    │  · 401 감지 시 · onLogout() 즉시 · JWT 1h
    ▼
[Express server.ts]  # /api/* → routes/display/requests.ts
    │
    ▼
[middleware/requireAuth]  # JWT 검증 · req.session 세팅
    │
    ▼
[middleware/asyncHandler]  # try/catch 자동 · errorHandler 전달
    │
    ▼
[server/routes/display/requests.ts]  # router.get(...)
    │  · supabase.from("display_requests").select(...)
    │  · .in("product_code", codes) · 배치 조회
    │  · 상품명 매핑 후 rows 반환
    ▼
[Supabase] PostgreSQL  # RLS · 인덱스 · JSON
    │
    ▼
[HTTP 200 · JSON] rows
    │
    ▼
[React] · setState · 렌더
```

### 예시 · 결제 등록 (POST /api/supplier-payments)

```
UI Form → useApiCall("POST", "/api/supplier-payments", body)
    ↓
requireAuth (level ≥ 5) → validateBody(CreateSupplierPaymentSchema)
    ↓
비즈니스 로직 · allocations 총액 검증
    ↓
supabase.from("supplier_payments").insert(...) · atomic
    ↓
notificationsService.notifyAllAdmins() · 관리자 broadcast
    ↓
201 → { id, ... }
```

---

## 프레임워크

### 서버 프레임워크

**핵심 패턴** (모든 route 필수)
```ts
router.get("/api/example", authorize(1), asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from("table").select("*");
  if (error) throw new HttpError(500, error.message);
  res.json(data ?? []);
}));

router.post("/api/example", authorize(5), validateBody(Schema), asyncHandler(async (req, res) => {
  const b = req.body;  // Zod 검증됨
  // ...
}));
```

**금지 안티패턴**
- 인라인 try/catch (asyncHandler 사용)
- 인라인 검증 (validateBody 사용)
- 인라인 401 반환 (authorize 사용)
- `select("*")` (필요 컬럼만 명시 · 페이로드 최소화)
- for-loop 안 supabase 쿼리 (N+1 · .in() · Promise.all 사용)

### 클라이언트 프레임워크

**핵심 훅**
```tsx
const { data, isLoading, error, mutate } = useApiQuery<Row[]>("/api/rows");

const { call, loading } = useApiCall();
await call("POST", "/api/rows", body);

const toast = useToast();
toast({ tone: "success", title: "저장됨" });

const confirm = useConfirm();
if (await confirm({ message: "삭제할까요?", danger: true })) { /* ... */ }
```

**핵심 프리미티브**
- 페이지 컨테이너 · `<PageContainer>` (px + max-w + flex-1)
- 카드 · `<Card variant="sm" padding="md">`
- 모달 · `<Modal open={o} onClose={...} title="..." size="md">`
- 하단 시트 · `<BottomSheet open={o} onClose={...} title="...">`
- 확인 다이얼로그 · `<ConfirmDialog danger .../>` 또는 `useConfirm()`
- 버튼 · `<Button variant="primary|secondary|ghost|danger" size="sm|md|lg" />`
- 상태 배지 · `<StatusPill tone="brand|emerald|amber|rose" />`
- 검색바 · `<SearchBar value={q} onChange={setQ} historyKey="..." />`
- 빈 상태 · `<EmptyState icon={...} title="..." hint="..." />`

**금지 안티패턴**
- `window.alert()` · `window.confirm()` (useConfirm 사용)
- 인라인 modal (Modal 프리미티브 사용)
- localStorage 로 도메인 데이터 저장 (DB 사용)
- ISO string 직접 파싱 (`new Date(...)` 유틸 사용)
- `fetch()` 직접 사용 (apiClient 사용)

---

## 인증 · 권한

### 세션
- **JWT** · 1시간 만료 · `SK_AUTH_SESSION` localStorage
- **자동 로그아웃** · 401 감지 시 즉시 `onLogout()` 호출
- **세션 경고** · 만료 5분 전 배너 표시 · 연장 버튼
- **SSO** · `?sso={token}` 감지 시 자동 로그인 · 다른 브라우저 이동

### 권한 (level 기반)
- **0** · 로그아웃 상태
- **1** · 일반 직원 · 본인 조회 · 자기 데이터 편집
- **5** · 매니저 · 승인 · 발주 · 결제 등록
- **9** · 관리자 · 전역 설정 · 사용자 관리
- **10** · 슈퍼 관리자 · 시스템 config · 페이지 가시성

### 페이지 접근 제어
- `usePagePermissions()` · 페이지별 허용 level
- `isAdminEssentialPage(page)` · 관리자 필수 페이지 (하드코딩)
- `usePageVisibility()` · PC/Mobile 별 표시 여부

---

## 배포

### Render (프로덕션)
- **빌드** · `npm run build:render` (max-old-space 400MB · Vite + esbuild)
- **런타임** · `node dist/server.cjs`
- **정적 파일** · `dist/` · Express static 미들웨어
- **환경변수** · Render 대시보드에서 관리
- 상세는 `render.yaml`

### 로컬 개발
- **dev** · `npm run dev` (tsx watch mode)
- **build 로컬** · `npm run build` (Vite + esbuild)
- **start** · `npm run start` (production 시뮬)

---

## 성능 고려사항

### Frontend
- **Code splitting** · `React.lazy` · 대형 페이지 lazy load
- **Data prefetch** · `prefetchProducts()` · 로그인 후 백그라운드
- **Cache** · `useApiQuery` · SWR 스타일 · stale-while-revalidate
- **PWA** · Service Worker · offline 지원

### Backend
- **Supabase 1000행 cap** · `fetchAllWithRange` 헬퍼 · range 페이지네이션
- **N+1 방지** · `.in()` 배치 · Promise.all 병렬화 (P3 · 2026-09-01)
- **캐시** · in-memory 5분 TTL (season_ranges 등 자주 조회)
- **인덱스** · 미적용 · 수동 SQL (docs/DB_SETUP.md 참고)

### 알려진 병목
- **topSales** · season 필터 시 전체 스캔 · 인덱스 필요
- **vendor withBalances** · 전체 매입/결제 조인 · 캐시 후보
- 자세한 리포트는 `docs/AUDIT_AND_IMPROVEMENTS_2026-08-27.md`

---

## 관련 문서

| 문서 | 내용 |
|------|------|
| `docs/ONBOARDING.md` | 신규 개발자 3단계 가이드 |
| `docs/FRAMEWORK.md` | 프레임워크 API 레퍼런스 (완전판) |
| `docs/API.md` | 268 endpoint 자동 스캔 |
| `docs/CODING_PRINCIPLES.md` | 10대 코딩 원칙 |
| `docs/TASKS_HANDBOOK.md` | 태스크 처리 절차 |
| `docs/PRINCIPLES.md` | UI/UX 프리미엄 원칙 |
| `docs/FRAMEWORK_AUDIT.md` | 프레임워크 위배 audit 결과 |
| `docs/DB_SETUP.md` | Supabase 초기 세팅 · 인덱스 |
| `docs/MENU_STRUCTURE.md` | 메뉴·페이지 계층 |
| `docs/PAYROLL_ALGORITHM.md` | 급여 계산 알고리즘 |
| `docs/KAKAO_SETUP.md` | 카카오 API 연동 |
