# 페이지별 UI 요소 (조회·수정·편집·검색·버튼) 전수 체크리스트

> 사용자 지시 · B 방식 · 체크박스·검색·조회·버튼 기능 모두 리스트업 + 모든 페이지 조회/수정/편집 기능 모두
> 사용법 · 사용자가 각 페이지 테스트 시 통과 확인 → Claude 가 `- [ ]` → `- [x]` 로 marking

**아이콘 범례**
- 🔍 검색 · 🔘 버튼/액션 · ✏️ 편집/입력 필드 · ☑ 체크박스/토글 · 📋 드롭다운/셀렉트 · 📤 파일 업로드 · 📊 KPI/차트 · ⚙️ 기타 (드래그·모달·아코디언)

**진행 표시 (Claude 마킹용)**
- `- [ ]` 미확인 · `- [x]` 통과 · `- [!]` 이슈 발견 (원인 표시 예정)

---

# Part 1 · 🔴 크리티컬 페이지 (7)

## 1. LandingPage (메인 · 홈)

### 메인 영역
- [ ] 🔍 메뉴 검색 · 관리자·직원 카드 검색 `LandingPage.tsx:316`
- [ ] 🔘 직원 로그인 · 로그인 모달 오픈 `LandingPage.tsx:559`
- [ ] 🔘 거래처 로그인 · 거래처 로그인 모달 오픈 `LandingPage.tsx:568`
- [ ] 🔘 카카오톡 채널 · 친구추가 URL 이동 `LandingPage.tsx:591`
- [ ] ⚙️ 세션 만료 배너 닫기 `LandingPage.tsx:276`

### 오늘의 현황 (TodayStatusPanel)
- [ ] 🔘 전체 N건 · 상세 리스트 토글 `TodayStatusPanel.tsx:83`
- [ ] 🔘 승인대기 · 경영관리 이동 `TodayStatusPanel.tsx:96`
- [ ] 🔘 연차 승인 · 승인 페이지 이동 `TodayStatusPanel.tsx:108`
- [ ] 🔘 진열 요청 · 요청 목록 이동 `TodayStatusPanel.tsx:118`
- [ ] 🔘 발주 요청 · 발주 페이지 이동 `TodayStatusPanel.tsx:127`
- [ ] 🔘 배치구역 불일치 · 매장구역 탭 이동 `TodayStatusPanel.tsx:136`

### 관리자 도구 (level ≥ 5)
- [ ] 🔘 매장관리 · 진입 `LandingPage.tsx:384`
- [ ] 🔘 경영관리 · 진입 `LandingPage.tsx:389`
- [ ] 🔘 요청목록 조회 · 진입 `LandingPage.tsx:399`
- [ ] 🔘 데이터 업로드 · 모달 오픈 `LandingPage.tsx:414`
- [ ] 🔘 설정 · 권한·환경 진입 `LandingPage.tsx:425`

### 직원 도구
- [ ] 🔘 약사 전용 · 진입 `LandingPage.tsx:445`
- [ ] 🔘 스케줄표 조회 · 진입 `LandingPage.tsx:451`
- [ ] 🔘 실재고 확인 · 진입 `LandingPage.tsx:456`
- [ ] 🔘 상품입고 · 진입 `LandingPage.tsx:461`
- [ ] 🔘 연차 신청 · 진입 `LandingPage.tsx:468`
- [ ] 🔘 점심 불참 · 진입 `LandingPage.tsx:474`
- [ ] 🔘 내 요청목록 · 진입 `LandingPage.tsx:483`
- [ ] 🔘 이슈공유 · 게시판 진입 `LandingPage.tsx:496`

### 거래처 도구
- [ ] 🔘 방문예약 · 진입 `LandingPage.tsx:612`
- [ ] 🔘 공급사 정보 · 조회·수정 모달 `LandingPage.tsx:617`
- [ ] 🔘 공급사 재고확인 · 모달 오픈 `LandingPage.tsx:642`

---

## 2. SchedulePage (스케줄)

### 헤더·필터
- [ ] 🔘 관리자 로그인 · 모달 오픈 `SchedulePage.tsx:500`
- [ ] 📋 직군 필터 · 약사/사원/창고/매장 `ScheduleFilterBar.tsx:69`
- [ ] 📋 정렬 · 출근/직군/이름 `ScheduleFilterBar.tsx:76`
- [ ] 🔍 성명 검색 · 직원명 `ScheduleFilterBar.tsx:98`
- [ ] 🔘 순서초기화 · 드래그 순서 초기화 `ScheduleFilterBar.tsx:82`

### 툴바
- [ ] 🔘 이전 달 · 월 네비 `ScheduleToolbar.tsx:66`
- [ ] 🔘 다음 달 · 월 네비 `ScheduleToolbar.tsx:77`
- [ ] 🔘 월 클릭 · 1일 이동 `ScheduleToolbar.tsx:72`
- [ ] 🔘 직원 등록 · 모달 오픈 `ScheduleToolbar.tsx:101`
- [ ] 🔘 오늘 · 현재 날짜 스크롤 `ScheduleToolbar.tsx:107`
- [ ] 🔘 편집 · 편집 모드 토글 `ScheduleToolbar.tsx:115`
- [ ] 🔘 확정/해제 · 월간 확정 `ScheduleToolbar.tsx:124`
- [ ] 🔘 전월복사 · 복사 모달 (⚠️ #60 회귀) `ScheduleToolbar.tsx:134`
- [ ] 🔘 인건비(hr) · 근무시간 표시 토글 `ScheduleToolbar.tsx:147`

### 스케줄 그리드
- [ ] 🔘 직원 셀 클릭 · 타입 순환 (편집모드) · `ScheduleGrid`
- [ ] 🔘 직원명 클릭 · EmployeeCalendarModal (⚠️ #62 4탭)
- [ ] 🔘 설정 아이콘 · 직원 편집
- [ ] 🔘 삭제 아이콘 · 확인 후 삭제
- [ ] ⚙️ 점심·휴게 시간 · 모달
- [ ] ⚙️ 행 드래그 · 직원 순서 재배치

### 모달 (5종)
- [ ] 🔘 직원 등록/수정 폼 · EmployeeFormModal
- [ ] 🔘 월간 복사 · CopyMonthModal
- [ ] 🔘 일일 타임라인 · DayTimelineModal
- [ ] 🔘 직원 캘린더 · EmployeeCalendarModal
- [ ] 🔘 휴게시간 · BreakModal

---

## 3. OrderManagePage (매장>발주 · 상위탭 4)

### 상위 탭
- [ ] 📋 발주 탭 · 발주 관리 `OrderManagePage.tsx:541`
- [ ] 📋 매입 탭 · 매입 관리 `OrderManagePage.tsx:542`
- [ ] 📋 결제/세금 탭 `OrderManagePage.tsx:543`
- [ ] 📋 통계 탭 `OrderManagePage.tsx:544`

### 발주필요 (OrderNeedTab)
- [ ] 🔍 상품 검색 · 상품명/코드/공급사 `OrderNeedTab.tsx:172`
- [ ] ☑ 조건 적용 · 재고 부족 토글 `OrderNeedTab.tsx:174`
- [ ] 📋 카테고리 필터 · 공급사 카테고리 `OrderNeedTab.tsx:178`
- [ ] ☑ 판매 필터 · 판매중/단종 `OrderNeedTab.tsx:176`
- [ ] 🔘 고급설정 · 필터 상세 모달 `OrderNeedTab.tsx:196`
- [ ] 📋 정렬 · 공급사/이름/현고/부족량
- [ ] ☑ 상품 다중 선택
- [ ] 🔘 발주 추가 · 선택 상품 요청 `OrderNeedTab.tsx:601`
- [ ] 🔘 상품 클릭 · 우측 상세 패널

### 발주요청 (OrderRequestTab)
- [ ] 🔍 발주서 검색
- [ ] 📋 카테고리 필터
- [ ] 📋 정렬
- [ ] ☑ 다중 선택
- [ ] 🔘 모두 선택
- [ ] 🔘 발주서 생성 · 선택 → 발주서
- [ ] 🔘 발주 삭제 · 일괄

### 매입 서브탭
- [ ] 📋 거래명세서 · OCR/스캔 입고 · OcrPage
- [ ] 📋 유통기한임박 · ExpiryImminentTab
- [ ] 📋 매입이력 · PurchaseHistoryTab

### 결제 서브탭
- [ ] 📋 공급사결제 · VendorPaymentPanel
- [ ] 📋 결제입력 · PaymentInputPage
- [ ] 📋 차용입력 · BorrowingPage
- [ ] 📋 세금계산서 · VatPreparePage
- [ ] 📋 결제카드등록 · CardRegisterPage
- [ ] 📋 카드별결제내역 · CardHistoryPage

### 통계 서브탭 (6)
- [ ] 📋 판매대시보드 · DashboardTab
- [ ] 📋 판매추이 · TrendingTab
- [ ] 📋 카테고리별 · CategoryTab
- [ ] 📋 재고흐름 · FlowTab
- [ ] 📋 공급사별 · SupplierTab
- [ ] 📋 차이분석 · DiffTab

### 공용 모달
- [ ] 🔘 발주서 작성 (OrderManageModals)
- [ ] 🔘 담당자 연락 팝오버
- [ ] 🔘 공급사 정보 모달
- [ ] 🔘 재고 조정 모달
- [ ] 🔘 입고 확정 (🚧 개발중 안내 · #106)

---

## 4. ProductArrivalPage (상품입고)

### 상품입고 탭 (검수)
- [ ] 🔘 바코드 스캔 · 모달 오픈 `ProductArrivalPage.tsx:436`
- [ ] 🔍 상품명·코드 검색 · handleScan `ProductArrivalPage.tsx:458`
- [ ] 🔘 상품등록 페이지 이동 · 미등록 코드 (⚠️ #108) `ProductArrivalPage.tsx:474`
- [ ] 🔘 초기화 · 리스트 전체 초기화 `ProductArrivalPage.tsx:310`
- [ ] ☑ 입고/입고내역 탭 전환 `ProductArrivalPage.tsx:376`

### 각 행 (ArrivalRowCard)
- [ ] 🔘 수량 -1 감소 `ArrivalRowCard.tsx:262`
- [ ] 🔘 수량 +1 증가 `ArrivalRowCard.tsx:262`
- [ ] ✏️ 수량 직접 입력 `ArrivalRowCard.tsx:262`
- [ ] 🔘 일치 상태 표시 `ArrivalRowCard.tsx:279`
- [ ] 🔘 불일치 상태 표시 `ArrivalRowCard.tsx:296`
- [ ] 🔘 삭제 · 항목 제거 `ArrivalRowCard.tsx:315`
- [ ] 🔘 입고구역 선택 · RealMapSelector `ArrivalRowCard.tsx:76`
- [ ] 🔍 입고구역 검색 · 구역명 `ArrivalRowCard.tsx:96`
- [ ] ✏️ 단가 입력 (⚠️ #107 · products.purchase_price 반영) `ArrivalRowCard.tsx:333`
- [ ] ✏️ 유통기한 입력 (⚠️ #98) `ArrivalRowCard.tsx:347`

### 등록 액션
- [ ] ✏️ 품목이상 메모 · 불일치 시 `ProductArrivalPage.panels.tsx:105`
- [ ] 🔘 전체 일치·등록 · DB 저장 `ProductArrivalPage.panels.tsx:120`
- [ ] 🔘 불일치 포함·등록 · DB 저장 `ProductArrivalPage.panels.tsx:120`

### 입고내역 탭
- [ ] 📋 기간 필터 · 7/30/90일 `ProductArrivalPage.panels.tsx:254`
- [ ] 🔘 새로고침 `ProductArrivalPage.panels.tsx:261`
- [ ] ⚙️ 공급사별 아코디언 확장/접힘 `ProductArrivalPage.panels.tsx:282`
- [ ] 🔘 상세 조회 · 모달 `ProductArrivalPage.panels.tsx:348`
- [ ] 🔘 삭제 · 이력 삭제 `ProductArrivalPage.panels.tsx:352`

---

## 5. ScanPage (실재고 입력 · 스캔)

### 좌측 패널
- [ ] 🔘 바코드 스캔 · 모달 `ScanPage.panels.tsx:62`
- [ ] 🔍 상품명·코드 검색 `ScanPage.panels.tsx:75`
- [ ] ☑ 중복 스캔 자동 +1 · 매장1 자동 증가 `ScanPage.panels.tsx:81`
- [ ] 🔘 상품등록 · 미등록 신규 (권한자) `ScanPage.panels.tsx:105`

### 임시저장 복구 배너
- [ ] 🔘 복구 · 이전 세션 `ScanPage.tsx:652`
- [ ] 🔘 무시 · 임시저장 삭제 `ScanPage.tsx:660`

### 우측 헤더
- [ ] 🔘 진열요청 · 최근 스캔 상품 (⚠️ #64) `ScanRightPanel.tsx:51`
- [ ] 🔘 유통기한임박 · 정보 입력 `ScanRightPanel.tsx:58`

### 각 행 (StockRowCard)
- [ ] ⚙️ 카드 접힘/확장 `StockRowCard.tsx:196`
- [ ] 🔘 수량 -1 (창고1·2·매장1·2·3) `StockRowCard.tsx:262`
- [ ] 🔘 수량 +1 (창고1·2·매장1·2·3) `StockRowCard.tsx:262`
- [ ] ✏️ 수량 직접 입력 (5 슬롯) `StockRowCard.tsx:262`
- [ ] 🔍 매장구역 선택 (매장1·2·3) `StockRowCard.tsx:119`
- [ ] 🔘 매장구역 저장 · autosave `StockRowCard.tsx:86`
- [ ] 🔘 개별 저장 · 해당 행 `StockRowCard.tsx:200`
- [ ] 🔘 이력 조회 · 실재고 이력 모달 `StockRowCard.tsx:217`
- [ ] 🔘 진열요청 · 개별 행 `StockRowCard.tsx:222`
- [ ] 🔘 유통기한임박 토글 `StockRowCard.tsx:230`
- [ ] 🔘 삭제 · 항목 제거 `StockRowCard.tsx:242`

### 저장
- [ ] 🔘 검토 후 저장 · 검토 시트 오픈 `ScanPage.panels.tsx:719`
- [ ] 🔘 전체 저장 · 일괄
- [ ] 🔘 초기화

### 모달
- [ ] 🔘 실재고 이력 모달 닫기 `ScanPage.tsx:763`
- [ ] ✏️ 유통기한 입력 · 만료일 `ExpiryDateModal:38`
- [ ] 🔘 유통기한 저장 · inventory_checks `ExpiryDateModal:120`
- [ ] 🔘 미등록 상품 등록 완료 `ScanPage.tsx:740`

---

## 6. RequestsPage (승인요청 · 서브탭 7)

### 상위 탭
- [ ] 🔘 진열요청 탭 `RequestsPage.tsx:517`
- [ ] 🔘 점심불참 탭 (관리자) `RequestsPage.tsx:517`
- [ ] 🔘 연차승인 탭 (관리자) `RequestsPage.tsx:517`
- [ ] 🔘 거래처승인 탭 (관리자) `RequestsPage.tsx:517`
- [ ] 🔘 발주요청 탭 (숨김 · 조건부)

### 진열요청 탭
- [ ] ☑ 전체 선택/해제 `RequestsPage.tabs.tsx:110`
- [ ] 🔘 선택삭제 `RequestsPage.tsx:553`
- [ ] 🔘 전체삭제 `RequestsPage.tsx:554`
- [ ] 🔘 새로고침 `ListToolbar.tsx:57`
- [ ] 🔘 알림전송 · 담당자 알림 `RequestsPage.tabs.tsx:84-91`
- [ ] ☑ 행 체크박스 · 개별 선택 `RequestsPage.tabs.tsx:171`
- [ ] 🔘 창고준비/대기 토글 `RequestsPage.tabs.tsx:199`
- [ ] 🔘 진열완료/대기 토글 `RequestsPage.tabs.tsx:231`

### 발주요청 탭
- [ ] ☑ 전체 선택/해제
- [ ] 🔘 선택삭제 · 전체삭제 · 새로고침
- [ ] ☑ 행 체크박스
- [ ] 🔘 발주요청 리스트 추가 `RequestsPage.tabs.tsx:405`
- [ ] 🔘 요청됨 (표시만)

### 구역불일치 탭 (MismatchPanel)
- [ ] ☑ 전체 선택/해제 · 개별 체크
- [ ] 🔘 선택삭제 · 전체삭제 · 새로고침
- [ ] 🔘 다시 시도 · 오류 재시도

### 실재고 차이 탭
- [ ] ☑ 전체/개별 선택
- [ ] 🔘 선택삭제·전체삭제·새로고침
- [ ] 🔘 발주요청 · 실재고 기반 `RequestsPage.tabs.tsx:536`
- [ ] 🔘 점검 이력 로그 아코디언 `RequestsPage.tabs.tsx:558`

### 점심불참 탭
- [ ] 🔘 새로고침 `LunchPanel.tsx:40`

### 연차승인 탭 (LeavePage embedded)
- [ ] 🔘 승인 · 연차 요청
- [ ] 🔘 거절 · 연차 요청

### 거래처승인 탭 (VendorApprovalPanel)
- [ ] 🔘 새로고침 `VendorApprovalPanel.tsx:130`
- [ ] 🔘 승인 `VendorApprovalPanel.tsx:224`
- [ ] 🔘 거절 (사유 입력 폼) `VendorApprovalPanel.tsx:214`
- [ ] ✏️ 거절 사유 입력 `VendorApprovalPanel.tsx:183`
- [ ] 🔘 취소 (거절 취소) `VendorApprovalPanel.tsx:192`
- [ ] 🔘 거절 확정 `VendorApprovalPanel.tsx:200`

---

## 7. PaymentInputPage (매장>결제>결제입력) + Card

### 상단 검색·필터
- [ ] 🔍 공급사명 검색 · 자동완성 `PaymentInputPage.tsx:674`
- [ ] ✏️ 검색 입력창 · Enter 첫 매치 `PaymentInputPage.tsx:680`
- [ ] 📋 공급사 분류 필터 · 칩 `PaymentInputPage.tsx:569`
- [ ] 🔘 초기화 · 공급사 해제 `PaymentInputPage.tsx:550`

### 공급사 드롭다운
- [ ] 🔘 공급사 항목 선택 `PaymentInputPage.tsx:699`

### 좌측 KPI
- [ ] 📊 잔고 (미결제) `PaymentInputPage.tsx:297`
- [ ] 📊 총 매입 (12개월) `PaymentInputPage.tsx:304`
- [ ] 📊 총 판매 (12개월) `PaymentInputPage.tsx:312`

### 결제 입력 폼 (PaymentEntryForm)
- [ ] ✏️ 결제일 · 날짜 입력 `PaymentEntryForm.tsx:178`
- [ ] 🔘 달력 피커 오픈 `PaymentEntryForm.tsx:186`
- [ ] 📋 결제 방법 · 카드/이체/현금/기타 `PaymentEntryForm.tsx:200`
- [ ] 📋 결제카드 선택 · 등록 카드 (⚠️ #69) `PaymentEntryForm.tsx:236`
- [ ] 📋 은행 선택 or 직접입력 `PaymentEntryForm.tsx:279`
- [ ] ✏️ 은행명 직접입력 `PaymentEntryForm.tsx:269`
- [ ] ✏️ 결제 금액 `PaymentEntryForm.tsx:253`
- [ ] ☑ 세금계산서 발행 · VAT 자동 `PaymentEntryForm.tsx:360`
- [ ] ✏️ 메모 (선택) `PaymentEntryForm.tsx:389`
- [ ] 🔘 결제 등록 · 저장 `PaymentEntryForm.tsx:413`

### 우측 탭
- [ ] 🔘 최근결제내역 탭 `PaymentInputPage.tsx:344`
- [ ] 🔘 발주내역 탭
- [ ] 🔘 판매내역 탭
- [ ] 📊 발주 · 월별 매입 bar `PaymentInputPage.tsx:359`
- [ ] 📊 판매 · 상품별 line `PaymentInputPage.tsx:418`
- [ ] 📊 최근결제 · 3 KPI 카드 `PaymentInputPage.tsx:465`

### CardRegisterPage
- [ ] 🔘 신규 · 새 카드 폼 `CardRegisterPage.tsx:150`
- [ ] 🔘 카드 리스트 항목 선택 `CardRegisterPage.tsx:165`
- [ ] 📋 카드사 · 드롭다운 `CardRegisterPage.tsx:209`
- [ ] ✏️ 별칭 `CardRegisterPage.tsx:219`
- [ ] ✏️ 뒷 4자리 · 숫자 `CardRegisterPage.tsx:229`
- [ ] ✏️ 결제일 · 1~31 `CardRegisterPage.tsx:242`
- [ ] ✏️ 비고 `CardRegisterPage.tsx:265`
- [ ] ☑ 활성 카드 토글 `CardRegisterPage.tsx:275`
- [ ] 🔘 등록/저장 `CardRegisterPage.tsx:302`
- [ ] 🔘 비활성화 (soft delete) `CardRegisterPage.tsx:298`

### CardHistoryPage
- [ ] 📊 등록 카드 · KPI `CardHistoryPage.tsx:131`
- [ ] 📊 총 결제 12개월 `CardHistoryPage.tsx:138`
- [ ] 📊 이번달 예정 `CardHistoryPage.tsx:144`
- [ ] 📊 차월 예정 (강조) `CardHistoryPage.tsx:151`
- [ ] ⚙️ 카드 아코디언 · 접기/열기 `CardHistoryPage.tsx:180`
- [ ] 📊 카드별 월별 미니 bar
- [ ] 📊 월별 카드 stacked bar `CardHistoryPage.tsx:262`
- [ ] 📊 카드별 share pie `CardHistoryPage.tsx:300`

---

# Part 2 · 🟡 매장 매입/판매 페이지 (5)

## 8. ProductInfoPage (매장>매입>상품정보)

### 좌측 리스트
- [ ] 🔍 검색 · 상품명·코드·공급사 `ProductInfoPage.tsx:578`
- [ ] 🔘 상품 등록 · 신규 (권한자) `ProductInfoPage.tsx:583`

### 우측 상세 편집 (ProductDetailView)
- [ ] 🔘 수정 · 편집 진입 `ProductInfoPage.tsx:371`
- [ ] 🔘 저장 · 변경사항 `ProductInfoPage.tsx:352`
- [ ] 🔘 취소 · 편집 중단 `ProductInfoPage.tsx:360`
- [ ] ✏️ 상품명 · 텍스트 `ProductInfoPage.tsx:391`
- [ ] ✏️ 공급사 `ProductInfoPage.tsx:392`
- [ ] ✏️ 카테고리 `ProductInfoPage.tsx:393`
- [ ] ✏️ 판매가 · 숫자 `ProductInfoPage.tsx:394`
- [ ] ✏️ 매입가 · 숫자 `ProductInfoPage.tsx:395`
- [ ] ✏️ 적정재고 · 숫자 `ProductInfoPage.tsx:396`
- [ ] ✏️ 실제배정구역 `ProductInfoPage.tsx:397`
- [ ] ✏️ 단위 · 규격 · 바코드 · 브랜드 · 제조사 `ProductInfoPage.tsx:398-402`
- [ ] 📋 판매상태 · 판매중/중지 (인라인) `ProductInfoPage.tsx:159`
- [ ] 📋 진열위치 (인라인) `ProductInfoPage.tsx:298`
- [ ] ⚙️ 공급사 클릭 · 정보 모달 `ProductInfoPage.tsx:301`

### ProductCreateModal
- [ ] ✏️ 상품코드 (필수) `ProductCreateModal.tsx:316`
- [ ] ✏️ 상품명 (필수) `ProductCreateModal.tsx:328`
- [ ] ✏️ 공급사 · 자동완성 `ProductCreateModal.tsx:346`
- [ ] 📋 공급사 클릭 선택 `ProductCreateModal.tsx:361`
- [ ] ✏️ 분류코드 `ProductCreateModal.tsx:374`
- [ ] ✏️ 단위·규격 `ProductCreateModal.tsx:382`
- [ ] ⚙️ 카테고리 검색 · 구역지정 `ProductCreateModal.tsx:393`
- [ ] ✏️ 판매가·매입가 `ProductCreateModal.tsx:447`
- [ ] ✏️ 브랜드·제조사 `ProductCreateModal.tsx:459`
- [ ] 🔘 참조상품 · 빈필드 채움 `ProductCreateModal.tsx:420`
- [ ] 🔘 초기화 · 폼 리셋 `ProductCreateModal.tsx:472`
- [ ] 🔘 취소 · 등록 `ProductCreateModal.tsx:481-488`

---

## 9. BorrowingPage (매장>발주>차용)

### 좌측 리스트
- [ ] 🔍 검색 · 공급사·상품·계약번호 `BorrowingPage.tsx:335`
- [ ] 🔘 신규 등록 · 차용계약 `BorrowingPage.tsx:339`
- [ ] 📋 상태 필터 · 전체/미해결 `BorrowingPage.tsx:172`
- [ ] 📋 기간 프리셋 · 30/60/90 `BorrowingPage.tsx:183`
- [ ] 🔘 새로고침 `BorrowingPage.tsx:194`
- [ ] ⚙️ 차용카드 클릭 · 편집 `BorrowingPage.tsx:214`

### 편집·상세
- [ ] ✏️ 신규/편집 통합 폼 `BorrowingPage.tsx:252`
- [ ] ⚙️ 상세조회 · 정보표시 `BorrowingPage.tsx:277`

---

## 10. SalesTrendPage (매장>판매)

### 메인 탭
- [ ] 🔘 판매추이차트 `SalesTrendPage.tsx:170`
- [ ] 🔘 공급사별판매
- [ ] 🔘 판매대시보드 (신규)

### 상품별 추이 (ProductTrendTab)
- [ ] 📋 입도선택 · 10일/월별 `ProductTrendTab.tsx:29`
- [ ] 📋 기간선택 · 1-6개월
- [ ] ⚙️ 차트 리사이저 · 폭조절 `ProductTrendTab.tsx:76`
- [ ] 🔍 정보확인 · 상품 조회 `SalesTrendPage.tsx:98`

### 정보확인 모달
- [ ] 🔍 상품명 검색 `SalesTrendPage.tsx:233`

### 숨김항목 관리
- [ ] 🔘 새로고침 `SalesTrendPage.tsx:281`
- [ ] 🔘 다시표시 · 숨김해제 `SalesTrendPage.tsx:312`

---

## 11. VatPreparePage (경영>부가세)

### 상단 헤더
- [ ] 🔘 현재반기 프리셋 `VatPreparePage.tsx:336`
- [ ] 🔘 직전반기 프리셋
- [ ] 🔘 올해 프리셋
- [ ] 📋 기간선택 · 반기/분기 `VatPreparePage.tsx:349`
- [ ] 🔘 새로고침 `VatPreparePage.tsx:368`

### 매출 탭 (SalesTab)
- [ ] 🔘 새로고침 · 월별 갱신 `SalesTab.tsx:78`
- [ ] ✏️ 경비입력 · 숫자 `SalesTab.tsx:299`

### 공급사 탭 (SupplierVatTab)
- [ ] ⚙️ 공급사선택 · 상세조회 `SupplierVatTab.tsx:148`

### 체크리스트 (진행상태)
- [ ] ☑ 부가세확인
- [ ] ☑ 계산서수집
- [ ] ☑ 부가세계산
- [ ] ☑ 신고준비

---

## 12. StockCheckPage (재고확인)

- [ ] 🔍 상품검색 · 약품제품명 `StockCheckPage.tsx:171`
- [ ] 🔘 검색초기화 `StockCheckPage.tsx:177`
- [ ] 🔘 상품명 정렬 (오름차순) `StockCheckPage.tsx:188`
- [ ] 🔘 재고 정렬 (숫자순)
- [ ] 🔘 구역 정렬 (위치순)
- [ ] 🔘 공급처 정렬

---

# Part 3 · HR/직원 8 페이지 (조사 진행 중 · 완료 시 append)

_TBD_

# Part 4 · Display 서브·기타 6 페이지 (조사 진행 중)

_TBD_

# Part 5 · 설정 6 페이지 (조사 진행 중)

_TBD_

# Part 6 · MyPage/Board/Pharmacist/Reservation/Lunch/Leave 6 페이지 (조사 진행 중)

_TBD_

---

# 마킹 규칙 (사용자·Claude 협업)

**사용자 → Claude 리포트 예시**
- "홈 다 정상" → Claude · LandingPage 26 항목 일괄 `- [x]`
- "발주 · 발주추가 버튼 안 됨" → Claude · 해당 항목 `- [!]` + 이슈 조사
- "매장구역도 담당자 드래그만 이상" → Claude · 해당 항목만 `- [!]`

**Claude 대응**
- 통과 항목 · `- [x]` 마킹
- 이슈 발견 · `- [!]` 마킹 + 코드 조사 → 원인 리포트 → fix
- 완료 후 · Part 진척 리포트 (n/m 항목 통과)

---

**작성일** · 2026-09-03
**커버 페이지 · Part 1-2 완료 · Part 3-6 조사 진행 중**
**Part 1-2 총 항목 · 200+ 체크박스**
