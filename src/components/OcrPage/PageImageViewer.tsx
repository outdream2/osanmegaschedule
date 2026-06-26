import React, { useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, RotateCw } from "lucide-react";

interface PageImageViewerProps {
  images: string[];
  totalPages: number;
  loading: boolean;
  currentIdx: number;
  onChangeIdx: (i: number) => void;
}

export const PageImageViewer: React.FC<PageImageViewerProps> = ({
  images, totalPages, loading, currentIdx, onChangeIdx,
}) => {
  const [rotations, setRotations] = useState<number[]>([]);

  const rotate = (delta: -90 | 90) => {
    setRotations(prev => {
      const next = [...prev];
      const cur = next[currentIdx] ?? 0;
      next[currentIdx] = ((cur + delta) + 360) % 360;
      return next;
    });
  };

  const deg = rotations[currentIdx] ?? 0;
  const isVertical = deg === 90 || deg === 270;

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

      {/* Image area */}
      <div
        className="relative bg-gray-100 flex items-center justify-center overflow-hidden"
        style={{ minHeight: 200 }}
      >
        <div
          className="transition-transform duration-300"
          style={{
            transform: `rotate(${deg}deg)`,
            // When rotated 90/270, swap width/height so the image fills correctly
            width: isVertical ? "70vh" : "100%",
            maxWidth: isVertical ? "70vh" : undefined,
          }}
        >
          <img
            src={images[currentIdx]}
            alt={`페이지 ${currentIdx + 1}`}
            className="w-full h-auto block"
            style={{ maxHeight: isVertical ? undefined : "70vh", objectFit: "contain" }}
          />
        </div>

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
