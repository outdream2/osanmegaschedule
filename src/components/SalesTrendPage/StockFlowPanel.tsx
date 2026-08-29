// src/components/SalesTrendPage/StockFlowPanel.tsx
// 2026-08-22 · Framework Phase 4 · SalesTrendPage.tsx 에서 분리
import React, { useEffect, useMemo, useState } from "react";
import { TrendingUp, X, Info, EyeOff, CheckSquare, Square } from "lucide-react";
// 2026-08-29 · #165 A · SearchBar 프리미티브
import { SearchBar } from "../common/SearchBar";
import { Spinner } from "../common/Spinner";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { SeasonButtons } from "../common/SeasonButtons";
import { StatusPill } from "../common/StatusPill";
import { fmtWon } from "../../lib/format";
import { api } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import { CARD_BASE } from "../../styles/tokens";
import { API_LIMITS } from "../../constants/apiLimits";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import { fmt } from "./SalesTrendPage.helpers";

// ─── 타입 ────────────────────────────────────────────────────────────────────
export interface StockFlowRow {
  product_code: string;
  product_name: string;
  supplier: string | null;
  spec: string | null;
  opening_stock: number;
  purchase_qty: number;
  sale_qty: number;
  disposal_qty: number;
  internal_qty?: number;
  adjustment_qty?: number;
  closing_stock: number;
  total_amount: number;
  optimal_stock: number;
  current_stock?: number | null;
  sale_price?: number;
  purchase_price?: number;
  last_purchase_date?: string | null;
}

// 손실 = (시작재고 − 판매출고계) − 종료재고
// 양수 = 예상 종료재고보다 실제가 부족 (실 손실)
// 음수 = 예상보다 재고 많음 (매입/조정 있었을 수 있음)
export const calcLoss = (r: { opening_stock?: number | null; sale_qty?: number | null; closing_stock?: number | null }) => {
  const opening = Number(r.opening_stock ?? 0);
  const sale = Number(r.sale_qty ?? 0);
  const close = Number(r.closing_stock ?? 0);
  return (opening - sale) - close;
};

type FlowSortKey = "name" | "opening" | "sale" | "purchase" | "amount" | "closing" | "current" | "loss" | "purchase_price" | "profit_rate";
type FlowSortDir = "asc" | "desc";

// ─── 재고흐름 패널 ───────────────────────────────────────────────────────────
export const StockFlowPanel: React.FC<{
  onProductClick: (row: StockFlowRow) => void;
  selectedCode?: string | null;
  months?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  onMonthsChange?: (m: 0 | 1 | 2 | 3 | 4 | 5 | 6) => void;
  activeTab?: "product" | "supplier";
  onTabChange?: (t: "product" | "supplier") => void;
  onOpenProductInfo?: (p: any) => void;
  onOpenHiddenManager?: () => void;
  defaultSort?: FlowSortKey;
  defaultDir?: FlowSortDir;
  listLabel?: string;
  vendorCategoryMap?: Record<string, string | null>;
}> = ({ onProductClick, selectedCode, months: monthsProp, onMonthsChange, onOpenProductInfo, onOpenHiddenManager, defaultSort = "sale", defaultDir = "desc", listLabel = "판매리스트", vendorCategoryMap }) => {
  const { toast, showError } = useToast();
  const [rows, setRows] = useState<StockFlowRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<FlowSortKey>(defaultSort);
  const [dir, setDir] = useState<FlowSortDir>(defaultDir);
  const [limit, setLimit] = useState<number>(100);
  const [snapshot, setSnapshot] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [monthsLocal, setMonthsLocal] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(0);
  const months = monthsProp ?? monthsLocal;
  const setMonths = onMonthsChange ?? setMonthsLocal;
  const [pendingMonths, setPendingMonths] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(months);
  const [season, setSeason] = useState<SeasonKey | null>(null);
  const [saleMin, setSaleMin] = useState<string>("");
  const [saleMax, setSaleMax] = useState<string>("");
  const [saleListCollapsed, setSaleListCollapsed] = useState(false);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [bulkHiding, setBulkHiding] = useState(false);

  const toggleSelectCode = (code: string) => setSelectedCodes(prev => {
    const next = new Set(prev);
    if (next.has(code)) next.delete(code); else next.add(code);
    return next;
  });
  const bulkHide = async () => {
    if (selectedCodes.size === 0) return;
    setRows(prev => prev.filter(r => !selectedCodes.has(String(r.product_code))));
    setSelectedCodes(new Set());
  };

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const serverSort = (["sale", "purchase", "amount", "closing"] as FlowSortKey[]).includes(sort) ? sort : "sale";
        const p = new URLSearchParams({ sort: serverSort, dir, limit: String(limit) });
        if (season) p.set("season", season);
        else if (months > 0) p.set("months", String(months));
        else if (snapshot) p.set("snapshot_date", snapshot);
        const { data: j } = await api.get<any>(`/api/stock-manage/top-sales?${p}`);
        setRows(Array.isArray(j.rows) ? j.rows : []);
        if (!season && months === 0 && !snapshot && j.snapshot_date) setSnapshot(j.snapshot_date);
      } catch (err) {
        showError(`재고흐름 로드 실패: ${err instanceof Error ? err.message : String(err)}`);
      } finally { setLoading(false); }
    })();
  }, [sort, dir, limit, snapshot, months, season]);

  const toggleSort = (k: FlowSortKey) => {
    if (sort === k) setDir(dir === "desc" ? "asc" : "desc");
    else { setSort(k); setDir("desc"); }
  };
  const arrow = (k: FlowSortKey) => sort !== k ? " ⇅" : dir === "desc" ? " ▼" : " ▲";

  const displayRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = saleMin.trim() === "" ? null : Number(saleMin);
    const max = saleMax.trim() === "" ? null : Number(saleMax);
    let filtered = rows.filter(p => {
      if (q) {
        const hit = String(p.product_name ?? "").toLowerCase().includes(q)
          || String(p.product_code ?? "").includes(q)
          || String(p.supplier ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      const qty = Number(p.sale_qty ?? 0);
      if (min != null && Number.isFinite(min) && qty < min) return false;
      if (max != null && Number.isFinite(max) && qty > max) return false;
      return true;
    });
    const sign = dir === "asc" ? 1 : -1;
    if (sort === "loss") {
      filtered = [...filtered].sort((a, b) => sign * (calcLoss(a) - calcLoss(b)));
    } else if (sort === "name") {
      filtered = [...filtered].sort((a, b) => sign * String(a.product_name ?? "").localeCompare(String(b.product_name ?? ""), "ko"));
    } else if (sort === "opening") {
      filtered = [...filtered].sort((a, b) => sign * (Number(a.opening_stock ?? 0) - Number(b.opening_stock ?? 0)));
    } else if (sort === "current") {
      filtered = [...filtered].sort((a, b) => sign * (Number(a.current_stock ?? 0) - Number(b.current_stock ?? 0)));
    } else if (sort === "purchase_price") {
      filtered = [...filtered].sort((a, b) => sign * (Number((a as any).purchase_price ?? 0) - Number((b as any).purchase_price ?? 0)));
    } else if (sort === "profit_rate") {
      const rate = (r: any) => {
        const sp = Number(r.sale_price ?? 0);
        const pp = Number(r.purchase_price ?? 0);
        return sp > 0 && pp > 0 ? (sp - pp) / sp : -Infinity;
      };
      filtered = [...filtered].sort((a, b) => sign * (rate(a) - rate(b)));
    }
    return filtered;
  }, [rows, sort, dir, query, saleMin, saleMax]);

  return (
    <div className={`relative ${CARD_BASE} flex flex-col h-full overflow-hidden`}>
      {/* 2026-08-24 · v9 · 상단 gradient accent */}
      <span aria-hidden className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep opacity-90 z-10" />
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
      {/* ── 헤더 · 스냅샷 날짜 + Top N ── */}
      <div className="flex flex-col gap-1.5 px-3 py-2 border-b border-line bg-zinc-50/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            <TrendingUp size={14} className="text-orange-600" />
            {snapshot && (
              <span className="text-[10px] tabular-nums font-bold text-orange-600 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">
                {snapshot}
              </span>
            )}
            {snapshot && (() => {
              const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(snapshot);
              if (!m) return null;
              const yyyy = Number(m[1]), mm = Number(m[2]), dd = Number(m[3]);
              const today = new Date();
              const isToday = today.getFullYear() === yyyy && (today.getMonth() + 1) === mm && today.getDate() === dd;
              const endLabel = isToday ? "오늘" : `${mm}/${dd}`;
              let label = "", cls = "text-zinc-600 bg-zinc-100 border-zinc-300";
              if (dd <= 10) { label = `${mm}월 초순 : ${mm}/1 ~ ${endLabel}`; cls = "text-sky-700 bg-sky-50 border-sky-300"; }
              else if (dd <= 20) { label = `${mm}월 중순 : ${mm}/11 ~ ${endLabel}`; cls = "text-indigo-700 bg-indigo-50 border-indigo-300"; }
              else {
                const lastDay = new Date(yyyy, mm, 0).getDate();
                const lastLabel = isToday && dd === lastDay ? "오늘" : `${mm}/${lastDay}`;
                label = `${mm}월 하순 : ${mm}/21 ~ ${lastLabel}`;
                cls = "text-purple-700 bg-purple-50 border-purple-300";
              }
              return (
                <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 border tabular-nums${cls}`}>
                  {label}
                </span>
              );
            })()}
          </div>
          <div className="flex items-center gap-1 sm:shrink-0 overflow-x-auto scrollbar-none">
            {[
              { v: 100, label: "Top 100" },
              { v: 300, label: "Top 300" },
              { v: 1000, label: "Top 1000" },
              { v: 2000, label: "Top 2000" },
              { v: 50000, label: "전체" },
            ].map(o => (
              <button key={o.v} onClick={() => setLimit(o.v)}
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition ${limit === o.v ? "bg-orange-500 text-white" : "text-zinc-500 hover:bg-zinc-100"}`}
              >{o.label}</button>
            ))}
          </div>
        </div>
        <p className="text-[10px] text-zinc-500 font-semibold leading-tight">
          💡 상품명을 누르면 판매추이 그래프가 나옵니다
        </p>
      </div>
      {/* 조회기간 */}
      <div className="px-3 py-2 border-b border-zinc-100 flex items-center gap-1 flex-wrap text-[10px]">
        <span className="text-zinc-500 font-bold shrink-0 mr-1">조회기간</span>
        <button onClick={() => { setPendingMonths(0); setSeason(null); }}
          className={`px-1.5 py-0.5 rounded font-bold transition ${!season && pendingMonths === 0 ? "bg-orange-500 text-white" : "text-zinc-500 hover:bg-zinc-100"}`}>10일</button>
        {[1, 2, 3, 4, 5, 6].map(m => (
          <button key={m} onClick={() => { setPendingMonths(m as any); setSeason(null); }}
            className={`px-1.5 py-0.5 rounded font-bold transition ${!season && pendingMonths === m ? "bg-orange-500 text-white" : "text-zinc-500 hover:bg-zinc-100"}`}>{m}개월</button>
        ))}
        {pendingMonths !== months && !season ? (
          <button onClick={() => setMonths(pendingMonths)}
            className="ml-1 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-orange-500 text-white font-bold hover:bg-orange-600 shadow-sm cursor-pointer transition animate-pulse"
            title="선택한 기간으로 조회">확인 →</button>
        ) : (
          <span className="ml-1 text-[9px] text-zinc-400 font-semibold">{season ? "계절 조회 중" : "조회 완료"}</span>
        )}
        <SeasonButtons
          value={season}
          onChange={(v) => {
            setSeason(v);
            if (v) { setPendingMonths(0); setMonths(0); }
          }}
          size="sm"
          className="ml-1"
        />
        {months > 0 && (() => {
          const today = new Date();
          const start = new Date(today.getFullYear(), today.getMonth() - months, 1);
          const s = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
          const e = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
          return (
            <span className="ml-1">
              <StatusPill tone="emerald" size="xs">{s} ~ {e}</StatusPill>
            </span>
          );
        })()}
      </div>
      {/* 검색 + 필터 */}
      <div className="px-3 py-2 border-b border-zinc-100 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* 2026-08-29 · #165 A · SearchBar 프리미티브 (X 초기화 · 최근 검색 · 결과 카운트 자동) */}
          <div className="flex-1 min-w-[140px]">
            <SearchBar
              value={query}
              onChange={setQuery}
              placeholder={limit >= 50000 ? "전체 상품 검색" : "TOP 리스트 내 검색"}
              resultCount={displayRows.length}
              historyKey="megatown_stockFlow_search"
              accent="indigo"
              widthClass="w-full"
            />
          </div>
          {onOpenProductInfo && (
            <button
              type="button"
              onClick={() => {
                const q = query.trim();
                if (displayRows.length > 0) onOpenProductInfo(displayRows[0]);
                else if (q) {
                  api.get<any[]>(`/api/products-search?q=${encodeURIComponent(q)}`)
                    .then(({ data }) => { if (Array.isArray(data) && data.length > 0) onOpenProductInfo(data[0]); })
                    .catch(() => { });
                }
              }}
              disabled={!query.trim() && displayRows.length === 0}
              title="선택 상품의 상세 정보 (판매리스트 상품명 클릭과 동일)"
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-white bg-teal-500 hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-2 py-1.5 cursor-pointer transition shadow-sm active:scale-95"
            >
              <Info size={12} /> 정보확인
            </button>
          )}
          {onOpenHiddenManager && (
            <button
              type="button"
              onClick={onOpenHiddenManager}
              title="숨김 처리된 상품 관리"
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-white border border-amber-300 hover:bg-amber-50 rounded-lg px-2 py-1.5 cursor-pointer transition shadow-sm active:scale-95"
            >
              <EyeOff size={12} /> 숨김 관리
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="text-zinc-500 font-bold shrink-0">판매</span>
          <input type="number" min={0} value={saleMin}
            onChange={(e) => setSaleMin(e.target.value)} placeholder="최소"
            className="flex-1 min-w-0 px-1.5 py-1 border border-line rounded text-[11px] tabular-nums text-right focus:outline-none focus:border-brand-deep" />
          <span className="text-zinc-400 shrink-0">~</span>
          <input type="number" min={0} value={saleMax}
            onChange={(e) => setSaleMax(e.target.value)} placeholder="최대"
            className="flex-1 min-w-0 px-1.5 py-1 border border-line rounded text-[11px] tabular-nums text-right focus:outline-none focus:border-brand-deep" />
          {(saleMin || saleMax) && (
            <button onClick={() => { setSaleMin(""); setSaleMax(""); }}
              className="text-[10px] font-bold text-rose-500 hover:text-rose-700 px-1.5 py-1 rounded hover:bg-rose-50 transition cursor-pointer shrink-0">✕</button>
          )}
        </div>
      </div>
      {/* 리스트 헤더 (접기/펼치기) */}
      <div
        className="px-3 pt-1.5 pb-0.5 flex items-center gap-2 border-t border-zinc-100 bg-white cursor-pointer select-none hover:bg-zinc-50 transition"
        onClick={() => setSaleListCollapsed(v => !v)}
        title={saleListCollapsed ? "펼치기" : "접기"}
      >
        <span className={`text-zinc-400 text-xs transition-transform ${saleListCollapsed ? "" : "rotate-90"}`}>▶</span>
        <span className="text-[11px] font-bold text-zinc-600">{listLabel}</span>
        <span className="text-[10px] tabular-nums text-zinc-400">({displayRows.length}건)</span>
      </div>
      <div className={`flex-1 overflow-auto relative max-h-[50vh] ${saleListCollapsed ? "hidden" : ""}`}>
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[1px] pointer-events-none">
            <div className="w-10 h-10 border-4 border-line border-t-orange-500 rounded-full animate-spin" />
            <div className="mt-3 text-xs font-bold text-zinc-600">데이터 로딩중...</div>
          </div>
        )}
        {displayRows.length === 0 && !loading ? (
          <div className="text-center text-[11px] text-zinc-300 py-6">데이터 없음</div>
        ) : displayRows.length === 0 && loading ? (
          <div className="text-center text-[11px] text-zinc-300 py-6">&nbsp;</div>
        ) : (
          <table className={`w-full text-xs ${loading ? "opacity-40 transition-opacity" : ""}`}>
            <thead className="sticky top-0 bg-zinc-50 border-b-2 border-line z-10 shadow-sm">
              {selectedCodes.size > 0 && (
                <tr className="bg-rose-50 border-b border-rose-200">
                  <td colSpan={10} className="px-2 py-1.5">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-bold text-rose-700">{selectedCodes.size}개 선택됨</span>
                      <button onClick={bulkHide} disabled={bulkHiding}
                        className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500 hover:bg-rose-600 text-white font-bold shadow-sm disabled:opacity-50">
                        {bulkHiding ? <Spinner size={11} tone="white" /> : <EyeOff size={11} />}
                        선택 숨김
                      </button>
                      <button onClick={() => setSelectedCodes(new Set())}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-bold">
                        <X size={11} /> 해제
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              <tr className="text-[11px] text-zinc-500 uppercase tracking-wider">
                <th className="text-center px-0.5 py-1.5 w-6">
                  <button onClick={() => {
                    if (selectedCodes.size === displayRows.length) setSelectedCodes(new Set());
                    else setSelectedCodes(new Set(displayRows.map(r => String(r.product_code))));
                  }} className="text-zinc-400 hover:text-rose-500 transition inline-flex items-center justify-center" title="전체 선택/해제">
                    {selectedCodes.size === displayRows.length && displayRows.length > 0
                      ? <CheckSquare size={13} className="text-rose-500" />
                      : <Square size={13} />}
                  </button>
                </th>
                <th className="text-left px-0.5 py-1.5 w-6">#</th>
                <th onClick={() => toggleSort("name")}
                  className={`text-left px-1 py-1.5 min-w-[120px] cursor-pointer select-none hover:bg-zinc-50 ${sort === "name" ? "text-zinc-800 font-bold" : "text-zinc-500"}`}
                ><span className="inline-flex items-center gap-0.5">상품명{arrow("name")}</span></th>
                <th onClick={() => toggleSort("sale")}
                  className={`text-right px-0.5 py-1.5 w-14 cursor-pointer select-none hover:bg-orange-100 bg-orange-50/60 ${sort === "sale" ? "text-orange-700 font-bold" : "text-orange-500"}`}
                ><span className="inline-flex items-center gap-0.5">판매{arrow("sale")}</span></th>
                <th onClick={() => toggleSort("loss")}
                  className={`text-right px-0.5 py-1.5 w-12 cursor-pointer select-none hover:bg-rose-100 bg-rose-50/60 ${sort === "loss" ? "text-rose-700 font-bold" : "text-rose-500"}`}
                ><span className="inline-flex items-center gap-0.5">손실{arrow("loss")}</span></th>
                <th onClick={() => toggleSort("amount")}
                  className={`text-right px-0.5 py-1.5 w-16 cursor-pointer select-none hover:bg-indigo-100 bg-indigo-50/60 ${sort === "amount" ? "text-indigo-700 font-bold" : "text-indigo-500"}`}
                  title="판매가 (products.sale_price)"
                ><span className="inline-flex items-center gap-0.5">판매가{arrow("amount")}</span></th>
                <th onClick={() => toggleSort("purchase_price")}
                  className={`text-right px-0.5 py-1.5 w-16 cursor-pointer select-none hover:bg-zinc-100 bg-zinc-50/60 ${sort === "purchase_price" ? "text-zinc-800 font-bold" : "text-zinc-500"}`}
                  title="사입가 (products.purchase_price)"
                ><span className="inline-flex items-center gap-0.5">사입가{arrow("purchase_price")}</span></th>
                <th onClick={() => toggleSort("profit_rate")}
                  className={`text-right px-0.5 py-1.5 w-14 cursor-pointer select-none hover:bg-emerald-100 bg-emerald-50/60 ${sort === "profit_rate" ? "text-emerald-800 font-bold" : "text-emerald-600"}`}
                  title="이익률 = (판매가 − 사입가) / 판매가 × 100"
                ><span className="inline-flex items-center gap-0.5">이익률{arrow("profit_rate")}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {displayRows.map((p, i) => {
                const close = Number(p.closing_stock ?? 0);
                const loss = calcLoss(p);
                const salePrice = Number(p.sale_price ?? 0);
                const purchasePrice = Number((p as any).purchase_price ?? 0);
                const profitRate = salePrice > 0 && purchasePrice > 0 ? ((salePrice - purchasePrice) / salePrice) * 100 : null;
                return (
                  <tr
                    key={`sf-${p.product_code}-${i}`}
                    className={`transition cursor-pointer ${selectedCode === String(p.product_code) ? "bg-teal-50 border-l-4 border-teal-500" : selectedCodes.has(String(p.product_code)) ? "bg-rose-50/50" : "hover:bg-zinc-50/60"}`}
                    onClick={() => onProductClick(p)}
                  >
                    <td className="text-center px-0.5 py-1.5 align-top" onClick={(e) => { e.stopPropagation(); toggleSelectCode(String(p.product_code)); }}>
                      {selectedCodes.has(String(p.product_code))
                        ? <CheckSquare size={13} className="text-rose-500 inline" />
                        : <Square size={13} className="text-zinc-300 hover:text-rose-500 inline" />}
                    </td>
                    <td className="px-0.5 py-1.5 text-[12px] font-bold text-orange-600 align-top">{i + 1}</td>
                    <td className="px-1 py-1.5 align-top">
                      <div className="text-[13px] font-medium text-zinc-800 break-words whitespace-normal leading-tight" title={p.product_name}>
                        {p.product_name}
                        {(p as any).min_order != null && (p as any).min_order > 0 && (
                          <span className="inline-flex items-center ml-1 px-1 py-0.5 rounded text-[10px] font-bold text-sky-700 bg-sky-100 border border-sky-300 align-middle" title={`최소주문량 ${(p as any).min_order}`}>
                            최소{(p as any).min_order}
                          </span>
                        )}
                      </div>
                      {p.supplier && (
                        <div className="flex items-center gap-1 flex-wrap mt-0.5">
                          <span className="text-[11px] text-zinc-400 break-words whitespace-normal">{p.supplier}</span>
                          {vendorCategoryMap && <VendorCategoryBadge category={vendorCategoryMap[p.supplier] ?? null} />}
                        </div>
                      )}
                    </td>
                    <td className="text-right px-0.5 py-1.5 tabular-nums font-bold text-orange-700 text-[12px] bg-orange-50/40 align-top">{fmt(p.sale_qty)}</td>
                    <td
                      className={`text-right px-0.5 py-1.5 tabular-nums text-[12px] bg-rose-50/40 align-top ${loss > 0 ? "text-rose-600 font-bold" : loss < 0 ? "text-emerald-600 font-bold" : "text-zinc-400"}`}
                      title={`손실 = (시작${fmt(Number(p.opening_stock))} − 판매${fmt(Number(p.sale_qty))}) − 종료${fmt(close)} = ${loss > 0 ? "-" + fmt(loss) : loss < 0 ? "+" + fmt(Math.abs(loss)) : "0"}${Number(p.purchase_qty) > 0 ? `\n입고: ${fmt(Number(p.purchase_qty))} (참고)` : ""}${Number(p.disposal_qty ?? 0) > 0 ? `\n폐기: ${fmt(Number(p.disposal_qty ?? 0))} (참고)` : ""}`}
                    >{loss === 0 ? "0" : loss > 0 ? `-${fmt(loss)}` : `+${fmt(Math.abs(loss))}`}</td>
                    <td className="text-right px-0.5 py-1.5 tabular-nums text-[12px] text-indigo-700 font-bold bg-indigo-50/40 align-top" title={salePrice > 0 ? `${salePrice.toLocaleString()}원` : undefined}>{salePrice > 0 ? fmtWon(salePrice) : "-"}</td>
                    <td className="text-right px-0.5 py-1.5 tabular-nums text-[12px] text-zinc-700 font-bold bg-zinc-50/40 align-top" title={purchasePrice > 0 ? `${purchasePrice.toLocaleString()}원` : undefined}>{purchasePrice > 0 ? fmtWon(purchasePrice) : "-"}</td>
                    <td className={`text-right px-0.5 py-1.5 tabular-nums text-[12px] font-bold bg-emerald-50/40 align-top ${profitRate == null ? "text-zinc-400" : profitRate >= 30 ? "text-emerald-700" : profitRate >= 10 ? "text-emerald-600" : "text-rose-600"}`} title={profitRate != null ? `(판매가 ${salePrice.toLocaleString()} - 사입가 ${purchasePrice.toLocaleString()}) / 판매가 = ${profitRate.toFixed(2)}%` : "판매가 또는 사입가 미설정"}>
                      {profitRate == null ? "-" : `${profitRate.toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
