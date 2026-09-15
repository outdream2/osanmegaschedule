// src/lib/inventoryChecksApi.ts
// 2026-09-14 · 프레임워크 · 실재고 API 클라이언트 래퍼
//   · server/routes/display/requests.ts (inventory-checks endpoints)
//   · 11+ 호출 사이트 통합 (borrowingsApi 패턴 준수)
//   · 단일 endpoint 대원칙 · 향후 캐시·invalidation·이벤트 dispatch 통합점

import { api } from "./apiClient";

// ═══════════════════════════════════════════════════════
// 타입 정의
// ═══════════════════════════════════════════════════════

/**
 * inventory_checks POST 페이로드 · 유연 (부분 필드 허용)
 * 서버 · warehouse1/store1 표준 필드 + legacy alias (warehouse_stock · store_stock)
 * 서버 · shelf_positions JSONB 병합 지원
 */
export interface InventoryCheckPayload {
  product_code: string;
  product_name?: string | null;
  checked_by?: string | null;
  /** 표준 필드 */
  warehouse1_stock?: number | null;
  warehouse2_stock?: number | null;
  store1_stock?: number | null;
  store2_stock?: number | null;
  store3_stock?: number | null;
  store1_zone?: string | null;
  store2_zone?: string | null;
  store3_zone?: string | null;
  /** 레거시 alias (서버 자동 매핑 · 하위 호환) */
  warehouse_stock?: number | null;
  store_stock?: number | null;
  store_stock_2?: number | null;
  /** 상세 진열위치 · 서버에서 병합 (2026-09-08) */
  shelf_positions?: Record<string, string | null>;
  /** 유통기한 · 상품 스캔 시 별도 저장 */
  expiry_date?: string | null;
  /** 부가 · system_stock · optimal_stock */
  system_stock?: number | null;
  optimal_stock?: number | null;
  /** 유연성 · 동적 필드 (ProductInfoCard [field] 패턴 등) */
  [key: string]: unknown;
}

export interface InventoryCheckRow {
  id: number;
  product_code: string;
  product_name: string | null;
  checked_by: string | null;
  checked_at: string;
  warehouse1_stock: number | null;
  warehouse2_stock: number | null;
  store1_stock: number | null;
  store2_stock: number | null;
  store3_stock: number | null;
  store1_zone: string | null;
  store2_zone: string | null;
  store3_zone: string | null;
  status: "pending" | "done";
  shelf_positions: Record<string, string | null> | null;
  expiry_date: string | null;
  /** 서버 응답 · legacy alias (자동 mirror) */
  warehouse_stock?: number | null;
  store_stock?: number | null;
  store_stock_2?: number | null;
}

export interface BulkInventoryCheckItem {
  product_code: string;
  product_name?: string;
  warehouse1_stock?: number | null;
  warehouse2_stock?: number | null;
  store1_stock?: number | null;
  store2_stock?: number | null;
  store3_stock?: number | null;
  store1_zone?: string | null;
  store2_zone?: string | null;
  store3_zone?: string | null;
  warehouse_stock?: number | null;
  /** 상세 진열위치 · 서버에서 병합 (2026-09-15 · T-SP-BULK) */
  shelf_positions?: Record<string, string | null>;
  [key: string]: unknown;
}

export interface BulkInventoryCheckPayload {
  checked_by: string;
  items: BulkInventoryCheckItem[];
}

export interface BulkInventoryCheckResponse {
  ok?: boolean;
  saved?: number;
  failed?: number;
  total?: number;
  downgraded?: boolean;
  /** 2026-09-15 · T-SP-BULK · item 별 실패 사유 (shelf_positions 검증·중복 등) */
  errors?: Array<{ product_code: string; error: string }>;
}

// ═══════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════

/**
 * POST /api/inventory-checks · 단건 실재고 저장
 * 서버 · 같은 날 UPDATE · 다른 날 INSERT (이력 보존)
 */
export async function saveInventoryCheck(payload: InventoryCheckPayload): Promise<void> {
  await api.post("/api/inventory-checks", payload);
}

/**
 * POST /api/inventory-checks/bulk · 일괄 실재고 저장
 * 스캔 페이지 전체 저장 · 개별 행 저장 (items=[one])
 */
export async function saveBulkInventoryChecks(
  payload: BulkInventoryCheckPayload
): Promise<BulkInventoryCheckResponse> {
  const { data } = await api.post<BulkInventoryCheckResponse>(
    "/api/inventory-checks/bulk",
    payload
  );
  return data ?? {};
}

/**
 * GET /api/inventory-checks · 실재고 리스트 조회
 * @param params.product_code · 특정 상품만 (선택 · 최신순 정렬)
 */
export async function listInventoryChecks(params?: {
  product_code?: string;
}): Promise<InventoryCheckRow[]> {
  const qs = new URLSearchParams();
  if (params?.product_code) qs.set("product_code", params.product_code);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const { data } = await api.get<InventoryCheckRow[]>(`/api/inventory-checks${suffix}`);
  return Array.isArray(data) ? data : [];
}
