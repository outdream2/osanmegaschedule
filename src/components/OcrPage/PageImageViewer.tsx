import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, RotateCw } from "lucide-react";

interface PageImageViewerProps {
  images: string[];
  totalPages: number;
  loading: boolean;
  currentIdx: number;
  onChangeIdx: (i: number) => void;
  autoRotation: number; // single value for all pages (from first-page detection)
}

export const PageImageViewer: React.FC<PageImageViewerProps> = ({
  images, totalPages, loading, currentIdx, onChangeIdx, autoRotation,
}) => {
  // Single global rotation — applies to ALL pages uniformly
  const [rotation, setRotation] = useState(0);

  // Apply auto-detected rotation when it first becomes non-zero
  useEffect(() => {
    if (autoRotation !== 0) setRotation(autoRotation);
  }, [autoRotation]);

  const isVertical = rotation === 90 || rotation === 270;

  const rotateCcw = () => setRotation(r => (r - 90 + 360) % 360);
  const rotateCw  = () => setRotation(r => (r + 90) % 360);

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
            onClick={rotateCcw}
            title="전체 왼쪽 회전"
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer"
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={rotateCw}
            title="전체 오른쪽 회전"
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer"
          >
            <RotateCw size={14} />
          </button>
          {rotation !== 0 && (
            <span className="text-[10px] text-amber-600 font-bold">{rotation}°</span>
          )}
          <span className="text-xs font-bold text-gray-400 ml-1">
            {currentIdx + 1} / {images.length}
          </span>
        </div>
      </div>

      {/* Image — fixed 70vh container, image scaled to fit after rotation */}
      <div
        className="relative bg-gray-100 flex items-center justify-center overflow-hidden"
        style={{ height: "70vh" }}
      >
        <img
          src={images[currentIdx]}
          alt={`페이지 ${currentIdx + 1}`}
          style={{
            display: "block",
            transform: `rotate(${rotation}deg)`,
            transition: "transform 0.25s ease",
            // After 90/270° rotation the original landscape image visually becomes portrait.
            // CSS layout box stays pre-rotation, so we constrain against the rotated visual:
            //   maxWidth (CSS) → limits visual HEIGHT after rotation → use container height (70vh)
            //   maxHeight (CSS) → limits visual WIDTH after rotation → use 100% of container width
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
