// 2026-09-01 · 서버·클라 공유 · 차용 Zod 스키마
import { z } from "zod";

const BorrowingSignatureSchema = z.object({
  role: z.enum(["lender", "borrower", "lender_return", "borrower_return", "witness"]),
  signer_name: z.string().max(100).optional(),
  signer_id: z.number().int().positive().nullable().optional(),
  party_id: z.number().int().positive().nullable().optional(),
  signature_url: z.string().min(1, "signature_url 필수"),
  stamp_url: z.string().nullable().optional(),
  intent_text: z.string().max(500).nullable().optional(),
});

/** POST /api/borrowings · 차용 신규 등록 */
export const CreateBorrowingSchema = z.object({
  direction: z.enum(["lend", "borrow"]).default("lend"),
  supplier: z.string().max(200).nullable().optional(),
  product_code: z.string().max(50).nullable().optional(),
  product_name: z.string().max(200).nullable().optional(),
  qty: z.number().positive("qty > 0 필수"),
  unit_price: z.number().nullable().optional(),
  due_date: z.string().max(20).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  signature_url: z.string().nullable().optional(),
  created_by: z.string().max(100).nullable().optional(),
  created_by_id: z.number().int().nullable().optional(),
  lender_party_id: z.number().int().nullable().optional(),
  borrower_party_id: z.number().int().nullable().optional(),
  signatures: z.array(BorrowingSignatureSchema).optional(),
});
export type CreateBorrowingInput = z.infer<typeof CreateBorrowingSchema>;

/** PATCH /api/borrowings/:id · 부분 수정 */
export const UpdateBorrowingSchema = z.object({
  status: z.enum(["open", "settled", "cancelled"]).optional(),
  qty: z.number().min(0).optional(),
  unit_price: z.union([z.number(), z.null(), z.literal("")]).optional(),
  due_date: z.union([z.string().max(20), z.null(), z.literal("")]).optional(),
  note: z.union([z.string().max(500), z.null(), z.literal("")]).optional(),
  signature_url: z.union([z.string(), z.null(), z.literal("")]).optional(),
}).refine(d => Object.keys(d).length > 0, "수정 필드 없음");
export type UpdateBorrowingInput = z.infer<typeof UpdateBorrowingSchema>;

/** PATCH /api/borrowings/:id/return · 반환 처리 */
export const ReturnBorrowingSchema = z.object({
  return_signature_url: z.string().min(1, "반환 서명 필수 · return_signature_url"),
  return_note: z.string().max(500).nullable().optional(),
});
export type ReturnBorrowingInput = z.infer<typeof ReturnBorrowingSchema>;

/** POST /api/borrowings/parties · 당사자 등록 */
export const CreateBorrowingPartySchema = z.object({
  name: z.string().min(1, "name 필수").max(200),
  party_type: z.enum(["self", "vendor", "external"]).default("external"),
  vendor_id: z.number().int().nullable().optional(),
  employee_id: z.number().int().nullable().optional(),
  contact_name: z.string().max(100).nullable().optional(),
  contact_phone: z.string().max(30).nullable().optional(),
  contact_email: z.string().max(100).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  memo: z.string().max(500).nullable().optional(),
});
export type CreateBorrowingPartyInput = z.infer<typeof CreateBorrowingPartySchema>;

/** POST /api/borrowings/:id/signatures · 사후 서명 추가 */
export const AddBorrowingSignatureSchema = BorrowingSignatureSchema;
export type AddBorrowingSignatureInput = z.infer<typeof AddBorrowingSignatureSchema>;
