// src/components/layout/NavDesktopTab.tsx
// 공통헤더 · 데스크탑 탭 단일 렌더 컴포넌트 · 2026-08-31 분리
import React from "react";
import type { AppNavPage } from "./AppNavHeader";
import type { TabDef } from "./AppNavHeader.types";
import { NAV_ACCENT, headerAccentGradient, type SideNavColor } from "./sideNavGroups";

interface NavDesktopTabProps {
  tab: TabDef;
  activePage: AppNavPage;
  isBizPage: boolean;
  onNavigate?: (page: AppNavPage) => void;
  onBack?: () => void;
}

export const NavDesktopTab: React.FC<NavDesktopTabProps> = ({
  tab, activePage, isBizPage, onNavigate, onBack,
}) => {
  const Icon = tab.icon;

  const colorKey = (tab.color ?? "slate") as SideNavColor;
  const validColor: SideNavColor = (["slate","amber","red","sky","indigo","emerald","violet","cyan"] as SideNavColor[]).includes(colorKey) ? colorKey : "slate";
  const accent = NAV_ACCENT[validColor];
  const iconAccent = accent.iconText;

  const baseCommon = "relative flex items-center gap-1.5 px-3 sm:px-3 md:px-3.5 lg:px-4 py-1.5 rounded-lg text-[19px] sm:text-[19px] md:text-[20px] lg:text-[21px] font-semibold whitespace-nowrap transition-all duration-200 ease-out";
  const activeClass = `${baseCommon} bg-white/[0.10] text-white font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]`;
  const inactiveClass = `${baseCommon} text-[#C4DAEE] hover:bg-white/[0.06] hover:text-white hover:-translate-y-[1px] active:scale-95 cursor-pointer disabled:opacity-40 group/tab`;

  const accentBar = (
    <span
      className="absolute bottom-[-2px] left-1/2 -translate-x-1/2 w-[90%] h-[3px] rounded-full pointer-events-none"
      style={{ background: `linear-gradient(90deg, transparent, ${accent.hex} 30%, ${accent.hex} 70%, transparent)`, boxShadow: `0 0 12px ${accent.hex}, 0 2px 10px ${accent.hex}80` }}
    />
  );
  const hoverBar = (
    <span
      className="absolute bottom-[-2px] left-1/2 -translate-x-1/2 w-0 h-[2px] rounded-full pointer-events-none transition-all duration-300 ease-out group-hover/tab:w-[50%]"
      style={{ backgroundColor: `${accent.hex}80` }}
      aria-hidden
    />
  );

  if (tab.key === "business") {
    const isActive = isBizPage;
    const bizOnClick = () => onNavigate?.("business-manage");
    if (isActive) {
      return (
        <span key="business" className={activeClass}>
          <span className="inline-flex" style={{ filter: `drop-shadow(0 0 8px ${accent.hex}) drop-shadow(0 0 16px ${accent.hex}40)` }}>
            <Icon size={20} weight="fill" className={`shrink-0 ${iconAccent} scale-110 transition-transform`} />
          </span>
          <span>{tab.label}</span>
          {accentBar}
        </span>
      );
    }
    return (
      <button key="business" type="button" onClick={bizOnClick} disabled={!onNavigate} className={inactiveClass}>
        <Icon size={20} weight="duotone" className={`shrink-0 opacity-75 group-hover/tab:opacity-100 transition-all ${iconAccent}`} />
        <span>{tab.label}</span>
        {hoverBar}
      </button>
    );
  }

  const isActive = tab.key === activePage;
  const onClick = tab.key === "landing" ? (onBack ?? (() => onNavigate?.("landing"))) : () => onNavigate?.(tab.key as AppNavPage);

  if (isActive) {
    return (
      <span key={tab.key} className={activeClass}>
        <span className="inline-flex" style={{ filter: `drop-shadow(0 0 8px ${accent.hex}) drop-shadow(0 0 16px ${accent.hex}40)` }}>
          <Icon size={20} weight="fill" className={`shrink-0 ${iconAccent} scale-110 transition-transform`} />
        </span>
        <span>{tab.label}</span>
        {accentBar}
      </span>
    );
  }
  return (
    <button key={tab.key} onClick={onClick} disabled={!onNavigate && !onBack} className={inactiveClass}>
      <Icon size={20} weight="duotone" className={`shrink-0 opacity-75 group-hover/tab:opacity-100 transition-all ${iconAccent}`} />
      <span>{tab.label}</span>
      {hoverBar}
    </button>
  );
};
