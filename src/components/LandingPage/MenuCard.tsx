// 2026-08-16 · Landing 공용 메뉴 카드 · 랜딩 12+ 카드 DRY 통합
// · 색상 · 아이콘 · 제목 · 설명 · onClick 만 넘기면 됨
// · badge 옵션 · 우측 상단 절대배치 (hasBadge=true 면 icon 컨테이너 mt-5 sm:mt-6 로 겹침 방지)
// · Tailwind JIT 안전 · 색상 클래스는 static map 으로 lookup
import type { ReactNode, ElementType } from "react";

export type MenuCardColor = "red" | "violet" | "indigo" | "orange" | "zinc" | "sky" | "amber" | "emerald" | "fuchsia" | "rose";

interface ColorTokens {
  hoverBorder: string;
  hoverBg: string;
  iconText: string;
}

// · 각 색상별 Tailwind 클래스 · JIT 가 정확한 문자열을 인식하도록 static
const COLOR_MAP: Record<MenuCardColor, ColorTokens> = {
  red:      { hoverBorder: "hover:border-red-300",     hoverBg: "bg-red-50/70",     iconText: "text-red-600" },
  violet:   { hoverBorder: "hover:border-violet-300",  hoverBg: "bg-violet-50/70",  iconText: "text-violet-600" },
  indigo:   { hoverBorder: "hover:border-indigo-300",  hoverBg: "bg-indigo-50/70",  iconText: "text-indigo-600" },
  orange:   { hoverBorder: "hover:border-orange-300",  hoverBg: "bg-orange-50/70",  iconText: "text-orange-500" },
  zinc:     { hoverBorder: "hover:border-zinc-400",    hoverBg: "bg-zinc-100/70",   iconText: "text-zinc-600" },
  sky:      { hoverBorder: "hover:border-sky-300",     hoverBg: "bg-sky-100/70",    iconText: "text-sky-600" },
  amber:    { hoverBorder: "hover:border-amber-300",   hoverBg: "bg-amber-50/70",   iconText: "text-amber-600" },
  emerald:  { hoverBorder: "hover:border-emerald-300", hoverBg: "bg-emerald-50/70", iconText: "text-emerald-600" },
  fuchsia:  { hoverBorder: "hover:border-fuchsia-300", hoverBg: "bg-fuchsia-50/70", iconText: "text-fuchsia-600" },
  rose:     { hoverBorder: "hover:border-rose-300",    hoverBg: "bg-rose-50/70",    iconText: "text-rose-600" },
};

interface MenuCardProps {
  color: MenuCardColor;
  icon: ElementType;
  title: string;
  description: string;
  onClick: () => void;
  /** order-N 등 grid 순서 클래스 · 필요 시 */
  orderClass?: string;
  /** 우측 상단 절대배치 배지 · 있으면 icon 위 mt-5 sm:mt-6 로 밀어냄 */
  badge?: ReactNode;
  /** 설명 텍스트 크기 override · default: text-[11px] sm:text-[13px] */
  descClass?: string;
}

export function MenuCard({ color, icon: Icon, title, description, onClick, orderClass, badge, descClass }: MenuCardProps) {
  const c = COLOR_MAP[color];
  const iconMt = badge ? " mt-5 sm:mt-6" : "";
  const descSize = descClass ?? "text-[11px] sm:text-[13px] leading-tight sm:leading-relaxed";
  return (
    <button
      data-menu-card
      onClick={onClick}
      className={`${orderClass ?? ""} group relative bg-white border border-zinc-200/80 ${c.hoverBorder} rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm`}
    >
      <div className={`absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${c.hoverBg}`} />
      {badge}
      <div className="relative">
        <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center mb-3 sm:mb-4 transition-all duration-200 group-hover:scale-105${iconMt}`}>
          <Icon size={24} className={`${c.iconText} sm:hidden`} weight="fill" />
          <Icon size={32} className={`${c.iconText} hidden sm:block`} weight="fill" />
        </div>
        <div className="text-zinc-800 font-bold text-xs sm:text-sm mb-0.5 tracking-tight leading-tight">{title}</div>
        <div className={`text-zinc-400 ${descSize} block mt-0.5`}>{description}</div>
      </div>
    </button>
  );
}
