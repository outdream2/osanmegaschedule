// src/components/SettingsModal/tabs/WorkplacesTab.tsx
// 2026-08-29 · SettingsModal 분리 · workplaces 탭 서브컴포넌트
import React from "react";
import { Plus, Trash2 } from "lucide-react";

export interface WorkplacesTabProps {
  workplaces: string[];
  newWorkplace: string;
  setNewWorkplace: (v: string) => void;
  addWorkplace: () => void;
  removeWorkplace: (idx: number) => void;
}

export const WorkplacesTab: React.FC<WorkplacesTabProps> = ({
  workplaces, newWorkplace, setNewWorkplace, addWorkplace, removeWorkplace,
}) => (
  <div className="space-y-4">
    <p className="text-xs text-zinc-500 font-semibold">
      직원의 근무지(부서) 목록을 관리합니다. 기본값: 매장, 창고
    </p>
    {/* 2026-08-16 · 사용자 지시 · 근무지 종류 · 매장·창고 나란히 (grid 2열) */}
    <div className="grid grid-cols-2 gap-2">
      {workplaces.map((wp, idx) => (
        <div
          key={wp}
          className="flex items-center gap-2 bg-white border border-line hover:border-zinc-300 rounded-lg px-3 py-2 transition"
        >
          <span className="flex-1 text-xs font-semibold text-zinc-800">{wp}</span>
          <button
            type="button"
            onClick={() => removeWorkplace(idx)}
            className="text-zinc-300 hover:text-rose-500 transition cursor-pointer p-0.5 rounded"
            title="삭제"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
    </div>
    <div className="flex gap-2 pt-1">
      <input
        type="text"
        value={newWorkplace}
        onChange={(e) => setNewWorkplace(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addWorkplace(); } }}
        placeholder="새 근무지 입력 (Enter)"
        className="flex-1 text-xs rounded-lg border border-line focus:border-[#2563eb] p-2 bg-white focus:outline-none"
      />
      <button
        type="button"
        onClick={addWorkplace}
        className="px-3 py-2 text-xs font-bold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white rounded-lg flex items-center gap-1 transition cursor-pointer"
      >
        <Plus size={13} />
        추가
      </button>
    </div>
  </div>
);
