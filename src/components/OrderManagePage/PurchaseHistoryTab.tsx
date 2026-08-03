// src/components/OrderManagePage/PurchaseHistoryTab.tsx
// #146 · 매입 탭 > 매입이력 서브탭 · 공급사별 purchase_details 원장
// 2026-08-03 신규 생성

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Loader2, Package, RefreshCw } from "lucide-react";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { SeasonButtons } from "../common/SeasonButtons";
import { type SeasonKey } from "../../hooks/useSeasonRanges";

// ─── Types ───────────────────────────────────────────────────────────────────

interface VendorItem {
  id: number;
  company_name: string;
  category: string | null;
}

interface PurchaseRow {
  id: string | number;
  invoice_date: string | null;
  saved_at: string;
  product_name: string | null;
  product_code: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  supplier: string | null;
}

type SortKey = "date" | "product_name" | "quantity" | "unit_price" | "amount";
type SortDir = "asc" | "desc";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

function fmtWon(n: number): string {
  if (n >= 10000_0000) return `${(n / 10000_0000).toFixed(1)}억`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  return fmt(n) + "원";
}

function dateLabel(iso: string | null): string {
  if (!iso) return "-";
  return String(iso).slice(0, 10);
}

// ─── PurchaseHistoryTab ───────────────────────────────────────────────────────

export const PurchaseHistoryTab: React.FC = () => {
  // 공급사 목록
  const [vendors, setVendors] = useState<VendorItem[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorCategoryFilter, setVendorCategoryFilter] = useState<"전체" | "위탁" | "선결제" | "60일회전" | "90일회전" | "기타">("전체");

  // 선택 공급사
  const [selectedVendor, setSelectedVendor] = useState<VendorItem | null>(null);

  // 매입 이력
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);

  // 기간 필터
  const [periodMonths, setPeriodMonths] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(1);
  const [periodSeason, setPeriodSeason] = useState<SeasonKey | null>(null);

  // 정렬
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };
  const arrow = (k: SortKey) => sortKey !== k ? " ⇅" : sortDir === "asc" ? " ▲" : " ▼";

  // 공급사 목록 로드
  const loadVendors = useCallback(async () => {
    setVendorsLoading(true);
    try {
      const res = await fetch("/api/vendors?withBalances=1");
      if (!res.ok) throw new Error(String(res.status));
      const list: any[] = await res.json();
      setVendors(list.map(v => ({ id: v.id, company_name: String(v.company_name ?? ""), category: v.category ?? null })));
    } catch { setVendors([]); }
    finally { setVendorsLoading(false); }
  }, []);

  useEffect(() => {
    loadVendors();
    window.addEventListener("vendors-changed", loadVendors);
    return () => window.removeEventListener("vendors-changed", loadVendors);
  }, [loadVendors]);

  // 매입 이력 로드
  const loadRows = useCallback(async (supplier: string) => {
    setRowsLoading(true);
    setRowsError(null);
    try {
      const isDays10 = periodMonths === 0 && !periodSeason;
      const days = periodSeason
        ? 365
        : isDays10 ? 10 : (periodMonths || 1) * 30;
      // /api/supplier-ledger 는 매입+결제 통합 원장이므로
      // 여기서는 ocr_confirmed_items 기반 순수 매입이력만 조회
      // => /api/stock-manage/top-sales?supplier=X&months=N 는 상품별 집계 · 여기선 거래명세서 행별 필요
      // => /api/supplier-payments 는 결제만 · 여기선 매입만 필요
      // => 직접 ocr_confirmed_items 조회용 endpoint 가 없으므로 supplier-ledger 에서 purchase 타입만 필터
      const params = new URLSearchParams({ supplier, days: String(days) });
      const res = await fetch(`/api/supplier-ledger?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      const allRows: any[] = Array.isArray(j.rows) ? j.rows : [];
      const purchaseRows: PurchaseRow[] = allRows
        .filter((r: any) => r.type === "purchase")
        .map((r: any) => ({
          id: r.id,
          invoice_date: r.date ?? null,
          saved_at: r.date ?? "",
          product_name: r.memo ?? null,
          product_code: null,
          quantity: null,
          unit_price: null,
          amount: Number(r.amount) || 0,
          supplier,
        }));
      setRows(purchaseRows);
    } catch (e: any) {
      setRowsError(e?.message ?? "네트워크 오류");
      setRows([]);
    } finally { setRowsLoading(false); }
  }, [periodMonths, periodSeason]);

  // 공급사 선택 시 로드
  useEffect(() => {
    if (selectedVendor) loadRows(selectedVendor.company_name);
    else setRows([]);
  }, [selectedVendor, loadRows]);

  // 필터링된 공급사 목록
  const filteredVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    return vendors.filter(v => {
      if (q && !v.company_name.toLowerCase().includes(q)) return false;
      if (vendorCategoryFilter !== "전체" && v.category !== vendorCategoryFilter) return false;
      return true;
    });
  }, [vendors, vendorSearch, vendorCategoryFilter]);

  // 정렬된 행
  const sortedRows = useMemo(() => {
    const sign = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "date":         return sign * String(a.invoice_date ?? "").localeCompare(String(b.invoice_date ?? ""));
        case "product_name": return sign * String(a.product_name ?? "").localeCompare(String(b.product_name ?? ""), "ko");
        case "quantity":     return sign * ((a.quantity ?? 0) - (b.quantity ?? 0));
        case "unit_price":   return sign * ((a.unit_price ?? 0) - (b.unit_price ?? 0));
        case "amount":       return sign * ((a.amount ?? 0) - (b.amount ?? 0));
        default:             return 0;
      }
    });
  }, [rows, sortKey, sortDir]);

  const totalAmount = useMemo(() => rows.reduce((s, r) => s + (r.amount ?? 0), 0), [rows]);

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* 상단 필터바 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Building2 size={14} className="text-emerald-500 shrink-0" />
          <span className="text-[13px] font-semibold text-slate-800">매입이력</span>
          {selectedVendor && (
            <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5 border border-emerald-200 tabular-nums">
              {rows.length}건
            </span>
          )}
        </div>
        {/* 기간 필터 */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">기간</span>
          <div className="inline-flex bg-slate-50 border border-slate-200 rounded-md p-0.5">
            <button onClick={() => { setPeriodSeason(null); setPeriodMonths(0); }}
              className={`px-2 h-6 text-[11px] font-semibold rounded transition cursor-pointer ${!periodSeason && periodMonths === 0 ? "bg-emerald-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>10일</button>
            {([1, 2, 3, 4, 5, 6] as const).map(m => (
              <button key={m} onClick={() => { setPeriodSeason(null); setPeriodMonths(m); }}
                className={`px-2 h-6 text-[11px] font-semibold rounded transition cursor-pointer ${!periodSeason && periodMonths === m ? "bg-emerald-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{m}개월</button>
            ))}
          </div>
          <SeasonButtons value={periodSeason} onChange={(v) => { setPeriodSeason(v); if (v) setPeriodMonths(0); }} size="sm" hideLabel />
        </div>
        {/* 새로고침 */}
        {selectedVendor && (
          <button
            type="button"
            onClick={() => loadRows(selectedVendor.company_name)}
            disabled={rowsLoading}
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-slate-400 hover:text-emerald-500 transition disabled:opacity-40 cursor-pointer"
            title="새로고침"
          >
            <RefreshCw size={13} className={rowsLoading ? "animate-spin" : ""} />
          </button>
        )}
      </div>

      {/* 좌우 분할 */}
      <div className="flex flex-col lg:flex-row gap-2 flex-1 min-h-0">
        {/* 좌측: 공급사 리스트 */}
        <div className="w-full lg:w-64 shrink-0 flex flex-col gap-2">
          {/* 검색 + 분류 필터 */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2 flex flex-col gap-2">
            <input
              type="text"
              value={vendorSearch}
              onChange={e => setVendorSearch(e.target.value)}
              placeholder="공급사명 검색"
              className="w-full h-7 px-2.5 text-[11px] border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 transition"
            />
            <div className="flex flex-wrap gap-0.5">
              {(["전체", "위탁", "선결제", "60일회전", "90일회전", "기타"] as const).map(cat => (
                <button key={cat} onClick={() => setVendorCategoryFilter(cat)}
                  className={`h-6 px-2 text-[10px] font-semibold rounded transition cursor-pointer ${
                    vendorCategoryFilter === cat
                      ? cat === "전체" ? "bg-slate-700 text-white"
                      : cat === "위탁" ? "bg-violet-500 text-white"
                      : cat === "선결제" ? "bg-rose-500 text-white"
                      : cat === "60일회전" ? "bg-emerald-500 text-white"
                      : cat === "90일회전" ? "bg-teal-500 text-white"
                      : "bg-slate-500 text-white"
                      : "bg-slate-50 text-slate-500 border border-slate-200 hover:text-slate-700"
                  }`}>{cat}</button>
              ))}
            </div>
          </div>
          {/* 공급사 리스트 */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-y-auto flex-1 min-h-0 max-h-[60vh]">
            {vendorsLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-400 gap-2 text-[12px]">
                <Loader2 size={13} className="animate-spin" />불러오는 중...
              </div>
            ) : filteredVendors.length === 0 ? (
              <div className="py-8 text-center text-[11px] text-slate-300">공급사 없음</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filteredVendors.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVendor(v)}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-2 transition cursor-pointer ${
                      selectedVendor?.id === v.id
                        ? "bg-emerald-50 border-l-2 border-emerald-500"
                        : "hover:bg-slate-50 border-l-2 border-transparent"
                    }`}
                  >
                    <VendorCategoryBadge category={v.category} />
                    <span className={`text-[12px] font-semibold break-words whitespace-normal leading-tight flex-1 ${selectedVendor?.id === v.id ? "text-emerald-800" : "text-slate-700"}`}>
                      {v.company_name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 우측: 매입 이력 원장 */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2">
          {!selectedVendor ? (
            <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400 min-h-[400px]">
              <Package size={40} className="mb-3 opacity-30" />
              <div className="text-[11px] font-semibold">좌측에서 공급사를 선택하세요</div>
              <div className="text-[11px] mt-1">매입이력 원장이 표시됩니다</div>
            </div>
          ) : rowsLoading ? (
            <div className="bg-white rounded-xl border border-slate-200 flex-1 flex items-center justify-center min-h-[400px]">
              <Loader2 size={24} className="animate-spin text-emerald-500 opacity-60" />
            </div>
          ) : rowsError ? (
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-red-700">
              <div className="font-bold mb-1">조회 실패</div>
              <div className="text-[11px] font-mono">{rowsError}</div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-0 flex-1">
              {/* 공급사 헤더 */}
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                <Building2 size={14} className="text-emerald-600 shrink-0" />
                <VendorCategoryBadge category={selectedVendor.category} />
                <span className="text-[14px] font-black text-slate-800">{selectedVendor.company_name}</span>
                <div className="ml-auto flex items-center gap-3 text-[11px]">
                  <span className="text-slate-500">{rows.length}건</span>
                  <span className="font-black text-emerald-700">{fmtWon(totalAmount)}</span>
                </div>
              </div>
              {/* 원장 테이블 */}
              {rows.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-12 text-slate-400 text-[11px]">
                  해당 기간 매입 이력 없음
                </div>
              ) : (
                <div className="overflow-auto flex-1 min-h-0">
                  <table className="w-full text-xs min-w-[500px]">
                    <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
                      <tr className="text-[11px] text-slate-400 uppercase tracking-wider">
                        <th className="text-left px-2 py-2 w-7 text-slate-300">#</th>
                        <th onClick={() => toggleSort("date")}
                          className="text-left px-2 py-2 w-24 cursor-pointer select-none hover:bg-slate-50 transition">
                          날짜{arrow("date")}
                        </th>
                        <th onClick={() => toggleSort("product_name")}
                          className="text-left px-2 py-2 cursor-pointer select-none hover:bg-slate-50 transition">
                          상품명{arrow("product_name")}
                        </th>
                        <th onClick={() => toggleSort("quantity")}
                          className="text-right px-2 py-2 w-16 cursor-pointer select-none hover:bg-slate-50 transition">
                          수량{arrow("quantity")}
                        </th>
                        <th onClick={() => toggleSort("unit_price")}
                          className="text-right px-2 py-2 w-20 cursor-pointer select-none hover:bg-slate-50 transition">
                          단가{arrow("unit_price")}
                        </th>
                        <th onClick={() => toggleSort("amount")}
                          className="text-right px-2 py-2 w-24 text-emerald-600 cursor-pointer select-none hover:bg-emerald-50 transition">
                          금액{arrow("amount")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {sortedRows.map((r, i) => (
                        <tr key={`ph-${r.id}-${i}`} className="hover:bg-slate-50/60 transition-all duration-100">
                          <td className="px-2 py-1.5 text-slate-300 text-[11px] tabular-nums align-top">{i + 1}</td>
                          <td className="px-2 py-1.5 tabular-nums text-[11px] text-slate-500 align-top whitespace-nowrap">
                            {dateLabel(r.invoice_date)}
                          </td>
                          <td className="px-2 py-1.5 text-[12px] font-semibold text-slate-700 align-top break-words whitespace-normal leading-snug">
                            {r.product_name ?? "-"}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-[12px] text-slate-600 align-top">
                            {r.quantity != null ? fmt(r.quantity) : "-"}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-[12px] text-slate-600 align-top">
                            {r.unit_price != null ? fmt(r.unit_price) : "-"}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-[12px] font-semibold text-emerald-700 align-top">
                            {r.amount != null && r.amount > 0 ? fmt(r.amount) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 bg-white border-t-2 border-slate-200">
                      <tr>
                        <td colSpan={5} className="px-2 py-2 text-right text-[11px] font-black text-slate-500">합계</td>
                        <td className="px-2 py-2 text-right tabular-nums text-[13px] font-black text-emerald-700">{fmtWon(totalAmount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PurchaseHistoryTab;
