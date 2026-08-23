// 2026-08-22 · Framework Phase 4 · EmployeeCalendarModal.tsx large-file 분리
// BulkTab · 일괄 스케줄 등록 탭 (날짜 선택 + 근무 조건 + 저장)
//   · props-driven pure display · 상태·핸들러 부모 유지

import React from "react";
import { Lock, MessageSquare, CheckCircle } from "lucide-react";
import { AccentBar } from "../common/AccentBar";
import { Card } from "../common/Card";
import type { Employee } from "../../types";
import type { ScheduleTypeEntry } from "../../constants";

interface BulkTabProps {
  employee: Employee;
  isLocked: boolean;
  bulkSelectedDates: string[];
  setBulkSelectedDates: React.Dispatch<React.SetStateAction<string[]>>;
  bulkType: string;
  bulkActualHours: string;
  setBulkActualHours: React.Dispatch<React.SetStateAction<string>>;
  bulkMemo: string;
  setBulkMemo: React.Dispatch<React.SetStateAction<string>>;
  setBulkType: React.Dispatch<React.SetStateAction<string>>;
  setBulkWorkingHours: React.Dispatch<React.SetStateAction<string>>;
  isBulkSaving: boolean;
  daysList: number[];
  getDayDetails: (day: number) => { dayWord: string; dayIndex: number; fullDate: string };
  selectAll: () => void;
  deselectAll: () => void;
  selectWeekdays: () => void;
  selectWeekends: () => void;
  toggleWeekday: (target: number) => void;
  handleBulkTypeChange: (newType: string) => void;
  handleBulkSave: () => void;
  activeTypes: ScheduleTypeEntry[] | { value: string; label: string }[];
  typeHoursMap?: Record<string, string>;
  onCancel: () => void;
}

export const BulkTab: React.FC<BulkTabProps> = ({
  employee, isLocked, bulkSelectedDates, setBulkSelectedDates,
  bulkType, bulkActualHours, setBulkActualHours, bulkMemo, setBulkMemo,
  setBulkType, setBulkWorkingHours, isBulkSaving,
  daysList, getDayDetails, selectAll, deselectAll, selectWeekdays, selectWeekends, toggleWeekday,
  handleBulkTypeChange, handleBulkSave, activeTypes, typeHoursMap, onCancel,
}) => {
  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-ink">

      {isLocked && (
        <Card bg="bg-amber-50" borderColor="border-amber-200" variant="flat" rounded="lg" padding="sm" className="flex items-center gap-2">
          <Lock size={14} className="text-amber-500 shrink-0" />
          <span className="text-[14px] font-semibold text-amber-800">이달 스케줄이 확정된 상태입니다. 메인에서 확정해제 후 사용하세요.</span>
        </Card>
      )}

      {employee.description && (
        <Card bg="bg-amber-50/70" borderColor="border-amber-100" variant="flat" rounded="lg" padding="sm" className="text-[14px] text-amber-800">
          <span className="font-bold mr-1.5">비고</span>{employee.description}
        </Card>
      )}

      {/* Section 1 · 날짜 선택 */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <AccentBar />
            <h3 className="text-[16px] font-bold tracking-tight text-ink">날짜 선택</h3>
            <span className="text-[14px] font-medium text-ink-soft tabular-nums">· {bulkSelectedDates.length}일</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={selectAll} className="px-2.5 py-1.5 text-[14px] font-semibold text-ink-soft hover:text-ink hover:bg-zinc-100 rounded-lg cursor-pointer transition-colors">전체</button>
            <button type="button" onClick={deselectAll} className="px-2.5 py-1.5 text-[14px] font-semibold text-ink-soft hover:text-ink hover:bg-zinc-100 rounded-lg cursor-pointer transition-colors">해제</button>
            <button type="button" onClick={selectWeekdays} className="px-2.5 py-1.5 text-[14px] font-semibold text-ink-soft hover:text-ink hover:bg-zinc-100 rounded-lg cursor-pointer transition-colors">평일</button>
            <button type="button" onClick={selectWeekends} className="px-2.5 py-1.5 text-[14px] font-semibold text-ink-soft hover:text-ink hover:bg-zinc-100 rounded-lg cursor-pointer transition-colors">주말</button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold text-ink-soft shrink-0">요일:</span>
          {[
            { label: "월", val: 1 }, { label: "화", val: 2 }, { label: "수", val: 3 },
            { label: "목", val: 4 }, { label: "금", val: 5 },
            { label: "토", val: 6 },
            { label: "일", val: 0 },
          ].map((w) => (
            <button
              key={w.val}
              type="button"
              onClick={() => toggleWeekday(w.val)}
              className="min-w-[36px] px-2.5 py-1.5 text-[14px] font-semibold text-ink border border-line rounded-lg hover:border-brand-deep hover:bg-brand-tint transition-colors cursor-pointer"
            >
              {w.label}
            </button>
          ))}
        </div>

        <Card bg="bg-zinc-50/60" variant="flat" padding="none" className="grid grid-cols-7 gap-1.5 p-2">
          {daysList.map((dayNum) => {
            const { dayWord, dayIndex, fullDate } = getDayDetails(dayNum);
            const isChecked = bulkSelectedDates.includes(fullDate);
            return (
              <label
                key={dayNum}
                className={`flex flex-col items-center justify-center py-1.5 border rounded-lg cursor-pointer text-center select-none transition-colors ${
                  isChecked
                    ? "bg-brand-deep border-brand-deep text-white"
                    : "bg-white border-line hover:border-brand hover:bg-brand-tint"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {
                    if (isChecked) setBulkSelectedDates(bulkSelectedDates.filter(d => d !== fullDate));
                    else setBulkSelectedDates([...bulkSelectedDates, fullDate]);
                  }}
                  className="sr-only"
                />
                <span className={`text-[13px] font-medium ${isChecked ? "text-white/80" : dayIndex === 6 ? "text-sky-500" : dayIndex === 0 ? "text-rose-500" : "text-ink-soft"}`}>
                  {dayWord}
                </span>
                <span className="text-[16px] font-bold tabular-nums">{dayNum}</span>
              </label>
            );
          })}
        </Card>
      </section>

      {/* Section 2 · 근무 조건 */}
      <section className="space-y-3">
        <div className="flex items-center gap-2.5">
          <AccentBar />
          <h3 className="text-[16px] font-bold tracking-tight text-ink">근무 조건</h3>
        </div>

        <div className="space-y-2">
          <label className="block text-[14px] font-semibold text-ink-soft">근태 빠른 지정</label>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setBulkActualHours("")} className="px-3 py-1.5 text-[14px] font-semibold text-ink-soft hover:text-ink border border-line hover:border-ink-soft rounded-lg cursor-pointer transition-colors">초기화</button>
            <button type="button" onClick={() => { setBulkActualHours("지각"); setBulkWorkingHours(typeHoursMap?.["오픈"] ?? ""); }} className="px-3 py-1.5 text-[14px] font-semibold text-amber-800 border border-amber-200 hover:bg-amber-50 rounded-lg cursor-pointer transition-colors">지각</button>
            <button type="button" onClick={() => setBulkActualHours("조퇴")} className="px-3 py-1.5 text-[14px] font-semibold text-violet-800 border border-violet-200 hover:bg-violet-50 rounded-lg cursor-pointer transition-colors">조퇴</button>
            <button type="button" onClick={() => { setBulkActualHours("결근"); setBulkType("결근"); setBulkWorkingHours(""); }} className="px-3 py-1.5 text-[14px] font-semibold text-rose-800 border border-rose-200 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors">결근</button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-[14px] font-semibold text-ink-soft">근무 패턴</label>
          <div className="flex flex-wrap gap-1.5">
            {activeTypes.map((t: any) => {
              const hours = typeHoursMap?.[t.value];
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => handleBulkTypeChange(t.value)}
                  className={`px-3 py-1.5 text-[14px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                    bulkType === t.value
                      ? "bg-brand-deep text-white border-brand-deep"
                      : "bg-white text-ink border-line hover:border-brand-deep hover:bg-brand-tint"
                  }`}
                >
                  {hours ? `${t.label} · ${hours}` : t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[14px] font-semibold text-ink-soft mb-1.5 flex items-center gap-1.5">
              <MessageSquare size={13} strokeWidth={2.2} /> 특이사항
            </label>
            <input
              type="text"
              value={bulkActualHours}
              onChange={e => setBulkActualHours(e.target.value)}
              placeholder="예: 2시간 연장, 지각, 조퇴"
              className="w-full text-[15px] rounded-lg border border-line focus:border-brand-deep focus:ring-2 focus:ring-brand-tint px-3 py-2 bg-white focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="text-[14px] font-semibold text-ink-soft mb-1.5 flex items-center gap-1.5">
              <MessageSquare size={13} strokeWidth={2.2} /> 메모
            </label>
            <input
              type="text"
              value={bulkMemo}
              onChange={e => setBulkMemo(e.target.value)}
              placeholder="마우스 오버 시 표시될 메모"
              className="w-full text-[15px] rounded-lg border border-line focus:border-brand-deep focus:ring-2 focus:ring-brand-tint px-3 py-2 bg-white focus:outline-none transition-colors"
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-2 pt-2 pb-1">
        <button
          type="button"
          onClick={onCancel}
          className="h-10 px-4 text-[15px] font-semibold bg-white hover:bg-zinc-50 border border-line hover:border-brand-deep hover:text-brand-deep text-ink rounded-lg transition-colors cursor-pointer"
          disabled={isBulkSaving}
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleBulkSave}
          disabled={isBulkSaving || bulkSelectedDates.length === 0 || isLocked}
          className="h-10 px-5 text-[15px] font-semibold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white rounded-lg transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        >
          {isBulkSaving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              <span>반영 중...</span>
            </>
          ) : (
            <>
              <CheckCircle size={15} strokeWidth={2.2} />
              <span>{bulkSelectedDates.length}일 일괄 등록</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
