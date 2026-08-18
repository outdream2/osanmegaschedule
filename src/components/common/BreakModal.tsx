// src/components/BreakModal.tsx
// 2026-08-18 · 프레임워크 통합 · <Modal> + <IconTile> + 폰트 +2
import React from "react";
import { Clock } from "lucide-react";
import { Modal } from "./Modal";
import { IconTile } from "./IconTile";

export interface BreakModalState {
  employeeId: number;
  date: string;
  scheduleId?: number;
  type: string;
  workingHours: string;
  actualHours: string;
  memo: string;
  lunchStart: string;
  lunchEnd: string;
  breakStart: string;
  breakEnd: string;
}

interface BreakModalProps {
  breakModal: BreakModalState;
  setBreakModal: React.Dispatch<React.SetStateAction<BreakModalState | null>>;
  isSavingBreak: boolean;
  onSave: () => void;
}

const inputCls =
  "flex-1 text-[15px] font-semibold rounded-xl border border-line focus:border-brand-deep focus:ring-2 focus:ring-brand-tint/30 p-3 bg-white focus:outline-none text-ink transition";

export const BreakModal: React.FC<BreakModalProps> = ({
  breakModal, setBreakModal, isSavingBreak, onSave,
}) => {
  return (
    <Modal
      open={true}
      onClose={() => setBreakModal(null)}
      size="sm"
      icon={<IconTile icon={<Clock size={14} />} tone="amber" size="md" />}
      title={
        <div className="min-w-0">
          <div className="text-[16px] font-bold text-ink tracking-tight">점심 · 휴게 시간</div>
          <div className="text-[12px] text-ink-soft font-medium">{breakModal.date}</div>
        </div>
      }
      titleAccent
      footer={
        <>
          <button
            type="button"
            onClick={() => setBreakModal(null)}
            className="h-10 px-4 text-[14px] font-bold bg-white hover:bg-brand-tint border border-line hover:border-brand-deep rounded-lg text-ink transition cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSavingBreak}
            className="h-10 px-6 text-[15px] font-bold bg-brand-deep hover:bg-brand-deep/90 text-white rounded-lg
              shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_2px_6px_-1px_rgba(10,46,74,0.25)]
              disabled:opacity-60 disabled:cursor-not-allowed transition cursor-pointer"
          >
            {isSavingBreak ? "저장 중…" : "저장"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-[14px] font-bold text-ink mb-2">점심 시간</label>
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={breakModal.lunchStart}
              onChange={e => setBreakModal(prev => prev ? { ...prev, lunchStart: e.target.value } : null)}
              className={inputCls}
            />
            <span className="text-ink-soft font-bold text-[14px]">~</span>
            <input
              type="time"
              value={breakModal.lunchEnd}
              onChange={e => setBreakModal(prev => prev ? { ...prev, lunchEnd: e.target.value } : null)}
              className={inputCls}
            />
          </div>
          <button
            type="button"
            onClick={() => setBreakModal(prev => prev ? { ...prev, lunchStart: "", lunchEnd: "" } : null)}
            className="mt-1 text-[12px] text-ink-soft hover:text-rose-500 transition cursor-pointer"
          >
            초기화
          </button>
        </div>

        <div>
          <label className="block text-[14px] font-bold text-ink mb-2">휴게 시간</label>
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={breakModal.breakStart}
              onChange={e => setBreakModal(prev => prev ? { ...prev, breakStart: e.target.value } : null)}
              className={inputCls}
            />
            <span className="text-ink-soft font-bold text-[14px]">~</span>
            <input
              type="time"
              value={breakModal.breakEnd}
              onChange={e => setBreakModal(prev => prev ? { ...prev, breakEnd: e.target.value } : null)}
              className={inputCls}
            />
          </div>
          <button
            type="button"
            onClick={() => setBreakModal(prev => prev ? { ...prev, breakStart: "", breakEnd: "" } : null)}
            className="mt-1 text-[12px] text-ink-soft hover:text-rose-500 transition cursor-pointer"
          >
            초기화
          </button>
        </div>
      </div>
    </Modal>
  );
};
