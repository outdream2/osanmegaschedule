// src/components/common/CollapseCard.tsx
// 2026-08-17 · 공용 프레임워크 · 접기/펼치기 카드
//   · 헤더: status dot (열림 brand-deep · 닫힘 zinc-300) + chevron + icon + 제목 + right slot
//   · 세련 · Attio 톤 · rounded-2xl + 이중 shadow (navy tint)
//   · 사용처: ProductDetailPanel (재고·매입판매가) · 상세 카드 어디든
//
// 사용 예 (제어형 · defaultOpen 없이):
//   const [open, setOpen] = useState(true);
//   <CollapseCard
//     title="재고 · 매입판매가"
//     icon={<Package size={17} />}
//     open={open}
//     onOpenChange={setOpen}
//   >
//     ...content...
//   </CollapseCard>
//
// 사용 예 (비제어형 · defaultOpen):
//   <CollapseCard title="상품 정보" icon={<Info size={17} />} defaultOpen>
//     ...content...
//   </CollapseCard>

import React, { useState, useCallback, useMemo } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";

export interface CollapseCardProps {
  /** 헤더 제목 */
  title: React.ReactNode;
  /** 헤더 좌측 아이콘 (이미 렌더된 element) · 미지정 시 아이콘 없음 */
  icon?: React.ReactNode;
  /** 헤더 우측 slot (배지·액션 등) · onClick 없는 UI 만 · 큰 액션 X (헤더 클릭 시 접힘) */
  right?: React.ReactNode;
  /** 접힘 상태 (외부 제어) · 미지정 시 내부 state · defaultOpen 사용 */
  open?: boolean;
  /** 접힘 상태 변경 (외부 제어 시) */
  onOpenChange?: (open: boolean) => void;
  /** 초기 상태 (비제어) · 기본 true */
  defaultOpen?: boolean;
  /** 카드 shadow depth · sm (기본 · 내부 카드용) · md (외부 카드용) */
  depth?: "sm" | "md";
  /** 카드 padding · none (직접 padding 관리) · md (기본 · 콘텐츠에 p-4) · lg (p-5) */
  contentPadding?: "none" | "md" | "lg";
  className?: string;
  children: React.ReactNode;
}

/**
 * 접기 카드 · 세련 · brand-deep status dot
 *   · 헤더 클릭 시 · 열림/닫힘 토글
 *   · right slot · 헤더 우측 · 이벤트 전파 stop 필요 시 wrapper 에서 처리
 */
export const CollapseCard: React.FC<CollapseCardProps> = ({
  title,
  icon,
  right,
  open: openProp,
  onOpenChange,
  defaultOpen = true,
  depth = "sm",
  contentPadding = "md",
  className = "",
  children,
}) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;

  const toggle = useCallback(() => {
    if (isControlled) onOpenChange?.(!open);
    else setInternalOpen(v => !v);
  }, [isControlled, onOpenChange, open]);

  // 2026-08-17 v2 · Attio 세련 · inset light + 2-layer (기존 shadow 유지 + inset 추가)
  const shadowCls = depth === "md"
    ? "shadow-[inset_0_1px_0_rgba(255,255,255,0.60),0_1px_2px_rgba(10,46,74,0.06),0_4px_16px_-4px_rgba(10,46,74,0.10)]"
    : "shadow-[inset_0_1px_0_rgba(255,255,255,0.60),0_1px_2px_rgba(10,46,74,0.05),0_2px_8px_-2px_rgba(10,46,74,0.06)]";

  const paddingCls = useMemo(() => {
    if (contentPadding === "none") return "";
    if (contentPadding === "lg") return "p-5";
    return "p-4";
  }, [contentPadding]);

  return (
    <div className={`bg-white rounded-2xl border border-line ${shadowCls} overflow-hidden ${className}`}>
      {/* 헤더 · 클릭 → 토글 */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-4 min-h-[44px] py-2.5 hover:bg-zinc-50 transition-colors cursor-pointer border-b border-line text-left"
      >
        {/* status dot · Vercel 규칙 · 열림 brand-deep · 닫힘 zinc-300 */}
        <span
          className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
            open ? "bg-brand-deep" : "bg-zinc-300"
          }`}
        />
        {open
          ? <ChevronDown size={17} className="text-brand-deep shrink-0" strokeWidth={2.2} />
          : <ChevronRight size={17} className="text-ink-soft shrink-0" strokeWidth={2.2} />}
        {icon && <span className="text-ink-soft shrink-0 inline-flex">{icon}</span>}
        <span className="text-[16px] font-bold text-ink tracking-tight break-keep whitespace-normal leading-tight flex-1 min-w-0">
          {title}
        </span>
        {!open && (
          <span className="text-[13px] font-medium text-ink-soft shrink-0">— 펼치기</span>
        )}
        {right && (
          <div onClick={(e) => e.stopPropagation()} className="shrink-0 ml-2">
            {right}
          </div>
        )}
      </button>

      {/* 컨텐츠 · 열림 시에만 렌더 (성능) */}
      {open && (
        <div className={paddingCls}>
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapseCard;
