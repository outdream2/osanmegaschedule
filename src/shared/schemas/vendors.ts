// 2026-08-17 · 서버·클라 공유 · 공급사 Zod 스키마
import { z } from "zod";

/** POST /api/vendors · 공급사 등록 */
export const CreateVendorSchema = z.object({
  company_name: z.string().min(1, "회사명은 필수입니다").max(100),
  contact_name: z.string().max(50).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email("이메일 형식 오류").nullable().optional().or(z.literal("")),
  category: z.string().max(50).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  business_number: z.string().max(20).nullable().optional(),
});
export type CreateVendorInput = z.infer<typeof CreateVendorSchema>;

/** PATCH /api/vendors/:id · 공급사 수정 (부분 갱신) */
export const UpdateVendorSchema = CreateVendorSchema.partial();
export type UpdateVendorInput = z.infer<typeof UpdateVendorSchema>;
