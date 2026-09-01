// src/components/OrderManagePage/PurchaseHistoryTab/PurchaseSubTabs.tsx
// 우측 하단 · 서브탭 3개 (2026-08-03)
// Tab 1 · 매입원장 (default · 기존 원장 유지)
// Tab 2 · 상품별 집계 (product_name groupBy)
// Tab 3 · 매입 추이 (recharts 3종 파이차트 · 2026-08-05)
// 2026-08-05 · 기간 필터 · 3탭 공통 상단 배치 (매입이력 전용 → 공통 이관)

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown, BarChart3, ChevronDown, ChevronRight,
  ListOrdered, Package2,
} from "lucide-react";
import { Spinner } from "../../common/Spinner";
// 2026-08-21 · Framework Phase 3 · Card 프리미티브
import { Card } from "../../common/Card";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import { SeasonButtons } from "../../common/SeasonButtons";
import { type SeasonKey } from "../../../hooks/useSeasonRanges";
import { useSortableTable, type Comparator } from "../../../hooks/useSortableTable";
// T-CSS Phase 2 · 2026-08-06
import { CARD_BASE } from "../../../styles/tokens";
import { useColumnResize, RESIZER_CLS } from "../../../hooks/useColumnResize";
import { fmtWonNoUnit, fmtDateSlice } from "../../../lib/format";

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

const fmtWon = fmtWonNoUnit;
const dateLabel = fmtDateSlice;

// 2026-08-21 · Framework Phase 4 · LedgerTab · ProductAggTab 은 별도 파일로 분리
import { LedgerTab } from "./LedgerTab";
import { ProductAggTab } from "./ProductAggTab";

// ─── Tab 3 · 매입 추이 · recharts 3종 파이차트 (2026-08-05) ──────────────────
// 2026-08-21 · Framework Phase 4 · chart 헬퍼는 ./chart-helpers 로 분리
import { CHART_COLORS, ChartTooltip, ChartLegendList, classifyProduct } from "./chart-helpers";

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
      <div className={`${CARD_BASE} p-4 flex items-center justify-center h-48 text-[13px] text-zinc-400`}>
        데이터 없음
      </div>
    );
  }

  return (
    <div className={`${CARD_BASE} p-4 flex flex-col gap-3`}>
      <div className="text-[13px] font-bold text-zinc-600 uppercase tracking-wider">
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
      <div className="text-right text-[12px] tabular-nums text-zinc-400 font-semibold">
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
      <div className={`${CARD_BASE} p-4 flex items-center justify-center h-48 text-[13px] text-zinc-400`}>
        최근 6개월 데이터 없음
      </div>
    );
  }

  return (
    <div className={`${CARD_BASE} p-4 flex flex-col gap-3`}>
      <div className="text-[13px] font-bold text-zinc-600 uppercase tracking-wider">
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
      <div className="text-right text-[12px] tabular-nums text-zinc-400 font-semibold">
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
      <div className={`${CARD_BASE} p-4 flex items-center justify-center h-48 text-[13px] text-zinc-400`}>
        데이터 없음
      </div>
    );
  }

  return (
    <div className={`${CARD_BASE} p-4 flex flex-col gap-3`}>
      <div className="text-[13px] font-bold text-zinc-600 uppercase tracking-wider">
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
      <div className="text-right text-[12px] tabular-nums text-zinc-400 font-semibold">
        합계 {fmtWon(total)}원
      </div>
    </div>
  );
};

// ── Top10 랭킹 카드 · 매입수량 · 단가 · 매입간격 (2026-08-06 · 사용자 요청) ────
type Top10Item = { rank: number; name: string; value: number; sub?: string };

const Top10Card: React.FC<{
  title: string;
  items: Top10Item[];
  formatValue: (v: number) => string;
  valueColor: string; // e.g. "text-amber-700"
}> = ({ title, items, formatValue, valueColor }) => {
  if (items.length === 0) {
    return (
      <div className={`${CARD_BASE} p-4 flex items-center justify-center h-48 text-[13px] text-zinc-400`}>
        데이터 없음
      </div>
    );
  }
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <div className={`${CARD_BASE} p-3 flex flex-col gap-2`}>
      <div className="text-[13px] font-bold text-zinc-600 uppercase tracking-wider">{title}</div>
      <div className="flex flex-col gap-1">
        {items.map(it => {
          const pct = (it.value / max) * 100;
          return (
            <div key={`${it.rank}-${it.name}`} className="flex items-center gap-2 text-[13px]">
              <span className={`shrink-0 w-6 h-5 rounded-md flex items-center justify-center font-bold tabular-nums ${
                it.rank <= 3 ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-500"
              }`}>{it.rank}</span>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="font-semibold text-zinc-700 break-words whitespace-normal leading-snug" title={it.name}>{it.name}</span>
                <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
                  <div className={`h-full ${valueColor.replace("text-", "bg-")}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className={`shrink-0 tabular-nums font-bold ${valueColor}`}>{formatValue(it.value)}</span>
              {it.sub && <span className="shrink-0 text-[12px] text-zinc-400 tabular-nums">{it.sub}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// 매입수량 Top10 (product_name 기준 · 총 수량 합)
const TopQuantityCard: React.FC<{ rows: PurchaseDetailRow[] }> = ({ rows }) => {
  const items = useMemo<Top10Item[]>(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const nm = String(r.product_name ?? "").trim() || "(이름없음)";
      map.set(nm, (map.get(nm) ?? 0) + (Number(r.quantity) || 0));
    }
    return Array.from(map.entries())
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value], i) => ({ rank: i + 1, name, value }));
  }, [rows]);
  return <Top10Card title="매입수량 Top 10" items={items} formatValue={v => `${v.toLocaleString()}`} valueColor="text-amber-700" />;
};

// 단가 Top10 (product_name 기준 · 평균 단가)
const TopUnitPriceCard: React.FC<{ rows: PurchaseDetailRow[] }> = ({ rows }) => {
  const items = useMemo<Top10Item[]>(() => {
    const map = new Map<string, { sum: number; count: number }>();
    for (const r of rows) {
      const nm = String(r.product_name ?? "").trim() || "(이름없음)";
      const up = Number(r.unit_price) || 0;
      if (up <= 0) continue;
      const cur = map.get(nm) ?? { sum: 0, count: 0 };
      cur.sum += up;
      cur.count += 1;
      map.set(nm, cur);
    }
    return Array.from(map.entries())
      .map(([name, { sum, count }]) => ({ name, avg: sum / count, count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 10)
      .map((x, i) => ({ rank: i + 1, name: x.name, value: Math.round(x.avg), sub: `${x.count}회` }));
  }, [rows]);
  return <Top10Card title="단가 Top 10 (평균)" items={items} formatValue={v => `${fmtWon(v)}원`} valueColor="text-emerald-700" />;
};

// 매입간격 Top10 (product_name 기준 · 평균 매입 간격 일수 · 짧을수록 상위 = 자주 매입)
const TopIntervalCard: React.FC<{ rows: PurchaseDetailRow[] }> = ({ rows }) => {
  const items = useMemo<Top10Item[]>(() => {
    const byProduct = new Map<string, Set<string>>();
    for (const r of rows) {
      const nm = String(r.product_name ?? "").trim() || "(이름없음)";
      const dt = String(r.date ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dt)) continue;
      const set = byProduct.get(nm) ?? new Set<string>();
      set.add(dt);
      byProduct.set(nm, set);
    }
    const result: Array<{ name: string; interval: number; count: number }> = [];
    for (const [name, dateSet] of byProduct) {
      if (dateSet.size < 2) continue; // 2회 이상 매입만 · 간격 계산 가능
      const dates = Array.from(dateSet).sort();
      let totalDays = 0;
      for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i - 1]).getTime();
        const cur = new Date(dates[i]).getTime();
        totalDays += Math.round((cur - prev) / 86400000);
      }
      const avgInterval = totalDays / (dates.length - 1);
      result.push({ name, interval: avgInterval, count: dateSet.size });
    }
    return result
      .sort((a, b) => a.interval - b.interval) // 짧을수록 상위 (자주 매입)
      .slice(0, 10)
      .map((x, i) => ({ rank: i + 1, name: x.name, value: Math.round(x.interval), sub: `${x.count}회` }));
  }, [rows]);
  return <Top10Card title="매입간격 Top 10 (짧을수록 자주)" items={items} formatValue={v => `${v}일`} valueColor="text-sky-700" />;
};

// ── TrendTab · Top 10 랭킹 · 3 metric 탭 + 하단 원형 차트 (2026-08-06 · 사용자 요청) ─────
type TrendMetric = "quantity" | "unitPrice" | "interval";
const METRIC_TABS: { k: TrendMetric; label: string; hint: string; color: string }[] = [
  { k: "quantity",  label: "매입수량",    hint: "총 수량 합",       color: "amber"   },
  { k: "unitPrice", label: "단가",       hint: "평균 단가",         color: "emerald" },
  { k: "interval",  label: "매입간격",    hint: "짧을수록 자주",     color: "sky"     },
];

const TrendTab: React.FC<{ rows: PurchaseDetailRow[]; loading: boolean }> = ({ rows, loading }) => {
  const [metric, setMetric] = useState<TrendMetric>("quantity");

  // 데이터 실제 기간 (사용자 요청 · 제목 옆 " - " 형태)
  const dateRange = useMemo(() => {
    if (rows.length === 0) return null;
    const dates = rows.map(r => String(r.date ?? "").slice(0, 10)).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    if (dates.length === 0) return null;
    const fmt = (s: string) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      return m ? `${m[1]}.${m[2]}.${m[3]}` : s;
    };
    return `${fmt(dates[0])} ~ ${fmt(dates[dates.length - 1])}`;
  }, [rows]);

  // 파이 차트 · 선택된 metric 기준 top10 분포 (interval 은 매입 횟수 기준)
  const pieData = useMemo(() => {
    if (metric === "quantity") {
      const map = new Map<string, number>();
      let t = 0;
      for (const r of rows) {
        const nm = String(r.product_name ?? "").trim() || "(이름없음)";
        const v = Number(r.quantity) || 0;
        map.set(nm, (map.get(nm) ?? 0) + v);
        t += v;
      }
      const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
      const top = sorted.slice(0, 10);
      const othersSum = sorted.slice(10).reduce((s, [, v]) => s + v, 0);
      const items = othersSum > 0 ? [...top, ["기타", othersSum] as [string, number]] : top;
      return {
        data: items.map(([name, value], i) => ({ name, value, color: CHART_COLORS[i % CHART_COLORS.length] })),
        total: t,
        unitLabel: "개",
      };
    }
    if (metric === "unitPrice") {
      // 상품별 총 매입 금액 (amount) 기준 · 단가 자체는 avg 라 pie 부적합 → 매입액 분포로 표시
      const map = new Map<string, number>();
      let t = 0;
      for (const r of rows) {
        const nm = String(r.product_name ?? "").trim() || "(이름없음)";
        map.set(nm, (map.get(nm) ?? 0) + r.amount);
        t += r.amount;
      }
      const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
      const top = sorted.slice(0, 10);
      const othersSum = sorted.slice(10).reduce((s, [, v]) => s + v, 0);
      const items = othersSum > 0 ? [...top, ["기타", othersSum] as [string, number]] : top;
      return {
        data: items.map(([name, value], i) => ({ name, value, color: CHART_COLORS[i % CHART_COLORS.length] })),
        total: t,
        unitLabel: "원",
      };
    }
    // interval → 매입 횟수 분포 (자주 매입 = 큰 조각)
    const map = new Map<string, number>();
    let t = 0;
    for (const r of rows) {
      const nm = String(r.product_name ?? "").trim() || "(이름없음)";
      map.set(nm, (map.get(nm) ?? 0) + 1);
      t += 1;
    }
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 10);
    const othersSum = sorted.slice(10).reduce((s, [, v]) => s + v, 0);
    const items = othersSum > 0 ? [...top, ["기타", othersSum] as [string, number]] : top;
    return {
      data: items.map(([name, value], i) => ({ name, value, color: CHART_COLORS[i % CHART_COLORS.length] })),
      total: t,
      unitLabel: "회",
    };
  }, [rows, metric]);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center py-12"><Spinner label="불러오는 중..." size={13} tone="zinc" labelSize={11} /></div>;
  }
  if (rows.length === 0) {
    return <div className="flex-1 flex items-center justify-center py-12 text-zinc-400 text-[13px]">해당 기간 매입 데이터 없음</div>;
  }

  const pieTitle =
    metric === "quantity"  ? "상품별 매입수량 분포"
    : metric === "unitPrice" ? "상품별 매입액 분포 (단가·평균 참고용)"
    : "상품별 매입 횟수 분포";

  return (
    <div className="flex-1 min-h-0 overflow-auto p-3 flex flex-col gap-3">
      {/* 제목 + 기간 */}
      <div className="flex items-baseline gap-2 px-1">
        <span className="text-[14px] font-bold text-zinc-700">매입추이 Top 10</span>
        {dateRange && (
          <span className="text-[12.5px] text-zinc-400 font-semibold tabular-nums">({dateRange})</span>
        )}
        <span className="text-[12px] text-zinc-400 tabular-nums ml-auto">{rows.length.toLocaleString()}건</span>
      </div>
      {/* 3-metric 탭 */}
      <div className="flex items-center gap-1 border-b border-zinc-100 pb-0.5">
        {METRIC_TABS.map(t => {
          const active = t.k === metric;
          const activeCls =
            t.color === "amber"   ? "text-amber-700 border-amber-500"
            : t.color === "emerald" ? "text-emerald-700 border-emerald-500"
            : "text-sky-700 border-sky-500";
          return (
            <button key={t.k}
              type="button"
              onClick={() => setMetric(t.k)}
              className={`inline-flex items-center gap-1 h-8 px-3 border-b-2 text-[14px] font-bold cursor-pointer transition ${
                active ? `${activeCls} bg-white` : "text-zinc-400 border-transparent hover:text-zinc-600"
              }`}
              title={t.hint}
            >
              {t.label}
              <span className="text-[12px] font-normal text-zinc-400">{t.hint}</span>
            </button>
          );
        })}
      </div>
      {/* 선택된 Top10 (풀 폭) */}
      {metric === "quantity"  && <TopQuantityCard rows={rows} />}
      {metric === "unitPrice" && <TopUnitPriceCard rows={rows} />}
      {metric === "interval"  && <TopIntervalCard rows={rows} />}
      {/* 하단 원형 차트 */}
      {pieData.total > 0 && (
        <div className={`${CARD_BASE} p-4 flex flex-col gap-3`}>
          <div className="text-[13px] font-bold text-zinc-600 uppercase tracking-wider">{pieTitle}</div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-[140px] h-[140px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData.data}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={66}
                    strokeWidth={1}
                    stroke="#f8fafc"
                  >
                    {pieData.data.map((entry, i) => (
                      <Cell key={`trend-pie-${i}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip total={pieData.total} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 min-w-[200px]">
              <ChartLegendList items={pieData.data} total={pieData.total} />
            </div>
          </div>
          <div className="text-right text-[12px] tabular-nums text-zinc-400 font-semibold">
            합계 {pieData.total.toLocaleString()}{pieData.unitLabel}
          </div>
        </div>
      )}
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
      <div className="flex flex-wrap items-center border-b border-line bg-zinc-50/50 px-2 pt-1 gap-0">
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
                "text-[16px] sm:text-[18px] font-bold leading-none whitespace-nowrap",
                "transition-colors duration-150 cursor-pointer outline-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-300",
                "active:opacity-70",
                active ? c.text : `text-zinc-500 ${c.hoverText}`,
              ].join(" ")}
            >
              <Icon size={19} className={`shrink-0 sm:size-[20px] transition-colors duration-150 ${active ? c.text : "text-zinc-400"}`} />
              <span>{t.label}</span>
              {active && <span className={`absolute left-0 right-0 -bottom-px h-[2.5px] ${c.bar} rounded-t-sm`} />}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1 text-[12px] text-zinc-400 pr-2">
          <ArrowUpDown size={10} />
          <span>헤더 클릭 정렬</span>
        </div>
      </div>

      {/* 2026-08-10 · 사용자 요청 · 3탭 공통 기간 필터 제거 · 상단 툴바로 통합됨 (다른 UI와 통일) */}

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
