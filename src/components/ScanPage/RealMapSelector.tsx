import React from "react";
import { X } from "lucide-react";
import { ZONE_DEFS, SECTION_LABEL, type ZoneSection } from "../../constants/displayZones";

interface RealMapSelectorProps {
  current: string | null | undefined;
  onSelect: (zoneLabel: string) => void;
  onClose: () => void;
}

const SECTION_ORDER: ZoneSection[] = ["top_wall", "aisle", "left_wall", "bottom_wall", "wing", "event"];

export const RealMapSelector: React.FC<RealMapSelectorProps> = ({ current, onSelect, onClose }) => {
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex flex-col" onClick={onClose}>
      <div
        className="bg-white flex-1 flex flex-col mt-16 rounded-t-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 shrink-0">
          <p className="text-sm font-black text-gray-900">실제 배정 구역 선택</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>
        {/* Content */}
        <div className="overflow-y-auto flex-1 px-4 py-3 flex flex-col gap-4">
          {/* 미지정 option */}
          <button
            onClick={() => {
              onSelect("");
              onClose();
            }}
            className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm font-bold transition cursor-pointer ${
              !current
                ? "bg-gray-100 border-gray-400 text-gray-700"
                : "border-gray-200 text-gray-400 hover:bg-gray-50"
            }`}
          >
            미지정 (없음)
          </button>
          {SECTION_ORDER.map((section) => {
            const zones = ZONE_DEFS.filter((z) => z.section === section);
            if (zones.length === 0) return null;
            return (
              <div key={section}>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                  {SECTION_LABEL[section]}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {zones.map((zone) => {
                    const label = `${zone.num}번 ${zone.label}`;
                    const isSelected = current === label;
                    return (
                      <button
                        key={zone.num}
                        onClick={() => {
                          onSelect(label);
                          onClose();
                        }}
                        className={`text-left px-3 py-2 rounded-xl border transition cursor-pointer ${
                          isSelected
                            ? "bg-teal-600 border-teal-600 text-white"
                            : "border-gray-200 hover:border-teal-300 hover:bg-teal-50 text-gray-700"
                        }`}
                      >
                        <p
                          className={`text-xs font-black leading-tight ${
                            isSelected ? "text-white" : "text-gray-800"
                          }`}
                        >
                          {zone.num}번 {zone.label}
                        </p>
                        <p
                          className={`text-[10px] mt-0.5 leading-tight ${
                            isSelected ? "text-teal-100" : "text-gray-400"
                          }`}
                        >
                          {zone.category}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
