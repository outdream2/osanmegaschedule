// 2026-08-17 · 사용자 지시 · 필터·정렬 공통 UI 프레임워크화
//   · 최신 트렌드 · 좌측 accent bar + segmented pill (Linear/Vercel 톤)
//   · 딥네이비 active · line neutral · 폰트 +2 (13/14)
//   · 어디서든 재사용 · 스케쥴/직원/거래처/발주 등 모든 필터·정렬 통일
//   · 참조 · feedback_ui_top_principle.md · feedback_ui_latest_trend_framework.md
import type { ReactNode } from "react";
import { AccentBar } from "./AccentBar";

// ─── FilterSortLabel ─────────────────────────────────────────────────────────
export interface FilterSortLabelProps {
  children: ReactNode;
  className?: string;
}

/** 좌측 accent bar + 라벨 · 필터/정렬 그룹 앞에 배치 */
export function FilterSortLabel({ children, className = "" }: FilterSortLabelProps) {
  return (
    <span className={`flex items-center gap-2 shrink-0 ${className}`}>
      <AccentBar h={15} />
      <span className="text-[17px] font-bold text-ink tracking-tight">{children}</span>
    </span>
  );
}

// ─── FilterSortGroup ─────────────────────────────────────────────────────────
export interface FilterSortOption<T extends string> {
  key: T;
  label: string;
  /** 우측 카운트 · 필터에만 · 정렬은 undefined */
  count?: number;
  /** 정렬 방향 표시 · undefined 면 표시 안 함 */
  sortDir?: "asc" | "desc";
}

export interface FilterSortGroupProps<T extends string> {
  options: readonly FilterSortOption<T>[];
  active: T;
  onSelect: (key: T) => void;
  /** 우측 슬롯 · reset 등 부가 버튼 */
  right?: ReactNode;
  className?: string;
}

/** 필터/정렬 pill 그룹 · segmented · 딥네이비 active · 폰트 +2 */
export function FilterSortGroup<T extends string>({
  options, active, onSelect, right, className = "",
}: FilterSortGroupProps<T>) {
  return (
    <div className={`inline-flex p-1 bg-zinc-100 border border-line rounded-lg gap-0.5 ${className}`}>
      {options.map(opt => {
        const isActive = opt.key === active;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onSelect(opt.key)}
            className={`px-2.5 sm:px-3 py-1 text-[17px] sm:text-[18px] font-semibold rounded-md cursor-pointer transition-all duration-200 ease-out flex items-center gap-1.5 min-h-[34px] sm:min-h-[36px] ${
              isActive
                ? "bg-brand-deep text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_1px_2px_rgba(10,46,74,0.15),0_2px_6px_-2px_rgba(10,46,74,0.30)]"
                : "text-ink hover:text-brand-deep hover:bg-white"
            }`}
          >
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span className={`text-[16px] font-normal tabular-nums ${isActive ? "text-white/80" : "text-ink-soft"}`}>
                ({opt.count})
              </span>
            )}
            {isActive && opt.sortDir && (
              <span className="text-[12px] font-semibold">{opt.sortDir === "asc" ? "↑" : "↓"}</span>
            )}
          </button>
        );
      })}
      {right}
    </div>
  );
}

// ─── FilterSortRow ───────────────────────────────────────────────────────────
export interface FilterSortRowProps {
  children: ReactNode;
  className?: string;
}

/** 필터/정렬 한 줄 · flex + wrap · 반응형 */
export function FilterSortRow({ children, className = "" }: FilterSortRowProps) {
  return (
    <div className={`flex items-center gap-2 sm:gap-3 flex-wrap ${className}`}>
      {children}
    </div>
  );
}
