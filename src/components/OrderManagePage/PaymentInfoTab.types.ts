// src/components/OrderManagePage/PaymentInfoTab.types.ts
// 2026-08-21 · Framework Phase 4 · large-file 분리 · PaymentInfoTab 타입 이관

export interface VendorItem {
  id: number;
  company_name: string;
  category: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  business_number?: string | null;
  created_at?: string | null;
  payment_terms?: string | null;
  active?: boolean | null;
  vat_included?: boolean | null;
  // 2026-08-04 · 좌측 리스트에 총 잔고 표시 (withBalances=1 응답)
  balance?: number | null;
}

export type PayMethod = "card" | "transfer" | "cash" | "check" | "offset" | "etc";

export interface PaymentRow {
  id: number;
  supplier_name: string;
  payment_date: string;
  amount: number;
  method: PayMethod | string | null;
  memo: string | null;
  created_at?: string | null;
  // 결제 직후 잔고 (누적 매입 - 누적 결제, 이 결제까지 반영)
  // · Task #104 · /api/supplier-ledger 의 running_balance 사용
  // · 양수 = 미결 · 0 = 완납 · 음수 = 초과결제
  running_balance?: number | null;
  // decoded from memo prefix
  meta?: {
    card_issuer?: string;
    bank_name?: string;
    reference_no?: string;
    tax_invoice_issued?: boolean;
    tax_invoice_no?: string;
    vat_amount?: number;
    note?: string;
  };
}

export interface BalanceResp {
  supplier: string;
  total_purchase: number;
  total_payment: number;
  balance: number;
  purchase_count: number;
  payment_count: number;
}

// 월별 매입/결제 breakdown · 2026-08-04 · #58 · 상단 요약 표용
// key = "YYYY-MM" · purchase/payment 는 해당 월 합계
export interface MonthlyBreakdown {
  months: string[];               // 오래된순 · 최근 N개월 · e.g. ["2026-06","2026-07","2026-08"]
  purchase: Record<string, number>; // "YYYY-MM" → 매입 합계
  payment: Record<string, number>;  // "YYYY-MM" → 결제 합계
  total_purchase: number;          // 전체 (fetch 기간 내) 매입 합계
  total_payment: number;           // 전체 (fetch 기간 내) 결제 합계
}

// 2026-08-09 · 판매/실재고 월별 breakdown · 7행 표 아래쪽 3행 (판매정보)
export interface SalesStockBreakdown {
  months: string[];                       // 오래된순
  purchases: Record<string, number>;     // 매입 (동일 데이터 · 표 아래쪽 재사용)
  payments: Record<string, number>;      // 결제
  sales: Record<string, number>;         // 판매액 (프록시)
  stockValue: Record<string, number>;   // (deprecated · 하위호환) 월별 실재고
  stockValueCurrent: number;             // 현재 실재고액 · 실재고 × 매입단가 합계
  totals: {
    purchases: number;
    payments: number;
    balance: number;
    sales: number;
    stockValue: number;
  };
}

// ─── Period Filter · Task #103 (2026-08-04) ─────────────────────────────────
export type PeriodDays = 10 | 30 | 60 | 90;

// ─── Sort · 좌측 리스트 헤더 정렬 · Task #103 ─────────────────────────────
// 2026-08-09 · 사용자 요청 재구성 · 4컬럼 (총재고자산·총판매액·총결제액·총잔고)
export type VendorSortKey = "name" | "balance" | "payment" | "sales" | "stockValue";
export type SortDir = "asc" | "desc";

// ─── T11 · 상품별 매입 그루핑 (supplier-purchase-detail rows 를 product_code 로 aggregate)
export interface ProductPurchaseSummary {
  product_code: string;
  product_name: string;
  totalAmount: number;
  totalQty: number;
  invoiceCount: number;
  latestDate: string;
}
export type ProdSortKey = "product_name" | "product_code" | "totalQty" | "totalAmount" | "invoiceCount" | "latestDate";
