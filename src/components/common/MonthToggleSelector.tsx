// src/components/common/MonthToggleSelector.tsx
// 2026-10-05 · 사용자 지시 · 독립 multi-select 월 토글
//   · 각 월 독립 toggle (on/off) · 비연속 선택 가능 (예 · 9월+7월)
//   · 선택 안 한 월은 포함 X · 연속 범위 자동 extension 없음
//   · 10일 옵션 제거 · 월 단위만
//   · 현재 월은 미래 날짜까지 X · 오늘까지
//   · 과거 월은 해당 월 1일 ~ 말일
//
// state 표현 (사용자 확정):
//   selectedMonths: ["2026-09", "2026-07"] 같은 YM 리스트
//   · count 로 표현 불가 (비연속 지원)

import React, { useMemo } from "react";

export interface MonthToggleSelectorProps {
  /** 선택된 월 YM 리스트 · 예 · ["2026-09", "2026-07"] */
  selectedMonths: string[];
  onChange: (selectedMonths: string[]) => void;
  /** 표시할 최대 월 수 · default 6 · max 12 */
  maxMonths?: number;
  /** 최소 1개 선택 강제 · 마지막 월 toggle off 금지 · default false */
  minOne?: boolean;
  className?: string;
  ariaLabel?: string;
}

const ACTIVE_CLS =
  "bg-brand-deep text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_1px_2px_rgba(10,46,74,0.15),0_2px_6px_-2px_rgba(10,46,74,0.30)]";

interface MonthEntry {
  ym: string;         // "2026-10"
  year: number;
  month: number;
}

function buildMonths(maxMonths: number): MonthEntry[] {
  const now = new Date();
  const n = Math.max(1, Math.min(12, maxMonths));
  const list: MonthEntry[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    list.push({
      ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      year: d.getFullYear(),
      month: d.getMonth() + 1,
    });
  }
  return list;
}

export const MonthToggleSelector: React.FC<MonthToggleSelectorProps> = ({
  selectedMonths,
  onChange,
  maxMonths = 6,
  minOne = false,
  className = "",
  ariaLabel = "월 선택",
}) => {
  const months = useMemo(() => buildMonths(maxMonths), [maxMonths]);
  const yearSet = new Set(months.map((m) => m.year));
  const showYear = yearSet.size > 1;
  const selectedSet = useMemo(() => new Set(selectedMonths), [selectedMonths]);

  const handleClick = (ym: string) => {
    if (selectedSet.has(ym)) {
      // 해제
      if (minOne && selectedSet.size <= 1) return; // 마지막 1개 유지
      onChange(selectedMonths.filter((v) => v !== ym));
    } else {
      // 추가 · 과거 → 최근 순서 유지
      const next = Array.from(new Set([...selectedMonths, ym]));
      next.sort((a, b) => b.localeCompare(a)); // 최근 월이 앞
      onChange(next);
    }
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex flex-wrap items-center gap-0.5 bg-zinc-100 border border-line rounded-lg p-0.5 ${className}`}
    >
      {months.map((m, i) => {
        const active = selectedSet.has(m.ym);
        const prevYear = i > 0 ? months[i - 1].year : null;
        const yearBoundary = showYear && prevYear != null && prevYear !== m.year;
        return (
          <button
            key={m.ym}
            type="button"
            onClick={() => handleClick(m.ym)}
            title={`${m.year}년 ${m.month}월 · 클릭 토글 (독립 선택)`}
            className={`h-7 px-2 text-[14px] rounded-md font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer ${
              active ? ACTIVE_CLS : "text-ink hover:text-brand-deep hover:bg-white"
            }`}
          >
            {yearBoundary ? (
              <span className="opacity-70 mr-0.5">{String(m.year).slice(2)}년</span>
            ) : null}
            {m.month}월
          </button>
        );
      })}
    </div>
  );
};

/**
 * selectedMonths → [{ startDate, endDate }] 비연속 범위 리스트
 *   · 현재월 (오늘이 포함된 YM) 은 endDate = 오늘 (미래 X)
 *   · 과거월은 해당 월 1일 ~ 말일
 *   · 선택 월 각각 독립 pair · 중간 월 자동 포함 X
 */
export function dateRangesFromMonths(selectedMonths: string[]): Array<{ startDate: string; endDate: string }> {
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return selectedMonths.map((ym) => {
    const m = /^(\d{4})-(\d{2})$/.exec(ym);
    if (!m) return { startDate: ym, endDate: ym };
    const year = Number(m[1]);
    const month = Number(m[2]);
    const startDate = `${ym}-01`;
    if (ym === currentYm) return { startDate, endDate: todayStr };
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${ym}-${String(lastDay).padStart(2, "0")}`;
    return { startDate, endDate };
  });
}

/** 현재월 YM (default selected 용) */
export function currentYm(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** 서버 API 파라미터 string · "2026-09,2026-07" · 과거→최근 역순 */
export function monthsListParam(selectedMonths: string[]): string {
  return [...selectedMonths].sort((a, b) => a.localeCompare(b)).join(",");
}

export default MonthToggleSelector;
