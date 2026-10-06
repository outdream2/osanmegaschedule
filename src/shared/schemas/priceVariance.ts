// src/shared/schemas/priceVariance.ts
// 2026-10-06 · 매입 단가변동 API schema (zod)
//   · GET /api/purchases/price-variance (list)
//   · PATCH /api/purchases/price-variance/:id/review (upsert review status)
//   · GET /api/purchases/price-variance/:id/history (expand detail)

import { z } from "zod";

export const PRICE_CHANGE_TYPES = ["PRICE_INCREASE", "PRICE_DECREASE"] as const;
export type PriceChangeType = typeof PRICE_CHANGE_TYPES[number];

export const PRICE_REVIEW_STATUSES = ["PENDING", "CONFIRMED_CHANGE", "NEEDS_CHECK", "RESOLVED"] as const;
export type PriceReviewStatus = typeof PRICE_REVIEW_STATUSES[number];

export const PRICE_VARIANCE_SORTS = ["recent", "amount", "rate"] as const;
export type PriceVarianceSort = typeof PRICE_VARIANCE_SORTS[number];

// GET /api/purchases/price-variance?months_list=...&...
export const PriceVarianceQuerySchema = z.object({
  months_list: z.string().optional(),
  change_type: z.enum(PRICE_CHANGE_TYPES).optional(),
  review_status: z.enum(PRICE_REVIEW_STATUSES).optional(),
  supplier_search: z.string().trim().min(1).max(100).optional(),
  product_search: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(PRICE_VARIANCE_SORTS).default("recent").optional(),
  page: z.coerce.number().int().min(1).default(1).optional(),
  page_size: z.coerce.number().int().min(1).max(200).default(50).optional(),
});
export type PriceVarianceQuery = z.infer<typeof PriceVarianceQuerySchema>;

export interface PriceVarianceRow {
  purchase_detail_id: number;
  previous_purchase_detail_id: number | null;
  product_code: string;
  product_name: string | null;
  supplier_code: string;
  supplier_name: string | null;
  purchase_date: string; // YYYY-MM-DD
  previous_price: number | null;
  current_price: number;
  price_difference: number | null;
  change_rate: number | null;
  change_type: PriceChangeType;
  bm_code: string | null;
  row_num: number | null;
  review_status: PriceReviewStatus | null;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  effective_review_status: PriceReviewStatus;
}

export interface PriceVarianceListResponse {
  rows: PriceVarianceRow[];
  total: number;
  // 2026-10-06 · 사용자 섹션 13 · badge SSOT · page 와 무관한 전체 effective PENDING
  pendingCount: number;
  page: number;
  page_size: number;
}

// PATCH /api/purchases/price-variance/:id/review
export const PriceReviewUpsertSchema = z.object({
  status: z.enum(PRICE_REVIEW_STATUSES),
  note: z.string().max(500).optional().nullable(),
  reviewed_by: z.string().max(100).optional().nullable(),
  // stale protection snapshot · 섹션 15
  reviewed_previous_purchase_detail_id: z.number().int().nullable().optional(),
  reviewed_previous_price: z.number().nullable().optional(),
  reviewed_current_price: z.number().nullable().optional(),
});
export type PriceReviewUpsert = z.infer<typeof PriceReviewUpsertSchema>;

// GET /api/purchases/price-variance/:id/history
export interface PriceHistoryRow {
  purchase_detail_id: number;
  purchase_date: string;
  unit_price: number;
  quantity: number;
  bm_code: string | null;
  row_num: number | null;
}
export interface PriceHistoryResponse {
  rows: PriceHistoryRow[];
}
