// src/components/common/ResizableHeader.tsx
// 컬럼 리사이즈 핸들이 포함된 <th> 래퍼 컴포넌트 (T-UI-컬럼리사이저)
//
// 사용법:
//   <ResizableTh width={getWidth("name")} resizerProps={resizerProps("name")} align="left">
//     이름
//   </ResizableTh>
//
// - 내부에서 position:relative + 우측 리사이저 핸들 자동 렌더
// - 정렬 아이콘(▲▼) 과 조합 가능 · children 자유 구성
// - 리사이저는 우측 1px 실선 + hover 시 color 변경으로 시각 피드백

import React from "react";

/** useColumnResize().resizerProps() 반환 타입 */
export interface ResizerHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  role: "separator";
  "aria-label": string;
  style: React.CSSProperties;
}

export interface ResizableThProps {
  /** useColumnResize.getWidth() 반환값 */
  width: number;
  /** useColumnResize.resizerProps() 반환값 */
  resizerProps: ResizerHandleProps;
  /** 텍스트 정렬 (기본 left) */
  align?: "left" | "center" | "right";
  /** <th> 에 추가할 className */
  className?: string;
  /** <th> 에 추가할 style */
  style?: React.CSSProperties;
  children?: React.ReactNode;
  /** onClick (정렬 등) */
  onClick?: (e: React.MouseEvent<HTMLTableCellElement>) => void;
  /** title 속성 */
  title?: string;
  /** colSpan */
  colSpan?: number;
  /** rowSpan */
  rowSpan?: number;
}

/**
 * 컬럼 리사이즈 핸들이 내장된 <th> 컴포넌트
 * useColumnResize 훅과 함께 사용.
 */
export const ResizableTh: React.FC<ResizableThProps> = ({
  width,
  resizerProps,
  align = "left",
  className = "",
  style,
  children,
  onClick,
  title,
  colSpan,
  rowSpan,
}) => {
  const alignClass =
    align === "right"
      ? "text-right"
      : align === "center"
      ? "text-center"
      : "text-left";

  return (
    <th
      colSpan={colSpan}
      rowSpan={rowSpan}
      onClick={onClick}
      title={title}
      className={["relative select-none", alignClass, className].filter(Boolean).join(" ")}
      style={{ width, minWidth: width, maxWidth: width, ...style }}
    >
      {children}
      {/* 리사이즈 핸들 */}
      <span
        onMouseDown={resizerProps.onMouseDown}
        onTouchStart={resizerProps.onTouchStart}
        role={resizerProps.role}
        aria-label={resizerProps["aria-label"]}
        className={[
          "absolute right-0 top-0 bottom-0 w-3",
          "flex items-center justify-center z-10",
          "cursor-col-resize select-none",
          // 시각 피드백: 우측 실선
          "after:content-[''] after:absolute after:right-1 after:top-1/4 after:bottom-1/4",
          "after:w-px after:bg-zinc-300 after:rounded-full",
          "hover:after:bg-sky-400 hover:after:w-[2px] after:transition-all after:duration-100",
        ].join(" ")}
        style={{ touchAction: "none" }}
      />
    </th>
  );
};

export default ResizableTh;
