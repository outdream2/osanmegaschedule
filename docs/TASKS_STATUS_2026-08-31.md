# 태스크 상세 · 상태 스냅샷 · 2026-08-31

> 사용자 지시 · 태스크 상세사항 추가 · 업데이트 · 저장
> 커밋 · dfc7aaa7 시점

---

## 진행 중 (in_progress · 5개)

### #9 · #130 차용등록 재설계
- **상태**: Phase A SQL 준비 완료 · 사용자 실행 대기
- **파일**: `supabase/migrations/20260831_borrowing_parties_signatures.sql`
- **다음**: 사용자 SQL 실행 → 코드 Phase A (프리미티브 4개 · UI 3-column)
- **소요**: 최소 8-10h · 완전 16-24h

### #10 · 전체프로젝트 데이터 정합성
- **완료**: zone_defs (54 rows · location · assignee 이관)
- **진행**: products.location vs display_location vs real_map · purchase_details 3-way · vendor 매핑
- **다음**: 자동 검증 스크립트

### #11 · 같은 기능 endpoint 통일
- **완료**: matchesSupplierQuery · matchesProductQuery 확산 (OrderHistoryTab · BorrowingPage)
- **다음**: ExpiryImminentTab · RealStockTablePage · UnassignedProductsTab · 8-12 파일 후보

### #13 · real_map → location
- **현황**: 135건 real_map 사용
- **스코프**: 실재고 스캔 (ScanPage) + 배치구역 불일치 (mismatches) 만 유지
- **다음**: 표시·조회 110건 · location fallback 순차 적용

### #18 · 실재고 · 매장 슬롯 삭제 기능
- **스펙**: 이미 추가된 매장 슬롯 삭제 (잘못 추가 시)
- **위치**: `src/components/ScanPage/StockRowCard.tsx` · SLOTS 배열 (s1·s2·s3)
- **다음**: 각 슬롯 우측 × 버튼 · addQty=0 · zone=null · confirm 후

---

## 대기 (pending · 큰 스코프)

### #14 · KV → DB 이관
- **낮은 우선순위** · 대부분 UI 프리퍼런스 (세션·사이드바·필터·카메라 캐시)
- **조사 필요**: ContractSettingsPage JOB_WAGES_KEY · CONTRACT_CLAUSES_KEY (도메인 데이터?)

### #15 · 매장구역도 상세카테고리 수동 입력 (사용자)
- **작업 주체**: 사용자
- **인프라 완료**: ZoneCellPicker · 상세 카테고리 편집 가능 (텍스트박스 · 프리셋)

### #16 · API 프레임워크 재구성 (대형)
- **별도 세션** · 40+ 라우트 파일 · 도메인 단위 통합 계획
- **먼저**: supabase.from("products") 중복 파일 3곳 통합

### #19 · 상품 조회 endpoint 결과 불일치
- **원인 조사 대기** · 결과 파일 (`docs/PRODUCT_ENDPOINT_COMPARISON.md`) 작성 필요

### #28 · 상품입고 바코드스캔 상품리스트 · 실재고입력과 endpoint 통합
- **의존**: #19 결과 (endpoint 불일치 원인 파악 후)

### #30 · 판매 · 상품현황 · 데이터 안 나옴
- **확인 필요**: 판매 메뉴 어느 탭인지 · SalesTrendPage 하위 확인

### #32 · 상품명 클릭 · 상세 모달 endpoint 통합
- **관련**: #43 (공급사 클릭 · 완료 · VendorInfoModal 프리미티브)
- **다음**: ProductDetailModal 프리미티브 · 각 리스트에서 재사용

### #36 · 판매 페이지 · 판매 데이터 위주 (재고 테이블 활용)
- **의존**: #30 (판매 상품현황 확인 후 함께 처리)

### #37 · 반품 페이지 SplitListPanel 통일
- **완료**: 넓이 max-w-[1360px] 통일 (커밋 96141334)
- **남은 것**: ReturnListPanel 자체 SplitListPanel 이관 (큰 리팩터)

### #42 · 상품입고 · 분류 검색 (구역상세) + 매장/창고 구역 표시
- **스펙 명확화**: 구역상세 검색 → 매장·창고 자동 배치
- **파일**: ProductArrivalPage

### #46 · 직원관리 · 우측 직원 상세정보 · 목업디자인 적용
- **크기**: 560 라인 StaffDetailPanel · 큰 리팩터
- **목업**: docs/UI_MOCKUP_2026-08-21.html · docs/UI_MOCKUP_STAFF_DETAIL_V9_2026-08-24.html

### #48 · 각종양식 페이지 · HR_FORMS 목업 적용
- **크기**: 779 라인 HrFormsPage · 큰 리팩터
- **목업**: docs/UI_MOCKUP_HR_FORMS_2026-08-27.html

---

## 완료된 태스크 (recent)

| # | 커밋 | 요약 |
|---|---|---|
| #49 | dfc7aaa7 | 경영 요청목록 → 승인요청 그룹 이관 |
| #47 | 55127cdb | 목업 파일 14개 · 폰트 +2 |
| #22 | da010aec | 공급사명 검색 통합 (matchesSupplierQuery) |
| #40 | 9e1e8959 | 매장구역도 담당자 배정 (ZoneCellPicker) |
| #37p| 96141334 | 반품 페이지 넓이 통일 (partial) |
| #43 | 0c5dd2b5 | 공급사 클릭 → 공급사정보 모달 |
| #45 | 0c5dd2b5 | 직책 → 직군 |
| #44 | c891fbb4 | 발주필요 · 수량 StepperInput (xs 컴팩트) |
| #41 | 1b3d4502 | 상세편집 인라인 통합 (모달 제거) |
| #20 | 684282d8 | 테스트상품등록 · sale_status 자동 판매중 |
| #27 | (earlier) | 매입이력 폰트 +3 |
| #17 | cba27b70 | 매장구역편집 AssigneePicker |
| #35 | 72495273 | 상품 서브탭 순서 |
| #34 | 6d238498 | 상품정보 판매중 필터 |

---

## 우선순위 추천 (안전 우선)

**즉시 (안전 · 작은 변경)**
1. #11 확산 · ExpiryImminentTab 등 8-12 파일 (matchesSupplierQuery)
2. #18 · 매장 슬롯 삭제 × 버튼

**중기 (검증 필요)**
3. #30 · 판매 상품현황 데이터 원인
4. #32 · 상품명 클릭 통합 프리미티브

**대형 (별도 세션 권장)**
- #9 · Phase A (SQL 실행 후)
- #46 · 직원 상세정보 목업
- #48 · 각종양식 목업
- #13 · real_map 리팩터
- #16 · API 재구성
