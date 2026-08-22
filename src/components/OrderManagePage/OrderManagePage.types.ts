// src/components/OrderManagePage/OrderManagePage.types.ts
// 2026-08-22 · Framework Phase 4 · OrderManagePage 대형 파일 분리 · types 이관
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../layout/AppNavHeader";

// ─── 발주요청 · 상품 · 입고 ───────────────────────────────────────────────
export interface OrderRequest {
  id: string;
  product_code: string;
  product_name: string;
  current_stock: number | null;
  optimal_stock: number | null;
  requested_at: string;
  supplier?: string | null;
  supplier_contact?: string | null; // 담당자
  supplier_email?: string | null;
  supplier_phone?: string | null;
  balance?: number | null;           // 계산 잔고
  ocr_balance?: number | null;       // 거래명세서 OCR 잔고 (비교용)
}

export interface ProductInfo {
  code?: string;
  name?: string;
  product_code?: string;
  product_name?: string;
  current_stock?: number | null;
  optimal_stock?: number | null;
  supplier?: string | null;
}

export interface GoodsReceipt {
  id: string;
  order_number: string;
  supplier: string;
  supplier_contact?: string | null;
  status: "pending" | "partial" | "complete" | "over" | "returned";
  dispatched_at: string;
  received_at?: string | null;
  item_count: number;
  items?: Array<{
    product_code: string;
    product_name: string;
    order_qty: number;
    received_qty?: number | null;
  }>;
  note?: string | null;
}

// ─── OrderManagePage props ───────────────────────────────────────────────
export interface OrderManagePageProps {
  ocrTabAuthSession?: AuthSession | null;
  ocrTabOnBack?: () => void;
  ocrTabOnNavigate?: (page: AppNavPage) => void;
  ocrTabOnLogout?: () => void;
  /** DisplayPage 서브탭 진입 시 고정할 Level-1 탭. 미지정 시 기존 기본값("purchase-order") */
  initialTopTab?: "purchase-order" | "purchase" | "payment" | "statistics";
  /** true 이면 Level-1 탭 UI 렌더 skip (DisplayPage 서브탭 모드) */
  hideTopTabs?: boolean;
}

// ─── 발주필요 탭 · 필터/정렬 설정 ─────────────────────────────────────────
//   · 2026-08-03 · 사용자 요청 · 발주필요 상품 필터 조건 커스텀 + 저장
//   · 페이지 로딩 시 저장된 조건으로 초기화
export type NeedCategoryFilterKey = string; // DB 동적 카테고리 지원 · "all" + 임의 카테고리
export type OrderNeedShortageBasis = "optimal" | "min" | "realStock";

// 2026-08-03 (#189) · 정렬 기본값 · 최근 한달 판매량 필터와 함께 저장
//   · "sale_month" · 최근 한달 판매량 (top-sales?months 로 enrich)
//   · 나머지 · 기존 NeedSortKey 와 동일
export type OrderNeedDefaultSortKey =
  | "supplier" | "contact" | "name" | "current" | "inv" | "optimal" | "short"
  | "sale_month";

export interface OrderNeedFilterConfig {
  /** 부족 판정 기준 · optimal(추천적정재고) · min(최소재고) · realStock(실재고) */
  shortageBasis: OrderNeedShortageBasis;
  /** 카테고리 필터 초기값 */
  defaultCategory: NeedCategoryFilterKey;
  /** 실재고 미입력 상품 포함 여부 · false 이면 invStockMap 에 없는 상품 제외 */
  includeMissingRealStock: boolean;
  /** 최소 부족 개수 · 부족량이 이 값 이상만 표시 (>=1) */
  minShortage: number;
  /** 2026-08-03 (#189) · 최근 한달(30일) 판매량 최소 (개) · N 이상만 표시 · 0 이면 필터 미적용 */
  minMonthlySales: number;
  /** 2026-08-03 (#189) · 기본 정렬 · 페이지 진입 시 적용 */
  defaultSortKey: OrderNeedDefaultSortKey;
  /** 2026-08-03 (#189) · 기본 정렬 방향 */
  defaultSortDir: "asc" | "desc";
}
