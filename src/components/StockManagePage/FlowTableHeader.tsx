// FlowTableHeader · FlowTab 테이블 헤더 (thead) · 순수 렌더 컴포넌트
// 2026-08-31 · large-file 분리 · FlowTab.tsx audit 위반 해소

import React from "react";
import { EyeOff, CheckSquare, Square, X as XIcon } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { RESIZER_CLS } from "../../hooks/useColumnResize";
import type { SortKey, SortDir, FlowGroup } from "./FlowTab.types";

interface FlowTableHeaderProps {
  flowSort: SortKey;
  flowDir: SortDir;
  toggleFlowSort: (key: SortKey) => void;
  isFlowGroupCollapsed: (g: FlowGroup) => boolean;
  selectedFlowCodes: Set<string>;
  filteredFlowLength: number;
  flowBulkHiding: boolean;
  onSelectAll: () => void;
  onBulkHide: () => void;
  onClearSelection: () => void;
  getWidth: (col: string) => number;
  resizerProps: (col: string) => object;
}

export const FlowTableHeader: React.FC<FlowTableHeaderProps> = ({
  flowSort, flowDir, toggleFlowSort,
  isFlowGroupCollapsed,
  selectedFlowCodes, filteredFlowLength,
  flowBulkHiding,
  onSelectAll, onBulkHide, onClearSelection,
  getWidth, resizerProps,
}) => {
  const arrowFor = (key: SortKey) =>
    flowSort !== key ? "⇅" : flowDir === "desc" ? "▼" : "▲";

  return (
    <thead className="sticky top-0 bg-white z-20 shadow-sm">
      {selectedFlowCodes.size > 0 && (
        <tr className="bg-rose-50 border-b border-rose-200">
          <td colSpan={10} className="px-2 py-1.5">
            <div className="flex items-center gap-2 text-[15px]">
              <span className="font-bold text-rose-700">{selectedFlowCodes.size}개 선택됨</span>
              <button onClick={onBulkHide} disabled={flowBulkHiding}
                className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500 hover:bg-rose-600 text-white font-bold shadow-sm disabled:opacity-50">
                {flowBulkHiding ? <Spinner size={11} tone="white" /> : <EyeOff size={11} />}
                선택 숨김
              </button>
              <button onClick={onClearSelection}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-bold">
                <XIcon size={11} /> 해제
              </button>
            </div>
          </td>
        </tr>
      )}
      <tr className="border-b border-zinc-100 text-[15px] font-bold text-zinc-500 uppercase tracking-wider bg-white">
        {/* 선택 열 */}
        <th className="relative text-center px-1 py-1.5" style={{ width: getWidth("sel"), minWidth: getWidth("sel") }}>
          <div className="flex items-center justify-center gap-1.5">
            <button onClick={onSelectAll}
              className="text-zinc-400 hover:text-rose-500 transition inline-flex items-center justify-center"
              title="전체 선택/해제">
              {selectedFlowCodes.size === filteredFlowLength && filteredFlowLength > 0
                ? <CheckSquare size={13} className="text-rose-500" />
                : <Square size={13} />}
            </button>
            <span className="text-[14px] font-bold text-zinc-500">#</span>
          </div>
          <span {...resizerProps("sel")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
        </th>

        {/* 상품명 열 */}
        <th onClick={() => toggleFlowSort("name")}
          className={`relative text-left px-1 py-1.5 cursor-pointer select-none hover:bg-zinc-50 transition ${flowSort === "name" ? "text-zinc-800 font-bold" : "text-zinc-500"}`}
          style={{ width: getWidth("name"), minWidth: getWidth("name") }}>
          <span className="flex flex-col leading-tight items-start">
            <span>상품명</span>
            <span className="text-[14px] opacity-70">{arrowFor("name")}</span>
          </span>
          <span {...resizerProps("name")} className={RESIZER_CLS} style={{ touchAction: "none" }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()} />
        </th>

        {/* 재고현황 그룹 */}
        {isFlowGroupCollapsed("stock") && <th className="bg-sky-50/20" />}
        {!isFlowGroupCollapsed("stock") && <>
          <th onClick={() => toggleFlowSort("sale")}
            className={`relative text-right px-0.5 py-1.5 cursor-pointer select-none bg-sky-50/60 hover:bg-sky-100 transition ${flowSort === "sale" ? "text-sky-800 font-bold" : "text-sky-600 font-bold"}`}
            style={{ width: getWidth("stock_sale"), minWidth: getWidth("stock_sale") }}>
            <span className="flex flex-col leading-tight items-end"><span>판매량</span><span className="text-[14px] opacity-70">{arrowFor("sale")}</span></span>
            <span {...resizerProps("stock_sale")} className={RESIZER_CLS} style={{ touchAction: "none" }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()} />
          </th>
          <th onClick={() => toggleFlowSort("current")}
            className={`relative text-right px-0.5 py-1.5 cursor-pointer select-none bg-sky-50/60 hover:bg-sky-100 transition ${flowSort === "current" ? "text-sky-800 font-bold" : "text-sky-600 font-bold"}`}
            style={{ width: getWidth("stock_cur"), minWidth: getWidth("stock_cur") }}>
            <span className="flex flex-col leading-tight items-end"><span>현재고</span><span className="text-[14px] opacity-70">{arrowFor("current")}</span></span>
            <span {...resizerProps("stock_cur")} className={RESIZER_CLS} style={{ touchAction: "none" }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()} />
          </th>
          <th onClick={() => toggleFlowSort("optimal" as any)}
            className="relative text-right px-0.5 py-1.5 cursor-pointer select-none bg-sky-50/60 hover:bg-sky-100 transition text-sky-600 font-bold"
            style={{ width: getWidth("stock_opt"), minWidth: getWidth("stock_opt") }}>
            <span className="flex flex-col leading-tight items-end"><span>추천적정재고</span><span className="text-[14px] opacity-70">{arrowFor("optimal" as any)}</span></span>
            <span {...resizerProps("stock_opt")} className={RESIZER_CLS} style={{ touchAction: "none" }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()} />
          </th>
          <th className="relative text-right px-0.5 py-1.5 bg-sky-50/40 text-sky-600 font-bold"
            style={{ width: getWidth("stock_month"), minWidth: getWidth("stock_month") }}>
            <span className="flex flex-col leading-tight items-end"><span>최근30일</span><span className="text-[14px] opacity-70">판매</span></span>
            <span {...resizerProps("stock_month")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
          </th>
        </>}

        {/* 매입현황 그룹 */}
        {isFlowGroupCollapsed("purchase") && <th className="bg-amber-50/20" />}
        {!isFlowGroupCollapsed("purchase") && <>
          <th onClick={() => toggleFlowSort("cycle")}
            className={`relative text-right px-0.5 py-1.5 text-[15px] font-bold cursor-pointer select-none bg-amber-50/60 hover:bg-amber-100 transition ${flowSort === "cycle" ? "text-amber-800" : "text-amber-600"}`}
            style={{ width: getWidth("pur_cycle"), minWidth: getWidth("pur_cycle") }}>
            <span className="flex flex-col leading-tight items-end">
              <span className="text-[14px] font-semibold text-amber-500">평균</span>
              <span>매입주기</span>
              <span className="text-[14px] opacity-70">{arrowFor("cycle")}</span>
            </span>
            <span {...resizerProps("pur_cycle")} className={RESIZER_CLS} style={{ touchAction: "none" }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()} />
          </th>
          <th onClick={() => toggleFlowSort("last_purchase")}
            className={`relative text-right px-0.5 py-1.5 text-[15px] font-bold cursor-pointer select-none bg-amber-50/40 hover:bg-amber-100 transition ${flowSort === "last_purchase" ? "text-amber-800" : "text-amber-600"}`}
            style={{ width: getWidth("pur_last"), minWidth: getWidth("pur_last") }}>
            <span className="flex flex-col leading-tight items-end">
              <span className="text-[14px] font-semibold text-amber-500">최근</span>
              <span>매입일</span>
              <span className="text-[14px] opacity-70">{arrowFor("last_purchase")}</span>
            </span>
            <span {...resizerProps("pur_last")} className={RESIZER_CLS} style={{ touchAction: "none" }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()} />
          </th>
          <th onClick={() => toggleFlowSort("purchase")}
            className={`relative text-right px-0.5 py-1.5 text-[15px] font-bold cursor-pointer select-none bg-amber-50/60 hover:bg-amber-100 transition ${flowSort === "purchase" ? "text-amber-800" : "text-amber-600"}`}
            style={{ width: getWidth("pur_qty"), minWidth: getWidth("pur_qty") }}>
            <span className="flex flex-col leading-tight items-end">
              <span className="text-[14px] font-semibold text-amber-500">최근</span>
              <span>매입량</span>
              <span className="text-[14px] opacity-70">{arrowFor("purchase")}</span>
            </span>
            <span {...resizerProps("pur_qty")} className={RESIZER_CLS} style={{ touchAction: "none" }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()} />
          </th>
        </>}

        {/* 판매현황 그룹 */}
        {isFlowGroupCollapsed("sales") && <th className="bg-rose-50/20" />}
        {!isFlowGroupCollapsed("sales") && <>
          <th onClick={() => toggleFlowSort("sale")}
            className={`relative text-right px-0.5 py-1.5 text-[15px] font-bold cursor-pointer select-none bg-rose-50/40 hover:bg-rose-100 transition ${flowSort === "sale" ? "text-rose-800" : "text-rose-700"}`}
            style={{ width: getWidth("sal_qty"), minWidth: getWidth("sal_qty") }}>
            <span className="flex flex-col leading-tight items-end"><span>판매량</span><span className="text-[14px] opacity-70">{arrowFor("sale")}</span></span>
            <span {...resizerProps("sal_qty")} className={RESIZER_CLS} style={{ touchAction: "none" }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()} />
          </th>
          <th onClick={() => toggleFlowSort("amount")}
            className={`relative text-right px-0.5 py-1.5 text-[15px] font-bold cursor-pointer select-none bg-rose-50/40 hover:bg-rose-100 transition ${flowSort === "amount" ? "text-rose-800" : "text-rose-700"}`}
            style={{ width: getWidth("sal_amount"), minWidth: getWidth("sal_amount") }}>
            <span className="flex flex-col leading-tight items-end"><span>판매금액</span><span className="text-[14px] opacity-70">{arrowFor("amount")}</span></span>
            <span {...resizerProps("sal_amount")} className={RESIZER_CLS} style={{ touchAction: "none" }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()} />
          </th>
          <th onClick={() => toggleFlowSort("last_purchase_price")}
            className={`relative text-right px-0.5 py-1.5 text-[15px] font-bold cursor-pointer select-none bg-rose-50/40 hover:bg-rose-100 transition ${flowSort === "last_purchase_price" ? "text-rose-800" : "text-rose-600"}`}
            style={{ width: getWidth("sal_unit"), minWidth: getWidth("sal_unit") }}>
            <span className="flex flex-col leading-tight items-end">
              <span className="font-semibold text-rose-500">ERP</span>
              <span>단가</span>
              <span className="text-[14px] opacity-70">{arrowFor("last_purchase_price")}</span>
            </span>
            <span {...resizerProps("sal_unit")} className={RESIZER_CLS} style={{ touchAction: "none" }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()} />
          </th>
          <th onClick={() => toggleFlowSort("sale_price")}
            className={`relative text-right px-0.5 py-1.5 text-[15px] font-bold cursor-pointer select-none bg-rose-50/40 hover:bg-rose-100 transition ${flowSort === "sale_price" ? "text-rose-800" : "text-rose-600"}`}
            style={{ width: getWidth("sal_price"), minWidth: getWidth("sal_price") }}>
            <span className="flex flex-col leading-tight items-end"><span>판매가</span><span className="text-[14px] opacity-70">{arrowFor("sale_price")}</span></span>
            <span {...resizerProps("sal_price")} className={RESIZER_CLS} style={{ touchAction: "none" }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()} />
          </th>
          <th onClick={() => toggleFlowSort("profit_rate")}
            className={`relative text-right px-0.5 py-1.5 text-[15px] font-bold cursor-pointer select-none bg-rose-50/40 hover:bg-rose-100 transition ${flowSort === "profit_rate" ? "text-rose-800" : "text-rose-600"}`}
            style={{ width: getWidth("sal_profit"), minWidth: getWidth("sal_profit") }}>
            <span className="flex flex-col leading-tight items-end"><span>이익률</span><span className="text-[14px] opacity-70">{arrowFor("profit_rate")}</span></span>
            <span {...resizerProps("sal_profit")} className={RESIZER_CLS} style={{ touchAction: "none" }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()} />
          </th>
        </>}
      </tr>
    </thead>
  );
};
