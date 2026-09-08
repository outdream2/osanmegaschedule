// src/components/OrderManagePage/PurchaseHistoryTab/VendorHeaderPanel.tsx
// 우측 상단 · 공급사 정보 헤더 + KPI (2026-08-03)
// 2026-08-06 · T-COMMON-VendorInfo · 표시 로직 → VendorInfoHeader 위임
// 2026-09-08 · 사용자 지시 · 3개월 매입 · 이번달 매입 · 잔고 (결제내역) 텍스트 라인 통합

import React, { useEffect, useMemo, useState } from "react";
import { VendorInfoHeader, type VendorKpis, type VendorInfoFull } from "../../common/VendorInfoHeader";
import type { PurchaseDetailRow } from "./PurchaseSubTabs";
import { api } from "../../../lib/apiClient";

// VendorFull · 기존 import 사용처 하위호환 (PurchaseHistoryTab 등)
export type { VendorInfoFull as VendorFull } from "../../common/VendorInfoHeader";

interface VendorHeaderPanelProps {
  vendor: VendorInfoFull;
  detailRows: PurchaseDetailRow[]; // 최근 365일 raw rows · KPI 산출용
  loading: boolean;
  /** [조회·수정] 버튼 클릭 콜백 · VendorInfoModal 열기는 부모 담당 */
  onEdit?: () => void;
}

// ─── KPI 계산 ─────────────────────────────────────────────────────────────

function calcKpis(rows: PurchaseDetailRow[]): VendorKpis {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartYmd = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}-01`;
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const lmStartYmd = `${lastMonthStart.getFullYear()}-${String(lastMonthStart.getMonth() + 1).padStart(2, "0")}-01`;
  const lmEndYmd = `${lastMonthEnd.getFullYear()}-${String(lastMonthEnd.getMonth() + 1).padStart(2, "0")}-${String(lastMonthEnd.getDate()).padStart(2, "0")}`;
  // 2026-09-08 · 3개월 시작일 · today - 90일
  const threeMonthAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const tmStartYmd = `${threeMonthAgo.getFullYear()}-${String(threeMonthAgo.getMonth() + 1).padStart(2, "0")}-${String(threeMonthAgo.getDate()).padStart(2, "0")}`;

  let total = 0;
  let thisMonth = 0;
  let lastMonth = 0;
  let threeMonth = 0;
  const skuSet = new Set<string>();
  const purchaseDates = new Set<string>();

  for (const r of rows) {
    total += r.amount;
    if (r.date >= monthStartYmd) thisMonth += r.amount;
    if (r.date >= lmStartYmd && r.date <= lmEndYmd) lastMonth += r.amount;
    if (r.date >= tmStartYmd) threeMonth += r.amount;
    if (r.product_code) skuSet.add(r.product_code);
    if (r.date) purchaseDates.add(r.date);
  }

  const momPct = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;

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
    threeMonthAmount: threeMonth,
    momPct,
    avgCycleDays,
    activeSkuCount: skuSet.size,
    balance: null, // 별도 fetch
  };
}

// ─── VendorHeaderPanel ────────────────────────────────────────────────────

export const VendorHeaderPanel: React.FC<VendorHeaderPanelProps> = ({ vendor, detailRows, loading, onEdit }) => {
  const kpisBase = useMemo(() => calcKpis(detailRows), [detailRows]);
  // 2026-09-08 · 사용자 지시 · 잔고 · 결제내역 테이블에서 조회 (/api/supplier-balances)
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    if (!vendor?.company_name) { setBalance(null); return; }
    let alive = true;
    api.get<any>(`/api/supplier-balances`)
      .then(({ data }) => {
        if (!alive) return;
        const list = Array.isArray(data) ? data : (data?.rows ?? []);
        const hit = list.find((b: any) => String(b.supplier ?? "").trim() === vendor.company_name.trim());
        setBalance(hit ? Number(hit.balance ?? 0) : null);
      })
      .catch(() => { if (alive) setBalance(null); });
    return () => { alive = false; };
  }, [vendor?.company_name]);
  const kpis: VendorKpis = { ...kpisBase, balance };
  return (
    <VendorInfoHeader
      vendor={vendor}
      kpis={kpis}
      kpisLoading={loading}
      detailRowCount={detailRows.length}
      onEdit={onEdit}
    />
  );
};

export default VendorHeaderPanel;
