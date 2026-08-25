// src/components/StockManagePage/SupplierInlineExpansion.tsx
// 2026-08-25 · #82 (#259) A안 · 공급사 인라인 확장 · sub-list · 최신 트렌드 UI
//   · Linear/Attio 톤 · gradient bg · 카드형 mini table
//   · 상품명·수량·단가·금액 · brand-deep 강조 · 상위 20개 표시

import React from "react";
import { Spinner } from "../common/Spinner";
import { fmt } from "./SupplierTab.types";
import { fmtWonCompact } from "../../lib/format";

const fmtWon = fmtWonCompact;

interface SupplierInlineExpansionProps {
  loading: boolean;
  rows: any[] | null | undefined;
}

export const SupplierInlineExpansion: React.FC<SupplierInlineExpansionProps> = ({ loading, rows }) => (
  <tr className="bg-gradient-to-b from-brand-tint/25 to-brand-tint/10 border-b-2 border-brand-deep/10">
    <td colSpan={99} className="px-0 py-0">
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Spinner size={13} tone="brand" label="상품 목록 불러오는 중..." labelSize={14} />
        </div>
      ) : !rows || rows.length === 0 ? (
        <div className="py-4 text-center text-[14px] text-zinc-400 font-medium">
          상품 데이터 없음
        </div>
      ) : (
        <div className="px-6 py-3">
          <div className="rounded-lg border border-line bg-white overflow-hidden shadow-[0_1px_2px_rgba(10,46,74,0.04)]">
            <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50/70 border-b border-line">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-deep" aria-hidden />
              <span className="text-[13px] font-bold text-zinc-700 uppercase tracking-wider">상품 상위 {rows.length}</span>
              <span className="ml-auto text-[12px] text-zinc-400">클릭 시 상세 · 우측 패널</span>
            </div>
            <table className="w-full text-[13px]">
              <thead className="bg-zinc-50/40 border-b border-line">
                <tr className="text-[11px] text-zinc-500 uppercase tracking-wider">
                  <th className="text-left px-3 py-1.5 font-semibold">상품명</th>
                  <th className="text-right px-3 py-1.5 font-semibold w-16">수량</th>
                  <th className="text-right px-3 py-1.5 font-semibold w-20">단가</th>
                  <th className="text-right px-3 py-1.5 font-semibold w-24">금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.slice(0, 20).map((r: any, idx: number) => (
                  <tr key={`${r.product_code}-${idx}`} className="hover:bg-brand-tint/25 transition-colors">
                    <td className="px-3 py-1.5 text-[14px] font-semibold text-ink truncate max-w-[300px]" title={r.product_name}>
                      {r.product_name || <span className="text-zinc-300">-</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[14px] font-semibold text-ink-soft">
                      {fmt(Number(r.sale_qty ?? r.purchase_total_qty ?? 0))}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[13px] text-zinc-500">
                      {r.purchase_price ? fmtWon(Number(r.purchase_price)) : "-"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[14px] font-bold text-brand-deep">
                      {fmtWon(Number(r.total_amount ?? 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 20 && (
              <div className="px-3 py-1.5 bg-zinc-50/40 border-t border-line text-[12px] text-zinc-500 text-center font-medium">
                전체 {rows.length}개 중 상위 20개 · 나머지는 우측 상세 패널
              </div>
            )}
          </div>
        </div>
      )}
    </td>
  </tr>
);

export default SupplierInlineExpansion;
