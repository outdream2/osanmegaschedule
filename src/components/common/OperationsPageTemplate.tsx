// src/components/common/OperationsPageTemplate.tsx
// 2026-10-08 · GLOBAL UI · Reference-tone application · thin presentation wrapper
//   · 대상 · Board · Requests · Approval · Business · Document · Settings-type operations pages
//   · 구조 · (Line Tabs) → Page title/description/actions → Compact Toolbar → Dense content
//   · 역할 · layout + spacing + typography wrapper only. NO state / effect / API logic.
//   · 사용자-visible target · flat page header · compact toolbar · dense content surface
//
// 사용 예:
//   <OperationsPageTemplate
//     title="이슈공유"
//     description="팀 전체가 함께 보는 질문·이슈·메모 보드"
//     actions={<Button>+ 새 글</Button>}
//     toolbar={<FilterRow />}
//   >
//     <IssueList />
//   </OperationsPageTemplate>
//
// NOTE · AppNavHeader는 각 page가 자체 렌더 (sidebar/mobile 분기 포함). template은
//       main content frame만 관리.

import React from "react";

export interface OperationsPageTemplateProps {
  /** Line Tabs row (TabBar · 선택). 상단 border baseline은 TabBar 내부가 책임. */
  tabs?: React.ReactNode;
  /** Page title · 22-26px bold */
  title?: React.ReactNode;
  /** 설명 · 13-14 muted */
  description?: React.ReactNode;
  /** title row 우측 action slot (primary action button 등) */
  actions?: React.ReactNode;
  /** compact filter/search toolbar · 48-56 height row */
  toolbar?: React.ReactNode;
  /** 실제 content (list · table · board 등) */
  children: React.ReactNode;
  /** container padding override · default page container */
  containerClassName?: string;
}

export const OperationsPageTemplate: React.FC<OperationsPageTemplateProps> = ({
  tabs,
  title,
  description,
  actions,
  toolbar,
  children,
  containerClassName,
}) => {
  // 2026-10-08 · GLOBAL UI visual recovery · Template 자체 structural signature 강화
  //   · max-w cap 제거 → w-full (reference image · full-width 활용)
  //   · title row 하단 border 추가 → page section 구분 명확
  //   · toolbar는 그 아래 compact row (shell 과 다른 visible band)
  //   · content area는 min-h-0 + flex-1 유지 (table/list sticky header 호환)
  const container = containerClassName ?? "flex-1 w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex flex-col gap-3 sm:gap-4 min-h-0";

  return (
    <main className={container} data-template="operations">
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

export default OperationsPageTemplate;
