# TASKS

**규칙**:
- 완료 태스크는 이 파일에서 **삭제** (아카이브 X)
- 새 태스크 즉시 추가
- 세션 시작 시 반드시 read
- 매 milestone 후 update
- **회귀 절대 금지** · TS + build + test 통과 후 커밋
- **리모트 푸시 · 사용자 명시 승인 시에만** (기본 로컬 커밋)
- **DB · 파생컬럼 사용 금지** · 원래 테이블 활용 최우선
- **DB 정합성 절대 유지** · 파괴적 SQL X · 스냅샷 파생 X · 마스터 참조 무결성 · UNIQUE 이중 방어 · SSOT · 매 DB 작업 체크리스트

**관련 파일:**
- 테스트 절차 · [`TEST_LIST_2026-09-11_session.md`](./TEST_LIST_2026-09-11_session.md)
- 프레임워크·원칙 · [`CODING_PRINCIPLES.md`](./CODING_PRINCIPLES.md)
- 프레임워크 감사 · [`FRAMEWORK_AUDIT.md`](./FRAMEWORK_AUDIT.md)

---

## 🔴 대원칙 (확정 · 매 태스크 준수)

- **재고자산 = 매입액 − 판매원가** (cogs)
- **실제잔고 = 매입액 − 결제액**
- **판매액 = 판매수량 × 판매단가** (xlsx total_amount 합계 컬럼 절대 사용 금지)
- **공급사 이름 · vendors 유효성 검증 필수** (자유 입력 금지 · POST/PATCH /api/products 에서 400 SUPPLIER_NOT_FOUND 반환)
- **공통 기능 = 단일 endpoint** (2026-09-14) · 같은 목적 route 중복 금지 · 신규 전 grep 필수
- **DB 정합성 절대 유지** · `feedback_db_integrity_absolute_2026-09-15.md` · 파괴적 SQL X · 스냅샷 파생 X · UNIQUE 이중 방어 · SSOT
- **유통기한 · 3소스 통합** (2026-09-17 · Phase B 후) · SSOT=`inventory_checks.expiry_date` · legacy 소스=`products.expiry_date`+`purchase_details.expiry_date` (DATE 컬럼 · Phase A 마이그) · `/api/products/expiry-imminent` 3소스 UNION+MIN
- **문자열에 날짜 저장 금지** (2026-09-17) · verify_note 등 텍스트 필드에 "유통기한: YYYY-MM-DD" 저장 X · 정식 DATE 컬럼 사용 · 파싱·정렬·인덱스 모두 손해

---

## 🧪 사용자 테스트 대기 · 최신 (2026-09-15 세션)

**모든 코드 완료 · 사용자 테스트 대기.** 상세 확인 절차 · `TEST_LIST_2026-09-11_session.md` (항목 [28]~[38]).

| # | 항목 | 커밋 |
|---|-----|------|
| [28] | 탭바 전역 정렬 fix · 초광폭 밀림 해소 | `a576ea27` |
| [29] | #39 Phase A+B · 발주 진행중 접힘 카드 + 지연 tier | `2277a8a2` |
| [30] | T-SP-BULK · POST bulk shelf_positions 병합 (22 tests) | `b86a4b20` |
| [31] | #61 B안 · 지정위치 정합성 + 상품↔실재고 자동 연동 | `a75958da` |
| [32] | DB 정합성 · DELETE /api/products · 회계 이력 차단 | `8a987279` |
| [33] | T-MENU-BOTTOMNAV · BottomNav perms.hidden 필터 | `596108af` |
| [34] | T-SP-9-REST · ExpiryImminentTab 진열위치 뱃지 | `5513c8d4` |
| [35] | #191 Phase B · ShelfPositionsEditModal Modal 마이그레이션 | `04935b7b` |
| [36] | T-PROD-LABEL · 상품정보 왼쪽 리스트 · 한글 라벨 | `0860dc7f` |
| [37] | T-SP-9-REST · ZoneProductsModal 진열위치 뱃지 | `4af7a227` |
| [38] | #107·#258 · 발주 리스트 프리미엄 헤더 통계 뱃지 | `752db75b` |
| [39] | T-SP-MASTER-UI · 매장·창고 마스터 관리 UI · SystemSettings 신규 탭 | `0ace666c` |
| [40] | T-AUTO-IMPORT-WEB-REDESIGN · 시스템설정 · Electron sync-agent 다운로드 페이지 | `e5fe6584` |
| [41] | sync-agent README · Phase 3 완료 · 최신 기능 반영 | `2a1f44bf` |
| [42] | #191 Phase C · VendorDetailModal + BorrowingDetailPanel · Modal 프리미티브 마이그레이션 (2건) | `a02cf2dd` |
| [43] | 유통기한 임박 등록 상품 · 리스트 노출 fix · inventory_checks SSOT 이중 저장 | `62282df0` |
| [44] | 실재고확인 · 스캔 카드 헤더 · 코드↔상품명 스왑 · spec 숫자 중복 제거 · 왼쪽 진열구역 표시 | `7dc5ca40` |
| [45] | 실재고 저장 · 실패 감지 강화 + inventory-checks-updated 이벤트 dispatch (연동 페이지 자동 refresh) | `f3473c2e` |
| [46] | RealStockTablePage · 상단 툴바 · 좁은 화면 대응 · 두 줄 분리 (반응형) | `780677f5` |
| [47] | 캐시 헤더 fix · borrowings 3 + returnRequests 2 · no-store · 대원칙 준수 | `1f407e9c` |
| [48] | 유통기한 임박 · legacy products.expiry_date fallback · 기존 등록 상품 리스트 복구 | `c351e1dd` |
| [49] | 발주이력 · 카드 레이아웃 재정리 (발주번호+공급사 2줄) + 상단 헤더 · 자동 정렬 + 상세 시각 구분 | `bbe690a4` |
| [50] | devLog 유틸 도입 · production 노이즈 제거 (App.tsx 8건 + useReextractCell 13건) | `32c86338` |
| [51] | 유통기한 임박 · purchase_details.expiry_date DATE 컬럼 · Phase A(DB) + Phase B(서버) · SSOT 3소스 통합 | `04e6a2f3` |
| [52] | 판매가·현재고 안 나오는 문제 fix · sale_price 매핑 누락 + Number 강제 변환 | `13bedf24` |
| [53] | 발주이력 · 카드 자동정렬 헤더 + 시각 구분 (+shortDate 추출) | `bbe690a4` · `2aef6486` |
| [54] | display-requests 상품명 3단 fallback (products→leading zero→note 파싱) | `10c6d17a` |
| [55] | **크리티컬** · 실재고 저장 duplicate key + 매장 진열도 조회 미반영 fix | `2a2601d3` |
| [56] | **크리티컬** · 방문예약 vendor 로그인 (authorize 5→0) + UI 개선 | `41441ed1` |
| [57] | 상품정보 왼쪽 리스트 · 카드→표 형식 · 자동 정렬 · 폭 드래그 조절 | `919ae8f1` · `28874277` · `bbe02b9f` |
| [58] | 상품정보 상세 뷰 · 폰트 -2 · 라벨 +2 · 공급사 wrap · 규격/단위 다음줄 | `725deeb9` · `3715e6c2` |
| [59] | 편집 모달 · 판매 상태 필수 + shelf 5-slot + 상세 뷰 필드 전체 반영 | `2a4decea` · `373eaf78` · `531a5168` · `dd8674e9` |
| [60] | 이벤트 추천 상품 관리 UI · Phase 1+2 · SplitPanel + 편의 3종 (복사·분류·붙여넣기) | `198650d7` · `216aa015` |
| [61] | 공급사 (주)·주식회사 전수조사 · 52파일 · 표시·검색·매칭·정렬 정제 (DB 저장 원본 유지) | `60bea16f` · `ecdfa2b2` |
| [62] | shelf_positions 3중 방어 · 자동 assign (xlsx) + 클라 폴백 + 관리자 트리거 | `59f48b9f` |
| [63] | devLog 유틸 확산 · 10+파일 (App·OCR·hooks·ProductInfo·MenuCard) | `2b8972b7` · `7e17d68c` · `ba833e49` |
| [64] | 유통기한 임박 리스트 · 규격 컬럼 제거 | `c621332c` |
| [65] | 직원관리 리스트 재설계 v3 · Linear/Attio 톤 · 동그란 아이콘 완전 제거 | `4fb61f1a` |
| [66] | 발주추천 스코어 · 유틸 추출 · 회귀 테스트 8건 · expiry MIN 3소스 UNION | `5ee0bb96` |

---

## 🔵 진행 중 · #253 · Electron 자동 임포트 앱

**위치:** `apps/sync-agent/` · 사용자 테스트 병행

### ✅ 완료된 기능
- Electron v33 + electron-vite + electron-builder 셋업
- 트레이 상주 · 부팅 자동 시작 · 하이브리드 UI (D안)
- 로그인 · 핸드폰번호 + JWT 쿠키 인증 · 자동 refresh (15분 → 30일)
- **아이디 저장** · 다음 실행 자동 채움
- **파일 감시 모드 (chokidar · 기본)** · 새 xlsx 감지 · 10분 debounce · 자동 임포트
- **스케줄 모드** (선택 · 상호배제) · cron 프리셋
- 최신 파일 감지 · 파일명 날짜 우선 · fallback mtime
- `_processed`·`_failed` 자동 관리 · 재시도 성공 시 `_failed → _processed`
- 임포트 · 웹앱 endpoint 재사용 (`/api/upload-*`) · octet-stream + 자동 파라미터
- 로컬 큐 (JSON) · 지수 백오프 재시도
- 데이터 카운트 표시 · '상품 6287개 · 복원 7049개'
- Windows toast · 트레이 상태 색상
- 자동 업데이트 · electron-updater · GitHub Releases
- Logs 탭 · 실행 이력 · 폴더 상태 · 재시도 큐
- Copyright footer · IRUMs · (주)이룸즈

### 🧪 사용자 테스트 병행
- 로그인 · 상품 임포트 · 6287개 성공 확인
- 파일 감시 모드 · 실제 xlsx 저장 · 10분 자동 임포트 · 진행 중

### 🔲 남은 작업 (배포·안정화)
- Installer 재빌드·설치 테스트
- 서버 응답 형식 재검증
- README·매뉴얼

---

## 🟡 활성 PENDING · 자율 진행 가능

| # | 태스크 | 우선순위 | 비고 |
|---|-----|-------|-----|
<!-- 2026-09-18 · #56 · 실재고 매장 X 삭제 UI · 완료 (UI agent) -->
<!-- 2026-09-18 · #149 · large-file 분리 · OcrPage 이미 702줄 (baseline 밖) · 나머지 · 회귀 위험 · 별도 세션 유지 -->
| **#149** | large-file 분리 잔여 · PaymentInfoTab·OrderManagePage·LandingPage·ContractWriterPage 등 | 🟢 P3 | 별도 세션 · 파일당 신중 · 회귀 위험 큼 |
<!-- 2026-09-20 · #301 완료 · SupplierTab 구조 재사용 (좌 리스트 · 우 상세) · 커밋 (multiple) -->
<!-- 2026-09-20 · display_requests 요청자 정보 · migration 20260920_display_requests_requester.sql 실행 완료 · 요청자 저장 활성 -->
<!-- 2026-09-20 · resignation_requests 테이블 · create_resignation_requests.sql 실행 완료 · 사직서 워크플로우 (B) 활성 · 승인 시 employees.retireDate 자동 -->
| **#302** | 공급사 재고확인 페이지 · **DB 매칭 확인** (VendorStockPage · 사용자 보고 · 2026-09-18) | 🔴 P1 | 정보 제대로 안 나옴 · vendor↔products·purchase_details 조인 로직 검증 필요 |
| **#303** | xlsx CDN 스왑 · Option A · 0.20.3 · npm audit clean | 🟡 P2 | 리서치 완료 (agent) · 승인됨 (A) · 30분 |
| **#310** | **반응형 리스트 → 카드 전환** · PC 한 줄 · 모바일 카드형 자동 (사용자 지시 · 2026-09-20) | 🔴 P1 | **전수** · 대원칙 등재 · Tailwind md: breakpoint · 페이지별 순차 · 회귀 X |
| **#311** | **스케쥴표 · 연차 사용 직원 · 상단 알림** (사용자 지시 · 2026-09-20) | 🟡 P2 | 승인된 연차 · 1주일 전부터 · SchedulePage 상단 배너 · "대체인력 확인 요망" · 관리자 안내 |
| **#312** | **승인 연차 · 스케쥴 자동 반영 검증** (사용자 지시 · 2026-09-20) | 🟢 P2 | 서버 · leave 승인 시 · schedule 업데이트 로직 확인 · 없으면 신설 |
<!-- 2026-09-20 · #313 ✅ · c1feb252 · 공급사+판매상태 나란히 + 라벨 폰트 +1 + 필수 미입력 확인창 -->
<!-- 2026-09-20 · #314 · 부분 · 인라인 ShelfPositionSection · ProductCreateModal 내부 (공통 파일 추출은 다음 세션) -->
<!-- 2026-09-20 · #315 · 부분 · s1zone 항상 null 버그 fix (9339f430 · 216ad887) · 매장1 구역 표시 정상화 -->
<!-- 2026-09-20 · #316 ✅ · 013b4684 · ProductInfoPage 우측 라벨 · 트렌드 텍스트 -->
<!-- 2026-09-20 · #317 ✅ · e25f53cd · 진열요청 · Note 입력 공통 Modal -->
| **#318** | **매장 상세위치 저장 pipeline · 전수 조사** (사용자 지시 · 2026-09-20 · 잔여) | 🟡 P2 | 상품 등록·편집 · 실재고 · 상품입고 · 저장 시 store1 detail 확인 · Task #315 부분 fix 후 잔여 |
| **#319** | **공통 ShelfPositionPicker 컴포넌트 추출** (사용자 지시 · 2026-09-20 · 잔여) | 🟢 P3 | ProductCreateModal · RealStockTablePage · ProductArrivalPage · InventoryEditModal · 4곳 공통화 · 별도 세션 |
| **#320** | **근로계약서 작성 · 좌측 페이지 종합 개선** (사용자 지시 · 2026-09-20 · UI 위임 · 다중 chain) | 🟡 P2 | 업무요청 > 서류작성 > 근로계약서 작성 · **1차** (진행 중) · ① 직군 리스트 · settings 값 파생 (하드코딩 X) · ② 계약유형 · 연차 다음줄에 **근무요일** 추가 · ③ 담당업무 섹션에서 **보험 제거** · 하단 보험 섹션에 라벨 추가 · **2차** (chain 대기) · ④ **라벨 폰트 +4 · 전체 통일** (fldLabel 단일 상수 · 들쭉날쭉 X) · ⑤ **근로자 정보 카드** · 라벨+입력 · 라벨+선택 나란히 · **사번 성명 앞** · 사번 = 수정 불가 유일키 (readOnly + 시각적 lock 표시) · ⑥ 목업 (docs/UI_MOCKUP_2026-09-14.html) · 최신 트렌드 · Linear/Vercel 톤 · 세련·예쁨 · UI 대원칙 준수 |
| **#321** | **발주 발송 · 확인창 · 공급사별 상세내역** (사용자 지시 · 2026-09-20) | 🟡 P2 | 발주서 · 발주 발송 버튼 클릭 시 · 확인창(dialog/modal) 표시 · `공급사 XX의 상품 YY *N개* / 상품 ZZ *M개*` 형식 · 공급사별 그룹핑 · 상품·수량 명시 · 한번 더 확인 후 실제 발송 · 오발주 방지 |
| **#322** | **발주이력 · UI 개선** (사용자 지시 · 2026-09-20 · UI) | 🟢 P3 | 발주이력 리스트 · 발주번호·공급사 컬럼 폭 축소 · 매입확인 버튼 한 줄 (wrap 방지) · 예쁘게 (Linear/Vercel 톤) |
| **#323** | **매입이력 · 좌측 공급사별 탭 · 접힘 화살표 필요성 검토** (사용자 지시 · 2026-09-20) | 🟢 P3 | 매입 > 매입이력 · 좌측 공급사별 탭 · 선택 시 나오는 접힘(collapse) 화살표 · 실용성 검토 · 불필요하면 제거 · 사용자 판단 대기 |
| **#324** | **매입이력 · 판매상태 필터 + 2행 레이아웃 + 상품별 표형식 + 반응형 카드** (사용자 지시 · 2026-09-20 · 다중 chain) | 🟡 P2 | 매장 > 매입 > 매입이력 · **1차** (진행 중) · FilterBar 2행 (행1: 뷰+판매상태 · 행2: 기간) + 필터 적용 · **2차** (chain 대기) · **상품별 탭** 왼쪽 상품 리스트 · 카드 → **표(테이블) 형식** · 헤더 클릭 · **자동 정렬** · **3차** (chain 대기) · 반응형(모바일·좁은 폭) 시 · SplitPanel 왼쪽 리스트 · **2~3줄 카드형** (한 줄 리스트 X · 컬럼 위아래 · #310 대원칙 · md: breakpoint) · 공급사별·상품별 양쪽 적용 |

---

## 🐞 에러 태스크 (버그) · 별도 시퀀스

**규칙** (2026-09-20 사용자 지시) · 신규 태스크와 별도 넘버링 · `E-###` prefix · 완료 시 삭제

| # | 버그 | 우선순위 | 재현·비고 |
|---|-----|-------|---------|
<!-- E-001 ✅ · SplitPanel capture phase click blocker · isDraggingRef · 2026-09-20 완료 -->
<!-- E-003 ✅ · ProductCreateModal · 상품명 · autoFocus (lockCode) + autoCapitalize/Correct/spellCheck off · 2026-09-20 완료 -->
| **E-002** | **근로계약서 · 구글드라이브 업로드 실패** (사용자 보고 · 2026-09-20) | 🔴 P1 | 서류작성 > 근로계약서 · 완성 후 Google Drive 업로드 · 저장 실패 · Google API 인증·권한·엔드포인트·CORS·토큰 만료 등 원인 조사 필요 |
<!-- 2026-09-18 · #115 · real_map DROP · 이미 2026-09-08 실행 완료 확인 (server.ts:95 주석) -->
<!-- ~~#115~~ · real_map DROP · ✅ 완료 (2026-09-08 · Supabase SQL Editor) -->
<!-- 2026-09-18 · T-RSTP-TOOLBAR 완료 · [46] 커밋 `780677f5` · flex-col + lg:flex-row 반응형 -->
<!-- 2026-09-18 · T-WAREHOUSE-TAB 조사 결과 · 창고1/2 이미 매장진열 안의 탭 (DisplayPage L663 SplitRightTabs)
     · 별도 페이지·라우트 없음 · 이미 요청 목표 달성 상태
     · 향후 · 2단 탭 (매장구역도 안에 [매장, 창고1, 창고2] 서브탭) 원할 시 · 사용자 명시 후 진행 -->
| ~~T-WAREHOUSE-TAB~~ | ~~창고1/2 → 매장구역도 탭~~ | ⚠️ **재해석 · #325 로 재등재** · 이전 "flat 탭 있음" 판단 · 사용자 의도 오해 · 실제 요구는 **2단 탭 nesting** |
| **#325** | **매장진열 · 매장구역도 안에 창고1·창고2 서브탭 nesting** (사용자 지시 · 서너 번 반복 · 2026-09-20) | 🔴 P1 | 매장진열 · 현재 flat 6탭 (map·warehouse1·warehouse2·stockTable·mismatch·zoneEdit) · **재구성** · 매장구역도(map) 클릭 시 · 내부 서브탭 (매장 · 창고1 · 창고2) · 2단 탭 UI · DisplayPage.tsx SplitRightTabs 재설계 · 나머지 4탭 유지 (stockTable·mismatch·zoneEdit·map-nested) |

---

## 🔲 승인·지시 대기 (착수 전 사용자 확인)

| # | 태스크 | 대기 사유 |
|---|-----|---------|
<!-- 2026-09-18 · #191 Phase C 잔여 3파일 · 조사 결과 · Modal 아닌 hybrid panel 패턴 (mobile-fullscreen + desktop-inline)
     · common/Modal (center 모달) 부적합 · Phase C 스코프 축소 (A안 · 그대로 유지)
     · 향후 · 유사 패턴 3+곳 발견 시 · 신규 프리미티브 MobileFullscreenPanel 추출 검토 (별도 세션) -->
| ~~#191 Phase C · 잔여~~ | ~~Hybrid panel/modal 3파일~~ | ✅ **완료 (스코프 축소 · A안)** · Modal 프리미티브 부적합 · 별도 프리미티브 필요 시 신설 |
<!-- 2026-09-15 · #130 · 차용등록 재설계 · 완료 확인 · Phase E (`eafc05e5`) BorrowingPage v2 스왑 · Detail·Edit 패널 분리 완료 · 원본 legacy 파일 삭제 (`98ae8202`) -->
<!-- 2026-09-18 · FlowTab·LossHistoryTab·DiffTab 컬러 정리 · 완료 (81ef74d1) -->
| **#254~#256** | 세션 보안 강화 · 중복 로그인 방지 · 강제 로그아웃 | 대형 · 별도 세션 · 12-18h |

---

## 🔴 사용자 결정 필요

| # | 태스크 | 결정 사항 |
|---|-----|---------|
<!-- 2026-09-18 · #89 완료 · 3327f509 · DayTimelineModal 탭 dynamic -->
<!-- 2026-09-18 · #90 완료 · ef6ca6f7 · ContractCategory Plan A · union 완화 + 색상 fallback -->
<!-- 2026-09-18 · #91 완료 · c541823f · SchedulePage aggregation 하이브리드 -->
<!-- 2026-09-18 · #92 완료 · 42d2cda5 · CompanyInfoSettingsPage Plan B · Linear rail 통합 -->
| **#107·#258 v4** | 발주 리스트 프리미엄 · 헤더 통계 뱃지 유지 여부 | 사용자 테스트 후 결정 |
| **매입이력 검색** | "테스트" vendor · 매입이력 없음 · union 표시 or 그대로 | 사용자 결정 대기 |

---

<!-- 2026-09-18 · 열린 이슈 · 사용자 지시 · 제거 (재현 시 다시 등록) -->

## ⏸ 외부 대기

- **#42** · 발주 PDF + 카카오톡 · SolAPI 사업자등록증 발급 대기

---

## 🛡️ Spring Security · 확정 상태

- ✅ S5 Audit · S7 Input Validation · S10 Refresh Token
- ⏸ S1/S2/S6/S8/S9 · defer
- ❌ S3/S4 · 취소

## 🚨 백엔드 보안 · 완료

- ✅ Vendor 로그인 · bcrypt 전환 완료 (migration `20260902_vendors_password_hash.sql` · auth.ts L77 bcrypt.compare)
- ✅ `/api/auth/set-password` · authorize(9) 추가
- ✅ requireAuth 재활성화
- ✅ 100MB JSON limit · route-level
- ✅ tsconfig.json exclude 정비

---

## 📋 세션 완료 로그 · 최근

### 2026-09-18 (오늘 · 대형 세션 · 40+ 커밋)
- **크리티컬 fix 4건** · 실재고 duplicate key · 방문예약 vendor · 판매가/재고 안 나옴 · display-requests 상품명
- **상품정보 페이지 전수 재설계** · 왼쪽 리스트 표 형식·자동정렬·폭 드래그 · 상세 뷰 폰트 조정 · 편집 모달 shelf 5-slot + 판매상태
- **이벤트 추천 상품 관리 UI Phase 1+2** · SplitPanel + EventProductPanel · 복사·분류·붙여넣기 3종
- **공급사 (주) 전수조사 52파일** · 표시·검색·매칭·정렬 정제 · DB 저장 원본 유지
- **shelf_positions 3중 방어** · xlsx 임포트 hook + 클라 폴백 + 관리자 트리거
- **직원 리스트 재설계 v3** · Linear/Attio 톤 · 동그란 아이콘 완전 제거
- **devLog 확산** · 10+파일
- **테스트 fix** · ProductInfoPage 3건 + unhandled rejection 10건
- **신규 대원칙 등재** · 리스트 앞 동그란 아이콘 금지

### 2026-09-17 (전날 · 대형 · 13+ 커밋)
- **유통기한 3소스 통합** · Phase A DB + Phase B 서버 · SSOT + legacy 2 UNION
- **사용자 지시 fix** · 유통기한 임박 리스트 + 실재고 저장 이벤트 dispatch + 캐시 헤더 (borrowings/return)
- **발주이력 카드 재정리** · 자동정렬 헤더 · 상세 시각 구분
- **devLog 유틸 도입** · 프로덕션 노이즈 제거
- **사용자 결정 정리** · #191 Phase C 스코프 축소 · T-WAREHOUSE-TAB 이미 완료 확인

### 2026-09-15
- **웹앱 · 12 커밋** · #39·#61·T-SP-BULK·DELETE orphan·T-MENU-BOTTOMNAV·T-SP-9-REST(2)·#191 Phase B·T-PROD-LABEL·#107·#258·탭바 fix
- **sync-agent · 20+ 커밋** · Electron 앱 · 로그인·파일감시·큐·자동업데이트·copyright
- **대원칙 등재** · DB 정합성 절대 유지
- **TASKS.md 정리** · 4파일 → 2파일 (TASKS·TEST_LIST 만) · stale 정리

### 이전 세션 · 요약
- 2026-09-13~14 · 검증 세션 · #20·#36·#44·#47·#48·#50·#52·#54·#63·#64·#68·#70·#72·#73 완료 확인
- 2026-09-10 · 결제탭 전면 개편 · 재고자산/잔고 공식 확정 · 신규 API 4종
- 2026-09-08 · T-SP 세트 14커밋 · shelf_positions JSONB · T-DISPLAY-1
- 2026-09-07 · #115·#117·#119·#120·#121 · expiry_date 버그 · 가격재고 4-col
- 2026-09-06 · LIST-UI-2026 전역 폰트 +2px (30+ 커밋) · 프레임워크 100% 클린
- 2026-09-05 · large-file-warn baseline 0/790 달성
- 2026-09-04 · 공급사재고 페이지 · 스케줄표 모달 탭
- 2026-09-02 · 30+ 커밋 · 카드 결제 시스템 · 거래처 로그인
- 2026-09-01 · 서버 프레임워크 감사 · 55→23 위반
- 2026-08 · Framework Phase 4 · Unit test 2514 · Card 프리미티브 확산

---

**세션 관리:**
- 프레임워크 원칙: `src/components/common/README.md`
- 원칙 규칙: `docs/CODING_PRINCIPLES.md`
- 임금 계산: `docs/PAYROLL_ALGORITHM.md`
- 메모리: `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`
