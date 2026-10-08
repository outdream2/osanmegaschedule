// src/components/DisplayPage/overviews/OrderReturnOverview.tsx
// 2026-10-08 · GLOBAL UI · 매장 통합 · 발주·반품 현황 overview
//   · 신규 business logic 없음 · 각 widget click → 기존 L2 기능 route
//   · 데이터 source 미확정 widget 은 생략 · fake KPI 금지
//   · navigation · onSelectSubTab(subTab) 를 통해 DisplayPage subTab 전환
//     (기존 setDpSubTab wiring 재사용)

import React from "react";
import { Truck, ArrowsLeftRight, Package, Warning, Plus } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import { OverviewSection, OverviewKpi, OverviewTaskRow, OverviewQuickAction, OverviewEmpty } from "./StoreOverviewPrimitives";

export interface OrderReturnOverviewProps {
  onSelectSubTab: (sub: DpSubTabKey) => void;
}

export const OrderReturnOverview: React.FC<OrderReturnOverviewProps> = ({ onSelectSubTab }) => {
  // 2026-10-08 · widget data sources 는 각 L2 상세 페이지가 담당 (lazy)
  //   · overview 는 navigation hub + Quick actions · 가짜 KPI 생성 금지
  //   · 실제 count/summary endpoint 가 명확해지면 추후 widget enrichment

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {/* KPI strip · 데이터 source 미확정 widget 생략 · 공간은 Quick / Task 로 할당 */}

      {/* 2-col · Today Tasks · Quick / Shortcuts (70:30 reference) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <OverviewSection
          title="오늘 처리할 업무"
          action={
            <button
              type="button"
              onClick={() => onSelectSubTab("purchase-order")}
              className="text-[12px] font-semibold text-brand-deep hover:underline"
            >
              발주 전체
            </button>
          }
        >
          <div className="flex flex-col gap-0.5">
            <OverviewTaskRow
              icon={<Truck size={16} weight="fill" />}
              label="발주요청"
              description="등록된 발주 요청 처리"
              tone="brand"
              onClick={() => onSelectSubTab("purchase-order")}
            />
            <OverviewTaskRow
              icon={<Package size={16} weight="regular" />}
              label="발주필요"
              description="부족 재고 · 신규 발주 대상"
              tone="amber"
              onClick={() => onSelectSubTab("purchase-order")}
            />
            <OverviewTaskRow
              icon={<ArrowsLeftRight size={16} weight="regular" />}
              label="반품 처리"
              description="반품 요청 · 처리 대기"
              tone="rose"
              onClick={() => onSelectSubTab("return")}
            />
            <OverviewTaskRow
              icon={<Warning size={16} weight="regular" />}
              label="이상 · 미입고"
              description="발주·매입 대조 이상"
              tone="rose"
              onClick={() => onSelectSubTab("purchase-order")}
            />
          </div>
        </OverviewSection>

        <OverviewSection title="빠른 이동">
          <div className="flex flex-col gap-2">
            <OverviewQuickAction
              icon={<Plus size={18} weight="bold" />}
              label="발주 요청"
              description="상품 선택 · 공급사별 발주"
              onClick={() => onSelectSubTab("purchase-order")}
            />
            <OverviewQuickAction
              icon={<ArrowsLeftRight size={18} weight="regular" />}
              label="반품 관리"
              description="요청 · 처리 · 이력"
              onClick={() => onSelectSubTab("return")}
            />
          </div>
        </OverviewSection>
      </div>

      {/* 하단 · 최근 활동 (실제 통합 feed source 확정 전까지 생략 placeholder) */}
      <OverviewSection title="최근 발주·반품 활동">
        <OverviewEmpty message="최근 활동 요약은 상세 메뉴에서 확인하실 수 있습니다" />
      </OverviewSection>
    </div>
  );
};

export default OrderReturnOverview;
