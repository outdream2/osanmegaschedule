// 2026-09-01 · 서버·클라 공유 · 알림 Zod 스키마
import { z } from "zod";

/** POST /api/push-subscribe · 푸시 구독 등록 */
export const PushSubscribeSchema = z.object({
  employeeId: z.number().int().positive("employeeId 필수"),
  subscription: z.record(z.string(), z.unknown()),
});
export type PushSubscribeInput = z.infer<typeof PushSubscribeSchema>;

/** POST /api/push-send · 직접 푸시 발송 */
export const PushSendSchema = z.object({
  employeeId: z.number().int().positive("employeeId 필수"),
  title: z.string().max(100).optional(),
  body: z.string().max(300).optional(),
  url: z.string().max(500).optional(),
});
export type PushSendInput = z.infer<typeof PushSendSchema>;

/** POST /api/notifications/read-all */
export const ReadAllNotificationsSchema = z.object({
  employeeId: z.number().int().positive("employeeId 필수"),
});
export type ReadAllNotificationsInput = z.infer<typeof ReadAllNotificationsSchema>;

/** POST /api/notifications · 알림 생성 */
export const CreateNotificationSchema = z.object({
  employee_id: z.number().int().positive("employee_id 필수"),
  title: z.string().min(1, "title 필수").max(200),
  body: z.string().max(500).optional(),
  type: z.enum(["info", "success", "warning", "alert", "error"]).optional(),
});
export type CreateNotificationInput = z.infer<typeof CreateNotificationSchema>;
