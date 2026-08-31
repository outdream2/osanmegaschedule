// src/components/common/ListRow.tsx
// 2026-08-24 · #263 · 리스트 아이템 공용 프리미티브 (랜딩 입고알림 톤 · 사용자 승인)
//   · 사용처 · 랜딩 리스트 · Split 왼쪽 리스트 · 알림 · 발주 리스트 등
//   · 말머리표 (dot bullet) + Title + inline Description + Meta + hover accent
//   · 옵션 · 아이콘 tile · body inline · 배지 pill · click modal · 상단 gradient accent
//   · a11y · role=listitem · button 은 onClick 있을 때만
//
// 사용 (심플):
//   <ListPanel topAccent>
//     <ListRow
//       title="상품A"
//       description="공급사 · 재고 12개"
//       meta="20개"
//       onClick={() => open(a)}
//     />
//   </ListPanel>
//
// 원칙 · 폰트 +2 (title 19 · desc 15 · meta 17) · 40대+ 가독성
// 원칙 · 파스텔 X · 딥네이비 accent · Attio 톤 · 배지 남발 X

import React from "react";
import { Card } from "./Card";
import { TEXT } from "@/styles/tokens";

// ═══════════════════════════════════════════════════════════════════
// ListPanel · 리스트 wrapper · Card clip + divide-y + 상단 gradient accent (옵션)
// ═══════════════════════════════════════════════════════════════════
export interface ListPanelProps {
  children: React.ReactNode;
  /** 로딩 시 · opacity 낮춤 · pointer-events X */
  loading?: boolean;
  /** 상단 gradient accent line · Vercel/Linear 시그니처 · 랜딩 톤 (기본 false · 사용자 선택) */
  topAccent?: boolean;
  /** wrapper 추가 className */
  className?: string;
}
export function ListPanel({ children, loading = false, topAccent = false, className = "" }: ListPanelProps) {
  return (
    <Card
      clip
      padding="none"
      className={`relative divide-y divide-line/70 ${loading ? "opacity-40 pointer-events-none" : ""} transition-opacity ${className}`}
    >
      {topAccent && (
        <span
          aria-hidden
          className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep opacity-90 z-10"
        />
      )}
      <div role="list">{children}</div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ListRow · 리스트 한 줄 · 랜딩 입고알림 스타일
// ═══════════════════════════════════════════════════════════════════
export type BulletTone = "brand" | "emerald" | "amber" | "rose" | "sky" | "violet";
export type PillTone = "emerald" | "rose" | "amber" | "brand" | "zinc";

export interface ListRowProps {
  /** 좌측 아이콘 tile (구버전 · icon prop 사용) · 새 기본은 말머리표 · icon 지정 시 tile 표시 */
  icon?: React.ReactNode;
  /** 아이콘 tile tone (icon 지정 시) · 기본 brand */
  iconTone?: BulletTone;
  /** 말머리표 (bullet dot) 표시 · icon 없을 때 · 기본 true */
  bullet?: boolean;
  /** 말머리표 tone · 기본 brand (딥네이비) · 상태에 따라 rose/amber/emerald */
  bulletTone?: BulletTone;
  /** 제목 · 필수 · 폰트 19px semibold */
  title: React.ReactNode;
  /** 인라인 설명 · 제목 옆 옅게 · 폰트 15px · truncate (랜딩 스타일) */
  description?: React.ReactNode;
  /** 서브타이틀 · 제목 아래 새 줄 · 폰트 14px · optional (title 아래 배치 시) */
  subtitle?: React.ReactNode;
  /** NEW / 상태 배지 · 제목 옆 · pill · 폰트 12px uppercase */
  pill?: { text: string; tone: PillTone };
  /** 우측 meta · 시간·수량·금액 · 폰트 17px tabular · optional */
  meta?: React.ReactNode;
  /** 우측 액션 (버튼·아이콘) · meta 옆 */
  actions?: React.ReactNode;
  /** 클릭 콜백 · 있으면 button semantic + hover accent bar */
  onClick?: () => void;
  /** 선택된 상태 · 활성 강조 (bg + accent bar) */
  active?: boolean;
  /** aria-label · onClick 시 · button 라벨 */
  ariaLabel?: string;
  /** row className · 특별 케이스 */
  className?: string;
  /** dense · 여백 감소 (px-3 py-2) */
  dense?: boolean;
}

const ICON_TONE_MAP: Record<BulletTone, { bg: string; ink: string }> = {
  brand:   { bg: "bg-brand-tint",  ink: "text-brand-deep" },
  emerald: { bg: "bg-emerald-50",  ink: "text-emerald-700" },
  amber:   { bg: "bg-amber-50",    ink: "text-amber-700" },
  rose:    { bg: "bg-rose-50",     ink: "text-rose-700" },
  sky:     { bg: "bg-sky-50",      ink: "text-sky-700" },
  violet:  { bg: "bg-violet-50",   ink: "text-violet-700" },
};

const BULLET_TONE_MAP: Record<BulletTone, string> = {
  brand:   "bg-brand-deep",
  emerald: "bg-emerald-500",
  amber:   "bg-amber-500",
  rose:    "bg-rose-500",
  sky:     "bg-sky-500",
  violet:  "bg-violet-500",
};

const PILL_TONE_MAP: Record<PillTone, string> = {
  emerald: "text-emerald-700 bg-emerald-50 ring-emerald-500/25",
  rose:    "text-rose-700 bg-rose-50 ring-rose-500/25",
  amber:   "text-amber-700 bg-amber-50 ring-amber-500/25",
  brand:   "text-brand-deep bg-brand-tint ring-brand/25",
  zinc:    "text-zinc-600 bg-zinc-100 ring-zinc-400/25",
};

/**
 * ListRow · 랜딩 입고알림 스타일 · 사용자 승인
 *   · 말머리표 (w-1.5 dot · brand-deep) + 제목 19px + 옅은 설명 15px + 배지 + 우측 meta 17px
 *   · hover · brand-tint/30 · 좌측 accent bar 등장
 *   · onClick · button semantic · focus visible · 상세 모달 오픈
 *   · icon 지정 시 · tile 표시 (구버전 스타일)
 */
export function ListRow({
  icon, iconTone = "brand",
  bullet = true, bulletTone = "brand",
  title, description, subtitle, pill, meta, actions,
  onClick, active = false, ariaLabel, className = "", dense = false,
}: ListRowProps) {
  const paddingCls = dense ? "px-3 py-2" : "px-4 py-3.5";
  const gapCls = dense ? "gap-2" : "gap-2.5";
  const hoverCls = onClick ? "hover:bg-brand-tint/30 active:bg-brand-tint/50" : "";
  const activeCls = active ? "bg-brand-tint/40" : "";
  const focusCls = onClick ? "focus:outline-none focus-visible:bg-brand-tint/40" : "";

  const rowContent = (
    <>
      {/* 좌측 hover accent bar · Linear 시그니처 (onClick 시만) */}
      {onClick && (
        <span
          aria-hidden
          className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full bg-brand-deep opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-200"
        />
      )}
      {/* active 상태 · 항상 accent bar */}
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full bg-brand-deep"
        />
      )}
      {/* 아이콘 tile (icon 지정 시) OR 말머리표 · dot · 아이콘 없을 때 */}
      {icon ? (
        <div className={`w-9 h-9 rounded-xl ${ICON_TONE_MAP[iconTone].bg} ring-1 ring-brand/10 group-hover:ring-brand/25 flex items-center justify-center shrink-0 transition-all duration-200`}>
          <span className={`${ICON_TONE_MAP[iconTone].ink} inline-flex`} aria-hidden>{icon}</span>
        </div>
      ) : bullet ? (
        <span
          aria-hidden
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${BULLET_TONE_MAP[bulletTone]}`}
        />
      ) : null}
      {/* 제목 · 인라인 설명 · 배지 */}
      <div className={`flex-1 min-w-0 flex items-baseline gap-2 ${subtitle ? "flex-col items-start" : ""}`}>
        {subtitle ? (
          <>
            <span className="text-[19px] font-semibold text-ink truncate leading-tight tracking-tight group-hover:text-brand-deep transition-colors duration-200 max-w-full">
              {title}
            </span>
            <span className="text-[14px] text-ink-soft/80 truncate leading-snug max-w-full">
              {subtitle}
            </span>
          </>
        ) : (
          <>
            <span className={`text-[19px] font-semibold text-ink truncate tracking-tight ${onClick ? "group-hover:text-brand-deep transition-colors duration-200" : ""} shrink-0 ${description ? "max-w-[55%]" : ""}`}>
              {title}
            </span>
            {description && (
              <span className="text-[15px] font-normal text-ink-soft/70 truncate min-w-0" title={typeof description === "string" ? description : undefined}>
                · {description}
              </span>
            )}
            {pill && (
              <span className={`shrink-0 inline-flex items-center h-[22px] px-2 rounded-md ${TEXT.label} ring-1 ${PILL_TONE_MAP[pill.tone]}`}>
                {pill.text}
              </span>
            )}
          </>
        )}
      </div>
      {/* 우측 meta */}
      {meta && (
        <span className={`text-[17px] font-medium text-ink-soft shrink-0 whitespace-nowrap tabular-nums ${onClick ? "group-hover:text-brand-deep/70 transition-colors duration-200" : ""}`}>
          {meta}
        </span>
      )}
      {actions && (
        <div className="shrink-0 inline-flex items-center gap-1">{actions}</div>
      )}
    </>
  );

  const commonCls = `group relative flex items-center ${gapCls} ${paddingCls} ${hoverCls} ${activeCls} ${focusCls} transition-all duration-200 ${className}`;

  if (onClick) {
    return (
      <button
        type="button"
        role="listitem"
        onClick={onClick}
        aria-label={ariaLabel}
        className={`w-full text-left cursor-pointer ${commonCls}`}
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
