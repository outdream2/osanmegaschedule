// src/components/OrderManagePage/ReturnListPanel.tsx
// 반품필요 탭을 독립 컴포넌트로 추출 (2026-07-31 · 탭 스왑 · StockManagePage 이동용)
// 기존 OrderManagePage의 return 탭 state/fetch/JSX 를 그대로 캡슐화
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Package, PackageCheck, RefreshCw, Truck, ChevronRight, ChevronDown } from "lucide-react";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import type { ProductInfo as ProductInfoType } from "../../lib/productsCache";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";

// ── 반품필요 모달 ────────────────────────────────────────────────────────
interface ReturnRequestModalProps {
  item: any;
  onClose: () => void;
}
const ReturnRequestModal: React.FC<ReturnRequestModalProps> = ({ item, onClose }) => {
  const [qty, setQty] = useState<number>(item.current_stock ?? 0);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const payload = {
        product_code: item.product_code,
        product_name: item.product_name,
        supplier: item.supplier,
        qty,
        note: note.trim() || null,
        purchase_cycle: item.purchase_cycle,
        sale_qty_month: item.sale_qty_month,
        sale_amount_month: item.sale_amount_month,
        current_stock: item.current_stock,
        purchase_price: item.purchase_price,
      };
      const res = await fetch("/api/return-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSent(true);
        setTimeout(onClose, 1200);
      } else {
        alert(`반품요청 실패 (${res.status})`);
      }
    } catch (e: any) {
      alert(`반품요청 실패: ${e?.message ?? "네트워크 오류"}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <Truck size={18} className="text-rose-500" />
          <h3 className="text-[15px] font-black text-slate-800">반품요청</h3>
        </div>
        <div className="space-y-3 text-[13px]">
          <div>
            <span className="text-slate-500 font-semibold">상품</span>
            <p className="font-bold text-slate-800 mt-0.5">{item.product_name}</p>
            <p className="text-[11px] text-slate-400 tabular-nums">{item.product_code}</p>
          </div>
          {item.supplier && (
            <div>
              <span className="text-slate-500 font-semibold">공급사</span>
              <div className="flex items-center gap-1 mt-0.5">
                <p className="font-bold text-slate-700">{item.supplier}</p>
                {item.vendorCategory && <VendorCategoryBadge category={item.vendorCategory} />}
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <div className="flex-1">
              <span className="text-slate-500 font-semibold">매입주기</span>
              <p className="font-black text-emerald-700 mt-0.5">{item.purchase_cycle != null ? `${item.purchase_cycle}일` : "-"}</p>
            </div>
            <div className="flex-1">
              <span className="text-slate-500 font-semibold">한달판매</span>
              <p className="font-black text-rose-600 mt-0.5">{item.sale_qty_month != null ? `${item.sale_qty_month.toLocaleString()}개` : "-"}</p>
            </div>
            <div className="flex-1">
              <span className="text-slate-500 font-semibold">현재고</span>
              <p className="font-black text-slate-700 mt-0.5 tabular-nums">{Number(item.current_stock).toLocaleString()}</p>
            </div>
          </div>
          <div>
            <label className="text-slate-500 font-semibold block mb-1">반품 수량</label>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={e => setQty(Math.max(1, Number(e.target.value) || 1))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] font-bold text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400"
            />
          </div>
          <div>
            <label className="text-slate-500 font-semibold block mb-1">메모 (선택)</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              placeholder="반품 사유 등"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[12px] resize-none focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onClose}
            className="flex-1 h-9 rounded-lg border border-slate-200 text-[13px] font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer">
            취소
          </button>
          <button type="button" onClick={send} disabled={sending || sent}
            className={`flex-1 h-9 rounded-lg text-[13px] font-black transition cursor-pointer ${sent ? "bg-emerald-100 text-emerald-700 border border-emerald-300" : "bg-rose-500 text-white hover:bg-rose-600 border border-rose-600"} disabled:opacity-60`}>
            {sent ? "전송 완료" : sending ? "전송 중..." : "반품요청 전송"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── ReturnListPanel (메인 export) ────────────────────────────────────────
export const ReturnListPanel: React.FC = () => {
  // ── state ──────────────────────────────────────────────────────────────
  type ReturnItem = {
    product_code: string;
    product_name: string;
    supplier: string | null;
    purchase_cycle: number | null;
    sale_qty_cycle: number;
    sale_qty_month: number | null;
    sale_amount_month: number | null;
    last_purchase_date: string | null;
    last_purchase_qty: number | null;
    current_stock: number;
    purchase_price: number;
  };
  const [returnList, setReturnList] = useState<ReturnItem[]>([]);
  const [returnLoading, setReturnLoading] = useState(false);
  const [returnCycleMin, setReturnCycleMin] = useState<number>(90);
  const [returnSalesMax, setReturnSalesMax] = useState<number>(5);
  // 2026-07-31 · 사용자 요청 · 공급사 검색 필터 (부분일치 · 대소문자 무시)
  const [returnSupplierSearch, setReturnSupplierSearch] = useState<string>("");

  type ReturnSortKey = "product_name" | "supplier" | "current_stock" | "purchase_cycle" | "sale_qty_month" | "sale_amount_month" | "last_purchase_date" | "last_purchase_qty" | "stock_value";
  const [returnSortKey, setReturnSortKey] = useState<ReturnSortKey>("purchase_cycle");
  const [returnSortDir, setReturnSortDir] = useState<"asc" | "desc">("desc");
  const handleReturnSort = (k: ReturnSortKey) => {
    if (returnSortKey === k) setReturnSortDir(d => d === "asc" ? "desc" : "asc");
    else { setReturnSortKey(k); setReturnSortDir("asc"); }
  };
  const retArrow = (k: ReturnSortKey) => returnSortKey !== k ? " ⇅" : returnSortDir === "asc" ? " ▲" : " ▼";

  const loadReturnList = useCallback(async () => {
    setReturnLoading(true);
    try {
      const res = await fetch("/api/stock-manage/top-sales?months=6&limit=5000&sort=sale&dir=desc");
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const rows: any[] = Array.isArray(data?.rows) ? data.rows : [];
      const items: ReturnItem[] = rows.map(r => {
        const cnt = Number(r.purchase_count ?? 0);
        const first = String(r.first_purchase_date ?? "");
        const last = String(r.last_purchase_date ?? "");
        let cycle: number | null = null;
        if (cnt >= 2 && first && last && first !== last) {
          const days = Math.round((new Date(last).getTime() - new Date(first).getTime()) / (86400 * 1000));
          cycle = cnt > 1 ? Math.round(days / (cnt - 1)) : null;
        }
        return {
          product_code: String(r.product_code ?? ""),
          product_name: String(r.product_name ?? ""),
          supplier: r.supplier ?? null,
          purchase_cycle: cycle,
          sale_qty_cycle: Number(r.sale_qty_cycle ?? 0),
          sale_qty_month: r.sale_qty_month != null ? Number(r.sale_qty_month) : (r.sale_qty_1m != null ? Number(r.sale_qty_1m) : null),
          sale_amount_month: r.sale_amount_month != null ? Number(r.sale_amount_month) : null,
          last_purchase_date: r.last_purchase_date ?? null,
          last_purchase_qty: r.last_purchase_qty != null ? Number(r.last_purchase_qty) : (r.last_snapshot_qty != null ? Number(r.last_snapshot_qty) : null),
          current_stock: Number(r.current_stock ?? r.closing_stock ?? 0),
          purchase_price: Number(r.purchase_price ?? 0),
        };
      });
      const filtered = items.filter(x => {
        if (x.current_stock <= 0) return false;
        if (x.purchase_cycle != null && x.purchase_cycle >= returnCycleMin && x.sale_qty_cycle <= returnSalesMax) return true;
        return false;
      });
      filtered.sort((a, b) => (b.purchase_cycle ?? 0) - (a.purchase_cycle ?? 0));
      setReturnList(filtered);
    } catch (e: any) {
      console.warn("[반품필요] 로드 실패:", e?.message);
      setReturnList([]);
    } finally {
      setReturnLoading(false);
    }
  }, [returnCycleMin, returnSalesMax]);

  // 마운트 시 자동 로드
  useEffect(() => { loadReturnList(); }, [loadReturnList]);

  // ── 공급사 카테고리 맵 (배지용) ────────────────────────────────────────
  const [vendorCategoryMap, setVendorCategoryMap] = useState<Record<string, string | null>>({});
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/vendors?withBalances=1");
        if (!res.ok) return;
        const list: Array<{ company_name: string; category: string | null }> = await res.json();
        const m: Record<string, string | null> = {};
        for (const v of list) {
          const name = String(v.company_name ?? "").trim();
          if (name) m[name] = v.category ?? null;
        }
        setVendorCategoryMap(m);
      } catch { /* silent */ }
    };
    load();
    window.addEventListener("vendors-changed", load);
    return () => window.removeEventListener("vendors-changed", load);
  }, []);

  // ── 우측 패널 (상품 상세) ───────────────────────────────────────────────
  const [returnSelectedProduct, setReturnSelectedProduct] = useState<{ code: string; name: string } | null>(null);
  const [returnPanelFull, setReturnPanelFull] = useState<Record<string, any> | null>(null);
  const [returnPanelLoading, setReturnPanelLoading] = useState(false);
  const [returnPanelError, setReturnPanelError] = useState<string | null>(null);
  const [returnDetailTab, setReturnDetailTab] = useState<"info" | "purchase" | "sales">("info");
  const [returnPanelWidth, setReturnPanelWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem("megatown_return_panel_w")); return Number.isFinite(v) && v > 0 ? v : 560; } catch { return 560; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_return_panel_w", String(returnPanelWidth)); } catch {} }, [returnPanelWidth]);
  const returnPanelWidthRef = useRef(returnPanelWidth);
  useEffect(() => { returnPanelWidthRef.current = returnPanelWidth; }, [returnPanelWidth]);
  const returnResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onReturnResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    returnResizeRef.current = { startX: e.clientX, startW: returnPanelWidthRef.current };
    const move = (ev: MouseEvent) => { const r = returnResizeRef.current; if (!r) return; setReturnPanelWidth(Math.min(1000, Math.max(320, r.startW + (ev.clientX - r.startX)))); };
    const up = () => { returnResizeRef.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  useEffect(() => {
    if (!returnSelectedProduct) { setReturnPanelFull(null); setReturnPanelError(null); return; }
    setReturnPanelLoading(true); setReturnPanelError(null);
    (async () => {
      try {
        const res = await fetch(`/api/products/${encodeURIComponent(returnSelectedProduct.code)}`);
        if (res.ok) setReturnPanelFull(await res.json());
        else { const b = await res.json().catch(() => ({})); setReturnPanelError(b.error ?? `조회 실패 (${res.status})`); }
      } catch (e: any) { setReturnPanelError(e?.message ?? "네트워크 오류"); }
      finally { setReturnPanelLoading(false); }
    })();
  }, [returnSelectedProduct]);

  // ── 그룹 접기 ──────────────────────────────────────────────────────────
  const [returnGroupCollapsed, setReturnGroupCollapsed] = useState<Set<string>>(new Set());
  const toggleReturnGroup = (g: string) => setReturnGroupCollapsed(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const isReturnGroupCollapsed = (g: string) => returnGroupCollapsed.has(g);

  // ── 반품요청 모달 ────────────────────────────────────────────────────────
  const [returnRequestItem, setReturnRequestItem] = useState<any | null>(null);

  // ── 렌더 ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-2">
      {/* ── 상단 필터바 ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <PackageCheck size={14} className="text-rose-500 shrink-0" />
          <span className="text-[13px] font-semibold text-slate-800">반품필요</span>
          {(() => {
            const q = returnSupplierSearch.trim().toLowerCase();
            const filteredCount = q ? returnList.filter(x => String(x.supplier ?? "").toLowerCase().includes(q)).length : returnList.length;
            return (
              <span className="text-[11px] font-semibold text-rose-600 bg-rose-50 rounded-full px-2 py-0.5 border border-rose-200 tabular-nums">
                {q ? `${filteredCount}/${returnList.length}` : returnList.length}건
              </span>
            );
          })()}
        </div>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
          <span className="font-medium text-slate-500">매입주기</span>
          <span className="text-slate-400 font-semibold">≥</span>
          <input
            type="number"
            value={returnCycleMin}
            onChange={e => setReturnCycleMin(Math.max(0, Number(e.target.value) || 0))}
            className="w-14 h-7 px-2 text-[11px] border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 tabular-nums text-right transition"
          />
          <span className="text-slate-500">일</span>
        </label>
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">AND</span>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
          <span className="font-medium text-slate-500">최근한달판매</span>
          <span className="text-slate-400 font-semibold">≤</span>
          <input
            type="number"
            value={returnSalesMax}
            onChange={e => setReturnSalesMax(Math.max(0, Number(e.target.value) || 0))}
            className="w-14 h-7 px-2 text-[11px] border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 tabular-nums text-right transition"
          />
          <span className="text-slate-500">개</span>
        </label>
        {/* 2026-07-31 · 사용자 요청 · 공급사 검색 · 검색한 공급사 제품만 표시 */}
        <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
          <span className="font-medium text-slate-500">공급사</span>
          <input
            type="text"
            value={returnSupplierSearch}
            onChange={e => setReturnSupplierSearch(e.target.value)}
            placeholder="공급사명 검색"
            className="w-36 h-7 px-2 text-[11px] border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 transition"
          />
          {returnSupplierSearch && (
            <button
              type="button"
              onClick={() => setReturnSupplierSearch("")}
              className="text-slate-400 hover:text-rose-500 text-[10px] font-semibold cursor-pointer"
              title="지우기"
            >×</button>
          )}
        </label>
        <button
          type="button"
          onClick={loadReturnList}
          disabled={returnLoading}
          className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-300 text-slate-400 hover:text-rose-500 transition disabled:opacity-40 cursor-pointer"
          title="다시 조회"
        >
          <RefreshCw size={13} className={returnLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ── 좌우 split 레이아웃 ── */}
      <div className="flex flex-col lg:flex-row min-h-[520px] gap-0">

        {/* 좌측: 리스트 */}
        <div
          className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
          style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? returnPanelWidth : undefined }}
        >
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-0">
            {/* 로딩 / 빈 상태 */}
            {returnLoading && returnList.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-slate-400 text-xs font-bold gap-2">
                <Loader2 size={14} className="animate-spin" />불러오는 중...
              </div>
            ) : returnList.length === 0 ? (
              <div className="py-12 text-center text-[11px] text-slate-300">
                조건에 맞는 반품필요 상품 없음
              </div>
            ) : (
              <div className={`overflow-auto flex-1 min-h-0 ${returnLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    {/* 그룹 컬러 헤더 */}
                    <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider">
                      <th className="bg-slate-50 w-7" />
                      {/* 상품정보 (sky) */}
                      <th colSpan={isReturnGroupCollapsed("info") ? 1 : 2}
                        className="text-center py-1.5 bg-sky-50 text-sky-700 border-l border-r border-slate-100 cursor-pointer select-none hover:bg-sky-100 transition"
                        onClick={() => toggleReturnGroup("info")}
                        title={isReturnGroupCollapsed("info") ? "상품정보 펼치기" : "상품정보 접기"}>
                        <span className="inline-flex items-center gap-1">
                          {isReturnGroupCollapsed("info") ? <ChevronRight size={12} /> : <ChevronDown size={12} />}상품정보
                        </span>
                      </th>
                      {/* 재고 (amber) */}
                      <th className="text-center py-1.5 bg-amber-50 text-amber-700 border-l border-r border-slate-100">재고</th>
                      {/* 매입정보 (emerald) */}
                      <th colSpan={isReturnGroupCollapsed("purchase") ? 1 : 1}
                        className="text-center py-1.5 bg-emerald-50 text-emerald-700 border-l border-r border-slate-100 cursor-pointer select-none hover:bg-emerald-100 transition"
                        onClick={() => toggleReturnGroup("purchase")}
                        title={isReturnGroupCollapsed("purchase") ? "매입정보 펼치기" : "매입정보 접기"}>
                        <span className="inline-flex items-center gap-1">
                          {isReturnGroupCollapsed("purchase") ? <ChevronRight size={12} /> : <ChevronDown size={12} />}매입정보
                        </span>
                      </th>
                      {/* 판매정보 (rose) */}
                      <th colSpan={isReturnGroupCollapsed("sales") ? 1 : 2}
                        className="text-center py-1.5 bg-rose-50 text-rose-700 border-l border-r border-slate-100 cursor-pointer select-none hover:bg-rose-100 transition"
                        onClick={() => toggleReturnGroup("sales")}
                        title={isReturnGroupCollapsed("sales") ? "판매정보 펼치기" : "판매정보 접기"}>
                        <span className="inline-flex items-center gap-1">
                          {isReturnGroupCollapsed("sales") ? <ChevronRight size={12} /> : <ChevronDown size={12} />}판매정보
                        </span>
                      </th>
                      {/* 재고금액 (indigo) */}
                      <th className="text-center py-1.5 bg-indigo-50 text-indigo-700 border-l border-r border-slate-100">재고금액</th>
                      {/* 액션 (slate) */}
                      <th className="text-center py-1.5 bg-slate-100 text-slate-600 border-l border-slate-100">액션</th>
                    </tr>
                    {/* 서브 헤더 */}
                    <tr className="border-b border-slate-100 text-[11px] text-slate-400 uppercase tracking-wider">
                      <th className="text-center px-0.5 py-1.5 w-7 bg-slate-50/60">#</th>
                      {isReturnGroupCollapsed("info") ? (
                        <th className="bg-sky-50/20 w-4"></th>
                      ) : (
                        <>
                          <th onClick={() => handleReturnSort("product_name")} title="상품명 정렬"
                            className="text-left px-1 py-1.5 min-w-[130px] cursor-pointer hover:bg-sky-50 select-none bg-sky-50/30">
                            상품{retArrow("product_name")}
                          </th>
                          <th onClick={() => handleReturnSort("supplier")} title="공급사 정렬"
                            className="text-left px-0.5 py-1.5 w-20 cursor-pointer hover:bg-sky-50 select-none bg-sky-50/30">
                            공급사{retArrow("supplier")}
                          </th>
                        </>
                      )}
                      <th onClick={() => handleReturnSort("current_stock")} title="현재고 정렬"
                        className="text-right px-1 py-1.5 w-14 bg-amber-50/40 text-slate-500 cursor-pointer hover:bg-amber-100 select-none">
                        현재고{retArrow("current_stock")}
                      </th>
                      {isReturnGroupCollapsed("purchase") ? (
                        <th className="bg-emerald-50/20 w-4"></th>
                      ) : (
                        <th onClick={() => handleReturnSort("purchase_cycle")} title="매입주기 정렬"
                          className="text-right px-1 py-1.5 w-28 bg-emerald-50/40 text-emerald-700 cursor-pointer hover:bg-emerald-100 select-none">
                          <span className="flex flex-col items-end leading-none gap-0.5">
                            <span>매입주기{retArrow("purchase_cycle")}</span>
                            <span className="text-[9px] text-slate-400 font-normal">최근매입일·량</span>
                          </span>
                        </th>
                      )}
                      {isReturnGroupCollapsed("sales") ? (
                        <th className="bg-rose-50/20 w-4"></th>
                      ) : (
                        <>
                          <th onClick={() => handleReturnSort("sale_qty_month")} title="최근 30일 판매량 정렬"
                            className="text-right px-1 py-1.5 w-20 bg-rose-50/40 text-rose-600 cursor-pointer hover:bg-rose-100 select-none">
                            한달판매{retArrow("sale_qty_month")}
                          </th>
                          <th onClick={() => handleReturnSort("sale_amount_month")} title="최근 30일 판매액 정렬"
                            className="text-right px-1 py-1.5 w-24 bg-rose-50/40 text-rose-600 cursor-pointer hover:bg-rose-100 select-none">
                            한달판매액{retArrow("sale_amount_month")}
                          </th>
                        </>
                      )}
                      <th onClick={() => handleReturnSort("stock_value")} title="재고금액 정렬"
                        className="text-right px-1 py-1.5 w-22 bg-indigo-50/40 text-indigo-600 cursor-pointer hover:bg-indigo-100 select-none">
                        재고금액{retArrow("stock_value")}
                      </th>
                      <th className="text-center px-0.5 py-1.5 w-16 bg-slate-50/60 text-slate-500 cursor-default select-none">
                        반품
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {[...returnList].filter(x => {
                      const q = returnSupplierSearch.trim().toLowerCase();
                      if (!q) return true;
                      return String(x.supplier ?? "").toLowerCase().includes(q);
                    }).sort((a, b) => {
                      const dir = returnSortDir === "asc" ? 1 : -1;
                      switch (returnSortKey) {
                        case "product_name":    return dir * String(a.product_name).localeCompare(String(b.product_name), "ko");
                        case "supplier":        return dir * String(a.supplier ?? "").localeCompare(String(b.supplier ?? ""), "ko");
                        case "current_stock":   return dir * (a.current_stock - b.current_stock);
                        case "purchase_cycle":  return dir * ((a.purchase_cycle ?? 0) - (b.purchase_cycle ?? 0));
                        case "sale_qty_month":  return dir * ((a.sale_qty_month ?? 0) - (b.sale_qty_month ?? 0));
                        case "sale_amount_month": return dir * ((a.sale_amount_month ?? 0) - (b.sale_amount_month ?? 0));
                        case "last_purchase_date": return dir * String(a.last_purchase_date ?? "").localeCompare(String(b.last_purchase_date ?? ""));
                        case "last_purchase_qty":  return dir * ((a.last_purchase_qty ?? 0) - (b.last_purchase_qty ?? 0));
                        case "stock_value":     return dir * ((a.current_stock * a.purchase_price) - (b.current_stock * b.purchase_price));
                        default:                return 0;
                      }
                    }).map((x, i) => {
                      const isSelected = returnSelectedProduct?.code === x.product_code;
                      return (
                        <tr
                          key={x.product_code}
                          className={`transition cursor-pointer ${isSelected ? "bg-rose-50/60 ring-1 ring-inset ring-rose-200" : "hover:bg-orange-50/30"}`}
                          onClick={() => { setReturnSelectedProduct({ code: x.product_code, name: x.product_name }); setReturnDetailTab("info"); }}
                        >
                          <td className="px-0.5 py-1.5 text-center text-slate-400 tabular-nums text-[11px] bg-slate-50/60 align-top">{i + 1}</td>
                          {isReturnGroupCollapsed("info") ? (
                            <td className="bg-sky-50/10 w-4"></td>
                          ) : (
                            <>
                              <td className="px-1 py-1.5 align-top bg-sky-50/20">
                                <div className="flex flex-col leading-tight">
                                  <button
                                    type="button"
                                    className="text-[12px] font-semibold text-sky-700 hover:underline text-left break-words whitespace-normal cursor-pointer"
                                    onClick={(e) => { e.stopPropagation(); setReturnSelectedProduct({ code: x.product_code, name: x.product_name }); setReturnDetailTab("info"); }}
                                    title="상품정보 보기"
                                  >{x.product_name}</button>
                                  <span className="text-[10px] text-slate-400 tabular-nums">{x.product_code}</span>
                                </div>
                              </td>
                              <td className="px-0.5 py-1.5 align-top bg-sky-50/10">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-[11px] font-semibold text-sky-600 break-words whitespace-normal">{x.supplier ?? "-"}</span>
                                  {x.supplier && <VendorCategoryBadge category={vendorCategoryMap[x.supplier.trim()] ?? null} />}
                                </div>
                              </td>
                            </>
                          )}
                          <td className="text-right px-1 py-1.5 tabular-nums font-bold text-[12px] text-slate-700 bg-amber-50/30 align-top">{x.current_stock.toLocaleString()}</td>
                          {isReturnGroupCollapsed("purchase") ? (
                            <td className="bg-emerald-50/20 w-4"></td>
                          ) : (
                            <td
                              className="text-right px-1 py-1.5 tabular-nums bg-emerald-50/30 align-top cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); setReturnSelectedProduct({ code: x.product_code, name: x.product_name }); setReturnDetailTab("purchase"); }}
                              title="매입이력 보기"
                            >
                              <span className="font-black text-[12px] text-emerald-700 hover:underline">
                                {x.purchase_cycle != null ? `${x.purchase_cycle}일` : "-"}
                              </span>
                              <span className="block text-[10px] text-slate-500 leading-snug mt-0.5 font-normal">
                                {x.last_purchase_date ?? "-"}
                                {x.last_purchase_qty != null && (
                                  <> · <span className="tabular-nums">{x.last_purchase_qty}개</span></>
                                )}
                              </span>
                            </td>
                          )}
                          {isReturnGroupCollapsed("sales") ? (
                            <td className="bg-rose-50/20 w-4"></td>
                          ) : (
                            <>
                              <td
                                className="text-right px-1 py-1.5 tabular-nums bg-rose-50/20 align-top cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); setReturnSelectedProduct({ code: x.product_code, name: x.product_name }); setReturnDetailTab("sales"); }}
                                title="판매정보 보기"
                              >
                                <span className="font-black text-[12px] text-rose-600 hover:underline">
                                  {x.sale_qty_month != null ? `${x.sale_qty_month.toLocaleString()}개` : "-"}
                                </span>
                              </td>
                              <td
                                className="text-right px-1 py-1.5 tabular-nums bg-rose-50/20 align-top cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); setReturnSelectedProduct({ code: x.product_code, name: x.product_name }); setReturnDetailTab("sales"); }}
                                title="판매정보 보기"
                              >
                                <span className="font-black text-[12px] text-rose-700 hover:underline">
                                  {x.sale_amount_month != null && x.sale_amount_month > 0 ? `${x.sale_amount_month.toLocaleString()}` : "-"}
                                </span>
                              </td>
                            </>
                          )}
                          <td className="text-right px-1 py-1.5 tabular-nums font-black text-[12px] text-indigo-700 bg-indigo-50/20 align-top">
                            {x.current_stock > 0 && x.purchase_price > 0 ? `${(x.current_stock * x.purchase_price).toLocaleString()}` : "-"}
                          </td>
                          <td className="text-center px-1 py-1.5 align-top bg-slate-50/30">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setReturnRequestItem({ ...x, vendorCategory: x.supplier ? (vendorCategoryMap[x.supplier.trim()] ?? null) : null }); }}
                              className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-semibold text-white bg-rose-500 hover:bg-rose-600 border border-rose-600 transition-colors cursor-pointer active:scale-95"
                              title="반품요청"
                            >
                              <Truck size={11} strokeWidth={2} />반품
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {returnList.length === 0 && (
                      <tr><td colSpan={8} className="text-center text-[11px] text-slate-300 py-6">검색 결과 없음</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* 리사이즈 핸들 (데스크탑만) */}
        <div onMouseDown={onReturnResizeStart}
          className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-slate-200 hover:bg-rose-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
          title="드래그하여 폭 조절">
          <span className="text-[9px] text-slate-400 group-hover:text-white font-black rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
        </div>

        {/* 우측: 상품 상세 패널 · 탭 전환 */}
        {returnPanelLoading ? (
          <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0">
            <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400 min-h-[400px]">
              <Loader2 size={32} className="animate-spin mb-3 opacity-50" />
              <div className="text-sm font-bold">불러오는 중...</div>
            </div>
          </div>
        ) : returnPanelError ? (
          <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0">
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-red-700">
              <div className="font-bold mb-1">조회 실패</div>
              <div className="text-[11px] font-mono">{returnPanelError}</div>
            </div>
          </div>
        ) : returnPanelFull ? (
          <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0 overflow-y-auto">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden shrink-0">
              <div className="flex border-b border-slate-200 bg-slate-50/50">
                {([
                  { k: "info" as const,     label: "상품정보",   color: "text-sky-700 border-sky-500"     },
                  { k: "purchase" as const, label: "매입이력",   color: "text-emerald-700 border-emerald-500" },
                  { k: "sales" as const,    label: "판매정보",   color: "text-rose-700 border-rose-500"   },
                ] as const).map(({ k, label, color }) => (
                  <button key={k} type="button"
                    onClick={() => setReturnDetailTab(k)}
                    className={`flex-1 min-h-[40px] py-2 px-3 text-[13px] font-black border-b-2 transition cursor-pointer ${returnDetailTab === k ? color : "text-slate-400 border-transparent hover:text-slate-600"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="px-3 py-1.5 flex items-center gap-2 border-b border-slate-100">
                <span className="text-[11px] font-bold text-slate-500 truncate">{returnSelectedProduct?.name}</span>
                <button type="button" onClick={() => { setReturnSelectedProduct(null); setReturnPanelFull(null); }}
                  className="ml-auto text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer shrink-0">닫기</button>
              </div>
            </div>

            {returnDetailTab === "info" && (
              <ProductDetailRightPanel
                selected={({
                  code: (returnPanelFull as any).product_code ?? (returnPanelFull as any).code ?? (returnSelectedProduct?.code ?? ""),
                  name: (returnPanelFull as any).product_name ?? (returnPanelFull as any).name ?? (returnSelectedProduct?.name ?? ""),
                  spec: (returnPanelFull as any).spec ?? "",
                  ...returnPanelFull,
                  realMap: (returnPanelFull as any).realMap ?? (returnPanelFull as any).real_map ?? null,
                } as ProductInfoType)}
                onClose={() => { setReturnSelectedProduct(null); setReturnPanelFull(null); }}
                onProductUpdate={(u) => setReturnPanelFull(prev => prev ? { ...prev, ...u } : prev)}
                onRealMapUpdate={(v) => setReturnPanelFull(prev => prev ? { ...prev, real_map: v, realMap: v } : prev)}
                showChart={false}
                context="order-manage"
                editable={true}
                emptySub="상세 정보가 표시됩니다"
              />
            )}
            {returnDetailTab === "purchase" && (
              <ProductDetailRightPanel
                selected={({
                  code: (returnPanelFull as any).product_code ?? (returnPanelFull as any).code ?? (returnSelectedProduct?.code ?? ""),
                  name: (returnPanelFull as any).product_name ?? (returnPanelFull as any).name ?? (returnSelectedProduct?.name ?? ""),
                  spec: (returnPanelFull as any).spec ?? "",
                  ...returnPanelFull,
                  realMap: (returnPanelFull as any).realMap ?? (returnPanelFull as any).real_map ?? null,
                } as ProductInfoType)}
                onClose={() => { setReturnSelectedProduct(null); setReturnPanelFull(null); }}
                onProductUpdate={(u) => setReturnPanelFull(prev => prev ? { ...prev, ...u } : prev)}
                onRealMapUpdate={(v) => setReturnPanelFull(prev => prev ? { ...prev, real_map: v, realMap: v } : prev)}
                showChart={true}
                context="order-manage"
                editable={false}
                emptySub="매입이력이 표시됩니다"
              />
            )}
            {returnDetailTab === "sales" && (
              <ProductDetailRightPanel
                selected={({
                  code: (returnPanelFull as any).product_code ?? (returnPanelFull as any).code ?? (returnSelectedProduct?.code ?? ""),
                  name: (returnPanelFull as any).product_name ?? (returnPanelFull as any).name ?? (returnSelectedProduct?.name ?? ""),
                  spec: (returnPanelFull as any).spec ?? "",
                  ...returnPanelFull,
                  realMap: (returnPanelFull as any).realMap ?? (returnPanelFull as any).real_map ?? null,
                } as ProductInfoType)}
                onClose={() => { setReturnSelectedProduct(null); setReturnPanelFull(null); }}
                onProductUpdate={(u) => setReturnPanelFull(prev => prev ? { ...prev, ...u } : prev)}
                onRealMapUpdate={(v) => setReturnPanelFull(prev => prev ? { ...prev, real_map: v, realMap: v } : prev)}
                showChart={true}
                context="order-manage"
                editable={false}
                emptySub="판매정보가 표시됩니다"
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0">
            <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400 min-h-[400px]">
              <Package size={40} className="mb-3 opacity-30" />
              <div className="text-[11px] font-semibold">상품을 클릭하세요</div>
              <div className="text-[11px] mt-1 text-center">상품명 → 상품정보 · 매입주기 → 매입이력 · 판매량 → 판매정보</div>
            </div>
          </div>
        )}
      </div>

      {/* 반품요청 모달 */}
      {returnRequestItem && (
        <ReturnRequestModal
          item={returnRequestItem}
          onClose={() => setReturnRequestItem(null)}
        />
      )}
    </div>
  );
};

export default ReturnListPanel;
