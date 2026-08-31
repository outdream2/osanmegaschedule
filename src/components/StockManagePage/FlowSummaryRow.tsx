// FlowSummaryRow · FlowTab 합계 행 (Σ) · 순수 렌더 컴포넌트
// 2026-08-31 · large-file 분리 · FlowTab.tsx audit 위반 해소

import React from "react";
import { fmtWonCompact } from "../../lib/format";
import type { FlowGroup } from "./FlowTab.types";

interface FlowSummaryRowProps {
  filteredFlowLength: number;
  isFlowGroupCollapsed: (g: FlowGroup) => boolean;
  saleV: number;
  curV: number;
  optV: number;
  monthV: number;
  purchV: number;
  amountV: number;
}

export const FlowSummaryRow: React.FC<FlowSummaryRowProps> = ({
  filteredFlowLength,
  isFlowGroupCollapsed,
  saleV, curV, optV, monthV, purchV, amountV,
}) => (
  <tr className="bg-zinc-100 border-b-2 border-zinc-300 font-bold text-zinc-800 text-[14px]">
    <td className="text-center px-1 py-1.5 align-middle" style={{ width: 48, minWidth: 48, maxWidth: 48 }}>Σ</td>
    <td className="px-2 py-1.5 align-middle text-zinc-800 font-bold">
      합계 <span className="text-zinc-500 font-bold">({filteredFlowLength}건)</span>
    </td>
    {!isFlowGroupCollapsed("stock") && <>
      <td className="text-right px-1.5 py-1.5 tabular-nums font-bold text-zinc-800 bg-sky-100/60">{saleV.toLocaleString()}</td>
      <td className="text-right px-1.5 py-1.5 tabular-nums font-bold text-zinc-800 bg-sky-100/60">{curV.toLocaleString()}</td>
      <td className="text-right px-1.5 py-1.5 tabular-nums font-bold text-zinc-800 bg-sky-100/60">{optV.toLocaleString()}</td>
      <td className="text-right px-1.5 py-1.5 tabular-nums font-bold text-sky-700 bg-sky-100/60">{monthV.toLocaleString()}</td>
    </>}
    {isFlowGroupCollapsed("stock") && <td className="bg-zinc-100" />}
    {!isFlowGroupCollapsed("purchase") && <>
      <td className="text-right px-1.5 py-1.5 tabular-nums text-zinc-400">-</td>
      <td className="text-right px-1.5 py-1.5 tabular-nums text-zinc-400">-</td>
      <td className="text-right px-1.5 py-1.5 tabular-nums font-bold text-zinc-800 bg-amber-100/60">
        {purchV > 0 ? purchV.toLocaleString() : "-"}
      </td>
    </>}
    {isFlowGroupCollapsed("purchase") && <td className="bg-zinc-100" />}
    {!isFlowGroupCollapsed("sales") && <>
      <td className="text-right px-1.5 py-1.5 tabular-nums font-bold text-rose-700 bg-rose-100/60">
        {saleV > 0 ? saleV.toLocaleString() : "-"}
      </td>
      <td className="text-right px-1.5 py-1.5 tabular-nums font-bold text-rose-700 bg-rose-100/60">
        {amountV > 0 ? fmtWonCompact(amountV) : "-"}
      </td>
      <td className="text-right px-1.5 py-1.5 tabular-nums text-zinc-400">평균</td>
      <td className="text-right px-1.5 py-1.5 tabular-nums text-zinc-400">평균</td>
      <td className="text-right px-1.5 py-1.5 tabular-nums text-zinc-400">-</td>
    </>}
    {isFlowGroupCollapsed("sales") && <td className="bg-zinc-100" />}
  </tr>
);
