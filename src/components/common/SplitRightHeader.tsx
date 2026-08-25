// src/components/common/SplitRightHeader.tsx
// 2026-08-25 · #261 · SplitPanel 우측 상단 공용 헤더 프리미티브
//   · SplitLeftHeader 와 대칭 · 상세 패널 상단 헤더
//   · v9 시그니처 · 상단 2px gradient accent (brand-deep → sky-500 → brand-deep · opacity 90)
//   · 폰트 +2 · title text-[19px] · subtitle text-[15px] · 40대+ 가독성
//   · Attio "Calm Density" · Linear/Vercel 톤
//
// 사용:
//   <SplitRightHeader icon={<User />} title="김민서" subtitle="약사 · 정규직" />
//   <SplitRightHeader title="공급사 상세" right={<Button>편집</Button>} />
//
// 소비처 예정:
//   · StaffDetailPanel · VendorDetailModal · ProductDetailPanel · PaymentInfoTab 우측
//   · SplitPanel 우측 컨텐츠 상단 · 일관된 v9 헤더 톤

import React from "react";

export interface SplitRightHeaderProps {
  /** 아이콘 · lucide/phosphor 등 · title 앞 · brand-deep 톤 */
  icon?: React.ReactNode;
  /** 헤더 제목 · 필수 · JSX 허용 (아바타·배지 병기 등) */
  title: React.ReactNode;
  /** 우측 슬롯 · 액션 버튼·배지·카운트 · flex end 배치 */
  right?: React.ReactNode;
  /** 서브 텍스트 · title 아래 · 선택 · 메타·상태 */
  subtitle?: React.ReactNode;
  /** wrapper className · 추가 스타일 */
  className?: string;
  /** 상단 gradient accent · v9 시그니처 · 기본 true · false 시 · 심플 헤더 */
  topAccent?: boolean;
  /** border-b 하단 구분선 · 기본 true · false 시 · 인접 카드 자체 border 이용 */
  withBorder?: boolean;
  /** 배경 override · 기본 bg-white · sticky 시 backdrop-blur 필요하면 커스텀 */
  bg?: string;
  /** sticky top-0 · 기본 false · true 시 · relative positioning 자동 */
  sticky?: boolean;
}

/**
 * SplitPanel 우측 상단 공용 헤더 · v9 시그니처
 *   · 상단 2px gradient accent (topAccent=true 시)
 *   · icon (brand-deep) + title + 우측 액션
 *   · 폰트 +2 · title text-[19px] · subtitle text-[15px]
 *   · shrink-0 · 스크롤 시 위치 고정
 *   · sticky 옵션 · top-0 z-30 + 배경 자동
 *   · 접근성 · role=heading · aria-level=2
 */
export function SplitRightHeader({
  icon,
  title,
  right,
  subtitle,
  className = "",
  topAccent = true,
  withBorder = true,
  bg = "bg-white",
  sticky = false,
}: SplitRightHeaderProps) {
  const borderCls = withBorder ? "border-b border-line" : "";
  const stickyCls = sticky ? "sticky top-0 z-30" : "";
  return (
    <div className={`relative shrink-0 ${stickyCls} ${bg} ${borderCls} px-5 py-3 ${className}`.trim()}>
      {/* v9 · 상단 2px gradient accent */}
      {topAccent && (
        <span
          aria-hidden
          className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep opacity-90 z-10 pointer-events-none"
        />
      )}
      <div className="flex items-center gap-3">
        {icon && (
          <span className="text-brand-deep shrink-0 inline-flex items-center" aria-hidden>{icon}</span>
        )}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <h2 className="text-[19px] font-bold tracking-tight text-ink leading-tight break-words" role="heading" aria-level={2}>
            {title}
          </h2>
          {subtitle && (
            <div className="text-[15px] text-ink-soft leading-snug break-words">{subtitle}</div>
          )}
        </div>
        {right && (
          <div className="shrink-0 inline-flex items-center gap-1.5">{right}</div>
        )}
      </div>
    </div>
  );
}

export default SplitRightHeader;
