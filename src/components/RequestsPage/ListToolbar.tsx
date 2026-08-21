// src/components/RequestsPage/ListToolbar.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · ListToolbar 이관
// 2026-08-17 · 최신 트렌드 · accent bar + 폰트 +2 · 딥네이비 CTA · 컴팩트 pill 통일
// 프레임워크: Card · AccentBar · Square/CheckSquare/RefreshCw (lucide)
import React from "react";
import { CheckSquare, Square, RefreshCw } from "lucide-react";
import { Card } from "../common/Card";
import { AccentBar } from "../common/AccentBar";

export interface ListToolbarProps {
  total: number;
  selected: number;
  allChecked: boolean;
  onToggleAll: () => void;
  onDeleteSelected: () => void;
  onDeleteAll: () => void;
  onRefresh: () => void;
  loading: boolean;
  accentColor: string;
  extraActions?: React.ReactNode;
  hideDeleteAll?: boolean;
}

export function ListToolbar({
  total, selected, allChecked, onToggleAll, onDeleteSelected, onDeleteAll, onRefresh, loading, extraActions, hideDeleteAll,
}: ListToolbarProps) {
  return (
    <Card padding="none" className="flex items-center gap-2.5 mb-2 px-3.5 h-10">
      <AccentBar className="shrink-0" />
      <button onClick={onToggleAll} className="shrink-0 cursor-pointer text-ink-soft hover:text-brand-deep transition-colors">
        {allChecked && total > 0
          ? <CheckSquare size={16} className="text-brand-deep" />
          : <Square size={16} />}
      </button>
      <span className="text-[15px] text-ink flex-1 select-none font-medium tabular-nums">
        {selected > 0 ? <><strong className="text-brand-deep font-bold">{selected}개</strong> 선택됨</> : `전체 ${total}건`}
      </span>
      {selected > 0 && (
        <button
          onClick={onDeleteSelected}
          className="text-[14px] font-semibold text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 px-3 h-8 rounded-lg transition-colors cursor-pointer shadow-sm"
        >
          선택삭제
        </button>
      )}
      {extraActions}
      {!hideDeleteAll && (
        <button
          onClick={onDeleteAll}
          disabled={total === 0}
          className="text-[14px] font-semibold text-ink-soft bg-white border border-line hover:border-ink-soft hover:text-ink px-3 h-8 rounded-lg transition-colors cursor-pointer disabled:opacity-40 shadow-sm"
        >
          전체삭제
        </button>
      )}
      <div className="h-5 w-px bg-line shrink-0" />
      <button onClick={onRefresh} className="w-8 h-8 flex items-center justify-center rounded-lg text-ink-soft hover:text-brand-deep hover:bg-brand-tint transition-colors cursor-pointer">
        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
      </button>
    </Card>
  );
}
