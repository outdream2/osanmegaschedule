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

/** POST /api/order-requests/bulk-send · 발주서 일괄 발송
 *  2026-09-02 · 🔴 근본 fix · 실제 클라이언트 페이로드와 스키마 mismatch (발주 안 되는 진짜 원인)
 *   · 이전 · channels: array of string · bySupplier: record → 실제 형식 불일치 → 400 VALIDATION
 *   · 이후 · 실제 형식 반영 · channels: {email,sms,kakao} object · bySupplier: array of supplier group
 */
export const BulkSendOrderSchema = z.object({
  order_number: z.string().max(100).optional(),
  order_date: z.string().max(20).optional(),
  desired_arrival: z.string().max(20).nullable().optional(),
  memo: z.string().max(500).nullable().optional(),
  channels: z.object({
    email: z.boolean().optional(),
    sms:   z.boolean().optional(),
    kakao: z.boolean().optional(),
  }),
  bySupplier: z.array(z.object({
    supplier: z.string().min(1),
    supplier_contact: z.string().nullable().optional(),
    supplier_email:   z.string().nullable().optional(),
    supplier_phone:   z.string().nullable().optional(),
    items: z.array(z.object({
      order_request_id: z.union([z.string(), z.number()]).nullable().optional(),
      product_code: z.string(),
      product_name: z.string().optional(),
      current_stock: z.number().nullable().optional(),
      optimal_stock: z.number().nullable().optional(),
      needed_qty: z.number().nullable().optional(),
      order_qty: z.number().nullable().optional(),
      unit_price: z.number().nullable().optional(),
      memo: z.string().nullable().optional(),
    })).min(1, "items 배열 최소 1개"),
  })).min(1, "bySupplier 최소 1개 공급사"),
});
export type BulkSendOrderInput = z.infer<typeof BulkSendOrderSchema>;
