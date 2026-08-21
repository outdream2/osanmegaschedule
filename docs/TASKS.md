# TASKS

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

## 🔥 활성 (진행중 / 대기)

### #180 · 발주이력 페이지 · 공급사·상품 검색 기능 (신규 · 2026-08-21)
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

### #179 · 바코드 스캔 · 미등록 상품 즉시 등록 UX (신규 · 2026-08-21)
- 🔲 BarcodeScanner · 스캔 결과 · products 테이블에 없으면 · **"상품 추가" 자동 유도**
- 🔲 미등록 감지 시 · 상품 등록 모달 (#177 페이지의 모달 버전) 오픈
- 🔲 모달 · `product_code` 필드 · 스캔된 바코드로 **자동 채움** · readonly 표시
- 🔲 저장 성공 시 · 스캔 흐름 계속 (예: 실재고 입력·발주 등 원래 flow)
- 🔲 취소 시 · 스캔 화면 복귀
- 🔲 #177 상품 등록 페이지 · 모달 형태로도 재사용 가능한 구조 필요 (프레임워크화)
- 💡 스펙 결정 필요:
  - 모달 재사용 · 페이지 컴포넌트 안에 `Modal` wrapper 감쌈 or 페이지·모달 각각 별도 컴포넌트?
  - 자동 감지 조건 · products.product_code 정확 일치 시만 or fuzzy?
  - 스캐너 사용처 · ScanPage·ProductArrivalPage·재고체크 등 · 어디서 자동 유도?
- 💡 **의존** · #177 (상품 등록 페이지) 선행 완료 필요

### #178 · 공급사 정보 스키마 확장 · xlsx 원본 반영 (신규 · 2026-08-20)
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

### #177 · 상품 등록 페이지 · 매장 > 매입 메뉴 (신규 · 2026-08-20)
- 🔲 신규 페이지 · 매장 > 매입 서브탭에 추가 · **상품 등록 UI**
- 🔲 기능 · `products` 테이블에 신규 row INSERT (기존 컬럼 재사용 · 파생컬럼 X)
- 🔲 서버 · POST `/api/products` 또는 `/api/products/register` · asyncHandler + HttpError + Zod
- 🔲 Zod 스키마 · `src/shared/schemas/products.ts` 확장 or 신규 CreateProductSchema
- 🔲 프론트 · apiClient · useToast · 프레임워크 원칙 준수
- 🔲 UI · 사이드바 · `{ key: "display", label: "상품등록", subTab: "product-register", minLevel: ?, managerOnly? }` (leve 확정 필요)
- 🔲 DisplayPage · dpSubTab "product-register" 케이스 추가 · 새 페이지 컴포넌트 렌더
- 💡 스펙 확정 필요:
  - 필드 세트 (product_code · product_name · supplier · category · unit · barcode · ...)
  - 최소권한 (관리자 lv9 or manager lv2?)
  - 배치 위치 · 매입 > 상품등록 서브탭 or 매입 서브탭 내부 하위 탭?
  - 중복 검사 (product_code unique)
  - 스캔 연동 (바코드 스캐너 자동 채움?)

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
