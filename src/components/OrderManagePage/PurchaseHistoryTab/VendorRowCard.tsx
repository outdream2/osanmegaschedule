// src/components/OrderManagePage/PurchaseHistoryTab/VendorRowCard.tsx
// 좌측 공급사 리스트 · 한 줄 컴팩트 (2026-08-04 재구성 · 사용자 요청)
//   - 컬럼 · 공급사(카테고리+이름) · 매입액(이번달) · 최근매입일(YYYY-MM-DD) · 매입주기(N일)
//   - SKU · 판매수량 · 판매금액 컬럼 제거 (사용자 요청 · 부가정보라 우측 상세로 이관)
//   - 글씨 크기 12px 최소 (feedback_ui_principles B-2-2)
//   - 헤더 grid-cols 와 100% 동일 폭

import React from "react";
import { VendorCategoryBadge } from "../../common/VendorCategoryBadge";
import { fmtWonNoUnit } from "../../../lib/format";

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

const fmtWon = fmtWonNoUnit;

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
  if (days == null) return "text-zinc-300";
  if (days <= 3) return "text-emerald-700";
  if (days <= 14) return "text-amber-700";
  if (days <= 60) return "text-orange-700";
  return "text-zinc-400";
}

// 최근매입일 · YYYY-MM-DD 원본 (short: MM-DD) + N일전 tooltip
function recentLabel(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "-";
  // "YYYY-MM-DD" 에서 MM-DD 만 표시 · tooltip 에 full ISO
  return iso.slice(5); // "MM-DD"
}

// ─── VendorRowCard · 한 줄 (4컬럼) ────────────────────────────────────────

export const VendorRowCard: React.FC<VendorRowCardProps> = React.memo(({
  companyName,
  category,
  summary,
  active,
  onSelect,
}) => {
  const days = summary ? daysAgo(summary.last_purchase_date) : null;
  const thisMonth = summary?.this_month_amount ?? 0;
  const cycle = summary?.avg_cycle_days ?? null;
  const lastDate = summary?.last_purchase_date ?? null;

  // 매입주기 색상 · 재고관리 29728bb 스타일 참조
  const cycleColor = cycle == null
    ? "text-zinc-300"
    : cycle <= 14 ? "text-emerald-700"
    : cycle <= 30 ? "text-sky-700"
    : cycle <= 60 ? "text-teal-700"
    : "text-zinc-500";

  const recentCls = recencyTextCls(days);

  return (
    <button
      type="button"
      onClick={onSelect}
      title={`${companyName}${lastDate ? ` · 최근매입 ${lastDate}${days != null ? ` (${days}일 전)` : ""}` : ""}`}
      className={`group w-full text-left px-2 py-2 grid gap-1.5 items-center transition cursor-pointer border-l-2 grid-cols-[1fr_64px_60px_52px] ${
        active
          ? "bg-emerald-50 border-emerald-500"
          : "hover:bg-zinc-50 border-transparent"
      }`}
    >
      {/* 1. 공급사 (카테고리 좌측 · 이름) */}
      <div className="flex items-center gap-1 min-w-0">
        <VendorCategoryBadge category={category} className="text-[9px]" />
        <span className={`text-[12px] font-semibold leading-tight truncate ${
          active ? "text-emerald-800" : "text-zinc-700"
        }`}>
          {companyName}
        </span>
      </div>
      {/* 2. 매입액 (이번달) */}
      <span
        className={`text-right text-[12px] font-bold tabular-nums leading-none ${
          thisMonth > 0 ? (active ? "text-indigo-800" : "text-indigo-700") : "text-zinc-300"
        }`}
        title={`이번달 매입액 · ${thisMonth.toLocaleString()}원`}
      >
        {thisMonth > 0 ? fmtWon(thisMonth) : "-"}
      </span>
      {/* 3. 최근매입일 (MM-DD · tooltip 에 full ISO) */}
      <span
        className={`text-right text-[12px] font-bold tabular-nums leading-none ${recentCls}`}
        title={lastDate ? `최근매입 · ${lastDate}${days != null ? ` (${days}일 전)` : ""}` : "매입 이력 없음"}
      >
        {recentLabel(lastDate)}
      </span>
      {/* 4. 매입주기 */}
      <span
        className={`text-right text-[12px] font-bold tabular-nums leading-none ${cycleColor}`}
        title={cycle != null ? `매입주기 · 평균 ${cycle}일 (매입일 2회↑ 기준)` : "매입 2회 미만 · 계산 불가"}
      >
        {cycle != null ? `${cycle}일` : "-"}
      </span>
    </button>
  );
});
VendorRowCard.displayName = "VendorRowCard";

export default VendorRowCard;
