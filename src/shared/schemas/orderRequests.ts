// 2026-09-01 · 서버·클라 공유 · 발주요청 Zod 스키마
import { z } from "zod";

/** POST /api/order-requests · 발주요청 등록/갱신 */
export const CreateOrderRequestSchema = z.object({
  product_code: z.string().min(1, "product_code 필수").max(50),
  product_name: z.string().max(300).optional(),
  current_stock: z.number().nullable().optional(),
  optimal_stock: z.number().nullable().optional(),
  note: z.string().max(500).optional(),
});
export type CreateOrderRequestInput = z.infer<typeof CreateOrderRequestSchema>;

/** POST /api/order-requests/bulk-send · 발주서 일괄 발송 */
export const BulkSendOrderSchema = z.object({
  order_number: z.string().max(100).optional(),
  order_date: z.string().max(20).optional(),
  desired_arrival: z.string().max(20).optional(),
  memo: z.string().max(500).optional(),
  channels: z.array(z.string()).optional(),
  bySupplier: z.record(z.string(), z.unknown()).optional(),
});
export type BulkSendOrderInput = z.infer<typeof BulkSendOrderSchema>;
