// 2026-08-17 · UI 프레임워크 · 섹션 라벨 (dot + text)
//   · 사용자 제공 mockup 톤 · brand teal (#0E6B5C)
//   · 페이지 상단 · 카드 그룹 헤더 등
import type { ReactNode } from "react";

export type SectionLabelTone = "teal" | "amber" | "coral" | "sky" | "zinc";

// 2026-08-17 · Tailwind @theme brand 유틸리티 사용
const TONE_MAP: Record<SectionLabelTone, { text: string; dot: string }> = {
  teal:  { text: "text-brand",           dot: "bg-brand" },
  amber: { text: "text-brand-amber-ink", dot: "bg-brand-amber" },
  coral: { text: "text-brand-coral",     dot: "bg-brand-coral" },
  sky:   { text: "text-brand-sky",       dot: "bg-brand-sky" },
  zinc:  { text: "text-zinc-600",        dot: "bg-zinc-400" },
};

interface SectionLabelProps {
  children: ReactNode;
  tone?: SectionLabelTone;
  /** 우측 slot · action buttons 등 */
  right?: ReactNode;
  className?: string;
}

export function SectionLabel({ children, tone = "teal", right, className = "" }: SectionLabelProps) {
  const t = TONE_MAP[tone];
  return (
    <div className={`flex items-center gap-2.5 my-1 mb-3.5 ${className}`}>
      {/* 2026-08-17 · 최신 트렌드 · 좌측 accent bar (2×14) · 웰컴카드 톤 · brand color */}
      <span className={`w-[3px] h-[16px] rounded-full ${t.dot}`} />
      {/* +2 폰트 · uppercase 지양 · tracking tight · 최신 SaaS (Linear/Vercel) */}
      <span className={`text-[16px] font-bold tracking-tight ${t.text}`}>{children}</span>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}
