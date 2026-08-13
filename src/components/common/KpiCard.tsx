// src/components/common/KpiCard.tsx
// 2026-08-03 (#183) · 공통 KPI 카드 컴포넌트
//   - 상단 통계 카드 · 카드 안: 라벨 + 값 (+ 서브타이틀 · 아이콘)
//   - 색상 프리셋 · 아이콘 tint · 값 강조
//   - 페이지 · 통일된 상단 요약 UI 구성
//
// 사용 예:
//   <KpiCard icon={ShoppingCart} label="발주요청" value={12} color="rose" />
//   <KpiCard icon={Package} label="총 매입" value="1,234,000원" subtitle="이번달" color="sky" />

import React from "react";

type KpiColor = "sky" | "amber" | "violet" | "teal" | "indigo" | "rose" | "emerald" | "orange" | "slate";

const COLOR_MAP: Record<KpiColor, { icon: string; value: string; ring: string }> = {
  sky:     { icon: "text-sky-500",     value: "text-sky-700",     ring: "border-sky-100"     },
  amber:   { icon: "text-amber-500",   value: "text-amber-700",   ring: "border-amber-100"   },
  violet:  { icon: "text-violet-500",  value: "text-violet-700",  ring: "border-violet-100"  },
  teal:    { icon: "text-teal-500",    value: "text-teal-700",    ring: "border-teal-100"    },
  indigo:  { icon: "text-indigo-500",  value: "text-indigo-700",  ring: "border-indigo-100"  },
  rose:    { icon: "text-rose-500",    value: "text-rose-700",    ring: "border-rose-100"    },
  emerald: { icon: "text-emerald-500", value: "text-emerald-700", ring: "border-emerald-100" },
  orange:  { icon: "text-orange-500",  value: "text-orange-700",  ring: "border-orange-100"  },
  slate:   { icon: "text-zinc-500",   value: "text-zinc-900",   ring: "border-zinc-200"   },
};

type IconLike = React.ComponentType<{
  size?: number;
  className?: string;
  strokeWidth?: number;
}>;

export interface KpiCardProps {
  icon?: IconLike;
  label: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  color?: KpiColor;
  /** 클릭 콜백 (있으면 cursor-pointer + hover) */
  onClick?: () => void;
  className?: string;
}

/**
 * 공통 KPI 카드
 *   - 아이콘 · 라벨 · 값 · 서브타이틀
 *   - 클릭 가능 (선택)
 */
export const KpiCard: React.FC<KpiCardProps> = ({
  icon: Icon,
  label,
  value,
  subtitle,
  color = "slate",
  onClick,
  className = "",
}) => {
  const c = COLOR_MAP[color];
  const clickable = typeof onClick === "function";
  return (
    <div
      className={[
        "kpi-card",
        clickable ? "cursor-pointer hover:shadow-md transition-shadow" : "",
        className,
      ].filter(Boolean).join(" ")}
      onClick={onClick}
      role={clickable ? "button" : undefined}
    >
      <div className="flex items-center gap-1.5">
        {Icon && <Icon size={14} className={`${c.icon} shrink-0`} strokeWidth={2.2} />}
        <span className="kpi-card-label">{label}</span>
      </div>
      <div className={`kpi-card-value ${c.value}`}>
        {value}
      </div>
      {subtitle != null && (
        <div className="text-[11px] font-semibold text-zinc-500">{subtitle}</div>
      )}
    </div>
  );
};

export default KpiCard;
