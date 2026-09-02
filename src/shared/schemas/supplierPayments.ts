// 2026-09-01 · 서버·클라 공유 · 공급사 결제 Zod 스키마
import { z } from "zod";

const VALID_METHODS = ["transfer", "card", "cash", "check", "other"] as const;

/** POST /api/supplier-payments · 결제 등록 */
// 2026-09-02 · #69 · card_id 필드 추가 · 결제방법=card 시 credit_cards.id 매핑
export const CreateSupplierPaymentSchema = z.object({
  supplier_name: z.string().min(1, "supplier_name 필수").max(200),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "payment_date 는 YYYY-MM-DD 형식"),
  amount: z.number().positive("amount 는 양수여야 합니다"),
  method: z.enum(VALID_METHODS).default("transfer"),
  memo: z.string().max(500).nullable().optional(),
  card_id: z.number().int().positive().nullable().optional(),
  created_by: z.string().max(100).nullable().optional(),
  created_by_id: z.number().int().nullable().optional(),
  allocations: z.array(z.object({
    ocr_confirmed_item_id: z.number().int().positive("allocation.ocr_confirmed_item_id 가 유효하지 않습니다"),
    allocated_amount: z.number().positive("allocation.allocated_amount 는 양수여야 합니다"),
  })).optional(),
});
export type CreateSupplierPaymentInput = z.infer<typeof CreateSupplierPaymentSchema>;

/** PATCH /api/supplier-payments/:id · memo·method 수정 */
export const UpdateSupplierPaymentSchema = z.object({
  method: z.enum(VALID_METHODS).optional(),
  memo: z.union([z.string().max(500), z.null(), z.literal("")]).optional(),
}).refine(d => Object.keys(d).length > 0, "수정할 필드 없음 (method/memo 만 허용)");
export type UpdateSupplierPaymentInput = z.infer<typeof UpdateSupplierPaymentSchema>;
