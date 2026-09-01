// src/components/ProductArrivalPage/helpers.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · ProductArrivalPage helper 컴포넌트/상수 이관
import React from "react";
import { ClipboardCheck, CheckCircle2, XCircle, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { NotificationToast } from "../common/NotificationToast";
import type { Comparator, SortDir } from "../../hooks/useSortableTable";
import type { ProductInfo } from "../../lib/productsCache";

// 일치/불일치 배타 · 유통기한임박 독립 toggle
export type ItemStatus = "pending" | "match" | "mismatch";

export interface ArrivalItem {
  key: string;
  code: string;
  product: ProductInfo | null;
  qty: number;
  status: ItemStatus;
  expiring: boolean;
  addedAt: number;
  /** 2026-09-01 · #92 · 입고 구역 지정 · location 코드 (예: "1A" · "26") */
  location: string | null;
}

export const STATUS_META: Record<ItemStatus, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  pending:  { label: "미확인",     color: "text-zinc-500",   bg: "bg-zinc-100",   border: "border-zinc-300",   icon: <ClipboardCheck size={12} /> },
  match:    { label: "수량일치",   color: "text-emerald-700", bg: "bg-emerald-100", border: "border-emerald-400", icon: <CheckCircle2 size={12} /> },
  mismatch: { label: "수량불일치", color: "text-rose-700",    bg: "bg-rose-100",    border: "border-rose-400",    icon: <XCircle size={12} /> },
};

// 공용 NotificationToast 사용 · 중복 제거
export const Toast: React.FC<{ message: string }> = ({ message }) => (
  <NotificationToast message={message} tone="emerald" />
);

// SummaryPill · 요약 통계 셀
export interface SummaryPillProps { label: string; value: number; valueClass: string; accent?: string }
export const SummaryPill: React.FC<SummaryPillProps> = ({ label, value, valueClass, accent }) => (
  <div className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl transition ${accent ?? ""}`}>
    <span className={`text-[16px] sm:text-[18px] font-bold tabular-nums leading-none ${valueClass}`}>{value}</span>
    <span className="text-[14px] sm:text-[15px] font-semibold text-zinc-400 leading-none">{label}</span>
  </div>
);

export const SortIcon: React.FC<{ active: boolean; dir: SortDir }> = ({ active, dir }) => {
  if (!active) return <ArrowUpDown size={11} className="text-zinc-300 ml-0.5 inline" />;
  return dir === "asc"
    ? <ArrowUp size={11} className="text-sky-500 ml-0.5 inline" />
    : <ArrowDown size={11} className="text-sky-500 ml-0.5 inline" />;
};

export type ArrivalSortKey = "addedAt" | "supplier" | "name" | "qty" | "status";

export const ARRIVAL_CMP: Record<ArrivalSortKey, Comparator<ArrivalItem>> = {
  addedAt:  (a, b) => a.addedAt - b.addedAt,
  supplier: (a, b) => (a.product?.supplier ?? "").localeCompare(b.product?.supplier ?? "", "ko"),
  name:     (a, b) => (a.product?.name ?? "").localeCompare(b.product?.name ?? "", "ko"),
  qty:      (a, b) => a.qty - b.qty,
  status:   (a, b) => a.status.localeCompare(b.status),
};
