// src/components/DisplayPage/overviews/OverviewHeader.tsx
// 2026-10-09 · UI-4 · 사용자 지시 "여백 위치등 통일 · 공통모듈사용권장"
//   · 3개 overview 페이지 상단 공통 패턴 추출 (OrderReturnOverview 디자인 벤치마크)
//   · OverviewHero: compact inline hero (3px tone bar + 제목·설명 + right slot)
//   · OverviewInnerTabs<K>: bottom bar + count badge · 프로세스 connector 없음 (심플)
//   · OrderReturnOverview 는 step connector 있는 특수 패턴 · 이 모듈 비사용 (유지)
import React from "react";

type Tone = "red" | "sky" | "emerald" | "amber" | "violet" | "rose" | "slate" | "brand" | "indigo";

const TONE_BAR: Record<Tone, string> = {
  red:     "bg-red-500",
  sky:     "bg-sky-500",
  emerald: "bg-emerald-500",
  amber:   "bg-amber-500",
  violet:  "bg-violet-500",
  rose:    "bg-rose-500",
  slate:   "bg-slate-500",
  brand:   "bg-brand-deep",
  indigo:  "bg-indigo-500",
};

const TONE_SOFT: Record<Tone, string> = {
  red:     "bg-red-50",
  sky:     "bg-sky-50",
  emerald: "bg-emerald-50",
  amber:   "bg-amber-50",
  violet:  "bg-violet-50",
  rose:    "bg-rose-50",
  slate:   "bg-slate-50",
  brand:   "bg-brand-tint",
  indigo:  "bg-indigo-50",
};

// ─────────────────────────────────────────────────────────────
// OverviewHero · compact inline hero (3px tone bar + 제목·설명)
// ─────────────────────────────────────────────────────────────
export const OverviewHero: React.FC<{
  tone: Tone;
  title: React.ReactNode;
  description?: React.ReactNode;
  right?: React.ReactNode;
}> = ({ tone, title, description, right }) => (
  <section className="flex items-center gap-2 py-0.5 px-4 sm:px-6 pt-4">
    <span className={`w-[3px] h-[14px] ${TONE_BAR[tone]} rounded-full shrink-0`} />
    <span className="text-[14px] md:text-[15px] text-slate-700 min-w-0 flex-1 truncate">
      <strong className="font-semibold text-ink">{title}</strong>
      {description != null && <> · {description}</>}
    </span>
    {right != null && <div className="shrink-0 flex items-center gap-2">{right}</div>}
  </section>
);

// ─────────────────────────────────────────────────────────────
// OverviewInnerTabs<K> · bottom bar + count badge (심플 · 프로세스 X)
// ─────────────────────────────────────────────────────────────
export interface OverviewInnerTab<K extends string> {
  k: K;
  label: string;
  tone: Tone;
  count?: number | null;
}

export function OverviewInnerTabs<K extends string>({
  tabs, active, onChange, ariaLabel,
}: {
  tabs: ReadonlyArray<OverviewInnerTab<K>>;
  active: K;
  onChange: (k: K) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="px-4 sm:px-6">
      <nav className="flex items-stretch border-b border-slate-200 overflow-x-auto -mb-px" aria-label={ariaLabel}>
        {tabs.map(t => {
          const isActive = active === t.k;
          return (
            <button key={t.k} type="button" onClick={() => onChange(t.k)}
              className={`relative shrink-0 px-2.5 h-10 text-[14px] md:text-[15px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                isActive ? "text-ink font-semibold" : "text-slate-500 hover:text-ink"
              }`}
            >
              <span>{t.label}</span>
              {t.count != null && (
                <span className={`text-[13px] md:text-[14px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full ${isActive ? `${TONE_SOFT[t.tone]} text-ink` : "bg-slate-100 text-slate-500"}`}>
                  {t.count.toLocaleString()}
                </span>
              )}
              {isActive && <span className={`absolute left-0 right-0 -bottom-px h-[2px] ${TONE_BAR[t.tone]} rounded-full`} />}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
