// src/components/StockManagePage/DiffTab.tsx
// 손실추적 탭 — 실재고(창고+매장) vs ERP 현재고 차이 리스트
// 2026-08-03 · StockManagePage 에서 분리 · OrderManagePage 통계 탭에서도 사용

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layers, Loader2 as LoaderIcon, ChevronRight, ChevronDown } from "lucide-react";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import { VendorDetailModal } from "../LandingPage/VendorListEditor";
import { getProductsMap, lookupProduct, type ProductInfo } from "../../lib/productsCache";
import { matchClassFilter, type ClassFilter } from "../../utils/productClassify";
import { useVendors } from "../../hooks/useVendors";

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

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
}

export const DiffTab: React.FC = () => {
  const { findVendorByName } = useVendors();
  const [lowStock, setLowStock] = useState<ProductLite[]>([]);
  const [loading, setLoading] = useState(false);
  // 상비약/일반약/전체 3-way 필터 (localStorage 저장)
  const [classFilter, setClassFilter] = useState<ClassFilter>(() => {
    try {
      const v = localStorage.getItem("megatown_diff_classfilter");
      return v === "stationery" || v === "general" || v === "all" ? v : "all";
    } catch { return "all"; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_diff_classfilter", classFilter); } catch { /**/ } }, [classFilter]);

  // 패널 폭 (localStorage 저장)
  const [diffPanelWidth, setDiffPanelWidth] = useState<number>(() => {
    const defaultW = typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.6) : 800;
    try { const v = Number(localStorage.getItem("megatown_stockmanage_diff_w")); return Number.isFinite(v) && v > 0 ? v : defaultW; } catch { return defaultW; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_stockmanage_diff_w", String(diffPanelWidth)); } catch { /**/ } }, [diffPanelWidth]);
  const diffPanelWidthRef = useRef(diffPanelWidth);
  useEffect(() => { diffPanelWidthRef.current = diffPanelWidth; }, [diffPanelWidth]);
  const diffResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onDiffResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    diffResizeRef.current = { startX: e.clientX, startW: diffPanelWidthRef.current };
    const move = (ev: MouseEvent) => { const r = diffResizeRef.current; if (!r) return; setDiffPanelWidth(Math.min(1000, Math.max(320, r.startW + (ev.clientX - r.startX)))); };
    const up = () => { diffResizeRef.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  // 선택 상품 (우측 패널)
  const [diffSelectedProduct, setDiffSelectedProduct] = useState<ProductInfo | null>(null);
  const loadDiffSelectedProduct = useCallback(async (p: any) => {
    const code = String(p.product_code ?? "").trim();
    const partial: ProductInfo = { code, name: String(p.product_name ?? ""), spec: String(p.spec ?? ""), current_stock: p.current_stock ?? null, optimal_stock: p.optimal_stock ?? null, supplier: p.supplier ?? null, real_map: p.real_map ?? null, warehouse_stock: p.warehouse_stock ?? null, store_stock: p.store_stock ?? null };
    setDiffSelectedProduct(partial);
    try {
      let full = lookupProduct(code);
      if (!full) { const map = await getProductsMap(); full = map[code] ?? map[code.replace(/^0+/, "")] ?? null; }
      if (full) setDiffSelectedProduct(prev => { if (!prev || prev.code !== code) return prev; const o: Record<string, any> = {}; for (const [k, v] of Object.entries(prev)) if (v !== null && v !== undefined) o[k] = v; return { ...full, ...o, code, name: full.name || prev.name }; });
    } catch { /**/ }
  }, []);

  // 컬럼 그룹 접기
  type DiffGroup = "basic" | "erp" | "actual" | "diff";
  const [diffGroupCollapsed, setDiffGroupCollapsed] = useState<Set<DiffGroup>>(new Set());
  const toggleDiffGroup = (g: DiffGroup) => setDiffGroupCollapsed(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const isDiffGroupCollapsed = (g: DiffGroup) => diffGroupCollapsed.has(g);

  // 공급사 상세 모달 · useVendors 캐시에서 fuzzy 조회 (inline fetch 제거)
  const [supplierDetailModal, setSupplierDetailModal] = useState<any | null>(null);
  const openSupplierDetailModal = useCallback((supplierName: string) => {
    if (!supplierName) return;
    const found = findVendorByName(supplierName);
    if (found) { setSupplierDetailModal(found); return; }
    alert(`공급사 정보 없음: ${supplierName}`);
  }, [findVendorByName]);

  // 데이터 fetch
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stock-manage/low-stock");
      if (res.ok) setLowStock(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // inventory-checks 업데이트 이벤트 대응
  const fetchDataRef = useRef(fetchData);
  useEffect(() => { fetchDataRef.current = fetchData; }, [fetchData]);
  useEffect(() => {
    const handler = () => fetchDataRef.current();
    window.addEventListener("inventory-checks-updated", handler);
    return () => window.removeEventListener("inventory-checks-updated", handler);
  }, []);

  // classFilter 를 제외한 base 리스트 (탭 카운트 계산용)
  const diffBase = useMemo(() => lowStock
    .map(p => {
      const wh = p.warehouse_stock;
      const st = p.store_stock;
      if (wh == null && st == null) return null;
      const actual = (Number(wh) || 0) + (Number(st) || 0);
      const cur = Number(p.current_stock ?? 0);
      const diff = actual - cur;
      if (diff === 0) return null;
      return { ...p, actual, cur, diff };
    })
    .filter(Boolean) as Array<any>, [lowStock]);

  // 3-way tab 카운트
  const essentialCount = useMemo(() => diffBase.filter(p => matchClassFilter(p.real_map, "stationery")).length, [diffBase]);
  const generalCount = useMemo(() => diffBase.filter(p => matchClassFilter(p.real_map, "general")).length, [diffBase]);
  const allCount = diffBase.length;

  // 차이 리스트 (classFilter 적용)
  const diffList = useMemo(() =>
    classFilter === "all" ? diffBase : diffBase.filter(p => matchClassFilter(p.real_map, classFilter)),
    [diffBase, classFilter]);

  return (
    <div className="flex flex-col gap-2">
      {/* ── 상단 필터바 ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-violet-500 shrink-0" />
          <span className="text-[13px] font-semibold text-slate-800">손실추적</span>
          <span className="text-[11px] font-semibold text-violet-600 bg-violet-50 rounded-full px-2 py-0.5 border border-violet-200 tabular-nums">{diffList.length}건</span>
          <span className="text-[11px] text-slate-400 hidden sm:inline">실재고(창고+매장) ↔ ERP 차이 · 도난·파손·미기록 판매·재고 오류 · 상품명 클릭 → 상세</span>
        </div>
        <button
          type="button"
          onClick={fetchData}
          disabled={loading}
          className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-violet-50 hover:border-violet-300 text-slate-400 hover:text-violet-500 transition disabled:opacity-40 cursor-pointer"
          title="새로고침"
        >
          <LoaderIcon size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ── 하단 좌우 split ── */}
      <div className="flex flex-col lg:flex-row gap-2 lg:min-h-[520px]">
        {/* 좌측: 차이 리스트 */}
        <div
          className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
          style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? diffPanelWidth : undefined }}
        >
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* 상비약/일반약/전체 3-way 필터 */}
            <div className="flex items-center gap-1 border-b-2 border-slate-200 bg-white px-2 pt-1 shrink-0">
              <button type="button" onClick={() => setClassFilter("stationery")}
                className={`relative px-4 py-2 text-[13px] font-black leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "stationery" ? "text-violet-700" : "text-slate-400 hover:text-slate-600"}`}>
                상비약 <span className="text-[11px] font-semibold text-slate-400 ml-1 tabular-nums">({essentialCount})</span>
                {classFilter === "stationery" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-violet-500" />}
              </button>
              <button type="button" onClick={() => setClassFilter("general")}
                className={`relative px-4 py-2 text-[13px] font-black leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "general" ? "text-sky-700" : "text-slate-400 hover:text-slate-600"}`}>
                일반약 <span className="text-[11px] font-semibold text-slate-400 ml-1 tabular-nums">({generalCount})</span>
                {classFilter === "general" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-sky-500" />}
              </button>
              <button type="button" onClick={() => setClassFilter("all")}
                className={`relative px-4 py-2 text-[13px] font-black leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "all" ? "text-slate-800" : "text-slate-400 hover:text-slate-600"}`}>
                전체 <span className="text-[11px] font-semibold text-slate-400 ml-1 tabular-nums">({allCount})</span>
                {classFilter === "all" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-slate-500" />}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto relative">
              {loading && diffList.length > 0 && (
                <div className="flex items-center justify-center gap-1.5 text-[10px] text-violet-600 font-bold py-1.5 mb-1 bg-violet-50 border border-violet-200 rounded-md sticky top-0 z-10">
                  <LoaderIcon size={11} className="animate-spin" /> 조건 변경 · 새로 불러오는 중...
                </div>
              )}
              {loading && diffList.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10">
                  <div className="w-9 h-9 border-4 border-violet-100 border-t-violet-400 rounded-full animate-spin" />
                  <div className="text-[11px] font-semibold text-slate-500">데이터 로딩중...</div>
                </div>
              ) : diffList.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
                  <Layers size={28} className="opacity-20" />
                  <div className="text-[12px] font-semibold">차이 있는 상품 없음</div>
                  <div className="text-[11px] text-slate-300">실재고와 ERP 현재고가 일치합니다</div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:min-w-[280px]">
                    <thead className="sticky top-0 z-10">
                      <tr className="text-[10px] font-semibold uppercase tracking-wider border-b border-slate-200">
                        <th colSpan={2} className="bg-slate-50 text-slate-400 text-left px-2 py-1.5">기본정보</th>
                        <th className="bg-slate-100/60 text-slate-500 text-right px-2 py-1.5 cursor-pointer select-none hover:bg-slate-200/60 transition"
                          onClick={() => toggleDiffGroup("erp")}
                          title={isDiffGroupCollapsed("erp") ? "ERP 펼치기" : "ERP 접기"}>
                          <span className="inline-flex items-center gap-1 justify-end">
                            {isDiffGroupCollapsed("erp") ? <ChevronRight size={11} /> : <ChevronDown size={11} />}ERP
                          </span>
                        </th>
                        <th className="bg-violet-50 text-violet-600 text-right px-2 py-1.5 cursor-pointer select-none hover:bg-violet-100 transition"
                          onClick={() => toggleDiffGroup("actual")}
                          title={isDiffGroupCollapsed("actual") ? "실재고 펼치기" : "실재고 접기"}>
                          <span className="inline-flex items-center gap-1 justify-end">
                            {isDiffGroupCollapsed("actual") ? <ChevronRight size={11} /> : <ChevronDown size={11} />}실재고
                          </span>
                        </th>
                        <th className="bg-violet-100 text-violet-700 text-right px-2 py-1.5">차이</th>
                      </tr>
                      <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider bg-white">
                        <th className="text-left px-2 py-1.5 w-7">#</th>
                        <th className="text-left px-2 py-1.5">상품명</th>
                        {isDiffGroupCollapsed("erp") ? (
                          <th className="bg-slate-50/20 w-4"></th>
                        ) : (
                          <th className="text-right px-2 py-1.5 w-14 bg-slate-50/40 text-slate-500">현재고</th>
                        )}
                        {isDiffGroupCollapsed("actual") ? (
                          <th className="bg-violet-50/10 w-4"></th>
                        ) : (
                          <th className="text-right px-2 py-1.5 w-16 bg-violet-50/40 text-violet-600">실재고</th>
                        )}
                        <th className="text-right px-2 py-1.5 w-14 text-violet-700">차이</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {diffList.slice(0, 100).map((p: any, i: number) => {
                        const isSelected = diffSelectedProduct?.code === String(p.product_code ?? "");
                        return (
                          <tr key={`diff-${p.product_name}-${i}`} className={`transition ${isSelected ? "bg-violet-50/30" : "hover:bg-slate-50/60"}`}>
                            <td className="px-2 py-2 text-slate-400 font-medium text-[11px] align-top tabular-nums">{i + 1}</td>
                            <td className="px-2 py-2 align-top">
                              <button
                                onClick={() => loadDiffSelectedProduct(p)}
                                className="text-left text-[12px] font-semibold text-slate-700 hover:text-violet-700 hover:underline break-words whitespace-normal leading-snug cursor-pointer transition"
                                title={p.product_name}
                              >
                                {p.product_name}
                              </button>
                              {p.supplier && <div className="text-[10px] text-slate-400 break-words whitespace-normal mt-0.5">{p.supplier}</div>}
                            </td>
                            {isDiffGroupCollapsed("erp") ? (
                              <td className="bg-slate-50/10 w-4"></td>
                            ) : (
                              <td className="text-right px-2 py-2 tabular-nums text-[12px] font-medium bg-slate-50/40 text-slate-600 align-top">{fmt(p.cur)}</td>
                            )}
                            {isDiffGroupCollapsed("actual") ? (
                              <td className="bg-violet-50/10 w-4"></td>
                            ) : (
                              <td className="text-right px-2 py-2 tabular-nums text-[12px] font-semibold bg-violet-50/30 text-violet-700 align-top">{fmt(p.actual)}</td>
                            )}
                            <td className={`text-right px-2 py-2 tabular-nums text-[12px] font-bold align-top ${p.diff > 0 ? "text-emerald-600" : "text-rose-500"}`}>
                              {p.diff > 0 ? `+${fmt(p.diff)}` : fmt(p.diff)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 리사이즈 핸들 (데스크탑만) */}
        <div onMouseDown={onDiffResizeStart}
          className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-slate-200 hover:bg-purple-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
          title="드래그하여 폭 조절">
          <span className="text-[9px] text-slate-400 group-hover:text-white font-black rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
        </div>

        {/* 우측: 상품 상세 · ProductDetailRightPanel (공용) */}
        <ProductDetailRightPanel
          selected={diffSelectedProduct}
          onClose={() => setDiffSelectedProduct(null)}
          onProductUpdate={(u) => setDiffSelectedProduct(prev => prev ? { ...prev, ...u } : prev)}
          onRealMapUpdate={(v) => setDiffSelectedProduct(prev => prev ? { ...prev, real_map: v } : prev)}
          showChart={true}
          context="stock-manage"
          editable={true}
          emptySub="상세 정보가 표시됩니다"
          onSupplierInfoOpen={(nm) => openSupplierDetailModal(nm)}
        />
      </div>

      {/* 공급사 상세 모달 */}
      {supplierDetailModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" onClick={() => setSupplierDetailModal(null)}>
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-auto bg-white rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <VendorDetailModal
              vendor={supplierDetailModal}
              onClose={() => setSupplierDetailModal(null)}
              onSaved={() => setSupplierDetailModal(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default DiffTab;
