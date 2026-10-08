// src/components/DisplayPage/overviews/PurchaseArrivalOverview.tsx
// 2026-10-08 · GLOBAL UI · 매장 통합 · 매입·입고 현황 overview
//   · navigation hub · 각 widget click → 기존 L2 route
//   · Purchase calculation 재사용 · 신규 계산 금지

import React from "react";
import { Package, Checks as PackageCheck, Bell, Receipt } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import { OverviewSection, OverviewTaskRow, OverviewQuickAction, OverviewEmpty } from "./StoreOverviewPrimitives";

export interface PurchaseArrivalOverviewProps {
  onSelectSubTab: (sub: DpSubTabKey) => void;
}

export const PurchaseArrivalOverview: React.FC<PurchaseArrivalOverviewProps> = ({ onSelectSubTab }) => {
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <OverviewSection
          title="오늘 처리할 업무"
          action={
            <button
              type="button"
              onClick={() => onSelectSubTab("purchase")}
              className="text-[12px] font-semibold text-brand-deep hover:underline"
            >
              매입 전체
            </button>
          }
        >
          <div className="flex flex-col gap-0.5">
            <OverviewTaskRow
              icon={<Package size={16} weight="fill" />}
              label="매입이력"
              description="최근 매입 확인 · 공급사·상품·단가"
              tone="brand"
              onClick={() => onSelectSubTab("purchase")}
            />
            <OverviewTaskRow
              icon={<Receipt size={16} weight="regular" />}
              label="매입상세"
              description="거래명세표 · 상세 명세"
              tone="neutral"
              onClick={() => onSelectSubTab("purchase")}
            />
            <OverviewTaskRow
              icon={<PackageCheck size={16} weight="regular" />}
              label="상품 입고 검수"
              description="실제 입고 수량 · 일치 확인"
              tone="brand"
              onClick={() => onSelectSubTab("purchase")}
            />
            <OverviewTaskRow
              icon={<Bell size={16} weight="regular" />}
              label="입고알림"
              description="전 직원 알림 · 예약 발송"
              tone="amber"
              onClick={() => onSelectSubTab("stock-arrivals")}
            />
          </div>
        </OverviewSection>

        <OverviewSection title="빠른 이동">
          <div className="flex flex-col gap-2">
            <OverviewQuickAction
              icon={<Package size={18} weight="bold" />}
              label="매입이력"
              description="공급사별 · 상품별 · 단가변동"
              onClick={() => onSelectSubTab("purchase")}
            />
            <OverviewQuickAction
              icon={<Bell size={18} weight="regular" />}
              label="입고알림 작성"
              description="즉시 · 예약 발송"
              onClick={() => onSelectSubTab("stock-arrivals")}
            />
          </div>
        </OverviewSection>
      </div>

      <OverviewSection title="최근 매입·입고 활동">
        <OverviewEmpty message="최근 활동 요약은 상세 메뉴에서 확인하실 수 있습니다" />
      </OverviewSection>
    </div>
  );
};

export default PurchaseArrivalOverview;
