// src/components/DisplayPage/overviews/PurchaseArrivalOverview.tsx
// 2026-10-08 · GLOBAL UI · 매장 통합 · 매입·입고 현황
//   · Real KPI · listStockArrivals (stockArrivalsApi) · 입고알림 published/scheduled 집계
//   · 매입액 등 Purchase canonical calculation 재사용 없음 (purchase-ux-worktree 보호)
//   · 각 widget click → 기존 L2

import React, { useEffect, useState } from "react";
import { Package, Checks as PackageCheck, Bell, Receipt } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import { OverviewSection, OverviewKpi, OverviewTaskRow, OverviewQuickAction } from "./StoreOverviewPrimitives";
import { listStockArrivals } from "../../../lib/stockArrivalsApi";

export interface PurchaseArrivalOverviewProps {
  onSelectSubTab: (sub: DpSubTabKey) => void;
}

export const PurchaseArrivalOverview: React.FC<PurchaseArrivalOverviewProps> = ({ onSelectSubTab }) => {
  // 2026-10-08 · 입고알림 KPI · listStockArrivals (기존 stockArrivalsApi 그대로)
  const [arrivalStats, setArrivalStats] = useState<{ total: number; scheduled: number } | null>(null);

  useEffect(() => {
    let alive = true;
    listStockArrivals()
      .then((rows) => {
        if (!alive) return;
        const total = Array.isArray(rows) ? rows.length : 0;
        const scheduled = Array.isArray(rows)
          ? rows.filter((r: any) => r && (r as any).scheduled_at && new Date((r as any).scheduled_at).getTime() > Date.now()).length
          : 0;
        setArrivalStats({ total, scheduled });
      })
      .catch(() => { if (alive) setArrivalStats({ total: 0, scheduled: 0 }); });
    return () => { alive = false; };
  }, []);

  const kpiValue = (n: number | null | undefined) => n == null ? "-" : n.toLocaleString();

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {/* Real KPI · 입고알림 · 예약 발송 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewKpi label="입고알림" value={kpiValue(arrivalStats?.total)} unit="건" tone="brand" hint="전체 등록" />
        <OverviewKpi label="예약 발송" value={kpiValue(arrivalStats?.scheduled)} unit="건" tone="amber" hint="예정" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <OverviewSection
          title="오늘 처리할 업무"
          action={
            <button type="button" onClick={() => onSelectSubTab("purchase")}
              className="text-[12px] font-semibold text-brand-deep hover:underline">
              매입 전체
            </button>
          }
        >
          <div className="flex flex-col gap-0.5">
            <OverviewTaskRow
              icon={<Package size={16} weight="fill" />}
              label="매입이력" description="최근 매입 · 공급사·상품·단가"
              tone="brand"
              onClick={() => onSelectSubTab("purchase")}
            />
            <OverviewTaskRow
              icon={<Receipt size={16} weight="regular" />}
              label="매입상세" description="거래명세표 · 상세 명세"
              tone="neutral"
              onClick={() => onSelectSubTab("purchase")}
            />
            <OverviewTaskRow
              icon={<PackageCheck size={16} weight="regular" />}
              label="상품 입고 검수" description="실제 입고 수량 · 일치 확인"
              tone="brand"
              onClick={() => onSelectSubTab("purchase")}
            />
            <OverviewTaskRow
              icon={<Bell size={16} weight="regular" />}
              label="입고알림" description="전 직원 알림 · 예약 발송"
              count={arrivalStats?.total != null ? arrivalStats.total.toLocaleString() : "-"}
              tone="amber"
              onClick={() => onSelectSubTab("stock-arrivals")}
            />
          </div>
        </OverviewSection>

        <OverviewSection title="빠른 이동">
          <div className="flex flex-col gap-2">
            <OverviewQuickAction icon={<Package size={18} weight="bold" />}
              label="매입이력" description="공급사별 · 상품별 · 단가변동"
              onClick={() => onSelectSubTab("purchase")} />
            <OverviewQuickAction icon={<Bell size={18} weight="regular" />}
              label="입고알림 작성" description="즉시 · 예약 발송"
              onClick={() => onSelectSubTab("stock-arrivals")} />
          </div>
        </OverviewSection>
      </div>
    </div>
  );
};

export default PurchaseArrivalOverview;
