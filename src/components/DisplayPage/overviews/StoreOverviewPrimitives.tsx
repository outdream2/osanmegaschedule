// src/components/DisplayPage/overviews/StoreOverviewPrimitives.tsx
// 2026-10-08 · GLOBAL UI · 매장 5개 통합 overview 공통 presentation primitives
//   · 신규 business logic 없음 · pure presentation
//   · L2 Line Tabs · compact Toolbar · KPI · Section · Task row · Quick action · Compact table row
//   · 모든 overview 가 동일 reference-tone layout 공유

import React from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";

// ─── L2 Line Tabs (overview 상단) ─────────────────────────────────────────
export interface OverviewL2Tab {
  key: string;
  label: string;
}
export const OverviewL2TabsRow: React.FC<{
  active: string;
  tabs: OverviewL2Tab[];
  onSelect: (key: string) => void;
}> = ({ active, tabs, onSelect }) => (
  <nav
    aria-label="페이지 L2 네비게이션"
    className="bg-white border-b border-slate-200 px-4 sm:px-6 flex items-stretch flex-nowrap gap-6 sm:gap-8 overflow-x-auto scrollbar-hide"
  >
    {tabs.map(t => {
      const isActive = t.key === active;
      return (
        <button
          key={t.key}
          type="button"
          onClick={() => onSelect(t.key)}
          className={`relative inline-flex items-center h-11 px-0.5 text-[14px] sm:text-[15px] whitespace-nowrap tracking-tight transition-colors cursor-pointer shrink-0 ${
            isActive ? "text-ink font-semibold" : "text-slate-500 font-medium hover:text-ink"
          }`}
        >
          <span>{t.label}</span>
          {isActive && (
            <span aria-hidden className="absolute left-0 right-0 -bottom-px h-[2px] bg-brand-deep rounded-sm" />
          )}
        </button>
      );
    })}
  </nav>
);

// ─── Compact Toolbar (search + optional controls) ─────────────────────────
export const OverviewToolbar: React.FC<{
  search?: string;
  onSearch?: (v: string) => void;
  placeholder?: string;
  right?: React.ReactNode;
}> = ({ search = "", onSearch, placeholder = "검색...", right }) => (
  <div className="px-4 sm:px-6 pt-3 flex flex-wrap items-center gap-2">
    {onSearch && (
      <div className="relative flex-1 min-w-[200px] max-w-[440px]">
        <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          aria-label="검색"
          className="w-full h-9 pl-9 pr-3 text-[13px] bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition-colors placeholder:text-slate-400"
        />
      </div>
    )}
    {right}
  </div>
);

// ─── KPI (overview 공통 · compact · icon tile + label + value + hint) ──
export const OverviewKpi: React.FC<{
  icon?: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: string;
  hint?: React.ReactNode;
  tone?: "neutral" | "brand" | "emerald" | "amber" | "rose" | "violet";
}> = ({ icon, label, value, unit, hint, tone = "neutral" }) => {
  const toneBg = {
    neutral: "bg-slate-100 text-slate-600",
    brand:   "bg-brand-tint/60 text-brand-deep",
    emerald: "bg-emerald-50 text-emerald-700",
    amber:   "bg-amber-50 text-amber-700",
    rose:    "bg-rose-50 text-rose-700",
    violet:  "bg-violet-50 text-violet-700",
  }[tone];
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 min-h-[88px]">
      {icon != null && (
        <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${toneBg}`}>
          {icon}
        </span>
      )}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="text-[13px] font-semibold text-ink-soft truncate">{label}</div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[26px] font-extrabold text-ink tabular-nums leading-tight tracking-[-0.02em]">
            {value}
          </span>
          {unit && <span className="text-[13px] font-semibold text-ink-soft">{unit}</span>}
        </div>
        {hint != null && (
          <div className="text-[12px] font-medium text-ink-soft truncate">{hint}</div>
        )}
      </div>
    </div>
  );
};

// ─── 섹션 (flat panel · heavy card wrapper 금지) ──
export const OverviewSection: React.FC<{
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, action, children, className = "" }) => (
  <section className={`bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 min-h-0 ${className}`}>
    <header className="flex items-center justify-between gap-2 shrink-0">
      <h3 className="text-[15px] font-semibold text-ink tracking-tight">{title}</h3>
      {action && <div className="shrink-0">{action}</div>}
    </header>
    <div className="flex-1 min-h-0">{children}</div>
  </section>
);

// ─── Task / summary row (click → 기존 L2 route) ──
export const OverviewTaskRow: React.FC<{
  icon?: React.ReactNode;
  label: React.ReactNode;
  description?: React.ReactNode;
  count?: React.ReactNode;
  tone?: "neutral" | "brand" | "amber" | "rose" | "emerald" | "violet";
  onClick?: () => void;
  disabled?: boolean;
}> = ({ icon, label, description, count, tone = "neutral", onClick, disabled }) => {
  const countTone = {
    neutral: "text-ink-soft",
    brand:   "text-brand-deep",
    amber:   "text-amber-700",
    rose:    "text-rose-600",
    emerald: "text-emerald-700",
    violet:  "text-violet-700",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className="w-full flex items-center gap-3 px-2 h-10 rounded-md text-left transition-colors hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-default cursor-pointer"
    >
      {icon && <span className="shrink-0 text-ink-soft">{icon}</span>}
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-ink truncate">{label}</div>
        {description && <div className="text-[12px] font-medium text-ink-soft truncate">{description}</div>}
      </div>
      {count != null && (
        <span className={`text-[14px] font-bold tabular-nums shrink-0 ${countTone}`}>{count}</span>
      )}
    </button>
  );
};

// ─── Quick action tile (overview 공통 · 가로 한 줄 grid-cols-5) ──
export const OverviewQuickAction: React.FC<{
  icon: React.ReactNode;
  label: React.ReactNode;
  description?: React.ReactNode;
  onClick?: () => void;
  tone?: "neutral" | "brand" | "emerald" | "amber" | "rose" | "violet";
}> = ({ icon, label, description, onClick, tone = "brand" }) => {
  const toneBg = {
    neutral: "bg-slate-100 text-slate-600",
    brand:   "bg-brand-tint/60 text-brand-deep",
    emerald: "bg-emerald-50 text-emerald-700",
    amber:   "bg-amber-50 text-amber-700",
    rose:    "bg-rose-50 text-rose-700",
    violet:  "bg-violet-50 text-violet-700",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-3 h-16 transition-colors hover:bg-zinc-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-default cursor-pointer text-left"
    >
      <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${toneBg}`}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-ink truncate">{label}</div>
        {description && <div className="text-[11px] font-medium text-ink-soft truncate">{description}</div>}
      </div>
    </button>
  );
};

// ─── Compact table (overview 하단 recent list 전용) ──
export interface OverviewTableColumn {
  key: string;
  label: React.ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
}
export const OverviewTable: React.FC<{
  columns: OverviewTableColumn[];
  rows: Array<Record<string, React.ReactNode>>;
  emptyMessage?: React.ReactNode;
}> = ({ columns, rows, emptyMessage = "데이터가 없습니다" }) => (
  <div className="w-full overflow-x-auto">
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-slate-200">
          {columns.map(col => (
            <th
              key={col.key}
              className={`py-2 px-2 text-[11px] font-semibold text-ink-soft uppercase tracking-wider ${
                col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
              } ${col.className ?? ""}`}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="py-6 text-center text-[12px] text-ink-soft/70">
              {emptyMessage}
            </td>
          </tr>
        ) : (
          rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-100 hover:bg-zinc-50/60">
              {columns.map(col => (
                <td
                  key={col.key}
                  className={`py-2.5 px-2 text-ink ${
                    col.align === "right" ? "text-right tabular-nums" : col.align === "center" ? "text-center" : ""
                  } ${col.className ?? ""}`}
                >
                  {row[col.key] ?? "-"}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);
