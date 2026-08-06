// src/components/OrderManagePage/PurchaseHistoryTab/PurchaseSubTabs.tsx
// 우측 하단 · 서브탭 3개 (2026-08-03)
// Tab 1 · 매입원장 (default · 기존 원장 유지)
// Tab 2 · 상품별 집계 (product_name groupBy)
// Tab 3 · 매입 추이 (recharts 3종 파이차트 · 2026-08-05)
// 2026-08-05 · 기간 필터 · 3탭 공통 상단 배치 (매입이력 전용 → 공통 이관)

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown, BarChart3, ChevronDown, ChevronRight,
  ListOrdered, Loader2, Package2,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import { SeasonButtons } from "../../common/SeasonButtons";
import { type SeasonKey } from "../../../hooks/useSeasonRanges";
import { useSortableTable, type Comparator } from "../../../hooks/useSortableTable";
// T-CSS Phase 2 · 2026-08-06
import { CARD_BASE } from "../../../styles/tokens";

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
  // ── 2026-08-05 · 3탭 공통 기간 필터 ─────────────────────────────────────
  /** 현재 기간 (개월수 · 0=10일) */
  periodMonths?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** 현재 계절 기간 */
  periodSeason?: SeasonKey | null;
  /** 기간 변경 콜백 */
  onPeriodChange?: (months: 0 | 1 | 2 | 3 | 4 | 5 | 6, season: SeasonKey | null) => void;
  // ── 하위호환 · 기존 prop 별칭 (2026-08-05) ──────────────────────────────
  ledgerPeriodMonths?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  ledgerPeriodSeason?: SeasonKey | null;
  onLedgerPeriodChange?: (months: 0 | 1 | 2 | 3 | 4 | 5 | 6, season: SeasonKey | null) => void;
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

// ─── Tab 1 · 매입 원장 · 매입일 그룹 + 화살표 확장 ──────────────────────────

interface DateGroup {
  date: string; // YYYY-MM-DD
  items: PurchaseLedgerRow[];
  totalAmount: number;
  itemCount: number;
  repName: string;
}

const LedgerTab: React.FC<{
  rows: PurchaseLedgerRow[];
  loading: boolean;
  highlightId?: string | number | null;
}> = ({ rows, loading, highlightId = null }) => {
  const groups = useMemo<DateGroup[]>(() => {
    const map = new Map<string, DateGroup>();
    for (const r of rows) {
      const d = String(r.invoice_date ?? "").slice(0, 10) || "-";
      let g = map.get(d);
      if (!g) {
        g = { date: d, items: [], totalAmount: 0, itemCount: 0, repName: "" };
        map.set(d, g);
      }
      g.items.push(r);
      g.totalAmount += Number(r.amount ?? 0) || 0;
      g.itemCount += 1;
    }
    for (const g of map.values()) {
      let best: PurchaseLedgerRow | null = null;
      for (const it of g.items) {
        if (!best) { best = it; continue; }
        if ((Number(it.amount ?? 0) || 0) > (Number(best.amount ?? 0) || 0)) best = it;
      }
      g.repName = String(best?.product_name ?? "").trim() || "(이름없음)";
    }
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [rows]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // 2026-08-06 · T-TEST-매입이력-그룹기본접힘 (사용자 요청)
  //   · 기본 접힌 상태 유지 · 사용자 클릭 시에만 펼침
  //   · groups 변경 시에도 · 자동 펼침 X (기존 auto-expand first 제거)
  const groupsSigRef = useRef<string>("");
  useEffect(() => {
    const sig = groups.map(g => g.date).join("|");
    if (sig === groupsSigRef.current) return;
    groupsSigRef.current = sig;
    // 자동 펼침 로직 제거 · 기본 접힘 유지
  }, [groups]);

  const toggle = (date: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(date)) n.delete(date); else n.add(date);
      return n;
    });
  };

  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (highlightId == null) return;
    let targetDate: string | null = null;
    for (const g of groups) {
      if (g.items.some(it => String(it.id) === String(highlightId))) {
        targetDate = g.date; break;
      }
    }
    if (!targetDate) return;
    setExpanded(prev => {
      if (prev.has(targetDate as string)) return prev;
      const n = new Set(prev); n.add(targetDate as string); return n;
    });
    const t = window.setTimeout(() => {
      try { highlightRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }
      catch { highlightRowRef.current?.scrollIntoView(); }
    }, 60);
    return () => window.clearTimeout(t);
  }, [highlightId, groups]);

  const totalAmount = useMemo(() => groups.reduce((s, g) => s + g.totalAmount, 0), [groups]);
  const totalItems = useMemo(() => groups.reduce((s, g) => s + g.itemCount, 0), [groups]);
  const [sumCollapsed, setSumCollapsed] = useState(false);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-12 text-slate-400 text-[12px] gap-2">
        <Loader2 size={14} className="animate-spin" />
        <span>매입 이력 로딩 중...</span>
      </div>
    );
  }
  if (groups.length === 0) {
    return <div className="flex-1 flex items-center justify-center py-12 text-slate-400 text-[12px]">해당 기간 매입 이력 없음</div>;
  }

  return (
    <div className="overflow-auto flex-1 min-h-0 bg-white">
      <table className="w-full text-[12px] min-w-[420px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
        <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
          <tr className="text-[11px] text-slate-500 uppercase tracking-wider">
            <th className="text-center w-8 py-2"></th>
            <th className="text-left px-3 py-2 w-28">매입일</th>
            <th className="text-left px-3 py-2">상품 (대표 · 외 N건)</th>
            <th className="text-right px-3 py-2 w-16">건수</th>
            <th className="text-right px-3 py-2 w-28 text-emerald-600">매입금액</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {groups.map((g) => {
            const isOpen = expanded.has(g.date);
            const containsHighlight = highlightId != null && g.items.some(it => String(it.id) === String(highlightId));
            return (
              <React.Fragment key={`grp-${g.date}`}>
                <tr
                  onClick={() => toggle(g.date)}
                  className={`cursor-pointer transition-colors ${
                    containsHighlight ? "bg-amber-50 hover:bg-amber-100/70" : isOpen ? "bg-emerald-50/40 hover:bg-emerald-50/60" : "hover:bg-slate-50/60"
                  }`}
                  title={isOpen ? "접기" : "펼치기"}
                >
                  <td className="text-center align-middle py-2">
                    {isOpen
                      ? <ChevronDown size={13} className="text-emerald-500 mx-auto" />
                      : <ChevronRight size={13} className="text-slate-400 mx-auto" />}
                  </td>
                  <td className="px-3 py-2 font-mono text-[12px] font-semibold text-slate-700 whitespace-nowrap">
                    {/* 2026-08-06 · T-TEST-매입이력-날짜포맷 (사용자 요청) · 2026 줄바꿈 7/20 */}
                    {(() => {
                      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(g.date);
                      if (m) return (
                        <span className="inline-flex flex-col leading-tight items-start">
                          <span className="text-[10px] text-slate-400">{m[1]}</span>
                          <span>{String(parseInt(m[2], 10))}/{String(parseInt(m[3], 10))}</span>
                        </span>
                      );
                      return g.date;
                    })()}
                    {containsHighlight && <span className="ml-1 text-[10px] text-amber-600 font-black">◀</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-700 break-words whitespace-normal leading-snug">
                    <span className="font-semibold">{g.repName}</span>
                    {g.itemCount > 1 && (
                      <span className="ml-1 text-[11px] text-slate-500 font-semibold">외 {g.itemCount - 1}건</span>
                    )}
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums font-mono text-[11px] text-slate-600 whitespace-nowrap">
                    {fmt(g.itemCount)}
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums font-mono font-black text-emerald-700 whitespace-nowrap">
                    {g.totalAmount > 0 ? fmt(g.totalAmount) : "-"}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-slate-50/40">
                    <td></td>
                    <td colSpan={4} className="px-3 py-2">
                      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
                        <table className="w-full text-[11px]">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr className="text-[10px] text-slate-500 uppercase tracking-wider">
                              <th className="text-left px-2 py-1.5 w-7 text-slate-300">#</th>
                              <th className="text-left px-2 py-1.5">상품명</th>
                              <th className="text-right px-2 py-1.5 w-16">수량</th>
                              <th className="text-right px-2 py-1.5 w-20">단가</th>
                              <th className="text-right px-2 py-1.5 w-24 text-emerald-600">금액</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {g.items.map((it, i) => {
                              const isHl = highlightId != null && String(it.id) === String(highlightId);
                              return (
                                <tr
                                  key={`gi-${g.date}-${it.id}-${i}`}
                                  ref={isHl ? highlightRowRef : undefined}
                                  className={`transition-colors ${isHl ? "bg-amber-50" : "hover:bg-emerald-50/40"}`}
                                >
                                  <td className="px-2 py-1 text-slate-300 tabular-nums align-top">{i + 1}</td>
                                  <td className="px-2 py-1 align-top">
                                    <div className="text-[12px] font-semibold text-slate-700 break-words whitespace-normal leading-snug">
                                      {it.product_name ?? "-"}
                                    </div>
                                    {it.product_code && (
                                      <div className="text-[10px] font-mono text-slate-400 tabular-nums">{it.product_code}</div>
                                    )}
                                  </td>
                                  <td className="text-right px-2 py-1 font-mono font-bold text-slate-800 tabular-nums align-top">
                                    {Number(it.quantity ?? 0) !== 0 ? fmt(Number(it.quantity ?? 0)) : "-"}
                                  </td>
                                  <td className="text-right px-2 py-1 font-mono text-slate-500 tabular-nums align-top">
                                    {Number(it.unit_price ?? 0) > 0 ? fmt(Number(it.unit_price ?? 0)) : "-"}
                                  </td>
                                  <td className="text-right px-2 py-1 font-mono font-black text-emerald-700 tabular-nums align-top">
                                    {Number(it.amount ?? 0) > 0 ? fmt(Number(it.amount ?? 0)) : "-"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
        <tfoot className="sticky bottom-0 bg-white border-t-2 border-slate-200">
          <tr>
            <td className="text-center">
              <button
                type="button"
                onClick={() => setSumCollapsed(v => !v)}
                title={sumCollapsed ? "합계 펼치기" : "합계 접기"}
                className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-slate-100 text-slate-500 hover:text-emerald-600 transition cursor-pointer"
              >
                {sumCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              </button>
            </td>
            <td colSpan={2} className="px-3 py-2 text-right text-[11px] font-black text-slate-500">
              합계 <span className="text-slate-400 font-bold">({groups.length}일)</span>
            </td>
            <td className={`px-3 py-2 text-right tabular-nums font-mono text-[12px] font-black text-slate-700 ${sumCollapsed ? "opacity-30" : ""}`}>
              {sumCollapsed ? "···" : fmt(totalItems)}
            </td>
            <td className={`px-3 py-2 text-right tabular-nums font-mono text-[13px] font-black text-emerald-700 ${sumCollapsed ? "opacity-30" : ""}`}>
              {sumCollapsed ? "···" : fmtWon(totalAmount)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

// ─── Tab 2 · 상품별 집계 ────────────────────────────────────────────────────

interface ProductAgg {
  key: string;
  product_name: string;
  product_code: string | null;
  total_qty: number;
  total_amount: number;
  avg_unit_price: number;
  last_date: string;
  purchase_count: number;
}

type ProductSortKey = "product_name" | "total_qty" | "avg_unit_price" | "last_date" | "purchase_count" | "total_amount";

const PRODUCT_AGG_CMP: Record<ProductSortKey, Comparator<ProductAgg>> = {
  product_name:   (a, b) => a.product_name.localeCompare(b.product_name, "ko"),
  total_qty:      (a, b) => a.total_qty - b.total_qty,
  avg_unit_price: (a, b) => a.avg_unit_price - b.avg_unit_price,
  last_date:      (a, b) => a.last_date.localeCompare(b.last_date),
  purchase_count: (a, b) => a.purchase_count - b.purchase_count,
  total_amount:   (a, b) => a.total_amount - b.total_amount,
};

const ProductAggTab: React.FC<{ rows: PurchaseDetailRow[]; loading: boolean }> = ({ rows, loading }) => {
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
    for (const a of map.values()) {
      a.avg_unit_price = a.total_qty > 0 ? a.total_amount / a.total_qty : 0;
    }
    return Array.from(map.values());
  }, [rows]);

  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable<ProductAgg, ProductSortKey>(aggregated, "total_amount", PRODUCT_AGG_CMP, "desc");
  const arrow = (k: ProductSortKey) => sortKey !== k ? " ⇅" : sortDir === "asc" ? " ▲" : " ▼";

  const totalAmount = useMemo(() => aggregated.reduce((s, a) => s + a.total_amount, 0), [aggregated]);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center py-12 text-slate-400 text-[11px]">불러오는 중...</div>;
  }
  if (aggregated.length === 0) {
    return <div className="flex-1 flex items-center justify-center py-12 text-slate-400 text-[11px]">해당 기간 매입 상품 없음</div>;
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

// ─── Tab 3 · 매입 추이 · recharts 3종 파이차트 (2026-08-05) ──────────────────

// 공통 팔레트 · 6색 + 기타 회색
const CHART_COLORS = [
  "#10b981", // emerald-500
  "#3b82f6", // blue-500
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
  "#84cc16", // lime-500
  "#64748b", // slate-500 (기타/초과)
  "#a78bfa", // violet-400
];

// 공통 커스텀 툴팁
const ChartTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { fill?: string } }>;
  total: number;
  unit?: string;
}> = ({ active, payload, total, unit = "원" }) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-[11px] min-w-[120px]">
      <div className="font-semibold text-slate-700 mb-1 break-words whitespace-normal leading-snug">{name}</div>
      <div className="tabular-nums text-emerald-700 font-black">{value.toLocaleString()}{unit}</div>
      <div className="tabular-nums text-slate-500 mt-0.5">{pct}%</div>
    </div>
  );
};

// 공통 범례 · 색깔 · 이름 · 퍼센트 세로 리스트
const ChartLegendList: React.FC<{
  items: Array<{ name: string; value: number; color: string }>;
  total: number;
}> = ({ items, total }) => (
  <div className="flex flex-col gap-1 min-w-0">
    {items.map((it, i) => (
      <div key={i} className="flex items-center gap-1.5 min-w-0 text-[11px]">
        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: it.color }} />
        <span className="flex-1 min-w-0 text-slate-700 font-semibold break-words whitespace-normal leading-snug">{it.name}</span>
        <span className="tabular-nums text-slate-500 shrink-0">
          {total > 0 ? ((it.value / total) * 100).toFixed(0) : 0}%
        </span>
      </div>
    ))}
  </div>
);

// ── 차트 1 · 카테고리별 매입액 비중 (top 5 + 기타) ─────────────────────────
// product_name 에 카테고리 정보가 없으므로 · 상품명 앞 2~4글자 키워드를 카테고리로 추정
// 실제로는 카테고리 필드가 있어야 하지만 · 현재 detailRows 는 카테고리 없음
// → 공급사 기반(supplier 없음)이므로 · 상품명 첫 글자 분류 (의약품·건기식·위생·기타)
// 단순 prefix 추출은 의미 없으므로 · keyword 기반 분류 사용
const CATEGORY_KEYWORDS: Array<{ label: string; pattern: RegExp }> = [
  { label: "의약품",  pattern: /정|캡슐|시럽|주사|연고|좌약|앰플|밀리/ },
  { label: "건강기능식품", pattern: /비타민|오메가|유산균|프로바이|콜라겐|루테인|홍삼/ },
  { label: "위생용품", pattern: /마스크|장갑|소독|밴드|패드|면봉/ },
  { label: "의료기기", pattern: /혈압|체온|혈당|측정|검사/ },
  { label: "화장품",  pattern: /크림|로션|선크림|세럼|토너/ },
];

function classifyProduct(name: string): string {
  const n = name.toLowerCase();
  for (const c of CATEGORY_KEYWORDS) {
    if (c.pattern.test(n)) return c.label;
  }
  return "기타";
}

export const CategoryPieChart: React.FC<{ rows: PurchaseDetailRow[] }> = ({ rows }) => {
  const { data, total } = useMemo(() => {
    const map = new Map<string, number>();
    let t = 0;
    for (const r of rows) {
      const cat = classifyProduct(String(r.product_name ?? ""));
      map.set(cat, (map.get(cat) ?? 0) + r.amount);
      t += r.amount;
    }
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    // top 5 + 기타
    const top5 = sorted.slice(0, 5);
    const othersSum = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
    const items = othersSum > 0
      ? [...top5, ["기타", othersSum] as [string, number]]
      : top5;
    return {
      data: items.map(([name, value], i) => ({
        name,
        value,
        color: CHART_COLORS[i % CHART_COLORS.length],
      })),
      total: t,
    };
  }, [rows]);

  if (total === 0) {
    return (
      <div className={`${CARD_BASE} p-4 flex items-center justify-center h-48 text-[11px] text-slate-400`}>
        데이터 없음
      </div>
    );
  }

  return (
    <div className={`${CARD_BASE} p-4 flex flex-col gap-3`}>
      <div className="text-[11px] font-black text-slate-600 uppercase tracking-wider">
        카테고리별 매입액 비중
      </div>
      <div className="flex items-center gap-4">
        <div className="w-[120px] h-[120px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={34}
                outerRadius={58}
                strokeWidth={1}
                stroke="#f8fafc"
              >
                {data.map((entry, i) => (
                  <Cell key={`cat-${i}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip total={total} />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ChartLegendList items={data} total={total} />
      </div>
      <div className="text-right text-[10px] tabular-nums text-slate-400 font-semibold">
        합계 {fmtWon(total)}원
      </div>
    </div>
  );
};

// ── 차트 2 · 월별 매입액 분포 (최근 6개월 파이차트) ───────────────────────
export const MonthlyPieChart: React.FC<{ rows: PurchaseDetailRow[] }> = ({ rows }) => {
  const { data, total } = useMemo(() => {
    // 최근 6개월 label 생성
    const now = new Date();
    const labels: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${d.getMonth() + 1}월`;
      labels.push({ key, label });
    }
    const sumMap = new Map<string, number>();
    let t = 0;
    for (const r of rows) {
      const key = r.date.slice(0, 7);
      sumMap.set(key, (sumMap.get(key) ?? 0) + r.amount);
      t += r.amount;
    }
    // 6개월 내 데이터만 (0인 달 제외)
    const items = labels
      .map(l => ({ name: l.label, value: sumMap.get(l.key) ?? 0 }))
      .filter(it => it.value > 0);
    return {
      data: items.map((it, i) => ({ ...it, color: CHART_COLORS[i % CHART_COLORS.length] })),
      total: items.reduce((s, it) => s + it.value, 0),
    };
  }, [rows]);

  if (total === 0) {
    return (
      <div className={`${CARD_BASE} p-4 flex items-center justify-center h-48 text-[11px] text-slate-400`}>
        최근 6개월 데이터 없음
      </div>
    );
  }

  return (
    <div className={`${CARD_BASE} p-4 flex flex-col gap-3`}>
      <div className="text-[11px] font-black text-slate-600 uppercase tracking-wider">
        월별 매입액 분포 (최근 6개월)
      </div>
      <div className="flex items-center gap-4">
        <div className="w-[120px] h-[120px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={34}
                outerRadius={58}
                strokeWidth={1}
                stroke="#f8fafc"
              >
                {data.map((entry, i) => (
                  <Cell key={`mon-${i}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip total={total} />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ChartLegendList items={data} total={total} />
      </div>
      <div className="text-right text-[10px] tabular-nums text-slate-400 font-semibold">
        합계 {fmtWon(total)}원
      </div>
    </div>
  );
};

// ── 차트 3 · 상품별 매입 Top 10 비중 ─────────────────────────────────────
export const TopProductsPieChart: React.FC<{ rows: PurchaseDetailRow[] }> = ({ rows }) => {
  const { data, total } = useMemo(() => {
    const map = new Map<string, number>();
    let t = 0;
    for (const r of rows) {
      const nm = String(r.product_name ?? "").trim() || "(이름없음)";
      map.set(nm, (map.get(nm) ?? 0) + r.amount);
      t += r.amount;
    }
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const top10 = sorted.slice(0, 10);
    const othersSum = sorted.slice(10).reduce((s, [, v]) => s + v, 0);
    const items = othersSum > 0
      ? [...top10, ["기타", othersSum] as [string, number]]
      : top10;
    return {
      data: items.map(([name, value], i) => ({
        name,
        value,
        color: CHART_COLORS[i % CHART_COLORS.length],
      })),
      total: t,
    };
  }, [rows]);

  if (total === 0) {
    return (
      <div className={`${CARD_BASE} p-4 flex items-center justify-center h-48 text-[11px] text-slate-400`}>
        데이터 없음
      </div>
    );
  }

  return (
    <div className={`${CARD_BASE} p-4 flex flex-col gap-3`}>
      <div className="text-[11px] font-black text-slate-600 uppercase tracking-wider">
        상품별 매입 Top 10
      </div>
      <div className="flex items-center gap-4">
        <div className="w-[120px] h-[120px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={34}
                outerRadius={58}
                strokeWidth={1}
                stroke="#f8fafc"
              >
                {data.map((entry, i) => (
                  <Cell key={`top-${i}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip total={total} />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ChartLegendList items={data} total={total} />
      </div>
      <div className="text-right text-[10px] tabular-nums text-slate-400 font-semibold">
        합계 {fmtWon(total)}원
      </div>
    </div>
  );
};

// ── TrendTab · 3종 차트 컨테이너 (반응형 그리드) ─────────────────────────
const TrendTab: React.FC<{ rows: PurchaseDetailRow[]; loading: boolean }> = ({ rows, loading }) => {
  if (loading) {
    return <div className="flex-1 flex items-center justify-center py-12 text-slate-400 text-[11px]">불러오는 중...</div>;
  }
  if (rows.length === 0) {
    return <div className="flex-1 flex items-center justify-center py-12 text-slate-400 text-[11px]">해당 기간 매입 데이터 없음</div>;
  }
  return (
    // 반응형 그리드 · 모바일 1열 · 태블릿 2열 · 데스크탑 3열
    <div className="flex-1 min-h-0 overflow-auto p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        <CategoryPieChart rows={rows} />
        <MonthlyPieChart rows={rows} />
        <TopProductsPieChart rows={rows} />
      </div>
    </div>
  );
};

// ─── PurchaseSubTabs · Container ──────────────────────────────────────────

const TABS: { key: TabKey; label: string; icon: React.ElementType; hint: string; color: string }[] = [
  { key: "ledger",  label: "매입이력",   icon: ListOrdered, hint: "선택 기간 · 매입 원장",         color: "emerald" },
  { key: "product", label: "상품별 집계", icon: Package2,    hint: "선택 기간 · groupBy 상품명",    color: "sky"     },
  { key: "trend",   label: "매입 추이",   icon: BarChart3,   hint: "선택 기간 · 3종 파이차트",      color: "violet"  },
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
  // 신규 공통 prop
  periodMonths: periodMonthsProp,
  periodSeason: periodSeasonProp,
  onPeriodChange,
  // 하위호환 별칭
  ledgerPeriodMonths,
  ledgerPeriodSeason,
  onLedgerPeriodChange,
}) => {
  // 신규 prop 우선 · 없으면 하위호환 prop 사용
  const periodMonths = periodMonthsProp ?? ledgerPeriodMonths;
  const periodSeason = periodSeasonProp ?? ledgerPeriodSeason;
  const handlePeriodChange = onPeriodChange ?? onLedgerPeriodChange;

  const [internalTab, setInternalTab] = useState<TabKey>(initialTab);
  const tab = activeTab ?? internalTab;
  const setTab = (next: TabKey) => {
    if (activeTab === undefined) setInternalTab(next);
    onTabChange?.(next);
  };

  const hasPeriodFilter = handlePeriodChange != null;

  return (
    <div className={`${CARD_BASE} flex flex-col min-h-0 flex-1`}>
      {/* 탭 헤더 */}
      <div className="flex flex-wrap items-center border-b border-slate-200 bg-slate-50/50 px-2 pt-1 gap-0">
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

      {/* 3탭 공통 기간 필터 (2026-08-05 · 탭 바 아래 항상 표시) */}
      {hasPeriodFilter && (
        <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/30 flex flex-wrap items-center gap-2 shrink-0">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">조회기간</span>
          <div className="flex flex-wrap bg-slate-50 border border-slate-200 rounded-md p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => handlePeriodChange!(0, null)}
              className={`px-2 h-6 text-[10px] font-semibold rounded transition cursor-pointer ${
                !periodSeason && periodMonths === 0
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >10일</button>
            {([1, 2, 3, 4, 5, 6] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => handlePeriodChange!(m, null)}
                className={`px-2 h-6 text-[10px] font-semibold rounded transition cursor-pointer ${
                  !periodSeason && periodMonths === m
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >{m}개월</button>
            ))}
          </div>
          <SeasonButtons
            value={periodSeason ?? null}
            onChange={(v) => handlePeriodChange!(periodMonths ?? 1, v)}
            size="sm"
            hideLabel
          />
        </div>
      )}

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
