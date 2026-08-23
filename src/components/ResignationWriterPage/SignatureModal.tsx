// src/components/ResignationWriterPage/SignatureModal.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · ResignationWriterPage 서명 모달 이관
// 2026-08-23 · #191 · inline fixed inset-0 → common/Modal primitive
// 프레임워크: Modal · AccentBar
import React, { useEffect, useRef, useState } from "react";
import { Signature, Eraser, Check } from "@phosphor-icons/react";
import SignaturePad from "react-signature-canvas";
import { Modal } from "../common/Modal";
import type { SignSlot } from "./types";
import { SIGN_LABELS } from "./utils";

type SignatureCanvasType = SignaturePad;

export const SignatureModal: React.FC<{
  open: boolean;
  slot: SignSlot | null;
  initialDataUrl: string | null;
  onSave: (dataUrl: string | null) => void;
  onClose: () => void;
}> = ({ open, slot, initialDataUrl, onSave, onClose }) => {
  const padRef = useRef<SignatureCanvasType | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 480, h: 200 });
  const [empty, setEmpty] = useState(true);

  // 모달 열릴 때 · 캔버스 초기화 + 이전 서명 로드
  useEffect(() => {
    if (!open) return;
    // 초기 렌더 · resize 후에 initialDataUrl 반영
    const t = setTimeout(() => {
      if (padRef.current) {
        padRef.current.clear();
        if (initialDataUrl) {
          padRef.current.fromDataURL(initialDataUrl);
          setEmpty(false);
        } else {
          setEmpty(true);
        }
      }
    }, 80);
    return () => clearTimeout(t);
  }, [open, initialDataUrl]);

  // 반응형 캔버스 사이즈 (모달 폭 기준)
  useEffect(() => {
    if (!open) return;
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.max(280, Math.floor(e.contentRect.width) - 2);
        setSize({ w, h: 200 });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  if (!open) return null;

  const handleClear = () => {
    padRef.current?.clear();
    setEmpty(true);
  };
  const handleSave = () => {
    if (!padRef.current || padRef.current.isEmpty()) {
      onSave(null);
      return;
    }
    try {
      const url = padRef.current.toDataURL("image/png");
      onSave(url);
    } catch {
      onSave(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={slot ? SIGN_LABELS[slot] : "서명"}
      icon={<Signature size={17} weight="fill" />}
      titleAccent
      backdropIntensity="brand"
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-line bg-white text-ink-soft hover:bg-zinc-50 text-[17px] font-bold transition-colors cursor-pointer"
          >
            <Eraser size={14} />
            지우기
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-line bg-white text-ink-soft hover:bg-zinc-50 text-[17px] font-bold transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] text-white text-[17px] font-bold shadow-sm transition-colors cursor-pointer"
            >
              <Check size={14} weight="bold" />
              서명 저장
            </button>
          </div>
        </div>
      }
    >
      {/* 캔버스 */}
      <div className="p-5">
        <div
          ref={wrapperRef}
          className="relative bg-white border-2 border-dashed border-brand-tint rounded-xl overflow-hidden"
          style={{ height: size.h + 2 }}
        >
          <SignaturePad
            ref={(el) => { padRef.current = el; }}
            canvasProps={{
              width: size.w,
              height: size.h,
              className: "block bg-white touch-none",
              style: { width: `${size.w}px`, height: `${size.h}px` },
            }}
            penColor="#0A2E4A"
            onEnd={() => { if (padRef.current) setEmpty(padRef.current.isEmpty()); }}
            onBegin={() => setEmpty(false)}
          />
          {empty && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[17px] text-zinc-300 font-bold select-none">
              여기에 서명해 주세요
            </span>
          )}
        </div>
        <p className="text-[17px] text-ink-soft mt-2.5">
          마우스·터치로 서명하세요. 저장 시 오른쪽 사직서에 즉시 반영됩니다.
        </p>
      </div>
    </Modal>
  );
};
