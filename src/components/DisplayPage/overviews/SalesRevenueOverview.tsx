// src/components/DisplayPage/overviews/SalesRevenueOverview.tsx
// 2026-10-09 · GLOBAL UI · 판매·매출 Single-Page Operations Console
//   · L2 폐기 · Revenue functional 보호 (hotfix 0edb1c3f)
//   · Revenue page 자체 엠베드는 복잡 reconnect 필요 · 이번 pass에서는 통합 shell + Analytics 안내 섹션
//     + 추후 Revenue summary endpoint 재사용 시 KPI/chart enrichment 가능

import React, { useState } from "react";
import { CurrencyKrw, ChartBar, Receipt, Users, TrendUp } from "@phosphor-icons/react";
import {
  OverviewPageHeader, OverviewToolbar, OverviewSection, OverviewKpi,
} from "./StoreOverviewPrimitives";

export interface SalesRevenueOverviewProps { onSelectSubTab: (sub: any) => void; }

export const SalesRevenueOverview: React.FC<SalesRevenueOverviewProps> = () => {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<"7" | "14" | "30">("14");

  return (
    <div className="flex flex-col gap-4 min-h-0 pb-6 bg-[#F4F7FA]">
      <OverviewPageHeader title="판매·매출" description="판매 및 매출 분석을 한 페이지에서 처리합니다" />

      <OverviewToolbar search={search} onSearch={setSearch} placeholder="상품·카테고리 검색"
        right={
          <select value={period} onChange={(e) => setPeriod(e.target.value as any)}
            className="h-10 px-3 text-[14px] font-medium text-ink border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-brand-tint">
            <option value="7">최근 7일</option><option value="14">최근 14일</option><option value="30">최근 30일</option>
          </select>
        }
      />

      <div className="px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewKpi icon={<CurrencyKrw size={18} weight="fill" />} label="오늘 매출" value="-" tone="brand" hint="Revenue summary endpoint 통합 예정" />
        <OverviewKpi icon={<Users size={18} weight="fill" />} label="고객수" value="-" tone="emerald" hint="통합 예정" />
        <OverviewKpi icon={<Receipt size={18} weight="fill" />} label="객단가" value="-" tone="violet" hint="통합 예정" />
        <OverviewKpi icon={<TrendUp size={18} weight="fill" />} label="마진율" value="-" tone="amber" hint="통합 예정" />
      </div>

      <div className="px-4 sm:px-6">
        <OverviewSection title={<span>Revenue 통합 안내</span>}>
          <div className="flex items-start gap-3 p-4 border border-brand-deep/15 bg-brand-tint/30 rounded-lg text-[14px]">
            <ChartBar size={20} className="text-brand-deep shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-ink">Revenue functional 보호</div>
              <div className="text-[13px] text-ink-soft mt-1">
                Revenue 계산 formula / addOneDay / date semantics / API contract는 hotfix 0edb1c3f에 의해 보호됩니다.
                해당 보호 범위를 유지한 채 Revenue summary endpoint를 활용해 KPI (매출 · 고객수 · 객단가 · 마진율)
                와 추이 chart를 이 페이지로 이관합니다. (별도 workstream handoff · 통합 후 재배포)
              </div>
            </div>
          </div>
        </OverviewSection>
      </div>

      <div className="px-4 sm:px-6">
        <OverviewSection title={<span>판매·매출 섹션 플레이스홀더 (향후 통합)</span>}>
          <ul className="text-[14px] text-ink-soft list-disc pl-5 space-y-1">
            <li>오늘/기간별 매출 (ERP sales 기반 · 시간대 · 월별)</li>
            <li>최근 판매 내역 · row click → SalesDetailModal</li>
            <li>TOP 상품 · 카테고리 분석</li>
            <li>저마진 알림 · 환불 요약</li>
          </ul>
          <div className="text-[12px] text-ink-soft mt-2">
            이 섹션들은 Revenue summary API 재연결 후 실제 데이터로 교체됩니다. 신규 계산 없음.
          </div>
        </OverviewSection>
      </div>
    </div>
  );
};

export default SalesRevenueOverview;
