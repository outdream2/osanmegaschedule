// src/components/OrderManagePage/ReturnGroupedView.tsx
// 2026-10-12 · #16 Step 7 · 반품 통합 재설계 · 공급사별 그룹 CARD 뷰
//   · 사용자 지시 "발주요청서랑 구조 똑같이" · OrderRequestGroupedView (OrderReturnOverview line 1215+) 패턴 복제
//   · 레이아웃: lg:grid-cols-2 (공급사 2개씩 가로) + collapse (default 모두 펼침)
//   · 체크박스: row / group / all · bulk 선택 Set<product_code>
//   · 자동 조건 필터 (매입주기 N일 ↑ · 1M판매 M개 ↓ · 3M판매 Q개 ↓) · default 90/5/15
//   · 전송 CTA: 선택 n개 → openBulkReturnModal (ReturnRequestModal 재사용)
//   · 홈 랜딩 톤 · rounded-[12px] + border-slate-200 + thin shadow
//
// 데이터 fetch 는 ReturnListPanel.loadReturnList 로직 복제 (top-sales + inventory-checks)
// ReturnListPanel 과 병존 가능 (ReturnUnifiedPanel 에서 교체 호출)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Package, Send, RefreshCw, AlertCircle } from "lucide-react";
import { api } from "../../lib/apiClient";
import { listInventoryChecks } from "../../lib/inventoryChecksApi";
import { lookupProduct } from "../../lib/productsCache";
import { matchesProductQuery } from "../../lib/productMatch";
import { useToast } from "../../hooks/useToast";
import { useVendors } from "../../hooks/useVendors";
import { useSaleStatusFilter } from "../../hooks/useSaleStatusFilter";
import { SaleStatusFilter } from "../common/SaleStatusFilter";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { displayVendorName } from "../../utils/vendorNameNormalize";
import { Spinner } from "../common/Spinner";
import { ReturnRequestModal } from "./ReturnRequestModal";

type ReturnItem = {
  product_code: string;
  product_name: string;
  supplier: string | null;
  purchase_cycle: number | null;
  sale_qty_cycle: number;
  sale_qty_month: number | null;
  sale_qty_60d: number | null;
  sale_qty_90d: number | null;
  last_purchase_date: string | null;
  last_purchase_qty: number | null;
  current_stock: number;
  actual_stock: number | null;
  purchase_price: number;
  sale_status?: string | null;
};

export const ReturnGroupedView: React.FC = () => {
  const { toast, showError, showSuccess } = useToast();
  const { vendorCategoryMap, vendorMap } = useVendors();

  // ── 조건 필터 state ──────────────────────────────────────────────────
  const [cycleMin, setCycleMin] = useState(90);
  const [salesMax, setSalesMax] = useState(5);
  const [quarterMax, setQuarterMax] = useState(15);
  const [search, setSearch] = useState("");
  const { value: saleFilter, setValue: setSaleFilter, matches: saleMatches } = useSaleStatusFilter({ storageKey: "returnGrouped.saleFilter" });

  // ── 데이터 ──────────────────────────────────────────────────────────
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // ── UI state ────────────────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalItems, setModalItems] = useState<any[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [salesResult, invResult] = await Promise.allSettled([
        api.get<any>("/api/stock-manage/top-sales?months=6&limit=5000&sort=sale&dir=desc"),
        listInventoryChecks(),
      ]);
      if (salesResult.status === "rejected") throw salesResult.reason;
      const data = salesResult.value.data;
      const rows: any[] = Array.isArray(data?.rows) ? data.rows : [];

      const actualByCode = new Map<string, number>();
      if (invResult.status === "fulfilled") {
        try {
          const invRaw: any[] = Array.isArray(invResult.value) ? invResult.value : [];
          const latestByCode = new Map<string, any>();
          for (const r of invRaw) {
            const code = String(r?.product_code ?? "").trim();
            if (!code) continue;
            if (!latestByCode.has(code)) latestByCode.set(code, r);
          }
          latestByCode.forEach((row, code) => {
            const num = (v: any) => Number.isFinite(Number(v)) ? Number(v) : 0;
            const w1 = row.warehouse1_stock ?? row.warehouse_stock ?? 0;
            const w2 = row.warehouse2_stock ?? 0;
            const s1 = row.store1_stock ?? row.store_stock ?? 0;
            const s2 = row.store2_stock ?? row.store_stock_2 ?? 0;
            const s3 = row.store3_stock ?? 0;
            if (row.warehouse1_stock == null && row.warehouse2_stock == null &&
                row.warehouse_stock == null &&
                row.store1_stock == null && row.store2_stock == null &&
                row.store_stock == null && row.store_stock_2 == null &&
                row.store3_stock == null) return;
            actualByCode.set(code, num(w1) + num(w2) + num(s1) + num(s2) + num(s3));
          });
        } catch { /* skip */ }
      }

      const mapped: ReturnItem[] = rows.map(r => {
        const cnt = Number(r.purchase_count ?? 0);
        const first = String(r.first_purchase_date ?? "");
        const last = String(r.last_purchase_date ?? "");
        let cycle: number | null = null;
        if (cnt >= 2 && first && last && first !== last) {
          const days = Math.round((new Date(last).getTime() - new Date(first).getTime()) / (86400 * 1000));
          cycle = cnt > 1 ? Math.round(days / (cnt - 1)) : null;
        }
        const code = String(r.product_code ?? "");
        const stripped = code.replace(/^0+/, "");
        const actual = actualByCode.has(code) ? (actualByCode.get(code) ?? null)
                     : actualByCode.has(stripped) ? (actualByCode.get(stripped) ?? null)
                     : null;
        return {
          product_code: code,
          product_name: String(r.product_name ?? ""),
          supplier: r.supplier ?? null,
          purchase_cycle: cycle,
          sale_qty_cycle: Number(r.sale_qty_cycle ?? 0),
          sale_qty_month: r.sale_qty_month != null ? Number(r.sale_qty_month) : (r.sale_qty_1m != null ? Number(r.sale_qty_1m) : null),
          sale_qty_60d: r.sale_qty_60d != null ? Number(r.sale_qty_60d) : null,
          sale_qty_90d: r.sale_qty_90d != null ? Number(r.sale_qty_90d) : null,
          last_purchase_date: r.last_purchase_date ?? null,
          last_purchase_qty: r.last_purchase_qty != null ? Number(r.last_purchase_qty) : (r.last_snapshot_qty != null ? Number(r.last_snapshot_qty) : null),
          current_stock: Number(r.current_stock ?? r.closing_stock ?? 0),
          actual_stock: actual,
          purchase_price: Number(r.purchase_price ?? 0),
          sale_status: lookupProduct(code)?.sale_status ?? null,
        };
      });
      const filtered = mapped.filter(x => {
        if (x.current_stock <= 0) return false;
        if (x.purchase_cycle != null && x.purchase_cycle >= cycleMin && x.sale_qty_cycle <= salesMax && (x.sale_qty_90d ?? 0) <= quarterMax) return true;
        return false;
      });
      filtered.sort((a, b) => (b.purchase_cycle ?? 0) - (a.purchase_cycle ?? 0));
      setItems(filtered);
      try { window.dispatchEvent(new CustomEvent("return-need-count", { detail: { count: filtered.length } })); } catch { /**/ }
    } catch (e: any) {
      console.warn("[반품 공급사 그룹 뷰] 로드 실패:", e?.message);
      setItems([]);
      showError(`반품필요 로드 실패: ${e?.message ?? "네트워크 오류"}`);
    } finally {
      setLoading(false);
    }
  }, [cycleMin, salesMax, quarterMax, showError]);

  useEffect(() => { load(); }, [load, reloadKey]);

  // ── 검색 + 판매상태 필터 ────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    return items.filter(x => {
      if (!matchesProductQuery(x as any, search)) return false;
      if (!saleMatches(x.sale_status)) return false;
      return true;
    });
  }, [items, search, saleMatches]);

  // ── 공급사별 그룹 ──────────────────────────────────────────────────
  const groups = useMemo(() => {
    const map = new Map<string, ReturnItem[]>();
    for (const r of filteredItems) {
      const s = String(r.supplier ?? "").trim() || "(공급사 미지정)";
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(r);
    }
    return Array.from(map.entries());
  }, [filteredItems]);

  // ── collapse / selection helpers ────────────────────────────────────
  const toggleCollapse = (s: string) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(s)) next.delete(s); else next.add(s);
    return next;
  });
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(groups.map(([s]) => s)));

  const toggleOne = (code: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(code)) next.delete(code); else next.add(code);
    return next;
  });
  const toggleGroup = (groupItems: ReturnItem[]) => setSelected(prev => {
    const codes = groupItems.map(r => r.product_code);
    const allSel = codes.every(c => prev.has(c));
    const next = new Set(prev);
    if (allSel) codes.forEach(c => next.delete(c));
    else codes.forEach(c => next.add(c));
    return next;
  });
  const toggleAll = () => setSelected(prev => {
    const codes = filteredItems.map(r => r.product_code);
    if (codes.every(c => prev.has(c))) return new Set();
    return new Set(codes);
  });
  const clearSel = () => setSelected(new Set());

  const selCount = selected.size;
  const allChecked = filteredItems.length > 0 && filteredItems.every(r => selected.has(r.product_code));
  const someChecked = selCount > 0 && !allChecked;

  // ── 전송 모달 (ReturnRequestModal 재사용 · OrderModal 톤) ───────────
  const openBulkModal = () => {
    if (selCount === 0) return;
    const selItems = filteredItems
      .filter(x => selected.has(x.product_code))
      .map(x => ({
        product_code: x.product_code,
        product_name: x.product_name,
        supplier: x.supplier,
        qty: Number(x.current_stock ?? 0),
        current_stock: Number(x.current_stock ?? 0),
        purchase_price: Number(x.purchase_price ?? 0),
        actual_stock: x.actual_stock,
        last_purchase_qty: x.last_purchase_qty,
        last_purchase_date: x.last_purchase_date,
      }));
    setModalItems(selItems);
  };

  // ── 렌더 ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3 relative">
      {/* 조건 필터 + 검색 + 액션 (header) */}
      <div className="flex flex-col gap-2 px-3 pb-2 border-b border-slate-100">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <label className="inline-flex items-center gap-1 text-[13px] text-slate-600 shrink-0">
            <span className="font-medium text-slate-500">매입주기</span>
            <input
              type="number"
              value={cycleMin}
              onChange={e => setCycleMin(Math.max(0, Number(e.target.value) || 0))}
              className="w-12 h-7 px-1.5 text-[13px] border border-slate-200 rounded-md bg-white outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep tabular-nums text-right"
            />
            <span className="text-slate-500 whitespace-nowrap">일 ↑</span>
          </label>
          <label className="inline-flex items-center gap-1 text-[13px] text-slate-600 shrink-0">
            <span className="font-medium text-slate-500">1M판매</span>
            <input
              type="number"
              value={salesMax}
              onChange={e => setSalesMax(Math.max(0, Number(e.target.value) || 0))}
              className="w-12 h-7 px-1.5 text-[13px] border border-slate-200 rounded-md bg-white outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep tabular-nums text-right"
            />
            <span className="text-slate-500 whitespace-nowrap">개 ↓</span>
          </label>
          <label className="inline-flex items-center gap-1 text-[13px] text-slate-600 shrink-0">
            <span className="font-medium text-slate-500">3M판매</span>
            <input
              type="number"
              value={quarterMax}
              onChange={e => setQuarterMax(Math.max(0, Number(e.target.value) || 0))}
              className="w-12 h-7 px-1.5 text-[13px] border border-slate-200 rounded-md bg-white outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep tabular-nums text-right"
            />
            <span className="text-slate-500 whitespace-nowrap">개 ↓</span>
          </label>
          <SaleStatusFilter value={saleFilter} onChange={setSaleFilter} size="sm" />
          <input
            type="text"
            placeholder="공급사·상품·코드 검색"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[160px] h-7 px-2.5 text-[13px] border border-slate-200 rounded-md bg-white outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep"
          />
          <button
            type="button"
            onClick={() => setReloadKey(k => k + 1)}
            disabled={loading}
            className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-slate-200 bg-white text-[12px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer transition-colors"
            title="새로고침"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            {loading ? "로딩" : "새로고침"}
          </button>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-slate-500">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={allChecked}
              ref={el => { if (el) el.indeterminate = someChecked; }}
              onChange={toggleAll}
              className="w-3.5 h-3.5 accent-rose-500 cursor-pointer"
            />
            <span className="font-semibold text-ink">
              {allChecked ? "전체 해제" : "전체 선택"} ({filteredItems.length})
            </span>
          </label>
          {selCount > 0 && (
            <span className="text-rose-600 font-semibold tabular-nums">
              · 선택 {selCount}개
            </span>
          )}
          <button
            type="button"
            onClick={expandAll}
            className="ml-auto text-[12px] text-slate-500 hover:text-ink cursor-pointer"
          >
            모두 펼침
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="text-[12px] text-slate-500 hover:text-ink cursor-pointer"
          >
            모두 접기
          </button>
        </div>
      </div>

      {/* 공급사별 그룹 CARD · lg:grid-cols-2 */}
      <div className="px-3 pb-20">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-12 gap-2">
            <Spinner size={14} />
            <span className="text-[13px] text-slate-500">반품필요 로드 중...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
            <Package size={28} />
            <p className="text-[14px] font-semibold">조건에 맞는 반품필요 상품 없음</p>
            <p className="text-[12px]">매입주기 · 판매 조건을 조정해보세요</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {groups.map(([supplier, groupItems]) => {
              const isCollapsed = collapsed.has(supplier);
              const codes = groupItems.map(r => r.product_code);
              const groupAllSel = codes.length > 0 && codes.every(c => selected.has(c));
              const groupSomeSel = codes.some(c => selected.has(c)) && !groupAllSel;
              const vendorCat = (vendorCategoryMap as Record<string, string | null | undefined>)[supplier] ?? null;
              const groupSelCount = codes.filter(c => selected.has(c)).length;
              return (
                <section
                  key={supplier}
                  className="bg-white border border-slate-200 rounded-[10px] overflow-hidden flex flex-col"
                >
                  {/* 공급사 header */}
                  <header className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/50">
                    <input
                      type="checkbox"
                      checked={groupAllSel}
                      ref={el => { if (el) el.indeterminate = groupSomeSel; }}
                      onChange={() => toggleGroup(groupItems)}
                      className="w-3.5 h-3.5 accent-rose-500 cursor-pointer shrink-0"
                      title={groupAllSel ? "공급사 전체 해제" : "공급사 전체 선택"}
                    />
                    <button
                      type="button"
                      onClick={() => toggleCollapse(supplier)}
                      className="flex-1 min-w-0 flex items-center gap-1.5 text-left cursor-pointer"
                    >
                      {isCollapsed ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronUp size={14} className="text-slate-400 shrink-0" />}
                      <span className="text-[14px] font-bold text-ink truncate" title={supplier}>
                        {displayVendorName(supplier)}
                      </span>
                      {vendorCat && (
                        <VendorCategoryBadge category={vendorCat} />
                      )}
                      <span className="text-[12px] text-slate-500 tabular-nums shrink-0 ml-auto">
                        {groupItems.length}개
                        {groupSelCount > 0 && (
                          <span className="text-rose-600 font-semibold ml-1">· {groupSelCount} 선택</span>
                        )}
                      </span>
                    </button>
                  </header>

                  {/* 상품 리스트 · collapse 시 숨김 */}
                  {!isCollapsed && (
                    <ul className="divide-y divide-slate-100">
                      {groupItems.map(it => {
                        const checked = selected.has(it.product_code);
                        return (
                          <li
                            key={it.product_code}
                            className={`flex items-start gap-2 px-3 py-2 transition-colors ${checked ? "bg-rose-50/40" : "hover:bg-slate-50/60"}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleOne(it.product_code)}
                              className="w-3.5 h-3.5 accent-rose-500 cursor-pointer mt-1 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start gap-2 flex-wrap">
                                <p className="text-[13.5px] font-semibold text-ink leading-snug break-keep min-w-0 flex-1" title={it.product_name}>
                                  {it.product_name}
                                </p>
                                <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">
                                  {it.product_code}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[11.5px] text-slate-500 tabular-nums flex-wrap">
                                <span>주기 <b className={`${(it.purchase_cycle ?? 0) >= 180 ? "text-rose-600" : "text-slate-700"} font-semibold`}>{it.purchase_cycle ?? "-"}일</b></span>
                                <span className="text-slate-300">·</span>
                                <span>재고 <b className="text-slate-700 font-semibold">{it.current_stock}</b></span>
                                {it.actual_stock != null && (
                                  <>
                                    <span className="text-slate-300">·</span>
                                    <span>실재고 <b className="text-slate-700 font-semibold">{it.actual_stock}</b></span>
                                  </>
                                )}
                                <span className="text-slate-300">·</span>
                                <span>1M <b className="text-slate-700 font-semibold">{it.sale_qty_month ?? 0}</b></span>
                                <span className="text-slate-300">·</span>
                                <span>3M <b className="text-slate-700 font-semibold">{it.sale_qty_90d ?? 0}</b></span>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* bottom sticky · 선택 전송 bar */}
      {selCount > 0 && (
        <div className="sticky bottom-0 left-0 right-0 z-10 bg-white border-t border-slate-200 shadow-[0_-2px_8px_rgba(0,0,0,0.04)] px-4 py-2.5 flex items-center gap-2 flex-wrap">
          <AlertCircle size={14} className="text-rose-500 shrink-0" />
          <span className="text-[13px] text-slate-700">
            <b className="text-rose-600 tabular-nums font-bold">{selCount}개</b> 상품 선택됨 ·
            {new Set(filteredItems.filter(x => selected.has(x.product_code)).map(x => x.supplier ?? "미지정")).size}개 공급사
          </span>
          <button
            type="button"
            onClick={clearSel}
            className="h-7 px-2.5 rounded-md border border-slate-200 bg-white text-[12px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
          >
            선택 해제
          </button>
          <button
            type="button"
            onClick={openBulkModal}
            className="ml-auto inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md bg-rose-600 text-white text-[13px] font-bold hover:bg-rose-700 shadow-sm cursor-pointer transition-colors"
          >
            <Send size={13} />
            반품요청서 보내기
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] bg-ink text-white rounded-lg px-4 py-3 shadow-lg text-[14px] font-medium">
          {toast.message}
        </div>
      )}

      {/* 반품요청서 모달 (ReturnRequestModal 재사용 · OrderModal 톤) ·
          첫 상품의 supplier → vendorMap lookup → supplierInfo prop · 공급사 여러개면 모달 내부 그룹 처리 */}
      {modalItems && modalItems.length > 0 && (() => {
        const firstSupplier = String(modalItems[0]?.supplier ?? "").trim();
        const vendor = (vendorMap as Record<string, { contact_name?: string | null; phone?: string | null; email?: string | null; category?: string | null }>)[firstSupplier] ?? null;
        const supplierInfo = vendor
          ? {
              contact_name: vendor.contact_name ?? null,
              phone: vendor.phone ?? null,
              email: vendor.email ?? null,
              category: vendor.category ?? null,
            }
          : null;
        return (
          <ReturnRequestModal
            item={modalItems[0]}
            items={modalItems}
            supplierInfo={supplierInfo}
            onClose={() => {
              setModalItems(null);
              clearSel();
              setReloadKey(k => k + 1);
            }}
          />
        );
      })()}
    </div>
  );
};

export default ReturnGroupedView;
