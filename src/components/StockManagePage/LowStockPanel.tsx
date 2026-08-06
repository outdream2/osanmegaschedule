// src/components/StockManagePage/LowStockPanel.tsx
// 적정재고 이하(low) 탭을 독립 컴포넌트로 추출 (2026-07-31 · 탭 스왑 · OrderManagePage 이동용)
// 기존 StockManagePage의 stockTab === "low" 블록 state/fetch/JSX 를 그대로 캡슐화
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useConfirm } from "../../hooks/useConfirm";
import { useVendors } from "../../hooks/useVendors";
import { AlertTriangle, Check, X as XIcon, Loader2 as LoaderIcon, Pencil, ChevronRight, ChevronDown, CheckCircle2, ShoppingCart } from "lucide-react";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import { getProductsMap, lookupProduct, type ProductInfo } from "../../lib/productsCache";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { EmptyState } from "../common/EmptyState";
import { LoadingState } from "../common/LoadingState";
import { CARD_BASE, TEXT } from "../../styles/tokens";
import { useColumnResize, RESIZER_CLS } from "../../hooks/useColumnResize";

// ── ProductLite (low-stock API 응답 shape) ───────────────────────────────
interface ProductLite {
  product_name: string;
  product_code: string | null;
  spec: string | null;
  current_stock: number | null;
  optimal_stock: number | null;
  supplier: string | null;
  real_map: string | null;
  warehouse_stock?: number | null;
  store_stock?: number | null;
  inv_checked_at?: string | null;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

// ── LowStockPanel (메인 export) ──────────────────────────────────────────
export const LowStockPanel: React.FC = () => {
  const confirm = useConfirm();

  const { getWidth, resizerProps } = useColumnResize("lowStock", {
    num:     { default: 28,  min: 24, max: 60  },
    name:    { default: 150, min: 80, max: 360 },
    erp:     { default: 56,  min: 40, max: 120 },
    wh:      { default: 56,  min: 40, max: 120 },
    st:      { default: 56,  min: 40, max: 120 },
    actual:  { default: 56,  min: 40, max: 120 },
    optimal: { default: 56,  min: 40, max: 120 },
    need:    { default: 56,  min: 40, max: 120 },
    order:   { default: 80,  min: 60, max: 140 },
  });
  // ── 데이터 ──────────────────────────────────────────────────────────────
  const [lowStock, setLowStock] = useState<ProductLite[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLowStock = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stock-manage/low-stock");
      if (res.ok) setLowStock(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLowStock(); }, [fetchLowStock]);

  // 실재고 저장 이벤트 수신 → 자동 재조회
  const fetchLowStockRef = useRef(fetchLowStock);
  useEffect(() => { fetchLowStockRef.current = fetchLowStock; }, [fetchLowStock]);
  useEffect(() => {
    const handler = () => { fetchLowStockRef.current(); };
    window.addEventListener("inventory-checks-updated", handler);
    window.addEventListener("products-hidden-changed", handler);
    return () => {
      window.removeEventListener("inventory-checks-updated", handler);
      window.removeEventListener("products-hidden-changed", handler);
    };
  }, []);

  // ── 발주요청 ────────────────────────────────────────────────────────────
  const [orderRequestingCode, setOrderRequestingCode] = useState<string | null>(null);
  const [orderRequestedCodes, setOrderRequestedCodes] = useState<Set<string>>(new Set());
  const requestOrderFromLow = useCallback(async (p: any) => {
    const code = String(p.product_code ?? "").trim();
    if (!code) return;
    if (!await confirm({ message: `'${p.product_name}' 을(를) 발주요청 리스트에 추가하시겠습니까?` })) return;
    setOrderRequestingCode(code);
    try {
      const res = await fetch("/api/order-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_code: code,
          product_name: String(p.product_name ?? ""),
          current_stock: p.current_stock ?? 0,
          optimal_stock: p.optimal_stock ?? 0,
          supplier: p.supplier ?? null,
          requested_at: new Date().toISOString(),
        }),
      });
      if (res.ok) {
        setOrderRequestedCodes(prev => { const n = new Set(prev); n.add(code); return n; });
      } else {
        alert(`발주요청 실패 (${res.status})`);
      }
    } catch (e: any) {
      alert(`발주요청 실패: ${e?.message ?? "네트워크 오류"}`);
    } finally {
      setOrderRequestingCode(null);
    }
  }, []);

  // ── 적정재고 인라인 편집 ────────────────────────────────────────────────
  const [optimalEditCode, setOptimalEditCode] = useState<string | null>(null);
  const [optimalEditValue, setOptimalEditValue] = useState<string>("");
  const [optimalEditSaving, setOptimalEditSaving] = useState(false);
  const startOptimalEdit = (code: string, current: number) => {
    setOptimalEditCode(code);
    setOptimalEditValue(current > 0 ? String(current) : "");
  };
  const cancelOptimalEdit = () => { setOptimalEditCode(null); setOptimalEditValue(""); };
  const commitOptimalEdit = useCallback(async () => {
    if (!optimalEditCode) return;
    const val = optimalEditValue.trim();
    const num = val === "" ? null : Number(val);
    if (val !== "" && (!Number.isFinite(num) || (num as number) < 0)) {
      alert("숫자만 입력 (0 이상)");
      return;
    }
    setOptimalEditSaving(true);
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(optimalEditCode)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optimal_stock: num }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        alert(b.error ?? `저장 실패 (${res.status})`);
        return;
      }
      setLowStock(prev => prev.map(p =>
        String(p.product_code) === optimalEditCode
          ? { ...p, optimal_stock: num }
          : p
      ));
      setOptimalEditCode(null);
      setOptimalEditValue("");
      try { window.dispatchEvent(new CustomEvent("products-hidden-changed")); } catch { /* ignore */ }
    } catch (e: any) {
      alert(e?.message ?? "네트워크 오류");
    } finally { setOptimalEditSaving(false); }
  }, [optimalEditCode, optimalEditValue]);

  // ── 분류 필터 + 공급사 카테고리 맵 ──────────────────────────────────────
  type CategoryFilter = "전체" | "위탁" | "선결제" | "60회전" | "90회전" | "기타";
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("전체");
  const { vendorCategoryMap } = useVendors();

  // ── 그룹 접기 ──────────────────────────────────────────────────────────
  type LowGroup = "basic" | "stock" | "inv" | "erp";
  const [lowGroupCollapsed, setLowGroupCollapsed] = useState<Set<LowGroup>>(new Set());
  const toggleLowGroup = (g: LowGroup) => setLowGroupCollapsed(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const isLowGroupCollapsed = (g: LowGroup) => lowGroupCollapsed.has(g);

  // ── 좌우 패널 ──────────────────────────────────────────────────────────
  const [lowStockCollapsed, setLowStockCollapsed] = useState(false);
  const [lowPanelWidth, setLowPanelWidth] = useState<number>(() => {
    const defaultW = typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.6) : 800;
    try { const v = Number(localStorage.getItem("megatown_stockmanage_low_w")); return Number.isFinite(v) && v > 0 ? v : defaultW; } catch { return defaultW; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_stockmanage_low_w", String(lowPanelWidth)); } catch { /**/ } }, [lowPanelWidth]);
  const lowPanelWidthRef = useRef(lowPanelWidth);
  useEffect(() => { lowPanelWidthRef.current = lowPanelWidth; }, [lowPanelWidth]);
  const lowResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onLowResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    lowResizeRef.current = { startX: e.clientX, startW: lowPanelWidthRef.current };
    const move = (ev: MouseEvent) => { const r = lowResizeRef.current; if (!r) return; setLowPanelWidth(Math.min(1000, Math.max(320, r.startW + (ev.clientX - r.startX)))); };
    const up = () => { lowResizeRef.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  // ── 선택 상품 (우측 패널) ───────────────────────────────────────────────
  const [lowSelectedProduct, setLowSelectedProduct] = useState<ProductInfo | null>(null);
  const loadLowSelectedProduct = useCallback(async (p: any) => {
    const code = String(p.product_code ?? "").trim();
    const partial: ProductInfo = {
      code,
      name: String(p.product_name ?? ""),
      spec: String(p.spec ?? ""),
      current_stock: p.current_stock ?? null,
      optimal_stock: p.optimal_stock ?? null,
      supplier: p.supplier ?? null,
      real_map: p.real_map ?? null,
      warehouse_stock: p.warehouse_stock ?? null,
      store_stock: p.store_stock ?? null,
    };
    setLowSelectedProduct(partial);
    try {
      let full = lookupProduct(code);
      if (!full) { const map = await getProductsMap(); full = map[code] ?? map[code.replace(/^0+/, "")] ?? null; }
      if (full) setLowSelectedProduct(prev => {
        if (!prev || prev.code !== code) return prev;
        const o: Record<string, any> = {};
        for (const [k, v] of Object.entries(prev)) if (v !== null && v !== undefined) o[k] = v;
        return { ...full, ...o, code, name: full.name || prev.name };
      });
    } catch { /**/ }
  }, []);

  // ── 렌더 ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-2">
      {/* ── 상단 필터바 ── */}
      <div className={`${CARD_BASE} px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2`}>
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-rose-500 shrink-0" />
          <span className={`${TEXT.body} text-slate-800`}>추천적정재고 이하</span>
          <span className="text-[11px] font-semibold text-rose-600 bg-rose-100 rounded-full px-2 py-0.5 tabular-nums">{lowStock.length}개</span>
        </div>
        <span className={`${TEXT.caption} text-slate-400`}>현재고 &lt; 추천적정재고 · 상품명 클릭 → 상세</span>
        {/* 분류 세그먼트 필터 */}
        <div className="flex flex-wrap bg-slate-50 border border-slate-200 rounded-md p-0.5 gap-0.5">
          {(["전체", "위탁", "선결제", "60회전", "90회전", "기타"] as const).map(cat => (
            <button key={cat} onClick={() => setCategoryFilter(cat)}
              className={`h-7 px-2.5 text-[11px] font-semibold rounded transition cursor-pointer ${
                categoryFilter === cat
                  ? cat === "전체"   ? "bg-slate-700 text-white shadow-sm"
                  : cat === "위탁"   ? "bg-violet-500 text-white shadow-sm"
                  : cat === "선결제" ? "bg-rose-500 text-white shadow-sm"
                  : cat === "60회전" ? "bg-emerald-500 text-white shadow-sm"
                  : cat === "90회전" ? "bg-teal-500 text-white shadow-sm"
                  : "bg-slate-500 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}>{cat}</button>
          ))}
        </div>
        <button
          type="button"
          onClick={fetchLowStock}
          disabled={loading}
          className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-300 text-slate-400 hover:text-rose-500 transition disabled:opacity-40 cursor-pointer"
          title="새로고침"
        >
          <LoaderIcon size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ── 하단 · 좌우 split ── */}
      <div className="flex flex-col lg:flex-row gap-2 lg:min-h-[520px]">
        {/* 좌측: 적정재고 이하 리스트 */}
        <div
          className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
          style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? lowPanelWidth : undefined }}
        >
          <div className={`${CARD_BASE} flex-1 min-h-0 flex flex-col overflow-hidden`}>
            {!lowStockCollapsed && (
              <div className="flex-1 overflow-y-auto relative">
                {loading && lowStock.length > 0 && (
                  <div className="flex items-center justify-center gap-1.5 text-[10px] text-rose-600 font-bold py-1.5 mb-1 bg-rose-50 border border-rose-200 rounded-md sticky top-0 z-10">
                    <LoaderIcon size={11} className="animate-spin" /> 조건 변경 · 새로 불러오는 중...
                  </div>
                )}
                {loading && lowStock.length === 0 ? (
                  <LoadingState tone="slate" size="compact" label="데이터 로딩중..." />
                ) : lowStock.length === 0 ? (
                  <EmptyState
                    icon={AlertTriangle}
                    title="추천적정재고 이하 상품 없음"
                    size="compact"
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs sm:min-w-[480px]" style={{ tableLayout: "fixed" }}>
                      <thead className="sticky top-0 z-10">
                        {/* 그룹 컬러 헤더 */}
                        <tr className="text-[10px] font-semibold uppercase tracking-wider border-b border-slate-200">
                          <th colSpan={2} className="bg-slate-50 text-slate-400 text-left px-2 py-1.5">기본정보</th>
                          <th className="bg-rose-50 text-rose-600 text-center px-2 py-1.5 cursor-pointer select-none hover:bg-rose-100 transition"
                            onClick={() => toggleLowGroup("stock")}
                            title={isLowGroupCollapsed("stock") ? "ERP재고 펼치기" : "ERP재고 접기"}>
                            <span className="inline-flex items-center gap-1">
                              {isLowGroupCollapsed("stock") ? <ChevronRight size={11} /> : <ChevronDown size={11} />}ERP
                            </span>
                          </th>
                          <th colSpan={isLowGroupCollapsed("inv") ? 1 : 3}
                            className="bg-slate-100/60 text-slate-500 text-center px-2 py-1.5 cursor-pointer select-none hover:bg-slate-200/60 transition"
                            onClick={() => toggleLowGroup("inv")}
                            title={isLowGroupCollapsed("inv") ? "실재고 펼치기" : "실재고 접기"}>
                            <span className="inline-flex items-center gap-1">
                              {isLowGroupCollapsed("inv") ? <ChevronRight size={11} /> : <ChevronDown size={11} />}실재고
                            </span>
                          </th>
                          <th className="bg-indigo-50 text-indigo-600 text-center px-2 py-1.5">추천</th>
                          <th className="bg-rose-100 text-rose-700 text-right px-2 py-1.5">필요</th>
                          <th className="bg-slate-50 text-slate-400 text-center px-2 py-1.5">발주</th>
                        </tr>
                        {/* 컬럼 서브헤더 · 리사이즈 지원 */}
                        <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider bg-white">
                          <th className="relative text-left px-2 py-1.5" style={{ width: getWidth("num"), minWidth: getWidth("num") }}>
                            #
                            <span {...resizerProps("num")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                          </th>
                          <th className="relative text-left px-2 py-1.5" style={{ width: getWidth("name"), minWidth: getWidth("name") }}>
                            상품명
                            <span {...resizerProps("name")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                          </th>
                          {isLowGroupCollapsed("stock") ? (
                            <th className="bg-rose-50/20" style={{ width: 16, minWidth: 16 }}></th>
                          ) : (
                            <th className="relative text-right px-2 py-1.5 bg-rose-50/40 text-rose-600" style={{ width: getWidth("erp"), minWidth: getWidth("erp") }} title="ERP 현재고 (products.current_stock)">
                              현재고
                              <span {...resizerProps("erp")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                            </th>
                          )}
                          {isLowGroupCollapsed("inv") ? (
                            <th className="bg-slate-50/20" style={{ width: 16, minWidth: 16 }}></th>
                          ) : (
                            <>
                              <th className="relative text-right px-2 py-1.5 bg-slate-50/60 text-slate-500" style={{ width: getWidth("wh"), minWidth: getWidth("wh") }} title="실재고 · 창고">
                                창고
                                <span {...resizerProps("wh")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                              </th>
                              <th className="relative text-right px-2 py-1.5 bg-slate-50/60 text-slate-500" style={{ width: getWidth("st"), minWidth: getWidth("st") }} title="실재고 · 매장">
                                매장
                                <span {...resizerProps("st")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                              </th>
                              <th className="relative text-right px-2 py-1.5 bg-rose-50/30 text-rose-500" style={{ width: getWidth("actual"), minWidth: getWidth("actual") }} title="실재고 합계 (창고+매장)">
                                실재고
                                <span {...resizerProps("actual")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                              </th>
                            </>
                          )}
                          <th className="relative text-right px-2 py-1.5 bg-indigo-50/40 text-indigo-600" style={{ width: getWidth("optimal"), minWidth: getWidth("optimal") }} title="추천 적정재고 (편집 가능)">
                            적정재고
                            <span {...resizerProps("optimal")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                          </th>
                          <th className="relative text-right px-2 py-1.5 text-rose-600 bg-rose-50/60" style={{ width: getWidth("need"), minWidth: getWidth("need") }}>
                            필요
                            <span {...resizerProps("need")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                          </th>
                          <th className="relative text-center px-2 py-1.5" style={{ width: getWidth("order"), minWidth: getWidth("order") }} title="발주요청 리스트에 추가">
                            발주요청
                            <span {...resizerProps("order")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {lowStock.filter(p => {
                          if (categoryFilter === "전체") return true;
                          const sup = String(p.supplier ?? "").trim();
                          return vendorCategoryMap[sup] === categoryFilter;
                        }).slice(0, 200).map((p, i) => {
                          const cur = Number(p.current_stock ?? 0);
                          const opt = Number(p.optimal_stock ?? 0);
                          const need = Math.max(0, opt - cur);
                          const wh = p.warehouse_stock;
                          const st = p.store_stock;
                          const isSelected = lowSelectedProduct?.code === String(p.product_code ?? "");
                          return (
                            <tr key={`low-${p.product_name}-${i}`} className={`transition ${isSelected ? "bg-rose-50/30" : "hover:bg-slate-50/60"}`}>
                              <td className="px-2 py-2 text-slate-400 font-medium text-[11px] align-top tabular-nums">{i + 1}</td>
                              <td className="px-2 py-2 align-top">
                                <button
                                  onClick={() => loadLowSelectedProduct(p)}
                                  className="text-left text-[12px] font-semibold text-slate-700 hover:text-rose-700 hover:underline break-words whitespace-normal leading-snug cursor-pointer transition"
                                  title={`${p.product_name} — 클릭 시 상세 정보`}
                                >
                                  {p.product_name}
                                </button>
                                {p.supplier && (
                                  <div className="flex flex-col leading-tight mt-0.5">
                                    <VendorCategoryBadge category={vendorCategoryMap[String(p.supplier).trim()] ?? null} />
                                    <span className="text-[11px] text-slate-500 whitespace-nowrap">{p.supplier}</span>
                                  </div>
                                )}
                              </td>
                              {isLowGroupCollapsed("stock") ? (
                                <td className="bg-rose-50/10 w-4"></td>
                              ) : (
                                <td className={`text-right px-2 py-2 tabular-nums text-[12px] font-semibold align-top bg-rose-50/30 ${cur <= 0 ? "text-rose-600" : "text-slate-700"}`} title="ERP 현재고 (products.current_stock)">{fmt(cur)}</td>
                              )}
                              {isLowGroupCollapsed("inv") ? (
                                <td className="bg-slate-50/20 w-4"></td>
                              ) : (() => {
                                const whN = wh != null ? Number(wh) : null;
                                const stN = st != null ? Number(st) : null;
                                const realTotal = whN != null || stN != null ? (whN ?? 0) + (stN ?? 0) : null;
                                const mismatch = realTotal != null && realTotal !== cur;
                                return (
                                  <>
                                    <td className={`text-right px-2 py-2 tabular-nums text-[12px] font-medium bg-slate-50/60 align-top ${wh != null ? "text-slate-600" : "text-slate-300"}`} title={p.inv_checked_at ? `실재고 창고 · 최근입력 ${new Date(p.inv_checked_at).toLocaleDateString("ko-KR")}` : "창고 실재고 미입력"}>
                                      {wh != null ? fmt(Number(wh)) : "—"}
                                    </td>
                                    <td className={`text-right px-2 py-2 tabular-nums text-[12px] font-medium bg-slate-50/60 align-top ${st != null ? "text-slate-600" : "text-slate-300"}`} title={p.inv_checked_at ? `실재고 매장 · 최근입력 ${new Date(p.inv_checked_at).toLocaleDateString("ko-KR")}` : "매장 실재고 미입력"}>
                                      {st != null ? fmt(Number(st)) : "—"}
                                    </td>
                                    <td
                                      className={`text-right px-2 py-2 tabular-nums text-[12px] font-semibold align-top bg-rose-50/20 ${realTotal == null ? "text-slate-300" : mismatch ? "text-red-600" : "text-emerald-700"}`}
                                      title={realTotal == null ? "실재고 미입력" : mismatch ? `실재고 ${realTotal} ≠ ERP ${cur} · 불일치` : "실재고 = 창고 + 매장"}
                                    >{realTotal != null ? fmt(realTotal) : "—"}</td>
                                  </>
                                );
                              })()}
                              <td className="text-right px-2 py-2 tabular-nums text-slate-500 align-top">
                                {optimalEditCode === String(p.product_code) ? (
                                  <div className="flex items-center justify-end gap-0.5">
                                    <input
                                      autoFocus
                                      type="number"
                                      min={0}
                                      inputMode="numeric"
                                      value={optimalEditValue}
                                      onChange={(e) => setOptimalEditValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") { e.preventDefault(); commitOptimalEdit(); }
                                        else if (e.key === "Escape") { e.preventDefault(); cancelOptimalEdit(); }
                                      }}
                                      disabled={optimalEditSaving}
                                      className="w-12 text-right tabular-nums text-[11px] font-semibold border-2 border-indigo-400 rounded-md px-1 py-0.5 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 bg-white"
                                    />
                                    <button
                                      type="button"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={commitOptimalEdit}
                                      disabled={optimalEditSaving}
                                      className="p-1 rounded bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95 transition disabled:opacity-50 shadow-sm"
                                      title="저장"
                                    >
                                      <Check size={11} strokeWidth={3} />
                                    </button>
                                    <button
                                      type="button"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={cancelOptimalEdit}
                                      className="p-1 rounded bg-slate-200 text-slate-600 hover:bg-slate-300 active:scale-95 transition shadow-sm"
                                      title="취소"
                                    >
                                      <XIcon size={11} strokeWidth={3} />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => startOptimalEdit(String(p.product_code), opt)}
                                    className="w-full h-7 flex items-center justify-end gap-1 text-right tabular-nums text-[11px] font-semibold hover:bg-indigo-50 active:bg-indigo-100 border border-transparent hover:border-indigo-200 rounded-md px-2 cursor-pointer transition"
                                    title="탭하여 적정재고 편집"
                                  >
                                    <span className={opt > 0 ? "text-slate-700" : "text-slate-400"}>{opt > 0 ? fmt(opt) : "입력"}</span>
                                    <Pencil size={9} className="text-indigo-400 shrink-0" />
                                  </button>
                                )}
                              </td>
                              <td className="text-right px-2 py-2 tabular-nums text-[12px] font-bold text-rose-600 bg-rose-50/40 align-top">{need > 0 ? `+${fmt(need)}` : "-"}</td>
                              {/* 발주요청 버튼 */}
                              <td className="text-center px-2 py-2 align-top">
                                {(() => {
                                  const code = String(p.product_code ?? "");
                                  const busy = orderRequestingCode === code;
                                  const done = orderRequestedCodes.has(code);
                                  if (done) return (
                                    <button
                                      type="button"
                                      disabled
                                      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-black text-emerald-700 bg-emerald-50 ring-1 ring-inset ring-emerald-300 cursor-not-allowed whitespace-nowrap"
                                      title="발주요청 리스트에 추가됨"
                                    >
                                      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-500 text-white shrink-0">
                                        <CheckCircle2 size={9} strokeWidth={3} />
                                      </span>
                                      <span>추가됨</span>
                                    </button>
                                  );
                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); requestOrderFromLow(p); }}
                                      disabled={busy}
                                      className="relative inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-black text-white bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-600 hover:via-orange-600 hover:to-rose-600 shadow-sm shadow-amber-500/30 hover:shadow-md hover:shadow-orange-500/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all duration-200 cursor-pointer whitespace-nowrap ring-1 ring-inset ring-white/20"
                                      title="발주요청 리스트에 추가"
                                    >
                                      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-white/25 backdrop-blur shrink-0">
                                        {busy ? <LoaderIcon size={9} strokeWidth={2.5} className="animate-spin" /> : <ShoppingCart size={9} strokeWidth={2.5} />}
                                      </span>
                                      <span>{busy ? "추가 중" : "발주요청"}</span>
                                    </button>
                                  );
                                })()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 리사이즈 핸들 (데스크탑만) */}
        <div onMouseDown={onLowResizeStart}
          className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-slate-200 hover:bg-rose-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
          title="드래그하여 폭 조절">
          <span className="text-[9px] text-slate-400 group-hover:text-white font-black rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
        </div>

        {/* 우측: 상품 상세 · ProductDetailRightPanel (공용) */}
        <ProductDetailRightPanel
          selected={lowSelectedProduct}
          onClose={() => setLowSelectedProduct(null)}
          onProductUpdate={(u) => setLowSelectedProduct(prev => prev ? { ...prev, ...u } : prev)}
          onRealMapUpdate={(v) => setLowSelectedProduct(prev => prev ? { ...prev, real_map: v } : prev)}
          showChart={true}
          context="stock-manage"
          editable={true}
          emptySub="상세 정보가 표시됩니다"
        />
      </div>
    </div>
  );
};

export default LowStockPanel;
