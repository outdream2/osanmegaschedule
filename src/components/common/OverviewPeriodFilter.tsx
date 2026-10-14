// 2026-10-12 · 사용자 지시 · "조회기간 필터 전체 통일"
//   · 월 pill 6개 (최신 월 ~ 과거 5개월) + "월별" (여러달 선택 토글)
//   · quickRange pill (오늘·7일·14일·한달)
//   · optional classFilter pill (전체·상비약·일반약·미분류)
//   · 모든 현황판 (overview) 에서 재사용 · SSOT

import React, { useMemo } from "react";

export type QuickRangeKey = "today" | "7d" | "14d" | "30d" | null;
export type ClassFilterKey = "all" | "pre" | "general" | "unknown";

/** 월 pill 그룹 · 최신 월부터 과거 N개월 노출 · 선택 토글 */
export const MonthPills: React.FC<{
  selectedMonths: string[];               // ["2026-10", "2026-09"]
  onChange: (months: string[]) => void;
  monthCount?: number;                    // default 6
  /** "월별" 모드 플래그 · null quickRange 시 활성 (여러달 선택 가능) */
  multi?: boolean;
}> = ({ selectedMonths, onChange, monthCount = 6, multi = true }) => {
  const months = useMemo(() => {
    const list: Array<{ k: string; label: string }> = [];
    const d = new Date();
    for (let i = 0; i < monthCount; i++) {
      const y = d.getFullYear();
      const m = d.getMonth() + 1 - i;
      const date = new Date(y, m - 1, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const label = `${date.getMonth() + 1}월`;
      list.push({ k: key, label });
    }
    return list;
  }, [monthCount]);

  const toggle = (k: string) => {
    if (!multi) {
      onChange([k]);
      return;
    }
    const set = new Set(selectedMonths);
    if (set.has(k)) set.delete(k); else set.add(k);
    if (set.size === 0) set.add(k);  // 최소 1개 유지
    onChange(Array.from(set).sort((a, b) => b.localeCompare(a)));
  };

  return (
    <div className="inline-flex items-center bg-slate-100 border border-slate-200 rounded-md p-0.5">
      {months.map(m => {
        const active = selectedMonths.includes(m.k);
        return (
          <button
            key={m.k}
            type="button"
            onClick={() => toggle(m.k)}
            className={`h-7 px-2.5 rounded-sm text-[13px] font-semibold tabular-nums transition-colors cursor-pointer ${
              active ? "bg-white text-brand-deep shadow-sm" : "text-slate-500 hover:text-ink"
            }`}
            aria-selected={active}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
};

/** quickRange pill 그룹 · 오늘·7일·14일·한달·월별 */
export const QuickRangePills: React.FC<{
  value: QuickRangeKey;
  onChange: (v: QuickRangeKey) => void;
  showMonthMode?: boolean;  // default true · "월별" 포함
}> = ({ value, onChange, showMonthMode = true }) => {
  const items: Array<{ k: QuickRangeKey; label: string }> = [
    { k: "today", label: "오늘" },
    { k: "7d",   label: "7일" },
    { k: "14d",  label: "14일" },
    { k: "30d",  label: "한달" },
    ...(showMonthMode ? [{ k: null, label: "월별" } as { k: QuickRangeKey; label: string }] : []),
  ];
  return (
    <div className="inline-flex items-center bg-slate-100 border border-slate-200 rounded-md p-0.5" role="tablist" aria-label="기간 필터">
      {items.map(p => (
        <button
          key={String(p.k)}
          type="button"
          onClick={() => onChange(p.k)}
          className={`h-7 px-2.5 rounded-sm text-[13px] font-semibold tabular-nums transition-colors cursor-pointer ${
            value === p.k ? "bg-white text-brand-deep shadow-sm" : "text-slate-500 hover:text-ink"
          }`}
          aria-selected={value === p.k}
          role="tab"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
};

/** 분류 pill · 전체·상비약·일반약·미분류 */
export const ClassFilterPills: React.FC<{
  value: ClassFilterKey;
  onChange: (v: ClassFilterKey) => void;
}> = ({ value, onChange }) => {
  const items: Array<{ k: ClassFilterKey; label: string }> = [
    { k: "all",     label: "전체"  },
    { k: "pre",     label: "상비약" },
    { k: "general", label: "일반약" },
    { k: "unknown", label: "미분류" },
  ];
  return (
    <div className="inline-flex items-center bg-slate-100 border border-slate-200 rounded-md p-0.5" role="tablist" aria-label="분류 필터">
      {items.map(t => (
        <button
          key={t.k}
          type="button"
          onClick={() => onChange(t.k)}
          className={`px-3 h-7 rounded text-[13px] font-semibold transition-colors cursor-pointer ${
            value === t.k ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-ink"
          }`}
          aria-selected={value === t.k}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
};

/** 통합 period filter · 월 pill + quickRange pill (optional classFilter) · 전체 통일 */
export interface OverviewPeriodFilterProps {
  selectedMonths: string[];
  onMonthsChange: (months: string[]) => void;
  quickRange: QuickRangeKey;
  onQuickRangeChange: (v: QuickRangeKey) => void;
  classFilter?: ClassFilterKey;
  onClassFilterChange?: (v: ClassFilterKey) => void;
  periodLabel?: string;  // "기간: YYYY-MM-DD ~ YYYY-MM-DD · N일"
  monthCount?: number;
  right?: React.ReactNode;
}

export const OverviewPeriodFilter: React.FC<OverviewPeriodFilterProps> = ({
  selectedMonths, onMonthsChange,
  quickRange, onQuickRangeChange,
  classFilter, onClassFilterChange,
  periodLabel,
  monthCount = 6,
  right,
}) => {
  return (
    <div className="flex items-start gap-3 flex-wrap">
      <MonthPills selectedMonths={selectedMonths} onChange={onMonthsChange} monthCount={monthCount} />
      <QuickRangePills value={quickRange} onChange={onQuickRangeChange} />
      {classFilter != null && onClassFilterChange && (
        <ClassFilterPills value={classFilter} onChange={onClassFilterChange} />
      )}
      {periodLabel && (
        <div className="text-[13px] text-slate-500 font-medium ml-auto whitespace-nowrap">{periodLabel}</div>
      )}
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
};

export default OverviewPeriodFilter;

// 2026-10-12 · 사용자 지시 "기간필터 공통 적용" · effectiveRange + hook 통합
export interface EffectiveRange { from: string; to: string; days: number; }
const ymdDaysAgo = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function computeEffectiveRange(selectedMonths: string[], quickRange: QuickRangeKey): EffectiveRange {
  if (quickRange === "today") { const t = ymdDaysAgo(0); return { from: t, to: t, days: 1 }; }
  if (quickRange === "7d" || quickRange === "14d" || quickRange === "30d") {
    const n = quickRange === "7d" ? 7 : quickRange === "14d" ? 14 : 30;
    return { from: ymdDaysAgo(n - 1), to: ymdDaysAgo(0), days: n };
  }
  if (selectedMonths.length > 0) {
    const sorted = [...selectedMonths].sort();
    const earliest = sorted[0];
    const latest = sorted[sorted.length - 1];
    const [ey, em] = earliest.split("-").map(Number);
    const [ly, lm] = latest.split("-").map(Number);
    const from = `${ey}-${String(em).padStart(2, "0")}-01`;
    const lastDay = new Date(ly, lm, 0).getDate();
    const to = `${ly}-${String(lm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const d1 = new Date(from + "T00:00:00").getTime();
    const d2 = new Date(to + "T00:00:00").getTime();
    const days = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
    return { from, to, days };
  }
  return { from: ymdDaysAgo(13), to: ymdDaysAgo(0), days: 14 };
}
export function useOverviewPeriod(initialQuickRange: QuickRangeKey = "14d") {
  const [selectedMonths, setSelectedMonths] = React.useState<string[]>([]);
  const [quickRange, setQuickRange] = React.useState<QuickRangeKey>(initialQuickRange);
  const effectiveRange = useMemo(() => computeEffectiveRange(selectedMonths, quickRange), [selectedMonths, quickRange]);
  return { selectedMonths, setSelectedMonths, quickRange, setQuickRange, effectiveRange };
}
