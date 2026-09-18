// src/components/common/SortHeader.tsx
// 공용 정렬 헤더 버튼 프리미티브 (2026-09-18)
//
// 사용처:
//   - OrderHistoryTab       : arrowStyle="arrow",   activeColor="brand"
//   - PaymentInfoTab        : arrowStyle="chevron",  activeColor="zinc"
//   - ProductInfoPage       : arrowStyle="arrow",   activeColor="brand"
//   - VendorManageSplit     : arrowStyle="chevron",  activeColor="indigo"
//   - HrFormsPage           : arrowStyle="text",    activeColor="brand"   (th 내부 콘텐츠용)
//   - VendorListEditor      : arrowStyle="chevron",  activeColor="indigo"  (th 내부 콘텐츠용)
//
// 두 가지 사용 모드:
//   1) <SortHeader> : <button> 전체 래퍼 — onToggle(columnKey) 로 연결
//   2) <SortHeaderContent> : 내부 label+icon만 — <th onClick> 패턴 파일에서 사용

import React from "react";
import {
  ArrowUp, ArrowDown,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";

// ── 색상 variant ─────────────────────────────────────────────────────────────
type ActiveColor = "brand" | "zinc" | "indigo";

const ACTIVE_CLS: Record<ActiveColor, string> = {
  brand:  "text-brand-deep",
  zinc:   "text-zinc-800",
  indigo: "text-indigo-600",
};
const INACTIVE_CLS: Record<ActiveColor, string> = {
  brand:  "text-zinc-500 hover:text-brand-deep",
  zinc:   "text-zinc-500 hover:text-zinc-700",
  indigo: "text-zinc-600 hover:text-indigo-600",
};

// ── 화살표 스타일 ─────────────────────────────────────────────────────────────
type ArrowStyle = "arrow" | "chevron" | "text";

interface ArrowProps {
  active: boolean;
  dir: "asc" | "desc";
  style: ArrowStyle;
  activeColor: ActiveColor;
}

const SortArrow: React.FC<ArrowProps> = ({ active, dir, style, activeColor }) => {
  if (style === "text") {
    if (active) {
      return (
        <span className={`text-[13px] ${ACTIVE_CLS[activeColor]}`}>
          {dir === "asc" ? "▲" : "▼"}
        </span>
      );
    }
    return <span className="text-[13px] text-zinc-300">↕</span>;
  }

  if (style === "arrow") {
    if (active) {
      return dir === "asc"
        ? <ArrowUp size={10} className="shrink-0" />
        : <ArrowDown size={10} className="shrink-0" />;
    }
    return <ArrowDown size={10} className="opacity-25 shrink-0" />;
  }

  // chevron (default)
  if (active) {
    return dir === "asc"
      ? <ChevronUp size={11} strokeWidth={3} className="shrink-0" />
      : <ChevronDown size={11} strokeWidth={3} className="shrink-0" />;
  }
  return <ChevronsUpDown size={10} strokeWidth={2.25} className="opacity-30 shrink-0" />;
};

// ── SortHeaderContent : 내부 컨텐츠만 (th 직접 클릭 패턴 파일에서 사용) ─────
export interface SortHeaderContentProps<K extends string> {
  label: React.ReactNode;
  columnKey: K;
  activeKey: K;
  activeDir: "asc" | "desc";
  arrowStyle?: ArrowStyle;
  activeColor?: ActiveColor;
  /** align="right" 시 flex-row-reverse 로 오른쪽 정렬 */
  align?: "left" | "right";
}

export const SortHeaderContent = <K extends string>({
  label,
  columnKey,
  activeKey,
  activeDir,
  arrowStyle = "chevron",
  activeColor = "brand",
  align = "left",
}: SortHeaderContentProps<K>) => {
  const active = columnKey === activeKey;
  const rowCls = align === "right" ? "flex-row-reverse" : "";
  return (
    <span className={`inline-flex items-center gap-0.5 ${rowCls}`}>
      <span>{label}</span>
      <SortArrow
        active={active}
        dir={activeDir}
        style={arrowStyle}
        activeColor={activeColor}
      />
    </span>
  );
};

// ── SortHeader : <button> 전체 래퍼 ─────────────────────────────────────────
export interface SortHeaderProps<K extends string> {
  label: React.ReactNode;
  columnKey: K;
  activeKey: K;
  activeDir: "asc" | "desc";
  onToggle: (k: K) => void;
  align?: "left" | "right" | "center";
  arrowStyle?: ArrowStyle;
  activeColor?: ActiveColor;
  className?: string;
  title?: string;
  width?: string;
}

export const SortHeader = <K extends string>({
  label,
  columnKey,
  activeKey,
  activeDir,
  onToggle,
  align = "left",
  arrowStyle = "chevron",
  activeColor = "brand",
  className = "",
  title,
  width,
}: SortHeaderProps<K>) => {
  const active = columnKey === activeKey;
  const colorCls = active ? ACTIVE_CLS[activeColor] : INACTIVE_CLS[activeColor];
  const alignCls =
    align === "right" ? "justify-end" :
    align === "center" ? "justify-center" : "";

  return (
    <button
      type="button"
      onClick={() => onToggle(columnKey)}
      title={title ?? `${String(label)} 정렬`}
      className={`inline-flex items-center gap-0.5 h-full transition cursor-pointer select-none ${colorCls} ${alignCls} ${width ?? ""} ${className}`}
    >
      <span>{label}</span>
      <SortArrow
        active={active}
        dir={activeDir}
        style={arrowStyle}
        activeColor={activeColor}
      />
    </button>
  );
};
