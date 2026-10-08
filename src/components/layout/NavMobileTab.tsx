// src/components/layout/NavMobileTab.tsx
// 공통헤더 · 모바일 탭 단일 렌더 컴포넌트 · 2026-08-31 분리
// 2026-10-08 · GLOBAL UI reference-tone · compact tab · pill/glow 전부 삭제
//   · 이전 · 2줄 split label + bg-white/[0.10] pill + drop-shadow glow + rainbow icon + scale-110
//   · 이후 · flat text · 1줄 label · small icon (글자 뚜렷)
//   · 역할·props 그대로 (behavior = 0)
import React from "react";
import type { AppNavPage } from "./AppNavHeader";
import type { TabDef } from "./AppNavHeader.types";

interface NavMobileTabProps {
  tab: TabDef;
  activePage: AppNavPage;
  isBizPage: boolean;
  onNavigate?: (page: AppNavPage) => void;
  onBack?: () => void;
}

export const NavMobileTab: React.FC<NavMobileTabProps> = ({
  tab, activePage, isBizPage, onNavigate, onBack,
}) => {
  const Icon = tab.icon;

  // 2026-10-08 · compact · navy shell 위 flat · active=흰 밑줄 · pill/glow 전부 삭제
  const base = "relative flex-1 min-w-[48px] flex flex-col items-center justify-center gap-0.5 px-1 py-1 h-11 text-[12px] whitespace-nowrap transition-colors duration-150 cursor-pointer disabled:opacity-40";
  const activeClass = `${base} text-white font-semibold`;
  const inactiveClass = `${base} text-[#9FBAD4] hover:text-white font-medium`;

  const underline = (
    <span
      aria-hidden
      className="absolute left-1.5 right-1.5 bottom-0 h-[2px] bg-white rounded-sm pointer-events-none"
    />
  );

  if (tab.key === "business") {
    const isActive = isBizPage;
    const bizOnClick = () => onNavigate?.("business-manage");
    if (isActive) {
      return (
        <span key="business" className={activeClass}>
          <Icon size={16} weight="fill" className="shrink-0 text-white" />
          <span className="leading-tight">경영</span>
          {underline}
        </span>
      );
    }
    return (
      <button
        key="business"
        type="button"
        onClick={bizOnClick}
        disabled={!onNavigate}
        className={inactiveClass}
      >
        <Icon size={16} weight="regular" className="shrink-0 opacity-80" />
        <span className="leading-tight">경영</span>
      </button>
    );
  }

  const isActive = tab.key === activePage;
  const onClick = tab.key === "landing" ? (onBack ?? (() => onNavigate?.("landing"))) : () => onNavigate?.(tab.key as AppNavPage);
  const label = tab.mobileLabel ?? tab.label;

  if (isActive) {
    return (
      <span key={tab.key} className={activeClass}>
        <Icon size={16} weight="fill" className="shrink-0 text-white" />
        <span className="leading-tight">{label}</span>
        {underline}
      </span>
    );
  }
  return (
    <button key={tab.key} onClick={onClick} disabled={!onNavigate && !onBack} className={inactiveClass}>
      <Icon size={16} weight="regular" className="shrink-0 opacity-80" />
      <span className="leading-tight">{label}</span>
    </button>
  );
};
