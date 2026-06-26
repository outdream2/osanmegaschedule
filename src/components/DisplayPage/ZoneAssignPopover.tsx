// src/components/DisplayPage/ZoneAssignPopover.tsx
import React, { useEffect, useRef, useState } from "react";
import { X, Users, Package } from "lucide-react";
import type { ZoneSection } from "../../constants/displayZones";

// ─── Types (shared with DisplayPage) ──────────────────────────────────────────
type ZoneStatus = "normal" | "low" | "empty";

interface DisplayZone {
  id: string;
  num: number;
  label: string;
  category: string;
  section: ZoneSection;
  assignedStaffId: number | null;
  assignedStaffName: string;
  status: ZoneStatus;
  products: string;
}

interface ScheduleEntry { date: string; type: string; workingHours?: string; }
interface Employee { id: number; name: string; position: string; schedules?: ScheduleEntry[]; }
interface TodayStaff { employee: Employee; scheduleType: string; workingHours: string; }

// ─── Local helpers / palette (mirrors DisplayPage) ────────────────────────────
const statusCell = (s: ZoneStatus, extra = ""): string => {
  const m = {
    normal: "bg-emerald-50 border-emerald-300 hover:border-emerald-400 text-emerald-900",
    low: "bg-amber-50 border-amber-300 hover:border-amber-400 text-amber-900",
    empty: "bg-red-50 border-red-300 hover:border-red-400 text-red-900"
  };
  return `${m[s]} ${extra}`;
};

const STAFF_COLORS = [
  "bg-violet-100 text-violet-800 border-violet-300",
  "bg-sky-100 text-sky-800 border-sky-300",
  "bg-rose-100 text-rose-800 border-rose-300",
  "bg-teal-100 text-teal-800 border-teal-300",
  "bg-orange-100 text-orange-800 border-orange-300",
  "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300",
];

export interface ZoneAssignPopoverProps {
  zone: DisplayZone;
  anchor: DOMRect;
  logisticsStaff: TodayStaff[];
  staffColorMap: Map<number, number>;
  onAssign: (staffId: number, staffName: string) => void;
  onUnassign: () => void;
  onOpenDetail: () => void;
  onClose: () => void;
  onStaffInfoClick: (staff: TodayStaff) => void;
}

export const ZoneAssignPopover: React.FC<ZoneAssignPopoverProps> = ({
  zone, anchor, logisticsStaff, staffColorMap, onAssign, onUnassign, onOpenDetail, onClose, onStaffInfoClick,
}) => {
  const [style, setStyle] = useState<React.CSSProperties>({});
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popoverRef.current) return;
    const popoverHeight = popoverRef.current.offsetHeight || 220;
    const popoverWidth  = popoverRef.current.offsetWidth || 240;

    let top  = anchor.bottom + 6;
    let left = anchor.left + (anchor.width / 2) - (popoverWidth / 2);

    // Keep within window bounds
    if (left < 10) left = 10;
    if (left + popoverWidth > window.innerWidth - 10) {
      left = window.innerWidth - popoverWidth - 10;
    }
    if (top + popoverHeight > window.innerHeight - 10) {
      top = anchor.top - popoverHeight - 6;
    }
    if (top < 10) top = 10;

    setStyle({ top, left, position: "fixed", zIndex: 100 });
  }, [anchor]);

  return (
    <div
      ref={popoverRef}
      style={style}
      onClick={(e) => e.stopPropagation()}
      className="w-[240px] bg-white rounded-2xl border border-slate-200 shadow-2xl p-3 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Popover Header */}
      <div className="flex items-start justify-between border-b border-slate-100 pb-2">
        <div className="min-w-0">
          <div className="text-xs font-black text-slate-800 flex items-center gap-1.5">
            <span className={`px-1.5 py-0.5 rounded-md border text-[10px] ${statusCell(zone.status)}`}>
              {zone.num}번
            </span>
            <span className="truncate">{zone.label}</span>
          </div>
          <p className="text-[10px] text-slate-400 truncate mt-0.5">{zone.category}</p>
        </div>
        <button onClick={onClose} className="w-5 h-5 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer">
          <X size={12} />
        </button>
      </div>

      {/* Logistics Roster */}
      <div className="space-y-1">
        <div className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
          <Users size={11} />물류 담당 배정
        </div>

        {logisticsStaff.length === 0 ? (
          <div className="text-[10px] text-slate-400 italic py-2 text-center">오늘 출근한 물류 직원이 없습니다.</div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 max-h-[120px] overflow-y-auto pr-0.5">
            {logisticsStaff.map((ts) => {
              const { employee } = ts;
              const isAssigned = zone.assignedStaffId === employee.id;
              const colorIdx = staffColorMap.get(employee.id) ?? 0;

              return (
                <button
                  key={employee.id}
                  type="button"
                  onClick={() => onAssign(employee.id, employee.name)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onStaffInfoClick(ts);
                  }}
                  className={`px-2 py-1.5 rounded-lg border text-left text-[11px] font-bold truncate transition cursor-pointer flex items-center gap-1.5 ${
                    isAssigned
                      ? `${STAFF_COLORS[colorIdx % STAFF_COLORS.length]} border-indigo-400 shadow-3xs`
                      : "bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isAssigned ? "bg-indigo-600" : "bg-slate-300"}`} />
                  {employee.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Popover actions */}
      <div className="border-t border-slate-100 pt-2 flex gap-1.5">
        {zone.assignedStaffId !== null && (
          <button
            type="button"
            onClick={onUnassign}
            className="flex-1 text-[10px] font-bold text-rose-600 hover:text-rose-700 py-1.5 rounded-xl hover:bg-rose-50 border border-transparent transition cursor-pointer"
          >
            배정 해제
          </button>
        )}
        <button
          type="button"
          onClick={onOpenDetail}
          className="flex-1 text-[10px] font-semibold text-slate-500 hover:text-slate-700 py-1.5 rounded-xl hover:bg-slate-100 border border-transparent transition cursor-pointer flex items-center justify-center gap-1"
        >
          <Package size={11} />상세 편집 열기
        </button>
      </div>
    </div>
  );
};
