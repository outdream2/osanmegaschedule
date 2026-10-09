// src/components/DisplayPage/overviews/SalesRevenueOverview.tsx
// 2026-10-09 · GLOBAL UI · 판매·매출 통합 대시보드 · 한 페이지 통합 + Modal
//   · Revenue functional 보호 (hotfix 0edb1c3f) · 자체 매출 fetch 없음
//   · 각 섹션 click → setDpSubTab(revenue/statistics) · modal 영역 placeholder

import React, { useState } from "react";
import { CurrencyKrw, ChartBar, Receipt, Users, TrendUp, ChartLineUp, ChartPie, Target, Package } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import {
  OverviewL2TabsRow, OverviewToolbar, OverviewSection, OverviewKpi,
} from "./StoreOverviewPrimitives";

export interface SalesRevenueOverviewProps { onSelectSubTab: (sub: DpSubTabKey) => void; }

export const SalesRevenueOverview: React.FC<SalesRevenueOverviewProps> = ({ onSelectSubTab }) => {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<"7" | "14" | "30">("14");

  const section = (opts: { key: string; icon: React.ReactNode; title: string; sub?: string; onClick: () => void }) => (
    <button key={opts.key} type="button" onClick={opts.onClick}
      className="w-full flex items-center gap-2 px-2 h-10 rounded-md text-left transition-colors hover:bg-slate-50 cursor-pointer">
      <span className="shrink-0 text-ink-soft">{opts.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-ink truncate">{opts.title}</div>
        {opts.sub && <div className="text-[12px] text-ink-soft truncate">{opts.sub}</div>}
      </div>
    </button>
  );

  return (
    <div className="flex flex-col gap-4 min-h-0 pb-6">
      <OverviewL2TabsRow active="overview" tabs={[{ key: "overview", label: "현황" }]} onSelect={() => {}} />
      <OverviewToolbar search={search} onSearch={setSearch} placeholder="상품·카테고리 검색"
        right={
          <select value={period} onChange={(e) => setPeriod(e.target.value as any)}
            className="h-9 px-2.5 text-[13px] font-medium text-ink border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-brand-tint">
            <option value="7">최근 7일</option><option value="14">최근 14일</option><option value="30">최근 30일</option>
          </select>
        }
      />

      <div className="px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewKpi icon={<CurrencyKrw size={16} weight="fill" />} label="오늘 매출" value="-" tone="brand" hint="매출 메뉴 확인" />
        <OverviewKpi icon={<Users size={16} weight="fill" />} label="고객수" value="-" tone="emerald" hint="상세 확인" />
        <OverviewKpi icon={<Receipt size={16} weight="fill" />} label="객단가" value="-" tone="violet" hint="상세 확인" />
        <OverviewKpi icon={<TrendUp size={16} weight="fill" />} label="마진율" value="-" tone="amber" hint="상세 확인" />
      </div>

      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <OverviewSection
          title={<span>매출 분석 <span className="ml-1.5 text-[13px] font-medium text-ink-soft">RevenuePage</span></span>}
          action={<button type="button" onClick={() => onSelectSubTab("revenue")} className="text-[13px] font-semibold text-brand-deep hover:underline">열기</button>}
        >
          <div className="flex flex-col gap-0.5">
            {section({ key: "rev-1", icon: <CurrencyKrw size={14} />, title: "오늘·기간별 매출", sub: "시간대 · 월별 분석", onClick: () => onSelectSubTab("revenue") })}
            {section({ key: "rev-2", icon: <TrendUp size={14} />, title: "매출 추이", sub: "ERP sales 기반", onClick: () => onSelectSubTab("revenue") })}
          </div>
        </OverviewSection>

        <OverviewSection
          title={<span>판매 통계 <span className="ml-1.5 text-[13px] font-medium text-ink-soft">상품·카테고리</span></span>}
          action={<button type="button" onClick={() => onSelectSubTab("statistics")} className="text-[13px] font-semibold text-brand-deep hover:underline">열기</button>}
        >
          <div className="flex flex-col gap-0.5">
            {section({ key: "sta-1", icon: <ChartBar size={14} />, title: "상품별 판매 통계", sub: "TOP 판매 상품", onClick: () => onSelectSubTab("statistics") })}
            {section({ key: "sta-2", icon: <ChartPie size={14} />, title: "카테고리별 매출", sub: "분류별 구성", onClick: () => onSelectSubTab("statistics") })}
            {section({ key: "sta-3", icon: <ChartLineUp size={14} />, title: "판매 이력", sub: "최근 거래 확인", onClick: () => onSelectSubTab("statistics") })}
          </div>
        </OverviewSection>

        <OverviewSection
          title={<span>수익·마진 <span className="ml-1.5 text-[13px] font-medium text-ink-soft">상세 메뉴</span></span>}
          action={<button type="button" onClick={() => onSelectSubTab("statistics")} className="text-[13px] font-semibold text-brand-deep hover:underline">열기</button>}
        >
          <div className="flex flex-col gap-0.5">
            {section({ key: "mar-1", icon: <Target size={14} />, title: "마진 분석", sub: "상품별 수익률", onClick: () => onSelectSubTab("statistics") })}
            {section({ key: "mar-2", icon: <Package size={14} />, title: "저마진 알림", sub: "주의 필요 상품", onClick: () => onSelectSubTab("statistics") })}
          </div>
        </OverviewSection>
      </div>

      <div className="px-4 sm:px-6">
        <OverviewSection title={<span>판매·매출 바로가기</span>}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            {section({ key: "gw-1", icon: <CurrencyKrw size={14} className="text-brand-deep" />, title: "매출 분석 (Revenue)", sub: "ERP sales · 시간대/월별", onClick: () => onSelectSubTab("revenue") })}
            {section({ key: "gw-2", icon: <ChartBar size={14} className="text-emerald-600" />, title: "판매 통계", sub: "상품·카테고리 분석", onClick: () => onSelectSubTab("statistics") })}
          </div>
        </OverviewSection>
      </div>
    </div>
  );
};

export default SalesRevenueOverview;
