// 2026-08-17 · UI 프레임워크 · Hero banner
//   · 목업 톤 (docs/UI_MOCKUP_2026-08-17.html 참조)
//   · eyebrow + title + description + optional actions
//   · decorative blob 2개 · 반응형 · 모바일 stack
//   · 2026-08-17 · 사용자 지시 · 블루톤으로 변경 (teal → sky/navy)
import type { ReactNode } from "react";

interface HeroProps {
  /** 상단 작은 텍스트 (uppercase · 날짜/tag 등) */
  eyebrow?: ReactNode;
  /** 큰 제목 */
  title: ReactNode;
  /** 부제/설명 */
  description?: ReactNode;
  /** 우측 CTA 버튼들 */
  actions?: ReactNode;
  /** 우측 (선택) · 커스텀 slot · 아바타/일러스트 */
  aside?: ReactNode;
  className?: string;
}

export function Hero({ eyebrow, title, description, actions, aside, className = "" }: HeroProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-[20px] px-5 py-6 sm:px-7 sm:py-7 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-white ${className}`}
      // 2026-08-17 · 블루톤 (navy → mid blue → sky) · 목업 --sky (#3E7CB1) 계열 확장
      style={{ background: "linear-gradient(120deg, #0A2E4A 0%, #1E5C8E 62%, #3E7CB1 100%)" }}
    >
      {/* Decorative blobs */}
      <div className="absolute rounded-full w-[220px] h-[220px] -right-[60px] -top-[90px] pointer-events-none" style={{ background: "rgba(255,255,255,0.08)" }} />
      <div className="absolute rounded-full w-[140px] h-[140px] right-[120px] -bottom-[80px] pointer-events-none" style={{ background: "rgba(255,255,255,0.06)" }} />

      <div className="relative z-[1] min-w-0 flex-1">
        {eyebrow && (
          // 2026-08-17 · 블루톤 eyebrow · 밝은 sky
          <div className="text-[13px] font-bold uppercase tracking-[0.04em] mb-2" style={{ color: "#B9D6EA" }}>
            {eyebrow}
          </div>
        )}
        <h1 className="text-[22px] sm:text-[24px] font-extrabold tracking-[-0.4px] leading-tight m-0 mb-1.5">{title}</h1>
        {description && (
          // 2026-08-17 · 블루톤 description · 밝은 sky/white
          <p className="text-[14px] sm:text-[15px] m-0" style={{ color: "#DCE8F3" }}>{description}</p>
        )}
        {actions && (
          <div className="flex flex-wrap gap-2.5 mt-4">{actions}</div>
        )}
      </div>

      {aside && (
        <div className="relative z-[1] shrink-0">{aside}</div>
      )}
    </div>
  );
}

/** Hero 내부 CTA · pill button (solid 흰색) · 2026-08-17 · 블루톤 · 딥 네이비 텍스트 */
export function HeroButton({ onClick, icon, children, ghost }: { onClick?: () => void; icon?: ReactNode; children: ReactNode; ghost?: boolean }) {
  const base = "inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-bold cursor-pointer transition-transform active:scale-[0.98]";
  const styleSolid: React.CSSProperties = { background: "#fff", color: "#0A2E4A", boxShadow: "0 8px 18px -8px rgba(0,0,0,0.35)" };
  const styleGhost: React.CSSProperties = { background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.35)" };
  return (
    <button type="button" onClick={onClick} className={base} style={ghost ? styleGhost : styleSolid}>
      {icon}
      {children}
    </button>
  );
}
