// src/components/common/OptimalStockNoteBanner.tsx
// 2026-08-26 · 사용자 지시 · 적정재고 컬럼 있는 리스트 상단 · 기준 일수 코멘트
//   · 발주필요·상품현황·상품정보·트렌딩 등 · 적정재고 표시 리스트 위에 배치
//   · useOptimalStockPeriod (KV setting) · loaded 전에는 non-render

import React from "react";
import { Info } from "lucide-react";
import { useOptimalStockPeriod } from "../../hooks/useOptimalStockPeriod";

interface Props {
  /** 추가 클래스 (여백 조정 등) */
  className?: string;
  /** compact · 아이콘 작게 · py 축소 */
  compact?: boolean;
}

export const OptimalStockNoteBanner: React.FC<Props> = ({ className = "", compact = false }) => {
  const { days, loaded } = useOptimalStockPeriod();
  if (!loaded) return null;
  const py = compact ? "py-1.5" : "py-2.5";
  const px = compact ? "px-3" : "px-4";
  const iconSize = compact ? 13 : 15;
  const textSize = compact ? "text-[13px]" : "text-[14px]";
  return (
    <div className={`inline-flex items-center gap-2 ${px} ${py} rounded-lg bg-sky-50 border border-sky-200 ${textSize} font-semibold text-sky-800 ${className}`}>
      <Info size={iconSize} className="text-sky-600 shrink-0" strokeWidth={2.2} />
      <span>
        현재 적정재고는 <b className="text-brand-deep">{days}일</b> 기준입니다
      </span>
    </div>
  );
};

export default OptimalStockNoteBanner;
