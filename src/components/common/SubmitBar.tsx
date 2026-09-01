// src/components/common/SubmitBar.tsx
// 2026-09-01 · 공용 프리미티브 · 폼 하단 · 저장·취소 액션 바
//   · sticky bottom · 모든 form/modal footer 반복 패턴 통합
//   · primary (저장·확인) + secondary (취소) 2버튼 · 선택 hint 좌측
//   · loading state · disabled state · 프레임워크 Spinner 통합
//
// 사용 예:
//   <SubmitBar onSubmit={save} onCancel={close} submitting={saving}
//              submitLabel="저장" cancelLabel="취소" hint="변경 시 자동 저장" />
//
//   <SubmitBar sticky={false} disabled={!isValid}>
//     {/* 커스텀 자식 · 우측 액션 override */}
//     <button ...>고급</button>
//   </SubmitBar>

import React from "react";
import { Save, X } from "lucide-react";
import { Spinner } from "./Spinner";

export interface SubmitBarProps {
  /** 저장 핸들러 · submit 버튼 클릭 */
  onSubmit?: () => void;
  /** 취소 핸들러 · cancel 버튼 클릭 · 없으면 취소 버튼 숨김 */
  onCancel?: () => void;
  /** 저장 라벨 · default "저장" */
  submitLabel?: string;
  /** 취소 라벨 · default "취소" */
  cancelLabel?: string;
  /** 저장 중 · submit 버튼 · spinner + disabled */
  submitting?: boolean;
  /** submit 비활성화 (검증 실패 등) */
  disabled?: boolean;
  /** 좌측 · 힌트 텍스트 (예: "변경 시 자동 저장") */
  hint?: string;
  /** sticky bottom · default true · false 면 relative */
  sticky?: boolean;
  /** submit 버튼 tone · default brand · rose (delete) · emerald (approve) */
  submitTone?: "brand" | "rose" | "emerald";
  /** 자식 · 우측 커스텀 액션 override · 지정 시 · 기본 버튼 대신 렌더 */
  children?: React.ReactNode;
  className?: string;
}

const SUBMIT_TONE: Record<NonNullable<SubmitBarProps["submitTone"]>, string> = {
  brand: "bg-brand-deep hover:bg-[#0d3a5c] text-white",
  rose: "bg-rose-600 hover:bg-rose-700 text-white",
  emerald: "bg-emerald-600 hover:bg-emerald-700 text-white",
};

export const SubmitBar: React.FC<SubmitBarProps> = ({
  onSubmit,
  onCancel,
  submitLabel = "저장",
  cancelLabel = "취소",
  submitting = false,
  disabled = false,
  hint,
  sticky = true,
  submitTone = "brand",
  children,
  className = "",
}) => {
  const submitCls = SUBMIT_TONE[submitTone];
  const posCls = sticky
    ? "sticky bottom-0 z-10 shadow-[0_-1px_3px_rgba(10,46,74,0.04),0_-4px_16px_-4px_rgba(10,46,74,0.06)]"
    : "";
  return (
    <div
      className={`${posCls} bg-white/95 backdrop-blur-sm border-t border-line px-4 py-3 flex items-center gap-2 ${className}`}
    >
      {hint && (
        <span className="text-[13px] font-medium text-ink-soft min-w-0 truncate">
          {hint}
        </span>
      )}
      <div className="ml-auto flex items-center gap-2 shrink-0">
        {children ?? (
          <>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-line text-[14px] font-bold text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 disabled:opacity-50 cursor-pointer transition"
              >
                <X size={13} />
                {cancelLabel}
              </button>
            )}
            {onSubmit && (
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting || disabled}
                className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-[14px] font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition ${submitCls}`}
              >
                {submitting ? <Spinner size={13} tone="zinc" /> : <Save size={13} />}
                {submitting ? "저장중..." : submitLabel}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SubmitBar;
