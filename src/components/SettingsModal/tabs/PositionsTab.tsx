// src/components/SettingsModal/tabs/PositionsTab.tsx
// 2026-08-29 · #177 · SettingsModal 분리 · positions 탭 서브컴포넌트
import React from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";

export interface PositionsTabProps {
  positions: string[];
  newPosition: string;
  setNewPosition: (v: string) => void;
  addPosition: () => void;
  removePosition: (idx: number) => void;
  dragIndex: number | null;
  dragOverIndex: number | null;
  handlePositionDragStart: (idx: number) => void;
  handlePositionDragOver: (e: React.DragEvent, idx: number) => void;
  handlePositionDrop: (idx: number) => void;
  handlePositionDragEnd: () => void;
}

export const PositionsTab: React.FC<PositionsTabProps> = ({
  positions, newPosition, setNewPosition,
  addPosition, removePosition,
  dragIndex, dragOverIndex,
  handlePositionDragStart, handlePositionDragOver,
  handlePositionDrop, handlePositionDragEnd,
}) => (
  <div className="space-y-4">
    <p className="text-xs text-zinc-500 font-semibold">
      직원 직군(직책) 목록을 관리합니다. 드래그로 순서 조정 · Enter 로 추가.
      <br />
      <span className="text-brand-deep font-semibold">
        💡 "팀장" 이 포함된 직군(예: 물류팀장·약사팀장)은 재직자 1명만 허용됩니다 (#178).
      </span>
    </p>
    <div className="grid grid-cols-2 gap-2">
      {positions.map((pos, idx) => {
        const isTeamLead = pos.includes("팀장");
        const isDragTarget = dragOverIndex === idx && dragIndex !== null && dragIndex !== idx;
        return (
          <div
            key={pos}
            draggable
            onDragStart={() => handlePositionDragStart(idx)}
            onDragOver={(e) => handlePositionDragOver(e, idx)}
            onDrop={() => handlePositionDrop(idx)}
            onDragEnd={handlePositionDragEnd}
            className={`flex items-center gap-2 bg-white border rounded-lg px-3 py-2 transition cursor-move ${
              isDragTarget ? "border-brand-deep ring-2 ring-brand-tint" : "border-line hover:border-zinc-300"
            }`}
          >
            <GripVertical size={13} className="text-zinc-300" />
            <span className={`flex-1 text-xs font-semibold ${isTeamLead ? "text-brand-deep" : "text-zinc-800"}`}>
              {pos}
              {isTeamLead && <span className="ml-1 text-[10px] font-normal text-brand-deep/70">· 유일</span>}
            </span>
            <button
              type="button"
              onClick={() => removePosition(idx)}
              className="text-zinc-300 hover:text-rose-500 transition cursor-pointer p-0.5 rounded"
              title="삭제"
            >
              <Trash2 size={13} />
            </button>
          </div>
        );
      })}
    </div>
    <div className="flex gap-2 pt-1">
      <input
        type="text"
        value={newPosition}
        onChange={(e) => setNewPosition(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPosition(); } }}
        placeholder="새 직군 입력 (예: 물류팀장 · 약사 · 캐셔)"
        className="flex-1 text-xs rounded-lg border border-line focus:border-[#2563eb] p-2 bg-white focus:outline-none"
      />
      <button
        type="button"
        onClick={addPosition}
        className="px-3 py-2 text-xs font-bold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white rounded-lg flex items-center gap-1 transition cursor-pointer"
      >
        <Plus size={13} />
        추가
      </button>
    </div>
  </div>
);
