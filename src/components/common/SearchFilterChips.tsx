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

// 2026-08-17 · 최신 트렌드 · mono neutral · 딥네이비 accent 통일
//   · category identity 는 라벨로 표현 · 색은 통일
const COLOR_ACTIVE: Record<ChipColor, string> = {
  rose:    "bg-brand-deep text-white border-brand-deep shadow-sm",
  amber:   "bg-brand-deep text-white border-brand-deep shadow-sm",
  emerald: "bg-brand-deep text-white border-brand-deep shadow-sm",
  sky:     "bg-brand-deep text-white border-brand-deep shadow-sm",
  violet:  "bg-brand-deep text-white border-brand-deep shadow-sm",
  indigo:  "bg-brand-deep text-white border-brand-deep shadow-sm",
  teal:    "bg-brand-deep text-white border-brand-deep shadow-sm",
  slate:   "bg-brand-deep text-white border-brand-deep shadow-sm",
};

// 폰트 +2 · Linear/Vercel 톤
const SIZE_MAP = {
  xs: "px-2.5 h-7 text-[12px] gap-1",
  sm: "px-3   h-8 text-[13px] gap-1.5",
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
    <div className="inline-flex items-center gap-2 flex-wrap">
      {label && (
        <span className="flex items-center gap-2 shrink-0">
          <span className="w-[3px] h-[14px] rounded-full bg-brand-deep" />
          <span className="text-[14px] font-bold text-ink tracking-tight">{label}</span>
        </span>
      )}
      <div className="inline-flex items-center bg-zinc-100 border border-line rounded-lg p-1 gap-0.5 flex-wrap">
        {showAll && (
          <button
            type="button"
            aria-pressed={allActive}
            onClick={() => {
              Array.from(selected).forEach(k => onToggle(k));
            }}
            className={[
              "rounded-md font-semibold leading-none border transition-colors cursor-pointer whitespace-nowrap inline-flex items-center",
              sz,
              allActive ? COLOR_ACTIVE.slate : "bg-transparent text-ink border-transparent hover:text-brand-deep hover:bg-white",
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
                "rounded-md font-semibold leading-none border transition-colors cursor-pointer whitespace-nowrap inline-flex items-center",
                sz,
                active ? COLOR_ACTIVE[color] : "bg-transparent text-ink border-transparent hover:text-brand-deep hover:bg-white",
              ].join(" ")}
              title={opt.hint ?? opt.label}
            >
              {opt.label}
              {typeof opt.count === "number" && (
                <span
                  className={[
                    "tabular-nums font-semibold rounded-full px-1.5 text-[11px]",
                    active ? "bg-white/20 text-white" : "bg-brand-tint text-brand-deep",
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
