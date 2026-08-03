// src/components/OrderManagePage/PurchaseHistoryTab.tsx
// #146 · 매입 탭 > 매입이력 서브탭 · 공급사별 purchase_details 원장
// 2026-08-03 · UX 대공사 (Phase A/B/C)
//   · Phase A · 좌측 vendor 카드형 2줄 (VendorRowCard · sparkline · 최근성 · SKU)
//   · Phase B · 우측 상단 VendorHeaderPanel (KPI 4카드)
//   · Phase C · 우측 하단 PurchaseSubTabs (매입원장 · 상품별 · 매입추이)
// Ref · Zoho·QuickBooks·Odoo·Cin7 Procurement Dashboard 벤치마크

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Loader2, Package, RefreshCw } from "lucide-react";
import { SeasonButtons } from "../common/SeasonButtons";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import VendorRowCard, { type VendorSummary } from "./PurchaseHistoryTab/VendorRowCard";
import VendorHeaderPanel, { type VendorFull } from "./PurchaseHistoryTab/VendorHeaderPanel";
import PurchaseSubTabs, {
  type PurchaseLedgerRow,
  type PurchaseDetailRow,
} from "./PurchaseHistoryTab/PurchaseSubTabs";

// ─── Types ───────────────────────────────────────────────────────────────────

// VendorFull · VendorHeaderPanel 에서 export · here alias
type VendorItem = VendorFull;

interface SummaryResponse {
  suppliers: Array<VendorSummary & { supplier: string }>;
}

// ─── PurchaseHistoryTab ───────────────────────────────────────────────────────

export const PurchaseHistoryTab: React.FC = () => {
  // 공급사 목록
  const [vendors, setVendors] = useState<VendorItem[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorCategoryFilter, setVendorCategoryFilter] =
    useState<"전체" | "위탁" | "선결제" | "60일회전" | "90일회전" | "기타">("전체");

  // 좌측 요약 (VendorRowCard 용)
  const [summaryMap, setSummaryMap] = useState<Map<string, VendorSummary>>(new Map());
  const [, setSummaryLoading] = useState(false);

  // 좌측 정렬
  type LeftSort = "recent" | "amount" | "name";
  const [leftSort, setLeftSort] = useState<LeftSort>("recent");

  // 선택 공급사
  const [selectedVendor, setSelectedVendor] = useState<VendorItem | null>(null);

  // 우측 · 원장 (기간 필터 반영 · Tab 1 표시용)
  const [ledgerRows, setLedgerRows] = useState<PurchaseLedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  // 우측 · detail (최근 365일 · KPI + Tab 2/3 용 · 기간 필터 무관)
  const [detailRows, setDetailRows] = useState<PurchaseDetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // 기간 필터 (원장 탭 전용)
  const [periodMonths, setPeriodMonths] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(1);
  const [periodSeason, setPeriodSeason] = useState<SeasonKey | null>(null);

  // ─── 공급사 목록 로드 ────────────────────────────────────────────────────
  const loadVendors = useCallback(async () => {
    setVendorsLoading(true);
    try {
      const res = await fetch("/api/vendors?withBalances=1");
      if (!res.ok) throw new Error(String(res.status));
      const list: any[] = await res.json();
      setVendors(list.map(v => ({
        id: v.id,
        company_name: String(v.company_name ?? ""),
        category: v.category ?? null,
        contact_name: v.contact_name ?? null,
        phone: v.phone ?? null,
        email: v.email ?? null,
        business_number: v.business_number ?? null,
        note: v.note ?? null,
        created_at: v.created_at ?? null,
      })));
    } catch { setVendors([]); }
    finally { setVendorsLoading(false); }
  }, []);

  // ─── 좌측 요약 (최근 90일) 로드 ─────────────────────────────────────────
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch("/api/supplier-purchase-summary?days=90");
      if (!res.ok) throw new Error(String(res.status));
      const j: SummaryResponse = await res.json();
      const map = new Map<string, VendorSummary>();
      for (const s of j.suppliers ?? []) {
        map.set(s.supplier, {
          last_purchase_date: s.last_purchase_date,
          this_month_amount: s.this_month_amount,
          total_amount: s.total_amount,
          purchase_count: s.purchase_count,
          sku_count: s.sku_count,
          weekly_sparkline: Array.isArray(s.weekly_sparkline) && s.weekly_sparkline.length === 12
            ? s.weekly_sparkline
            : new Array(12).fill(0),
        });
      }
      setSummaryMap(map);
    } catch {
      setSummaryMap(new Map());
    } finally { setSummaryLoading(false); }
  }, []);

  useEffect(() => {
    loadVendors();
    loadSummary();
    const onChange = () => { loadVendors(); loadSummary(); };
    window.addEventListener("vendors-changed", onChange);
    return () => window.removeEventListener("vendors-changed", onChange);
  }, [loadVendors, loadSummary]);

  // ─── 원장 (기간 필터) 로드 ─────────────────────────────────────────────
  const loadLedger = useCallback(async (supplier: string) => {
    setLedgerLoading(true);
    setLedgerError(null);
    try {
      const isDays10 = periodMonths === 0 && !periodSeason;
      const days = periodSeason
        ? 365
        : isDays10 ? 10 : (periodMonths || 1) * 30;
      const params = new URLSearchParams({ supplier, days: String(days) });
      const res = await fetch(`/api/supplier-ledger?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      const allRows: any[] = Array.isArray(j.rows) ? j.rows : [];
      const purchaseRows: PurchaseLedgerRow[] = allRows
        .filter((r: any) => r.type === "purchase")
        .map((r: any) => ({
          id: r.id,
          invoice_date: r.date ?? null,
          product_name: r.memo ?? null,
          quantity: null,
          unit_price: null,
          amount: Number(r.amount) || 0,
        }));
      setLedgerRows(purchaseRows);
    } catch (e: any) {
      setLedgerError(e?.message ?? "네트워크 오류");
      setLedgerRows([]);
    } finally { setLedgerLoading(false); }
  }, [periodMonths, periodSeason]);

  // ─── detail (최근 1년) 로드 ────────────────────────────────────────────
  const loadDetail = useCallback(async (supplier: string) => {
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({ supplier, days: "365" });
      const res = await fetch(`/api/supplier-purchase-detail?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      const rows: PurchaseDetailRow[] = Array.isArray(j.rows) ? j.rows : [];
      setDetailRows(rows);
    } catch {
      setDetailRows([]);
    } finally { setDetailLoading(false); }
  }, []);

  // 공급사 선택 시 · 원장 + detail 동시 로드
  useEffect(() => {
    if (!selectedVendor) {
      setLedgerRows([]);
      setDetailRows([]);
      return;
    }
    loadLedger(selectedVendor.company_name);
    loadDetail(selectedVendor.company_name);
  }, [selectedVendor, loadLedger, loadDetail]);

  // 기간 필터 바뀌면 원장만 재로드 (selectedVendor 있을 때)
  // loadLedger 는 periodMonths/periodSeason deps → callback 새로 만들어짐 → 위 effect 재실행
  //   (이미 useEffect 가 loadLedger 를 deps 로 잡음)

  // ─── 필터링 · 정렬된 좌측 리스트 ────────────────────────────────────────
  const filteredVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    const list = vendors.filter(v => {
      if (q && !v.company_name.toLowerCase().includes(q)) return false;
      if (vendorCategoryFilter !== "전체" && v.category !== vendorCategoryFilter) return false;
      return true;
    });
    // 정렬
    return list.sort((a, b) => {
      const sa = summaryMap.get(a.company_name);
      const sb = summaryMap.get(b.company_name);
      if (leftSort === "recent") {
        // 최근 매입일 desc · null 은 뒤
        const da = sa?.last_purchase_date ?? "";
        const db = sb?.last_purchase_date ?? "";
        if (da !== db) return db.localeCompare(da);
        return a.company_name.localeCompare(b.company_name, "ko");
      }
      if (leftSort === "amount") {
        const va = sa?.total_amount ?? 0;
        const vb = sb?.total_amount ?? 0;
        if (va !== vb) return vb - va;
        return a.company_name.localeCompare(b.company_name, "ko");
      }
      // name
      return a.company_name.localeCompare(b.company_name, "ko");
    });
  }, [vendors, vendorSearch, vendorCategoryFilter, summaryMap, leftSort]);

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* 상단 필터바 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Building2 size={14} className="text-emerald-500 shrink-0" />
          <span className="text-[13px] font-semibold text-slate-800">매입이력</span>
          {selectedVendor && (
            <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5 border border-emerald-200 tabular-nums">
              {ledgerRows.length}건
            </span>
          )}
        </div>
        {/* 기간 필터 · 원장 탭 전용 */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">원장 기간</span>
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
            onClick={() => {
              loadLedger(selectedVendor.company_name);
              loadDetail(selectedVendor.company_name);
              loadSummary();
            }}
            disabled={ledgerLoading}
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-slate-400 hover:text-emerald-500 transition disabled:opacity-40 cursor-pointer"
            title="새로고침"
          >
            <RefreshCw size={13} className={ledgerLoading ? "animate-spin" : ""} />
          </button>
        )}
      </div>

      {/* 좌우 분할 */}
      <div className="flex flex-col lg:flex-row gap-2 flex-1 min-h-0">
        {/* 좌측: 공급사 리스트 (카드형 2줄) */}
        <div className="w-full lg:w-80 shrink-0 flex flex-col gap-2">
          {/* 검색 + 분류 필터 + 정렬 */}
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
            {/* 정렬 · 최근/금액/가나다 */}
            <div className="flex items-center gap-1 pt-1 border-t border-slate-100">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">정렬</span>
              {([
                { k: "recent" as const, label: "최근매입" },
                { k: "amount" as const, label: "매입액" },
                { k: "name"   as const, label: "가나다" },
              ]).map(o => (
                <button
                  key={o.k}
                  type="button"
                  onClick={() => setLeftSort(o.k)}
                  className={`h-5 px-1.5 text-[10px] font-semibold rounded transition cursor-pointer ${
                    leftSort === o.k
                      ? "bg-emerald-500 text-white"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  }`}
                >{o.label}</button>
              ))}
            </div>
          </div>
          {/* 공급사 리스트 · 카드 2줄 */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-y-auto flex-1 min-h-0 max-h-[65vh]">
            {vendorsLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-400 gap-2 text-[12px]">
                <Loader2 size={13} className="animate-spin" />불러오는 중...
              </div>
            ) : filteredVendors.length === 0 ? (
              <div className="py-8 text-center text-[11px] text-slate-300">공급사 없음</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filteredVendors.map(v => (
                  <VendorRowCard
                    key={v.id}
                    vendorId={v.id}
                    companyName={v.company_name}
                    category={v.category}
                    summary={summaryMap.get(v.company_name) ?? null}
                    active={selectedVendor?.id === v.id}
                    onSelect={() => setSelectedVendor(v)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 우측: 헤더 + 서브탭 */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2">
          {!selectedVendor ? (
            <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400 min-h-[400px]">
              <Package size={40} className="mb-3 opacity-30" />
              <div className="text-[11px] font-semibold">좌측에서 공급사를 선택하세요</div>
              <div className="text-[11px] mt-1">매입이력 · 상품별 집계 · 매입 추이가 표시됩니다</div>
            </div>
          ) : ledgerError ? (
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-red-700">
              <div className="font-bold mb-1">원장 조회 실패</div>
              <div className="text-[11px] font-mono">{ledgerError}</div>
            </div>
          ) : (
            <>
              {/* Phase B · 공급사 헤더 + KPI 4카드 */}
              <VendorHeaderPanel
                vendor={selectedVendor}
                detailRows={detailRows}
                loading={detailLoading}
              />
              {/* Phase C · 서브탭 3개 (매입원장 · 상품별 · 매입추이) */}
              <PurchaseSubTabs
                ledgerRows={ledgerRows}
                ledgerLoading={ledgerLoading}
                detailRows={detailRows}
                detailLoading={detailLoading}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PurchaseHistoryTab;
