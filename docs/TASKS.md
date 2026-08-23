# TASKS

> 2026-08-23 · #31 완료 · RawOcrTable 5268→799줄 · 9 신규 훅/상수 파일 · audit 위반 5→4 · TS clean · build ✓
> 2026-08-22 · Framework Phase 4 대량 분리 · 6파일 -1,003 라인 · 8 신규 파일 이관 · audit 24 유지 · Phase 2 (가드레일) 완료 · 원격 push 완료
> 2026-08-21 · Framework Phase 4 (large-file 분리) · 44→22 warn/critical · 50% 탈출 · 클린 84%→96% · 35+커밋
> 2026-08-20 (밤 최신) · Unit test **2514 tests · 176 files** · Spinner 22곳 추가 확산 · common/features Phase A (PurchaseHistoryModal·VendorSearchModal 이동) · LandingPage dots revert (대원칙 위반 재확인) · MENU_STRUCTURE 11차 업데이트 완료
> 2026-08-20 (밤) · Unit test **2274 tests · 163 files** · #177 상품등록 페이지 대기 (매장>매입) · payroll/contract/stock 테스트 197개 확산 · MENU_STRUCTURE 10차 업데이트 완료 (Card 36곳+ · #177/#178 계획 등록)
> 2026-08-20 (저녁) · Unit test **2077 tests · 155 files** · **2000 돌파 🎉🎉🎉** · #175 완료 (퇴사예정 3-state 파생·사이드바 gate) · #174 완료 (종 아이콘 compact) · 병렬 3-에이전트 (sideNav gate + common 재분류 리서치 + server routes 순수 테스트 124개)
> 2026-08-20 · Unit test **1775 tests · 137 files** (2026-08-19 424 → 20일 1775 · **1350+ 신규**) · 모바일 가시성 탭 이관 (회사·브랜드 → 메뉴 설정)
> 2026-08-19 · Unit test 대량 확산 (150→424) · Spinner 30곳 · 정식 PWA 설정 · BarcodeScanner 로직 복원 + UI 재디자인
>
> **원칙**: [`feedback_framework_untouchable.md`](../.claude/agents) · [`feedback_ui_top_principle.md`](../.claude/agents) · [`feedback_remote_push_strict.md`](../.claude/agents) · 폰트 +2 규칙
>
> **원칙 규칙**: 완료 태스크는 삭제 · 신규 태스크는 상단 등록 · 진행중은 명확히 표시

---

## ⚙️ Framework Phase 4 · Large-file 분리 현황 (2026-08-21)

**목표**: 44 warn/critical → 0 · 파일당 800줄 미만
**현재**: 44 → 24 warn (24 유지 · 모두 large-file · raw-* 0) · 이번 세션 6파일 **-1,003 라인** · 8 신규 파일 이관

### 완전 탈출 (warn 0 · 진행 완료)

| 파일 | 원본 | 탈출 후 | 분리 산출물 |
|-----|------|--------|-----------|
| `PermissionsPage` | 964 | 탈출 | constants + LevelSelect + PositionsField |
| `ProductArrivalPage` | 1040 | 탈출 | helpers.tsx |
| `HrFormsPage` | 1123 | 778 | types + constants + utils + subcomponents |
| `ContractSettings` | 886 | 탈출 | constants |
| `PharmacistPage` | 952 | 755 | constants + utils + subcomponents |
| `ProductInfoCard` | 1015 | 894 | PurchaseHistorySection |
| `DisplayPage` | 3126 | 790 | 11 신규파일 (2026-08-22) |
| `BoardPage` | 1177 | 231 | types + constants + utils + PostCard + InlineDetail + ComposerModal + DetailModal |
| `ResignationWriter` | 1241 | 768 | types + utils + SignatureModal + ResignationPreview |

### 부분 분리 (warn/critical 유지)

| 파일 | 원본 | 현재 | 분리 산출물 | 커밋 |
|-----|------|-----|-----------|-----|
| `StaffManagePage` | 2728 | **2153** | types.ts (200) + helpers.ts (148) + CreateModal.tsx (110) + subcomponents.tsx (163) | `2d9ec295`·`11244343` |
| `OrderManagePage` | 3205 | **3089** | types.ts (90) + utils.ts (54) | `41b5455e` |
| `LandingPage` | 2467 | **2319** | PeriodCoverageWidget.tsx (163) | `d2dbcc20` |
| `DisplayPage` | 3126 | **790** ✅ | types+helpers+VendorManageSplit+ZoneDetailModal+StaffInfoModal+ZoneProductsModal+ProductInfoModal+DisplayStoreMap+DisplaySearchBar+DisplayMobileList+DisplayProductPanel+useDisplayData | `0358650b`·`ec957313` |
| `SalesTrendPage` | 2676 | **2501** | helpers.ts (203) | `3e694ebd` |
| `OcrPage` | 1768 | 1215 | types + ConfirmedRecordsTab | — |
| `PaymentInfoTab` | 1926 | 1513 | types + utils + subcomponents | — |
| `PurchaseHistoryTab` | 1192 | 1158 | types | — |
| `ReturnListPanel` | 1205 | 805 | types + ReturnRequestModal | — |
| `PurchaseSubTabs` | 1216 | 1145 | chart-helpers | — |
| `RequestsPage` | 1307 | 1225 | types + ListToolbar | — |
| `ScanPage` | 1165 | 1105 | helpers | — |
| `SupplierTab` | 1005 | 990 | types | — |
| `FlowTab` | 1111 | 1075 | types | — |

**총 신규 서브 파일**: 58+개 · **분리 원칙**: types / constants / utils / subcomponents 4-tier

### 남은 대상 (우선순위 순)

1. `OcrPage` (1215) · `PaymentInfoTab` (1513) · 최우선
2. `PurchaseSubTabs` (1145) · `RequestsPage` (1225) · `ScanPage` (1105) · 차순
3. `OrderManagePage` (3089) · `LandingPage` (2319) · 대형 · 추가 분리 필요
4. `ContractWriterPage` (2680+) · critical · 대규모 리팩터
   - `OcrPage/RawOcrTable` ✅ 완료 (5268→799줄 · #31 · 2026-08-23)

---

## 🔥 활성 (진행중 / 대기)

### #203 · SplitPanel 왼쪽·오른쪽 높이 정렬 (✅ 완료 · 2026-08-23 · `56c83390`)
> CSS · `.split-container` · `lg:items-stretch` 명시 (기본 stretch 확실화)
> CSS · `.split-left` + `.split-right` · `lg:h-full` 추가 · 명시적 높이 통일
> 모든 SplitPanel 소비자 (Staff · Payment · Vendor · Product · Purchase · Supplier) 자동 반영
> 사용자 시각 검증 대기 · 문제 시 페이지별 개별 조정

### #202 · 스캔페이지 UX · 위치+수량 스크롤 제거 · 등록리스트 확장 (✅ 완료 · 2026-08-23 · `79dafe85`)
> StockRowCard 리스트 · max-h/overflow 제거 · 자연 높이 확장
> SaveCard · 전체 등록 버튼 바로 위 · "등록 준비 요약" 리스트 (상품명·위치·수량) 신설
- 📄 대상 · **스캔페이지 (ScanPage · 매장>매입>실재고입력)** · 스캔한 상품 처리 영역
- 🎯 목표 · 스캔 상품의 **위치정보 + 추가수량 입력** 부분 · **스크롤 안 생기게** · 아래까지 다 보이게
- 🔲 상세 요구:
  - 🔲 스캔 상품 카드 (StockRowCard) · 위치정보 (real_map / zone) + 추가수량 입력 · 세로 스크롤 제거 · 내용 자연 확장
  - 🔲 그 **아래** · **"전체 등록 리스트"** 노출 · 지금까지 스캔한 모든 항목 요약 리스트
  - 🔲 리스트는 **"전체 등록" 버튼 바로 위** 위치 · 흐름 · [스캔 카드 → 등록 리스트 → 전체등록 버튼]
- 🔲 프레임워크 준수 · Card / SortableTable · SearchBar (필요 시) · 프리미티브 활용
- 🔲 모바일 · 스크롤 · 리스트만 오버플로우 · 스캔 카드 부분은 고정 노출
- ⚠️ 회귀 절대 X · 기존 스캔 → 저장 flow · 유지

### #201 · 삼선메뉴(햄버거) · 하위 레이어 겹침 표시 오류 수정 (✅ 완료 · 2026-08-23)
- 📄 대상 · 삼선(햄버거) 메뉴 · 사이드바 드로어 · z-index 겹침 문제
- 🐛 증상 · 삼선메뉴 열었을 때 · 아래 페이지 요소들 (테이블·리스트·모달 등) 과 겹쳐서 **안 보이거나 뒤에 깔림**
- 🔲 원인 조사:
  - 관련 파일 · `src/components/layout/AppNavHeader.tsx` · `BottomNav.tsx` · 또는 사이드 드로어 컴포넌트
  - 현재 z-index · 페이지 콘텐츠 · 모달 · popover 등과 비교
  - Modal primitive z-50 · 팝오버 z-[100]+ · Toast z-[9999] 등 다른 레이어와 순서
- 🔲 z-index 계층 재정리 · 삼선메뉴가 최상단에 오도록 (모달/토스트 아래 · 페이지 콘텐츠 위)
  - 권장 z-index · **z-[45] or z-40** (Modal z-50 아래 · 페이지 콘텐츠 z-0~10 위)
  - 또는 필요 시 z-[55] (Modal 위 · 다른 UI 아래)
- 🔲 backdrop 있는 경우 · backdrop z-index 도 함께 조정
- 🔲 회귀 방지 · 다른 UI (모달·토스트·popover) 순서 유지 · 매 페이지 확인
- 💡 원인별 status 분리 (feedback_logging_principle.md) · 재현 시나리오 로그
- 💡 관련 · 이전 세션 · SideBar z-index 이슈 있었으면 참조
- 💡 목업 파일 톤 유지 · `docs/UI_MOCKUP_2026-08-21.html`

### #200 · 랜딩페이지 · 전체 글씨 사이즈 +2 (✅ 완료 · 2026-08-23 · `cf7a92be`)
- 📄 대상 · `src/components/LandingPage/LandingPage.tsx` 및 서브 컴포넌트들
- 🔲 모든 텍스트 · 글씨 사이즈 **+2 통일** (대원칙 · `feedback_font_plus2_default.md`)
- 🔲 대상 컴포넌트:
  - LandingPage.tsx (기본)
  - TodayStatusPanel.tsx
  - LoginModals.tsx
  - UploadDataModal.tsx · StockUploadTab.tsx · ImportLogTab.tsx
  - VendorStockModal.tsx · VendorDetailModal.tsx (LandingPage 관련)
  - PaymentRegisterModal.tsx
  - PeriodCoverageWidget.tsx
  - MenuCard.tsx · StockSearch.tsx (관련)
- 🔲 매핑 규칙 (기존 목업 대비 +2):
  - `text-xs` (12) → `text-sm` (14)
  - `text-sm` (14) → `text-base` (16)
  - `text-base` (16) → `text-lg` (18)
  - `text-[Npx]` 형태 · N+2 (예: text-[13px] → text-[15px])
  - `text-lg` (18) → `text-xl` (20) 등
- 🔲 회귀 방지 · UI 레이아웃 깨짐 없는지 매 컴포넌트 확인
- 🔲 목업 파일 · `docs/UI_MOCKUP_2026-08-21.html` · 최종 톤 참조
- 💡 대원칙 · 40대+ 가독성 · Pretendard · antialiased
- 💡 이 태스크 이후 · 다른 페이지들도 +2 통일 여부 사용자 결정

### #199 · 로그아웃 옆 종표시 · 테두리·아이콘 여백 반으로 축소 (✅ 완료 · 2026-08-23)
- 📄 대상 · AppNavHeader · 로그아웃 버튼 왼쪽 종(Bell) 알림 아이콘
- 🔲 종 아이콘 · 테두리(border/padding)와 아이콘 사이 여백 · **현재의 반으로** 축소
- 🔲 시각적 균형 조정 · 로그아웃 버튼과 종 아이콘 · 크기·간격 조화
- 🔲 목업 파일 (`docs/UI_MOCKUP_2026-08-21.html`) 기준 · 톤 유지
- 💡 이전 #174 (사이드메뉴 종 아이콘 compact · 2026-08-20 완료) 와 유사 · 이번은 헤더 종 아이콘
- 💡 관련 파일 · `src/components/layout/AppNavHeader.tsx` · IconButton 프리미티브 또는 인라인
- 💡 회귀 방지 · 알림 배지·기능 flow 100% 유지

### #198 · Split 왼쪽 리스트 UI 프레임워크화 (Phase 2 ✅ 완료 · Phase 3 진행중 · 2026-08-23)
> ✅ Phase 2 · `src/components/common/SplitListPanel.tsx` 프리미티브 신설 · 18 tests · Card/Spinner/EmptyState/StatusPill 활용
> ✅ #177 ProductInfoPage · SplitListPanel 적용 완료 (첫 소비자)
> 🔲 Phase 3 · StaffManagePage/StaffListPanel · SchedulePage 좌측 · OcrPage/RawOcrTable 등 이관 (대형 · 페이지별 세밀 검토)
> ⚠️ Phase 3 · 각 페이지 회귀 위험 · 사용자 승인 후 순차 진행 권장
- 📄 대상 · Split 화면의 왼쪽 리스트 UI · 마스터-디테일 좌측 패널 통일
- 🎯 최종 목표 · **공통 UI 프리미티브** 만들어서 · 이후 모든 split 왼쪽 리스트에 통일 적용
- 🎨 스타일 원칙:
  - 최신 트렌드 · Linear · Vercel · Notion · Attio 2026 톤
  - 초고해상도 · 부드러움 · GPU 가속 · antialiasing
  - 깔끔 · 세련 · 멋진 · 고급 · 딥네이비 accent
  - **목업 디자인 톤 반영** · `docs/UI_MOCKUP_2026-08-21.html` 기준 · 통일성
  - 파스텔 · 이모지 · 촌스러움 · 화려한 그라디언트 지양
- 🔲 **Phase 1 · 리서치** · 현재 split 왼쪽 리스트 사용처 조사 (research-strategist 활용)
  - StaffManagePage · StaffListPanel (StaffListRow)
  - SchedulePage · 스케쥴 조회 · 좌측 리스트
  - OcrPage/RawOcrTable · 좌측 파일 리스트 (있으면)
  - 향후 · #177 상품정보 페이지 · 좌측 상품 리스트
  - 기타 · Board · Requests · OrderHistory 등 검토
- 🔲 **Phase 2 · 공통 프리미티브 설계** · `src/components/common/SplitListPanel.tsx` (또는 SplitListItem)
  - 헤더 · SearchBar + FilterBar + "+ 신규" 버튼
  - 리스트 · 아이템 slot (children · 각 페이지 커스텀)
  - 선택 시 · highlight · smooth transition
  - 정렬 · 컬럼 폭 조정 · 카테고리 색깔 (feedback_ui_principles.md)
  - 가상 스크롤 (react-window · 대량 리스트) · 필요 시
  - 폰트 +2 원칙 · Pretendard · antialiased
- 🔲 **Phase 3 · 통일 적용** · 기존 리스트들 · 공통 프리미티브로 이관 · 순차
- 🔲 **Phase 4 · 검증** · 모든 페이지 시각 통일성 확인 · 사용자 확정
- 💡 프레임워크 원칙 · 3곳 반복 = 즉시 추출 · 공통화 원-오프 금지
- 💡 관련 · #177 상품정보 페이지 (SplitPanel 마스터-디테일 · 좌측 리스트) · 이 프리미티브 사용
- 💡 기존 프리미티브 재사용 · Card · SearchBar · StatusPill · SortableHeader · useSortableTable · useColumnResize · useResizablePanel

### #197 · 상품 스캔 · 미분류 상품 → 상품등록 페이지 자동 연결 (신규 · 2026-08-23 · **스펙 확정 2026-08-23**)

**🎯 스펙 확정 (사용자 결정 · Option A · 병행)**:
- **#179 (완료)** · 모달 방식 · ProductCreateModal · lockCode + initialCode · **유지**
- **#197 (신규)** · 페이지 이동 방식 추가 · 상품정보 페이지 (#177) 로 자동 이동 · 스캔 바코드 state 전달
- **사용자 설정 토글** · 개인 preference · 어느 방식 사용할지 선택

**구현**:
- 🔲 설정 · MyPage or PermissionsPage > 개인 · "스캔 미등록 처리 방식" 토글 (localStorage or KV)
- 🔲 ScanPage · notFoundCode 감지 · 설정 확인 → 모달 or 페이지 이동 분기
- 🔲 페이지 이동 시 · `onNavigate("productinfo", { initialCode: code })` · 상품정보 페이지에서 자동 등록 모달 열기
- 🔲 페이지 이동 후 · 돌아가기 버튼 (ScanPage 로) · 등록 완료 시 자동 재스캔 (선택)

**권한** · 관리자 + 매니저 lv5+ (동일 · #179 · #177)

**관련 메모리** · `.claude/memory/project_scan_unregistered.md`

### #197-원본스펙 (기록)
- 📄 대상 · 바코드/상품 스캔 flow · 미등록·미분류 상품 감지 시 · **상품등록 페이지로 자동 이동**
- 🔲 스캔 결과 · `products` 테이블 조회 · 매칭 없음 (미분류) 감지
- 🔲 감지 시 · confirm 다이얼로그 (useConfirm) · "미등록 상품입니다. 상품등록 페이지로 이동할까요?"
- 🔲 사용자 확인 시 · #177 상품정보 페이지 (등록 폼) 으로 이동
  - onNavigate("productinfo", authSession) · 프론트 라우팅 (or 매장 > 매입 > 상품정보 탭)
  - 스캔된 바코드 · state or query param 으로 전달 · 등록 폼 자동 채움 (`product_code` prefilled + readonly)
- 🔲 취소 시 · 스캔 화면 복귀 (기존 flow 유지)
- 🔲 권한 · 관리자 + 매니저 lv5+ 만 이동 안내 (그 외 · "권한이 없습니다" 안내만)
- 🔲 스캐너 사용처 · ScanPage · ProductArrivalPage · BarcodeScanner 등 · 각 페이지 판단
- 💡 **#179 (모달 방식) vs #197 (페이지 이동 방식)** · 선택 or 통합
  - 옵션 A · 두 방식 병행 · 사용자 설정으로 전환
  - 옵션 B · 페이지 이동만 (모달 X · #179 취소)
  - 옵션 C · 모달만 (페이지 이동 X · #197 취소)
  - **결정 필요 · 사용자 확정**
- 💡 의존 · #177 (상품정보 페이지) 선행 완료 · 등록 폼 prefill 지원
- 💡 관련 · #179 (스캔 미등록 즉시 등록 UX)

### #196 · 빈 폴더 정리 · 미사용 디렉토리 삭제 (✅ 완료 · 2026-08-23)
- 📄 대상 · 빈 폴더 5개 조사 완료 · 처리 방침 결정 필요
- 🔲 **`src/controllers/`** · 참조 0건 · 삭제 가능 (Express controller 계획된 것 · 실사용 X)
- 🔲 **`src/services/`** · 참조 0건 · 삭제 가능 (Service layer 계획된 것 · 실사용 X)
- 🔒 `server/models/.cache/huggingface/download` · HuggingFace 자동 생성 · **유지** · `.gitignore` 추가 검토
- ⚠️ `sql/fresh-install/` · `docs/DB_SETUP.md` 참조 · 신중 판단 (실사용 SQL 파일 있으면 필요) · **참조 문서 확인 후 결정**
- 🔒 `uploads/resignations/` · `server/routes/schedule/schedules.ts` 참조 · **유지** (런타임 사직서 저장 폴더)
- 💡 회귀 방지 · 삭제 전 `git log` 로 최근 커밋 이력 확인 · 계획된 기능 놓치지 않도록
- 💡 삭제 시 · `git rm -r <dir>` 로 tracked empty 처리 · commit

### #195 · 스케쥴표 확정 버튼 · 재확정 프로세스 (✅ 완료 · 2026-08-23)
- 📄 대상 · 스케쥴표 페이지 (확정 버튼 위치 확인 필요 · `SchedulePage.tsx` or `DayTimelineModal.tsx`)
- 🔲 확정된 스케쥴이면 · 버튼 텍스트 **"확정됨"** 으로 표시 (현재는 "확정" 등)
- 🔲 "확정됨" 버튼 다시 누르면 · 확인 알림 **"다시 확정하시겠습니까?"** (useConfirm)
- 🔲 사용자 확인 시 · 재저장 프로세스 실행 (기존 저장 로직 재호출)
- 🔲 사용자 취소 시 · 아무 동작 없음
- 🔲 useToast + useConfirm 사용 · 알림·확인 표준화
- 💡 회귀 방지 · 기존 확정 flow 100% 유지 · 재확정 로직 추가만
- 💡 확정 상태 표시 (StatusPill "확정됨" tone=emerald) · 목업 톤 일치

### #194 · 방문예약 · 대상자 대표/부장/이사 → 대표/이사 축소 (✅ 완료 · 2026-08-23 · `414f5e37`)
- 📄 대상 · `src/components/ReservationPage/ReservationPage.tsx`
- 🔲 STAFF_NAMES 배열 수정 · `["대표", "이사", "부장"]` → `["대표", "이사"]` (line 83)
- 🔲 정규식 수정 · `/^\[대상:(대표|이사|부장)\]/` → `/^\[대상:(대표|이사)\]/` (line 79)
- 🔲 컬럼 헤더 3개 → 2개 · UI 반응성 확인 · grid 2 col (line 465)
- 🔲 modalTarget 기본값 유지 · "대표" (line 116)
- 🔲 주석 수정 · "Employee IDs 1,2,3 (대표/이사/부장)" → "Employee IDs 1,2 (대표/이사)" (line 33) · 실제 employee_id 매핑 확인 필요
- 🔲 기존 저장된 "[대상:부장]" 예약 데이터 처리 방침 확인 (마이그레이션 or fallback)
- 🔲 서버 라우트 (`/api/blocked-slots` 등) 에 부장 관련 하드코딩 없는지 확인
- 💡 회귀 방지 · 예약 flow 100% 유지 · 컬럼 축소 시 grid 폭 자동 조정

### #193 · 통계 설정 · 계절정의 + 적정재고설정 통합 (신규 · 2026-08-22)
- 📄 대상 · 설정 페이지의 **"계절정의"** 메뉴 → **"통계설정"** 으로 이름 변경
- 🔲 통계설정 · 탭 페이지 구조 (2탭)
  - **탭 1 · 계절정의** (기존 SeasonRangesEditor 재사용)
  - **탭 2 · 적정재고설정** (신규)
- 🔲 적정재고설정 탭
  - 계산법 · **오늘 기준 * 일 판매량** 을 적정재고로 설정
  - 현재 하드코딩 · 30일 (한달) 사용중
  - UI · 숫자 입력창 · 기본값 30 · 범위 예: 7~90일
  - 저장 · KV setting `optimal_stock_period_days` · debounce 자동 저장 (useKvSetting)
- 🔲 서버 · GET/PUT `/api/settings` · zod schema
- 🔲 모든 소비처 (LowStockService · OrderManagePage · RequestsPage 등) · 이 값 참조하도록 업데이트
- 🔲 현재 참조 파일 (grep 결과)
  - `src/components/common/ProductDetailPanel.tsx` · optimal_stock 계산·표시
  - `src/components/OrderManagePage/CategoryTab.tsx` · 하드코딩 30일
  - `src/components/OrderManagePage/OrderManagePage.tsx` · 발주요청 트리거
  - `src/components/OrderManagePage/TrendingTab.tsx` · 트렌드 분석
  - `src/components/RequestsPage/RequestsPage.tsx` · 발주 필요 상품 필터
  - `src/components/DisplayPage/DisplayPage.tsx` · 진열 표시
- 🔲 서버 라우터 · `/api/stock-manage/low-stock` · `/api/products/*` · 계산 로직 통일
- 💡 프레임워크 원칙 · useKvSetting 재사용 · Card·InputField·Tabs 프리미티브 활용
- 💡 관련 · SeasonRangesEditor 재사용 · 이름만 변경 · 하위호환 유지 (route/import)

### #192 · 거래처 로그인 · 공급사정보 등록 → 승인 → 공급자재고확인 flow (신규 · 2026-08-22 · **스펙 결정 중 · 2026-08-23**)

**🎯 스펙 결정 중** (사용자 서브 결정 대기):
- ① DB · vendors ALTER (`approval_status` · `approval_requested_at` · `approved_at` · `approved_by`) · A(승인) · B(별도 테이블) · C(스킵) · **대기**
- ② 승인 UI 위치 · RequestsPage 확장 vs 신규 admin 페이지 · **대기**
- ③ 재로그인 필요 여부 · 승인 즉시 실시간 반영 vs 재로그인 · **대기**

**3-Step Flow**:
1. **Step 1** · vendor 로그인 → 공급사정보 등록 자동 오픈 · 진행률 (7/10 필드 완료)
2. **Step 2** · 필수 필드 완성 → [승인 요청] 활성 → POST `/api/vendor-approval-requests` → 관리자 알림
3. **Step 3** · 관리자 승인 → vendor status = "approved" → [공급자재고확인] 활성

**의존 · 관련**:
- #178 · vendors 스키마 확장 (log규칙 + 신규 컬럼) · 함께 진행 권장
- #94 · 공급사 재고확인 페이지 (Phase 2 유보) · gate 재활성화 필요
- 로그인 규칙 · 담당자 핸드폰 + `.env VENDOR_PW_SUFFIX` · #178 결정 재사용

### #192-원본스펙 (기록)
- 📄 대상 · 거래처(vendor) 로그인 후 진입 페이지 · 3단계 승인 flow 구현
- 🔲 **Step 1** · 거래처 로그인 성공 시 · **공급사정보 등록 메뉴** 자동 오픈 (or 사이드바 상단 강조)
  - 로그인 직후 첫 화면 · 공급사정보 미완성 시 강제 노출
  - 미완성 항목 진행률 표시 (예: 7/10 필드 완료)
- 🔲 **Step 2** · 정보 다 채우면 · **[승인 요청] 버튼 활성화**
  - 필수 필드 검증 (회사명·사업자번호·담당자·연락처·주소·계좌·이메일 등)
  - 모든 필수 필드 통과 시 · 회색 disabled → 활성 CTA 전환
  - 클릭 시 · `/api/vendor-approval-requests` POST · 관리자 알림
  - 승인 대기 상태 · "관리자 승인 대기 중" 배너
- 🔲 **Step 3** · 관리자가 승인 → **[공급자재고확인] 버튼 활성화**
  - 관리자 UI · 승인 대기 목록 (RequestsPage 확장 or 신규 탭)
  - 승인 시 · vendors.approval_status = "approved" · vendor 세션 UI 갱신
  - 승인 후 vendor 재로그인 or 실시간 갱신 → 공급자재고확인 메뉴 노출·활성
- 🔲 DB · vendors ALTER · `approval_status` (pending·approved·rejected) · `approval_requested_at` · `approved_at` · `approved_by`
- 🔲 서버 · Zod schemas · asyncHandler · HttpError (feedback_logging_principle)
- 🔲 프레임워크 · Card·Modal·StatusPill·Button·useToast·useConfirm 재사용
- 🔲 이력 로그 · 승인/거절/재신청 audit trail (선택)
- 💡 관련 · #178 (공급사 정보 스키마 확장 · xlsx 원본 반영) 과 연계 · vendors 컬럼 스키마 검토 필요
- 💡 관련 · #94 (공급사 재고확인 페이지 A1 완료 · Phase 2 유보) · gate 재활성화 필요
- 💡 프레임워크 원칙 · 대원칙 19 · 설계 후 구현 · vendors 스키마·인증 flow·UI gate 3-way 정합성

### #191 · Modal 프레임워크화 · inline modal 35+ 마이그레이션 (신규 · 2026-08-22 · **Phase A 자율 진행 승인 2026-08-23**)

**🎯 스펙 확정 (2026-08-23 사용자 결정)**:
- **Phase A · 자율 진행 승인** · 저위험 self-contained 파일 5-10개 순차 이관 (매 파일 검증 · 문제 시 롤백)
- Phase B (중위험) · Phase C (고위험) · 사용자 승인 후

**Phase 분류**:
- **Phase A (자율)** · ImageZoomModal · CellPickerPopup · IosInstallGuide (일부) 등 · state 얽힘 X
- **Phase B (승인 대기)** · DayTimelineModal · ContractWriterPage 모달 등 · 페이지 내부 modal
- **Phase C (승인 대기)** · VendorDetailModal · panel/modal 이중 모드 · 고위험

**자율 진행 원칙 (Phase A)**:
- 각 파일 · Modal props 매핑 (headerRight · titleAccent · bodyPadding 등 정밀 조정)
- 매 파일 · TS + build + test 검증 · 회귀 없으면 커밋
- 시각 검증 · 사용자 요청 시 각 파일 스크린샷

**규모**: Phase A 예상 1-2시간 · 5-10 파일 · 각 파일 15-30분

**관련 메모리** · `.claude/memory/project_modal_migration.md`

### #191-원본스펙 (기록)
- 📄 배경 · Modal 프리미티브 이미 존재 (src/components/common/Modal.tsx · v2 확장 · 2026-08-18)
- 🔲 문제 · 35+ 파일에서 여전히 `<div className="fixed inset-0 z-[N] backdrop-brand...">` inline 패턴 사용
- 🔲 대상 파일 예 · DayTimelineModal · CellPickerPopup · DisplayPage · ContractWriterPage · BoardPage · LandingPage · EmployeeCalendarModal · ScanPage · PurchaseSubTabs · CategoryTab · ColumnMappingModal · ConfirmedRecordsTab · ImageZoomModal · OrderManagePage · VendorListEditor · VendorStockModal · PaymentRegisterModal 등
- 🔲 Phase A · 저위험 신규 (3~5개) · ImageZoomModal · CellPickerPopup 등 self-contained
- 🔲 Phase B · 중위험 (5~10개) · 각 대형 페이지 내부 modal
- 🔲 Phase C · 고위험 · 복잡한 상태 얽힌 모달 (VendorDetailModal 등)
- 🔲 각 마이그레이션 · Modal props (open · onClose · title · icon · titleAccent · headerRight · size · backdropIntensity · footer) 사용
- 🔲 회귀 방지 · 기능 100% 유지 · className 만 조정
- 💡 프레임워크 원칙 14 · 매 단계 검증 · 19 · 설계 후 구현

### #190 · 매장구역도 · 설정 vs 매장진열 통합 (대부분 완료 · 2026-08-23 · 데이터 통합·팝오버 편집 · 삭제 여부 사용자 결정)
- 📄 현재 · **2곳에 별도 존재** · 설정 페이지 매장구역 (편집용 · ZoneSettingsPage) + 매장진열 페이지 매장구역도 (표시용 · StoreZoneMap)
- ✅ **데이터 통합 완료** (2026-08-23) · 양쪽 다 `useZoneDefs` · KV `zone_defs` · 자동 동기화 · single source of truth 확립
- ✅ **방안 2 실현** (2026-08-23 · #189 완료) · StoreZoneMap 팝오버에서 편집 (label · category · num) 가능 · 두 페이지 모두 편집 지원
- 💡 남은 architectural 결정 (사용자 판단 필요):
  - ZoneSettingsPage 유지 (테이블 편집 · 대량 편집 편함) vs 삭제 (매장진열 팝오버로만)
  - 삭제 시 · 사이드바 · 라우팅 gate · destructive · 명시 승인 필요

### #189 · 매장구역도 · 구역 클릭 팝업 · 수정 버튼 (✅ 완료 · 2026-08-23)
- 📄 대상 · StoreZoneMap · 구역 클릭 시 뜨는 팝업 (인라인 상세)
- 🔲 팝업에 **[수정] 버튼** 추가 · 클릭 시 편집 모드 진입
- 🔲 편집 가능 필드 · label · category · num (구역명·카테고리·번호)
- 🔲 저장 · useZoneDefs · debounce 자동 저장
- 🔲 편집 완료 후 팝업 닫기 or 지속 (사용자 결정)
- 🔲 설정 페이지의 매장구역 편집과 동기화 (같은 source · useZoneDefs)
- 💡 관련 · #181 (인라인 편집 + 드래그 위치) 과 통합 가능 · 팝업 내 편집 vs 인라인 편집 UX 결정 필요

### #188 · 메뉴 설정 · 모바일 가시성 · PC/모바일 체크박스 (신규 · 2026-08-22 · **스펙 확정 2026-08-23**)

**🎯 스펙 확정 (2026-08-23 사용자 결정)**:
- ① 마이그레이션 · **자동** (기존 `useMobilePageLevel` 레벨 → 체크박스 자동 변환 · 데이터 손실 X)
- ② 저장 · **KV setting** (`page-visibility` · JSON · `useKvSetting` debounce)
- ③ UI · **위치 유지 · 이름 변경** (PermissionsPage > "메뉴 표시" 서브탭)

**Phase 1 · 서버 마이그레이션**:
- 🔲 첫 조회 시 · KV `page-visibility` 없으면 · 기존 mobile-page-level 읽어서 변환
- 🔲 레벨 5+ → mobile OFF · 그 외 ON · 변환 후 저장
- 🔲 이후 · 새 KV 만 사용

**Phase 2 · 신규 훅**:
- 🔲 `usePageVisibility(pageKey, viewport?)` 신설
- 🔲 KV `page-visibility` (`{[pageKey]: {pc: boolean; mobile: boolean}}`) 사용
- 🔲 사이드바 gate + 공통헤더 필터 · 이 훅 활용

**Phase 3 · UI 개편** ✅ **완료 (2026-08-23 · `29ac75cd`)**:
- ✅ MobileVisibilitySection · usePageVisibility 통합 · [PC ☑] [모바일 ☑] 체크박스
- ✅ 서브탭명 "모바일 가시성" → **"메뉴 표시"**
- ✅ SIDE_NAV_GROUPS 순회 · 페이지별 · 2 체크박스 · 색상 (bothOn=emerald · 하나 OFF=violet)
- ✅ 자동 마이그레이션 · usePageVisibility 내부 · mobile_min_level 레벨 5+ → mobile OFF

**Phase 4 · Gate/Sidebar 통합** ✅ **완료 (2026-08-23 · `3553f75f`)**:
- ✅ MobileOnlyGate · usePageVisibility 우선 · mobile OFF · 차단
- ✅ SideNav · 사이드바 items · 뷰포트별 필터 · isVisible(pageKey, viewport)
- ✅ 빈 그룹 자동 제거 · landing 예외 (무조건 노출)

**남은 작업** (선택):
- 🔲 공통헤더 (AppNavHeader) · 뷰포트별 탭 필터 (사이드바와 동일 원칙)

**관련 메모리** · `.claude/memory/project_page_visibility.md`

### #188-원본스펙 (기록)
- 📄 대상 · PermissionsPage > 권한 조정 > **모바일 가시성** 서브탭 (MobileVisibilitySection · BrandingSettingsPage.tsx)
- 🔲 현재 · `useMobilePageLevel` 레벨 기반 (0~10) · 단일 슬라이더
- 🔲 개선 · **페이지별 PC 체크박스 + 모바일 체크박스** 2개씩 · 각각 노출 여부 제어
- 🔲 기본값 · 두 체크박스 모두 ON (=모두 보이게) · 하위호환 유지
- 🔲 체크 해제된 곳 → 해당 뷰포트(PC or 모바일)에서 페이지 숨김
- 🔲 UI · 페이지 리스트별 [ PC ☑] [모바일 ☑] · CardRow 형태 · SIDE_NAV_GROUPS 순회
- 🔲 저장 · 서버 KV · 신규 API `/api/settings/page-visibility` or 기존 확장
- 🔲 라우팅 gate · 사이드바 (sideNavGroups.ts) · 공통헤더 (AppNavHeader) · 각각 뷰포트별 필터
- 🔲 기존 `useMobilePageLevel` deprecated · 마이그레이션 스크립트 (레벨 5+ → mobile OFF)
- 💡 프레임워크 원칙 · 신규 훅 `usePageVisibility(pageKey, viewport)` · 재사용
- 💡 관련 이력 · #172 (모바일 가시성 탭 이관 · 2026-08-20 완료)

### #187 · 실재고 입력 · 현재재고 위치 개선 (모바일 가독성) (✅ 완료 · 2026-08-23)
- 📄 대상 · ScanPage (실재고 입력) · StockRowCard (스캔한 상품 정보)
- 🔲 문제 · 반응형 (모바일)에서 창고1/창고2 입력창 (−/+ 사이) 너무 작아 · 현재재고 표시 잘 안 보임
- 🔲 개선 · 슬롯 제목(창고1·창고2 등) **아래**에 현재재고 표시 (기존 옆·인라인 → 아래 배치)
- 🔲 각 슬롯 (창고1·창고2·매장1·매장2·매장3) 별로 · [제목] → [현재재고 값 크게] → [−/+ 입력 컨트롤] 순서
- 🔲 모바일 우선 · 최소 폰트 [15px]+ · 반응형 lg:flex-row 유지 (PC는 옆 배치 가능)
- 🔲 대상 파일 · `src/components/ScanPage/StockRowCard.tsx`
- 💡 프레임워크 원칙 · className 만 조정 · props/state/API 무변경 (대원칙 14)

### #186 · 무동작 30분 자동 로그아웃 + 로그인 화면 이동 (✅ 완료 · 2026-08-23)
- 📄 대상 · 전체 앱 · 로그인 후 30분 이상 마우스·키보드·터치 무동작 시 자동 세션 종료
- 🔲 유저 activity 감지 · `mousemove` / `keydown` / `click` / `touchstart` 이벤트 → 타이머 reset
- 🔲 30분 (= 1800s) 카운트다운 · 만료 시 `onLogout()` 호출 + 로그인 페이지 리다이렉트
- 🔲 기존 `src/components/common/SessionTimeoutWarning.tsx` 재사용/확장 (이미 존재)
- 🔲 프레임워크 원칙 · `useAuth` 훅 · `onLogout()` 사용 · useEffect + 이벤트 리스너 등록/해제
- 🔲 기존 401 감지 즉시 로그아웃 (feedback_session_expiry.md) 과 별개 · 무동작 timeout 추가 요건
- 💡 SessionTimeoutWarning · 만료 전 경고 UI (예: 5분 전 알림) 재사용 가능 여부 확인
- 💡 주의 · 이벤트 리스너 cleanup · 메모리 누수 방지 · 컴포넌트 unmount 시 clearTimeout

### #185 · 통계 메뉴 상단 세션 · UI 프레임워크 통일 (✅ 완료 · 2026-08-23 · CategoryTab `1dee1e17` · SupplierFilterBar `1a64746f`)
> PurchaseSubTabs · 이미 상단 툴바 통합됨 (2026-08-10) · 추가 작업 불필요

### #185-원본스펙 (기록)
- 📄 대상 · 발주관리 > 통계 서브탭 상단 (CategoryTab · TrendingTab · SupplierTab · PurchaseSubTabs 등)
- 🔲 현재 · 각 서브탭 상단 세션 (제목·필터·기간선택 등) · 스타일·간격·색상 통일 안 됨
- 🔲 개선 · 프레임워크 프리미티브 적용 · PageToolbar · AccentBar · SeasonButtons · PeriodSelector · CategoryChips 일관 사용
- 🔲 각 탭 · 동일한 상단 레이아웃 (좌 accent+제목 · 중앙 필터 · 우 액션)
- 💡 프레임워크 원칙 · common/PageToolbar · common/AccentBar 재사용 · className 만 조정 · 기능 무영향

### #184 · 통계 구역현황 · 순위 옆 구역 표시 강조 (✅ 완료 · 2026-08-23)
- 📄 대상 · 발주관리 > 통계 > 카테고리별 판매현황 (`CategoryTab.tsx`)
- 🔲 현재 · 순위 리스트에서 순위 옆에 있는 구역(zone) 표시가 잘 안 보임 · 흐릿함
- 🔲 개선 · zone 배지 폰트 크기 up · 색상 뚜렷하게 · StatusPill/CategoryChips 프레임워크 활용
- 💡 프레임워크 원칙 · Card/StatusPill/AccentBar 재사용 · className 만 조정

### #183 · 발주요청 페이지 · 안내 문구 변경 (✅ 완료 · 2026-08-23)
- 🔲 기존 문구 · "손실 확정이 되었는지 확인하세요 (ERP재고 vs 실재고 차이 · 손실추적 탭 참조)"
- 🔲 변경 후 · "공급사를 클릭하면 최신 발주이력을 확인할 수 있습니다"
- 🔲 위치 확인 필요 · OrderManagePage 안 발주요청 리스트 상단 or 빈 상태 안내
- 💡 **의존** · #182 완료 후 · 안내 문구도 새 기능 (발주이력 우측) 반영
- 💡 프레임워크 원칙 · 문구 정정 (className 유지)

### #182 · 발주요청 페이지 · 우측 패널 · 발주이력 표시 (✅ 완료 · 2026-08-23 · 모달 방식)
- 📄 대상 · 매장 > 매입 > 발주 서브탭 (`OrderManagePage.tsx` · `purchase-order` topTab)
- 🔲 현재 · 왼쪽 발주요청 리스트 · 오른쪽 상품정보 상세
- 🔲 변경 · 오른쪽 상품정보 → **발주이력** 로 대체
- 🔲 공급사 클릭 · 오른쪽에 · **날짜별 발주내역 간략 리스트** 표시
- 🔲 각 이력 항목에 · [상세] 버튼 · 클릭 시 · 해당 공급사의 해당 발주이력 자세히 (모달 or 확장)
- 🔲 API · `/api/order-history?supplier=X` 재사용 (기존 OrderHistoryTab)
- 🔲 **SplitPanel 비율 · 7:3** (왼쪽 발주요청 리스트 넓게 · 오른쪽 30%) · minWidth 조정
- 프레임워크 재사용 · SplitPanel·PurchaseHistoryList·Modal·Card·useSortableTable
- 확장 · SplitPanel `right` 슬롯에 · OrderHistoryDetailPanel (신규 컴포넌트)
- 🔲 스펙 확정 필요:
  - 간략 리스트 컬럼 (날짜·상품수·총액 등)
  - 상세 모달 vs 인라인 확장 (accordion)
  - 기간 필터 · 기본 몇 일 (30일?)
- 💡 **의존** · #180 (발주이력 검색 기능) 과 연계 · 같은 데이터 소스
- 💡 프레임워크 원칙 준수 (대원칙 17·19)

### #181 · 매장구역도 · 인라인 편집 + 드래그 위치 변경 (신규 · 2026-08-21 · **스펙 확정 2026-08-23**)

**🎯 스펙 확정 (2026-08-23 사용자 결정)**:
- **편집 방식** · **C · 팝오버 + 드래그 둘 다** (Option C)
- **ZoneSettingsPage** · **완전 제거** · StoreZoneMap 인라인 편집만 · 페이지·라우팅·사이드바 gate 삭제
- **드래그 동작** · **num 재배정 + section 이동 둘 다** · 같은 section swap · 다른 section 이동 (중복 검사)
- **편집 권한** · **관리자만** (`role === "admin"` OR `"superadmin"`)

**Phase 1 · StoreZoneMap 확장 (프리미티브 관점)**:
- 🔲 `editing` prop 추가 (default false · readonly)
- 🔲 `onZoneUpdate` prop · 팝오버 편집 콜백 (label · category · num)
- 🔲 `onZoneReorder` prop · 드래그 재배정 콜백 (num swap or section 이동)
- 🔲 InlineEditPopover 신규 프리미티브 (or Modal size=sm 활용) · label + category + num input
- 🔲 useZoneDefs · setZones · debounce 자동 저장

**Phase 2 · 드래그 구현**:
- 🔲 드래그 라이브러리 · react-dnd or 커스텀 pointer events
- 🔲 long-press (모바일) · 500ms · 드래그 활성
- 🔲 같은 section · swap 방식 (num 교환)
- 🔲 다른 section · 이동 (target section num 중복 검사 · 중복 시 다음 available num or 사용자 확인)
- 🔲 드롭 인디케이터 · 드래그 위치 시각화

**Phase 3 · 권한 gate**:
- 🔲 관리자만 편집 · `authSession.role in ["admin", "superadmin"]`
- 🔲 매니저·직원 · 조회만 · 편집 UI 미노출

**Phase 4 · ZoneSettingsPage 제거**:
- 🔲 `src/components/ZoneSettingsPage/` · 파일 삭제 (destructive · 관리자 승인)
- 🔲 사이드바 · `sideNavGroups.ts` · zone-settings 항목 제거
- 🔲 라우팅 · App.tsx · zone-settings 라우팅 제거
- 🔲 관련 테스트 · 정리

**의존 · 프리미티브**:
- Modal (팝오버) · Card · useZoneDefs · useKvSetting (debounce)

**관련 메모리**:
- `.claude/memory/project_zone_map_edit.md` · 편집 방식 · 드래그 · 권한 · 페이지 제거

### #181-원본스펙 (기록 · 2026-08-21)

**현재 상태 (조사 완료)**:
- `StoreZoneMap` · 표시 전용 · 편집 없음
- `ZoneSettingsPage` · 별도 페이지 · 표 형식 폼 편집 (debounce 자동 저장)
- 드래그 · DisplayPage 스케쥴 zone 배정에만 · 구역 자체 위치 변경 X

**구현 방안 (대원칙 19 · 프레임워크 관점 설계)**:
- **Option A · Inline Popover 편집** (권장 · 저위험)
  - 셀 클릭 → Popover 열림 (Modal 재사용 or 신규 InlineEditPopover)
  - Popover 안 · label·category 편집 (useZoneDefs 훅)
  - 자동 저장 (debounce)
  - `readonly` prop · 기존 소비자 (SalesTrend·DisplayPage) readonly=true
- **Option B · Editing Mode + 드래그** (中위험)
  - StoreZoneMap · `editing` prop · 편집 모드 시 드래그 핸들
  - useSortableTabs 패턴 참고 · long-press 감지
  - 드래그 · num 재배정 or section 이동
- **Option C · A+B 통합** (中위험)

**프레임워크 재사용/확장**:
- 재사용 · `useZoneDefs`·`Modal`·`Card`·`useKvSetting` debounce·`useSortableTabs` 로직
- 확장 · `StoreZoneMap` 에 `editing`·`onZoneUpdate`·`onZoneReorder` prop
- 신규 프리미티브 후보 · `InlineEditPopover<T>` (편집 폼 wrapper)

**의존 · BC**:
- 기존 소비자 · SalesTrend·DisplayPage·CategoryTab · `editing` 미전달 시 · 현재 동작 유지
- ZoneSettingsPage · 표 편집 유지 or 통합 (사용자 결정)

**💡 스펙 확정 필요**:
- Option A/B/C · 어느 방향?
- ZoneSettingsPage · 유지 vs 통합
- 드래그 · num 재배정 or section 이동?
- 편집 권한 · 관리자만 or 매니저부터

### #180 · 발주이력 페이지 · 공급사·상품 검색 기능 (✅ 완료 · 2026-08-23)
- 📄 대상 · `src/components/OrderManagePage/OrderHistoryTab.tsx` (매장 > 매입 > 발주이력 서브탭)
- 🔲 상단 검색바 · 공급사 검색 (부분일치 · 한글 초성 검색 지원)
- 🔲 상품명 검색 (부분일치)
- 🔲 SearchBar 프리미티브 재사용 (`src/components/common/SearchBar.tsx`)
- 🔲 기간 필터 (기존) 와 결합 · AND 조건
- 🔲 검색 결과 · 실시간 필터 (client-side · 서버 재요청 X · 로컬 debounce 200ms)
- 🔲 결과 없음 안내 · EmptyState 프리미티브
- 💡 스펙 결정 필요:
  - 공급사·상품 · 각각 별도 검색 vs 통합 검색 (하나로)
  - 서버 API 확장 필요 여부 (현재 client-side filter 가능 · limit 초과 시 서버 filter 필요)
- 💡 프레임워크 원칙 준수 · SearchBar·EmptyState·useSortableTable 재사용

### #179 · 바코드 스캔 · 미등록 상품 즉시 등록 UX (✅ 완료 · 2026-08-23 · `1ad6c2f0`)
> ProductCreateModal 재사용 (initialCode/initialBarcode/lockCode props) · #177 프레임워크 활용
> ScanPage · 권한자만 등록 버튼 노출 · 등록 → 로컬 캐시 삽입 → handleScan 자동 재호출

### #179-원본스펙 · 바코드 스캔 미등록 상품 (기록 · 2026-08-21)
- 🔲 BarcodeScanner · 스캔 결과 · products 테이블에 없으면 · **"상품 추가" 자동 유도**
- 🔲 미등록 감지 시 · 상품 등록 모달 (#177 페이지의 모달 버전) 오픈
- 🔲 모달 · `product_code` 필드 · 스캔된 바코드로 **자동 채움** · readonly 표시
- 🔲 저장 성공 시 · 스캔 흐름 계속 (예: 실재고 입력·발주 등 원래 flow)
- 🔲 취소 시 · 스캔 화면 복귀
- 🔲 #177 상품 등록 페이지 · 모달 형태로도 재사용 가능한 구조 필요 (프레임워크화)
- ✅ **권한 확정 (2026-08-23 사용자 지시)** · **관리자 전체 + 매니저 level 5 이상만** 상품 등록 가능
  - `authSession.role === "admin"` OR (`role === "manager"` AND `level >= 5`)
  - 서버 라우터 · 미들웨어에서 권한 검증 (401/403)
  - 프론트 · 조건부 UI (버튼 노출 여부)
- 💡 스펙 결정 필요:
  - 모달 재사용 · 페이지 컴포넌트 안에 `Modal` wrapper 감쌈 or 페이지·모달 각각 별도 컴포넌트?
  - 자동 감지 조건 · products.product_code 정확 일치 시만 or fuzzy?
  - 스캐너 사용처 · ScanPage·ProductArrivalPage·재고체크 등 · 어디서 자동 유도?
- 💡 **의존** · #177 (상품 등록 페이지) 선행 완료 필요

### #178 · 공급사 정보 스키마 확장 · xlsx 원본 반영 (신규 · 2026-08-20 · **스펙 확정 2026-08-23**)

**🎯 스펙 확정 (2026-08-23 사용자 결정)**:
- **스코프** · xlsx **첫 시트 (마스터)** 만 사용 · 시트 2~57 (공급사별 상품) 완전 무시
- **로그인 규칙** · ID = 담당자 핸드폰 (`vendors.phone`) · 비번 = 핸드폰 + `.env VENDOR_PW_SUFFIX` (기본 "00") · DB 저장 X · 서버 파생
- **note vs special_notes** · **분리** · `note` (일반) + `special_notes` (발주 특이사항 · 경고 톤 배너)
- **Import 방식** · 일회성 스크립트 + 기존 vendors 연동/병합 (매칭 키: company_name)
- **UI 조회/수정** · 프레임워크 모두 활용 (Modal · Card · SplitListPanel · CategoryChips · Badge · StatusPill · PageToolbar · CollapseCard · useApiCall · useToast · useConfirm)

**Phase A · DB 마이그레이션** ✅ **SQL 파일 완료** (`6b155ed9`) · Supabase 실행 대기:
- ✅ `sql/migrations/2026-08-23_vendors_xlsx_columns.sql` · IF NOT EXISTS · idempotent
- ✅ 5 신규 컬럼 (`order_method` · `region` · `invoice_method` · `order_status` · `special_notes`)
- ✅ `login_credentials` 컬럼 신설 **X** (규칙 파생 · `.env`)
- ✅ `vendor_order_templates` 테이블 신설 **X** (첫 시트만)
- ⏳ **사용자 실행 대기** · Supabase Dashboard > SQL Editor

**Phase B · Zod 스키마** ✅ **완료** (`1081fe3e`):
- ✅ CreateVendorSchema · 5 신규 optional 필드 + `approval_status` enum
- ✅ 10 신규 tests · 17→27

**Phase C · 서버** ✅ **완료** (`6b155ed9`):
- ✅ PATCH `/api/vendors/:id` · 신규 5 필드 수신 · approval_status enum
- ✅ Fallback · 신규 컬럼 없음 시 · 자동 skip (마이그레이션 미실행 안전)
- 🔲 GET `/api/vendors` · 신규 컬럼 반환 (Supabase select 자동 · 별도 작업 불필요)
- 🔲 파생 함수 · `src/lib/vendorPassword.ts` · 별도 태스크

**Phase D · UI 조회/수정** ✅ **완료** (`9b131edd`):
- ✅ Vendor 타입 + EditDraft 타입 · 5 신규 필드 확장 · approval_status enum
- ✅ emptyDraft utility · 초기값 매핑
- ✅ VendorDetailModal · isDirty + handleSave payload + 5 신규 form fields
- ✅ 발주 특이사항 · amber 톤 border (경고 강조 · 목업 준수)
- ✅ 서버 fallback · DB migration 미실행 시 · 자동 skip (안전)
- 🔲 발주요청 페이지 · special_notes 경고 배너 (별도 태스크 · Phase F)

**Phase E · xlsx import 스크립트** ✅ **완료** (`53e6e98a`):
- ✅ `scripts/import-vendors.mjs` · Node ESM
- ✅ 첫 시트 파싱 · company_name 매칭 · phone fallback
- ✅ 매칭 O · UPDATE · 매칭 X · INSERT · DELETE 없음
- ✅ `npm run import:vendors:dry` · `npm run import:vendors`
- ⏳ **사용자 실행 대기** · `.env` SUPABASE_URL/KEY 설정 후

**규모** · 예상 **8-12시간** · UI 확장 포함

**관련 메모리**:
- `.claude/memory/project_vendor_login_rule.md` · 로그인 규칙
- `.claude/memory/project_vendor_special_notes.md` · note 분리
- `.claude/memory/project_vendor_scope.md` · xlsx 스코프 + import

### #178-원본스펙 (기록 · 2026-08-20)
- 📄 원본 · `src/sample/메가타운약국공급사관리정보.xlsx` · 57 시트 · 52 vendor
- 마스터 헤더 · 제약사·주문방식(사이트)·지역·거래명세서·담당자·연락처·주문현황·계정/비밀번호·특이사항
- 각 제약사 시트 · `no.·제품명·주문수량·비고` · 기본 주문 템플릿
- 🔲 Phase A · DB 마이그레이션 · vendors ALTER (`order_method`·`region`·`invoice_method`·`login_credentials`·`special_notes`) + `vendor_order_templates` CREATE
- 🔲 Phase B · Zod VendorSchema 확장 (optional 필드)
- 🔲 Phase C · 서버 라우터 GET/PUT vendors + vendor_order_templates CRUD (asyncHandler·HttpError·Zod)
- 🔲 Phase D · VendorListEditor / VendorDetailModal UI 필드 확장
- 🔲 Phase E · xlsx → DB import 스크립트 (일회성 · 52 vendor + templates)
- 💡 결정 필요:
  - `login_credentials` 암호화 여부 (평문 위험)
  - `note`(기존) vs `special_notes`(신규) 통합/분리
  - `vendor_order_templates` 별도 페이지 or 조회 전용
  - xlsx import 즉시 vs 수동 트리거

### #177 · 상품정보 페이지 신설 · 매장>매입 탭 확장 (✅ **Phase A/B/C/D 완료** · 2026-08-23 · `fe33f65d`·`f43afc45`·`3ee0b766`)
> Phase A · 매장>매입 서브탭에 "상품정보" 신설 (Info 아이콘 · indigo) ✅
> Phase B · SplitListPanel + useResizablePanel + Modal · 마스터-디테일 UI ✅
> Phase C · POST /api/products · authorize(5) · CreateProductSchema · ProductCreateModal 4섹션 ✅
> Phase D · PATCH /api/products/:code · UpdateProductSchema · 인라인 편집 (조회↔편집 토글) ✅
> ⚠ Phase C-1 (식약처 OpenAPI) · 사용자 지시 제거 (2026-08-23)
> ⚠ 서버 PATCH · authorize 미추가 (ScanPage/FlowTab 회귀 방지 · 프론트 게이트만)

### #177-원본스펙 · 상품정보 페이지 (기록 · 2026-08-20)

**최종 스펙 (2026-08-23 사용자 확정)**:
- **구조** · 매장 > 매입 > **"상품입고"** 옆에 **"상품정보"** 페이지 신설 · **탭으로 상품입고 ↔ 상품정보 전환**
- **UI 레이아웃** · 마스터-디테일 · SplitPanel 프리미티브 사용
  - **PC (lg+)** · 좌측 상품리스트 · 오른쪽 상세정보 (SplitPanel · 리사이저)
  - **모바일** · 좌측 상품리스트만 표시 · 클릭 시 상세정보 **모달** 오픈 (반응형)
- **UI 프레임워크 필수** · SplitPanel · Card · Modal · SearchBar · StatusPill · SortableTable 등 프리미티브 활용
- **권한 (2026-08-23 확정)** · 관리자 전체 + 매니저 **level 5 이상** (조회·등록·수정 모두)
  - `authSession.role === "admin"` OR (`role === "manager"` AND `level >= 5`)
  - 서버 · 미들웨어 검증 · 프론트 · 조건부 UI

**Phase A · 매장>매입 탭 확장**
- 🔲 매장>매입 서브탭에 **"상품정보"** 탭 신규 추가 (`productinfo` key)
- 🔲 기존 "상품입고" 탭 유지 (ProductArrivalPage) · "상품정보" 신설 (ProductInfoPage)
- 🔲 탭 순서 · 상품입고 → 상품정보 (또는 사용자 결정)
- 🔲 사이드바 · sideNavGroups.ts · 관련 라벨 확인

**Phase B · ProductInfoPage 신설 · UI 레이아웃 (마스터-디테일)**
- 🔲 **SplitPanel 사용** · 좌측 리스트 (기본 40%) · 우측 상세 (60%) · 리사이저 (useResizablePanel 훅)
- 🔲 **좌측 상품리스트**:
  - SearchBar 프리미티브 (한글 초성 검색)
  - 필터 · 공급사·카테고리·재고 상태 (Card · StatusPill)
  - 리스트 · 상품명·코드·공급사·재고 컬럼 · 정렬 (useSortableTable)
  - 클릭 시 · 선택된 상품 highlight + 우측 상세 로드
- 🔲 **PC (lg+)** · 우측 패널에 상세 표시 (ProductDetailPanel 재사용 · 편집 모드 토글)
- 🔲 **모바일 (max-lg)** · 상세 · Modal primitive (v3 · align="bottom-mobile" or center) · SplitPanel 자동 스택
  - Modal · `size="lg-narrow"` or `"3xl"` · title=상품명
  - useMediaQuery 훅 활용 (또는 CSS `lg:hidden`/`hidden lg:block`)
- 🔲 상세 필드 조회 · product_name · code · supplier · category · unit · barcode · spec · price · optimal_stock · real_map · 이미지 등

**Phase C · 상품 등록 기능**
- 🔲 좌측 리스트 상단 · **"+ 상품 등록" 버튼** (권한 통과 시만 노출)
- 🔲 클릭 시 · Modal (신규 등록 폼) 열림
- 🔲 기능 · `products` 테이블 INSERT (기존 컬럼 재사용 · 파생컬럼 X)
- 🔲 서버 · POST `/api/products` · asyncHandler + HttpError + Zod · **권한 미들웨어**
- 🔲 Zod 스키마 · `src/shared/schemas/products.ts` 확장 or 신규 CreateProductSchema
- 🔲 프론트 · apiClient · useToast · 프레임워크 원칙 준수
- 🔲 중복 검사 · product_code unique

**Phase C-1 · 식약처 OpenAPI 상품 자동 조회 (신규 · 2026-08-23)**
- 📄 기능 · 상품 등록 폼에서 · **제품명 or 바코드 검색** → 식약처 OpenAPI 조회 → 상세 상품정보 **자동 채움**
- 🔑 **API 키** · `f30e81d23cbe4bf4ace2` (환경변수 이동 필수 · `.env` · `MFDS_API_KEY` · 코드 하드코딩 절대 X · git 제외)
- 🔲 등록 폼 상단 · **검색 필드 2가지**:
  - 제품명 검색 (한글 fuzzy) · SearchBar 프리미티브
  - 바코드 검색 (정확 일치)
- 🔲 검색 결과 · 리스트 표시 · 선택 시 · **필드 자동 채움** (제품명·회사명·성분·규격·유효기간 등 · API 스펙에 따름)
- 🔲 사용자 수동 편집 가능 · 자동 채움 후에도 수정 가능
- 🔲 서버 프록시 라우터 · GET `/api/mfds/search?query=...&type=name|barcode`
  - 이유 · API 키 서버 보호 · CORS 회피 · 캐시 가능
  - asyncHandler + HttpError + Zod 준수
- 🔲 검색 실패·매칭 없음 · EmptyState + 수동 입력 fallback
- 🔲 캐시 · 동일 검색 결과 · 서버 in-memory 또는 KV 캐시 (선택)
- ⚠️ **작업 시작 시 사용자에게 API 상세 스펙 (엔드포인트 URL · 파라미터 · 응답 형식) 요청 필요**
  - 식약처 여러 OpenAPI 존재 (의약품·화장품·의료기기·건강기능식품 등)
  - 어느 API 사용할지 · 응답 필드 매핑 확정 필요
- 💡 필드 매핑 (API 응답 → products 컬럼):
  - 예시 · `제품명` → product_name · `업체명` → supplier · `바코드` → barcode · `제형/규격` → spec · `보관방법` → note 등 (실제 API 스펙 확인 후 확정)
- 💡 스캐너 연동 (#179) · 스캔 바코드 자동 검색·자동 채움 통합 가능

**Phase D · 상품 수정 기능 (인라인 편집)**
- 🔲 우측 상세 (PC) / 모달 (Mobile) · **편집 모드 토글** (조회 → 편집 → 저장/취소 UX · StaffManagePage 벤치마크)
- 🔲 편집 가능 필드 · product_name · supplier · category · unit · barcode · spec · price · optimal_stock · real_map 등 (product_code 는 read-only)
- 🔲 서버 · PATCH `/api/products/:id` · asyncHandler + HttpError + Zod (UpdateProductSchema · partial fields) · **권한 미들웨어**
- 🔲 Zod 스키마 · UpdateProductSchema (모든 필드 optional)
- 🔲 프론트 · api.patch · useToast (성공 · 실패 tone) · useConfirm (변경 취소 확인)
- 🔲 유효성 · product_code 변경 금지 · barcode 중복 검사 (자기 자신 제외)
- 🔲 편집 후 · productsCache 무효화 (lookupProduct fresh)
- 🔲 감사 로그 (선택) · 누가·언제·무엇을 바꿨는지 (product_edit_log 별도 태스크로 분리 가능)

**공통 · 프레임워크 원칙 준수**
- **필수 프리미티브** · SplitPanel · Card · Modal · SearchBar · SortableHeader · StatusPill · useResizablePanel · useSortableTable · useToast · useConfirm · apiClient
- 대원칙 · 매 단계 TS+build+test 검증 · 위험 작업 전 로컬 커밋 · UI 목업 파일 기준
- **StaffManagePage 마스터-디테일 벤치마크** (참고 구조 · StaffToolbar · StaffListPanel · StaffDetailPanel · StaffMobileDetail 등)

**의존 · #179 (바코드 스캔 미등록 상품 즉시 등록)** · 상품 등록 모달 재사용 구조 필요 (권한도 동일 · 관리자+매니저lv5+)

### #175 · 직원정보 · 퇴사예정 분류 + 사직서 조건부 노출 (✅ 완료 · 2026-08-20 · `2bc6ef8`)
- ✅ 3-state 파생 · retire_date null=재직 · 미래=**퇴사예정** · 오늘이하=퇴사 (`d2cc2a6`)
- ✅ DB · employees.retire_date DATE 재사용 · 컬럼 추가 없음 (feedback_no_derived_columns 준수)
- ✅ lib/employmentStatus.ts · getEmploymentStatus·canWriteResignation·EMPLOYMENT_STATUS_LABEL
- ✅ EmployeeProfileCard · 이름 옆 상태 배지 (퇴사예정 amber·퇴사 zinc)
- ✅ ApprovalRequestPage · ResignationGate · 퇴사예정 만 사직서 접근·admin 예외
- ✅ 재직/퇴사 · 안내 UI (관리자에게 요청 안내)
- ✅ StaffManagePage · 상태 필터 3-state (재직/퇴사예정/퇴사/전체 · `db27f33`)
- ✅ StaffManagePage · 퇴사예정 배지 amber · 퇴사 rose · title 툴팁 날짜
- ✅ 퇴사자 목록 (필터 "퇴사" 탭) · 사직서 보기/업로드 · 기존 UI 재사용
- ✅ **사이드바 gate** · `useEmploymentStatus` hook · document-writer subTab 조건부 숨김 (`2bc6ef8`)
  - retire_date null (재직) · admin 아님 → 사직서 항목 숨김
  - pending_resignation → 노출 · admin (lv9) → 항상 노출 (fetch 스킵)
  - 로딩/에러 · 안전측 숨김 (admin bypass 유지)
- ✅ 서버 · GET /api/employees/:id 추가 · self-only or lv9 · asyncHandler·HttpError
- ✅ 22 신규 tests (hook 9 + sideNavGroups filter matrix 13)

### #174 · 사이드메뉴 종 아이콘 · 테두리·여백 반으로 (✅ 완료 · 2026-08-20 · `31f5d29`)
- ✅ NotificationBell · compact prop 추가 (하위호환)
- ✅ SideNav compact=true · w-9 h-9 → w-7 h-7 · rounded-md · shadow 제거
- ✅ AppNavHeader 상단은 그대로 유지 (compact 미전달)

### #171 · 랜딩페이지 · 오늘 현황 숫자 클릭 · 상세+이동 (신규 · 2026-08-20)
- 🔲 오늘 현황 · "N건" 숫자 아래 링크 추가 · 클릭 시 상세 현황 노출
- 🔲 상세 현황 아래 · "해당 페이지로 이동" 버튼 추가 · 클릭 시 관련 페이지로 이동
- 🔲 대상 · 발주요청·저재고·진열불일치·재고체크·연차·점심 등 각 현황
- 🔲 UX · 인라인 확장 (accordion) 또는 popover 중 결정
- 🔲 접근성 · Enter/Space 키 지원 · aria-expanded
- 🔲 **모든 직원에게 노출** · admin 만이 아닌 전체 사용자 · "요청 N건" 형식
- 🔲 **승인대기건수 *건** · 별도 항목 · 승인 대기 중인 요청 수 표시
- 🔲 **관리자 전용 · 결제요청 건수** · admin 만 노출 · 결제 대기 건수
- 💡 프레임워크와 무관 · 신규 UX 기능

### #149 · UI 프레임워크화 남은 작업
- 🔲 common/ 재분류 · `common/primitives/` vs `common/features/` (구조 리팩터 · 위험 중)
- 🔲 500+라인 파일 슬림화 · ProductDetailPanel(647) · EmployeeInfoForm(482) · InventoryEditPanel(390) · ContractWriterPage(5,400 · 대형)
- ✅ **Unit test 대량 확산 v5~v7** · **2514 tests · 176 files** (2026-08-20 밤 최신 · 1775→2077→2274→2514 · payroll 5파일 113tests · ocr server routes 대량 확산)
- 🔲 접근성 audit (aria-* · keyboard nav)
- 🔲 목업 HTML 파일 · 최신 트렌드로 재생성 (문서 · 위험 낮음)

### #151 · 프레임워크 프리미티브 확산 (진행중)
- ✅ **IconTile v3** · 11 tone · 5 size · 4 shape · 9 tests · 27+곳
- ✅ **AccentBar** · 5 size + brand-soft + h={n} · 13 tests · 77곳 100%
- ✅ **StepperInput** · 3 size · brand-deep focus · 13 tests · 2곳
- ✅ **NotificationToast** · 5 tone · dark frosted · 7 tests · 2곳
- ✅ **InlineLabel** · 3 size · AccentBar + label · 6 tests · 12곳
- ✅ **Spinner** · 11 tone (2026-08-19 · orange/violet/red 추가) · label + size · 8 tests · **60+곳 통합** (누적) · 2026-08-20 밤 12 파일 22곳 추가 (`933faf8`~`6cbd628`)
- ✅ **Modal migration** · 7 파일 (Break/Hidden/PurchaseHistory/ProductPurchase/Ocr balance/SupplierChange/DeleteSynonym)
- ✅ **BarcodeScanner** · 어제 수정 시작 전 (e1fd6a7 · 2026-08-05) 복원 · UI 재디자인 (Linear/Vercel 톤 · 실시간 진단 오버레이 좌상단 · 로직 완전 유지) · 진단 툴 (URL/mediaDevices/getUserMedia/videoState/UA/에러 실시간 표시)
- ✅ **정식 PWA 설정 (2026-08-19)** · public/manifest.json + apple-mobile-web-app-capable + apple-touch-icon · iOS 웹앱 카메라 활성화 (WebKit Bug 185448 우회)
- ✅ **IosInstallGuide (2026-08-19)** · SFSafariViewController 자동 감지 · 3단계 재설치 위저드 · Safari 자동열기·클립보드 복사 · BarcodeScanner 통합
- ✅ **Card 프리미티브 (2026-08-19)** · variant/padding/rounded/clip/as/onClick · 29 tests · **20곳 확산 🎉 (15+ 파일)** · Stock/Landing/Lunch/ContractSettings/HrForms/Resignation/ProductArrival/OrderManage/Display/ContractWriter/Requests/PharmacistMenu/ReturnList/ScanInfo
- ✅ **TS strict errors fix (11 파일)** · CategoryChips onChange · Phosphor Icon style · ZONE_DEFS import · SortableHeader JSX 등
- 🔲 잔여: Card 확산 (17+ 후보 남음) · 대형 Modal migration · Spinner 확산 (button 내부 조건부 60+개)

### 배포 확인 대기 (2026-08-19 · `77530ac`)
- 🔲 iPhone · 홈화면 아이콘 삭제 → Safari → osanmega.onrender.com → 홈 화면에 추가 → 웹앱 카메라 정상 (iOS 17.4+)
- 🔲 Android · Chrome → osanmega.onrender.com → 앱 설치 → 웹앱 카메라 정상
- 🔲 iOS 버전 18.1.1 이상 확인 (18.0.x 는 회귀 · 업데이트 필수)

---

## 🐛 사용자 리포트 · 확인 대기

- 요청목록 조회 카드 · 4-color dots 지저분 (blue/red/orange/emerald → mono blue or 숫자)
- 로그인화면 · 1주일 전 정보 중 빠진 것 (구체 지목 대기)

---

## 🆕 소형 작업 (이전 세션 큐 · 계속 유효)

<!-- 2026-08-20 밤 · 12개 모두 이미 구현 완료 확인 · 삭제 (완료 원칙)
     · #122 (사번 자동생성), #132/#147 (연차신청 버튼), #133 (로그인/카카오),
       #134 (로고), #139/#140 (Calendar Modal), #141 (폰트+4),
       #143/#144 (계약서 연동/멘트), #145 (거래처 메뉴), #148 (반응형)
-->
- (모두 완료)

---

## 🛡️ Spring Security · defer 확정 (2026-08-16 사용자)

- ✅ S5 Audit · S7 Input Validation · S10 Refresh Token
- ⏸ S1/S2/S6/S8/S9 · defer
- ❌ S3/S4 · 취소

## 🚨 백엔드 보안 · 잔여 (#112)

1. `/api/auth/set-password` 인증 없음 · `authorize(9)` 추가 · **최우선**
2. Vendor 로그인 · bcrypt 전환 · 또는 사용자 정책 재확정
3. requireAuth 재활성화 · 이전 주석 사유 확인 후 안전 복원 (2026-08-16 완료 · 재검증 필요)
4. tsconfig.json exclude · `["dist","node_modules","coverage","uploads","logs"]`
5. Supabase 부팅 크래시 · `throw` → try/catch null fallback
6. 100MB JSON limit · multer multipart 전환

---

## 🔴 사용자 결정 필요

- #89 · DayTimelineModal · settings.positions 자동 파생 (하드코딩 3 그룹 → settings 순회)
- #92 · 회사·브랜드 페이지 · 완전 통합 (5탭 → 1페이지)
- ✅ #95 · 실재고입력 페이지 UI 재설계 완료 (2026-08-18 · 5f182e2) · StockRowCard 카드형 · 필터 KPI 그리드 · 모바일/PC 통일

---

## 🟡 자율진행 가능 (위험 명시)

- #90 · ContractWriterPage · JOB_CATEGORIES → wageRates 파생 · 위험 高
- #91 · SchedulePage · position 문자열 매칭 → settings · 위험 高 · 대형
- ✅ #94 · 공급사 재고확인 페이지 · A1 완료 (2026-08-16) · Phase 2 (백엔드 시계열 API) 유보
- DayTimelineModal 분리 · 2704 lines · 중-高

---

## ⏸ 외부 대기

- #42 · 발주 PDF + 카카오톡 · 사업자등록증 발급 대기 (SolAPI)

---

## 📜 완료 로그 (2026-08-20 밤)

### #151 Spinner 확산 2차 · common/features Phase A · Revert 교훈 (2026-08-20 밤)
- Spinner · 12 파일 22곳 추가 (`933faf8`~`6cbd628`) · MyPage/HiddenManagerModal/RequestsPage/VendorListEditor/SalesTrendPage/ReturnListPanel/PurchaseHistoryTab/PaymentInfoTab/StockActionsCell/LossHistoryTab/PurchaseHistoryList/StaffManagePage
- common/features 신설 · PurchaseHistoryModal 이동 (`9a15774`) · VendorSearchModal 이동 (`933faf8`) · Phase A 완료
- LandingPage dots 색상 통일 revert · `c3d7e9d` 지시 없는 UI → `b2634ee` 즉시 복원 · feedback_only_instructed 원칙 재확인
- Unit test 2514 tests · 176 files 달성 (payroll 113 + ocr routes 130+ 확산)

## 📜 완료 로그 (2026-08-20)

### #176 · common/ 재분류 리서치 완료 (2026-08-20 · 리서치만 · 마이그레이션 대기)
- 총 62 소스 · 51 테스트 (113 파일)
- Primitives 36 (58%) · Features 15 (24%) · Ambiguous 9 · Helpers 2
- 4단계 마이그레이션 계획 (Phase A~D · 저위험 → 고위험)
- Phase A · 0-3 usage feature (InventoryEditPanel · PurchaseHistoryModal · VendorSearchModal 등 9개) · 근-제로 위험
- Phase B · 중위 usage feature (StoreZoneMap · PurchaseHistoryList · ProductDetailPanel 등)
- Phase C · helpers (`hangulSearch.ts` · `settingsTypography.ts` → `src/lib/`)
- Phase D · primitives 이동 · `common/index.ts` barrel 유지 시 import 사이트 무변경
- **결정 대기** · 실제 마이그레이션 착수 여부

### #172 · 모바일 가시성 탭 이관 (2026-08-20 · ✅ · `47104f7`)
- 회사·브랜드 (CompanyInfoSettingsPage) 5탭 → 4탭
- 메뉴 설정 (PermissionsPage) · 권한 조정 탭 · 서브탭 3번째 "모바일 가시성" 추가
- 프레임워크 원칙 준수 · MobileVisibilitySection 컴포넌트 이동 없이 import 만 변경
- TS + build 통과

### #173 · Unit test v5 확산 · 1200 → 2077 (2026-08-20 · ✅ · 다중 커밋)
- constants (7 파일 · 89 tests) · displayZones/storeMapLayout/jobCategories/timing/apiLimits/vendorCategories/index
- hooks (10 파일 · 98 tests) · useSortableTabs/useSidebar/useKvSetting/useMobilePageLevel/useMobileVisibility/useContactInfo/useBrandIdentity/useCompanyInfo/useStampsMap/useVendors/useSettings/useLeaveManager/useAuth/useEmploymentStatus
- lib (4 파일 · 42 tests) · cellReextract/employeeApi/errorReporter/employmentStatus
- server middleware/lib (4 파일 · 53 tests) · envValidation/tenantConfig/requireAuth/ownershipCheck/supabaseFetchAll
- server ocr (3 파일 · 59 tests) · invoice-vocab/excludedSuppliers/schema
- server config (1 파일 · 17 tests) · ocrConfig
- server routes (6 파일 · 145 tests) · systemConfig/clientErrors/lossTracking/supplierPayments/ocrDeletedRows/contractClauses/pharmacistMenuItems
- layout (3 파일 · 42 tests) · sideNavGroups/BottomNav/AppFooter
- common (5 파일 · 82 tests) · VendorInfoHeader/SeasonButtons/PurchaseHistoryList/PurchaseHistoryModal/hangulSearch/settingsTypography
- constants schedules (12 tests) · types (18 tests)
- **114 unpushed 로컬 커밋** · remote push 대기

---

## 📜 완료 로그 (2026-08-19)

### #170 · 정식 PWA 설정 + 웹앱 카메라 활성화 (2026-08-19 · ✅ · `77530ac`)
- public/manifest.json 신규 · display=standalone · icons (logo.png · 512/192/180)
- index.html · apple-mobile-web-app-capable=yes + apple-touch-icon + theme-color
- 근거 · WebKit Bug 185448 (getUserMedia standalone) · iOS 17.4+ 카메라 지원 복원
- 사용자 재설치 1회 필수 · Safari → 홈화면 추가

### #169 · BarcodeScanner 로직 복원 + UI 재디자인 (2026-08-19 · ✅ · `ee79a27`)
- 카메라 개폐 로직 · 어제 수정 전 (e1fd6a7 · Aug 5) 완전 복원
- UI · 2026 Linear/Vercel 톤 · Zinc 뉴트럴 + rounded-3xl + ring-1 + dot indicator
- 진단 오버레이 · 좌상단 · 실시간 URL/mediaDevices/getUserMedia/videoState/UA/에러 표시
- 로직 시그니처 완전 유지 · additive 만 (onError · video 이벤트 관찰용)

### #168 · Unit test 대량 확산 (2026-08-19 · ✅ · 다중 커밋)
- 신규 test files 13개 · 신규 tests 274개 · 총 424 tests · 100% pass
- Panel/PageHeader/CollapseCard/ConfirmDialog/Toolbar/PeriodSelector/MiniCard/LoadingState/TabBar/FieldLabel/ListLoading/Hero/SearchBar/SearchFilterChips/SortableHeader/BottomSheet/FilterBar/PageToolbar/VendorCategoryBadge/ProductClassFilter/SplitPanel
- 회귀 방지 · Tailwind class 잠금 · A11y 속성 · 이벤트 시그니처 검증

### #167 · Spinner 대량 확산 (2026-08-19 · ✅ · 다중 커밋)
- Spinner tone 확장 · orange/violet/red 추가 (11 tone 총)
- 30곳 신규 통합 · 15+ 파일 (GeminiParse/SeasonRanges/ProductSearch/NewVendor/OrderManage/OrderHistory/VendorDetail/PurchaseSubTabs/Supplier/StaffManage/Board/MyPage/VendorStock/Reservation/Pharmacist/RequestsPage/StockArrival)
- 반복 패턴 (Loader2 + span + text-*-600 font-bold) → Spinner label/tone 통일

## 📜 완료 로그 (2026-08-18)

### #131 · 페이지 안보이기 fix + 입고알림 public (2026-08-18 · ✅ 완료 · `013920a`)
- 헤더 hidden 필터 admin 적용 (AppNavHeader.tsx)
  - 이전 버그: `userLevel < 9` 조건 · admin은 hidden 필터 스킵 → 헤더에 여전히 표시 · 클릭 시 flicker
  - fix: admin 포함 hidden 적용 · ADMIN_ESSENTIAL (permissions/business-manage/account) 만 예외
- /api/stock-arrivals · public 이동 (server.ts)
  - 이전 버그: requireAuth 뒤 마운트 → 로그인 화면 401 → 빈 배열
  - fix: public 섹션 이동 · GET 안전 · POST 내부 level ≥ 3 자체 검증

### #167 · JWT 자동 파생 + 무한 리로드 fix v2 (2026-08-18 · ✅ 완료)
- JWT_SECRET · SUPABASE_KEY HMAC-SHA256 자동 파생 · Render Dashboard 설정 불필요
- CRITICAL v1 · handleLogout · fetch POST /api/auth/logout · 서버 쿠키 clear (36bd2ad)
- CRITICAL v2 · SESSION_EXPIRED 리스너 guard 2개 · 미로그인 no-op + 1초 debounce · 무한 리로드 loop 완전 차단 (03e85a8)
- envValidation.ts · JWT_SECRET · required → recommended
- shadow-3xs (미정의 클래스) → shadow-sm · 5곳 fix
- 보안 영향 0 (UI redirect 만 제어 · 서버 인증 flow 완전 그대로)

### #166 · 승인 요청 실시간 배지 갱신 (2026-08-18 · ✅ 완료)
- 신규 `src/lib/approvalEvents.ts` · CustomEvent + window focus
- Dispatch 12곳 · Listener 3곳 (Landing · NotificationBell · RequestsPage)
- 연차/점심/진열/발주/반품/불일치 · 제출/승인/취소/삭제

### #160·#164 · 프레임워크 v3~v5 완성 (2026-08-17 밤 ~ 2026-08-18 · 커밋 370+)
- **Nav 세련 v3~v5**: Aurora glow · SVG noise · gradient stripe · 그룹 accent color · underline reveal · 3-layer inset shadow
- **Framework CSS v2**: 30+ 컴포넌트 (Modal/Button/Input/KpiCard/Toast/Scrollbar 등) · CSS 유틸 (.backdrop-brand · .shadow-brand-modal)
- **StatusPill 확산**: 12+ 배치 · 30+ 파일
- **Legacy StatusBadge 삭제** · common/README.md 신규 (527 lines)

### 리모트 push (총 6회 · 사용자 승인만)
- `71880c5` (프레임워크 P0) · `58846d9` (JWT envVar) · `f90c16f` (JWT auto-derive) · `ea58e89` (approval events) · `03e85a8` (SESSION_EXPIRED v2) · `013920a` (#131 헤더 + 입고알림 public)
- 2026-08-18 최종 · "이후 리모트 푸시 금지" · 재승인 대기

---

## 세션 관리

- **프레임워크 원칙**: `src/components/common/README.md` (v5 확장 · 527 lines)
- **원칙 규칙**: `docs/AGENT_PRINCIPLES.md`
- **임금 계산**: `docs/PAYROLL_ALGORITHM.md`
- **contract-master**: `.claude/agents/contract-master.md`
- **메모리**: `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`
