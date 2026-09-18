# 🔒 Test-Locked Pages · 잠금 관리

**규칙**
- 페이지 테스트 완료 · 사용자 최종 확인 · **이 파일에 등재**
- 등재 후 · **해당 페이지 파일 수정 절대 X** (긴급 크리티컬 fix 제외 · 사용자 명시 승인 필수)
- 대원칙 · "테스트 완료 = 잠금"

**참조**
- 테스트 절차 · [`TEST_LIST_2026-09-11_session.md`](./TEST_LIST_2026-09-11_session.md)
- 오늘 세션 · 2026-09-18 · 65+ 커밋 · 대량 개선

---

## 🟢 Phase 1 · 안전 페이지 · 진행 예정

_아직 잠금 페이지 없음 · 사용자 테스트 시작 대기_

| # | 페이지 | 잠금일 | 최종 커밋 | 확인자 사인 |
|---|---|---|---|---|
| (없음) | | | | |

---

## 🟡 Phase 2 · Refactor 영향 페이지 · 백그라운드 완료 후

_다음 대기 (refactor 완료 시 해금)_

- 매장구역도 (RealStockTablePage)
- 매장 · 상품정보 (ProductInfoPage)
- 매장 · 공급사 (VendorManageSplit · VendorListEditor)
- 실재고확인 (ScanPage)
- 매입검수 (ProductArrivalPage)
- OCR (OcrPage + RawOcrTable/*)
- 발주관리 (OrderManagePage · PurchaseHistoryTab · OrderHistoryTab · PaymentInfoTab)
- 인사양식 (HrFormsPage)
- 재고확인 (StockCheckPage)
- 재고입고 (StockArrivalPage)

---

## 🔵 Phase 3 · Admin/설정 페이지 · 순차 예정

- 경영관리 · 직원관리 · 연차승인 · 점심불참 · 직원권한
- 권한관리
- 회사정보 · 브랜딩 · 계절 · 시스템 · 스케줄 · 발주 · 설정허브

---

## 🟣 Phase 4 · 통합 시나리오

- 상품등록 → 매입 → 실재고 → 발주 → 결제 · end-to-end
- OCR → 매입 확정 → 발주 이력
- 계약서 → PDF → 급여 계산
- 반응형 · 모바일 · 사이드바 · 하단탭

---

## 진행 상태 · 세션 마지막 갱신

- **최종 갱신** · 2026-09-18
- **진행중 백그라운드** · SortHeader (진행 중) · devLog (진행 중) · xlsx 리서치 (진행 중)
- **테스트 시작 · Phase 1 · #1 로그인 페이지부터**
