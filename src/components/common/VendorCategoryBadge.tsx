// src/components/common/VendorCategoryBadge.tsx
// 공급사 분류(category) 배지 컴포넌트
// 위탁(violet) · 선결제(rose) · 회전(emerald) · 기타(slate)
// category null/empty 시 아무것도 렌더하지 않음

import React from "react";

export type VendorCategory = "위탁" | "선결제" | "회전" | "기타";

const CATEGORY_STYLE: Record<VendorCategory, string> = {
  위탁:   "bg-violet-50 text-violet-700 border-violet-300",
  선결제: "bg-rose-50   text-rose-700   border-rose-300",
  회전:   "bg-emerald-50 text-emerald-700 border-emerald-300",
  기타:   "bg-slate-50  text-slate-600  border-slate-300",
};

interface VendorCategoryBadgeProps {
  category: string | null | undefined;
  className?: string;
}

/** 공급사 분류 배지 — null 이면 null 반환 (JSX 조건부 렌더 불필요) */
export const VendorCategoryBadge: React.FC<VendorCategoryBadgeProps> = ({
  category,
  className = "",
}) => {
  if (!category) return null;
  const style = CATEGORY_STYLE[category as VendorCategory] ?? "bg-slate-50 text-slate-600 border-slate-300";
  return (
    <span
      className={`inline-flex items-center text-[10px] font-black rounded px-1.5 py-0.5 border leading-none shrink-0 ${style} ${className}`}
    >
      {category}
    </span>
  );
};
