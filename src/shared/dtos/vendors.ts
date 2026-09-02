// 2026-08-16 · 서버·클라 공유 · 공급사 응답 DTO
// 2026-09-01 · LOW fix · 7 필드 추가 (note · order_method · region · invoice_method · order_status · special_notes · approval_status)
//   · 서버 `as any` 캐스팅 · 클라 `[key: string]: unknown` 인덱스 시그니처로 우회하던 필드들
export interface Vendor {
  id: number;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  business_number: string | null;
  category: string | null;
  address: string | null;
  memo: string | null;
  balance?: number;              // withBalances=1 요청 시
  note?: string | null;
  order_method?: string | null;
  region?: string | null;
  invoice_method?: string | null;
  order_status?: string | null;
  special_notes?: string | null;
  approval_status?: string | null;
  // 2026-09-02 · 사용자 지시 · 팀장 정보 추가 · migration 20260902_vendors_team_lead.sql
  team_leader_name?: string | null;
  team_leader_phone?: string | null;
  emergency_contact?: string | null;
}

/** GET /api/vendors · 리스트 (배열 직접 반환 · 하위호환) */
export type VendorsListResponse = Vendor[];
