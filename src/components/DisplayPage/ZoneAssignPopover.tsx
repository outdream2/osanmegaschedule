// src/components/DisplayPage/ZoneAssignPopover.tsx
// 2026-08-23 · #189 · 구역 편집 모드 (label · category · num) · onZoneUpdate prop
import React, { useEffect, useRef, useState } from "react";
import { X, Users, Package, Pencil, Check, XCircle } from "lucide-react";
import { Badge } from "../common/Badge";
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
  onOpenProducts?: () => void;
  onClose: () => void;
  onStaffInfoClick: (staff: TodayStaff) => void;
  /** 2026-08-23 · #189 · 구역 편집 (label · category · num) · 있을 때만 수정 버튼 표시 */
  onZoneUpdate?: (updates: { label?: string; category?: string; num?: number }) => void;
}

export const ZoneAssignPopover: React.FC<ZoneAssignPopoverProps> = ({
  zone, anchor, logisticsStaff, staffColorMap, onAssign, onUnassign, onOpenDetail, onOpenProducts, onClose, onStaffInfoClick, onZoneUpdate,
}) => {
  const [style, setStyle] = useState<React.CSSProperties>({});
  const popoverRef = useRef<HTMLDivElement>(null);
  // 2026-08-23 · #189 · 편집 모드 · label · category · num 즉시 편집
  const [editMode, setEditMode] = useState(false);
  const [editLabel, setEditLabel] = useState(zone.label);
  const [editCategory, setEditCategory] = useState(zone.category);
  const [editNum, setEditNum] = useState<number>(zone.num);
  // zone 변경 시 · draft 리셋
  useEffect(() => {
    setEditLabel(zone.label);
    setEditCategory(zone.category);
    setEditNum(zone.num);
    setEditMode(false);
  }, [zone.id]);
  const handleSaveEdit = () => {
    const updates: { label?: string; category?: string; num?: number } = {};
    const trimLabel = editLabel.trim();
    const trimCategory = editCategory.trim();
    if (trimLabel && trimLabel !== zone.label) updates.label = trimLabel;
    if (trimCategory && trimCategory !== zone.category) updates.category = trimCategory;
    if (Number.isFinite(editNum) && editNum > 0 && editNum !== zone.num) updates.num = editNum;
    if (Object.keys(updates).length > 0) onZoneUpdate?.(updates);
    setEditMode(false);
  };
  const handleCancelEdit = () => {
    setEditLabel(zone.label);
    setEditCategory(zone.category);
    setEditNum(zone.num);
    setEditMode(false);
  };

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
      // 2026-08-18 · shadow-brand-modal · Attio 3-layer 통일
      className="w-[240px] bg-white rounded-2xl border border-line shadow-brand-modal p-3 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Popover Header · 2026-08-23 · #189 · 편집 모드 지원 (label · category · num) */}
      <div className="flex items-start justify-between border-b border-zinc-100 pb-2 gap-1">
        {editMode ? (
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={999}
                value={editNum}
                onChange={(e) => setEditNum(Number(e.target.value))}
                className="w-14 h-7 px-1.5 text-[12px] font-bold text-ink text-center border border-line rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep tabular-nums"
                placeholder="번호"
                title="구역 번호"
              />
              <input
                type="text"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                className="flex-1 min-w-0 h-7 px-1.5 text-[12px] font-bold text-ink border border-line rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep"
                placeholder="구역명"
                title="구역 이름"
              />
            </div>
            <input
              type="text"
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              className="h-6 px-1.5 text-[11px] text-ink-soft border border-line rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep"
              placeholder="카테고리"
              title="카테고리"
            />
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
              <Badge size="xs" className={statusCell(zone.status)}>
                {zone.num}번
              </Badge>
              <span className="break-words whitespace-normal">{zone.label}</span>
            </div>
            <p className="text-[10px] text-zinc-400 break-words whitespace-normal mt-0.5">{zone.category}</p>
          </div>
        )}
        <div className="flex items-center gap-0.5 shrink-0">
          {editMode ? (
            <>
              <button onClick={handleSaveEdit} className="w-5 h-5 rounded-md hover:bg-emerald-50 flex items-center justify-center text-emerald-600 hover:text-emerald-700 cursor-pointer" title="저장">
                <Check size={12} />
              </button>
              <button onClick={handleCancelEdit} className="w-5 h-5 rounded-md hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-600 cursor-pointer" title="취소">
                <XCircle size={12} />
              </button>
            </>
          ) : (
            <>
              {onZoneUpdate && (
                <button onClick={() => setEditMode(true)} className="w-5 h-5 rounded-md hover:bg-brand-tint flex items-center justify-center text-ink-soft hover:text-brand-deep cursor-pointer" title="구역 편집 (이름·카테고리·번호)">
                  <Pencil size={11} />
                </button>
              )}
              <button onClick={onClose} className="w-5 h-5 rounded-md hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-600 cursor-pointer" title="닫기">
                <X size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Logistics Roster */}
      <div className="space-y-1">
        <div className="text-[10px] font-bold text-zinc-500 flex items-center gap-1">
          <Users size={11} />물류 담당 배정
        </div>

        {logisticsStaff.length === 0 ? (
          <div className="text-[10px] text-zinc-400 italic py-2 text-center">오늘 출근한 물류 직원이 없습니다.</div>
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
                  className={`px-2 py-1.5 rounded-lg border text-left text-[11px] font-bold break-words whitespace-normal transition cursor-pointer flex items-center gap-1.5 ${
                    isAssigned
                      ? `${STAFF_COLORS[colorIdx % STAFF_COLORS.length]} border-indigo-400 shadow-sm`
                      : "bg-white border-line hover:bg-zinc-50 hover:border-zinc-300 text-zinc-700"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isAssigned ? "bg-brand-deep" : "bg-zinc-300"}`} />
                  {employee.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Popover actions */}
      <div className="border-t border-zinc-100 pt-2 flex gap-1.5">
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
          className="flex-1 text-[10px] font-semibold text-zinc-500 hover:text-zinc-700 py-1.5 rounded-xl hover:bg-zinc-100 border border-transparent transition cursor-pointer flex items-center justify-center gap-1"
        >
          <Package size={11} />상세 편집
        </button>
        {onOpenProducts && (
          <button
            type="button"
            onClick={onOpenProducts}
            className="flex-1 text-[10px] font-bold text-emerald-700 hover:text-emerald-900 py-1.5 rounded-xl hover:bg-emerald-50 border border-transparent transition cursor-pointer flex items-center justify-center gap-1"
            title="이 구역에 배정된 상품 리스트"
          >
            📦 상품 리스트
          </button>
        )}
      </div>
    </div>
  );
};
