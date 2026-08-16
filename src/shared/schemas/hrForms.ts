// 2026-08-17 · 서버·클라 공유 · 인사서식 Zod 스키마
import { z } from "zod";

/** 서식 카테고리 · 서버 ALLOWED_CATEGORIES 와 sync (hrForms.ts:51) */
export const HR_FORM_CATEGORIES = ["contract", "resignation", "pledge", "etc"] as const;
export type HrFormCategory = typeof HR_FORM_CATEGORIES[number];

/** POST /api/hr-forms · 인사서식 업로드 (dataUrl 방식 · legacy) */
export const CreateHrFormSchema = z.object({
  title: z.string().min(1, "제목 필수").max(200),
  category: z.enum(HR_FORM_CATEGORIES).default("contract"),
  file_name: z.string().max(200).optional().default("form"),
  data_url: z.string().min(1, "파일 데이터 필수"),
  uploaded_by: z.string().max(50).nullable().optional(),
  uploaded_by_id: z.union([z.string(), z.number()]).nullable().optional(),
});
export type CreateHrFormInput = z.infer<typeof CreateHrFormSchema>;
