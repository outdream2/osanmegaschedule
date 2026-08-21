// src/components/OrderManagePage/PurchaseHistoryTab.types.ts
// 2026-08-21 · Framework Phase 4 · large-file 분리 · PurchaseHistoryTab 타입 이관
import type { VendorSummary } from "./PurchaseHistoryTab/VendorRowCard";
import type { VendorFull } from "./PurchaseHistoryTab/VendorHeaderPanel";

// VendorFull · VendorHeaderPanel 에서 export · here alias
export type VendorItem = VendorFull;

export interface SummaryResponse {
  suppliers: Array<VendorSummary & { supplier: string }>;
  source?: "purchase_details" | "ocr_confirmed_items";
  diagnostics?: {
    pd_ok?: boolean;
    pd_row_count?: number;
    pd_skipped_null_supplier?: number;
    total_rows?: number;
  };
}

// data source · 서버 응답 source 필드 · UI 배지 표시
export type DataSource = "purchase_details" | "ocr_confirmed_items" | null;

export interface SourceDiagnostics {
  pd_ok?: boolean;
  pd_row_count?: number;
  pd_skipped_null_supplier?: number;
  pd_relation_missing?: boolean;
  pd_total_all_time?: number | null;
  pd_latest_date?: string | null;
  total_rows?: number;
}

// 뷰 모드 (#191)
export type ViewMode = "by-vendor" | "by-product";

// 상품 리스트 정렬 (#191)
// 2026-08-04 · 판매량(sale_qty) · 판매금액(sale_amt) 정렬 추가 (사용자 요청)
export type ProductSort = "amount" | "recent" | "name" | "count" | "sale_qty" | "sale_amt";
