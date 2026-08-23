// src/components/DisplayPage/StaffInfoModal.tsx
// 2026-08-22 · Framework Phase 4 · DisplayPage.tsx 에서 분리
// 2026-08-23 · #191 Modal v3.4 재마이그레이션 · align=bottom-mobile · headerBgClass 조건부
import React from "react";
import { MapPin, Sparkles, X } from "lucide-react";
import { Modal } from "../common/Modal";
import { StatusPill } from "../common/StatusPill";
import { Badge } from "../common/Badge";
import { SHIFT_BADGE, STAFF_COLORS } from "./DisplayPage.helpers";
import type { DisplayZone } from "../../utils/zoneUtils";
import type { TodayStaff, Employee } from "./DisplayPage.types";

interface StaffInfoModalProps {
  activeStaffInfo: TodayStaff;
  zones: DisplayZone[];
  employees: Employee[];
  staffColorMap: Map<number, number>;
  onClose: () => void;
  onZoneToggle: (zoneId: string, empId: number, empName: string, isAssigned: boolean) => void;
  onClearAllZones: (empId: number) => void;
}

export const StaffInfoModal: React.FC<StaffInfoModalProps> = ({
  activeStaffInfo,
  zones,
  employees,
  staffColorMap,
  onClose,
  onZoneToggle,
  onClearAllZones,
}) => {
  const getAssignedZones = (staffId: number) => zones.filter((z) => z.assignedStaffId === staffId);
  const { employee, scheduleType, workingHours } = activeStaffInfo;
  const isLogistics = employee.position.includes("물류");

  // v3.4 · 조건부 헤더 배경 · 원본 로직 유지
  const headerBgClass = isLogistics ? "bg-brand-deep" : "bg-zinc-700";

  // Modal title ReactNode · 원본 헤더 내부 구조 그대로 · -my-3 py-5 로 modal-header py-3 보정
  const headerTitle = (
    <div className="-my-3 py-5 flex-1 flex items-start justify-between gap-3 min-w-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-14 h-14 rounded-full bg-white/[0.18] flex items-center justify-center text-[16px] font-semibold text-white shrink-0 ring-1 ring-white/25">
          {employee.name.slice(0, 2)}
        </div>
        <div className="min-w-0">
          <div className="text-xl font-bold text-white leading-tight">{employee.name}</div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/25 text-white">
              {employee.position || "약사"}
            </span>
            <Badge shape="pill" size="xs" className={SHIFT_BADGE[scheduleType] ?? "bg-zinc-100 text-zinc-700 border-line"}>
              {scheduleType}
            </Badge>
            {workingHours && (
              <span className="text-[11px] text-white/80 font-medium">{workingHours}</span>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={onClose}
        className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center text-white cursor-pointer transition shrink-0"
      >
        <X size={16} />
      </button>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={headerTitle}
      align="bottom-mobile"
      headerBgClass={headerBgClass}
      headerTextClass="text-white"
      size="sm"
      className="sm:max-w-sm"
      bodyPadding="none"
      showClose={false}
      closeOnBackdrop
    >
      {/* Zone assignment (logistics only) */}
      {isLogistics ? (
        <div className="px-5 pt-3 pb-2 max-h-[60vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-700">
              <MapPin size={12} className="text-indigo-500" />
              구역 배정
              {getAssignedZones(employee.id).length > 0 && (
                <StatusPill tone="indigo" size="xs">
                  {getAssignedZones(employee.id).length}개
                </StatusPill>
              )}
            </div>
            {getAssignedZones(employee.id).length > 0 && (
              <button
                type="button"
                onClick={() => onClearAllZones(employee.id)}
                className="text-[10px] font-bold text-rose-500 hover:text-rose-700 px-2 py-1 rounded-lg hover:bg-rose-50 transition cursor-pointer"
              >
                전체 해제
              </button>
            )}
          </div>
          {/* Zone grid by section */}
          {(["top_wall", "aisle", "left_wall", "bottom_wall", "wing", "event"] as const).map((section) => {
            const sectionZones = zones.filter(z => z.section === section);
            const sectionLabel: Record<string, string> = {
              top_wall: "상단 벽면", aisle: "중앙 진열대", left_wall: "좌측 벽면",
              bottom_wall: "하단 벽면", wing: "우측 윙", event: "이벤트존",
            };
            return (
              <div key={section} className="mb-3">
                <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">{sectionLabel[section]}</div>
                <div className="grid grid-cols-5 gap-1">
                  {sectionZones.map((z) => {
                    const empId = employee.id;
                    const isAssigned = z.assignedStaffId === empId;
                    const otherName = !isAssigned && z.assignedStaffId !== null ? z.assignedStaffName : null;
                    return (
                      <button
                        key={z.id}
                        type="button"
                        onClick={() => onZoneToggle(z.id, empId, employee.name, isAssigned)}
                        title={otherName ? `현재: ${otherName} 담당 (클릭 시 재배정)` : z.category}
                        className={`rounded-lg border-2 p-1 text-left transition-all cursor-pointer active:scale-95 ${isAssigned
                          ? "bg-indigo-100 border-indigo-400 shadow-sm"
                          : otherName
                            ? "bg-amber-50 border-amber-300 hover:border-indigo-300"
                            : "bg-white border-line hover:border-indigo-300 hover:bg-indigo-50"
                        }`}
                      >
                        {z.num <= 8 && (
                          <div className={`text-[10px] font-bold leading-tight ${isAssigned ? "text-indigo-800" : otherName ? "text-amber-700" : "text-zinc-700"}`}>
                            {z.num}
                            {z.id.endsWith("A") && "A"}
                            {z.id.endsWith("B") && "B"}
                          </div>
                        )}
                        <div className={`text-[10px] leading-none ${z.num <= 8 ? "mt-0.5" : "mt-0"} truncate ${isAssigned ? "text-indigo-500" : otherName ? "text-amber-500" : "text-zinc-400"}`}>
                          {otherName ? otherName : z.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-5 py-4">
          <div className="flex flex-col items-center py-4 text-zinc-400 text-xs text-center bg-zinc-50 rounded-xl border border-dashed border-line">
            <Sparkles size={18} className="mb-1 opacity-30" />
            구역 배정은 물류 직원에게만 적용됩니다
          </div>
        </div>
      )}

      <div className="px-5 pb-5">
        <button
          onClick={onClose}
          className="w-full py-2.5 text-sm font-semibold rounded-xl bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition cursor-pointer"
        >
          닫기
        </button>
      </div>
    </Modal>
  );
};
