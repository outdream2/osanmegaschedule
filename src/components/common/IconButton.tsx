// 2026-08-17 · UI 프레임워크 · IconButton (surface bg + line border)
//   · 목업 톤 · docs/UI_MOCKUP_2026-08-17.html
//   · 36x36 rounded-10 · notification dot · header actions
import type { ReactNode } from "react";

interface IconButtonProps {
  onClick?: () => void;
  icon: ReactNode;
  /** 우측 상단 dot · notification 등 */
  showDot?: boolean;
  ariaLabel?: string;
  title?: string;
  className?: string;
}

export function IconButton({ onClick, icon, showDot, ariaLabel, title, className = "" }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      // 2026-08-17 v2 · Attio 세련 · inset light + hover brand shadow · 200ms all
      className={`relative w-9 h-9 rounded-[10px] bg-white border border-line hover:border-brand-deep shadow-[inset_0_1px_0_rgba(255,255,255,0.60),0_1px_2px_rgba(10,46,74,0.05)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.60),0_2px_4px_rgba(10,46,74,0.10),0_4px_12px_-4px_rgba(10,46,74,0.15)] flex items-center justify-center text-ink-soft hover:text-brand-deep transition-all duration-200 ease-out cursor-pointer ${className}`}
    >
      {icon}
      {showDot && (
        <span
          className="absolute top-1.5 right-1.5 w-[7px] h-[7px] rounded-full"
          style={{ background: "#D9584F", border: "1.5px solid #FFFFFF" }}
        />
      )}
    </button>
  );
}
