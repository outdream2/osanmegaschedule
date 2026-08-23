// src/components/StaffManagePage/StaffLeaveSection.tsx
// 2026-08-23 · Framework Phase 4 · StaffManagePage 분리 · §7-2 연차·유급휴가
import React from "react";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, X } from "lucide-react";
import { Card } from "../common/Card";
import { Spinner } from "../common/Spinner";
import { SectionCard, EmptyRow, SectionLabel } from "./StaffManagePage.subcomponents";
import type { Employee, EditDraft } from "./types";

interface UsedLeave {
  date: string;
  type: string;
  memo?: string;
  weight: number;
}

interface StaffLeaveSectionProps {
  displayEmp: Employee;
  editing: boolean;
  draft: EditDraft | null;
  selectedEmp: Employee | null;
  leaveYear: number;
  currentYearNow: number;
  usedLeaves: UsedLeave[];
  leaveLoading: boolean;
  leaveError: string | null;
  deletingLeaveDate: string | null;
  setLeaveYear: React.Dispatch<React.SetStateAction<number>>;
  loadUsedLeaves: (empId: number, year: number) => void;
  deleteUsedLeave: (empId: number, date: string) => void;
  setField: <K extends keyof EditDraft>(k: K, v: EditDraft[K]) => void;
}

const LEAVE_TYPE_COLOR: Record<string, string> = {
  "월차":    "bg-amber-100 text-amber-700 border-amber-200",
  "오전반차": "bg-sky-100 text-sky-700 border-sky-200",
  "오후반차": "bg-indigo-100 text-indigo-700 border-indigo-200",
};

function getDayLabel(dateStr: string) {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return ["일","월","화","수","목","금","토"][d.getDay()];
  } catch { return ""; }
}

export const StaffLeaveSection: React.FC<StaffLeaveSectionProps> = ({
  displayEmp, editing, draft, selectedEmp,
  leaveYear, currentYearNow, usedLeaves,
  leaveLoading, leaveError, deletingLeaveDate,
  setLeaveYear, loadUsedLeaves, deleteUsedLeave, setField,
}) => {
  const totalDaysRaw = editing ? draft?.annual_leave_days : displayEmp.annual_leave_days;
  const totalDays = Number.isFinite(Number(totalDaysRaw)) ? Number(totalDaysRaw) : 15;
  const usedDays = usedLeaves.reduce((sum, l) => sum + l.weight, 0);
  const remainDays = Math.max(0, totalDays - usedDays);
  const fmtDays = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  return (
    <SectionCard title="연차 · 유급휴가" icon={<CalendarDays size={11} />} group="work" defaultOpen>
      <div className="flex flex-col gap-2.5">
        {/* 상단 KPI · 잔여 / 총 / 사용 + 연도 셀렉터 */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <div className="flex flex-col items-center px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 min-w-[56px]">
              <span className="text-[14px] font-bold text-emerald-600 uppercase tracking-wider">잔여</span>
              <span className="text-[14px] font-bold text-emerald-700 tabular-nums leading-tight">
                {fmtDays(remainDays)}<span className="text-[14px] font-semibold ml-0.5">일</span>
              </span>
            </div>
            <div className="flex flex-col items-center px-2.5 py-1 rounded-lg bg-zinc-50 border border-line min-w-[56px]">
              <span className="text-[14px] font-bold text-zinc-500 uppercase tracking-wider">총 부여</span>
              {editing ? (
                <input
                  type="number" min={0} step={1}
                  value={String(draft?.annual_leave_days ?? "")}
                  onChange={(e) => setField("annual_leave_days", e.target.value === "" ? null : Number(e.target.value))}
                  className="w-12 text-center border border-indigo-300 rounded-md px-1 py-0.5 text-[15px] font-bold text-zinc-800 tabular-nums bg-white focus:outline-none focus:border-brand-deep"
                />
              ) : (
                <span className="text-[14px] font-bold text-zinc-800 tabular-nums leading-tight">
                  {fmtDays(totalDays)}<span className="text-[14px] font-semibold ml-0.5">일</span>
                </span>
              )}
            </div>
            <div className="flex flex-col items-center px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 min-w-[56px]">
              <span className="text-[14px] font-bold text-amber-600 uppercase tracking-wider">사용</span>
              <span className="text-[14px] font-bold text-amber-700 tabular-nums leading-tight">
                {fmtDays(usedDays)}<span className="text-[14px] font-semibold ml-0.5">일</span>
              </span>
            </div>
          </div>
          {/* 연도 선택 */}
          <Card variant="raw-sm" rounded="lg" padding="none" className="flex items-center gap-1.5 px-1.5 py-1">
            <button
              type="button"
              onClick={() => setLeaveYear((y) => y - 1)}
              className="w-6 h-6 rounded-md hover:bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-800 cursor-pointer"
              title="이전 해"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-[14px] font-bold text-zinc-700 tabular-nums px-1 min-w-[46px] text-center">{leaveYear}년</span>
            <button
              type="button"
              onClick={() => setLeaveYear((y) => y + 1)}
              disabled={leaveYear >= currentYearNow}
              className="w-6 h-6 rounded-md hover:bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-800 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="다음 해"
            >
              <ChevronRight size={13} />
            </button>
            <button
              type="button"
              onClick={() => selectedEmp && loadUsedLeaves(selectedEmp.id, leaveYear)}
              className="ml-1 w-6 h-6 rounded-md hover:bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-indigo-600 cursor-pointer"
              title="새로고침"
            >
              <RefreshCw size={11} className={leaveLoading ? "animate-spin" : ""} />
            </button>
          </Card>
        </div>

        {/* 사용 이력 리스트 */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <SectionLabel color="bg-amber-400">사용한 연차 · {usedLeaves.length}건</SectionLabel>
            {editing && (
              <span className="text-[14px] font-semibold text-rose-500">편집 모드 · X 버튼으로 삭제</span>
            )}
          </div>
          {leaveError ? (
            <div className="text-[15px] text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-2 py-1.5">
              {leaveError}
            </div>
          ) : leaveLoading ? (
            <div className="flex items-center py-2">
              <Spinner size={11} tone="zinc" label="불러오는 중..." labelSize={15} />
            </div>
          ) : usedLeaves.length === 0 ? (
            <EmptyRow label={`${leaveYear}년 사용한 연차가 없습니다`} />
          ) : (
            <div className="border border-line rounded-lg overflow-hidden bg-white">
              <table className="w-full text-[14px]">
                <thead className="bg-zinc-50 border-b border-line">
                  <tr className="text-zinc-500 text-[14px] uppercase tracking-wider">
                    <th className="text-left font-semibold px-2.5 py-1.5 w-[110px]">날짜</th>
                    <th className="text-center font-semibold px-1.5 py-1.5 w-[70px]">유형</th>
                    <th className="text-left font-semibold px-2 py-1.5">사유 · 메모</th>
                    {editing && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody>
                  {usedLeaves.map((leave) => {
                    const typeColor = LEAVE_TYPE_COLOR[leave.type] ?? "bg-zinc-100 text-zinc-600 border-line";
                    const isDeleting = deletingLeaveDate === leave.date;
                    const dowLabel = getDayLabel(leave.date);
                    return (
                      <tr key={leave.date} className="border-t border-zinc-100 hover:bg-zinc-50/60">
                        <td className="px-2.5 py-1.5 font-semibold text-zinc-700 tabular-nums whitespace-nowrap">
                          {leave.date.replace(/-/g, ".")}
                          {dowLabel && <span className="text-[14px] font-normal text-zinc-400 ml-1">({dowLabel})</span>}
                        </td>
                        <td className="px-1.5 py-1.5 text-center">
                          <span className={`inline-block text-[14px] font-bold px-1.5 py-0.5 rounded-md border leading-tight ${typeColor}`}>
                            {leave.type}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-[15px] text-zinc-600 truncate max-w-[220px]" title={leave.memo}>
                          {leave.memo || <span className="text-zinc-300 italic">-</span>}
                        </td>
                        {editing && (
                          <td className="px-1 py-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => selectedEmp && deleteUsedLeave(selectedEmp.id, leave.date)}
                              disabled={isDeleting}
                              className="w-6 h-6 rounded-md text-zinc-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer disabled:opacity-40 flex items-center justify-center"
                              title="이 연차 삭제 (스케줄표에도 반영)"
                            >
                              {isDeleting ? <Spinner size={11} /> : <X size={12} />}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[14px] text-zinc-400 mt-0.5 leading-relaxed">
            연차 승인 시 자동 반영 · 삭제 시 스케줄표(월차)에서도 제거됩니다 · 반차는 0.5일로 계산
          </p>
        </div>
      </div>
    </SectionCard>
  );
};
