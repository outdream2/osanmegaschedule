// src/components/OrderManagePage/PurchaseHistoryTab/VendorHeaderPanel.tsx
// 우측 상단 · 공급사 정보 헤더 + KPI (2026-08-03)
// 2026-08-06 · T-COMMON-VendorInfo · 표시 로직 → VendorInfoHeader 위임
//   KPI 계산(calcKpis)은 이 파일에서 유지 · VendorInfoHeader에 kpis prop 전달

import React, { useMemo } from "react";
import { VendorInfoHeader, type VendorKpis, type VendorInfoFull } from "../../common/VendorInfoHeader";
import type { PurchaseDetailRow } from "./PurchaseSubTabs";

// VendorFull · 기존 import 사용처 하위호환 (PurchaseHistoryTab 등)
export type { VendorInfoFull as VendorFull } from "../../common/VendorInfoHeader";

interface VendorHeaderPanelProps {
  vendor: VendorInfoFull;
  detailRows: PurchaseDetailRow[]; // 최근 365일 raw rows · KPI 산출용
  loading: boolean;
}

// ─── KPI 계산 ─────────────────────────────────────────────────────────────

function calcKpis(rows: PurchaseDetailRow[]): VendorKpis {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartYmd = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}-01`;
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // 지난달 말일
  const lmStartYmd = `${lastMonthStart.getFullYear()}-${String(lastMonthStart.getMonth() + 1).padStart(2, "0")}-01`;
  const lmEndYmd = `${lastMonthEnd.getFullYear()}-${String(lastMonthEnd.getMonth() + 1).padStart(2, "0")}-${String(lastMonthEnd.getDate()).padStart(2, "0")}`;

  let total = 0;
  let thisMonth = 0;
  let lastMonth = 0;
  const skuSet = new Set<string>();
  const purchaseDates = new Set<string>();

  for (const r of rows) {
    total += r.amount;
    if (r.date >= monthStartYmd) thisMonth += r.amount;
    if (r.date >= lmStartYmd && r.date <= lmEndYmd) lastMonth += r.amount;
    if (r.product_code) skuSet.add(r.product_code);
    if (r.date) purchaseDates.add(r.date);
  }

  const momPct = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;

  // 평균 매입주기 · distinct date 간 평균 diff
  let avgCycleDays: number | null = null;
  if (purchaseDates.size >= 2) {
    const sorted = Array.from(purchaseDates).sort();
    let sumDiff = 0;
    for (let i = 1; i < sorted.length; i++) {
      const d1 = new Date(sorted[i - 1] + "T00:00:00").getTime();
      const d2 = new Date(sorted[i] + "T00:00:00").getTime();
      sumDiff += (d2 - d1) / (24 * 60 * 60 * 1000);
    }
    avgCycleDays = Math.round(sumDiff / (sorted.length - 1));
  }

  return {
    totalAmount: total,
    thisMonthAmount: thisMonth,
    lastMonthAmount: lastMonth,
    momPct,
    avgCycleDays,
    activeSkuCount: skuSet.size,
  };
}

// ─── VendorHeaderPanel ────────────────────────────────────────────────────

export const VendorHeaderPanel: React.FC<VendorHeaderPanelProps> = ({ vendor, detailRows, loading }) => {
  const kpis = useMemo(() => calcKpis(detailRows), [detailRows]);
  return (
    <VendorInfoHeader
      vendor={vendor}
      kpis={kpis}
      kpisLoading={loading}
      detailRowCount={detailRows.length}
    />
  );
};

export default VendorHeaderPanel;
