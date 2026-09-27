/**
 * src/lib/storageKeys.ts
 * Batch 3 · 2026-08-31 · localStorage 키 하드코딩 제거
 * 모든 localStorage key 를 이 파일에서 관리 · 분산 하드코딩 금지
 */

// ── 인증 ──────────────────────────────────────────────────────────────────────
/** JWT 세션 정보 저장 · App.tsx / apiClient.ts / useAuth.ts / SchedulePage.tsx */
export const SK_AUTH_SESSION = "megatown_auth_session";

/** KV: 세션 idle timeout 분 · useAuth.ts 동적 조회 */
export const SK_KV_SESSION_IDLE_TIMEOUT = "kv:session_idle_timeout_minutes";

/** 로그인 '내 전화번호 기억' · LoginModals.tsx */
export const SK_REMEMBERED_PHONE = "megatown_remembered_phone";

// ── 사이드바 ──────────────────────────────────────────────────────────────────
/** 사이드바 접힘 상태 · useSidebar.ts */
export const SK_SIDEBAR_COLLAPSED = "sidebar.collapsed";

/** 사이드바 너비 · useSidebar.ts */
export const SK_SIDEBAR_WIDTH = "sidebar.width";

// 2026-09-27 · 네비게이션 SSOT · SK_SUBTAB_* 상수 5종 제거
//   · useActiveNav Context (src/contexts/ActiveNavContext.tsx) 로 대체
//   · setActiveByPage(page, subTab, nested) · localStorage 사이드 채널 소멸

// ── 직원 · 스케줄 ─────────────────────────────────────────────────────────────
/** 직원 순서 드래그 저장 · SchedulePage.tsx / useScheduleData.ts */
export const SK_EMPLOYEE_ORDER = "megatown_employee_order";

// ── 알림 ─────────────────────────────────────────────────────────────────────
/** 푸시 알림 자동 구독 여부 · NotificationToggle.tsx */
export const SK_PUSH_SUBSCRIBED_AUTO = "megatown_push_subscribed_auto";

/** 익명 푸시 구독 여부 · StockArrivalList.tsx */
export const SK_ANON_PUSH_SUBSCRIBED = "anon_push_subscribed";

/** 2026-09-21 · #328 · iOS WebView 앱 Expo Push Token 캐시 · pushNotifications.ts */
export const SK_PUSH_TOKEN = "pushToken";

// ── Android 카메라 (BarcodeScanner · 절대 수정 금지) ─────────────────────────
/** Android 최적 카메라 ID 캐시 · BarcodeScanner.tsx */
export const SK_ANDROID_BEST_CAMERA_ID = "android_best_camera_id";

// ── DisplayPage ───────────────────────────────────────────────────────────────
/** 상품 내부 탭 · DisplayPage.tsx */
export const SK_DP_PRODUCT_INNER_TAB = "dp.productInnerTab";

/** 반품 내부 탭 · DisplayPage.tsx */
export const SK_DP_RETURN_INNER_TAB = "dp.returnInnerTab";

// ── 권한 · 설정 ───────────────────────────────────────────────────────────────
/** 권한 트리 접힘 상태 · PermissionsPage.tsx */
export const SK_PERMISSIONS_TREE_COLLAPSED = "permissions.tree.collapsed";

/** 회사정보 탭 · CompanyInfoSettingsPage.tsx */
export const SK_COMPANY_INFO_TAB = "companyInfo.tab";

// ── 발주 관리 ─────────────────────────────────────────────────────────────────
/** 카테고리 탭 상품분류 필터 · CategoryTab.tsx */
export const SK_CATEGORY_CLASSFILTER = "megatown_category_classfilter";

/** 트렌딩 탭 상품분류 필터 · TrendingTab.tsx */
export const SK_TRENDING_CLASSFILTER = "megatown_trending_classfilter";

// ── 재고 관리 ─────────────────────────────────────────────────────────────────
/** DiffTab 서브탭 · StockManagePage/DiffTab.tsx */
export const SK_DIFFTAB_SUBTAB = "megatown_difftab_subtab";

/** DiffTab 상품분류 필터 · StockManagePage/DiffTab.tsx */
export const SK_DIFF_CLASSFILTER = "megatown_diff_classfilter";

/** DiffTab 패널 너비 · StockManagePage/DiffTab.tsx */
export const SK_STOCKMANAGE_DIFF_W = "megatown_stockmanage_diff_w";

/** SupplierTab 합계 접힘 · StockManagePage/SupplierTab.tsx */
export const SK_SUPPLIER_TOTALS_COLLAPSED = "megatown_supplier_totals_collapsed";

/** SupplierTab 패널 너비 · StockManagePage/SupplierTab.tsx */
export const SK_STOCKMANAGE_SUPPLIER_W = "megatown_stockmanage_supplier_w";

/** FlowTab 상품분류 필터 · StockManagePage/FlowTab.tsx */
export const SK_FLOW_CLASSFILTER = "megatown_flow_classfilter";

// ── 매출 트렌드 ───────────────────────────────────────────────────────────────
/** 대시보드 탭 좌측 너비 · SalesTrendPage/DashboardTab.tsx */
export const SK_DASHBOARD_LEFT_W = "megatown_dashboard_left_w";

/** 카테고리 패널 너비 · SalesTrendPage/ZoneCategoryContent.tsx */
export const SK_SALESTREND_CATEGORY_W = "megatown_salestrend_category_w";

/** 공급사 패널 너비 · SalesTrendPage/SalesTrendPage.tsx · 2026-09-07 · 5:5 강제 (기존 저장값 무시) */
export const SK_SALESTREND_SUPPLIER_W = "megatown_salestrend_supplier_w_5050";

/** 상품 흐름 패널 너비 · SalesTrendPage/ProductTrendTab.tsx */
export const SK_SALESTREND_FLOW_W = "megatown_salestrend_flow_w";

// ── OCR ───────────────────────────────────────────────────────────────────────
/** OCR 엔진 선택 · OcrPage.tsx */
export const SK_OCR_ENGINE = "megatown_ocr_engine";

/** OCR 할인 모드 · RawOcrTable.tsx */
export const SK_OCR_DISCOUNT_MODE = "ocr-discount-mode";

/** ERP 컬럼 너비 · useErpViewState.ts */
export const SK_OCR_ERP_COL_WIDTHS = "ocr_erp_col_widths";

/** 송장 이미지 컬럼 너비 · useInvoiceImageControls.ts */
export const SK_OCR_INVOICE_COL_WIDTH = "ocr-invoice-col-width";

/** OCR 페이지 줌 · useInvoiceImageControls.ts */
export const SK_OCR_PAGE_ZOOM = "ocr-page-zoom";

/** XLS 템플릿 캐시 · useXlsTemplate.ts */
export const SK_OCR_XLS_TEMPLATE = "ocr_xls_template";
