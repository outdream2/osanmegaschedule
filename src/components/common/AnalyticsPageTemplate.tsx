// src/components/common/AnalyticsPageTemplate.tsx
// 2026-10-08 · GLOBAL UI · Reference-tone application · thin presentation wrapper
//   · 대상 · VatPrepare · Stock analytics · Revenue visual shell only 등
//   · 구조 · (Line Tabs) → title → Period/metric controls → KPI strip → Primary chart → Secondary
//   · 역할 · chrome 통일. slot composition만.
//   · 사용자-visible target · compact title · period controls · KPI strip · primary chart · dense breakdown
//
// 사용 예:
//   <AnalyticsPageTemplate
//     title="부가세 준비"
//     description="공급사별 매입세액 집계 · 신고 준비 체크리스트"
//     controls={<PeriodPicker />}
//     kpi={<KpiStrip />}
//     primary={<MainChart />}
//     secondary={<BreakdownTable />}
//   />

import React from "react";

export interface AnalyticsPageTemplateProps {
  tabs?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** title row 우측 action slot (refresh 등) */
  actions?: React.ReactNode;
  /** period/metric controls row · compact horizontal */
  controls?: React.ReactNode;
  /** KPI strip (horizontal row of KpiCard) */
  kpi?: React.ReactNode;
  /** primary chart / analysis area */
  primary?: React.ReactNode;
  /** secondary breakdown / table */
  secondary?: React.ReactNode;
  /** 자유 영역 · controls/kpi/primary/secondary 모두 사용 안 할 때 children로 전체 영역 사용 */
  children?: React.ReactNode;
  containerClassName?: string;
}

export const AnalyticsPageTemplate: React.FC<AnalyticsPageTemplateProps> = ({
  tabs,
  title,
  description,
  actions,
  controls,
  kpi,
  primary,
  secondary,
  children,
  containerClassName,
}) => {
  const container = containerClassName ?? "flex-1 w-full max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4 flex flex-col gap-3 sm:gap-4 min-h-0";

  return (
    <main className={container} data-template="analytics">
      {tabs && <div className="shrink-0 -mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6">{tabs}</div>}

      {(title != null || description != null || actions != null) && (
        <header className="flex items-start justify-between gap-3 shrink-0 pt-1">
          <div className="min-w-0 flex-1">
            {title != null && (
              <h1 className="text-[22px] sm:text-[24px] font-bold text-ink tracking-tight leading-tight break-words">
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

      {controls != null && <div className="shrink-0 flex flex-wrap items-center gap-2">{controls}</div>}

      {kpi != null && <div className="shrink-0">{kpi}</div>}

      {primary != null && <div className="shrink-0 flex flex-col gap-3">{primary}</div>}

      {secondary != null && <div className="flex-1 min-h-0 flex flex-col gap-3">{secondary}</div>}

      {children}
    </main>
  );
};

export default AnalyticsPageTemplate;
