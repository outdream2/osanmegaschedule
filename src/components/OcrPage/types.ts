export interface OcrPageResult {
  page: number;
  headers: string[];
  rows: (string | number | null)[][];
  meta: {
    supplier?: string | null;
    recipient?: string | null;
    date?: string | null;
    total?: number | null;
  };
  rawText?: string;
}

export interface OcrItem {
  name: string | null;
  spec: string | null;
  qty: number | null;
  unit_price: number | null;
  amount: number | null;
  _page: number;
}

export interface OcrMeta {
  page: number;
  supplier?: string | null;
  recipient?: string | null;
  date?: string | null;
  subtotal?: number | null;
  vat?: number | null;
  total?: number | null;
  _rawText?: string;
}

export const fmt = (n: number | null | undefined) =>
  n == null ? "-" : n.toLocaleString("ko-KR");
