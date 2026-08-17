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

// 2026-08-17 v2 · latest SaaS trend · Attio/Linear 세련
//   · primary · deep navy · 흰 텍스트 · inset light (top) + brand glow shadow
//   · secondary · white bg · border-line · brand hover · subtle inset
//   · ghost · transparent · hover neutral
//   · danger · rose-600 · inset light + rose glow
const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-deep text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_1px_2px_rgba(10,46,74,0.15),0_4px_12px_-4px_rgba(10,46,74,0.35)] hover:bg-[#0d3a5c] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_2px_4px_rgba(10,46,74,0.20),0_8px_20px_-6px_rgba(10,46,74,0.40)] active:bg-[#08253a] disabled:opacity-40 disabled:cursor-not-allowed border border-brand-deep",
  secondary:
    "bg-white text-ink border border-line shadow-[inset_0_1px_0_rgba(255,255,255,0.60),0_1px_2px_rgba(10,46,74,0.05)] hover:border-brand-deep hover:text-brand-deep hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.60),0_1px_3px_rgba(10,46,74,0.10),0_4px_10px_-4px_rgba(10,46,74,0.15)] active:bg-[#F4F7FA] disabled:opacity-40 disabled:cursor-not-allowed",
  ghost:
    "bg-transparent text-ink-soft hover:bg-[#F4F7FA] hover:text-ink active:bg-[#E4EAF0] disabled:opacity-40 disabled:cursor-not-allowed border border-transparent",
  danger:
    "bg-rose-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_1px_2px_rgba(190,18,60,0.15),0_4px_12px_-4px_rgba(190,18,60,0.40)] hover:bg-rose-700 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_2px_4px_rgba(190,18,60,0.20),0_8px_20px_-6px_rgba(190,18,60,0.45)] active:bg-rose-800 disabled:opacity-40 disabled:cursor-not-allowed border border-rose-600",
};

// 2026-08-17 · 사용자 지시 · 버튼 글씨 +2 (13→15 · 15→17 · 16→18)
const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[15px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-[17px] gap-2 rounded-lg",
  lg: "h-11 px-5 text-[18px] gap-2 rounded-[10px]",
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
        // 2026-08-17 v2 · 200ms ease-out (모든 인터랙션 통일) · shadow/bg 부드러운 전환
        "transition-all duration-200 ease-out cursor-pointer select-none",
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
