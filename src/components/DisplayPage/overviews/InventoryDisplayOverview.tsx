// src/components/DisplayPage/overviews/InventoryDisplayOverview.tsx
// 2026-10-08 · GLOBAL UI · 매장 통합 · 재고·진열 현황 overview
//   · Shelf SSOT 보호 · 기존 ShelfPositionsBadge/formatCompactDisplayLocation 외 사용 금지
//   · 상품정보/실재고/유통기한 등 세부 기능은 매입 L2 (purchase 경로)로 유지 (기존 location)

import React from "react";
import { Package, Storefront, Clock, ListChecks } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import { OverviewSection, OverviewTaskRow, OverviewQuickAction, OverviewEmpty } from "./StoreOverviewPrimitives";

export interface InventoryDisplayOverviewProps {
  onSelectSubTab: (sub: DpSubTabKey) => void;
}

export const InventoryDisplayOverview: React.FC<InventoryDisplayOverviewProps> = ({ onSelectSubTab }) => {
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <OverviewSection
          title="관리 필요"
          action={
            <button
              type="button"
              onClick={() => onSelectSubTab("store")}
              className="text-[12px] font-semibold text-brand-deep hover:underline"
            >
              매장 구역도
            </button>
          }
        >
          <div className="flex flex-col gap-0.5">
            <OverviewTaskRow
              icon={<Storefront size={16} weight="fill" />}
              label="매장 진열"
              description="구역도 · 담당자 배정 · 실재고"
              tone="brand"
              onClick={() => onSelectSubTab("store")}
            />
            <OverviewTaskRow
              icon={<Package size={16} weight="regular" />}
              label="상품정보 · 실재고"
              description="상품 마스터 · 재고 확인 (매입 메뉴 통합)"
              tone="neutral"
              onClick={() => onSelectSubTab("purchase")}
            />
            <OverviewTaskRow
              icon={<Clock size={16} weight="regular" />}
              label="유통기한 임박"
              description="만료 임박 상품 확인"
              tone="amber"
              onClick={() => onSelectSubTab("purchase")}
            />
            <OverviewTaskRow
              icon={<ListChecks size={16} weight="regular" />}
              label="진열 요청 · 이상"
              description="구역 담당 요청 · 미등록"
              tone="rose"
              onClick={() => onSelectSubTab("store")}
            />
          </div>
        </OverviewSection>

        <OverviewSection title="빠른 이동">
          <div className="flex flex-col gap-2">
            <OverviewQuickAction
              icon={<Storefront size={18} weight="bold" />}
              label="매장 구역도"
              description="StoreZoneMap · 담당자 · 실재고"
              onClick={() => onSelectSubTab("store")}
            />
            <OverviewQuickAction
              icon={<Package size={18} weight="regular" />}
              label="상품 · 재고"
              description="상품정보 · 실재고 확인"
              onClick={() => onSelectSubTab("purchase")}
            />
          </div>
        </OverviewSection>
      </div>

      <OverviewSection title="관리 필요 상품">
        <OverviewEmpty message="재고/유통기한 상세는 상품정보·실재고 메뉴에서 확인하실 수 있습니다" />
      </OverviewSection>
    </div>
  );
};

export default InventoryDisplayOverview;
