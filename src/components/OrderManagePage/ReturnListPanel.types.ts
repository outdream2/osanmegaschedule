// src/components/OrderManagePage/ReturnListPanel.types.ts
// 2026-08-21 · Framework Phase 4 · large-file 분리 · ReturnListPanel 타입 이관

export type ReturnReasonKey = "재고 과다" | "유통기한 임박" | "저조 판매" | "기타";

export interface ReturnLineItem {
  product_code: string;
  product_name: string;
  current_stock: number;
  actual_stock: number | null;
  return_qty: number;
  purchase_price: number;
  memo: string;
  // 스냅샷 · 서버 전송용
  purchase_cycle: number | null;
  sale_qty_month: number | null;
  sale_qty_60d: number | null;
  sale_qty_90d: number | null;
}

// 반품 번호 자동 생성 · REQ-YYYYMMDD-NNN (모달 open 시 1회)
export function buildReturnNumber(): string {
  const now = new Date();
  const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rnd = String(Math.floor(Math.random() * 900) + 100); // 100~999
  return `REQ-${yyyymmdd}-${rnd}`;
}

export function todayStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
