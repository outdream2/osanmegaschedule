// 2026-08-16 · 서버·클라 공유 · 점심 Zod 스키마
import { z } from "zod";

/** PUT /api/lunch-requests · 점심 신청/변경 */
export const UpsertLunchRequestSchema = z.object({
  employee_id: z.union([z.string(), z.number()]),
  employee_name: z.string().min(1).max(50),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date YYYY-MM-DD 형식"),
  eating: z.boolean(),
  memo: z.string().max(200).optional().nullable(),
});
export type UpsertLunchRequestInput = z.infer<typeof UpsertLunchRequestSchema>;
