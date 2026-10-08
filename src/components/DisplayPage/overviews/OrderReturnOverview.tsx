// src/components/DisplayPage/overviews/OrderReturnOverview.tsx
// 2026-10-08 · GLOBAL UI · 매장 통합 · 발주·반품 현황
//   · Real KPI · listOrderRequests() (orderRequestsApi) · 신규 API/계산 금지
//   · 반품 count source · 현재 standalone endpoint 미확인 → 반품 KPI 생략
//   · 각 widget click → 기존 L2 (setDpSubTab)

import React, { useEffect, useState } from "react";
import { Truck, ArrowsLeftRight, Package, Warning, Plus } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import { OverviewSection, OverviewKpi, OverviewTaskRow, OverviewQuickAction } from "./StoreOverviewPrimitives";
import { listOrderRequests } from "../../../lib/orderRequestsApi";

export interface OrderReturnOverviewProps {
  onSelectSubTab: (sub: DpSubTabKey) => void;
}

export const OrderReturnOverview: React.FC<OrderReturnOverviewProps> = ({ onSelectSubTab }) => {
  // 2026-10-08 · 발주 요청 KPI · listOrderRequests (기존 orderRequestsApi 그대로)
  //   · 신규 count endpoint 생성 금지 · 기존 list fetch 재사용
  //   · pending/active 만 집계 · completed/cancelled 제외
  const [orderStats, setOrderStats] = useState<{ pending: number; total: number } | null>(null);

  useEffect(() => {
    let alive = true;
    listOrderRequests()
      .then((rows) => {
        if (!alive) return;
        const total = Array.isArray(rows) ? rows.length : 0;
        const pending = Array.isArray(rows)
          ? rows.filter((r: any) => r && r.status !== "completed" && r.status !== "cancelled").length
          : 0;
        setOrderStats({ pending, total });
      })
      .catch(() => { if (alive) setOrderStats({ pending: 0, total: 0 }); });
    return () => { alive = false; };
  }, []);

  const kpiValue = (n: number | null | undefined) =>
    n == null ? "-" : n.toLocaleString();

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {/* Real KPI strip · 2개 (발주 요청 pending · 발주 전체) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewKpi label="발주 요청" value={kpiValue(orderStats?.pending)} unit="건" tone="brand" hint="처리 대기" />
        <OverviewKpi label="전체 발주" value={kpiValue(orderStats?.total)} unit="건" tone="neutral" hint="누적" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <OverviewSection
          title="오늘 처리할 업무"
          action={
            <button type="button" onClick={() => onSelectSubTab("purchase-order")}
              className="text-[12px] font-semibold text-brand-deep hover:underline">
              발주 전체
            </button>
          }
        >
          <div className="flex flex-col gap-0.5">
            <OverviewTaskRow
              icon={<Truck size={16} weight="fill" />}
              label="발주요청" description="등록된 발주 요청 처리"
              count={orderStats?.pending != null ? orderStats.pending.toLocaleString() : "-"}
              tone="brand"
              onClick={() => onSelectSubTab("purchase-order")}
            />
            <OverviewTaskRow
              icon={<Package size={16} weight="regular" />}
              label="발주필요" description="부족 재고 · 신규 발주 대상"
              tone="amber"
              onClick={() => onSelectSubTab("purchase-order")}
            />
            <OverviewTaskRow
              icon={<ArrowsLeftRight size={16} weight="regular" />}
              label="반품 처리" description="반품 요청 · 처리 대기"
              tone="rose"
              onClick={() => onSelectSubTab("return")}
            />
            <OverviewTaskRow
              icon={<Warning size={16} weight="regular" />}
              label="이상 · 미입고" description="발주·매입 대조 이상"
              tone="rose"
              onClick={() => onSelectSubTab("purchase-order")}
            />
          </div>
        </OverviewSection>

        <OverviewSection title="빠른 이동">
          <div className="flex flex-col gap-2">
            <OverviewQuickAction icon={<Plus size={18} weight="bold" />}
              label="발주 요청" description="상품 선택 · 공급사별 발주"
              onClick={() => onSelectSubTab("purchase-order")} />
            <OverviewQuickAction icon={<ArrowsLeftRight size={18} weight="regular" />}
              label="반품 관리" description="요청 · 처리 · 이력"
              onClick={() => onSelectSubTab("return")} />
          </div>
        </OverviewSection>
      </div>
    </div>
  );
};

export default OrderReturnOverview;
