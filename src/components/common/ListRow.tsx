// src/components/common/ListRow.tsx
// 2026-08-24 · #263 · 리스트 아이템 공용 프리미티브 (목업 톤 · Linear/Vercel/Attio 2026)
//   · 사용처 · 랜딩페이지 입고알림/요청/이벤트 리스트 · Split 왼쪽 리스트 · 알림 등
//   · IconTile + Title + Subtitle + Right meta + Hover accent
//   · a11y · role=listitem · button 은 onClick 있을 때만
//
// 사용:
//   <ListPanel>
//     <ListRow
//       icon={<Package size={15} weight="fill" />}
//       title="상품명"
//       subtitle="부가 텍스트"
//       meta="14:20"
//       onClick={() => ...}
//     />
//   </ListPanel>
//
// 원칙 · 폰트 +2 기본 (title text-[17px] · meta text-[15px] · subtitle text-[14px])
// 원칙 · 파스텔 X · 딥네이비 accent · Attio 톤

import React from "react";
import { Card } from "./Card";

// ═══════════════════════════════════════════════════════════════════
// ListPanel · 리스트 wrapper · Card clip + divide-y
// ═══════════════════════════════════════════════════════════════════
export interface ListPanelProps {
  children: React.ReactNode;
  /** 로딩 시 · opacity 낮춤 · pointer-events X */
  loading?: boolean;
  /** wrapper 추가 className */
  className?: string;
}
export function ListPanel({ children, loading = false, className = "" }: ListPanelProps) {
  return (
    <Card
      clip
      padding="none"
      className={`divide-y divide-line/70 ${loading ? "opacity-40 pointer-events-none" : ""} transition-opacity ${className}`}
    >
      <div role="list">{children}</div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ListRow · 리스트 아이템 · icon + title + subtitle + meta
// ═══════════════════════════════════════════════════════════════════
export interface ListRowProps {
  /** 좌측 아이콘 (lucide/phosphor) · 없으면 tile 자체 미표시 · size 15 권장 */
  icon?: React.ReactNode;
  /** 아이콘 tile tone · 기본 brand (딥네이비 accent) */
  iconTone?: "brand" | "emerald" | "amber" | "rose" | "sky" | "violet" | "zinc";
  /** 제목 · 필수 · 폰트 17px 볼드 */
  title: React.ReactNode;
  /** 서브타이틀 · title 아래 · 폰트 14px · optional */
  subtitle?: React.ReactNode;
  /** 우측 meta · 시간·수량·상태 등 · 폰트 15px */
  meta?: React.ReactNode;
  /** 우측 액션 (버튼·아이콘) · meta 옆 */
  actions?: React.ReactNode;
  /** 클릭 콜백 · 있으면 button semantic + hover 강조 */
  onClick?: () => void;
  /** 선택된 상태 · 활성 강조 (좌측 accent bar + bg) */
  active?: boolean;
  /** aria-label · onClick 시 · button 라벨 */
  ariaLabel?: string;
  /** row className · 특별 케이스 */
  className?: string;
  /** dense · 여백 감소 (px-3 py-2) */
  dense?: boolean;
}

// 2026-08-24 · 사용자 승인 · 랜딩페이지 입고알림 스타일 기준 (더 단정 · 정갈)
//   w-8 h-8 · rounded-lg · font-semibold · brand-tint hover (동일)
const ICON_TONE_MAP: Record<Required<ListRowProps>["iconTone"], { bg: string; ink: string }> = {
  brand:   { bg: "bg-brand-tint",  ink: "text-brand-deep" },
  emerald: { bg: "bg-emerald-50",  ink: "text-emerald-700" },
  amber:   { bg: "bg-amber-50",    ink: "text-amber-700" },
  rose:    { bg: "bg-rose-50",     ink: "text-rose-700" },
  sky:     { bg: "bg-sky-50",      ink: "text-sky-700" },
  violet:  { bg: "bg-violet-50",   ink: "text-violet-700" },
  zinc:    { bg: "bg-zinc-100",    ink: "text-zinc-600" },
};

/**
 * ListRow · 리스트 한 줄 · 랜딩페이지 입고알림 톤 기준 (사용자 승인)
 *   · 아이콘 tile · w-8 h-8 · rounded-lg · brand-tint (기본) · icon size 15
 *   · 제목 · 폰트 17px · semibold · truncate
 *   · 서브타이틀 · 폰트 14px · line-tight · optional
 *   · 우측 meta · 시간·수량 · 폰트 15px · tabular-nums
 *   · 호버 · brand-tint/40 · 부드러운 transition
 *   · active · brand-tint/60 배경 · 좌측 accent bar
 */
export function ListRow({
  icon, iconTone = "brand", title, subtitle, meta, actions,
  onClick, active = false, ariaLabel, className = "", dense = false,
}: ListRowProps) {
  const tone = ICON_TONE_MAP[iconTone];
  const paddingCls = dense ? "px-3 py-2" : "px-4 py-3";
  const cursorCls = onClick ? "cursor-pointer" : "";
  const hoverCls = onClick ? "hover:bg-brand-tint/40 active:bg-brand-tint/60" : "";
  const activeCls = active ? "bg-brand-tint/60" : "";
  const focusCls = onClick ? "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-deep/40 focus-visible:ring-inset" : "";
  const activeAccentCls = active ? "before:content-[''] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r-full before:bg-brand-deep" : "";

  const rowContent = (
    <>
      {icon && (
        <div className={`w-8 h-8 rounded-lg ${tone.bg} flex items-center justify-center shrink-0`}>
          <span className={`${tone.ink} inline-flex`} aria-hidden>{icon}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[17px] font-semibold text-ink truncate leading-tight">
          {title}
        </div>
        {subtitle && (
          <div className="text-[14px] text-ink-soft mt-0.5 leading-snug truncate">
            {subtitle}
          </div>
        )}
      </div>
      {meta && (
        <span className="text-[15px] text-ink-soft shrink-0 whitespace-nowrap tabular-nums">{meta}</span>
      )}
      {actions && (
        <div className="shrink-0 inline-flex items-center gap-1">{actions}</div>
      )}
    </>
  );

  const commonCls = `relative flex items-center gap-3 ${paddingCls} ${hoverCls} ${activeCls} ${activeAccentCls} ${focusCls} transition-colors duration-150 ${className}`;

  if (onClick) {
    return (
      <button
        type="button"
        role="listitem"
        onClick={onClick}
        aria-label={ariaLabel}
        className={`w-full text-left ${commonCls} ${cursorCls}`}
      >
        {rowContent}
      </button>
    );
  }
  return (
    <div role="listitem" className={commonCls}>
      {rowContent}
    </div>
  );
}

export default ListRow;
