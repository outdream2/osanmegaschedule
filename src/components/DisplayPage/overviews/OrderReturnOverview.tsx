// src/components/DisplayPage/overviews/OrderReturnOverview.tsx
// 2026-10-09 · GLOBAL UI · 발주·반품 Overview · 현황판보드 · 사용자 피드백 전면 반영
//   · 상단 inner tabs · 현황 / 발주필요 / 발주이력 / 발주·매입 대조
//   · 현황 · 컴팩트 pipeline strip (text) + 각 프로세스 현황판보드 (list + chart)
//   · 아이콘 badge 금지 · plain icon only
//   · 폰트 리밸런싱 · 컬러 포인트 (top accent bar · progress bar · 숫자 톤 컬러)
//   · 각 보드 click → modal · modal row click → OrderDetailModal

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  ShoppingCart, Package, ClipboardText, GitDiff, Warning, Clock,
  X, ArrowRight, CaretRight, Gauge, Buildings, Calendar, EnvelopeSimple, ArrowsLeftRight,
  type Icon as IconType,
} from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import { OverviewPageHeader, OverviewToolbar, OverviewTable, StoreStatusBadge, type OverviewTableColumn } from "./StoreOverviewPrimitives";
import { listOrderRequests, type OrderRequestRow } from "../../../lib/orderRequestsApi";
import { api } from "../../../lib/apiClient";
import type { OrderDetailRow } from "./OrderDetailModal";
// 2026-10-09 · 사용자 지시 · 기존 OrderManagePage 기능 그대로 가져옴 (발주매입대조 · 반품)
import OrderPurchaseMatchTab from "../../OrderManagePage/OrderPurchaseMatchTab";
import OrderPurchaseExceptionTab from "../../OrderManagePage/OrderPurchaseExceptionTab";
import ReturnListPanel from "../../OrderManagePage/ReturnListPanel";
import ReturnConfirmedPanel from "../../OrderManagePage/ReturnConfirmedPanel";

export interface OrderReturnOverviewProps { onSelectSubTab: (sub: DpSubTabKey) => void; }

type AnyRow = Record<string, any>;
type SectionKey = "order-request" | "order-need" | "stockout" | "order-history" | "match" | "mismatch" | "return-need" | "return-done";
type InnerTabKey = "overview" | "order-need" | "order-request" | "stockout" | "order-history" | "match" | "return";

// ─── Tone system · plain color accents (no badge · 사용자 지시) ─────────
const TONE: Record<string, { text: string; dot: string; bar: string; soft: string }> = {
  brand:  { text: "text-brand-deep",   dot: "bg-brand-deep",     bar: "bg-brand-deep",     soft: "bg-brand-tint/40" },
  amber:  { text: "text-amber-700",    dot: "bg-amber-500",      bar: "bg-amber-500",      soft: "bg-amber-100/50"  },
  rose:   { text: "text-rose-700",     dot: "bg-rose-500",       bar: "bg-rose-500",       soft: "bg-rose-100/50"   },
  violet: { text: "text-violet-700",   dot: "bg-violet-500",     bar: "bg-violet-500",     soft: "bg-violet-100/50" },
  red:    { text: "text-red-700",      dot: "bg-red-500",        bar: "bg-red-500",        soft: "bg-red-100/50"    },
  slate:  { text: "text-slate-700",    dot: "bg-slate-500",      bar: "bg-slate-500",      soft: "bg-slate-100/60"  },
  emerald:{ text: "text-emerald-700",  dot: "bg-emerald-500",    bar: "bg-emerald-500",    soft: "bg-emerald-100/50"},
};

const SECTION_META: Record<SectionKey, {
  title: string; description: string; icon: IconType;
  tone: keyof typeof TONE;
}> = {
  "order-request": { title: "발주요청대기",     description: "직원이 올린 발주 요청",   icon: ShoppingCart,  tone: "brand"  },
  "order-need":    { title: "발주필요",         description: "적정재고 미달 상품",       icon: Package,       tone: "amber"  },
  "stockout":      { title: "품절임박",         description: "현재고 ≤ 2 상품",          icon: Clock,         tone: "red"    },
  "order-history": { title: "발주이력",         description: "최근 발주 기록",           icon: ClipboardText, tone: "slate"  },
  "match":         { title: "발주·매입 대조",   description: "자동 매칭 결과",           icon: GitDiff,       tone: "violet" },
  "mismatch":      { title: "이상 품목",        description: "수량·금액 불일치",         icon: Warning,       tone: "rose"   },
  "return-need":   { title: "반품필요",         description: "반품 요청 대기",           icon: ArrowsLeftRight, tone: "rose"  },
  "return-done":   { title: "반품확정",         description: "반품 처리 완료",           icon: ArrowsLeftRight, tone: "emerald"  },
};

export const OrderReturnOverview: React.FC<OrderReturnOverviewProps> = ({ onSelectSubTab: _ }) => {
  const [innerTab, setInnerTab] = useState<InnerTabKey>("overview");
  const [orderReqs, setOrderReqs] = useState<OrderRequestRow[] | null>(null);
  const [lowStock, setLowStock] = useState<AnyRow[] | null>(null);
  const [history, setHistory] = useState<AnyRow[] | null>(null);
  const [match, setMatch] = useState<AnyRow | null>(null);
  const [returnsPending, setReturnsPending] = useState<AnyRow[] | null>(null);
  const [returnsDone, setReturnsDone] = useState<AnyRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<"7" | "14" | "30">("14");
  const [orderDetail, setOrderDetail] = useState<OrderDetailRow | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => { let alive = true;
    listOrderRequests().then(r => { if (alive) setOrderReqs(Array.isArray(r) ? r : []); }).catch(() => { if (alive) setOrderReqs([]); });
    return () => { alive = false; };
  }, [refreshKey]);
  useEffect(() => { let alive = true;
    api.get<AnyRow[]>(`/api/stock-manage/low-stock`).then(({ data }) => {
      if (alive) setLowStock(Array.isArray(data) ? data : []);
    }).catch(() => { if (alive) setLowStock([]); });
    return () => { alive = false; };
  }, [refreshKey]);
  useEffect(() => { let alive = true;
    api.get<{ orders?: AnyRow[] }>(`/api/order-history`).then(({ data }) => {
      if (alive) setHistory(Array.isArray(data?.orders) ? data!.orders! : []);
    }).catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, [refreshKey]);
  useEffect(() => { let alive = true;
    api.get<AnyRow>(`/api/order-purchase-match?days=${period}`).then(({ data }) => {
      if (alive) setMatch(data ?? {});
    }).catch(() => { if (alive) setMatch({}); });
    return () => { alive = false; };
  }, [refreshKey, period]);
  useEffect(() => { let alive = true;
    api.get<{ rows?: AnyRow[] } | AnyRow[]>(`/api/return-requests?status=pending&limit=200`)
      .then(({ data }) => { if (alive) setReturnsPending(Array.isArray(data) ? data : (data?.rows ?? [])); })
      .catch(() => { if (alive) setReturnsPending([]); });
    return () => { alive = false; };
  }, [refreshKey]);
  useEffect(() => { let alive = true;
    api.get<{ rows?: AnyRow[] } | AnyRow[]>(`/api/return-requests?status=done&limit=200`)
      .then(({ data }) => { if (alive) setReturnsDone(Array.isArray(data) ? data : (data?.rows ?? [])); })
      .catch(() => { if (alive) setReturnsDone([]); });
    return () => { alive = false; };
  }, [refreshKey]);

  const cutoff = Date.now() - Number(period) * 86400000;
  const q = search.trim().toLowerCase();
  const search_ = (hay: string) => !q || hay.toLowerCase().includes(q);

  const needRows = useMemo(() => (lowStock ?? []).filter(r =>
    search_(`${r.product_name ?? ""} ${r.product_code ?? ""} ${r.supplier ?? ""}`)
  ), [lowStock, q]);
  const stockoutRows = useMemo(() => (lowStock ?? [])
    .filter(r => Number(r.current_stock ?? 0) <= 2)
    .filter(r => search_(`${r.product_name ?? ""} ${r.product_code ?? ""} ${r.supplier ?? ""}`))
  , [lowStock, q]);
  const historyRows = useMemo(() => (history ?? []).filter(h => {
    const d = String(h.order_date ?? h.created_at ?? h.requested_at ?? "");
    const t = d ? new Date(d).getTime() : 0;
    if (t && t < cutoff) return false;
    return search_(`${h.supplier ?? h.supplier_name ?? ""} ${h.order_no ?? h.po_no ?? ""}`);
  }), [history, q, cutoff]);
  const matchRows = useMemo<AnyRow[]>(() => {
    const arr = Array.isArray(match?.matched) ? match!.matched : [];
    return arr.filter((r: AnyRow) => search_(`${r.product_name ?? ""} ${r.supplier ?? ""} ${r.order_number ?? ""}`));
  }, [match, q]);
  const mismatchRows = useMemo<AnyRow[]>(() => {
    const ex = Array.isArray(match?.exceptions) ? match!.exceptions : [];
    const um = Array.isArray(match?.unmatched) ? match!.unmatched : [];
    return [...ex, ...um].filter((r: AnyRow) => search_(`${r.product_name ?? ""} ${r.supplier ?? ""} ${r.order_number ?? ""}`));
  }, [match, q]);
  const orderReqRows = useMemo(() => (orderReqs ?? []).filter(r =>
    search_(`${r.product_name ?? ""} ${r.product_code ?? ""} ${r.supplier ?? ""}`)
  ), [orderReqs, q]);

  const returnNeedRows = useMemo(() => (returnsPending ?? []).filter(r =>
    search_(`${r.product_name ?? ""} ${r.supplier ?? r.supplier_name ?? ""}`)
  ), [returnsPending, q]);
  const returnDoneRows = useMemo(() => (returnsDone ?? []).filter(r =>
    search_(`${r.product_name ?? ""} ${r.supplier ?? r.supplier_name ?? ""}`)
  ), [returnsDone, q]);

  const dataForSection = (k: SectionKey): AnyRow[] => {
    switch (k) {
      case "order-request": return orderReqRows;
      case "order-need":    return needRows;
      case "stockout":      return stockoutRows;
      case "order-history": return historyRows;
      case "match":         return matchRows;
      case "mismatch":      return mismatchRows;
      case "return-need":   return returnNeedRows;
      case "return-done":   return returnDoneRows;
    }
  };
  const countForSection = (k: SectionKey): number | null => {
    switch (k) {
      case "order-request": return orderReqs == null ? null : orderReqRows.length;
      case "order-need":    return lowStock  == null ? null : needRows.length;
      case "stockout":      return lowStock  == null ? null : stockoutRows.length;
      case "order-history": return history   == null ? null : historyRows.length;
      case "match":         return match     == null ? null : matchRows.length;
      case "mismatch":      return match     == null ? null : mismatchRows.length;
      case "return-need":   return returnsPending == null ? null : returnNeedRows.length;
      case "return-done":   return returnsDone   == null ? null : returnDoneRows.length;
    }
  };

  const openOrderDetailFromRow = useCallback((row: AnyRow) => {
    setOrderDetail({
      id: row.id, order_no: row.order_no ?? row.po_no ?? row.order_number,
      requested_at: row.order_date ?? row.requested_at ?? row.created_at,
      supplier: row.supplier, supplier_name: row.supplier_name, supplier_email: row.supplier_email,
      staff_name: row.staff_name, status: row.status, receiving_status: row.receiving_status,
      note: row.note, items: Array.isArray(row.items) ? row.items : undefined,
      product_code: row.product_code, product_name: row.product_name,
      order_qty: row.order_qty, current_stock: row.current_stock,
      total_amount: row.total_amount, reconciliation: row.reconciliation,
    });
  }, []);

  const columnsForSection = (k: SectionKey): OverviewTableColumn[] => {
    switch (k) {
      case "order-request":
      case "order-need":
      case "stockout":
        return [
          { key: "product", label: "상품" },
          { key: "supplier", label: "공급사" },
          { key: "stock", label: "현재고", align: "right" },
          { key: "optimal", label: "적정재고", align: "right" },
          { key: "need", label: "부족", align: "right" },
        ];
      case "order-history":
        return [
          { key: "when", label: "일시" },
          { key: "order_no", label: "발주번호" },
          { key: "supplier", label: "공급사" },
          { key: "items", label: "품목", align: "right" },
          { key: "amount", label: "금액", align: "right" },
          { key: "status", label: "상태", align: "center" },
        ];
      case "match":
      case "mismatch":
        return [
          { key: "when", label: "발주일" },
          { key: "order_no", label: "발주번호" },
          { key: "product", label: "상품" },
          { key: "supplier", label: "공급사" },
          { key: "order_qty", label: "발주량", align: "right" },
          { key: "purchase_qty", label: "매입량", align: "right" },
          { key: "status", label: "상태", align: "center" },
        ];
      case "return-need":
      case "return-done":
        return [
          { key: "product", label: "상품" },
          { key: "supplier", label: "공급사" },
          { key: "reason", label: "사유" },
          { key: "qty", label: "수량", align: "right" },
          { key: "when", label: "일자", align: "center" },
        ];
    }
  };

  const mapRow = (k: SectionKey, r: AnyRow): AnyRow => {
    switch (k) {
      case "order-request":
      case "order-need":
      case "stockout": {
        const stock = Number(r.current_stock ?? 0);
        const opt = Number(r.optimal_stock ?? 0);
        const short = opt - stock;
        return {
          product: (<div className="flex flex-col"><span className="font-semibold text-ink">{r.product_name ?? "-"}</span><span className="text-[15.5px] text-ink-soft tabular-nums">{r.product_code ?? ""}</span></div>),
          supplier: r.supplier ?? "-",
          stock: Number.isFinite(stock) ? <span className={stock <= 0 ? "text-rose-600 font-bold" : ""}>{stock.toLocaleString()}</span> : "-",
          optimal: Number.isFinite(opt) && opt > 0 ? opt.toLocaleString() : "-",
          need: short > 0 ? <span className="font-bold text-brand-deep">{short.toLocaleString()}</span> : "-",
          __onClick: () => openOrderDetailFromRow(r),
        };
      }
      case "order-history":
        return {
          when: String(r.order_date ?? r.created_at ?? r.requested_at ?? "").slice(0, 10) || "-",
          order_no: r.order_no ?? r.po_no ?? "-",
          supplier: r.supplier ?? r.supplier_name ?? "-",
          items: r.item_count ?? r.items_count ?? (Array.isArray(r.items) ? r.items.length : "-"),
          amount: r.total_amount != null ? Number(r.total_amount).toLocaleString() : "-",
          status: r.receiving_status ?? r.status ?? "-",
          __onClick: () => openOrderDetailFromRow(r),
        };
      case "match":
      case "mismatch": {
        const oq = Number(r.order_qty ?? 0);
        const pq = Number(r.purchase_qty ?? 0);
        const diff = pq - oq;
        return {
          when: String(r.order_date ?? r.sent_at ?? "").slice(0, 10) || "-",
          order_no: r.order_number ?? r.order_no ?? "-",
          product: (<div className="flex flex-col"><span className="font-semibold text-ink">{r.product_name ?? "-"}</span><span className="text-[15.5px] text-ink-soft tabular-nums">{r.product_code ?? ""}</span></div>),
          supplier: r.supplier ?? "-",
          order_qty: oq.toLocaleString(),
          purchase_qty: (<span className={diff === 0 ? "" : "text-rose-600 font-bold"}>{pq.toLocaleString()}{diff !== 0 && <span className="ml-1 text-[15.5px]">({diff > 0 ? "+" : ""}{diff})</span>}</span>),
          status: r.match_status ?? r.exception_type ?? r.status ?? "-",
          __onClick: () => openOrderDetailFromRow(r),
        };
      }
      case "return-need":
      case "return-done":
        return {
          product: (<div className="flex flex-col"><span className="font-semibold text-ink">{r.product_name ?? "-"}</span><span className="text-[15.5px] text-ink-soft tabular-nums">{r.product_code ?? ""}</span></div>),
          supplier: r.supplier ?? r.supplier_name ?? "-",
          reason: <span className="text-[15.5px] text-ink-soft truncate">{r.reason ?? "-"}</span>,
          qty: <span className="font-semibold tabular-nums">{r.qty ?? r.quantity ?? "-"}</span>,
          when: <span className="text-[15.5px] tabular-nums text-ink-soft">{String(r.created_at ?? r.requested_at ?? "").slice(5, 10) || "-"}</span>,
          __onClick: () => openOrderDetailFromRow(r),
        };
    }
  };

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  // ═══════════════════════════════════════════════════════════════════
  //  보드 (현황판) · 아이콘 only · chart · list · 폰트 리밸런싱
  // ═══════════════════════════════════════════════════════════════════
  const Board: React.FC<{
    k: SectionKey;
    rowCount?: number;      // mini-table 보여줄 행 수
    tableColumns?: Array<{ key: string; label: string; align?: "left" | "right"; w?: string }>;
    tableRow?: (r: AnyRow) => Record<string, React.ReactNode>;
    totalLabel?: string;    // header description 뒤 appended
  }> = ({ k, rowCount = 5, tableColumns, tableRow, totalLabel }) => {
    const meta = SECTION_META[k];
    const tone = TONE[meta.tone];
    const Icon = meta.icon;
    const count = countForSection(k);
    // ─── 정렬 (사용자 지시 · 모든 리스트 헤더 자동정렬) ───
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
    const sortableField = (col: string): string | null => {
      if (k === "order-request" || k === "order-need" || k === "stockout") {
        if (col === "product") return "product_name";
        if (col === "stock") return "current_stock";
      } else if (k === "order-history") {
        if (col === "when") return "order_date";
        if (col === "supplier") return "supplier";
        if (col === "amount") return "total_amount";
      } else {
        if (col === "product") return "product_name";
        if (col === "variance") return "purchase_qty";
      }
      return null;
    };
    const sortedData = useMemo(() => {
      const base = dataForSection(k);
      if (!sortKey) return base;
      const field = sortableField(sortKey);
      if (!field) return base;
      const sign = sortDir === "asc" ? 1 : -1;
      return [...base].sort((a, b) => {
        const av = a[field]; const bv = b[field];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * sign;
        return String(av).localeCompare(String(bv)) * sign;
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [k, sortKey, sortDir, lowStock, orderReqs, history, match]);
    const preview = sortedData.slice(0, rowCount);
    const toggleSort = (col: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!sortableField(col)) return;
      if (sortKey === col) {
        setSortDir(d => d === "asc" ? "desc" : "asc");
      } else {
        setSortKey(col);
        setSortDir("asc");
      }
    };

    const defaultCols: Array<{ key: string; label: string; align?: "left" | "right"; w?: string }> =
      (k === "order-request" || k === "order-need" || k === "stockout")
        ? [
            { key: "product", label: "상품" },
            { key: "stock",   label: "현재/적정", align: "right", w: "w-[96px]" },
          ]
      : k === "order-history"
        ? [
            { key: "when",     label: "일자" },
            { key: "supplier", label: "공급사" },
            { key: "amount",   label: "금액", align: "right", w: "w-[104px]" },
          ]
      : [
            // 2026-10-09 · 사용자 지시 · 이상품목 리스트 · 공급사·상품명 나란히 (2 column 분리) · info density ↑
            { key: "when",     label: "일자", w: "w-[52px]" },
            { key: "product",  label: "상품" },
            { key: "supplier", label: "공급사", w: "w-[90px]" },
            { key: "variance", label: "발주/매입", align: "right", w: "w-[100px]" },
        ];

    const defaultRow = (r: AnyRow): Record<string, React.ReactNode> => {
      if (k === "order-request" || k === "order-need" || k === "stockout") {
        const stock = Number(r.current_stock ?? 0);
        const opt = Number(r.optimal_stock ?? 0);
        return {
          product: (
            <div className="flex flex-col min-w-0">
              <span className="truncate font-semibold text-ink text-[15.5px]">{r.product_name ?? "-"}</span>
              <span className="truncate text-[15.5px] text-ink-soft">{r.supplier ?? "-"}</span>
            </div>
          ),
          stock: (
            <div className="flex items-baseline justify-end gap-0.5 tabular-nums">
              <span className={`text-[15.5px] font-bold ${stock <= 0 ? "text-rose-600" : stock < opt ? "text-amber-600" : "text-ink"}`}>
                {Number.isFinite(stock) ? stock.toLocaleString() : "-"}
              </span>
              <span className="text-[15.5px] text-ink-soft">/{Number.isFinite(opt) && opt > 0 ? opt.toLocaleString() : "-"}</span>
            </div>
          ),
        };
      }
      if (k === "order-history") {
        return {
          when: <span className="text-[15.5px] tabular-nums text-ink-soft font-medium">{String(r.order_date ?? r.created_at ?? "").slice(5, 10) || "-"}</span>,
          supplier: <span className="truncate text-[15.5px] font-semibold text-ink">{r.supplier ?? r.supplier_name ?? "-"}</span>,
          amount: <span className="text-[15.5px] font-bold text-ink tabular-nums">{r.total_amount != null ? Number(r.total_amount).toLocaleString() : "-"}</span>,
        };
      }
      const oq = Number(r.order_qty ?? 0);
      const pq = Number(r.purchase_qty ?? 0);
      const diff = pq - oq;
      // 2026-10-09 · 사용자 지시 · 공급사·상품명 나란히 (분리된 column) · 세로 늘어짐 방지 · info 많이
      return {
        when: <span className="text-[13.5px] tabular-nums text-ink-soft">{String(r.order_date ?? r.sent_at ?? "").slice(5, 10) || "-"}</span>,
        product: <span className="truncate font-semibold text-ink text-[14px]">{r.product_name ?? "-"}</span>,
        supplier: <span className="truncate text-[13.5px] text-ink-soft">{r.supplier ?? "-"}</span>,
        variance: (
          <div className="flex items-baseline justify-end gap-0.5 tabular-nums">
            <span className="text-[13.5px] text-ink-soft">{oq.toLocaleString()}</span>
            <span className="text-[13.5px] text-ink-soft/60">/</span>
            <span className={`text-[14px] font-bold ${diff === 0 ? "text-ink" : "text-rose-600"}`}>{pq.toLocaleString()}</span>
          </div>
        ),
      };
    };

    const cols = tableColumns ?? defaultCols;
    const rowFn = tableRow ?? defaultRow;

    return (
      <button type="button" onClick={() => navigateToSection(k)}
        className="group relative text-left bg-white border border-slate-200/80 rounded-2xl overflow-hidden flex flex-col flex-1 h-full min-h-[360px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-slate-300 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
      >
        {/* top accent bar · 컬러 포인트 */}
        <div className={`absolute top-0 left-0 right-0 h-[3px] ${tone.bar}`} />

        {/* header · plain icon only (사용자 지시 · 배지 금지) */}
        <header className="flex items-start gap-3 px-5 pt-5 pb-3">
          <Icon size={22} weight="fill" className={`${tone.text} shrink-0 mt-0.5`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[17px] font-extrabold text-ink tracking-tight leading-tight">{meta.title}</span>
              <span className={`text-[21px] font-extrabold tabular-nums tracking-[-0.03em] leading-none ${tone.text}`}>
                {count == null ? "-" : count.toLocaleString()}
              </span>
              <span className="text-[15.5px] font-bold text-ink-soft">건</span>
            </div>
            <div className="text-[15.5px] font-medium text-ink-soft mt-1 truncate">{meta.description}{totalLabel ? ` · ${totalLabel}` : ""}</div>
          </div>
          <ArrowRight size={16} className="text-ink-soft/40 group-hover:text-ink-soft group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
        </header>

        {/* list · 현황판보드 · 5행 보이게 + 스크롤 (사용자 지시) */}
        <div className="flex-1 min-h-0 px-3 pb-3 overflow-y-auto max-h-[220px]"
          onClick={(e) => e.stopPropagation()}
        >
          {preview.length === 0 ? (
            <div className="min-h-[120px] flex items-center justify-center text-[15.5px] italic text-ink-soft/60">
              {count == null ? "불러오는 중..." : "항목 없음"}
            </div>
          ) : (
            <table className="w-full table-fixed">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-slate-100">
                  {cols.map(c => {
                    const canSort = sortableField(c.key) != null;
                    const isActive = sortKey === c.key;
                    return (
                      <th key={c.key}
                        onClick={canSort ? (e) => toggleSort(c.key, e) : undefined}
                        className={`py-1 px-2 text-[12.5px] font-bold text-ink-soft/70 uppercase tracking-wider ${c.align === "right" ? "text-right" : "text-left"} ${c.w ?? ""} ${canSort ? "cursor-pointer select-none hover:text-ink" : ""}`}
                      >
                        <span className="inline-flex items-baseline gap-0.5">
                          {c.label}
                          {canSort && (
                            <span className={`text-[12.5px] ${isActive ? tone.text : "text-ink-soft/40"}`}>
                              {isActive ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                            </span>
                          )}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => {
                  const row = rowFn(r);
                  return (
                    <tr key={i} className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/40 transition-colors">
                      {cols.map(c => (
                        <td key={c.key} className={`py-1 px-2 align-middle ${c.align === "right" ? "text-right" : "text-left"} ${c.w ?? ""}`}>
                          {row[c.key] ?? "-"}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {count != null && count > rowCount && (
          <footer className={`px-5 py-2.5 border-t border-slate-100 text-[15.5px] font-bold ${tone.text} ${tone.soft} flex items-center justify-between`}>
            <span>전체 {count.toLocaleString()}건 보기</span>
            <ArrowRight size={14} />
          </footer>
        )}
      </button>
    );
  };

  // ─── 통합 Inner Tabs + 발주 프로세스 (하나의 bar · 사용자 지시) ────
  // 현황 | --- 프로세스 --- ① 발주필요 → ② 발주요청대기 → ③ 발주이력 → ④ 발주·매입대조 → ⑤ 이상품목 → ⑥ 반품 --- | 품절임박
  type UnifiedTab = { kind: "tab"; k: InnerTabKey; label: string; tone: keyof typeof TONE; step?: number; count?: () => number | null }
                  | { kind: "sep"; label?: string };
  const UNIFIED_TABS: UnifiedTab[] = [
    { kind: "tab", k: "overview",      label: "현황",           tone: "brand" },
    { kind: "tab", k: "order-need",    label: "발주필요",       tone: "amber",  step: 1, count: () => countForSection("order-need") },
    { kind: "tab", k: "order-request", label: "발주요청대기",   tone: "brand",  step: 2, count: () => countForSection("order-request") },
    { kind: "tab", k: "order-history", label: "발주이력",       tone: "slate",  step: 3, count: () => countForSection("order-history") },
    { kind: "tab", k: "match",         label: "발주·매입대조", tone: "violet", step: 4, count: () => countForSection("match") },
    { kind: "tab", k: "match",         label: "발주매입재조정", tone: "rose",   step: 5, count: () => countForSection("mismatch") },
    { kind: "tab", k: "return",        label: "반품",           tone: "emerald", step: 6, count: () => (countForSection("return-need") ?? 0) + (countForSection("return-done") ?? 0) },
    { kind: "tab", k: "stockout",      label: "품절임박",       tone: "red",    count: () => countForSection("stockout") },
  ];

  // ─── Section → InnerTab 매핑 ──────
  const sectionToInnerTab: Record<SectionKey, InnerTabKey> = {
    "order-need":    "order-need",
    "order-request": "order-request",
    "stockout":      "stockout",
    "order-history": "order-history",
    "match":         "match",
    "mismatch":      "match",
    "return-need":   "return",
    "return-done":   "return",
  };
  const navigateToSection = (k: SectionKey) => setInnerTab(sectionToInnerTab[k]);

  return (
    <div className="flex flex-col gap-5 min-h-0 pb-6 bg-[#F4F7FA]">
      <OverviewPageHeader
        title="발주·반품"
        description="적정재고 미달 → 발주요청 → 발주이력 → 발주·매입 대조 → 이상 품목까지 한 화면"
      />

      {/* 통합 탭 · 프로세스 · 깔끔하게 (사용자 지시) */}
      <div className="px-4 sm:px-6">
        <nav className="flex items-end flex-wrap border-b border-slate-200">
          {UNIFIED_TABS.map((t, idx) => {
            if (t.kind === "sep") return null;
            const tone = TONE[t.tone];
            const active = innerTab === t.k;
            const count = t.count ? t.count() : null;
            // 그룹 간격 · 프로세스 그룹 시작/끝에 큰 gap
            const prev = UNIFIED_TABS[idx - 1];
            const next = UNIFIED_TABS[idx + 1];
            const bothProcess = prev && prev.kind === "tab" && prev.step != null && t.step != null;
            const groupStart = t.step === 1;        // 발주필요 (프로세스 시작) · 이전과 간격 넓게
            const groupEnd = t.step != null && (next == null || next.kind !== "tab" || next.step == null); // 반품 (프로세스 끝)
            return (
              <React.Fragment key={`${t.k}-${idx}`}>
                {groupStart && <span className="w-6" aria-hidden />}
                {bothProcess && (
                  <span className="self-center flex items-center pb-2 px-0.5 text-slate-300" aria-hidden>
                    <CaretRight size={14} weight="bold" />
                  </span>
                )}
                <button type="button" onClick={() => setInnerTab(t.k)}
                  className={`relative px-3 h-11 text-[15.5px] font-bold transition-colors cursor-pointer inline-flex items-baseline gap-1 whitespace-nowrap ${
                    active ? "text-ink" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {t.step != null && (
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[12.5px] font-extrabold ${active ? tone.bar + " text-white" : "bg-slate-100 text-ink-soft"} translate-y-[-1px]`}>
                      {t.step}
                    </span>
                  )}
                  <span>{t.label}</span>
                  {count != null && (
                    <span className={`text-[15.5px] font-extrabold tabular-nums ${tone.text}`}>{count.toLocaleString()}</span>
                  )}
                  {active && <span className={`absolute left-0 right-0 -bottom-px h-[2.5px] ${tone.bar} rounded-full`} />}
                </button>
                {groupEnd && <span className="w-6" aria-hidden />}
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      <OverviewToolbar search={search} onSearch={setSearch} placeholder="상품·코드·공급사·발주번호 검색"
        right={
          <>
            <select value={period} onChange={(e) => setPeriod(e.target.value as any)}
              className="h-10 px-3 text-[15.5px] font-semibold text-ink border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-brand-tint cursor-pointer">
              <option value="7">최근 7일</option><option value="14">최근 14일</option><option value="30">최근 30일</option>
            </select>
            <button type="button" onClick={refresh}
              className="h-10 px-3 text-[15.5px] font-semibold text-ink border border-slate-200 rounded-lg bg-white hover:bg-slate-50 cursor-pointer transition-colors">새로고침</button>
          </>
        }
      />

      {innerTab === "overview" && (
        <>
          {/* ═══ 홈 스타일 2-col · LEFT 2fr (main) + RIGHT 1fr (side) · 하단 라인 정렬 ═══ */}
          <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-stretch">
            {/* LEFT · 주요 콘텐츠 세로 스택 · 하단 라인 정렬 (flex-1 + h-full) */}
            <div className="flex flex-col gap-4 h-full">
              <DailyOrderBarChart rows={historyRows} period={Number(period)} />
              {/* 공급사별 발주비중 + 이상품목 (flex-1 로 확장) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch flex-1 min-h-0">
                <SupplierPieChart rows={historyRows} />
                <Board k="mismatch" rowCount={999} />
              </div>
              {/* 발주요청대기 + 발주이력 (flex-1 로 확장) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch flex-1 min-h-0">
                <Board k="order-request" rowCount={999} />
                <Board k="order-history" rowCount={999} />
              </div>
            </div>
            {/* RIGHT · 사이드바 (발주필요 · 반품필요 · 품절임박) · flex-1 로 확장해 LEFT 와 bottom align */}
            <div className="flex flex-col gap-4 h-full">
              <Board k="order-need" rowCount={999} />
              <Board k="return-need" rowCount={999} />
              <Board k="stockout" rowCount={999} />
            </div>
          </div>
        </>
      )}

      {innerTab === "order-need" && (
        <div className="px-4 sm:px-6">
          <FullBoard k="order-need" rows={needRows} count={countForSection("order-need")} columns={columnsForSection("order-need")} mapper={mapRow} />
        </div>
      )}
      {innerTab === "order-history" && (
        <div className="px-4 sm:px-6">
          <FullBoard k="order-history" rows={historyRows} count={countForSection("order-history")} columns={columnsForSection("order-history")} mapper={mapRow} />
        </div>
      )}
      {innerTab === "order-request" && (
        <div className="px-4 sm:px-6">
          <FullBoard k="order-request" rows={orderReqRows} count={countForSection("order-request")} columns={columnsForSection("order-request")} mapper={mapRow} />
        </div>
      )}
      {innerTab === "stockout" && (
        <div className="px-4 sm:px-6">
          <FullBoard k="stockout" rows={stockoutRows} count={countForSection("stockout")} columns={columnsForSection("stockout")} mapper={mapRow} />
        </div>
      )}
      {innerTab === "match" && (
        <div className="px-4 sm:px-6">
          {/* 기존 OrderManagePage 기능 그대로 (사용자 지시) */}
          <OrderPurchaseMatchTab />
          <div className="mt-4">
            <OrderPurchaseExceptionTab />
          </div>
        </div>
      )}
      {innerTab === "return" && (
        <div className="px-4 sm:px-6">
          {/* 반품필요 + 반품확정 좌우 분할 · 기존 기능 그대로 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <section className="relative bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <div className="absolute top-0 left-0 right-0 h-[3px] bg-rose-500" />
              <header className="flex items-center gap-3 px-5 pt-5 pb-3">
                <ArrowsLeftRight size={20} weight="fill" className="text-rose-700" />
                <div>
                  <h3 className="text-[17px] font-extrabold text-ink tracking-tight">반품필요</h3>
                  <p className="text-[15.5px] font-medium text-ink-soft mt-0.5">반품 요청 대기 · 처리</p>
                </div>
              </header>
              <div className="p-2">
                <ReturnListPanel />
              </div>
            </section>
            <section className="relative bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <div className="absolute top-0 left-0 right-0 h-[3px] bg-emerald-500" />
              <header className="flex items-center gap-3 px-5 pt-5 pb-3">
                <ArrowsLeftRight size={20} weight="fill" className="text-emerald-700" />
                <div>
                  <h3 className="text-[17px] font-extrabold text-ink tracking-tight">반품확정</h3>
                  <p className="text-[15.5px] font-medium text-ink-soft mt-0.5">완료된 반품 이력</p>
                </div>
              </header>
              <div className="p-2">
                <ReturnConfirmedPanel />
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ═══ 발주 상세 · Right-side Slide Drawer (2025 트렌드 · Linear/Notion/Attio) ═══ */}
      <OrderDetailDrawer order={orderDetail} onClose={() => setOrderDetail(null)} />
    </div>
  );
};

// ═════ 전체 섹션 보드 (inner tab · 현황 외 · plain icon · full table) ═════
const FullBoard: React.FC<{
  k: SectionKey;
  rows: AnyRow[];
  count: number | null;
  columns: OverviewTableColumn[];
  mapper: (k: SectionKey, r: AnyRow) => AnyRow;
}> = ({ k, rows, count, columns, mapper }) => {
  const meta = SECTION_META[k];
  const tone = TONE[meta.tone];
  const Icon = meta.icon;
  return (
    <section className="relative bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className={`absolute top-0 left-0 right-0 h-[3px] ${tone.bar}`} />
      <header className="flex items-center gap-3 px-5 pt-5 pb-4">
        <Icon size={22} weight="fill" className={`${tone.text} shrink-0 mt-1`} />
        <div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-[17px] font-extrabold text-ink tracking-tight">{meta.title}</h3>
            <span className={`text-[20px] font-extrabold tabular-nums leading-none tracking-[-0.03em] ${tone.text}`}>
              {count == null ? "-" : count.toLocaleString()}
            </span>
            <span className="text-[15.5px] font-bold text-ink-soft">건</span>
          </div>
          <p className="text-[15.5px] font-medium text-ink-soft mt-1">{meta.description} · row 클릭 · 상세</p>
        </div>
      </header>
      <div className="px-2 pb-2">
        <OverviewTable
          columns={columns}
          rows={rows.map(r => mapper(k, r))}
          emptyMessage={count == null ? "불러오는 중..." : "항목이 없습니다"}
        />
      </div>
    </section>
  );
};

// ═════════════════════════════════════════════════════════════════
//  OrderDetailInlinePanel · 모달 대신 아래 영역에 상세 표시
// ═════════════════════════════════════════════════════════════════
const fmtNum = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) ? "-" : Number(n).toLocaleString();

const statusTone = (s: string | null | undefined): "neutral" | "brand" | "emerald" | "amber" | "rose" => {
  const k = (s ?? "").toLowerCase();
  if (k.includes("complete") || k.includes("완료") || k.includes("done")) return "emerald";
  if (k.includes("partial") || k.includes("부분")) return "amber";
  if (k.includes("cancel") || k.includes("취소") || k.includes("미입고")) return "rose";
  if (k.includes("pending") || k.includes("요청") || k.includes("대기")) return "brand";
  return "neutral";
};

const buildMailto = (o: OrderDetailRow): string | null => {
  const email = o.supplier_email;
  if (!email) return null;
  const supplier = o.supplier_name ?? o.supplier ?? "";
  const orderNo = o.order_no ?? o.po_no ?? "";
  const orderDate = (o.requested_at ?? o.created_at ?? "").slice(0, 10);
  const subject = `[발주·매입 대조 확인 요청] ${supplier} / ${orderNo}`;
  const body = ["안녕하세요.", "", "아래 발주 건의 확인이 필요합니다.", "", `발주번호: ${orderNo || "-"}`, `공급사: ${supplier || "-"}`, `발주일: ${orderDate || "-"}`, "", "확인 부탁드립니다."].join("\n");
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

// ─── Right-side Slide Drawer (2025 트렌드 · Linear/Notion/Attio) ────────
// · 공간 처리 최소 · 다른 콘텐츠 가리지 않음 · ESC 또는 백드롭 클릭으로 닫기
// · 480px 폭 · body overflow lock · 부드러운 slide-in transition
const OrderDetailDrawer: React.FC<{ order: OrderDetailRow | null; onClose: () => void }> = ({ order, onClose }) => {
  // ESC 키 handler
  useEffect(() => {
    if (!order) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [order, onClose]);

  return (
    <>
      {/* backdrop · 반투명 · fade in */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] z-40 transition-opacity duration-200 ${order ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        aria-hidden
      />
      {/* drawer · 우측 slide */}
      <aside
        role="dialog" aria-modal="true"
        className={`fixed top-0 right-0 h-dvh w-full sm:max-w-[520px] bg-white shadow-[-16px_0_48px_-16px_rgba(15,23,42,0.18)] z-50 flex flex-col transition-transform duration-250 ease-out ${order ? "translate-x-0" : "translate-x-full"}`}
      >
        {order && <OrderDetailDrawerBody order={order} onClose={onClose} />}
      </aside>
    </>
  );
};

const OrderDetailDrawerBody: React.FC<{ order: OrderDetailRow; onClose: () => void }> = ({ order, onClose }) => {
  const supplier = order.supplier_name ?? order.supplier ?? "-";
  const orderNo = order.order_no ?? order.po_no ?? String(order.id ?? "-");
  const orderDate = (order.requested_at ?? order.created_at ?? "").slice(0, 16).replace("T", " ") || "-";
  const staff = order.staff_name ?? "-";
  const status = order.receiving_status ?? order.status ?? "-";
  const items = Array.isArray(order.items) && order.items.length > 0
    ? order.items
    : (order.product_code || order.product_name)
      ? [{ product_code: order.product_code, product_name: order.product_name, order_qty: order.order_qty, received_qty: null, unit_price: null, amount: null }]
      : [];
  const mailto = buildMailto(order);

  return (
    <section className="relative bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-[0_4px_16px_rgba(15,23,42,0.08)] ring-2 ring-brand-deep/15">
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-brand-deep" />
      <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <Package size={22} weight="fill" className="text-brand-deep shrink-0 mt-0.5" />
          <div>
            <h3 className="text-[17px] font-extrabold text-ink tracking-tight leading-tight">발주·매입 상세</h3>
            <p className="text-[15.5px] font-medium text-ink-soft mt-1">row 클릭 상세 정보</p>
          </div>
        </div>
        <button type="button" onClick={onClose}
          className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-[15.5px] font-semibold text-ink-soft hover:bg-slate-100 transition-colors cursor-pointer">
          <X size={14} /> 닫기
        </button>
      </header>
      <div className="p-5 space-y-4">
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-x-4 gap-y-3 text-[15.5px]">
          <div>
            <div className="text-[15.5px] text-ink-soft font-medium">발주번호</div>
            <div className="font-semibold text-ink tabular-nums mt-0.5">{orderNo}</div>
          </div>
          <div>
            <div className="text-[15.5px] text-ink-soft font-medium">공급사</div>
            <div className="font-semibold text-ink mt-0.5 flex items-center gap-1"><Buildings size={13} />{supplier}</div>
          </div>
          <div>
            <div className="text-[15.5px] text-ink-soft font-medium">요청일시</div>
            <div className="font-semibold text-ink tabular-nums mt-0.5 flex items-center gap-1"><Calendar size={13} />{orderDate}</div>
          </div>
          <div>
            <div className="text-[15.5px] text-ink-soft font-medium">담당자</div>
            <div className="font-semibold text-ink mt-0.5">{staff}</div>
          </div>
          <div>
            <div className="text-[15.5px] text-ink-soft font-medium">입고상태</div>
            <div className="mt-0.5"><StoreStatusBadge status={status} tone={statusTone(status)} /></div>
          </div>
        </section>
        <section className="border border-slate-200 rounded-xl overflow-hidden">
          <header className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <h4 className="text-[15.5px] font-semibold text-ink">발주 상품 목록</h4>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-[15.5px]">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2.5 px-3 text-left text-[15.5px] font-semibold text-ink-soft">상품코드</th>
                  <th className="py-2.5 px-3 text-left text-[15.5px] font-semibold text-ink-soft">상품명</th>
                  <th className="py-2.5 px-3 text-right text-[15.5px] font-semibold text-ink-soft">주문수량</th>
                  <th className="py-2.5 px-3 text-right text-[15.5px] font-semibold text-ink-soft">입고수량</th>
                  <th className="py-2.5 px-3 text-right text-[15.5px] font-semibold text-ink-soft">단가</th>
                  <th className="py-2.5 px-3 text-right text-[15.5px] font-semibold text-ink-soft">금액</th>
                  <th className="py-2.5 px-3 text-center text-[15.5px] font-semibold text-ink-soft">상태</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-[15.5px] text-ink-soft/70">상품 정보가 없습니다</td></tr>
                ) : items.map((it, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="py-2.5 px-3 text-ink tabular-nums">{it.product_code ?? "-"}</td>
                    <td className="py-2.5 px-3 text-ink">{it.product_name ?? "-"}</td>
                    <td className="py-2.5 px-3 text-right text-ink tabular-nums">{fmtNum(it.order_qty)}</td>
                    <td className="py-2.5 px-3 text-right text-ink tabular-nums">{fmtNum(it.received_qty)}</td>
                    <td className="py-2.5 px-3 text-right text-ink tabular-nums">{fmtNum(it.unit_price)}</td>
                    <td className="py-2.5 px-3 text-right text-ink tabular-nums font-semibold">{fmtNum(it.amount)}</td>
                    <td className="py-2.5 px-3 text-center">{it.status ? <StoreStatusBadge status={it.status} tone={statusTone(it.status)} /> : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {order.reconciliation && (
          <section className="border border-slate-200 rounded-xl p-4">
            <h4 className="text-[15.5px] font-semibold text-ink mb-3">발주·매입 대조 요약</h4>
            <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-[15.5px]">
              <div><span className="text-ink-soft">발주금액</span> <span className="font-semibold text-ink tabular-nums ml-1">{fmtNum(order.reconciliation.order_amount)}</span></div>
              <div><span className="text-ink-soft">매입금액</span> <span className="font-semibold text-ink tabular-nums ml-1">{fmtNum(order.reconciliation.purchase_amount)}</span></div>
              <div><span className="text-ink-soft">금액차이</span> <span className="font-semibold text-rose-600 tabular-nums ml-1">{fmtNum(order.reconciliation.diff)}</span></div>
            </div>
          </section>
        )}
        {order.note && (
          <section className="border border-slate-200 rounded-xl p-4 text-[15.5px]">
            <div className="text-[15.5px] font-semibold text-ink-soft mb-1">비고</div>
            <div className="text-ink whitespace-pre-wrap">{order.note}</div>
          </section>
        )}
      </div>
      {mailto && (
        <footer className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end">
          <a href={mailto}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-[15.5px] font-semibold bg-brand-deep text-white hover:bg-[#0d3a5c] transition-colors cursor-pointer">
            <EnvelopeSimple size={14} weight="fill" /> 담당자 이메일
          </a>
        </footer>
      )}
    </section>
  );
};

// ═════════════════════════════════════════════════════════════════
//  차트 (SVG · 외부 라이브러리 X · 폰트 리밸런싱 · 컬러 포인트)
// ═════════════════════════════════════════════════════════════════

const DailyOrderBarChart: React.FC<{ rows: AnyRow[]; period: number }> = ({ rows, period }) => {
  // 일별 발주금액 집계
  const daily = useMemo(() => {
    const map = new Map<string, number>();
    const now = new Date();
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      map.set(key, 0);
    }
    for (const r of rows) {
      const d = String(r.order_date ?? r.created_at ?? "").slice(0, 10);
      if (!d || !map.has(d)) continue;
      map.set(d, (map.get(d) ?? 0) + Number(r.total_amount ?? 0));
    }
    return Array.from(map.entries()).map(([date, amt]) => ({ date, amt }));
  }, [rows, period]);

  const maxAmt = Math.max(1, ...daily.map(d => d.amt));
  const totalAmt = daily.reduce((s, d) => s + d.amt, 0);
  const avgAmt = daily.length > 0 ? Math.round(totalAmt / daily.length) : 0;

  return (
    <section className="relative bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-brand-deep" />
      <header className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
        <div>
          <h3 className="text-[17px] font-extrabold text-ink tracking-tight">일별 발주금액</h3>
          <p className="text-[15.5px] font-medium text-ink-soft mt-0.5">최근 {period}일 · 총 {totalAmt.toLocaleString()}원 · 일평균 {avgAmt.toLocaleString()}원</p>
        </div>
      </header>
      <div className="px-5 pb-5">
        <div className="flex items-end gap-1 h-[160px] border-b border-slate-200 pt-2">
          {daily.map((d, i) => {
            const h = maxAmt > 0 ? Math.round((d.amt / maxAmt) * 100) : 0;
            return (
              <div key={d.date} className="flex-1 flex flex-col justify-end items-center group min-w-0" title={`${d.date} · ${d.amt.toLocaleString()}원`}>
                <div className={`w-full rounded-t ${d.amt > 0 ? "bg-brand-deep/80 group-hover:bg-brand-deep" : "bg-slate-100"} transition-colors`}
                  style={{ height: `${Math.max(h, 2)}%` }} />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-2 text-[15.5px] font-medium text-ink-soft/70 tabular-nums">
          <span>{daily[0]?.date.slice(5) ?? ""}</span>
          <span>{daily[Math.floor(daily.length / 2)]?.date.slice(5) ?? ""}</span>
          <span>{daily[daily.length - 1]?.date.slice(5) ?? ""}</span>
        </div>
      </div>
    </section>
  );
};

const PIE_PALETTE = ["#0A4F44", "#F59E0B", "#8B5CF6", "#EF4444", "#06B6D4", "#64748B"] as const;

const SupplierPieChart: React.FC<{ rows: AnyRow[] }> = ({ rows }) => {
  // 공급사별 발주금액 집계 → Top 5 + 기타
  const slices = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const s = String(r.supplier ?? r.supplier_name ?? "미지정").trim() || "미지정";
      map.set(s, (map.get(s) ?? 0) + Number(r.total_amount ?? 0));
    }
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 5);
    const other = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
    const result = top.map(([name, value]) => ({ name, value }));
    if (other > 0) result.push({ name: "기타", value: other });
    return result;
  }, [rows]);

  const total = slices.reduce((s, x) => s + x.value, 0);
  // SVG donut
  const SIZE = 160;
  const RADIUS = 68;
  const STROKE = 24;
  const CENTER = SIZE / 2;
  const CIRC = 2 * Math.PI * RADIUS;

  let accum = 0;
  const arcs = slices.map((s, i) => {
    const frac = total > 0 ? s.value / total : 0;
    const dash = CIRC * frac;
    const offset = CIRC * (1 - accum);
    accum += frac;
    return { s, color: PIE_PALETTE[i % PIE_PALETTE.length], dash, offset };
  });

  return (
    <section className="relative bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex flex-col h-full min-h-[360px]">
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-violet-500" />
      <header className="px-5 pt-5 pb-3">
        <h3 className="text-[17px] font-extrabold text-ink tracking-tight">공급사별 발주 비중</h3>
        <p className="text-[15.5px] font-medium text-ink-soft mt-0.5">총 {total.toLocaleString()}원 · Top 5 + 기타</p>
      </header>
      <div className="px-5 pb-5 flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          {total > 0 ? (
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="#F1F5F9" strokeWidth={STROKE} />
              <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
                {arcs.map((a, i) => (
                  <circle key={i} cx={CENTER} cy={CENTER} r={RADIUS} fill="none"
                    stroke={a.color} strokeWidth={STROKE}
                    strokeDasharray={`${a.dash} ${CIRC - a.dash}`} strokeDashoffset={a.offset}
                    style={{ transition: "stroke-dashoffset 400ms, stroke-dasharray 400ms" }} />
                ))}
              </g>
              <text x={CENTER} y={CENTER - 4} textAnchor="middle" className="fill-ink font-extrabold" style={{ fontSize: 14 }}>총 공급사</text>
              <text x={CENTER} y={CENTER + 14} textAnchor="middle" className="fill-ink font-extrabold tabular-nums" style={{ fontSize: 18 }}>{slices.length}</text>
            </svg>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[15.5px] italic text-ink-soft/60 border border-dashed border-slate-200 rounded-full">
              데이터 없음
            </div>
          )}
        </div>
        <ul className="flex-1 min-w-0 flex flex-col gap-1.5 text-[15.5px]">
          {slices.length === 0 ? (
            <li className="italic text-ink-soft/60">공급사별 데이터가 없습니다</li>
          ) : slices.map((s, i) => {
            const pct = total > 0 ? ((s.value / total) * 100).toFixed(1) : "0";
            return (
              <li key={s.name} className="flex items-center gap-2 min-w-0">
                <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: PIE_PALETTE[i % PIE_PALETTE.length] }} />
                <span className="truncate font-semibold text-ink">{s.name}</span>
                <span className="ml-auto font-bold text-ink-soft tabular-nums shrink-0">{pct}%</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

export default OrderReturnOverview;
