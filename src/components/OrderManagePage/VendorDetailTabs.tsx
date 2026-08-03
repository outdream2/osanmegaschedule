// src/components/OrderManagePage/VendorDetailTabs.tsx
// 공급사 상세 패널 — 하단 2탭 (결제내역 · 매입이력)
// VendorInfoHeader 아래에 배치 · vendor, ledger, purchase-detail API 활용
// Props: vendor (VendorBasic) → 내부에서 직접 fetch

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2, RefreshCw, Filter, X, Package2, ReceiptText,
} from "lucide-react";
import { VendorInfoHeader, type VendorBasic, type VendorKpi } from "./VendorInfoHeader";
import { SeasonButtons } from "../common/SeasonButtons";
import { type SeasonKey } from "../../hooks/useSeasonRanges";

// ─── Types ────────────────────────────────────────────────────────────────

interface LedgerRow {
  id: string | number;
  type: "purchase" | "payment";
  date: string | null;
  amount: number;
  method: string | null;
  memo: string | null;
  running_balance: number;
  // 2026-08-03 · #193 · VAT 통합 (서버 계산 · row 저장값 또는 vendor.vat_included 기반)
  vat_amount?: number;
  supply_amount?: number;
  tax_invoice_no?: string | null;
}

interface LedgerSummary {
  supplier: string;
  rows: LedgerRow[];
  total_purchase: number;
  total_payment: number;
  current_balance: number;
  // 2026-08-03 · #193 · VAT 통합 소계
  vat_included: boolean | null;
  total_purchase_vat: number;
  total_purchase_supply: number;
  total_payment_vat: number;
  total_payment_supply: number;
}

interface PurchaseDetailRow {
  id: string | number;
  date: string;
  product_code: string | null;
  product_name: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  // 2026-08-03 · #193
  vat_amount?: number;
  supply_amount?: number;
}

interface ProductStat {
  product_code: string;
  product_name: string;
  buy_count: number;
  total_qty: number;
  total_amount: number;
  latest_date: string | null;
  latest_unit_price: number;
}

type LedgerSortKey = "date" | "type" | "amount" | "running_balance";
type PurchaseSortKey = "date" | "product_name" | "quantity" | "amount";
type SortDir = "asc" | "desc";

// ─── Helpers ─────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

function methodLabel(m: string | null): string {
  if (!m) return "-";
  const map: Record<string, string> = {
    transfer: "이체", cash: "현금", card: "카드",
    check: "수표", offset: "상계", etc: "기타",
  };
  return map[m] ?? m;
}

function dateLabel(d: string | null | undefined): string {
  if (!d) return "-";
  return String(d).slice(0, 10);
}

function calcAvgCycle(rows: PurchaseDetailRow[]): number | null {
  const dates = new Set(rows.map(r => r.date).filter(Boolean));
  if (dates.size < 2) return null;
  const sorted = Array.from(dates).sort();
  let sum = 0;
  for (let i = 1; i < sorted.length; i++) {
    sum += (new Date(sorted[i] + "T00:00:00").getTime() - new Date(sorted[i - 1] + "T00:00:00").getTime()) / 86400000;
  }
  return Math.round(sum / (sorted.length - 1));
}

// ─── Tab bar ──────────────────────────────────────────────────────────────

type TabKey = "balance" | "history";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "balance", label: "결제내역", icon: <ReceiptText size={12} /> },
  { key: "history", label: "매입이력", icon: <Package2 size={12} /> },
];

// ─── Ledger tab content ────────────────────────────────────────────────────

const LedgerContent: React.FC<{
  ledger: LedgerSummary | null;
  loading: boolean;
  error: string | null;
}> = ({ ledger, loading, error }) => {
  const [sortKey, setSortKey] = useState<LedgerSortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const toggleSort = (k: LedgerSortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };
  const arrow = (k: LedgerSortKey) => sortKey !== k ? " ⇅" : sortDir === "asc" ? " ▲" : " ▼";

  const rows = useMemo(() => {
    if (!ledger) return [];
    const sign = sortDir === "asc" ? 1 : -1;
    return [...ledger.rows].sort((a, b) => {
      switch (sortKey) {
        case "date":            return sign * String(a.date ?? "").localeCompare(String(b.date ?? ""));
        case "type":            return sign * a.type.localeCompare(b.type);
        case "amount":          return sign * (a.amount - b.amount);
        case "running_balance": return sign * (a.running_balance - b.running_balance);
        default:                return 0;
      }
    });
  }, [ledger, sortKey, sortDir]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center py-16 text-slate-400 gap-2">
      <Loader2 size={18} className="animate-spin" />
      <span className="text-[12px]">원장 로딩 중...</span>
    </div>
  );
  if (error) return (
    <div className="flex-1 flex items-center justify-center py-12 text-rose-600 text-[11px]">{error}</div>
  );
  if (!ledger || rows.length === 0) return (
    <div className="flex-1 flex items-center justify-center py-16 text-slate-400 text-[11px]">
      해당 기간 원장 내역 없음
    </div>
  );

  // VAT 컬럼 표시 여부 · row 에 하나라도 vat_amount > 0 있으면 활성 (vendor.vat_included=null 이면 전부 0)
  const showVatCol = rows.some(r => (r.vat_amount ?? 0) > 0);

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <table className="w-full text-xs min-w-[520px]">
        <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
          <tr className="text-[10px] text-slate-400 uppercase tracking-wider">
            <th className="text-left px-3 py-2 w-6 text-slate-300">#</th>
            <th onClick={() => toggleSort("date")}
              className="text-left px-3 py-2 w-24 cursor-pointer select-none hover:bg-slate-50 transition">
              날짜{arrow("date")}
            </th>
            <th onClick={() => toggleSort("type")}
              className="text-left px-3 py-2 w-14 cursor-pointer select-none hover:bg-slate-50 transition">
              구분{arrow("type")}
            </th>
            <th className="text-left px-3 py-2">메모</th>
            <th className="text-left px-3 py-2 w-14">방법</th>
            <th onClick={() => toggleSort("amount")}
              className="text-right px-3 py-2 w-24 cursor-pointer select-none hover:bg-slate-50 transition">
              금액{arrow("amount")}
            </th>
            {showVatCol && (
              <th className="text-right px-3 py-2 w-20 text-slate-400" title="부가세 (row 저장값 또는 vendor.vat_included 기반 계산)">
                VAT
              </th>
            )}
            <th onClick={() => toggleSort("running_balance")}
              className="text-right px-3 py-2 w-24 cursor-pointer select-none hover:bg-slate-50 transition">
              잔고{arrow("running_balance")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((r, i) => {
            const isPurchase = r.type === "purchase";
            const vat = r.vat_amount ?? 0;
            return (
              <tr key={`led-${r.id}-${i}`}
                className={`transition-all duration-100 ${isPurchase ? "hover:bg-emerald-50/30" : "hover:bg-sky-50/30"}`}>
                <td className="px-3 py-1.5 text-slate-300 text-[10px] tabular-nums align-top">{i + 1}</td>
                <td className="px-3 py-1.5 tabular-nums text-[11px] text-slate-500 align-top whitespace-nowrap">
                  {dateLabel(r.date)}
                </td>
                <td className="px-3 py-1.5 align-top">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black leading-none ${
                    isPurchase ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"
                  }`}>
                    {isPurchase ? "매입" : "결제"}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-[11px] text-slate-600 align-top break-words whitespace-normal leading-snug">
                  {r.memo ?? "-"}
                  {!isPurchase && r.tax_invoice_no && (
                    <span className="inline-flex items-center ml-1 px-1 py-px rounded text-[9px] font-bold bg-violet-50 text-violet-700 border border-violet-200 leading-none align-middle" title={`전자세금계산서 승인번호: ${r.tax_invoice_no}`}>
                      세금계산서 {r.tax_invoice_no.slice(-8)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-[11px] text-slate-400 align-top whitespace-nowrap">
                  {isPurchase ? "-" : methodLabel(r.method)}
                </td>
                <td className={`px-3 py-1.5 text-right tabular-nums text-[12px] font-semibold align-top ${isPurchase ? "text-emerald-700" : "text-sky-700"}`}>
                  {isPurchase ? "+" : "-"}{fmt(r.amount)}
                </td>
                {showVatCol && (
                  <td className="px-3 py-1.5 text-right tabular-nums text-[11px] text-slate-500 align-top">
                    {vat > 0 ? fmt(vat) : <span className="text-slate-300">-</span>}
                  </td>
                )}
                <td className={`px-3 py-1.5 text-right tabular-nums text-[12px] font-black align-top ${
                  r.running_balance > 0 ? "text-amber-700" : r.running_balance < 0 ? "text-rose-700" : "text-slate-400"
                }`}>
                  {fmt(r.running_balance)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="sticky bottom-0 bg-slate-50 border-t-2 border-slate-200">
          <tr>
            <td colSpan={5} className="px-3 py-2 text-right text-[11px] font-black text-slate-500">기간 합계</td>
            <td className="px-3 py-2 text-right text-[11px] font-semibold text-slate-500 tabular-nums" title={`매입 ${fmt(ledger.total_purchase)} / 결제 ${fmt(ledger.total_payment)}`}>
              {fmt(ledger.total_purchase - ledger.total_payment)}
            </td>
            {showVatCol && (
              <td className="px-3 py-2 text-right text-[11px] font-black text-slate-500 tabular-nums" title={`매입VAT ${fmt(ledger.total_purchase_vat)} · 결제VAT ${fmt(ledger.total_payment_vat)}`}>
                {fmt(ledger.total_purchase_vat)}
              </td>
            )}
            <td className={`px-3 py-2 text-right tabular-nums text-[13px] font-black ${
              ledger.current_balance > 0 ? "text-amber-700" : ledger.current_balance < 0 ? "text-rose-700" : "text-slate-400"
            }`}>
              {fmt(ledger.current_balance)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

// ─── Purchase history tab content ─────────────────────────────────────────

const HistoryContent: React.FC<{
  detailRows: PurchaseDetailRow[];
  loading: boolean;
}> = ({ detailRows, loading }) => {
  const [productSearch, setProductSearch] = useState("");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"sku" | "all">("sku");
  const [sortKey, setSortKey] = useState<PurchaseSortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const toggleSort = (k: PurchaseSortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };
  const arrow = (k: PurchaseSortKey) => sortKey !== k ? " ⇅" : sortDir === "asc" ? " ▲" : " ▼";

  // 상품별 집계
  const productStats = useMemo<ProductStat[]>(() => {
    const byCode = new Map<string, ProductStat>();
    for (const r of detailRows) {
      const code = (r.product_code ?? "").trim();
      const name = (r.product_name ?? code).trim();
      if (!code) continue;
      const cur = byCode.get(code);
      if (cur) {
        cur.buy_count++;
        cur.total_qty += r.quantity;
        cur.total_amount += r.amount;
        if (!cur.latest_date || r.date > cur.latest_date) {
          cur.latest_date = r.date;
          cur.latest_unit_price = r.unit_price;
        }
      } else {
        byCode.set(code, {
          product_code: code,
          product_name: name,
          buy_count: 1,
          total_qty: r.quantity,
          total_amount: r.amount,
          latest_date: r.date,
          latest_unit_price: r.unit_price,
        });
      }
    }
    const q = productSearch.trim().toLowerCase();
    const list = Array.from(byCode.values()).filter(s =>
      !q || s.product_name.toLowerCase().includes(q) || s.product_code.toLowerCase().includes(q)
    );
    list.sort((a, b) => b.total_amount - a.total_amount);
    return list;
  }, [detailRows, productSearch]);

  // 전체 raw 행 (정렬)
  const allRows = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    let base = detailRows;
    if (selectedCode) base = base.filter(r => r.product_code === selectedCode);
    if (q && !selectedCode) {
      base = base.filter(r =>
        (r.product_name ?? "").toLowerCase().includes(q) ||
        (r.product_code ?? "").toLowerCase().includes(q)
      );
    }
    const sign = sortDir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      switch (sortKey) {
        case "date":         return sign * String(a.date ?? "").localeCompare(String(b.date ?? ""));
        case "product_name": return sign * String(a.product_name ?? "").localeCompare(String(b.product_name ?? ""), "ko");
        case "quantity":     return sign * (a.quantity - b.quantity);
        case "amount":       return sign * (a.amount - b.amount);
        default:             return 0;
      }
    });
  }, [detailRows, productSearch, selectedCode, sortKey, sortDir]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center py-16 text-slate-400 gap-2">
      <Loader2 size={18} className="animate-spin" />
      <span className="text-[12px]">매입이력 로딩 중...</span>
    </div>
  );
  if (detailRows.length === 0) return (
    <div className="flex-1 flex items-center justify-center py-16 text-slate-400 text-[11px]">
      해당 기간 매입이력 없음
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      {/* 툴바 */}
      <div className="flex items-center gap-2 flex-wrap px-1">
        {/* 뷰 토글 */}
        <div className="inline-flex bg-slate-100 border border-slate-200 rounded-lg p-0.5 gap-0.5">
          {(["sku", "all"] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`h-6 px-3 rounded-md text-[11px] font-black transition cursor-pointer whitespace-nowrap ${
                viewMode === mode
                  ? "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {mode === "sku" ? "상품별 집계" : "전체 원장"}
            </button>
          ))}
        </div>
        {/* 검색 */}
        <input
          type="text"
          value={productSearch}
          onChange={e => setProductSearch(e.target.value)}
          placeholder="상품명·코드 검색"
          className="h-7 px-2.5 text-[11px] border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 transition w-40"
        />
        {/* 건수 */}
        <span className="text-[10px] text-slate-400 tabular-nums">
          {viewMode === "sku" ? `${productStats.length} SKU` : `${allRows.length}건`}
        </span>
        {selectedCode && (
          <button
            type="button"
            onClick={() => setSelectedCode(null)}
            className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-[10px] font-semibold cursor-pointer transition"
          >
            <X size={10} /> 필터 해제
          </button>
        )}
      </div>

      {/* SKU 집계 테이블 */}
      {viewMode === "sku" && (
        <div className="flex-1 min-h-0 overflow-auto bg-white rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full text-xs min-w-[500px]">
            <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
              <tr className="text-[10px] text-slate-400 uppercase tracking-wider">
                <th className="text-left px-3 py-2 w-6 text-slate-300">#</th>
                <th className="text-left px-3 py-2">상품명</th>
                <th className="text-right px-3 py-2 w-14">매입건</th>
                <th className="text-right px-3 py-2 w-16">총수량</th>
                <th className="text-right px-3 py-2 w-20">총매입액</th>
                <th className="text-right px-3 py-2 w-16">최근단가</th>
                <th className="text-left px-3 py-2 w-20">최근매입</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {productStats.map((s, i) => {
                const isSel = s.product_code === selectedCode;
                return (
                  <tr
                    key={`ps-${s.product_code}`}
                    onClick={() => { setSelectedCode(isSel ? null : s.product_code); setViewMode("all"); }}
                    className={`cursor-pointer transition-all duration-100 ${
                      isSel ? "bg-emerald-50 border-l-2 border-emerald-500" : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="px-3 py-1.5 text-slate-300 text-[10px] tabular-nums align-top">{i + 1}</td>
                    <td className="px-3 py-1.5 align-top">
                      <div className={`text-[11px] font-semibold leading-tight break-words whitespace-normal ${isSel ? "text-emerald-800" : "text-slate-700"}`}>
                        {s.product_name}
                      </div>
                      <div className="text-[9px] text-slate-400">{s.product_code}</div>
                    </td>
                    <td className="px-3 py-1.5 text-right text-[11px] tabular-nums text-slate-600 align-top">{s.buy_count}</td>
                    <td className="px-3 py-1.5 text-right text-[11px] tabular-nums text-slate-600 align-top">{fmt(s.total_qty)}</td>
                    <td className="px-3 py-1.5 text-right text-[11px] tabular-nums font-semibold text-emerald-700 align-top">
                      {fmt(s.total_amount)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-[11px] tabular-nums text-slate-500 align-top">
                      {fmt(s.latest_unit_price)}
                    </td>
                    <td className="px-3 py-1.5 text-[10px] text-slate-400 align-top whitespace-nowrap">
                      {dateLabel(s.latest_date)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 전체 원장 테이블 */}
      {viewMode === "all" && (
        <div className="flex-1 min-h-0 overflow-auto bg-white rounded-xl border border-slate-200 shadow-sm">
          {selectedCode && (
            <div className="px-3 py-1.5 border-b border-emerald-100 bg-emerald-50/50 flex items-center gap-2">
              <Filter size={11} className="text-emerald-600" />
              <span className="text-[11px] font-semibold text-emerald-700">
                {productStats.find(s => s.product_code === selectedCode)?.product_name ?? selectedCode}
              </span>
              <span className="text-[10px] text-emerald-500 tabular-nums">{allRows.length}건</span>
            </div>
          )}
          <table className="w-full text-xs min-w-[480px]">
            <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
              <tr className="text-[10px] text-slate-400 uppercase tracking-wider">
                <th className="text-left px-3 py-2 w-6 text-slate-300">#</th>
                <th onClick={() => toggleSort("date")}
                  className="text-left px-3 py-2 w-24 cursor-pointer select-none hover:bg-slate-50 transition">
                  날짜{arrow("date")}
                </th>
                <th onClick={() => toggleSort("product_name")}
                  className="text-left px-3 py-2 cursor-pointer select-none hover:bg-slate-50 transition">
                  상품명{arrow("product_name")}
                </th>
                <th onClick={() => toggleSort("quantity")}
                  className="text-right px-3 py-2 w-16 cursor-pointer select-none hover:bg-slate-50 transition">
                  수량{arrow("quantity")}
                </th>
                <th className="text-right px-3 py-2 w-20">단가</th>
                <th onClick={() => toggleSort("amount")}
                  className="text-right px-3 py-2 w-24 cursor-pointer select-none hover:bg-slate-50 transition">
                  금액{arrow("amount")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {allRows.map((r, i) => (
                <tr key={`ph-${r.id}-${i}`} className="hover:bg-slate-50 transition-all duration-100">
                  <td className="px-3 py-1.5 text-slate-300 text-[10px] tabular-nums align-top">{i + 1}</td>
                  <td className="px-3 py-1.5 tabular-nums text-[11px] text-slate-500 align-top whitespace-nowrap">
                    {dateLabel(r.date)}
                  </td>
                  <td className="px-3 py-1.5 align-top">
                    <div className="text-[11px] font-semibold text-slate-700 leading-tight break-words whitespace-normal">
                      {r.product_name ?? "-"}
                    </div>
                    {r.product_code && (
                      <div className="text-[9px] text-slate-400">{r.product_code}</div>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right text-[11px] tabular-nums text-slate-600 align-top">
                    {fmt(r.quantity)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-[11px] tabular-nums text-slate-500 align-top">
                    {fmt(r.unit_price)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-[12px] tabular-nums font-semibold text-emerald-700 align-top">
                    {fmt(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─── VendorDetailTabs (main export) ───────────────────────────────────────

interface VendorDetailTabsProps {
  vendor: VendorBasic;
  /** 외부에서 기간 필터를 공유할 때 사용 · 미지정 시 내부에서 관리 */
  periodMonths?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  periodSeason?: SeasonKey | null;
  onPeriodChange?: (months: 0 | 1 | 2 | 3 | 4 | 5 | 6, season: SeasonKey | null) => void;
}

export const VendorDetailTabs: React.FC<VendorDetailTabsProps> = ({ vendor }) => {
  const [activeTab, setActiveTab] = useState<TabKey>("balance");

  // 기간 필터 (내부 관리)
  const [periodMonths, setPeriodMonths] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(1);
  const [periodSeason, setPeriodSeason] = useState<SeasonKey | null>(null);

  // 원장 데이터
  const [ledger, setLedger] = useState<LedgerSummary | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  // 매입상세 데이터
  const [detailRows, setDetailRows] = useState<PurchaseDetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const days = periodSeason ? 365 : (periodMonths === 0 ? 10 : (periodMonths || 1) * 30);

  const loadLedger = useCallback(async () => {
    if (!vendor) return;
    setLedgerLoading(true);
    setLedgerError(null);
    try {
      const params = new URLSearchParams({ supplier: vendor.company_name, days: String(days) });
      const res = await fetch(`/api/supplier-ledger?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      setLedger({
        supplier: j.supplier ?? vendor.company_name,
        rows: Array.isArray(j.rows) ? j.rows : [],
        total_purchase: Number(j.total_purchase ?? 0),
        total_payment: Number(j.total_payment ?? 0),
        current_balance: Number(j.current_balance ?? 0),
        // 2026-08-03 · #193 · VAT 통합 필드 (서버가 없으면 0)
        vat_included: j.vat_included === true ? true : j.vat_included === false ? false : null,
        total_purchase_vat: Number(j.total_purchase_vat ?? 0),
        total_purchase_supply: Number(j.total_purchase_supply ?? 0),
        total_payment_vat: Number(j.total_payment_vat ?? 0),
        total_payment_supply: Number(j.total_payment_supply ?? 0),
      });
    } catch (e: any) {
      setLedgerError(e?.message ?? "네트워크 오류");
      setLedger(null);
    } finally { setLedgerLoading(false); }
  }, [vendor, days]);

  const loadDetail = useCallback(async () => {
    if (!vendor) return;
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/supplier-purchase-detail?supplier=${encodeURIComponent(vendor.company_name)}&days=${days}`);
      if (res.ok) {
        const j = await res.json();
        setDetailRows(Array.isArray(j.rows) ? j.rows : []);
      } else setDetailRows([]);
    } catch {
      setDetailRows([]);
    } finally { setDetailLoading(false); }
  }, [vendor, days]);

  // 공급사/기간 변경 시 재조회
  useEffect(() => {
    loadLedger();
    loadDetail();
  }, [loadLedger, loadDetail]);

  // KPI 계산 (ledger 기반)
  const kpi = useMemo<VendorKpi>(() => {
    const totalPurchase = ledger?.total_purchase ?? 0;
    const totalPayment = ledger?.total_payment ?? 0;
    const balance = ledger?.current_balance ?? 0;
    const avgCycleDays = calcAvgCycle(detailRows);

    // MoM: 이번달 vs 지난달 (detailRows 기반)
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const lmStart = `${lastMonthStart.getFullYear()}-${String(lastMonthStart.getMonth() + 1).padStart(2, "0")}-01`;
    const lmEnd = `${lastMonthEnd.getFullYear()}-${String(lastMonthEnd.getMonth() + 1).padStart(2, "0")}-${String(lastMonthEnd.getDate()).padStart(2, "0")}`;
    let thisMonth = 0; let lastMonth = 0;
    for (const r of detailRows) {
      if (r.date >= monthStart) thisMonth += r.amount;
      if (r.date >= lmStart && r.date <= lmEnd) lastMonth += r.amount;
    }
    const momPct = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;

    return {
      totalPurchase,
      totalPayment,
      balance,
      avgCycleDays,
      momPct,
      rowCount: ledger?.rows.length,
    };
  }, [ledger, detailRows]);

  const isLoading = ledgerLoading || detailLoading;

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      {/* 헤더 카드 */}
      <VendorInfoHeader vendor={vendor} kpi={kpi} loading={isLoading} />

      {/* 기간 필터 + 새로고침 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">기간</span>
        <div className="inline-flex bg-slate-50 border border-slate-200 rounded-lg p-0.5 gap-0.5">
          <button onClick={() => { setPeriodSeason(null); setPeriodMonths(0); }}
            className={`px-2.5 h-6 text-[11px] font-semibold rounded-md transition cursor-pointer ${!periodSeason && periodMonths === 0 ? "bg-sky-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            10일
          </button>
          {([1, 2, 3, 4, 5, 6] as const).map(m => (
            <button key={m} onClick={() => { setPeriodSeason(null); setPeriodMonths(m); }}
              className={`px-2.5 h-6 text-[11px] font-semibold rounded-md transition cursor-pointer ${!periodSeason && periodMonths === m ? "bg-sky-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {m}개월
            </button>
          ))}
        </div>
        <SeasonButtons
          value={periodSeason}
          onChange={v => { setPeriodSeason(v); if (v) setPeriodMonths(0); }}
          size="sm"
          hideLabel
        />
        <button
          type="button"
          onClick={() => { loadLedger(); loadDetail(); }}
          disabled={isLoading}
          className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-sky-50 hover:border-sky-300 text-slate-400 hover:text-sky-500 transition disabled:opacity-40 cursor-pointer"
          title="새로고침"
        >
          <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* 탭 바 */}
      <div className="flex bg-white rounded-xl border border-slate-200 shadow-sm p-1 gap-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] font-black transition cursor-pointer ${
              activeTab === tab.key
                ? "bg-sky-500 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      <div className="flex-1 min-h-0 flex flex-col">
        {activeTab === "balance" && (
          <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* 탭 내 KPI 3개 · 매입금액 · 결제금액 · 남은잔고 (미결제) */}
            {/* 2026-08-03 · #193 · VAT 소계 subtitle 추가 (vat_included 설정 시 · 부가세 신고 준비용) */}
            {ledger && !ledgerLoading && (() => {
              const vatMode = ledger.vat_included;
              const vatModeText =
                vatMode === true  ? "VAT 포함" :
                vatMode === false ? "VAT 별도" :
                                    "VAT 미설정";
              const vatModeCls =
                vatMode === true  ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                vatMode === false ? "bg-amber-50 text-amber-700 border-amber-200" :
                                    "bg-slate-50 text-slate-400 border-slate-200";
              const items = [
                {
                  label: "매입 금액",
                  value: ledger.total_purchase,
                  tone: "emerald" as const,
                  subtitle: "구입 총액",
                  vatBadge: vatMode != null ? `VAT ${ledger.total_purchase_vat.toLocaleString()}원 · 공급가액 ${ledger.total_purchase_supply.toLocaleString()}원` : null,
                },
                {
                  label: "결제 금액",
                  value: ledger.total_payment,
                  tone: "sky" as const,
                  subtitle: "지불 총액",
                  vatBadge: vatMode === true && ledger.total_payment_vat > 0 ? `VAT ${ledger.total_payment_vat.toLocaleString()}원 · 공급가액 ${ledger.total_payment_supply.toLocaleString()}원` : null,
                },
                {
                  label: "남은 잔고 (미결제)",
                  value: ledger.current_balance,
                  tone: ledger.current_balance > 0 ? "amber" as const : "emerald" as const,
                  subtitle: ledger.current_balance > 0 ? "지불 필요" : "완납",
                  vatBadge: null,
                },
              ];
              return (
                <div className="flex flex-col">
                  {/* VAT 모드 배지 (전체 우상단) */}
                  <div className="flex items-center justify-between px-4 pt-2.5 pb-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">기간 합계</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border ${vatModeCls}`}
                      title={
                        vatMode === true  ? "거래명세서 총액에 VAT 포함 · amount÷11 로 세액 산정" :
                        vatMode === false ? "거래명세서 총액은 공급가액 · amount×0.1 별도 세액" :
                                            "공급사 관리에서 VAT 처리 방식을 설정하면 세액이 계산됩니다"
                      }
                    >
                      {vatModeText}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-0 border-b border-slate-100 bg-slate-50/40">
                    {items.map((item, i) => (
                      <div key={i} className={`px-4 py-3 ${i < 2 ? "border-r border-slate-100" : ""} flex flex-col gap-0.5`}>
                        <span className="text-[11px] font-bold text-slate-500">{item.label}</span>
                        <span className={`text-[15px] font-black tabular-nums leading-tight ${
                          item.tone === "emerald" ? "text-emerald-700" :
                          item.tone === "sky" ? "text-sky-700" :
                          "text-amber-700"
                        }`}>
                          {item.value.toLocaleString()}원
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">{item.subtitle}</span>
                        {item.vatBadge && (
                          <span className="text-[10px] text-slate-500 font-semibold tabular-nums mt-0.5 leading-tight">
                            {item.vatBadge}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            <LedgerContent ledger={ledger} loading={ledgerLoading} error={ledgerError} />
          </div>
        )}
        {activeTab === "history" && (
          <HistoryContent detailRows={detailRows} loading={detailLoading} />
        )}
      </div>
    </div>
  );
};

export default VendorDetailTabs;
