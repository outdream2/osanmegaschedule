// src/components/common/VendorCategoryBadge.tsx
// 공급사 분류(category) 표시 컴포넌트 · 2026-08-03 · 배지 → 텍스트 전환
// 위탁(violet) · 선결제(rose) · 60회전(emerald) · 90회전(teal) · 기타(slate)
// category null/empty 시 아무것도 렌더하지 않음
// 2026-07-31 · 사용자 확정 · "회전" 단일 → "60회전"/"90회전" 세분화
// 2026-08-03 · 사용자 요청 · 배지 대신 색상 텍스트 표시 · whitespace-nowrap
// 2026-08-06 · "60일회전"/"90일회전" → "60회전"/"90회전" 전체 리네임

import React from "react";

export type VendorCategory = "위탁" | "선결제" | "60회전" | "90회전" | "기타";

// 색상 텍스트 스타일 (배경/테두리 제거)
const CATEGORY_TEXT: Record<VendorCategory, string> = {
  위탁:     "text-violet-600",
  선결제:   "text-rose-600",
  "60회전": "text-emerald-600",
  "90회전": "text-teal-600",
  기타:     "text-zinc-500",
};

interface VendorCategoryBadgeProps {
  category: string | null | undefined;
  className?: string;
}

const VALID_CATEGORIES: readonly VendorCategory[] = ["위탁", "선결제", "60회전", "90회전", "기타"] as const;

/** 공급사 분류 표시 (텍스트) · null 이면 null 반환 */
export const VendorCategoryBadge: React.FC<VendorCategoryBadgeProps> = ({
  category,
  className = "",
}) => {
  if (!category) return null;
  const trimmed = String(category).trim();
  if (!VALID_CATEGORIES.includes(trimmed as VendorCategory)) return null;
  const style = CATEGORY_TEXT[trimmed as VendorCategory];
  return (
    <span
      className={`inline-block text-[11px] font-bold leading-none shrink-0 whitespace-nowrap ${style} ${className}`}
    >
      {trimmed}
    </span>
  );
};
