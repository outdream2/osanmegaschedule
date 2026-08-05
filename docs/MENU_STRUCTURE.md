# 메뉴 구조 · 오산 메가타운 약국 (megatown-staff-scheduler)

**생성**: 2026-08-05
**출처**: 코드 실측 (LandingPage · 각 페이지 컴포넌트 · TAB 정의)

---

## 📱 메인 메뉴 (LandingPage · 12개)

| # | 라벨 | onNavigate 대상 | 파일 | 주 기능 |
|---|------|---------------|------|--------|
| 1 | **재고관리** | `display` | `DisplayPage.tsx` | 발주·매입·결제·통계·입고알림·매장구역도 · 재고 관리 전반 |
| 2 | **경영관리** | `business-manage` | `BusinessManagePage.tsx` | 직원·연차·사직서·서류 · HR 관리 |
| 3 | **요청메뉴** | `requests` | `RequestsPage.tsx` | 진열요청·발주요청·구역불일치·실재고차이·점심불참 통합 |
| 4 | **권한관리** | `permissions` | `PermissionsPage.tsx` | 직원별 · 페이지별 접근 권한 · 관리자 전용 |
| 5 | **약사전용** | `pharmacist` | `PharmacistPage.tsx` | 교육자료·복약지도·동영상·문서 · 약사 대상 |
| 6 | **스케줄표** | `schedule` | `SchedulePage.tsx` | 월간 근무 스케줄 · 구역/점심/휴게 배정 |
| 7 | **실재고확인** | `scan` | `ScanPage.tsx` | 바코드 스캔 · 실재고 입력 · 진열요청 진입점 |
| 8 | **상품입고** | `productarrival` | `ProductArrivalPage.tsx` | 바코드 스캔 · 상품 입고 알림·기록 |
| 9 | **연차신청** | `leave` | `LeavePage/LeavePage.tsx` | 직원 · 연차 신청·조회 |
| 10 | **점심신청** | `lunch` | `LunchPage/LunchPage.tsx` | 오늘 점심 참석 여부 |
| 11 | **게시판** | `board` | `BoardPage.tsx` | 공지·자유 게시판 |
| 12 | **당직 예약** | `reservation` | `ReservationPage.tsx` | 당직·특별 근무 예약 |

**추가 페이지** (직접 진입 · 메뉴 외):
- `mypage` · 내 정보 (프로필·비밀번호)
- `stockcheck` · 재고 확인 (읽기 전용 조회)
- `stockarrivals` · 상품입고 이력
- `ocr` · 거래명세서 OCR (매입관리 서브탭 안에서 진입)
- `zone-labels` · 구역 라벨 편집 (관리자)
- `hr-forms` · 각종 양식 (경영관리 서브탭 안에서 진입)

---

## 🔵 재고관리 (DisplayPage) · 하위 탭 6개

| # | 서브탭 | 컴포넌트 | 주 기능 |
|---|--------|---------|--------|
| 1 | **발주** | `OrderManagePage.tsx` (initialTopTab="purchase-order") | 발주 요청 목록 · 발주 필요 상품 · 발주 승인 |
| 2 | **매입** | `OrderManagePage.tsx` (initialTopTab="purchase") | **매입이력 · 상품별 집계 · 매입 추이** (3서브탭) |
| 3 | **결제** | `OrderManagePage.tsx` (initialTopTab="payment") | 공급사 결제 정보 · 잔고 · 납부 |
| 4 | **통계** | `OrderManagePage.tsx` (initialTopTab="statistics") | 카테고리별 판매 · 상품 매출 분석 (CategoryTab) |
| 5 | **입고알림** | `StockArrivalPage.tsx` (embedded) | 입고 예정 상품 · 알림 관리 |
| 6 | **매장구역도** | `StoreZoneMap.tsx` · 구역 카드 | 매장 구역 시각화 · 카테고리 배치 확인 |

**매입 서브탭 (내부 3탭 · `PurchaseSubTabs.tsx`)**:
- **매입이력** (ledger) · 선택 기간 매입 원장 (rows) · 정렬·필터
- **상품별 집계** (product) · groupBy 상품명 · 총매입액·수량 랭킹
- **매입 추이** (trend) · 3종 파이차트 (카테고리별·상품별 Top10·월별)

**매입이력 뷰 전환 (`PurchaseHistoryTab.tsx`)**:
- **공급사별** (by-vendor) · 좌측 공급사 리스트 · 우측 원장·집계·추이
- **상품별** (by-product) · 좌측 상품 리스트 (기간필터) · 우측 상품 상세 or 파이차트 3종

---

## 🟢 경영관리 (BusinessManagePage) · 하위 탭 5개

| # | 서브탭 | 컴포넌트 | 주 기능 |
|---|--------|---------|--------|
| 1 | **직원관리** | `StaffManagePage.tsx` | 직원 CRUD · 계약 · 근속 · 인사평가 · 근로계약서 연동 |
| 2 | **승인대기** | `ApprovalCenterPage.tsx` | 연차·사직서 승인 통합 (내부 2탭) |
| 3 | **점심불참** | `LunchPage/LunchPage.tsx` (embedded) | 오늘 점심 불참자 관리 |
| 4 | **각종양식** | `HrFormsPage.tsx` (embedded) | HR 양식 (근로계약서·사직서·급여명세서 등) 템플릿 CRUD |
| 5 | **서류작성** | `DocumentWriterPage.tsx` (embedded) | 근로계약서·사직서 작성 (내부 3탭) |

**승인대기 서브 (2탭)**:
- **연차승인** (leave) · 대기중 연차 신청 승인/반려
- **사직서승인** (resignation) · 대기중 사직서 승인/반려 · 배지 카운트

**서류작성 서브 (3탭)**:
- **근로계약서 작성** (contract) · `ContractWriterPage` · 세전월급 자동 · 서명 · PDF 저장
- **사직서 작성** (resignation) · `ResignationWriterPage` · 서명 · 승인 흐름
- **설정** (settings) · `ContractSettingsPage` · 각 호 CMS (임금단서·근로시간·휴일·징계·기타·개인정보 · 서버 저장 · T-C)

---

## 🟠 요청메뉴 (RequestsPage) · 하위 탭 최대 5개

| # | 서브탭 | 조건 | 주 기능 |
|---|--------|-----|--------|
| 1 | **진열요청 / 내가 받은 요청** | 항상 | 상품별 진열요청 리스트 · 표 형태 · 창고준비→진열완료 3단계 워크플로우 |
| 2 | **구역불일치** | 관리자만 | products.real_map ≠ products.spec 상품 리스트 |
| 3 | **실재고차이** | 관리자만 | 실재고 입력 후 · 시스템 재고와 차이 |
| 4 | **점심불참** | 관리자만 | 오늘 점심 불참자 (경영관리 점심불참과 동일 소스) |
| 5 | **발주요청** | (표시 로직 · orderReqs 있을 때) | 진행중 발주 요청 |

**진열요청 표 컬럼** (사용자 확정 · 2026-08-05):
- 상품명 · 진열구역 · 담당자 · **창고준비** (버튼) · **진열완료** (버튼) · 날짜
- 창고담당 [준비완료] → 진열담당 [완료] → 관리자 알림

---

## 🟣 약사전용 (PharmacistPage) · 하위 탭 4개

| # | 서브탭 | key | 주 기능 |
|---|--------|-----|--------|
| 1 | **교육자료** | education | 카테고리별 교육 자료 (PDF·이미지·문서) |
| 2 | **복약지도** | reference | 복약 상담 자료·안내문 |
| 3 | **동영상 강의** | video | 동영상 자료 링크·목록 |
| 4 | **각종 문서** | docs | 약사 대상 기타 문서 |

**공통**: 좌측 카테고리 트리 + 우측 항목 리스트 · PDF 뷰어 모달

---

## 🔴 서브 서브탭 · 매입이력 (PurchaseSubTabs · 3탭)

이미 위 재고관리 · 매입 · 내부 매입이력 항목에 기술.

---

## 📋 스케줄 · 스캔 · 실재고확인 페이지

이들은 서브탭이 없거나 · 단일 UI · 기능별 섹션으로 구성.

### 실재고확인 (ScanPage)
- 좌: 바코드 스캐너 + 마지막 스캔 상품
- 우: 스캔 상품 테이블 (창고1·창고2·매장1·매장2·매장3 5열)
- 스캔 즉시 · **상품정보 모달 팝업** (T-SCAN-1)
  - 창고1/2 + 매장1/2/3 5칸 인라인 편집
  - 매장 슬롯별 [진열요청] 버튼 (구역별 담당자 자동 매칭)

### 스케줄표 (SchedulePage)
- 월간 캘린더 · 직원별 색상 · 구역 배정 · 점심 배정 · 휴게시간
- 드래그앤드롭 · 임의 배치 · 다중 요일 적용
- 약사팀 자동 구성 (약사1 + 물류2)

### 상품입고 (ProductArrivalPage)
- 바코드 스캔 · 입고 상품 등록
- 입고 이력 확인
- 상품별 · 공급사별 필터

---

## 🎯 관리자 전용 기능

- **long-press 드래그 재정렬** (관리자 level ≥ 8)
  - 서브탭 순서 · 사용자별 localStorage 저장
  - `useSortableTabs` 훅 · 적용 페이지: DisplayPage · BusinessManagePage · DocumentWriter · ApprovalCenter · PharmacistPage
- **강제 완료** (진열요청 등) · pending 에서도 완료 처리 가능
- **삭제** · vendor · post · comment 등

---

## 📊 페이지 · 하위 탭 요약 (총합)

| 메인 메뉴 | 서브탭 수 | 내부 서브탭 |
|---------|---------|----------|
| 재고관리 (DisplayPage) | 6 | 매입 → 3서브탭 |
| 경영관리 (BusinessManagePage) | 5 | 승인대기 2 · 서류작성 3 |
| 요청메뉴 (RequestsPage) | 최대 5 | - |
| 약사전용 (PharmacistPage) | 4 | 각 탭 · 좌측 카테고리 트리 |
| 매입관리 세부 (OrderManagePage) | 4 (top) | 매입 → 서브 3 · byVendor/byProduct 뷰 |

**총 서브탭 수** (내부 포함): 약 30+ 서브탭

---

## 🎨 색상 코드 (탭별 아이덴티티)

- **재고관리**: violet (스캔) · sky (발주) · amber (매입) · teal (결제) · indigo (통계) · orange (입고알림) · violet (매장구역도)
- **경영관리**: emerald (직원관리) · teal (승인대기) · orange (점심불참) · amber (각종양식) · indigo (서류작성)
- **약사전용**: sky (교육자료) · emerald (복약지도) · violet (동영상) · amber (문서)
- **요청메뉴**: rose · amber · indigo (탭별)
- **매입 서브**: emerald (매입이력) · sky (상품별) · violet (매입추이)

---

## 📁 관련 파일

- 메인 메뉴: `src/components/LandingPage/LandingPage.tsx`
- App 라우팅: `src/App.tsx`
- 공통 탭 컴포넌트: `src/components/common/TabBar.tsx`
- 드래그 재정렬 훅: `src/hooks/useSortableTabs.ts`
- 세션·권한: `src/hooks/useAuth.ts` · `src/types.ts` (AuthSession)

---

_📝 이 문서는 코드 실측 기준 · 메뉴 추가·변경 시 함께 업데이트 필요_
