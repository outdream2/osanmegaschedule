// 2026-09-01 · 서버·클라 공유 · 실재고 점검 Zod 스키마
import { z } from "zod";

const numNullable = z.union([z.number(), z.null(), z.literal("")]).optional();

/** POST /api/inventory-checks · 실재고 단건 저장 (부분 업데이트 허용) */
export const CreateInventoryCheckSchema = z.object({
  product_code: z.string().min(1, "product_code 필수").max(50),
  product_name: z.string().max(300).optional(),
  system_stock: numNullable,
  optimal_stock: numNullable,
  checked_by: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
  // 재고 컬럼 (모두 optional · 부분 업데이트 지원)
  warehouse1_stock: numNullable,
  warehouse2_stock: numNullable,
  warehouse_stock: numNullable,  // 레거시 → warehouse1_stock 리다이렉트
  store_stock: numNullable,
  store_stock_2: numNullable,
  store3_stock: numNullable,
  store1_zone: z.string().max(100).nullable().optional(),
  store2_zone: z.string().max(100).nullable().optional(),
  store3_zone: z.string().max(100).nullable().optional(),
  expiry_input_date: z.string().max(20).nullable().optional(),
  expiry_date: z.string().max(20).nullable().optional(),
});
export type CreateInventoryCheckInput = z.infer<typeof CreateInventoryCheckSchema>;

const InventoryCheckItemSchema = z.object({
  product_code: z.string().min(1).max(50),
  product_name: z.string().max(300).optional(),
  warehouse1_stock: numNullable,
  warehouse2_stock: numNullable,
  warehouse_stock: numNullable,
  store_stock: numNullable,
  store_stock_2: numNullable,
  store3_stock: numNullable,
  store1_zone: z.string().max(100).nullable().optional(),
  store2_zone: z.string().max(100).nullable().optional(),
  store3_zone: z.string().max(100).nullable().optional(),
  expiry_input_date: z.string().max(20).nullable().optional(),
  expiry_date: z.string().max(20).nullable().optional(),
});

/** POST /api/inventory-checks/bulk · 실재고 일괄 저장 */
export const BulkInventoryCheckSchema = z.object({
  checked_by: z.string().max(100).optional(),
  items: z.array(InventoryCheckItemSchema).min(1, "items 필수"),
});
export type BulkInventoryCheckInput = z.infer<typeof BulkInventoryCheckSchema>;

/** PATCH /api/inventory-checks/:id · 상태 업데이트 */
export const PatchInventoryCheckSchema = z.object({
  status: z.string().max(20).optional(),
  note: z.string().max(500).optional(),
  expiry_date: z.string().max(20).nullable().optional(),
  expiry_input_date: z.string().max(20).nullable().optional(),
});
export type PatchInventoryCheckInput = z.infer<typeof PatchInventoryCheckSchema>;
