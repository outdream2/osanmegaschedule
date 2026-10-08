// src/components/layout/NavDesktopTab.tsx
// 공통헤더 · 데스크탑 탭 단일 렌더 컴포넌트 · 2026-08-31 분리
// 2026-10-08 · GLOBAL UI reference-tone · Line Tabs 톤 전환 (presentation-only)
//   · 이전 · text 20-22 pill (bg-white/[0.10]) · drop-shadow glow · rainbow icon · translate-y hover · 3px accent bar
//   · 이후 · Batch 4 Line Tabs 통일 · pill/glow/rainbow/translate 전부 삭제
//   · 역할·props·활성 판정 로직 그대로 (behavior = 0)
import React from "react";
import type { AppNavPage } from "./AppNavHeader";
import type { TabDef } from "./AppNavHeader.types";

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

  // 2026-10-08 · Line Tabs 톤 · navy 바탕 shell 안에서도 flat text + 2px underline
  //   · pill bg 삭제 · glow 삭제 · rainbow icon 삭제 · drop-shadow 삭제
  const baseCommon = "relative flex items-center gap-1.5 px-3 h-10 text-[14px] whitespace-nowrap tracking-tight transition-colors duration-150 cursor-pointer outline-none";
  const activeClass = `${baseCommon} text-white font-semibold`;
  const inactiveClass = `${baseCommon} text-[#9FBAD4] hover:text-white font-medium disabled:opacity-40`;

  // 2026-10-08 · brand accent restored · navy shell 위에서 brand blue underline
  const underline = (
    <span
      aria-hidden
      className="absolute left-2 right-2 -bottom-px h-[2px] bg-[#5EA9E8] rounded-sm pointer-events-none"
    />
  );

  if (tab.key === "business") {
    const isActive = isBizPage;
    const bizOnClick = () => onNavigate?.("business-manage");
    if (isActive) {
      return (
        <span key="business" className={activeClass}>
          <Icon size={14} weight="fill" className="shrink-0 text-white" />
          <span>{tab.label}</span>
          {underline}
        </span>
      );
    }
    return (
      <button key="business" type="button" onClick={bizOnClick} disabled={!onNavigate} className={inactiveClass}>
        <Icon size={14} weight="regular" className="shrink-0 opacity-80" />
        <span>{tab.label}</span>
      </button>
    );
  }

  const isActive = tab.key === activePage;
  const onClick = tab.key === "landing" ? (onBack ?? (() => onNavigate?.("landing"))) : () => onNavigate?.(tab.key as AppNavPage);

  if (isActive) {
    return (
      <span key={tab.key} className={activeClass}>
        <Icon size={14} weight="fill" className="shrink-0 text-white" />
        <span>{tab.label}</span>
        {underline}
      </span>
    );
  }
  return (
    <button key={tab.key} onClick={onClick} disabled={!onNavigate && !onBack} className={inactiveClass}>
      <Icon size={14} weight="regular" className="shrink-0 opacity-80" />
      <span>{tab.label}</span>
    </button>
  );
};
