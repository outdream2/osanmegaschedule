// src/components/common/SaleStatusFilter.tsx
// 2026-08-28 · 사용자 지시 · 판매중 필터 프리미티브 · Segmented Control · D안
//
// Linear/Notion/Attio 2026 톤 · 전체 / 판매중 / 판매중지 3-way
// useSaleStatusFilter 훅과 함께 사용 · storage 지속
//
// 사용:
//   const { value, setValue, matches } = useSaleStatusFilter();
//   <SaleStatusFilter value={value} onChange={setValue} />
//   const filtered = products.filter(p => matches(p.sale_status));
import React from "react";
import type { SaleStatusFilter as SaleStatusFilterValue } from "../../hooks/useSaleStatusFilter";

export interface SaleStatusFilterProps {
  value: SaleStatusFilterValue;
  onChange: (v: SaleStatusFilterValue) => void;
  size?: "sm" | "md";
  className?: string;
  /** 판매중 카운트 · 옵션 · 우측 badge (예: 판매중 · 5,437) */
  activeCount?: number;
  totalCount?: number;
}

const OPTIONS = [
  { k: "all" as const,      label: "전체",    tone: "bg-brand-deep text-white" },
  { k: "active" as const,   label: "판매중",  tone: "bg-emerald-600 text-white" },
  { k: "inactive" as const, label: "판매중지", tone: "bg-zinc-600 text-white" },
];

export const SaleStatusFilter: React.FC<SaleStatusFilterProps> = ({
  value, onChange, size = "sm", className = "", activeCount, totalCount,
}) => {
  const hCls = size === "md" ? "h-9 text-[14px]" : "h-8 text-[13px]";
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <div className="inline-flex items-center bg-white border border-line rounded-lg overflow-hidden shadow-sm">
        {OPTIONS.map((o) => {
          const active = value === o.k;
          return (
            <button
              key={o.k}
              type="button"
              onClick={() => onChange(o.k)}
              className={`${hCls} px-3 font-bold transition cursor-pointer whitespace-nowrap ${active ? o.tone + " shadow-sm" : "text-ink-soft hover:bg-zinc-50 hover:text-brand-deep"}`}
              aria-pressed={active}
              title={`${o.label} 상품만 표시`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {value === "active" && typeof activeCount === "number" && typeof totalCount === "number" && (
        <span className="text-[11px] text-ink-soft tabular-nums whitespace-nowrap">
          {activeCount.toLocaleString()} / {totalCount.toLocaleString()}
        </span>
      )}
    </div>
  );
};

export default SaleStatusFilter;
