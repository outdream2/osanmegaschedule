// src/components/common/PageTemplate.tsx
// 2026-10-08 · GLOBAL UI · 단일 통합 Page Template (reference-tone)
//   · 이전 · OperationsPageTemplate · MasterDetailPageTemplate · AnalyticsPageTemplate 3개 중복
//   · 이후 · 하나의 PageTemplate 으로 통합 · slot 조합으로 모든 variant 흡수
//   · 3개 named export (Operations · MasterDetail · Analytics) 는 이 파일의 thin alias로 유지 (backward compat)
//
// 레퍼런스 이미지 (Flowrit 매입이력) tone 준수:
//
//   [Line Tabs (navy shell 안 혹은 content 상단)]
//   ─────────────────────────────────────────────────────────
//
//   매입이력          [날짜 range picker · actions]
//   매입 이력 및 상세 내역 확인
//   ─────────────────────────────────────────────────────────   <-- border-b slate-200
//
//   [검색..............]  [상태 ▾]  [기간 ▾]  [+ 필터]           <-- toolbar (compact)
//
//   [전체 324]  [입고완료 218]  [입고대기 56]  [부분입고 32]      <-- filterbar (chips)
//
//   [KPI]  [KPI]  [KPI]  [KPI]                                     <-- kpi strip
//
//   ╭─────────────────────────────────────────────────────────╮
//   │   Dense table / list / split panel · body               │
//   ╰─────────────────────────────────────────────────────────╯
//
// 사용 예:
//   <PageTemplate
//     title="매입이력"
//     description="매입 이력 및 상세 내역 확인"
//     actions={<DateRangePicker />}
//     toolbar={<SearchRow />}
//     filterbar={<StatusChips />}
//     kpi={<KpiStrip />}
//   >
//     <PurchaseTable />
//   </PageTemplate>
//
// NOTE
//   · 모든 slot 은 optional. 필요 없으면 undefined 전달.
//   · state / effect / API / handler 는 각 page 가 보유. template 은 presentation wrapper.
//   · AppNavHeader 는 각 page 가 직접 render (sidebar/mobile 분기 책임).

import React from "react";

export interface PageTemplateProps {
  /** Line Tabs row (예: TabBar) · content 상단에 border 없이 배치 */
  tabs?: React.ReactNode;
  /** Page title · 22-26px bold (ReactNode 허용 · 인라인 icon 가능) */
  title?: React.ReactNode;
  /** 설명 · 13-14 muted */
  description?: React.ReactNode;
  /** title row 우측 · 날짜 range · refresh · primary action 등 */
  actions?: React.ReactNode;
  /** 검색 + dropdown + primary action 한 줄 compact row (optional) */
  toolbar?: React.ReactNode;
  /** 상태/카테고리 chip row (filterbar 와 toolbar 를 분리할 때 사용 · optional) */
  filterbar?: React.ReactNode;
  /** KPI card strip (optional · 보통 analytics 용) */
  kpi?: React.ReactNode;
  /** body (table · list · chart · split panel · 자유 content) */
  children?: React.ReactNode;
  /** container className override · 기본 full-width · 반응형 padding */
  containerClassName?: string;
  /** data-template 식별자 (operations · master-detail · analytics · generic) */
  variant?: "operations" | "master-detail" | "analytics" | "generic";
}

/**
 * GLOBAL UI 통합 Page Template · presentation-only slot composer
 */
export const PageTemplate: React.FC<PageTemplateProps> = ({
  tabs,
  title,
  description,
  actions,
  toolbar,
  filterbar,
  kpi,
  children,
  containerClassName,
  variant = "generic",
}) => {
  const container = containerClassName ?? "flex-1 w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex flex-col gap-3 sm:gap-4 min-h-0";

  return (
    <main className={container} data-template={variant}>
      {/* Line Tabs row · content 상단 전체 폭 (padding 음수 margin 으로 상쇄) */}
      {tabs && (
        <div className="shrink-0 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
          {tabs}
        </div>
      )}

      {/* Title + description + actions · 하단 slate-200 divider (단일 visual anchor) */}
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

      {/* Compact toolbar · search / dropdown / primary action */}
      {toolbar != null && (
        <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-2 min-h-[40px]">
          {toolbar}
        </div>
      )}

      {/* Filter chip row · toolbar 아래 (분리된 scanning line) */}
      {filterbar != null && (
        <div className="shrink-0 flex flex-wrap items-center gap-x-2 gap-y-2">
          {filterbar}
        </div>
      )}

      {/* KPI strip · dense grid (page 가 자체 grid 책임 · wrapper 는 band 만) */}
      {kpi != null && <div className="shrink-0">{kpi}</div>}

      {/* Body (free content area) */}
      {children != null && (
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      )}
    </main>
  );
};

export default PageTemplate;
