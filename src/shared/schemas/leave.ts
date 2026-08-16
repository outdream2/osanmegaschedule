// 2026-08-16 · 서버·클라 공유 · 연차 Zod 스키마
import { z } from "zod";

/** POST /api/leave-requests · 연차 신청 */
export const CreateLeaveRequestSchema = z.object({
  employee_id: z.union([z.string(), z.number()]),
  employee_name: z.string().min(1, "직원명 필수").max(50),
  leave_type: z.string().min(1, "연차 유형 필수"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "시작일 (YYYY-MM-DD) 형식"),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "종료일 (YYYY-MM-DD) 형식"),
  reason: z.string().max(500).optional(),
});
export type CreateLeaveRequestInput = z.infer<typeof CreateLeaveRequestSchema>;

/** PUT /api/leave-requests/:id · 승인/거절 */
export const ReviewLeaveRequestSchema = z.object({
  status: z.enum(["approved", "rejected"], { message: "status must be 'approved' or 'rejected'" }),
  reviewer_note: z.string().max(500).optional(),
});
export type ReviewLeaveRequestInput = z.infer<typeof ReviewLeaveRequestSchema>;
