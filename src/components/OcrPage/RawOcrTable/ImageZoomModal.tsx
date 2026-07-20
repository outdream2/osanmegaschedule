import React from "react";
import { X } from "lucide-react";

interface ImageZoomModalProps {
  modalImg: string;
  modalLabel: string;
  zoom: number;
  pan: { x: number; y: number };
  isDragging: boolean;
  rotation: number;
  viewportCbRef: (el: HTMLDivElement | null) => void;
  closeModal: () => void;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onDblClick: (e: React.MouseEvent) => void;
}

export const ImageZoomModal: React.FC<ImageZoomModalProps> = ({
  modalImg, modalLabel, zoom, pan, isDragging, rotation,
  viewportCbRef, closeModal, setZoom, setPan,
  onMouseDown, onMouseMove, onMouseUp, onDblClick,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 outline-none"
      onClick={closeModal}
      tabIndex={-1}
      autoFocus
      ref={el => { if (el) el.focus(); }}
      onKeyDown={e => {
        if (e.key === "Escape" || e.key === "Esc") { e.stopPropagation(); closeModal(); }
      }}
    >
      <div className="relative w-full bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ maxWidth: "min(900px, 95vw)", height: "90vh" }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200 shrink-0">
          <span className="text-xs font-bold text-gray-700 break-all min-w-0 flex-1 mr-3">{modalLabel}</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg px-1 py-0.5">
              <button onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-600 font-bold text-base leading-none cursor-pointer select-none">−</button>
              <span className="text-[11px] font-bold text-gray-500 min-w-[40px] text-center tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button onClick={() => setZoom(z => Math.min(6, +(z + 0.25).toFixed(2)))}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-600 font-bold text-base leading-none cursor-pointer select-none">+</button>
            </div>
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              className="text-[10px] font-bold text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 cursor-pointer">
              초기화
            </button>
            <button onClick={closeModal} className="p-1 rounded-lg hover:bg-gray-200 cursor-pointer">
              <X size={16} className="text-gray-500" />
            </button>
          </div>
        </div>

        <div ref={viewportCbRef}
          className="relative flex-1 min-h-0 overflow-hidden select-none flex items-center justify-center"
          style={{ cursor: isDragging ? "grabbing" : zoom > 1 ? "grab" : "zoom-in" }}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove}
          onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onDoubleClick={onDblClick}>
          <div style={{
            transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: isDragging ? "none" : "transform 0.12s ease-out",
          }}>
            <img src={modalImg} alt={modalLabel} draggable={false}
              style={{
                display: "block",
                transform: `rotate(${rotation}deg)`,
                maxWidth:  (rotation === 90 || rotation === -90 || rotation === 270) ? "80vh" : "90vw",
                maxHeight: (rotation === 90 || rotation === -90 || rotation === 270) ? "80vw" : "80vh",
                width: "auto", height: "auto", userSelect: "none", pointerEvents: "none",
              }} />
          </div>
          {zoom <= 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-white/70 bg-black/40 px-3 py-1 rounded-full pointer-events-none whitespace-nowrap">
              스크롤 줌 · 더블클릭 2.5× · 드래그 이동
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
