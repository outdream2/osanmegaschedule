/**
 * EmployeeNameCell.tsx
 * 스케줄표 좌측 고정 컬럼 — 직원 성명 셀
 *
 * 디자인 원칙
 * - 배지 제거 · 텍스트 위계로만 정보 전달
 * - 색상 팔레트 4개: slate(기본) · indigo(인터랙션) · emerald(약사) · rose(경고)
 * - 행 높이 고정 (min-h 유지) · hover 시 레이아웃 흔들림 없음
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

  const isPharmacist = emp.position === "약사";
  const isDragging = draggedRowId === emp.id;

  return (
    <td
      className={`
        relative
        border-r border-slate-100 bg-white sticky left-0 z-50
        group-hover:bg-slate-50
        shadow-[1px_0_0_0_#e2e8f0]
        min-w-[110px] w-[110px]
        sm:min-w-[140px] sm:w-[140px]
        lg:min-w-[160px] lg:w-[160px]
        p-0 transition-colors duration-150
        ${isDragging ? "opacity-40" : ""}
      `}
      style={{ willChange: "transform", backgroundColor: "#ffffff" }}
    >
      <div className="flex items-stretch h-full min-h-[54px] sm:min-h-[58px]">

        {/* 행 번호 — 좌측 수직 스트립 */}
        <div className="flex items-center justify-center w-4 sm:w-5 shrink-0 text-[8px] font-medium text-slate-300 select-none bg-slate-50/50 border-r border-slate-100">
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
        <div className="flex-1 flex flex-col justify-center py-1.5 px-1.5 sm:px-2 min-w-0 gap-0.5">

          {/* 줄 1: 이름 · 성별 표시 제거 (사용자 요청) */}
          <div className="flex items-center gap-1 min-w-0">
            {/* 이름 — 약사: emerald · 나머지: slate */}
            <span
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onNameClick(emp); }}
              title={`${emp.name} — 클릭: 개인 스케줄 달력`}
              className={`
                font-bold leading-tight
                cursor-pointer select-none transition-colors duration-150
                truncate
                text-[13px] sm:text-[14px]
                ${isPharmacist
                  ? "text-emerald-700 hover:text-emerald-900"
                  : "text-slate-700 hover:text-indigo-600"
                }
              `}
            >
              {emp.name}
            </span>
          </div>

          {/* 줄 2: 직종 텍스트 + 부가 정보 */}
          <div className="flex items-center gap-1.5 min-w-0">
            {/* 직종 — 배지 제거 · 약사만 emerald · 나머지 slate */}
            <span
              className={`
                text-[10px] font-medium leading-none shrink-0
                ${isPharmacist ? "text-emerald-600" : "text-slate-400"}
              `}
            >
              {emp.position}
            </span>

            {/* 고용형태 — 정직원 이외 · 관리자만 · sm 이상 */}
            {showEmploymentType && (
              <span className="hidden sm:inline text-[9px] font-normal text-slate-400 shrink-0 leading-none">
                {emp.employmentType}
              </span>
            )}

            {/* 월차 잔여 — sm 이상 · 잔여일 강조 */}
            {leaveRemaining !== null && (
              <span
                className={`
                  hidden sm:inline text-[9px] font-semibold shrink-0 leading-none
                  ${leaveRemaining === 0 ? "text-rose-400" : "text-slate-400"}
                `}
                title={`연차 잔여: ${leaveRemaining}일`}
              >
                {leaveRemaining === 0 ? "잔여 0" : `잔여 ${leaveRemaining}`}
              </span>
            )}

            {/* #186 · 우선업무 배지 · sm 이상 · 매장=emerald / 창고=orange */}
            {(emp.primary_focus === "매장" || emp.primary_focus === "창고") && (
              <span
                className={`
                  hidden sm:inline-flex items-center px-1 py-[1px] rounded-sm shrink-0 leading-none
                  text-[9px] font-black
                  ${emp.primary_focus === "매장"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-orange-100 text-orange-700"}
                `}
                title={`우선업무: ${emp.primary_focus} · ${emp.primary_focus_percent ?? 70}%`}
              >
                {emp.primary_focus} {emp.primary_focus_percent ?? 70}%
              </span>
            )}
          </div>

          {/* 줄 3: 비고 — lg 이상 표시 */}
          {emp.description && (
            <div
              className="hidden lg:block text-[9px] text-slate-350 font-normal truncate leading-tight text-slate-400"
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
