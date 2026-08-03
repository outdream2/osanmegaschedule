/**
 * EmployeeNameCell.tsx
 * 스케줄표 좌측 고정 컬럼 — 직원 성명 셀
 * - sticky left-0 z-[29] 유지
 * - 반응형: 90px (320px~) → 140px (1024px+)
 * - shadcn 스타일 배지 + 명확한 시각 위계
 * - 기존 이벤트 핸들러 시그니처 변경 없음
 */

import React from "react";
import { GripVertical, Edit, Trash2 } from "lucide-react";
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

/** 직종(position) → 배지 색상 매핑 */
function positionBadgeClass(position: string): string {
  switch (position) {
    case "약사":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "캐셔":
      return "bg-violet-50 text-violet-700 border-violet-200";
    case "진열":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "물류":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "알바":
      return "bg-amber-50 text-amber-700 border-amber-200";
    default:
      return "bg-slate-50 text-slate-600 border-slate-200";
  }
}

/** 고용형태 pill 색상 */
function employmentBadgeClass(type: string): string {
  if (type === "계약직") return "bg-blue-50 text-blue-600 border-blue-200";
  if (type === "알바") return "bg-amber-50 text-amber-600 border-amber-200";
  return "bg-slate-50 text-slate-500 border-slate-200";
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

  const showEmploymentBadge =
    userLevel >= 8 &&
    emp.employmentType &&
    emp.employmentType !== "정직원";

  const isPharmacist = emp.position === "약사";
  const isDragging = draggedRowId === emp.id;

  return (
    <td
      className={`
        relative
        border-r border-slate-100 bg-white sticky left-0 z-[29]
        group-hover:bg-slate-50/80
        shadow-[1px_0_0_0_#e2e8f0]
        min-w-[90px] w-[90px]
        sm:min-w-[120px] sm:w-[120px]
        lg:min-w-[140px] lg:w-[140px]
        p-0 transition-colors duration-150
        ${isDragging ? "opacity-40" : ""}
      `}
      style={{ willChange: "transform" }}
    >
      <div className="flex items-stretch h-full min-h-[54px] sm:min-h-[60px] lg:min-h-[64px]">

        {/* 행 번호 — 좌측 수직 스트립 */}
        <div className="flex items-center justify-center w-4 sm:w-5 shrink-0 text-[8px] sm:text-[9px] font-medium text-slate-300 select-none bg-slate-50/60 border-r border-slate-100">
          {empIdx + 1}
        </div>

        {/* 드래그 핸들 — 관리자 · sm 이상 */}
        {isAdmin && (
          <div
            className="hidden sm:flex items-center justify-center w-4 shrink-0 text-slate-200 hover:text-indigo-400 cursor-grab active:cursor-grabbing transition-colors duration-150"
            title="드래그하여 순서 변경"
          >
            <GripVertical size={11} />
          </div>
        )}

        {/* 메인 콘텐츠 영역 */}
        <div className="flex-1 flex flex-col justify-center py-1.5 px-1.5 sm:px-2 lg:px-2.5 min-w-0 gap-0.5">

          {/* 줄 1: 성별 아이콘 + 이름 */}
          <div className="flex items-center gap-1 min-w-0">
            {/* 성별 아이콘 */}
            {emp.gender === "남" && (
              <span className="text-[8px] font-bold text-sky-400 shrink-0 leading-none">♂</span>
            )}
            {emp.gender === "여" && (
              <span className="text-[8px] font-bold text-rose-400 shrink-0 leading-none">♀</span>
            )}

            {/* 이름 — 약사: emerald ring · 나머지: indigo */}
            <span
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onNameClick(emp); }}
              title={`${emp.name} — 클릭: 개인 스케줄 달력`}
              className={`
                font-bold text-[11px] sm:text-[12px] leading-tight
                cursor-pointer select-none transition-colors duration-150
                truncate max-w-full
                hover:underline underline-offset-2
                ${isPharmacist
                  ? "text-emerald-700 hover:text-emerald-900 ring-1 ring-emerald-400 ring-offset-1 rounded-[3px] px-0.5"
                  : "text-slate-700 hover:text-indigo-600"
                }
              `}
            >
              {emp.name}
            </span>
          </div>

          {/* 줄 2: 직종 배지 + 월차 dot + 고용형태 pill (sm 이상) */}
          <div className="flex items-center gap-1 min-w-0 flex-wrap">
            {/* 직종 배지 */}
            <span
              className={`
                inline-flex items-center
                text-[9px] sm:text-[9px] font-medium
                px-1 py-0 rounded-[3px] border leading-4
                shrink-0
                ${positionBadgeClass(emp.position)}
              `}
            >
              {emp.position}
            </span>

            {/* 월차 잔여 — sm 이상 표시 */}
            {leaveRemaining !== null && (
              <span
                className={`
                  hidden sm:inline-flex items-center gap-0.5
                  text-[9px] font-semibold shrink-0 leading-none
                  ${leaveRemaining === 0 ? "text-rose-400" : "text-amber-500"}
                `}
                title={`월차 잔여: ${leaveRemaining}일`}
              >
                <span
                  className={`
                    w-1.5 h-1.5 rounded-full shrink-0
                    ${leaveRemaining === 0 ? "bg-rose-400" : "bg-amber-400"}
                  `}
                />
                {leaveRemaining}
              </span>
            )}

            {/* 고용형태 pill — sm 이상 · 관리자 · 정직원 아닌 경우 */}
            {showEmploymentBadge && (
              <span
                className={`
                  hidden sm:inline-flex items-center
                  text-[8px] font-medium
                  px-1 py-0 rounded-full border leading-4
                  shrink-0
                  ${employmentBadgeClass(emp.employmentType)}
                `}
              >
                {emp.employmentType}
              </span>
            )}
          </div>

          {/* 줄 3: 비고 — lg 이상 표시 */}
          {emp.description && (
            <div
              className="hidden lg:block text-[9px] text-slate-400 font-normal truncate leading-tight"
              title={emp.description}
            >
              {emp.description}
            </div>
          )}

        </div>
      </div>

      {/* 수정·삭제 — 관리자 · hover fade-in · absolute (레이아웃 밀림 방지) */}
      {isAdmin && (
        <div className="absolute right-0.5 bottom-0.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto z-[1]">
          <button
            draggable={false}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onEditClick(emp); }}
            className="flex items-center justify-center w-5 h-5 rounded bg-white/90 backdrop-blur-sm border border-slate-200 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 hover:border-indigo-200 transition-colors duration-150 cursor-pointer shadow-sm"
            title="직원 정보 수정"
          >
            <Edit size={9} />
          </button>
          <button
            draggable={false}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDeleteClick(emp.id, emp.name); }}
            className="flex items-center justify-center w-5 h-5 rounded bg-white/90 backdrop-blur-sm border border-slate-200 text-slate-400 hover:text-rose-500 hover:bg-rose-50 hover:border-rose-200 transition-colors duration-150 cursor-pointer shadow-sm"
            title="직원 삭제"
          >
            <Trash2 size={9} />
          </button>
        </div>
      )}
    </td>
  );
};

export default EmployeeNameCell;
