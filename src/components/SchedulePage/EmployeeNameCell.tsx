/**
 * EmployeeNameCell.tsx
 * 스케줄표 좌측 고정 컬럼 — 직원 성명 셀
 *
 * 2026-09-03 · 사용자 지시 · 2주 전 UI 복원 (배지 X · 텍스트만)
 *   · 배지·아바타·톤 chip 제거 · plain 텍스트 위계
 *   · 직군 (position) · 위 · 이름 · 아래
 *   · 약사 · emerald 톤 · 나머지 zinc
 *   · 셀 폭 · min-w-[110-120]
 *
 * 이전 커밋 (9847d652 · #61) · position 텍스트 색상만 유지 · 배지 형태 완전 제거
 */

import React from "react";
import { GripVertical } from "lucide-react";
import type { Employee } from "../../types";

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
  onEditClick: _onEditClick,
  onDeleteClick: _onDeleteClick,
}) => {
  /* 월차 잔여 계산 (기존 유지 · 표시 X) */
  const leaveTotal = Number.isFinite(Number(emp.annual_leave_days))
    ? Number(emp.annual_leave_days)
    : null;
  const leaveUsed =
    leaveTotal !== null
      ? emp.schedules.filter(
          (s) => s.type === "월차" && s.date.startsWith(`${currentYear}-`)
        ).length
      : null;
  void leaveTotal; void leaveUsed;

  void userLevel;

  const isPharmacist = emp.position === "약사";
  const isDragging = draggedRowId === emp.id;

  return (
    <td
      className={`
        relative
        border-r border-line bg-white sticky left-0 z-20
        group-hover:bg-brand-tint/20
        shadow-[1px_0_0_0_#e5e9ef]
        min-w-[110px] w-[110px]
        sm:min-w-[120px] sm:w-[120px]
        lg:min-w-[132px] lg:w-[132px]
        p-0 transition-colors duration-150
        ${isDragging ? "opacity-40" : ""}
      `}
      style={{ willChange: "transform", backgroundColor: "#ffffff" }}
    >
      <div className="flex items-stretch h-full min-h-[54px] sm:min-h-[58px]">

        {/* 행 번호 · 좌측 스트립 */}
        <div className="flex items-center justify-center w-4 sm:w-5 shrink-0 text-[10px] font-medium text-zinc-300 select-none">
          {empIdx + 1}
        </div>

        {/* 드래그 핸들 · 관리자 · sm+ */}
        {isAdmin && (
          <div
            className="hidden sm:flex items-center justify-center w-4 shrink-0 text-zinc-200 hover:text-indigo-400 cursor-grab active:cursor-grabbing transition-colors"
            title="드래그하여 순서 변경"
          >
            <GripVertical size={11} />
          </div>
        )}

        {/* 메인 · 직군(위) + 이름(아래) · 텍스트만 */}
        <div className="flex-1 flex flex-col justify-center py-1.5 pl-1 pr-1 min-w-0 gap-0.5">
          {/* 직군 · 작은 텍스트 · 약사 emerald · 그 외 zinc */}
          {emp.position && (
            <span className={`text-[11px] sm:text-[12px] font-medium leading-none truncate ${isPharmacist ? "text-emerald-600" : "text-zinc-400"}`}>
              {emp.position}
            </span>
          )}
          {/* 이름 · 큰 bold · 클릭 시 모달 */}
          <span
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onNameClick(emp); }}
            title={`${emp.name} — 클릭: 개인 스케줄 달력`}
            className={`font-bold leading-tight cursor-pointer select-none transition-colors truncate text-[14px] sm:text-[15px] ${
              isPharmacist ? "text-emerald-700 hover:text-emerald-900" : "text-zinc-700 hover:text-brand-deep"
            }`}
          >
            {emp.name}
          </span>
          {/* 비고 · lg+ */}
          {emp.description && (
            <div
              className="hidden lg:block text-[9px] text-zinc-400 font-normal truncate leading-tight"
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
