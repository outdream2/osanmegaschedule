// 2026-08-17 · 서버·클라 공유 · 공급사 Zod 스키마
// 2026-08-23 · #178 Phase B · vendors 스키마 5 신규 필드 확장
// 2026-09-02 · 🔴 fix · team_leader_name/phone · emergency_contact · vat_included 누락 (사용자 지시)
//   · 이전 · Zod 미포함 · validateBody 가 body 에서 스트립 → 서버 destructure = undefined → 저장 안 됨
//   · 사용자 "5필드 저장 안 됨" 이슈 · 근본 원인
// 2026-09-04 · 🔴 fix · UpdateVendorSchema · email 포맷 강제 제거 (사용자 지시)
//   · 이전 · autosave 800ms · 부분 입력 중 (예: "abc") · 400 반환 · 사용자 랜딩 이탈 리포트
//   · 이후 · email 은 문자열 · 형식 강제 X · DB 저장 시에만 사용 · Create 는 유지
import { z } from "zod";

/** POST /api/vendors · 공급사 등록 (신규 등록 시 이메일 형식 검증 유지) */
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
  // 2026-09-02 · fix · 팀장·긴급연락처·VAT · 서버 destructure/저장 대상 · 스키마에 반드시 포함
  team_leader_name:  z.string().max(50).nullable().optional(),
  team_leader_phone: z.string().max(30).nullable().optional(),
  emergency_contact: z.string().max(100).nullable().optional(),
  vat_included:      z.boolean().nullable().optional(),
  // 2026-08-23 · #192 · 2026-09-03 · 사용자 결정 · 4-state
  //   registered (default · 등록됨) · requested (승인 요청) · approved · rejected
  //   pending 은 하위호환 (마이그레이션 · 신규는 requested)
  approval_status: z.enum(["registered", "requested", "approved", "rejected", "pending"]).optional(),
});
export type CreateVendorInput = z.infer<typeof CreateVendorSchema>;

/** PATCH /api/vendors/:id · 공급사 수정 (부분 갱신)
 *  2026-09-04 · fix · email · 형식 강제 제거 · autosave 부분 입력 400 방지
 *   · vendor 자동저장 800ms · 사용자가 "a" 만 쳐도 서버 400 → 사용자 이탈 UX 문제
 *   · email 형식 검증은 프론트 <input type="email"> 브라우저 검증만 사용 · 서버는 문자열 저장 */
export const UpdateVendorSchema = CreateVendorSchema.partial().extend({
  email: z.string().max(200).nullable().optional(),
});
export type UpdateVendorInput = z.infer<typeof UpdateVendorSchema>;
