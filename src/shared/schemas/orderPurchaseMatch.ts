// 2026-09-25 · #1 · 발주매입 대조 시스템 · Zod 스키마 (사용자 지시)
//   · POST /api/order-purchase-match/:order_id/confirm · body 검증
//   · match_status · matched · exception · unmatched (진행중) · null (초기)
//   · exception_type · qty_short · qty_over · price_diff · no_purchase
//
// 서버·클라 공유 · 단일 SSOT

import { z } from "zod";

/** match_status · 발주 라인의 매칭 결과 상태 */
export const MatchStatusSchema = z.enum(["matched", "exception", "unmatched"]);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

/** exception_type · 이상 유형 */
export const ExceptionTypeSchema = z.enum(["qty_short", "qty_over", "price_diff", "no_purchase"]);
export type ExceptionType = z.infer<typeof ExceptionTypeSchema>;

/** POST /api/order-purchase-match/:order_id/confirm · body */
export const MatchConfirmSchema = z.object({
  action: z.enum(["matched", "exception", "undo"]),
  exception_type: ExceptionTypeSchema.nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});
export type MatchConfirmInput = z.infer<typeof MatchConfirmSchema>;

/** 응답 · 발주 라인 매칭 row */
export const OrderMatchRowSchema = z.object({
  id: z.union([z.string(), z.number()]),
  order_number: z.string().nullable(),
  order_date: z.string().nullable(),
  sent_at: z.string().nullable(),
  supplier: z.string().nullable(),
  product_code: z.string(),
  product_name: z.string().nullable(),
  order_qty: z.number(),
  unit_price: z.number().nullable(),
  match_status: z.string().nullable(),
  matched_at: z.string().nullable(),
  matched_by: z.number().nullable(),
  exception_type: z.string().nullable(),
  exception_note: z.string().nullable(),
  // 매입 매칭 결과 (join)
  purchase_matches: z
    .array(
      z.object({
        purchase_id: z.union([z.string(), z.number()]).nullable(),
        purchase_date: z.string().nullable(),
        quantity: z.number(),
        unit_price: z.number(),
        amount: z.number(),
        supplier_name: z.string().nullable(),
      }),
    )
    .default([]),
  purchase_total_qty: z.number().default(0),
  purchase_avg_price: z.number().nullable().default(null),
  price_diff_pct: z.number().nullable().default(null),
  auto_status: z.string().nullable().default(null),
});
export type OrderMatchRow = z.infer<typeof OrderMatchRowSchema>;
