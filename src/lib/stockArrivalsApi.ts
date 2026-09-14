// src/lib/stockArrivalsApi.ts
// 2026-09-14 · 프레임워크 · 입고 알림 API 클라이언트 래퍼
//   · server/routes/stock/stockArrivals.ts
//   · 5+ 호출 사이트 통합 · 타입 중복 제거

import { api } from "./apiClient";

// ═══════════════════════════════════════════════════════
// 타입 정의 (StockArrival 통합 · 이전 · 2 파일 개별 정의)
// ═══════════════════════════════════════════════════════

export interface StockArrival {
  id: number;
  title: string;
  body: string | null;
  created_at: string;
  created_by_id: number | null;
  scheduled_at: string | null;
  broadcast_sent: boolean;
}

export interface CreateStockArrivalPayload {
  title: string;
  body?: string | null;
  employeeId: number;
  scheduled_at?: string;
  send_now?: boolean;
}

export interface PatchStockArrivalPayload {
  title?: string;
  body?: string | null;
  employeeId?: number;
  scheduled_at?: string | null;
}

// ═══════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════

/** GET /api/stock-arrivals · 입고 알림 리스트 */
export async function listStockArrivals(): Promise<StockArrival[]> {
  const { data } = await api.get<StockArrival[]>("/api/stock-arrivals");
  return Array.isArray(data) ? data : [];
}

/** POST /api/stock-arrivals · 입고 알림 등록 (예약·즉시·초안) */
export async function createStockArrival(
  payload: CreateStockArrivalPayload
): Promise<StockArrival | null> {
  const { data } = await api.post<StockArrival | null>("/api/stock-arrivals", payload);
  return data ?? null;
}

/** PATCH /api/stock-arrivals/:id · 알림 수정 (제목·본문·예약시간) */
export async function patchStockArrival(
  id: number,
  payload: PatchStockArrivalPayload
): Promise<StockArrival> {
  const { data } = await api.patch<StockArrival>(`/api/stock-arrivals/${id}`, payload);
  return data;
}

/** DELETE /api/stock-arrivals/:id · 알림 삭제 (employeeId 확인) */
export async function deleteStockArrival(
  id: number,
  employeeId: number
): Promise<void> {
  await api.del(`/api/stock-arrivals/${id}`, { data: { employeeId } });
}
