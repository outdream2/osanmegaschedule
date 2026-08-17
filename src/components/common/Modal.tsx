// src/components/common/Modal.tsx
// 2026-08-03 (#183) · 공통 모달 컴포넌트
//   - backdrop + card + header + body + (optional footer)
//   - ESC 키 · backdrop 클릭 · onClose
//   - size 프리셋 (sm · md · lg · xl · full)
//   - 스크롤 잠금은 index.css :has() 셀렉터로 자동 처리
//
// 사용 예:
//   <Modal open={open} onClose={() => setOpen(false)} title="상세" size="md">
//     <div>내용</div>
//   </Modal>

import React, { useEffect } from "react";
import { X } from "lucide-react";

type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

const SIZE_MAP: Record<ModalSize, string> = {
  sm:   "max-w-md",
  md:   "max-w-2xl",
  lg:   "max-w-4xl",
  xl:   "max-w-6xl",
  full: "max-w-[95vw]",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: ModalSize;
  /** 닫기 버튼 표시 (기본 true) */
  showClose?: boolean;
  /** ESC 로 닫기 (기본 true) */
  closeOnEsc?: boolean;
  /** backdrop 클릭 시 닫기 (기본 true) */
  closeOnBackdrop?: boolean;
  className?: string;
}

/**
 * 공통 모달
 *   - backdrop + card
 *   - ESC · backdrop 클릭 · X 버튼 → onClose
 *   - body 는 스크롤 · 최대 90vh
 */
export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  showClose = true,
  closeOnEsc = true,
  closeOnBackdrop = true,
  className = "",
}) => {
  // ESC 키 핸들링
  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeOnEsc, onClose]);

  if (!open) return null;

  const sizeCls = SIZE_MAP[size];

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!closeOnBackdrop) return;
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
    >
      <div className={`modal-card ${sizeCls} ${className}`}>
        {(title != null || showClose) && (
          <div className="modal-header">
            {title != null && (
              <div className="flex-1 min-w-0 text-[15px] font-bold text-zinc-800 truncate">
                {title}
              </div>
            )}
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-600 cursor-pointer shrink-0 transition-colors"
                title="닫기 (ESC)"
                aria-label="닫기"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}
        <div className="modal-body">
          {children}
        </div>
        {footer != null && (
          <div className="border-t border-line px-5 py-3 flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
