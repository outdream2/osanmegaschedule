// src/components/common/AccentBar.tsx
// 2026-08-18 · 공용 프레임워크 · 좌측 accent bar
//   · brand-deep 세로 3px bar · 78곳 반복 사용 통합
//   · size preset (sm/md/lg/xl/hero) · 또는 숫자 height (14~40)
//   · tone (brand/brand-soft/hero-gradient)
//   · className 통과 (shrink-0 · mt-0.5 등)
//
// 사용 예:
//   <AccentBar />                                // 기본 · md(16) · brand
//   <AccentBar size="sm" />                      // 14
//   <AccentBar size="xl" className="shrink-0" /> // 24 + shrink
//   <AccentBar size="hero" />                    // 40 gradient (Hero 카드)
//   <AccentBar tone="brand-soft" />              // brand-deep/70
//   <AccentBar h={17} />                         // 픽셀 커스텀 (preset 밖 값)

export type AccentBarSize = "sm" | "md" | "lg" | "xl" | "hero";
export type AccentBarTone = "brand" | "brand-soft";

export interface AccentBarProps {
  /** 사이즈 · sm(14) · md(16) · lg(18) · xl(24) · hero(40 · gradient) · 기본 md */
  size?: AccentBarSize;
  /** 픽셀 커스텀 height · preset 밖 값 (15/17/20/22 등) · size 우선 무시 */
  h?: number;
  /** 톤 · brand (brand-deep) · brand-soft (brand-deep/70) · hero 자동 gradient · 기본 brand */
  tone?: AccentBarTone;
  /** 추가 className · shrink-0 · mt-0.5 등 */
  className?: string;
}

const SIZE_H_CLS: Record<AccentBarSize, string> = {
  sm:   "h-[14px]",
  md:   "h-[16px]",
  lg:   "h-[18px]",
  xl:   "h-[24px]",
  hero: "h-[40px]",
};

const TONE_BG_CLS: Record<AccentBarTone, string> = {
  brand:      "bg-brand-deep",
  "brand-soft": "bg-brand-deep/70",
};

/**
 * 좌측 accent bar · brand identity · 반복 사용 프레임워크화
 *   · Modal / CategoryChips / PageToolbar / SectionLabel 등 다수 헤더에서 사용
 *   · hero 는 그라디언트 자동 적용 (Landing/HR/Pharmacist Hero 카드)
 *   · h prop · Tailwind 정적 클래스 밖 픽셀 값은 inline style 로 처리
 */
export function AccentBar({
  size = "md",
  h,
  tone = "brand",
  className = "",
}: AccentBarProps) {
  const useCustomH = typeof h === "number";
  const heightCls = useCustomH ? "" : SIZE_H_CLS[size];
  const bgCls = size === "hero"
    ? "bg-gradient-to-b from-brand-deep to-[#1E5C8E]"
    : TONE_BG_CLS[tone];
  const style = useCustomH ? { height: `${h}px` } : undefined;
  return (
    <span
      className={`w-[3px] ${heightCls} rounded-full ${bgCls} ${className}`.trim()}
      style={style}
    />
  );
}

export default AccentBar;
