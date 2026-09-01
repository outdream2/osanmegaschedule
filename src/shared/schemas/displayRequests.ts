// 2026-09-01 · 서버·클라 공유 · 진열요청 Zod 스키마
import { z } from "zod";

/** PATCH /api/display-requests/:id/prepare */
export const PrepareDisplayRequestSchema = z.object({
  prepared_by: z.union([z.number(), z.string(), z.null()]).optional(),
  prepared_by_name: z.string().max(100).optional(),
});
export type PrepareDisplayRequestInput = z.infer<typeof PrepareDisplayRequestSchema>;

/** PATCH /api/display-requests/:id/complete */
export const CompleteDisplayRequestSchema = z.object({
  completed_by: z.union([z.number(), z.string(), z.null()]).optional(),
  completed_by_name: z.string().max(100).optional(),
});
export type CompleteDisplayRequestInput = z.infer<typeof CompleteDisplayRequestSchema>;

/** PATCH /api/display-requests/:id · 하위 호환 상태 전환 */
export const PatchDisplayRequestSchema = z.object({
  status: z.enum(["pending", "prepared", "done"]),
  zone_label: z.string().max(200).optional(),
  assigned_staff_name: z.string().max(100).optional(),
});
export type PatchDisplayRequestInput = z.infer<typeof PatchDisplayRequestSchema>;
