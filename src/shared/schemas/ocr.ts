// 2026-09-01 · 서버·클라 공유 · OCR 관련 Zod 스키마
import { z } from "zod";

/** POST /api/ocr-synonyms · PATCH /api/ocr-synonyms/:id */
export const UpsertOcrSynonymSchema = z.object({
  prod_name_old: z.string().min(1, "prod_name_old 필수").max(300),
  prod_name_new: z.string().max(300).optional(),
  supplier_old: z.string().max(200).optional(),
  supplier_new: z.string().max(200).optional(),
  product_code: z.string().max(50).optional(),
});
export type UpsertOcrSynonymInput = z.infer<typeof UpsertOcrSynonymSchema>;

/** POST /api/ocr-synonyms/cancel-by-name */
export const CancelOcrSynonymSchema = z.object({
  prod_name_old: z.string().min(1, "prod_name_old 필수").max(300),
  product_code: z.string().max(50).optional(),
});
export type CancelOcrSynonymInput = z.infer<typeof CancelOcrSynonymSchema>;

/** POST /api/ocr-supplier-aliases · PATCH /api/ocr-supplier-aliases/:id */
export const UpsertOcrSupplierAliasSchema = z.object({
  alias: z.string().min(1, "alias 필수").max(200),
  supplier_name: z.string().min(1, "supplier_name 필수").max(200),
});
export type UpsertOcrSupplierAliasInput = z.infer<typeof UpsertOcrSupplierAliasSchema>;

/** POST /api/ocr-templates */
export const UpsertOcrTemplateSchema = z.object({
  supplier_name: z.string().min(1, "supplier_name 필수").max(200),
  headers: z.array(z.string()).min(1, "headers 필수"),
  column_mapping: z.array(z.string()).optional(),
});
export type UpsertOcrTemplateInput = z.infer<typeof UpsertOcrTemplateSchema>;

/** POST /api/supplier-balances */
export const CreateSupplierBalanceSchema = z.object({
  supplier_name: z.string().min(1, "supplier_name 필수").max(200),
  invoice_date: z.string().max(20).nullable().optional(),
  balance: z.number({ error: "balance 필수" }),
});
export type CreateSupplierBalanceInput = z.infer<typeof CreateSupplierBalanceSchema>;
