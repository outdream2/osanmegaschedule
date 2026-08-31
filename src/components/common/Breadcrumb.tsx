// src/components/common/Breadcrumb.tsx
// 2026-08-31 · 사용자 지시 · 모든 페이지 상단 · 홈 › 설정 › 회사·브랜드 형태
//   · 각 세그먼트 클릭 → 해당 페이지 이동 (link 지원)
//   · 프레임워크 프리미티브 · Linear/Vercel/Notion 세련 톤
//   · SIDE_NAV_GROUPS 기반 자동 파생 (buildBreadcrumb helper)

import React from "react";
import { House, CaretRight } from "@phosphor-icons/react";
import type { AppNavPage } from "../layout/AppNavHeader";

export interface BreadcrumbItem {
  label: string;
  page?: AppNavPage;      // 있으면 클릭 가능 · 없으면 현재 페이지
  subTab?: string;        // 이동 시 서브탭 저장
  icon?: React.ReactNode;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  onNavigate?: (page: AppNavPage, subTab?: string) => void;
  className?: string;
  /** 홈 아이콘 표시 여부 · default true */
  showHomeIcon?: boolean;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({
  items,
  onNavigate,
  className = "",
  showHomeIcon = true,
}) => {
  if (!items || items.length === 0) return null;

  return (
    <nav
      aria-label="페이지 경로"
      className={`flex items-center flex-wrap gap-1 text-[13px] font-medium select-none ${className}`}
    >
      {items.map((it, i) => {
        const isLast = i === items.length - 1;
        const isFirst = i === 0;
        const clickable = !isLast && it.page && onNavigate;
        const content = (
          <span className="inline-flex items-center gap-1">
            {isFirst && showHomeIcon && <House size={13} weight="fill" className="opacity-80" />}
            {it.icon}
            <span>{it.label}</span>
          </span>
        );
        return (
          <React.Fragment key={`bc-${i}`}>
            {clickable ? (
              <button
                type="button"
                onClick={() => {
                  if (it.subTab && it.page) {
                    try { localStorage.setItem(`sidebar.subtab.${it.page}`, it.subTab); } catch { /* silent */ }
                    try { window.dispatchEvent(new CustomEvent("sidebar:subtab", { detail: { page: it.page, subTab: it.subTab } })); } catch { /* silent */ }
                  }
                  onNavigate!(it.page!, it.subTab);
                }}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-brand-deep/70 hover:text-brand-deep hover:bg-brand-tint/40 transition cursor-pointer"
                title={`${it.label} 로 이동`}
              >
                {content}
              </button>
            ) : (
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 ${isLast ? "text-ink font-bold" : "text-ink-soft"}`}
                aria-current={isLast ? "page" : undefined}
              >
                {content}
              </span>
            )}
            {!isLast && (
              <CaretRight size={11} weight="bold" className="text-ink-soft/50 shrink-0" aria-hidden />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default Breadcrumb;
