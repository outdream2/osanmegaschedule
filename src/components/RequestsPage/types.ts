// src/components/RequestsPage/types.ts
// 2026-08-21 · Framework Phase 4 · large-file 분리 · RequestsPage 타입 이관

// 2026-08-05 · T-SCAN-1 · 3단계 워크플로우 필드 통합 (pending → prepared → done)
export interface DisplayRequest {
  id: string; zone_id: string; zone_label: string; category: string;
  requested_at: string; assigned_staff_id: number | null;
  assigned_staff_name: string; status: "pending" | "prepared" | "done" | string; note: string;
  product_code?: string | null;
  prepared_at?: string | null;
  prepared_by?: number | null;
  prepared_by_name?: string | null;
  completed_at?: string | null;
  completed_by?: number | null;
  completed_by_name?: string | null;
}

export interface OrderRequest {
  id: string; product_code: string; product_name: string;
  current_stock: number | null; optimal_stock: number | null;
  note: string; requested_at: string;
}

export interface ZoneMismatch {
  id: string; product_code: string; product_name: string;
  spec_zone: string; real_zone: string; registered_at: string;
}

export interface LunchRequest {
  id: number; employee_id: number; employee_name: string;
  date: string; eating: boolean; memo: string | null; updated_at: string;
}

export interface InventoryCheck {
  id: string; product_code: string; product_name: string;
  warehouse_stock: number | null; store_stock: number | null;
  system_stock: number | null; optimal_stock: number | null;
  checked_by: string; note: string; status: string;
  checked_at: string;
}

export type Tab = "display" | "order" | "mismatch" | "lunch" | "inventory" | "leave";
