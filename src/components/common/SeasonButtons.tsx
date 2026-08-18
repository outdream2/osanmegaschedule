// src/components/common/SeasonButtons.tsx
// 4버튼 인라인 컴포넌트 (봄🌸/여름☀️/가을🍁/겨울❄️)
//   props:
//     - value: 현재 선택된 계절 (null 이면 아무것도 선택 안 됨)
//     - onChange: 클릭 시 호출 (같은 버튼 다시 누르면 null 전달 · 토글 해제)
//     - size: "sm" | "md" (기본 md)
//   재고관리 스타일 (rounded-lg · zinc-100 bg · sky-700 active)
import React from "react";
import { useSeasonRanges, SEASON_LABEL, SEASON_EMOJI, formatMonths, type SeasonKey } from "../../hooks/useSeasonRanges";
import { AccentBar } from "./AccentBar";

interface SeasonButtonsProps {
  value: SeasonKey | null;
  onChange: (v: SeasonKey | null) => void;
  size?: "sm" | "md";
  /** 라벨 프리픽스 · 기본 "계절" · 감출 시 "" */
  label?: string;
  /** true 면 라벨을 숨김 (조밀한 UI 용) */
  hideLabel?: boolean;
  className?: string;
}

const SEASONS: SeasonKey[] = ["spring", "summer", "autumn", "winter"];

export const SeasonButtons: React.FC<SeasonButtonsProps> = ({
  value,
  onChange,
  size = "md",
  label = "계절",
  hideLabel = false,
  className = "",
}) => {
  const ranges = useSeasonRanges();
  // 2026-08-17 · 최신 트렌드 · 폰트 +2 · 접근성 (h-7+) · 딥네이비 통일
  const sizeCls = size === "sm"
    ? "px-2 h-7 text-[12px] gap-1"
    : "px-2.5 h-8 text-[13px] gap-1";
  const labelCls = size === "sm" ? "text-[12px]" : "text-[13px]";
  return (
    <div className={`inline-flex items-center gap-2 flex-wrap ${className}`}>
      {!hideLabel && label && (
        <span className="flex items-center gap-2 shrink-0">
          <AccentBar size="sm" />
          <span className={`text-ink font-bold tracking-tight ${labelCls}`}>{label}</span>
        </span>
      )}
      <div className="inline-flex bg-zinc-100 border border-line rounded-lg p-1 gap-0.5">
        {SEASONS.map((s) => {
          const active = value === s;
          const months = ranges[s];
          const title = `${SEASON_LABEL[s]} (${formatMonths(months)})${active ? " · 다시 클릭 → 해제" : ""}`;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(active ? null : s)}
              title={title}
              className={`${sizeCls} font-semibold rounded-md transition-all duration-200 ease-out cursor-pointer inline-flex items-center whitespace-nowrap ${
                active
                  ? "bg-brand-deep text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_1px_2px_rgba(10,46,74,0.15),0_2px_6px_-2px_rgba(10,46,74,0.30)]"
                  : "text-ink hover:text-brand-deep hover:bg-white"
              }`}
            >
              <span aria-hidden>{SEASON_EMOJI[s]}</span>
              <span>{SEASON_LABEL[s]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SeasonButtons;
