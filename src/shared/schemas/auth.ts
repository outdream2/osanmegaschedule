// 2026-08-16 · 서버·클라이언트 공유 Zod 스키마 · 인증 도메인
// 사용:
//   서버: import { LoginSchema } from "../../../src/shared/schemas/auth";
//         router.post(url, validateBody(LoginSchema), ...);
//   클라: import { LoginSchema, type LoginInput } from "../shared/schemas/auth";
//         const parsed = LoginSchema.safeParse(formData);
import { z } from "zod";

// 로그인 · employee_id 필드는 실제로 핸드폰번호 (하위호환)
export const LoginSchema = z.object({
  employee_id: z.union([z.string(), z.number()]).optional(),
  password: z.string().min(1, "비밀번호를 입력해주세요").max(200),
  rememberMe: z.boolean().optional(),
});
export type LoginInput = z.infer<typeof LoginSchema>;

// 거래처 로그인 · vendors.password_hash · bcrypt (기본 "1234")
// 2026-09-02 · 파생 규칙 (phone+"00") 제거 · 직원 로그인과 동일 구조
export const VendorLoginSchema = z.object({
  phone: z.string().min(1, "핸드폰번호를 입력해주세요").max(30),
  password: z.string().min(1, "비밀번호를 입력해주세요").max(200),
});
export type VendorLoginInput = z.infer<typeof VendorLoginSchema>;

// 거래처 본인 비밀번호 변경 · 세션 vendor 만
export const VendorChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "현재 비밀번호를 입력해주세요").max(200),
  newPassword: z.string().min(4, "새 비밀번호는 최소 4자 이상이어야 합니다").max(200),
});
export type VendorChangePasswordInput = z.infer<typeof VendorChangePasswordSchema>;

// 관리자 · 임의 직원 비밀번호 강제 설정
export const SetPasswordSchema = z.object({
  employeeId: z.union([z.string(), z.number()]),
  password: z.string().min(4, "비밀번호는 최소 4자 이상이어야 합니다").max(200),
});
export type SetPasswordInput = z.infer<typeof SetPasswordSchema>;

// 본인 비밀번호 변경
export const ChangePasswordSchema = z.object({
  employeeId: z.union([z.string(), z.number()]),
  currentPassword: z.string().min(1, "현재 비밀번호를 입력해주세요").max(200),
  newPassword: z.string().min(4, "새 비밀번호는 최소 4자 이상이어야 합니다").max(200),
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
