# TASKS

**세션 시작 · 2026-09-25** · 태스크 관리 재편성 · 3 카테고리

**규칙**
- 완료 태스크 · 이 파일에서 **삭제** (아카이브 X · 이전 이력은 `TASKS_ARCHIVE_2026-09-25.md` 참조)
- 신규 태스크 즉시 추가 · 카테고리 별 번호 시퀀스
- 세션 시작 시 반드시 read
- 매 milestone 후 update
- **회귀 절대 금지** · TS + build + test 통과 후 커밋
- **리모트 푸시 · 사용자 명시 승인 시에만** (기본 로컬 커밋)
- **DB · 파생컬럼 사용 금지** · 원래 테이블 활용 최우선
- **DB 정합성 절대 유지** · 파괴적 SQL X · 스냅샷 파생 X · SSOT

**태스크 번호 규칙 (2026-09-25 재편)**
- **신규 태스크** · `#N` · 시퀀스 시작 · #1
- **UI 태스크** · `UI-N` · 시퀀스 시작 · UI-1
- **에러 태스크** · `E-N` · 시퀀스 시작 · E-1

**관련 파일**
- 테스트 절차 · `TEST_LIST_2026-09-11_session.md`
- 프레임워크 원칙 · `CODING_PRINCIPLES.md`
- 프레임워크 감사 · `FRAMEWORK_AUDIT.md`
- 이전 태스크 아카이브 · `TASKS_ARCHIVE_2026-09-25.md`

---

## 🔴 대원칙 (확정 · 매 태스크 준수)

- **재고자산 = 매입액 − 판매원가** (cogs)
- **실제잔고 = 매입액 − 결제액**
- **판매액 = 판매수량 × 판매단가**
- **공급사 이름 · vendors 유효성 검증 필수** (자유 입력 금지)
- **공통 기능 = 단일 endpoint** · 신규 전 grep 필수
- **DB 정합성 절대 유지** · 파괴적 SQL X · SSOT
- **유통기한 · 3소스 통합** · SSOT=inventory_checks.expiry_date
- **문자열에 날짜 저장 금지** · 정식 DATE 컬럼 사용
- **말줄임표 금지** · 폭 확장 or 줄바꿈
- **반응형 · md: 이하 카드 전환** 대원칙
- **첫 탭 default** · 페이지 진입 시 첫 탭 자동 활성 · localStorage 복원 X
- **UI 기준 교체 (2026-10-09)** · 홈 랜딩페이지 = SSOT · `src/components/LandingPage/HomeDashboard.tsx` + `LandingPage.tsx` 톤 참조 · CARD(`rounded-[12px]` + thin shadow + `border-slate-200`) · 2-tier typography (body 15/16 · label 13/14) · 좌측 accent 레일 제거 · 아이콘 inline · 과거 `docs/UI_MOCKUP_2026-08-21.html` **참조 중단**
- **한글 IME 우선** · KO_INPUT_PROPS (`src/lib/koreanInput.ts`)
- **폰트 +2 default** · 40대+ 가독성

---

## 🆕 신규 태스크 (기능 추가)

**세션 추가 · 2026-10-09 · 사용자 지시 "나머지 태스크 일단 제거"**

| # | 태스크 | 상세 | 상태 |
|---|-----|-----|-----|
| **#1** | **월별 매출 · 예상 매출 금액 표시 추가** · 사용자 지시 2026-10-09 | 공식 = (현재까지 일별 평균 매출) × (남은 일수) + 현재까지 매출 = 평균 × 총일수 · RevenuePage 선택월 상세 items 배열 조건부 삽입 (isCurMonth 일 때만 · cyan 톤) · tooltip 공식 노출 | ✅ 완료 (`9bd9b849`) |
| **#2** | **승인업무 페이지 레이아웃 홈 랜딩 톤 재구성 + 카드 2~3개 그리드** · 사용자 지시 2026-10-09 | `LeavePage.tsx` showApproval 섹션 · 홈 랜딩 톤 `<section>` CARD(rounded-[12px]+border-slate-200+thin shadow) · 2-tier typography (body 15/16, label 13/14) · 좌측 레일 제거 · 3px thin label accent · PendingLeaveCard 폰트/padding 축소 (text-[22]→[15], py-4→p-3.5) · PendingPCTable 폐기 → 그리드 통일 · xl=3col/md=2col/mobile=1col · 전체이력 섹션도 동일 톤 · BEHAVIOR DELTA = 0 | ✅ 완료 (local) |
| **#3** | **ERP 매입/판매 API 핸드오프 지침서** · 사용자 지시 2026-10-09 "다른 PC 다른 CLI에게 구현 지시" | `docs/HANDOFF_ERP_PURCHASE_SALES_API_2026-10-09.md` 생성 · 12 섹션 · 전역 원칙 15개(G-1~G-15) + 작업 범위 + 2-레이어 아키텍처 + 구현 지침 (매입 route 신설 상세) + 테스트 체크리스트 + 금지사항 + 참조 파일 목록 + 작업 프로세스 + 질의 양식 · 문서만 (코드 X) | ✅ 완료 (local) |
| **#4** | **~~ERP 핸드오프 지침서 확장~~** · 전면 재작성 (사용자 교정 "내 프로젝트 구조 다 알려주지 마") | 기존 `HANDOFF_ERP_SETUP_AND_EXECUTION_2026-10-09.md` 폐기 · 범위 재정의: 프로젝트 구조·git·저장소·route 추가법 전부 제거 → ERP SOAP 호출 + Base64 응답 + decoder 사용 + 결과 파싱 "일반 가이드" 로 전환 · 수신 CLI 는 자기 환경에서 독립 구현 · 환경파일은 로컬에 따로 저장 | ✅ 삭제됨 |
| **#5** | **ERP 호출·디코딩 가이드 (수신 PC 독립 환경)** · 사용자 지시 2026-10-09 재정의 "그쪽 PC 에서 직접 ERP 접속해서 값 가져와서 디코딩" | 신규 `docs/ERP_API_FETCH_AND_DECODE_GUIDE_2026-10-09.md` · 수신 PC 는 메가타운 저장소 clone 불필요 · "자료 패키지 4개 (가이드+fixture+decoder+.env)" 섹션 추가 · ERP SOAP endpoint·action·fixture 교체·Base64 추출·decoder stdin→JSON·primary table 파싱·주요 column 명세(매입/매출)·숫자/날짜 처리·.env 로컬 보관·수신↔송신 통신은 토큰 재발급 시만 | ✅ 완료 (local) |
| **#6** | **업무요청 사이드바 3개 통합 + DocumentWriterPage · 서류작성 탭 embed** · 사용자 지시 2026-10-10 "A안 · 하위 3개 다 제거 · 상위 라벨 단일 메뉴" | (a) `sideNavGroups.ts` approvals 그룹 items 3개 (승인업무·요청확인·서류작성) → 단일 `{ key: "requests", label: "업무요청" }` · topTab.key `approval-request` → `requests` · Chat 아이콘 import 제거 · (b) `RequestsPage.tsx` topGroup=="document" 섹션 shortcut 버튼 블록 → `<DocumentWriterPage embedded allowedTabs={["contract","resignation"]} />` lazy 렌더 · level-3 TabBar(contract/resignation) + docSubTab state 제거 (DocumentWriterPage 내부 TabBar 사용) · (c) `onNavigateToDocument` prop · `handleTopGroupChange("document")` 로 전환 · (d) 데드코드 정리 · topGroup=="request"/"approval" 조건부 블록 (DisplayRequestTab·OrderRequestTab·InventoryCheckTab·LunchPanel·LeavePage·VendorApprovalPanel·ResignationApprovalPage) 전부 제거 · drawer 안에서만 render · AssignStaffModal 은 topGroup 밖 유지 · description 분기 overview/document 만 · 영향: approval-request 라우트는 코드만 남음 (dead code) · TS clean (사전 존재 PurchaseHistoryTab 에러 1건 외) | ✅ 완료 (local) |

---

## 🎨 UI 태스크 (디자인·레이아웃·폰트)

| # | 태스크 | 상세 | 상태 |
|---|-----|-----|-----|
| **UI-1** | **판매·매출현황 inline tab 홈 톤 통일 + 판매탭 → 구역별 현황 (CategoryTab)** · 사용자 지시 2026-10-09 | (a) RevenuePage 상단 탭 (매출/판매) + 매출 하위 탭 · solid slate-900 → inline pill (bg-slate-100 container + white rounded-md active · text-blue-700 shadow-sm · HomeDashboard SalesOverviewCard 패턴) · (b) 판매 탭 content: `SalesPanel initialTopTab="statistics"` → `CategoryTab` embed (구역별 판매 집계) | 🟡 진행중 |
| **UI-2** | **CategoryTab 홈 랜딩 톤 전면 리뉴얼** · 사용자 지시 2026-10-09 (판매·매출현황 판매탭 가져온 뒤) | OrderManagePage/CategoryTab.tsx 홈 톤 전면 적용 · CARD(rounded-[12px]+border-slate-200+thin shadow) · 2-tier typography · 좌측 accent 제거 · 아이콘 inline · zone 집계 UI 홈 톤 매칭 · 큰 작업 (639+ lines) | 🔴 미시작 (UI-1 완료 후) |
| **UI-3** | **매입 재고현황 페이지 inner tab 재구성** · 사용자 지시 2026-10-09 "발주·반품 현황 처럼" | PurchaseArrivalOverview.tsx 재구성 · 상단 inner tab bar (counter 포함) · 섹션: 현황 / 매입이력 / 일별 매입금액 / 매입이상 / 실재고 vs ERP 재고자산 비교 / 실재고테이블 · 최근 14일 필터 · 홈 톤 CARD (OrderReturnOverview 패턴 벤치) | 🔴 미시작 |
| **UI-4** | **overview 3페이지 상단 공통 모듈화 + 여백 통일** · 사용자 지시 2026-10-09 "여백 위치등 통일 · 공통모듈사용권장" | 신규 `src/components/DisplayPage/overviews/OverviewHeader.tsx` · `OverviewHero` (3px tone bar + 제목·설명 + right slot) + `OverviewInnerTabs<K>` (bottom bar · count badge · 프로세스 connector 없음) · PurchaseArrivalOverview + RevenuePage 2개 교체 · OrderReturnOverview (step connector 패턴) 는 그대로 유지 | 🟡 진행중 |
| **UI-5** | **업무요청현황판 (RequestsOverview) 폰트 리밸런싱 · HomeDashboard 톤 수렴** · 사용자 지시 2026-10-10 "폰트 리밸런싱" | 전반 1~2px 상향 · 상단 KpiMini label 12.5 → 14/15 · "총 대기"·"건" 13 → 14/15 · SectionCard description 12 → 13/14 · **row label 13.5/14 → 15/16** (taskLabel 톤) · "건" 접미사 11.5 → 13 · empty msg 13 → 14/15 · **DocCell title 13.5/14 → 15/16** · DocCell 메타(재직 N명) 11.5 → 13/14 · 미작성 label·CTA·완료 상태 11.5~12 → 13/14 · 로딩 12 → 13 · CARD/strip/grid/숫자(15/16/18/20)/아이콘/handler·state·API 전부 유지 · BEHAVIOR DELTA = 0 | 🔴 미시작 |
| **UI-6** | **업무요청 통합 현황판 + Drawer 패턴 (대형 재구조화)** · 사용자 지시 2026-10-09 ~ 10-10 연속 피드백 | **(a) topGroup 축소** · 4탭 → `현황 / 서류작성` 2탭 (승인업무·요청확인 inner tab 제거) · **(b) `RequestsOverview.tsx` 재작성** 홈 랜딩 톤 · CARD rounded-[12px] + subtle shadow · 컬러띠 제거 · subtle colors · KPI inline 텍스트 · 섹션 3개 (승인요청 · 요청확인 · 서류작성) · **(c) 서류 섹션** · 재직 N명 중 근로계약서 없는 M건 · 퇴직자 N명 중 사직서 없는 M건 · `/api/employees` 단일 fetch derive · 클릭 → business-manage 네비게이션 · **(d) 우측 slide-in Drawer** · overview row 클릭 → 오른쪽에서 왼쪽으로 slide-in (사용자 재지시 "다른 페이지들과 통일 · 오른쪽에서 열려") · inline `@keyframes requestsDrawerSlideIn` 명시 (tailwindcss-animate 의존 제거) · drawer 안에 LeavePage · VendorApprovalPanel · ResignationApprovalPage · DisplayRequestTab · LunchPanel render · 아이콘 tile `w-7 h-7 rounded-[8px]` HomeDashboard 공식 · **(e) description context-aware** · topGroup 별 변경 ("현황" → "승인·요청·서류 종합 현황" / "서류작성" → "근로계약서·사직서 작성") · **(f) 신규 API 0** · `/api/requests/pending-counts` + `/api/leave-requests/pending-count` + `/api/employees` 전부 재사용 · 피드백 반영 로그: 색깔 강렬 → subtle · 큰 통계카드 → inline 텍스트 · 컬러띠 빼 · 왼쪽 → 오른쪽 drawer · 홈 랜딩 톤 반복 수렴 | 🟡 적용중 (drawer 안 panel 개별 톤 통일은 UI-7 로 분리) |
| **UI-7** | **drawer 안 panel 홈 랜딩 톤 통일** · 사용자 지시 2026-10-10 "연차승인 UI 전체톤 맞추고" | drawer 안 render 되는 각 panel (LeavePage embedded mode="approval" / VendorApprovalPanel / ResignationApprovalPage / DisplayRequestTab / LunchPanel) 내부 UI 를 HomeDashboard CARD 톤 + subtle color 로 통일 · 범위 큼 (각 panel 자체 레이아웃 분석 + wrapper or 내부 수정) | 🔴 미시작 (UI-6 안정화 후) |

---

## 🐞 에러 태스크 (버그·회귀)

| # | 태스크 | 상세 | 상태 |
|---|-----|-----|-----|
| **E-1** | **발주요청 추가 시 알림 발송 제거** · 사용자 지시 2026-10-09 "발주요청 추가된건 알림 보내지마 · 발주 나갔을 때만 알림" | POST /api/order-requests · `notificationsService.notifyAllAdmins` 블록 제거 (requests.ts:719-725) · bulkSendOrderRequests 쪽 sms/kakao/email 알림은 유지 | ✅ 완료 (`9158729d`) |

---

## 🔒 사용자 액션 대기 (Supabase SQL · 환경)

| 항목 | 조치 | 필요성 |
|-----|-----|-----|
| **E-002-fix** · Google OAuth refresh_token | OAuth Playground · `src/keys/google-oauth.json` 갱신 | Drive 저장 필요 시 |
| **P1-2** · push_tokens 테이블 | Supabase SQL Editor · `migrations/20260921_push_tokens.sql` | iOS 앱 푸시 필요 시 |
| **E-007** · display_requests requester | Supabase SQL Editor · `migrations/20260920_display_requests_requester.sql` | 진열요청 이력 정확도 |
| **#327-2** · drive_links 컬럼 | Supabase SQL Editor · `migrations/20260921_drive_links.sql` | 근로계약서 링크 저장 |

---

## 🧪 사용자 테스트 대기 (서버 재시작 후)

이전 세션 (2026-09-24) · 46 커밋 반영 확인 필요:
- 발주이력 UI (날짜 그룹핑 · 담당자 인라인 · 매입확인 버튼)
- 발주필요 (수량 옆 단가·금액 · 스크롤 헤더)
- 상품정보 (모달 배치 재사용 · 메모·category 분리)
- 판매추천 판넬 (폰트 +2 · 이벤트 아코디언 · 상품추가 모달)
- 거래처 발주이력 (`#352` · vendor 로그인 · 자기 발주만)
- 앱 세션 유지 (RTR · 90일 rolling)
- 앱·웹 뱃지 통일 (unread-count endpoint)
- 세션 만료 배너 크게

**상세** · `TASKS_ARCHIVE_2026-09-25.md` 참조

---

## 📎 배포

- 리모트 푸시 · 명시 재요청 시만 실행
- 로컬 · 46+ 커밋 준비됨 · 리모트 X 유지
