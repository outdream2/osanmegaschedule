// src/components/common/ProductClassFilter.tsx
// 상비약 / 일반약 / 전체 3-way segmented control · 공용 컴포넌트
// 2026-08-03 · 통계 메뉴 4탭 (Trending/Category/Flow/Diff) 에서 사용
//
// 활성 색상: 전체=slate · 상비약=violet · 일반약=sky (요구사항)
// 반응형: 모바일에서는 아이콘만 표시 옵션 지원

import React from "react";
import { Pill, Stethoscope, Layers } from "lucide-react";
import { CLASS_FILTER_LABEL, getClassFilterRange, type ClassFilter } from "../../utils/productClassify";

interface Props {
  value: ClassFilter;
  onChange: (v: ClassFilter) => void;
  className?: string;
  /** 라벨 프리픽스 표시 (기본: "구분") · 빈 문자열이면 숨김 */
  label?: string;
  /** true 면 모바일에서 텍스트 숨기고 아이콘만 (기본 false) */
  compactOnMobile?: boolean;
  /** 각 항목별 상품 수 (선택) · 표시하면 뱃지로 옆에 붙음 */
  counts?: Partial<Record<ClassFilter, number>>;
}

// 2026-08-17 v2 · 활성 pill · inset light + 카테고리 semantic tone shadow (Attio)
const OPTIONS: Array<{
  key: ClassFilter;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  activeCls: string;
}> = [
  { key: "all", icon: Layers, activeCls: "bg-white text-brand-deep border-line shadow-[inset_0_1px_0_rgba(255,255,255,0.60),0_1px_2px_rgba(10,46,74,0.06),0_2px_6px_-2px_rgba(10,46,74,0.10)]" },
  { key: "stationery", icon: Pill, activeCls: "bg-white text-violet-700 border-violet-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.60),0_1px_2px_rgba(139,92,246,0.10),0_2px_6px_-2px_rgba(139,92,246,0.18)]" },
  { key: "general", icon: Stethoscope, activeCls: "bg-white text-sky-700 border-sky-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.60),0_1px_2px_rgba(14,165,233,0.10),0_2px_6px_-2px_rgba(14,165,233,0.18)]" },
];

export const ProductClassFilter: React.FC<Props> = ({
  value,
  onChange,
  className = "",
  label = "구분",
  compactOnMobile = false,
  counts,
}) => {
  return (
    <div className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
      {label && (
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider shrink-0">{label}</span>
      )}
      <div className="inline-flex bg-zinc-100 border border-line rounded-lg p-1" role="group" aria-label="상품 구분 필터">
        {OPTIONS.map(opt => {
          const active = value === opt.key;
          const Icon = opt.icon;
          const cnt = counts?.[opt.key];
          const labelText = CLASS_FILTER_LABEL[opt.key];
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange(opt.key)}
              className={`h-8 px-2.5 text-[13px] font-semibold rounded-md transition-all duration-200 ease-out cursor-pointer inline-flex items-center gap-1 border ${
                active ? opt.activeCls : "border-transparent text-ink-soft hover:text-brand-deep hover:bg-white"
              }`}
              title={labelText}
              aria-pressed={active}
            >
              <Icon size={12} className="shrink-0" />
              <span className={compactOnMobile ? "hidden sm:inline" : ""}>
                {labelText}
                {getClassFilterRange(opt.key) && (
                  <span className="text-[9px] font-normal text-zinc-400 ml-0.5 tabular-nums">
                    {getClassFilterRange(opt.key)}
                  </span>
                )}
              </span>
              {typeof cnt === "number" && (
                <span className="text-[10px] font-bold text-zinc-400 tabular-nums">{cnt}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ProductClassFilter;
