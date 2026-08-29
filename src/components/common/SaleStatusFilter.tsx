// src/components/common/SaleStatusFilter.tsx
// 2026-08-28 · 사용자 지시 · 판매중 필터 프리미티브 · Segmented Control · D안
// 2026-08-29 · SegmentedControl 프리미티브 기반 · framework audit 준수
//
// 사용:
//   const { value, setValue, matches } = useSaleStatusFilter();
//   <SaleStatusFilter value={value} onChange={setValue} />
//   const filtered = products.filter(p => matches(p.sale_status));
import React from "react";
import type { SaleStatusFilter as SaleStatusFilterValue } from "../../hooks/useSaleStatusFilter";
import { SegmentedControl } from "./SegmentedControl";

export interface SaleStatusFilterProps {
  value: SaleStatusFilterValue;
  onChange: (v: SaleStatusFilterValue) => void;
  size?: "sm" | "md";
  className?: string;
  /** 판매중 카운트 · 옵션 · 우측 badge (예: 판매중 · 5,437) */
  activeCount?: number;
  totalCount?: number;
}

export const SaleStatusFilter: React.FC<SaleStatusFilterProps> = ({
  value, onChange, size = "sm", className = "", activeCount, totalCount,
}) => {
  return (
    <div className={`inline-flex items-center gap-2 shrink-0 ${className}`}>
      <SegmentedControl
        value={value}
        onChange={onChange}
        size={size}
        ariaLabel="판매 상태 필터"
        options={[
          { value: "all",      label: "전체",     tone: "brand",   title: "전체 상품 표시" },
          { value: "active",   label: "판매중",   tone: "emerald", title: "판매중 상품만 표시" },
          { value: "inactive", label: "판매중지", tone: "zinc",    title: "판매중지 상품만 표시" },
        ]}
      />
      {value === "active" && typeof activeCount === "number" && typeof totalCount === "number" && (
        <span className="text-[11px] text-ink-soft tabular-nums whitespace-nowrap">
          {activeCount.toLocaleString()} / {totalCount.toLocaleString()}
        </span>
      )}
    </div>
  );
};

export default SaleStatusFilter;
