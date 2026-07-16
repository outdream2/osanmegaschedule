// src/components/common/SeasonButtons.tsx
// 4버튼 인라인 컴포넌트 (봄🌸/여름☀️/가을🍁/겨울❄️)
//   props:
//     - value: 현재 선택된 계절 (null 이면 아무것도 선택 안 됨)
//     - onChange: 클릭 시 호출 (같은 버튼 다시 누르면 null 전달 · 토글 해제)
//     - size: "sm" | "md" (기본 md)
//   재고관리 스타일 (rounded-lg · slate-100 bg · sky-700 active)
import React from "react";
import { useSeasonRanges, SEASON_LABEL, SEASON_EMOJI, formatMonths, type SeasonKey } from "../../hooks/useSeasonRanges";

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
  const sizeCls = size === "sm"
    ? "px-1.5 py-0.5 text-[10px]"
    : "px-2 py-1 text-[11px]";
  const labelCls = size === "sm" ? "text-[9px]" : "text-[10px]";
  return (
    <div className={`inline-flex items-center gap-1 flex-wrap ${className}`}>
      {!hideLabel && label && (
        <span className={`text-slate-500 font-black shrink-0 ${labelCls}`}>{label}</span>
      )}
      <div className="inline-flex bg-slate-100/80 border border-slate-200/60 rounded-lg p-0.5 shadow-inner">
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
              className={`${sizeCls} font-black rounded transition cursor-pointer inline-flex items-center gap-0.5 ${
                active
                  ? "bg-white text-sky-700 shadow-sm ring-1 ring-slate-200"
                  : "text-slate-500 hover:text-slate-800"
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
