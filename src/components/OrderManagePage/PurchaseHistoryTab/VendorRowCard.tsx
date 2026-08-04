// src/components/OrderManagePage/PurchaseHistoryTab/VendorRowCard.tsx
// 좌측 공급사 리스트 · 한 줄 컴팩트 (2026-08-03 재구성 · 요청 #253)
//   - 이전: 2줄 카드 (grid + 스파크라인/서브배지)
//   - 지금: 1줄 컴팩트 (다른 페이지 · VendorListEditor·StaffManagePage·발주필요 통일)
// 컬럼 · 공급사(카테고리 좌측) · 매입주기 · 최근매입 · 매입액 · SKU · 판매(1m) · 판매금액(1m)
//   · 헤더 grid-cols 와 100% 동일 폭 (컬럼 정렬 시각적 일치)

import React from "react";
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

// 최근성 텍스트 색상 (배지→텍스트 단순화)
function recencyTextCls(days: number | null): string {
  if (days == null) return "text-slate-300";
  if (days <= 3) return "text-emerald-700";
  if (days <= 14) return "text-amber-700";
  if (days <= 60) return "text-orange-700";
  return "text-slate-400";
}
function recencyLabel(days: number | null): string {
  if (days == null) return "-";
  if (days === 0) return "오늘";
  return `${days}일`;
}

// ─── VendorRowCard · 한 줄 ────────────────────────────────────────────────

export const VendorRowCard: React.FC<VendorRowCardProps> = React.memo(({
  companyName,
  category,
  summary,
  active,
  onSelect,
}) => {
  const days = summary ? daysAgo(summary.last_purchase_date) : null;
  const thisMonth = summary?.this_month_amount ?? 0;
  const skuCount = summary?.sku_count ?? 0;
  const cycle = summary?.avg_cycle_days ?? null;
  const saleQty = summary?.sale_qty_month ?? null;
  const saleAmt = summary?.sale_amount_month ?? null;

  // 매입주기 색상 · 재고관리 29728bb 스타일 참조
  const cycleColor = cycle == null
    ? "text-slate-300"
    : cycle <= 14 ? "text-emerald-700"
    : cycle <= 30 ? "text-sky-700"
    : cycle <= 60 ? "text-teal-700"
    : "text-slate-500";

  const recentCls = recencyTextCls(days);

  return (
    <button
      type="button"
      onClick={onSelect}
      title={`${companyName}${summary?.last_purchase_date ? ` · 최근매입 ${summary.last_purchase_date}` : ""}`}
      className={`group w-full text-left px-2 py-1.5 grid gap-1.5 items-center transition cursor-pointer border-l-2 grid-cols-[1fr_36px_36px_52px_36px_44px_52px] ${
        active
          ? "bg-emerald-50 border-emerald-500"
          : "hover:bg-slate-50 border-transparent"
      }`}
    >
      {/* 1. 공급사 (카테고리 좌측 · 이름) */}
      <div className="flex items-center gap-1 min-w-0">
        <VendorCategoryBadge category={category} className="text-[9px]" />
        <span className={`text-[11px] font-semibold leading-tight truncate ${
          active ? "text-emerald-800" : "text-slate-700"
        }`}>
          {companyName}
        </span>
      </div>
      {/* 2. 매입주기 */}
      <span
        className={`text-right text-[10px] font-black tabular-nums leading-none ${cycleColor}`}
        title={cycle != null ? `매입주기 · 평균 ${cycle}일 (매입일 2회↑ 기준)` : "매입 2회 미만 · 계산 불가"}
      >
        {cycle != null ? `${cycle}일` : "-"}
      </span>
      {/* 3. 최근매입 */}
      <span
        className={`text-right text-[10px] font-black tabular-nums leading-none ${recentCls}`}
        title={summary?.last_purchase_date ?? "매입 이력 없음"}
      >
        {recencyLabel(days)}
      </span>
      {/* 4. 매입액 (이번달) */}
      <span
        className={`text-right text-[10px] font-black tabular-nums leading-none ${
          thisMonth > 0 ? (active ? "text-indigo-800" : "text-indigo-700") : "text-slate-300"
        }`}
        title={`이번달 매입액 · ${thisMonth.toLocaleString()}원`}
      >
        {thisMonth > 0 ? fmtWon(thisMonth) : "-"}
      </span>
      {/* 5. SKU */}
      <span
        className={`text-right text-[10px] font-black tabular-nums leading-none ${
          skuCount > 0 ? "text-slate-600" : "text-slate-300"
        }`}
        title="최근 90일 활성 SKU 종수"
      >
        {skuCount > 0 ? `${skuCount}` : "-"}
      </span>
      {/* 6. 판매(1m) · qty */}
      <span
        className={`text-right text-[10px] font-black tabular-nums leading-none ${
          saleQty != null && saleQty > 0 ? "text-orange-700" : "text-slate-300"
        }`}
        title={saleQty != null && saleQty > 0 ? `최근 1개월 판매수량 · ${saleQty.toLocaleString()}개` : "판매 데이터 매칭 실패 · top-sales 재검토"}
      >
        {saleQty != null && saleQty > 0 ? saleQty.toLocaleString() : "-"}
      </span>
      {/* 7. 판매금액(1m) */}
      <span
        className={`text-right text-[10px] font-black tabular-nums leading-none ${
          saleAmt != null && saleAmt > 0 ? "text-rose-700" : "text-slate-300"
        }`}
        title={saleAmt != null && saleAmt > 0 ? `최근 1개월 판매금액 · ${saleAmt.toLocaleString()}원` : "판매금액 데이터 없음"}
      >
        {saleAmt != null && saleAmt > 0 ? fmtWon(saleAmt) : "-"}
      </span>
    </button>
  );
});
VendorRowCard.displayName = "VendorRowCard";

export default VendorRowCard;
