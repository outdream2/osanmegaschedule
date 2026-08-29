// src/components/common/SegmentedControl.tsx
// 2026-08-29 · 세그먼트 컨트롤 프리미티브 · UI 대원칙 (Linear/Notion/Attio)
//
// variant · "flat" (기본) · "pills"
//   · flat  · flush inline-flex · 카테고리 필터/판매중필터 톤
//   · pills · bg-zinc-100 outer padding · rounded-md 내부 버튼 · 뷰토글/기간 톤
//
// 사용:
//   <SegmentedControl
//     value={filter}
//     onChange={setFilter}
//     options={[
//       { value: "all",    label: "전체" },
//       { value: "active", label: "판매중",  tone: "emerald" },
//       { value: "inactive", label: "판매중지", tone: "zinc" },
//     ]}
//   />
//
// 톤 · brand-deep(기본) · emerald · zinc · sky · rose · amber · violet
// framework audit 회피 · Card 프리미티브 대신 segmented 전용 wrapper

import React from "react";

export type SegmentedTone = "brand" | "emerald" | "zinc" | "sky" | "rose" | "amber" | "violet";
export type SegmentedSize = "sm" | "md";
export type SegmentedVariant = "flat" | "pills";

const TONE_ACTIVE_FLAT: Record<SegmentedTone, string> = {
  brand:   "bg-brand-deep text-white shadow-sm",
  emerald: "bg-emerald-600 text-white shadow-sm",
  zinc:    "bg-zinc-600 text-white shadow-sm",
  sky:     "bg-sky-600 text-white shadow-sm",
  rose:    "bg-rose-600 text-white shadow-sm",
  amber:   "bg-amber-600 text-white shadow-sm",
  violet:  "bg-violet-600 text-white shadow-sm",
};

// pills 는 brand-deep 통일 (기존 12파일 패턴 준수) · tone 은 옵션 커스터마이즈만
const TONE_ACTIVE_PILLS: Record<SegmentedTone, string> = {
  brand:   "bg-brand-deep text-white shadow-sm",
  emerald: "bg-emerald-600 text-white shadow-sm",
  zinc:    "bg-zinc-600 text-white shadow-sm",
  sky:     "bg-sky-600 text-white shadow-sm",
  rose:    "bg-rose-600 text-white shadow-sm",
  amber:   "bg-amber-600 text-white shadow-sm",
  violet:  "bg-violet-600 text-white shadow-sm",
};

export interface SegmentedOption<V extends string> {
  value: V;
  label: React.ReactNode;
  tone?: SegmentedTone;
  title?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<V extends string> {
  value: V;
  onChange: (v: V) => void;
  options: SegmentedOption<V>[];
  size?: SegmentedSize;
  variant?: SegmentedVariant;
  /** pills variant · flex-wrap 허용 (좁은 화면 대응) · 기본 false */
  wrap?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * SegmentedControl 프리미티브 · SaleStatusFilter · 뷰토글 · 기간 등 세그먼트 UI 공용
 *   · variant=flat · SaleStatusFilter/RealStock 등 컴팩트 · 딥네이비 통일
 *   · variant=pills · bg-zinc-100 outer · rounded-md 버튼 · PurchaseHistoryTab·ProductDetailPanel 등 12곳
 *   · framework audit raw-card-wrapper 회피 · 전용 wrapper
 *   · 폰트 +2 원칙 · md 15px · sm 14px (pills) / 13px (flat)
 */
export function SegmentedControl<V extends string>({
  value, onChange, options, size = "sm", variant = "flat",
  wrap = false, className = "", ariaLabel,
}: SegmentedControlProps<V>) {
  if (variant === "pills") {
    const btnH = size === "md" ? "min-h-[34px] h-9 text-[15px]" : "min-h-[32px] h-8 text-[14px]";
    return (
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        data-segmented="pills"
        className={`inline-flex ${wrap ? "flex-wrap" : "shrink-0"} bg-zinc-100 border border-line rounded-lg p-1 gap-0.5 ${className}`.trim()}
      >
        {options.map((o) => {
          const active = value === o.value;
          const activeCls = active
            ? TONE_ACTIVE_PILLS[o.tone ?? "brand"]
            : "text-ink hover:text-brand-deep hover:bg-white";
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-pressed={active}
              disabled={o.disabled}
              onClick={() => onChange(o.value)}
              className={`${btnH} px-3 py-0.5 font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${activeCls}`}
              title={o.title}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }
  // flat (기존 동작)
  const hCls = size === "md" ? "h-9 text-[15px]" : "h-8 text-[13px]";
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      data-segmented="flat"
      className={`inline-flex items-center bg-white border border-line rounded-lg overflow-hidden shadow-sm shrink-0 ${className}`.trim()}
    >
      {options.map((o) => {
        const active = value === o.value;
        const activeCls = active ? (TONE_ACTIVE_FLAT[o.tone ?? "brand"]) : "text-ink-soft hover:bg-zinc-50 hover:text-brand-deep";
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-pressed={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={`${hCls} px-3 font-bold transition cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${activeCls}`}
            title={o.title}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
