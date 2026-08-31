// src/components/common/PageContainer.tsx
// 2026-08-31 · 사용자 지시 · 페이지 표준 폭 컨테이너 프리미티브
//   · 모든 페이지 · 사이드메뉴 오른쪽 컨텐츠 · 표준 폭 85% · max 1360px
//   · <main> 안 wrapper 로 사용 · className 추가 커스터마이징 가능
//   · flex-1 자동 · 세로 방향 · 상하 padding 기본

import React from "react";
import { PAGE_CONTAINER_CLS } from "../../styles/tokens";

export interface PageContainerProps {
  children: React.ReactNode;
  /** 추가 className · 예: "px-4 py-6" · 기본 px-3 sm:px-4 py-3 sm:py-4 */
  className?: string;
  /** flex-1 자동 · 부모가 flex 컨테이너일 때 남는 공간 채움 · default true */
  flex?: boolean;
  /** as tag · default "div" · main·section 등 override 가능 */
  as?: keyof React.JSX.IntrinsicElements;
}

export const PageContainer: React.FC<PageContainerProps> = ({
  children,
  className = "",
  flex = true,
  as: Tag = "div",
}) => {
  const El = Tag as any;
  return (
    <El
      className={`${flex ? "flex-1 " : ""}${PAGE_CONTAINER_CLS} px-3 sm:px-4 py-3 sm:py-4 ${className}`}
    >
      {children}
    </El>
  );
};

export default PageContainer;
