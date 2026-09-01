// src/components/common/FormSection.tsx
// 2026-09-01 · 공용 프리미티브 · Form section (title + description + fields group)
//   · 연관 FormRow 여러 개 그룹핑 · title + optional icon/description
//   · Card + border + rounded · 반복 폼 섹션 패턴 통합
//   · SectionCard 와 유사 · Form 전용 · gap-3 default · rows 자동 배치
//
// 사용 예:
//   <FormSection title="회사 정보" icon={<Building2 size={14} />} description="사업자·주소·대표">
//     <FormRow label="회사명" required><input ... /></FormRow>
//     <FormRow label="주소"><input ... /></FormRow>
//   </FormSection>

import React from "react";
import { Card } from "./Card";

export interface FormSectionProps {
  /** 섹션 제목 */
  title: string;
  /** 제목 좌측 아이콘 (lucide) */
  icon?: React.ReactNode;
  /** 제목 아래 · 설명 (선택) */
  description?: string;
  /** 우측 상단 · 액션 슬롯 (편집·저장 버튼 등) */
  actions?: React.ReactNode;
  /** 필드 사이 간격 · default gap-3 · gap-2 (compact) · gap-4 (loose) */
  gap?: "sm" | "md" | "lg";
  /** Card padding · default md · sm/lg */
  padding?: "sm" | "md" | "lg";
  /** 자식 (FormRow 여러 개) */
  children: React.ReactNode;
  className?: string;
}

const GAP_CLS = { sm: "gap-2", md: "gap-3", lg: "gap-4" } as const;

export const FormSection: React.FC<FormSectionProps> = ({
  title,
  icon,
  description,
  actions,
  gap = "md",
  padding = "md",
  children,
  className = "",
}) => {
  return (
    <Card padding={padding} rounded="lg" className={className}>
      {/* 헤더 · title + description + actions */}
      <div className="flex items-start gap-2 mb-3 pb-2 border-b border-line">
        {icon && (
          <span className="text-brand-deep shrink-0 mt-0.5">{icon}</span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-bold text-ink tracking-tight leading-tight">
            {title}
          </h3>
          {description && (
            <p className="text-[13px] font-medium text-ink-soft mt-0.5 leading-snug">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
      {/* 필드 그리드 · vertical stack · gap 조절 */}
      <div className={`flex flex-col ${GAP_CLS[gap]}`}>
        {children}
      </div>
    </Card>
  );
};

export default FormSection;
