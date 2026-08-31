/**
 * EmployeeNameCell.tsx
 * 스케줄표 좌측 고정 컬럼 — 직원 성명 셀
 *
 * 2026-08-31 · 사용자 지시 · 시각적 배치 개선 · Attio/Linear 톤
 * - 아바타 (성 initial) · 색상 톤 · 약사=emerald · 매장=violet · 물류=amber · 기본=zinc
 * - 이름 위계 강화 · font-bold · 대비 up
 * - 직군 subtle chip · pharmacist emerald bg
 * - 좌측 accent stripe · position tone
 */

import React from "react";
import { GripVertical } from "lucide-react";
import type { Employee } from "../../types";

// 2026-08-31 · position 별 톤 매핑 · Attio 컬러 팔레트
const POSITION_TONE: Record<string, { stripe: string; avatarBg: string; avatarText: string; ring: string; posText: string; posBg: string }> = {
  "약사":  { stripe: "bg-emerald-500", avatarBg: "bg-emerald-100", avatarText: "text-emerald-700", ring: "ring-emerald-300", posText: "text-emerald-700", posBg: "bg-emerald-50 border-emerald-200" },
  "매장":  { stripe: "bg-violet-500",  avatarBg: "bg-violet-100",  avatarText: "text-violet-700",  ring: "ring-violet-300",  posText: "text-violet-700",  posBg: "bg-violet-50 border-violet-200" },
  "창고":  { stripe: "bg-amber-500",   avatarBg: "bg-amber-100",   avatarText: "text-amber-700",   ring: "ring-amber-300",   posText: "text-amber-700",   posBg: "bg-amber-50 border-amber-200" },
  "관리자": { stripe: "bg-sky-500",     avatarBg: "bg-sky-100",     avatarText: "text-sky-700",     ring: "ring-sky-300",     posText: "text-sky-700",     posBg: "bg-sky-50 border-sky-200" },
};
const DEFAULT_TONE = { stripe: "bg-zinc-300", avatarBg: "bg-zinc-100", avatarText: "text-zinc-600", ring: "ring-zinc-200", posText: "text-zinc-500", posBg: "bg-zinc-50 border-zinc-200" };
function toneFor(pos: string | null | undefined) {
  return (pos && POSITION_TONE[pos]) ? POSITION_TONE[pos] : DEFAULT_TONE;
}
function initialOf(name: string | null | undefined): string {
  const s = String(name ?? "").trim();
  if (!s) return "?";
  return s.charAt(0);
}

interface EmployeeNameCellProps {
  emp: Employee;
  empIdx: number;
  isAdmin: boolean;
  userLevel: number;
  currentYear: number;
  draggedRowId: number | null;
  dragOverRowId: number | null;
  onNameClick: (emp: Employee) => void;
  onEditClick: (emp: Employee) => void;
  onDeleteClick: (id: number, name: string) => void;
}

const EmployeeNameCell: React.FC<EmployeeNameCellProps> = ({
  emp,
  empIdx,
  isAdmin,
  userLevel,
  currentYear,
  draggedRowId,
  dragOverRowId: _dragOverRowId,
  onNameClick,
  onEditClick,
  onDeleteClick,
}) => {
  /* 월차 잔여 계산 */
  const leaveTotal = Number.isFinite(Number(emp.annual_leave_days))
    ? Number(emp.annual_leave_days)
    : null;
  const leaveUsed =
    leaveTotal !== null
      ? emp.schedules.filter(
          (s) => s.type === "월차" && s.date.startsWith(`${currentYear}-`)
        ).length
      : null;
  const leaveRemaining =
    leaveTotal !== null && leaveUsed !== null
      ? Math.max(0, leaveTotal - leaveUsed)
      : null;

  const showEmploymentType =
    userLevel >= 8 &&
    emp.employmentType &&
    emp.employmentType !== "정직원";

  const isDragging = draggedRowId === emp.id;
  const tone = toneFor(emp.position);
  const initial = initialOf(emp.name);

  return (
    <td
      className={`
        relative
        border-r border-line bg-white sticky left-0 z-20
        group-hover:bg-brand-tint/25
        shadow-[1px_0_0_0_#e5e9ef]
        min-w-[128px] w-[128px]
        sm:min-w-[144px] sm:w-[144px]
        lg:min-w-[156px] lg:w-[156px]
        p-0 transition-colors duration-150
        ${isDragging ? "opacity-40" : ""}
      `}
      style={{ willChange: "transform", backgroundColor: "#ffffff" }}
    >
      {/* 2026-08-31 · 좌측 position tone accent bar · 4px */}
      <span className={`absolute left-0 top-1 bottom-1 w-1 rounded-r-full ${tone.stripe} opacity-70 group-hover:opacity-100 transition-opacity`} aria-hidden />

      <div className="flex items-stretch h-full min-h-[58px] sm:min-h-[62px] pl-1.5">

        {/* 행 번호 · softer · smaller */}
        <div className="flex items-center justify-center w-4 shrink-0 text-[10px] font-semibold text-zinc-300 select-none">
          {empIdx + 1}
        </div>

        {/* 드래그 핸들 · 관리자 · sm+ */}
        {isAdmin && (
          <div
            className="hidden sm:flex items-center justify-center w-3.5 shrink-0 text-zinc-200 hover:text-brand-deep cursor-grab active:cursor-grabbing transition-colors"
            title="드래그하여 순서 변경"
          >
            <GripVertical size={11} />
          </div>
        )}

        {/* 아바타 · 성 initial · position tone */}
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onNameClick(emp); }}
          title={`${emp.name} — 클릭: 개인 스케줄 달력`}
          className={`
            shrink-0 self-center w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center
            text-[14px] sm:text-[15px] font-extrabold ${tone.avatarBg} ${tone.avatarText}
            ring-2 ${tone.ring} shadow-sm
            hover:scale-105 active:scale-95 transition-all cursor-pointer
          `}
        >
          {initial}
        </button>

        {/* 메인 콘텐츠 · 이름 위 · 직군 chip 아래 */}
        <div className="flex-1 flex flex-col justify-center py-1.5 pl-2 pr-1 min-w-0 gap-0.5">
          {/* 이름 · 상단 */}
          <span
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onNameClick(emp); }}
            title={`${emp.name} — 클릭: 개인 스케줄 달력`}
            className="font-extrabold leading-tight cursor-pointer select-none transition-colors truncate text-[15px] sm:text-[16px] text-ink hover:text-brand-deep tracking-tight"
          >
            {emp.name}
          </span>

          {/* 직군 chip · 하단 */}
          {emp.position && (
            <span className={`inline-flex items-center self-start h-4 px-1.5 rounded text-[10px] sm:text-[11px] font-bold border tabular-nums ${tone.posBg} ${tone.posText}`}>
              {emp.position}
            </span>
          )}

          {/* 비고 · lg+ */}
          {emp.description && (
            <div
              className="hidden lg:block text-[10px] text-zinc-400 font-medium truncate leading-tight"
              title={emp.description}
            >
              {emp.description}
            </div>
          )}
        </div>
      </div>
    </td>
  );
};

export default EmployeeNameCell;
