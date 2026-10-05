# UNUSED / DUPLICATED PAGE AUDIT (#137)

2026-10-05 · READ-ONLY · 삭제 금지 · SAFE_REMOVE_CANDIDATE 분류만

## 분류 schema

- **ACTIVE**: 메뉴/route 에서 접근 가능 + import + render 됨
- **HIDDEN_BUT_USED**: 메뉴 없지만 navigate 또는 internal link
- **ADMIN_ONLY** / **STAFF_ONLY**: 권한별 접근
- **DUPLICATED**: 다른 page 와 기능 완전 중복
- **LEGACY**: 과거 feature · 더 이상 운영 X
- **ORPHAN**: route 없음 or navigation 없음 but 파일 존재
- **DEAD_CODE**: import 0 · render 0
- **UNKNOWN**: 조사 전

## src/components/ 하위 디렉토리 (요약)

| 디렉토리 | 상태 | 비고 |
|---|---|---|
| AdminInitialBuildPage | **LEGACY** (추정) | 과거 ERP 초기 구축 · 현재 sync-agent 로 대체 (사용자 메모) |
| ApprovalCenterPage | ACTIVE | 승인 (연차 등) |
| ApprovalRequestPage | ACTIVE | 요청 작성 |
| BarcodeScanner | ACTIVE | 공용 scanner |
| BoardPage | ? | 조사 필요 |
| BrandingSettingsPage | ADMIN_ONLY | 설정 · 브랜드 |
| BusinessManagePage | ADMIN_ONLY | 경영 |
| CompanyInfoSettingsPage | ADMIN_ONLY | 설정 |
| ContractSettingsPage | ADMIN_ONLY | 설정 |
| ContractWriterPage | ADMIN_ONLY | 근로계약서 |
| DayTimelineModal | 공용 | - |
| DisplayPage | ACTIVE | 매장 그룹 (10 subTab) |
| DocumentWriterPage | ACTIVE | 서류작성 |
| EmployeeCalendarModal | 공용 | - |
| HrFormsPage | ADMIN_ONLY | 각종양식 |
| LandingPage | ACTIVE | 홈 (TodayStatusPanel · TodayRevenueKpiPanel) |
| LoginModals | 공용 | - |
| OrderManagePage | ACTIVE | 매입/발주/결제/판매 통합 (매장 subTab 내부 wrap) |
| ProductArrivalPage | ACTIVE | 매장>상품>상품입고 |
| ProductInfoPage | ACTIVE | 매장>상품>상품정보 (SplitPanel resize fix 적용) |
| SalesTrendPage | ACTIVE | 판매 분석 (DashboardTab · ProductTrendTab · SupplierTrendTab · LossTrackerTab · StockFlowPanel · ZoneCategoryContent) |
| ScanPage | ACTIVE | 바코드 스캔 |
| StockArrivalPage | ACTIVE | 매장>입고알림 |
| StockManagePage | ACTIVE | 재고관리 subTab 다수 |
| VatPreparePage | ADMIN_ONLY | 부가세 신고 |
| 상단 조회(사이드바) VendorManageSplit | ADMIN_ONLY | 매장>매장진열 subTab=`vendor-manage` |

## DUPLICATED 후보

### 1. 판매 vs 매출
- **매장>판매** (OrderManagePage statistics 탭) · stock_history 기반 상품별 drill-down
- **매장>매출** (RevenuePage · 신규) · ERP 통계 (Sales_Days_TimeReport · Statistics_Month_DashBoard)
- **분석 결과**: 서로 다른 business purpose (판매=상품별 수량 분석 · 매출=ERP 금액 집계) · 중복 아님
- **STATUS**: NOT DUPLICATED

### 2. 상품 (매장>상품>상품정보) vs ProductInfoPage
- **ProductInfoPage.tsx** 는 매장>상품 안 subTab 으로 사용
- **단일 파일 · 단일 route · 중복 없음**

### 3. 재고 vs 실재고
- **StockManagePage** (재고관리 전체)
- **매장>상품>실재고입력** (DisplayPage subTab=product 안 inner tab)
- **분석**: 실재고입력 = 사용자 재고 체크 input · StockManagePage = 전체 재고 조회/분석 · 중복 아님

## ORPHAN / LEGACY 조사 중

- `AdminInitialBuildPage` · sync-agent 로 대체 가능성 · 사용자 메모 "AdminInitialBuildPage 중심 개발 중단" 명시 (project_erp_sync_architecture_2026-10-03)
  - **SAFE_REMOVE_CANDIDATE** (조사 보완 필요 · 삭제 금지)

## SAFE_REMOVE_CANDIDATE

| 파일/디렉토리 | 사유 | 삭제 금지 (조사만) |
|---|---|---|
| `src/components/AdminInitialBuildPage/` | sync-agent 로 대체 · 사용자 명시 | ✓ (사용자 승인 전 금지) |

## 다음 조사

- route 파일 (`App.tsx` + 각 Page) import 참조 전수 grep
- 각 Page internal subTab 사용률 조사
- SplitListPanel 중복 사용 pattern
- 숨겨진 route (sessionStorage dpInitialSubTab 등)
