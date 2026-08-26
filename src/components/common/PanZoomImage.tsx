// src/components/common/PanZoomImage.tsx
// 2026-08-26 · 사용자 지시 · 이미지 뷰어 프레임워크 프리미티브
//   · 마우스 hover 진입 시 자동 활성
//   · Wheel 스크롤 → 줌인/줌아웃 (커서 기준 · 부드러운 스케일)
//   · 마우스 드래그 → 이동 (grab / grabbing 커서)
//   · Double click → 원본 크기 복원 (fit)
//   · 100% 프레임워크 · 재사용 가능 · 어떤 이미지든 사용 가능

import React, { useCallback, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2, Move } from "lucide-react";

export interface PanZoomImageProps {
  /** 이미지 src (import 또는 URL) */
  src: string;
  /** 대체 텍스트 */
  alt?: string;
  /** 최소 배율 (기본 0.5) */
  minScale?: number;
  /** 최대 배율 (기본 6) */
  maxScale?: number;
  /** 초기 배율 (기본 1) */
  initialScale?: number;
  /** wheel step (기본 0.15) · 한 번 스크롤당 배율 변화량 */
  wheelStep?: number;
  /** 컨테이너 추가 className (min-height/aspect 등) */
  className?: string;
  /** 도구모음 표시 여부 (기본 true) */
  showToolbar?: boolean;
  /** 컨트롤 안내 hint 표시 (기본 true) */
  showHint?: boolean;
}

/**
 * 마우스 hover 활성 · wheel zoom · drag pan · double-click fit 이미지 뷰어.
 * 프레임워크 컴포넌트 · zonecategory 등 참조 이미지 전반에 재사용.
 */
export const PanZoomImage: React.FC<PanZoomImageProps> = ({
  src,
  alt = "",
  minScale = 0.5,
  maxScale = 6,
  initialScale = 1,
  wheelStep = 0.15,
  className = "",
  showToolbar = true,
  showHint = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(initialScale);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [hovering, setHovering] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const clampScale = (s: number) => Math.max(minScale, Math.min(maxScale, s));

  // wheel · 커서 위치 기준 확대/축소 (커서 아래 점을 유지)
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const delta = e.deltaY < 0 ? 1 + wheelStep : 1 - wheelStep;
    setScale(prev => {
      const next = clampScale(prev * delta);
      const factor = next / prev;
      setOffset(o => ({
        x: cursorX - (cursorX - o.x) * factor,
        y: cursorY - (cursorY - o.y) * factor,
      }));
      return next;
    });
  }, [wheelStep, minScale, maxScale]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setOffset({ x: dragStartRef.current.ox + dx, y: dragStartRef.current.oy + dy });
  };
  const stopDrag = () => { setDragging(false); dragStartRef.current = null; };

  const reset = () => { setScale(1); setOffset({ x: 0, y: 0 }); };
  const zoomIn  = () => setScale(s => clampScale(s * (1 + wheelStep * 2)));
  const zoomOut = () => setScale(s => clampScale(s * (1 - wheelStep * 2)));

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-lg border border-line bg-white select-none group ${className}`}
      onWheel={onWheel}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => { setHovering(false); stopDrag(); }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={stopDrag}
      onDoubleClick={reset}
      style={{ cursor: dragging ? "grabbing" : hovering ? "grab" : "default" }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="pointer-events-none block w-full h-auto max-w-none"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: "0 0",
          transition: dragging ? "none" : "transform 90ms ease-out",
        }}
      />

      {/* 도구모음 · 우상단 · hover 시 fade-in */}
      {showToolbar && (
        <div className={`absolute top-2 right-2 flex items-center gap-1 rounded-lg bg-white/95 backdrop-blur border border-line shadow-sm px-1 py-1 transition-opacity duration-150 ${hovering ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
          <button type="button" onClick={zoomOut} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-zinc-100 text-ink-soft hover:text-brand-deep cursor-pointer transition" title="축소 (Wheel ↓)">
            <ZoomOut size={14} />
          </button>
          <span className="text-[11px] font-bold text-ink-soft tabular-nums min-w-[36px] text-center">{Math.round(scale * 100)}%</span>
          <button type="button" onClick={zoomIn} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-zinc-100 text-ink-soft hover:text-brand-deep cursor-pointer transition" title="확대 (Wheel ↑)">
            <ZoomIn size={14} />
          </button>
          <div className="w-px h-4 bg-line mx-0.5" />
          <button type="button" onClick={reset} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-zinc-100 text-ink-soft hover:text-brand-deep cursor-pointer transition" title="원본 크기 복원 (더블클릭)">
            <Maximize2 size={13} />
          </button>
        </div>
      )}

      {/* 안내 hint · 좌하단 · hover 시만 표시 */}
      {showHint && (
        <div className={`absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-md bg-black/70 text-white text-[11px] font-semibold px-2 py-1 backdrop-blur transition-opacity duration-150 ${hovering && scale === 1 && offset.x === 0 && offset.y === 0 ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
          <Move size={11} />
          <span>스크롤 · 줌 · 드래그 · 이동 · 더블클릭 · 초기화</span>
        </div>
      )}
    </div>
  );
};

export default PanZoomImage;
