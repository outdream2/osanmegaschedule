// src/components/DisplayPage/overviews/StoreOverviewPrimitives.tsx
// 2026-10-08 · GLOBAL UI · 매장 5개 통합 overview 공통 presentation primitives
//   · 신규 business logic 없음 · pure presentation
//   · 공통 KPI/Section/Quick action/Task row visual primitives
//   · 기존 common primitives (Card · Button · KpiCard) 조합용 helper

import React from "react";

// ─── 섹션 wrapper (overview 공통 flat panel · heavy card wrapper 금지) ──
export const OverviewSection: React.FC<{
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, action, children, className = "" }) => (
  <section className={`bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 min-h-0 ${className}`}>
    <header className="flex items-center justify-between gap-2 shrink-0">
      <h3 className="text-[14px] font-semibold text-ink tracking-tight">{title}</h3>
      {action && <div className="shrink-0">{action}</div>}
    </header>
    <div className="flex-1 min-h-0">{children}</div>
  </section>
);

// ─── 작은 KPI (overview 공통 · KpiCard 보다 compact) ──
export const OverviewKpi: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: string;
  hint?: React.ReactNode;
  tone?: "neutral" | "brand" | "emerald" | "amber" | "rose";
}> = ({ label, value, unit, hint, tone = "neutral" }) => {
  const toneBg = {
    neutral: "bg-slate-100 text-slate-600",
    brand:   "bg-brand-tint/60 text-brand-deep",
    emerald: "bg-emerald-50 text-emerald-700",
    amber:   "bg-amber-50 text-amber-700",
    rose:    "bg-rose-50 text-rose-700",
  }[tone];
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center justify-center h-6 min-w-[24px] px-1.5 rounded-md text-[11px] font-semibold ${toneBg}`}>
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[24px] font-extrabold text-ink tabular-nums leading-tight tracking-[-0.02em]">
          {value}
        </span>
        {unit && <span className="text-[13px] font-semibold text-ink-soft">{unit}</span>}
      </div>
      {hint != null && (
        <div className="text-[12px] font-medium text-ink-soft">{hint}</div>
      )}
    </div>
  );
};

// ─── Task / summary row (click → 기존 L2 route · 신규 modal 금지) ──
export const OverviewTaskRow: React.FC<{
  icon?: React.ReactNode;
  label: React.ReactNode;
  description?: React.ReactNode;
  count?: React.ReactNode;
  tone?: "neutral" | "brand" | "amber" | "rose" | "emerald";
  onClick?: () => void;
  disabled?: boolean;
}> = ({ icon, label, description, count, tone = "neutral", onClick, disabled }) => {
  const countTone = {
    neutral: "text-ink-soft",
    brand:   "text-brand-deep",
    amber:   "text-amber-700",
    rose:    "text-rose-600",
    emerald: "text-emerald-700",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className="w-full flex items-center gap-3 px-3 h-10 rounded-lg text-left transition-colors hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-default cursor-pointer"
    >
      {icon && <span className="shrink-0 text-ink-soft">{icon}</span>}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-ink truncate">{label}</div>
        {description && <div className="text-[11px] font-medium text-ink-soft truncate">{description}</div>}
      </div>
      {count != null && (
        <span className={`text-[13px] font-bold tabular-nums shrink-0 ${countTone}`}>{count}</span>
      )}
    </button>
  );
};

// ─── Quick action tile (overview 공통) ──
export const OverviewQuickAction: React.FC<{
  icon: React.ReactNode;
  label: React.ReactNode;
  description?: React.ReactNode;
  onClick?: () => void;
}> = ({ icon, label, description, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 h-16 transition-colors hover:bg-zinc-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-default cursor-pointer text-left"
  >
    <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-tint/60 text-brand-deep shrink-0">
      {icon}
    </span>
    <div className="flex-1 min-w-0">
      <div className="text-[13px] font-semibold text-ink truncate">{label}</div>
      {description && <div className="text-[11px] font-medium text-ink-soft truncate">{description}</div>}
    </div>
  </button>
);

// ─── Empty hint (데이터 없을 때 widget 생략 대신 compact placeholder) ──
export const OverviewEmpty: React.FC<{
  message?: React.ReactNode;
}> = ({ message = "데이터가 없습니다" }) => (
  <div className="flex items-center justify-center py-6 text-[12px] text-ink-soft/70">
    {message}
  </div>
);
