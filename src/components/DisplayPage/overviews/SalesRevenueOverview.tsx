// src/components/DisplayPage/overviews/SalesRevenueOverview.tsx
// 2026-10-08 · GLOBAL UI · 매장 통합 · 판매·매출 현황 (Reference-tone dashboard · nav hub)
//   · Revenue functional 보호 (hotfix 0edb1c3f) · 자체 매출 fetch 없음
//   · L2 + Toolbar + KPI (placeholder) + Main+Tasks + QuickActions + Bottom + Right
//   · 각 widget click → setDpSubTab (revenue · statistics)

import React, { useState } from "react";
import { ChartBar, CurrencyKrw, TrendUp, Receipt, ChartLineUp, ChartPie, Users, Target } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import {
  OverviewL2TabsRow, OverviewToolbar, OverviewSection, OverviewKpi,
  OverviewTaskRow, OverviewQuickAction, OverviewTable,
  type OverviewTableColumn,
} from "./StoreOverviewPrimitives";

export interface SalesRevenueOverviewProps {
  onSelectSubTab: (sub: DpSubTabKey) => void;
}

const L2_TABS = [
  { key: "overview", label: "현황" },
  { key: "revenue", label: "매출" },
  { key: "statistics", label: "판매·통계" },
];

export const SalesRevenueOverview: React.FC<SalesRevenueOverviewProps> = ({ onSelectSubTab }) => {
  const [search, setSearch] = useState("");

  const columns: OverviewTableColumn[] = [
    { key: "metric", label: "지표" },
    { key: "value", label: "값", align: "right" },
    { key: "source", label: "상세", align: "center" },
  ];
  const rows: Array<Record<string, React.ReactNode>> = [
    { metric: "오늘 매출", value: "매출 메뉴 확인", source: "매출" },
    { metric: "판매 통계", value: "통계 메뉴 확인", source: "판매" },
    { metric: "상품 분석", value: "판매 메뉴 확인", source: "판매" },
    { metric: "카테고리별", value: "판매 메뉴 확인", source: "판매" },
  ];

  return (
    <div className="flex flex-col gap-4 min-h-0 pb-6">
      <OverviewL2TabsRow
        active="overview"
        tabs={L2_TABS}
        onSelect={(k) => {
          if (k === "overview") return;
          if (k === "revenue") onSelectSubTab("revenue");
          else onSelectSubTab("statistics");
        }}
      />

      <OverviewToolbar search={search} onSearch={setSearch} placeholder="상품명 검색" />

      <div className="px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewKpi icon={<CurrencyKrw size={16} weight="fill" />} label="오늘 매출" value="-" tone="brand" hint="매출 메뉴에서 확인" />
        <OverviewKpi icon={<Users size={16} weight="fill" />} label="고객수" value="-" tone="emerald" hint="상세 메뉴 확인" />
        <OverviewKpi icon={<Receipt size={16} weight="fill" />} label="객단가" value="-" tone="violet" hint="상세 메뉴 확인" />
        <OverviewKpi icon={<TrendUp size={16} weight="fill" />} label="마진율" value="-" tone="amber" hint="상세 메뉴 확인" />
      </div>

      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <OverviewSection title="판매·매출 바로가기" action={
          <button type="button" onClick={() => onSelectSubTab("revenue")}
            className="text-[12px] font-semibold text-brand-deep hover:underline">매출 분석</button>
        }>
          <OverviewTable columns={columns} rows={rows} />
        </OverviewSection>

        <OverviewSection title="오늘 처리할 업무">
          <div className="flex flex-col gap-0.5">
            <OverviewTaskRow icon={<CurrencyKrw size={14} />} label="매출 분석" description="기간별·시간대"
              tone="brand" onClick={() => onSelectSubTab("revenue")} />
            <OverviewTaskRow icon={<ChartBar size={14} />} label="판매 통계" description="상품·카테고리"
              tone="brand" onClick={() => onSelectSubTab("statistics")} />
            <OverviewTaskRow icon={<TrendUp size={14} />} label="마진·수익" description="저마진 확인"
              tone="emerald" onClick={() => onSelectSubTab("statistics")} />
            <OverviewTaskRow icon={<Receipt size={14} />} label="판매 이력" description="환불·거래"
              tone="neutral" onClick={() => onSelectSubTab("statistics")} />
          </div>
        </OverviewSection>
      </div>

      <div className="px-4 sm:px-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <OverviewQuickAction icon={<CurrencyKrw size={16} weight="bold" />} label="매출 분석" description="ERP sales"
          tone="brand" onClick={() => onSelectSubTab("revenue")} />
        <OverviewQuickAction icon={<ChartBar size={16} />} label="판매 통계" description="상품·카테고리"
          tone="emerald" onClick={() => onSelectSubTab("statistics")} />
        <OverviewQuickAction icon={<ChartLineUp size={16} />} label="상품 분석" description="TOP 상품"
          tone="violet" onClick={() => onSelectSubTab("statistics")} />
        <OverviewQuickAction icon={<ChartPie size={16} />} label="카테고리" description="분류별 매출"
          tone="amber" onClick={() => onSelectSubTab("statistics")} />
        <OverviewQuickAction icon={<Target size={16} />} label="마진 분석" description="수익률"
          tone="rose" onClick={() => onSelectSubTab("statistics")} />
      </div>

      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <OverviewSection title="판매·매출 메뉴" action={
          <button type="button" onClick={() => onSelectSubTab("statistics")}
            className="text-[12px] font-semibold text-brand-deep hover:underline">전체</button>
        }>
          <div className="flex flex-col gap-0.5">
            <OverviewTaskRow icon={<CurrencyKrw size={14} />} label="매출 분석" description="시간대·월별 ERP sales"
              tone="brand" onClick={() => onSelectSubTab("revenue")} />
            <OverviewTaskRow icon={<ChartBar size={14} />} label="판매 통계" description="상품·카테고리 분석"
              tone="brand" onClick={() => onSelectSubTab("statistics")} />
            <OverviewTaskRow icon={<ChartLineUp size={14} />} label="상품별 추이" description="TOP·저마진"
              tone="emerald" onClick={() => onSelectSubTab("statistics")} />
            <OverviewTaskRow icon={<Receipt size={14} />} label="판매 이력" description="최근 거래 확인"
              tone="neutral" onClick={() => onSelectSubTab("statistics")} />
          </div>
        </OverviewSection>

        <div className="flex flex-col gap-3">
          <OverviewSection title="주요 분석">
            <div className="flex flex-col gap-0.5">
              <OverviewTaskRow icon={<ChartPie size={14} />} label="카테고리별" tone="violet"
                onClick={() => onSelectSubTab("statistics")} />
              <OverviewTaskRow icon={<TrendUp size={14} />} label="마진율" tone="emerald"
                onClick={() => onSelectSubTab("statistics")} />
            </div>
          </OverviewSection>

          <OverviewSection title="고객·리포트">
            <div className="flex flex-col gap-0.5">
              <OverviewTaskRow icon={<Users size={14} />} label="고객 통계" tone="brand"
                onClick={() => onSelectSubTab("statistics")} />
              <OverviewTaskRow icon={<Target size={14} />} label="목표·실적" tone="amber"
                onClick={() => onSelectSubTab("statistics")} />
            </div>
          </OverviewSection>
        </div>
      </div>
    </div>
  );
};

export default SalesRevenueOverview;
