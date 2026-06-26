import React from "react";
import { MapPin } from "lucide-react";
import { Employee } from "../../types";
import { ZONE_DEFS, SECTION_LABEL, type ZoneSection } from "../../constants/displayZones";

export interface LogisticsZoneProps {
  assignedZoneNums: number[];
  onToggle: (zoneNum: number) => void;
  onClearAll: () => void;
}

// ─── Zone assignment sub-component (logistics only) ───────────────────────────
const SECTION_ORDER: ZoneSection[] = ["top_wall", "aisle", "left_wall", "bottom_wall", "wing"];

export const ZoneAssignTab: React.FC<{
  employee: Employee;
  assignedZoneNums: number[];
  onToggle: (num: number) => void;
  onClearAll: () => void;
}> = ({ employee, assignedZoneNums, onToggle, onClearAll }) => {
  const grouped = SECTION_ORDER.map((section) => ({
    section,
    label: SECTION_LABEL[section],
    zones: ZONE_DEFS.filter((z) => z.section === section),
  }));

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
        <div className="flex items-center gap-2">
          <MapPin size={13} className="text-violet-600 shrink-0" />
          <span className="text-xs font-bold text-violet-800">
            {employee.name}님 배정 구역: {assignedZoneNums.length > 0 ? assignedZoneNums.sort((a, b) => a - b).join(", ") + "번" : "없음"}
          </span>
        </div>
        {assignedZoneNums.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-[10px] font-bold text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded-lg transition cursor-pointer"
          >
            전체 해제
          </button>
        )}
      </div>

      {/* Zone groups */}
      {grouped.map(({ section, label, zones }) => (
        <div key={section}>
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">{label}</div>
          <div className="grid grid-cols-4 gap-1.5">
            {zones.map((z) => {
              const isAssigned = assignedZoneNums.includes(z.num);
              return (
                <button
                  key={z.num}
                  type="button"
                  onClick={() => onToggle(z.num)}
                  className={`rounded-lg border-2 p-1.5 text-left transition-all cursor-pointer active:scale-[0.96] ${
                    isAssigned
                      ? "bg-violet-100 border-violet-400 shadow-sm"
                      : "bg-white border-slate-200 hover:border-violet-300 hover:bg-violet-50"
                  }`}
                >
                  <div className={`text-[11px] font-black leading-tight ${isAssigned ? "text-violet-800" : "text-slate-700"}`}>
                    {z.num}번
                  </div>
                  <div className={`text-[8px] leading-tight mt-0.5 line-clamp-2 ${isAssigned ? "text-violet-600" : "text-slate-400"}`}>
                    {z.label}
                  </div>
                  {isAssigned && (
                    <div className="mt-1 w-3 h-3 rounded-full bg-violet-500 flex items-center justify-center">
                      <span className="text-white text-[7px] font-black">✓</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
