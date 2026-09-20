// src/components/RequestsPage/MismatchPanel.tsx
// 2026-09-20 · 재설계 · 실재고 총합 vs ERP 현재고 차이 표시
import React from "react";
import { fmtDateMD } from "../../lib/format";
import { CARD_BASE } from "../../styles/tokens";
import { Spinner } from "../common/Spinner";
import { EmptyState } from "../common/EmptyState";
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
      <div className="flex items-center justify-center gap-1.5 py-1.5 mb-1 bg-orange-50 border border-orange-200 rounded-md">
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
      <EmptyState title="재고 차이 없음" hint="ERP 현재고와 실재고 합계가 일치합니다" size="compact" />
    ) : (
      <div className={`${CARD_BASE} divide-y divide-zinc-50 ${mismatchLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
        {mismatches.map(m => {
          const isShortage = m.diff > 0;   // ERP > 실재고 · 재고 부족
          const diffLabel  = isShortage ? `−${m.diff}` : `+${Math.abs(m.diff)}`;
          const diffCls    = isShortage
            ? "text-rose-600 font-bold"
            : "text-emerald-600 font-bold";

          return (
            <div
              key={m.id}
              className={`flex items-start gap-3 px-0.5 py-2.5 transition-all duration-150 ${selectedMismatch.has(m.id) ? "bg-rose-50/50" : "hover:bg-zinc-50/60"}`}
            >
              <RequestCheckbox checked={selectedMismatch.has(m.id)} onChange={() => onToggleOne(m.id)} />

              <div className="flex-1 min-w-0">
                {/* 상품명 · 코드 · 공급사 */}
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className="text-[15px] font-bold text-zinc-800 break-keep">{m.product_name}</span>
                  <span className="text-gray-300 text-[14px]">·</span>
                  <span className="text-[13px] font-semibold text-zinc-400">{m.product_code}</span>
                  {m.supplier && (
                    <>
                      <span className="text-gray-300 text-[14px]">·</span>
                      <span className="text-[13px] text-zinc-400">{m.supplier}</span>
                    </>
                  )}
                </div>

                {/* ERP · 실재고 · 차이 */}
                <div className="flex items-center gap-3 flex-wrap text-[14px]">
                  <span className="text-zinc-500">
                    ERP <span className="font-semibold text-zinc-700">{m.erp_stock}개</span>
                  </span>
                  <span className="text-gray-300">vs</span>
                  <span className="text-zinc-500">
                    실재고 <span className="font-semibold text-zinc-700">{m.real_total}개</span>
                  </span>
                  <span className={diffCls}>
                    {diffLabel}개
                  </span>
                </div>

                {/* 창고·매장 상세 */}
                <div className="flex items-center gap-2 mt-0.5 text-[12px] text-zinc-400">
                  <span>창고 {m.warehouse_stock}개</span>
                  <span className="text-gray-200">·</span>
                  <span>매장 {m.store_stock}개</span>
                </div>
              </div>

              <span className="text-[13px] text-gray-400 shrink-0 pt-0.5">{fmtDateMD(m.registered_at)}</span>
            </div>
          );
        })}
      </div>
    )}
  </div>
);
