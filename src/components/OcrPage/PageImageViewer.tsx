import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";

interface PageImageViewerProps {
  images: string[];
  totalPages: number;
  loading: boolean;
  currentIdx: number;
  onChangeIdx: (i: number) => void;
  rotation: number;
  onRotate: (r: number) => void;
}

export const PageImageViewer: React.FC<PageImageViewerProps> = ({
  images, totalPages, loading, currentIdx, onChangeIdx, rotation, onRotate,
}) => {
  const [zoom,        setZoom       ] = useState(1);
  const [offset,      setOffset     ] = useState({ x: 0, y: 0 });
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  useEffect(() => { setNaturalSize(null); setZoom(1); setOffset({ x: 0, y: 0 }); }, [currentIdx]);

  const isVertical = rotation === 90 || rotation === 270;
  const rotateCcw  = () => { onRotate((rotation - 90 + 360) % 360); setZoom(1); setOffset({ x: 0, y: 0 }); };
  const rotateCw   = () => { onRotate((rotation + 90) % 360);        setZoom(1); setOffset({ x: 0, y: 0 }); };

  const clampOffset = (ox: number, oy: number, z: number) => {
    const m = 500 * (z - 1);
    return { x: Math.max(-m, Math.min(m, ox)), y: Math.max(-m, Math.min(m, oy)) };
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => {
      const next = Math.min(5, Math.max(1, +(z - e.deltaY * 0.002).toFixed(2)));
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    setOffset(clampOffset(
      dragRef.current.ox + (e.clientX - dragRef.current.startX),
      dragRef.current.oy + (e.clientY - dragRef.current.startY),
      zoom,
    ));
  };
  const handleMouseUp = () => { dragRef.current = null; };

  const effW = naturalSize ? (isVertical ? naturalSize.h : naturalSize.w) : null;
  const effH = naturalSize ? (isVertical ? naturalSize.w : naturalSize.h) : null;

  const containerStyle: React.CSSProperties = {
    maxHeight: "70vh",
    overflow: "hidden",
    ...(effW && effH ? { aspectRatio: `${effW} / ${effH}` } : { height: "70vh" }),
    cursor: zoom > 1 ? "grab" : "default",
    userSelect: "none",
  };

  if (images.length === 0) return null;

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500">원본 이미지</span>
          {loading && images.length < totalPages && (
            <span className="text-[10px] text-amber-500 font-bold">· 렌더링 중...</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom(z => Math.min(5, +(z + 0.5).toFixed(1)))} title="확대"
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer">
            <ZoomIn size={14} />
          </button>
          <button
            onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}
            className={`text-[10px] font-bold min-w-[2.5rem] text-center transition cursor-pointer ${
              zoom !== 1 ? "text-blue-500 hover:underline" : "text-gray-300"
            }`}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => setZoom(z => { const n = Math.max(1, +(z - 0.5).toFixed(1)); if (n === 1) setOffset({ x: 0, y: 0 }); return n; })} title="축소"
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer">
            <ZoomOut size={14} />
          </button>

          <div className="w-px h-4 bg-gray-200 mx-0.5" />

          <button onClick={rotateCcw} title="왼쪽 회전"
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer">
            <RotateCcw size={14} />
          </button>
          <button onClick={rotateCw} title="오른쪽 회전"
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer">
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

      {/* Image area */}
      <div
        className="relative bg-gray-100 flex items-center justify-center w-full"
        style={containerStyle}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          src={images[currentIdx]}
          alt={`페이지 ${currentIdx + 1}`}
          draggable={false}
          onLoad={e => {
            const img = e.currentTarget;
            setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
          }}
          style={{
            display: "block",
            transform: `rotate(${rotation}deg) scale(${zoom}) translate(${offset.x / zoom}px, ${offset.y / zoom}px)`,
            transition: dragRef.current ? "none" : "transform 0.15s ease",
            maxWidth: isVertical ? "70vh" : "100%",
            maxHeight: isVertical ? "100%" : "70vh",
            width: "auto",
            height: "auto",
            transformOrigin: "center center",
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
        <div className="flex justify-center gap-1.5 py-2.5 border-t border-gray-100">
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
