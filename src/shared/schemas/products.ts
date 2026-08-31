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
  location: z.string().max(200).nullable().optional(),
  display_location: z.string().max(200).nullable().optional(),
  real_map: z.string().max(100).nullable().optional(),
  optimal_stock: z.number().int().min(0).max(999999).nullable().optional(),
  sale_price: z.number().min(0).max(999999999).nullable().optional(),
  purchase_price: z.number().min(0).max(999999999).nullable().optional(),
  // 2026-08-25 · 사용자 지시 · products 테이블에 존재하는 컬럼만 등록 · cost_price 컬럼 없음 → 제거
  brand: z.string().max(100).nullable().optional(),
  manufacturer: z.string().max(100).nullable().optional(),
  // 2026-08-25 · 사용자 지시 · products 테이블에 존재하는 컬럼만 등록 · note 컬럼 없음 → 제거
  // memo 는 유지 (기존 데이터 사용중) · 실패 시 서버 strip-retry 로 대응
  memo: z.string().max(500).nullable().optional(),
  // 2026-08-30 · 사용자 지시 · 상품 등록 시 · sale_status 기본 "판매중"
  //   · 이전 · 미설정 · DB default 의존 · null 이면 조회 필터에서 제외됨
  sale_status: z.string().max(20).nullable().optional().default("판매중"),
});
export type CreateProductInput = z.infer<typeof CreateProductSchema>;

/** PATCH /api/products/:code · 상품 편집 (partial · product_code 변경 금지) */
export const UpdateProductSchema = CreateProductSchema.omit({ product_code: true }).partial();
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
