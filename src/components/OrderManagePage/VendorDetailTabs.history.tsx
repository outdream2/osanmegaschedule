// VendorDetailTabs.history.tsx — 매입이력 탭 컨텐츠 (분리 2026-08-29)
import React, { useMemo, useState } from "react";
import { Filter, X } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { SearchBar } from "../common/SearchBar";
import { matchesProductQuery } from "../../lib/productMatch";
import { PurchaseHistoryList, type PurchaseHistoryRow } from "../common/PurchaseHistoryList";
import { CARD_BASE } from "../../styles/tokens";
import { useColumnResize, RESIZER_CLS } from "../../hooks/useColumnResize";
import { fmt, dateLabel, type PurchaseDetailRow, type ProductStat } from "./VendorDetailTabs.types";

export const HistoryContent: React.FC<{
  detailRows: PurchaseDetailRow[];
  loading: boolean;
}> = ({ detailRows, loading }) => {
  const [productSearch, setProductSearch] = useState("");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"sku" | "all">("sku");
  // 2026-08-04 · 전체원장 뷰는 공통 PurchaseHistoryList 가 정렬 관리 (헤더 클릭)
  const { getWidth: sw, resizerProps: sr } = useColumnResize("vendorSku", {
    num:      { default: 24,  min: 20, max: 48  },
    name:     { default: 180, min: 100, max: 360 },
    count:    { default: 56,  min: 40, max: 100 },
    qty:      { default: 64,  min: 48, max: 120 },
    amount:   { default: 80,  min: 56, max: 140 },
    unit:     { default: 64,  min: 48, max: 120 },
    last_date:{ default: 80,  min: 60, max: 140 },
  });

  // 상품별 집계
  const productStats = useMemo<ProductStat[]>(() => {
    const byCode = new Map<string, ProductStat>();
    for (const r of detailRows) {
      const code = (r.product_code ?? "").trim();
      const name = (r.product_name ?? code).trim();
      if (!code) continue;
      const cur = byCode.get(code);
      if (cur) {
        cur.buy_count++;
        cur.total_qty += r.quantity;
        cur.total_amount += r.amount;
        if (!cur.latest_date || r.date > cur.latest_date) {
          cur.latest_date = r.date;
          cur.latest_unit_price = r.unit_price;
        }
      } else {
        byCode.set(code, {
          product_code: code,
          product_name: name,
          buy_count: 1,
          total_qty: r.quantity,
          total_amount: r.amount,
          latest_date: r.date,
          latest_unit_price: r.unit_price,
        });
      }
    }
    // 2026-08-29 · 통일 로직 · matchesProductQuery (초성 · 부분 · 코드)
    const list = Array.from(byCode.values()).filter(s => matchesProductQuery(s as any, productSearch));
    list.sort((a, b) => b.total_amount - a.total_amount);
    return list;
  }, [detailRows, productSearch]);

  // 전체 raw 행 (필터링만 · 정렬은 PurchaseHistoryList 가 담당)
  const allRows = useMemo(() => {
    let base = detailRows;
    if (selectedCode) base = base.filter(r => r.product_code === selectedCode);
    else if (productSearch.trim()) {
      // 2026-08-29 · 통일 로직 · matchesProductQuery
      base = base.filter(r => matchesProductQuery(r as any, productSearch));
    }
    return base;
  }, [detailRows, productSearch, selectedCode]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center py-16">
      <Spinner size={18} tone="zinc" label="매입이력 로딩 중..." labelSize={12} />
    </div>
  );
  if (detailRows.length === 0) return (
    <div className="flex-1 flex items-center justify-center py-16 text-zinc-400 text-[11px]">
      해당 기간 매입이력 없음
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      {/* 툴바 */}
      <div className="flex items-center gap-2 flex-wrap px-1">
        {/* 뷰 토글 */}
        <div className="flex flex-wrap bg-zinc-100 border border-line rounded-lg p-0.5 gap-0.5">
          {(["sku", "all"] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`h-6 px-3 rounded-md text-[11px] font-bold transition cursor-pointer whitespace-nowrap ${
                viewMode === mode
                  ? "bg-white text-zinc-800 shadow-sm ring-1 ring-zinc-200"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {mode === "sku" ? "상품별 집계" : "전체 원장"}
            </button>
          ))}
        </div>
        {/* 2026-08-29 · #165 A · SearchBar 프리미티브 */}
        <SearchBar
          value={productSearch}
          onChange={setProductSearch}
          placeholder="상품명·코드 검색"
          historyKey="megatown_vendorDetail_search"
          accent="indigo"
          widthClass="w-40"
        />
        {/* 건수 */}
        <span className="text-[10px] text-zinc-400 tabular-nums">
          {viewMode === "sku" ? `${productStats.length} SKU` : `${allRows.length}건`}
        </span>
        {selectedCode && (
          <button
            type="button"
            onClick={() => setSelectedCode(null)}
            className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-[10px] font-semibold cursor-pointer transition"
          >
            <X size={10} /> 필터 해제
          </button>
        )}
      </div>

      {/* SKU 집계 테이블 */}
      {viewMode === "sku" && (
        <div className={`${CARD_BASE} flex-1 min-h-0 overflow-auto`}>
          <table className="w-full text-xs min-w-[500px]" style={{ tableLayout: "fixed" }}>
            <thead className="sticky top-0 bg-white z-10 border-b border-zinc-100">
              <tr className="text-[10px] text-zinc-400 uppercase tracking-wider">
                <th className="relative text-left px-3 py-2 text-zinc-300" style={{ width: sw("num"), minWidth: sw("num") }}>
                  #
                  <span {...sr("num")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                </th>
                <th className="relative text-left px-3 py-2" style={{ width: sw("name"), minWidth: sw("name") }}>
                  상품명
                  <span {...sr("name")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                </th>
                <th className="relative text-right px-3 py-2" style={{ width: sw("count"), minWidth: sw("count") }}>
                  매입건
                  <span {...sr("count")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                </th>
                <th className="relative text-right px-3 py-2" style={{ width: sw("qty"), minWidth: sw("qty") }}>
                  총수량
                  <span {...sr("qty")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                </th>
                <th className="relative text-right px-3 py-2" style={{ width: sw("amount"), minWidth: sw("amount") }}>
                  총매입액
                  <span {...sr("amount")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                </th>
                <th className="relative text-right px-3 py-2" style={{ width: sw("unit"), minWidth: sw("unit") }}>
                  최근단가
                  <span {...sr("unit")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                </th>
                <th className="relative text-left px-3 py-2" style={{ width: sw("last_date"), minWidth: sw("last_date") }}>
                  최근매입
                  <span {...sr("last_date")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {productStats.map((s, i) => {
                const isSel = s.product_code === selectedCode;
                return (
                  <tr
                    key={`ps-${s.product_code}`}
                    onClick={() => { setSelectedCode(isSel ? null : s.product_code); setViewMode("all"); }}
                    className={`cursor-pointer transition-all duration-100 ${
                      isSel ? "bg-emerald-50 border-l-2 border-emerald-500" : "hover:bg-zinc-50"
                    }`}
                  >
                    <td className="px-3 py-1.5 text-zinc-300 text-[10px] tabular-nums align-top">{i + 1}</td>
                    <td className="px-3 py-1.5 align-top">
                      <div className={`text-[11px] font-semibold leading-tight break-words whitespace-normal ${isSel ? "text-emerald-800" : "text-zinc-700"}`}>
                        {s.product_name}
                      </div>
                      <div className="text-[9px] text-zinc-400">{s.product_code}</div>
                    </td>
                    <td className="px-3 py-1.5 text-right text-[11px] tabular-nums text-zinc-600 align-top">{s.buy_count}</td>
                    <td className="px-3 py-1.5 text-right text-[11px] tabular-nums text-zinc-600 align-top">{fmt(s.total_qty)}</td>
                    <td className="px-3 py-1.5 text-right text-[11px] tabular-nums font-semibold text-emerald-700 align-top">
                      {fmt(s.total_amount)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-[11px] tabular-nums text-zinc-500 align-top">
                      {fmt(s.latest_unit_price)}
                    </td>
                    <td className="px-3 py-1.5 text-[10px] text-zinc-400 align-top whitespace-nowrap">
                      {dateLabel(s.latest_date)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 전체 원장 테이블 · 2026-08-04 공통 PurchaseHistoryList 사용 */}
      {viewMode === "all" && (
        <div className={`${CARD_BASE} flex-1 min-h-0 overflow-hidden flex flex-col`}>
          {selectedCode && (
            <div className="px-3 py-1.5 border-b border-emerald-100 bg-emerald-50/50 flex items-center gap-2 shrink-0">
              <Filter size={11} className="text-emerald-600" />
              <span className="text-[12px] font-semibold text-emerald-700">
                {productStats.find(s => s.product_code === selectedCode)?.product_name ?? selectedCode}
              </span>
              <span className="text-[11px] text-emerald-500 tabular-nums">{allRows.length}건</span>
            </div>
          )}
          <PurchaseHistoryList
            rows={allRows as unknown as PurchaseHistoryRow[]}
            showSupplier={false}
            showProduct
            showRowNumber
            showFooterSum
            emptyText="해당 기간 매입 이력 없음"
            initialSortKey="date"
            initialSortDir="desc"
          />
        </div>
      )}
    </div>
  );
};
