// 2026-09-01 · 서버·클라 공유 · OCR 확정 매입 Zod 스키마
import { z } from "zod";

const OcrConfirmedItemSchema = z.object({
  supplier: z.string().min(1, "supplier 필수").max(200),
  product_name: z.string().min(1, "product_name 필수").max(300),
  product_code: z.string().max(50).nullable().optional(),
  quantity: z.union([z.number(), z.null()]).optional(),
  unit_price: z.union([z.number(), z.null()]).optional(),
  amount: z.union([z.number(), z.null()]).optional(),
  balance: z.union([z.number(), z.null()]).optional(),
  expiry_date: z.string().max(30).nullable().optional(),
  memo: z.string().max(500).nullable().optional(),
  raw_json: z.record(z.string(), z.unknown()).nullable().optional(),
  saved_at: z.string().max(20).nullable().optional(),
  invoice_date: z.string().max(30).nullable().optional(),
  image_url: z.string().nullable().optional(),
  image_public_id: z.string().nullable().optional(),
});

/** POST /api/ocr-confirmed-items · batch insert */
export const CreateOcrConfirmedItemsSchema = z.object({
  items: z.array(OcrConfirmedItemSchema).min(1, "items 배열이 비어 있습니다."),
  saved_at: z.string().max(20).optional(),
});
export type CreateOcrConfirmedItemsInput = z.infer<typeof CreateOcrConfirmedItemsSchema>;
