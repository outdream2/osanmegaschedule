import React, { useState } from "react";
import { MapPin, Save } from "lucide-react";
import { Employee } from "../../types";
import { ZONE_DEFS, SECTION_LABEL, type ZoneSection } from "../../constants/displayZones";

export interface LogisticsZoneProps {
  assignedZoneNums: number[];
  onToggle: (zoneNum: number) => void;
  onClearAll: () => void;
  onSaveToDow?: (dow: number) => Promise<void>;
}

// ─── Zone assignment sub-component (logistics only) ───────────────────────────
const SECTION_ORDER: ZoneSection[] = ["top_wall", "aisle", "left_wall", "bottom_wall", "wing"];
const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export const ZoneAssignTab: React.FC<{
  employee: Employee;
  assignedZoneNums: number[];
  onToggle: (num: number) => void;
  onClearAll: () => void;
  onSaveToDow?: (dow: number) => Promise<void>;
}> = ({ employee, assignedZoneNums, onToggle, onClearAll, onSaveToDow }) => {
  const [selectedDows, setSelectedDows] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const toggleDow = (dow: number) => {
    setSelectedDows(prev => {
      const next = new Set(prev);
      if (next.has(dow)) next.delete(dow); else next.add(dow);
      return next;
    });
  };

  const handleSaveToDows = async () => {
    if (!onSaveToDow || selectedDows.size === 0) return;
    setSaving(true);
    try {
      for (const dow of selectedDows) {
        await onSaveToDow(dow);
      }
      setSelectedDows(new Set());
    } finally {
      setSaving(false);
    }
  };
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

      {/* DOW template save bar */}
      {onSaveToDow && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 space-y-2">
          <div className="flex items-center gap-1.5">
            <Save size={11} className="text-indigo-600 shrink-0" />
            <span className="text-[10px] font-black text-indigo-800">요일 템플릿 저장</span>
            <span className="text-[9px] text-indigo-500 font-medium">— 현재 구역배정을 선택 요일의 기본값으로 저장</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {DOW_LABELS.map((label, dow) => (
              <button
                key={dow}
                type="button"
                onClick={() => toggleDow(dow)}
                className={`w-7 h-7 text-[10px] font-black rounded-lg border transition cursor-pointer ${
                  selectedDows.has(dow)
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600"
                }`}
              >
                {label}
              </button>
            ))}
            {selectedDows.size > 0 && (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveToDows}
                  className="ml-1 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition cursor-pointer disabled:opacity-50 flex items-center gap-1"
                >
                  <Save size={10} />
                  {saving ? "저장 중…" : `저장 (${selectedDows.size}요일)`}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDows(new Set())}
                  className="text-[10px] font-bold px-1.5 py-1 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 cursor-pointer transition"
                >
                  ✕
                </button>
              </>
            )}
          </div>
        </div>
      )}

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
