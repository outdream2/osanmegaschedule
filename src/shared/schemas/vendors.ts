// 2026-08-17 · 서버·클라 공유 · 공급사 Zod 스키마
// 2026-08-23 · #178 Phase B · vendors 스키마 5 신규 필드 확장
//   · order_method · region · invoice_method · order_status · special_notes
//   · #192 Phase B · approval_status (승인 flow) · optional 추가
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
  // 2026-08-23 · #178 Phase B · xlsx 마스터 시트 컬럼 (5 신규)
  order_method: z.string().max(200).nullable().optional(),      // 주문 방식 (사이트 URL · 이메일 · 전화 등)
  region: z.string().max(100).nullable().optional(),            // 지역 (예: "서울 · 강남" · "경기 · 오산")
  invoice_method: z.string().max(200).nullable().optional(),    // 거래명세서 방식 (이메일 · 팩스 · 지참)
  order_status: z.string().max(100).nullable().optional(),      // 주문 현황 (정상 · 임시중단 · 종료)
  special_notes: z.string().max(1000).nullable().optional(),    // 발주 특이사항 (경고 톤 배너 노출)
  // 2026-08-23 · #192 Phase B · 승인 flow (DB migration 후 활성)
  approval_status: z.enum(["pending", "approved", "rejected"]).optional(),
});
export type CreateVendorInput = z.infer<typeof CreateVendorSchema>;

/** PATCH /api/vendors/:id · 공급사 수정 (부분 갱신) */
export const UpdateVendorSchema = CreateVendorSchema.partial();
export type UpdateVendorInput = z.infer<typeof UpdateVendorSchema>;
