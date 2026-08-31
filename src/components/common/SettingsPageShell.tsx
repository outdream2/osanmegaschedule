// src/components/common/SettingsPageShell.tsx
// 2026-08-12 · [설정] 그룹 하위 페이지 UI 통일 공통 셸
//   · 헤더 (AppNavHeader) + 페이지 타이틀 (아이콘·이름·설명) + max-width 통일
//   · 각 설정 페이지 (회사정보·계절정의·시스템설정·앱브랜딩·직원권한·구역라벨)
//     이 셸을 wrap 하면 · 자동으로 동일한 레이아웃/스타일 적용
//   · children · 실제 컨텐츠 (카드·폼 등)
//
// 2026-08-29 · #122 P5 · shell 프리미엄 개편 (docs/UI_MOCKUP_SETTINGS_SHELL_V2_2026-08-26.html)
//   · header 카드형 · 상단 3px gradient accent bar
//   · icon-tile (40x40 · brand-deep → brand gradient · white icon)
//   · optional breadcrumb (홈 > 설정 > 현재)
//   · title 22px extrabold · description 13px
import React from "react";
import type { Icon } from "@phosphor-icons/react";
import { CaretRight, House } from "@phosphor-icons/react";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";

interface Props {
  activePage: AppNavPage;
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;

  /** 페이지 아이콘 (phosphor) */
  icon: Icon;
  /** 페이지 제목 · 예: "회사정보" */
  title: string;
  /** 설명 · 페이지 목적 · 관리자 대상 안내 */
  description?: string;
  /** 아이콘 컬러 클래스 · 기존 slate 계열 · v2 shell 에서는 icon-tile 흰색 아이콘 우선 · fallback 만 사용 */
  iconColor?: string;

  /** 헤더 우측 추가 슬롯 (예: 저장 상태 배지 · 새로고침 버튼) */
  rightSlot?: React.ReactNode;
  /** max-width · 기본 max-w-[1360px] w-[85%] · 필요 시 override */
  maxWidth?: "max-w-2xl" | "max-w-3xl" | "max-w-4xl" | "max-w-[1100px]" | "max-w-[1360px]";
  /** 2026-08-16 · 페이지별 title/description 폰트 커스텀 */
  titleClassName?: string;
  descriptionClassName?: string;

  /** 2026-08-29 · #122 P5 · breadcrumb 표시 여부 · 기본 true */
  showBreadcrumb?: boolean;
  /** breadcrumb 상위 그룹 라벨 · 기본 "설정" */
  breadcrumbGroup?: string;

  children: React.ReactNode;
}

export const SettingsPageShell: React.FC<Props> = ({
  activePage, authSession, onBack, onNavigate, onLogout,
  icon: Icon, title, description,
  rightSlot, maxWidth = "max-w-[1360px]",
  titleClassName = "text-[22px] font-extrabold text-ink leading-tight tracking-tight",
  descriptionClassName = "text-[13px] text-ink-soft mt-1 leading-relaxed",
  showBreadcrumb = true,
  breadcrumbGroup = "설정",
  children,
}) => {
  return (
    <div className="min-h-screen bg-[#F4F7FA] flex flex-col">
      <AppNavHeader
        activePage={activePage}
        authSession={authSession}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
        rightSlot={rightSlot}
      />
      <main className={`flex-1 ${maxWidth} w-[85%] mx-auto px-4 py-5 flex flex-col gap-4`}>
        {/* 2026-08-29 · #122 P5 · breadcrumb · 홈 > 설정 > 현재 페이지 */}
        {showBreadcrumb && (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-ink-soft font-medium -mb-1">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 hover:text-brand-deep transition cursor-pointer"
              title="홈으로"
            >
              <House size={12} weight="fill" /> 홈
            </button>
            <CaretRight size={11} className="text-zinc-300" />
            <span>{breadcrumbGroup}</span>
            <CaretRight size={11} className="text-zinc-300" />
            <span className="text-ink font-bold">{title}</span>
          </nav>
        )}

        {/* 2026-08-29 · #122 P5 · 프리미엄 헤더 카드 · 3px gradient accent bar + icon-tile */}
        <header className="relative overflow-hidden bg-white border border-line rounded-2xl shadow-[0_1px_2px_rgba(10,46,74,0.04),0_4px_12px_-4px_rgba(10,46,74,0.06)]">
          {/* 상단 3px gradient accent bar */}
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-brand-deep via-brand to-[#3E7CB1]" />
          <div className="px-5 pt-5 pb-4 flex items-start gap-4">
            {/* Icon tile · brand-deep gradient · 흰색 아이콘 · shadow */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-deep to-brand shadow-[0_2px_8px_-1px_rgba(10,46,74,0.25)] flex items-center justify-center shrink-0">
              <Icon size={20} weight="fill" className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className={titleClassName}>{title}</h1>
              {description && (
                <p className={descriptionClassName}>{description}</p>
              )}
            </div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
};

export default SettingsPageShell;
