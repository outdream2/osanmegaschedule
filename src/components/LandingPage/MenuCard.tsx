// 2026-08-16 · Landing 공용 메뉴 카드 · 랜딩 12+ 카드 DRY 통합
// 2026-08-17 · 사용자 지시 · 아이콘 제목 앞 · 공통헤더 스타일 · 버튼 세련화
//   · 이전: 큰 아이콘 (48/56) 상단 · 제목·설명 아래
//   · 지금: 작은 아이콘 (16/18) 제목과 같은 줄 · 공통헤더 style · 더 컴팩트
import type { ReactNode, ElementType } from "react";

export type MenuCardColor = "red" | "violet" | "indigo" | "orange" | "zinc" | "sky" | "amber" | "emerald" | "fuchsia" | "rose";

interface ColorTokens {
  bgBase: string;      // default 상태 · subtle colored bg (사용자 지시 · 세련미 우선)
  borderBase: string;
  hoverBorder: string;
  hoverBg: string;
  iconText: string;
  activeAccent: string; // hover 시 title 색상
}

// · 2026-08-17 · #137 · 사용자 결정 · 옵션 B · subtle colored bg (세련미 > 파스텔 지양)
const COLOR_MAP: Record<MenuCardColor, ColorTokens> = {
  red:      { bgBase: "bg-red-50/40",     borderBase: "border-red-100",     hoverBorder: "hover:border-red-300",     hoverBg: "bg-red-100/60",     iconText: "text-red-600",     activeAccent: "group-hover:text-red-800" },
  violet:   { bgBase: "bg-violet-50/40",  borderBase: "border-violet-100",  hoverBorder: "hover:border-violet-300",  hoverBg: "bg-violet-100/60",  iconText: "text-violet-600",  activeAccent: "group-hover:text-violet-800" },
  indigo:   { bgBase: "bg-indigo-50/40",  borderBase: "border-indigo-100",  hoverBorder: "hover:border-indigo-300",  hoverBg: "bg-indigo-100/60",  iconText: "text-indigo-600",  activeAccent: "group-hover:text-indigo-800" },
  orange:   { bgBase: "bg-orange-50/40",  borderBase: "border-orange-100",  hoverBorder: "hover:border-orange-300",  hoverBg: "bg-orange-100/60",  iconText: "text-orange-600",  activeAccent: "group-hover:text-orange-700" },
  zinc:     { bgBase: "bg-zinc-50/50",    borderBase: "border-zinc-200",    hoverBorder: "hover:border-zinc-400",    hoverBg: "bg-zinc-100/70",    iconText: "text-zinc-600",    activeAccent: "group-hover:text-zinc-900" },
  sky:      { bgBase: "bg-sky-50/40",     borderBase: "border-sky-100",     hoverBorder: "hover:border-sky-300",     hoverBg: "bg-sky-100/60",     iconText: "text-sky-600",     activeAccent: "group-hover:text-sky-800" },
  amber:    { bgBase: "bg-amber-50/40",   borderBase: "border-amber-100",   hoverBorder: "hover:border-amber-300",   hoverBg: "bg-amber-100/60",   iconText: "text-amber-600",   activeAccent: "group-hover:text-amber-800" },
  emerald:  { bgBase: "bg-emerald-50/40", borderBase: "border-emerald-100", hoverBorder: "hover:border-emerald-300", hoverBg: "bg-emerald-100/60", iconText: "text-emerald-600", activeAccent: "group-hover:text-emerald-800" },
  fuchsia:  { bgBase: "bg-fuchsia-50/40", borderBase: "border-fuchsia-100", hoverBorder: "hover:border-fuchsia-300", hoverBg: "bg-fuchsia-100/60", iconText: "text-fuchsia-600", activeAccent: "group-hover:text-fuchsia-800" },
  rose:     { bgBase: "bg-rose-50/40",    borderBase: "border-rose-100",    hoverBorder: "hover:border-rose-300",    hoverBg: "bg-rose-100/60",    iconText: "text-rose-600",    activeAccent: "group-hover:text-rose-800" },
};

interface MenuCardProps {
  color: MenuCardColor;
  icon: ElementType;
  title: string;
  description: string;
  onClick: () => void;
  /** order-N 등 grid 순서 클래스 · 필요 시 */
  orderClass?: string;
  /** 우측 상단 절대배치 배지 · title 라인 · 크기 조정 불필요 (compact 레이아웃) */
  badge?: ReactNode;
  /** 설명 텍스트 크기 override · default: text-[11px] sm:text-[13px] */
  descClass?: string;
}

export function MenuCard({ color, icon: Icon, title, description, onClick, orderClass, badge, descClass }: MenuCardProps) {
  const c = COLOR_MAP[color];
  // 2026-08-17 · 사용자 지시 · 버튼 글씨 +2 · description 기본 13/15
  const descSize = descClass ?? "text-[13px] sm:text-[15px] leading-tight sm:leading-relaxed";
  return (
    <button
      data-menu-card
      onClick={onClick}
      className={`${orderClass ?? ""} group relative bg-white border border-zinc-200 ${c.hoverBorder} rounded-xl px-3.5 py-3 sm:px-4 sm:py-3.5 text-left transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm active:scale-[0.99] cursor-pointer overflow-hidden`}
    >
      <div className={`absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${c.hoverBg}`} />
      {badge}
      <div className="relative flex flex-col gap-1">
        {/* 제목 라인 · 아이콘 · 텍스트 인라인 (공통헤더 스타일) */}
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon size={16} className={`${c.iconText} shrink-0 transition-colors sm:hidden`} weight="fill" />
          <Icon size={18} className={`${c.iconText} shrink-0 transition-colors hidden sm:block`} weight="fill" />
          <span className={`text-zinc-900 font-black text-[15px] sm:text-[17px] tracking-tight truncate transition-colors ${c.activeAccent}`}>{title}</span>
        </div>
        {/* 설명 · 좌측 정렬 · 인라인 icon padding 을 위해 pl-[22px]/[26px] */}
        <div className={`text-zinc-400 ${descSize} pl-[22px] sm:pl-[26px]`}>{description}</div>
      </div>
    </button>
  );
}
