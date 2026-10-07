// src/components/common/MasterDetailPageTemplate.tsx
// 2026-10-08 · GLOBAL UI · Reference-tone application · thin presentation wrapper
//   · 대상 · ProductInfo · VendorStock · StaffManage 등 master-detail 레이아웃
//   · 구조 · (Line Tabs) → title/compact toolbar → workspace (list | detail)
//   · 실제 split rendering은 page가 보유한 SplitPanel을 유지하도록 workspace slot만 노출
//     (기존 selection state · SplitPanel storageKey · mobileRightAsModal 그대로)
//   · 역할 · chrome 통일 (page title · toolbar · 공통 bg + max-w + padding).
//   · 사용자-visible target · line tab 네비 · compact filters · dense list · 선택 시만 detail rail
//
// 사용 예:
//   <MasterDetailPageTemplate
//     title="상품정보"
//     count={filtered.length}
//     toolbar={<FilterRow />}
//   >
//     <SplitPanel left={...} right={...} />
//   </MasterDetailPageTemplate>
//
// NOTE · 빈 detail rail 유지 금지 정책은 각 page의 SplitPanel 호출부에서 결정 (template X).

import React from "react";

export interface MasterDetailPageTemplateProps {
  /** Line Tabs row (TabBar · 선택) */
  tabs?: React.ReactNode;
  /** Page title · 22-26px bold */
  title?: React.ReactNode;
  /** 설명 · 13-14 muted */
  description?: React.ReactNode;
  /** 우측 action slot */
  actions?: React.ReactNode;
  /** compact filter/search toolbar · title 아래 한 줄 */
  toolbar?: React.ReactNode;
  /** workspace · 보통 <SplitPanel left=... right=... /> */
  children: React.ReactNode;
  containerClassName?: string;
}

export const MasterDetailPageTemplate: React.FC<MasterDetailPageTemplateProps> = ({
  tabs,
  title,
  description,
  actions,
  toolbar,
  children,
  containerClassName,
}) => {
  // 2026-10-08 · GLOBAL UI visual recovery · widen + title row baseline divider
  //   · max-w cap 제거 · reference image full-width 활용
  //   · title row 하단 border 추가 · master-detail workspace 영역과 명확 구분
  const container = containerClassName ?? "flex-1 w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex flex-col gap-3 min-h-0";

  return (
    <main className={container} data-template="master-detail">
      {tabs && <div className="shrink-0 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">{tabs}</div>}

      {(title != null || description != null || actions != null) && (
        <header className="flex items-start justify-between gap-3 shrink-0 pt-1 pb-3 border-b border-slate-200">
          <div className="min-w-0 flex-1">
            {title != null && (
              <h1 className="text-[22px] sm:text-[26px] font-bold text-ink tracking-tight leading-tight break-words">
                {title}
              </h1>
            )}
            {description != null && (
              <p className="text-[13px] sm:text-[14px] text-ink-soft mt-1 leading-snug break-words">
                {description}
              </p>
            )}
          </div>
          {actions != null && (
            <div className="shrink-0 flex items-center gap-2">{actions}</div>
          )}
        </header>
      )}

      {toolbar != null && (
        <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-2 min-h-[40px]">
          {toolbar}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </main>
  );
};

export default MasterDetailPageTemplate;
