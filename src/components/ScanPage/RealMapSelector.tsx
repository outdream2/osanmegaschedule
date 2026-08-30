// src/components/ScanPage/RealMapSelector.tsx
// 2026-08-26 · 사용자 지시 · 실재고입력 · 매장구역 선택
//   · 매장진열-매장구역도 (StoreZoneMap) 그대로 재사용
//   · 이전 자체 렌더 (grid section) 제거 · 통일된 시각 (Attio 톤)
//   · useZoneDefs 훅 · 매장구역도 편집 반영 (설정 → 즉시 반영)

import React from "react";
import { MapPin, X } from "lucide-react";
import { BottomSheet } from "../common/BottomSheet";
import { StoreZoneMap } from "../common/StoreZoneMap";

interface RealMapSelectorProps {
  current: string | null | undefined;
  onSelect: (zoneLabel: string) => void;
  onClose: () => void;
}

export const RealMapSelector: React.FC<RealMapSelectorProps> = ({ current, onSelect, onClose }) => {
  // 2026-08-30 · 사용자 리포트 · 매장구역 선택 오류 · A/B 구분 사라짐
  //   원인 · label 이 DB 마이그레이션 후 "중앙상비약존" 이 됨 · `${z.num}번 ${z.label}` 이 "5번 중앙상비약존" 로 왜곡
  //   수정 · zoneId 자체 (예: "5A", "22") 를 real_map 값으로 사용 · location 코드 그대로
  const handleZoneClick = (zoneId: string) => {
    if (!zoneId) return;
    onSelect(zoneId);
    onClose();
  };

  // 2026-08-30 · 사용자 지시 · 명시 닫기 버튼 + 헤더 우측 · fullscreen 대신 자연스러운 높이
  const header = (
    <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-line">
      <MapPin size={15} className="text-teal-500" />
      <p className="text-[16px] font-bold text-gray-900">매장 구역도에서 선택</p>
      {current && (
        <span className="text-[15px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-md px-2 py-0.5">
          현재 · {current}
        </span>
      )}
      <button
        type="button"
        onClick={onClose}
        className="ml-auto w-8 h-8 flex items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition cursor-pointer"
        title="닫기"
        aria-label="매장구역도 닫기"
      >
        <X size={18} />
      </button>
    </div>
  );

  return (
    <BottomSheet
      open
      onClose={onClose}
      disableHandle
      zIndex={70}
      backdropClass="backdrop-brand"
      header={header}
    >
      {/* 2026-08-30 · 사용자 지시 · 매장구역도 작게 · scale 축소 + 최대 높이 제한 */}
      <div className="p-3 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
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

        {/* 매장구역도 · compact + 좁은 컨테이너 · 작게 표시 */}
        <div className="origin-top scale-[0.85]">
          <StoreZoneMap
            compact
            onZoneClick={handleZoneClick}
          />
        </div>
      </div>
    </BottomSheet>
  );
};

export default RealMapSelector;
