// 2026-08-22 · Framework Phase 4 · FlowTab row rendering 이관
// FlowRow · 상품현황리스트 한 행 (재고·매입·판매 3그룹 · 접힘 처리 · 컬러 톤)

import React from "react";
import { CheckSquare, Square } from "lucide-react";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { fmtWonCompact } from "../../lib/format";
import { fmt } from "./FlowTab.types";
import type { StockFlowRow, FlowGroup } from "./FlowTab.types";

const fmtWon = fmtWonCompact;

interface FlowRowProps {
  p: StockFlowRow;
  i: number;
  selectedFlowCodes: Set<string>;
  toggleSelectFlow: (code: string) => void;
  loadFlowSelectedProduct: (p: StockFlowRow) => void;
  vendorCategoryMap: Record<string, string | null>;
  isFlowGroupCollapsed: (g: FlowGroup) => boolean;
}

// 만원·억 단위 축약 (판매금액 컬럼용)
const fmtMan = (v: number): string => {
  if (v <= 0) return "-";
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(2)}억`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(1)}만`;
  return v.toLocaleString();
};

export const FlowRow: React.FC<FlowRowProps> = ({
  p, i, selectedFlowCodes, toggleSelectFlow, loadFlowSelectedProduct,
  vendorCategoryMap, isFlowGroupCollapsed,
}) => {
  const cur = Number((p as any).current_stock ?? 0);
  const saleV = Number(p.sale_qty ?? 0);
  const purchV = Number((p as any).purchase_total_qty ?? p.purchase_qty ?? 0);
  const saleP = Number((p as any).sale_price ?? 0);
  const purP = Number((p as any).purchase_price ?? 0);
  const profitRate = saleP > 0 && purP > 0 ? Math.trunc(((saleP - purP) / saleP) * 100) : null;
  const purchaseCount = Number((p as any).purchase_count ?? 0);
  const firstPD = (p as any).first_purchase_date as string | null;
  const lastPD = p.last_purchase_date;
  const purchaseCycle = (() => {
    if (purchaseCount < 2 || !firstPD || !lastPD || firstPD === lastPD) return null;
    const days = Math.round((new Date(lastPD).getTime() - new Date(firstPD).getTime()) / (86400 * 1000));
    return purchaseCount > 1 ? Math.round(days / (purchaseCount - 1)) : null;
  })();
  const lastPDShort = (() => {
    const d = lastPD;
    if (!d || !/^\d{4}-\d{2}-\d{2}/.test(String(d))) return "-";
    return `${String(d).slice(5, 7)}/${String(d).slice(8, 10)}`;
  })();

  return (
    <tr key={`flow-${p.product_code}-${i}`} className={`transition ${selectedFlowCodes.has(String(p.product_code)) ? "bg-zinc-50" : "hover:bg-zinc-50/70"}`}>
      <td className="text-center px-1 py-2 align-top" style={{ width: 48, minWidth: 48, maxWidth: 48 }}>
        <div className="flex items-center justify-center gap-1.5">
          <span onClick={(e) => { e.stopPropagation(); toggleSelectFlow(String(p.product_code)); }}
            className="cursor-pointer inline-flex items-center justify-center">
            {selectedFlowCodes.has(String(p.product_code))
              ? <CheckSquare size={13} className="text-zinc-500" />
              : <Square size={13} className="text-zinc-300 hover:text-zinc-500" />}
          </span>
          <span className="text-[14px] font-semibold text-zinc-400 tabular-nums">{i + 1}</span>
        </div>
      </td>
      <td className="px-2 py-2.5 align-top">
        <button type="button" onClick={() => loadFlowSelectedProduct(p)}
          className="text-left text-[15px] font-bold text-zinc-700 hover:text-zinc-900 hover:underline break-words whitespace-normal leading-snug cursor-pointer transition">
          {p.product_name}
          {(p as any).min_order != null && (p as any).min_order > 0 && (
            <span className="inline-flex items-center ml-1 px-1.5 py-0.5 rounded-sm text-[14px] font-bold text-zinc-500 bg-zinc-100 border border-line align-middle">
              최소{(p as any).min_order}
            </span>
          )}
        </button>
        {p.supplier && (
          <div className="flex items-center gap-1 flex-wrap mt-0.5">
            <VendorCategoryBadge category={vendorCategoryMap[p.supplier] ?? null} />
            <span className="text-[15px] font-medium text-zinc-400 break-words whitespace-normal">{p.supplier}</span>
          </div>
        )}
      </td>
      {/* 재고현황 그룹 */}
      {!isFlowGroupCollapsed("stock") && <>
        <td className="text-right px-1.5 py-2.5 font-bold text-[14px] bg-zinc-50/60 align-top tabular-nums text-zinc-700">{fmt(saleV)}</td>
        {(() => {
          const close = Number(p.closing_stock ?? 0);
          const opt = Number((p as any).optimal_stock ?? 0);
          const mismatch = close !== cur;
          const belowOptimal = opt > 0 && cur < opt;
          return (
            <td className={`text-right px-1.5 py-2.5 font-bold text-[14px] align-top tabular-nums ${cur <= 0 || mismatch || belowOptimal ? "text-rose-500" : "text-zinc-700"}`}
              title={belowOptimal ? `현재고 부족 · ${cur} < 추천적정재고 ${opt}` : mismatch ? `현재고(${fmt(cur)}) ≠ 스냅샷 종료재고(${fmt(close)})` : "ERP 현재고"}>
              {fmt(cur)}
            </td>
          );
        })()}
        {(() => {
          const opt = Number((p as any).optimal_stock ?? 0);
          const below = opt > 0 && cur < opt;
          return (
            <td className={`text-right px-1.5 py-2.5 font-bold text-[14px] align-top tabular-nums ${opt <= 0 ? "text-zinc-300" : below ? "text-rose-400" : "text-zinc-500"}`}>
              {opt > 0 ? fmt(opt) : "-"}
            </td>
          );
        })()}
        <td className="text-right px-1.5 py-2.5 font-bold text-[14px] align-top tabular-nums text-sky-600 bg-sky-50/20">
          {fmt(Number((p as any).sale_qty_month ?? 0))}
        </td>
      </>}
      {isFlowGroupCollapsed("stock") && <td className="bg-zinc-50/20" />}
      {/* 매입현황 그룹 */}
      {!isFlowGroupCollapsed("purchase") && <>
        <td className={`text-right px-1.5 py-2.5 font-bold text-[14px] align-top tabular-nums ${purchaseCycle != null ? "text-zinc-600" : purchaseCount === 1 ? "text-zinc-400" : "text-zinc-300"}`}
          title={purchaseCycle != null ? `${purchaseCount}회 매입 · 평균 ${purchaseCycle}일 주기` : purchaseCount === 1 && lastPD ? `1회만 매입됨 (${lastPD})` : "매입 이력 없음"}>
          {purchaseCycle != null ? `${purchaseCycle}일` : purchaseCount === 1 ? "1회" : purchaseCount >= 2 && firstPD === lastPD ? "동일일" : "-"}
        </td>
        <td className="text-right px-1.5 py-2.5 text-zinc-500 font-bold text-[14px] align-top tabular-nums">{lastPDShort}</td>
        <td className="text-right px-1.5 py-2.5 text-zinc-600 font-bold text-[14px] align-top tabular-nums">{purchV > 0 ? fmt(purchV) : "-"}</td>
      </>}
      {isFlowGroupCollapsed("purchase") && <td className="bg-zinc-50/20" />}
      {/* 판매현황 그룹 */}
      {!isFlowGroupCollapsed("sales") && <>
        <td className="text-right px-1.5 py-2.5 text-rose-700 font-bold text-[14px] align-top tabular-nums">{saleV > 0 ? fmt(saleV) : "-"}</td>
        {(() => {
          const saleAmount = Number((p as any).total_amount ?? 0);
          return (
            <td className="text-right px-1.5 py-2.5 text-rose-600 font-bold text-[14px] align-top tabular-nums">{fmtMan(saleAmount)}</td>
          );
        })()}
        <td className="text-right px-1.5 py-2.5 text-zinc-500 font-bold text-[14px] align-top tabular-nums">{purP > 0 ? fmtWon(purP) : "-"}</td>
        <td className="text-right px-1.5 py-2.5 text-zinc-600 font-bold text-[14px] align-top tabular-nums">{saleP > 0 ? fmtWon(saleP) : "-"}</td>
        <td className={`text-right px-1.5 py-2.5 font-bold text-[14px] align-top tabular-nums ${profitRate == null ? "text-zinc-300" : profitRate >= 30 ? "text-zinc-700" : profitRate >= 15 ? "text-zinc-600" : profitRate >= 0 ? "text-zinc-500" : "text-rose-500"}`}>
          {profitRate != null ? `${profitRate}%` : "-"}
        </td>
      </>}
      {isFlowGroupCollapsed("sales") && <td className="bg-zinc-50/20" />}
    </tr>
  );
};
