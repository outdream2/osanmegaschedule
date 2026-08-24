// src/components/common/SplitLeftHeader.tsx
// 2026-08-24 · #258 확장 · SplitPanel 좌측 상단 공용 헤더 프리미티브
//   · SplitListPanel · 리스트형 (이미 존재 · 6 소비처)
//   · SplitLeftHeader · 폼/트리/스캔 등 · 비-리스트형 좌측 패널 상단
//   · UI 대원칙 준수 · Linear/Vercel/Attio · 딥네이비 accent · 폰트 +2 기본
//
// 사용:
//   <SplitLeftHeader icon={<Clip size={15} />} title="사직서 조건 입력" />
//   <SplitLeftHeader icon={...} title="계약서" right={<Button>초기화</Button>} />
//
// 소비처 예정:
//   · ResignationWriterPage · ContractWriterPage
//   · PharmacistPage (트리 좌측) · 기타 form 좌측

import React from "react";
import { AccentBar } from "./AccentBar";

export interface SplitLeftHeaderProps {
  /** 아이콘 · lucide/phosphor 등 · title 앞 · brand-deep 톤 */
  icon?: React.ReactNode;
  /** 헤더 제목 · 필수 */
  title: React.ReactNode;
  /** 우측 슬롯 · 액션 버튼·배지·카운트 · flex end 배치 */
  right?: React.ReactNode;
  /** 서브 텍스트 · title 아래 · 선택 · 힌트·상태 */
  subtitle?: React.ReactNode;
  /** wrapper className · 추가 스타일 */
  className?: string;
  /** border-b 하단 구분선 · 기본 true · false 시 · 인접 카드 자체 border 이용 */
  withBorder?: boolean;
}

/**
 * SplitPanel 좌측 상단 공용 헤더
 *   · AccentBar (딥네이비 2px) + icon + title + 우측 액션
 *   · 폰트 +2 (2026-08-24) · title text-[19px] · subtitle text-[15px] · 40대+ 가독성
 *   · 시인성 · 제목 line-tight + tracking-tight · 아이콘 mt-1 align
 *   · border-b border-line (구분선) · pb-3
 *   · shrink-0 · 스크롤 시 위치 고정
 *   · 접근성 · role=heading · aria-level=2
 */
export function SplitLeftHeader({
  icon,
  title,
  right,
  subtitle,
  className = "",
  withBorder = true,
}: SplitLeftHeaderProps) {
  const borderCls = withBorder ? "pb-3 border-b border-line" : "";
  return (
    <div className={`flex items-start gap-2.5 shrink-0 ${borderCls} ${className}`}>
      <AccentBar h={19} className="mt-1" />
      {icon && (
        <span className="text-brand-deep shrink-0 mt-1" aria-hidden>{icon}</span>
      )}
      <div className="flex-1 min-w-0">
        <h2 className="text-[19px] font-bold tracking-tight text-ink leading-tight" role="heading" aria-level={2}>
          {title}
        </h2>
        {subtitle && (
          <div className="text-[15px] text-ink-soft mt-0.5 leading-snug">{subtitle}</div>
        )}
      </div>
      {right && (
        <div className="shrink-0 inline-flex items-center gap-1.5">{right}</div>
      )}
    </div>
  );
}

export default SplitLeftHeader;
