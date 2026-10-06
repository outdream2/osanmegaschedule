// 2026-08-17 · 서버·클라 공유 · 공급사 Zod 스키마
// 2026-08-23 · #178 Phase B · vendors 스키마 5 신규 필드 확장
// 2026-09-02 · 🔴 fix · team_leader_name/phone · emergency_contact · vat_included 누락 (사용자 지시)
//   · 이전 · Zod 미포함 · validateBody 가 body 에서 스트립 → 서버 destructure = undefined → 저장 안 됨
//   · 사용자 "5필드 저장 안 됨" 이슈 · 근본 원인
// 2026-09-04 · 🔴 fix · UpdateVendorSchema · email 포맷 강제 제거 (사용자 지시)
//   · 이전 · autosave 800ms · 부분 입력 중 (예: "abc") · 400 반환 · 사용자 랜딩 이탈 리포트
//   · 이후 · email 은 문자열 · 형식 강제 X · DB 저장 시에만 사용 · Create 는 유지
// 2026-10-06 · VENDOR ERP CANONICALIZATION Stage A (사용자 승인)
//   · ERP BuyCustomer_List 기준 canonical columns 추가 (dual field · optional)
//     ct_code · corp_name_view · corp_biz_no · scate_name · remark + 운영 7개
//   · legacy (company_name/business_number/category/note) 는 Stage B 에서 DROP
import { z } from "zod";

// 2026-10-06 · PHASE 9 · order_method · 공식 상수 목록 (vendorOrderMethods.ts 와 동기)
//   · Zod enum 강제 X · 사용자가 "기타 · 직접 입력" 선택 가능 · UI 자유 입력 허용
//   · 서버/클라 공용 참조용 constant · 검증은 string().max(200) 유지
//   · 신규 UI/스크립트는 이 enum 을 참조해서 drift 방지
export const VENDOR_ORDER_METHOD_NAMES = [
  "고려은단 폐쇄몰", "광동제약 약국몰", "녹십자 프리미온", "theSHOP",
  "온다몰, 일부직거래", "DAPmall - 메인", "동화eMall, 일부직거래", "팜스트리트",
  "바로팜 | 홈", "셀로몰", "소조몰", "뉴트라몰", "HMP몰", "유한팜", "새로팜",
  "플랫팜", "JW중외제약 온라인몰", "현대약품몰, 직거래",
] as const;
export type VendorOrderMethodName = (typeof VENDOR_ORDER_METHOD_NAMES)[number];
/** 공식 order_method · 자유 입력 금지 strict 검증 (옵션) */
export const VendorOrderMethodEnum = z.enum(VENDOR_ORDER_METHOD_NAMES);

/** POST /api/vendors · 공급사 등록 (신규 등록 시 이메일 형식 검증 유지) */
export const CreateVendorSchema = z.object({
  // ── legacy (Stage B 에서 제거 예정) ────────────────────────────────
  company_name: z.string().min(1, "회사명은 필수입니다").max(100),
  contact_name: z.string().max(50).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email("이메일 형식 오류").nullable().optional().or(z.literal("")),
  category: z.string().max(50).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  business_number: z.string().max(20).nullable().optional(),
  // 2026-10-06 · ERP canonical (dual field · optional during transition) ─
  ct_code:            z.string().max(50).nullable().optional(),
  corp_name_view:     z.string().max(200).nullable().optional(),
  corp_biz_no:        z.string().max(20).nullable().optional(),
  scate_name:         z.string().max(100).nullable().optional(),
  remark:             z.string().max(1000).nullable().optional(),
  // 2026-10-06 · ERP 운영가치 7 (사용자 승인)
  president:          z.string().max(100).nullable().optional(),
  join_date:          z.string().max(20).nullable().optional(),    // ISO date string (YYYY-MM-DD)
  buyer_type_name:    z.string().max(100).nullable().optional(),
  buyer_status_name:  z.string().max(100).nullable().optional(),
  payment_type_name:  z.string().max(100).nullable().optional(),
  payment_gubun_name: z.string().max(100).nullable().optional(),
  payment_date:       z.number().int().nullable().optional(),
  // ── 2026-08-23 · #178 Phase B · xlsx 마스터 시트 컬럼 (5 신규 · WEB-only) ─
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

// ─────────────────────────────────────────────────────────────────────
// 2026-10-06 · PHASE 1-A · vendor-self PATCH whitelist (mass assignment 방어)
//   · vendor 세션 (session.sub === vendor.id · role === 'vendor') 이 자기 레코드를
//     PATCH 할 때 변경 가능한 필드만 허용
//   · 금지: id · ct_code · corp_name_view · corp_biz_no · scate_name · remark
//     · president · join_date · buyer_type_name · buyer_status_name · payment_type_name
//     · payment_gubun_name · payment_date (ERP canonical 전부)
//   · 금지: company_name · business_number · category · note (legacy ERP mirror)
//   · 금지: approval_status · approval_requested_at · approved_at · approved_by
//   · 금지: password_hash · created_at
//   · 허용: 운영 프로필 (연락처·주문·결제·발주 특이사항·팀장·긴급연락처 등)
//   · 관리자 (level ≥ 5) 는 UpdateVendorSchema 그대로 (ERP canonical 변경 가능)
// ─────────────────────────────────────────────────────────────────────
export const VendorSelfUpdateSchema = z.object({
  // 연락 · 담당자 (phone 은 로그인 ID 지만 사용자 변경 허용 → 서버는 unique 재검증)
  phone:             z.string().max(30).nullable().optional(),
  manager_phone:     z.string().max(30).nullable().optional(),
  email:             z.string().max(200).nullable().optional(),
  contact_name:      z.string().max(50).nullable().optional(),
  manager_name:      z.string().max(50).nullable().optional(),
  // 팀장 · 긴급
  team_leader_name:  z.string().max(50).nullable().optional(),
  team_leader_phone: z.string().max(30).nullable().optional(),
  emergency_contact: z.string().max(100).nullable().optional(),
  // 발주·거래명세서
  order_method:      z.string().max(200).nullable().optional(),
  invoice_method:    z.string().max(200).nullable().optional(),
  address:           z.string().max(300).nullable().optional(),
  region:            z.string().max(100).nullable().optional(),
  // 운영 특이사항
  special_notes:     z.string().max(1000).nullable().optional(),
});
export type VendorSelfUpdateInput = z.infer<typeof VendorSelfUpdateSchema>;

/** 관리자(level ≥ 5) 용 PATCH · UpdateVendorSchema 의 가명 (의미 명시용) */
export const AdminVendorUpdateSchema = UpdateVendorSchema;
export type AdminVendorUpdateInput = z.infer<typeof AdminVendorUpdateSchema>;

/** 거래처 vendor-self 가 수정 가능한 field 화이트리스트 · 런타임 검증용 */
export const VENDOR_SELF_ALLOWED_FIELDS: ReadonlyArray<keyof VendorSelfUpdateInput> = [
  "phone",
  "manager_phone",
  "email",
  "contact_name",
  "manager_name",
  "team_leader_name",
  "team_leader_phone",
  "emergency_contact",
  "order_method",
  "invoice_method",
  "address",
  "region",
  "special_notes",
] as const;
