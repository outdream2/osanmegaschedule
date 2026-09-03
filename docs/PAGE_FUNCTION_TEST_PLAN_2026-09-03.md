# 페이지·기능·연동·테스트 계획 (2026-09-03)

> 사용자 지시 · 페이지별 기능 · 연동관계 · 테스트 체크리스트 매트릭스
> 참조 · [MENU_STRUCTURE.md](./MENU_STRUCTURE.md) · [TASKS_HANDBOOK.md](./TASKS_HANDBOOK.md)
> 최근 리팩터 (30 커밋 · 2026-09-01~09-03) · Zod validateBody · endpoint 통일 · 상품정보 표시 통일

## 개요

| 카테고리 | 페이지 수 | 서브탭 수 | 크리티컬 항목 |
|---------|----------|----------|--------------|
| 🔴 크리티컬 | 7 | 22 | 42 |
| 🟡 주요 | 8 | 12 | 24 |
| 🟢 관리·설정 | 12 | 15 | 12 |
| **총계** | **27** | **49** | **78** |

**최근 리팩터 영향 우선 테스트 (⚠️)**
- ⚠️ #79-#82 · 발주 발송 (Zod schema) → OrderManagePage 발주요청 탭
- ⚠️ #98 · 상품입고 단가·유통기한 DB 저장 → ProductArrivalPage
- ⚠️ #60 · 스케줄 월 복사 → SchedulePage
- ⚠️ #64 · 진열요청 상품기준 재구성 → ScanPage + RequestsPage
- ⚠️ #98(표시) · ProductBasicInfoPanel 11개 탭 자동 확산 → 매장>발주·매입·판매 하위탭

**테스트 원칙**
- Happy Path (정상 케이스) · Edge Case (empty·error) · Regression (최근 커밋 영향) 3-way
- 각 페이지 · 로그인 → 페이지 진입 → 주요 flow → 로그아웃 순서
- 회귀 발견 시 · 태스크 번호와 함께 리포트

---

# Part 1 · 🔴 크리티컬 페이지 (7)

## 1. LandingPage (홈 · 메인)

**파일** · `src/components/LandingPage/LandingPage.tsx`

### 기능 리스트
- 승인요청 카운트 배지 (진열·발주·재고 등 10종)
- 오늘의 현황 카드 (매출·매입·발주·판매)
- 최근 결제내역 · 최근 발주내역
- 담당자별 진열요청 리스트 (staff view)
- 최근 매입 이력 · StockArrivalList

### API 연동
- GET /api/requests/pending-counts · 승인 대기 카운트
- GET /api/dashboard/summary · 오늘의 매출·매입
- GET /api/order-requests?limit=5 · 최근 발주
- GET /api/supplier-payments?limit=5 · 최근 결제

### 페이지 연동
- 승인 배지 클릭 → RequestsPage (해당 탭)
- 카드 클릭 → OrderManagePage / SalesTrendPage / PaymentInputPage
- 매입 항목 클릭 → PurchaseHistoryModal
- 상품 클릭 → ProductInfoModal

### 테스트 체크리스트
- [ ] 🔴 로그인 후 · 카운트 배지 정상 로드
- [ ] 🔴 카운트 클릭 → 해당 페이지 이동 · 필터 자동 적용
- [ ] 🟡 오늘 현황 카드 · 매출·매입 금액 · KRW 포맷
- [ ] 🟡 empty state · 데이터 없을 때 "데이터 없음" 표시
- [ ] 🟢 카드 애니메이션 · fade-in 부드러움
- [ ] ⚠️ 회귀 · 종배지 z-index (z-70) · 모바일 중앙 정렬 유지 (#71)

---

## 2. SchedulePage (스케줄)

**파일** · `src/components/SchedulePage/SchedulePage.tsx`
**서브** · EmployeeCalendarModal · ZoneAssignPanel · MonthSelector

### 기능 리스트
- 월별 스케줄 · 직원별 근무 유형 (M·A·N·O 등) 셀 편집
- 전월 복사 (⚠️ #60 최근 fix)
- 일괄 등록 (사용자별 · 요일 패턴)
- 직원 클릭 → EmployeeCalendarModal (4탭 · 직원정보·달력·일괄등록·구역)
- 구역 배정 (zone_assignments · dowMap)

### API 연동
- GET /api/schedules?ym=YYYY-MM · 월별 스케줄
- POST /api/schedules · 개별 upsert
- POST /api/schedules/batch · 일괄 등록
- POST /api/schedules/copy · 전월 복사 (⚠️ Zod: targetYear·targetMonth)
- GET /api/employees · 직원 리스트
- GET /api/staff-availability · 오늘 근무자

### 페이지 연동
- 직원 클릭 → EmployeeCalendarModal (4탭 통합)
- 구역 편집 → DisplayPage 매장구역도 (zone_assignments 동기)

### 테스트 체크리스트
- [ ] 🔴 월별 스케줄 로드 · 셀 편집 · 저장
- [ ] 🔴 ⚠️ 전월 복사 버튼 · 대상 월 선택 → 복사 완료 (#60 회귀)
- [ ] 🔴 일괄 등록 · 여러 요일 선택 · 근무유형 적용
- [ ] 🟡 직원 셀 클릭 → EmployeeCalendarModal · 4탭 전환
- [ ] 🟡 ⚠️ 직원 성명 · 배지 X · 텍스트만 표시 (#72 회귀)
- [ ] 🟡 구역 배정 · DisplayPage 반영 확인
- [ ] 🟢 요일별 색상 구분 (평일·토·일)

---

## 3. OrderManagePage (매장>발주 · 서브탭 8+)

**파일** · `src/components/OrderManagePage/OrderManagePage.tsx`
**서브탭** · 발주필요·발주요청·발주이력·발주위험·판매급상승·카테고리별·공급사현황·매입이력·차용

### 기능 리스트
- 각 서브탭 · SplitPanel (좌 리스트 · 우 ProductDetailPanel)
- 발주필요 → 발주요청 담기 · 수량 편집
- 발주요청 → 발송 (이메일 · SMS · 카톡)
- 발송 후 · 발주이력 이동 (⚠️ #77 · status='ordered' RPC)
- 반품 리스트 · ReturnListPanel
- ⚠️ #98 · 우측 패널 · ProductBasicInfoPanel 자동 표시 (수량·단가·바코드·판매상태·구역)

### API 연동
- GET /api/order-requests · status='requested' 리스트
- POST /api/order-requests · 발주필요→요청 담기
- POST /api/order-requests/bulk-send · 이메일·SMS·카톡 발송 (⚠️ Zod: channels object · bySupplier array)
- GET /api/stock-manage/low-stock · 발주필요
- GET /api/stock-manage/top-sales · 판매급상승·트렌딩
- GET /api/purchase-details · 매입이력
- GET /api/vendors/:id · VendorDetailModal 정보

### 페이지 연동
- 공급사 클릭 → VendorDetailModal (팀장·비상연락처 표시 · #51)
- 상품 클릭 → ProductDetailModal (context='order-manage')
- 매입이력 클릭 → ProductPurchaseHistoryModal
- 결제 → PaymentInputPage (매장>결제)
- 카드 → CardHistoryPage · CardRegisterPage

### 테스트 체크리스트
- [ ] 🔴 발주필요 리스트 · 부족량 desc 정렬 · 상품 클릭 → 우측 상세
- [ ] 🔴 ⚠️ 상품 클릭 시 · ProductBasicInfoPanel · 14필드 모두 표시 (#98 회귀)
- [ ] 🔴 발주요청 담기 · 수량 편집 · 저장
- [ ] 🔴 ⚠️ 발주요청 발송 · 채널 선택 (이메일/SMS/카톡) · 발송 완료 dialog (#79-#82 회귀)
- [ ] 🔴 발송 실패 시 · 오류 메시지 · 재시도 가능
- [ ] 🔴 ⚠️ 발송 후 · 발주요청 리스트에서 사라짐 · 발주이력으로 이동 (#77 회귀)
- [ ] 🔴 카톡·이메일·SMS 채널별 성공/실패 명시
- [ ] 🟡 발주위험 · 재고 0 < 적정 · 리스트 로드
- [ ] 🟡 판매급상승 · 최근 판매량 desc
- [ ] 🟡 공급사현황 · VendorInfoHeader · 팀장·비상연락처 표시 (#51)
- [ ] 🟡 매입이력 · 상품별 집계 · 매입원장 · 두 서브탭
- [ ] 🟡 차용관리 · 대여자/차용자 선택 · 약국+공급사+외부 병합 (#80)
- [ ] 🟢 반품필요 · 판매중지+재고>0 · 리스트

---

## 4. ProductArrivalPage (상품입고)

**파일** · `src/components/ProductArrivalPage/ProductArrivalPage.tsx`
**서브탭** · 검수 (신규 입고) · 이력

### 기능 리스트
- 바코드 스캔 or 상품 검색 → 검수 리스트에 추가
- 각 행 · 수량·단가·유통기한·매장구역 입력
- 저장 시 · purchase_details INSERT + products.current_stock += qty (⚠️ #98)
- 이력 탭 · 그룹별 (verified_by · verified_at date) 목록

### API 연동
- GET /api/products/purchase-history · 최근 매입가 자동 채움
- POST /api/product-arrivals · 검수 저장 (⚠️ Zod: unit_price·expiry_date optional)
- GET /api/product-arrivals · 이력 그룹
- GET /api/product-arrivals/compare/orders · 발주 vs 입고 비교

### 페이지 연동
- 상품 클릭 → ProductInfoModal
- 이력 항목 클릭 → ArrivalDetailModal

### 테스트 체크리스트
- [ ] 🔴 바코드 스캔 · 상품 자동 추가 · 최근 매입가 자동 채움
- [ ] 🔴 ⚠️ 수량·단가·유통기한 입력 · 저장 시 · purchase_details DB 저장 (#98)
- [ ] 🔴 ⚠️ 저장 후 · products.current_stock += 수량 자동 반영 (#98)
- [ ] 🔴 매장구역 입력 시 · products.location 저장 · display_location 동기 (#92)
- [ ] 🟡 이력 탭 · 그룹별 리스트 · 클릭 → 상세 모달
- [ ] 🟡 발주 vs 입고 비교 · match/partial/missing 배지
- [ ] 🟢 검수 상태 (match·mismatch·pending·expiring) 배지
- [ ] ⚠️ 회귀 · zone_defs.warehouse 창고 자동 필터 (#74) · 창고1/창고2 분류

---

## 5. ScanPage (실재고입력 · 스캔)

**파일** · `src/components/ScanPage/ScanPage.tsx`
**서브** · StockRowCard · ScanRightPanel · ProductInfoCard · RealMapSelector

### 기능 리스트
- 바코드 스캔 → 실재고 입력 (창고1·창고2·매장·매장3)
- 각 상품 · 매장구역별 슬롯 (해당 창고만 표시 · #74)
- 진열요청 버튼 (상품 스캔 후 · 매장 재고 부족 시 강조) · ⚠️ #64
- 유통기한 임박 필터 · 매장 재고 0 필터
- 미분류 상품 → 등록 모달 (권한 필수 · #197)

### API 연동
- GET /api/products-map · 상품 마스터
- GET /api/inventory-checks · 최근 실재고
- POST /api/inventory-checks · 실재고 저장
- POST /api/display-requests · 진열요청 (⚠️ product_code 기반 · #64)
- GET /api/zone-defs · 창고 배정
- GET /api/products-search · 검색

### 페이지 연동
- 진열요청 → RequestsPage 진열요청 탭
- 상품 클릭 → ProductInfoCard 상세 (ProductBasicInfoPanel 포함 · #98)
- 미분류 등록 → ProductInfoPage (신규 상품 등록)

### 테스트 체크리스트
- [ ] 🔴 바코드 스캔 · 상품 자동 추가 · 창고 슬롯 표시
- [ ] 🔴 ⚠️ 해당 창고만 슬롯 표시 (창고1: 24/25/26/27/7B/8A · 나머지 창고2) (#74 회귀)
- [ ] 🔴 실재고 입력 · 저장 · inventory_checks DB 저장
- [ ] 🔴 ⚠️ 진열요청 버튼 · product_code 기반 POST · RequestsPage 리스트 반영 (#64)
- [ ] 🟡 유통기한 임박 필터 · 30일 이내 리스트
- [ ] 🟡 매장 재고 0 · 창고 있음 필터
- [ ] 🟡 미분류 스캔 → 등록 모달 (관리자만)
- [ ] 🟢 ⚠️ 상품 상세 · ProductBasicInfoPanel · 14필드 표시 (#98)

---

## 6. RequestsPage (승인요청 · 서브탭 최대 5개)

**파일** · `src/components/RequestsPage/RequestsPage.tsx`
**서브탭** · 진열요청 · 발주요청 · 재고차이 · 반품요청 · 퇴사요청 · 거래처승인

### 기능 리스트
- 각 서브탭 · 리스트 표시 · 승인/거절/완료 액션
- 진열요청 · 상품 기준 리스트 (⚠️ #64) · 담당자별 필터
- 발주요청 · 발주필요 상세 · 발송 (OrderManagePage 와 연동)
- 거래처 승인 · vendor.approval_status pending → approved

### API 연동
- GET /api/display-requests · 진열요청 (⚠️ product_name JOIN · #63)
- PATCH /api/display-requests/:id/prepare · 준비완료
- PATCH /api/display-requests/:id/complete · 완료
- DELETE /api/display-requests/:id · 취소
- GET /api/order-requests · 발주요청 (status='requested')
- GET /api/inventory-checks?status=pending · 재고차이
- GET /api/return-requests?status=pending · 반품요청
- GET /api/vendors?approval_status=pending · 거래처 승인 대기

### 페이지 연동
- 진열요청 → 상품 클릭 → ProductInfoModal
- 발주요청 → OrderManagePage 발주요청 탭
- 거래처 승인 → VendorDetailModal

### 테스트 체크리스트
- [ ] 🔴 ⚠️ 진열요청 탭 · 상품명 표시 (product JOIN · #63 회귀)
- [ ] 🔴 ⚠️ 진열요청 · 준비완료 · 완료 · 취소 3-way (workflow · #64)
- [ ] 🔴 발주요청 · 승인 시 · OrderManagePage 이동 · 발송 flow
- [ ] 🟡 재고차이 · 실재고 vs ERP · 승인 시 · products.current_stock 업데이트
- [ ] 🟡 반품요청 · 승인 · return_requests 완료
- [ ] 🟡 퇴사요청 · 승인 → employee.status='resigned' + retire_date 저장
- [ ] 🟡 ⚠️ 거래처 승인 · 필수 5필드 (email·사업자번호·팀장 이름·팀장 연락처·긴급 연락처) 검증 (#54)

---

## 7. PaymentInputPage (매장>결제 · 결제입력)

**파일** · `src/components/OrderManagePage/PaymentInputPage.tsx`
**서브** · SupplierPaymentModal · CardHistoryPage · CardRegisterPage

### 기능 리스트
- 공급사별 미납 리스트 (매입액 - 결제액 > 0)
- 결제 등록 · 방법 (transfer·card·cash) · 카드 시 · card_id FK
- 최근 결제내역 (300일)
- 우측 상세 (탭) · 최근결제·결제내역·카드별·발주·판매

### API 연동
- GET /api/supplier-payments/pending-count · 미납 공급사 수
- GET /api/supplier-payments/latest-per-supplier · 최근 결제
- GET /api/supplier-open-invoices · 특정 공급사 미납
- POST /api/supplier-payments · 결제 등록 (authorize 5+)
- PATCH /api/supplier-payments/:id · 수정
- DELETE /api/supplier-payments/:id · 삭제 (authorize 9)
- GET /api/credit-cards · 등록된 카드 리스트 (#69)

### 페이지 연동
- 카드 결제 → CardRegisterPage (등록) · CardHistoryPage (이력)
- 발주내역 → OrderManagePage 발주이력

### 테스트 체크리스트
- [ ] 🔴 미납 리스트 · 공급사별 · 미납액 desc
- [ ] 🔴 결제 등록 · 방법 선택 · 카드 시 · 카드 선택 필수 (#69)
- [ ] 🔴 결제 등록 → 최근결제내역 즉시 반영
- [ ] 🔴 우측 상세 · 결제내역 탭 · 300일 이력 (#66)
- [ ] 🟡 카드별 결제내역 탭 · 카드별 그룹 · 아코디언 (#68)
- [ ] 🟡 결제 수정 · 방법·메모만 변경 가능
- [ ] 🟡 결제 삭제 · 관리자만
- [ ] 🟢 발주·판매 배지 · '건'상품 표시 (#66)

---

# Part 2 · 🟡 주요 페이지 (8)

## 8. DisplayPage (매장>매장진열 · 매장구역도)

**파일** · `src/components/DisplayPage/DisplayPage.tsx`
**서브탭** · 매장구역도 · 창고1 · 창고2 · 실재고 테이블 · 배치구역 불일치 · 매장구역도 편집

### 기능 리스트
- 매장구역도 시각화 · 구역별 담당자·상태
- 담당자 배정 (드래그·클릭) · dowMap (요일별)
- 매주 요일 적용 · zone_assignments 저장
- 자동 배정 (auto-assign)
- ⚠️ #64 · 구역 진열요청 UI 삭제됨 (담당자 배정만 유지)

### API 연동
- GET /api/zones · 구역 배정
- POST /api/zones · 저장
- GET /api/zone-defs · 구역 정의
- GET /api/employees · 담당자 리스트
- GET /api/products-map · 구역별 상품

### 페이지 연동
- 구역 클릭 → ZoneProductsModal
- 상품 클릭 → ProductInfoModal (ProductBasicInfoPanel · #98)

### 테스트 체크리스트
- [ ] 🟡 매장구역도 · 시각화 · 구역별 담당자 색상
- [ ] 🟡 담당자 드래그 · 배정 · DB 저장
- [ ] 🟡 매주 요일 적용 · dowMap 저장
- [ ] 🟡 ⚠️ 구역 진열요청 버튼 X (#64 삭제 확인)
- [ ] 🟡 구역 클릭 → ZoneProductsModal · 리스트 표시
- [ ] 🟢 자동 배정 · 담당자 rotation
- [ ] 🟢 창고1/창고2 서브탭 · 각 창고별 구역
- [ ] 🟢 실재고 테이블 서브탭 · 상품별 재고 매트릭스
- [ ] 🟢 배치구역 불일치 서브탭 · location vs real_map

---

## 9. SalesTrendPage (매장>판매)

**파일** · `src/components/SalesTrendPage/SalesTrendPage.tsx`
**서브탭** · 판매현황 · 판매급상승 · 공급사트렌드 · 통계 · 판매대시보드

### 기능 리스트
- 판매현황 · 상품별 판매량·판매액
- 판매급상승 · 최근 7/30일 · 판매량 desc
- 공급사트렌드 · 공급사별 매출·매입
- 통계 · 카테고리·이익률·계절성
- 판매대시보드 · 차트 7종 (#36 · Top10·카테고리·이익률·손실·산점도 등)

### API 연동
- GET /api/stock-manage/top-sales · 판매급상승
- GET /api/stock-manage/supplier-purchases · 공급사 매입
- GET /api/products/purchase-history · 최근 매입가

### 테스트 체크리스트
- [ ] 🟡 판매현황 · 필터 (전체·판매중·판매중지)
- [ ] 🟡 판매급상승 · 기간 필터 (7일·30일·계절)
- [ ] 🟢 공급사트렌드 · 공급사별 매출·매입 비교
- [ ] 🟢 통계 차트 7종 렌더링 · Recharts 정상
- [ ] 🟢 판매대시보드 · SaleStatusFilter 필터 반영

---

## 10. ProductInfoPage (매장>매입>상품정보)

**파일** · `src/components/ProductInfoPage/ProductInfoPage.tsx`

### 기능 리스트
- SplitListPanel · 상품 리스트 (검색·판매상태 필터)
- 우측 상세 · ProductBasicInfoPanel + 상세정보 (편집)
- 신규 상품 등록 · ProductCreateModal
- 인라인 편집 · 상품명·공급사·카테고리·가격·규격·바코드 등

### API 연동
- GET /api/products-map?include_inactive=1&include_hidden=1 · 전체 리스트
- GET /api/products/:code · 상세 (⚠️ warehouse1/2·store/store3 병합 · #58)
- PATCH /api/products/:code · 편집
- POST /api/products · 신규 등록

### 테스트 체크리스트
- [ ] 🟡 상품 리스트 · 검색 · 판매상태 필터
- [ ] 🟡 ⚠️ 우측 상세 · ProductBasicInfoPanel · 14필드 (수량·단가·바코드·판매상태·구역 우선)
- [ ] 🟡 인라인 편집 · [수정] 버튼 · 저장
- [ ] 🟡 신규 등록 · ProductCreateModal · 상품코드 unique
- [ ] 🟢 진열위치·판매상태 인라인 편집 (ProductBasicInfoPanel)

---

## 11. BorrowingPage (매장>발주>차용)

**파일** · `src/components/OrderManagePage/BorrowingPage.tsx`

### 기능 리스트
- 대여·차용 등록 · 약국(자기)·공급사·외부
- 반환 확인 (return_confirmed)
- ⚠️ #80 · 대여자/차용자 선택 · empty state fix

### API 연동
- GET /api/borrowings · 리스트
- POST /api/borrowings · 등록
- GET /api/borrowings/parties · 자동 병합 (약국+공급사+외부)
- PATCH /api/borrowings/:id/return · 반환 확인

### 테스트 체크리스트
- [ ] 🟡 대여 등록 · 대여자·차용자·상품·수량·날짜
- [ ] 🟡 ⚠️ 대여자/차용자 선택 · 약국 자동 · 공급사 검색 · 외부 자유 (#80)
- [ ] 🟡 반환 확인 · 부분 반환 지원
- [ ] 🟢 이력 필터 · 진행중/완료/전체

---

## 12. StaffManagePage (경영>직원관리)

**파일** · `src/components/StaffManagePage/StaffManagePage.tsx`

### 기능 리스트
- 직원 리스트 · 검색·필터 (재직/퇴사/전체)
- 신규 직원 등록 · SettingsModal (position/rank/level)
- 계약서 이력 · EmployeeProfileCard 표시
- 인수인계 · 퇴사자 처리

### API 연동
- GET /api/employees · 리스트 (⚠️ retire_date 포함 · #185)
- POST /api/employees · 등록
- PATCH /api/employees/:id · 편집
- GET /api/employee-contracts?employeeId=X · 계약 이력 (⚠️ latest=1 파라미터 · #103)

### 페이지 연동
- 직원 → ContractWriterPage (근로계약서 작성)
- 퇴사 → ResignationWriterPage · ResignationApprovalPage

### 테스트 체크리스트
- [ ] 🟡 직원 리스트 · 검색 · 재직/퇴사 필터
- [ ] 🟡 신규 등록 · position·rank·level 자유 텍스트 (#177 P2)
- [ ] 🟡 rank rename · JWT 재로그인 안내 toast (#185)
- [ ] 🟡 계약 만료 임박 배지 · D-30·오늘·경과 (#182 확장)
- [ ] 🟢 EmployeeProfileCard · 최신 계약 표시 (#103)

---

## 13. ContractWriterPage (경영>계약서 작성)

**파일** · `src/components/ContractWriterPage/ContractWriterPage.tsx`

### 기능 리스트
- 근로계약서 작성 · 8항목 자동 분해 (기본급·연장·야간·주휴 등)
- 임금 계산 (시급×주시간×4.345 = 세전)
- PDF 생성 · Drive 업로드
- 서명·도장 렌더링
- 카테고리별 이해·동의 (T6)

### API 연동
- POST /api/employee-contracts · 저장
- POST /api/employee-contracts/upload · Drive 업로드

### 테스트 체크리스트
- [ ] 🟡 계약 유형 선택 · 정규직·기간제·수습 등
- [ ] 🟡 임금 계산 · 자동 · 세전·세후 표시
- [ ] 🟡 PDF 생성 · html2canvas + jsPDF · 파일명 포맷
- [ ] 🟢 서명·도장 · 이미지 렌더
- [ ] 🟢 재계약 · 이전 종료일 다음날 자동

---

## 14. StockCheckPage (재고체크)

**파일** · `src/components/StockCheckPage/StockCheckPage.tsx`

### 테스트 체크리스트
- [ ] 🟡 재고 스냅샷 리스트
- [ ] 🟡 손실 추적
- [ ] 🟢 스냅샷 상세

---

## 15. VatPreparePage (부가세 준비)

**파일** · `src/components/VatPreparePage/VatPreparePage.tsx`
**서브탭** · 매입 · 매출 · 공급사별 VAT

### 테스트 체크리스트
- [ ] 🟡 기간 선택 · 분기별 · 반기별
- [ ] 🟡 매입 VAT · 공급사별 집계
- [ ] 🟢 매출 VAT · 판매액 집계

---

# Part 3 · 🟢 관리·설정·기타 페이지 (12)

## 16. MyPage (마이페이지)

**파일** · `src/components/MyPage/MyPage.tsx`

### 테스트 체크리스트
- [ ] 🟢 내 정보 조회 · EmployeeProfileCard
- [ ] 🟢 근무 이력 · 스케줄
- [ ] 🟢 계약 이력 · latest-contract

---

## 17. BoardPage (게시판)

**파일** · `src/components/BoardPage/BoardPage.tsx`

### 테스트 체크리스트
- [ ] 🟢 게시글 리스트 · 검색
- [ ] 🟢 작성·수정·삭제
- [ ] 🟢 멘션 · 직원 자동완성

---

## 18. PharmacistPage (약사전용)

**파일** · `src/components/PharmacistPage/PharmacistPage.tsx`
**서브탭** · 4개

### 테스트 체크리스트
- [ ] 🟢 약사 로그인 · 페이지 접근 권한
- [ ] 🟢 약사 팀 구성 · 스케줄 연동

---

## 19. ReservationPage · LunchPage · LeavePage (예약·점심·연차)

### 테스트 체크리스트
- [ ] 🟡 예약 등록 · 승인 flow
- [ ] 🟡 점심 등록 · 오늘 eating 상태
- [ ] 🟡 연차 신청 · pending → approved
- [ ] 🟢 카운트 · LandingPage 배지 연동

---

## 20. ApprovalRequestPage · ApprovalCenterPage (승인)

### 테스트 체크리스트
- [ ] 🟢 승인 대기 리스트 · 관리자 뷰
- [ ] 🟢 승인/거절 · 이력 저장

---

## 21. HrFormsPage (HR 서식)

### 테스트 체크리스트
- [ ] 🟢 서식 리스트 · PDF 다운로드
- [ ] 🟢 사직서 · ResignationWriterPage
- [ ] 🟢 근로계약서 · ContractWriterPage

---

## 22. SystemSettingsPage · CompanyInfoSettingsPage · BrandingSettingsPage · PermissionsPage · SeasonSettingsPage · ContractSettingsPage (설정 6종)

### 기능 리스트
- SystemSettingsPage · 시스템 전역 · 이미지 업로드 · SectionCard
- CompanyInfoSettingsPage · 사업장 정보 · 대표자·주소·연락처
- BrandingSettingsPage · 브랜드 톤 · 로고·색상
- PermissionsPage · 메뉴 노출 (`app_settings` · KV) · 신규 페이지 자동 마이그
- SeasonSettingsPage · 계절 정의 · 판매 분석용
- ContractSettingsPage · 계약서 템플릿 · 서명·도장

### API 연동
- GET/PATCH /api/settings · KV
- POST /api/upload/logo · 이미지

### 테스트 체크리스트
- [ ] 🟢 각 설정 · 저장 · 즉시 반영 (window event)
- [ ] 🟢 이미지 업로드 · Drive · KV 저장
- [ ] 🟢 권한 게이트 · 관리자 (level 9+) 만 접근
- [ ] 🟢 메뉴 노출 편집 · 사이드바 즉시 반영

---

## 23. OcrPage (OCR 도구)

### 테스트 체크리스트
- [ ] 🟢 이미지 업로드 · PP-OCR/EasyOCR/Gemini 엔진
- [ ] 🟢 셀 재추출
- [ ] 🟢 매입내역 자동 임포트 (매입일 · 상품 · 수량 · 단가)

---

## 24. CardHistoryPage · CardRegisterPage (카드 · #69)

### 테스트 체크리스트
- [ ] 🟡 카드 등록 · 카드사·별칭·마지막4자리·결제일 (1-31)
- [ ] 🟡 카드 편집·삭제 (soft)
- [ ] 🟡 카드별 결제 이력 · 차월 결제 예정액 계산
- [ ] 🟢 결제일 자동 표시 · billing_day 기반 청구기간

---

## 25. DisplayPage 서브페이지 (MismatchPage · RealStockTablePage)

### 테스트 체크리스트
- [ ] 🟢 배치구역 불일치 · location vs real_map · fix 액션
- [ ] 🟢 실재고 테이블 · 상품×창고 매트릭스

---

## 26. StockArrivalPage (상품입고 대안) · DocumentWriterPage · PharmacistMenuSettingsPage

### 테스트 체크리스트
- [ ] 🟢 문서 작성 · 서식 렌더
- [ ] 🟢 약사 메뉴 설정 · pharmacist-only 페이지 노출

---

# Part 4 · 통합·E2E 테스트 (페이지 간 데이터 흐름)

## E1. 발주 · 매입 · 재고 3-way flow

**시나리오** · 상품 부족 → 발주 → 입고 → 재고 반영

1. LandingPage · 발주 필요 배지 확인
2. OrderManagePage 발주필요 탭 · 리스트에서 상품 선택
3. 발주요청 담기 · 수량 편집
4. 발주요청 탭 · 발송 (이메일)
5. 발송 확인 → 발주이력 이동
6. ProductArrivalPage 검수 · 바코드 스캔 · 수량·단가 입력 · 저장
7. → products.current_stock 자동 증가 (#98)
8. ScanPage 재고 확인 · 창고 슬롯 반영

**체크**
- [ ] 🔴 각 단계 · 데이터 정합성 (order_requests · purchase_details · products · inventory_checks)
- [ ] 🔴 서버 로그 · 오류 없음 · 각 POST/PATCH 성공
- [ ] 🔴 브라우저 새로고침 후 · 데이터 유지

## E2. 진열요청 · 상품 스캔 → 요청목록 flow

**시나리오** · 상품 스캔 → 진열요청 → RequestsPage → 완료

1. ScanPage · 상품 바코드 스캔
2. 매장 재고 부족 → 진열요청 버튼 활성 (강조)
3. 진열요청 클릭 → confirm dialog · 전송
4. RequestsPage 진열요청 탭 · 리스트 반영 (상품명 표시)
5. 담당자 · 준비완료 · 완료 액션

**체크**
- [ ] 🔴 ⚠️ product_code 기반 · zone_id 자동 채움 (#64)
- [ ] 🔴 ⚠️ 매장구역도에는 진열요청 UI 없음 (#64 삭제 확인)
- [ ] 🔴 RequestsPage 상품명 표시 (#63)

## E3. 거래처 승인 flow

**시나리오** · 거래처 자체 로그인 → 정보 입력 → 승인 요청 → 관리자 승인

1. Vendor Portal 로그인 (담당자 핸드폰 · #178)
2. VendorDetailModal · 5필드 입력 (email·사업자번호·팀장 이름·팀장 연락처·긴급 연락처)
3. 승인 요청 버튼
4. 관리자 · LandingPage 배지 (오늘의 현황)
5. RequestsPage 거래처 승인 탭
6. 승인 → approval_status='approved'

**체크**
- [ ] 🔴 ⚠️ 5필드 미입력 시 승인 요청 차단 (#54)
- [ ] 🔴 ⚠️ 자동저장 · isDirty · 팀장 3필드 포함 (#54)
- [ ] 🟡 승인 후 · 대시보드 배지 감소

## E4. 결제 · 카드 flow (#69)

**시나리오** · 매입 완료 → 결제 등록 → 카드 결제 이력

1. PaymentInputPage · 공급사별 미납 리스트
2. 결제 등록 · 방법 'card' 선택
3. CardRegisterPage · 새 카드 등록 (필요 시)
4. 카드 선택 · 결제일 확인
5. 저장 → 최근결제내역 반영
6. CardHistoryPage · 카드별 결제 이력 · 차월 결제 예정액

**체크**
- [ ] 🟡 카드 결제 · card_id FK 저장
- [ ] 🟡 결제일 (billing_day) 기반 · 차월 예정액 계산
- [ ] 🟢 카드 삭제 시 · supplier_payments.card_id → NULL (ON DELETE SET NULL)

## E5. 스케줄 · 구역 배정 flow

**시나리오** · 스케줄 편집 → EmployeeCalendarModal → 구역 배정

1. SchedulePage · 월별 스케줄
2. 직원 셀 클릭 → EmployeeCalendarModal
3. 4탭 (직원정보 · 달력 · 일괄등록 · 구역)
4. 구역 탭 · zone_assignments 수정
5. DisplayPage 매장구역도 확인 · 동기 반영

**체크**
- [ ] 🟡 ⚠️ 4탭 통합 UI (직원정보 첫 탭 · #62)
- [ ] 🟡 ⚠️ 전월 복사 · targetYear·targetMonth 파라미터 (#60)

---

# 회귀 우선순위 (테스트 순서 추천)

## 1순위 · 최근 3일 리팩터 (2026-09-01~09-03)
- [ ] E1 · 발주·매입·재고 flow (⚠️ 여러 커밋 영향)
- [ ] E2 · 진열요청 flow (#64)
- [ ] ProductArrivalPage 단가·유통기한 저장 (#98)
- [ ] OrderManagePage 발송 성공/실패 dialog (#79-#82)
- [ ] 우측 패널 · ProductBasicInfoPanel 14필드 표시 (#98)

## 2순위 · 이번 주 리팩터 (2026-08-28~09-03)
- [ ] SchedulePage 전월 복사 (#60)
- [ ] EmployeeCalendarModal 4탭 통합 (#62)
- [ ] 거래처 승인 · 5필드 검증 (#54)
- [ ] BorrowingPage empty state (#80)
- [ ] CardHistoryPage · CardRegisterPage (#69)

## 3순위 · 지난 2주 리팩터
- [ ] 재고 endpoint 필드명 (#100)
- [ ] 상품 endpoint 필드 통일 (#101)
- [ ] 직원 계약 endpoint 통합 (#103)

## 4순위 · 나머지 (기능 정상 확인)
- [ ] 각 페이지 · 로그인·페이지 진입·기본 flow
- [ ] 각 설정 · 저장·즉시 반영
- [ ] Board · Pharmacist · Reservation · Lunch · Leave · Hr

---

# 부록 · 참고 파일

- [MENU_STRUCTURE.md](./MENU_STRUCTURE.md) · 페이지 구조 전체 (2272줄)
- [TASKS_HANDBOOK.md](./TASKS_HANDBOOK.md) · 태스크 이력
- [FRAMEWORK.md](./FRAMEWORK.md) · 43+ 프리미티브
- 최근 커밋 · `git log --oneline -30`

---

**작성일** · 2026-09-03
**총 페이지** · 27 (메인+서브)
**총 서브탭** · 49
**총 체크리스트** · 130+ (E2E 5개 포함)
**크리티컬 항목** · 42개 (🔴)
