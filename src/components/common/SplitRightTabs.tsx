// src/components/common/SplitRightTabs.tsx
// 2026-08-25 · #261 · SplitPanel 우측 탭 메뉴 공용 프리미티브 · v9 시그니처 · 폰트 +2
//   · ProductDetailPanel · PaymentInfoTab · Staff · Vendor 등 · 우측 탭바 통일
//   · 기존 인라인 구현 (5+ 곳) · 톤 상이 · 유지보수 파편화 → 프리미티브로 흡수
//   · TabBar (L2 pill) 대체 · 우측 컨텍스트 전용 (padding · size · sticky 조정)
//   · v9 톤 · 활성 · brand-deep + subtle gradient underline · 폰트 +2
//
// 사용:
//   <SplitRightTabs
//     tabs={[
//       { key: "info", label: "상품 정보", icon: Info },
//       { key: "purchase", label: "매입이력", icon: History, count: 12 },
//     ]}
//     active={tab}
//     onSelect={setTab}
//   />

import React from "react";

type IconLike = React.ComponentType<{
  size?: number;
  className?: string;
  strokeWidth?: number;
  weight?: "regular" | "bold" | "fill" | "duotone" | "light" | "thin";
}>;

export interface SplitRightTabDef<K extends string = string> {
  key: K;
  label: string;
  /** Optional lucide/phosphor icon */
  icon?: IconLike;
  /** Optional badge count (0 or undefined = 숨김) */
  count?: number | null;
  /** 특정 탭만 숨김 (필터링) */
  visible?: boolean;
}

export interface SplitRightTabsProps<K extends string = string> {
  tabs: SplitRightTabDef<K>[];
  active: K;
  onSelect: (key: K) => void;
  /** sticky top-0 (기본 false) · 스크롤 시 상단 고정 필요 시 true */
  sticky?: boolean;
  /** wrapper 배경 · 기본 bg-white */
  bg?: string;
  /** wrapper 추가 className */
  className?: string;
  /** border-b 하단 구분선 · 기본 true */
  withBorder?: boolean;
  /** 2026-08-26 · 사용자 지시 · 탭 글씨 크기 · sm=15px · md=17px (기본) · lg=19px (+3) */
  size?: "sm" | "md" | "lg";
}

/**
 * SplitPanel 우측 탭 메뉴 프리미티브
 *   · Font +2 (기존 14 → 15/16) · 40대+ 가독성
 *   · 활성 · brand-deep 진하게 + underline gradient
 *   · 비활성 · zinc-500 hover ink
 *   · 오버플로우 · 가로 스크롤 (스크롤바 hidden)
 *   · badge · brand-tint bg · brand-deep text
 */
export function SplitRightTabs<K extends string = string>({
  tabs,
  active,
  onSelect,
  sticky = false,
  bg = "bg-white",
  className = "",
  withBorder = true,
  size = "md",
}: SplitRightTabsProps<K>) {
  const visible = tabs.filter(t => t.visible !== false);
  const stickyCls = sticky ? "sticky top-0 z-20" : "";
  const borderCls = withBorder ? "border-b border-line" : "";
  const sizeCls = size === "lg" ? "text-[18px] sm:text-[19px]"
                : size === "sm" ? "text-[13px] sm:text-[14px]"
                :                 "text-[15px] sm:text-[16px]";
  const btnH   = size === "lg" ? "h-12 px-4" : "h-10 px-3";
  return (
    <div
      role="tablist"
      className={`${stickyCls} ${bg} ${borderCls} flex items-center gap-1 px-3 sm:px-4 pt-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none] ${className}`.trim()}
    >
      {visible.map(t => {
        const isActive = active === t.key;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(t.key)}
            title={t.label}
            className={[
              "relative inline-flex items-center gap-1.5 rounded-t-lg",
              btnH,
              // 폰트 · size prop 기준 (기본 md · lg 는 +3)
              sizeCls,
              "font-semibold tracking-tight whitespace-nowrap",
              "transition-colors duration-150 cursor-pointer",
              isActive
                ? "text-brand-deep font-bold"
                : "text-zinc-500 hover:text-ink hover:bg-zinc-50",
            ].join(" ")}
          >
            {Icon && (
              <Icon
                size={16}
                strokeWidth={isActive ? 2.4 : 2}
                weight={isActive ? "fill" : "duotone"}
                className={`shrink-0 transition-colors ${isActive ? "text-brand-deep" : "text-zinc-400"}`}
              />
            )}
            <span>{t.label}</span>
            {t.count != null && t.count > 0 && (
              <span
                className={`inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[11px] font-bold tabular-nums leading-none transition-colors ${
                  isActive
                    ? "bg-brand-tint text-brand-deep"
                    : "bg-zinc-100 text-zinc-500"
                }`}
                title={`${t.label} · ${t.count}건`}
              >
                {t.count}
              </span>
            )}
            {/* v9 · 활성 underline gradient (brand-deep → sky-500) */}
            {isActive && (
              <span
                aria-hidden
                className="absolute left-2 right-2 bottom-0 h-[2.5px] rounded-t bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep pointer-events-none"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export default SplitRightTabs;
