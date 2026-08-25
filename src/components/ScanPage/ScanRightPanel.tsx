// src/components/ScanPage/ScanRightPanel.tsx
// 2026-08-25 · Framework Phase 4 · large-file 분리 · ScanPage.tsx 우측 패널 이관
//   · 헤더 (진열요청 · 유통기한임박 액션) + StockRowCard 리스트
//   · props · rows/filteredRows/handlers · self-contained render

import React from "react";
import { Megaphone, AlertCircle, Package } from "lucide-react";
import { IconTile } from "../common/IconTile";
import { StockRowCard } from "./StockRowCard";
import type { StockRow } from "./stockRowTypes";
import { hasExpiry } from "./ScanPage.filters";

interface ScanRightPanelProps {
  rows: StockRow[];
  filteredRows: StockRow[];
  lastCode: string | null;
  lastAddedKey: string | null;
  requestingKey: string;
  scanFilter: "all" | "display" | "expiry";
  setScanFilter: (v: "all" | "display" | "expiry") => void;
  setExpiryModalRow: (r: StockRow | null) => void;
  requestDisplay: (r: StockRow) => void | Promise<void>;
  patchRow: (key: string, patch: Partial<StockRow>) => void;
  removeRow: (key: string) => void;
  openHistory: (code: string, name: string) => void | Promise<void>;
  handleSaveRow: (rowKey: string) => void | Promise<void>;
  toggleExpiry: (row: StockRow) => void | Promise<void>;
}

export const ScanRightPanel: React.FC<ScanRightPanelProps> = ({
  rows, filteredRows, lastCode, lastAddedKey, requestingKey,
  scanFilter, setScanFilter, setExpiryModalRow,
  requestDisplay, patchRow, removeRow, openHistory, handleSaveRow, toggleExpiry,
}) => {
  const targetRow = lastCode ? rows.find(r => r.code === lastCode) : null;
  const disabled = !targetRow;
  const expiryOn = !!targetRow && hasExpiry(targetRow);
  void scanFilter;
  return (
    <div className="bg-white rounded-2xl border border-line/80 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex flex-col min-h-[320px] overflow-hidden">
      <div className="flex flex-col gap-3 px-4 sm:px-5 py-3 sm:py-3.5 border-b border-line/80 bg-zinc-50/80 rounded-t-2xl sticky top-0 z-10 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <IconTile icon={<Package size={14} />} tone="teal" size="md" />
            <span className="text-[15px] font-bold text-ink tracking-tight">스캔한 상품 · 실재고 입력</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0" aria-label="마지막 스캔 상품 액션">
            <button
              type="button"
              disabled={disabled || requestingKey === (targetRow?.key ?? "")}
              onClick={() => { if (targetRow) requestDisplay(targetRow); }}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-bold shadow-sm transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-violet-500 hover:bg-violet-600 active:bg-violet-700 text-white"
              title={disabled ? "먼저 상품을 스캔하세요" : `${targetRow?.product.name} · 진열요청 전송`}
            >
              <Megaphone size={13} strokeWidth={2.5} />
              진열요청
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => { if (targetRow) setExpiryModalRow(targetRow); }}
              className={[
                "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-bold shadow-sm transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                expiryOn
                  ? "bg-amber-600 hover:bg-amber-700 text-white ring-2 ring-amber-300"
                  : "bg-white border border-line text-ink-soft hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700",
              ].join(" ")}
              title={disabled ? "먼저 상품을 스캔하세요" : (expiryOn ? "유통기한 정보 수정 · 해제" : "유통기한 임박 · 입력날짜+만료일 저장")}
            >
              <AlertCircle size={13} strokeWidth={2.5} />
              유통기한임박{expiryOn ? " ✓" : ""}
            </button>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 sm:py-24 select-none">
          <IconTile icon={<Package size={28} className="text-zinc-300" />} tone="zinc" size="2xl" shape="rounded-2xl" />
          <div className="text-center">
            <p className="text-[15px] font-bold text-ink-soft">스캔한 상품이 여기에 표시됩니다</p>
            <p className="text-[15px] text-zinc-400 mt-1">좌측 바코드 스캔 후 자동 등록</p>
          </div>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 select-none">
          <p className="text-[14px] font-semibold text-ink-soft">필터 결과 없음</p>
          <button
            type="button"
            onClick={() => setScanFilter("all")}
            className="text-[15px] font-semibold text-brand-deep hover:underline cursor-pointer"
          >전체 보기</button>
        </div>
      ) : (
        <div className="flex-1 px-3 sm:px-4 py-3 flex flex-col gap-2 bg-zinc-50/30">
          {filteredRows.map((row) => (
            <StockRowCard
              key={row.key}
              row={row}
              isRecent={row.key === lastAddedKey}
              requestingKey={requestingKey}
              onPatch={patchRow}
              onRemove={removeRow}
              onHistory={openHistory}
              onRequestDisplay={requestDisplay}
              onSaveRow={handleSaveRow}
              onToggleExpiry={toggleExpiry}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ScanRightPanel;
