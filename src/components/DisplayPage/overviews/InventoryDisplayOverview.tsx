// src/components/DisplayPage/overviews/InventoryDisplayOverview.tsx
// 2026-10-08 · GLOBAL UI · 매장 통합 · 재고·진열 현황
//   · Real KPI · listExpiryImminentProducts (productsApi) · 기존 Expiry endpoint 재사용
//   · listInventoryChecks({...}) · 재고체크 recent count
//   · Shelf SSOT 보호 · formatCompactDisplayLocation 외 사용 금지

import React, { useEffect, useState } from "react";
import { Package, Storefront, Clock, ListChecks } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import { OverviewSection, OverviewKpi, OverviewTaskRow, OverviewQuickAction } from "./StoreOverviewPrimitives";
import { listExpiryImminentProducts } from "../../../lib/productsApi";
import { listInventoryChecks } from "../../../lib/inventoryChecksApi";

export interface InventoryDisplayOverviewProps {
  onSelectSubTab: (sub: DpSubTabKey) => void;
}

export const InventoryDisplayOverview: React.FC<InventoryDisplayOverviewProps> = ({ onSelectSubTab }) => {
  const [expiryCount, setExpiryCount] = useState<number | null>(null);
  const [checkCount, setCheckCount] = useState<number | null>(null);

  // 2026-10-08 · 유통기한 임박 · 기존 /api/products/expiry-imminent 재사용
  useEffect(() => {
    let alive = true;
    listExpiryImminentProducts()
      .then((rows: any) => {
        if (!alive) return;
        setExpiryCount(Array.isArray(rows) ? rows.length : 0);
      })
      .catch(() => { if (alive) setExpiryCount(null); });
    return () => { alive = false; };
  }, []);

  // 2026-10-08 · 실재고 체크 count · 기존 listInventoryChecks 재사용 (전체 · frontend에서 recency 필터 X · 서버 pagination 미지원)
  useEffect(() => {
    let alive = true;
    listInventoryChecks()
      .then((rows: any) => {
        if (!alive) return;
        setCheckCount(Array.isArray(rows) ? rows.length : 0);
      })
      .catch(() => { if (alive) setCheckCount(null); });
    return () => { alive = false; };
  }, []);

  const kpiValue = (n: number | null | undefined) => n == null ? "-" : n.toLocaleString();

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {/* Real KPI · 유통기한 임박 · 최근 7일 실재고 체크 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewKpi label="유통기한 임박" value={kpiValue(expiryCount)} unit="건" tone="amber" hint="만료 임박 상품" />
        <OverviewKpi label="실재고 체크" value={kpiValue(checkCount)} unit="건" tone="brand" hint="누적 기록" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <OverviewSection
          title="관리 필요"
          action={
            <button type="button" onClick={() => onSelectSubTab("store")}
              className="text-[12px] font-semibold text-brand-deep hover:underline">
              매장 구역도
            </button>
          }
        >
          <div className="flex flex-col gap-0.5">
            <OverviewTaskRow
              icon={<Storefront size={16} weight="fill" />}
              label="매장 진열" description="구역도 · 담당자 배정 · 실재고"
              tone="brand"
              onClick={() => onSelectSubTab("store")}
            />
            <OverviewTaskRow
              icon={<Package size={16} weight="regular" />}
              label="상품정보 · 실재고" description="상품 마스터 · 재고 확인 (매입 메뉴 통합)"
              tone="neutral"
              onClick={() => onSelectSubTab("purchase")}
            />
            <OverviewTaskRow
              icon={<Clock size={16} weight="regular" />}
              label="유통기한 임박" description="만료 임박 상품 확인"
              count={expiryCount != null ? expiryCount.toLocaleString() : "-"}
              tone="amber"
              onClick={() => onSelectSubTab("purchase")}
            />
            <OverviewTaskRow
              icon={<ListChecks size={16} weight="regular" />}
              label="진열 요청 · 이상" description="구역 담당 요청 · 미등록"
              tone="rose"
              onClick={() => onSelectSubTab("store")}
            />
          </div>
        </OverviewSection>

        <OverviewSection title="빠른 이동">
          <div className="flex flex-col gap-2">
            <OverviewQuickAction icon={<Storefront size={18} weight="bold" />}
              label="매장 구역도" description="StoreZoneMap · 담당자 · 실재고"
              onClick={() => onSelectSubTab("store")} />
            <OverviewQuickAction icon={<Package size={18} weight="regular" />}
              label="상품 · 재고" description="상품정보 · 실재고 확인"
              onClick={() => onSelectSubTab("purchase")} />
          </div>
        </OverviewSection>
      </div>
    </div>
  );
};

export default InventoryDisplayOverview;
