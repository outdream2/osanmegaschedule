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

# Part 3 · 🟡 HR/직원 8 페이지

## 13. StaffManagePage (경영>직원관리)

### 헤더·필터
- [ ] 🔍 검색 · 이름·직군·연락처 `StaffToolbar.tsx:55`
- [ ] 📋 상태 필터 · 재직/퇴사예정/퇴사/전체 `StaffToolbar.tsx:68`
- [ ] 📋 직군 필터 · 전체/부서별 `StaffToolbar.tsx:85`
- [ ] 🔘 신규 등록 · 직원 추가 `StaffToolbar.tsx:128`
- [ ] 🔘 새로고침 `StaffToolbar.tsx:120`
- [ ] 🔘 스케쥴 · 스케줄 페이지 이동 `StaffToolbar.tsx:111`

### 상세 편집 (StaffDetailPanel)
- [ ] 🔘 직원 선택 · 상세 표시
- [ ] ✏️ 이름 편집 `StaffDetailPanel.tsx:172`
- [ ] 📋 직군 선택 (position) `StaffDetailPanel.tsx:185`
- [ ] 📋 직급 선택 (rank) `StaffDetailPanel.tsx:202`
- [ ] 📋 계약유형 · 정규직/계약직/시간급 `StaffDetailPanel.tsx:229`
- [ ] 📋 Overview 탭 · 근속/연차/평가 `StaffDetailPanel.tsx:298`
- [ ] 📋 Personal 탭 · 생년월일/주소/성별
- [ ] 📋 Job & Wage 탭 · 급여/근무조건
- [ ] 📋 Documents 탭 · 이력서/통장사본/계약서
- [ ] 📋 Time Off 탭 · 연차 이력
- [ ] 🔘 편집 · 정보 수정 진입 `StaffDetailPanel.tsx:279`
- [ ] 🔘 저장 · DB 저장 `StaffDetailPanel.tsx:269`
- [ ] 🔘 취소 · 편집 취소 `StaffDetailPanel.tsx:263`
- [ ] 🔘 삭제 · 직원 제거 `StaffDetailPanel.tsx:285`

---

## 14. ContractWriterPage (경영>계약서 작성)

### 모드 선택
- [ ] 🔘 여기서 작성 · 폼 모드 `ContractWriterPage.tsx:233`
- [ ] 🔘 PDF 업로드 · 파일 모드 `ContractWriterPage.tsx:272`

### 좌측 폼
- [ ] 🔍 근로자 검색 · 이름 자동완성 · EmployeeCard
- [ ] ✏️ 성명 · 근로자 이름 `ContractLeftForm.tsx:117`
- [ ] ✏️ 생년월일
- [ ] ✏️ 주소 (Daum 모달)
- [ ] 🔘 주소 검색 `ContractWriterPage.tsx:219`

### 근무조건
- [ ] ☑ 요일 · 월화수목금토일 체크박스
- [ ] 📋 주중/주말 시간
- [ ] 📋 직군 · 약사/약무사/점원
- [ ] ✏️ 근무지역

### 임금
- [ ] ✏️ 기본급 · 월급
- [ ] ✏️ 시급 override
- [ ] ✏️ 부양가족 수
- [ ] 📋 원천징수율 · 3/6/8%
- [ ] ✏️ 자녀 수
- [ ] ✏️ 추가공제

### 우측 미리보기
- [ ] 📋 서명 진행률 · 2/5 bar `ContractWriterPage.tsx:300`
- [ ] 🔘 전체 서명 지우기 `ContractWriterPage.tsx:314`
- [ ] 🔘 서명 spot 클릭 · ContractPreview
- [ ] 🔘 계약완료 승인 · DB 저장 `ContractWriterPage.tsx:338`
- [ ] 🔘 임시저장 · 로컬 `ContractWriterPage.tsx:354`
- [ ] 🔘 PDF 다운 · 로컬 파일 `ContractWriterPage.tsx:369`
- [ ] 🔘 연장 · 기존 계약 연장 `ContractWriterPage.tsx:414`
- [ ] ✏️ 연장 개월 `ExtendContractModal.tsx:144`
- [ ] 🔘 초기화 · 폼 리셋 `ContractWriterPage.tsx:429`

---

## 15. ResignationWriterPage (사직서 작성)

### 좌측 폼 (직원 정보)
- [ ] 🔍 근로자 검색 · 이름 `ResignationWriterPage.tsx:426`
- [ ] ✏️ 성명 · 사번 · 부서 · 직급 · 생년월일 · 입사일 `ResignationWriterPage.tsx:428-525`

### 사직 정보
- [ ] ✏️ 마지막 근무일 (필수) `ResignationWriterPage.tsx:542`
- [ ] ✏️ 제출일 `ResignationWriterPage.tsx:560`
- [ ] ✏️ 수신 · 대표자명 `ResignationWriterPage.tsx:571`
- [ ] 📋 퇴사 사유 · 4개 `ResignationWriterPage.tsx:584`
- [ ] ✏️ 사유 상세 (자유) `ResignationWriterPage.tsx:610`
- [ ] ✏️ 인수인계 `ResignationWriterPage.tsx:626`

### 금품·회사
- [ ] ✏️ 금품 지급기일 `ResignationWriterPage.tsx:640`
- [ ] ✏️ 회사명 · 대표자명 `ResignationWriterPage.tsx:670-683`

### 우측 미리보기·액션
- [ ] 🔘 서명 spot · 3개 영역
- [ ] 🔘 PDF 다운 · A4 1페이지 `ResignationWriterPage.tsx:740`
- [ ] 🔘 사직서 제출 · DB + 관리자 알림 `ResignationWriterPage.tsx:698`
- [ ] 🔘 초기화 · 폼 리셋 `ResignationWriterPage.tsx:376`

---

## 16. ResignationApprovalPage (사직서 승인)

### 탭
- [ ] 📋 승인 대기 · 대기중 수 `ResignationApprovalPage.tsx:210`
- [ ] 📋 처리 완료 · 완료 수

### 리스트
- [ ] 🔘 직원명 · 상세 표시 `ResignationApprovalPage.tsx:276`
- [ ] 🔘 상세 보기 토글 (접기/펼치기) `ResignationApprovalPage.tsx:308`
- [ ] ⚙️ 상태 배지 · 대기/승인/반려

### 상세 (접힘)
- [ ] 💬 사유 상세 표시
- [ ] 📝 인수인계 표시
- [ ] ✍️ 서명 이미지 표시
- [ ] ⛔ 반려 사유 표시

### 액션 (대기만)
- [ ] ✏️ 반려 사유 입력 `ResignationApprovalPage.tsx:363`
- [ ] 🔘 승인 · 사직 승인 `ResignationApprovalPage.tsx:371`
- [ ] 🔘 반려 · 사직 반려 `ResignationApprovalPage.tsx:379`
- [ ] 🔘 취소 · 검토 취소 `ResignationApprovalPage.tsx:388`

---

## 17. ApprovalRequestPage (승인요청 3탭)

- [ ] 📋 연차승인 탭 `ApprovalRequestPage.tsx:45`
- [ ] 📋 점심불참 탭
- [ ] 📋 사직서 작성 탭 `ApprovalRequestPage.tsx:152`
- [ ] ⚙️ 퇴사 게이트 · 상태 확인 `ApprovalRequestPage.tsx:192`

## 18. ApprovalCenterPage (승인대기 2탭)

- [ ] 📋 연차승인 탭 (대기 수) `ApprovalCenterPage.tsx:70`
- [ ] 📋 사직서승인 탭
- [ ] 🔘 장시간 터치 · 관리자 재정렬 `ApprovalCenterPage.tsx:75`

---

## 19. HrFormsPage (각종양식)

### 헤더
- [ ] 🔘 새로고침 · 목록 재로드 `HrFormsPage.tsx:238`
- [ ] 🔘 양식 업로드 폼 표시 `HrFormsPage.tsx:254`

### 업로드 폼
- [ ] ✏️ 양식명 `HrFormsPage.tsx:284`
- [ ] 📋 카테고리 · 계약/사직/서약 `HrFormsPage.tsx:299`
- [ ] 📤 드래그 업로드 · 파일 선택 `HrFormsPage.tsx:323`
- [ ] ⚙️ 진행률 bar
- [ ] 🔘 업로드 · 전송 `HrFormsPage.tsx:374`

### 필터·리스트
- [ ] 📋 카테고리 칩 필터 `HrFormsPage.tsx:400`
- [ ] 🔍 검색 · 양식명/파일명 `HrFormsPage.tsx:425`
- [ ] 📋 정렬 · 양식명/분류/파일명/크기/업로더/업로드일 `HrFormsPage.tsx:459-560`
- [ ] 🔘 다운로드 `HrFormsPage.tsx:643`
- [ ] 🔘 삭제 `HrFormsPage.tsx:653`

---

## 20. DocumentWriterPage (서류작성 3탭)

- [ ] 📋 근로계약서 작성 탭 `DocumentWriterPage.tsx:36`
- [ ] 📋 사직서 작성 탭
- [ ] 📋 설정 탭 · 기본값 관리
- [ ] 🔘 관리자 재정렬 · long-press `DocumentWriterPage.tsx:69`

---

# Part 4 · 🟢 Display 서브 · 기타 6 페이지

## 21. DisplayPage (매장>매장진열 · 서브탭 6)

### 매장구역도 탭
- [ ] 🔍 검색 · 상품·담당자·구역명 `DisplayPage.tsx:196`
- [ ] 🔘 자동배정 · 물류직원 임의배치 `DisplayPage.tsx:255`
- [ ] 🔘 배치확정 · DB 저장 + 알림 `DisplayPage.tsx:300`
- [ ] 🔘 배치취소 · 임의 미리보기 취소 `DisplayPage.tsx:336`
- [ ] 🔘 매주적용 · 요일 적용 `DisplayPage.tsx:230`
- [ ] ⚙️ 담당자 드래그 · 구역에 드롭 `DisplayPage.tsx:404`
- [ ] 📋 구역 팝오버 · 담당자 선택/미배정/요일
- [ ] 🔘 구역카드 상세 · 담당자·상품·상태·카테고리 편집
- [ ] ⚙️ 매장/창고 탭 전환 `DisplayPage.tsx:656`

### 창고1·창고2 탭
- [ ] 📍 창고 구역도 · storage.webp
- [ ] 🔘 구역클릭 · 창고별 현황

### 실재고테이블 탭
- [ ] 🔍 검색 · 상품명·공급사·코드·위치 `RealStockTablePage.tsx:519`
- [ ] 📋 판매중 필터 3-state `RealStockTablePage.tsx:528`
- [ ] ☑ 구역별 그룹 · location 기준 `RealStockTablePage.tsx:529`
- [ ] 🔘 모두 접기/펼치기 `RealStockTablePage.tsx:535`
- [ ] 🔘 새로고침 `RealStockTablePage.tsx:554`
- [ ] ✏️ 수량 편집 · 창고1/2·매장1/2/3 인라인 (Enter 저장) `RealStockTablePage.tsx:267`
- [ ] 🔘 상품상세 모달 · 위치별 재고·차이 `RealStockTablePage.tsx:257`
- [ ] 🔘 정렬 헤더 · 컬럼 클릭 `RealStockTablePage.tsx:336`

### 배치구역불일치 탭
- [ ] 🔍 검색 · 상품/코드/전산구역/실제구역 `ZoneMismatchTab.tsx:329`
- [ ] 📋 판매중 필터
- [ ] ☑ 체크박스 · 행/그룹/전체
- [ ] ⚙️ 그룹 접기/펼치기 · real_zone 기준
- [ ] ✏️ 상품명·전산구역·실제구역 인라인 편집
- [ ] 🔘 조정완료 · 실제→전산 정렬 `ZoneMismatchTab.tsx:149`
- [ ] 🔘 선택삭제 · 일괄 `ZoneMismatchTab.tsx:131`
- [ ] 🔘 새로고침

### 구역미지정 탭
- [ ] 📊 미지정 상품 리스트 · UnassignedProductsTab

### 매장구역도 편집 탭
- [ ] ✏️ 구역번호·라벨·카테고리 편집 · KV
- [ ] 🔘 구역 추가/삭제 (관리자)
- [ ] ⚙️ 구역 드래그 정렬

---

## 22-23. MismatchPage · RealStockTablePage
(위 DisplayPage 서브탭과 동일 · 별도 진입점)

---

## 24. StockArrivalPage (입고알림)

- [ ] ✏️ 제목 입력 · 알림 제목 `StockArrivalPage.tsx:307`
- [ ] ✏️ 내용 입력 (선택) `StockArrivalPage.tsx:315`
- [ ] 🔘 저장 · DB 저장 (알림 미발송) `StockArrivalPage.tsx:343`
- [ ] 🔘 발송 · 즉시 전 직원 push `StockArrivalPage.tsx:350`
- [ ] 🔘 예약발송 · datetime-local `StockArrivalPage.tsx:325`
- [ ] 📋 정렬 · 등록일/예약일/제목/발송여부 `StockArrivalPage.tsx:379`
- [ ] 🔘 수정 · 인라인 편집 `StockArrivalPage.tsx:414`
- [ ] 🔘 즉시 발송 · 재발송 `StockArrivalPage.tsx:479`
- [ ] 🔘 예약 설정 · datetime `StockArrivalPage.tsx:484`
- [ ] 🔘 삭제 · 알림 제거 `StockArrivalPage.tsx:496`
- [ ] 🔔 알림받기 · Push 구독 토글 `StockArrivalPage.tsx:268`

---

## 25. OcrPage (OCR 도구)

### OCR 추출 탭
- [ ] 🔘 PDF 업로드 · 드래그·클릭 `OcrPage.tsx:510`
- [ ] 🔘 이미지 업로드 · 다중 `OcrPage.tsx:524`
- [ ] 📊 파일 진행률 표시 `OcrPage.tsx:543`
- [ ] 🔘 페이지 회전 · 자동/수동 `OcrPage.tsx:577`
- [ ] 📋 엔진 선택 · ONNX/Gemini `OcrPage.tsx:614`
- [ ] 🔘 OCR 추출 · 문서 처리 `OcrPage.tsx:657`
- [ ] 🔘 셀 재추출 · 재파싱 · 방식 순환 `OcrPage.tsx:400`
- [ ] 🔘 매입 임포트 · OCR 결과 → 매장 저장 · RawOcrTable
- [ ] ⚙️ 검증 오류 하이라이트 · 재추출 유도

### 동의어 관리 탭
- [ ] ✏️ 동의어 추가 · 대체 매핑
- [ ] 🔘 동의어 삭제
- [ ] 🔍 동의어 검색

### 잔고항목 지정 탭
- [ ] 📋 공급사별 잔고 필드 · 차입/외상/선급금
- [ ] 🔘 설정 저장 · 공급사별 KV

### 거래명세서 조회 탭
- [ ] 📊 확정 내역 테이블
- [ ] 🔍 거래명세 검색 · 공급사·날짜

---

## 26. CardHistoryPage
(Part 1 · #7 에 이미 포함)

## 27. CardRegisterPage
(Part 1 · #7 에 이미 포함)

---

# Part 5 · 🟢 설정 7 페이지

## 28. SystemSettingsPage (시스템 설정)

### 카테고리 탭 (8개)
- [ ] 📋 DB·인증 / AI·OCR / 알림톡·SMS / 이미지 CDN / Web Push / 데이터 업로드 / 자동 임포트 / 세션 설정 `SystemSettingsPage.tsx:173`
- [ ] ✏️ 텍스트 입력 · 각 env key (SUPABASE_URL·JWT_SECRET·GEMINI_API_KEY 등) `SystemSettingsPage.tsx:203`
- [ ] ✏️ 멀티라인 · Gemini Keys · OCR 제외 목록 `SystemSettingsPage.tsx:194`
- [ ] 🔘 저장 · 서버 저장 · 재시작 안내 `SystemSettingsPage.tsx:254`
- [ ] 🔘 다시 불러오기 · 최신값 새로고침 `SystemSettingsPage.tsx:251`
- [ ] 📤 데이터 업로드 · 모달 `SystemSettingsPage.tsx:231`

### 세션 설정
- [ ] ✏️ 세션 만료 · 5~480분 · 기본 30 `SessionTimeoutSection.tsx:112`
- [ ] 📋 프리셋 · 5·15·30·1h·2h·4h·8h `SessionTimeoutSection.tsx:85`

### AutoImportSection (자동 임포트)
- [ ] ☑ 자동 임포트 활성 토글 `AutoImportSection.tsx:220`
- [ ] 🔘 설치 파일 다운로드 · .bat `AutoImportSection.tsx:183`
- [ ] ✏️ 상품/재고/매입 폴더 경로 · 3 카테고리 `AutoImportSection.tsx:251`
- [ ] 🔘 폴더 찾기 (Chrome/Edge) `AutoImportSection.tsx:260`
- [ ] 📋 실행 간격 프리셋 · 10분~매일 `AutoImportSection.tsx:273`
- [ ] ✏️ 실행 간격 직접 입력 · 5~1440분 `AutoImportSection.tsx:284`
- [ ] ✏️ 매일 실행 시각 · HH:MM `AutoImportSection.tsx:301`
- [ ] ☑ 폴더 자동 생성 토글 `AutoImportSection.tsx:314`
- [ ] 📋 임포트 후 처리 · 유지/이동/_processed/삭제 `AutoImportSection.tsx:332`
- [ ] ☑ 파일명 자동 정리 토글 `AutoImportSection.tsx:351`
- [ ] 🔘 저장 · KV 저장 `AutoImportSection.tsx:370`
- [ ] 🔘 기본값 복원 `AutoImportSection.tsx:237`
- [ ] 🔘 새로고침 · 상태 로드 `AutoImportSection.tsx:155`

---

## 29. CompanyInfoSettingsPage (회사·브랜드)

### 사업장 정보
- [ ] ✏️ 약국명 · 사업장 이름 `CompanyInfoSettingsPage.tsx:134`
- [ ] ✏️ 대표자 이름 `CompanyInfoSettingsPage.tsx:139`
- [ ] ✏️ 사업자등록번호 `CompanyInfoSettingsPage.tsx:145`
- [ ] ✏️ 사업장 전화 `CompanyInfoSettingsPage.tsx:150`
- [ ] ✏️ 사업장 주소 `CompanyInfoSettingsPage.tsx:155`

### 브랜드
- [ ] ✏️ 앱 이름 (사이드바) `CompanyInfoSettingsPage.tsx:176`
- [ ] ✏️ 앱 타이틀 (브라우저 탭) `CompanyInfoSettingsPage.tsx:181`
- [ ] ✏️ 영문 브랜드명 (랜딩) `CompanyInfoSettingsPage.tsx:186`
- [ ] ✏️ 영문 강조 단어 (컬러) `CompanyInfoSettingsPage.tsx:191`
- [ ] 📤 로고 이미지 업로드 `CompanyInfoSettingsPage.tsx:195`
- [ ] 📤 파비콘 업로드 `CompanyInfoSettingsPage.tsx:204`

### 연락처·카카오
- [ ] ✏️ 대표 전화 · 이메일 · 홈페이지 · 영업시간 `BrandingSettingsPage.tsx:212-237`
- [ ] ✏️ 카카오톡 채널 URL `BrandingSettingsPage.tsx:240`
- [ ] 📤 카카오톡 QR 이미지 업로드 `BrandingSettingsPage.tsx:248`

### 도장 매핑
- [ ] 📋 도장 목록 테이블 · 이름/URL/Fallback/미리보기 `BrandingSettingsPage.tsx:330`
- [ ] ✏️ 도장 이름 · URL · Fallback 인라인 편집
- [ ] 🔘 도장 삭제 `BrandingSettingsPage.tsx:405`
- [ ] ✏️ 새 도장 이름 · 이미지 업로드 · 추가 `BrandingSettingsPage.tsx:428`

---

## 30. BrandingSettingsPage (앱 브랜딩)

- [ ] ✏️ 지역 · 예: 오산 `BrandingSettingsPage.tsx:140`
- [ ] ✏️ 브랜드 이름 · 예: 메가타운 약국 `BrandingSettingsPage.tsx:148`
- [ ] ✏️ 영문 브랜드명·강조 단어 · 앱 타이틀 (`BrandingSettingsPage.tsx:154-166`)
- [ ] ✏️ 로고·파비콘 URL `BrandingSettingsPage.tsx:171-179`

### 메뉴 표시 (PC/모바일)
- [ ] ☑ 페이지별 PC 노출 체크박스 `BrandingSettingsPage.tsx:546`
- [ ] ☑ 페이지별 모바일 노출 체크박스 `BrandingSettingsPage.tsx:556`

---

## 31. PermissionsPage (메뉴 설정 · 권한)

### 권한 조정
- [ ] ☑ 사이드바 활성 토글 `PermissionsPage.tsx:592`

### 페이지별 (서브탭)
- [ ] ☑ 페이지별 노출 토글 `PermissionsPage.panels.tsx:284`
- [ ] 📋 읽기 최소 권한 · 1-9 `PermissionsPage.panels.tsx:303`
- [ ] 📋 쓰기 최소 권한 · 1-9 `PermissionsPage.panels.tsx:311`
- [ ] 📋 읽기 권한 직군 필터 · 팝오버
- [ ] 📋 쓰기 권한 직군 필터 · 팝오버
- [ ] 🔘 그룹 접기/펼치기 · 트리
- [ ] 🔘 전체 저장 `PermissionsPage.panels.tsx:251`

### 직원별 레벨 (서브탭)
- [ ] 🔍 직원 검색 · 이름·직군 `PermissionsPage.panels.tsx:426`
- [ ] 📋 직원별 레벨 · 1-9 (약사 우선) `PermissionsPage.panels.tsx:461`

### 스케쥴 설정 (탭)
- [ ] 📋 직군 드롭다운 (settings.positions) `PermissionsPage.tsx:697`
- [ ] ✏️ 직군 이름 인라인 편집 `PermissionsPage.panels.tsx:78`
- [ ] 🔘 직군 추가 · 삭제 · 위아래 이동 `PermissionsPage.panels.tsx:110-138`
- [ ] 🔘 저장 · 전체 일괄 `PermissionsPage.tsx:573`

### 직군 설정 (탭)
- [ ] 📋 직군 카드 · 3컬럼 `PermissionsPage.panels.tsx:57`
- [ ] ✏️ 직군 인라인 편집 · 아이콘·삭제·드래그
- [ ] ✏️ 새 직군 입력 + Enter `PermissionsPage.panels.tsx:122`

### 공사중 (탭)
- [ ] ☑ 공사중 모드 토글 `PermissionsPage.panels.tsx:169`

---

## 32. SeasonSettingsPage (통계 설정)

- [ ] 📅 계절 범위 편집 · SeasonRangesEditor `SeasonSettingsPage.tsx:70`

### 적정재고 설정
- [ ] 📋 계산 방식 · 최근 N일 / 특정 기간 `OptimalStockPeriodSection.tsx:131`
- [ ] ✏️ 기준 일수 · 1-365 (기본 15) `OptimalStockPeriodSection.tsx:163`
- [ ] 📅 시작·끝 날짜 (기간 모드)
- [ ] 🔘 재계산 실행 · products.optimal_stock 일괄 `OptimalStockPeriodSection.tsx:234`

### 판매중 필터
- [ ] ☑ 판매중 상품만 표시 토글 · 즉시 적용 `SaleActiveOnlySection.tsx:49`

---

## 33. ContractSettingsPage (근로계약서 설정)

### 배너·전역
- [ ] 🔘 모두 저장 · 회사·시급·각 호 일괄 `ContractSettingsPage.tsx:464`
- [ ] 🔘 기본값 초기화 · 전체 복원 `ContractSettingsPage.tsx:488`
- [ ] 🔘 취소 · 마지막 저장으로 `ContractSettingsPage.tsx:497`

### 회사정보 (좌측)
- [ ] 🔘 접기/펼치기 (기본 접힘) `ContractSettingsPage.tsx:536`
- [ ] ✏️ 약국명·대표자·사업자번호·임금지급일

### 직군별 시급 (우측)
- [ ] 📋 직군 카드 · 약사·매장·창고·기타 (2x2) `ContractSettingsPage.tsx:564`
- [ ] ✏️ 주중·주말 시급 `ContractSettingsPage.tsx:600-620`
- [ ] 🔘 시급 기본값 리셋 (직군별)
- [ ] 🔘 시급 저장 (별도)

### 각 호 편집
- [ ] 🔘 전체 펼치기/접기 `ContractSettingsPage.tsx:649`
- [ ] 🔘 그룹 접기/펼치기 · 6개 (임금·근로시간·휴일·징계·기타·개인정보)
- [ ] ✏️ 조항 텍스트 편집 · textarea `ContractSettingsPage.tsx:708`
- [ ] 🔘 조항 위/아래 이동 · 삭제 · 추가 `ContractSettingsPage.tsx:716-753`
- [ ] 🔘 그룹 기본값 복원 `ContractSettingsPage.tsx:755`

---

## 34. PharmacistMenuSettingsPage (약사 메뉴 설정)

### 신규 등록 (관리자 lv8+)
- [ ] ✏️ 항목 이름 · 최대 120자 `PharmacistMenuSettingsPage.tsx:288`
- [ ] 🔘 파일 선택 · PDF·이미지·Office · 최대 20MB `PharmacistMenuSettingsPage.tsx:305`
- [ ] 🔘 등록 · 새 항목 `PharmacistMenuSettingsPage.tsx:315`
- [ ] 📤 파일 표시 + 제거 `PharmacistMenuSettingsPage.tsx:326`

### 등록된 목록
- [ ] 🔘 위 (↑) 아래 (↓) 이동 `PharmacistMenuSettingsPage.tsx:401-418`
- [ ] ✏️ 항목 이름 인라인 편집 `PharmacistMenuSettingsPage.tsx:424`
- [ ] 🔘 편집 · 저장 · 취소 · 삭제 `PharmacistMenuSettingsPage.tsx:454-490`

---

# Part 6 · 🟢 MyPage/Board/Pharmacist/Reservation/Lunch/Leave (6)

## 35. MyPage

- [ ] 🔍 주소 검색 · Daum 우편번호 `MyPage.tsx:179`
- [ ] 🔘 주소 저장 `MyPage.tsx:187`
- [ ] ✏️ 주소 입력 필드 `MyPage.tsx:169`
- [ ] ✏️ 현재 · 새 · 새 확인 비밀번호 `MyPage.tsx:209-241`
- [ ] 🔘 비밀번호 변경 `MyPage.tsx:245`
- [ ] 🔘 표시/숨김 토글 `MyPage.tsx:219`
- [ ] ☑ 스캔 미분류 처리 방식 · 모달/페이지 `MyPage.tsx:268`
- [ ] 📋 내 정보 (읽기) · 11 항목 `MyPage.tsx:145`
- [ ] 📋 계절 정의 편집 (관리자) `SeasonRangesEditor.tsx:130`

---

## 36. BoardPage

- [ ] 🔍 제목·본문 검색 `BoardPage.tsx:100`
- [ ] 🔘 새 글 · ComposerModal `BoardPage.tsx:109`
- [ ] 🔘 상태 필터 · 미해결/진행중/해결 `BoardPage.tsx:119`
- [ ] 🔘 카테고리 필터 · 전체/결제/상품/주문/손님/미분류 `BoardPage.tsx:135`

### 글 액션
- [ ] 🔘 수정 · 편집 모드 `PostCard.tsx:91`
- [ ] 🔘 Pin · 고정 · Pencil · Trash `DetailModal.tsx:192-202`
- [ ] 🔘 저장 · 취소 (편집) `DetailModal.tsx:360-365`

### 댓글
- [ ] 🔘 댓글 저장 · 취소 `DetailModal.tsx:432-439`
- [ ] ✏️ 댓글 작성 `DetailModal.tsx:230`

### 입력·편집
- [ ] ✏️ 제목·본문 (신규) `ComposerModal.tsx:111-138`
- [ ] ✏️ 제목·본문 편집 `DetailModal.tsx:293-318`
- [ ] ✏️ 댓글 편집 `DetailModal.tsx:425`
- [ ] 📷 사진 첨부 · 신규 8장 · 댓글 4장 · 편집 시 `ComposerModal.tsx:143` `DetailModal.tsx:224,331`
- [ ] ⚙️ 타입 · 질문/이슈/메모 `ComposerModal.tsx:95`
- [ ] ⚙️ 카테고리 · 없음·결제·상품·주문·손님 `ComposerModal.tsx:121`
- [ ] ⚙️ 상태 변경 · 미해결/진행중/해결 `DetailModal.tsx:386`

---

## 37. PharmacistPage (약사 전용 4탭)

- [ ] 🔍 카테고리 트리 펼침/접힘 `PharmacistPage.tsx:464`
- [ ] 🔘 하위메뉴 설정 (관리자) `PharmacistPage.tsx:317`
- [ ] 🔘 카테고리 추가 (교육탭) `PharmacistPage.tsx:369`
- [ ] 🔘 기본값 · 계절 정의 초기화 `PharmacistPage.tsx:88`
- [ ] 🔘 저장 `PharmacistPage.tsx:97`
- [ ] 🔘 커스텀 카테고리 삭제 `PharmacistPage.tsx:495`
- [ ] 🔘 풀스크린 · PDF `PharmacistPage.tsx:701`
- [ ] ✏️ 카테고리 제목 입력 `PharmacistPage.tsx:382`
- [ ] 📷 자료 파일 · PDF·이미지·문서 (최대 20MB) `PharmacistPage.tsx:392`
- [ ] 📋 카테고리 트리 or 리스트 선택
- [ ] 📋 하위메뉴 선택 `PharmacistPage.tsx:525`
- [ ] ⚙️ 탭 · 교육/강의/서적/전자자료 `PharmacistPage.tsx:330`
- [ ] ⚙️ 관리자 드래그 재정렬

---

## 38. ReservationPage (방문예약)

- [ ] 🔍 캘린더 월 선택 `ReservationPage.tsx:336`
- [ ] 🔘 이전/다음 월 `ReservationPage.tsx:338`
- [ ] 🔘 예약 슬롯 클릭 (외부) `ReservationPage.tsx:585`
- [ ] 🔘 예약불가 지정/해제 (관리자) `ReservationPage.tsx:558`
- [ ] 🔘 예약 신청 · 제출 `ReservationPage.tsx:736`
- [ ] ✏️ 거래처명 (필수) `ReservationPage.tsx:661`
- [ ] ✏️ 담당자 (필수) `ReservationPage.tsx:677`
- [ ] ✏️ 연락처 (필수) `ReservationPage.tsx:689`
- [ ] ✏️ 추가 요청 (선택) `ReservationPage.tsx:727`
- [ ] 📋 방문 목적 (필수 · 6개) `ReservationPage.tsx:704`
- [ ] ⚙️ 휴무·피크시간 시각화

---

## 39. LunchPage (점심 관리)

- [ ] 🔍 날짜 선택 · 이전/다음/오늘 `LunchPage.tsx:282-303`
- [ ] 🔘 새로고침 `LunchPage.tsx:305`
- [ ] 🔘 점심 불참 신청 `LunchPage.tsx:527`
- [ ] 🔘 신청 취소 `LunchPage.tsx:508`
- [ ] ✏️ 메모 · 불참 사유 `LunchPage.tsx:524`
- [ ] ⚙️ 휴게시간 타임라인 · 드래그 배정
- [ ] ⚙️ 탭 · 약사/사원/기타 `LunchPage.tsx:351`
- [ ] ⚙️ 시간 · 30분/1시간 `LunchPage.tsx:360`

---

## 40. LeavePage (연차 신청·승인)

- [ ] 🔍 신청 목록 필터 `LeavePage.tsx:332`
- [ ] 🔘 연차 신청 · 폼 오픈 `LeavePage.tsx:240`
- [ ] 🔘 신청 제출 `LeavePage.tsx:320`
- [ ] 🔘 신청 취소 · 대기 `LeavePage.tsx:390`
- [ ] 🔘 검토하기 · 승인/반려 UI `LeavePage.tsx:519`
- [ ] 🔘 승인 · 반려 `LeavePage.tsx:494-509`
- [ ] 🔘 새로고침 `LeavePage.tsx:339`
- [ ] 🔘 탭 · 승인 대기/전체 `LeavePage.tsx:411`
- [ ] ✏️ 휴가 종류 (필수) · 연차/반차/월차/병가 `LeavePage.tsx:263`
- [ ] ✏️ 시작·종료일 (필수) `LeavePage.tsx:278-299`
- [ ] ✏️ 사유 (선택) `LeavePage.tsx:309`
- [ ] ✏️ 관리자 메모 · 승인/반려 시 `LeavePage.tsx:486`
- [ ] 📋 남은 연차 배너 · 신청 뷰 상단 `LeavePage.tsx:227`
- [ ] ⚙️ 상태 배지 · 대기/승인/반려

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
**커버 페이지** · 40 페이지 (메인 + 서브)
**총 항목** · 500+ 체크박스 (조회·수정·편집·검색·버튼 전수)
**Part 분포**
- Part 1 · 🔴 크리티컬 7 페이지 · 200+ 항목
- Part 2 · 🟡 매장 매입/판매 5 페이지 · 80 항목
- Part 3 · 🟡 HR/직원 8 페이지 · 100+ 항목
- Part 4 · 🟢 Display 서브·기타 6 페이지 · 60 항목
- Part 5 · 🟢 설정 7 페이지 · 100+ 항목
- Part 6 · 🟢 MyPage/Board/Pharmacist/Reservation/Lunch/Leave 6 페이지 · 80+ 항목
