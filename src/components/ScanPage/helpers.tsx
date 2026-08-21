// src/components/ScanPage/helpers.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · ScanPage helpers 이관
// 프레임워크: NotificationToast · Comparator (useSortableTable)
import React from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { NotificationToast } from "../common/NotificationToast";
import type { Comparator, SortDir } from "../../hooks/useSortableTable";

// ─────────────────────────────────────────────────────────────
// real_map 파싱 · "/" 기준 분할 → 매장1 · 매장2 · 매장3
// 예: "8A/냉/2B" → ["8A", "냉", "2B"]
//     "8A/냉"    → ["8A", "냉", null]
//     "9B"       → ["9B", null, null]
// ─────────────────────────────────────────────────────────────
export function parseRealMap(realMap: string | null | undefined): [string | null, string | null, string | null] {
  if (!realMap) return [null, null, null];
  const parts = String(realMap).split("/").map(s => s.trim()).filter(Boolean);
  return [parts[0] ?? null, parts[1] ?? null, parts[2] ?? null];
}

// 실재고 이력 · /api/inventory-checks 응답 요소 (부분)
export interface InventoryHistoryRow {
  id: number;
  product_code: string;
  product_name?: string | null;
  warehouse_stock?: number | null;
  warehouse1_stock?: number | null;
  warehouse2_stock?: number | null;
  store_stock?: number | null;
  store_stock_2?: number | null;
  store3_stock?: number | null;
  store1_zone?: string | null;
  store2_zone?: string | null;
  store3_zone?: string | null;
  checked_by?: string | null;
  checked_at?: string | null;
  note?: string | null;
}

// 2026-08-18 · 공용 NotificationToast 사용 · 중복 제거
export const Toast: React.FC<{ message: string }> = ({ message }) => (
  <NotificationToast message={message} tone="teal" />
);

export const SortIcon: React.FC<{ active: boolean; dir: SortDir }> = ({ active, dir }) => {
  if (!active) return <ArrowUpDown size={10} className="text-zinc-300 ml-0.5 inline" />;
  return dir === "asc"
    ? <ArrowUp size={10} className="text-teal-500 ml-0.5 inline" />
    : <ArrowDown size={10} className="text-teal-500 ml-0.5 inline" />;
};

// 정렬 비교 함수 (컴포넌트 외부 · 안정 참조)
export type ScanSortKey = "addedAt" | "name" | "supplier" | "realMap";

export const SCAN_SORT_CMP: Record<ScanSortKey, Comparator<any>> = {
  addedAt:  (a, b) => a.addedAt - b.addedAt,
  name:     (a, b) => a.product.name.localeCompare(b.product.name, "ko"),
  supplier: (a, b) => ((a.product as any).supplier ?? "").localeCompare(((b.product as any).supplier ?? ""), "ko"),
  realMap:  (a, b) => {
    const ra = (a.product as any).realMap ?? (a.product as any).real_map ?? "";
    const rb = (b.product as any).realMap ?? (b.product as any).real_map ?? "";
    return String(ra).localeCompare(String(rb), "ko");
  },
};
