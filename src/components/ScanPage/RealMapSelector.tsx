import React from "react";
import { MapPin } from "lucide-react";
import { ZONE_DEFS } from "../../constants/displayZones";
import { BottomSheet } from "../common/BottomSheet";

interface RealMapSelectorProps {
  current: string | null | undefined;
  onSelect: (zoneLabel: string) => void;
  onClose: () => void;
}

function ZoneBtn({
  num,
  current,
  onSelect,
  onClose,
}: {
  key?: number | string;
  num: number;
  current: string | null | undefined;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  const z = ZONE_DEFS.find((d) => d.num === num);
  if (!z) return null;
  const label = `${z.num}번 ${z.label}`;
  const selected = current === label;
  return (
    <button
      onClick={() => { onSelect(label); onClose(); }}
      title={z.category}
      className={`flex flex-col items-center justify-center rounded-lg border transition cursor-pointer leading-tight w-full aspect-square
        ${selected
          ? "bg-teal-500 border-teal-600 text-white shadow-md"
          : "bg-white border-gray-300 text-gray-700 hover:border-teal-400 hover:bg-teal-50"
        }`}
    >
      <span className={`text-[15px] font-bold ${selected ? "text-white" : "text-gray-800"}`}>
        {z.num}
      </span>
      <span className={`text-[12px] font-semibold text-center leading-none mt-0.5 ${selected ? "text-teal-100" : "text-gray-400"}`}>
        {z.label.replace("진열대 ", "").replace("벽면 ", "")}
      </span>
    </button>
  );
}

export const RealMapSelector: React.FC<RealMapSelectorProps> = ({ current, onSelect, onClose }) => {
  // Zones by section
  const topWall    = ZONE_DEFS.filter((z) => z.section === "top_wall");    // 24-35
  const aisles     = ZONE_DEFS.filter((z) => z.section === "aisle");       // 1-9
  const bottomWall = ZONE_DEFS.filter((z) => z.section === "bottom_wall"); // 10-21
  const leftWall   = ZONE_DEFS.filter((z) => z.section === "left_wall");   // 22-23
  const wing       = ZONE_DEFS.filter((z) => z.section === "wing");        // 36-41
  const event      = ZONE_DEFS.filter((z) => z.section === "event");       // 42

  const header = (
    <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-line">
      <MapPin size={15} className="text-teal-500" />
      <p className="text-[16px] font-bold text-gray-900">매장 지도에서 구역 선택</p>
    </div>
  );

  return (
    // 2026-08-23 · BottomSheet v2 · fullscreen + disableHandle + zIndex={70} + header prop
    <BottomSheet
      open
      onClose={onClose}
      fullscreen
      disableHandle
      zIndex={70}
      backdropClass="backdrop-brand"
      header={header}
    >
      <div className="p-3 flex flex-col gap-2">

          {/* 미지정 */}
          <button
            onClick={() => { onSelect(""); onClose(); }}
            className={`w-full py-2 rounded-xl border text-[16px] font-bold transition cursor-pointer ${
              !current
                ? "bg-gray-200 border-gray-400 text-gray-800"
                : "bg-white border-line text-gray-400 hover:bg-gray-100"
            }`}
          >
            미지정 (없음)
          </button>

          {/* ─── ㄱ자 매장 평면도 ─── */}
          <div className="bg-white border-2 border-blue-200 rounded-2xl p-3 flex flex-col gap-2 shadow-sm">
            <p className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">ㄱ자 매장 레이아웃</p>

            {/* 상단 벽면 (24-35) — 긴 가로줄 */}
            <div>
              <p className="text-[9px] text-gray-400 font-bold mb-1">상단 벽면 (24–35)</p>
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${topWall.length}, minmax(0, 1fr))` }}>
                {topWall.map((z) => (
                  <ZoneBtn key={z.num} num={z.num} current={current} onSelect={onSelect} onClose={onClose} />
                ))}
              </div>
            </div>

            {/* 중앙 진열대 (1-9) */}
            <div>
              <p className="text-[9px] text-gray-400 font-bold mb-1">중앙 진열대 (1–9)</p>
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${aisles.length}, minmax(0, 1fr))` }}>
                {aisles.map((z) => (
                  <ZoneBtn key={z.num} num={z.num} current={current} onSelect={onSelect} onClose={onClose} />
                ))}
              </div>
            </div>

            {/* 하단 벽면 (10-21) + 좌측 벽면 (22-23) */}
            <div>
              <p className="text-[9px] text-gray-400 font-bold mb-1">하단 벽면 (10–21) + 좌측 (22–23)</p>
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${bottomWall.length + leftWall.length}, minmax(0, 1fr))` }}>
                {[...bottomWall, ...leftWall].map((z) => (
                  <ZoneBtn key={z.num} num={z.num} current={current} onSelect={onSelect} onClose={onClose} />
                ))}
              </div>
            </div>

            {/* 구분선 */}
            <div className="border-t border-dashed border-line" />

            {/* 우측 윙 (36-41) + 이벤트존 (42) */}
            <div>
              <p className="text-[9px] text-gray-400 font-bold mb-1">우측 윙 / 이벤트존</p>
              <div className="flex flex-wrap gap-1">
                {[...wing, ...event].map((z) => {
                  const label = `${z.num}번 ${z.label}`;
                  const selected = current === label;
                  return (
                    <button
                      key={z.num}
                      onClick={() => { onSelect(label); onClose(); }}
                      title={z.category}
                      className={`flex flex-col items-center justify-center rounded-lg border px-3 py-2 transition cursor-pointer
                        ${selected
                          ? "bg-teal-500 border-teal-600 text-white shadow-md"
                          : "bg-white border-gray-300 text-gray-700 hover:border-teal-400 hover:bg-teal-50"
                        }`}
                    >
                      <span className={`text-[15px] font-bold ${selected ? "text-white" : "text-gray-800"}`}>{z.num}</span>
                      <span className={`text-[9px] font-semibold ${selected ? "text-teal-100" : "text-gray-500"}`}>{z.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 현재 선택 표시 */}
          {current && (
            <div className="px-3 py-2 bg-teal-50 border border-teal-200 rounded-xl flex items-center gap-2">
              <MapPin size={12} className="text-teal-500 shrink-0" />
              <p className="text-[14px] font-bold text-teal-700">현재: {current}</p>
            </div>
          )}
      </div>
    </BottomSheet>
  );
};
