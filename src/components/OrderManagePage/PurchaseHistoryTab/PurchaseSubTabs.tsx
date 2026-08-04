// src/components/OrderManagePage/PurchaseHistoryTab/PurchaseSubTabs.tsx
// 우측 하단 · 서브탭 3개 (2026-08-03)
// Tab 1 · 매입원장 (default · 기존 원장 유지)
// Tab 2 · 상품별 집계 (product_name groupBy)
// Tab 3 · 매입 추이 (월별 bar + 카테고리 pie · 커스텀 SVG)
// Progressive Disclosure · 결제·명세서 탭 · VendorDetailModal 과 중복이라 만들지 않음

import React, { useMemo, useState } from "react";
import { ArrowUpDown, BarChart3, ListOrdered, Package2 } from "lucide-react";
import { PurchaseHistoryList, type PurchaseHistoryRow } from "../../common/PurchaseHistoryList";

// ─── Types ────────────────────────────────────────────────────────────────

export type TabKey = "ledger" | "product" | "trend";

export interface PurchaseLedgerRow {
  id: string | number;
  invoice_date: string | null;
  product_name: string | null;
  product_code: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
}

export interface PurchaseDetailRow {
  id: string | number;
  date: string; // YYYY-MM-DD
  product_code: string | null;
  product_name: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface PurchaseSubTabsProps {
  ledgerRows: PurchaseLedgerRow[];
  ledgerLoading: boolean;
  detailRows: PurchaseDetailRow[]; // 최근 365일 · Tab 2/3 용
  detailLoading: boolean;
  /** 초기 활성 탭 · uncontrolled 초기값 · 기본 "ledger" */
  initialTab?: TabKey;
  /** 외부 controlled 탭 · 지정 시 activeTab prop 을 소스로 사용 */
  activeTab?: TabKey;
  /** 사용자가 탭을 클릭했을 때 · controlled 모드에서 필수 */
  onTabChange?: (tab: TabKey) => void;
  /** 매입원장 탭에서 강조할 row id · null 이면 강조 없음 · 2~3초 후 자동 해제는 caller 책임 */
  highlightId?: string | number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

function fmtWon(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString();
}

function dateLabel(iso: string | null): string {
  if (!iso) return "-";
  return String(iso).slice(0, 10);
}

// ─── Tab 1 · 매입 원장 ─────────────────────────────────────────────────────
// 2026-08-04 · 사용자 요청 · 공통 PurchaseHistoryList 컴포넌트로 대체
//   · 이전 자체 표 → common/PurchaseHistoryList (통일된 UI · 자동 정렬 · highlight)

type SortDir = "asc" | "desc";

const LedgerTab: React.FC<{
  rows: PurchaseLedgerRow[];
  loading: boolean;
  highlightId?: string | number | null;
}> = ({ rows, loading, highlightId = null }) => {
  // PurchaseLedgerRow → PurchaseHistoryRow 변환 (invoice_date → date · 상품명/코드 유지)
  const listRows = useMemo<PurchaseHistoryRow[]>(() => rows.map(r => ({
    id: r.id,
    date: r.invoice_date,
    product_name: r.product_name,
    product_code: r.product_code,
    quantity: r.quantity,
    unit_price: r.unit_price,
    amount: r.amount,
  })), [rows]);

  return (
    <PurchaseHistoryList
      rows={listRows}
      loading={loading}
      highlightId={highlightId}
      showSupplier={false}
      showProduct
      showRowNumber
      showFooterSum
      emptyText="해당 기간 매입 이력 없음"
    />
  );
};

// ─── Tab 2 · 상품별 집계 ────────────────────────────────────────────────────

interface ProductAgg {
  key: string; // product_name || product_code
  product_name: string;
  product_code: string | null;
  total_qty: number;
  total_amount: number;
  avg_unit_price: number;
  last_date: string;
  purchase_count: number;
}

type ProductSortKey = "product_name" | "total_qty" | "avg_unit_price" | "last_date" | "purchase_count" | "total_amount";

const ProductAggTab: React.FC<{ rows: PurchaseDetailRow[]; loading: boolean }> = ({ rows, loading }) => {
  const [sortKey, setSortKey] = useState<ProductSortKey>("total_amount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const toggleSort = (k: ProductSortKey) => {
    if (sortKey === k) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };
  const arrow = (k: ProductSortKey) => sortKey !== k ? " ⇅" : sortDir === "asc" ? " ▲" : " ▼";

  const aggregated = useMemo<ProductAgg[]>(() => {
    const map = new Map<string, ProductAgg>();
    for (const r of rows) {
      const nm = String(r.product_name ?? "").trim() || "(이름없음)";
      const key = nm;
      let a = map.get(key);
      if (!a) {
        a = {
          key,
          product_name: nm,
          product_code: r.product_code,
          total_qty: 0,
          total_amount: 0,
          avg_unit_price: 0,
          last_date: r.date,
          purchase_count: 0,
        };
        map.set(key, a);
      }
      a.total_qty += r.quantity;
      a.total_amount += r.amount;
      a.purchase_count += 1;
      if (r.date > a.last_date) a.last_date = r.date;
      if (!a.product_code && r.product_code) a.product_code = r.product_code;
    }
    // 평균 단가 · 매입금액 / 매입수량 (가중평균)
    for (const a of map.values()) {
      a.avg_unit_price = a.total_qty > 0 ? a.total_amount / a.total_qty : 0;
    }
    return Array.from(map.values());
  }, [rows]);

  const sorted = useMemo(() => {
    const sign = sortDir === "asc" ? 1 : -1;
    return [...aggregated].sort((a, b) => {
      switch (sortKey) {
        case "product_name":   return sign * a.product_name.localeCompare(b.product_name, "ko");
        case "total_qty":      return sign * (a.total_qty - b.total_qty);
        case "avg_unit_price": return sign * (a.avg_unit_price - b.avg_unit_price);
        case "last_date":      return sign * a.last_date.localeCompare(b.last_date);
        case "purchase_count": return sign * (a.purchase_count - b.purchase_count);
        case "total_amount":   return sign * (a.total_amount - b.total_amount);
        default:               return 0;
      }
    });
  }, [aggregated, sortKey, sortDir]);

  const totalAmount = useMemo(() => aggregated.reduce((s, a) => s + a.total_amount, 0), [aggregated]);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center py-12 text-slate-400 text-[11px]">불러오는 중...</div>;
  }
  if (aggregated.length === 0) {
    return <div className="flex-1 flex items-center justify-center py-12 text-slate-400 text-[11px]">최근 1년 매입 상품 없음</div>;
  }
  return (
    <div className="overflow-auto flex-1 min-h-0">
      <table className="w-full text-xs min-w-[600px]">
        <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
          <tr className="text-[11px] text-slate-400 uppercase tracking-wider">
            <th className="text-left px-2 py-2 w-7 text-slate-300">#</th>
            <th onClick={() => toggleSort("product_name")}
              className="text-left px-2 py-2 cursor-pointer select-none hover:bg-slate-50 transition">
              상품{arrow("product_name")}
            </th>
            <th onClick={() => toggleSort("total_qty")}
              className="text-right px-2 py-2 w-20 cursor-pointer select-none hover:bg-slate-50 transition">
              총매입수량{arrow("total_qty")}
            </th>
            <th onClick={() => toggleSort("avg_unit_price")}
              className="text-right px-2 py-2 w-20 cursor-pointer select-none hover:bg-slate-50 transition">
              평균단가{arrow("avg_unit_price")}
            </th>
            <th onClick={() => toggleSort("last_date")}
              className="text-left px-2 py-2 w-24 cursor-pointer select-none hover:bg-slate-50 transition">
              최근매입일{arrow("last_date")}
            </th>
            <th onClick={() => toggleSort("purchase_count")}
              className="text-right px-2 py-2 w-16 cursor-pointer select-none hover:bg-slate-50 transition">
              매입횟수{arrow("purchase_count")}
            </th>
            <th onClick={() => toggleSort("total_amount")}
              className="text-right px-2 py-2 w-24 text-emerald-600 cursor-pointer select-none hover:bg-emerald-50 transition">
              총매입액{arrow("total_amount")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {sorted.map((a, i) => (
            <tr key={`pa-${a.key}-${i}`} className="hover:bg-slate-50/60 transition-all duration-100">
              <td className="px-2 py-1.5 text-slate-300 text-[11px] tabular-nums align-top">{i + 1}</td>
              <td className="px-2 py-1.5 align-top">
                <div className="text-[12px] font-semibold text-slate-700 break-words whitespace-normal leading-snug">
                  {a.product_name}
                </div>
                {a.product_code && (
                  <div className="text-[10px] text-slate-400 font-mono tabular-nums">{a.product_code}</div>
                )}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-[12px] text-slate-600 align-top">
                {fmt(a.total_qty)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-[12px] text-slate-600 align-top">
                {a.avg_unit_price > 0 ? fmt(Math.round(a.avg_unit_price)) : "-"}
              </td>
              <td className="px-2 py-1.5 tabular-nums text-[11px] text-slate-500 align-top whitespace-nowrap">
                {dateLabel(a.last_date)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-[12px] text-slate-600 align-top">
                {fmt(a.purchase_count)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-[12px] font-semibold text-emerald-700 align-top">
                {fmt(a.total_amount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="sticky bottom-0 bg-white border-t-2 border-slate-200">
          <tr>
            <td colSpan={6} className="px-2 py-2 text-right text-[11px] font-black text-slate-500">합계</td>
            <td className="px-2 py-2 text-right tabular-nums text-[13px] font-black text-emerald-700">{fmtWon(totalAmount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

// ─── Tab 3 · 매입 추이 · 월별 bar + top 상품 pie ───────────────────────────

// 커스텀 SVG bar chart · 최근 12개월
const MonthlyBarChart: React.FC<{ rows: PurchaseDetailRow[] }> = ({ rows }) => {
  const monthly = useMemo(() => {
    // 최근 12개월 label 생성
    const now = new Date();
    const labels: { key: string; label: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      labels.push({ key, label: `${d.getMonth() + 1}월` });
    }
    const sum = new Map<string, number>();
    for (const r of rows) {
      const key = r.date.slice(0, 7);
      sum.set(key, (sum.get(key) ?? 0) + r.amount);
    }
    return labels.map(l => ({ ...l, value: sum.get(l.key) ?? 0 }));
  }, [rows]);
  const max = Math.max(...monthly.map(m => m.value), 1);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3">
      <div className="text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">월별 매입액 (12개월)</div>
      <div className="flex items-end gap-1.5 h-32">
        {monthly.map(m => {
          const h = max > 0 ? (m.value / max) * 100 : 0;
          return (
            <div key={m.key} className="flex-1 flex flex-col items-center gap-1 min-w-0 group">
              <div className="flex-1 w-full flex items-end justify-center relative min-h-0">
                <div
                  className={`w-full rounded-t transition-all ${
                    m.value > 0 ? "bg-emerald-400 group-hover:bg-emerald-500" : "bg-slate-100"
                  }`}
                  style={{ height: `${Math.max(h, m.value > 0 ? 4 : 0)}%` }}
                  title={`${m.label} · ${fmtWon(m.value)}`}
                />
                {m.value > 0 && (
                  <div className="absolute -top-4 text-[9px] font-semibold text-slate-500 tabular-nums opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
                    {fmtWon(m.value)}
                  </div>
                )}
              </div>
              <div className="text-[10px] text-slate-400 tabular-nums">{m.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Top 5 상품 도넛 (SVG · pie 대신 도넛 · Odoo/Zoho 표준)
const TopProductsDonut: React.FC<{ rows: PurchaseDetailRow[] }> = ({ rows }) => {
  const top = useMemo(() => {
    const map = new Map<string, number>();
    let total = 0;
    for (const r of rows) {
      const nm = String(r.product_name ?? "").trim() || "(이름없음)";
      map.set(nm, (map.get(nm) ?? 0) + r.amount);
      total += r.amount;
    }
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const top5 = sorted.slice(0, 5);
    const othersSum = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
    const items = othersSum > 0
      ? [...top5, ["기타", othersSum] as [string, number]]
      : top5;
    return { items, total };
  }, [rows]);

  const colors = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#64748b"];

  // 도넛 · cumulative angle → path
  const segments = useMemo(() => {
    let acc = 0;
    return top.items.map(([name, value], i) => {
      const pct = top.total > 0 ? value / top.total : 0;
      const startAngle = acc * 2 * Math.PI;
      const endAngle = (acc + pct) * 2 * Math.PI;
      acc += pct;
      const cx = 60, cy = 60, rOuter = 55, rInner = 32;
      const x1 = cx + rOuter * Math.sin(startAngle);
      const y1 = cy - rOuter * Math.cos(startAngle);
      const x2 = cx + rOuter * Math.sin(endAngle);
      const y2 = cy - rOuter * Math.cos(endAngle);
      const x3 = cx + rInner * Math.sin(endAngle);
      const y3 = cy - rInner * Math.cos(endAngle);
      const x4 = cx + rInner * Math.sin(startAngle);
      const y4 = cy - rInner * Math.cos(startAngle);
      const largeArc = pct > 0.5 ? 1 : 0;
      const path = pct >= 0.999
        ? `M ${cx - rOuter} ${cy} A ${rOuter} ${rOuter} 0 1 1 ${cx + rOuter} ${cy} A ${rOuter} ${rOuter} 0 1 1 ${cx - rOuter} ${cy} M ${cx - rInner} ${cy} A ${rInner} ${rInner} 0 1 0 ${cx + rInner} ${cy} A ${rInner} ${rInner} 0 1 0 ${cx - rInner} ${cy} Z`
        : `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4} Z`;
      return { name, value, pct, path, color: colors[i % colors.length] };
    });
  }, [top]);

  if (top.total === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-3 flex items-center justify-center h-40 text-[11px] text-slate-400">
        데이터 없음
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3">
      <div className="text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">TOP 5 상품 (매입액 기준)</div>
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 120 120" className="w-28 h-28 shrink-0">
          {segments.map((s, i) => (
            <path key={i} d={s.path} fill={s.color}>
              <title>{s.name} · {fmtWon(s.value)} ({(s.pct * 100).toFixed(1)}%)</title>
            </path>
          ))}
        </svg>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {segments.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 min-w-0 text-[11px]">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
              <span className="truncate flex-1 text-slate-700 font-semibold">{s.name}</span>
              <span className="tabular-nums text-slate-500 shrink-0">{(s.pct * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const TrendTab: React.FC<{ rows: PurchaseDetailRow[]; loading: boolean }> = ({ rows, loading }) => {
  if (loading) {
    return <div className="flex-1 flex items-center justify-center py-12 text-slate-400 text-[11px]">불러오는 중...</div>;
  }
  if (rows.length === 0) {
    return <div className="flex-1 flex items-center justify-center py-12 text-slate-400 text-[11px]">최근 1년 매입 데이터 없음</div>;
  }
  return (
    <div className="flex-1 min-h-0 overflow-auto p-3 flex flex-col gap-3">
      <MonthlyBarChart rows={rows} />
      <TopProductsDonut rows={rows} />
    </div>
  );
};

// ─── PurchaseSubTabs · Container ──────────────────────────────────────────

const TABS: { key: TabKey; label: string; icon: React.ElementType; hint: string; color: string }[] = [
  { key: "ledger",  label: "매입이력", icon: ListOrdered, hint: "선택 기간 · 매입 원장", color: "emerald" },
  { key: "product", label: "상품별 집계", icon: Package2,    hint: "최근 1년 · groupBy 상품명",    color: "sky"     },
  { key: "trend",   label: "매입 추이",   icon: BarChart3,   hint: "12개월 bar · TOP 상품 도넛",   color: "violet"  },
];

const PURCHASE_SUBTAB_COLORS: Record<string, { text: string; bar: string; hoverText: string }> = {
  emerald: { text: "text-emerald-700", bar: "bg-emerald-500", hoverText: "hover:text-emerald-700" },
  sky:     { text: "text-sky-700",     bar: "bg-sky-500",     hoverText: "hover:text-sky-700"     },
  violet:  { text: "text-violet-700",  bar: "bg-violet-500",  hoverText: "hover:text-violet-700"  },
};

export const PurchaseSubTabs: React.FC<PurchaseSubTabsProps> = ({
  ledgerRows,
  ledgerLoading,
  detailRows,
  detailLoading,
  initialTab = "ledger",
  activeTab,
  onTabChange,
  highlightId = null,
}) => {
  // controlled · uncontrolled 모드 모두 지원 (activeTab 제공 시 controlled)
  const [internalTab, setInternalTab] = useState<TabKey>(initialTab);
  const tab = activeTab ?? internalTab;
  const setTab = (next: TabKey) => {
    if (activeTab === undefined) setInternalTab(next);
    onTabChange?.(next);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-0 flex-1">
      {/* 탭 헤더 */}
      <div className="flex items-center border-b border-slate-200 bg-slate-50/50 px-2 pt-1 gap-0">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          const c = PURCHASE_SUBTAB_COLORS[t.color];
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              title={t.hint}
              className={[
                "relative flex items-center gap-2 sm:gap-2.5",
                "px-4 sm:px-6 py-3.5 sm:py-4",
                "text-[16px] sm:text-[18px] font-black leading-none whitespace-nowrap",
                "transition-colors duration-150 cursor-pointer outline-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-300",
                "active:opacity-70",
                active ? c.text : `text-slate-500 ${c.hoverText}`,
              ].join(" ")}
            >
              <Icon size={19} className={`shrink-0 sm:size-[20px] transition-colors duration-150 ${active ? c.text : "text-slate-400"}`} />
              <span>{t.label}</span>
              {active && <span className={`absolute left-0 right-0 -bottom-px h-[2.5px] ${c.bar} rounded-t-sm`} />}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1 text-[10px] text-slate-400 pr-2">
          <ArrowUpDown size={10} />
          <span>헤더 클릭 정렬</span>
        </div>
      </div>

      {/* 탭 컨텐츠 */}
      <div className="flex flex-col min-h-0 flex-1">
        {tab === "ledger"  && <LedgerTab     rows={ledgerRows}  loading={ledgerLoading} highlightId={highlightId} />}
        {tab === "product" && <ProductAggTab rows={detailRows}  loading={detailLoading} />}
        {tab === "trend"   && <TrendTab      rows={detailRows}  loading={detailLoading} />}
      </div>
    </div>
  );
};

export default PurchaseSubTabs;
