// src/components/common/SplitRightEmpty.tsx
// 2026-08-24 · #261 · SplitPanel 우측 · 좌측 미선택 시 공용 빈 상태 프리미티브
//   · 사용처 · PurchaseHistoryTab · PaymentInfoTab · VendorManageSplit · ProductInfoPage · 기타
//   · Card wrapper + EmptyState (icon + title + hint)
//   · 폰트 +2 기본 · Attio 톤 · 딥네이비 accent
//
// 사용:
//   {!selected && (
//     <SplitRightEmpty
//       icon={Package}
//       title="좌측에서 공급사를 선택하세요"
//       hint="매입이력 · 상품별 집계 · 매입 추이가 표시됩니다"
//     />
//   )}

import React from "react";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";

export interface SplitRightEmptyProps {
  /** 아이콘 컴포넌트 (lucide/phosphor) · 큰 아이콘 · 24-32 권장 */
  icon?: React.ComponentType<{ size?: number; className?: string; weight?: string }>;
  /** 타이틀 · 예: "좌측에서 공급사를 선택하세요" · string (EmptyState 규격 준수) */
  title: string;
  /** 서브 힌트 · title 아래 · optional */
  hint?: string;
  /** min-height · 기본 400px */
  minHeight?: number | string;
  /** wrapper className · 특수 케이스 */
  className?: string;
}

/**
 * SplitPanel 우측 · 좌측 미선택 시 · 공용 빈 상태
 *   · Card border-line shadow-sm rounded-xl
 *   · flex-1 · 지정 minHeight
 *   · EmptyState primitive 재사용 · 아이콘·제목·힌트
 */
export function SplitRightEmpty({
  icon, title, hint, minHeight = 400, className = "",
}: SplitRightEmptyProps) {
  const mh = typeof minHeight === "number" ? `${minHeight}px` : minHeight;
  return (
    <Card
      variant="raw-sm"
      padding="none"
      rounded="xl"
      className={`flex items-center justify-center flex-1 ${className}`}
      style={{ minHeight: mh } as React.CSSProperties}
    >
      <EmptyState icon={icon} title={title} hint={hint} />
    </Card>
  );
}

export default SplitRightEmpty;
