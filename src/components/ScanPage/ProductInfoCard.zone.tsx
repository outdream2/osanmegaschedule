// ProductInfoCard.zone.tsx
// 2026-08-29 · 분리 · 배정구역(전산/실제) 섹션
// 2026-09-09 · #15 · 상세구역 인라인 텍스트 + 클릭 모달 편집 (사용자 지시)

import React, { useState } from "react";
import { ArrowRight, AlertTriangle, Pencil } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { ShelfPositionsEditModal } from "../common/ShelfPositionsEditModal";
import type { ShelfPositions } from "../../lib/shelfPositions";

interface ProductInfoZoneProps {
  productCode: string;
  productName?: string;
  locationZone: string;
  realMap: string | null;
  hasMismatch: boolean;
  saving: boolean;
  saveError: string | null;
  onOpenSelector: () => void;
  shelfPositions?: ShelfPositions | null;
}

export const ProductInfoZone: React.FC<ProductInfoZoneProps> = ({
  productCode, productName, locationZone, realMap, hasMismatch, saving, saveError, onOpenSelector,
  shelfPositions,
}) => {
  const [shelfEditOpen, setShelfEditOpen] = useState(false);

  // 매장 상세 · store1/2/3 값 있는 것만 · " · " 조인 · 없으면 "비어있음"
  const storeParts = (["store1","store2","store3"] as const)
    .map(k => shelfPositions?.[k])
    .filter((v): v is string => typeof v === "string" && v.length === 3);
  const storeLabel = storeParts.length ? storeParts.join(" · ") : "비어있음";
  const storeEmpty = storeParts.length === 0;

  // 창고 상세 · warehouse1/2 값 있는 것만
  const warehouseParts = (["warehouse1","warehouse2"] as const)
    .map(k => shelfPositions?.[k])
    .filter((v): v is string => typeof v === "string" && v.length === 3);
  const warehouseLabel = warehouseParts.length ? warehouseParts.join(" · ") : "비어있음";
  const warehouseEmpty = warehouseParts.length === 0;

  return (
    <>
      <div className="mb-2 rounded-xl border border-line bg-zinc-50/60 overflow-hidden">
        {/* 상단 · 전산 → 실제(매장구역) · 변경 버튼 */}
        <div className="flex items-stretch gap-2 px-2.5 py-2">
          {/* 전산배치구역 */}
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-zinc-400 leading-none mb-1 uppercase tracking-wide">전산</p>
            <p className="text-[15px] font-bold text-zinc-700 leading-snug break-keep whitespace-normal">{locationZone}</p>
          </div>

          <div className="flex items-center">
            <ArrowRight size={14} className={`shrink-0 ${hasMismatch ? "text-orange-400" : "text-zinc-300"}`} />
          </div>

          {/* 실제배치구역 + 매장 상세 인라인 텍스트 */}
          <div className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 ${
            hasMismatch ? "bg-orange-50 border border-orange-200" : realMap ? "bg-teal-50 border border-teal-200" : "bg-white border border-dashed border-line"
          }`}>
            <p className={`text-[14px] font-semibold leading-none mb-1 uppercase tracking-wide ${
              hasMismatch ? "text-orange-500" : realMap ? "text-teal-600" : "text-zinc-400"
            }`}>실제</p>
            <div className="flex items-baseline gap-1 flex-wrap">
              {realMap ? (
                <span className={`text-[15px] font-bold leading-snug break-keep whitespace-normal ${hasMismatch ? "text-orange-700" : "text-teal-700"}`}>{realMap}</span>
              ) : (
                <span className="text-[14px] font-semibold text-zinc-400">미등록</span>
              )}
              <button
                type="button"
                onClick={() => setShelfEditOpen(true)}
                className={[
                  "text-[13px] tabular-nums tracking-tight cursor-pointer transition rounded px-1 py-0.5",
                  storeEmpty
                    ? "text-zinc-400 font-medium hover:bg-zinc-100"
                    : "text-indigo-700 font-semibold hover:bg-indigo-50",
                ].join(" ")}
                title="상세구역 편집"
              >
                · {storeLabel}
              </button>
            </div>
          </div>

          <div className="flex items-center">
            <button
              onClick={onOpenSelector}
              disabled={saving}
              className={`shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-lg border text-[15px] font-bold transition cursor-pointer min-h-[44px] ${
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

        {/* 하단 · 창고구역 · 상세구역 인라인 텍스트 · 창고 위치 있는 경우만 */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 border-t border-line bg-white/70">
          <span className="text-[13px] font-bold text-zinc-500 tracking-tight shrink-0 uppercase">창고</span>
          <button
            type="button"
            onClick={() => setShelfEditOpen(true)}
            className={[
              "text-[14px] tabular-nums tracking-tight cursor-pointer transition rounded px-1.5 py-0.5",
              warehouseEmpty
                ? "text-zinc-400 font-medium hover:bg-zinc-100"
                : "text-cyan-700 font-semibold hover:bg-cyan-50",
            ].join(" ")}
            title="창고 상세구역 편집"
          >
            {warehouseLabel}
          </button>
        </div>
      </div>

      {/* 불일치 경고 / 저장 오류 */}
      {(hasMismatch || saveError) && (
        <div className="flex flex-col gap-1 mb-2">
          {hasMismatch && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 border border-orange-200 rounded-lg">
              <AlertTriangle size={10} className="text-orange-500 shrink-0" />
              <p className="text-[15px] font-semibold text-orange-600">전산배치구역과 실제배치구역이 다릅니다</p>
            </div>
          )}
          {saveError && (
            <div className="flex items-start gap-1.5 px-2.5 py-1.5 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle size={10} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-[15px] font-semibold text-red-600 whitespace-pre-wrap">{saveError}</p>
            </div>
          )}
        </div>
      )}

      {/* 상세구역 편집 모달 · 2026-09-09 · #15 */}
      {shelfEditOpen && (
        <ShelfPositionsEditModal
          productCode={productCode}
          productName={productName}
          displayLocation={realMap ?? locationZone}
          initial={shelfPositions}
          onClose={() => setShelfEditOpen(false)}
        />
      )}
    </>
  );
};
