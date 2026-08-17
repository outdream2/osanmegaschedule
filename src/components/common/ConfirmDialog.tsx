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

  // 2026-08-17 · 최신 트렌드 · 폰트 +2 · rounded-lg 통일 · brand-deep primary · danger rose 유지 (semantic)
  const confirmCls = danger
    ? "h-10 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-[15px] font-semibold transition-colors cursor-pointer shadow-sm"
    : "h-10 px-4 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[15px] font-semibold transition-colors cursor-pointer shadow-sm";

  return (
    <div
      // 2026-08-17 v2 · frosted backdrop · 딥네이비 tint + blur (Modal 통일)
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(10, 46, 74, 0.35)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={handleBackdrop}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={title ? "confirm-dialog-title" : undefined}
      aria-describedby="confirm-dialog-message"
    >
      {/* 2026-08-17 v2 · 3-layer shadow · Attio/Linear 세련 */}
      <div
        className="bg-white rounded-2xl w-full max-w-md flex flex-col overflow-hidden border border-line"
        style={{ boxShadow: "0 1px 3px rgba(10,46,74,0.12), 0 8px 32px -8px rgba(10,46,74,0.24), 0 24px 64px -24px rgba(10,46,74,0.28)" }}
      >
        {/* 헤더 · 2026-08-17 · 최신 트렌드 · 좌측 accent bar (danger=rose · 일반=brand-deep) · 폰트 +2 */}
        {(title || danger) && (
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-line bg-zinc-50/60">
            <span className={`w-[3px] h-[17px] rounded-full ${danger ? "bg-rose-500" : "bg-brand-deep"}`} />
            {danger && <AlertTriangle size={18} className="text-rose-500 shrink-0" />}
            {title && (
              <span
                id="confirm-dialog-title"
                className="text-[17px] font-bold text-ink tracking-tight"
              >
                {title}
              </span>
            )}
          </div>
        )}

        {/* 메시지 본문 · 폰트 +2 · 색 통일 */}
        <div
          id="confirm-dialog-message"
          className="px-5 py-5 text-[15px] text-ink whitespace-pre-wrap leading-relaxed"
        >
          {message}
        </div>

        {/* 버튼 · 최신 트렌드 · h-10 · rounded-lg · 폰트 +2 */}
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-4 rounded-lg bg-white border border-line hover:border-ink-soft text-ink-soft hover:text-ink text-[15px] font-semibold transition-colors cursor-pointer"
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
