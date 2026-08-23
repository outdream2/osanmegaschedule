// src/components/SchedulePage/CopyMonthModal.tsx
// 2026-08-22 · #framework-4 · SchedulePage 분리 · 전월복사 항목 선택 모달
// 2026-08-23 · #191 · Modal primitive 마이그레이션
import React from "react";
import { Layers } from "lucide-react";
import { Modal } from "../common/Modal";

interface CopyMonthModalProps {
  currentYear: number;
  currentMonth: number;
  copySchedules: boolean;
  setCopySchedules: (v: boolean) => void;
  copyDayAssignments: boolean;
  setCopyDayAssignments: (v: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export const CopyMonthModal: React.FC<CopyMonthModalProps> = ({
  currentYear, currentMonth,
  copySchedules, setCopySchedules,
  copyDayAssignments, setCopyDayAssignments,
  onClose, onConfirm,
}) => {
  const prevYear  = currentMonth === 1 ? currentYear - 1 : currentYear;
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;

  const titleNode = (
    <div>
      <div className="text-base font-bold text-zinc-800">전월 데이터 복사</div>
      <div className="text-xs text-zinc-500 mt-0.5">
        {prevYear}년 {prevMonth}월 → {currentYear}년 {currentMonth}월
      </div>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={titleNode}
      icon={<div className="p-2 bg-violet-100 text-violet-600 rounded-lg"><Layers size={18} /></div>}
      showClose={false}
    >
      <div className="space-y-2 mb-5">
        <label className="flex items-start gap-3 p-3 rounded-xl border border-line hover:bg-zinc-50 cursor-pointer">
          <input type="checkbox" className="mt-0.5 w-4 h-4 accent-indigo-500"
            checked={copySchedules}
            onChange={e => setCopySchedules(e.target.checked)} />
          <div className="flex-1">
            <div className="text-sm font-bold text-zinc-700">전체 월별 스케쥴</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">직원별 오픈/마감/휴무 등 근무 유형 스케줄</div>
          </div>
        </label>
        <label className="flex items-start gap-3 p-3 rounded-xl border border-line hover:bg-zinc-50 cursor-pointer">
          <input type="checkbox" className="mt-0.5 w-4 h-4 accent-indigo-500"
            checked={copyDayAssignments}
            onChange={e => setCopyDayAssignments(e.target.checked)} />
          <div className="flex-1">
            <div className="text-sm font-bold text-zinc-700">일별 근무설정</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">일자별 구역/점심/휴게 배정 (같은 일자 기준으로 복사)</div>
          </div>
        </label>
      </div>

      <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
        이번 달에 이미 데이터가 있으면 덮어쓸지 확인창이 뜹니다.
      </div>

      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2.5 rounded-xl border border-line bg-white text-zinc-600 text-xs font-bold hover:bg-zinc-50 cursor-pointer"
        >
          취소
        </button>
        <button
          onClick={onConfirm}
          disabled={!copySchedules && !copyDayAssignments}
          className="flex-1 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          복사 시작
        </button>
      </div>
    </Modal>
  );
};
