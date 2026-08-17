// src/components/common/SettingsPageShell.tsx
// 2026-08-12 · [설정] 그룹 하위 페이지 UI 통일 공통 셸
//   · 헤더 (AppNavHeader) + 페이지 타이틀 (아이콘·이름·설명) + max-width 통일
//   · 각 설정 페이지 (회사정보·계절정의·시스템설정·앱브랜딩·직원권한·구역라벨)
//     이 셸을 wrap 하면 · 자동으로 동일한 레이아웃/스타일 적용
//   · children · 실제 컨텐츠 (카드·폼 등)
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
  /** 아이콘 컬러 클래스 · 예: "text-indigo-500" · 기본 slate */
  iconColor?: string;

  /** 헤더 우측 추가 슬롯 (예: 저장 상태 배지) */
  rightSlot?: React.ReactNode;
  /** max-width · 기본 max-w-3xl · 필요 시 override */
  maxWidth?: "max-w-2xl" | "max-w-3xl" | "max-w-4xl" | "max-w-[1100px]";
  /** 2026-08-16 · 페이지별 title/description 폰트 커스텀 · 기본 text-lg / text-xs */
  titleClassName?: string;
  descriptionClassName?: string;

  children: React.ReactNode;
}

export const SettingsPageShell: React.FC<Props> = ({
  activePage, authSession, onBack, onNavigate, onLogout,
  icon: Icon, title, description, iconColor = "text-brand-deep",
  rightSlot, maxWidth = "max-w-3xl",
  // 2026-08-17 · 최신 트렌드 · 폰트 +2 · text-ink + tracking-tight
  titleClassName = "text-[20px] font-extrabold text-ink leading-tight tracking-tight",
  descriptionClassName = "text-[14px] text-ink-soft mt-1 leading-relaxed",
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
      <main className={`flex-1 ${maxWidth} mx-auto w-full px-4 py-5 flex flex-col gap-4`}>
        {/* 페이지 타이틀 · 2026-08-17 · 최신 트렌드 · brand-tint 아이콘 컨테이너 · 폰트 +2 */}
        <div className="flex items-start gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-brand-tint border border-brand/15 shadow-sm flex items-center justify-center shrink-0">
            <Icon size={22} weight="duotone" className={iconColor} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className={titleClassName}>{title}</h1>
            {description && (
              <p className={descriptionClassName}>{description}</p>
            )}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
};

export default SettingsPageShell;
