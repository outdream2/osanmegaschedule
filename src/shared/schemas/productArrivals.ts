// 2026-08-17 · 서버·클라 공유 · 상품입고 Zod 스키마
import { z } from "zod";

/** 입고 확인 아이템 · 단품별 스캔 결과 */
export const ArrivalItemSchema = z.object({
  product_code: z.string().max(50),
  product_name: z.string().max(200),
  supplier: z.string().max(200).optional().nullable(),
  qty: z.number().nonnegative(),
  status: z.enum(["match", "mismatch", "pending"]).default("pending"),
  expiring: z.boolean().optional(),
  // 2026-09-01 · fix · 프론트 · 매장구역 (item.location) 송신 · 서버 UPDATE products.location 사용
  //   · 이전 · Zod schema 누락 · 검증 우회 · 정합성 위험
  location: z.string().max(100).nullable().optional(),
});
export type ArrivalItemInput = z.infer<typeof ArrivalItemSchema>;

/** POST /api/product-arrivals · 입고 확인 저장 */
export const CreateProductArrivalSchema = z.object({
  checked_by: z.string().max(50).optional().default("익명"),
  checked_by_id: z.union([z.string(), z.number()]).nullable().optional(),
  final_decision: z.string().max(50).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  items: z.array(ArrivalItemSchema).min(1, "items 필수 · 최소 1개"),
});
export type CreateProductArrivalInput = z.infer<typeof CreateProductArrivalSchema>;
