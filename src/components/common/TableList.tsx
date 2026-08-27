// src/components/common/TableList.tsx
// 2026-08-24 · v3 리스트 UI 프레임워크 · 표 형식 리스트 wrapper + 헤더 · 사용자 지시
//   · 목업 · docs/UI_MOCKUP_ORDER_LIST_V3_2026-08-24.html
//   · 상단 gradient accent (Vercel/Linear 시그니처)
//   · thead sticky · bg zinc-100/70 · uppercase · 반응형 폰트
//   · 정렬 · text-right (숫자) · text-left (문자) · text-center (액션)
//   · Attio · Linear · Notion · Ramp 2026 톤
//
// 사용:
//   <TableListWrap>
//     <table>
//       <thead className={tableHeadCls()}>
//         <tr><th ...>...</th></tr>
//       </thead>
//       <tbody>...</tbody>
//     </table>
//   </TableListWrap>

import React from "react";

// ═══════════════════════════════════════════════════════════════════
// TableListWrap · 표 리스트 wrapper · 상단 gradient accent · rounded
// ═══════════════════════════════════════════════════════════════════
export interface TableListWrapProps {
  children: React.ReactNode;
  /** 상단 gradient accent · Vercel/Linear 시그니처 · 기본 true */
  topAccent?: boolean;
  /** 로딩 시 · opacity 낮춤 · pointer-events X */
  loading?: boolean;
  /** max-height · 기본 50vh (lg+ 75vh) · CSS 값 그대로 */
  maxHeight?: string;
  /** wrapper 추가 className */
  className?: string;
}

export function TableListWrap({
  children,
  topAccent = true,
  loading = false,
  maxHeight,
  className = "",
}: TableListWrapProps) {
  const heightCls = maxHeight ? "" : "max-h-[50vh] lg:max-h-[75vh]";
  const loadingCls = loading
    ? "opacity-40 pointer-events-none transition-opacity"
    : "transition-opacity";
  return (
    <div
      className={`relative overflow-auto rounded-xl border border-line bg-white ${heightCls} ${loadingCls} ${className}`.trim()}
      style={maxHeight ? { maxHeight } : undefined}
    >
      {topAccent && (
        <span
          aria-hidden
          className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep opacity-90 z-20"
        />
      )}
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// tableHeadCls · thead className 헬퍼 · Attio 톤 · uppercase · 반응형
// ═══════════════════════════════════════════════════════════════════
/**
 * v3 thead 표준 클래스 · 반응형 폰트 (13/14) · bg zinc-100/70 · font-bold · uppercase
 * 사용:
 *   <thead className={tableHeadCls()}>
 *     <tr>
 *       <th className={tableThCls()}>상품명 <sort>⇅</sort></th>
 *       <th className={tableThCls("num")}>수량 <sort>⇅</sort></th>
 *       <th className={tableThCls("center")}>액션</th>
 *     </tr>
 *   </thead>
 */
// 2026-08-27 · 사용자 지시 · 헤더 틀고정 강화 (프레임워크 반영)
//   · border-collapse 이슈 회피 · thead 만 sticky 시 배경 사라짐 → th 개별 sticky
//   · tableThCls 에서 개별 th 에 sticky/bg 적용 · 여기는 shared style 만
export function tableHeadCls(extra = ""): string {
  return `text-[13px] sm:text-[14px] font-bold text-zinc-600 uppercase tracking-wider ${extra}`.trim();
}

/**
 * v3 th className 헬퍼 · 정렬 방향별
 *   · "left" (default) · 문자
 *   · "num" · 숫자 · text-right tabular-nums
 *   · "center" · 액션·체크
 */
export type TableThAlign = "left" | "num" | "center";
// 2026-08-27 · 사용자 지시 · 개별 th sticky · border-collapse 이슈 회피
//   · bg-zinc-50 · 스크롤 시 body row 안 비침 · border-b-2 · 시각 구분
//   · z-30 · Modal·툴팁·편집 인풋(z-10~20)과 충돌 없이 상단 유지
export function tableThCls(align: TableThAlign = "left", extra = ""): string {
  const alignCls =
      align === "num"    ? "text-right"
    : align === "center" ? "text-center"
                         : "text-left";
  return `${alignCls} sticky top-0 z-30 bg-zinc-50 border-b-2 border-line shadow-[0_1px_2px_rgba(0,0,0,0.04)] px-2 py-2.5 select-none ${extra}`.trim();
}

/**
 * v3 td className 헬퍼 · 정렬 방향별
 *   · "num" · text-right tabular-nums font-medium
 *   · "center" · text-center
 *   · "left" · text-left
 */
export function tableTdCls(align: TableThAlign = "left", extra = ""): string {
  const alignCls =
      align === "num"    ? "text-right tabular-nums"
    : align === "center" ? "text-center"
                         : "text-left";
  return `${alignCls} px-2 py-2 ${extra}`.trim();
}

export default TableListWrap;
