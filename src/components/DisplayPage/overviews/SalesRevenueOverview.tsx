// src/components/DisplayPage/overviews/SalesRevenueOverview.tsx
// 2026-10-08 · GLOBAL UI · 매장 통합 · 판매·매출 현황 overview
//   · Revenue functional code 완전 보호 (hotfix 0edb1c3f)
//   · navigation hub · 각 widget click → 기존 L2 route (statistics · revenue)

import React from "react";
import { ChartBar, CurrencyKrw, TrendUp, Receipt } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import { OverviewSection, OverviewTaskRow, OverviewQuickAction } from "./StoreOverviewPrimitives";

export interface SalesRevenueOverviewProps {
  onSelectSubTab: (sub: DpSubTabKey) => void;
}

export const SalesRevenueOverview: React.FC<SalesRevenueOverviewProps> = ({ onSelectSubTab }) => {
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <OverviewSection
          title="오늘 처리할 업무"
          action={
            <button
              type="button"
              onClick={() => onSelectSubTab("revenue")}
              className="text-[12px] font-semibold text-brand-deep hover:underline"
            >
              매출 분석
            </button>
          }
        >
          <div className="flex flex-col gap-0.5">
            <OverviewTaskRow
              icon={<CurrencyKrw size={16} weight="fill" />}
              label="매출 분석"
              description="오늘·기간별 매출 · 시간대 · 월별"
              tone="brand"
              onClick={() => onSelectSubTab("revenue")}
            />
            <OverviewTaskRow
              icon={<ChartBar size={16} weight="regular" />}
              label="판매 통계"
              description="상품별 · 카테고리별 판매 추이"
              tone="brand"
              onClick={() => onSelectSubTab("statistics")}
            />
            <OverviewTaskRow
              icon={<TrendUp size={16} weight="regular" />}
              label="마진 · 수익"
              description="상품별 마진 · 저마진 상품 확인"
              tone="emerald"
              onClick={() => onSelectSubTab("statistics")}
            />
            <OverviewTaskRow
              icon={<Receipt size={16} weight="regular" />}
              label="판매 이력"
              description="최근 판매 내역 · 환불"
              tone="neutral"
              onClick={() => onSelectSubTab("statistics")}
            />
          </div>
        </OverviewSection>

        <OverviewSection title="빠른 이동">
          <div className="flex flex-col gap-2">
            <OverviewQuickAction
              icon={<CurrencyKrw size={18} weight="bold" />}
              label="오늘 매출"
              description="ERP sales · 시간대/월별"
              onClick={() => onSelectSubTab("revenue")}
            />
            <OverviewQuickAction
              icon={<ChartBar size={18} weight="regular" />}
              label="판매 통계"
              description="상품 · 카테고리 분석"
              onClick={() => onSelectSubTab("statistics")}
            />
          </div>
        </OverviewSection>
      </div>

      {/* 2026-10-08 · GLOBAL UI · Revenue functional 보호 (hotfix 0edb1c3f) · 자체 KPI/chart 미설치
             · 상세 매출/통계는 아래 Quick Action 또는 Task row 로 기존 RevenuePage/통계 L2 로 진입 */}
    </div>
  );
};

export default SalesRevenueOverview;
