// src/components/common/PurchaseHistoryList.tsx
// 2026-08-04 · 매입이력 리스트 공통 컴포넌트 (사용자 요청)
//
// 기존 · PurchaseHistoryModal / ProductPurchaseHistoryModal / PurchaseSubTabs LedgerTab /
//   ScanPage PurchaseHistorySection / VendorDetailTabs HistoryContent 등 여러 곳에서
//   각각 다른 스타일로 매입이력 표를 렌더 → 통일된 UX 제공
//
// 스타일 · 통계 > 상품현황 > 상품 매입이력 모달(PurchaseHistoryModal) 기준
//   · thead sticky bg-slate-50 · font-mono 날짜 · font-black 금액 · amber-50 highlight
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
type SortDir = "asc" | "desc";

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
  const [sortKey, setSortKey] = useState<SortKey>(initialSortKey);
  const [sortDir, setSortDir] = useState<SortDir>(initialSortDir);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "date" ? "desc" : "asc"); }
  };
  const arrow = (k: SortKey) => sortKey !== k ? " ⇅" : sortDir === "asc" ? " ▲" : " ▼";

  const sorted = useMemo<PurchaseHistoryRow[]>(() => {
    const sign = sortDir === "asc" ? 1 : -1;
    const arr = [...rows];
    arr.sort((a, b) => {
      switch (sortKey) {
        case "date":          return sign * rowDate(a).localeCompare(rowDate(b));
        case "supplier_name": return sign * String(a.supplier_name ?? "").localeCompare(String(b.supplier_name ?? ""), "ko");
        case "product_name":  return sign * String(a.product_name ?? "").localeCompare(String(b.product_name ?? ""), "ko");
        case "quantity":      return sign * (rowQty(a) - rowQty(b));
        case "unit_price":    return sign * (rowUnit(a) - rowUnit(b));
        case "amount":        return sign * (rowAmount(a) - rowAmount(b));
        default:              return 0;
      }
    });
    return arr;
  }, [rows, sortKey, sortDir]);

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
      <div className="flex items-center justify-center py-8 text-slate-400 text-[12px] gap-2">
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
      <div className="p-8 text-center text-slate-400 text-[12px]">
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
      <table className="w-full text-[12px] min-w-[420px]">
        <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
          <tr className="text-[11px] text-slate-500 uppercase tracking-wider">
            {showRowNumber && (
              <th className="text-left px-2 py-2 w-8 text-slate-300">#</th>
            )}
            <th
              onClick={() => toggleSort("date")}
              className="text-left px-3 py-2 w-24 cursor-pointer select-none hover:bg-slate-100 transition"
            >
              매입일{arrow("date")}
            </th>
            {showGap && (
              <th className="text-right px-2 py-2 w-14" title="이전 매입일과의 일수 차이">간격</th>
            )}
            {showSupplier && (
              <th
                onClick={() => toggleSort("supplier_name")}
                className="text-left px-3 py-2 cursor-pointer select-none hover:bg-slate-100 transition"
              >
                공급사{arrow("supplier_name")}
              </th>
            )}
            {showProduct && (
              <th
                onClick={() => toggleSort("product_name")}
                className="text-left px-3 py-2 cursor-pointer select-none hover:bg-slate-100 transition"
              >
                상품{arrow("product_name")}
              </th>
            )}
            <th
              onClick={() => toggleSort("quantity")}
              className="text-right px-3 py-2 w-16 cursor-pointer select-none hover:bg-slate-100 transition"
            >
              수량{arrow("quantity")}
            </th>
            <th
              onClick={() => toggleSort("unit_price")}
              className="text-right px-3 py-2 w-20 cursor-pointer select-none hover:bg-slate-100 transition"
            >
              단가{arrow("unit_price")}
            </th>
            <th
              onClick={() => toggleSort("amount")}
              className="text-right px-3 py-2 w-24 text-emerald-600 cursor-pointer select-none hover:bg-emerald-50 transition"
            >
              금액{arrow("amount")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
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
                  <td className="px-2 py-1.5 text-slate-300 text-[11px] tabular-nums align-top">{i + 1}</td>
                )}
                <td className="px-3 py-1.5 font-mono text-[12px] font-semibold text-slate-700 align-top whitespace-nowrap">
                  {d || "-"}
                  {isHighlight && <span className="ml-1 text-[10px] text-amber-600 font-black">◀</span>}
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
                    className="px-3 py-1.5 text-slate-700 truncate max-w-[180px] align-top"
                    title={r.supplier_name ?? undefined}
                  >
                    {r.supplier_name ?? "-"}
                  </td>
                )}
                {showProduct && (
                  <td className="px-3 py-1.5 align-top">
                    <div className="text-[12px] font-semibold text-slate-700 break-words whitespace-normal leading-snug">
                      {r.product_name ?? "-"}
                    </div>
                    {r.product_code && (
                      <div className="text-[10px] font-mono text-slate-400 tabular-nums">{r.product_code}</div>
                    )}
                  </td>
                )}
                <td className="text-right px-3 py-1.5 font-mono font-bold text-slate-800 align-top">
                  {rowQty(r) !== 0 ? fmt(rowQty(r)) : "-"}
                </td>
                <td className="text-right px-3 py-1.5 font-mono text-slate-500 align-top">
                  {rowUnit(r) > 0 ? fmt(rowUnit(r)) : "-"}
                </td>
                <td className="text-right px-3 py-1.5 font-mono font-black text-emerald-700 align-top">
                  {rowAmount(r) > 0 ? fmtWon(rowAmount(r)) : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
        {showFooterSum && (
          <tfoot className="sticky bottom-0 bg-white border-t-2 border-slate-200">
            <tr>
              <td colSpan={colCount - 3} className="px-3 py-2 text-right text-[11px] font-black text-slate-500">
                합계
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-mono text-[12px] font-black text-slate-700">
                {fmt(totals.qty)}
              </td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right tabular-nums font-mono text-[13px] font-black text-emerald-700">
                {fmtWon(totals.amt)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
      {footerHint && (
        <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-400 text-center">
          {footerHint}
        </div>
      )}
    </div>
  );
};

export default PurchaseHistoryList;
