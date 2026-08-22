// 2026-08-22 · Framework Phase 4 · PermissionsPage.tsx large-file 분리
// 2개 UI 섹션 · props-driven pure display
//   · PositionsTab · 직군 설정 (드래그 재정렬 · 편집 · 삭제 · 추가)
//   · ConstructionTab · 공사중 모드 토글

import React from "react";
import { Construction, IdCard, Pencil, Trash2, GripVertical, Plus } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════
// 1) PositionsTab · 직군 설정
// ═══════════════════════════════════════════════════════════════════════════

interface PositionsTabProps {
  presetPositions: string[];
  posDragIdx: number | null;
  posDragOverIdx: number | null;
  setPosDragIdx: (v: number | null) => void;
  setPosDragOverIdx: (v: number | null) => void;
  editingPosIdx: number | null;
  editingPosValue: string;
  setEditingPosIdx: (v: number | null) => void;
  setEditingPosValue: (v: string) => void;
  commitEditPosition: () => void;
  removePositionAt: (idx: number) => void;
  reorderPosition: (from: number, to: number) => void;
  newPositionInput: string;
  setNewPositionInput: (v: string) => void;
  addNewPosition: () => void;
}

export const PositionsTab: React.FC<PositionsTabProps> = ({
  presetPositions, posDragIdx, posDragOverIdx, setPosDragIdx, setPosDragOverIdx,
  editingPosIdx, editingPosValue, setEditingPosIdx, setEditingPosValue,
  commitEditPosition, removePositionAt, reorderPosition,
  newPositionInput, setNewPositionInput, addNewPosition,
}) => {
  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex items-center gap-2">
        <IdCard size={14} className="text-zinc-500" />
        <h2 className="text-[13px] font-bold text-zinc-700">직군 설정</h2>
      </div>
      <p className="text-[12px] text-zinc-500 font-semibold">
        직원 등록/수정 화면의 직군 드롭박스에 표시될 목록입니다. 이름 클릭 또는 <Pencil size={11} className="inline align-middle text-violet-500 mx-0.5" /> 아이콘으로 편집 · 드래그로 순서 변경 · <Trash2 size={11} className="inline align-middle text-rose-500 mx-0.5" /> 로 삭제 (사용중이면 재매핑 안내).
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {presetPositions.map((pos, idx) => (
          <div
            key={pos}
            draggable
            onDragStart={() => setPosDragIdx(idx)}
            onDragOver={(e) => { e.preventDefault(); setPosDragOverIdx(idx); }}
            onDrop={() => {
              if (posDragIdx !== null) reorderPosition(posDragIdx, idx);
              setPosDragIdx(null); setPosDragOverIdx(null);
            }}
            onDragEnd={() => { setPosDragIdx(null); setPosDragOverIdx(null); }}
            className={`flex items-center gap-2 bg-white border rounded-lg px-3 py-2 transition ${
              posDragOverIdx === idx && posDragIdx !== idx
                ? "border-violet-400 bg-violet-50"
                : "border-line hover:border-zinc-300"
            } ${posDragIdx === idx ? "opacity-40" : ""}`}
          >
            <div className="text-zinc-300 hover:text-zinc-500 cursor-grab active:cursor-grabbing shrink-0">
              <GripVertical size={14} />
            </div>
            {editingPosIdx === idx ? (
              <input
                autoFocus
                value={editingPosValue}
                onChange={(e) => setEditingPosValue(e.target.value)}
                onBlur={commitEditPosition}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitEditPosition(); }
                  else if (e.key === "Escape") { setEditingPosIdx(null); }
                }}
                className="flex-1 text-[13px] font-semibold text-zinc-800 bg-white border border-violet-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-brand-tint min-w-0"
              />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { setEditingPosIdx(idx); setEditingPosValue(pos); }}
                  className="flex-1 text-[13px] font-semibold text-zinc-800 truncate text-left hover:text-violet-700 cursor-text"
                  title="클릭하여 이름 수정"
                >
                  {pos}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingPosIdx(idx); setEditingPosValue(pos); }}
                  className="text-zinc-300 hover:text-violet-500 transition cursor-pointer p-0.5 rounded"
                  title="이름 편집"
                >
                  <Pencil size={13} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => removePositionAt(idx)}
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
          value={newPositionInput}
          onChange={(e) => setNewPositionInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNewPosition(); } }}
          placeholder="새 직군 입력 (Enter)"
          className="flex-1 text-[13px] rounded-lg border border-line focus:border-brand-deep p-2 bg-white focus:outline-none"
        />
        <button
          type="button"
          onClick={addNewPosition}
          className="px-3 py-2 text-[12px] font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-lg flex items-center gap-1 transition cursor-pointer"
        >
          <Plus size={13} />
          추가
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 2) ConstructionTab · 공사중 모드 토글
// ═══════════════════════════════════════════════════════════════════════════

interface ConstructionTabProps {
  underConstruction: boolean;
  onChange: (v: boolean) => void;
}

export const ConstructionTab: React.FC<ConstructionTabProps> = ({ underConstruction, onChange }) => {
  return (
    <div className="w-full min-w-0 space-y-4 max-w-xl">
      <div className="flex items-center gap-2">
        <Construction size={14} className="text-amber-600" />
        <h2 className="text-[13px] font-bold text-zinc-700">공사중 (Under Construction)</h2>
      </div>
      <label className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 hover:border-amber-400 cursor-pointer">
        <input
          type="checkbox"
          checked={underConstruction === true}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 accent-amber-500"
        />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-zinc-800 leading-tight">공사중 모드 활성화</div>
          <div className="text-[11px] font-semibold text-zinc-500 leading-tight mt-0.5">
            비로그인 랜딩페이지 · 재고 검색 숨김 · "곧 오픈 예정입니다" 표시
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${underConstruction ? "bg-amber-500 text-white" : "bg-zinc-200 text-zinc-500"}`}>
          {underConstruction ? "ON" : "OFF"}
        </span>
      </label>
    </div>
  );
};
