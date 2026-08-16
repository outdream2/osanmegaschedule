// 2026-08-16 · 서버·클라 공유 · 거래처 예약 Zod 스키마
import { z } from "zod";

/** POST /api/reservations · 거래처 방문 예약 */
export const CreateReservationSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date YYYY-MM-DD 형식"),
  time: z.string().min(1, "시간 필수"),
  company: z.string().min(1, "회사명 필수").max(100),
  contactName: z.string().min(1, "담당자명 필수").max(50),
  phone: z.string().min(1, "연락처 필수").max(30),
  purpose: z.string().min(1, "방문 목적 필수").max(200),
  note: z.string().max(500).optional().nullable(),
  vendorId: z.number().optional(),
});
export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;
