// VendorDetailTabs.types.ts — 공유 타입 · 헬퍼 (분리 2026-08-29)

export interface LedgerRow {
  id: string | number;
  type: "purchase" | "payment";
  date: string | null;
  amount: number;
  method: string | null;
  memo: string | null;
  running_balance: number;
  vat_amount?: number;
  supply_amount?: number;
  tax_invoice_no?: string | null;
}

export interface LedgerSummary {
  supplier: string;
  rows: LedgerRow[];
  total_purchase: number;
  total_payment: number;
  current_balance: number;
  vat_included: boolean | null;
  total_purchase_vat: number;
  total_purchase_supply: number;
  total_payment_vat: number;
  total_payment_supply: number;
}

export interface PurchaseDetailRow {
  id: string | number;
  date: string;
  product_code: string | null;
  product_name: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  vat_amount?: number;
  supply_amount?: number;
}

export interface ProductStat {
  product_code: string;
  product_name: string;
  buy_count: number;
  total_qty: number;
  total_amount: number;
  latest_date: string | null;
  latest_unit_price: number;
}

export type LedgerSortKey = "date" | "type" | "amount" | "running_balance";
export type PurchaseSortKey = "date" | "product_name" | "quantity" | "amount";
export type TabKey = "balance" | "history";

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

export function methodLabel(m: string | null): string {
  if (!m) return "-";
  const map: Record<string, string> = {
    transfer: "이체", cash: "현금", card: "카드",
    check: "수표", offset: "상계", etc: "기타",
  };
  return map[m] ?? m;
}

export function dateLabel(d: string | null | undefined): string {
  if (!d) return "-";
  return String(d).slice(0, 10);
}

export function calcAvgCycle(rows: PurchaseDetailRow[]): number | null {
  const dates = new Set(rows.map(r => r.date).filter(Boolean));
  if (dates.size < 2) return null;
  const sorted = Array.from(dates).sort();
  let sum = 0;
  for (let i = 1; i < sorted.length; i++) {
    sum += (new Date(sorted[i] + "T00:00:00").getTime() - new Date(sorted[i - 1] + "T00:00:00").getTime()) / 86400000;
  }
  return Math.round(sum / (sorted.length - 1));
}
