// 2026-08-17 · 서버·클라 공유 · 근로계약서 Zod 스키마
import { z } from "zod";

/** POST /api/employee-contracts · 계약서 승인 · PDF 업로드 */
export const CreateEmployeeContractSchema = z.object({
  employee_id: z.union([z.string(), z.number()]).nullable().optional(),
  employee_name: z.string().min(1, "employee_name required").max(50),
  contract_type: z.string().max(50).nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  pdf_data_url: z.string().min(1, "pdf_data_url required (data:application/pdf;base64,...)"),
  approved_by: z.string().max(50).nullable().optional(),
  approved_by_id: z.union([z.string(), z.number()]).nullable().optional(),
  // 신규 · employees 동기 갱신용 필드 (하위 호환)
  contract_start: z.string().nullable().optional(),
  contract_end: z.string().nullable().optional(),
  probation_end_date: z.string().nullable().optional(),
  employee_number: z.string().max(20).nullable().optional(),
  working_hours: z.string().max(200).nullable().optional(),
  annual_leave_days: z.union([z.string(), z.number()]).nullable().optional(),
});
export type CreateEmployeeContractInput = z.infer<typeof CreateEmployeeContractSchema>;
