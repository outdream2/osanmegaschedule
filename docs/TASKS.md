# TASKS

> 2026-08-19 · Unit test 대량 확산 (150→424) · Spinner 30곳 · 정식 PWA 설정 · BarcodeScanner 로직 복원 + UI 재디자인
>
> **원칙**: [`feedback_framework_untouchable.md`](../.claude/agents) · [`feedback_ui_top_principle.md`](../.claude/agents) · [`feedback_remote_push_strict.md`](../.claude/agents) · 폰트 +2 규칙
>
> **원칙 규칙**: 완료 태스크는 삭제 · 신규 태스크는 상단 등록 · 진행중은 명확히 표시

---

## 🔥 활성 (진행중 / 대기)

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
- ✅ **Unit test 대량 확산 v4** · **1247 tests · 95 files** (2026-08-19~20 세션 · 1097 신규 · 86 test files 신규 · **1200 돌파 🎉** · 모든 Zod schemas 테스트 완료)
- 🔲 접근성 audit (aria-* · keyboard nav)
- 🔲 목업 HTML 파일 · 최신 트렌드로 재생성 (문서 · 위험 낮음)

### #151 · 프레임워크 프리미티브 확산 (진행중)
- ✅ **IconTile v3** · 11 tone · 5 size · 4 shape · 9 tests · 27+곳
- ✅ **AccentBar** · 5 size + brand-soft + h={n} · 13 tests · 77곳 100%
- ✅ **StepperInput** · 3 size · brand-deep focus · 13 tests · 2곳
- ✅ **NotificationToast** · 5 tone · dark frosted · 7 tests · 2곳
- ✅ **InlineLabel** · 3 size · AccentBar + label · 6 tests · 12곳
- ✅ **Spinner** · 11 tone (2026-08-19 · orange/violet/red 추가) · label + size · 8 tests · **60+곳 통합** (누적)
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

- #132 · 연차신청 버튼 · 테두리·여백 반으로 (LeavePage.tsx)
- #133 · 랜딩페이지 로그인 카드/모달 정리 · 카카오 채널 카드
- #134 · 헤더 로고 (Pharmacy cross SVG) 개선 검토
- #139 · EmployeeCalendarModal · 팝업 → 순환
- #140 · EmployeeCalendarModal · 반응형 한 화면
- #141 · 직원 상세 · 이름 아래 폰트 +4
- #143 · 직원정보 ↔ 근로계약서 연동 확인
- #144 · 근로계약서 없을 시 · "작성전입니다" 멘트
- #145 · 랜딩 · 거래처용 메뉴 오류 · 부분 완료
- #147 · 연차신청 버튼 · 위아래 여백 살짝 · 옆카드 높이 맞춤
- #148 · 페이지 권한요청 · 반응형 UI 개선
- #122 · 사번 자동 생성 (신규 등록)

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
- #94 · 공급사 재고확인 페이지 · A1 (Modal 확장) · 중 (1-2h)
- DayTimelineModal 분리 · 2704 lines · 중-高

---

## ⏸ 외부 대기

- #42 · 발주 PDF + 카카오톡 · 사업자등록증 발급 대기 (SolAPI)

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
