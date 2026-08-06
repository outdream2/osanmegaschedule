# TASKS

**상태 요약** (2026-08-06 갱신 · 세션 15+ 커밋 반영):
- 진행중 (백그라운드): 1건 (T-SLIM C useFetch 마이그레이션 · a8e3be2a)
- 사용자 액션 대기 (Supabase): perf_indexes · vat_integration · loss_tracking_daily · T-CTR-3
- 검증 대기: 20+ 커밋 (2026-08-06 세션)
- 남은 큰 태스크: God Component 5개 · T-SLIM B/F · requireAuth (T3-defer)
- 보류: 1건 (T-PERF-5)
- 이번 세션 완료 · 삭제: T-CSS Phase 2 Priority A/B · T-Audit-DeadCode · T-DB-Audit · 미사용 파일 정리 · as any 서버/프론트 부분 · T-SLIM E

**규칙**:
- 완료 태스크는 이 파일에서 **삭제** (아카이브 X)
- 새 태스크 즉시 추가
- **🚨 세션 시작 시 반드시 read** · 이 파일 + `docs/MENU_STRUCTURE.md` 두 개 다 (신규 대화·세션 만료 후 재개 포함)
- 매 milestone 후 update
- **회귀 절대 금지** · TS + build + test 통과 후 커밋
- **리모트 푸시 · 사용자 명시 승인 시에만** (기본 로컬 커밋)
- **DB · 파생컬럼 사용 금지** · 원래 테이블 활용이 최우선 · 사용자 명시 (2026-08-05 재강조)
  · 파생컬럼 필요 시 · 반드시 사용자 승인 후
  · 조회는 JOIN · 계산은 서버·클라이언트 로직 우선
- **문서 관리는 project-registrar 에이전트 전담** (2026-08-06)
  · 태스크·기능·구조 변경 시 · project-registrar 호출 · MENU_STRUCTURE.md + TASKS.md 반영
  · 다른 에이전트는 이 두 파일 편집 금지 (read 만 OK)
  · 정의: `.claude/agents/project-registrar.md`
- **테스트·수정 요청 워크플로우** (2026-08-06)
  1. 사용자가 테스트·수정 요청 → **즉시 TASKS.md 에 저장** (project-registrar)
  2. 해당 도메인 에이전트 · 코드 수정 (test/fix)
  3. **소스코드 변경 사항 · MENU_STRUCTURE.md 에 업데이트** (project-registrar · 날짜 기록 · CHANGELOG)
  4. TASKS.md 완료 태스크 · 삭제 (project-registrar)

---

## 🎯 UI 원칙 · 추가 (2026-08-06)

- **모든 리스트 컬럼 · 넓이 조정 가능** (사용자 명시)
  · 각 컬럼 헤더 · 우측 경계 · 드래그로 폭 조정
  · 카테고리 헤더 (그룹 헤더) · 카테고리 단위로도 조정
  · 상태 · localStorage 저장 · 다음 방문 시 유지
  · 공통 훅 or 컴포넌트 (예: useColumnResize) 로 통일

---

## 🔴 사용자 액션 대기 · Supabase SQL (2026-08-06)

### T-Migration-Indexes · Supabase SQL 실행 대기 (신규 · 2026-08-06)
- 파일: `migrations/perf_indexes_2026-08-06.sql`
- 액션: 사용자 · Supabase SQL Editor 실행
- 내용: 성능 인덱스 4개 (매입이력·상품 검색 등)

### T-VAT-Migration · Supabase SQL 실행 대기
- 파일: `migrations/vat_integration.sql`
- 액션: 사용자 · Supabase 대시보드에서 실행
- 관련 커밋: `058e92d` VendorInfo 이름 정제 + VAT 자동 추론 · `cc4ccae` VAT 기본 포함

### T-LOSS-Migration · Supabase SQL 실행 대기
- 파일: `migrations/loss_tracking_daily.sql`
- 액션: 사용자 · Supabase 대시보드에서 실행
- 관련 커밋: `fe08712` 손실추적 · `b18419b` 손실추적 컬럼 확정 · `859c37f` T-LOSS-HISTORY

---

## 🆕 신규 발견 · 추가 (2026-08-06)

### T-DB-Audit-B · 중기 마이그레이션 (미실행)
- 파일: `migrations/db_improvements_top3.sql`
- 내용: `invoice_date TEXT → DATE` 타입 변환
- 액션: 사용자 승인 · 백업 후 실행

### T-DB-Audit-C · 장기 (Render 배포 전 검토)
- 내용: `vendors` FK 정규화
- 데이터 영향 큼 · 별도 롤백 플랜 필요

### T-Inventory-Legacy-Drop · `inventory_checks` 레거시 컬럼 DROP
- dead-code-auditor 발견 (`a3a8ebf6`)
- 정합성 확인 후 · 사용자 승인 필요

### T-VAPID-Route · `/api/vapid-public-key` 서버 route 누락
- 프론트 `StockArrivalPage` 호출 · silent fail
- 서버 route 추가 or 프론트 호출 제거 · 결정 필요

---

## 🔄 진행 중 (자동 파이프라인)

### T-SLIM C · useFetch 마이그레이션 (백그라운드 · a8e3be2a)
- useFetch 훅 신규 완료 (`c9ff8e3` 부산물)
- 페이지별 fetch 패턴 → useFetch 로 마이그레이션 중
- 완료 알림 대기

### T-CSS Phase 2 Priority C · God Component 마이그레이션 (별도 태스크)
- OrderManage · ContractWriter · RawOcrTable · DisplayPage · StaffManage
- 각 파일 God Component 분해 병행 필요 (아래 God Component 항목 참고)

### ✅ 완료 · 자동 파이프라인 앞 단계
- `8fdf697` T-CSS Phase 2 Priority A · SupplierTab · SalesTrendPage · BusinessManagePage
- `792835a` `80ab6ed` `481d6d5` T-CSS Phase 2 Priority B · RequestsPage · BoardPage · StaffManagePage
- `a3a8ebf6` T-Audit-DeadCode 감사 완료
- `a90269e3` T-DB-Audit 감사 완료
- `f09b191` `03ec97b` `18e1118` `c9ff8e3` 미사용 파일 정리 (11 컴포넌트/이미지 + 2 라우터 + 49 스크립트)
- `03ec97b` `9673da1` 서버 as any 265+ → 18 필수
- `7a08a33` 프론트 as any 부분 14건 제거
- `3d3de7f` T-SLIM E · 응답 shape 표준화
- `38606e8` T25 · useVendors 훅 (8 파일 -101 lines)
- `401cd2b` `4d6b703` T30-followup · useSortableTable 확대 (6 파일)
- `34a9a3f` `81ce398` `3b78425` T26 · select('*') 명시화 (31/56 · 25건 skip)
- T-CSS Phase 1 · 디자인 토큰 + 공통 컴포넌트 완료

---

## 🔍 project-architect 분석 결과 (2026-08-05)

**규모**: 107K줄 · 프론트 118 tsx / 74 ts · 서버 92 파일

**아키텍처 강점**:
- 서버-클라이언트 fetch 분리 (2개 예외: scheduleService · notificationsService)
- OCR 파이프라인 stage 분리 잘 됨
- common 컴포넌트 24개
- 도메인 훅 분리 시작 (useVendors · useSettings · useSortableTable)

**주요 문제점 · 우선순위** (10건):

| # | 카테고리 | 문제 | 시간 | 상태 |
|---|---------|------|------|-----|
| 1 | 🚨보안 | requireAuth 미들웨어 전체 비활성 (Render 시 critical) | 2h | T3-defer |
| 2 | 코드품질 | fmtWon/fmtDate 16+ 파일 중복 정의 | 3~4h | ✅ T-SLIM A 완료 (`8a5675b`) |
| 3 | 아키텍처 | God Component 5개 (RawOcrTable 5268 · ContractWriter 5256 · OrderManage 3224 · DisplayPage 2890 · StaffManage 2773) | 1~3일/파일 | 별도 · 대기 |
| 4 | 성능 | select('*') 56곳 | 4~6h | ✅ T26 부분완료 (31/56 · 25 skip) |
| 5 | 코드품질 | `as any` 서버 265+ → 18 필수 (`03ec97b`·`9673da1`) · 프론트 476건 남음 (God·OCR 제외) | 10h+ | ✅ 서버 완료 · 프론트 진행중 |
| 6 | 아키텍처 | scheduleService · frontend 번들 혼입 | 2~3h | ✅ 완료 (`3cd7aff`) |
| 7 | 보안 | password_hash · 로그인 응답 노출 위험 | 30분 | ✅ 완료 (`71a58e4`) |
| 8 | UX | window.confirm 146건 | 4~6h | ✅ T-SLIM D 완료 (`6e6690e`) |
| 9 | 유지보수 | 타입 정의 산재 | 5~8h | T-SLIM E · 대기 |
| 10 | 유지보수 | src/ 루트 · 엑셀 4개 혼입 | 10분 | ✅ 완료 (`a709c8b`) |

**즉시 실행 가능 · 잔여 1건**:
1. requireAuth 최소 적용 · 1~2h · **Render 배포 직전 재도입** (T3-defer)

**Render 배포 CRITICAL**:
- 인증 미들웨어 재도입
- JWT_SECRET 확인
- scheduleService 번들 분리
- CORS · Helmet · Rate Limit 신규

---

### T-SLIM · 공통 기능 분리·리팩토링·코드 슬림화 (2026-08-05 · 사용자)
**절대 원칙**: **기능에 절대 문제 안 생기게** · 렌더·데이터·동작 동일 유지

**후보 (project-architect 분석 후 확정)**:

**A. 유틸리티 통합** — ✅ Phase 2 완료 (`8a5675b`) · fmtWon 통합 (잔여 fmtDate/fmtNumber 미완)
- date-fns / dayjs 도입 검토 (자체 구현 대체) · 대기
- 전화번호 · 사업자번호 포맷터 · 정규식 통합 · 대기

**B. 폼·검증 통합**
- react-hook-form + zod 도입 검토
- 유효성 검증 로직 (전화번호 · 이메일 · 숫자) 통합
- 폼 필드 컴포넌트 (`TextField` · `NumberField` · `Select`) 신규

**C. 데이터 fetch 패턴 통합** — 🔄 진행중 (a8e3be2a)
- useVendors · useProducts · useEmployees 같은 도메인별 훅 (T25 useVendors 이미 완료)
- ✅ 공통 fetch 훅 `useFetch<T>(url)` 신규 (`c9ff8e3` 부산물)
- 페이지별 마이그레이션 진행 중
- 에러·로딩 상태 표준화

**D. 알림·확인·토스트 통합** — ✅ 완료 (`6e6690e`) · window.confirm 통합 · 잔여 0
- toast 상태 · 페이지마다 개별 useState → useToast 훅 or context · 대기

**E. 서버 응답 shape 정규화** — ✅ 완료 (`3d3de7f`)
- 라우터별 응답 형식 통일
- 페이지네이션 응답 통일 (T-PERF-1a/b 에서 `has_more` 등)

**F. 상수 파일 정리**
- `src/constants/` 하위 정리 · 도메인별 그룹핑
- 매직 넘버 상수화

**진행 방식**:
1. project-architect 분석 완료 → 구체 대상 리스트 파악
2. 우선순위 결정 (효과 큰 것부터)
3. 항목별 · 별도 브랜치 or 커밋 단위
4. **각 항목 · TS+테스트+build 통과 필수** · 실패 시 즉시 revert
5. UI 검증 · 각 항목마다 사용자 확인 or 자동 E2E

**예상**: 15~25h (다수 세션 · 항목별 진행)
**위험**: 중~높음 (무회귀 원칙 · 극도 신중)

### T-CSS · 공통 CSS 리팩토링 + 전체 UI 통일 (신규 · 2026-08-05 · 확장 v2)

**최상위 목표** (사용자 명시):
- **전체 통일성 있는 깔끔하고 세련된 UI**
- **글씨 크기 통일** (page 마다 [10px]/[11px]/[12px] 제각각 → 스케일 5단계로 통일)

**타이포 스케일 (신규 규칙)**:
- `text-hero` — 페이지 타이틀 (17~18px · 헤더 아이콘 옆)
- `text-body` — 본문 · 기본 (13~14px · 리스트 셀·라벨)
- `text-caption` — 서브·힌트 (11~12px · 배지·라벨·메타)
- `text-micro` — 최소 · 코드·시각 (9.5~10px · 시각·타임스탬프)
- `text-num` — 숫자 강조 (font-black tabular-nums · KPI·금액)

**색상 팔레트 정리**:
- `primary` (indigo) · `success` (emerald) · `warning` (amber) · `danger` (rose) · `info` (sky) · `neutral` (slate)
- 각 색상 · 50/100/200/500/600/700 만 사용 (다양성 제한 · 통일)


**목적**: 각 탭 페이지의 공통 부분 · 반응형 로직을 공통 CSS/컴포넌트로 통합

**대상 1 · 탭 페이지 공통 부분**:
- **페이지 헤더** (AppNavHeader 아래 · 페이지 타이틀·아이콘·설명) · 대부분 페이지 반복
- **서브탭 바** (TabBar 이미 있음 · 미채택 페이지 마이그레이션)
- **툴바** (검색·필터·새로고침·정렬 아이콘) · 페이지마다 개별 구현
- **리스트 컨테이너** (`rounded-2xl border border-slate-200 shadow-sm` 반복)
- **빈 상태** (`데이터 없음` · `로딩 중...` · 페이지마다 다른 스타일)
- **상태 배지** (pending/prepared/done · amber/sky/emerald 반복)
- **액션 버튼** (준비완료·완료·삭제·저장 · 색상 톤별 반복)
- **입력 필드** (border/focus-ring 조합 반복)
- **KPI 카드** (숫자·라벨 조합 반복)

**대상 2 · 반응형 공통 정리**:
- **breakpoint 통일**: sm/md/lg 사용 규칙 (예: 리스트 sm=1열 · md=2열 · lg=3열)
- **모달 → 바텀시트** (모바일에서 `rounded-t-2xl` · 데스크탑 `rounded-2xl` 반복)
- **SplitPanel 좌우 → 세로 스택 or 모달** (이미 있음 · 미채택 페이지 마이그레이션)
- **가로 스크롤 vs 컬럼 접기** 규칙
- **폰트 크기 스케일** (text-[10px]/[11px]/[12px] · 페이지마다 다름)
- **터치 타겟** (min-h-9 · min-w-9 통일 · 모바일 44px 규칙)

**방법론**:
1. **디자인 토큰 파일** 신규 (`src/styles/tokens.ts`)
   - `CARD_BASE`, `TOOLBAR_BASE`, `INPUT_BASE`, `BUTTON_PRIMARY`, `BADGE_PENDING/PREPARED/DONE` 등
2. **공통 컴포넌트 확장**:
   - `PageHeader` 신규 (제목·아이콘·설명·서브탭 슬롯)
   - `Toolbar` 신규 (검색·필터·액션 슬롯)
   - `StatusBadge` 신규 (status prop · 색상 자동)
   - `EmptyState` · `LoadingState` 신규
3. **반응형 유틸**:
   - `useBreakpoint()` 훅 (필요 시)
   - CSS 유틸 클래스 (Tailwind config 확장 or `@apply`)
4. **파일별 마이그레이션**:
   - 재고관리 → 매입관리 → 진열요청 → 근로계약서 → 스케줄 → 경영관리 순
   - 파일 단위 · 회귀 시 즉시 revert

**효과**:
- 코드 -1000~1500줄
- 디자인 통일성 · 다크모드 대비
- 새 페이지 추가 시 · 3~5 컴포넌트 조립으로 완성
- 반응형 일관성

**위험**: 낮음~중 (className 변경 · 렌더 동일 유지)

**예상**: 10~15h (여러 파일 · 파일별 순차 · 다수 세션 가능)

**방식**: mobile-ui-designer 위임 · 파일별 · 회귀 즉시 revert 가능

### T-PERF-5 · 가상 스크롤 (react-window) · 보류
- 5000+ 행 리스트에서 필요 · 현재 페이지네이션으로 렌더 수십 행
- 나중 필요 시 재검토
- 예상 2~3h · 위험 낮음

---

## 🔴 사용자 실 UI 검증 대기 (2026-08-05 커밋)

| 커밋 | 태스크 | 검증 |
|------|-------|-----|
| `2d799bc` | T-C · 근로계약서 CMS 서버 이전 완결 | 설정 페이지 → 조항 편집 저장 → 다른 브라우저 확인 |
| `3f4e57e` | T-C · CMS 서버 이전 초기 | 상동 |
| `f444d21` | T-PERF-1b · 매입이력 페이지네이션 | 매입이력 첫 로드 속도 |
| `480b9e4` | T-PERF-1a · 재고관리 캐시 | 재고관리 재방문 즉시 반영 |
| `bf35419` | YOLO 완전 제거 (-946 lines) | 재고세기 버튼 사라짐 확인 |
| `f5217d9` | T37 · JSON body 10MB | DoS 방어 · 정상 요청 영향 없음 |
| `ecf84b4` | T-SCAN-1 · RequestsPage 진열요청 3단계 표 | 요청 메뉴 진열요청 탭 |
| `9cd8d27` | 스캔 모달 컴팩트 5칸 | 스캔 → 창1/2·매1/2/3 한 화면 |
| `24d57cd` | T-SCAN-4-a · 매장별 [요청] | 매장 슬롯 미니 버튼 |
| `2621b87` | T-SCAN-4-b · 표 재구성 | 요청메뉴 진열요청 표 컬럼 |
| `ff04638` | T-CTR-12 · 세전월급 자동 | 근로계약서 자동 채움 |
| `92a25bb` | T-SCAN-2 · ProductInfoCard | 세로 제목 방지 |
| `9851d10` | T-SCAN-3 · 삑소리 강화 | 2톤 · 진동 |
| `49e34e5` | T-UI-1 · ProductDetailPanel | 태블릿 fullscreen |
| `89612ac` | 매입 서브탭 파이차트+필터 | 원형차트 3종 · 기간필터 |

---

## ✅ 사용자 SQL 실행 완료 (2026-08-05)

- ✅ `contract_clauses` 테이블 생성 (T-C 대응)
- ✅ 인덱스 SQL Block A (재고관리·매입이력·상품·실재고·진열요청)
- ⏳ 인덱스 Block B (pg_trgm + trigram · 상품 검색 5~10배 · 선택)
- ⏳ zone_labels 테이블 생성 (아직 안 하셨으면 · `migrations/create_zone_labels_2026-08-05.sql`)

## ⏸️ 사용자 액션 대기 (Supabase 대시보드)

### T-CTR-3 · Supabase SQL
```sql
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS contract_type TEXT,
  ADD COLUMN IF NOT EXISTS contract_start DATE,
  ADD COLUMN IF NOT EXISTS contract_end DATE,
  ADD COLUMN IF NOT EXISTS probation_end_date DATE;
ALTER TABLE employee_contracts
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
```

| # | 항목 | 액션 |
|---|------|-----|
| J | pharmacist-materials 버킷 | Supabase 대시보드 |
| K | vendors 오학습 정리 (page 6) | vendors 테이블 직접 |
| L | employees.resume_url 컬럼 | `ALTER TABLE employees ADD COLUMN resume_url TEXT;` |

---

## 🚨 T3-defer · Render 배포 직전 재도입

- 원본 T3 (`0bce40e`) 설계 버그 원복 (`7cd406c`)
- 재도입 시 필수: 각 라우터 명시 경로 mount · public 분리 · E2E 테스트
- `server/middleware/requireAuth.ts` · `/api/auth/me` · `issueToken` 유지 중

---

## 세션 관리

- **원칙**: `docs/AGENT_PRINCIPLES.md`
- **임금**: `docs/PAYROLL_ALGORITHM.md`
- **contract-master**: `.claude/agents/contract-master.md`
- **메모리**: `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`
- **2026-08-05 세션**: 로컬 커밋 30+ · 리모트 푸시 2회 (`97ef77d` · `ecf84b4`)
- **이후 리모트 push · 명시 승인 시에만**
