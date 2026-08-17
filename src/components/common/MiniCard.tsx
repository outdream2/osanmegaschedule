// 2026-08-17 · UI 프레임워크 · Mini card (inline icon + title/desc)
//   · 목업 톤 · docs/UI_MOCKUP_2026-08-17.html
//   · icon 32x32 rounded-9 + title 13 + desc 11 · 세로 · flex-row
//   · Landing 직원용 · 간결한 액션 카드
import type { ElementType } from "react";

export type MiniCardColor = "teal" | "amber" | "coral" | "sky" | "zinc";

// 2026-08-17 · Tailwind @theme brand 유틸리티
const TONE_MAP: Record<MiniCardColor, { bg: string; color: string }> = {
  teal:  { bg: "bg-brand-tint",       color: "text-brand" },
  amber: { bg: "bg-brand-amber-tint", color: "text-brand-amber-ink" },
  coral: { bg: "bg-brand-coral-tint", color: "text-brand-coral" },
  sky:   { bg: "bg-brand-sky-tint",   color: "text-brand-sky" },
  zinc:  { bg: "bg-zinc-100",         color: "text-zinc-600" },
};

interface MiniCardProps {
  color: MiniCardColor;
  icon: ElementType;
  title: string;
  description: string;
  onClick: () => void;
  orderClass?: string;
}

export function MiniCard({ color, icon: Icon, title, description, onClick, orderClass }: MiniCardProps) {
  const c = TONE_MAP[color];
  return (
    // 2026-08-17 v2 · Attio 세련 · inset light + 2-layer shadow + hover lift
    <button
      type="button"
      onClick={onClick}
      className={`${orderClass ?? ""} bg-white border border-line hover:border-brand-deep rounded-[14px] px-4 py-3.5 flex items-center gap-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.60),0_1px_2px_rgba(10,46,74,0.05),0_2px_8px_-2px_rgba(10,46,74,0.06)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.60),0_2px_4px_rgba(10,46,74,0.08),0_8px_20px_-4px_rgba(10,46,74,0.14)] hover:-translate-y-0.5 transition-all duration-200 ease-out cursor-pointer text-left`}
    >
      <div className={`w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 ${c.bg}`}>
        <Icon size={14} className={c.color} weight="fill" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold text-ink leading-tight truncate tracking-tight">{title}</div>
        <div className="text-[13px] text-ink-soft mt-0.5 truncate">{description}</div>
      </div>
    </button>
  );
}
