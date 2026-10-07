// src/components/schedule-v2/views/month-grid/ScheduleTypePopover.tsx
// 2026-10-07 · 스케줄 V2 · 셀 edit popover
//   · settings.scheduleTypes 전수 노출 · hardcoded 금지
//   · 선택 시 (type, workingHours) 전달 · 상위에서 handleCellUpdate (기존 V1 API) 호출
//   · ESC / 외부 click → close
import React, { useEffect, useRef } from "react";
import { X } from "@phosphor-icons/react";
import type { ScheduleTypeEntry } from "../../../../hooks/useSettings";

interface Props {
  scheduleTypes: ScheduleTypeEntry[];
  typeHoursMap: Record<string, string>;
  onSelect: (type: string, workingHours: string) => Promise<void> | void;
  onClose: () => void;
}

export const ScheduleTypePopover: React.FC<Props> = ({ scheduleTypes, typeHoursMap, onSelect, onClose }) => {
  const ref = useRef<HTMLDivElement | null>(null);

  // ESC + 외부 click 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    // 등록 직후 onclick 바로 닫히는 것 방지 · setTimeout 으로 다음 tick
    const id = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  if (!scheduleTypes || scheduleTypes.length === 0) {
    return (
      <div
        ref={ref}
        className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-40 bg-white border border-rose-200 rounded-lg shadow-xl p-3 min-w-[180px] text-left text-[12px] text-rose-700"
      >
        근무유형 설정 없음 · 설정 &gt; 스케줄에서 등록 필요
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-40 bg-white border border-zinc-200 rounded-lg shadow-xl p-1.5 min-w-[160px] max-h-[280px] overflow-auto"
      onClick={e => e.stopPropagation()}
      role="menu"
    >
      <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-ink-soft uppercase tracking-wide">
        <span>근무유형</span>
        <button
          type="button"
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-zinc-100 text-ink-soft"
          aria-label="닫기"
        >
          <X size={11} weight="bold" />
        </button>
      </div>
      <ul className="flex flex-col">
        {scheduleTypes.map((entry) => {
          const t = entry.type;
          const hours = typeHoursMap[t] ?? entry.hours ?? "";
          return (
            <li key={t}>
              <button
                type="button"
                onClick={() => onSelect(t, hours)}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-sky-50 text-[13px] font-medium text-ink flex items-center justify-between gap-2 cursor-pointer"
              >
                <span>{t}</span>
                {hours && <span className="text-[11px] text-ink-soft tabular-nums">{hours}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {/* Clear option · 빈 cell 로 변경 (type="") */}
      <div className="mt-1 pt-1 border-t border-line">
        <button
          type="button"
          onClick={() => onSelect("", "")}
          className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-100 text-[12px] text-ink-soft cursor-pointer"
        >
          비우기
        </button>
      </div>
    </div>
  );
};

export default ScheduleTypePopover;
