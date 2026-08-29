// src/components/SettingsModal/tabs/RanksTab.tsx
// 2026-08-29 · #177 P2 · SettingsModal 분리 · ranks 탭 서브컴포넌트
import React from "react";
import { Plus, Trash2, Check, X } from "lucide-react";

export interface RanksTabProps {
  ranks: string[];
  newRank: string;
  setNewRank: (v: string) => void;
  addRank: () => void;
  removeRank: (idx: number) => void;
  editingRankIdx: number | null;
  editingRankValue: string;
  setEditingRankValue: (v: string) => void;
  rankRenaming: boolean;
  startEditRank: (idx: number) => void;
  cancelEditRank: () => void;
  commitEditRank: () => void;
}

export const RanksTab: React.FC<RanksTabProps> = ({
  ranks, newRank, setNewRank,
  addRank, removeRank,
  editingRankIdx, editingRankValue, setEditingRankValue,
  rankRenaming, startEditRank, cancelEditRank, commitEditRank,
}) => (
  <div className="space-y-4">
    <p className="text-xs text-zinc-500 font-semibold">
      직급 목록 (자유 텍스트) · Enter 로 추가 · 클릭으로 편집 · 편집 시 재직 직원 자동 rename.
      <br />
      <span className="text-brand-deep font-semibold">
        💡 삭제 시 · 재직 중인 직원 직급 자동 비워짐 (확인 프롬프트).
      </span>
    </p>
    <div className="grid grid-cols-2 gap-2">
      {ranks.map((r, idx) => {
        const isEditing = editingRankIdx === idx;
        return (
          <div key={r} className="flex items-center gap-2 bg-white border border-line hover:border-zinc-300 rounded-lg px-3 py-2 transition">
            {isEditing ? (
              <>
                <input
                  autoFocus
                  type="text"
                  value={editingRankValue}
                  onChange={(e) => setEditingRankValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commitEditRank(); }
                    if (e.key === "Escape") { e.preventDefault(); cancelEditRank(); }
                  }}
                  className="flex-1 text-xs font-semibold text-zinc-800 border border-brand-deep rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-tint"
                  disabled={rankRenaming}
                />
                <button type="button" onClick={commitEditRank} disabled={rankRenaming}
                  className="text-emerald-600 hover:text-emerald-800 transition cursor-pointer p-0.5"
                  title="저장 (Enter)">
                  <Check size={14} strokeWidth={3} />
                </button>
                <button type="button" onClick={cancelEditRank} disabled={rankRenaming}
                  className="text-zinc-400 hover:text-zinc-600 transition cursor-pointer p-0.5"
                  title="취소 (Esc)">
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => startEditRank(idx)}
                  className="flex-1 text-left text-xs font-semibold text-zinc-800 hover:text-brand-deep cursor-pointer"
                  title="클릭 편집">
                  {r}
                </button>
                <button type="button" onClick={() => removeRank(idx)}
                  className="text-zinc-300 hover:text-rose-500 transition cursor-pointer p-0.5 rounded"
                  title="삭제">
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
    <div className="flex gap-2 pt-1">
      <input
        type="text"
        value={newRank}
        onChange={(e) => setNewRank(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRank(); } }}
        placeholder="새 직급 입력 (예: 사원 · 대리 · 과장 · 부장)"
        className="flex-1 text-xs rounded-lg border border-line focus:border-[#2563eb] p-2 bg-white focus:outline-none"
      />
      <button type="button" onClick={addRank}
        className="px-3 py-2 text-xs font-bold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white rounded-lg flex items-center gap-1 transition cursor-pointer">
        <Plus size={13} />
        추가
      </button>
    </div>
    {rankRenaming && (
      <div className="text-[12px] text-brand-deep font-semibold flex items-center gap-1.5">
        <span className="w-3 h-3 border-2 border-brand-deep border-t-transparent rounded-full animate-spin" />
        재직 직원 자동 rename 중...
      </div>
    )}
  </div>
);
