// src/components/common/VendorCategoryBadge.tsx
// 공급사 분류(category) 배지 컴포넌트
// 위탁(violet) · 선결제(rose) · 60일회전(emerald) · 90일회전(teal) · 기타(slate)
// category null/empty 시 아무것도 렌더하지 않음
// 2026-07-31 · 사용자 확정 · "회전" 단일 → "60일회전"/"90일회전" 세분화

import React from "react";

export type VendorCategory = "위탁" | "선결제" | "60일회전" | "90일회전" | "기타";

const CATEGORY_STYLE: Record<VendorCategory, string> = {
  위탁:      "bg-violet-50 text-violet-700 border-violet-300",
  선결제:    "bg-rose-50   text-rose-700   border-rose-300",
  "60일회전": "bg-emerald-50 text-emerald-700 border-emerald-300",
  "90일회전": "bg-teal-50   text-teal-700   border-teal-300",
  기타:      "bg-slate-50  text-slate-600  border-slate-300",
};

interface VendorCategoryBadgeProps {
  category: string | null | undefined;
  className?: string;
}

/** 공급사 분류 배지 — null 이면 null 반환 (JSX 조건부 렌더 불필요) */
/**
 * 유효 카테고리 화이트리스트 · DB 에 이 목록 외 값(예: "직영")이 남아있어도 오표시 방지
 * 2026-07-31 · 사용자 요청 · "직영이라는 분류는 없는데" 오표시 이슈 fix
 */
const VALID_CATEGORIES: readonly VendorCategory[] = ["위탁", "선결제", "60일회전", "90일회전", "기타"] as const;

export const VendorCategoryBadge: React.FC<VendorCategoryBadgeProps> = ({
  category,
  className = "",
}) => {
  if (!category) return null;
  const trimmed = String(category).trim();
  // 유효 카테고리만 렌더 · 그 외 값(직영 등 옛 데이터) 은 표시 안 함
  if (!VALID_CATEGORIES.includes(trimmed as VendorCategory)) return null;
  const style = CATEGORY_STYLE[trimmed as VendorCategory];
  return (
    <span
      className={`inline-flex items-center text-[10px] font-black rounded px-1.5 py-0.5 border leading-none shrink-0 ${style} ${className}`}
    >
      {trimmed}
    </span>
  );
};
