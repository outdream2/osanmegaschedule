// src/components/RequestsPage/MismatchPanel.tsx
// 2026-08-26 · Framework Phase 4 · large-file 분리 · 구역불일치 탭
import React from "react";
import { fmtDateMD } from "../../lib/format";
import { CARD_BASE } from "../../styles/tokens";
import { Spinner } from "../common/Spinner";
import { ListToolbar } from "./ListToolbar";
import { RequestCheckbox } from "./RequestsPage.tabs";
import type { ZoneMismatch } from "./types";

interface MismatchPanelProps {
  mismatches: ZoneMismatch[];
  mismatchLoading: boolean;
  mismatchError: string | null;
  selectedMismatch: Set<string>;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  onDeleteSelected: () => void;
  onDeleteAll: () => void;
  onRefresh: () => void;
}

export const MismatchPanel: React.FC<MismatchPanelProps> = ({
  mismatches,
  mismatchLoading,
  mismatchError,
  selectedMismatch,
  onToggleAll,
  onToggleOne,
  onDeleteSelected,
  onDeleteAll,
  onRefresh,
}) => (
  <div className="flex flex-col gap-2">
    <ListToolbar
      total={mismatches.length} selected={selectedMismatch.size}
      allChecked={selectedMismatch.size === mismatches.length && mismatches.length > 0}
      onToggleAll={onToggleAll}
      onDeleteSelected={onDeleteSelected}
      onDeleteAll={onDeleteAll}
      onRefresh={onRefresh} loading={mismatchLoading} accentColor="text-orange-600"
    />
    {mismatchLoading && mismatches.length > 0 && (
      <div className="flex items-center justify-center gap-1.5 py-1.5 mb-1 bg-orange-50 border border-orange-200 rounded-md sticky top-0 z-10">
        <Spinner size={11} tone="orange" label="새로 불러오는 중..." labelSize={14} />
      </div>
    )}
    {mismatchLoading && mismatches.length === 0 ? (
      <div className="flex items-center justify-center py-8">
        <Spinner tone="zinc" size={14} label="로딩 중..." labelSize={12} />
      </div>
    ) : mismatchError ? (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <p className="text-sm font-bold text-red-500">불러오기 오류</p>
        <p className="text-xs text-red-400 text-center px-4">{mismatchError}</p>
        <button onClick={onRefresh} className="mt-2 text-xs text-orange-600 underline cursor-pointer">다시 시도</button>
      </div>
    ) : !mismatchLoading && mismatches.length === 0 ? (
      <div className="text-center text-[15px] text-zinc-300 py-6">데이터 없음</div>
    ) : (
      <div className={`${CARD_BASE} divide-y divide-zinc-50 ${mismatchLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
        {mismatches.map(m => (
          <div key={m.id} className={`flex items-center gap-3 px-0.5 py-1.5 transition-all duration-150 ${selectedMismatch.has(m.id) ? "bg-rose-50/50" : "hover:bg-zinc-50/60"}`}>
            <RequestCheckbox checked={selectedMismatch.has(m.id)} onChange={() => onToggleOne(m.id)} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[14px] font-bold text-zinc-800 break-keep">{m.product_name}</span>
                <span className="text-gray-300 text-[14px]">·</span>
                <span className="text-[14px] font-semibold text-zinc-400">{m.product_code}</span>
                <span className="text-gray-300 text-[14px]">·</span>
                <span className="text-[15px] text-zinc-500" title="전산배치구역">전산 <span className="font-bold text-zinc-700">{m.spec_zone || "미지정"}</span></span>
                <span className="text-gray-300 text-[14px]">→</span>
                <span className="text-[15px] font-bold text-red-600" title="실제배치구역">실제 {m.real_zone}</span>
              </div>
            </div>
            <span className="text-[14px] text-gray-400 shrink-0">{fmtDateMD(m.registered_at)}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);
