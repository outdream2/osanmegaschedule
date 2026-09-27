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

// ═══════════════════════════════════════════════════════════════
// 2026-09-27 · 사용자 지시 · 발주이상 요청서 발송 (bulk-send)
//   · POST /api/order-purchase-match/exception-requests/bulk-send
//   · 이상 라인들 · 공급사별로 그룹핑 · 담당자에게 이메일·SMS·카톡 통지
//   · exception_dispatches 테이블 생성 없이 outcomes 만 응답 (DB 마이그레이션 없이)
// ═══════════════════════════════════════════════════════════════
export const ExceptionRequestSupplierSchema = z.object({
  supplier: z.string().min(1, "공급사명 필수"),
  supplier_contact: z.string().nullable().optional(),
  supplier_email:   z.string().nullable().optional(),
  supplier_phone:   z.string().nullable().optional(),
  order_ids: z.array(z.union([z.string(), z.number()])).min(1, "order_ids 최소 1개"),
});
export type ExceptionRequestSupplier = z.infer<typeof ExceptionRequestSupplierSchema>;

export const ExceptionRequestsBulkSendSchema = z.object({
  channels: z.object({
    email: z.boolean().optional(),
    sms:   z.boolean().optional(),
    kakao: z.boolean().optional(),
  }),
  memo: z.string().max(1000).nullable().optional(),
  bySupplier: z.array(ExceptionRequestSupplierSchema).min(1, "bySupplier 최소 1개 공급사"),
});
export type ExceptionRequestsBulkSendInput = z.infer<typeof ExceptionRequestsBulkSendSchema>;

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
