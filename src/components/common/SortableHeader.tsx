// src/components/common/SortableHeader.tsx
// 2026-08-03 (#183) · 공통 테이블 정렬 헤더
//   - 테이블 <thead> 안에 rendering
//   - 컬럼 클릭 · 오름/내림 순환 · onSort 콜백
//   - 정렬 방향 표시 · 아이콘 (▲▼)
//   - align 옵션 · text-left/center/right
//
// 사용 예:
//   <thead>
//     <SortableHeader
//       columns={[
//         { key: "name", label: "이름", align: "left" },
//         { key: "date", label: "매입일", align: "center" },
//         { key: "qty",  label: "수량",   align: "right", sortable: true },
//       ]}
//       activeKey={sortKey}
//       activeDir={sortDir}
//       onSort={(key, dir) => { setSortKey(key); setSortDir(dir); }}
//     />
//   </thead>

import React from "react";

export type SortDir = "asc" | "desc";

export interface SortableColumn<K extends string = string> {
  key: K;
  label: string;
  align?: "left" | "center" | "right";
  /** 정렬 지원 여부 (기본 true) · false 면 클릭 안 됨 */
  sortable?: boolean;
  /** 컬럼 폭 (px · CSS width) · 없으면 auto */
  width?: number | string;
  /** 커스텀 className (예 · 특정 컬럼만 hidden md:table-cell) */
  className?: string;
}

export interface SortableHeaderProps<K extends string = string> {
  columns: SortableColumn<K>[];
  activeKey: K | null;
  activeDir: SortDir;
  onSort: (key: K, dir: SortDir) => void;
  /** thead tr 자체에 추가할 className */
  rowClassName?: string;
  /** th 공통 padding preset */
  size?: "compact" | "normal";
}

/**
 * 공통 정렬 가능 테이블 헤더
 *   - <thead> 안에서 <SortableHeader ... /> 형태로 사용 (내부에서 <tr> 자동 렌더)
 *   - 같은 컬럼 클릭 시 asc → desc → asc 순환
 *   - 다른 컬럼 클릭 시 asc 로 초기화
 */
export function SortableHeader<K extends string = string>({
  columns,
  activeKey,
  activeDir,
  onSort,
  rowClassName = "",
  size = "normal",
}: SortableHeaderProps<K>) {
  const padCls = size === "compact" ? "px-1.5 py-1.5" : "px-2.5 py-2";

  const handleClick = (col: SortableColumn<K>) => {
    if (col.sortable === false) return;
    const nextDir: SortDir =
      col.key === activeKey ? (activeDir === "asc" ? "desc" : "asc") : "asc";
    onSort(col.key, nextDir);
  };

  return (
    <tr className={`border-b border-line text-[11px] font-bold text-zinc-500 uppercase tracking-wider ${rowClassName}`}>
      {columns.map(col => {
        const isActive = col.key === activeKey;
        const alignCls = col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left";
        const clickable = col.sortable !== false;
        return (
          <th
            key={col.key}
            className={[
              padCls,
              alignCls,
              clickable ? "cursor-pointer select-none hover:text-zinc-700 transition-colors" : "",
              col.className ?? "",
            ].filter(Boolean).join(" ")}
            style={col.width != null ? { width: typeof col.width === "number" ? `${col.width}px` : col.width } : undefined}
            onClick={() => handleClick(col)}
            title={clickable ? `${col.label} · 클릭하여 정렬` : col.label}
          >
            <span className={`inline-flex items-center gap-1 ${col.align === "right" ? "justify-end w-full" : col.align === "center" ? "justify-center w-full" : ""}`}>
              <span>{col.label}</span>
              {clickable && isActive && (
                <span className="text-zinc-700 text-[9px] leading-none">
                  {activeDir === "asc" ? "▲" : "▼"}
                </span>
              )}
              {clickable && !isActive && (
                <span className="text-zinc-300 text-[9px] leading-none opacity-60">▲▼</span>
              )}
            </span>
          </th>
        );
      })}
    </tr>
  );
}

export default SortableHeader;
