// 2026-09-01 · 서버·클라 공유 · 공급사 잔고 설정 Zod 스키마
import { z } from "zod";

/** PUT /api/supplier-balance-configs · upsert */
export const UpsertSupplierBalanceConfigSchema = z.object({
  supplier_name: z.string().min(1, "supplier_name 필수").max(200),
  balance_field: z.string().max(100).optional(),
  column_layout: z.any().optional(),
});
export type UpsertSupplierBalanceConfigInput = z.infer<typeof UpsertSupplierBalanceConfigSchema>;
