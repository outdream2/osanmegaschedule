// src/components/LandingPage/VendorListEditor.types.ts
// 2026-08-21 · Framework Phase 4 · large-file 분리 · VendorListEditor 타입 이관

export interface Vendor {
  id: number;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  note: string | null;
  business_number: string | null;
  vat_included?: boolean | null;   // 부가세 포함/미포함 (VAT 통합 · #193)
  // 2026-08-10 · #21 · 팀장·긴급연락처 (마이그레이션 add_vendor_extra_contacts_2026-08-10.sql)
  team_leader_name?: string | null;
  team_leader_phone?: string | null;
  emergency_contact?: string | null;
  created_at?: string | null;
  latestBalance?: { balance: number; invoice_date: string | null; created_at: string } | null;
  balanceConfig?: { balance_field: string; updated_at: string } | null;
}

export interface EditDraft {
  company_name: string;
  business_number: string;
  contact_name: string;
  phone: string;
  email: string;
  category: string;
  note: string;
  // 2026-08-03 · #193 · VAT 포함 여부 · "included"|"excluded"|"unset"
  vat_included: "included" | "excluded" | "unset";
  // 2026-08-10 · #21 · 팀장·긴급연락처
  team_leader_name: string;
  team_leader_phone: string;
  emergency_contact: string;
}

// compact 테이블 정렬 키 타입 (모듈 레벨 · IIFE SortIcon 에서 참조)
// 2026-08-04 · 일반 모드(non-compact) 에서도 재사용 · email/created_at 추가 (A-2 모든 헤더 정렬)
// 2026-08-04 · #101 · 결제/공급사관리 리스트 · 총재고자산·총판매액 컬럼 추가
export type CompactSortKey =
  | "company_name" | "category" | "business_number" | "contact_name" | "phone" | "email" | "vat"
  | "balance" | "invoice_date" | "created_at"
  | "stock_value" | "sales_total";

// VendorDetailModal 관련 타입
export interface PurchaseRow {
  purchase_date: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface VendorSummary {
  supplier: string;
  total_purchase: number;
  total_payment: number;
  balance: number;
  purchase_count: number;
  payment_count: number;
}

export interface SupplierBalanceInfo {
  supplier_name: string;
  balance_field: string;
}

export interface PaymentAllocation {
  invoice_date: string;
  amount: number;
}

export interface PaymentRow {
  id: number;
  supplier_name: string;
  payment_date: string;
  amount: number;
  method: string | null;
  memo: string | null;
  running_balance?: number | null;
  allocations?: PaymentAllocation[];
}

export interface LedgerRow {
  kind: "purchase" | "payment";
  date: string;
  ref_id?: number;
  amount: number;
  running_balance?: number;
  memo?: string;
}

export interface OpenInvoiceRow {
  invoice_date: string;
  total_amount: number;
  remaining: number;
}
