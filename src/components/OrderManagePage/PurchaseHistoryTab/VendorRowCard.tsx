// src/components/OrderManagePage/PurchaseHistoryTab/VendorRowCard.tsx
// 좌측 공급사 리스트 · 카드형 3줄 (2026-08-03 · 컬럼 확장)
// Line 1 · 공급사명 + 분류 배지 + 최근 매입일 배지 (D+N)
// Line 2 · 이번달 매입액 + 12주 스파크라인 + SKU 종수
// Line 3 (신규) · 최근 한달 판매량·판매금액 + 매입주기
// Zoho·QuickBooks Purchases by Vendor 벤치마크

import React, { useMemo } from "react";
import { VendorCategoryBadge } from "../../common/VendorCategoryBadge";

export interface VendorSummary {
  last_purchase_date: string | null;
  first_purchase_date?: string | null;
  this_month_amount: number;
  total_amount: number;
  purchase_count: number;
  sku_count: number;
  weekly_sparkline: number[];
  /** purchase_details 기반 · 서로다른매입일 2회↑일 때만 · 아니면 null */
  avg_cycle_days?: number | null;
  /** top-sales?months=1 조인 · 최근 한달 판매량 · 없으면 null */
  sale_qty_month?: number | null;
  /** top-sales?months=1 조인 · 최근 한달 판매금액 · 없으면 null */
  sale_amount_month?: number | null;
}

interface VendorRowCardProps {
  vendorId: number;
  companyName: string;
  category: string | null;
  summary: VendorSummary | null; // null 이면 요약 데이터 없음
  active: boolean;
  onSelect: () => void;
}

// ─── helpers ──────────────────────────────────────────────────────────────

function fmtWon(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString();
}

function daysAgo(iso: string | null): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const nowYmd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((nowYmd.getTime() - d.getTime()) / dayMs));
}

// 최근성 배지 색상 · 회복력 있는 신호
function recencyStyle(days: number | null): { label: string; cls: string } {
  if (days == null) return { label: "매입없음", cls: "bg-slate-100 text-slate-400 border-slate-200" };
  if (days === 0) return { label: "오늘", cls: "bg-emerald-100 text-emerald-700 border-emerald-300" };
  if (days <= 3) return { label: `${days}일전`, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (days <= 14) return { label: `${days}일전`, cls: "bg-amber-50 text-amber-700 border-amber-200" };
  if (days <= 60) return { label: `${days}일전`, cls: "bg-orange-50 text-orange-700 border-orange-200" };
  return { label: `${days}일전`, cls: "bg-slate-100 text-slate-500 border-slate-300" };
}

// ─── SparklineBars · 12칸 CSS bars ────────────────────────────────────────

const SparklineBars: React.FC<{ data: number[]; active: boolean }> = React.memo(({ data, active }) => {
  const max = useMemo(() => {
    const m = Math.max(...data, 0);
    return m > 0 ? m : 1;
  }, [data]);
  const barColor = active ? "bg-emerald-500" : "bg-slate-300 group-hover:bg-emerald-400";
  return (
    <div className="flex items-end gap-[1px] h-4 flex-1 min-w-0" aria-hidden="true">
      {data.map((v, i) => {
        const h = Math.max(2, Math.round((v / max) * 16));
        return (
          <div
            key={i}
            className={`w-full rounded-sm transition-colors ${v > 0 ? barColor : "bg-slate-100"}`}
            style={{ height: `${h}px` }}
          />
        );
      })}
    </div>
  );
});
SparklineBars.displayName = "SparklineBars";

// ─── VendorRowCard ────────────────────────────────────────────────────────

export const VendorRowCard: React.FC<VendorRowCardProps> = React.memo(({
  companyName,
  category,
  summary,
  active,
  onSelect,
}) => {
  const days = summary ? daysAgo(summary.last_purchase_date) : null;
  const recency = recencyStyle(days);
  const thisMonth = summary?.this_month_amount ?? 0;
  const skuCount = summary?.sku_count ?? 0;
  const sparkline = summary?.weekly_sparkline ?? new Array(12).fill(0);
  const cycle = summary?.avg_cycle_days ?? null;
  const saleQty = summary?.sale_qty_month ?? null;
  const saleAmt = summary?.sale_amount_month ?? null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group w-full text-left px-3 py-2 flex flex-col gap-1 transition cursor-pointer border-l-2 ${
        active
          ? "bg-emerald-50 border-emerald-500"
          : "hover:bg-slate-50 border-transparent"
      }`}
    >
      {/* Line 1 · 이름 + 분류 + 최근성 */}
      <div className="flex items-center gap-1.5 w-full min-w-0">
        <VendorCategoryBadge category={category} />
        <span className={`text-[12px] font-semibold leading-tight flex-1 min-w-0 break-words ${
          active ? "text-emerald-800" : "text-slate-700"
        }`}>
          {companyName}
        </span>
        <span
          className={`text-[9px] font-black rounded px-1.5 py-0.5 border leading-none shrink-0 tabular-nums ${recency.cls}`}
          title={summary?.last_purchase_date ?? "매입 이력 없음"}
        >
          {recency.label}
        </span>
      </div>

      {/* Line 2 · 이번달 매입액 + 스파크라인 + SKU */}
      <div className="flex items-center gap-2 w-full min-w-0">
        <span
          className={`text-[10px] font-black tabular-nums shrink-0 ${
            thisMonth > 0 ? (active ? "text-emerald-700" : "text-slate-600") : "text-slate-300"
          }`}
          title={`이번달 매입액 · ${thisMonth.toLocaleString()}원`}
        >
          {fmtWon(thisMonth)}
        </span>
        <SparklineBars data={sparkline} active={active} />
        <span
          className={`text-[9px] font-semibold tabular-nums shrink-0 ${
            skuCount > 0 ? "text-slate-500" : "text-slate-300"
          }`}
          title="최근 3개월 활성 SKU 종수"
        >
          {skuCount > 0 ? `${skuCount}종` : "-"}
        </span>
      </div>

      {/* Line 3 · 최근 한달 판매량·판매금액 + 매입주기 */}
      <div className="flex items-center gap-1.5 w-full min-w-0 pt-0.5">
        {/* 판매량 (지난달) */}
        <span
          className={`text-[9px] font-bold tabular-nums shrink-0 rounded px-1 py-0.5 border ${
            saleQty != null && saleQty > 0
              ? "bg-orange-50 text-orange-700 border-orange-200"
              : "bg-slate-50 text-slate-300 border-slate-100"
          }`}
          title="최근 한달 판매수량 (top-sales 조인)"
        >
          판매 {saleQty != null && saleQty > 0 ? saleQty.toLocaleString() : "-"}
        </span>
        {/* 판매금액 (지난달) */}
        <span
          className={`text-[9px] font-bold tabular-nums shrink-0 rounded px-1 py-0.5 border ${
            saleAmt != null && saleAmt > 0
              ? "bg-indigo-50 text-indigo-700 border-indigo-200"
              : "bg-slate-50 text-slate-300 border-slate-100"
          }`}
          title={`최근 한달 판매금액 · ${saleAmt != null ? saleAmt.toLocaleString() : "-"}원`}
        >
          매출 {saleAmt != null && saleAmt > 0 ? fmtWon(saleAmt) : "-"}
        </span>
        {/* 매입주기 */}
        <span
          className={`ml-auto text-[9px] font-bold tabular-nums shrink-0 rounded px-1 py-0.5 border ${
            cycle != null
              ? cycle <= 14
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : cycle <= 30
                ? "bg-teal-50 text-teal-700 border-teal-200"
                : "bg-slate-50 text-slate-600 border-slate-200"
              : "bg-slate-50 text-slate-300 border-slate-100"
          }`}
          title={cycle != null ? `평균 매입주기 · ${cycle}일` : "매입 2회 미만 · 계산 불가"}
        >
          주기 {cycle != null ? `${cycle}일` : "-"}
        </span>
      </div>
    </button>
  );
});
VendorRowCard.displayName = "VendorRowCard";

export default VendorRowCard;
