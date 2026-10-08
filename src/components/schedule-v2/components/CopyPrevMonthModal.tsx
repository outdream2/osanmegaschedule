// src/components/schedule-v2/components/CopyPrevMonthModal.tsx
// 2026-10-08 · 스케줄 V2 · 전월복사 confirm modal (V2 own UI · V1 CopyMonthModal 미사용)
//   · 기능 코드 · useScheduleData.executeCopyFromPreviousMonth 재사용 (V1 server endpoint 그대로)
//   · UI · 신규 · V2 톤 (neutral · thin border · low shadow · 이모지/파스텔 금지)
import React, { useState } from "react";
import { Modal } from "../../common/Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  /** target 월 · 전월 → 이 달 */
  targetYear: number;
  targetMonth: number;
  /** 호출 시 options · 상위에서 executeCopyFromPreviousMonth 호출 */
  onConfirm: (opts: { copySchedules: boolean; copyDayAssignments: boolean }) => Promise<void> | void;
}

export const CopyPrevMonthModal: React.FC<Props> = ({ open, onClose, targetYear, targetMonth, onConfirm }) => {
  const [copySchedules, setCopySchedules] = useState(true);
  const [copyDayAssignments, setCopyDayAssignments] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const prevYear = targetMonth === 1 ? targetYear - 1 : targetYear;
  const prevMonth = targetMonth === 1 ? 12 : targetMonth - 1;

  const handleRun = async () => {
    if (!copySchedules && !copyDayAssignments) return;
    setSubmitting(true);
    try {
      await onConfirm({ copySchedules, copyDayAssignments });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="전월 데이터 복사" size="sm">
      <div className="flex flex-col gap-3">
        <div className="text-[13px] text-ink-soft tabular-nums">
          <span className="font-semibold text-ink">{prevYear}년 {prevMonth}월</span>
          <span className="mx-1.5">→</span>
          <span className="font-semibold text-ink">{targetYear}년 {targetMonth}월</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-start gap-2.5 p-2.5 rounded-md border border-line bg-white hover:bg-zinc-50 cursor-pointer">
            <input
              type="checkbox"
              checked={copySchedules}
              onChange={e => setCopySchedules(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-brand-deep cursor-pointer"
            />
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-ink">월별 스케줄</div>
              <div className="text-[11px] text-ink-soft">직원별 오픈/마감/휴무 등 유형 (DOW 템플릿 기준)</div>
            </div>
          </label>
          <label className="flex items-start gap-2.5 p-2.5 rounded-md border border-line bg-white hover:bg-zinc-50 cursor-pointer">
            <input
              type="checkbox"
              checked={copyDayAssignments}
              onChange={e => setCopyDayAssignments(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-brand-deep cursor-pointer"
            />
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-ink">일별 배치</div>
              <div className="text-[11px] text-ink-soft">일자별 구역/점심/휴게 배정 (같은 일자 기준)</div>
            </div>
          </label>
        </div>

        <div className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2">
          이번 달에 이미 데이터가 있으면 서버가 덮어쓸지 확인합니다.
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-9 px-3 rounded-md border border-line bg-white text-ink-soft hover:bg-zinc-50 text-[13px] font-semibold cursor-pointer disabled:opacity-40"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleRun}
            disabled={submitting || (!copySchedules && !copyDayAssignments)}
            className="h-9 px-3 rounded-md bg-brand-deep text-white hover:bg-[#0d3a5c] text-[13px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "복사중..." : "복사"}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default CopyPrevMonthModal;
