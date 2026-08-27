// 2026-08-27 · 감사 지적 #4 · 반품 요청 · 서버 입력 검증 (Zod)
//   · POST /api/return-requests · body 검증
//   · PATCH /api/return-requests/:id · body 검증
//   · POST /api/return-requests/bulk-send · body 검증

import { z } from "zod";

export const RETURN_STATUSES = ["pending", "sent", "done", "cancelled"] as const;
export type ReturnStatus = typeof RETURN_STATUSES[number];

/** POST 반품 요청 생성 · body */
export const ReturnRequestCreateSchema = z.object({
  product_code:    z.string().min(1, "product_code 필수").max(60),
  product_name:    z.string().max(200).optional().nullable(),
  supplier:        z.string().max(200).optional().nullable(),
  qty:             z.coerce.number().int().min(1, "qty 는 1 이상").max(100000),
  current_stock:   z.coerce.number().int().min(0).max(1000000).optional().nullable(),
  purchase_price:  z.coerce.number().min(0).max(100000000).optional().nullable(),
  reason:          z.string().max(500).optional().nullable(),
  note:            z.string().max(500).optional().nullable(),  // 하위호환 · 클라 payload
  requested_by:    z.string().max(60).optional().nullable(),
  requested_by_id: z.coerce.number().int().positive().optional().nullable(),
}).strip();
export type ReturnRequestCreate = z.infer<typeof ReturnRequestCreateSchema>;

/** PATCH 반품 요청 수정 · body */
export const ReturnRequestUpdateSchema = z.object({
  qty:    z.coerce.number().int().min(1).max(100000).optional(),
  reason: z.string().max(500).nullable().optional(),
  status: z.enum(RETURN_STATUSES).optional(),
}).strip().refine(
  v => v.qty !== undefined || v.reason !== undefined || v.status !== undefined,
  { message: "qty · reason · status 중 하나 이상 필요" },
);
export type ReturnRequestUpdate = z.infer<typeof ReturnRequestUpdateSchema>;

/** POST bulk-send · body */
export const ReturnRequestBulkSendSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1, "ids 최소 1개 필요").max(500),
  channels: z.object({
    email: z.boolean().optional(),
    sms:   z.boolean().optional(),
  }).optional(),
  sender_note: z.string().max(500).optional(),
}).strip();
export type ReturnRequestBulkSend = z.infer<typeof ReturnRequestBulkSendSchema>;

/** 상태 전이 규칙 (감사 #4 2차) · done → pending · sent → pending · cancelled → done · 금지 */
export function canTransitionStatus(from: ReturnStatus, to: ReturnStatus): boolean {
  if (from === to) return true;
  const forbidden: Record<ReturnStatus, ReturnStatus[]> = {
    pending:   [],                          // pending → 어떤 상태든 OK
    sent:      ["pending"],                  // sent → pending 금지
    done:      ["pending", "sent"],          // done → 이전 상태 금지
    cancelled: ["done", "sent"],             // cancelled → 활성 상태 금지
  };
  return !forbidden[from].includes(to);
}
