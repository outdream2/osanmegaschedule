// src/components/ContractWriterPage/SignatureModal.tsx
// 서명 그리기 모달

import React, { useEffect, useRef, useState } from "react";
import SignaturePad from "react-signature-canvas";
import { Eraser, Check, Signature, X as XIcon } from "@phosphor-icons/react";
import { useToast, toastClass } from "../../hooks/useToast";
import { Modal } from "../common/Modal";

type SignatureCanvasType = SignaturePad;

interface SignatureModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onSubmit: (dataUrl: string) => void;
}

const SignatureModal: React.FC<SignatureModalProps> = ({ open, title, onClose, onSubmit }) => {
  const padRef = useRef<SignatureCanvasType | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 400, h: 180 });
  const [empty, setEmpty] = useState(true);
  const { toast, showError } = useToast();

  useEffect(() => {
    if (!open) return;
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.max(240, Math.floor(e.contentRect.width) - 2);
        setSize({ w, h: 180 });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (open) {
      padRef.current?.clear();
      setEmpty(true);
    }
  }, [open]);

  const clear = () => {
    padRef.current?.clear();
    setEmpty(true);
  };
  const submit = () => {
    if (!padRef.current || padRef.current.isEmpty()) {
      showError("서명이 비어있습니다.");
      return;
    }
    const url = padRef.current.toDataURL("image/png");
    onSubmit(url);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg-narrow"
      backdropIntensity="brand"
      zIndex={60}
      showClose={false}
      bodyPadding="none"
      closeOnBackdrop={true}
      closeOnEsc={true}
    >
      {/* 커스텀 헤더 · emerald 톤 · 원본 완전 재현 */}
      <div className="px-4 py-3 border-b border-line bg-emerald-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center shadow-sm">
            <Signature size={13} weight="fill" className="text-white" />
          </div>
          <span className="text-sm font-bold text-zinc-800">서명 · {title}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-700 w-7 h-7 rounded-md hover:bg-white/70 cursor-pointer flex items-center justify-center"
          title="닫기 (ESC)"
        >
          <XIcon size={13} weight="bold" />
        </button>
      </div>
      {/* Canvas 서명 영역 · 좌표·DPR·저장 로직 절대 변경 X */}
      <div className="p-4 flex flex-col gap-2">
        <div
          ref={wrapperRef}
          className="relative bg-white border-2 border-dashed border-emerald-300 rounded-lg overflow-hidden"
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
            penColor="#0f172a"
            onEnd={() => setEmpty(padRef.current?.isEmpty() ?? true)}
            onBegin={() => setEmpty(false)}
          />
          {empty && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-zinc-300 text-sm font-bold select-none">
              여기에 서명해 주세요
            </span>
          )}
        </div>
      </div>
      {/* 푸터 */}
      <div className="px-4 py-3 border-t border-line bg-zinc-50/70 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-[14px] font-bold transition-colors cursor-pointer"
        >
          <Eraser size={12} />
          지우기
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-[14px] font-bold text-zinc-600 bg-white border border-zinc-300 rounded-md h-8 px-3 hover:bg-zinc-50 cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={empty}
            className="text-[14px] font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] rounded-md h-8 px-4 cursor-pointer disabled:bg-zinc-300 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm"
          >
            <Check size={12} weight="bold" />
            서명 저장
          </button>
        </div>
      </div>
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
    </Modal>
  );
};

export default SignatureModal;
