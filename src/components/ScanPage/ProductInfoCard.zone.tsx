// ProductInfoCard.zone.tsx
// 2026-08-29 · 분리 · 배정구역(전산/실제) 섹션

import React from "react";
import { ArrowRight, AlertTriangle, Pencil } from "lucide-react";
import { Spinner } from "../common/Spinner";

interface ProductInfoZoneProps {
  locationZone: string;
  realMap: string | null;
  hasMismatch: boolean;
  saving: boolean;
  saveError: string | null;
  onOpenSelector: () => void;
}

export const ProductInfoZone: React.FC<ProductInfoZoneProps> = ({
  locationZone, realMap, hasMismatch, saving, saveError, onOpenSelector,
}) => (
  <>
    <div className="flex items-stretch gap-2 mb-2 px-2.5 py-2 rounded-xl border border-line bg-zinc-50/60">
      {/* 전산배치구역 */}
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-zinc-400 leading-none mb-1 uppercase tracking-wide">전산</p>
        <p className="text-[13px] font-bold text-zinc-700 leading-snug break-keep whitespace-normal">{locationZone}</p>
      </div>

      {/* 화살표 */}
      <div className="flex items-center">
        <ArrowRight size={14} className={`shrink-0 ${hasMismatch ? "text-orange-400" : "text-zinc-300"}`} />
      </div>

      {/* 실제배치구역 */}
      <div className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 ${
        hasMismatch ? "bg-orange-50 border border-orange-200" : realMap ? "bg-teal-50 border border-teal-200" : "bg-white border border-dashed border-line"
      }`}>
        <p className={`text-[14px] font-semibold leading-none mb-1 uppercase tracking-wide ${
          hasMismatch ? "text-orange-500" : realMap ? "text-teal-600" : "text-zinc-400"
        }`}>실제</p>
        {realMap ? (
          <p className={`text-[13px] font-bold leading-snug break-keep whitespace-normal ${hasMismatch ? "text-orange-700" : "text-teal-700"}`}>{realMap}</p>
        ) : (
          <p className="text-[14px] font-semibold text-zinc-400">미등록</p>
        )}
      </div>

      {/* 변경/등록 버튼 */}
      <div className="flex items-center">
        <button
          onClick={onOpenSelector}
          disabled={saving}
          className={`shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-lg border text-[13px] font-bold transition cursor-pointer min-h-[44px] ${
            realMap
              ? "bg-white border-line text-zinc-500 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50"
              : "bg-teal-500 border-teal-600 text-white hover:bg-teal-600"
          }`}
        >
          {saving ? <Spinner size={11} /> : <Pencil size={11} />}
          {saving ? "" : realMap ? "변경" : "등록"}
        </button>
      </div>
    </div>

    {/* 불일치 경고 / 저장 오류 */}
    {(hasMismatch || saveError) && (
      <div className="flex flex-col gap-1 mb-2">
        {hasMismatch && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 border border-orange-200 rounded-lg">
            <AlertTriangle size={10} className="text-orange-500 shrink-0" />
            <p className="text-[13px] font-semibold text-orange-600">전산배치구역과 실제배치구역이 다릅니다</p>
          </div>
        )}
        {saveError && (
          <div className="flex items-start gap-1.5 px-2.5 py-1.5 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle size={10} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-[13px] font-semibold text-red-600 whitespace-pre-wrap">{saveError}</p>
          </div>
        )}
      </div>
    )}
  </>
);
