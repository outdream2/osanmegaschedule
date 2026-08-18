// src/components/common/StepperInput.tsx
// 2026-08-18 · 공용 프레임워크 · 수량 스테퍼 (− input +)
//   · Linear/Fluent2 톤 · brand-deep focus glow · rounded-xl border-2
//   · ScanPage/ProductArrival/입고 등 반복 사용 통합
//
// 사용 예:
//   <StepperInput value={qty} onChange={setQty} />
//   <StepperInput value={qty} onChange={setQty} min={0} size="lg" />
//   <StepperInput value={qty} onChange={setQty} disabled placeholder="0" />

import React from "react";
import { Minus, Plus } from "lucide-react";

export interface StepperInputProps {
  /** 값 · 빈 문자열 허용 (미입력 표시) */
  value: number | "";
  /** 값 변경 콜백 */
  onChange: (v: number | "") => void;
  /** 최소값 · 기본 0 · 이 이하로 감소 불가 */
  min?: number;
  /** 최대값 · 기본 없음 */
  max?: number;
  /** 사이즈 · md(h-10 · 기본) · lg(h-11) · sm(h-9) */
  size?: "sm" | "md" | "lg";
  /** placeholder · 기본 "0" */
  placeholder?: string;
  /** disabled */
  disabled?: boolean;
  /** 추가 className */
  className?: string;
  /** 감소 버튼 aria-label · 기본 "감소" */
  decLabel?: string;
  /** 증가 버튼 aria-label · 기본 "증가" */
  incLabel?: string;
}

const SIZE_H_CLS: Record<NonNullable<StepperInputProps["size"]>, string> = {
  sm: "h-9",
  md: "h-10",
  lg: "h-11",
};

const SIZE_BTN_W: Record<NonNullable<StepperInputProps["size"]>, string> = {
  sm: "w-8",
  md: "w-9",
  lg: "w-10",
};

const SIZE_INPUT_TEXT: Record<NonNullable<StepperInputProps["size"]>, string> = {
  sm: "text-[15px]",
  md: "text-[16px]",
  lg: "text-[17px]",
};

/**
 * 공용 수량 스테퍼 · 2026 톤
 *   · − 버튼 (hover rose) · input (tabular) · + 버튼 (hover emerald)
 *   · focus-within: brand-deep border + 3px glow
 *   · disabled: opacity + cursor
 */
export const StepperInput: React.FC<StepperInputProps> = ({
  value,
  onChange,
  min = 0,
  max,
  size = "md",
  placeholder = "0",
  disabled = false,
  className = "",
  decLabel = "감소",
  incLabel = "증가",
}) => {
  const cur = value === "" ? min : Number(value) || min;
  const canDec = !disabled && cur > min;
  const canInc = !disabled && (max === undefined || cur < max);

  const dec = () => {
    if (!canDec) return;
    const n = Math.max(min, cur - 1);
    onChange(n === min && value === "" ? "" : n);
  };
  const inc = () => {
    if (!canInc) return;
    onChange(cur + 1);
  };

  const heightCls = SIZE_H_CLS[size];
  const btnWCls = SIZE_BTN_W[size];
  const inputTextCls = SIZE_INPUT_TEXT[size];

  return (
    <div
      className={[
        "inline-flex items-stretch w-full",
        heightCls,
        "bg-white border-2 border-line rounded-xl overflow-hidden transition-all duration-150",
        "focus-within:border-brand-deep",
        "focus-within:shadow-[0_0_0_3px_rgba(10,46,74,0.10)]",
        disabled ? "opacity-50 cursor-not-allowed" : "",
        className,
      ].filter(Boolean).join(" ")}
    >
      <button
        type="button"
        onClick={dec}
        disabled={!canDec}
        tabIndex={-1}
        className={[
          btnWCls,
          "shrink-0 flex items-center justify-center border-r border-line transition-colors",
          "text-zinc-400 hover:text-rose-600 hover:bg-rose-50/60",
          "active:bg-rose-100/50 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-zinc-400",
          "cursor-pointer",
        ].join(" ")}
        aria-label={decLabel}
      >
        <Minus size={14} strokeWidth={3} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        placeholder={placeholder}
        className={[
          "flex-1 min-w-0 h-full text-center px-0.5 bg-transparent border-0",
          inputTextCls,
          "font-bold tabular-nums text-ink",
          "focus:outline-none disabled:text-zinc-300 placeholder:text-zinc-300",
        ].join(" ")}
      />
      <button
        type="button"
        onClick={inc}
        disabled={!canInc}
        tabIndex={-1}
        className={[
          btnWCls,
          "shrink-0 flex items-center justify-center border-l border-line transition-colors",
          "text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50/60",
          "active:bg-emerald-100/50 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-zinc-400",
          "cursor-pointer",
        ].join(" ")}
        aria-label={incLabel}
      >
        <Plus size={14} strokeWidth={3} />
      </button>
    </div>
  );
};

export default StepperInput;
