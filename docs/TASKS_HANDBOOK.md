# 📋 태스크 핸드북 · megatown-staff-scheduler

> **모든 코딩 시작 전 · 이 파일 + CODING_PRINCIPLES.md 필수 리뷰** · 태스크 상태·진행 이력·다음 착수 지점 (사용자 지시 · 2026-08-23)
> **매 태스크 완료 시 · 이 파일 즉시 갱신** (완료 이동 · 커밋 SHA 기록 · 다음 태스크 상태 반영)
>
> **자매 파일**: [`docs/CODING_PRINCIPLES.md`](./CODING_PRINCIPLES.md) · 대원칙·프레임워크·안전
>
> **상세 태스크 스펙**: [`docs/TASKS.md`](./TASKS.md) · 원본 태스크 리스트 (Phase 상세 · 결정 필요 사항)
>
> **최종 업데이트**: 2026-08-23 저녁 세션

---

## 🚨 세션 재개 · 최우선 컨텍스트

### 활성 태스크 (in_progress)
- **#60** · 전체 프로젝트 페이지별 테스트+버그 (상시)
- **#65** · 사용자 태스크 · 오래된 순 순차 진행 (#178 · #181 · #188 · #191 · #192 · #197)

### 리모트 push 상태
- 🚫 **절대 금지** · 사용자 명시 승인만 · 로컬 커밋만 축적
- 현재 · 15+ 로컬 커밋 대기

---

## ✅ 이번 세션 (2026-08-23 저녁) 완료 태스크

| # | 태스크 | 커밋 SHA (핵심) | 요약 |
|---|--------|----------------|------|
| **#177** | 상품정보 페이지 신설 · 매장>매입 서브탭 (대형 · Phase A~D) | `fe33f65d` · `f43afc45` · `3ee0b766` | 마스터-디테일 · POST(auth) + PATCH + 인라인 편집 |
| **#179** | 바코드 스캔 미등록 상품 즉시 등록 UX | `1ad6c2f0` | ProductCreateModal 재사용 · 자동 재스캔 |
| **#185 잔여** | SupplierFilterBar → PageToolbar 통일 | `1a64746f` | 프리미티브 이관 · 톤 통일 |
| **#202** (신규+완료) | 스캔페이지 UX · 스크롤 제거 + 등록 준비 요약 | `79dafe85` | max-h 제거 · 등록 리스트 신설 |

### 신규 테스트 43개 (이번 세션)
| 파일 | tests | 요약 |
|------|------:|------|
| `ProductCreateModal.test.tsx` | 10 | 렌더 · initialCode/lockCode · 필수 검증 · submit mock |
| `ProductInfoPage.test.tsx` | 11 | 초기 렌더 · 권한 게이트 5 case · 리스트 · 검색 · 상세 · 편집 |
| `shared/schemas/products.test.ts` | 17 | CreateProductSchema · UpdateProductSchema 유효성 |
| `productsCache.test.ts` (addCachedProduct) | 5 | 신규·기존 병합·leading zero·빈 코드·기본값 |
| `Modal.test.tsx` (v3+ 확장) | 10 | size (3xl · lg-narrow · xl · full) · dark backdrop · bodyPadding · zIndex · headerBgClass · headerTextClass · cardStyle |

**전체**: 3055 → **3118 tests** (63 신규) · 209 files · all pass

**프레임워크 프리미티브 커버리지 · 이번 세션 강화**:
- Modal v3/v3.1/v3.2/v3.3/v3.4 (+10 tests · 25 total)
- Card v2 · bg + borderColor (+5 · 34 total)
- StatusPill v2 · shape (+3 · 17 total)
- BottomSheet v2 · header/fullscreen/disableHandle/backdropClass/zIndex/footer (+7 · 24 total)
- SplitListPanel · #198 (기존 18)
- ProductCreateModal (신규 10)
- SupplierFilterBar #185 (신규 7)
- OrderHistorySupplierModal #182 (신규 7)
- ScanLeftPanel #179 (신규 8)
- productsCache addCachedProduct #179 (신규 5)
- ProductInfoPage 통합 (신규 11)
- products Zod schema (신규 17)

---

## 📝 이번 세션 커밋 로그 (최신 → 과거 · 40개)

| # | SHA | 파일 | 요약 |
|---|-----|------|------|
| 40 | `98dcbbd7` | SplitListPanel.tsx + test | feat: v2 확장 (countDisplay/footer/bodyClassName) · #198 Phase 3 지원 · 6 신규 tests |
| 39 | `4b9abe79` | TASKS.md | docs: #198 Phase 2 완료 · Phase 3 진행중 명시 |
| 38 | `a7304513` | SESSION_STATUS.md | 심야 세션 갱신 |

## 📝 이전 커밋 (37개)

| # | SHA | 파일 | 요약 |
|---|-----|------|------|
| 37 | `c2a9a4b6` | Modal.test.tsx | test: backdrop 클릭 · closeOnBackdrop · card 클릭 3 tests |
| 36 | `1f492b8d` | Modal.test.tsx | test: align (bottom-mobile/top-mobile/center) 3 tests |
| 35 | `349bb4ad` | CODING_PRINCIPLES.md | docs: mock 패턴 확장 · afterEach cleanup · 콜백 시그니처 확장 원칙 |
| 34 | `35653490` | TASKS_HANDBOOK.md | 커밋 로그 33개 반영 |
| 33 | `76b11cb3` | ProductCreateModal · ScanPage · test | **fix** #179 신규 등록 상품 빈 name 버그 · onCreated (code, product) 확장 |
| 32 | `c3d93a7d` | SESSION_STATUS.md | 밤 세션 갱신 · 3112 tests |
| 31 | `7c24426c` | ProductInfoPage.tsx | polish: 편집 number input min=0 + optimal_stock step=1 |
| 30 | `e2d94ce8` | ProductCreateModal.tsx | polish: optimal_stock step=1 (Zod int 일치) |
| 29 | `06470815` | FRAMEWORK_AUDIT.md | audit: 649 files scan · 645 clean (100%) |
| 28 | `86995986` | MENU_STRUCTURE.md | docs: #177 계획→완료 반영 |
| 27 | `f2b3c903` | ScanPage.panels.test.tsx | test: #202 SaveCard 등록 준비 요약 9 tests |
| 26 | `58ac824b` | BottomSheet.test.tsx | test: v2 확장 7 tests (header/fullscreen/disableHandle/backdropClass/zIndex/footer) |
| 25 | `5b559cfd` | Card.test.tsx | test: v2 · bg + borderColor 5 tests |
| 24 | `78fcaca9` | StatusPill.test.tsx | test: v2 shape prop 3 tests |
| 23 | `c35e5ab3` | SupplierFilterBar.test.tsx + vitest.config | test: #185 SupplierFilterBar PageToolbar 회귀 방지 7 tests |
| 22 | `2837596a` | OrderHistorySupplierModal.test.tsx + vitest.config | test: #182 · 7 tests · Modal+PeriodSelector 커버리지 |
| 21 | `e597f675` | FRAMEWORK_AUDIT.md | audit baseline 갱신 · 647 files · 645 clean (100%) |
| 20 | `5a8c1cc5` | TASKS_HANDBOOK.md | 커밋 로그 갱신 |
| 19 | `538e9c57` | ProductInfoPage.tsx | **fix** #177 편집 후 상세 stale 방지 (reloadKey deps) |
| 18 | `fb22409a` | ScanPage.panels.test.tsx + vitest.config | test: ScanLeftPanel #179 8 tests |
| 17 | `6bae463e` | CODING_PRINCIPLES.md + TASKS_HANDBOOK.md | docs: 관리 파일 2가지 통합 신설 |
| 16 | `5b6c6fb9` | Modal.test.tsx | Modal v3+ 10 tests |
| 15 | `af75fb4e` | productsCache.test.ts | addCachedProduct 5 tests |
| 14 | `cb019462` | shared/schemas/products.test.ts | Zod 17 tests |
| 13 | `2ff51e81` | ProductInfoPage.test.tsx | Page 통합 11 tests |
| 12 | `6e182c4b` | ProductCreateModal.test.tsx + vitest.config | CreateModal 10 tests |
| 11 | `dad5db8f` | MENU_STRUCTURE.md | #177 반영 |
| 10 | `f36cc3d0` | SESSION_STATUS_2026-08-23.md | 세션 진척 갱신 |
| 9 | `a0d75548` | TASKS.md | #185 완료 문서 |
| 8 | `1a64746f` | SupplierTab.panels.tsx | **#185** 잔여 |
| 7 | `f3151ee5` | TASKS.md | #179 완료 문서 |
| 6 | `1ad6c2f0` | ScanPage/ProductCreateModal/productsCache/audit | **#179** |
| 5 | `2c7ce945` | TASKS.md | #202 완료 문서 |
| 4 | `79dafe85` | ScanPage.tsx/panels | **#202** |
| 3 | `332c508f` | TASKS.md | #177 완료 문서 |
| 2 | `3ee0b766` | products.ts (schema) + ProductInfoPage | **#177 Phase D** |
| 1 | `f43afc45` | products.ts (route+modal+page) | **#177 Phase C** |
| 0 | `fe33f65d` | OrderManagePage + ProductInfoPage | **#177 Phase A/B** |

---

## 🔄 대기 태스크 (사용자 스펙 결정 필요 · 자율 부적합)

### #178 · 공급사 정보 스키마 확장 (2026-08-20)
- 📄 원본 · xlsx 57 시트 · 52 vendor
- 🔲 Phase A-E · DB · Zod · 서버 · UI · 스크립트
- 💡 **결정 필요 4건**:
  - `login_credentials` 암호화 여부
  - `note` vs `special_notes` 병합/분리
  - `vendor_order_templates` 별도 페이지 or 조회 전용
  - xlsx import 자동 vs 수동 트리거

### #181 · 매장구역도 인라인 편집 (2026-08-21)
- 💡 **결정 필요 4건**:
  - Option A (Inline Popover · 권장 · 저위험) / B (Editing Mode · 드래그) / C (통합)
  - ZoneSettingsPage 유지 vs 통합
  - 드래그 · num 재배정 or section 이동?
  - 편집 권한 · 관리자만 or 매니저부터

### #188 · 메뉴 설정 · 모바일 가시성 · PC/모바일 체크박스 (2026-08-22)
- 페이지별 [PC ☑] [모바일 ☑] · SIDE_NAV_GROUPS 순회
- 신규 API `/api/settings/page-visibility`
- 신규 훅 `usePageVisibility(pageKey, viewport)`
- 라우팅 gate · 사이드바 · 공통헤더 · 뷰포트별 필터
- 기존 `useMobilePageLevel` deprecated · 마이그레이션 스크립트

### #191 · Modal 프레임워크화 · inline modal 35+ 마이그레이션 (2026-08-22)
- Phase A · 저위험 self-contained (ImageZoomModal · CellPickerPopup)
- Phase B · 중위험 (각 대형 페이지 내부 modal)
- Phase C · 고위험 (VendorDetailModal 등)
- 각 파일 회귀 검토 필요 · 자율 부적합

### #192 · 거래처 로그인 · 승인 flow (2026-08-22)
- Step 1 · 로그인 · 공급사정보 등록 자동 오픈 · 진행률 표시
- Step 2 · 필수 필드 통과 시 · [승인 요청] 활성
- Step 3 · 관리자 승인 → [공급자재고확인] 활성
- DB · vendors ALTER (`approval_status` · `approval_requested_at` · `approved_at` · `approved_by`)
- 서버 · Zod · asyncHandler · HttpError · 미들웨어

### #197 · 상품 스캔 · 미분류 → 등록 페이지 자동 연결 (2026-08-23)
- 💡 **결정 필요** · #179 (모달) vs #197 (페이지 이동)
  - Option A (병행 · 설정 토글) / B (페이지만) / C (모달만)
- Modal 방식 · **#179 완료** · 페이지 이동 방식 · 대기

---

## 🎯 최근 완료 태스크 (지난 세션 · 2026-08-21~2026-08-23)

주요 완료:
- **#171~#176, #180, #182~#187, #189, #190 (대부분), #193~#196, #198~#201** (21건)
- Framework Phase 4 · large-file 44→2 (95% 감축)
- UI 프레임워크 · Modal v3.4 · Card v2 · Badge · useApiCall · Spinner · StatusPill shape · BottomSheet v2 · SplitListPanel · PageToolbar · Badge 등 확립
- 상세 · `docs/TASKS.md` · `docs/SESSION_STATUS_2026-08-23.md`

---

## 🚀 다음 착수 권장 순서

1. **사용자 결정 대기 태스크** · 스펙 확정 시 순차 (#178 → #181 → #188 → #191 → #192 → #197)
2. **작은 안전 작업** (자율 가능)
   - 테스트 커버리지 확대 · 서버 route 유닛 test (asyncHandler pattern)
   - 문서 갱신 · MENU_STRUCTURE · 신규 기능 반영
   - audit baseline 관리
   - 프레임워크 프리미티브 새 케이스 추가
3. **회귀 방지 상시**
   - 매 편집 · `npx tsc --noEmit` + `npx vite build` + `npx vitest run`
   - audit · `node scripts/audit-framework.cjs`

---

## 🗂 관리 파일 · 파일 지도

| 파일 | 갱신 빈도 | 용도 |
|------|----------|------|
| **`docs/CODING_PRINCIPLES.md`** | 원칙 변경 시 | 원칙·프레임워크·안전 (숙지용) |
| **`docs/TASKS_HANDBOOK.md`** | 매 태스크 완료 시 | 현재 상태·완료·대기·다음 |
| `docs/TASKS.md` | 신규 태스크 등록 시 | 원본 태스크 스펙 상세 |
| `docs/MENU_STRUCTURE.md` | 신규 페이지·API 시 | 페이지·API·DB 세부 |
| `docs/SESSION_STATUS_2026-08-23.md` | 세션 종료 시 | 세션별 상세 로그 (히스토리) |
| `docs/FRAMEWORK_AUDIT.md` | 매 커밋 (자동) | 감사 리포트 |
| `docs/.framework-baseline.json` | audit 갱신 시 | 감사 baseline |
| `docs/UI_MOCKUP_2026-08-21.html` | UI 목업 갱신 시 | UI 참조 |
| `.claude/memory/*` | 원칙 추가/변경 시 | 자동 로드 메모리 (MEMORY.md 인덱스) |

---

## ⚠ 재개 시 반드시 확인

1. `git status` · 미커밋 파일 확인
2. `git log --oneline | head -20` · 최근 커밋
3. `docs/CODING_PRINCIPLES.md` · 원칙 재확인
4. 위 "활성 태스크" 섹션 · 진행 중인 것 확인
5. 위 "대기 태스크" 섹션 · 사용자 결정 필요 여부 확인
6. **리모트 push 절대 금지** · 명시 승인만
