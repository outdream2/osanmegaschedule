// 2026-08-16 · 서버·클라 공유 · 직원 Zod 스키마
import { z } from "zod";

/** 공통 payload · POST/PUT 겸용 · 부분 갱신 시 optional */
const BaseEmployeeShape = {
  name: z.string().min(1, "이름 필수").max(50),
  position: z.string().min(1, "직군 필수").max(50),
  rank: z.string().max(50).nullable().optional(),
  employmentType: z.string().min(1, "계약형태 필수").max(50),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "입사일 (YYYY-MM-DD) 형식"),
  retireDate: z.string().nullable().optional(),
  description: z.string().max(500).optional(),
  workplace: z.string().max(50),
  gender: z.string().nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  annual_leave_days: z.number().min(0).max(365).nullable().optional(),
  level: z.number().min(0).max(9).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  email: z.string().email("이메일 형식 오류").nullable().optional().or(z.literal("")),
  bankbook_image_url: z.string().nullable().optional(),
  employee_number: z.string().max(20).nullable().optional(),
};

/** POST /api/employees · 신규 직원 등록 · 필수 필드 */
export const CreateEmployeeSchema = z.object(BaseEmployeeShape);
export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;

/** PUT /api/employees/:id · 전체 갱신 (필드 전체 · base 병합 후 사용) */
export const UpdateEmployeeSchema = z.object(BaseEmployeeShape);
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>;
