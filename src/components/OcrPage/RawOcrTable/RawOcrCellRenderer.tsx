import React from "react";
import { Pencil, AlertTriangle, Search, BookOpen } from "lucide-react";
import type { MatchedItem, BarcodeProduct } from "./types";
import { fmt, NUM_COLS, renderTextWithBreaks, normalizeExpiryDate } from "./utils";
import { parseNumber } from "./utils";

interface CellRendererProps {
  // Row context
  ri: number;
  ci: number;
  h: string;
  pn: number;
  cell: string | number | null | undefined;
  row: (string | number | null | undefined)[];
  // Header info
  dispHeaders: string[];
  nameIdx: number;
  amtIdx: number;
  // Edit state
  cellEdits: Record<number, Record<number, string | number | null>>;
  editingCell: { ri: number; ci: number } | null;
  editingCellVal: string;
  focusedCell: { ri: number; ci: number } | null;
  editingNameRow: number | null;
  editingNameVal: string;
  editingRawSuppRow: number | null;
  editingRawSuppVal: string;
  // Correction state
  amountCorrections: Record<number, number>;
  autoSynonymMatches: Record<number, { code: string; name: string }>;
  cancelledAutoMap: Set<number>;
  barcodeAutoMap: Record<number, BarcodeProduct>;
  // Cell cycle state
  numericCellCycle: Record<string, number>;
  numericCellCandidates: Record<string, (string | number)[]>;
  noCandidateCells: Set<string>;
  nameCellCycle: Record<number, number>;
  nameCellCandidates: Record<number, string[]>;
  reextractingName: Set<number>;
  dbFilledCells: Set<string>;
  // Supplier state
  rawSupplierByPage: Record<number, string>;
  structuredPages: any[];
  globalSupplier: string | null;
  vendorNames: string[];
  addSynonymsOnChange: boolean;
  pageNums: number[];
  suppInputRef: React.MutableRefObject<HTMLInputElement | null>;
  // Dimensions
  numCellMinW: number;
  numInputMinW: string;
  expInputMinW: string;
  numCellInnerCls: string;
  reextBtnCls: string;
  // Handlers
  setEditingCell: (v: { ri: number; ci: number } | null) => void;
  setEditingCellVal: (v: string) => void;
  setFocusedCell: (v: { ri: number; ci: number } | null) => void;
  setEditingNameRow: (v: number | null) => void;
  setEditingNameVal: (v: string) => void;
  setEditingRawSuppRow: (v: number | null) => void;
  setEditingRawSuppVal: (v: string) => void;
  setSuppDropdownRect: (v: { top: number; left: number; width: number } | null) => void;
  setSupplierConfirm: (v: { pageNum: number; newVal: string; rowCount: number; addSynonyms: boolean } | null) => void;
  setCellEdits: React.Dispatch<React.SetStateAction<Record<number, Record<number, string | number | null>>>>;
  setAutoSynonymMatches: React.Dispatch<React.SetStateAction<Record<number, { code: string; name: string }>>>;
  setCancelledAutoMap: React.Dispatch<React.SetStateAction<Set<number>>>;
  setCancelledAutoSyn: React.Dispatch<React.SetStateAction<Set<number>>>;
  setDeleteSynConfirm: (v: { ri: number; origName: string } | null) => void;
  setNameEditResults: (v: any[]) => void;
  setNameEditSearchDone: (v: boolean) => void;
  setNameDropdownRect: (v: { top: number; left: number; width: number } | null) => void;
  setMatchItems: React.Dispatch<React.SetStateAction<MatchedItem[] | null>>;
  nameInputRef: React.MutableRefObject<HTMLInputElement | null>;
  commitCellEdit: (ri: number, ci: number, rawVal: string) => void;
  reextractOneCell: (ri: number, ci: number, colName: "수량" | "단가" | "금액" | "유통기한") => void;
  reextractProductName: (ri: number) => void;
  openVendorEdit: (name: string) => void;
  saveSynonym: (ri: number, nameOld: string, productCode: string, supplierNew?: string, nameNew?: string, supplierOld?: string) => void;
  openModal: (rowIdx: number) => void;
  confirm: (opts: { message: string; danger?: boolean }) => Promise<boolean>;
  pageImages?: string[];
  dispRows: (string | number | null | undefined)[][];
  effectiveDispRows: (string | number | null | undefined)[][];
  permanentlyDeletedRawRows: Set<number>;
  hiddenRawRows: Set<number>;
  isRowDbDeleted: (ri: number) => boolean;
  // Name search (used in editing input)
  nameEditResults: any[];
  nameEditSearchDone: boolean;
  nameDropdownRect: { top: number; left: number; width: number } | null;
  rawEditValues: Record<number, string>;
  setRawEditValues: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  editingNameRowRef: React.MutableRefObject<number | null>;
  nameEditSearchRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  // Page date
  pageDateOverride: Record<number, string>;
  setPageDateOverride: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  editingCell2: { ri: number; ci: number } | null; // alias for editingCell (already passed)
}

// ── 수량/단가/금액 편집 셀 ──────────────────────────────────────────────────
export const NumericEditableCell: React.FC<{
  ri: number; ci: number; h: string; cell: string | number | null | undefined;
  hasDirectEdit: boolean; isCorrectedAmt: boolean;
  focusedCell: { ri: number; ci: number } | null;
  editingCell: { ri: number; ci: number } | null;
  editingCellVal: string;
  numCellMinW: number; numInputMinW: string; numCellInnerCls: string; reextBtnCls: string;
  numericCellCycle: Record<string, number>;
  numericCellCandidates: Record<string, (string | number)[]>;
  noCandidateCells: Set<string>;
  dbFilledCells: Set<string>;
  checkedCells: Set<string>;
  dispHeaders: string[];
  effectiveDispRows: (string | number | null | undefined)[][];
  permanentlyDeletedRawRows: Set<number>;
  hiddenRawRows: Set<number>;
  isRowDbDeleted: (ri: number) => boolean;
  setEditingCell: (v: { ri: number; ci: number } | null) => void;
  setEditingCellVal: (v: string) => void;
  setFocusedCell: (v: { ri: number; ci: number } | null) => void;
  commitCellEdit: (ri: number, ci: number, rawVal: string) => void;
  reextractOneCell: (ri: number, ci: number, colName: "수량" | "단가" | "금액" | "유통기한") => void;
  toggleCellCheck: (ri: number, ci: number) => void;
}> = ({
  ri, ci, h, cell, hasDirectEdit, isCorrectedAmt, focusedCell, editingCell, editingCellVal,
  numCellMinW, numInputMinW, numCellInnerCls, reextBtnCls,
  numericCellCycle, numericCellCandidates, noCandidateCells, dbFilledCells, checkedCells,
  dispHeaders, effectiveDispRows, permanentlyDeletedRawRows, hiddenRawRows, isRowDbDeleted,
  setEditingCell, setEditingCellVal, setFocusedCell, commitCellEdit, reextractOneCell, toggleCellCheck,
}) => {
  const isEditingThisNum = editingCell?.ri === ri && editingCell?.ci === ci;

  if (isEditingThisNum) {
    return (
      <td key={ci} className="px-1 py-1 text-right" onClick={e => e.stopPropagation()}>
        <input
          key={`edit-${ri}-${ci}`}
          autoFocus type="text" inputMode="numeric"
          size={Math.max(6, editingCellVal.length + 2)}
          style={{ width: `${Math.max(6, editingCellVal.length + 2)}ch`, minWidth: numInputMinW, maxWidth: "100%" }}
          className="text-xs font-bold text-right text-indigo-700 bg-indigo-50 border border-indigo-300 rounded px-2 py-0.5 outline-none"
          value={editingCellVal}
          onChange={e => setEditingCellVal(e.target.value)}
          onKeyDown={e => {
            const moveToCell = (nextRi: number, nextCi: number) => {
              setEditingCell({ ri: nextRi, ci: nextCi });
              setEditingCellVal("");
            };
            const editableIdxs = [dispHeaders.indexOf("수량"), dispHeaders.indexOf("단가"), dispHeaders.indexOf("금액")].filter(i => i >= 0).sort((a,b) => a - b);
            const curPos = editableIdxs.indexOf(ci);
            const isVisibleRow = (r: number) =>
              r >= 0 && r < effectiveDispRows.length
              && !permanentlyDeletedRawRows.has(r)
              && !hiddenRawRows.has(r)
              && !isRowDbDeleted(r);
            const findNextVisible = (start: number, dir: 1 | -1) => {
              let r = start;
              while (r >= 0 && r < effectiveDispRows.length) {
                if (isVisibleRow(r)) return r;
                r += dir;
              }
              return -1;
            };
            if (e.key === "Enter") { e.preventDefault(); commitCellEdit(ri, ci, editingCellVal); setEditingCell(null); setFocusedCell({ ri, ci }); return; }
            if (e.key === "Tab") {
              e.preventDefault(); commitCellEdit(ri, ci, editingCellVal);
              const nextCi = e.shiftKey
                ? (curPos > 0 ? editableIdxs[curPos - 1] : editableIdxs[editableIdxs.length - 1])
                : (curPos >= 0 && curPos < editableIdxs.length - 1 ? editableIdxs[curPos + 1] : editableIdxs[0]);
              if (nextCi != null && nextCi !== ci) moveToCell(ri, nextCi);
              else setEditingCell(null);
              return;
            }
            if (e.key === "Escape") { setEditingCell(null); return; }
            if (e.key === "ArrowLeft") {
              e.preventDefault(); commitCellEdit(ri, ci, editingCellVal);
              if (curPos > 0) moveToCell(ri, editableIdxs[curPos - 1]);
              else { const prev = findNextVisible(ri - 1, -1); if (prev >= 0) moveToCell(prev, editableIdxs[editableIdxs.length - 1]); }
              return;
            }
            if (e.key === "ArrowRight") {
              e.preventDefault(); commitCellEdit(ri, ci, editingCellVal);
              if (curPos < editableIdxs.length - 1) moveToCell(ri, editableIdxs[curPos + 1]);
              else { const next = findNextVisible(ri + 1, 1); if (next >= 0) moveToCell(next, editableIdxs[0]); }
              return;
            }
            if (e.key === "ArrowDown") {
              let nextRi = ri + 1;
              while (nextRi < effectiveDispRows.length && (permanentlyDeletedRawRows.has(nextRi) || hiddenRawRows.has(nextRi) || isRowDbDeleted(nextRi))) nextRi++;
              if (nextRi < effectiveDispRows.length) { e.preventDefault(); commitCellEdit(ri, ci, editingCellVal); moveToCell(nextRi, ci); }
              return;
            }
            if (e.key === "ArrowUp") {
              let prevRi = ri - 1;
              while (prevRi >= 0 && (permanentlyDeletedRawRows.has(prevRi) || hiddenRawRows.has(prevRi) || isRowDbDeleted(prevRi))) prevRi--;
              if (prevRi >= 0) { e.preventDefault(); commitCellEdit(ri, ci, editingCellVal); moveToCell(prevRi, ci); }
              return;
            }
          }}
          onBlur={() => commitCellEdit(ri, ci, editingCellVal)}
        />
      </td>
    );
  }

  const cellKey = `${ri}:${ci}`;
  const isCellChecked = checkedCells.has(cellKey);
  const numericKey = `${ri}-${ci}`;
  const cycleIdx = numericCellCycle[numericKey] ?? -1;
  const totalCands = (numericCellCandidates[numericKey] as number[] | undefined)?.length ?? 0;
  const noCands = noCandidateCells.has(numericKey);
  const isQty = h === "수량";
  const activeCls = isQty ? "bg-sky-500 text-white hover:bg-sky-600" : "bg-emerald-500 text-white hover:bg-emerald-600";
  const idleCls = isQty ? "bg-sky-50 text-sky-600 hover:bg-sky-500 hover:text-white" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white";

  return (
    <td key={ci}
      onClick={e => {
        e.stopPropagation();
        if (e.altKey || e.ctrlKey || e.metaKey) { toggleCellCheck(ri, ci); return; }
        setEditingCell({ ri, ci }); setFocusedCell({ ri, ci }); setEditingCellVal("");
      }}
      style={{ minWidth: numCellMinW }}
      className={`px-1 py-2 whitespace-nowrap text-right cursor-pointer hover:bg-indigo-50/60 group ${
        isCellChecked ? "bg-sky-100 ring-1 ring-sky-400" :
        focusedCell?.ri === ri && focusedCell?.ci === ci ? "ring-2 ring-indigo-500 bg-indigo-50/50" :
        "font-bold text-amber-800"
      }`}
      title={isCellChecked ? "체크됨 (Alt+Click 해제)" : "클릭하여 수정 · Alt+Click 으로 선택 · Enter/방향키 이동"}
    >
      <span className={numCellInnerCls}>
        <span className="flex items-center justify-end gap-1">
          {cell == null || (typeof cell === "number" && cell <= 0 && !hasDirectEdit)
            ? <span className="text-gray-300">—</span>
            : <span className={hasDirectEdit ? "text-rose-600 font-bold" : isCorrectedAmt ? "text-emerald-700" : ""}>
                {typeof cell === "number" ? fmt(cell) : String(cell)}
              </span>
          }
          {isCorrectedAmt && <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1 rounded font-bold">보정</span>}
          {dbFilledCells.has(`${ri}-${ci}`) && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1 rounded font-bold" title="products DB 에서 자동 채움">DB</span>}
          <Pencil size={8} className="text-indigo-200 opacity-0 group-hover:opacity-100 transition shrink-0" />
        </span>
        {(h === "수량" || h === "단가") && (
          <span className="inline-flex items-center gap-1 justify-end max-w-full overflow-hidden flex-wrap">
            <button type="button"
              onClick={e => { e.stopPropagation(); reextractOneCell(ri, ci, h as "수량" | "단가"); }}
              className={`opacity-70 hover:opacity-100 shrink-0 flex items-center justify-center rounded transition cursor-pointer ${reextBtnCls} ${
                noCands ? "bg-rose-100 text-rose-500 hover:bg-rose-200" :
                cycleIdx >= 0 ? activeCls : idleCls
              }`}
              title={noCands
                ? `${h} 후보 없음`
                : cycleIdx >= 0
                  ? `${h} 재추출 순환 중 (${cycleIdx + 1}/${totalCands})`
                  : `${h} 재추출`}
            >{noCands ? "⌀" : "🔄"}</button>
          </span>
        )}
      </span>
    </td>
  );
};

// ── 유통기한 셀 ────────────────────────────────────────────────────────────
export const ExpiryCell: React.FC<{
  ri: number; ci: number; cell: string | number | null | undefined;
  editingCell: { ri: number; ci: number } | null; editingCellVal: string;
  numericCellCycle: Record<string, number>;
  numericCellCandidates: Record<string, (string | number)[]>;
  noCandidateCells: Set<string>;
  numCellMinW: number; numCellInnerCls: string; reextBtnCls: string; expInputMinW: string;
  setEditingCell: (v: { ri: number; ci: number } | null) => void;
  setEditingCellVal: (v: string) => void;
  setCellEdits: React.Dispatch<React.SetStateAction<Record<number, Record<number, string | number | null>>>>;
  reextractOneCell: (ri: number, ci: number, colName: "유통기한") => void;
}> = ({
  ri, ci, cell, editingCell, editingCellVal, numericCellCycle, numericCellCandidates,
  noCandidateCells, numCellMinW, numCellInnerCls, reextBtnCls, expInputMinW,
  setEditingCell, setEditingCellVal, setCellEdits, reextractOneCell,
}) => {
  const isEditingExp = editingCell?.ri === ri && editingCell?.ci === ci;
  const cellKey = `${ri}-${ci}`;
  const cycleIdx = numericCellCycle[cellKey] ?? -1;
  const totalCands = (numericCellCandidates[cellKey] as string[] | undefined)?.length ?? 0;
  const noCands = noCandidateCells.has(cellKey);

  if (isEditingExp) {
    return (
      <td key={ci} className="px-1 py-1 text-right" onClick={e => e.stopPropagation()}>
        <input
          key={`edit-exp-${ri}-${ci}`} autoFocus type="text" placeholder="2026-12-31"
          size={Math.max(13, editingCellVal.length + 2)}
          style={{ width: `${Math.max(13, editingCellVal.length + 2)}ch`, minWidth: expInputMinW, maxWidth: "100%" }}
          className="text-[11px] font-mono text-amber-700 bg-amber-50 border border-amber-300 rounded px-1.5 py-0.5 outline-none text-right"
          value={editingCellVal}
          onChange={e => setEditingCellVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              const v = normalizeExpiryDate(editingCellVal.trim());
              setCellEdits(prev => ({ ...prev, [ri]: { ...(prev[ri] ?? {}), [ci]: v === "" ? null : v } }));
              setEditingCell(null);
            } else if (e.key === "Escape") { setEditingCell(null); }
          }}
          onBlur={() => {
            const v = normalizeExpiryDate(editingCellVal.trim());
            setCellEdits(prev => ({ ...prev, [ri]: { ...(prev[ri] ?? {}), [ci]: v === "" ? null : v } }));
            setEditingCell(null);
          }}
        />
      </td>
    );
  }

  return (
    <td key={ci} style={{ minWidth: numCellMinW }}
      onClick={e => { e.stopPropagation(); setEditingCell({ ri, ci }); setEditingCellVal(""); }}
      className="px-1 py-2 text-gray-500 text-[11px] group cursor-pointer hover:bg-amber-50/60 text-right"
      title="클릭하여 유통기한 수정">
      <span className={numCellInnerCls}>
        <span className="flex items-center justify-end gap-1">
          {cell == null ? <span className="text-gray-300">—</span> : String(cell)}
          <Pencil size={8} className="text-amber-300 opacity-0 group-hover:opacity-100 transition shrink-0" />
        </span>
        <button type="button"
          onClick={e => { e.stopPropagation(); reextractOneCell(ri, ci, "유통기한"); }}
          className={`opacity-70 hover:opacity-100 shrink-0 flex items-center justify-center rounded transition cursor-pointer ${reextBtnCls} ${
            noCands ? "bg-rose-100 text-rose-500 hover:bg-rose-200" :
            cycleIdx >= 0 ? "bg-amber-500 text-white hover:bg-amber-600" :
            "bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white"
          }`}
          title={noCands ? "유통기한 후보 없음" : cycleIdx >= 0 ? `유통기한 재추출 (${cycleIdx + 1}/${totalCands})` : "유통기한 재추출"}
        >{noCands ? "⌀" : "🔄"}</button>
      </span>
    </td>
  );
};

// ── 품명 셀 ─────────────────────────────────────────────────────────────
export const NameCell: React.FC<{
  ri: number; ci: number; pn: number;
  cell: string | number | null | undefined;
  dispRows: (string | number | null | undefined)[][];
  autoSynonymMatches: Record<number, { code: string; name: string }>;
  cancelledAutoMap: Set<number>;
  barcodeAutoMap: Record<number, BarcodeProduct>;
  nameCellCycle: Record<number, number>;
  nameCellCandidates: Record<number, string[]>;
  reextractingName: Set<number>;
  nameIdx: number;
  editingNameRow: number | null;
  editingNameVal: string;
  rawSupplierByPage: Record<number, string>;
  structuredPages: any[];
  globalSupplier: string | null;
  pageNums: number[];
  nameInputRef: React.MutableRefObject<HTMLInputElement | null>;
  nameEditSearchRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  editingNameRowRef: React.MutableRefObject<number | null>;
  setEditingNameRow: (v: number | null) => void;
  setEditingNameVal: (v: string) => void;
  setAutoSynonymMatches: React.Dispatch<React.SetStateAction<Record<number, { code: string; name: string }>>>;
  setCancelledAutoMap: React.Dispatch<React.SetStateAction<Set<number>>>;
  setCancelledAutoSyn: React.Dispatch<React.SetStateAction<Set<number>>>;
  setCellEdits: React.Dispatch<React.SetStateAction<Record<number, Record<number, string | number | null>>>>;
  setNameEditResults: (v: any[]) => void;
  setNameEditSearchDone: (v: boolean) => void;
  setNameDropdownRect: (v: { top: number; left: number; width: number } | null) => void;
  setMatchItems: React.Dispatch<React.SetStateAction<MatchedItem[] | null>>;
  setDeleteSynConfirm: (v: { ri: number; origName: string } | null) => void;
  reextractProductName: (ri: number) => void;
  saveSynonym: (ri: number, nameOld: string, productCode: string, supplierNew?: string, nameNew?: string) => void;
  confirm: (opts: { message: string }) => Promise<boolean>;
  handleMatchPage: (pn: number) => Promise<void>;
  matchRawToPurchaseHistory: (pn: number) => Promise<void>;
  nameEditResults: any[];
  nameEditSearchDone: boolean;
}> = ({
  ri, ci, pn, cell, dispRows, autoSynonymMatches, cancelledAutoMap, barcodeAutoMap,
  nameCellCycle, nameCellCandidates, reextractingName, nameIdx, editingNameRow, editingNameVal,
  rawSupplierByPage, structuredPages, globalSupplier, pageNums, nameInputRef, nameEditSearchRef,
  editingNameRowRef, setEditingNameRow, setEditingNameVal, setAutoSynonymMatches, setCancelledAutoMap,
  setCancelledAutoSyn, setCellEdits, setNameEditResults, setNameEditSearchDone, setNameDropdownRect,
  setMatchItems, setDeleteSynConfirm, reextractProductName, saveSynonym, confirm,
  handleMatchPage, matchRawToPurchaseHistory, nameEditResults, nameEditSearchDone,
}) => {
  const barcodeMatch = !cancelledAutoMap.has(ri) ? barcodeAutoMap[ri] : undefined;
  const autoMatch = !cancelledAutoMap.has(ri) ? autoSynonymMatches[ri] : undefined;
  const origCell = dispRows[ri]?.[nameIdx];
  const cellStr = String(cell ?? "");
  const rawSupplierForRow = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? globalSupplier ?? "";

  // 바코드 매칭
  if (barcodeMatch) {
    return (
      <td key={ci} className="px-3 py-2 max-w-[240px]">
        <div className="flex flex-col gap-0">
          <span className="flex items-center gap-1">
            <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-1 rounded shrink-0">BC</span>
            <span className="font-semibold text-emerald-700 break-words whitespace-normal">{renderTextWithBreaks(barcodeMatch.name)}</span>
            <button type="button" title="ERP 자동보정 취소"
              onClick={e => { e.stopPropagation(); setCancelledAutoMap(prev => new Set([...prev, ri])); }}
              className="text-[10px] px-1 py-px rounded bg-rose-100 text-rose-600 hover:bg-rose-200 cursor-pointer shrink-0">✕</button>
          </span>
          <span className="text-gray-300 text-[11px] line-through break-words whitespace-normal">{renderTextWithBreaks(String(origCell ?? ""))}</span>
        </div>
      </td>
    );
  }

  // 편집 중
  if (editingNameRow === ri) {
    return (
      <td key={ci} className="px-2 py-1.5 max-w-[260px]" onClick={e => e.stopPropagation()}>
        <input
          ref={nameInputRef} autoFocus lang="ko" inputMode="text"
          autoCapitalize="off" autoCorrect="off" spellCheck={false}
          style={{ imeMode: "active" } as React.CSSProperties}
          className="w-full text-[12px] font-semibold text-gray-800 bg-indigo-50 border border-indigo-300 rounded px-2 py-0.5 outline-none"
          value={editingNameVal}
          placeholder={String(origCell ?? cell ?? "")}
          onChange={e => {
            const v = e.target.value;
            setEditingNameVal(v);
            if (nameEditSearchRef.current) clearTimeout(nameEditSearchRef.current);
            if (v.trim().length < 2) { setNameEditResults([]); setNameEditSearchDone(false); setNameDropdownRect(null); return; }
            if (nameInputRef.current) {
              const r = nameInputRef.current.getBoundingClientRect();
              setNameDropdownRect({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 220) });
            }
            setNameEditSearchDone(false);
            nameEditSearchRef.current = setTimeout(async () => {
              const params = new URLSearchParams({ q: v.trim() });
              if (rawSupplierForRow) params.set("supplier", rawSupplierForRow);
              try {
                const { api } = await import("../../../lib/apiClient");
                const { data } = await api.get<any[]>(`/api/products-search?${params}`);
                const results = Array.isArray(data) ? data : [];
                setNameEditResults(results);
                setNameEditSearchDone(true);
              } catch { setNameEditResults([]); setNameEditSearchDone(false); setNameDropdownRect(null); }
            }, 280);
          }}
          onKeyDown={async e => {
            if (e.key === "Escape") { setEditingNameRow(null); setNameEditResults([]); setNameEditSearchDone(false); setNameDropdownRect(null); }
            if (e.key === "Enter") {
              const v = editingNameVal.trim();
              const orig = String((autoSynonymMatches[ri]?.name ?? origCell) ?? "").trim();
              if (v && v !== orig) {
                const topMatch = nameEditResults[0];
                if (topMatch?.product_code) {
                  setAutoSynonymMatches(prev => ({ ...prev, [ri]: { code: topMatch.product_code, name: topMatch.product_name } }));
                  setCancelledAutoSyn(prev => { const s = new Set(prev); s.delete(ri); return s; });
                  setCancelledAutoMap(prev => { const s = new Set(prev); s.delete(ri); return s; });
                  if (orig !== topMatch.product_name) {
                    if (await confirm({ message: `동의어보정사전에 등록할까요?\n\n· 보정 전: ${orig}\n· 보정 후: ${topMatch.product_name}` })) {
                      saveSynonym(ri, orig, topMatch.product_code, rawSupplierForRow || undefined, topMatch.product_name);
                    }
                  }
                } else {
                  setCellEdits(prev => ({ ...prev, [ri]: { ...(prev[ri] ?? {}), [nameIdx]: v } }));
                  const existingCode = autoSynonymMatches[ri]?.code;
                  if (orig && orig !== v) {
                    if (await confirm({ message: `동의어보정사전에 등록할까요?\n\n· 보정 전: ${orig}\n· 보정 후: ${v}` })) {
                      saveSynonym(ri, orig, existingCode ?? "", rawSupplierForRow || undefined, v);
                    }
                  }
                }
              }
              e.currentTarget.blur();
            }
          }}
          onBlur={() => setTimeout(() => {
            setEditingNameRow(null); setNameEditResults([]); setNameEditSearchDone(false); setNameDropdownRect(null);
          }, 500)}
        />
      </td>
    );
  }

  // autoMatch 존재
  if (autoMatch) {
    return (
      <td key={ci}
        onClick={e => { e.stopPropagation(); setEditingNameRow(ri); setEditingNameVal(String(autoMatch.name ?? origCell ?? "")); setNameEditResults([]); setNameEditSearchDone(false); setNameDropdownRect(null); }}
        className="px-3 py-2 max-w-[240px] cursor-pointer hover:bg-indigo-50/60 group" title="클릭하여 상품명 수정">
        <div className="flex flex-col gap-0">
          <span className="flex items-center gap-1">
            <span className="text-[9px] font-bold bg-brand-deep text-white px-1 py-px rounded shrink-0" title="products DB 에서 자동 매칭">DB</span>
            <BookOpen size={9} className="text-indigo-400 shrink-0" />
            <span className="font-semibold text-indigo-700 break-words whitespace-normal">{renderTextWithBreaks(autoMatch.name)}</span>
            <Pencil size={8} className="text-indigo-200 opacity-0 group-hover:opacity-100 transition shrink-0" />
            <button type="button" title="ERP 자동보정 취소"
              onClick={e => { e.stopPropagation(); setCancelledAutoMap(prev => new Set([...prev, ri])); }}
              className="text-[10px] px-1 py-px rounded bg-rose-100 text-rose-600 hover:bg-rose-200 cursor-pointer shrink-0">✕</button>
          </span>
          <button type="button"
            onClick={e => { e.stopPropagation(); setDeleteSynConfirm({ ri, origName: String(origCell ?? "") }); }}
            className="text-gray-300 text-[11px] line-through break-words whitespace-normal hover:text-rose-400 cursor-pointer text-left" title="클릭하여 동의어 삭제">
            {renderTextWithBreaks(String(origCell ?? ""))}
          </button>
        </div>
      </td>
    );
  }

  // 일반 품명
  const isCancelledAutoMap = cancelledAutoMap.has(ri);
  const cycleIdxN = nameCellCycle[ri];
  const totalCandsN = nameCellCandidates[ri]?.length ?? 0;
  const cycleLabel = cycleIdxN != null && totalCandsN > 0 ? ` (${cycleIdxN + 1}/${totalCandsN})` : "";
  const isCycling = cycleIdxN != null && totalCandsN > 0;

  return (
    <td key={ci}
      onClick={e => { e.stopPropagation(); setEditingNameRow(ri); setEditingNameVal(cellStr); setNameEditResults([]); setNameEditSearchDone(false); setNameDropdownRect(null); }}
      className="px-3 py-2 cursor-pointer hover:bg-indigo-50/60 group" title="클릭하여 상품명 수정">
      <div className="flex flex-col gap-0.5 items-start">
        <span className="flex items-center gap-1">
          <span className="font-semibold break-words whitespace-normal text-gray-900">
            {cell == null ? <span className="text-gray-300">—</span> : renderTextWithBreaks(cellStr)}
          </span>
          <Pencil size={8} className="text-indigo-200 opacity-0 group-hover:opacity-100 transition shrink-0" />
        </span>
        <span className="flex items-center gap-1">
          <button type="button"
            title={isCycling ? "순환 재추출" : "품명 재추출"}
            onClick={e => { e.stopPropagation(); reextractProductName(ri); }}
            disabled={reextractingName.has(ri)}
            className={`text-[10px] px-1.5 py-0.5 rounded disabled:opacity-50 cursor-pointer shrink-0 transition font-bold ${
              isCycling ? "bg-brand-deep text-white hover:bg-brand-deep" : "bg-sky-100 text-sky-700 hover:bg-sky-500 hover:text-white"
            }`}
          >{reextractingName.has(ri) ? "⏳ 재추출중" : `🔄 재추출${cycleLabel}`}</button>
          {isCancelledAutoMap && (
            <button type="button" title="ERP 자동보정 복원"
              onClick={e => { e.stopPropagation(); setCancelledAutoMap(prev => { const s = new Set(prev); s.delete(ri); return s; }); }}
              className="text-[10px] px-1 py-px rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 cursor-pointer shrink-0">↩ 복원</button>
          )}
        </span>
      </div>
    </td>
  );
};
