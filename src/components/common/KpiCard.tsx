// src/components/common/KpiCard.tsx
// 2026-08-03 · 공통 KPI 카드 (초기 · icon+label+value)
// 2026-08-17 · Vercel Dashboard 톤 개선
//   · 상단 status dot (Vercel ≤10px 규칙) + label
//   · 큰 값 · 뉴트럴 (ink) · active 시 category tone
//   · delta · 양수 emerald ▲ · 음수 rose ▼
//   · hint · label 부가 설명
//   · Backward compat · color/subtitle prop 유지
//
// 사용 예 (신규 · tone/delta 스타일):
//   <KpiCard
//     icon={<ClipboardList size={18} />}
//     label="발주 요청"
//     value={12} unit="건"
//     tone="sky" delta={+3} deltaUnit="%" hint="어제 대비"
//   />
//
// 사용 예 (기존 · color/subtitle · backward compat):
//   <KpiCard icon={ShoppingCart} label="발주요청" value={12} color="rose" subtitle="이번달" />

import React from "react";

// ─── 신규 · tone/delta 스타일 ─────────────────────────────────────
export type KpiTone = "sky" | "emerald" | "amber" | "rose" | "violet" | "teal" | "brand";

const TONE_MAP: Record<KpiTone, { dot: string; valueOn: string; iconOn: string }> = {
  sky:     { dot: "bg-sky-500",     valueOn: "text-sky-700",     iconOn: "text-sky-600" },
  emerald: { dot: "bg-emerald-500", valueOn: "text-emerald-700", iconOn: "text-emerald-600" },
  amber:   { dot: "bg-amber-500",   valueOn: "text-amber-700",   iconOn: "text-amber-600" },
  rose:    { dot: "bg-rose-500",    valueOn: "text-rose-700",    iconOn: "text-rose-600" },
  violet:  { dot: "bg-violet-500",  valueOn: "text-violet-700",  iconOn: "text-violet-600" },
  teal:    { dot: "bg-teal-500",    valueOn: "text-teal-700",    iconOn: "text-teal-600" },
  brand:   { dot: "bg-brand-deep",  valueOn: "text-brand-deep",  iconOn: "text-brand-deep" },
};

// ─── 기존 · color 스타일 (backward compat) ────────────────────────
type KpiColor = "sky" | "amber" | "violet" | "teal" | "indigo" | "rose" | "emerald" | "orange" | "slate";

const COLOR_MAP: Record<KpiColor, { icon: string; value: string }> = {
  sky:     { icon: "text-sky-500",     value: "text-sky-700" },
  amber:   { icon: "text-amber-500",   value: "text-amber-700" },
  violet:  { icon: "text-violet-500",  value: "text-violet-700" },
  teal:    { icon: "text-teal-500",    value: "text-teal-700" },
  indigo:  { icon: "text-indigo-500",  value: "text-indigo-700" },
  rose:    { icon: "text-rose-500",    value: "text-rose-700" },
  emerald: { icon: "text-emerald-500", value: "text-emerald-700" },
  orange:  { icon: "text-orange-500",  value: "text-orange-700" },
  slate:   { icon: "text-zinc-500",    value: "text-zinc-900" },
};

type IconLike = React.ComponentType<{
  size?: number;
  className?: string;
  strokeWidth?: number;
}>;

export interface KpiCardProps {
  /** 아이콘 · 컴포넌트 (Phosphor/lucide) · 또는 ReactNode */
  icon?: IconLike | React.ReactNode;
  /** 라벨 */
  label: React.ReactNode;
  /** 값 · 숫자/문자/ReactNode */
  value: React.ReactNode;
  /** 값 단위 (건·개·원 등) · 신규 API · 값 뒤에 붙음 */
  unit?: string;
  /** 서브타이틀 (backward compat) · value 아래 */
  subtitle?: React.ReactNode;

  // ── 신규 · Vercel Dashboard 톤 ──
  /** 카테고리 tone · dot + active 값 색 · 미지정 시 brand */
  tone?: KpiTone;
  /** delta · 양수 emerald ▲ · 음수 rose ▼ · 0/undefined 미표시 */
  delta?: number;
  /** delta 단위 (%/건 등) */
  deltaUnit?: string;
  /** 라벨 옆 hint · 미소한 부가정보 */
  hint?: React.ReactNode;
  /** active 여부 · 미지정 시 Number(value) > 0 로 자동 판정 (dot opacity + 값 색 결정) */
  isActive?: boolean;

  // ── 기존 · backward compat ──
  /** 색상 (기존 API) · tone 이 있으면 무시 */
  color?: KpiColor;

  /** 클릭 콜백 · 있으면 hover 강조 */
  onClick?: () => void;
  className?: string;
}

/**
 * 공통 KPI 카드
 *   · 신규 · tone/delta/hint · Vercel Dashboard 규칙 (뉴트럴 값 + status dot)
 *   · 기존 · color/subtitle · backward compat 유지
 */
export const KpiCard: React.FC<KpiCardProps> = ({
  icon,
  label,
  value,
  unit,
  subtitle,
  tone,
  delta,
  deltaUnit = "",
  hint,
  isActive,
  color = "slate",
  onClick,
  className = "",
}) => {
  const clickable = typeof onClick === "function";

  // 신규 API (tone) 있으면 우선 · 없으면 backward compat (color)
  const useNewStyle = tone !== undefined;
  const t = useNewStyle ? TONE_MAP[tone!] : null;
  const c = COLOR_MAP[color];

  // active 판정 · dot opacity + 값 색
  const numericValue = typeof value === "number" ? value : Number(value);
  const active = isActive ?? (Number.isFinite(numericValue) && numericValue > 0);

  const valueCls = useNewStyle
    ? (active ? t!.valueOn : "text-ink-soft")
    : c.value;

  // 아이콘 렌더 · 컴포넌트 or ReactNode
  const iconEl = React.useMemo(() => {
    if (!icon) return null;
    if (React.isValidElement(icon)) {
      // ReactNode · 이미 렌더된 element · 딥네이비 색으로 wrap
      return <span className={useNewStyle ? "text-brand-deep shrink-0 inline-flex" : `${c.icon} shrink-0 inline-flex`}>{icon}</span>;
    }
    // ComponentType · 렌더
    const Icon = icon as IconLike;
    return <Icon size={14} className={`${useNewStyle ? "text-brand-deep" : c.icon} shrink-0`} strokeWidth={2.2} />;
  }, [icon, useNewStyle, c.icon]);

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
      {/* 상단 · status dot (신규) + icon + label */}
      <div className="flex items-center gap-1.5">
        {useNewStyle && (
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${t!.dot} ${active ? "" : "opacity-40"}`}
            style={active ? { boxShadow: "0 0 0 3px rgba(0,0,0,0.04)" } : undefined}
          />
        )}
        {iconEl}
        <span className="kpi-card-label">{label}</span>
        {useNewStyle && delta !== undefined && delta !== 0 && (
          <span
            className={`ml-auto inline-flex items-center gap-0.5 text-[12px] font-bold tabular-nums ${
              delta > 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            <span aria-hidden>{delta > 0 ? "▲" : "▼"}</span>
            {Math.abs(delta)}{deltaUnit}
          </span>
        )}
      </div>

      {/* 값 · 큰 숫자 */}
      <div className="flex items-baseline gap-1.5">
        <span className={`kpi-card-value ${valueCls}`}>{value}</span>
        {unit && <span className="text-[14px] font-semibold text-ink-soft">{unit}</span>}
      </div>

      {/* subtitle (backward compat) or hint (신규) */}
      {(subtitle != null || hint != null) && (
        <div className="text-[12px] font-medium text-ink-soft tracking-tight">
          {hint ?? subtitle}
        </div>
      )}
    </div>
  );
};

export default KpiCard;
