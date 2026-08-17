// 2026-08-17 · UI 프레임워크 · 섹션 라벨 (dot + text)
//   · 사용자 제공 mockup 톤 · brand teal (#0E6B5C)
//   · 페이지 상단 · 카드 그룹 헤더 등
import type { ReactNode } from "react";

export type SectionLabelTone = "teal" | "amber" | "coral" | "sky" | "zinc";

const TONE_MAP: Record<SectionLabelTone, { text: string; dot: string }> = {
  teal:  { text: "text-[#0E6B5C]", dot: "bg-[#0E6B5C]" },
  amber: { text: "text-[#B4650F]", dot: "bg-[#E88A3D]" },
  coral: { text: "text-[#D9584F]", dot: "bg-[#D9584F]" },
  sky:   { text: "text-[#3E7CB1]", dot: "bg-[#3E7CB1]" },
  zinc:  { text: "text-zinc-600",  dot: "bg-zinc-400" },
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
    <div className={`flex items-center gap-2 my-1 mb-3 ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
      <span className={`text-[12.5px] font-bold tracking-tight ${t.text}`}>{children}</span>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}
