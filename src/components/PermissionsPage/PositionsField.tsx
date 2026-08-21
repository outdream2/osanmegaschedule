// src/components/PermissionsPage/PositionsField.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · PositionsField 컴포넌트 이관
// 2026-08-13 · #100 · 직군 팝오버 · 각 페이지 · 레벨 OR 직군 조건 (직군 지정 시 · 레벨 무관 접근)
import React from "react";
import { Card } from "../common/Card";

export interface PositionsFieldProps {
  page: string;
  field: "read" | "write";
  selected: string[];
  allPositions: string[];
  isOpen: boolean;
  onToggleOpen: (open: boolean) => void;
  onToggle: (position: string) => void;
}

export const PositionsField: React.FC<PositionsFieldProps> = ({ selected, allPositions, isOpen, onToggleOpen, onToggle }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggleOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, onToggleOpen]);
  return (
    <div className="relative flex items-center gap-1 flex-wrap justify-end max-w-full" ref={ref}>
      {selected.map(p => (
        <button
          key={p}
          type="button"
          onClick={() => onToggle(p)}
          className="inline-flex items-center gap-0.5 px-1.5 h-5 text-[10px] font-bold text-brand-deep bg-brand-tint border border-brand/15 rounded hover:brightness-95 cursor-pointer"
          title={`${p} 직군 · 클릭 시 해제`}
        >
          {p}<span className="text-brand-deep/60">×</span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => onToggleOpen(!isOpen)}
        className={`h-5 px-1.5 text-[10px] font-bold rounded border transition-colors cursor-pointer ${
          isOpen
            ? "bg-brand-deep text-white border-brand-deep"
            : "bg-white text-ink-soft border-line hover:border-brand-deep hover:text-brand-deep"
        }`}
        title="직군 지정 · 레벨과 함께 OR 조건"
      >+ 직군</button>
      {isOpen && (
        <Card variant="raw-lg" rounded="lg" padding="none" className="absolute right-0 top-full mt-1 z-30 w-40 p-2 flex flex-col gap-1">
          <div className="text-[10px] font-bold text-zinc-400 uppercase mb-1 px-1">직군 (OR 조건)</div>
          {allPositions.length === 0 ? (
            <div className="text-[11px] text-zinc-400 px-1 py-2 text-center">직군 없음</div>
          ) : allPositions.map(p => (
            <label key={p} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-zinc-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(p)}
                onChange={() => onToggle(p)}
                className="w-3 h-3 accent-[#1E5C8E] cursor-pointer"
              />
              <span className="text-[12px] font-semibold text-zinc-700">{p}</span>
            </label>
          ))}
        </Card>
      )}
    </div>
  );
};
