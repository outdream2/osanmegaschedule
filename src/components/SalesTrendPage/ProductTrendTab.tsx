// src/components/SalesTrendPage/ProductTrendTab.tsx
// 2026-08-22 · Framework Phase 4 · SalesTrendPage.tsx 에서 분리
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LineChart, Package, X, Info } from "lucide-react";
import { Modal } from "../common/Modal";
import { ProductInfoCard } from "../ScanPage/ProductInfoCard";
import { SeasonButtons } from "../common/SeasonButtons";
import { getProductsMap, lookupProduct, type ProductInfo } from "../../lib/productsCache";
import { CARD_BASE, TEXT } from "../../styles/tokens";
import { api } from "../../lib/apiClient";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import type { PeriodRow } from "./SalesTrendPage.helpers";
import { fmt, periodLabel, fillPeriodsWithRows, aggregateToMonths } from "./SalesTrendPage.helpers";
import { MultiLineChart } from "./MultiLineChart";
import { StockFlowPanel } from "./StockFlowPanel";

// ─── 상품별 판매추이 탭 ──────────────────────────────────────────────────────
const ProductTrendTab: React.FC<{
  granularity: "10day" | "month";
  chartRangeDays: number;
  onChartMonthsChange?: (m: 1 | 2 | 3 | 4 | 5 | 6) => void;
  onGranularityChange?: (g: "10day" | "month") => void;
  activeTab?: "product" | "supplier";
  onTabChange?: (t: "product" | "supplier") => void;
  onOpenProductInfo?: (p: any) => void;
  onOpenHiddenManager?: () => void;
}> = ({ granularity, chartRangeDays, onChartMonthsChange, onGranularityChange, onOpenProductInfo, onOpenHiddenManager }) => {
  const [selected, setSelected] = useState<any | null>(null);
  const [rows, setRows] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(false);
  const rangeDays = chartRangeDays;
  const [chartSeason, setChartSeason] = useState<SeasonKey | null>(null);
  const [scanProductModal, setScanProductModal] = useState<ProductInfo | null>(null);

  const openScanProductModal = useCallback(async (p: any) => {
    const code = String(p.product_code ?? "").trim();
    const partial: ProductInfo = {
      code,
      name: String(p.product_name ?? ""),
      spec: String(p.spec ?? ""),
      current_stock: p.current_stock ?? null,
      optimal_stock: p.optimal_stock ?? null,
      supplier: p.supplier ?? p.supplier_name ?? null,
      real_map: p.real_map ?? null,
      warehouse_stock: p.warehouse_stock ?? null,
      store_stock: p.store_stock ?? null,
    };
    setScanProductModal(partial);
    try {
      let full = lookupProduct(code);
      if (!full) {
        const map = await getProductsMap();
        full = map[code] ?? map[code.replace(/^0+/, "")] ?? null;
      }
      if (full) {
        setScanProductModal(prev => {
          if (!prev || prev.code !== code) return prev;
          const overlay: Record<string, any> = {};
          for (const [k, v] of Object.entries(prev)) if (v !== null && v !== undefined) overlay[k] = v;
          return { ...full, ...overlay, code, name: full.name || prev.name };
        });
      }
    } catch { /* 캐시 로드 실패 시 partial 만 유지 */ }
  }, []);

  // 폭 조절 · localStorage 저장
  const [flowPanelWidth, setFlowPanelWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem("megatown_salestrend_flow_w")); return Number.isFinite(v) && v > 0 ? v : 640; } catch { return 640; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_salestrend_flow_w", String(flowPanelWidth)); } catch { /* ignore */ } }, [flowPanelWidth]);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startW: flowPanelWidth };
    const move = (ev: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const next = Math.min(1000, Math.max(320, r.startW + (ev.clientX - r.startX)));
      setFlowPanelWidth(next);
    };
    const up = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // 선택 상품의 시계열 fetch
  const rowsCache = useRef<Map<string, PeriodRow[]>>(new Map());
  useEffect(() => {
    if (!selected) { setRows([]); return; }
    const code = String(selected.product_code);
    const cacheKey = `${code}::${chartSeason ?? ""}`;
    const cached = rowsCache.current.get(cacheKey);
    if (cached) { setRows(cached); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams({ code });
        if (chartSeason) params.set("season", chartSeason);
        else params.set("months", "6");
        const { data: j } = await api.get<any>(`/api/sales-trend/product?${params}`);
        if (cancelled) return;
        const list: PeriodRow[] = Array.isArray(j.rows) ? j.rows : [];
        rowsCache.current.set(cacheKey, list);
        if (!cancelled) setRows(list);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [selected, chartSeason]);

  const filteredRows = useMemo(() => {
    const filled = fillPeriodsWithRows(
      rows,
      rangeDays,
      (start, end, period_type): PeriodRow => ({
        period_start_date: start,
        snapshot_date: end,
        period_type,
        opening_stock: 0, purchase_qty: 0, sale_qty: 0, disposal_qty: 0, closing_stock: 0,
        supply_amount: 0, total_amount: 0,
      })
    );
    return granularity === "month" ? aggregateToMonths(filled) : filled;
  }, [rows, rangeDays, granularity]);

  const chartData = useMemo(() => ({
    labels: filteredRows.map(r => granularity === "month"
      ? (() => { const m = /^(\d{4})-(\d{2})/.exec(r.period_start_date); return m ? `${Number(m[2])}월` : r.period_start_date; })()
      : periodLabel(r.period_start_date, r.snapshot_date)
    ),
    series: [
      { label: "매입", color: "#10b981", kind: "bar" as const, values: filteredRows.map(r => Number(r.purchase_qty ?? 0)), format: "count" as const },
      { label: "판매", color: "#dc2626", kind: "line" as const, values: filteredRows.map(r => Number(r.sale_qty ?? 0)), format: "count" as const },
      { label: "종료재고", color: "#6366f1", kind: "line" as const, values: filteredRows.map(r => Number(r.closing_stock ?? 0)), format: "count" as const },
    ],
  }), [filteredRows, granularity]);

  return (
    <div className="flex flex-col lg:flex-row gap-0 items-stretch lg:min-h-[720px]">
      {/* 좌측: 재고흐름 리스트 */}
      <div className="min-h-0 max-h-[75vh] lg:max-h-[720px] w-full lg:w-auto lg:shrink-0" style={{ width: window.innerWidth >= 1024 ? flowPanelWidth : undefined }}>
        <StockFlowPanel
          onProductClick={(row) => setSelected(row)}
          selectedCode={selected ? String(selected.product_code) : null}
          onOpenProductInfo={onOpenProductInfo}
          onOpenHiddenManager={onOpenHiddenManager}
        />
      </div>

      {/* 리사이즈 핸들 (데스크탑만) */}
      <div
        onMouseDown={onResizeStart}
        className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-zinc-200 hover:bg-teal-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
        title="드래그하여 폭 조절"
      >
        <span className="text-[9px] text-zinc-400 group-hover:text-white font-bold rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
      </div>

      {/* 우측: 차트 + 표 */}
      <div
        className={`flex flex-col gap-3 min-h-0 flex-1 min-w-0 lg:relative lg:p-0 transition-transform duration-150 ${selected ? "fixed inset-0 z-50 bg-zinc-50 overflow-y-auto lg:static lg:z-auto lg:bg-transparent lg:overflow-visible" : ""}`}
        style={{ willChange: selected ? "transform, opacity" : "auto", contain: selected ? "layout paint" : "none" }}
      >
        {/* 모바일 fullscreen 헤더 */}
        {selected && (
          <div className="lg:hidden sticky top-0 z-[60] bg-white border-b border-line shadow-md">
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="w-8 h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-600 cursor-pointer shrink-0"
                title="닫기"
              >
                <X size={16} strokeWidth={2.4} />
              </button>
              <div className="flex-1 min-w-0">
                <div className={`${TEXT.body} text-zinc-800 break-keep whitespace-normal leading-tight`}>
                  {rows[0]?.product_name ?? selected.product_name}
                </div>
                <div className="text-[10px] tabular-nums text-zinc-500 break-keep whitespace-normal">
                  #{selected.product_code} · {rows[0]?.supplier_name ?? selected.supplier ?? "-"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => openScanProductModal({ ...selected, ...(rows[0] ?? {}) })}
                className="w-8 h-8 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white flex items-center justify-center cursor-pointer shrink-0 shadow-sm"
                title="상세 정보"
              >
                <Info size={15} strokeWidth={2.4} />
              </button>
            </div>
          </div>
        )}
        {!selected ? (
          <div className="bg-white rounded-xl border border-line flex-1 flex flex-col items-center justify-center p-10 text-zinc-400">
            <Package size={40} className="mb-3 opacity-30" />
            <div className="text-sm font-bold">리스트에서 상품을 클릭하세요</div>
            <div className="text-[11px] mt-1">또는 검색 후 확인 버튼</div>
          </div>
        ) : loading ? (
          <div className="bg-white rounded-xl border border-line p-8 flex flex-col items-center justify-center gap-3 mx-3 mt-3">
            <div className="w-10 h-10 border-4 border-line border-t-teal-500 rounded-full animate-spin" />
            <div className="text-sm font-bold text-zinc-600">데이터 로딩중...</div>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="bg-white rounded-xl border border-line p-10 text-center text-zinc-400 text-sm mx-3 mt-3">
            <div>기간 생성 실패</div>
            <div className="text-[10px] mt-2">#{selected.product_code}</div>
          </div>
        ) : (
          <div className="px-3 py-3 lg:p-0 flex flex-col gap-3">
            {/* 데스크탑용 상품 요약 */}
            <div className="hidden lg:block bg-orange-50 border border-orange-200 rounded-xl p-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-base font-bold text-zinc-800 truncate">
                      {rows[0]?.product_name ?? selected.product_name}
                    </div>
                    <button
                      type="button"
                      onClick={() => openScanProductModal({ ...selected, ...(rows[0] ?? {}) })}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] rounded-lg px-2 py-1 cursor-pointer transition shadow-sm shrink-0"
                      title="상세 정보 · 실재고 입력 · 발주 요청"
                    >
                      <Info size={11} /> 정보확인
                    </button>
                  </div>
                  <div className="text-[11px] tabular-nums text-zinc-500">
                    #{selected.product_code} · {rows[0]?.supplier_name ?? selected.supplier ?? "-"}
                    {rows[0]?.spec ? ` · ${rows[0].spec}` : ""}
                  </div>
                </div>
                <div className="text-[11px] text-zinc-500">
                  최근 <span className="font-bold text-teal-600">{rangeDays}일</span>
                  {" · "}기간 <span className="font-bold text-zinc-800">{filteredRows.length}</span>개
                  {" · "}데이터 있음 <span className="font-bold text-emerald-600">{filteredRows.filter(r => (r.purchase_qty ?? 0) > 0 || (r.sale_qty ?? 0) > 0 || (r.closing_stock ?? 0) > 0).length}</span>개
                </div>
              </div>
            </div>

            {/* 차트 */}
            <div className="bg-white rounded-xl border border-line p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-1.5 shrink-0">
                  <LineChart size={14} className="text-teal-600" />
                  <span className="text-sm font-bold text-zinc-700">기간별 판매 · 매입 · 종료재고</span>
                </div>
                <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                  <div className="inline-flex items-center gap-1">
                    <span className="text-[9px] font-bold text-teal-700 uppercase tracking-wider">기간</span>
                    <div className="inline-flex bg-zinc-100 border border-line rounded-lg p-0.5">
                      {[1, 2, 3, 4, 5, 6].map(m => {
                        const active = Math.round(chartRangeDays / 30) === m;
                        return (
                          <button
                            key={m}
                            onClick={() => onChartMonthsChange?.(m as any)}
                            className={`min-w-[24px] px-1.5 py-0.5 text-[10px] font-bold rounded-md transition ${active ? "bg-orange-500 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-800 hover:bg-white"}`}
                          >{m}</button>
                        );
                      })}
                      <span className="text-[9px] font-bold text-zinc-400 self-center px-1">개월</span>
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-1">
                    <span className="text-[9px] font-bold text-teal-700 uppercase tracking-wider">X축</span>
                    <div className="inline-flex bg-zinc-100 border border-line rounded-lg p-0.5">
                      <button
                        onClick={() => onGranularityChange?.("10day")}
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition ${granularity === "10day" ? "bg-orange-500 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-800 hover:bg-white"}`}
                      >10일</button>
                      <button
                        onClick={() => onGranularityChange?.("month")}
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition ${granularity === "month" ? "bg-orange-500 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-800 hover:bg-white"}`}
                      >월</button>
                    </div>
                  </div>
                  <SeasonButtons value={chartSeason} onChange={setChartSeason} size="sm" hideLabel />
                </div>
              </div>
              <MultiLineChart {...chartData} />
            </div>

            {/* 표 */}
            <div className={`${CARD_BASE} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-50 border-b-2 border-line z-10 shadow-sm">
                    <tr className="text-[11px] text-zinc-500 uppercase tracking-wider">
                      <th className="text-left px-2 py-1.5">기간</th>
                      <th className="text-right px-2 py-1.5 w-16 bg-emerald-50/60 text-emerald-500">매입</th>
                      <th className="text-right px-2 py-1.5 w-16 bg-orange-50/60 text-orange-500">판매</th>
                      <th className="text-right px-2 py-1.5 w-16 bg-indigo-50/60 text-indigo-500">종료재고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {filteredRows.map((r, i) => (
                      <tr key={`r-${i}`} className="hover:bg-teal-50/30 transition">
                        <td className="px-2 py-1.5 align-top">
                          <div className="text-[13px] font-bold text-zinc-800 tabular-nums leading-tight">{periodLabel(r.period_start_date, r.snapshot_date)}</div>
                          <div className="text-[11px] text-zinc-400">{r.period_type === "early" ? "초순" : r.period_type === "mid" ? "중순" : r.period_type === "late" ? "하순" : "-"}</div>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-[12px] font-bold text-emerald-700 bg-emerald-50/40 align-top">{fmt(r.purchase_qty ?? 0)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-[12px] font-bold text-orange-700 bg-orange-50/40 align-top">{fmt(r.sale_qty ?? 0)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-[12px] font-bold text-indigo-700 bg-indigo-50/40 align-top">{fmt(r.closing_stock ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-zinc-50 border-t-2 border-line text-xs">
                    <tr>
                      <td className="px-2 py-1.5 text-right font-bold text-zinc-500 uppercase">합계</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-bold text-emerald-700 bg-emerald-50/40">
                        {fmt(filteredRows.reduce((n, r) => n + Number(r.purchase_qty ?? 0), 0))}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-bold text-orange-700 bg-orange-50/40">
                        {fmt(filteredRows.reduce((n, r) => n + Number(r.sale_qty ?? 0), 0))}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-bold text-indigo-700 bg-indigo-50/40">
                        {fmt(Number(filteredRows[filteredRows.length - 1]?.closing_stock ?? 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 정보확인 모달 */}
      <Modal
        open={!!scanProductModal}
        onClose={() => setScanProductModal(null)}
        size="md"
        titleAccent
        icon={<div className="w-10 h-10 rounded-xl bg-brand-deep flex items-center justify-center shadow-sm"><Package size={18} className="text-white" /></div>}
        title={
          scanProductModal ? (
            <div className="min-w-0">
              <div className="text-[17px] font-bold text-ink tracking-tight truncate">{scanProductModal.name}</div>
              <div className="text-[13px] tabular-nums text-ink-soft mt-0.5">#{scanProductModal.code}</div>
            </div>
          ) : null
        }
        backdropIntensity="brand"
      >
        {scanProductModal && (
          <div className="-mx-5 -my-5 p-4 bg-zinc-50">
            <ProductInfoCard
              product={scanProductModal}
              context="stock-manage"
              editable
              onRealMapUpdate={(newValue) => {
                setScanProductModal(prev => prev ? { ...prev, real_map: newValue } : prev);
              }}
              onProductUpdate={(updates) => {
                setScanProductModal(prev => prev ? { ...prev, ...updates } : prev);
              }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ProductTrendTab;
