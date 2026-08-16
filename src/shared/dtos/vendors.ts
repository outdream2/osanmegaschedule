// 2026-08-16 · 서버·클라 공유 · 공급사 응답 DTO
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
}

/** GET /api/vendors · 리스트 (배열 직접 반환 · 하위호환) */
export type VendorsListResponse = Vendor[];
