// src/components/common/SignaturePad.tsx
// 2026-08-29 · #130 A안 Phase 1 · SignaturePad 프리미티브 (BorrowingPage 인라인 추출)
//
// 마우스·터치 서명 캡처 · Canvas → dataURL(image/png)
// iOS Safari · touch-action:none + passive:false 필수 (기본 처리됨)
//
// 사용:
//   const [sig, setSig] = useState("");
//   <SignaturePad value={sig} onChange={setSig} />
//
// 후속: react-signature-canvas 라이브러리 도입 검토 (BORROWING_RESEARCH 참조)

import React, { useEffect, useRef } from "react";

export interface SignaturePadProps {
  value: string;
  onChange: (dataUrl: string) => void;
  width?: number;
  height?: number;
  strokeColor?: string;
  lineWidth?: number;
  /** 하단 안내 문구 (기본: 마우스/터치로 서명 · 저장 시 이미지로 함께 기록) */
  hint?: string;
  /** 클리어 버튼 라벨 (기본: 지우기) */
  clearLabel?: string;
  className?: string;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  value, onChange,
  width = 520, height = 160,
  strokeColor = "#0f172a", lineWidth = 2.5,
  hint = "마우스/터치로 서명 · 저장 시 이미지로 함께 기록",
  clearLabel = "지우기",
  className = "",
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = value;
    }
  }, [value]);

  const getPos = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX = 0, clientY = 0;
    if ("touches" in e) {
      clientX = e.touches[0]?.clientX ?? 0;
      clientY = e.touches[0]?.clientY ?? 0;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    drawingRef.current = true;
    lastRef.current = getPos(e);
  };
  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !lastRef.current) return;
    const pos = getPos(e);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastRef.current = pos;
  };
  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChange("");
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className}`.trim()}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="border border-line rounded-lg bg-white w-full h-40 touch-none cursor-crosshair"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-zinc-400">{hint}</span>
        <button
          type="button"
          onClick={clear}
          className="text-[12px] font-bold text-zinc-500 hover:text-rose-600 underline underline-offset-4 cursor-pointer"
        >{clearLabel}</button>
      </div>
    </div>
  );
};

export default SignaturePad;
