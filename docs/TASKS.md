# TASKS

> 2026-08-17 밤 · UI 프레임워크화 확산 (P0 배치) + Nav 세련 (aurora glow · 타이포 · avatar) · 사용자 병렬 테스트
> **원칙**: `feedback_framework_untouchable.md` (프레임워크 절대 유지) · `feedback_ui_latest_trend_framework.md` (최신 트렌드 · 파스텔 지양) · `feedback_font_plus2_default.md` (폰트 +2)

---

## 🔥 진행중 (2026-08-17 밤 세션)

### #160 · P0 · 파스텔 잔재 → StatusPill 프레임워크 확산 (2026-08-17 밤)
- **정량 (초기)**: 121곳 pastel (30 파일) · 실제 StatusPill 후보는 ~25-30개
- **완료 배치 (12건)**:
  - ✅ HrFormsPage · CATEGORIES tone (609abb0)
  - ✅ TrendingTab · PeriodBucketCard 헤더 (78ef118)
  - ✅ Batch 1-8 · StockCheck·DisplayPage(2)·Permissions·StaffManage·Pharmacist·ProductArrival·DisplayRequestPanel·RequestsPage·StockReconciliation·ProductDetailPanel·LeavePage·ScanPage·ReturnListPanel·EmployeeFormModal (e628c13~77066c0)
  - ✅ DayTimelineModal · 확정됨 (b694a15)
  - ✅ StoreZoneMap · 대기 pending (363b8a7)
  - ✅ LandingPage · 초/중/하순 자동판정 (0a07452)
  - ✅ RequestsPage · 점심 식사/불참 (375980e)
  - ✅ **legacy StatusBadge 삭제 + common/README.md 문서화** (356aa1d)
- **잔여 · 다음 세션**: ContractWriterPage(5,400 lines · 분리 필요) · common/EmployeeInfoForm · 각 페이지 status matrix (부적합 판정)

### #161 · Nav 세련 · 2026 최신 트렌드 (2026-08-17 밤 · ✅ 완료)
- AppNavHeader · aurora radial glow (sky+mint) · 3-layer shadow · 3-stop gradient · top hairline (2eec7e4)
- 로고 · ring-2 + brand glow · hover 강화 · OSAN MEGATOWN 타이포 (tracking) · vertical divider
- 사용자 name chip · ring + glow hover
- inactive 탭 · hover translate-y (-1px) · 200ms ease-out (dbe9565)
- SideNav · aurora glow (상단 · sky) · 상하 hairline gradient · 그룹 헤더/아이템 · frosted + inset + translate-x hover
- SidebarFooter · avatar circle (원본) → 성씨 initial 제거 (사용자 요청 · 03bee1c)
- 종/알림 · PC · 여백 반 (px-2 py-1 → px-1 py-0.5 · 사용자 요청)
- 모바일 탭 · frosted glass + inset light + backdrop-blur (928bb7f)
- Hero · aurora + 3-layer shadow + top hairline (4d9c263)

### #149 · 전체 UI · 최신 트렌드 (파스텔 → mono/accent) · 프레임워크화 (진행중)
- **리서치 완료** · research-strategist · Option A (mono-neutral + brand accent) 채택
- **완료 부분**:
  - ✅ 브랜드 팔레트 · teal → deep navy blue (index.css @theme)
  - ✅ 사이드바 · deep navy 톤 · DARK_COLOR_TONES 신규
  - ✅ Hero · deep navy gradient + aurora v2 (2026-08-17 밤 · 4d9c263)
  - ✅ 곧오픈 배너 · yellow → deep navy gradient
  - ✅ MenuCard · rounded-16 · 44 icon · +2 폰트 · 랜딩 완료
  - ✅ KpiCard 목업 톤 (rounded-16 · 26px value) · Vercel Dashboard 뉴트럴 톤
  - ✅ 공용 Button 컴포넌트 (4 variant · 3 size · +2 폰트)
  - ✅ 로그인 모달 hero gradient · submit 버튼 Button 적용
  - ✅ StatusPill 10 tone (pine 포함) · CategoryChips · CollapseCard · BottomSheet · TabBar 3계층
  - ✅ P0 잔재 정리 · 8배치 (#160 참조)
  - ✅ Nav 세련 · aurora glow · 타이포 (#161)
- **남은 작업**:
  - 🔲 legacy StatusBadge deprecate + StatusPill 마이그레이션
  - 🔲 common/README.md · usage 예시 · tone/size 문서
  - 🔲 common/ 재분류 · framework/features
  - 🔲 500+라인 파일 슬림화 (ProductDetailPanel · EmployeeInfoForm · InventoryEditPanel)
  - 🔲 목업 HTML 파일 · 최신 트렌드로 재생성 (PC + Mobile)

### #150 · 반응형 헤더 · 사이드바 톤 통일 · ✅ 완료 (295b8d1)
- AppNavHeader · deep navy · logo2.png rounded · 이름/로그아웃 흰 텍스트

### #155 · EmployeeCalendarModal 좌우 분할 · ✅ 완료 (2026-08-17)
- 사용자 지시: "스케쥴표 이름 클릭 모달 · 좌우 나눠 · 좌=직원정보 항상 · 우=탭 (달력/일괄/구역) · 최신 트렌드 · 반응형 stack"
- 좌 · aside 300px · EmployeeProfileCard 항상 노출
- 우 · segmented tab bar (딥네이비 accent) + 기존 calendar/bulk/zone 콘텐츠
- 반응형 · max-md 스택
- info 탭 제거 (좌측 항상 노출로 대체)
- 모달 · max-w-5xl · 딥네이비 헤더

### #156 · 스케줄표 세로 스크롤 · ✅ 완료 (2026-08-17)
- 사용자 지시: "반응형 10명 이상 세로 스크롤 · PC 15명 이상 세로 스크롤"
- SchedulePage.tsx 스크롤 wrapper · employees.length 조건별 max-h + overflow-y

### #157 · 공통헤더 Row 2 탭 · 딥네이비 톤 · ✅ 완료 (890713a)
- Row 2 · Linear/Vercel 세련 톤 · bg-white/[0.14] active pill · white/60 hover

### #158 · 계정 비밀번호 변경 · ✅ 확인 (2026-08-17)
- 검증: MyPage · api.post `/api/auth/change-password` · Zod schema · bcrypt compare/hash · audit
- 클라이언트 사전검증 · 서버 로직 · 이상 없음

### #131 · 페이지 안보이기 (uncheck) 재발 · 🐛 심층 진단 필요
- 사용자 재보고 · 이전 fix 후에도 미해결
- 확인 필요: PermissionsPage 저장 · usePagePermissions 캐시 · filterGroupsForSession 복합키 · App.tsx isHiddenPage useEffect
- **다음 세션 최우선**

### 세션 만료 프로세스 강화 · ✅ 완료 (046a116)
- main.tsx · refresh 실패 시 SESSION_EXPIRED_EVENT dispatch
- App.tsx · window.addEventListener → handleLogout · 로그인화면 강제 이동

---

## 🧩 UI 프레임워크 후속 (research 반영)

### #151 · IconTile 공용 컴포넌트 · 파스텔 46곳 치환
- `common/IconTile.tsx` 신규 · variant (neutral/brand/success/warning/danger) · size prop
- 46곳 grep 대상 · `bg-{color}-100 text-{color}-700` 패턴
- CSS 변수 확장 · index.css @theme · tint-neutral / tint-success / tint-warning / tint-danger
- 위험도: 낮음 (프레임워크 신규 · 시각만 변경)

### #152 · 전체 앱 버튼 → 공용 Button 이관
- 페이지별 순차 (LandingPage 로그인 모달 ✅ 부분 완료)
- 각 페이지 · 하드코딩 `<button className="bg-indigo-600...">` → `<Button variant="primary">`
- 위험도: 중 (사용처 많음 · 시각 회귀 리스크)

### #153 · 폰트 weight 정리 · 3단계 통일
- font-bold/black/extrabold 남발 → font-semibold (600) 기본
- Hero H1 만 font-extrabold (800)
- 위험도: 낮음 (Grep 치환)

### #154 · 목업 HTML 재생성 · 최신 트렌드
- docs/UI_MOCKUP_PC_2026-08-17.html + MOBILE
- Option A (mono-neutral + brand accent) 반영
- 위험도: 낮음 (문서만)

---

## 🐛 사용자 리포트 · 확인 대기

### 요청목록 조회 카드 · 4-color dots 지저분
- badge · blue/red/orange/emerald 4개 dot → mono blue 배지 or 단순 숫자

### 로그인화면 · 1주일 전 정보 중 빠진 것 (구체 지목 대기)
- 사용자 재확인 필요 · 어떤 정보인지 대기

---

## 🆕 신규 태스크 (이전 세션 큐 · 계속 유효)

### #132 · 연차신청 버튼 · 테두리·여백 반으로
- 파일: `src/components/LeavePage/LeavePage.tsx`

### #133 · 랜딩페이지 UI 개선 Phase 5 · 부분 완료
- ✅ #130 4 Phase + 오늘의 현황 한줄 + Hero + KPI strip · 완료
- 잔여: 로그인 카드/모달 정리 · 카카오 채널 카드

### #134 · 랜딩페이지 아이콘 리디자인 · 부분 완료
- ✅ MenuCard 아이콘 44 rounded-12 · 완료
- 잔여: 헤더 로고 (Pharmacy cross SVG) 개선 검토

### #135 · 랜딩페이지 전격 개선 · ✅ 대부분 완료
- Hero + KPI 한줄 + 파스텔 지양 · 딥네이비 통일

### #137 · MenuCard 배경색 · 결정
- ~~옵션 A/B~~ · research Option A 채택 · mono-neutral tint 사용 예정

### #138 · 랜딩 버튼 글씨 +2 · ✅ 완료
### #139 · EmployeeCalendarModal · 팝업 → 순환
### #140 · EmployeeCalendarModal · 반응형 한 화면
### #141 · 직원 상세 · 이름 아래 폰트 +4
### #142 · EmployeeCalendarModal · 세로 스크롤 확인
### #143 · 직원정보 ↔ 근로계약서 연동 확인
### #144 · 근로계약서 없을 시 · "작성전입니다" 멘트
### #145 · 랜딩 · 거래처용 메뉴 오류 · 부분 완료
### #146 · UI 프레임워크 · 버튼 세련화 · ✅ 완료 (공용 Button)
### #147 · 연차신청 버튼 · 위아래 여백 살짝 · 옆카드 높이 맞춤
### #148 · 페이지 권한요청 · 반응형 UI 개선
### #136 · UI 프레임워크화 검토 · ✅ 진행중 (Button/Hero/KpiCard/SectionLabel/MiniCard/MenuCard)
### #122 · 사번 자동 생성 (신규 등록)

---

## 🛡️ Spring Security · defer 확정 (사용자 2026-08-16 · "이 정도면 충분")

- ✅ S5 Audit Logging (00b725c)
- ✅ S7 Input Validation (52ee393)
- ✅ S10 Refresh Token (f434e1d)
- ⏸ S1/S2/S6/S8/S9 · defer
- ❌ S3/S4 · 취소 (사용자 지시)

## 🚨 백엔드 보안 · 잔여 (#112)

- **1. `/api/auth/set-password` 인증 없음** · `authorize(9)` 추가 · **최우선**
- **2. Vendor 로그인 · bcrypt 전환** · 또는 사용자 정책 재확정
- **3. requireAuth 재활성화** · 이전 주석 사유 확인 후 안전 복원
- **4. tsconfig.json exclude 누락** · `["dist", "node_modules", "coverage", "uploads", "logs"]`
- **5. Supabase 부팅 크래시** · `throw` → try/catch null fallback
- **6. 100MB JSON limit** · multer multipart 전환 (별도 리팩터)

---

## 🟠 진행중 (세션 유실 시 이어서)

### #111 · 페이지 설정 · subTab 단위 개별 권한 · 대부분 완료 · #131 재발과 연관
- ✅ SIDE_NAV_GROUPS 기반 · 그룹 접기/펼치기 · 트리 · 체크박스
- 🔲 #131 · 실제 uncheck → hide 반영 안 됨 · 심층 진단

---

## 🔴 사용자 결정 필요

### #89 · DayTimelineModal · settings.positions 자동 파생 (B)
- ✅ 알바 흡수 완료 · ✅ 약사 색 violet/sky 결정
- 대기: 하드코딩 3 그룹 → settings 순회 리팩터

### #92 · 회사·브랜드 페이지 · 완전 통합
- 5탭 → 1페이지 · 사용자 결정 완료 · 구현 대기

### #95 · 실재고입력 페이지 UI 재설계 · defer
- 사유 · 2-3h UX 재디자인 · 세션 여유 시

---

## 🟡 자율진행 가능 (규모/위험 명시)

### #90 · ContractWriterPage · JOB_CATEGORIES → wageRates 파생 · 위험 高
### #91 · SchedulePage · position 문자열 매칭 → settings · 위험 高 · 대형
### #94 · 공급사 재고확인 페이지 · A1 (Modal 확장) · 중 (1-2h)
### DayTimelineModal 분리 · 2704 라인 · 중-高

---

## ⏸ 외부 대기

### #42 · 발주 · PDF + 카카오톡 · 사업자등록증 발급 대기 (SolAPI 세팅)

---

## 🟢 완료 (참고)

### #73 · Dead code 정리 · 부분 완료
### #102 · 페이지 권한 · 표 형식 · 완료 (2026-08-12)
### #99 · 페이지별 최소 권한 · 트리 · 완료
### #101 · 직군 삭제/수정 · employees 보호 · 완료
### #96 · 랜딩 거래처 카드 · A1 완료

---

## 📜 완료 로그

### 2026-08-17 밤 세션 · P0 프레임워크 확산 + Nav/Framework CSS 세련 v2 (커밋 30+)
- **P0 · StatusPill 확산 · 12배치** · 15+ 파일 · 20+ 위치
- **legacy 정리** · common/StatusBadge.tsx 삭제 · tokens.ts 주석 갱신
- **문서화** · src/components/common/README.md 신규 · 프레임워크 usage · 원칙 10개
- **Nav 세련 v2** · AppNavHeader/SideNav · aurora glow + 3-layer shadow + 3-stop gradient + 로고 ring + tracking + name chip + translate-y hover + 모바일 frosted
- **MyPage v2** · 성씨 initial 제거 · User 아이콘 + gradient (사용자 요청)
- **Framework CSS 세련 v2** (전 앱 자동 반영):
  - Modal · frosted backdrop (딥네이비 tint + blur 6px) + 3-layer shadow
  - ConfirmDialog · Modal 통일
  - Toast (toastClass) · 폰트 +2 + 2-layer shadow + brand-deep tone
  - Button · inset light + 2-layer glow shadow + 200ms all transition
  - KpiCard · inset light + 2-layer shadow + hover lift
  - Input field · 브랜드 focus + 폰트 +2 + brand-tint ring
  - FilterBar · inset light + subtle shadow
- **Hero v2** · aurora + 3-layer shadow + top hairline
- **UI 원칙 준수** · handler/state/API 절대 손대지 않음 · className/style/CSS만

### 2026-08-17 저녁 세션 · UI 대전환 (커밋 10+ 이후 추가)
- **UI 톤** · teal/파스텔 → deep navy blue 전환 (전체)
- **컴포넌트 신설** · Hero · KpiCard · SectionLabel · MiniCard · MenuCard · Button · IconButton · Panel
- **사이드바** · deep navy + DARK_COLOR_TONES · logo2.png
- **모바일 헤더** · 딥네이비 톤 통일
- **곧오픈 배너** · 노랑 → 딥네이비 gradient
- **로그인 모달** · 인디고 → 딥네이비 gradient + Button 적용
- **오늘의 현황** · 4 KPI 카드 → 한 줄 텍스트
- **세션 만료** · SESSION_EXPIRED_EVENT · App 자동 로그아웃
- **폰트** · 랜딩 전체 +2 · Button +2
- **원칙 저장** · framework_untouchable · ui_latest_trend_framework
- **리서치** · research-strategist · 2026 SaaS 트렌드 · Option A (mono+accent) 채택
- 목업 HTML · 브랜드 tokens blue 전환 (완전 재작성은 #154 대기)

### 2026-08-17 세션 (대규모 프레임워크 · 커밋 55+)
- **프레임워크 완성** · asyncHandler 100% (37/37) · apiClient 100% · shared 10 schema + 8 dto
- **테스트** · 103 tests · 11 files · vitest
- **문서** · FRAMEWORK.md v1.7 (1048+ 라인)
- **분리** · LandingPage StockSearch (-161)

### 2026-08-16 세션 (5건)
- ScheduleFilterBar dead prop · StockManagePage 3파일 · SplitPanel 80% · TASKS 갱신 · lib/contract

### 2026-08-14 사용자 액션
- SQL migration 2건 실행

### 2026-08-13 색상 프레임워크
- Phase A · slate → zinc (138 파일) · Phase 1 버튼 2025 트렌드

### 2026-08-12 (이전 세션)
- Leave 분리 · Critical/High 안정화 · 사이드바 V2 · SystemSettingsPage · 회사·브랜드 통합

---

## ❌ 취소

- **C** · StaffManagePage 오른쪽 상세 · EmployeeProfileCard 통합
- **E Phase 2** · SplitPanel 미도입 페이지 이관
- **에이전트 리서치 추가 카테고리 8개**

---

## 세션 관리

- **원칙**: `docs/AGENT_PRINCIPLES.md`
- **임금**: `docs/PAYROLL_ALGORITHM.md`
- **contract-master**: `.claude/agents/contract-master.md`
- **메모리**: `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`
