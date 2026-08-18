// src/components/BreakModal.tsx
import React, { useEffect } from "react";
import { X, Clock } from "lucide-react";

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

export const BreakModal: React.FC<BreakModalProps> = ({ breakModal, setBreakModal, isSavingBreak, onSave }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setBreakModal(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setBreakModal]);

  // 2026-08-17 v2 · frosted backdrop + 3-layer shadow · Modal 통일
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      style={{ background: "rgba(10, 46, 74, 0.35)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl border border-line p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-200"
        style={{ boxShadow: "0 1px 3px rgba(10,46,74,0.12), 0 8px 32px -8px rgba(10,46,74,0.24), 0 24px 64px -24px rgba(10,46,74,0.28)" }}
      >
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-500 text-white rounded-lg">
              <Clock size={16} />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-gray-900 tracking-tight">점심 / 휴게 시간</h3>
              <p className="text-[10px] text-gray-400 font-medium">{breakModal.date}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBreakModal(null)}
            className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">🍱 점심 시간</label>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={breakModal.lunchStart}
                onChange={e => setBreakModal(prev => prev ? { ...prev, lunchStart: e.target.value } : null)}
                className="flex-1 text-sm font-semibold rounded-xl border border-gray-300 focus:border-brand-deep focus:ring-2 focus:ring-brand-tint/10 p-3 bg-white focus:outline-none text-gray-800 transition"
              />
              <span className="text-gray-400 font-bold text-sm">~</span>
              <input
                type="time"
                value={breakModal.lunchEnd}
                onChange={e => setBreakModal(prev => prev ? { ...prev, lunchEnd: e.target.value } : null)}
                className="flex-1 text-sm font-semibold rounded-xl border border-gray-300 focus:border-brand-deep focus:ring-2 focus:ring-brand-tint/10 p-3 bg-white focus:outline-none text-gray-800 transition"
              />
            </div>
            <button
              type="button"
              onClick={() => setBreakModal(prev => prev ? { ...prev, lunchStart: "", lunchEnd: "" } : null)}
              className="mt-1 text-[10px] text-gray-400 hover:text-rose-500 transition"
            >
              초기화
            </button>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">☕ 휴게 시간</label>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={breakModal.breakStart}
                onChange={e => setBreakModal(prev => prev ? { ...prev, breakStart: e.target.value } : null)}
                className="flex-1 text-sm font-semibold rounded-xl border border-gray-300 focus:border-brand-deep focus:ring-2 focus:ring-brand-tint/10 p-3 bg-white focus:outline-none text-gray-800 transition"
              />
              <span className="text-gray-400 font-bold text-sm">~</span>
              <input
                type="time"
                value={breakModal.breakEnd}
                onChange={e => setBreakModal(prev => prev ? { ...prev, breakEnd: e.target.value } : null)}
                className="flex-1 text-sm font-semibold rounded-xl border border-gray-300 focus:border-brand-deep focus:ring-2 focus:ring-brand-tint/10 p-3 bg-white focus:outline-none text-gray-800 transition"
              />
            </div>
            <button
              type="button"
              onClick={() => setBreakModal(prev => prev ? { ...prev, breakStart: "", breakEnd: "" } : null)}
              className="mt-1 text-[10px] text-gray-400 hover:text-rose-500 transition"
            >
              초기화
            </button>
          </div>
        </div>

        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={() => setBreakModal(null)}
            className="flex-1 p-3 text-xs font-bold bg-gray-50 hover:bg-gray-100 rounded-xl border border-line text-gray-600 transition"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSavingBreak}
            className="flex-1 p-3 text-xs font-bold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white border border-amber-500 rounded-xl transition shadow-sm disabled:opacity-60"
          >
            {isSavingBreak ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
};
