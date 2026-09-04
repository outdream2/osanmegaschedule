// 2026-08-16 · 서버·클라 공유 · 직원 Zod 스키마
// 2026-09-04 · UpdateEmployeeSchema · HR 확장 필드 추가 (contract_type 등 strip 버그 수정)
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

/** PUT 전용 HR 확장 필드 · validateBody 가 strip 하지 않도록 명시 */
const HrExtendedShape = {
  contract_type: z.string().nullable().optional(),
  contract_start: z.string().nullable().optional(),
  contract_end: z.string().nullable().optional(),
  probation_end_date: z.string().nullable().optional(),
  birth_date: z.string().nullable().optional(),
  emergency_contact_name: z.string().nullable().optional(),
  emergency_contact_phone: z.string().nullable().optional(),
  emergency_contact_rel: z.string().nullable().optional(),
  schedule_type: z.string().nullable().optional(),
  work_area: z.string().nullable().optional(),
  work_location: z.string().nullable().optional(),
  job_duties: z.string().nullable().optional(),
  working_hours_per_week: z.number().nullable().optional(),
  weekly_holiday: z.string().nullable().optional(),
  wage_calc_type: z.string().nullable().optional(),
  wage_amount: z.number().nullable().optional(),
  wage_pay_day: z.string().nullable().optional(),
  wage_pay_method: z.string().nullable().optional(),
  bank_name: z.string().nullable().optional(),
  bank_account_no: z.string().nullable().optional(),
  insurance_nps_date: z.string().nullable().optional(),
  insurance_nhis_date: z.string().nullable().optional(),
  insurance_ei_date: z.string().nullable().optional(),
  insurance_wcia_date: z.string().nullable().optional(),
  insurance_excluded: z.boolean().nullable().optional(),
  pharmacist_license_no: z.string().nullable().optional(),
  health_check_expiry: z.string().nullable().optional(),
  careers: z.any().optional(),
  educations: z.any().optional(),
  certifications: z.any().optional(),
  performance_rating: z.string().nullable().optional(),
  break_time_minutes: z.number().nullable().optional(),
  break_apply_paid: z.boolean().nullable().optional(),
};

/** POST /api/employees · 신규 직원 등록 · 필수 필드 */
export const CreateEmployeeSchema = z.object(BaseEmployeeShape);
export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;

/** PUT /api/employees/:id · 전체 갱신 · HR 확장 필드 포함 (strip 방지) */
export const UpdateEmployeeSchema = z.object({ ...BaseEmployeeShape, ...HrExtendedShape });
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>;
