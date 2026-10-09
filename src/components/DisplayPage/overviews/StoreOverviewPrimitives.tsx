// src/components/DisplayPage/overviews/StoreOverviewPrimitives.tsx
// 2026-10-09 · GLOBAL UI · Store integrated consoles · 공통 presentation primitives
//   · 폰트 최종 리밸런싱 · body 14+ · table 14 · section 16 · KPI 26-30 · 11px operational text 금지
//   · 신규 business logic 없음 · pure presentation

import React from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";

// ─── Compact Toolbar ─────────────────────────────────────────────────────
export const OverviewToolbar: React.FC<{
  search?: string;
  onSearch?: (v: string) => void;
  placeholder?: string;
  right?: React.ReactNode;
}> = ({ search = "", onSearch, placeholder = "검색...", right }) => (
  <div className="px-4 sm:px-6 pt-3 flex flex-wrap items-center gap-2">
    {onSearch && (
      <div className="relative flex-1 min-w-[240px] max-w-[460px]">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          aria-label="검색"
          className="w-full h-10 pl-10 pr-3 text-[14px] bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition-colors placeholder:text-slate-400"
        />
      </div>
    )}
    {right}
  </div>
);

// ─── Page header (compact · title + description + actions) ──
export const OverviewPageHeader: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ title, description, actions }) => (
  <header className="px-4 sm:px-6 pt-4 pb-3 border-b border-slate-200 bg-white flex items-start justify-between gap-3">
    <div className="min-w-0 flex-1">
      <h1 className="text-[22px] sm:text-[24px] font-bold text-ink tracking-tight leading-tight break-words">{title}</h1>
      {description != null && (
        <p className="text-[13px] sm:text-[14px] text-ink-soft mt-1 leading-snug break-words">{description}</p>
      )}
    </div>
    {actions != null && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
  </header>
);

// ─── KPI (compact · icon tile + label + value + hint · value 26-30) ──
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
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 flex items-start gap-3 min-h-[96px]">
      {icon != null && (
        <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${toneBg}`}>
          {icon}
        </span>
      )}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="text-[13px] font-semibold text-ink-soft truncate">{label}</div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[26px] sm:text-[28px] font-extrabold text-ink tabular-nums leading-tight tracking-[-0.02em]">
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

// ─── Section (flat panel) ──
export const OverviewSection: React.FC<{
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, action, children, className = "" }) => (
  <section className={`bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 min-h-0 ${className}`}>
    <header className="flex items-center justify-between gap-2 shrink-0">
      <h3 className="text-[16px] font-semibold text-ink tracking-tight">{title}</h3>
      {action && <div className="shrink-0">{action}</div>}
    </header>
    <div className="flex-1 min-h-0">{children}</div>
  </section>
);

// ─── Task / summary row ──
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
      className="w-full flex items-center gap-3 px-3 min-h-[44px] rounded-md text-left transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-default cursor-pointer"
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

// ─── Status badge · pastel semantic ──
export const StoreStatusBadge: React.FC<{
  status: string;
  tone?: "neutral" | "brand" | "emerald" | "amber" | "rose" | "violet";
}> = ({ status, tone = "neutral" }) => {
  const toneBg = {
    neutral: "bg-slate-100 text-slate-700 border-slate-200",
    brand:   "bg-brand-tint/60 text-brand-deep border-brand-deep/15",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber:   "bg-amber-50 text-amber-700 border-amber-200",
    rose:    "bg-rose-50 text-rose-700 border-rose-200",
    violet:  "bg-violet-50 text-violet-700 border-violet-200",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[12px] font-semibold ${toneBg}`}>
      {status}
    </span>
  );
};

// ─── Compact dense table ──
export interface OverviewTableColumn {
  key: string;
  label: React.ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
}
export type OverviewTableRow = Record<string, any> & { __onClick?: () => void };
export const OverviewTable: React.FC<{
  columns: OverviewTableColumn[];
  rows: OverviewTableRow[];
  emptyMessage?: React.ReactNode;
}> = ({ columns, rows, emptyMessage = "데이터가 없습니다" }) => (
  <div className="w-full overflow-x-auto">
    {/* 2026-10-09 · 사용자 지시 · 전체 밸런싱 · padding compact (py-2.5/py-3 → py-1.5) · font 13 */}
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50/60">
          {columns.map(col => (
            <th
              key={col.key}
              className={`py-1.5 px-2.5 text-[12px] font-semibold text-ink-soft ${
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
          rows.map((row, i) => {
            const click = row.__onClick;
            return (
              <tr
                key={i}
                onClick={click}
                className={`border-b border-slate-100 ${click ? "hover:bg-slate-50/70 cursor-pointer" : ""}`}
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    className={`py-1.5 px-2.5 text-ink ${
                      col.align === "right" ? "text-right tabular-nums" : col.align === "center" ? "text-center" : ""
                    } ${col.className ?? ""}`}
                  >
                    {row[col.key] ?? "-"}
                  </td>
                ))}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  </div>
);
