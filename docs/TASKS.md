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
- 🚨 **폰트 사이즈 작지 않게** · 2026-10-10 재재강조 · body 15~17 · label 13~14 · tiny 12 하한선 · **11.5 / 12.5 / 13.5 소수점 금지** (들쭉날쭉 원인) · 체계 통일 (각 요소 1~2단계 차이만) · HomeDashboard 패턴 참조 · 매 UI 작업 시 체크리스트 필수

---

## 📝 세션 메모 · 2026-10-10 종료 (다른 세션 이관)

- **#6 완료** · 커밋 `6ec27c82` (로컬) · 업무요청 사이드바 하위 3개 → 단일 "업무요청" · 서류작성 탭 안 DocumentWriterPage lazy embed · 데드코드 (topGroup=="request"/"approval" 블록) 정리 · AssignStaffModal 유지 · 사용자 테스트 대기
- **approval-request 라우트** · 사이드바에서 접근 불가 (dead code) · 코드만 보존 · 추후 정리 가능
- **line 44 폰트 대원칙 신규** · 11.5/12.5/13.5 소수점 금지 · body 15~17 · label 13~14 · tiny 12 하한 · 모든 UI 작업 체크리스트 필수
- **다음 세션 우선순위**
  - UI-5 · RequestsOverview 폰트 리밸런싱 (line 44 신규 대원칙 적용 · 소수점 전부 정수 치환)
  - UI-7 · drawer 안 panel (LeavePage·VendorApprovalPanel·ResignationApprovalPage·DisplayRequestTab·LunchPanel) 홈 톤 통일
  - UI-6 · UI-7 완료 시 수렴 가능
- **미커밋 다른 작업** · `git status` 상 다수 파일 M (ERP·overview·레시피 작업중) · 이 세션 scope 아님 · 각 작업 담당 세션에서 커밋 예정
- **리모트 미푸시** · 사용자 명시 요청 전까지 로컬만

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
| **#7** | **RevenuePage 일별 추이 "요일 기준" 체크박스 추가** · 사용자 지시 2026-10-10 "일별 추이만 의미 · X축은 일 유지 · 9월 첫째주 토일 10월 첫째주 토일 겹치게" | **범위** · `chartAxis === "day"` 한정 (다른 축에는 미노출) · **X축 = "일"(1~31) 그대로** · 각 월별 series 를 reference month(현재월) 와 요일 맞도록 좌 shift · **UI** · 주말포함 체크박스 **앞에** "요일 기준" 체크박스 추가 · state `weekdayAlign` default false · **구현** · dayChartData 생성 분기 · `offset = -((dowOf1st(month) - dowOf1st(refMonth) + 7) % 7)` · srcDay = X-offset · 1~31 범위 밖 null · ref=today 월 (없으면 months 최신) · 다른 로직·축·tick 변경 없음 · TS clean | ✅ 완료 (local) |
| **#8** | **진열위치 (display_location / location) 매칭 전수조사** · 사용자 지시 2026-10-10 "ERP 에서 올라오는 진열위치 ≠ 현재 데이터로 쓰이는 진열위치 · 어떻게 매칭" | **결과**: (1) **DB vs API 변환 불일치** · DB `products.display_location` 는 ERP raw ("벽>21>전체>전체") 그대로 저장 (`erpSyncWhitelist.ts:67` nullOverwrite=false · `erpProductMapper.ts:175-178` transformErpLocation 2026-10-04 비활성화) · **API `/api/products-map` 응답은 `formatDisplayLocation()` 적용 변환값** ("21", "5A 1열") 반환 (`server/routes/stock/products.ts:138-140`) · 양쪽이 다름 (2) **사용자 수정 vs ERP overwrite 충돌** · 사용자가 `PATCH /api/products/:code` 로 "5A" 수정 → 다음 ERP sync 가 "5매대>A>전체>전체" 로 overwrite · nullOverwrite=false 라 ERP 값 있으면 무조건 덮어씀 (3) **용어 중복** · `products.display_location` (ERP 자동 sync) vs `inventory_checks.store*_zone` (사용자 매장별 상세 입력) · 둘 다 "진열위치" 로 호칭되지만 완전 별개 컬럼 · 결론: 매칭 자체는 없음 · DB raw 와 UI 변환값이 서로 다른 상태로 공존 중 | ✅ 완료 (조사 only · 코드 변경 X) |
| **#9** | **사이드바 매장 그룹 발주·매입·결제·반품 메뉴 라인 삭제 (최소 변경)** · 사용자 지시 2026-10-10 "메뉴만 없애자 · 발주 매입 결제 · 반품도" | `sideNavGroups.ts` 4개 라인 삭제 (`purchase-order`, `purchase`, `payment`, `return`) · 뒤 코드/페이지/alias/분기 전부 유지 · OrderManagePage shell·DisplayPage 분기·STORE_OVERVIEW_ALIAS 매핑·ReturnListPanel/ReturnConfirmedPanel 공유 모듈 보존 · 반품은 overview-order-return 안 inner tab 에서 접근 가능 · TS clean · 영향 조사 #10 | ✅ 완료 (local) |
| **#11** | **판매·매출현황 "판매" 탭 완전 신규 설계 (C안 · 2026 트렌드)** · 사용자 지시 2026-10-10 "C · 최신 트렌드 전부 · 웹검색 · 해" | **조사 완료** (11 소스 교차검증) · 레이아웃 ①~⑧ 승인 · subtask 분할 (#11-P1 Phase 1 P0 4섹션 · #11-P2 Phase 2 P1·P2) · 홈 랜딩 톤 · recharts 재사용 · 신규 server endpoint X (anomaly 는 클라 평균-2σ) · 반응형 md: 전환 · 참조 Shopify Spring 2026 Insight Card + Attio density 테이블 + Vercel Geist 톤 | ✅ 설계 완료 · 구현 subtask 로 분할 |
| **#11-P1** | **판매탭 Phase 1 · P0 4섹션 + 필터 toolbar** | ① Insight Card (북극성 · 자연어 룰기반) · ② KPI 4-strip (총매출/건수/객단가/마진율 + delta + sparkline) · ③ 매출 추이 Area (전주 overlay + annotation 지원) · ④ 베스트셀러 Top 10 (Attio density 테이블 · 36-40px row · sparkline 열) · 상단 필터 toolbar (기간 7/30/90일 · 비교: 전주) · 신규 파일 `RevenuePage.SalesTab.tsx` 또는 inline · 홈 톤 CARD · 폰트 2-tier · 파스텔/그라디언트/counter 금지 | 🟡 진행중 |
| **#11-P2** | **판매탭 Phase 2 · P1·P2 4섹션** · 사용자 지시 2026-10-10 "응해" | ⑤ 공급사별 매출 비중 Donut (ERP buyerCorpName Top6+기타 · recharts PieChart) · ⑥ 요일×시간대 Heatmap (sale-hourly-report from~to 1회 호출 · 7xN grid · indigo opacity scale) · ⑦ 마진 Top5/Bottom5 좌우 2열 (bestsellers marginPct sort) · ⑧ Anomaly Alert (days 평균 ±2σ 이탈 · ▲▼ 뱃지 · 상위 5개) · 신규 server endpoint X · 홈 톤 유지 · counter 애니메이션 X · TS clean | ✅ 완료 (local) |
| **#12** | **판매·매출현황 메뉴 쪼개기 (A안 · RevenuePage 재사용 · initialTab 분기)** · 사용자 지시 2026-10-10 "쪼개줘 · 매출현황 default=매출 탭 · 판매현황 default=판매 탭" | **(a)** `sideNavGroups.ts` 1개 → 2개 메뉴 (매출현황 `subTab=revenue`+CurrencyKrw · 판매현황 `subTab=sales`+ChartBar) · **(b)** `RevenuePage.tsx` `RevenuePageProps.initialTab` prop 추가 · default="revenue" · **상단 [매출|판매] inner tab 제거** (사용자 지시 "매출현황메뉴에서는 매출현황탭 판매현황탭 없애야지 · 판매현황메뉴에서도 마찬가지") · OverviewHero title 만 initialTab 따라 분기 · **(c)** `DisplayPage.types.ts` DpSubTabKey `sales` 리터럴 추가 · **(d)** `DisplayPage.helpers.ts` DP_SUBTAB_META `sales` 메타 추가 · **(e)** `DisplayPage.tsx` sales 분기 추가 (`RevenuePage initialTab="sales"`) + `dpHiddenSubs` subs 배열 + visibility 맵 · 중복 코드 0 · TS clean | ✅ 완료 (local) |
| **#13** | **판매현황 대시보드 신규 (공급사·구역·급상승·손실 중심)** · 사용자 지시 2026-10-10 "공급사별·구역별·급상승·손실많은제품 등 · 대시보드 · 최신 트렌드 · 웹검색" | **리서치 완료** (Shopify Inventory + Target SPMD + 약국 Big Three · 15 소스 교차검증) · **구현 완료 5섹션**: ① KPI 4-strip (판매수량/활성상품/활성공급사/조치필요) · ② 급상승 제품 Top10 (당기 vs 전기 성장률 · 샘플 ≥3 필터) · ③ 손실 많은 제품 Top10 (Dead stock · 재고 > 0 · 당기 판매 = 0 · 재고가치 desc) · ④ 구역별 현황 (display_location horizontal bar · 상위 15) · ⑤ 공급사 scorecard (G/Y/R pill · 품목수/수량/매출/마진/재고가치/재고일수 · 재고일수 ≤45 && 마진 ≥15 good · 90/5 risk) · 신규 `RevenuePage.SalesStatus.tsx` (470+ lines) · 홈 톤 CARD · 폰트 체계 (body 14-16·label 13·hero 20-22) · counter 애니메이션 X · 데이터 ERP sale-day-products + /api/products-map · TS clean | ✅ 완료 (local) |
| **#14** | **경영 통합 대시보드 + 업무요청 흡수 (A+B 하이브리드 · Phase 1)** · 사용자 지시 2026-10-11 "경영메뉴 통합대시보드 · A+B 하이브리드 · 상세 추가탭 · 업무요청 병합" | **(a) `sideNavGroups.ts`** · `approvals` 그룹 **삭제** (`업무요청` top-level 메뉴 제거) · `business` 그룹에 하위 메뉴 재배치: 대시보드 (NEW · default) / 직원관리 / 업무요청 (NEW · RequestsPage embed) / 서류작성 (근로계약서) / 각종양식 · 승인대기 아이템 제거 · **(b) `BusinessManagePage.tsx`** · BmSubTab 타입 변경 (`dashboard` 추가 · `requests` 추가 · `approval-center` 제거) · default="dashboard" · requests 분기 → RequestsPage lazy embed · approval-center 분기 → requests 로 리다이렉트 (하위 호환) · pending 카운트 로직은 requests 탭 badge 로 이관 · **(c) 신규 `BusinessManagePage.Dashboard.tsx`** · KPI 6-strip (재직수·신규입사·계약만료임박·미승인요청·이번달 예상 인건비·매출 대비 인건비율) · 조치 필요 panel (재계약 대상·서류 누락·연차 소진 임박) · 직원 요약 (직군별 그룹 · 카드 클릭 drawer) · 홈 랜딩 톤 CARD · 2-tier typography · 폰트 2026-10-10 대원칙 · **(d) 라우팅 하위 호환** · 기존 `requests` top-tab → `business-manage` + `subTab="requests"` 리다이렉트 (App.tsx 분기) · 스케줄>연차신청(`approval-request`) 경로 영향 X 확인 · TS clean · 매출 대비 인건비율은 Phase 1 는 "예상치" 라벨만 노출 (매출 조인은 Phase 2) | 🟡 진행중 |
| **#14-P2** | **경영 통합 대시보드 Phase 2 · 인건비 분석 탭 신설** · 사용자 지시 2026-10-11 | **(a)** `business` 그룹에 "인건비 분석" 메뉴 추가 · **(b)** `BusinessManagePage.tsx` BmSubTab 에 `wage-analysis` 추가 · **(c) 신규 `WageAnalysisTab.tsx`** · 월별 인건비 추이 Area (recharts) · 직군별 비중 Donut (recharts PieChart) · 직원별 예상 급여 테이블 (Attio density) · "예상치" 명시 (계약서 grossUp 역산 기반 · 실지급 로그 테이블 생기면 교체) · **(d)** 매출 대비 인건비율 KPI 를 대시보드와 연동 · 홈 톤 유지 · TS clean | 🔴 Phase 1 완료 후 |
| **#10** | **NEW 페이지 (overview·홈·업무요청) 안전성 전수조사** · 사용자 지시 2026-10-10 "현황 들어간 메뉴들 모두 전수조사" | **결과 · 기술적 안전 (코드 깨짐 X)**: (a) STORE_OVERVIEW_ALIAS 가 OLD subTab(purchase-order/purchase/payment) → NEW overview 로 매핑 유지 · deep link 작동 · (b) DisplayPage.tsx:638 OLD subTab 분기 블록 유지 · OrderManagePage shell render 유지 · (c) 공유 모듈 6개 (ReturnListPanel/ExceptionNoteModal 등) OrderManagePage 폴더 안 전부 존재 · overview import 깨짐 X · (d) PurchaseArrivalOverview.tsx:323 "매입 보기 →" 버튼 `onSelectSubTab("purchase")` → ALIAS 매핑으로 overview-purchase-arrival 메뉴 active 유지 · (e) 공유 모듈 import 전부 정상 · **⚠ UX 혼란 1건**: HomeDashboard Quick Action "발주 필요"/"매입이력" 버튼 (`HomeDashboard.tsx:379-380, 443-449`) 이 OLD subTab 으로 네비게이션 · 페이지 열리지만 사이드바에선 메뉴 없음 · 사용자 혼동 가능 · **권장**: 홈 버튼 target 을 NEW overview subTab 으로 전환 (purchase-order → overview-order-return, purchase → overview-purchase-arrival, payment → overview-payment-settlement) | ✅ 완료 (조사 only) |
| **#15** | **매대 번호 1~9 상비약 분류 하드 규칙 (zoneClassification SSOT 패치)** · 사용자 선언 2026-10-11 "1-9까지 상비약" | **전수조사**: zone_defs 54 row · category 비어있는 매대 6건 (23/26/32~35) · 매대 1~9 (cell_id=1~9 상담존) category 는 "상비약" 미포함 · `classifyByZoneDefs()` 미분류 반환 · 사용자가 본 "1A/2A/.../9" 미분류 원인 확정 · **패치**: `src/lib/zoneClassification.ts` 2 함수 (`classifyByZoneDefs` + `classifyProducts`) `extractZoneNumFromLocation` 직후 `if (num >= 1 && num <= 9) return "상비약"` 하드 규칙 추가 · zone_defs.category 문자열 무관 고정 분류 · **범위**: SSOT 1곳 수정 → overview·sales 전체 반영 · DB 변경 X · **스크립트**: `scripts/audit-zone-defs-category-2026-10-11.mjs` (read-only 감사) · 상담존 24/25/26/27 category 공백 건은 **사용자가 StoreZoneTextEditor 에서 직접 입력** 하기로 | ✅ 완료 (local 미커밋) |
| **#16** | **반품 통합 재설계 · 반품필요 + 반품확정 병합 + 발주요청서 복제 모달** · 사용자 지시 2026-10-12 다중 피드백 | **(a) 병합**: `ReturnListPanel.tsx` (820) + `ReturnConfirmedPanel.tsx` (244) → 신규 `ReturnUnifiedPanel.tsx` · 상하 2 섹션 (C 안 · 반품필요 상단 + 반품확정 하단) · 홈 랜딩 톤 CARD · **(b) 자동 조건 필터**: 반품필요 제목 옆 inline input `[최근 N일 이상] [M개 이하]` · default **90일 / 5개** · 판매 데이터 기준 (최근 N일 판매량 ≤ M개 자동 분류) · state 변경 즉시 재필터 (useMemo) · **(c) 체크박스 bulk 선택**: 각 row ☐ + 전체선택 · `selectedKeys: Set<product_code>` · **(d) "반품요청서 보내기" 버튼** (bottom-right · 발주요청서 패턴 복제) · 공급사별 그룹핑 · 각 공급사 모달 1개 · **(e) 반품요청서 모달 재구성** (`ReturnRequestModal.tsx` 470 lines → `OrderModal.tsx` 370 lines 구조로 복제): 공급사 header · 상품 리스트 수량 조정 · 비고 · PDF 미리보기 (ReturnPdfPreview 재작성 · OrderPdfPreview 톤 복제) · 공급사 알림 (sms/email) · 전송 · **(f) 저장**: `/api/return-requests` POST (각 상품) + 알림 발송 → 반품확정 섹션 자동 refresh · **(g) 호출처 교체** · `OrderManagePage` · `OrderReturnOverview` 2곳 · 기존 2 파일 보존 → 완료 후 삭제 · **범위 매우 큼** (신규 1 · 재구성 2 · 호출처 2) · **단계별 commit** (step 1-6) · TS clean · BEHAVIOR 변경 (조건 default · bulk · 공급사 그룹 · 알림) | 🔴 설계 승인 받음 (사용자 "응") · 작업 X · 판매현황 재구성 끼어들어 보류 |

---

## 🎨 UI 태스크 (디자인·레이아웃·폰트)

| # | 태스크 | 상세 | 상태 |
|---|-----|-----|-----|
| **UI-1** | **판매·매출현황 inline tab 홈 톤 통일 + 판매탭 → 구역별 현황 (CategoryTab)** · 사용자 지시 2026-10-09 | (a) RevenuePage 상단 탭 (매출/판매) + 매출 하위 탭 · solid slate-900 → inline pill (bg-slate-100 container + white rounded-md active · text-blue-700 shadow-sm · HomeDashboard SalesOverviewCard 패턴) · (b) 판매 탭 content: `SalesPanel initialTopTab="statistics"` → `CategoryTab` embed (구역별 판매 집계) | 🟡 진행중 |
| **UI-2** | **CategoryTab 홈 랜딩 톤 전면 리뉴얼** · 사용자 지시 2026-10-09 (판매·매출현황 판매탭 가져온 뒤) | OrderManagePage/CategoryTab.tsx 홈 톤 전면 적용 · CARD(rounded-[12px]+border-slate-200+thin shadow) · 2-tier typography · 좌측 accent 제거 · 아이콘 inline · zone 집계 UI 홈 톤 매칭 · 큰 작업 (639+ lines) | 🔴 미시작 (UI-1 완료 후) |
| **UI-3** | **매입 재고현황 페이지 inner tab 재구성** · 사용자 지시 2026-10-09 "발주·반품 현황 처럼" | PurchaseArrivalOverview.tsx 재구성 · 상단 inner tab bar (counter 포함) · 섹션: 현황 / 매입이력 / 일별 매입금액 / 매입이상 / 실재고 vs ERP 재고자산 비교 / 실재고테이블 · 최근 14일 필터 · 홈 톤 CARD (OrderReturnOverview 패턴 벤치) | 🔴 미시작 |
| **UI-4** | **overview 3페이지 상단 공통 모듈화 + 여백 통일** · 사용자 지시 2026-10-09 "여백 위치등 통일 · 공통모듈사용권장" | 신규 `src/components/DisplayPage/overviews/OverviewHeader.tsx` · `OverviewHero` (3px tone bar + 제목·설명 + right slot) + `OverviewInnerTabs<K>` (bottom bar · count badge · 프로세스 connector 없음) · PurchaseArrivalOverview + RevenuePage 2개 교체 · OrderReturnOverview (step connector 패턴) 는 그대로 유지 | 🟡 진행중 |
| **UI-5** | **업무요청현황판 (RequestsOverview) 폰트 리밸런싱 · HomeDashboard 톤 수렴** · 사용자 지시 2026-10-10 "폰트 리밸런싱" + "너무 작게" + "총 대기 크자나 다른건 좀 키워" + "크기차이 조금만" | **(a)** 소수점 사이즈 전부 정수화 · 11.5→13 / 12.5→13 / 13.5→14 (들쭉날쭉 원인 fix) · **(b)** 전반 +2 상향 · 12→14 / 13→15 / 14→16 / 15→17 / 16→18 / 18→20 / 20→22 (사용자 "너무 작게" 반영) · **(c)** 큰 사이즈 압축 · 22→18 / 20→17 / 18→16 (사용자 "총 대기 큰 숫자 줄이고 차이 조금만") · **(d) 최종 5단계** · 18(KPI 숫자 ×1) · 17(title ×6) · 16(body ×9) · 15(라벨 ×8) · 14(meta ×8) · 차이 **4px** · **(e)** 대원칙 추가 · TASKS.md 상단 "🚨 폰트 사이즈 작지 않게" + 신규 메모리 `feedback_font_not_small_2026-10-10.md` (공식 사이즈 체계·금지사항·체크리스트) | ✅ 완료 (local · 사용자 테스트 대기) |
| **UI-7-1** | **서류작성 탭 description 공간 중복 제거** · 사용자 지시 2026-10-10 "업무 요청 + 근로계약서·사직서 작성 중복 공간 차지" | `RequestsPage.tsx` OperationsPageTemplate description · `topGroup === "document"` 시 빈 문자열 (`""`) · DocumentWriterPage 내부 TabBar (근로계약서/사직서) 가 역할 대신 · overview 그룹은 "승인·요청·서류 종합 현황" 유지 | ✅ 완료 (local) |
| **UI-7-2** | **LeavePage embedded(승인) 섹션 재디자인 · 발주매입현황판 톤** · 사용자 지시 2026-10-10 "이 페이지 디자인 마음에 안들어 개선" + "발주매입현황판 톤 맞춰" | **범위** · 승인 대기 카드 (`PendingLeaveCard`) + 전체 이력 테이블 (`PendingPCTable`) · **참조 톤** · `OrderReturnOverview` + `PurchaseArrivalOverview` (CARD rounded-[12px] + 왼쪽 accent strip + divide-y rows + inline weight="fill" 아이콘) · **폰트** · 2026-10-10 신규 대원칙 (body 15~17 · label 14~15 · 소수점 금지) · "승인 대기 N" 큰 숫자 17~18 · 상태 배지 subtle (bg-{tone}-50 + text-{tone}-700) · 검토하기 버튼 solid muted | 🔴 작업 필요 |
| **UI-8** | **입고알림 홈 랜딩 통합 · 페이지 삭제** · 사용자 지시 2026-10-10 "홈 랜딩에서 슬라이딩 표시 · 입력/수정/삭제 다 가능 · 입고알림 페이지 삭제 · 기능 저쪽으로 이관" | **(a) HomeDashboard** · 기존 `StockArrivalList compact` 영역 재구성 · 수직 ticker auto-scroll (hover pause) · "신규 추가" 버튼 · 아이템 클릭 → inline edit · 삭제 버튼 · **(b) 사이드바** · `sideNavGroups.ts` `{ key:"display", label:"입고알림", subTab:"stock-arrivals" }` 아이템 제거 · **(c) 라우팅** · `App.tsx` `stockarrivals` route 삭제 · `StockArrivalPage.tsx` 파일 삭제 (dependency 전부 홈 Dashboard 이관 후) · **(d) DisplayPage** · `stock-arrivals` subTab 분기 삭제 · overview 통합 리스트에서 레거시 `stock-arrivals` alias 정리 · **BEHAVIOR CHANGE** (사용자 승인 명시) | 🔴 설계 승인 필요 |
| **UI-7-3** | **VendorApprovalPanel 재디자인 · 발주매입현황판 톤** · 사용자 지시 2026-10-10 "여기도" (거래처승인) | **범위** · `src/components/RequestsPage/VendorApprovalPanel.tsx` · 벤더 승인 대기 카드 (주문방식·담당자·연락처·이메일·팀장·긴급·특이사항·비고) + 거절·승인 버튼 · **참조 톤** · 발주매입현황판 (OrderReturnOverview + PurchaseArrivalOverview) · **(a)** 승인 대기 N 섹션 · 숫자 compact · **(b)** 각 벤더 카드 · CARD rounded-[12px] + 왼쪽 accent strip (사직 톤) + 각 필드 2-column grid · **(c)** 거절·승인 버튼 · 각각 톤 (rose/emerald solid muted) · **(d)** 폰트 체계 2026-10-10 대원칙 | 🔴 작업 필요 |
| **UI-7-4** | **ResignationApprovalPage 재디자인 · 발주매입현황판 톤** · 사용자 지시 2026-10-10 "여기도" (사직서 승인) | **범위** · `src/components/ResignationApprovalPage/ResignationApprovalPage.tsx` · "승인 대기 0 / 처리 완료 0" KPI + 리스트 (대기 중 사직서 없을 때 empty state) · **참조 톤** · 발주매입현황판 · **(a)** 상단 KPI 2개 (승인 대기 N / 처리 완료 N) · inline 텍스트 or 작은 pills · **(b)** empty state · subtle muted ("대기 중인 사직서가 없습니다") · **(c)** 사직서 카드 (있을 때) · CARD + 왼쪽 accent strip + 신청자·일자·사유 · 승인/반려 버튼 · **(d)** 폰트 체계 2026-10-10 대원칙 | 🔴 작업 필요 |
| **UI-10** | **실재고 테이블 재디자인 · 6 세트 column 구조 · 최신 트렌드** · 사용자 지시 2026-10-10 "실재고테이블 매장1,2,3과 수량과 구역이 구분이 되게" + "진열위치-erp 한세트 매장1 한세트 매장2 매장3 창고1 창고2 각각 한세트" + "구분 잘되게 · 최신트렌드" + "아이콘 없이 깔끔하게 텍스트 제목앞 작은 세로줄 · 폰트크기 차이 많이 안나게" | **파일** · `src/components/DisplayPage/RealStockTablePage.tsx` (711 lines) · **6 세트 column 구조** · (1) 진열위치-ERP (slate-50/40) · (2) 매장1 (sky-50/40) · (3) 매장2 (indigo-50/40) · (4) 매장3 (violet-50/40) · (5) 창고1 (cyan-50/40) · (6) 창고2 (teal-50/40) · 세트 간 세로 divider (`border-r border-slate-200/70`) · **column header** · **아이콘 X · 세로 strip (`w-[3px] h-[12px] bg-{tone}-500 rounded-full`) + 텍스트 라벨 + sort indicator** (HomeDashboard 공식 패턴) · sticky top · **각 cell** · inline 수량 + zone chip · **폰트 차이 적게** (수량 15 · zone 14 · meta 13 · 차이 1~2px 만) · hover row · 2026 트렌드 (Linear/Vercel/Attio) · 폰트 2026-10-10 대원칙 (소수점 금지) | 🔴 작업 필요 (범위 큼 · 사용자 승인 후 작업) |
| **UI-11** | **재고·진열 현황 재구성 · 현황 탭 삭제 + 구역도 → 현황 + 매대 3 카드 + Drawer + 판매 집계** · 사용자 지시 2026-10-10 (다중 세션) | **Phase 1 (UI)** · (a) innerTab 삭제 ✅ · 구역도 단일뷰 default ✅ · (b) 매장 매대 3 카드 (`products.category` · 상비약/일반약/뷰티+기타) 🔴 · (c) 자산가치 유지 + 판매집계 placeholder 🔴 · (d) 매대 클릭 → 오른쪽 slide-in Drawer (RequestsPage 패턴) 🔴 · (e) 창고 drawer 동일 🔴 · **Phase 2 (DB+Cron)** · 신규 통합 테이블 `stock_daily_snapshots` (code · snapshot_date · current_stock · store1~3_stock · warehouse1~2_stock · unit_price · created_at · PK (code, date)) · **매일 자정 cron** · 변경 유무 무관 매일 UPSERT · ERP+사용자 체크 통합 · 멱등 (하루 N회 OK) · `supabase/migrations/*_stock_daily_snapshots.sql` + `scheduleOptimalStockRefill` 패턴 신규 cron · **Phase 3 (API+UI)** · 신규 endpoint `/api/stock-snapshot-diff?from=&to=` · 두 날짜 snapshot current_stock diff × unit_price = 판매수량/금액 · UI 탭 일/주/월 · 월 멀티선택 | 🟡 Step 1 완료 · Step 2~5 작업 중 · Phase 2·3 승인 (A 통합 테이블 · 매일 cron) |
| **#12** | **ERP 판매 요약 API 신규 (상품별 N일 집계)** · 사용자 지시 2026-10-11 "최근 90일 총 판매갯수" | **Backend 신규 endpoint** · `GET /api/erp/product-sale-summary?pcode=XXX&days=90` · ERP sale-day-products 쿼리에서 **pcode filter + N일 totalStock 합계 서버 집계** · 응답 `{ ok, pcode, days, totalQty, totalSale, startDate, endDate }` · **클라이언트 캐시** (상품별 메모리 캐시 · TTL 10분 추천) or 서버 memoization · 호출처 · `ProductInfoCard` 상세 패널 (실재고확인 · 발주요청 · 발주필요 등 11개 context 공통) · 성능 이점 · 1 API call per 상품 vs 90번 chunk fetch 대비 90x 효율 | 🔴 백엔드 세션 작업 필요 |
| **#13** | **거래처 그룹 메뉴 통합 (업무요청 #6 패턴)** · 사용자 지시 2026-10-12 "방문예약은 슬라이딩으로 뜨게 하고 나머지는 현황판에서 다 볼 수 있게 · 탭메뉴 만들어서 상세 이동 · UI 교체" | **Phase 1 (현재)** · 신규 `VendorOverviewPage.tsx` skeleton 생성 · OverviewHero + OverviewInnerTabs 공식 (공급사 정보 / 공급사 재고확인 / 발주이력) · 각 탭 placeholder content · **Phase 2** · 각 탭에 기존 페이지 embedded render (`display subTab=vendor-manage` · `vendor-stock` · `vendor-order-history`) · **Phase 3** · 방문예약 · overview 안 "방문예약 N건" row 클릭 → slide drawer (RequestsPage drawer 공식 재사용) · ReservationPage embedded mode · **Phase 4** · `sideNavGroups.ts` 거래처 그룹 items 4개 (방문예약·공급사정보·재고확인·발주이력확인) → 단일 "거래처" 메뉴 (vendor-overview route) · 기존 4개 제거 (safe switch) · `App.tsx` route 추가 · `AppNavHeader.tsx` AppNavPage type extend | 🟡 Phase 1 완료 (local · skeleton only) · Phase 2~4 다음 세션 전담 |
| **UI-12** | **ProductInfoCard 상세 패널 UI 톤 홈 랜딩 개선 + 90일 판매갯수 섹션 + ScanPage 실제 노출** · 사용자 지시 2026-10-11 "실재고확인 오른쪽 상세정보 매입가·판매가·현재수량 추가 + UI톤 홈 랜딩 · 공급사·현재고·판매상태·매입가·판매가·최근 90일 총 판매갯수·위치 전부" + 재지시 "매입가·판매가·공급사·현재고·판매상태 위 · 나머지 적정한 곳 · ui 개선" | **(a) `topAccent` 제거** · 홈 랜딩 공식 패턴 ✅ · **(b) scan context financial=true** ✅ · **(c) ProductBasicInfoPanel 노출 확인** ✅ · **(d) 90일 총 판매갯수** · #12 endpoint 완성 후 bind 🔴 · **(e) 홈 랜딩 톤 전면 적용** 🟡 Financial 완료 · 나머지 작업 중 · **(f) 【2026-10-11 재지시 핵심】** · 전수조사 결과 **ScanPage 안 ProductInfoCard render 자리가 아예 없음** 발견 → ScanPage 사용자 눈에 상세정보 "하나도 안 보임" 원인 확정 · **신규 `ScanProductSummary.tsx`** · 홈 랜딩 톤 CARD (rounded-[12px] + border-slate-200 + thin shadow) · 상단 header (상품명 + 바코드 mono) · 중단 **5-field grid** (매입가·판매가·공급사·현재고·판매상태 · 사용자 명시 "위") · 하단 3-field (진열위치·적정재고·재고자산 · "나머지 적정한 곳") · formatDisplayLocation 공통 함수 재사용 · `ScanPage.tsx` 오른쪽 panel 상단 `<ScanRightPanel>` 위에 render · lastProduct null empty state ("바코드 스캔 시 상품 상세정보가 표시됩니다") · TS clean · BEHAVIOR DELTA = 0 (API/handler 추가 X · lastProduct prop 재사용) | 🟡 (a)(b)(c)(f) 완료 · (d)(e) 작업 중 |
| **UI-13** | **매장구역도 편집 · 그래픽 폐기 · 텍스트 리스트 (옵션 A) + 홈 랜딩 톤 + 매장구역도 옆 배치** · 사용자 지시 2026-10-11 "A로 · 최근 변경된 UI톤 · 매장구역도 옆으로 이동" | **범위** · (a) 신규 `StoreZoneTextEditor.tsx` · 매대 리스트 (번호·위치명·카테고리 · 각 inline input) · 홈 랜딩 CARD rounded-[12px] + 폰트 14~16 · 2026-10-10 대원칙 · (b) PATCH `/api/zone-defs/:num` 재사용 · (c) 기존 StoreZoneMap editable 호출처 교체 · (d) 매장구역도 뷰어 (그래픽) 유지 · **"옆으로 이동"** · 2-column 레이아웃 (왼쪽 텍스트 에디터 · 오른쪽 매장구역도 뷰어 참조) 가능성 · 적용 **대상 페이지 확정 필요** (어느 페이지 안 편집 UI 를 옆 배치 할지) | 🔴 범위 확정 필요 (대상 페이지 · 편집 UI 호출처) |
| **UI-8** | **재고·진열 현황 inner tab + 매장구역도 뷰어 추가** · 사용자 지시 2026-10-10 "다른 페이지들처럼 현황 옆에 탭 · 매장구역도 뷰어 넣어줘" | `InventoryDisplayOverview.tsx` · OverviewPageHeader 아래 inner tab bar (`현황` / `매장구역도`) · 홈 톤 pill 패턴 (bg-slate-100 container + white rounded-md active + text-blue-700 shadow-sm · SalesOverview·CategoryTab 벤치) · 첫 탭 default (overview) · `innerTab === "overview"` · 기존 KPI/섹션/toolbar 보존 · `innerTab === "map"` · `<StoreZoneMap />` common 공통 readonly 뷰어 render · ProductInventoryDetailModal 은 condition 밖 유지 · DisplayPage의 매장구역도(store 서브탭) 는 그대로 유지 (사용자 "이동" 재지시 전까지 추가 모드) · 추가 메뉴/라우트 신설 X · TS clean (사전 존재 PurchaseHistoryTab 에러 1건 외) | ✅ 완료 (local) |
| **UI-9** | **구역도 탭 Bento 대시보드 재구성 · 매장 + 창고1 + 창고2 통합** · 사용자 지시 2026-10-10 "구역도라고 고치고 · 창고1·창고2·매장을 맵으로 표시 · 대시보드 · 최신 트렌드 · 멋지고 깔끔 팬시 · 한눈에 · 홈 랜딩페이지 톤 · 실사와 달라도 OK · 일반약/상비약 나뉘고 · 매대 이름" | (a) **라벨 변경** · inner tab "매장구역도" → "구역도" · (b) **요약 KPI 라인** · 상비약·일반약·창고1·창고2 각 구역수 inline (HomeDashboard quick-row 패턴 · icon tile w-7 h-7 rounded-[8px] + label 14/15 + value 16/17 tabular-nums) · (c) **Bento grid** · lg: 매장 2fr (상비약 섹션 + 일반약 섹션) + 창고1·창고2 1fr 세로 스택 · md 이하 1-col · (d) **각 CARD** · HomeDashboard 공식 (bg-white rounded-[12px] border-slate-200 shadow thin) · header (icon tile tone + title 15/16 + count badge 13/14) · 좌측 accent 레일 X · gradient X · (e) **ZoneGroup 섹션** · 3px thin label strip + title + count · 매대 chip grid (2/3/4 col 반응형) · (f) **ZoneChip** · code pill (bg-{tone}-50 text-{tone}-700 rounded-[6px] 13 bold) + 매대명 14 medium · hover border + shadow · 실사 레이아웃 복제 X · (g) **데이터** · useZoneDefs (매장 zone_defs DB) + classifyMajorZone (중앙상비약존→상비약 / 나머지→일반약) + useKvSetting warehouse_zones (창고 KV) · 신규 API 0 · readonly · (h) **tone registry** · sky/indigo/emerald/rose/amber/violet 6tone · HomeDashboard 패턴 복제 · (i) **폰트 체계** · title 15/16 · body 14 · label 13/14 · value 16/17 · 소수점 금지 (line 44 대원칙) · (j) **최신 트렌드** · Bento grid (Apple/Linear 2026) · subtle elevation (Vercel) · monotone + accent · micro-interaction (hover border + soft shadow + transition-all) · TS clean (사전 존재 PurchaseHistoryTab 1건 외) | ✅ 완료 (local) |

| **메뉴** | **매장 그룹 "결제·정산 현황" 메뉴 제거** · 사용자 지시 2026-10-10 "결제정산현황은 메뉴 제거" | `sideNavGroups.ts` 매장 그룹 items 에서 해당 1줄 삭제 · PaymentSettlementOverview 코드/라우트는 보존 | ✅ 완료 (`84a20299`) |
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
