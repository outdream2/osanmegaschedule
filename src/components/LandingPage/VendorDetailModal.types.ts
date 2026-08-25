// src/components/LandingPage/VendorDetailModal.types.ts
// 2026-08-25 · Framework Phase 4 · large-file 분리 · VendorDetailModal.tsx inline 타입 이관
//   · VendorListEditor.types.ts 동명 타입과 구조 상이 · 별도 파일 필수
//   · 이관 대상 · PurchaseRow · VendorSummary · SupplierBalanceInfo · PaymentAllocation · PaymentRow · LedgerRow · DetailTab

export interface PurchaseRow {
  id: number;
  purchase_date: string;
  product_code: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  amount: number;
  total: number;
}

export interface VendorSummary {
  totalAmount: number;
  totalQty: number;
  uniqueProducts: number;
  latestDate: string | null;
  earliestDate: string | null;
  count: number;
}

export interface SupplierBalanceInfo {
  supplier: string;
  total_purchase: number;
  total_payment: number;
  balance: number;
  purchase_count: number;
  payment_count: number;
}

export interface PaymentAllocation {
  id: number;
  payment_id: number;
  ocr_confirmed_item_id: number | null;
  allocated_amount: number;
}

export interface PaymentRow {
  id: number;
  supplier_name: string;
  payment_date: string;
  amount: number;
  method: string;
  memo: string | null;
  created_at: string;
  allocations?: PaymentAllocation[];
}

export interface LedgerRow {
  type: "purchase" | "payment";
  id: number;
  date: string;
  amount: number;
  method: string | null;
  memo: string | null;
  running_balance: number;
}

export type DetailTab = "info" | "payment" | "purchase";
