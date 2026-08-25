// src/components/DisplayPage/WallZoneCard.tsx
// 2026-08-25 · Framework Phase 4 · large-file 분리 · DisplayPage.tsx 벽면 존 카드 이관
//   · props · num · position · ZONE_DEFS · openZoneProducts · renderRequestButton · renderZoneCell
//   · 하단 이미지 확대 대체 · category 2줄 표시 · line-clamp

import React from "react";
import { getZoneLabel, getZoneSubLabel } from "../../constants/zoneLabels";

interface ZoneDef {
  num: number;
  category?: string;
}

interface WallZoneCardProps {
  num: number;
  position: "top" | "bottom";
  zoneDefs: ZoneDef[];
  openZoneProducts: (params: { zoneId: string; zoneNum: number; zoneLabel: string; category: string }) => void;
  renderRequestButton: (num: number) => React.ReactNode;
  renderZoneCell: (num: number, classes?: string, wrapperClass?: string, hideRequest?: boolean) => React.ReactNode;
}

export const WallZoneCard: React.FC<WallZoneCardProps> = ({
  num, position, zoneDefs, openZoneProducts, renderRequestButton, renderZoneCell,
}) => {
  const zd = zoneDefs.find(z => z.num === num);
  const openProducts = () => openZoneProducts({ zoneId: String(num), zoneNum: num, zoneLabel: `벽면 ${num}`, category: zd?.category ?? "" });
  const cat = getZoneSubLabel(num) || (zd?.category ?? "");
  const parts = cat.split(/[·,\/]/).map(s => s.trim()).filter(Boolean);
  return (
    <div key={`wall-${num}`} className="flex flex-col gap-0.5">
      {position === "top" && renderRequestButton(num)}
      <div className="rounded-lg overflow-hidden border-2 border-stone-300 bg-white shadow-sm hover:border-amber-400 transition">
        <button type="button" onClick={openProducts} title={`${num}번 · ${zd?.category ?? ""} → 진열상품 조회`} className="w-full h-[64px] bg-stone-50 hover:bg-amber-50 px-1 py-1 flex flex-col items-center gap-0.5 border-b border-stone-200 cursor-pointer transition">
          <span className="text-[10px] font-bold text-white bg-amber-700 rounded px-1 py-0.5 leading-none shrink-0">{getZoneLabel(num)}</span>
          {parts.length >= 2 ? (
            <div className="w-full flex-1 flex flex-col justify-center gap-0.5 min-h-0">
              <span className="text-[10px] font-bold text-stone-800 leading-tight text-center line-clamp-1">{parts[0]}</span>
              <span className="text-[10px] font-bold text-stone-800 leading-tight text-center line-clamp-1">{parts.slice(1).join(" · ")}</span>
            </div>
          ) : (
            <span className="w-full flex-1 flex items-center justify-center text-[10px] font-bold text-stone-800 line-clamp-2 text-center leading-tight">{cat}</span>
          )}
        </button>
        {renderZoneCell(num, "w-full h-10 text-[9px] p-0.5 justify-center border-0 rounded-none", "", true)}
      </div>
      {position === "bottom" && renderRequestButton(num)}
    </div>
  );
};

export default WallZoneCard;
