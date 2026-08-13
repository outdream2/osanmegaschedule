// src/components/common/ConfirmDialog.tsx
// 2026-08-06 · T-SLIM D · window.confirm 대체 커스텀 다이얼로그
//
// 사용 예 (state 기반):
//   <ConfirmDialog
//     open={open}
//     message="정말 삭제할까요?"
//     danger
//     onConfirm={() => { doDelete(); setOpen(false); }}
//     onCancel={() => setOpen(false)}
//   />
//
// 사용 예 (useConfirm 훅 · Promise 기반):
//   const confirm = useConfirm();
//   if (await confirm({ message: "삭제할까요?", danger: true })) { doDelete(); }

import React, { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

export interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string | React.ReactNode;
  /** 확인 버튼 레이블 (기본 "확인") */
  confirmLabel?: string;
  /** 취소 버튼 레이블 (기본 "취소") */
  cancelLabel?: string;
  /** true 시 확인 버튼을 rose 톤(위험 액션)으로 표시 */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 커스텀 확인 다이얼로그
 * - Enter → 확인 / Escape → 취소
 * - 반응형 (모바일·데스크탑)
 * - danger prop으로 파괴적 액션 시각 구분
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = "확인",
  cancelLabel = "취소",
  danger = false,
  onConfirm,
  onCancel,
}) => {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // 키보드 지원: Enter → 확인, Escape → 취소
  useEffect(() => {
    if (!open) return;
    // 포커스를 확인 버튼으로 이동
    confirmBtnRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onCancel();
  };

  const confirmCls = danger
    ? "px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition-colors cursor-pointer"
    : "px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors cursor-pointer";

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={handleBackdrop}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={title ? "confirm-dialog-title" : undefined}
      aria-describedby="confirm-dialog-message"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden">
        {/* 헤더 */}
        {(title || danger) && (
          <div className="flex items-center gap-2 px-5 py-4 border-b border-zinc-200">
            {danger && <AlertTriangle size={18} className="text-rose-500 shrink-0" />}
            {title && (
              <span
                id="confirm-dialog-title"
                className="text-[15px] font-black text-zinc-800"
              >
                {title}
              </span>
            )}
          </div>
        )}

        {/* 메시지 본문 */}
        <div
          id="confirm-dialog-message"
          className="px-5 py-5 text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed"
        >
          {message}
        </div>

        {/* 버튼 영역 */}
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm font-semibold transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className={confirmCls}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
