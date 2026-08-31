# FUNCTION_TEST_MATRIX_2026-09-01

> 생성: 2026-09-01 · Phase 2 기능 테스트 매트릭스

## 테스트 파일 현황

| 범주 | 파일 수 | 테스트 수 |
|---|---:|---:|
| src/components/common/* | 49 | ~1200 |
| src/components/pages/* | 9 | ~180 |
| src/hooks/* | 36 | ~600 |
| src/lib/* | 15 | ~450 |
| server/routes/* | 10 | ~200 |
| server/ocr/* | 25 | ~600 |
| server/lib/* + middleware | 11 | ~160 |
| **합계** | **232** | **3391** |

## 페이지별 기능 커버리지

| 페이지 | 전용 테스트 | 간접 커버 | 판정 |
|---|---|---|---|
| LandingPage (발주·재고현황) | 없음 | useVendors · useApiQuery · matchesProductQuery | 간접 ✓ |
| SchedulePage | 없음 | schedules API schema · scheduleController | 간접 ✓ |
| StaffManagePage | 없음 | useEmploymentStatus · employees 스키마 | 간접 ✓ |
| ProductInfoPage | ProductInfoPage.test.tsx · ProductCreateModal.test.tsx | 직접 ✓ |  |
| OcrPage | OcrPage/types · RawOcrTable/* 5파일 | OCR pipeline 50+ | 직접 ✓ |
| ScanPage | ScanPage.panels.test · stockRowTypes.test | BarcodeScanner tests | 직접 ✓ |
| OrderManagePage | OrderHistorySupplierModal · OrderPdfPreview · ReturnPdfPreview | useApiQuery · vendors | 직접 ✓ |
| StockManagePage | SupplierFilterBar.test | stockManage API | 간접 ✓ |
| BorrowingPage | 없음 | borrowings API (server route test 없음) | **간접 미흡** |
| ContractWriterPage | 없음 | useContractSignatures.test · employeeContracts test | 간접 ✓ |
| SalesTrendPage | 없음 | stockPeriodUtils.test (30 tests) | 간접 ✓ |
| ReservationPage | 없음 | reservation schema.test · staff-availability API | 간접 ✓ |
| VatPreparePage | 없음 | vat route (직접 API 테스트 없음) | **간접 미흡** |
| HrFormsPage | 없음 | hrForms schema.test | 간접 ✓ |
| ResignationWriterPage | 없음 | resignations schema.test | 간접 ✓ |
| BoardPage | 없음 | clientErrors.test · pharmacistMenuItems.test | 간접 ✓ |
| ApprovalCenterPage | 없음 | approvalEvents.test | 간접 ✓ |
| SettingsModal | 없음 | useSettings · useKvSetting | 간접 ✓ |

## 페르소나별 흐름

### 관리자 (level 9)
- 상품 등록/편집 · 엑셀 업로드 · 캐시 무효화 → products.ts 직접 커버
- 공급사 CRUD → vendors schema 테스트 · CreateVendorSchema.test ✓
- 스케줄 편집/복사 → UpsertScheduleSchema · BatchScheduleSchema 검증 ✓

### 직원 (level 5)
- 발주서 작성 → OrderPdfPreview.test ✓
- 스케줄 조회 → scheduleController 단위 테스트 ✓
- 바코드 스캔 → BarcodeScanner imageProcessing.test ✓

### 약사 (pharmacist)
- PharmacistPage · BoardPage → pharmacistMenuItems.test · clientErrors.test ✓

### 거래처 (vendor login)
- vendorPassword.test · useVendors.test ✓

## 미커버 (테스트 추가 권장)

1. **BorrowingPage 통합 시나리오** — Phase A~E 신규 구현 · server route 단위 테스트 없음
2. **VatPreparePage** — 부가세 신고 로직 · 서버 route test 없음
3. **SalesTrendPage 판매대시보드 탭** — 2026-08-31 신규 탭 (#36) · stockPeriodUtils 로 간접 커버

## 결론

총 232 파일 · 3391 테스트. 핵심 페이지 모두 간접·직접 커버. 신규 BorrowingPage와 VatPreparePage 전용 서버 route 테스트 추가 권장.
