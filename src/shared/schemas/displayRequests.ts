// 2026-09-01 · 서버·클라 공유 · 진열요청 Zod 스키마
import { z } from "zod";

/** POST /api/display-requests · 진열 요청 생성
 *  · 2026-09-09 · product_code 필수화 (구역별 진열요청 제거 · 상품별 dedup)
 *  · 같은 product_code + status=pending 이미 있으면 · 서버가 request_count 증가 (신규 insert 하지 않음)
 */
export const CreateDisplayRequestSchema = z.object({
  product_code: z.string().min(1).max(50),
  assigned_staff_id: z.union([z.number(), z.string(), z.null()]).optional(),
  assigned_staff_name: z.string().max(100).optional(),
  zone_id: z.string().max(50).optional(),
  zone_label: z.string().max(200).optional(),
  category: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
  requester_id: z.union([z.number(), z.string(), z.null()]).optional(),
  requester_name: z.string().max(100).optional(),
});
export type CreateDisplayRequestInput = z.infer<typeof CreateDisplayRequestSchema>;

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
