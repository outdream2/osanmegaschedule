// src/components/SalesTrendPage/LossTrackerTab.tsx
// 2026-08-22 · Framework Phase 4 · SalesTrendPage.tsx 에서 분리
import React, { useEffect, useMemo, useState } from "react";
import { AlertOctagon } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { Card } from "../common/Card";
import { SeasonButtons } from "../common/SeasonButtons";
import { ProductPurchaseHistoryModal } from "../StockManagePage/ProductPurchaseHistoryModal";
import { useSortableTable, type Comparator } from "../../hooks/useSortableTable";
import { api } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import { API_LIMITS } from "../../constants/apiLimits";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import { calcLoss } from "./StockFlowPanel";
import { displayVendorName } from "../../utils/vendorNameNormalize";

type LossSortKey = "name" | "supplier" | "opening" | "sale" | "current" | "expected" | "purchase" | "loss";
const LOSS_SORT_CMP: Record<LossSortKey, Comparator<any>> = {
  name:     (a, b) => String(a.product_name ?? "").localeCompare(String(b.product_name ?? ""), "ko"),
  // 2026-09-18 · 사용자 지시 · (주)·주식회사 무시 · 정제 후 정렬
  supplier: (a, b) => displayVendorName(a.supplier ?? "").localeCompare(displayVendorName(b.supplier ?? ""), "ko"),
  opening:  (a, b) => Number(a.prv_stock ?? 0) - Number(b.prv_stock ?? 0),
  sale:     (a, b) => Number(a.sale_stock ?? 0) - Number(b.sale_stock ?? 0),
  current:  (a, b) => Number(a.closing_stock ?? 0) - Number(b.closing_stock ?? 0),
  expected: (a, b) => (Number(a.prv_stock ?? 0) - Number(a.sale_stock ?? 0)) - (Number(b.prv_stock ?? 0) - Number(b.sale_stock ?? 0)),
  purchase: (a, b) => Number(a.buy_stock ?? 0) - Number(b.buy_stock ?? 0),
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
  // 2026-09-08 · 사용자 지시 · TopN 버튼 제거 · 0 = 전체 하드코딩
  const [topN] = useState<number>(0);
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
    // 2026-10-12 · 사용자 지시 "손실추적 UI 교체" · 홈 랜딩 톤 (HomeDashboard 공식 패턴)
    //   · rounded-[12px] + border-slate-200 + thin shadow · 3px 세로 strip header · 2-tier typography
    //   · 폰트 작게 금지 (14 하한 · 소수점 금지) · uppercase/tracking-wider 제거 · behavior 전부 유지
    <div className="bg-white rounded-[12px] border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
      {/* Header · 3px rose strip + title + description */}
      <header className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-slate-100">
        <span className="w-[3px] h-[16px] bg-rose-500 rounded-full shrink-0" aria-hidden />
        <AlertOctagon size={18} className="text-rose-500 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">손실추적</h3>
          <p className="text-[13px] text-slate-500 mt-0.5">(시작재고 − 판매) − 종료재고</p>
        </div>
        <span className="text-[14px] text-slate-500 font-medium tabular-nums">{filtered.length}건</span>
      </header>

      {/* Filter bar · SeasonButtons + 손실 범위 inputs · 홈 톤 subtle bg */}
      <div className="px-5 py-2.5 flex items-center gap-2.5 flex-wrap border-b border-slate-100 bg-slate-50/40">
        <SeasonButtons value={season} onChange={setSeason} size="sm" />
        <div className="flex items-center gap-1.5 text-[14px] ml-auto">
          <span className="text-slate-500 font-medium">손실 범위</span>
          <input type="number" value={minLoss} onChange={e => setMinLoss(e.target.value)}
            placeholder="최소" title="음수 허용 (예: -5 → 재고 남는 상품도 표시)"
            className="w-16 border border-slate-200 rounded-md px-2 py-1 text-[14px] bg-white tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep" />
          <span className="text-slate-400">~</span>
          <input type="number" value={maxLoss} onChange={e => setMaxLoss(e.target.value)}
            placeholder="최대"
            className="w-16 border border-slate-200 rounded-md px-2 py-1 text-[14px] bg-white tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep" />
          <span className="text-slate-400 text-[13px]">개</span>
        </div>
      </div>

      {loading && filtered.length > 0 && (
        <div className="flex items-center justify-center gap-1.5 py-2 bg-rose-50/40 border-b border-rose-100">
          <Spinner size={11} tone="rose" label="조건 변경 · 새로 불러오는 중..." labelSize={12} />
        </div>
      )}
      {loading && filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-rose-500 rounded-full animate-spin" />
          <div className="text-[14px] font-medium text-slate-500">데이터 로딩중...</div>
        </div>
      ) : !loading && filtered.length === 0 ? (
        <div className="text-center text-[14px] text-slate-400 py-16">손실 상품 없음</div>
      ) : (
        <div className={`overflow-auto max-h-[60vh] ${loading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
          <table className="w-full text-[14px] sm:min-w-[640px]">
            <thead className="sticky top-0 bg-white border-b border-slate-200 z-10">
              <tr className="text-[13px] text-slate-500">
                <th className="text-left pl-5 pr-2 py-2 font-semibold w-8">#</th>
                <th onClick={() => handleSort("name")}
                  className={`text-left px-2 py-2 font-semibold cursor-pointer select-none hover:bg-slate-50 transition ${sortKey === "name" ? "text-ink" : ""}`}>
                  상품명{arrow("name")}
                </th>
                <th onClick={() => handleSort("supplier")}
                  className={`text-left px-2 py-2 font-semibold hidden sm:table-cell cursor-pointer select-none hover:bg-slate-50 transition ${sortKey === "supplier" ? "text-ink" : ""}`}>
                  공급사{arrow("supplier")}
                </th>
                <th onClick={() => handleSort("opening")}
                  className={`text-right px-2 py-2 w-16 font-semibold cursor-pointer select-none hover:bg-slate-50 transition ${sortKey === "opening" ? "text-ink" : ""}`}
                  title="시작재고">시작{arrow("opening")}</th>
                <th onClick={() => handleSort("sale")}
                  className={`text-right px-2 py-2 w-16 font-semibold cursor-pointer select-none hover:bg-slate-50 transition ${sortKey === "sale" ? "text-ink" : ""}`}
                  title="판매출고계">판매{arrow("sale")}</th>
                <th onClick={() => handleSort("current")}
                  className={`text-right px-2 py-2 w-16 font-semibold cursor-pointer select-none hover:bg-slate-50 transition ${sortKey === "current" ? "text-ink" : ""}`}
                  title="현재고">현재고{arrow("current")}</th>
                <th onClick={() => handleSort("expected")}
                  className={`text-right px-2 py-2 w-16 font-semibold hidden md:table-cell cursor-pointer select-none hover:bg-slate-50 transition ${sortKey === "expected" ? "text-ink" : ""}`}
                  title="시작 − 판매 = 예상 종료재고">예상{arrow("expected")}</th>
                <th onClick={() => handleSort("purchase")}
                  className={`text-right px-2 py-2 w-16 font-semibold hidden md:table-cell cursor-pointer select-none hover:bg-slate-50 transition ${sortKey === "purchase" ? "text-ink" : ""}`}
                  title="입고계 (참고)">입고{arrow("purchase")}</th>
                <th onClick={() => handleSort("loss")}
                  className={`text-right pl-2 pr-5 py-2 w-20 font-semibold cursor-pointer select-none hover:bg-rose-50 transition ${sortKey === "loss" ? "text-rose-700" : "text-rose-500"}`}
                  title="예상 − 종료 (양수면 손실)">손실{arrow("loss")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const open = Number(r.prv_stock ?? 0);
                const purch = Number(r.buy_stock ?? 0);
                const sale = Number(r.sale_stock ?? 0);
                const close = Number(r.closing_stock ?? 0);
                const expected = open - sale;
                return (
                  <tr key={r.product_code ?? i} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60 transition align-top"
                    title={`예상 = 시작(${open}) − 판매(${sale}) = ${expected}\n실제 종료 = ${close}\n손실 = ${expected - close}${purch > 0 ? `\n※ 이 기간 입고 ${purch} 있음 (예상 계산에 미반영)` : ""}`}>
                    <td className="pl-5 pr-2 py-2 text-[13px] font-medium text-slate-400 tabular-nums align-top">{i + 1}</td>
                    <td className="px-2 py-2 align-top">
                      <button onClick={() => onOpenProductInfo(r)} className="text-left text-[14px] font-medium text-ink hover:text-brand-deep hover:underline break-words whitespace-normal leading-tight cursor-pointer transition">
                        {r.product_name}
                      </button>
                      {r.supplier && (
                        <div className="text-[13px] text-slate-500 break-words whitespace-normal mt-0.5 sm:hidden">
                          {displayVendorName(r.supplier) || r.supplier}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-[13px] text-slate-600 hidden sm:table-cell break-words whitespace-normal leading-tight align-top">
                      {r.supplier ? displayVendorName(r.supplier) || r.supplier : ""}
                    </td>
                    <td className="text-right px-2 py-2 tabular-nums text-[14px] text-ink align-top">{fmt(open)}</td>
                    <td className="text-right px-2 py-2 tabular-nums text-[14px] text-ink font-semibold align-top">{fmt(sale)}</td>
                    <td className="text-right px-2 py-2 tabular-nums text-[14px] text-ink font-semibold align-top">{fmt(close)}</td>
                    <td className="text-right px-2 py-2 tabular-nums text-[14px] text-slate-600 hidden md:table-cell align-top">{fmt(expected)}</td>
                    <td className={`text-right px-2 py-2 tabular-nums text-[14px] hidden md:table-cell align-top ${purch > 0 ? "text-ink font-semibold" : "text-slate-400"}`}>
                      {purch > 0 ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setLossPurchaseModal({ product_code: String(r.product_code), product_name: String(r.product_name ?? "").trim() || "-" }); }}
                          className="underline decoration-dotted decoration-emerald-400 underline-offset-2 hover:decoration-solid hover:text-emerald-800 cursor-pointer transition"
                          title="매입 이력 조회"
                        >{fmt(purch)}</button>
                      ) : fmt(purch)}
                    </td>
                    <td className={`text-right pl-2 pr-5 py-2 tabular-nums text-[14px] font-bold align-top ${r.loss < 0 ? "text-emerald-600" : r.loss > 0 ? "text-rose-600" : "text-slate-400"}`}>
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
