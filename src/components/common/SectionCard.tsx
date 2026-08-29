// src/components/common/SectionCard.tsx
// 2026-08-29 · #122 Phase 1 · 시스템설정 목업 · section-card 프리미티브
//
// 목업 · docs/UI_MOCKUP_SETTINGS_SHELL_V2_2026-08-26.html
//   · head: 14px 18px · border-bottom · gradient bg (#FAFBFC → #F5F7FA)
//   · body: 18px padding · surface
//
// 사용:
//   <SectionCard title="일반 설정" icon={<Cog />} description="언어·시간대·테마">
//     <div>필드들 ...</div>
//   </SectionCard>
//
//   <SectionCard title="위험 영역" tone="danger">
//     ...
//   </SectionCard>

import React from "react";

export type SectionCardTone = "default" | "danger" | "info";

export interface SectionCardProps {
  title: React.ReactNode;
  /** 좌측 아이콘 (예: <Cog size={16} />) */
  icon?: React.ReactNode;
  /** 헤더 하단 · 회색 설명 텍스트 (선택) */
  description?: React.ReactNode;
  /** 우측 액션 슬롯 (예: 저장 버튼 · 토글) */
  actions?: React.ReactNode;
  /** 톤 · default(회색) · danger(빨강) · info(파랑) · 헤더 아이콘 색만 다름 */
  tone?: SectionCardTone;
  children?: React.ReactNode;
  className?: string;
  /** body padding · 기본 md(18px) · none(0) · sm(12px) */
  bodyPadding?: "none" | "sm" | "md";
}

const TONE_ICON_CLS: Record<SectionCardTone, string> = {
  default: "text-brand-deep",
  danger:  "text-rose-600",
  info:    "text-sky-600",
};

const BODY_PAD_CLS: Record<NonNullable<SectionCardProps["bodyPadding"]>, string> = {
  none: "p-0",
  sm:   "p-3",
  md:   "p-[18px]",
};

export function SectionCard({
  title, icon, description, actions, tone = "default", children, className = "", bodyPadding = "md",
}: SectionCardProps) {
  return (
    <section
      className={`bg-white border border-line rounded-xl overflow-hidden ${className}`.trim()}
    >
      <header className="flex items-center gap-2.5 px-[18px] py-3.5 border-b border-line bg-gradient-to-b from-[#FAFBFC] to-[#F5F7FA]">
        {icon && (
          <span className={`shrink-0 inline-flex items-center justify-center ${TONE_ICON_CLS[tone]}`}>
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-ink tracking-tight leading-tight">{title}</h3>
          {description && (
            <p className="text-[12px] text-ink-soft mt-0.5 leading-snug">{description}</p>
          )}
        </div>
        {actions && (
          <div className="shrink-0 flex items-center gap-2">{actions}</div>
        )}
      </header>
      <div className={BODY_PAD_CLS[bodyPadding]}>{children}</div>
    </section>
  );
}

export default SectionCard;
