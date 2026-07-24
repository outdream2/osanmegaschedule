// 2026-07-24 · RawOcrTable 리팩터 · 방향키 셀 이동 리스너 훅
//   focusedCell (편집 아닌 focus 상태) · 방향키로 인접 편집 셀 이동
//   Enter · 현재 셀 편집모드 진입 · Escape · focus 해제
import { useEffect } from "react";
import type React from "react";

interface Args {
  focusedCell: { ri: number; ci: number } | null;
  editingCell: { ri: number; ci: number } | null;
  dispHeaders: string[];
  effectiveDispRows: (string | number | null)[][];
  permanentlyDeletedRawRows: Set<number>;
  hiddenRawRows: Set<number>;
  isRowDbDeleted: (ri: number) => boolean;
  setFocusedCell: React.Dispatch<React.SetStateAction<{ ri: number; ci: number } | null>>;
  setEditingCell: React.Dispatch<React.SetStateAction<{ ri: number; ci: number } | null>>;
  setEditingCellVal: React.Dispatch<React.SetStateAction<string>>;
}

export function useCellNavigation(args: Args) {
  const {
    focusedCell, editingCell, dispHeaders, effectiveDispRows,
    permanentlyDeletedRawRows, hiddenRawRows, isRowDbDeleted,
    setFocusedCell, setEditingCell, setEditingCellVal,
  } = args;
  useEffect(() => {
    if (!focusedCell || editingCell) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const editableIdxs = [dispHeaders.indexOf("수량"), dispHeaders.indexOf("단가"), dispHeaders.indexOf("금액")].filter(i => i >= 0).sort((a, b) => a - b);
      const { ri, ci } = focusedCell;
      const curPos = editableIdxs.indexOf(ci);
      const isVisibleRow = (r: number) =>
        r >= 0 && r < effectiveDispRows.length
        && !permanentlyDeletedRawRows.has(r)
        && !hiddenRawRows.has(r)
        && !isRowDbDeleted(r);
      const findNext = (start: number, dir: 1 | -1) => {
        let r = start;
        while (r >= 0 && r < effectiveDispRows.length) {
          if (isVisibleRow(r)) return r;
          r += dir;
        }
        return -1;
      };
      let nextRi = ri, nextCi = ci;
      if (e.key === "ArrowLeft") {
        if (curPos > 0) nextCi = editableIdxs[curPos - 1];
        else { const pr = findNext(ri - 1, -1); if (pr >= 0) { nextRi = pr; nextCi = editableIdxs[editableIdxs.length - 1]; } }
      } else if (e.key === "ArrowRight") {
        if (curPos < editableIdxs.length - 1) nextCi = editableIdxs[curPos + 1];
        else { const nr = findNext(ri + 1, 1); if (nr >= 0) { nextRi = nr; nextCi = editableIdxs[0]; } }
      } else if (e.key === "ArrowDown") {
        const nr = findNext(ri + 1, 1); if (nr >= 0) nextRi = nr;
      } else if (e.key === "ArrowUp") {
        const pr = findNext(ri - 1, -1); if (pr >= 0) nextRi = pr;
      } else if (e.key === "Enter") {
        e.preventDefault();
        setEditingCell({ ri, ci });
        setEditingCellVal("");
        return;
      } else if (e.key === "Escape") {
        e.preventDefault();
        setFocusedCell(null);
        return;
      } else {
        return;
      }
      e.preventDefault();
      if (nextRi !== ri || nextCi !== ci) setFocusedCell({ ri: nextRi, ci: nextCi });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedCell, editingCell, dispHeaders, effectiveDispRows, permanentlyDeletedRawRows, hiddenRawRows]);
}
