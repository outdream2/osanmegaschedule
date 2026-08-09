// src/components/common/PeriodSelector.tsx
// 2026-08-09 · 기간 선택 UI · 공용 컴포넌트
// 사용처: 결제/공급사 관리 · VAT · 재고관리 · 매입이력 등 · 기간 필터가 필요한 모든 페이지
//
// 사용 예:
//   const [months, setMonths] = useState(3);
//   <PeriodSelector options={PERIOD_MONTHS_PRESET} value={months} onChange={setMonths} accent="teal" />

import type { CSSProperties } from "react";

export interface PeriodOption<T extends number | string> {
  value: T;
  label: string;
  title?: string;
}

export interface PeriodSelectorProps<T extends number | string> {
  options: readonly PeriodOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** 색상 테마 · default teal */
  accent?: "teal" | "indigo" | "emerald" | "amber" | "rose" | "sky" | "violet";
  /** sm(작음 · default) or md */
  size?: "sm" | "md";
  className?: string;
  style?: CSSProperties;
  /** 접근성 label */
  ariaLabel?: string;
}

const ACCENT_CLS: Record<NonNullable<PeriodSelectorProps<never>["accent"]>, string> = {
  teal:    "bg-teal-500 text-white shadow-sm",
  indigo:  "bg-indigo-500 text-white shadow-sm",
  emerald: "bg-emerald-500 text-white shadow-sm",
  amber:   "bg-amber-500 text-white shadow-sm",
  rose:    "bg-rose-500 text-white shadow-sm",
  sky:     "bg-sky-500 text-white shadow-sm",
  violet:  "bg-violet-500 text-white shadow-sm",
};

const SIZE_CLS = {
  sm: { wrap: "p-0.5", btn: "h-5 px-1.5 text-[10px]" },
  md: { wrap: "p-1",   btn: "h-7 px-2.5 text-[12px]" },
};

export function PeriodSelector<T extends number | string>({
  options,
  value,
  onChange,
  accent = "teal",
  size = "sm",
  className = "",
  style,
  ariaLabel = "기간 선택",
}: PeriodSelectorProps<T>) {
  const s = SIZE_CLS[size];
  const activeCls = ACCENT_CLS[accent];
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-0.5 bg-slate-100 rounded-md ${s.wrap} ${className}`}
      style={style}
    >
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            title={opt.title}
            className={`${s.btn} rounded font-black transition cursor-pointer whitespace-nowrap ${
              active
                ? activeCls
                : "text-slate-500 hover:text-slate-700 hover:bg-white"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Preset · 자주 쓰는 옵션 세트
// ─────────────────────────────────────────────────────────────

/** 월 단위 · 1/3/6/12개월 (공급사 관리 · 매입 aggregate 등) */
export const PERIOD_MONTHS_PRESET: readonly PeriodOption<number>[] = [
  { value: 1,  label: "1개월",  title: "최근 1개월" },
  { value: 3,  label: "3개월",  title: "최근 3개월" },
  { value: 6,  label: "6개월",  title: "최근 6개월" },
  { value: 12, label: "1년",    title: "최근 1년" },
] as const;

/** 일 단위 · 10일/1개월/2개월/3개월 (결제 리스트 · 매입 aggregate 등) */
export const PERIOD_DAYS_PRESET: readonly PeriodOption<number>[] = [
  { value: 10, label: "10일",  title: "최근 10일" },
  { value: 30, label: "1개월", title: "최근 30일" },
  { value: 60, label: "2개월", title: "최근 60일" },
  { value: 90, label: "3개월", title: "최근 90일" },
] as const;

/** 확장 · 1개월/3개월/6개월/1년/전체 */
export const PERIOD_MONTHS_EXT_PRESET: readonly PeriodOption<number>[] = [
  { value: 1,   label: "1개월", title: "최근 1개월" },
  { value: 3,   label: "3개월", title: "최근 3개월" },
  { value: 6,   label: "6개월", title: "최근 6개월" },
  { value: 12,  label: "1년",   title: "최근 1년" },
  { value: 999, label: "전체", title: "전체 기간" },
] as const;

export default PeriodSelector;
