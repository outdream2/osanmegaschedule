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

// 2026-08-17 · 사용자 지시 · 랜딩 메뉴 · 최신 트렌드 · mono neutral 통일
//   · 모든 색상 preset · brand-tint bg + brand-deep icon + brand-deep hover border
//   · category identity · 아이콘 자체로 표현 (Phosphor duotone) · 색 통일
//   · Linear/Vercel 2026 톤 · 파스텔 다색 지양 · 딥네이비 accent
const COLOR_MAP: Record<MenuCardColor, ColorTokens> = {
  teal:     { iconBg: "bg-brand-tint", iconColor: "text-brand-deep", hoverBorder: "hover:border-brand-deep" },
  amber:    { iconBg: "bg-brand-tint", iconColor: "text-brand-deep", hoverBorder: "hover:border-brand-deep" },
  coral:    { iconBg: "bg-brand-tint", iconColor: "text-brand-deep", hoverBorder: "hover:border-brand-deep" },
  sky:      { iconBg: "bg-brand-tint", iconColor: "text-brand-deep", hoverBorder: "hover:border-brand-deep" },
  emerald:  { iconBg: "bg-brand-tint", iconColor: "text-brand-deep", hoverBorder: "hover:border-brand-deep" },
  indigo:   { iconBg: "bg-brand-tint", iconColor: "text-brand-deep", hoverBorder: "hover:border-brand-deep" },
  violet:   { iconBg: "bg-brand-tint", iconColor: "text-brand-deep", hoverBorder: "hover:border-brand-deep" },
  fuchsia:  { iconBg: "bg-brand-tint", iconColor: "text-brand-deep", hoverBorder: "hover:border-brand-deep" },
  rose:     { iconBg: "bg-brand-tint", iconColor: "text-brand-deep", hoverBorder: "hover:border-brand-deep" },
  red:      { iconBg: "bg-brand-tint", iconColor: "text-brand-deep", hoverBorder: "hover:border-brand-deep" },
  orange:   { iconBg: "bg-brand-tint", iconColor: "text-brand-deep", hoverBorder: "hover:border-brand-deep" },
  zinc:     { iconBg: "bg-brand-tint", iconColor: "text-brand-deep", hoverBorder: "hover:border-brand-deep" },
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
  // 2026-08-17 · 사용자 지시 · 반응형 랜딩 메뉴 폰트 +2 (기존 15 → 17)
  const descSize = descClass ?? "text-[17px] leading-[1.5]";
  return (
    <button
      data-menu-card
      onClick={onClick}
      className={`${orderClass ?? ""} group relative bg-white border border-line ${c.hoverBorder} rounded-[16px] p-[20px] text-left transition-colors duration-150 hover:-translate-y-0.5 cursor-pointer overflow-hidden flex flex-col gap-3 shadow-sm hover:shadow-lg`}
    >
      {/* top · 아이콘 (좌측) + badge (우측) · 2026-08-17 · 최신 트렌드 · 44 icon tint · rounded-12 */}
      <div className="flex items-start justify-between">
        <div className={`w-[44px] h-[44px] rounded-[12px] flex items-center justify-center ${c.iconBg}`}>
          <Icon size={20} className={c.iconColor} weight="fill" />
        </div>
        {badge}
      </div>
      {/* 제목 · 2026-08-17 · 반응형 랜딩 +2 (사용자 지시) · 19px bold */}
      <div className="text-[19px] font-bold text-ink tracking-[-0.2px] leading-tight">
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
