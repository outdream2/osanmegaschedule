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
  /** icon 배경 tint (soft · 카테고리 identity) */
  iconBg: string;
  /** icon 색상 (mid saturation · 톤 유지) */
  iconColor: string;
  /** hover 시 카드 border accent */
  hoverBorder: string;
  /** top gradient bar · 카드 상단 1px hairline (색 accent · Linear/Vercel 대시보드 규칙) */
  topAccent: string;
}

// 2026-08-17 · 세련 · 카테고리 identity 색 도입 (아이콘 tint + 상단 gradient bar)
//   · 카드 body 는 mono neutral (white + border-line) 유지
//   · 아이콘 배경/색 · 상단 1px hairline gradient 에만 category 색 사용 (Vercel Dashboard 규칙)
//   · Linear/Vercel 2026 · "단일 accent + category identity" 조화
const COLOR_MAP: Record<MenuCardColor, ColorTokens> = {
  teal:     { iconBg: "bg-teal-50",    iconColor: "text-teal-600",    hoverBorder: "hover:border-teal-300",    topAccent: "from-teal-400 to-transparent" },
  amber:    { iconBg: "bg-amber-50",   iconColor: "text-amber-600",   hoverBorder: "hover:border-amber-300",   topAccent: "from-amber-400 to-transparent" },
  coral:    { iconBg: "bg-rose-50",    iconColor: "text-rose-600",    hoverBorder: "hover:border-rose-300",    topAccent: "from-rose-400 to-transparent" },
  sky:      { iconBg: "bg-sky-50",     iconColor: "text-sky-600",     hoverBorder: "hover:border-sky-300",     topAccent: "from-sky-400 to-transparent" },
  emerald:  { iconBg: "bg-emerald-50", iconColor: "text-emerald-600", hoverBorder: "hover:border-emerald-300", topAccent: "from-emerald-400 to-transparent" },
  indigo:   { iconBg: "bg-indigo-50",  iconColor: "text-indigo-600",  hoverBorder: "hover:border-indigo-300",  topAccent: "from-indigo-400 to-transparent" },
  violet:   { iconBg: "bg-violet-50",  iconColor: "text-violet-600",  hoverBorder: "hover:border-violet-300",  topAccent: "from-violet-400 to-transparent" },
  fuchsia:  { iconBg: "bg-fuchsia-50", iconColor: "text-fuchsia-600", hoverBorder: "hover:border-fuchsia-300", topAccent: "from-fuchsia-400 to-transparent" },
  rose:     { iconBg: "bg-rose-50",    iconColor: "text-rose-600",    hoverBorder: "hover:border-rose-300",    topAccent: "from-rose-400 to-transparent" },
  red:      { iconBg: "bg-red-50",     iconColor: "text-red-600",     hoverBorder: "hover:border-red-300",     topAccent: "from-red-400 to-transparent" },
  orange:   { iconBg: "bg-orange-50",  iconColor: "text-orange-600",  hoverBorder: "hover:border-orange-300",  topAccent: "from-orange-400 to-transparent" },
  zinc:     { iconBg: "bg-zinc-100",   iconColor: "text-zinc-700",    hoverBorder: "hover:border-zinc-300",    topAccent: "from-zinc-400 to-transparent" },
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
  // 2026-08-17 · 사용자 지시 · 반응형 랜딩 메뉴 폰트 +2 (기존 15 → 17) · 2026-08-23 · #200 +2 (17 → 19)
  const descSize = descClass ?? "text-[19px] leading-[1.5]";
  return (
    <button
      data-menu-card
      onClick={onClick}
      className={`${orderClass ?? ""} group relative bg-white border border-line ${c.hoverBorder} rounded-[16px] p-[20px] text-left transition-all duration-200 hover:-translate-y-1 cursor-pointer overflow-hidden flex flex-col gap-3 shadow-[0_1px_2px_rgba(10,46,74,0.04),0_2px_8px_rgba(10,46,74,0.04)] hover:shadow-[0_2px_4px_rgba(10,46,74,0.06),0_12px_28px_rgba(10,46,74,0.12)]`}
    >
      {/* 상단 1px hairline gradient · 카테고리 identity accent · Linear/Vercel 규칙 · hover 시 진해짐 */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${c.topAccent} opacity-70 group-hover:opacity-100 transition-opacity`} />

      {/* top · 아이콘 (좌측) + badge (우측) · category tint icon */}
      <div className="flex items-start justify-between">
        <div className={`w-[44px] h-[44px] rounded-[12px] flex items-center justify-center ${c.iconBg} transition-transform group-hover:scale-105`}>
          <Icon size={20} className={c.iconColor} weight="fill" />
        </div>
        {badge}
      </div>
      {/* 제목 · 2026-08-17 · 반응형 랜딩 +2 (사용자 지시) · 19px bold · 2026-08-23 · #200 +2 (19 → 21) */}
      <div className="text-[21px] font-bold text-ink tracking-[-0.2px] leading-tight">
        {title}
      </div>
      {/* 설명 · 2026-08-17 · +2 폰트 (15px) */}
      <div className={`text-ink-soft ${descSize}`}>
        {description}
      </div>
      {/* stat chips · 하단 */}
      {statChips && statChips.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {statChips.map((chip, i) => (
            <div
              key={i}
              className={`inline-flex items-center gap-1.5 text-[13px] font-bold px-[9px] py-[3px] pl-[7px] rounded-full ${CHIP_TONE[chip.tone ?? "zinc"]}`}
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
