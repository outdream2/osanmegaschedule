// src/components/common/AnalyticsPageTemplate.tsx
// 2026-10-08 · GLOBAL UI 통합 · PageTemplate (단일 소스) 의 thin alias
//   · 기존 call-site 호환성 유지 (VatPrepare 등 이미 import 중)
//   · controls → PageTemplate.toolbar · kpi → PageTemplate.kpi · primary/secondary → children
//   · title row divider · widening · spacing 모두 PageTemplate 통일

import React from "react";
import { PageTemplate, type PageTemplateProps } from "./PageTemplate";

export interface AnalyticsPageTemplateProps extends Omit<PageTemplateProps, "variant" | "toolbar" | "filterbar" | "children"> {
  /** period / metric controls row (alias of toolbar) */
  controls?: React.ReactNode;
  /** primary analysis slot (rendered first inside body) */
  primary?: React.ReactNode;
  /** secondary breakdown slot (rendered second inside body) */
  secondary?: React.ReactNode;
  /** 자유 body (controls/kpi/primary/secondary 외 추가 content) */
  children?: React.ReactNode;
}

export const AnalyticsPageTemplate: React.FC<AnalyticsPageTemplateProps> = ({
  controls,
  primary,
  secondary,
  children,
  ...rest
}) => {
  return (
    <PageTemplate {...rest} variant="analytics" toolbar={controls}>
      {primary != null && <div className="shrink-0 flex flex-col gap-3">{primary}</div>}
      {secondary != null && <div className="flex-1 min-h-0 flex flex-col gap-3">{secondary}</div>}
      {children}
    </PageTemplate>
  );
};

export default AnalyticsPageTemplate;
