// 2026-08-17 · UI 프레임워크 · Landing 카드 · 사용자 제공 mockup 적용
//   · 아이콘 · 좌상단 색상 tint 박스 (38x38 · rounded-11)
//   · 제목 · 아이콘 아래
//   · 설명 · 제목 아래
//   · optional stat chips · 하단
//   · brand palette: teal(#0E6B5C) · amber(#E88A3D) · coral(#D9584F) · sky(#3E7CB1)
//   · surface: white · border #E3E9E7 · shadow soft · radius 14
import type { ReactNode, ElementType } from "react";

export type MenuCardColor =
  | "teal" | "amber" | "coral" | "sky"
  | "emerald" | "indigo" | "violet" | "fuchsia" | "rose" | "red" | "orange" | "zinc";

interface ColorTokens {
  /** icon 배경 tint */
  iconBg: string;
  /** icon 색상 */
  iconColor: string;
  /** hover 시 카드 border accent */
  hoverBorder: string;
}

// · 2026-08-17 · Tailwind @theme brand 유틸리티 사용 (bg-brand-tint 등 · index.css @theme 참조)
const COLOR_MAP: Record<MenuCardColor, ColorTokens> = {
  teal:     { iconBg: "bg-brand-tint",       iconColor: "text-brand",           hoverBorder: "hover:border-brand" },
  amber:    { iconBg: "bg-brand-amber-tint", iconColor: "text-brand-amber-ink", hoverBorder: "hover:border-brand-amber" },
  coral:    { iconBg: "bg-brand-coral-tint", iconColor: "text-brand-coral",     hoverBorder: "hover:border-brand-coral" },
  sky:      { iconBg: "bg-brand-sky-tint",   iconColor: "text-brand-sky",       hoverBorder: "hover:border-brand-sky" },
  emerald:  { iconBg: "bg-emerald-50",  iconColor: "text-emerald-700", hoverBorder: "hover:border-emerald-500" },
  indigo:   { iconBg: "bg-indigo-50",   iconColor: "text-indigo-700",  hoverBorder: "hover:border-indigo-500" },
  violet:   { iconBg: "bg-violet-50",   iconColor: "text-violet-700",  hoverBorder: "hover:border-violet-500" },
  fuchsia:  { iconBg: "bg-fuchsia-50",  iconColor: "text-fuchsia-700", hoverBorder: "hover:border-fuchsia-500" },
  rose:     { iconBg: "bg-rose-50",     iconColor: "text-rose-700",    hoverBorder: "hover:border-rose-500" },
  red:      { iconBg: "bg-red-50",      iconColor: "text-red-700",     hoverBorder: "hover:border-red-500" },
  orange:   { iconBg: "bg-orange-50",   iconColor: "text-orange-700",  hoverBorder: "hover:border-orange-500" },
  zinc:     { iconBg: "bg-zinc-100",    iconColor: "text-zinc-700",    hoverBorder: "hover:border-zinc-400" },
};

/** stat chip · Landing 카드 하단 · 카운터 등 */
export interface MenuCardStatChip {
  label: string;
  value: number | string;
  tone?: "blue" | "coral" | "amber" | "green" | "zinc";
}

const CHIP_TONE: Record<NonNullable<MenuCardStatChip["tone"]>, string> = {
  blue:  "bg-brand-sky-tint text-brand-sky",
  coral: "bg-brand-coral-tint text-brand-coral",
  amber: "bg-brand-amber-tint text-brand-amber-ink",
  green: "bg-brand-tint text-brand",
  zinc:  "bg-zinc-100 text-zinc-600",
};

interface MenuCardProps {
  color: MenuCardColor;
  icon: ElementType;
  title: string;
  description: string;
  onClick: () => void;
  /** grid 순서 (order-N) */
  orderClass?: string;
  /** 우측 상단 절대배치 배지 (pending count 등) */
  badge?: ReactNode;
  /** 설명 폰트 크기 override · default: text-[13px] leading-[1.5] */
  descClass?: string;
  /** 하단 stat chips · 옵션 (진열·발주 카운터 등) */
  statChips?: MenuCardStatChip[];
}

export function MenuCard({ color, icon: Icon, title, description, onClick, orderClass, badge, descClass, statChips }: MenuCardProps) {
  const c = COLOR_MAP[color];
  const descSize = descClass ?? "text-[13px] leading-[1.5]";
  return (
    <button
      data-menu-card
      onClick={onClick}
      className={`${orderClass ?? ""} group relative bg-white border border-line ${c.hoverBorder} rounded-[14px] p-[18px] text-left transition-all duration-150 hover:-translate-y-0.5 cursor-pointer overflow-hidden flex flex-col gap-2.5 shadow-sm hover:shadow-md`}
    >
      {/* top · 아이콘 (좌측) + badge (우측) */}
      <div className="flex items-start justify-between">
        <div className={`w-[38px] h-[38px] rounded-[11px] flex items-center justify-center ${c.iconBg}`}>
          <Icon size={16} className={c.iconColor} weight="fill" />
        </div>
        {badge}
      </div>
      {/* 제목 */}
      <div className="text-[14.5px] font-bold text-ink tracking-[-0.1px] leading-tight">
        {title}
      </div>
      {/* 설명 */}
      <div className={`text-ink-soft ${descSize}`}>
        {description}
      </div>
      {/* stat chips · 하단 */}
      {statChips && statChips.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {statChips.map((chip, i) => (
            <div
              key={i}
              className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-[9px] py-[3px] pl-[7px] rounded-full ${CHIP_TONE[chip.tone ?? "zinc"]}`}
            >
              <span className="tabular-nums">{chip.value}</span>
              {chip.label}
            </div>
          ))}
        </div>
      )}
    </button>
  );
}
