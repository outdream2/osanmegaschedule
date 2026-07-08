// src/components/ScheduleCell.tsx
import React, { useState, useRef, useEffect } from "react";
import { Schedule } from "../types";
import { SCHEDULE_TYPES, getTypeHex, isLightHex } from "../constants";
import type { ScheduleTypeEntry } from "../constants";
import { Clock, MessageSquare, Save, X, ToggleLeft, Settings2 } from "lucide-react";

interface ScheduleCellProps {
  schedule?: Schedule;
  dateStr: string;
  employeeId: number;
  onUpdate: (data: {
    employeeId: number;
    date: string;
    type: string;
    workingHours: string;
    actualHours: string;
    memo?: string;
  }) => Promise<void>;
  isAdmin?: boolean;
  isPharmacist?: boolean;
  typeHoursMap?: Record<string, string>;
  /** Optional override for schedule type list (from settings). Falls back to SCHEDULE_TYPES. */
  scheduleTypes?: { value: string; label: string }[];
  /** Full schedule type entries for dynamic color resolution. */
  scheduleTypeEntries?: ScheduleTypeEntry[];
}

export const ScheduleCell: React.FC<ScheduleCellProps> = ({
  schedule,
  dateStr,
  employeeId,
  onUpdate,
  isAdmin = false,
  isPharmacist = false,
  typeHoursMap,
  scheduleTypes: scheduleTypesProp,
  scheduleTypeEntries,
}) => {
  const activeScheduleTypes = scheduleTypesProp ?? SCHEDULE_TYPES;
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Form states initialized from schedule prop
  const [type, setType] = useState(schedule?.type || "");
  const [workingHours, setWorkingHours] = useState(schedule?.workingHours || "");
  const [actualHours, setActualHours] = useState(schedule?.actualHours || "");
  const [memo, setMemo] = useState(schedule?.memo || "");

  const popoverRef = useRef<HTMLDivElement>(null);
  const cellRef = useRef<HTMLDivElement>(null);
  // Days 20+ default to right-align (popup opens leftward) to stay in viewport
  const dayNum = parseInt(dateStr.split("-")[2]);
  const [popoverAlign, setPopoverAlign] = useState<"left" | "right">(dayNum >= 20 ? "right" : "left");

  // Reset draft states when popover opens or schedule changes
  useEffect(() => {
    if (isOpen) {
      setType(schedule?.type || "");
      setWorkingHours(schedule?.workingHours || "");
      setActualHours(schedule?.actualHours || "");
      setMemo(schedule?.memo || "");
    }
  }, [isOpen, schedule]);

  // Detect if cell is near right viewport edge and flip popover alignment
  useEffect(() => {
    if (isOpen && cellRef.current) {
      const rect = cellRef.current.getBoundingClientRect();
      setPopoverAlign(dayNum >= 20 || rect.left + 288 > window.innerWidth * 0.72 ? "right" : "left");
    }
  }, [isOpen]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const displayType = schedule?.type || "";
  const displayWorkingHours = schedule?.workingHours || "";
  const displayActualHours = schedule?.actualHours || "";
  const cellBgHex = displayType ? getTypeHex(displayType, scheduleTypeEntries) : null;
  const cellIsLight = cellBgHex ? isLightHex(cellBgHex) : true;

  const CYCLE = ["오픈", "미들", "마감", "휴무"];

  const handleQuickCycle = async () => {
    if (!isAdmin) return;
    const cur = schedule?.type || "";
    const idx = CYCLE.indexOf(cur);
    const nextType = CYCLE[(idx + 1) % CYCLE.length];
    const nextWh = typeHoursMap?.[nextType] ?? "";
    try {
      await onUpdate({
        employeeId, date: dateStr,
        type: nextType, workingHours: nextWh,
        actualHours: schedule?.actualHours || "",
        memo: schedule?.memo || "",
      });
    } catch (err) {
      console.error("Failed to cycle schedule:", err);
    }
  };

  // Handle preset clicks for fast logging
  const applyPreset = (presetType: string) => {
    setType(presetType);
    setWorkingHours(typeHoursMap?.[presetType] ?? "");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onUpdate({
        employeeId,
        date: dateStr,
        type: type || "휴무", // default to Rest day if empty
        workingHours,
        actualHours,
        memo,
      });
      setIsOpen(false);
    } catch (err) {
      console.error("Failed to update schedule cell:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      ref={cellRef}
      className="relative border-r border-b border-[#e2e8f0] h-12 sm:h-14 w-full flex flex-col justify-between p-0.5 select-none text-center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Clickable Card Grid Cell */}
      <div
        id={`cell-${employeeId}-${dateStr}`}
        className={`w-full h-full rounded-sm flex flex-col justify-center items-center p-0.5 relative transition-all ${
          isAdmin ? "cursor-pointer hover:bg-slate-50/80 hover:scale-[1.02] shadow-xs" : "cursor-default"
        } ${
          cellBgHex ? (cellIsLight ? "text-slate-900 font-bold" : "text-white font-bold") : "bg-white text-slate-400"
        }`}
        style={cellBgHex ? { backgroundColor: cellBgHex } : undefined}
        onClick={handleQuickCycle}
        title={isAdmin ? `클릭: 오픈→미들→마감→휴무 순환 변경\n⚙️ 상세 편집은 호버 후 톱니바퀴 클릭` : undefined}
      >
        {/* Detail edit button — 셀 최상단 별도 행 · 오픈 텍스트와 겹치지 않음 */}
        {isAdmin && (
          <button
            onClick={e => { e.stopPropagation(); setIsOpen(true); }}
            className="w-full flex items-center justify-center gap-0.5 px-1 py-0.5 rounded bg-slate-50 hover:bg-indigo-50 border border-slate-200/60 hover:border-indigo-300 text-slate-500 hover:text-indigo-600 active:scale-95 transition-colors cursor-pointer mb-0.5"
            title="상세 편집"
          >
            <Settings2 size={9} />
            <span className="text-[8px] font-bold leading-none">편집</span>
          </button>
        )}
        {/* Row 1: Type (오픈, 마감, 휴무 등) */}
        <div className="text-[11px] font-bold leading-tight truncate text-center w-full">
          {displayType || "-"}
        </div>
        {/* 하단 ↻ 클릭 힌트 제거됨 (내용 가림 방지) */}

        {/* Row 2: Working Hours */}
        {displayWorkingHours && !displayActualHours && (
          <div className="text-[8px] text-slate-400 leading-none font-medium tabular-nums mt-0.5">
            {displayWorkingHours}
          </div>
        )}

        {/* Row 3: Actual Notes (실근무/특이사항) */}
        {displayActualHours && (
          <div className={`text-[9px] font-black leading-none truncate tracking-tighter mt-0.5 px-1 py-0.5 rounded text-center shrink-0 ${
            displayActualHours.includes("지각")
              ? "text-amber-700 bg-amber-50 border border-amber-200"
              : displayActualHours.includes("조퇴")
                ? "text-purple-700 bg-purple-50 border border-purple-200"
                : displayActualHours.includes("결근")
                  ? "text-rose-700 bg-rose-50 border border-rose-200"
                  : "text-rose-600 bg-rose-50/50 border border-rose-100"
          }`}>
            {displayActualHours.includes("지각") && "⚠️ "}
            {displayActualHours.includes("조퇴") && "🏃 "}
            {displayActualHours.includes("결근") && "🚨 "}
            {displayActualHours}
          </div>
        )}

        {/* Memo Balloon Indicator / Notification Dot */}
        {schedule?.memo && schedule.memo.trim() !== "" && (
          <div className="absolute top-0.5 right-0.5 flex h-2 w-2" title="메모 있음">
            <span className="animate-ping absolute inline-flex h-[6px] w-[6px] rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
          </div>
        )}
      </div>

      {/* Hover Floating Custom Balloon Tooltip */}
      {isHovered && schedule?.memo && schedule.memo.trim() !== "" && (
        <div className="absolute bottom-[115%] left-1/2 -translate-x-1/2 w-48 bg-[#1e293b] text-[#f8fafc] text-[11px] p-2 rounded-lg shadow-xl z-50 pointer-events-none text-left border border-slate-700 select-text leading-relaxed">
          <div className="font-extrabold text-[#60a5fa] mb-0.5 flex items-center gap-1">
            <MessageSquare size={10} className="shrink-0 text-blue-400" />
            <span>메모:</span>
          </div>
          <p className="break-words leading-tight text-[10px] text-slate-200">{schedule.memo}</p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-[5px] border-transparent border-t-[#1e293b]"></div>
        </div>
      )}

      {/* Floating Micro-Modal Popover */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="fixed z-[200] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] sm:w-96 max-h-[90dvh] overflow-y-auto bg-white rounded-xl shadow-2xl p-4 border border-[#e2e8f0] text-slate-800 text-left animate-in fade-in duration-100"
        >
          <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-2 mb-3">
            <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded bg-[#2563eb] inline-block"></span>
              스케줄 설정 ({dateStr.split("-").slice(1).join("/")})
            </h4>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded transition cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>

          <form onSubmit={handleSave} className="space-y-3">
            {/* Quick One-click Attendance (⚡ 원클릭 근태 빠른 지정) - MOVED TO TOP */}
            <div className="p-2 border border-blue-200 bg-blue-50/50 rounded-xl space-y-1">
              <label className="block text-[10px] font-black text-blue-850 uppercase tracking-wider flex items-center justify-between">
                <span>⚡ 원클릭 근태 빠른 권역 지정</span>
                <span className="text-[8px] bg-blue-100/80 rounded px-1.5 py-0.2 text-blue-700 font-bold">빠른 연동</span>
              </label>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => setActualHours("")}
                  className="px-2 py-1 text-[10px] font-extrabold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded transition cursor-pointer"
                >
                  초기화
                </button>
                <button
                  type="button"
                  onClick={() => { setActualHours("지각"); setWorkingHours(typeHoursMap?.["오픈"] ?? ""); }}
                  className="px-2 py-1 text-[10px] font-extrabold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-250 rounded transition cursor-pointer"
                >
                  ⚠️ 지각
                </button>
                <button
                  type="button"
                  onClick={() => { setActualHours("조퇴"); }}
                  className="px-2 py-1 text-[10px] font-extrabold bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-250 rounded transition cursor-pointer"
                >
                  🏃 조퇴
                </button>
                <button
                  type="button"
                  onClick={() => { setActualHours("결근"); setType("결근"); setWorkingHours(""); }}
                  className="px-2 py-1 text-[10px] font-extrabold bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-250 rounded transition cursor-pointer"
                >
                  🚨 결근
                </button>
              </div>
            </div>

            {/* Quick Presets */}
            {(() => {
              const WORK_TYPES = new Set(["오픈", "미들", "마감", "오전반차", "오후반차"]);
              const OFF_TYPES = new Set(["휴무", "월차", "지정휴무", "결근"]);
              const currentGroup = WORK_TYPES.has(type) ? "work" : OFF_TYPES.has(type) ? "off" : null;
              const workTypes = activeScheduleTypes.filter(t => WORK_TYPES.has(t.value));
              const offTypes = activeScheduleTypes.filter(t => OFF_TYPES.has(t.value));
              const otherTypes = activeScheduleTypes.filter(t => !WORK_TYPES.has(t.value) && !OFF_TYPES.has(t.value));
              const renderBtn = (t: { value: string; label: string }, dimmed: boolean) => {
                const btnHex = getTypeHex(t.value, scheduleTypeEntries);
                const btnLight = isLightHex(btnHex);
                const isSelected = type === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => applyPreset(t.value)}
                    className={`px-2 py-1 text-[10px] sm:text-xs rounded border transition cursor-pointer ${
                      isSelected
                        ? `${btnLight ? "text-slate-900" : "text-white"} !border-[#2563eb] ring-1 ring-blue-500/20`
                        : dimmed
                          ? "bg-slate-50 text-slate-300 border-slate-100 hover:text-slate-600 hover:border-slate-200"
                          : "bg-slate-50 text-slate-700 border-[#e2e8f0] hover:bg-slate-100"
                    }`}
                    style={isSelected ? { backgroundColor: btnHex } : undefined}
                  >
                    {t.label}
                  </button>
                );
              };
              return (
                <div className="space-y-1.5">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">근무</label>
                    <div className="flex flex-wrap gap-1.5">
                      {workTypes.map(t => renderBtn(t, currentGroup === "off"))}
                      {otherTypes.map(t => renderBtn(t, false))}
                    </div>
                  </div>
                  {offTypes.length > 0 && (
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">휴무/연차</label>
                      <div className="flex flex-wrap gap-1.5">
                        {offTypes.map(t => renderBtn(t, currentGroup === "work"))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Shift Type (manual or selected from presets) */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                스케줄 유형
              </label>
              <select
                value={type}
                onChange={(e) => {
                  const newType = e.target.value;
                  const oldAutoHours = typeHoursMap?.[type] ?? "";
                  setType(newType);
                  if (!workingHours || workingHours === oldAutoHours) {
                    setWorkingHours(typeHoursMap?.[newType] ?? "");
                  }
                }}
                className="w-full text-xs rounded border border-[#e2e8f0] focus:border-[#2563eb] p-2 bg-white cursor-pointer focus:outline-none"
              >
                <option value="">-- 없음 --</option>
                {activeScheduleTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Scheduled Working Hours */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Clock size={10} /> 근무 시간 (workingHours)
              </label>
              <input
                type="text"
                value={workingHours}
                onChange={(e) => setWorkingHours(e.target.value)}
                placeholder="예: 09:30-18:30"
                className="w-full text-xs rounded border border-[#e2e8f0] focus:border-[#2563eb] p-2 bg-white focus:outline-none"
              />
            </div>

            {/* Actual hours details or Notes */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <MessageSquare size={10} /> 실근무/기타 (actualHours)
              </label>
              <input
                type="text"
                value={actualHours}
                onChange={(e) => setActualHours(e.target.value)}
                placeholder="예: 2시간 연장, 지각, 10-20 등"
                className="w-full text-xs rounded border border-[#e2e8f0] focus:border-[#2563eb] p-2 bg-white focus:outline-none"
              />
            </div>

            {/* Memo field */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <MessageSquare size={10} className="text-blue-500" /> 마우스 오버 팝업 메모 (memo)
              </label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="마우스를 올렸을 때 나타날 정보"
                className="w-full text-xs rounded border border-[#e2e8f0] focus:border-[#2563eb] p-2 bg-white focus:outline-none"
              />
            </div>

            {/* Save Buttons */}
            <div className="flex justify-end gap-1.5 pt-1.5 border-t border-[#e2e8f0] mt-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-50 hover:bg-slate-100 rounded border border-[#e2e8f0] text-slate-600 transition cursor-pointer"
                disabled={isSaving}
              >
                취소
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-semibold bg-[#2563eb] hover:bg-blue-700 text-white rounded border border-[#2563eb] inline-flex items-center gap-1 transition cursor-pointer"
                disabled={isSaving}
              >
                <Save size={12} />
                {isSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
