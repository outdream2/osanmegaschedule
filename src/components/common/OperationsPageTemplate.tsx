// src/components/common/OperationsPageTemplate.tsx
// 2026-10-08 · GLOBAL UI 통합 · PageTemplate (단일 소스) 의 thin alias
//   · 기존 call-site 호환성 유지 (Board 등 이미 import 중)
//   · 모든 레이아웃 로직은 PageTemplate 가 책임
//   · 추가 slot (filterbar · kpi) 도 전달 가능하도록 Props 재export

import React from "react";
import { PageTemplate, type PageTemplateProps } from "./PageTemplate";

export type OperationsPageTemplateProps = Omit<PageTemplateProps, "variant">;

export const OperationsPageTemplate: React.FC<OperationsPageTemplateProps> = (props) => {
  return <PageTemplate {...props} variant="operations" />;
};

export default OperationsPageTemplate;
