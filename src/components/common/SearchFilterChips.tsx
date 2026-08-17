// src/components/common/SearchFilterChips.tsx
// 2026-08-03 (#201) · 다중 선택 quick filter chips
//
// 근거 · 2026 SaaS filter UX (Algolia · UXPin · Eleken)
//   1) 다중 선택 · chip 클릭 토글 (라디오 아님)
//   2) 활성 · 색깔+굵기+테두리 강조 · 비활성 · 회색 · hover
//   3) "전체" 는 별도 chip · 모두 해제 상태와 동일 시각
//   4) count 배지 · 각 chip 옆 · 실시간 (해당 조건 만족 상품 수)
//   5) 접근성 · button + aria-pressed
//
// 사용 예
//   <SearchFilterChips
//     label="재고 상태"
//     options={[
//       { key: "zero", label: "재고 0", color: "rose", count: 12 },
//       { key: "low",  label: "저재고", color: "amber", count: 34 },
//     ]}
//     selected={statusFilter}
//     onToggle={key => setStatusFilter(prev => toggle(prev, key))}
//   />

import React from "react";

export type ChipColor = "rose" | "amber" | "emerald" | "sky" | "violet" | "indigo" | "teal" | "slate";

export interface ChipOption<K extends string = string> {
  key: K;
  label: string;
  color?: ChipColor;
  count?: number;
  /** 툴팁 · 조건 설명 */
  hint?: string;
}

export interface SearchFilterChipsProps<K extends string = string> {
  /** 카테고리 라벨 · 좌측 (예: "재고 상태") · 생략 시 라벨 없음 */
  label?: string;
  options: ChipOption<K>[];
  /** 선택된 키 set · 다중 선택 */
  selected: Set<K>;
  /** 단일 chip 토글 */
  onToggle: (key: K) => void;
  /** "전체" chip 표시 (선택 전체 해제) · 기본 true */
  showAll?: boolean;
  /** "전체" chip 라벨 · 기본 "전체" */
  allLabel?: string;
  /** 크기 · 기본 sm */
  size?: "xs" | "sm";
}

const COLOR_ACTIVE: Record<ChipColor, string> = {
  rose:    "bg-rose-50    text-rose-700    border-rose-300",
  amber:   "bg-amber-50   text-amber-700   border-amber-300",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-300",
  sky:     "bg-sky-50     text-sky-700     border-sky-300",
  violet:  "bg-violet-50  text-violet-700  border-violet-300",
  indigo:  "bg-indigo-50  text-indigo-700  border-indigo-300",
  teal:    "bg-teal-50    text-teal-700    border-teal-300",
  slate:   "bg-zinc-100  text-zinc-800   border-zinc-300",
};

const SIZE_MAP = {
  xs: "px-2   h-6  text-[10px] gap-1",
  sm: "px-2.5 h-7  text-[11px] gap-1.5",
};

export function SearchFilterChips<K extends string = string>({
  label,
  options,
  selected,
  onToggle,
  showAll = true,
  allLabel = "전체",
  size = "sm",
}: SearchFilterChipsProps<K>) {
  const allActive = selected.size === 0;
  const sz = SIZE_MAP[size];

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      {label && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 shrink-0">{label}</span>
      )}
      <div className="inline-flex items-center rounded-lg border border-line bg-white p-0.5 gap-0.5 flex-wrap">
        {showAll && (
          <button
            type="button"
            aria-pressed={allActive}
            onClick={() => {
              // 전체 · 모든 선택 해제
              // caller 는 별도 clear 없이 · 각 chip 을 다시 해제하는 대신
              // showAll 클릭 시 아무 chip 도 선택되지 않은 상태로 · onToggle 반복 호출 대신
              // 여기서는 각 선택된 항목을 순회 · onToggle 호출 (caller 가 clear 관리하지 않아도 됨)
              Array.from(selected).forEach(k => onToggle(k));
            }}
            className={[
              "rounded-md font-bold leading-none border transition-colors cursor-pointer whitespace-nowrap inline-flex items-center",
              sz,
              allActive ? COLOR_ACTIVE.slate : "bg-white text-zinc-500 border-transparent hover:text-zinc-800 hover:bg-zinc-50",
            ].join(" ")}
            title="모든 필터 해제"
          >
            {allLabel}
          </button>
        )}
        {options.map(opt => {
          const active = selected.has(opt.key);
          const color = opt.color ?? "slate";
          return (
            <button
              key={opt.key}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(opt.key)}
              className={[
                "rounded-md font-bold leading-none border transition-colors cursor-pointer whitespace-nowrap inline-flex items-center",
                sz,
                active ? COLOR_ACTIVE[color] : "bg-white text-zinc-500 border-transparent hover:text-zinc-800 hover:bg-zinc-50",
              ].join(" ")}
              title={opt.hint ?? opt.label}
            >
              {opt.label}
              {typeof opt.count === "number" && (
                <span
                  className={[
                    "tabular-nums font-bold rounded px-1 text-[9px]",
                    active ? "bg-white/60" : "bg-zinc-100 text-zinc-500",
                  ].join(" ")}
                >{opt.count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default SearchFilterChips;
