// src/components/layout/NavMobileTab.tsx
// 공통헤더 · 모바일 탭 단일 렌더 컴포넌트 · 2026-08-31 분리
import React from "react";
import type { AppNavPage } from "./AppNavHeader";
import type { TabDef } from "./AppNavHeader.types";
import { TAB_COLOR_MAP } from "./AppNavHeader.types";
import { NAV_ACCENT, type SideNavColor } from "./sideNavGroups";

interface NavMobileTabProps {
  tab: TabDef;
  activePage: AppNavPage;
  isBizPage: boolean;
  onNavigate?: (page: AppNavPage) => void;
  onBack?: () => void;
}

function splitLabel(L: string): React.ReactNode {
  const isAllAscii = /^[\x20-\x7e]+$/.test(L);
  if (L.length >= 4 && !isAllAscii) {
    const custom: Record<string, [string, string]> = {
      "거래명세서": ["거래", "명세서"],
      "스케줄관리": ["스케줄", "관리"],
    };
    if (custom[L]) return <><div>{custom[L][0]}</div><div>{custom[L][1]}</div></>;
    const half = L.length === 5 ? 2 : Math.ceil(L.length / 2);
    return <><div>{L.slice(0, half)}</div><div>{L.slice(half)}</div></>;
  }
  return L;
}

export const NavMobileTab: React.FC<NavMobileTabProps> = ({
  tab, activePage, isBizPage, onNavigate, onBack,
}) => {
  const Icon = tab.icon;
  const c = TAB_COLOR_MAP[tab.color ?? "slate"];

  const mobileColorKey = (tab.color ?? "slate") as SideNavColor;
  const mobileValidColor: SideNavColor = (["slate","amber","red","sky","indigo","emerald","violet","cyan"] as SideNavColor[]).includes(mobileColorKey) ? mobileColorKey : "slate";
  const mobileAccent = NAV_ACCENT[mobileValidColor];

  const base = "flex-1 min-w-[52px] flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 rounded-lg text-[12px] font-bold transition-all duration-200 ease-out active:scale-95";
  const activeInset = "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(0,0,0,0.08)]";

  if (tab.key === "business") {
    const isActive = isBizPage;
    const bizOnClick = () => onNavigate?.("business-manage");
    if (isActive) {
      return (
        <span key="business" className={`${base} bg-white/[0.10] ${c.activeText} ${activeInset} font-bold`}>
          <span className="inline-flex" style={{ filter: `drop-shadow(0 0 6px ${mobileAccent.hex}) drop-shadow(0 0 12px ${mobileAccent.hex}60)` }}>
            <Icon size={26} weight="fill" className={`${mobileAccent.iconText} scale-110 transition-transform`} />
          </span>
          <span className="leading-tight text-center whitespace-nowrap">경영</span>
        </span>
      );
    }
    return (
      <button key="business" type="button" onClick={bizOnClick} disabled={!onNavigate}
        className={`${base} ${c.inactiveText} ${c.inactiveHoverText} hover:bg-white/[0.10] cursor-pointer disabled:opacity-40`}>
        <Icon size={26} weight="fill" className={`${mobileAccent.iconText} opacity-75`} />
        <span className="leading-tight text-center">경영</span>
      </button>
    );
  }

  const isActive = tab.key === activePage;
  const onClick = tab.key === "landing" ? (onBack ?? (() => onNavigate?.("landing"))) : () => onNavigate?.(tab.key as AppNavPage);

  if (isActive) {
    return (
      <span key={tab.key} className={`${base} bg-white/[0.10] ${c.activeText} ${activeInset} font-bold`}>
        <span className="inline-flex" style={{ filter: `drop-shadow(0 0 6px ${mobileAccent.hex}) drop-shadow(0 0 12px ${mobileAccent.hex}60)` }}>
          <Icon size={26} weight="fill" className={`${mobileAccent.iconText} scale-110 transition-transform`} />
        </span>
        <span className="leading-tight text-center">{splitLabel(tab.label)}</span>
      </span>
    );
  }
  return (
    <button key={tab.key} onClick={onClick} disabled={!onNavigate && !onBack}
      className={`${base} ${c.inactiveText} ${c.inactiveHoverText} hover:bg-white/[0.10] cursor-pointer disabled:opacity-40`}>
      <Icon size={26} weight="fill" className={`${mobileAccent.iconText} opacity-75`} />
      <span className="leading-tight text-center whitespace-nowrap">
        {tab.label.length > 3 ? (
          <>
            <div>{tab.label.slice(0, tab.label.length - 2)}</div>
            <div>{tab.label.slice(-2)}</div>
          </>
        ) : tab.label}
      </span>
    </button>
  );
};
