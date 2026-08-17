// src/components/common/Toolbar.tsx
// T-CSS Phase 1 · 2026-08-05
// 공통 툴바 컨테이너
//   - 좌측 · 우측 슬롯 + 중앙 검색창 옵션
//   - 기존 FilterBar(card-panel 스타일)와 다름 · 툴바는 높이 고정 컴팩트형
//   - Phase 2 에서 ListToolbar 대체 예정
//
// 사용 예:
//   <Toolbar
//     left={<span>공급사 목록</span>}
//     right={<button>+ 추가</button>}
//     search={{ value: q, onChange: setQ, placeholder: "상품·코드 검색" }}
//   />
//   <Toolbar left={<FilterChips />} right={<ExportBtn />} />

import React, { useRef } from "react";
import { Search, X } from "lucide-react";

export interface ToolbarSearchProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** 포커스 링 accent 색상 프리셋 · 기본 indigo */
  accent?: "indigo" | "rose" | "sky" | "emerald" | "amber";
  /** 폭 Tailwind class · 기본 w-52 */
  widthClass?: string;
}

export interface ToolbarProps {
  /** 좌측 슬롯 */
  left?: React.ReactNode;
  /** 우측 슬롯 */
  right?: React.ReactNode;
  /** 중앙 검색 창 · 지정 시 left/right 사이에 flex-grow 영역으로 삽입 */
  search?: ToolbarSearchProps;
  /** 추가 className */
  className?: string;
}

const ACCENT_RING: Record<NonNullable<ToolbarSearchProps["accent"]>, string> = {
  indigo:  "focus:ring-brand-tint/60 focus:border-brand-deep",
  rose:    "focus:ring-rose-400/60   focus:border-rose-400",
  sky:     "focus:ring-brand-tint/60    focus:border-brand-deep",
  emerald: "focus:ring-brand-tint/60 focus:border-brand-deep",
  amber:   "focus:ring-amber-400/60  focus:border-amber-400",
};

const ToolbarSearch: React.FC<ToolbarSearchProps> = ({
  value,
  onChange,
  placeholder = "검색",
  accent = "indigo",
  widthClass = "w-52",
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasQuery = value.trim().length > 0;

  return (
    <div className={`relative flex items-center ${widthClass}`}>
      <Search
        size={12}
        className="absolute left-2.5 text-zinc-400 pointer-events-none shrink-0"
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === "Escape" && onChange("")}
        placeholder={placeholder}
        className={[
          "w-full bg-white border border-zinc-200 rounded-lg",
          "pl-7 pr-7 h-7 text-[11px] text-zinc-800",
          "focus:outline-none focus:ring-2 transition",
          ACCENT_RING[accent],
        ].join(" ")}
        aria-label={placeholder}
      />
      {hasQuery && (
        <button
          type="button"
          onClick={() => { onChange(""); inputRef.current?.focus(); }}
          className="absolute right-1.5 w-5 h-5 flex items-center justify-center rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 cursor-pointer transition"
          title="검색 초기화 (Esc)"
          aria-label="검색 초기화"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
};

/**
 * 공통 툴바
 *   - flex 가로 배치 · left | (search) | right
 *   - search 는 flex-grow 해 남은 공간 채움
 *   - 배경 없음 · 부모 컨테이너(card-panel 등)에 얹어 사용
 */
export const Toolbar: React.FC<ToolbarProps> = ({
  left,
  right,
  search,
  className = "",
}) => {
  return (
    <div
      className={[
        "flex items-center gap-2 flex-wrap",
        className,
      ].filter(Boolean).join(" ")}
    >
      {left != null && (
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {left}
        </div>
      )}
      {search != null && (
        <div className="flex-1 min-w-0 flex justify-start">
          <ToolbarSearch {...search} />
        </div>
      )}
      {right != null && (
        <div className="flex items-center gap-2 shrink-0 flex-wrap ml-auto">
          {right}
        </div>
      )}
    </div>
  );
};

export default Toolbar;
