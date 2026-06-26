import React, { useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, RotateCw } from "lucide-react";

interface PageImageViewerProps {
  images: string[];
  totalPages: number;
  loading: boolean;
  currentIdx: number;
  onChangeIdx: (i: number) => void;
  autoRotations: number[];       // computed by parent from image aspect ratios
}

export const PageImageViewer: React.FC<PageImageViewerProps> = ({
  images, totalPages, loading, currentIdx, onChangeIdx, autoRotations,
}) => {
  // Per-page manual overrides on top of autoRotations
  const [overrides, setOverrides] = useState<Record<number, number>>({});

  const getDeg = (i: number) => overrides[i] ?? autoRotations[i] ?? 0;
  const deg = getDeg(currentIdx);
  const isVertical = deg === 90 || deg === 270;

  const rotate = (delta: -90 | 90) => {
    const cur = getDeg(currentIdx);
    setOverrides(prev => ({ ...prev, [currentIdx]: ((cur + delta) + 360) % 360 }));
  };

  if (images.length === 0) return null;

  return (
    <div className="w-full bg-white border border-gray-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500">원본 이미지</span>
          {loading && images.length < totalPages && (
            <span className="text-[10px] text-amber-500 font-bold">· 렌더링 중...</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => rotate(-90)}
            title="왼쪽으로 회전"
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer"
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={() => rotate(90)}
            title="오른쪽으로 회전"
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer"
          >
            <RotateCw size={14} />
          </button>
          <span className="text-xs font-bold text-gray-400 ml-1">
            {currentIdx + 1} / {images.length}
          </span>
        </div>
      </div>

      {/* Image container — fixed 70vh height, image fits inside after rotation */}
      <div
        className="relative bg-gray-100 flex items-center justify-center overflow-hidden"
        style={{ height: "70vh" }}
      >
        <img
          key={`${currentIdx}-${deg}`}
          src={images[currentIdx]}
          alt={`페이지 ${currentIdx + 1}`}
          style={{
            display: "block",
            transform: `rotate(${deg}deg)`,
            transition: "transform 0.25s ease",
            // When vertical (90/270): CSS pre-rotation box is landscape (W > H).
            //   maxWidth: '70vh'  → limits CSS width → visual height after rotation ≤ 70vh
            //   maxHeight: '100%' → limits CSS height → visual width after rotation ≤ container height
            // When horizontal (0/180): normal portrait display
            maxWidth: isVertical ? "70vh" : "100%",
            maxHeight: isVertical ? "100%" : "70vh",
            width: "auto",
            height: "auto",
          }}
        />

        {images.length > 1 && (
          <>
            <button
              onClick={() => onChangeIdx(Math.max(0, currentIdx - 1))}
              disabled={currentIdx === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white disabled:opacity-20 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() => onChangeIdx(Math.min(images.length - 1, currentIdx + 1))}
              disabled={currentIdx === images.length - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white disabled:opacity-20 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </div>

      {/* Dot indicators */}
      {images.length > 1 && (
        <div className="flex justify-center gap-1.5 py-2.5">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => onChangeIdx(i)}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                i === currentIdx ? "bg-amber-400 w-4" : "bg-gray-300 hover:bg-gray-400 w-1.5"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
