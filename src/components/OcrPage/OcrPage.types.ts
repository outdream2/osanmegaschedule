// src/components/OcrPage/OcrPage.types.ts
// 2026-08-21 · Framework Phase 4 · large-file 분리 · OcrPage 타입 이관

export interface ProductSynonym {
  id: number;
  prod_name_old: string;
  prod_name_new: string | null;
  product_code: string;
  supplier_old: string | null;
  supplier_new: string | null;
}

export interface SupplierAlias {
  id: number;
  alias: string;
  supplier_name: string;
  created_at: string;
}

export interface ProdEditState {
  prod_name_old: string;
  prod_name_new: string;
  product_code: string;
  supplier_new: string;
  supplier_old: string;
}

export interface SuppEditState {
  alias: string;
  supplier_name: string;
}

export interface ConfirmedRecord {
  id: number;
  saved_at: string;
  invoice_date: string | null;
  supplier: string;
  product_name: string;
  product_code: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  amount: number | string | null;
  balance: number | string | null;
  expiry_date: string | null;
  memo: string | null;
  raw_json: Record<string, unknown> | null;
  image_url: string | null;
  image_public_id: string | null;
  created_at: string;
}

export const BALANCE_LABEL_OPTIONS = ["(없음)", "합계", "합계액", "잔고", "잔액", "총합계", "미수금"];

export const fmtNum = (v: number | string | null | undefined) => {
  if (v == null || v === "") return "";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("ko-KR");
};

export const toNum = (v: number | string | null | undefined): number => {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
