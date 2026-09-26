// 2026-09-25 · #1 · 발주매입 대조 · 그룹핑 타입 · 유틸 (사용자 지시 · v2 재구성)
//   · OrderPurchaseMatchTab.tsx · OrderMatchDetailPanel.tsx · OrderMatchTable.tsx 공유 SSOT
//   · 회귀 방지 · 서버 스키마 (OrderMatchRow) 는 lib/api/orderPurchaseMatchApi.ts 유지

import type { OrderMatchRow, PurchaseMatchLine } from "../../lib/api/orderPurchaseMatchApi";
import type { ExceptionType } from "../../shared/schemas/orderPurchaseMatch";
import { displayVendorName } from "../../utils/vendorNameNormalize";

// ═══════════════════════════════════════════════════════════════
// 필터 · 상태 라벨
// ═══════════════════════════════════════════════════════════════
export type FilterKey = "all" | "pending" | "matched" | "exception";

export const STATUS_TONE: Record<"matched" | "exception" | "unmatched", "emerald" | "amber" | "zinc"> = {
  matched: "emerald",
  exception: "amber",
  unmatched: "zinc",
};
export const STATUS_LABEL: Record<"matched" | "exception" | "unmatched", string> = {
  matched: "확인완료",
  exception: "이상",
  unmatched: "미판정",
};
export const EXCEPTION_LABEL: Record<string, string> = {
  qty_short: "수량 부족",
  qty_over: "수량 초과",
  price_diff: "단가 상이",
  no_purchase: "매입 없음",
};

// ═══════════════════════════════════════════════════════════════
// 포맷 유틸
// ═══════════════════════════════════════════════════════════════
export const fmtWon = (n: number | null | undefined): string =>
  n == null ? "—" : `${Math.round(Number(n)).toLocaleString()}원`;
export const fmtQty = (n: number | null | undefined): string =>
  n == null ? "—" : `${Number(n).toLocaleString()}`;

// ═══════════════════════════════════════════════════════════════
// 상태 계산
// ═══════════════════════════════════════════════════════════════
export function effectiveStatus(r: OrderMatchRow): "matched" | "exception" | "unmatched" {
  if (r.match_status === "matched") return "matched";
  if (r.match_status === "exception") return "exception";
  if (r.match_status === "unmatched") return "unmatched";
  return r.auto_status;
}
export function effectiveExceptionType(r: OrderMatchRow): ExceptionType | null {
  const t = r.exception_type ?? r.auto_exception_type ?? null;
  if (t === "qty_short" || t === "qty_over" || t === "price_diff" || t === "no_purchase") return t;
  return null;
}

/** 발주 정렬 우선순위 · 미판정 → 이상 → 확인 */
function orderPriority(rows: OrderMatchRow[]): number {
  let anyPending = false;
  let anyException = false;
  for (const r of rows) {
    const s = effectiveStatus(r);
    if (!r.match_status && (s === "unmatched" || s === "exception")) anyPending = true;
    if (s === "exception" && r.match_status === "exception") anyException = true;
  }
  if (anyPending) return 0;
  if (anyException) return 1;
  return 2;
}

// ═══════════════════════════════════════════════════════════════
// 그룹 타입
// ═══════════════════════════════════════════════════════════════
export interface OrderGroup {
  orderKey: string;
  orderNumber: string | null;
  supplier: string;
  supplierRaw: string | null;
  sentAt: string | null;
  orderDate: string | null;
  rows: OrderMatchRow[];
  totalOrderQty: number;
  totalOrderAmount: number;
  distinctProducts: number;
  status: "matched" | "exception" | "unmatched" | "mixed";
  pendingCount: number;
  hasUserDecision: boolean;
}

export interface SupplierGroup {
  supplier: string;
  supplierDisplay: string;
  orders: OrderGroup[];
  pendingCount: number;
  totalCount: number;
}

/** 발주 라인 · 공급사·발주번호별 그룹핑 · 정렬 */
export function groupBySupplierAndOrder(rows: OrderMatchRow[]): SupplierGroup[] {
  const byOrder = new Map<string, OrderGroup>();
  for (const r of rows) {
    const supplier = (r.supplier ?? "").trim() || "__NO_SUPPLIER__";
    const orderNumber = r.order_number ?? "";
    const orderKey = `${supplier}::${orderNumber || `__row_${String(r.id)}`}`;
    let g = byOrder.get(orderKey);
    if (!g) {
      g = {
        orderKey,
        orderNumber: orderNumber || null,
        supplier,
        supplierRaw: r.supplier,
        sentAt: r.sent_at,
        orderDate: r.order_date,
        rows: [],
        totalOrderQty: 0,
        totalOrderAmount: 0,
        distinctProducts: 0,
        status: "unmatched",
        pendingCount: 0,
        hasUserDecision: false,
      };
      byOrder.set(orderKey, g);
    }
    g.rows.push(r);
  }
  for (const g of byOrder.values()) {
    const codes = new Set<string>();
    let matched = 0;
    let exception = 0;
    let unmatched = 0;
    let hasUser = false;
    for (const r of g.rows) {
      codes.add(r.product_code);
      g.totalOrderQty += Number(r.order_qty ?? 0);
      g.totalOrderAmount += Number(r.order_qty ?? 0) * Number(r.unit_price ?? 0);
      const s = effectiveStatus(r);
      if (s === "matched") matched++;
      else if (s === "exception") exception++;
      else unmatched++;
      if (r.match_status) hasUser = true;
      if (!r.match_status && (r.auto_status === "unmatched" || r.auto_status === "exception")) {
        g.pendingCount++;
      }
    }
    g.distinctProducts = codes.size;
    g.hasUserDecision = hasUser;
    if (matched > 0 && exception === 0 && unmatched === 0) g.status = "matched";
    else if (exception > 0 && matched === 0 && unmatched === 0) g.status = "exception";
    else if (unmatched > 0 && matched === 0 && exception === 0) g.status = "unmatched";
    else if (matched + exception + unmatched > 0) {
      if (unmatched > 0) g.status = "unmatched";
      else if (exception > 0) g.status = "exception";
      else g.status = "matched";
    }
  }
  const bySupplier = new Map<string, SupplierGroup>();
  for (const g of byOrder.values()) {
    let s = bySupplier.get(g.supplier);
    if (!s) {
      s = {
        supplier: g.supplier,
        supplierDisplay:
          g.supplier === "__NO_SUPPLIER__"
            ? "공급사 미지정"
            : displayVendorName(g.supplierRaw ?? "") || g.supplier,
        orders: [],
        pendingCount: 0,
        totalCount: 0,
      };
      bySupplier.set(g.supplier, s);
    }
    s.orders.push(g);
    s.pendingCount += g.pendingCount;
    s.totalCount += 1;
  }
  for (const s of bySupplier.values()) {
    s.orders.sort((a, b) => {
      const pa = orderPriority(a.rows);
      const pb = orderPriority(b.rows);
      if (pa !== pb) return pa - pb;
      const da = a.sentAt ?? a.orderDate ?? "";
      const db = b.sentAt ?? b.orderDate ?? "";
      return db.localeCompare(da);
    });
  }
  return Array.from(bySupplier.values()).sort((a, b) => {
    if (a.pendingCount !== b.pendingCount) return b.pendingCount - a.pendingCount;
    return a.supplierDisplay.localeCompare(b.supplierDisplay, "ko");
  });
}

// ═══════════════════════════════════════════════════════════════
// 오른쪽 매입 테이블 · 라인·그룹 타입
//   · 왼쪽 발주 선택 시 · 상품코드 순서대로 매입 매칭 · 매입 없음은 placeholder
// ═══════════════════════════════════════════════════════════════
export interface PurchaseTableLine {
  productCode: string;
  productName: string | null;
  orderQty: number;
  orderUnitPrice: number | null;
  match: PurchaseMatchLine | null;
}

export interface PurchaseOrderGroup {
  orderKey: string;
  orderNumber: string | null;
  supplier: string;
  supplierRaw: string | null;
  sentAt: string | null;
  orderDate: string | null;
  lines: PurchaseTableLine[];
  totalPurchaseQty: number;
  totalPurchaseAmount: number;
  matchedCount: number;
  missingCount: number;
}

/**
 * 왼쪽 선택 발주 → 오른쪽 매입 그룹 빌더
 *   · 발주 라인 순서 그대로 (동일 정렬)
 *   · 매입 없는 라인 · match=null placeholder
 *   · 매입 여러 건 · 첫 매치만 표시 (단순 리스트) · 나머지는 확장 매치로 추가 라인
 */
export function buildPurchaseGroup(order: OrderGroup): PurchaseOrderGroup {
  const lines: PurchaseTableLine[] = [];
  let totalQty = 0;
  let totalAmount = 0;
  let matched = 0;
  let missing = 0;
  for (const r of order.rows) {
    const matches = r.purchase_matches ?? [];
    if (matches.length === 0) {
      lines.push({
        productCode: r.product_code,
        productName: r.product_name,
        orderQty: Number(r.order_qty ?? 0),
        orderUnitPrice: r.unit_price,
        match: null,
      });
      missing++;
    } else {
      for (const m of matches) {
        lines.push({
          productCode: r.product_code,
          productName: r.product_name,
          orderQty: Number(r.order_qty ?? 0),
          orderUnitPrice: r.unit_price,
          match: m,
        });
        totalQty += Number(m.quantity ?? 0);
        totalAmount += Number(m.amount ?? 0);
        matched++;
      }
    }
  }
  return {
    orderKey: order.orderKey,
    orderNumber: order.orderNumber,
    supplier: order.supplier,
    supplierRaw: order.supplierRaw,
    sentAt: order.sentAt,
    orderDate: order.orderDate,
    lines,
    totalPurchaseQty: totalQty,
    totalPurchaseAmount: totalAmount,
    matchedCount: matched,
    missingCount: missing,
  };
}
