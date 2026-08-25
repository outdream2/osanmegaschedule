// src/components/ScanPage/RealMapSelector.tsx
// 2026-08-26 · 사용자 지시 · 실재고입력 · 매장구역 선택
//   · 매장진열-매장구역도 (StoreZoneMap) 그대로 재사용
//   · 이전 자체 렌더 (grid section) 제거 · 통일된 시각 (Attio 톤)
//   · useZoneDefs 훅 · 매장구역도 편집 반영 (설정 → 즉시 반영)

import React from "react";
import { MapPin } from "lucide-react";
import { BottomSheet } from "../common/BottomSheet";
import { StoreZoneMap } from "../common/StoreZoneMap";
import { useZoneDefs } from "../../hooks/useZoneDefs";

interface RealMapSelectorProps {
  current: string | null | undefined;
  onSelect: (zoneLabel: string) => void;
  onClose: () => void;
}

export const RealMapSelector: React.FC<RealMapSelectorProps> = ({ current, onSelect, onClose }) => {
  const { zones } = useZoneDefs();

  const header = (
    <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-line">
      <MapPin size={15} className="text-teal-500" />
      <p className="text-[16px] font-bold text-gray-900">매장 구역도에서 선택</p>
      {current && (
        <span className="ml-auto text-[13px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-md px-2 py-0.5">
          현재 · {current}
        </span>
      )}
    </div>
  );

  // 매장구역도 셀 클릭 → num 추출 (예: "5A" → 5, "22" → 22) → "N번 label" 형식으로 emit
  const handleZoneClick = (zoneId: string) => {
    const numMatch = zoneId.match(/^(\d+)/);
    if (!numMatch) return;
    const num = Number(numMatch[1]);
    const z = zones.find((x) => x.num === num);
    if (!z) return;
    const label = `${z.num}번 ${z.label}`;
    onSelect(label);
    onClose();
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      fullscreen
      disableHandle
      zIndex={70}
      backdropClass="backdrop-brand"
      header={header}
    >
      <div className="p-3 flex flex-col gap-3">
        {/* 미지정 */}
        <button
          type="button"
          onClick={() => { onSelect(""); onClose(); }}
          className={`w-full py-2.5 rounded-xl border text-[15px] font-bold transition cursor-pointer ${
            !current
              ? "bg-zinc-100 border-zinc-400 text-zinc-800"
              : "bg-white border-line text-zinc-500 hover:bg-zinc-50 hover:border-zinc-300"
          }`}
        >
          미지정 (없음)
        </button>

        {/* 2026-08-26 · 사용자 지시 · 매장진열-매장구역도 그대로 · StoreZoneMap 프리미티브 재사용 */}
        <StoreZoneMap
          compact
          onZoneClick={handleZoneClick}
        />
      </div>
    </BottomSheet>
  );
};

export default RealMapSelector;
