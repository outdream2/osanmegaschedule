// src/components/common/ExpiryBadge.tsx
// 2026-09-10 · #36 · 유통기한 임박 · 공통 배지 프리미티브
//   · 상품 조회 모든 곳 · 자동 표시 · 사용자 지시
//   · useExpiryStatus 훅 사용 · 만료·임박·유의 상태 색상 자동
//   · size · sm/md/lg · 위치별 크기 조정
//   · showNormal · D-365 초과 정상 상품 · 배지 표시 여부
//   · 해제 · expiry_date=NULL 리셋 · 배지 자동 사라짐

import React from "react";
import { AlertTriangle } from "lucide-react";
import { useExpiryStatus } from "../../hooks/useExpiryStatus";

interface ExpiryBadgeProps {
  expiryDate: string | null | undefined;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  showNormal?: boolean;        // true 시 · 정상(D>365) 상품도 · 초록 배지 표시
  className?: string;
}

const SIZE_CLS: Record<NonNullable<ExpiryBadgeProps["size"]>, string> = {
  sm: "text-[12px] px-1.5 py-0.5 gap-1",
  md: "text-[14px] px-2 py-0.5 gap-1",
  lg: "text-[16px] px-2.5 py-1 gap-1.5",
};

const ICON_SIZE: Record<NonNullable<ExpiryBadgeProps["size"]>, number> = {
  sm: 12,
  md: 14,
  lg: 16,
};

export const ExpiryBadge: React.FC<ExpiryBadgeProps> = ({
  expiryDate,
  size = "md",
  showIcon = true,
  showNormal = false,
  className = "",
}) => {
  const status = useExpiryStatus(expiryDate);
  if (!status.hasExpiry) return null;
  if (status.level === "normal" && !showNormal) return null;

  const shouldShowIcon = showIcon && (status.isImminent || status.level === "expired");

  return (
    <span
      className={`inline-flex items-center rounded-md border font-semibold tabular-nums ${SIZE_CLS[size]} ${status.colorClass} ${className}`}
      title={expiryDate ? `유통기한 ${String(expiryDate).slice(0, 10)}` : undefined}
    >
      {shouldShowIcon && <AlertTriangle size={ICON_SIZE[size]} strokeWidth={2.5} />}
      {status.label}
    </span>
  );
};
