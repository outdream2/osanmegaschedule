// src/components/SettingsModal/tabs/ScheduleTypesTab.tsx
// 2026-08-29 · SettingsModal 분리 · scheduleTypes 탭 서브컴포넌트
import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { ScheduleTypeEntry } from "../../../hooks/useSettings";
import { ColorPicker } from "./ColorPicker";

type ScheduleHourTab = "hours" | "pharmHours" | "logisticsHours" | "partTimeHours";

const HOUR_TABS: { id: ScheduleHourTab; label: string }[] = [
  { id: "hours",          label: "기본(기타)" },
  { id: "pharmHours",     label: "약사" },
  { id: "logisticsHours", label: "물류" },
  { id: "partTimeHours",  label: "알바" },
];

export interface ScheduleTypesTabProps {
  scheduleTypes: ScheduleTypeEntry[];
  newScheduleType: string;
  setNewScheduleType: (v: string) => void;
  addScheduleType: () => void;
  removeScheduleType: (idx: number) => void;
  updateScheduleTypeEntry: (idx: number, field: keyof ScheduleTypeEntry, value: string) => void;
  scheduleHourTab: ScheduleHourTab;
  setScheduleHourTab: (t: ScheduleHourTab) => void;
  applying: boolean;
  editMode?: boolean;
  onApplyClick: () => void;
}

export const ScheduleTypesTab: React.FC<ScheduleTypesTabProps> = ({
  scheduleTypes, newScheduleType, setNewScheduleType,
  addScheduleType, removeScheduleType, updateScheduleTypeEntry,
  scheduleHourTab, setScheduleHourTab,
  applying, editMode, onApplyClick,
}) => (
  <div className="space-y-4">
    <p className="text-xs text-zinc-500 font-semibold">
      근무 유형과 직원 유형별 기본 근무시간을 관리합니다. 비워두면 상위(기본) 시간이 사용됩니다.
    </p>

    {/* Hour type sub-tabs */}
    <div className="flex flex-wrap gap-1">
      {HOUR_TABS.map(t => (
        <button
          key={t.id}
          type="button"
          onClick={() => setScheduleHourTab(t.id)}
          className={`flex-1 min-w-[72px] py-1.5 px-2 text-[11px] font-bold rounded-lg border transition cursor-pointer whitespace-nowrap ${
            scheduleHourTab === t.id
              ? "bg-brand-deep border-[#2563eb] text-white"
              : "bg-white border-line text-zinc-500 hover:bg-zinc-50"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>

    <div className="space-y-1.5">
      <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)_28px] gap-2 px-3 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wide">
        <span>유형명</span>
        <span>색</span>
        <span>{HOUR_TABS.find(t => t.id === scheduleHourTab)?.label} 시간</span>
        <span></span>
      </div>
      {scheduleTypes.map((st, idx) => (
        <div
          key={idx}
          className="flex flex-col sm:grid sm:grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)_28px] gap-2 items-start sm:items-center bg-white border border-line hover:border-zinc-300 rounded-lg px-3 py-2 transition"
        >
          <div className="flex items-center gap-2 w-full min-w-0">
            <span
              className="flex-1 min-w-0 text-xs font-semibold text-zinc-800 truncate px-1.5 py-0.5 rounded"
              style={{ backgroundColor: st.color ?? "#e2e8f0" }}
            >
              {st.type}
            </span>
            <div className="shrink-0 sm:hidden">
              <ColorPicker
                value={st.color ?? "#e2e8f0"}
                onChange={(hex) => updateScheduleTypeEntry(idx, "color", hex)}
              />
            </div>
            <button
              type="button"
              onClick={() => removeScheduleType(idx)}
              className="sm:hidden text-zinc-300 hover:text-rose-500 transition cursor-pointer p-0.5 rounded shrink-0"
              title="삭제"
            >
              <Trash2 size={13} />
            </button>
          </div>
          <div className="hidden sm:block shrink-0">
            <ColorPicker
              value={st.color ?? "#e2e8f0"}
              onChange={(hex) => updateScheduleTypeEntry(idx, "color", hex)}
            />
          </div>
          <input
            type="text"
            value={st[scheduleHourTab]}
            onChange={(e) => updateScheduleTypeEntry(idx, scheduleHourTab, e.target.value)}
            placeholder={scheduleHourTab === "hours" ? "예: 10:00-18:00" : "비워두면 기본값"}
            className="w-full text-xs rounded border border-line focus:border-[#2563eb] p-1.5 font-mono bg-white focus:outline-none"
          />
          <button
            type="button"
            onClick={() => removeScheduleType(idx)}
            className="hidden sm:block text-zinc-300 hover:text-rose-500 transition cursor-pointer p-0.5 rounded"
            title="삭제"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
    </div>
    <div className="flex gap-2 pt-1">
      <input
        type="text"
        value={newScheduleType}
        onChange={(e) => setNewScheduleType(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addScheduleType(); } }}
        placeholder="새 근무 유형 입력 (Enter)"
        className="flex-1 text-xs rounded-lg border border-line focus:border-[#2563eb] p-2 bg-white focus:outline-none"
      />
      <button
        type="button"
        onClick={addScheduleType}
        className="px-3 py-2 text-xs font-bold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white rounded-lg flex items-center gap-1 transition cursor-pointer"
      >
        <Plus size={13} />
        추가
      </button>
    </div>
    <div className="flex justify-end pt-2">
      <button
        type="button"
        disabled={applying}
        onClick={onApplyClick}
        className="px-4 py-2 text-xs font-bold bg-brand-deep hover:bg-brand-deep disabled:bg-indigo-300 text-white rounded-lg transition cursor-pointer flex items-center gap-1.5 shadow-sm"
      >
        {applying ? (
          <>
            <span className="animate-spin inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full" />
            적용 중...
          </>
        ) : "📋 현재 스케줄에 전체적용"}
      </button>
    </div>
  </div>
);
