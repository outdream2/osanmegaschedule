// src/components/StockManagePage/DiffTab.tsx
// 손실추적 탭 — 실재고(창고+매장) vs ERP 현재고 차이 리스트
// 2026-08-03 · StockManagePage 에서 분리 · OrderManagePage 통계 탭에서도 사용
// 2026-08-17 · apiClient 마이그레이션

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/apiClient";
import { Layers, Loader2 as LoaderIcon, ChevronRight, ChevronDown, ListChecks, History } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { Card } from "../common/Card";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import { AccentBar } from "../common/AccentBar";
import { VendorDetailModal } from "../LandingPage/VendorListEditor";
// 2026-08-23 · #191 Phase A · Modal 프레임워크화 · 인라인 backdrop → Modal 프리미티브
import { Modal } from "../common/Modal";
import { getProductsMap, lookupProduct, type ProductInfo } from "../../lib/productsCache";
import { matchClassFilter, type ClassFilter } from "../../utils/productClassify";
import { useVendors } from "../../hooks/useVendors";
import { displayVendorName } from "../../utils/vendorNameNormalize";
import { EmptyState } from "../common/EmptyState";
import { LoadingState } from "../common/LoadingState";
import { CARD_BASE, TEXT } from "../../styles/tokens";
import { useColumnResize, RESIZER_CLS } from "../../hooks/useColumnResize";
// 2026-08-21 · Framework Phase 3 · alert → useToast
import { useToast, toastClass } from "../../hooks/useToast";
// 2026-08-06 · T-LOSS-HISTORY · 서브탭 (현황/이력) · TabBar 공용
import { TabBar, type TabDef } from "../common/TabBar";
import { StatusPill } from "../common/StatusPill";
import { LossHistoryTab } from "./LossHistoryTab";

// 2026-08-06 · T-LOSS-HISTORY · 서브탭 종류
type SubTabKey = "current" | "history";

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
  // 2026-08-06 · 손실추적 확장 · 단가·판매가 표시용
  purchase_price?: number | null;
  sale_price?: number | null;
}

export const DiffTab: React.FC = () => {
  // 2026-08-21 · Framework Phase 3 · alert → useToast
  const { toast, showError } = useToast();
  // 2026-08-06 · T-LOSS-HISTORY · 상단 서브탭 (현황/이력) · localStorage 저장
  const [subTab, setSubTab] = useState<SubTabKey>(() => {
    try {
      const v = localStorage.getItem("megatown_difftab_subtab");
      return v === "history" ? "history" : "current";
    } catch { return "current"; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_difftab_subtab", subTab); } catch { /**/ } }, [subTab]);
  const subTabs: TabDef<SubTabKey>[] = useMemo(() => [
    { key: "current", label: "현황", icon: ListChecks, color: "violet" },
    { key: "history", label: "이력", icon: History,    color: "sky"    },
  ], []);

  const { findVendorByName } = useVendors();
  // 2026-08-06 · 손실추적 최종 · 상품·공급사·ERP재고·실재고·손실·사입단가·판매가 (v3)
  const { getWidth, resizerProps } = useColumnResize("diffTab_v3", {
    num:      { default: 28,  min: 24, max: 60  },
    name:     { default: 220, min: 120, max: 420 },
    supplier: { default: 120, min: 70,  max: 240 },
    erp:      { default: 64,  min: 40, max: 120 },
    actual:   { default: 72,  min: 40, max: 120 },
    loss:     { default: 64,  min: 40, max: 120 },
    price:    { default: 72,  min: 50, max: 140 },
    sale:     { default: 72,  min: 50, max: 140 },
  });
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
    showError(`공급사 정보 없음: ${supplierName}`);
  }, [findVendorByName, showError]);

  // 데이터 fetch
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<any>("/api/stock-manage/low-stock");
      setLowStock(data);
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
      {/* ── 서브탭 (현황/이력) · 2026-08-06 T-LOSS-HISTORY ── */}
      <TabBar<SubTabKey>
        level={3}
        tabs={subTabs}
        activeKey={subTab}
        onSelect={setSubTab}
        variant="nested"
        maxWidth="100%"
      />

      {subTab === "history" ? (
        <LossHistoryTab />
      ) : (
      <>
      {/* ── 상단 필터바 · 2026-08-17 · accent bar + StatusPill 통일 ── */}
      <div className={`${CARD_BASE} px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2`}>
        <div className="flex items-center gap-2.5">
          <AccentBar />
          <Layers size={16} className="text-brand-deep shrink-0" />
          <span className="text-[17px] font-bold text-ink tracking-tight">손실추적</span>
          <StatusPill tone="violet" size="md">{diffList.length}건</StatusPill>
          <span className={`${TEXT.caption} text-ink-soft hidden sm:inline`}>실재고(창고+매장) ↔ ERP 차이 · 도난·파손·미기록 판매·재고 오류 · 상품명 클릭 → 상세</span>
        </div>
        <button
          type="button"
          onClick={fetchData}
          disabled={loading}
          className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-line bg-white hover:bg-violet-50 hover:border-violet-300 text-zinc-400 hover:text-violet-500 transition disabled:opacity-40 cursor-pointer"
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
          <div className={`${CARD_BASE} flex-1 min-h-0 flex flex-col overflow-hidden`}>
            {/* 상비약/일반약/전체 3-way 필터 */}
            <div className="flex items-center gap-1 border-b-2 border-line bg-white px-2 pt-1 shrink-0">
              <button type="button" onClick={() => setClassFilter("stationery")}
                className={`relative px-4 py-2 text-[13px] font-bold leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "stationery" ? "text-violet-700" : "text-zinc-400 hover:text-zinc-600"}`}>
                상비약 <span className="text-[11px] font-semibold text-zinc-400 ml-1 tabular-nums">({essentialCount})</span>
                {classFilter === "stationery" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-violet-500" />}
              </button>
              <button type="button" onClick={() => setClassFilter("general")}
                className={`relative px-4 py-2 text-[13px] font-bold leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "general" ? "text-sky-700" : "text-zinc-400 hover:text-zinc-600"}`}>
                일반약 <span className="text-[11px] font-semibold text-zinc-400 ml-1 tabular-nums">({generalCount})</span>
                {classFilter === "general" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-sky-500" />}
              </button>
              <button type="button" onClick={() => setClassFilter("all")}
                className={`relative px-4 py-2 text-[13px] font-bold leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "all" ? "text-zinc-800" : "text-zinc-400 hover:text-zinc-600"}`}>
                전체 <span className="text-[11px] font-semibold text-zinc-400 ml-1 tabular-nums">({allCount})</span>
                {classFilter === "all" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-zinc-500" />}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto relative">
              {loading && diffList.length > 0 && (
                <Card variant="flat" bg="bg-violet-50" borderColor="border-violet-200" rounded="md" padding="none" className="flex items-center justify-center gap-1.5 text-[10px] text-violet-600 font-bold py-1.5 mb-1 sticky top-0 z-10">
                  <Spinner size={11} tone="violet" /> 조건 변경 · 새로 불러오는 중...
                </Card>
              )}
              {loading && diffList.length === 0 ? (
                <LoadingState tone="slate" size="compact" label="데이터 로딩중..." />
              ) : diffList.length === 0 ? (
                <EmptyState
                  icon={Layers}
                  title="차이 있는 상품 없음"
                  hint="실재고와 ERP 현재고가 일치합니다"
                  size="compact"
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:min-w-[280px]" style={{ tableLayout: "fixed" }}>
                    <thead className="sticky top-0 z-10">
                      {/* 카테고리 그룹 헤더 (1단) · 2026-08-06 · 상품·공급사·ERP·실재고·손실·가격 */}
                      <tr className="text-[10px] font-semibold uppercase tracking-wider border-b border-line">
                        <th colSpan={3} className="bg-zinc-50 text-zinc-400 text-left px-2 py-1.5">기본정보</th>
                        <th className="bg-zinc-100/60 text-zinc-500 text-right px-2 py-1.5 cursor-pointer select-none hover:bg-zinc-200/60 transition"
                          onClick={() => toggleDiffGroup("erp")}
                          title={isDiffGroupCollapsed("erp") ? "ERP재고 펼치기" : "ERP재고 접기"}>
                          <span className="inline-flex items-center gap-1 justify-end">
                            {isDiffGroupCollapsed("erp") ? <ChevronRight size={11} /> : <ChevronDown size={11} />}ERP재고
                          </span>
                        </th>
                        <th className="bg-violet-50 text-violet-600 text-right px-2 py-1.5 cursor-pointer select-none hover:bg-violet-100 transition"
                          onClick={() => toggleDiffGroup("actual")}
                          title={isDiffGroupCollapsed("actual") ? "실재고 펼치기" : "실재고 접기"}>
                          <span className="inline-flex items-center gap-1 justify-end">
                            {isDiffGroupCollapsed("actual") ? <ChevronRight size={11} /> : <ChevronDown size={11} />}실재고
                          </span>
                        </th>
                        <th className="bg-rose-100 text-rose-700 text-right px-2 py-1.5">손실</th>
                        <th colSpan={2} className="bg-amber-50 text-amber-700 text-right px-2 py-1.5">가격</th>
                      </tr>
                      {/* 컬럼 헤더 (2단) · 리사이즈 지원 */}
                      <tr className="border-b border-zinc-100 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider bg-white">
                        <th className="relative text-left px-2 py-1.5" style={{ width: getWidth("num"), minWidth: getWidth("num") }}>
                          #
                          <span {...resizerProps("num")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                        </th>
                        <th className="relative text-left px-2 py-1.5" style={{ width: getWidth("name"), minWidth: getWidth("name") }}>
                          상품
                          <span {...resizerProps("name")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                        </th>
                        <th className="relative text-left px-2 py-1.5 text-sky-700" style={{ width: getWidth("supplier"), minWidth: getWidth("supplier") }}>
                          공급사
                          <span {...resizerProps("supplier")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                        </th>
                        {isDiffGroupCollapsed("erp") ? (
                          <th className="bg-zinc-50/20" style={{ width: 16, minWidth: 16 }}></th>
                        ) : (
                          <th className="relative text-right px-2 py-1.5 bg-zinc-50/40 text-zinc-500" style={{ width: getWidth("erp"), minWidth: getWidth("erp") }}>
                            ERP재고
                            <span {...resizerProps("erp")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                          </th>
                        )}
                        {isDiffGroupCollapsed("actual") ? (
                          <th className="bg-violet-50/10" style={{ width: 16, minWidth: 16 }}></th>
                        ) : (
                          <th className="relative text-right px-2 py-1.5 bg-violet-50/40 text-violet-600" style={{ width: getWidth("actual"), minWidth: getWidth("actual") }}>
                            실재고
                            <span {...resizerProps("actual")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                          </th>
                        )}
                        <th className="relative text-right px-2 py-1.5 bg-rose-50/40 text-rose-700" style={{ width: getWidth("loss"), minWidth: getWidth("loss") }}>
                          손실
                          <span {...resizerProps("loss")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                        </th>
                        <th className="relative text-right px-2 py-1.5 bg-amber-50/40 text-amber-700" style={{ width: getWidth("price"), minWidth: getWidth("price") }}>
                          사입단가
                          <span {...resizerProps("price")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                        </th>
                        <th className="relative text-right px-2 py-1.5 bg-amber-50/40 text-amber-700" style={{ width: getWidth("sale"), minWidth: getWidth("sale") }}>
                          판매가
                          <span {...resizerProps("sale")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {diffList.slice(0, 100).map((p: any, i: number) => {
                        const isSelected = diffSelectedProduct?.code === String(p.product_code ?? "");
                        // 손실 = ERP - 실재고 (양수면 손실 · 음수면 초과)
                        const loss = p.cur - p.actual;
                        return (
                          <tr key={`diff-${p.product_name}-${i}`} className={`transition ${isSelected ? "bg-violet-50/30" : "hover:bg-zinc-50/60"}`}>
                            <td className="px-2 py-2 text-zinc-400 font-medium text-[11px] align-top tabular-nums">{i + 1}</td>
                            <td className="px-2 py-2 align-top">
                              <button
                                onClick={() => loadDiffSelectedProduct(p)}
                                className="text-left text-[12px] font-semibold text-zinc-700 hover:text-violet-700 hover:underline break-words whitespace-normal leading-snug cursor-pointer transition"
                                title={p.product_name}
                              >
                                {p.product_name}
                              </button>
                            </td>
                            <td className="px-2 py-2 align-top text-[11px] text-sky-700 break-words whitespace-normal leading-snug">
                              {p.supplier ? displayVendorName(p.supplier) : <span className="text-zinc-300">-</span>}
                            </td>
                            {isDiffGroupCollapsed("erp") ? (
                              <td className="bg-zinc-50/10 w-4"></td>
                            ) : (
                              <td className="text-right px-2 py-2 tabular-nums text-[12px] font-normal bg-zinc-50/40 text-zinc-600 align-top">{fmt(p.cur)}</td>
                            )}
                            {isDiffGroupCollapsed("actual") ? (
                              <td className="bg-violet-50/10 w-4"></td>
                            ) : (
                              <td className="text-right px-2 py-2 tabular-nums text-[12px] font-normal bg-violet-50/30 text-violet-700 align-top">{fmt(p.actual)}</td>
                            )}
                            <td className={`text-right px-2 py-2 tabular-nums text-[12px] font-normal bg-rose-50/40 align-top ${loss > 0 ? "text-rose-700" : "text-emerald-600"}`}>
                              {loss > 0 ? fmt(loss) : loss < 0 ? `+${fmt(-loss)}` : "0"}
                            </td>
                            <td className="text-right px-2 py-2 tabular-nums text-[12px] font-normal bg-amber-50/20 text-amber-700 align-top">
                              {p.purchase_price != null && p.purchase_price > 0 ? fmt(p.purchase_price) : "-"}
                            </td>
                            <td className="text-right px-2 py-2 tabular-nums text-[12px] font-normal bg-amber-50/20 text-amber-700 align-top">
                              {p.sale_price != null && p.sale_price > 0 ? fmt(p.sale_price) : "-"}
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
          className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-zinc-200 hover:bg-purple-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
          title="드래그하여 폭 조절">
          <span className="text-[9px] text-zinc-400 group-hover:text-white font-bold rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
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

      {/* 공급사 상세 모달 · 2026-08-23 · #191 Phase A · Modal 프리미티브 이관 */}
      <Modal
        open={!!supplierDetailModal}
        onClose={() => setSupplierDetailModal(null)}
        size="3xl"
        zIndex={100}
        bodyPadding="none"
        showClose={false}
        cardStyle={{ maxHeight: "90vh" }}
      >
        {supplierDetailModal && (
          <VendorDetailModal
            vendor={supplierDetailModal}
            onClose={() => setSupplierDetailModal(null)}
            onSaved={() => setSupplierDetailModal(null)}
          />
        )}
      </Modal>
      </>
      )}
      {/* 2026-08-21 · Framework Phase 3 · toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
    </div>
  );
};

export default DiffTab;
