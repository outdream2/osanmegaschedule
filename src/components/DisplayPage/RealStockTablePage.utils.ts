// src/components/DisplayPage/RealStockTablePage.utils.ts
// 2026-09-18 · #149 R-1 · utils 사이드카 분리 (사용자 지시)

import type { Comparator } from "../../hooks/useSortableTable";
import { displayVendorName } from "../../utils/vendorNameNormalize";
import type { Row, SortKey } from "./RealStockTablePage.types";

export const SLOT_LABEL: Record<"w1" | "w2" | "s1" | "s2" | "s3", string> = {
  w1: "창고1", w2: "창고2", s1: "매장1", s2: "매장2", s3: "매장3",
};

export const zoneCmp = (a: string | null, b: string | null) =>
  (a ?? "").localeCompare(b ?? "", "ko", { numeric: true });

export const CMP: Record<SortKey, Comparator<Row>> = {
  product_name:  (a, b) => (a.product_name ?? "").localeCompare(b.product_name ?? "", "ko"),
  // 2026-09-18 · 정제 후 정렬
  supplier:      (a, b) => displayVendorName(a.supplier).localeCompare(displayVendorName(b.supplier), "ko"),
  category_code: (a, b) => (a.category_code ?? "").localeCompare(b.category_code ?? "", "ko"),
  location:      (a, b) => (a.location ?? "").localeCompare(b.location ?? "", "ko", { numeric: true }),
  erp:           (a, b) => (a.erp ?? 0) - (b.erp ?? 0),
  w1:            (a, b) => (a.w1 ?? 0) - (b.w1 ?? 0),
  w2:            (a, b) => (a.w2 ?? 0) - (b.w2 ?? 0),
  s1:            (a, b) => (a.s1 ?? 0) - (b.s1 ?? 0),
  s2:            (a, b) => (a.s2 ?? 0) - (b.s2 ?? 0),
  s3:            (a, b) => (a.s3 ?? 0) - (b.s3 ?? 0),
  s1zone:        (a, b) => zoneCmp(a.s1zone, b.s1zone),
  s2zone:        (a, b) => zoneCmp(a.s2zone, b.s2zone),
  s3zone:        (a, b) => zoneCmp(a.s3zone, b.s3zone),
  w1zone:        (a, b) => zoneCmp(a.w1zone, b.w1zone),
  w2zone:        (a, b) => zoneCmp(a.w2zone, b.w2zone),
  total:         (a, b) => a.total - b.total,
  diff:          (a, b) => a.diff - b.diff,
};

export const PAGE_SIZE = 1000;
