# 세션 진행 총정리 · 2026-08-31

## 완료된 태스크 (오늘)

| # | 태스크 | 커밋 |
|---|---|---|
| #17 | 매장구역편집 · 담당자 AssigneePicker | (prev) |
| #20 | 테스트상품등록 조회 불가 · 원인 파악 · sale_status 자동 | (prev) |
| #22 | 공급사명 검색 endpoint 통합 (초기) | da010aec + e6474b3f |
| #27 | 매입이력 폰트 +3 | (prev) |
| #29 | 판매 구역현황 · real_map → location | (prev) |
| #31 | 메뉴 이동 · 판매·공급사별현황 → 매입 | dfc7aaa7 |
| #34 | 상품정보 판매중/판매중지 필터 | (prev) |
| #35 | 상품 서브탭 순서 · 상품정보→실재고입력→상품입고 | (prev) |
| #40 | 매장구역도 · 담당자 직접 배정 UI | 9e1e8959 |
| #41 | ProductInfoPage · 상세편집 + 수정 통합 | 1b3d4502 |
| #42 | 상품입고 · 분류 검색 + 구역표시 (ZoneCategoryPicker) | d6583a84 |
| #43 | ProductInfoPage · 공급사 클릭 · 공급사정보 모달 | 0c5dd2b5 |
| #44 | 발주필요 · 수량 조정 StepperInput | 79595786 + c891fbb4 |
| #45 | 직원관리 · 직책 → 직군 | 0c5dd2b5 |
| #46 | 직원관리 · 우측 상세정보 · 목업 톤 | 87d94bd0 |
| #47 | 목업 파일 14개 · 폰트 +2 | 55127cdb |
| #48 | 각종양식 · HR_FORMS 목업 헤더 | f506820c |
| #49 | 경영 · 요청목록 → 승인요청 그룹 이관 | dfc7aaa7 |
| #51 | 사이드메뉴 · 선택 표시 강화 · Linear/Vercel/Attio | 2e29db26 |
| #52 | 사직서 · 생년월일 노출 · endpoint 통일 | c3dd4f10 + b2cf720b |
| #55 | 랜딩 · 점심신청 노출 · leaf ↔ composite fallback | 42f031cd |

## 인프라 · 대형 리팩터 (in_progress)

### #9 · 차용등록 재설계
- SQL 파일 · `supabase/migrations/20260831_borrowing_parties_signatures.sql` (사용자 실행 대기)
- 프리미티브 4개 신규 · `src/components/common/borrowing/`
  - BorrowingPartyCard (violet/emerald)
  - BorrowingArrow (SVG · 그라디언트)
  - SignatureStampSlot (서명+도장+감사)
  - BorrowingCard (이력·Timeline)
- **다음**: SQL 실행 후 API + BorrowingPage 리팩터

### #10 · 데이터 정합성
- ✅ 조사 완료 · `docs/DATA_INTEGRITY_CHECK_2026-08-31.md`
- ✅ 3-way (location · display_location · real_map) 충돌 **0건**
- ✅ zone_defs 정리 완료 · assignee 17건 이관
- ⚠ purchase_details 12,933 rows vs orders 정합성 · 별도 조사 필요

### #11 · endpoint 통일
- ✅ matchesSupplierQuery 확산 완료 · 5+ 파일
  - OrderHistoryTab · BorrowingPage · ExpiryImminentTab · RealStockTablePage · UnassignedProductsTab
- ✅ /api/employees vs /api/schedules 통일 (5 파일)
- ✅ useProductDetailModal · useVendorInfoModal 프리미티브
- 남은 것 · 개별 파일별 점진 통합

### #13 · real_map → location
- ✅ Helper · `src/lib/productLocation.ts` (resolveProductLocation)
- ✅ 데이터 검증 · 충돌 0 · 안전 확인
- ⚠ 47 파일 · 파일별 순차 마이그레이션 대상 (별도 세션)

### #14 · KV → DB
- ✅ 조사 완료 · 대부분 UI 프리퍼런스 (유지)
- ✅ Contract KV · JOB_WAGES_KEY 이미 1회 마이그레이션 로직 있음
- ✅ CONTRACT_CLAUSES_KEY · 서버 원본 · localStorage 는 fast 캐시
- 결론: 실질 이관 필요 없음

### #16 · API 프레임워크 재구성
- ✅ HttpError 통일 · 21 + 3 + 13 = 37건 (throw new Error · res.status.json → HttpError/badRequest)
  - purchase/vat.ts · purchase/purchase.ts · stock/stockManage.ts · stock/products.ts
- ✅ 보안 · authorize 15건 추가 (OCR 13건 + settings 2건)
- 남은 것 · validateBody Zod 확산 · 3건 남은 res.status (복합 응답)

### #53 · 프리미티브 목업 톤
- ✅ EmployeeChip · 신규 프리미티브
- ✅ EmployeeProfileCard · 목업 톤 + 생년월일
- ✅ StaffDetailPanel · 폰트 강화
- ✅ HrFormsPage 헤더 · Card topAccent
- 남은 것 · Card · StatusPill · IconTile 자체 목업 톤 강화 (별도)

## 커밋 요약 (오늘)

```
e6474b3f · #11 matchesSupplierQuery 확산 (3 파일)
a7ce3d13 · #10 데이터 정합성 스냅샷 문서
06253186 · #16 stockManage res.status → HttpError 13건
d6583a84 · #42 ZoneCategoryPicker 프리미티브
42f031cd · #55 페이지 노출 · leaf ↔ composite fallback
3f09c653 · #54 보안 · authorize 15건
25f16eb7 · #16 stockManage badRequest 3건
7d8ea7e9 · #16 HttpError 통일 21건
856135f0 · #13 productLocation 헬퍼
(prev) · Borrowing 프리미티브 4개
f506820c · #48 HrForms 목업 헤더
159700a2 · 대형 태스크 상태 리포트
56001475 · #9 Phase A SQL
55127cdb · 목업 14개 폰트 +2
```

## 남은 대기 태스크

- #9 · SQL 실행 후 · Phase A 코드 (별도 세션)
- #18 · 실재고 매장 슬롯 삭제 UI
- #19 · 상품 조회 endpoint 불일치 · 원인 파악
- #28 · 상품입고/실재고 endpoint 통합
- #30 · 판매 · 상품현황 데이터 안 나옴
- #32 · 상품명 클릭 상세 endpoint 통합 (훅 있음 · 사용 확산)
- #36 · 판매 페이지 판매 데이터 위주
- #37 · 반품 페이지 SplitListPanel 완전 이관 (넓이만 완료)
- #50 · 스케쥴표 필터별 합계 (약사·사원·물류·창고·전체)
- #53 · 프리미티브 목업 톤 (Card/StatusPill 등 원본 강화)
- #54 · 보안 · hrForms/vendor authorize 확인 (파일 위치 확인 필요)
