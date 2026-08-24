// src/components/OrderManagePage/CriticalTab.tsx
// 2026-08-22 · Framework Phase 4 · 품절임박 탭 분리
import React from "react";
import { AlertTriangle } from "lucide-react";
import { PageToolbar } from "../common/PageToolbar";
import { TableListWrap, tableHeadCls, tableThCls, tableTdCls } from "../common";
import type { ProductInfo } from "./OrderManagePage.types";

interface CriticalTabProps {
  products: ProductInfo[];
  invStockMap: Map<string, { total: number; w1: number | null; w2: number | null; s1: number | null; s2: number | null; s3: number | null; s1z: string | null; s2z: string | null; s3z: string | null; warehouse: number | null; store: number | null }>;
  orderReqCodes: Set<string>;
  getCode: (p: ProductInfo) => string;
  onRequestOrder: (p: ProductInfo) => Promise<void>;
}

export const CriticalTab: React.FC<CriticalTabProps> = ({
  products,
  invStockMap,
  orderReqCodes,
  getCode,
  onRequestOrder,
}) => {
  const critical = products
    .filter(p => {
      const cur = Number(p.current_stock ?? NaN);
      return Number.isFinite(cur) && cur <= 3;
    })
    .sort((a, b) => Number(a.current_stock ?? 0) - Number(b.current_stock ?? 0));

  return (
    <div className="flex flex-col gap-2">
      <PageToolbar
        icon={<AlertTriangle size={18} strokeWidth={2.2} />}
        title="품절임박"
        count={critical.length}
        leftSlot={
          <span className="text-[13px] text-ink-soft font-medium tracking-tight">ERP재고 3개 이하</span>
        }
      />
      {/* 2026-08-24 · v3 리스트 UI 프레임워크 · TableListWrap · 사용자 지시 */}
      <TableListWrap>
        <table className="w-full text-[14px] tabular-nums">
          <thead className={tableHeadCls()}>
            <tr>
              <th className={tableThCls("left", "w-[110px] text-sky-800")}>공급사</th>
              <th className={tableThCls("left", "min-w-[220px]")}>상품명</th>
              <th className={tableThCls("num", "w-[70px] bg-amber-50/40 text-amber-700")}>실재고</th>
              <th className={tableThCls("num", "w-[70px] text-zinc-500")}>ERP재고</th>
              <th className={tableThCls("num", "w-[70px] text-indigo-600")}>적정재고</th>
              <th className={tableThCls("center", "w-[80px]")}>발주</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {critical.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-[14px] text-zinc-400 py-8">품절임박 상품 없음 (ERP재고 3개 이하)</td></tr>
            ) : critical.map(p => {
              const code = getCode(p);
              const inv = invStockMap.get(code);
              const name = String(p.product_name ?? "-");
              const supplier = String(p.supplier ?? "-");
              const alreadyRequested = orderReqCodes.has(code);
              const curNum = Number(p.current_stock ?? 0);
              return (
                <tr key={code} className={`${curNum <= 0 ? "bg-rose-50/40 hover:bg-rose-50" : "hover:bg-zinc-50"}`}>
                  <td className={tableTdCls("left", "text-[14px] text-sky-800 font-semibold whitespace-normal break-words")}>{supplier}</td>
                  <td className={tableTdCls("left", "text-[15px] font-semibold text-zinc-800 whitespace-normal break-words")}>{name}</td>
                  <td className={tableTdCls("num", `${inv?.total != null ? "text-amber-700" : "text-zinc-300"} bg-amber-50/40`)}>{inv?.total ?? "-"}</td>
                  <td className={tableTdCls("num", `font-bold ${curNum <= 0 ? "text-rose-700" : "text-zinc-700"}`)}>{p.current_stock ?? "-"}</td>
                  <td className={tableTdCls("num", "text-indigo-700 font-bold")}>{p.optimal_stock ?? "-"}</td>
                  <td className={tableTdCls("center")}>
                    <button
                      onClick={() => onRequestOrder(p)}
                      disabled={alreadyRequested}
                      className={`h-7 px-3 rounded-md text-[14px] font-bold cursor-pointer transition ${
                        alreadyRequested
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-not-allowed"
                          : "bg-brand-deep text-white hover:bg-[#0d3a5c]"
                      }`}
                    >{alreadyRequested ? "요청됨" : "요청"}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableListWrap>
    </div>
  );
};
