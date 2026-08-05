// src/components/common/PageHeader.tsx
// T-CSS Phase 1 · 2026-08-05
// 공통 페이지 헤더 컴포넌트
//   - 페이지 타이틀 · 서브타이틀 · 아이콘 · 우측 액션 슬롯
//   - 기존 AppNavHeader 와 무관 · 페이지 내부 콘텐츠 영역 상단 헤더
//
// 사용 예:
//   <PageHeader
//     title="재고 관리"
//     subtitle="전체 234건"
//     icon={Package}
//     iconColor="text-emerald-500"
//     actions={<button className={BUTTON_PRIMARY}>발주 요청</button>}
//   />
//   <PageHeader title="직원 관리" icon={Users} iconColor="text-indigo-500" />

import React from "react";
import { TEXT } from "../../styles/tokens";

type IconLike = React.ComponentType<{
  size?: number;
  className?: string;
  strokeWidth?: number;
  weight?: string;
}>;

export interface PageHeaderProps {
  /** 페이지 타이틀 · 필수 */
  title: React.ReactNode;
  /** 서브타이틀 · 건수·날짜·설명 등 */
  subtitle?: React.ReactNode;
  /** Lucide / Phosphor 아이콘 컴포넌트 */
  icon?: IconLike;
  /** 아이콘 색상 Tailwind 클래스 · 기본 text-indigo-500 */
  iconColor?: string;
  /** 우측 액션 영역 · 버튼·드롭다운 등 */
  actions?: React.ReactNode;
  /** 추가 className (외부 여백 등) */
  className?: string;
}

/**
 * 공통 페이지 헤더
 *   - 좌측: 아이콘 + 타이틀 + 서브타이틀
 *   - 우측: actions 슬롯 (버튼 등)
 *   - 반응형: 모바일 세로 스택 → sm 이상 가로 배치
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  iconColor = "text-indigo-500",
  actions,
  className = "",
}) => {
  return (
    <div
      className={[
        "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3",
        className,
      ].filter(Boolean).join(" ")}
    >
      {/* 좌측: 아이콘 + 텍스트 */}
      <div className="flex items-center gap-2.5 min-w-0">
        {Icon && (
          <span className={`shrink-0 ${iconColor}`}>
            <Icon size={20} strokeWidth={2.2} />
          </span>
        )}
        <div className="min-w-0">
          <h2
            className={`${TEXT.hero} text-slate-900 leading-tight`}
          >
            {title}
          </h2>
          {subtitle != null && (
            <p className={`${TEXT.caption} text-slate-500 mt-0.5 leading-snug`}>
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* 우측: actions */}
      {actions != null && (
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
};

export default PageHeader;
