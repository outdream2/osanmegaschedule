// 2026-08-17 · UI 프레임워크 · IconButton (surface bg + line border)
//   · 목업 톤 · docs/UI_MOCKUP_2026-08-17.html
//   · 36x36 rounded-10 · notification dot · header actions
import type { ReactNode } from "react";

interface IconButtonProps {
  onClick?: () => void;
  icon: ReactNode;
  /** 우측 상단 dot · notification 등 */
  showDot?: boolean;
  /**
   * 접근성 라벨 · 아이콘만 있는 버튼은 반드시 지정 필수
   *   · 2026-09-01 · P3 a11y · 스크린 리더 지원 · title 없어도 ariaLabel 필수
   *   · 미지정 시 · 개발용 console.warn 표시
   */
  ariaLabel?: string;
  title?: string;
  className?: string;
}

export function IconButton({ onClick, icon, showDot, ariaLabel, title, className = "" }: IconButtonProps) {
  // 2026-09-01 · P3 a11y · dev 모드 · ariaLabel + title 둘 다 없으면 경고 (스크린 리더 미접근)
  if (import.meta.env.DEV && !ariaLabel && !title) {
    // eslint-disable-next-line no-console
    console.warn("[IconButton] ariaLabel 또는 title 필수 · 아이콘 전용 버튼은 접근성 라벨 없이 렌더 금지");
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? title}
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
