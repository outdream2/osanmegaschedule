// src/components/OrderManagePage/PaymentInfoTab.tsx
// #147 · 결제 탭 > 결제정보 서브탭 · 공급사별 결제 KPI + 원장
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

interface LedgerRow {
  id: string | number;
  type: "purchase" | "payment";
  date: string | null;
  amount: number;
  method: string | null;
  memo: string | null;
  running_balance: number;
}

interface LedgerSummary {
  supplier: string;
  rows: LedgerRow[];
  total_purchase: number;
  total_payment: number;
  current_balance: number;
}

type SortKey = "date" | "type" | "amount" | "running_balance";
type SortDir = "asc" | "desc";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

function fmtWon(n: number): string {
  if (Math.abs(n) >= 10000_0000) return `${(n / 10000_0000).toFixed(1)}억`;
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}만`;
  return fmt(n) + "원";
}

function methodLabel(m: string | null): string {
  if (!m) return "-";
  const map: Record<string, string> = {
    transfer: "이체", cash: "현금", card: "카드",
    check: "수표", offset: "상계", etc: "기타",
  };
  return map[m] ?? m;
}

function dateLabel(d: string | null): string {
  if (!d) return "-";
  return String(d).slice(0, 10);
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

const KpiCard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  color: "emerald" | "sky" | "rose" | "amber";
}> = ({ label, value, sub, color }) => {
  const colors = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    sky:     "bg-sky-50 border-sky-200 text-sky-700",
    rose:    "bg-rose-50 border-rose-200 text-rose-700",
    amber:   "bg-amber-50 border-amber-200 text-amber-700",
  };
  return (
    <div className={`rounded-xl border p-3 ${colors[color]}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-[18px] font-black mt-0.5 tabular-nums">{value}</div>
      {sub && <div className="text-[10px] opacity-60 mt-0.5">{sub}</div>}
    </div>
  );
};

// ─── PaymentInfoTab ───────────────────────────────────────────────────────────

export const PaymentInfoTab: React.FC = () => {
  // 공급사 목록
  const [vendors, setVendors] = useState<VendorItem[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorCategoryFilter, setVendorCategoryFilter] = useState<"전체" | "위탁" | "선결제" | "60일회전" | "90일회전" | "기타">("전체");

  // 선택 공급사
  const [selectedVendor, setSelectedVendor] = useState<VendorItem | null>(null);

  // 원장 데이터
  const [ledger, setLedger] = useState<LedgerSummary | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

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

  // 원장 로드
  const loadLedger = useCallback(async (supplier: string) => {
    setLedgerLoading(true);
    setLedgerError(null);
    try {
      const days = periodSeason ? 365 : (periodMonths === 0 ? 10 : (periodMonths || 1) * 30);
      const params = new URLSearchParams({ supplier, days: String(days) });
      const res = await fetch(`/api/supplier-ledger?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      setLedger({
        supplier: j.supplier ?? supplier,
        rows: Array.isArray(j.rows) ? j.rows : [],
        total_purchase: Number(j.total_purchase ?? 0),
        total_payment: Number(j.total_payment ?? 0),
        current_balance: Number(j.current_balance ?? 0),
      });
    } catch (e: any) {
      setLedgerError(e?.message ?? "네트워크 오류");
      setLedger(null);
    } finally { setLedgerLoading(false); }
  }, [periodMonths, periodSeason]);

  useEffect(() => {
    if (selectedVendor) loadLedger(selectedVendor.company_name);
    else setLedger(null);
  }, [selectedVendor, loadLedger]);

  // 필터링된 공급사
  const filteredVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    return vendors.filter(v => {
      if (q && !v.company_name.toLowerCase().includes(q)) return false;
      if (vendorCategoryFilter !== "전체" && v.category !== vendorCategoryFilter) return false;
      return true;
    });
  }, [vendors, vendorSearch, vendorCategoryFilter]);

  // 결제방법 카운트 (purchase 제외)
  const methodCount = useMemo(() => {
    if (!ledger) return {};
    const m: Record<string, number> = {};
    for (const r of ledger.rows) {
      if (r.type !== "payment") continue;
      const k = r.method ?? "etc";
      m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  }, [ledger]);

  // 정렬된 원장 행
  const sortedRows = useMemo(() => {
    if (!ledger) return [];
    const sign = sortDir === "asc" ? 1 : -1;
    return [...ledger.rows].sort((a, b) => {
      switch (sortKey) {
        case "date":            return sign * String(a.date ?? "").localeCompare(String(b.date ?? ""));
        case "type":            return sign * String(a.type).localeCompare(String(b.type));
        case "amount":          return sign * (a.amount - b.amount);
        case "running_balance": return sign * (a.running_balance - b.running_balance);
        default:                return 0;
      }
    });
  }, [ledger, sortKey, sortDir]);

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* 상단 필터바 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Building2 size={14} className="text-sky-500 shrink-0" />
          <span className="text-[13px] font-semibold text-slate-800">결제정보</span>
          {selectedVendor && ledger && (
            <span className="text-[11px] font-semibold text-sky-600 bg-sky-50 rounded-full px-2 py-0.5 border border-sky-200 tabular-nums">
              {ledger.rows.length}건
            </span>
          )}
        </div>
        {/* 기간 */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">기간</span>
          <div className="inline-flex bg-slate-50 border border-slate-200 rounded-md p-0.5">
            <button onClick={() => { setPeriodSeason(null); setPeriodMonths(0); }}
              className={`px-2 h-6 text-[11px] font-semibold rounded transition cursor-pointer ${!periodSeason && periodMonths === 0 ? "bg-sky-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>10일</button>
            {([1, 2, 3, 4, 5, 6] as const).map(m => (
              <button key={m} onClick={() => { setPeriodSeason(null); setPeriodMonths(m); }}
                className={`px-2 h-6 text-[11px] font-semibold rounded transition cursor-pointer ${!periodSeason && periodMonths === m ? "bg-sky-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{m}개월</button>
            ))}
          </div>
          <SeasonButtons value={periodSeason} onChange={(v) => { setPeriodSeason(v); if (v) setPeriodMonths(0); }} size="sm" hideLabel />
        </div>
        {selectedVendor && (
          <button
            type="button"
            onClick={() => loadLedger(selectedVendor.company_name)}
            disabled={ledgerLoading}
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-sky-50 hover:border-sky-300 text-slate-400 hover:text-sky-500 transition disabled:opacity-40 cursor-pointer"
            title="새로고침"
          >
            <RefreshCw size={13} className={ledgerLoading ? "animate-spin" : ""} />
          </button>
        )}
      </div>

      {/* 좌우 분할 */}
      <div className="flex flex-col lg:flex-row gap-2 flex-1 min-h-0">
        {/* 좌측: 공급사 리스트 */}
        <div className="w-full lg:w-64 shrink-0 flex flex-col gap-2">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2 flex flex-col gap-2">
            <input
              type="text"
              value={vendorSearch}
              onChange={e => setVendorSearch(e.target.value)}
              placeholder="공급사명 검색"
              className="w-full h-7 px-2.5 text-[11px] border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-sky-400 focus:border-sky-400 transition"
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
                        ? "bg-sky-50 border-l-2 border-sky-500"
                        : "hover:bg-slate-50 border-l-2 border-transparent"
                    }`}
                  >
                    <VendorCategoryBadge category={v.category} />
                    <span className={`text-[12px] font-semibold break-words whitespace-normal leading-tight flex-1 ${selectedVendor?.id === v.id ? "text-sky-800" : "text-slate-700"}`}>
                      {v.company_name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 우측: 결제정보 상세 */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-3">
          {!selectedVendor ? (
            <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400 min-h-[400px]">
              <Package size={40} className="mb-3 opacity-30" />
              <div className="text-[11px] font-semibold">좌측에서 공급사를 선택하세요</div>
              <div className="text-[11px] mt-1">결제정보와 원장이 표시됩니다</div>
            </div>
          ) : ledgerLoading ? (
            <div className="bg-white rounded-xl border border-slate-200 flex-1 flex items-center justify-center min-h-[400px]">
              <Loader2 size={24} className="animate-spin text-sky-500 opacity-60" />
            </div>
          ) : ledgerError ? (
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-red-700">
              <div className="font-bold mb-1">조회 실패</div>
              <div className="text-[11px] font-mono">{ledgerError}</div>
            </div>
          ) : ledger ? (
            <>
              {/* 공급사 헤더 + 결제방법 요약 */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Building2 size={14} className="text-sky-600 shrink-0" />
                  <VendorCategoryBadge category={selectedVendor.category} />
                  <span className="text-[15px] font-black text-slate-800">{selectedVendor.company_name}</span>
                </div>
                {/* 결제방법 요약 */}
                {Object.keys(methodCount).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[10px] font-semibold text-slate-400 self-center">결제방법</span>
                    {Object.entries(methodCount).map(([method, cnt]) => (
                      <span key={method} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold border border-slate-200">
                        {methodLabel(method)} <span className="tabular-nums text-slate-400">{cnt}회</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* KPI 4카드 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <KpiCard
                  label="총 매입액"
                  value={fmtWon(ledger.total_purchase)}
                  sub="기간 내 OCR 확정"
                  color="emerald"
                />
                <KpiCard
                  label="총 결제액"
                  value={fmtWon(ledger.total_payment)}
                  sub="기간 내 결제"
                  color="sky"
                />
                <KpiCard
                  label="남은 잔고"
                  value={fmtWon(ledger.current_balance)}
                  sub="매입 - 결제"
                  color={ledger.current_balance > 0 ? "amber" : "emerald"}
                />
                <KpiCard
                  label="원장 건수"
                  value={String(ledger.rows.length)}
                  sub={`매입 ${ledger.rows.filter(r => r.type === "purchase").length} · 결제 ${ledger.rows.filter(r => r.type === "payment").length}`}
                  color="sky"
                />
              </div>

              {/* 원장 테이블 */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-0 flex-1">
                <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                  <span className="text-[12px] font-black text-slate-700">매입·결제 통합 원장</span>
                  <span className="text-[10px] text-slate-400 ml-auto">시간순 · running balance</span>
                </div>
                {ledger.rows.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center py-12 text-slate-400 text-[11px]">
                    해당 기간 내역 없음
                  </div>
                ) : (
                  <div className="overflow-auto flex-1 min-h-0">
                    <table className="w-full text-xs min-w-[520px]">
                      <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
                        <tr className="text-[11px] text-slate-400 uppercase tracking-wider">
                          <th className="text-left px-2 py-2 w-7 text-slate-300">#</th>
                          <th onClick={() => toggleSort("date")}
                            className="text-left px-2 py-2 w-24 cursor-pointer select-none hover:bg-slate-50 transition">
                            날짜{arrow("date")}
                          </th>
                          <th onClick={() => toggleSort("type")}
                            className="text-left px-2 py-2 w-16 cursor-pointer select-none hover:bg-slate-50 transition">
                            구분{arrow("type")}
                          </th>
                          <th className="text-left px-2 py-2">메모</th>
                          <th className="text-left px-2 py-2 w-16">방법</th>
                          <th onClick={() => toggleSort("amount")}
                            className="text-right px-2 py-2 w-24 cursor-pointer select-none hover:bg-slate-50 transition">
                            금액{arrow("amount")}
                          </th>
                          <th onClick={() => toggleSort("running_balance")}
                            className="text-right px-2 py-2 w-24 cursor-pointer select-none hover:bg-slate-50 transition">
                            잔고{arrow("running_balance")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {sortedRows.map((r, i) => {
                          const isPurchase = r.type === "purchase";
                          return (
                            <tr key={`led-${r.id}-${i}`} className={`transition-all duration-100 ${isPurchase ? "hover:bg-emerald-50/30" : "hover:bg-sky-50/30"}`}>
                              <td className="px-2 py-1.5 text-slate-300 text-[11px] tabular-nums align-top">{i + 1}</td>
                              <td className="px-2 py-1.5 tabular-nums text-[11px] text-slate-500 align-top whitespace-nowrap">
                                {dateLabel(r.date)}
                              </td>
                              <td className="px-2 py-1.5 align-top">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black leading-none ${
                                  isPurchase
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-sky-100 text-sky-700"
                                }`}>
                                  {isPurchase ? "매입" : "결제"}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-[11px] text-slate-600 align-top break-words whitespace-normal leading-snug">
                                {r.memo ?? "-"}
                              </td>
                              <td className="px-2 py-1.5 text-[11px] text-slate-400 align-top whitespace-nowrap">
                                {isPurchase ? "-" : methodLabel(r.method)}
                              </td>
                              <td className={`px-2 py-1.5 text-right tabular-nums text-[12px] font-semibold align-top ${isPurchase ? "text-emerald-700" : "text-sky-700"}`}>
                                {isPurchase ? "+" : "-"}{fmt(r.amount)}
                              </td>
                              <td className={`px-2 py-1.5 text-right tabular-nums text-[12px] font-black align-top ${r.running_balance > 0 ? "text-amber-700" : r.running_balance < 0 ? "text-rose-700" : "text-slate-400"}`}>
                                {fmt(r.running_balance)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="sticky bottom-0 bg-white border-t-2 border-slate-200">
                        <tr>
                          <td colSpan={5} className="px-2 py-2 text-right text-[11px] font-black text-slate-500">최종잔고</td>
                          <td className="px-2 py-2 text-right text-[11px] font-black text-slate-500">
                            {fmtWon(ledger.total_purchase)}
                          </td>
                          <td className={`px-2 py-2 text-right tabular-nums text-[13px] font-black ${ledger.current_balance > 0 ? "text-amber-700" : ledger.current_balance < 0 ? "text-rose-700" : "text-slate-400"}`}>
                            {fmtWon(ledger.current_balance)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default PaymentInfoTab;
