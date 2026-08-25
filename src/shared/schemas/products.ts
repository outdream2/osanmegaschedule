// 2026-08-23 · #177 Phase C · 서버·클라 공유 · 상품 Zod 스키마
import { z } from "zod";

/** POST /api/products · 상품 신규 등록 */
export const CreateProductSchema = z.object({
  product_code: z.string().min(1, "상품코드는 필수입니다").max(50),
  product_name: z.string().min(1, "상품명은 필수입니다").max(200),
  supplier: z.string().max(100).nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  unit: z.string().max(30).nullable().optional(),
  spec: z.string().max(100).nullable().optional(),
  barcode: z.string().max(50).nullable().optional(),
  real_map: z.string().max(100).nullable().optional(),
  optimal_stock: z.number().int().min(0).max(999999).nullable().optional(),
  sale_price: z.number().min(0).max(999999999).nullable().optional(),
  purchase_price: z.number().min(0).max(999999999).nullable().optional(),
  // 2026-08-25 · 사용자 지시 · products 테이블에 존재하는 컬럼만 등록 · cost_price 컬럼 없음 → 제거
  brand: z.string().max(100).nullable().optional(),
  manufacturer: z.string().max(100).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  memo: z.string().max(500).nullable().optional(),
});
export type CreateProductInput = z.infer<typeof CreateProductSchema>;

/** PATCH /api/products/:code · 상품 편집 (partial · product_code 변경 금지) */
export const UpdateProductSchema = CreateProductSchema.omit({ product_code: true }).partial();
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
