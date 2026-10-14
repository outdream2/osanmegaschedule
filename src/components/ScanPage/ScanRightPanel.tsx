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
  requestingKey: string | null;
  scanFilter: "all" | "display" | "expiry";
  setScanFilter: (v: "all" | "display" | "expiry") => void;
  setExpiryModalRow: (r: StockRow | null) => void;
  requestDisplay: (r: StockRow) => void | Promise<void>;
  patchRow: (key: string, patch: Partial<StockRow>) => void;
  removeRow: (key: string) => void;
  openHistory: (code: string, name: string) => void | Promise<void>;
  handleSaveRow: (rowKey: string) => void | Promise<void>;
  toggleExpiry: (row: StockRow) => void | Promise<void>;
  /** 2026-09-09 · 관리자 권한 · 슬롯 상세구역 편집 · 매장 추가/삭제 */
  canManage?: boolean;
  /** 2026-10-12 · 사용자 지시 · 스캔 → 리스트 추가 사이 로딩 중 표시 */
  scanLoading?: boolean;
}

export const ScanRightPanel: React.FC<ScanRightPanelProps> = ({
  rows, filteredRows, lastCode, lastAddedKey, requestingKey,
  scanFilter, setScanFilter, setExpiryModalRow,
  requestDisplay, patchRow, removeRow, openHistory, handleSaveRow, toggleExpiry,
  canManage = false,
  scanLoading = false,
}) => {
  const targetRow = lastCode ? rows.find(r => r.code === lastCode) : null;
  const disabled = !targetRow;
  const expiryOn = !!targetRow && hasExpiry(targetRow);
  void scanFilter;
  return (
    // 2026-10-09 · #9 Phase 3 홈 톤 리뉴얼 · rounded-[12px] · 공간 최소 · IconTile 제거 (리스트 앞 동그란 아이콘 금지)
    <div className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col min-h-[320px] overflow-y-auto">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-white sticky top-0 z-10">
        <Package size={16} className="text-slate-500 shrink-0" />
        <span className="text-[14px] md:text-[15px] font-semibold text-ink tracking-tight">스캔한 상품 · 실재고 입력</span>
        <div className="ml-auto flex items-center gap-1.5 shrink-0" aria-label="마지막 스캔 상품 액션">
          <button
            type="button"
            disabled={disabled || requestingKey === (targetRow?.key ?? "")}
            onClick={() => { if (targetRow) requestDisplay(targetRow); }}
            className="inline-flex items-center gap-1 h-7 px-2 rounded border border-rose-200 bg-rose-50 text-rose-700 text-[12px] font-semibold hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title={disabled ? "먼저 상품을 스캔하세요" : `${targetRow?.product.name} · 진열요청 전송`}
          >
            <Megaphone size={11} strokeWidth={2.5} />진열요청
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => { if (targetRow) setExpiryModalRow(targetRow); }}
            className={[
              "inline-flex items-center gap-1 h-7 px-2 rounded border text-[12px] font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
              expiryOn
                ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "border-slate-200 bg-white text-slate-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700",
            ].join(" ")}
            title={disabled ? "먼저 상품을 스캔하세요" : (expiryOn ? "유통기한 정보 수정 · 해제" : "유통기한 임박 · 입력날짜+만료일 저장")}
          >
            <AlertCircle size={11} strokeWidth={2.5} />유통기한{expiryOn ? " ✓" : ""}
          </button>
        </div>
      </div>

      {/* 2026-10-12 · 사용자 지시 · 스캔 → 리스트 추가 전 로딩 중 spinner */}
      {scanLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-12 select-none">
          <div className="w-7 h-7 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" aria-hidden />
          <div className="text-center">
            <p className="text-[14px] font-semibold text-slate-600">상품 조회 중...</p>
            <p className="text-[12px] text-slate-400 mt-0.5">바코드 조회 · 실재고 로드</p>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-12 select-none">
          <Package size={28} className="text-slate-300" />
          <div className="text-center">
            <p className="text-[14px] font-semibold text-slate-500">스캔한 상품이 여기에 표시됩니다</p>
            <p className="text-[13px] text-slate-400 mt-0.5">좌측 바코드 스캔 후 자동 등록</p>
          </div>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-12 select-none">
          <p className="text-[13px] font-semibold text-slate-500">필터 결과 없음</p>
          <button
            type="button"
            onClick={() => setScanFilter("all")}
            className="text-[13px] font-semibold text-brand-deep hover:underline cursor-pointer"
          >전체 보기</button>
        </div>
      ) : (
        <div className="flex-1 px-3 py-2.5 flex flex-col gap-1.5">
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
              canManage={canManage}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ScanRightPanel;
