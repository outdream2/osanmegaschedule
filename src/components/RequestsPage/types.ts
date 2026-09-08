// src/components/RequestsPage/types.ts
// 2026-08-21 · Framework Phase 4 · large-file 분리 · RequestsPage 타입 이관

// 2026-08-05 · T-SCAN-1 · 3단계 워크플로우 필드 통합 (pending → prepared → done)
export interface DisplayRequest {
  id: string; zone_id: string; zone_label: string; category: string;
  requested_at: string; assigned_staff_id: number | null;
  assigned_staff_name: string; status: "pending" | "prepared" | "done" | string; note: string;
  product_code?: string | null;
  // 2026-09-03 · #63 fix · 서버에서 products JOIN 후 반환 (requests.ts line 119~143)
  product_name?: string | null;
  product_spec?: string | null;
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
  // 2026-09-03 · fix · warehouse_stock → warehouse1_stock (DB 컬럼명 일치)
  //   · 이전 · warehouse_stock (DROP된 컬럼) 참조 → 항상 undefined → 실재고 차이 계산 오류
  warehouse1_stock: number | null; warehouse2_stock: number | null;
  store_stock: number | null; store3_stock: number | null;
  /** @deprecated 레거시 alias · 서버가 warehouse1_stock 반환 · 이 필드는 undefined */
  warehouse_stock?: number | null;
  system_stock: number | null; optimal_stock: number | null;
  checked_by: string; note: string; status: string;
  checked_at: string;
}

// 2026-08-25 · #192 · vendor 승인 탭 추가
// 2026-09-08 · resignation 승인 탭 추가 (business-manage 에서 이관 · 승인 요청 통합)
export type Tab = "display" | "order" | "mismatch" | "lunch" | "inventory" | "leave" | "vendor" | "resignation";
