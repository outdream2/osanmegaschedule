# TASKS

> 2026-08-18 · UI 프레임워크 v5 완성 · 실시간 배지 · JWT 자동 파생 · 무한 리로드 fix
>
> **원칙**: [`feedback_framework_untouchable.md`](../.claude/agents) · [`feedback_ui_top_principle.md`](../.claude/agents) · [`feedback_remote_push_strict.md`](../.claude/agents) · 폰트 +2 규칙
>
> **원칙 규칙**: 완료 태스크는 삭제 · 신규 태스크는 상단 등록 · 진행중은 명확히 표시

---

## 🔥 활성 (진행중 / 대기)

### #131 · 페이지 안보이기 (uncheck) 재발 · 🐛 심층 진단 대기
- 사용자 재보고 · 이전 fix 후에도 미해결
- 확인 필요: PermissionsPage 저장 · usePagePermissions 캐시 · filterGroupsForSession 복합키 · App.tsx isHiddenPage useEffect
- **다음 세션 최우선**

### #149 · UI 프레임워크화 남은 작업
- 🔲 common/ 재분류 · `common/primitives/` vs `common/features/` (구조 리팩터 · 위험 중)
- 🔲 500+라인 파일 슬림화 · ProductDetailPanel(647) · EmployeeInfoForm(482) · InventoryEditPanel(390) · ContractWriterPage(5,400 · 대형)
- 🔲 unit test 도입 (Vitest 세팅됨 · StatusPill · Button · Modal 우선)
- 🔲 접근성 audit (aria-* · keyboard nav)
- 🔲 목업 HTML 파일 · 최신 트렌드로 재생성 (문서 · 위험 낮음)

### #151 · IconTile 공용 컴포넌트 신규 (선택)
- 파스텔 46곳 icon container (w-7 h-7 bg-{c}-100) → common/IconTile · variant/size prop
- 위험도: 낮음 (신규 프레임워크)

### #131 관련 · #111 페이지 권한 시스템
- ✅ SIDE_NAV_GROUPS 기반 · 그룹 접기/펼치기 · 트리 · 체크박스
- 🔲 실제 uncheck → hide 반영 안 됨 · #131 심층 진단과 연관

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
3. requireAuth 재활성화 · 이전 주석 사유 확인 후 안전 복원
4. tsconfig.json exclude · `["dist","node_modules","coverage","uploads","logs"]`
5. Supabase 부팅 크래시 · `throw` → try/catch null fallback
6. 100MB JSON limit · multer multipart 전환

---

## 🔴 사용자 결정 필요

- #89 · DayTimelineModal · settings.positions 자동 파생 (하드코딩 3 그룹 → settings 순회)
- #92 · 회사·브랜드 페이지 · 완전 통합 (5탭 → 1페이지)
- #95 · 실재고입력 페이지 UI 재설계 · defer (2-3h)

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

## 📜 완료 로그 (최근 세션 · 2026-08-18)

### v5 프레임워크 최종 완성 (2026-08-17 밤 ~ 2026-08-18 · 커밋 370+ · push 4회)

**Nav 세련 v3~v5:**
- Aurora radial glow (sky+mint+indigo) · SVG noise texture · Vercel/Linear 시그니처
- Stripe · 4px + solid + double glow (12+24) · gradient bar 하단
- 아이콘 · 활성/비활성 모두 그룹 accent color 유지 (사용자 요청 · v5)
- Hover · underline reveal · translate-y/x · 200ms ease-out
- 로고 · ring-2 + brand glow · OSAN MEGATOWN tracking
- 성씨 initial 제거 · 종/알림 패딩 반
- 3-layer inset shadow (모든 활성 UI)

**Framework CSS 세련 v2** (30+ 컴포넌트 자동 반영):
- CSS 유틸: `.backdrop-brand` · `.backdrop-brand-strong` · `.shadow-brand-modal` (신규)
- Modal · ConfirmDialog · Toast · Button · KpiCard · Input · Card · Panel · Popover · IconButton · MiniCard · CollapseCard · Scrollbar · PageToolbar · PeriodSelector · CategoryChips · SearchBar · EmptyState · LoadingState · ListLoading · FieldLabel · Toolbar · FilterBar · FilterSortBar · SearchFilterChips · SeasonButtons · SettingsPageShell · ProductClassFilter · SplitPanel · BreakModal · PurchaseHistoryModal · EmployeeProfileCard · NewVendorModal · VendorInfoModal · VendorSearchModal · ErrorBoundary · Hero
- 30+ 인라인 모달 · frosted backdrop + shadow-brand-modal 통일

**StatusPill 확산** (12+ 배치):
- HrForms · TrendingTab · StockCheck · DisplayPage · Permissions · StaffManage · Pharmacist · ProductArrival · DisplayRequestPanel · RequestsPage · StockReconciliation · ProductDetailPanel · LeavePage · ScanPage · ReturnListPanel · EmployeeFormModal · DayTimelineModal · StoreZoneMap · LandingPage · ...
- Legacy StatusBadge 삭제 · common/README.md 신규
- Pine Green (Hermès #01796F) tone 추가

**실시간 배지 시스템** (#166):
- 신규 `src/lib/approvalEvents.ts` · CustomEvent + window focus
- Dispatch 12곳 · Listener 3곳 (Landing · NotificationBell · RequestsPage)
- 연차/점심/진열/발주/반품/불일치 · 제출/승인/취소/삭제

**JWT + 배포 안정성** (#167):
- JWT_SECRET · SUPABASE_KEY HMAC-SHA256 자동 파생 · Render Dashboard 설정 불필요
- CRITICAL fix · handleLogout · fetch POST /api/auth/logout · 무한 리로드 루프 방지
- envValidation.ts · JWT_SECRET · required → recommended
- shadow-3xs (미정의 클래스) → shadow-sm · 5곳 fix

**리모트 push:**
- 4회 push (사용자 승인만) · `71880c5` · `58846d9` · `f90c16f` · `36bd2ad..ea58e89`
- 2026-08-18 후반 · "이제 리모트푸시 금지" · 재승인 대기 (feedback_remote_push_strict.md 갱신)

---

## 세션 관리

- **프레임워크 원칙**: `src/components/common/README.md` (v5 확장)
- **원칙 규칙**: `docs/AGENT_PRINCIPLES.md`
- **임금 계산**: `docs/PAYROLL_ALGORITHM.md`
- **contract-master**: `.claude/agents/contract-master.md`
- **메모리**: `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`
