// src/components/common/CategoryChips.tsx
// 2026-08-17 · 공용 프레임워크 · 카테고리 chip 그룹
//   · Vercel/Attio · segmented pill · 딥네이비 active + status dot per category
//   · category identity = dot 색 (≤10px · Vercel 규칙) · 파스텔 배경 지양
//   · 사용처: 발주필요 분류 · 결제 카테고리 · 이슈 카테고리 등
//
// 사용 예:
//   <CategoryChips
//     label="분류"
//     value={category}
//     onChange={setCategory}
//     options={[
//       { value: "all",    label: "전체" },
//       { value: "위탁",   label: "위탁",   tone: "violet" },
//       { value: "선결제", label: "선결제", tone: "rose" },
//       { value: "60회전", label: "60회전", tone: "emerald" },
//       { value: "90회전", label: "90회전", tone: "teal" },
//     ]}
//   />

import type { ReactNode } from "react";

export type ChipTone = "sky" | "emerald" | "amber" | "rose" | "violet" | "teal" | "indigo" | "zinc" | "brand" | "pine";

const DOT_MAP: Record<ChipTone, string> = {
  sky:     "bg-sky-500",
  emerald: "bg-emerald-500",
  amber:   "bg-amber-500",
  rose:    "bg-rose-500",
  violet:  "bg-violet-500",
  teal:    "bg-teal-500",
  indigo:  "bg-indigo-500",
  zinc:    "bg-zinc-400",
  brand:   "bg-brand-deep",
  // 2026-08-17 · Pine Green (Hermès · 청록톤 · 사용자 확정)
  pine:    "bg-[#01796F]",
};

export interface ChipOption<V extends string | number = string> {
  value: V;
  label: ReactNode;
  /** 카테고리 identity dot 색 · 미지정 시 zinc */
  tone?: ChipTone;
  /** 옵션별 tooltip */
  title?: string;
  /** 우측 배지 (건수 등) · 미지정 시 미표시 */
  badge?: ReactNode;
}

export interface CategoryChipsProps<V extends string | number = string> {
  /** 좌측 라벨 (예: "분류") · 없으면 accent bar 만 · 미지정 시 라벨 자체 미표시 */
  label?: ReactNode;
  /** 라벨 앞 accent bar 표시 여부 (기본 true) · label 있을 때만 유효 */
  showAccentBar?: boolean;
  /** 옵션 목록 */
  options: readonly ChipOption<V>[];
  /** 현재 선택 값 */
  value: V;
  /** 선택 변경 */
  onChange: (v: V) => void;
  /** 사이즈 · sm (h-8) or md (h-9) · 기본 md */
  size?: "sm" | "md";
  /** ARIA label */
  ariaLabel?: string;
  className?: string;
}

/**
 * 공용 카테고리 chip 그룹
 *   · segmented pill · 딥네이비 active
 *   · 각 chip 좌측 · status dot (category identity)
 *   · 활성 시 · bg-brand-deep + white text
 *   · 비활성 시 · text-ink + dot opacity-70 hover:bg-white
 */
export function CategoryChips<V extends string | number = string>({
  label,
  showAccentBar = true,
  options,
  value,
  onChange,
  size = "md",
  ariaLabel = "카테고리",
  className = "",
}: CategoryChipsProps<V>) {
  // 2026-08-17 · 사용자 지시 · 폰트 +2 · sm 12→14 · md 13→15
  const sizeCls = size === "sm" ? "h-9 px-3 text-[14px]" : "h-10 px-3.5 text-[15px]";

  return (
    <div className={`inline-flex items-center gap-2 flex-wrap ${className}`}>
      {label != null && (
        <span className="flex items-center gap-1.5 shrink-0">
          {showAccentBar && (
            <span className="w-[3px] h-[16px] rounded-full bg-brand-deep" />
          )}
          <span className="text-[15px] font-bold text-ink tracking-tight">{label}</span>
        </span>
      )}
      <div
        role="group"
        aria-label={ariaLabel}
        className="inline-flex items-center rounded-lg border border-line bg-zinc-100 p-1 gap-0.5 flex-wrap"
      >
        {options.map((opt) => {
          const active = opt.value === value;
          const dotCls = DOT_MAP[opt.tone ?? "zinc"];
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => onChange(opt.value)}
              title={opt.title}
              className={`inline-flex items-center gap-1.5 ${sizeCls} rounded-md font-semibold leading-none transition-all duration-200 ease-out cursor-pointer whitespace-nowrap ${
                active
                  ? "bg-brand-deep text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_1px_2px_rgba(10,46,74,0.15),0_2px_6px_-2px_rgba(10,46,74,0.30)]"
                  : "text-ink hover:text-brand-deep hover:bg-white"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${dotCls} ${active ? "" : "opacity-70"}`}
              />
              {opt.label}
              {opt.badge != null && <span className="ml-1">{opt.badge}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default CategoryChips;
