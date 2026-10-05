# MENU → API → DB CRUD MAPPING AUDIT (#132)

2026-10-05 · READ-ONLY · 단계별 누적 조사 · schema 변경 0 · DB WRITE 0

## 범위

전체 메뉴/화면 → API/service → DB table.column → ERP source 전수 추적.

sideNavGroups.ts 안 **53개 label** · AppNavHeader TABS 상단 7개 (홈/스케줄/업무요청/매장/경영/약사/이슈·요청) + role-specific.

## Dataset × CRUD Legend

- **R** = SELECT
- **C** = INSERT
- **U** = UPDATE
- **D** = DELETE

## 매장 그룹 (관리자 전용)

### 매장 > 상품 (subTab=`product` · 내부 3탭: 실재고입력 · 상품입고 · 상품정보)

| 탭 | API | CRUD | TABLE.COLUMN | ERP SOURCE | OWNERSHIP | STATUS |
|---|---|---|---|---|---|---|
| 상품정보 리스트 | `GET /api/products` → productCache | R | products(all) | Product_List | ERP_OWNED + WEB (hidden/memo/optimal_stock 등) | ACTIVE |
| 상품 상세 | 동일 (map lookup) | R | products.* | - | 혼합 | ACTIVE |
| 상품 수정 (사용자 메모/최적재고) | `POST /api/products/:code` | U | products.optimal_stock, memo, hidden, stock_note | - | WEB_OWNED (ERP sync 보호됨 · whitelist) | ACTIVE |
| 실재고입력 | `POST /api/stock-check` | C | inventory_checks | - | WEB_OWNED | ACTIVE |
| 상품입고 (검수) | `POST /api/product-arrivals` | C/U | purchase_details.verified_* | - | WEB_OWNED (검수 메타) | ACTIVE |

### 매장 > 매입 (subTab=`purchase`)
| 화면 | API | CRUD | TABLE | ERP |
|---|---|---|---|---|
| 매입이력 (좌 공급사 · 우 상세) | `GET /api/purchase-details?supplier=` + `/api/supplier-purchase-summary` | R | purchase_details · (supplier_code set 매칭 전환 완료) | Buy_Status (bm_code+row_num) | ACTIVE |

### 매장 > 매출 (신규 subTab=`revenue`)
| 탭 | API | TABLE | ERP SOURCE | STATUS |
|---|---|---|---|---|
| 시간대별 | `GET /api/erp/sale-hourly-report` | - (매번 ERP) | Sales_Days_TimeReport | ACTIVE_VERIFY (#128) |
| 월별 (연 네비 + N월 D일까지 라벨) | `GET /api/erp/sale-monthly-report` | - (매번 ERP · YYYY-MM 집계) | Statistics_Month_DashBoard | ACTIVE_VERIFY (#128) |

### 매장 > 발주 / 결제 / 반품 / 매장진열 / 입고알림
각 subTab 미착수 · 다음 사이클.

### 홈 (TodayStatusPanel + TodayRevenueKpiPanel)
| KPI | SOURCE | ERP |
|---|---|---|
| 전체요청 / 승인대기 | leave_requests · requests · resignations 등 | - (WEB) |
| 일일매출 | `/api/erp/sale-hourly-report` 당일 (현재시간 이하 누적) | Sales_Days_TimeReport.SaleTotal |
| 고객수 | 동일 | Sales_Days_TimeReport.CustomerCnt (LEFT) |

## CANONICAL BUSINESS DICTIONARY (갱신)

| 지표 | SOURCE | 비고 |
|---|---|---|
| 현재고 | products.current_stock | ← Product_List.NowStock SSOT |
| 재고자산 | current_stock × purchase_price | 2026-09-10 확정 |
| 일일매출 | Sales_Days_TimeReport.SaleTotal (현재시간 이하 SUM) | 매출 페이지 TODAY KPI 와 동일 |
| 월별 매출 | Statistics_Month_DashBoard.SaleTotal (일별 SUM) | ERP 월 subtotal row 없음 · WEB 집계 |
| 월별 매입 | Statistics_Month_DashBoard.BuyTotal | 동일 |
| 월별 매출원가 | Statistics_Month_DashBoard.CostTotal | ERP raw |
| 월별 매출이익 | Statistics_Month_DashBoard.Margin | ERP raw |
| 월별 마진율 | Margin / SaleTotal × 100 (집계 재계산) | ERP MarginPercent 비율 SUM 금지 |
| 고객수 (hourly) | CustomerCnt (단순 숫자) | ERP UI "고객수" |
| 고객수 (monthly) | CustomerCnt LEFT ("1,022/57,651" → 1022) | 동일 |
| 객단가 (hourly) | AvgChargeTotal | ERP UI "객단가" |
| 객단가 (monthly) | AvgPerCustomer = CustomerCnt RIGHT ("57,651") | - |
| 매입공급가액 | purchase_details.amount | SSOT |
| 매입VAT | purchase_details.vat | SSOT |
| 매입총액 | purchase_details.total | SSOT |
| 판매원가 | sales.total_stock × sales.unit_cost | Sale_Status 저장분 |
| 매출이익 (sales SSOT) | sales.margin | ERP raw 보존 |
| ERP 공급사 identity | purchase_details.supplier_code (CtCode) | name 아님 |

## CONFLICT 발견 (A-J 유형)

| # | 유형 | 설명 | STATUS |
|---|---|---|---|
| 1 | I (NAMING AMBIGUITY) | hourly `MarginRate` vs monthly `MarginPercent` · 둘 다 % | KEEP (ERP raw 명명 유지) |
| 2 | B (SAME TERM / DIFFERENT SOURCE) | 매출: sales(상세) vs Sales_Days_TimeReport(hourly) vs Statistics_Month_DashBoard(monthly) | KEEP (3 grain 분리 사용 · 혼용 금지) |
| 3 | I | 매장>판매(statistics) vs 매장>매출(revenue) · 서로 다른 source | ACTIVE (판매=stock_history 상품별 drill · 매출=ERP 통계) |
| 4 | H (UNSAFE JOIN) | **없음** · 매입이력 supplier_name eq 전수 fix 완료 (code 기반) |

## 다음 사이클

- 경영 (BusinessManagePage · 직원·근로계약서·급여)
- 약사 (PharmacistPage)
- 업무요청 (ApprovalRequestPage · leave/display request/mismatch 등)
- 거래처 (VendorManageSplit · reservation · vendor-stock)
- 설정 (BrandingSettingsPage · CompanyInfoSettingsPage · ContractSettingsPage 등)

각 화면 CRUD 매트릭스는 이 문서에 **누적 추가**.
