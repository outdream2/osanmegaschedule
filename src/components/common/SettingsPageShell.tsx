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
// 2026-10-08 · GLOBAL UI reference-tone · settings shell → OperationsPageTemplate 통합
//   · 모든 settings 페이지 (CompanyInfo · Season · System · Branding · Permissions ·
//     ZoneLabels · ContractSettings · OrderSettings · SettingsHub · ScheduleSettings) 자동 적용
import { OperationsPageTemplate } from "./OperationsPageTemplate";

interface Props {
  activePage: AppNavPage;
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;

  /** 페이지 아이콘 (phosphor) · 2026-10-08 title 좌측 inline 아이콘 (icon-tile 삭제) */
  icon: Icon;
  /** 페이지 제목 · 예: "회사정보" */
  title: string;
  /** 설명 · 페이지 목적 · 관리자 대상 안내 */
  description?: string;
  /** DEPRECATED · 2026-10-08 OperationsPageTemplate로 통합 후 미사용 (호환성 prop 유지) */
  iconColor?: string;

  /** 헤더 우측 추가 슬롯 (예: 저장 상태 배지 · 새로고침 버튼) */
  rightSlot?: React.ReactNode;
  /** DEPRECATED · 2026-10-08 OperationsPageTemplate w-full · max-w cap 제거 (호환성 prop 유지) */
  maxWidth?: "max-w-2xl" | "max-w-3xl" | "max-w-4xl" | "max-w-[1100px]" | "max-w-[1360px]";
  /** DEPRECATED · 2026-10-08 OperationsPageTemplate 통일 typography (호환성 prop 유지) */
  titleClassName?: string;
  /** DEPRECATED · 2026-10-08 OperationsPageTemplate 통일 typography (호환성 prop 유지) */
  descriptionClassName?: string;

  children: React.ReactNode;
}

export const SettingsPageShell: React.FC<Props> = ({
  activePage, authSession, onBack, onNavigate, onLogout,
  icon: Icon, title, description,
  rightSlot,
  // DEPRECATED props · consumed but ignored (호환성)
  iconColor: _iconColor,
  maxWidth: _maxWidth,
  titleClassName: _titleClassName,
  descriptionClassName: _descriptionClassName,
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
      {/* 2026-10-08 · GLOBAL UI reference-tone application
             · 이전 · bg-white rounded-2xl shadow + 3px gradient bar + brand-deep gradient icon tile 거대 header card
             · 이후 · OperationsPageTemplate 통합 · flat title + inline icon + border-b divider
             · state/handler/API 없음 (pure presentation shell) · behavior = 0 */}
      <OperationsPageTemplate
        title={
          <span className="inline-flex items-center gap-2.5">
            <Icon size={22} weight="fill" className="text-brand-deep shrink-0" />
            <span>{title}</span>
          </span>
        }
        description={description}
      >
        {children}
      </OperationsPageTemplate>
    </div>
  );
};

export default SettingsPageShell;
