import React, { useRef } from "react";

interface RawPageImageCellProps {
  pn: number;
  imgSrc: string;
  imgRowSpan: number;
  imgCellHeight: number;
  effectiveInvColWidth: number;
  invColResizing: boolean;
  pageZoom: Record<number, number>;
  pagePan: Record<number, { x: number; y: number }>;
  panDragRef: React.MutableRefObject<{ pn: number; startX: number; startY: number; startPanX: number; startPanY: number } | null>;
  rotation: number;
  onInvColResizeStart: (e: React.MouseEvent) => void;
  setInvoiceColWidth: (w: number) => void;
  INV_COL_DEFAULT: number;
  onImgPanStart: (pn: number, e: React.MouseEvent) => void;
  openPageModal: (pn: number) => void;
  zoomOut: (pn: number) => void;
  zoomReset: (pn: number) => void;
  zoomIn: (pn: number) => void;
}

export const RawPageImageCell: React.FC<RawPageImageCellProps> = ({
  pn, imgSrc, imgRowSpan, imgCellHeight, effectiveInvColWidth,
  invColResizing, pageZoom, pagePan, panDragRef, rotation,
  onInvColResizeStart, setInvoiceColWidth, INV_COL_DEFAULT,
  onImgPanStart, openPageModal, zoomOut, zoomReset, zoomIn,
}) => {
  const currentZoom = pageZoom[pn] ?? 1;
  const currentPan = pagePan[pn] ?? { x: 0, y: 0 };
  const canPan = currentZoom > 1;

  const resizeHandle = (
    <div
      role="separator"
      aria-label="이미지 폭 조절"
      onMouseDown={onInvColResizeStart}
      onDoubleClick={() => setInvoiceColWidth(INV_COL_DEFAULT)}
      onDragStart={e => { e.preventDefault(); e.stopPropagation(); }}
      draggable={false}
      title="드래그하여 이미지 폭 조절 · 더블클릭 초기화"
      style={{
        position: "absolute", top: 0, right: 0, bottom: 0, width: 4,
        cursor: "col-resize", zIndex: 50,
        backgroundColor: invColResizing ? "#10b981" : "transparent",
        transition: "background-color 0.15s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "#10b981"; }}
      onMouseLeave={e => { if (!invColResizing) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
    />
  );

  return (
    <td
      rowSpan={imgRowSpan}
      className="align-top bg-gray-50 border-r border-line"
      style={{
        width: effectiveInvColWidth, minWidth: effectiveInvColWidth, maxWidth: effectiveInvColWidth,
        verticalAlign: "top", padding: 0, position: "relative", boxSizing: "border-box",
        height: imgCellHeight, overflow: "hidden",
      }}
    >
      {resizeHandle}
      {!imgSrc ? (
        <div className="flex items-center justify-center h-full p-3 text-[11px] text-gray-400">이미지 없음</div>
      ) : (
        <div
          style={{ position: "relative", width: "100%", height: "100%", cursor: canPan ? (panDragRef.current?.pn === pn ? "grabbing" : "grab") : "zoom-in" }}
          onMouseDown={canPan ? (e => onImgPanStart(pn, e)) : undefined}
          onClick={!canPan ? () => openPageModal(pn) : undefined}
          title={canPan ? "드래그로 이동 · +/- 로 확대·축소" : `${pn}번 명세서 이미지 · 클릭 확대`}
        >
          {/* 줌 조작 버튼 */}
          <div
            style={{
              position: "absolute", top: 4, right: 4, zIndex: 5,
              display: "flex", gap: 2, background: "rgba(255,255,255,0.9)",
              borderRadius: 6, padding: 2, boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <button type="button" onClick={() => zoomOut(pn)} title="축소" disabled={currentZoom <= 0.5}
              style={{ width: 22, height: 22, fontSize: 14, fontWeight: 900, color: currentZoom <= 0.5 ? "#cbd5e1" : "#475569", cursor: currentZoom <= 0.5 ? "not-allowed" : "pointer", background: "transparent", border: "none", borderRadius: 4 }}>−</button>
            <button type="button" onClick={() => zoomReset(pn)} title={`초기화 (현재 ${Math.round(currentZoom * 100)}%)`}
              style={{ minWidth: 34, height: 22, fontSize: 10, fontWeight: 800, color: "#475569", cursor: "pointer", padding: "0 4px", background: currentZoom !== 1 ? "#fef3c7" : "transparent", border: "none", borderRadius: 4 }}>
              {Math.round(currentZoom * 100)}%
            </button>
            <button type="button" onClick={() => zoomIn(pn)} title="확대" disabled={currentZoom >= 3}
              style={{ width: 22, height: 22, fontSize: 14, fontWeight: 900, color: currentZoom >= 3 ? "#cbd5e1" : "#475569", cursor: currentZoom >= 3 ? "not-allowed" : "pointer", background: "transparent", border: "none", borderRadius: 4 }}>+</button>
          </div>
          <button
            type="button"
            onClick={() => openPageModal(pn)}
            className="block bg-gray-50 hover:bg-gray-100 transition cursor-zoom-in p-1.5"
            style={{ width: "100%", height: "100%", maxWidth: effectiveInvColWidth - 12, overflow: "hidden" }}
            title={`${pn}번 명세서 이미지 보기 (모달)`}
          >
            <img
              src={imgSrc}
              alt={`${pn}번 명세서`}
              draggable={false}
              style={{
                display: "block", margin: "0 auto",
                transform: `translate(${currentPan.x}px, ${currentPan.y}px) rotate(${rotation}deg) scale(${currentZoom})`,
                transformOrigin: "top center",
                transition: panDragRef.current ? "none" : "transform 0.15s ease-out",
                maxWidth: (rotation === 90 || rotation === -90 || rotation === 270) ? "60%" : "100%",
                width: "auto", height: "auto", objectFit: "contain",
                userSelect: "none",
                pointerEvents: canPan ? "none" : "auto",
              }}
            />
            <div className="mt-1 flex items-center justify-between px-0.5">
              <span className="text-[10px] text-gray-400">{pn}번</span>
              <a href={imgSrc} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700"
                title="원본 이미지 새 창으로 열기">원본↗</a>
            </div>
          </button>
        </div>
      )}
    </td>
  );
};
