# 오산 메가타운 약국 토탈 시스템 · 도메인 관점 종합 조사 리포트

> 작성일: 2026-09-01 · 조사 기준: 현재 codebase (main · 최신 커밋)

---

## 1. 도메인 완성도 · 기능 매트릭스

### 구현 완료

| 도메인 | 기능 | 핵심 파일 |
|--------|------|-----------|
| 발주 | 발주요청·승인·이력·발주필요 탭·PDF 출력·카톡 전송 | `OrderManagePage` · `OrderRequestTab` |
| 매입 | OCR 명세서 업로드·파싱·검수·Gemini/Mistral 엔진 | `OcrPage` · `server/ocr/` |
| 매입 | xlsx 임포트 → purchase_details upsert · 중복방지 | `purchase.ts` |
| 매입 | 공급사별 결제 이력·잔액·입금 등록 | `PaymentInfoTab` · `supplierPayments/` |
| 매입 | 반품 요청 · 공급사별 그룹 발송 | `returnRequests.ts` · `ReturnListPanel` |
| 매입 | 부가세 준비 · 반기/분기 집계·신고서 미리보기 | `VatPreparePage` · `vat.ts` |
| 상품 | 상품 등록·수정·숨김·판매상태 관리 | `ProductInfoPage` · `products.ts` |
| 상품 | 적정재고(optimal_stock) 기준 재고부족 목록 | `lowStock.ts` · `optimalStock.ts` |
| 상품 | 유통기한 임박 목록 (`expiry_date` 컬럼 기반) | `ExpiryImminentTab` |
| 판매현황 | 재고 스냅샷(stock_history) 기반 판매수량·손실 집계 | `DashboardTab` · `topSales.ts` |
| 판매현황 | KPI 카드(판매액·수량·손실률·이익률) | `DashboardTab` |
| 판매현황 | 공급사별·상품별 트렌드 탭 | `SupplierTrendTab` · `ProductTrendTab` |
| 판매현황 | 손실 추적 일별 스냅샷·집계 | `lossTracking.ts` · `LossHistoryTab` |
| 재고 | 바코드 스캔 실재고 입력 · 창고/매장 분리 | `ScanPage` · `StockCheckPage` |
| 재고 | 실재고 vs ERP 차이(DiffTab) · 손실 추적 | `DiffTab` · `StockReconciliationTab` |
| 재고 | xlsx 재고현황 업로드 → stock_history upsert | `uploadStock.ts` |
| 재고 | 재고흐름(입고·판매·손실·기말) 뷰 | `FlowTab` · `StockFlowPanel` |
| 직원 | 직원 등록·수정·퇴사·직군·직급 | `StaffManagePage` · `staff.ts` |
| 직원 | 근로계약서 작성·PDF 저장·이력 | `ContractWriterPage` · `employeeContracts.ts` |
| 직원 | 임금 자동계산(세전역산·4대보험·세금) | `src/lib/payroll/` |
| 직원 | 연차 등록·조회·승인 | `LeavePage` · `leave.ts` |
| 직원 | 사직서 작성·승인·이력 | `ResignationWriterPage` · `resignations.ts` |
| 직원 | 스케줄 월별 입력·복사 | `SchedulePage` · `scheduleService.ts` |
| 매장 | 구역도 인라인 편집·진열 관리 | `DisplayPage` · `zoneDefs.ts` |
| 매장 | 진열 불일치 리포트·요청 | `mismatches.ts` · `requests.ts` |
| 알림 | 카카오 알림(SolAPI)·Web Push·인앱 알림 | `kakaoNotifyService.ts` · `NotificationBell` |
| 보안 | JWT(httpOnly 쿠키+Bearer)·Access 15분·Refresh 30일 | `requireAuth.ts` |
| 보안 | 레벨 기반 권한(5~9+) · authorize(minLvl) | `requireAuth.ts` |
| 보안 | Supabase RLS 전테이블 활성(service_role bypass) | `sql/2026-08-30c-enable-rls-all-tables.sql` |
| 보안 | Audit log(winston DailyRotate · 30일 보관) | `auditLogger.ts` |
| 보안 | SSO jti 재사용 방지(인메모리 5분 TTL) | `requireAuth.ts` |
| OCR | Gemini / Mistral 멀티엔진 파이프라인 | `server/ocr/pipeline/` |
| OCR | 공급사 별칭·동의어·템플릿 DB 저장 | `aliasesRouter` · `synonymsRouter` · `templatesRouter` |
| 기타 | 차용 등록·화살표 UI | `BorrowingPage` · `borrowings.ts` |
| 기타 | 게시판·공지 | `BoardPage` · `board.ts` |
| 기타 | 점심 메뉴 주문 | `LunchPage` · `lunch.ts` |
| 기타 | 약사 메뉴 관리(PharmacistPage) | `pharmacistMenuItems.ts` |

### 없는 기능 (약국 도메인 관점 Gap)

| 기능 | 중요도 | 비고 |
|------|--------|------|
| POS 연동 (판매 원데이터) | P0 | 현재 stock_history 스냅샷 추정치만 · 실제 판매건 없음 |
| 처방전 관리·조제 이력 | P1 | 전문약 약국 필수 · 완전 부재 |
| 고객 마일리지·CRM | P2 | 단골 고객 관리 없음 |
| 자동 발주 트리거 | P1 | optimal_stock 기반 재고부족 감지 있음 · 자동 발주 생성은 없음 |
| 근태(출퇴근 기록) | P1 | 스케줄 입력은 있음 · 실제 출퇴근 클록인/아웃 없음 |
| 급여명세서 발급 | P1 | 임금 계산 라이브러리 있음 · 직원별 월 명세서 발송/PDF 없음 |
| 세금계산서 자동 발행 (전자세금계산서) | P1 | 부가세 준비 페이지 있음 · 홈택스 API 연동 없음 |
| 의약품 재활용·반납 추적 | P2 | 반품 요청은 있음 · 재활용/환경부 신고 없음 |
| 고객 손님 알림 (복약안내·예약) | P2 | 직원 알림만 구현 |
| 재고 자동 발주 (ERP 연계) | P1 | 수동 발주만 |
| 세무신고 전자 제출 | P2 | 부가세 집계까지만 |
| 임금대장(4대보험 신고용) | P1 | 계산 로직 있음 · 공단 제출 양식 없음 |

---

## 2. 데이터 정합성

### 재고 3중 구조

```
products.current_stock   ← ERP/xlsx 기준 장부 재고
inventory_checks         ← 바코드 스캔 실재고 (창고1/2·매장1/2/3 분리)
stock_history            ← 월별 스냅샷 (판매·손실 추정 원천)
```

**문제**: `products.current_stock` 갱신 시점이 명확하지 않음. 스캔 후 `inventory_checks` 업데이트 → `products.current_stock` 자동 동기 여부 코드 확인 필요. `stock_history` 는 xlsx 수동 업로드 의존 → **마지막 업로드 34일 경과(TASKS.md 언급)** · 손실·판매 집계 stale 위험.

**강점**: `calcLoss = opening - sale - closing` 수식이 `StockFlowPanel`에 명시되어 있고 `lossTracking.ts`에 스냅샷 기반 집계 구현됨. DiffTab(실재고 차이)도 stock_history 대비 inventory_checks 비교로 명확히 분리됨.

### 발주 → 매입 흐름

```
order_requests(발주요청) → purchase_details(xlsx/OCR 임포트) → ocr_confirmed_items(승인)
```

**문제**: 발주 → 매입 자동 연결 없음. 발주 완료 후 실제 입고가 purchase_details 어느 행과 대응되는지 추적 불가. `verify_status` 컬럼이 추가됐지만(2026-08-29 migration) UI/서버 Phase 2 이후 미완성.

### OCR 정합성

**강점**: 8단계 파이프라인(gemini → match → math-fill → verify → totals), vendor 별칭·동의어 DB, 코스트팜(수신처) 오인식 방지 규칙 `excludedSuppliers.ts`. 95% 이상 매칭율 타깃.

**문제**: OCR 루트 상위 폴더(`server/ocr/`)와 하위 폴더(`server/ocr/engines/` `parsing/` `logging/` `tables/`) 중복 파일 존재 (gemini.ts, llm.ts 등). 어느 파일이 실제 진입점인지 혼란 위험.

---

## 3. UI/UX 필요 정보

### 대시보드

- `LandingPage/TodayStatusPanel`: 연차 대기·매장요청·발주·불일치·반품·사직서 건수 집계. 페이지 숨김 설정과 연동(usePageVisibility).
- **없는 것**: 오늘 매출 실시간(POS 미연동), 만료 임박 알림 뱃지(유통기한 D-30은 ExpiryImminentTab 있으나 랜딩 알림 없음), 발주 필요 상품 수.

### 리포트

- 일/월 판매 집계: DashboardTab·SalesTrendPage 에서 stock_history 기반 제공. **실제 POS 매출 없이 재고 스냅샷 추정치**라는 점이 핵심 한계.
- 손실: DiffTab·LossHistoryTab 구현 완료.
- 이익률: DashboardTab KPI에 avgProfitRatePct 계산 (구매가 대비). 구매가 없는 상품 제외.
- **없는 것**: 연간 손익계산서, 공급사별 이익률 리포트, 재고회전율 자동 계산 페이지.

---

## 4. 보안·권한

### 강점

- JWT Access(15분)/Refresh(30일) 분리, httpOnly 쿠키
- SSO jti 재사용 방지(인메모리 TTL)
- Supabase RLS 전테이블 활성(SERVICE_ROLE bypass) · anon 차단
- Audit log 30일 보관(winston DailyRotateFile)
- 2026-09-01 서버 프레임워크 감사 완료 · authorize+validateBody 32건 추가 · 위반 58% 감소(55→23)

### 문제

- **재무 데이터 미분리**: VatPreparePage(매출·이익) · PaymentInfoTab(결제이력) 가 `authorize(5)` 이상이면 접근 가능. 매출/이익 데이터는 관리자(level 9) 전용으로 격상 권장.
- **급여 데이터 노출**: ContractWriterPage의 임금 계산 결과가 어떤 level에서 접근 가능한지 라우트 레벨 확인 필요.
- **audit log 미커버**: 상품 가격 수정, 재고 업로드(xlsx), 매입 승인 등 주요 금융 작업이 audit 기록 안 됨(로그인/비번 변경만 기록).
- **개인정보**: 직원 계약서·급여·연락처가 `/api/staff` 에 level 제한 있으나 개별 필드 세분화 없음.

---

## 5. 성능·확장성

### 강점

- products 조회: 인메모리 캐시(getProductMap·getPublicProductMap) + ?fields=slim 슬림 응답
- stock_history 페이지네이션: fetchAllWithRange + 1000행 cap 우회
- topSales 인메모리 캐시(TTL) + lowStock 2분 캐시
- Supabase 인덱스: purchase_date·product_code·supplier 다수 추가(perf_indexes SQL 2회)
- purchase_details 12,933+행 · 현재 응답 정상

### 문제

- **stock_history 전량 조회**: topSales.ts의 season 모드에서 WHILE 루프로 전 데이터 조회 후 클라이언트 필터. 데이터 누적 시(1년 = 365 × 상품수) 수십만 행 스캔 위험.
- **productCache 인메모리**: Render 재배포 시 캐시 소실 + 단일 프로세스 전제. 멀티 인스턴스 불가.
- **OCR 중복 파일**: `server/ocr/` 상위에 gemini.ts·llm.ts·parse.ts 등 구버전 잔재. 번들 크기 및 유지보수 혼란.
- **stock_history 스냅샷 34일 stale**: 판매현황 전체가 오래된 데이터 기반.
- **오프라인 미지원**: 스캔·발주 모두 네트워크 필수. 단전/Wi-Fi 단절 시 완전 중단.

---

## 6. 사용성

### 강점

- 폰트 +2 규칙(40대+ 가독성) 적용 완료
- Pretendard + antialiasing + GPU 가속 적용
- PWA(ServiceWorker) + iOS 설치 가이드(IosInstallGuide)
- SearchBar 프레임워크: 14개 페이지 통일 완료
- SplitListPanel 패턴: 좌우 분할 + 검색 상단 고정
- Vitest 3,410건 통과

### 문제

- **신규 사용자 온보딩 없음**: 매뉴얼·가이드 없음. 용어(purchase_details, ocr_confirmed 등)가 사용자에게 노출될 수 있음.
- **매장구역도 상세카테고리 미입력**: DisplayPage 진열 현황 불완전(TASKS 언급).
- **타이핑 글씨 깨짐**: 위치 불명(TASKS 열린이슈).
- **바코드 SSO 열린이슈**: iOS 타 브라우저 전환 시 세션 유지 불안정(TASKS #174).

---

## 7. 미해결 문제

| 구분 | 내용 | 위험도 |
|------|------|--------|
| 재고 스냅샷 stale | stock_history 34일 미업로드 → 판매현황·손실 데이터 부정확 | 높음 |
| OCR 중복 파일 | server/ocr/ 상위 6개 파일 vs engines/parsing/logging/tables/ 구조화 버전 | 중간 |
| 발주↔매입 연결 미구현 | verify_status Phase 2 미완성 | 중간 |
| 급여명세서 미구현 | 임금 계산 로직은 완성 · 직원별 월 발급 없음 | 중간 |
| 근태 미구현 | 스케줄만 있고 실제 출퇴근 기록 없음 | 중간 |
| 재무 접근 권한 미세화 | 매출·이익 데이터 level 5 접근 가능 | 중간 |
| audit log 미커버 | 상품가격·재고업로드·매입승인 미기록 | 중간 |
| 자동 발주 트리거 없음 | optimal_stock 기반 감지 → 발주 생성 자동화 없음 | 낮음 |

---

## 우선순위 정의

### P0 · 즉시 Fix 가능 (코드 수정 없이 또는 소규모)

1. **stock_history 재업로드**: xlsx 업로드 1회 실행 → 판매현황 전체 신선도 복구. 코드 아님 · 운영 액션.
2. **재무 API authorize 레벨 상향**: VatPreparePage API (`/api/vat/*`) · `authorize(5)` → `authorize(9)` 변경. 1~2행 수정.
3. **audit log 확대**: `products.ts` 가격 수정·`uploadStock` 업로드·`ocrConfirmed` 승인에 `audit()` 호출 추가. 각 10행 이내.

### P1 · 이번 세션 또는 단기 (사용자 결정 필요)

1. **OCR 중복 파일 정리**: `server/ocr/` 상위 구버전(gemini.ts·llm.ts·parse.ts 등) 제거 또는 re-export stub으로 교체.
2. **급여명세서 PDF**: `src/lib/payroll/` 기반 월별 PDF 생성 + 직원 다운로드. ContractWriterPage 패턴 재활용 가능.
3. **근태 클록인/아웃**: SchedulePage에 출퇴근 기록 컬럼 추가 or 별도 AttendancePage.
4. **발주↔매입 verify Phase 2**: verify_status UI 완성 (ProductArrivalPage 패턴 재사용).
5. **자동 발주 제안**: lowStock API 결과 기반 OrderNeedTab에 "자동 발주 추가" 버튼.

### P2 · 중장기 (아키텍처 결정 필요)

1. **POS 연동 or 판매 원데이터**: stock_history 스냅샷 한계 근본 해결.
2. **처방전·조제 관리**: 전문약 약국 필수지만 도메인 복잡도 높음.
3. **고객 마일리지 CRM**: 별도 고객 테이블·포인트 시스템.
4. **홈택스 전자세금계산서 연동**: 부가세 페이지 → API 연동.
5. **임금대장 공단 양식**: 4대보험 신고용 Excel 양식 출력.

---

## 최종 완성도 등급

**B+ (약 75~80%)**

- 핵심 도메인(발주·매입·재고·직원)의 기본~중급 기능 모두 구현
- 프레임워크(프리미티브·API 통일·테스트 3,410건)가 탄탄하게 구축됨
- **POS 연동 없음**(판매 원데이터 부재)이 대형 약국 토탈 시스템으로서 가장 큰 구조적 한계
- 근태·급여명세서·처방전 등 필수 도메인 기능 미구현이 등급 하락 요인

### 다음 단계 로드맵

```
즉시(P0)      stock_history 재업로드 · VatPage authorize(9) · audit log 확대
단기(P1, 1~2주)  급여명세서 PDF · 근태 · OCR 중복 제거 · 발주↔매입 verify 완성
중기(P2, 1~2개월)  POS 연동 검토 · 처방전 모듈 · 자동 발주 · 홈택스 연동
장기(P3)      고객 CRM · 임금대장 공단 신고 · 오프라인 지원
```
