// src/components/common/PurchaseHistoryList.tsx
// 2026-08-04 · 매입이력 리스트 공통 컴포넌트 (사용자 요청)
//
// 기존 · PurchaseHistoryModal / ProductPurchaseHistoryModal / PurchaseSubTabs LedgerTab /
//   ScanPage PurchaseHistorySection / VendorDetailTabs HistoryContent 등 여러 곳에서
//   각각 다른 스타일로 매입이력 표를 렌더 → 통일된 UX 제공
//
// 스타일 · 통계 > 상품현황 > 상품 매입이력 모달(PurchaseHistoryModal) 기준
//   · thead sticky bg-zinc-50 · font-mono 날짜 · font-bold 금액 · amber-50 highlight
//   · 12px 본문 (B-2-2) · 배지 지양 · 텍스트 우선 (B-4)
//   · 헤더 자동 정렬 (A-2) · 화살표 ▲/▼
//
// props · 유연 · 필드는 optional · 있는 것만 컬럼 표시
//   rows           · PurchaseRow[]  · required
//   loading?       · boolean        · 로딩 스피너
//   error?         · string | null  · 에러 메시지
//   highlightDate? · YYYY-MM-DD     · 특정 매입일 강조 (amber-50)
//   highlightId?   · row.id 매칭    · 특정 row 강조 + 스크롤
//   showSupplier?  · 공급사 컬럼 표시 (default true · 단일 공급사 뷰에서 false)
//   showProduct?   · 상품 컬럼 표시 (default false · 단일 상품 뷰에서는 불필요)
//   showGap?       · 매입 간격 컬럼 표시 (default false)
//   showFooterSum? · 하단 합계 tfoot 표시 (default false)
//   maxHeight?     · 스크롤 max-h (default "50vh" · undefined 는 flex-1)
//   compact?       · 좀 더 촘촘한 padding (default false)
//   minRows?       · limit 없이 전부 보이기 (default 999999)

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useColumnResize, RESIZER_CLS } from "../../hooks/useColumnResize";
import { useSortableTable, type Comparator, type SortDir } from "../../hooks/useSortableTable";

export interface PurchaseHistoryRow {
  id?: string | number;
  /** ISO date (YYYY-MM-DD) 또는 그 부분 문자열 */
  purchase_date?: string | null;
  /** 대체 필드 · VendorDetailTabs · PurchaseSubTabs 는 date/invoice_date 사용 */
  date?: string | null;
  invoice_date?: string | null;
  supplier_name?: string | null;
  product_name?: string | null;
  product_code?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  amount?: number | null;
  /** VAT 포함 총액 · total 이 있으면 amount 대신 우선 사용 */
  total?: number | null;
}

interface PurchaseHistoryListProps {
  rows: PurchaseHistoryRow[];
  loading?: boolean;
  error?: string | null;

  highlightDate?: string;
  highlightId?: string | number | null;

  showSupplier?: boolean;
  showProduct?: boolean;
  showGap?: boolean;
  showFooterSum?: boolean;
  showRowNumber?: boolean;

  /** table max-height · CSS 값 · e.g. "50vh" · 미지정 시 컨테이너 flex-1 */
  maxHeight?: string;

  /** default initial sort · date desc */
  initialSortKey?: SortKey;
  initialSortDir?: SortDir;

  emptyText?: string;
  /** 하단 안내 문구 */
  footerHint?: React.ReactNode;
}

type SortKey = "date" | "supplier_name" | "product_name" | "quantity" | "unit_price" | "amount";

// ─── Helpers ──────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return "0";
  return n.toLocaleString("ko-KR");
};

const fmtWon = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return "0";
  if (n >= 1_0000_0000) return `${(n / 1_0000_0000).toFixed(1)}억`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  return n.toLocaleString("ko-KR");
};

const rowDate = (r: PurchaseHistoryRow): string => {
  return String(r.purchase_date ?? r.date ?? r.invoice_date ?? "").slice(0, 10);
};

const rowAmount = (r: PurchaseHistoryRow): number => {
  return Number(r.total ?? r.amount ?? 0) || 0;
};

const rowQty = (r: PurchaseHistoryRow): number => {
  return Number(r.quantity ?? 0) || 0;
};

const rowUnit = (r: PurchaseHistoryRow): number => {
  return Number(r.unit_price ?? 0) || 0;
};

// ─── 정렬 비교 함수 (컴포넌트 외부 · 안정 참조) ───────────────────────────
const PURCHASE_SORT_CMP: Record<SortKey, Comparator<PurchaseHistoryRow>> = {
  date:          (a, b) => rowDate(a).localeCompare(rowDate(b)),
  supplier_name: (a, b) => String(a.supplier_name ?? "").localeCompare(String(b.supplier_name ?? ""), "ko"),
  product_name:  (a, b) => String(a.product_name  ?? "").localeCompare(String(b.product_name  ?? ""), "ko"),
  quantity:      (a, b) => rowQty(a)    - rowQty(b),
  unit_price:    (a, b) => rowUnit(a)   - rowUnit(b),
  amount:        (a, b) => rowAmount(a) - rowAmount(b),
};

// ─── Component ────────────────────────────────────────────────────────────

export const PurchaseHistoryList: React.FC<PurchaseHistoryListProps> = ({
  rows,
  loading = false,
  error = null,
  highlightDate,
  highlightId = null,
  showSupplier = true,
  showProduct = false,
  showGap = false,
  showFooterSum = false,
  showRowNumber = false,
  maxHeight,
  initialSortKey = "date",
  initialSortDir = "desc",
  emptyText = "매입 이력 없음",
  footerHint,
}) => {
  // ── 정렬 (T30-followup · useSortableTable)
  const { sorted, sortKey, sortDir, toggleSort: _toggleSort, setSort: _setSort } =
    useSortableTable<PurchaseHistoryRow, SortKey>(rows, initialSortKey, PURCHASE_SORT_CMP, initialSortDir);
  // 새 컬럼: "date" → desc · 나머지 → asc (원본 동작 유지)
  const toggleSort = (k: SortKey) => {
    if (sortKey === k) _toggleSort(k);
    else _setSort(k, k === "date" ? "desc" : "asc");
  };
  const arrow = (k: SortKey) => sortKey !== k ? " ⇅" : sortDir === "asc" ? " ▲" : " ▼";
  const { getWidth, resizerProps } = useColumnResize("purchaseHistoryList", {
    num:      { default: 32,  min: 28, max: 60  },
    date:     { default: 96,  min: 60, max: 160 },
    gap:      { default: 56,  min: 40, max: 100 },
    supplier: { default: 140, min: 80, max: 280 },
    product:  { default: 160, min: 80, max: 320 },
    qty:      { default: 64,  min: 48, max: 100 },
    unit:     { default: 80,  min: 56, max: 140 },
    amount:   { default: 96,  min: 64, max: 160 },
  });

  // 매입 간격 계산 (desc 정렬 기준: 다음 row = 이전 매입)
  const gapByIndex = useMemo<Array<number | null>>(() => {
    if (!showGap) return [];
    return sorted.map((r, i, arr) => {
      const nextR = arr[i + 1];
      const curT = rowDate(r) ? new Date(rowDate(r)).getTime() : NaN;
      const nextT = nextR ? new Date(rowDate(nextR)).getTime() : NaN;
      if (!Number.isFinite(curT) || !Number.isFinite(nextT) || curT <= nextT) return null;
      return Math.round((curT - nextT) / (86400 * 1000));
    });
  }, [sorted, showGap]);

  // 합계
  const totals = useMemo(() => {
    let qty = 0;
    let amt = 0;
    for (const r of rows) {
      qty += rowQty(r);
      amt += rowAmount(r);
    }
    return { qty, amt };
  }, [rows]);

  // highlight row 스크롤
  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (highlightId == null) return;
    const t = window.setTimeout(() => {
      if (highlightRowRef.current) {
        try { highlightRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" }); }
        catch { highlightRowRef.current.scrollIntoView(); }
      }
    }, 30);
    return () => window.clearTimeout(t);
  }, [highlightId, sorted]);

  // 컬럼 개수 (colspan 계산용)
  const colCount = 3 // 매입일 + 수량 + 금액 (필수)
    + (showRowNumber ? 1 : 0)
    + (showSupplier ? 1 : 0)
    + (showProduct ? 1 : 0)
    + (showGap ? 1 : 0)
    + 1; // 단가 (항상 표시)

  // ─── Render ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-zinc-400 text-[12px] gap-2">
        <Loader2 size={14} className="animate-spin" />
        <span>매입 이력 로딩 중...</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4 text-center text-rose-600 text-[12px] font-semibold">
        에러: {error}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="p-8 text-center text-zinc-400 text-[12px]">
        {emptyText}
      </div>
    );
  }

  const containerStyle: React.CSSProperties = maxHeight ? { maxHeight } : {};

  return (
    <div
      className={`overflow-auto ${maxHeight ? "" : "flex-1 min-h-0"} bg-white`}
      style={containerStyle}
    >
      <table className="w-full text-[12px] min-w-[420px]" style={{ tableLayout: "fixed" }}>
        <thead className="sticky top-0 bg-zinc-50 border-b border-line z-10">
          <tr className="text-[11px] text-zinc-500 uppercase tracking-wider">
            {showRowNumber && (
              <th className="relative text-left px-2 py-2 text-zinc-300" style={{ width: getWidth("num"), minWidth: getWidth("num") }}>
                #
                <span {...resizerProps("num")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
              </th>
            )}
            <th
              onClick={() => toggleSort("date")}
              className="relative text-left px-3 py-2 cursor-pointer select-none hover:bg-zinc-100 transition"
              style={{ width: getWidth("date"), minWidth: getWidth("date") }}
            >
              매입일{arrow("date")}
              <span {...resizerProps("date")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
            {showGap && (
              <th className="relative text-right px-2 py-2" title="이전 매입일과의 일수 차이" style={{ width: getWidth("gap"), minWidth: getWidth("gap") }}>
                간격
                <span {...resizerProps("gap")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
              </th>
            )}
            {showSupplier && (
              <th
                onClick={() => toggleSort("supplier_name")}
                className="relative text-left px-3 py-2 cursor-pointer select-none hover:bg-zinc-100 transition"
                style={{ width: getWidth("supplier"), minWidth: getWidth("supplier") }}
              >
                공급사{arrow("supplier_name")}
                <span {...resizerProps("supplier")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
              </th>
            )}
            {showProduct && (
              <th
                onClick={() => toggleSort("product_name")}
                className="relative text-left px-3 py-2 cursor-pointer select-none hover:bg-zinc-100 transition"
                style={{ width: getWidth("product"), minWidth: getWidth("product") }}
              >
                상품{arrow("product_name")}
                <span {...resizerProps("product")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
              </th>
            )}
            <th
              onClick={() => toggleSort("quantity")}
              className="relative text-right px-3 py-2 cursor-pointer select-none hover:bg-zinc-100 transition"
              style={{ width: getWidth("qty"), minWidth: getWidth("qty") }}
            >
              수량{arrow("quantity")}
              <span {...resizerProps("qty")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
            <th
              onClick={() => toggleSort("unit_price")}
              className="relative text-right px-3 py-2 cursor-pointer select-none hover:bg-zinc-100 transition"
              style={{ width: getWidth("unit"), minWidth: getWidth("unit") }}
            >
              단가{arrow("unit_price")}
              <span {...resizerProps("unit")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
            <th
              onClick={() => toggleSort("amount")}
              className="relative text-right px-3 py-2 text-emerald-600 cursor-pointer select-none hover:bg-emerald-50 transition"
              style={{ width: getWidth("amount"), minWidth: getWidth("amount") }}
            >
              금액{arrow("amount")}
              <span {...resizerProps("amount")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {sorted.map((r, i) => {
            const d = rowDate(r);
            const isHighlightDate = !!highlightDate && d.startsWith(highlightDate);
            const isHighlightId = highlightId != null && r.id != null && String(r.id) === String(highlightId);
            const isHighlight = isHighlightDate || isHighlightId;
            const gap = showGap ? gapByIndex[i] : null;
            return (
              <tr
                key={r.id != null ? `ph-${r.id}-${i}` : `ph-${i}`}
                ref={isHighlightId ? highlightRowRef : undefined}
                className={`transition-all duration-100 ${
                  isHighlight ? "bg-amber-50" : "hover:bg-emerald-50/40"
                }`}
              >
                {showRowNumber && (
                  <td className="px-2 py-1.5 text-zinc-300 text-[11px] tabular-nums align-top">{i + 1}</td>
                )}
                <td className="px-3 py-1.5 font-mono text-[12px] font-semibold text-zinc-700 align-top whitespace-nowrap">
                  {d || "-"}
                  {isHighlight && <span className="ml-1 text-[10px] text-amber-600 font-bold">◀</span>}
                </td>
                {showGap && (
                  <td
                    className="text-right px-2 py-1.5 tabular-nums font-mono text-[11px] text-sky-600 align-top"
                    title={gap != null ? `${gap}일 만에 재매입` : "이전 매입 없음"}
                  >
                    {gap != null ? `${gap}일` : "-"}
                  </td>
                )}
                {showSupplier && (
                  <td
                    className="px-3 py-1.5 text-zinc-700 truncate max-w-[180px] align-top"
                    title={r.supplier_name ?? undefined}
                  >
                    {r.supplier_name ?? "-"}
                  </td>
                )}
                {showProduct && (
                  <td className="px-3 py-1.5 align-top">
                    <div className="text-[12px] font-semibold text-zinc-700 break-words whitespace-normal leading-snug">
                      {r.product_name ?? "-"}
                    </div>
                    {r.product_code && (
                      <div className="text-[10px] font-mono text-zinc-400 tabular-nums">{r.product_code}</div>
                    )}
                  </td>
                )}
                <td className="text-right px-3 py-1.5 font-mono font-bold text-zinc-800 align-top">
                  {rowQty(r) !== 0 ? fmt(rowQty(r)) : "-"}
                </td>
                <td className="text-right px-3 py-1.5 font-mono text-zinc-500 align-top">
                  {rowUnit(r) > 0 ? fmt(rowUnit(r)) : "-"}
                </td>
                <td className="text-right px-3 py-1.5 font-mono font-bold text-emerald-700 align-top">
                  {rowAmount(r) > 0 ? fmtWon(rowAmount(r)) : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
        {showFooterSum && (
          <tfoot className="sticky bottom-0 bg-white border-t-2 border-line">
            <tr>
              <td colSpan={colCount - 3} className="px-3 py-2 text-right text-[11px] font-bold text-zinc-500">
                합계
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-mono text-[12px] font-bold text-zinc-700">
                {fmt(totals.qty)}
              </td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right tabular-nums font-mono text-[13px] font-bold text-emerald-700">
                {fmtWon(totals.amt)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
      {footerHint && (
        <div className="px-3 py-2 border-t border-zinc-100 bg-zinc-50/60 text-[11px] text-zinc-400 text-center">
          {footerHint}
        </div>
      )}
    </div>
  );
};

export default PurchaseHistoryList;
