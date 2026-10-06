// src/components/common/SettingsPageShell.tsx
// 2026-08-12 · [설정] 그룹 하위 페이지 UI 통일 공통 셸
//   · 헤더 (AppNavHeader) + 페이지 타이틀 (아이콘·이름·설명) + max-width 통일
//   · 각 설정 페이지 (회사정보·계절정의·시스템설정·앱브랜딩·직원권한·구역라벨)
//     이 셸을 wrap 하면 · 자동으로 동일한 레이아웃/스타일 적용
//   · children · 실제 컨텐츠 (카드·폼 등)
//
// 2026-08-29 · #122 P5 · shell 프리미엄 개편
//   · header 카드형 · 상단 3px gradient accent bar · icon-tile · title 22px
// 2026-10-06 · BREADCRUMB SSOT CLEANUP · 자체 하드코드 breadcrumb 제거
//   · 글로벌 AppNavHeader (buildBreadcrumbFromNav) 로 통일 · 중복 렌더 2개 → 1개
//   · showBreadcrumb · breadcrumbGroup prop 제거 (전수 call-site 미사용 확인)
//   · House · CaretRight dead import 제거
import React from "react";
import type { Icon } from "@phosphor-icons/react";
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

  // 2026-10-06 · BREADCRUMB SSOT CLEANUP · showBreadcrumb · breadcrumbGroup prop 제거
  //   · breadcrumb 는 글로벌 AppNavHeader 가 유일 렌더 · 중복 금지

  children: React.ReactNode;
}

export const SettingsPageShell: React.FC<Props> = ({
  activePage, authSession, onBack, onNavigate, onLogout,
  icon: Icon, title, description,
  rightSlot, maxWidth = "max-w-[1360px]",
  titleClassName = "text-[22px] font-extrabold text-ink leading-tight tracking-tight",
  descriptionClassName = "text-[15px] text-ink-soft mt-1 leading-relaxed",
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
        {/* 2026-10-06 · BREADCRUMB SSOT CLEANUP · 자체 breadcrumb 제거 · AppNavHeader 글로벌 유일 */}
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
