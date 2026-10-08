// src/components/common/MasterDetailPageTemplate.tsx
// 2026-10-08 · GLOBAL UI 통합 · PageTemplate (단일 소스) 의 thin alias
//   · 기존 call-site 호환성 유지 (ProductInfo 등 이미 import 중)
//   · 실제 Master-Detail split 은 각 page 의 SplitPanel 이 담당
//   · 템플릿은 chrome (title / toolbar / filterbar / body wrapper) 만 책임

import React from "react";
import { PageTemplate, type PageTemplateProps } from "./PageTemplate";

export type MasterDetailPageTemplateProps = Omit<PageTemplateProps, "variant">;

export const MasterDetailPageTemplate: React.FC<MasterDetailPageTemplateProps> = (props) => {
  return <PageTemplate {...props} variant="master-detail" />;
};

export default MasterDetailPageTemplate;
