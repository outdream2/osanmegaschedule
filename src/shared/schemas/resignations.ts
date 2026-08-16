// 2026-08-17 · 서버·클라 공유 · 사직서 Zod 스키마
import { z } from "zod";

/** POST /api/resignations · 사직서 제출 */
export const CreateResignationSchema = z.object({
  employee_id: z.union([z.string(), z.number()]),
  employee_name: z.string().min(1, "직원명 필수").max(50),
  position: z.string().max(50).optional().nullable(),
  hire_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "입사일 (YYYY-MM-DD)").optional().nullable(),
  last_work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "마지막 근무일 (YYYY-MM-DD)"),
  reason: z.string().min(1, "사유 필수").max(500),
  reason_detail: z.string().max(2000).optional().nullable(),
  handover_notes: z.string().max(5000).optional().nullable(),
  signature_data_url: z.string().optional().nullable(),
  pdf_url: z.string().optional().nullable(),
});
export type CreateResignationInput = z.infer<typeof CreateResignationSchema>;

/** PATCH /api/resignations/:id · 승인/반려/철회 */
export const ReviewResignationSchema = z.object({
  status: z.enum(["approved", "rejected", "withdrawn"], { message: "status must be 'approved' | 'rejected' | 'withdrawn'" }),
  reject_reason: z.string().max(500).optional(),
  approved_by: z.string().max(50).optional(),
  approved_by_id: z.union([z.string(), z.number()]).optional(),
});
export type ReviewResignationInput = z.infer<typeof ReviewResignationSchema>;
