// 2026-08-17 · UI 프레임워크 · 공용 Button (최신 트렌드 · Linear/Vercel/Notion 톤)
//   · 사용자 지시 · "프레임워크 공통 버튼 · 최신 트렌드 · 예쁘고 세련되고 멋지고 깔끔하고 고급스럽게"
//   · 리서치 · research-strategist 2026 SaaS · rounded-lg · font-medium · flat · subtle hover
//   · 4 variant · primary (brand deep solid) · secondary (line) · ghost (transparent) · danger (red)
//   · 3 size · sm (h-8 · 13px) · md (h-10 · 14px) · lg (h-11 · 16px)
//   · icon slot 좌측 · 우측 자동 · loading spinner
import type { ReactNode, ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "prefix"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 좌측 아이콘 */
  icon?: ReactNode;
  /** 우측 아이콘 (chevron 등) */
  suffix?: ReactNode;
  /** true 시 spinner · 클릭 disable */
  loading?: boolean;
  /** 전체 폭 채우기 */
  fullWidth?: boolean;
  children?: ReactNode;
}

// 2026-08-17 · latest SaaS trend
//   · primary · deep navy brand · 흰 텍스트
//   · secondary · white bg · border-line · ink text · brand hover
//   · ghost · transparent · ink text · hover bg-neutral
//   · danger · red-600 solid
const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-deep text-white shadow-sm hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:opacity-40 disabled:cursor-not-allowed border border-brand-deep",
  secondary:
    "bg-white text-ink border border-line hover:border-brand-deep hover:text-brand-deep active:bg-[#F4F7FA] disabled:opacity-40 disabled:cursor-not-allowed shadow-sm",
  ghost:
    "bg-transparent text-ink-soft hover:bg-[#F4F7FA] hover:text-ink active:bg-[#E4EAF0] disabled:opacity-40 disabled:cursor-not-allowed border border-transparent",
  danger:
    "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed border border-red-600",
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-[15px] gap-2 rounded-lg",
  lg: "h-11 px-5 text-[16px] gap-2 rounded-[10px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", icon, suffix, loading, fullWidth, disabled, className = "", children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={[
        "inline-flex items-center justify-center font-semibold tracking-tight",
        "transition-colors duration-150 cursor-pointer select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-brand",
        "whitespace-nowrap",
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        fullWidth ? "w-full" : "",
        className,
      ].filter(Boolean).join(" ")}
      {...rest}
    >
      {loading
        ? <Loader2 size={size === "sm" ? 14 : 16} className="animate-spin shrink-0" />
        : icon
          ? <span className="shrink-0 inline-flex">{icon}</span>
          : null}
      {children && <span>{children}</span>}
      {suffix && <span className="shrink-0 inline-flex">{suffix}</span>}
    </button>
  );
});

export default Button;
