// src/components/SalesTrendPage/LossTrackerTab.tsx
// 2026-08-22 · Framework Phase 4 · SalesTrendPage.tsx 에서 분리
import React, { useEffect, useMemo, useState } from "react";
import { AlertOctagon } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { SeasonButtons } from "../common/SeasonButtons";
import { ProductPurchaseHistoryModal } from "../StockManagePage/ProductPurchaseHistoryModal";
import { useSortableTable, type Comparator } from "../../hooks/useSortableTable";
import { api } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import { API_LIMITS } from "../../constants/apiLimits";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import { calcLoss } from "./StockFlowPanel";

type LossSortKey = "name" | "supplier" | "opening" | "sale" | "current" | "expected" | "purchase" | "loss";
const LOSS_SORT_CMP: Record<LossSortKey, Comparator<any>> = {
  name:     (a, b) => String(a.product_name ?? "").localeCompare(String(b.product_name ?? ""), "ko"),
  supplier: (a, b) => String(a.supplier ?? "").localeCompare(String(b.supplier ?? ""), "ko"),
  opening:  (a, b) => Number(a.opening_stock ?? 0) - Number(b.opening_stock ?? 0),
  sale:     (a, b) => Number(a.sale_qty ?? 0) - Number(b.sale_qty ?? 0),
  current:  (a, b) => Number(a.closing_stock ?? 0) - Number(b.closing_stock ?? 0),
  expected: (a, b) => (Number(a.opening_stock ?? 0) - Number(a.sale_qty ?? 0)) - (Number(b.opening_stock ?? 0) - Number(b.sale_qty ?? 0)),
  purchase: (a, b) => Number(a.purchase_qty ?? 0) - Number(b.purchase_qty ?? 0),
  loss:     (a, b) => Number(a.loss ?? 0) - Number(b.loss ?? 0),
};

// ─── 손실추적 탭 ─────────────────────────────────────────────────────────────
export const LossTrackerTab: React.FC<{ onOpenProductInfo: (p: any) => void }> = ({ onOpenProductInfo }) => {
  const { toast, showError } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [lossPurchaseModal, setLossPurchaseModal] = useState<{ product_code: string; product_name: string } | null>(null);
  const [minLoss, setMinLoss] = useState<string>("");
  const [maxLoss, setMaxLoss] = useState<string>("");
  const [topN, setTopN] = useState<number>(0);
  const [season, setSeason] = useState<SeasonKey | null>(null);
  const fmt = (n: number) => n.toLocaleString();

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ sort: "sale", dir: "desc", limit: String(API_LIMITS.LARGE) });
    if (season) params.set("season", season);
    api.get<{ rows?: any[] }>(`/api/stock-manage/top-sales?${params}`)
      .then(({ data: j }) => setRows(Array.isArray(j?.rows) ? j.rows : []))
      .catch((err) => { setRows([]); showError(`데이터 로드 실패: ${err instanceof Error ? err.message : String(err)}`); })
      .finally(() => setLoading(false));
  }, [season]);

  const enrichedFiltered = useMemo(() => {
    const minN = minLoss.trim() === "" ? -Infinity : Number(minLoss);
    const maxN = maxLoss.trim() === "" ? Infinity : (Number(maxLoss) || Infinity);
    return rows.map(r => ({ ...r, loss: calcLoss(r) })).filter(r => r.loss >= minN && r.loss <= maxN);
  }, [rows, minLoss, maxLoss]);

  const { sorted: _sortedLoss, sortKey, sortDir, toggleSort: _toggleLossSort, setSort: _setLossSort } =
    useSortableTable<any, LossSortKey>(enrichedFiltered, "loss", LOSS_SORT_CMP, "asc");

  const handleSort = (k: LossSortKey) => {
    if (sortKey === k) _toggleLossSort(k);
    else _setLossSort(k, k === "name" || k === "supplier" ? "asc" : "desc");
  };
  const filtered = topN === 0 ? _sortedLoss : _sortedLoss.slice(0, topN);
  const arrow = (k: LossSortKey) => sortKey !== k ? " ⇅" : sortDir === "asc" ? " ▲" : " ▼";

  return (
    <div className="bg-white rounded-xl border border-line p-4 shadow-sm flex flex-col gap-3">
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <AlertOctagon size={14} className="text-rose-600" />
          <span className="text-sm font-bold text-zinc-700">손실추적</span>
          <span className="text-[10px] text-zinc-400">(시작재고 − 판매) − 종료재고</span>
        </div>
        <span className="text-[11px] font-bold text-zinc-500">{filtered.length}건</span>
      </div>
      {/* 필터 바 */}
      <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
        <div className="inline-flex bg-zinc-100 rounded-md p-0.5">
          {([0, 100, 300, 1000, 2000] as const).map(n => (
            <button key={n} type="button" onClick={() => setTopN(n)}
              className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition ${topN === n ? "bg-white text-rose-700 shadow-sm ring-1 ring-zinc-200" : "text-zinc-500 hover:text-zinc-800"}`}>
              {n === 0 ? "전체" : `Top ${n}`}
            </button>
          ))}
        </div>
        <SeasonButtons value={season} onChange={setSeason} size="sm" />
        <span className="text-zinc-500 font-bold ml-1">손실 갯수</span>
        <input type="number" value={minLoss} onChange={e => setMinLoss(e.target.value)}
          placeholder="최소"
          title="음수 허용 (예: -5 → 재고 남는 상품도 표시)"
          className="w-16 border border-line rounded-lg px-1.5 py-1 tabular-nums text-right focus:outline-none focus:border-brand-deep" />
        <span className="text-zinc-400">~</span>
        <input type="number" value={maxLoss} onChange={e => setMaxLoss(e.target.value)}
          placeholder="최대"
          className="w-14 border border-line rounded-lg px-1.5 py-1 tabular-nums text-right focus:outline-none focus:border-brand-deep" />
        <span className="text-zinc-400">개</span>
      </div>
      {loading && filtered.length > 0 && (
        <div className="flex items-center justify-center gap-1.5 py-1.5 mb-1 bg-rose-50 border border-rose-200 rounded-md sticky top-0 z-10">
          <Spinner size={11} tone="rose" label="조건 변경 · 새로 불러오는 중..." labelSize={10} />
        </div>
      )}
      {loading && filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-8">
          <div className="w-10 h-10 border-4 border-line border-t-orange-500 rounded-full animate-spin" />
          <div className="text-xs font-bold text-zinc-600">데이터 로딩중...</div>
        </div>
      ) : !loading && filtered.length === 0 ? (
        <div className="text-center text-[11px] text-zinc-300 py-6">손실 상품 없음</div>
      ) : (
        <div className={`overflow-auto max-h-[50vh] rounded-lg border border-line ${loading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
          <table className="w-full text-xs sm:min-w-[540px]">
            <thead className="sticky top-0 bg-zinc-50 border-b-2 border-line z-10 shadow-sm">
              <tr className="text-[11px] text-zinc-500 uppercase tracking-wider">
                <th className="text-left px-1 py-1.5 w-6">#</th>
                <th onClick={() => handleSort("name")}
                  className={`text-left px-1 py-1.5 cursor-pointer select-none hover:bg-zinc-100 transition ${sortKey === "name" ? "text-zinc-800 font-bold" : ""}`}>
                  <span className="inline-flex items-center gap-0.5">상품명{arrow("name")}</span>
                </th>
                <th onClick={() => handleSort("supplier")}
                  className={`text-left px-1 py-1.5 hidden sm:table-cell cursor-pointer select-none hover:bg-zinc-100 transition ${sortKey === "supplier" ? "text-zinc-800 font-bold" : ""}`}>
                  <span className="inline-flex items-center gap-0.5">공급사{arrow("supplier")}</span>
                </th>
                <th onClick={() => handleSort("opening")}
                  className={`text-right px-1 py-1.5 w-14 cursor-pointer select-none hover:bg-zinc-100 transition ${sortKey === "opening" ? "text-zinc-800 font-bold" : ""}`}
                  title="시작재고"><span className="inline-flex items-center gap-0.5">시작{arrow("opening")}</span></th>
                <th onClick={() => handleSort("sale")}
                  className={`text-right px-1 py-1.5 w-14 cursor-pointer select-none hover:bg-orange-100/60 bg-orange-50/60 transition ${sortKey === "sale" ? "text-orange-700 font-bold" : "text-orange-500"}`}
                  title="판매출고계"><span className="inline-flex items-center gap-0.5">판매{arrow("sale")}</span></th>
                <th onClick={() => handleSort("current")}
                  className={`text-right px-1 py-1.5 w-14 cursor-pointer select-none hover:bg-amber-100/60 bg-amber-50/60 transition ${sortKey === "current" ? "text-amber-800 font-bold" : "text-amber-600"}`}
                  title="현재고"><span className="inline-flex items-center gap-0.5">현재고{arrow("current")}</span></th>
                <th onClick={() => handleSort("expected")}
                  className={`text-right px-1 py-1.5 w-14 hidden md:table-cell cursor-pointer select-none hover:bg-zinc-100 transition ${sortKey === "expected" ? "text-zinc-800 font-bold" : ""}`}
                  title="시작 − 판매 = 예상 종료재고"><span className="inline-flex items-center gap-0.5">예상{arrow("expected")}</span></th>
                <th onClick={() => handleSort("purchase")}
                  className={`text-right px-1 py-1.5 w-14 hidden md:table-cell cursor-pointer select-none hover:bg-emerald-100/60 bg-emerald-50/60 transition ${sortKey === "purchase" ? "text-emerald-800 font-bold" : "text-emerald-500"}`}
                  title="입고계 (참고)"><span className="inline-flex items-center gap-0.5">입고{arrow("purchase")}</span></th>
                <th onClick={() => handleSort("loss")}
                  className={`text-right px-1 py-1.5 w-16 cursor-pointer select-none hover:bg-rose-100/60 bg-rose-50/60 transition ${sortKey === "loss" ? "text-rose-700 font-bold" : "text-rose-500"}`}
                  title="예상 − 종료 (양수면 손실)"><span className="inline-flex items-center gap-0.5">손실{arrow("loss")}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((r, i) => {
                const open = Number(r.opening_stock ?? 0);
                const purch = Number(r.purchase_qty ?? 0);
                const sale = Number(r.sale_qty ?? 0);
                const close = Number(r.closing_stock ?? 0);
                const expected = open - sale;
                return (
                  <tr key={r.product_code ?? i} className="hover:bg-zinc-50/60 transition align-top"
                    title={`예상 = 시작(${open}) − 판매(${sale}) = ${expected}\n실제 종료 = ${close}\n손실 = ${expected - close}${purch > 0 ? `\n※ 이 기간 입고 ${purch} 있음 (예상 계산에 미반영)` : ""}`}>
                    <td className="px-0.5 py-1.5 text-[12px] font-bold text-orange-600">{i + 1}</td>
                    <td className="px-0.5 py-1.5 align-top">
                      <button onClick={() => onOpenProductInfo(r)} className="text-left text-[13px] font-medium text-zinc-800 hover:text-indigo-600 hover:underline break-words whitespace-normal leading-tight cursor-pointer transition">
                        {r.product_name}
                      </button>
                      {r.supplier && <div className="text-[11px] text-zinc-400 break-words whitespace-normal">{r.supplier}</div>}
                    </td>
                    <td className="px-0.5 py-1.5 text-zinc-500 text-[11px] hidden sm:table-cell break-words whitespace-normal leading-tight align-top">{r.supplier}</td>
                    <td className="text-right px-0.5 py-1.5 tabular-nums text-zinc-800 align-top">{fmt(open)}</td>
                    <td className="text-right px-0.5 py-1.5 tabular-nums text-orange-700 font-bold bg-orange-50/40 align-top">{fmt(sale)}</td>
                    <td className="text-right px-0.5 py-1.5 tabular-nums text-amber-800 font-bold bg-amber-50/40 align-top">{fmt(close)}</td>
                    <td className="text-right px-0.5 py-1.5 tabular-nums text-zinc-800 hidden md:table-cell align-top">{fmt(expected)}</td>
                    <td className={`text-right px-0.5 py-1.5 tabular-nums hidden md:table-cell bg-emerald-50/40 align-top ${purch > 0 ? "text-emerald-700 font-bold" : "text-zinc-400"}`}>
                      {purch > 0 ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setLossPurchaseModal({ product_code: String(r.product_code), product_name: String(r.product_name ?? r.product_code) }); }}
                          className="underline decoration-dotted decoration-emerald-400 underline-offset-2 hover:decoration-solid hover:text-emerald-800 cursor-pointer transition"
                          title="매입 이력 조회"
                        >{fmt(purch)}</button>
                      ) : fmt(purch)}
                    </td>
                    <td className={`text-right px-0.5 py-1.5 tabular-nums font-bold bg-rose-50/40 align-top ${r.loss < 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {r.loss > 0 ? `-${fmt(r.loss)}` : r.loss < 0 ? `+${fmt(-r.loss)}` : "0"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {lossPurchaseModal && (
        <ProductPurchaseHistoryModal
          productCode={lossPurchaseModal.product_code}
          productName={lossPurchaseModal.product_name}
          onClose={() => setLossPurchaseModal(null)}
        />
      )}
    </div>
  );
};
