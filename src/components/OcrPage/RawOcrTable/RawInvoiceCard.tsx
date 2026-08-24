import React from "react";
import { AlertTriangle, Search, Pencil } from "lucide-react";
import { Card } from "../../common/Card";
import { parseNumber, renderTextWithBreaks, normalizeExpiryDate, fmt } from "./utils";
import { NumericEditableCell, ExpiryCell, NameCell } from "./RawOcrCellRenderer";
import { RawPageImageCell } from "./RawPageImageCell";
import { ErpMatchSubRow } from "./ErpMatchSubRow";
import { InvoiceCardHeader } from "./InvoiceCardHeader";
import { InvoiceTableHeader } from "./InvoiceTableHeader";
import { InvoicePageSummary } from "./InvoicePageSummary";
import { InvoiceTableFooter } from "./InvoiceTableFooter";
import type { RawInvoiceCardProps } from "./RawInvoiceCard.types";

export type { RawInvoiceCardProps };

export const RawInvoiceCard: React.FC<RawInvoiceCardProps> = ({
  rawRows, dispHeaders, dispRows, effectiveDispRows, pageNums,
  nameIdx, amtIdx, ocrQtyIdx, ocrPriIdx, _discountIdxEarly,
  structuredPages, meta, RAW_ESSENTIAL_COLS, NUM_COLS, showRawDetail,
  permanentlyDeletedRawRows, hiddenRawRows, isRowDbDeleted,
  invTableWrapRef, effectiveInvColWidth, invColResizing, INV_COL_DEFAULT,
  containerWidth, _cw, numCellMinW, expCellMinW, reextBtnCls, numCellInnerCls,
  numInputMinW, expInputMinW, colWidths, resizeRef,
  pageImages, pageZoom, pagePan, panDragRef, rotation,
  rawSupplierByPage, globalSupplier,
  editingRawSuppRow, editingRawSuppVal, suppInputRef, addSynonymsOnChange,
  autoSynonymLoading, autoSynonymMatches, synonymAddStatus,
  hasMissingSupplier, missingSupplierPages,
  reparseStatus, reparseSupplier,
  cellEdits, editingCell, editingCellVal, focusedCell, amountCorrections,
  editingNameRow, editingNameVal, editingNameRowRef, nameInputRef, nameEditSearchRef,
  nameEditResults, nameEditSearchDone, nameCellCycle, nameCellCandidates, reextractingName,
  matchItems, cancelledAutoMap, cancelledRows, selectedCands, barcodeAutoMap,
  numericCellCycle, numericCellCandidates, noCandidateCells, dbFilledCells, checkedCells,
  effectivePageTotals, pageSubtotalChoices, pageSubtotalCustom, pageVatIncluded,
  pageDiscountApplied, pageSupplierBalances, supplierBalanceRecords,
  pageBalanceOverride, pageBalanceModeManual, pageBalanceManualInput,
  editingSummary, supplierTotals, total, totalBreakdownTitle,
  editingGrandTotal, grandTotalOverride,
  erpSubRowPages, matchingPage, confirmedPages,
  pageDateOverride,
  onInvColResizeStart, setInvoiceColWidth, onImgPanStart,
  openPageModal, zoomOut, zoomReset, zoomIn, openModal,
  commitRawRowsDeletion,
  setEditingRawSuppRow, setEditingRawSuppVal, setSuppDropdownRect, setSupplierConfirm,
  openVendorEdit, saveTemplate, setReparseStatus,
  setEditingCell, setEditingCellVal, setFocusedCell, setCellEdits, commitCellEdit,
  setPageDateOverride, reextractOneCell, toggleCellCheck,
  setEditingNameRow, setEditingNameVal, setAutoSynonymMatches, setCancelledAutoMap,
  setCancelledAutoSyn, setMatchItems, setNameEditResults, setNameEditSearchDone,
  setNameDropdownRect, setDeleteSynConfirm, reextractProductName, saveSynonym,
  confirm, handleMatchPage, matchRawToPurchaseHistory, setCancelledRows,
  setPageSubtotalChoices, setPageSubtotalCustom, setPageVatIncluded,
  setPageDiscountApplied, setPageDiscountOverride, setPageBalanceOverride,
  setPageBalanceModeManual, setEditingSummary, saveSupplierBalance,
  setErpSubRowPages, setConfirmedPages, setConfirmed, runColumnPipeline, runningPipeline,
  addManualRow, setPermanentlyDeletedRawRows, setDbDeletedSignatures, makeRowSignature,
  getPageDisplayTotal, getPageDiscounts, setEditingGrandTotal, setGrandTotalOverride,
}) => {
  // tbody 렌더링용 헬퍼: 필수 컬럼 인덱스 목록
  const getVisibleColIndices = (): number[] => {
    const baseOrder = dispHeaders.map((_, i) => i);
    if (showRawDetail) return baseOrder;
    const list: number[] = [];
    for (const name of RAW_ESSENTIAL_COLS) {
      let idx = dispHeaders.indexOf(name);
      if (idx < 0 && name === "유통기한") {
        for (const a of ["유효기한", "유통기간"]) { idx = dispHeaders.indexOf(a); if (idx >= 0) break; }
      }
      if (idx >= 0) list.push(idx);
    }
    return list;
  };

  // 페이지 rawColSpan 계산
  const getRawColSpan = (): number => {
    if (showRawDetail) return dispHeaders.length + 1;
    let cnt = 1;
    for (const name of RAW_ESSENTIAL_COLS) {
      let idx = dispHeaders.indexOf(name);
      if (idx < 0 && name === "유통기한") {
        for (const a of ["유효기한", "유통기간"]) { idx = dispHeaders.indexOf(a); if (idx >= 0) break; }
      }
      if (idx >= 0) cnt++;
    }
    return cnt;
  };

  const _qtyIdxSkip0 = dispHeaders.indexOf("수량");
  const _priIdxSkip0 = dispHeaders.indexOf("단가");

  const _lastVisibleByPage = new Map<number, number>();
  const _firstVisibleByPage = new Map<number, number>();
  effectiveDispRows.forEach((row, i) => {
    if (permanentlyDeletedRawRows.has(i) || isRowDbDeleted(i) || hiddenRawRows.has(i)) return;
    const nmVal0 = nameIdx >= 0 ? String(row[nameIdx] ?? "").trim() : "";
    const qtVal0 = _qtyIdxSkip0 >= 0 ? parseNumber(row[_qtyIdxSkip0]) : 0;
    const prVal0 = _priIdxSkip0 >= 0 ? parseNumber(row[_priIdxSkip0]) : 0;
    if (!nmVal0 && qtVal0 === 0 && prVal0 === 0) return;
    const pn = pageNums[i];
    if (!_firstVisibleByPage.has(pn)) _firstVisibleByPage.set(pn, i);
    _lastVisibleByPage.set(pn, i);
  });

  void ocrQtyIdx; void ocrPriIdx; void _discountIdxEarly; void pageDateOverride;

  return (
    <Card variant="raw-sm" rounded="2xl" padding="none" clip topAccent className="w-full">
      <InvoiceCardHeader
        rawRows={rawRows}
        permanentlyDeletedRawRows={permanentlyDeletedRawRows}
        hiddenRawRows={hiddenRawRows}
        structuredPages={structuredPages}
        meta={meta}
        autoSynonymLoading={autoSynonymLoading}
        autoSynonymMatches={autoSynonymMatches}
        synonymAddStatus={synonymAddStatus}
        hasMissingSupplier={hasMissingSupplier}
        missingSupplierPages={missingSupplierPages}
        reparseStatus={reparseStatus}
        reparseSupplier={reparseSupplier}
        commitRawRowsDeletion={commitRawRowsDeletion}
        saveTemplate={saveTemplate}
        setReparseStatus={setReparseStatus}
      />

      <div className="w-full max-w-[1400px] mx-auto overflow-x-auto pl-3 pr-8 box-border" ref={invTableWrapRef}>
        <table className={`w-full border-collapse ${_cw < 500 ? "text-[10px]" : "text-xs"}`} style={{ tableLayout: "fixed" }}>
          <InvoiceTableHeader
            dispHeaders={dispHeaders}
            showRawDetail={showRawDetail}
            RAW_ESSENTIAL_COLS={RAW_ESSENTIAL_COLS}
            NUM_COLS={NUM_COLS}
            pageImages={pageImages}
            effectiveInvColWidth={effectiveInvColWidth}
            invColResizing={invColResizing}
            INV_COL_DEFAULT={INV_COL_DEFAULT}
            containerWidth={containerWidth}
            numCellMinW={numCellMinW}
            expCellMinW={expCellMinW}
            colWidths={colWidths}
            resizeRef={resizeRef}
            onInvColResizeStart={onInvColResizeStart}
            setInvoiceColWidth={setInvoiceColWidth}
          />
          <tbody className="[&_td]:max-lg:py-4 [&_td]:lg:py-3 [&_tr]:border-b [&_tr]:border-zinc-100">
            {effectiveDispRows.map((row, ri) => {
              if (permanentlyDeletedRawRows.has(ri)) return null;
              if (isRowDbDeleted(ri)) return null;
              if (hiddenRawRows.has(ri)) return null;
              {
                const _qtyIdxSkip = dispHeaders.indexOf("수량");
                const _priIdxSkip = dispHeaders.indexOf("단가");
                const nmVal = nameIdx >= 0 ? String(row[nameIdx] ?? "").trim() : "";
                const qtVal = _qtyIdxSkip >= 0 ? parseNumber(row[_qtyIdxSkip]) : 0;
                const prVal = _priIdxSkip >= 0 ? parseNumber(row[_priIdxSkip]) : 0;
                if (!nmVal && qtVal === 0 && prVal === 0) return null;
              }
              const isFirstInPage = ri === _firstVisibleByPage.get(pageNums[ri]);
              const isLastInPage = ri === _lastVisibleByPage.get(pageNums[ri]);
              const pn = pageNums[ri];
              const pageRowCountRaw = isFirstInPage
                ? effectiveDispRows.filter((_, i) => pageNums[i] === pn && !permanentlyDeletedRawRows.has(i) && !hiddenRawRows.has(i)).length
                : 0;
              const _visibleDataRowsForImg = isFirstInPage
                ? effectiveDispRows.filter((r, i) => {
                    if (pageNums[i] !== pn) return false;
                    if (permanentlyDeletedRawRows.has(i)) return false;
                    if (isRowDbDeleted(i)) return false;
                    if (hiddenRawRows.has(i)) return false;
                    const _n = nameIdx >= 0 ? String(r[nameIdx] ?? "").trim() : "";
                    const _q = _qtyIdxSkip0 >= 0 ? parseNumber(r[_qtyIdxSkip0]) : 0;
                    const _p = _priIdxSkip0 >= 0 ? parseNumber(r[_priIdxSkip0]) : 0;
                    if (!_n && _q === 0 && _p === 0) return false;
                    return true;
                  }).length
                : 0;
              const _subRowMultiplier = erpSubRowPages.has(pn) ? 2 : 1;
              const imgRowSpan = isFirstInPage
                ? 1 + (_visibleDataRowsForImg * _subRowMultiplier) + (amtIdx >= 0 ? 1 : 0) + 1
                : 0;
              const RAW_MIN_PAGE_HEIGHT = 240;
              const RAW_DATA_ROW_H = 44;
              const naturalHeightRaw = 44 + (_visibleDataRowsForImg * _subRowMultiplier * RAW_DATA_ROW_H) + (amtIdx >= 0 ? 44 : 0);
              const shortfallRaw = Math.max(0, RAW_MIN_PAGE_HEIGHT - naturalHeightRaw);
              const imgCellHeightRaw = naturalHeightRaw + shortfallRaw + 24;
              const pageSupplierHeadRaw = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
              const rawColSpan = getRawColSpan();

              return (
                <React.Fragment key={ri}>
                  {isFirstInPage && (
                    <tr className="border-t-2 select-none bg-amber-100/70 border-amber-300">
                      {pageImages?.length ? (
                        <RawPageImageCell
                          pn={pn}
                          imgSrc={pageImages[pn - 1]}
                          imgRowSpan={imgRowSpan}
                          imgCellHeight={imgCellHeightRaw}
                          effectiveInvColWidth={effectiveInvColWidth}
                          invColResizing={invColResizing}
                          pageZoom={pageZoom}
                          pagePan={pagePan}
                          panDragRef={panDragRef}
                          rotation={rotation}
                          onInvColResizeStart={onInvColResizeStart}
                          setInvoiceColWidth={setInvoiceColWidth}
                          INV_COL_DEFAULT={INV_COL_DEFAULT}
                          onImgPanStart={onImgPanStart}
                          openPageModal={openPageModal}
                          zoomOut={zoomOut}
                          zoomReset={zoomReset}
                          zoomIn={zoomIn}
                        />
                      ) : null}
                      <td colSpan={rawColSpan} className="px-3 py-1.5">
                        <span className="flex items-center gap-2 text-xs font-bold text-amber-800">
                          <span className="bg-white border rounded px-1.5 py-0.5 border-amber-300 text-amber-700">{pn}번 명세서</span>
                          {pageSupplierHeadRaw && <span className="text-amber-700 font-bold">{pageSupplierHeadRaw}</span>}
                          {pageSupplierHeadRaw && (
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); openVendorEdit(pageSupplierHeadRaw); }}
                              className="inline-flex items-center gap-0.5 text-[10px] font-bold text-white bg-teal-500 hover:bg-teal-600 rounded px-1.5 py-0.5 whitespace-nowrap"
                              title={`${pageSupplierHeadRaw} 공급사 정보 조회·수정`}
                            >
                              🔍 조회
                            </button>
                          )}
                          <span className="text-amber-500 font-normal">· {pageRowCountRaw}건</span>
                          <button type="button"
                            onClick={() => runColumnPipeline(pn)}
                            disabled={!!runningPipeline[pn]}
                            className="ml-1 text-[10px] font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:bg-zinc-300 disabled:cursor-not-allowed rounded px-2 py-0.5 cursor-pointer shadow-sm whitespace-nowrap"
                            title="상품명 매칭 → 빈 단가 DB 조회 → OCR vs DB 큰차이 스왑 · 페이지 로드 시 자동 실행됨 · 재실행용"
                          >{runningPipeline[pn] ? "⏳ 정리중..." : "🎯 자동정리"}</button>
                          <button type="button"
                            onClick={() => addManualRow(pn)}
                            className="ml-1 text-[10px] font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] rounded px-2 py-0.5 cursor-pointer shadow-sm whitespace-nowrap"
                            title={`${pn}번 명세서 하단에 빈 상품 행 추가 · 수동 입력`}
                          >➕ 행추가</button>
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr
                    className={`border-t-4 transition-colors hover:bg-amber-50/50 ${
                      hiddenRawRows.has(ri) ? "opacity-40 line-through bg-zinc-100/60" : ""
                    } ${ri % 2 !== 0 ? "bg-gray-50/40 border-gray-100" : "border-gray-100"}`}
                    style={{ height: RAW_DATA_ROW_H, maxHeight: RAW_DATA_ROW_H, overflow: "hidden" }}
                  >
                    <td className="w-14 px-1 py-1 text-center align-middle">
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={async () => {
                            const nmIdx = dispHeaders.indexOf("품명");
                            const rowName = nmIdx >= 0 ? String(effectiveDispRows[ri]?.[nmIdx] ?? "").trim() : "";
                            if (!await confirm({ message: `이 행을 완전 삭제하시겠습니까?\n${rowName ? `· 품명: ${rowName}` : ""}\n· DB 서명 저장 · 다음 스캔에도 자동 필터`, danger: true })) return;
                            setPermanentlyDeletedRawRows(prev => { const n = new Set(prev); n.add(ri); return n; });
                            const supplier = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
                            if (supplier && rowName) {
                              setDbDeletedSignatures(prev => { const n = new Set(prev); n.add(makeRowSignature(supplier, rowName)); return n; });
                              import("../../../lib/apiClient").then(({ api }) => {
                                api.post("/api/ocr-deleted-rows", { items: [{ supplier, name: rowName }] }).catch(() => {});
                              });
                            }
                          }}
                          className="w-4 h-4 cursor-pointer accent-rose-500"
                          title="체크하면 이 행 완전 삭제 (DB 서명 저장)"
                        />
                      </div>
                    </td>
                    {getVisibleColIndices().map(origIdx => {
                      const h = dispHeaders[origIdx];
                      const ci = origIdx;
                      const isSupplier = h === "공급처";
                      const rawCell = row[ci];
                      const cell = isSupplier && rawSupplierByPage[pn] !== undefined
                        ? rawSupplierByPage[pn]
                        : rawCell;
                      const isEditingThisSupp = isSupplier && editingRawSuppRow === ri;
                      const isNum = typeof cell === "number";
                      const isAmt = h === "금액";
                      const isName = h === "품명";
                      const isEditableNum = h === "수량" || h === "단가" || h === "금액";
                      const hasDirectEdit = isEditableNum && cellEdits[ri]?.[ci] !== undefined;
                      const isCorrectedAmt = isAmt && amountCorrections[ri] !== undefined && !hasDirectEdit;

                      if (isEditingThisSupp) {
                        return (
                          <td key={ci} className="px-1 py-1" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <input
                                ref={el => {
                                  if (el && suppInputRef.current !== el) {
                                    suppInputRef.current = el;
                                    const r = el.getBoundingClientRect();
                                    setSuppDropdownRect({ top: r.bottom, left: r.left, width: Math.max(220, r.width) });
                                  }
                                }}
                                autoFocus
                                className="flex-1 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-300 rounded px-2 py-0.5 outline-none min-w-[120px]"
                                value={editingRawSuppVal}
                                onChange={e => setEditingRawSuppVal(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") { e.currentTarget.blur(); }
                                  if (e.key === "Escape") { setSuppDropdownRect(null); setEditingRawSuppRow(null); }
                                }}
                                onBlur={() => {
                                  setTimeout(() => {
                                    const trimmed = editingRawSuppVal.trim();
                                    const current = String(cell ?? "");
                                    if (trimmed && trimmed !== current) {
                                      const rowCount = pageNums.filter(p => p === pn).length;
                                      setSupplierConfirm({ pageNum: pn, newVal: trimmed, rowCount, addSynonyms: addSynonymsOnChange });
                                    }
                                    setSuppDropdownRect(null);
                                    setEditingRawSuppRow(null);
                                  }, 150);
                                }}
                              />
                              <button
                                type="button"
                                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); const name = editingRawSuppVal.trim() || String(cell ?? "").trim(); if (name) openVendorEdit(name); }}
                                className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-sky-700 bg-white border border-sky-300 hover:bg-sky-50 rounded px-1.5 py-0.5 whitespace-nowrap cursor-pointer transition"
                                title="공급사 정보 조회·수정"
                              >
                                <Search size={10} /> 조회
                              </button>
                            </div>
                          </td>
                        );
                      }

                      if (isSupplier) {
                        const cellStr = cell == null ? "" : String(cell).trim();
                        const isEmpty = !cellStr;
                        return (
                          <td key={ci}
                            onClick={e => {
                              e.stopPropagation();
                              setEditingRawSuppRow(ri);
                              setEditingRawSuppVal(String(cell ?? ""));
                            }}
                            className={
                              isEmpty
                                ? "px-2 sm:px-3 py-2 font-bold cursor-pointer bg-rose-50 hover:bg-rose-100 text-rose-700 border-l-2 border-rose-400 group max-w-[80px] sm:max-w-[140px] animate-pulse"
                                : "px-2 sm:px-3 py-2 text-sky-700 font-semibold cursor-pointer hover:bg-sky-50 group max-w-[60px] sm:max-w-[120px]"
                            }
                            title={
                              isEmpty
                                ? "공급사 미입력 — 클릭하여 입력하세요 (자동보정/저장 차단)"
                                : `클릭하여 공급처 변경${cell != null ? ` (${String(cell)})` : ""}`
                            }
                          >
                            <span className="flex items-center gap-1">
                              {isEmpty ? (
                                <span className="flex items-center gap-0.5 text-[11px] font-bold whitespace-nowrap">
                                  <AlertTriangle size={10} className="shrink-0" />
                                  공급사 필수
                                </span>
                              ) : (
                                <>
                                  <span className="break-words">{String(cell)}</span>
                                  <Pencil size={9} className="text-sky-300 opacity-0 group-hover:opacity-100 transition shrink-0" />
                                </>
                              )}
                            </span>
                          </td>
                        );
                      }

                      if (h === "일자" && pageImages?.length) {
                        return (
                          <td key={ci} className="px-2 py-1.5" onClick={e => e.stopPropagation()}>
                            <div className="flex flex-col items-start gap-0.5">
                              {cell != null && <span className="text-gray-400 text-[11px]">{String(cell)}</span>}
                              <button
                                onClick={() => openModal(ri)}
                                className="text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded px-1.5 py-0.5 leading-tight"
                              >
                                보기
                              </button>
                            </div>
                          </td>
                        );
                      }

                      if (isEditableNum) {
                        return (
                          <NumericEditableCell
                            ri={ri} ci={ci} h={h} cell={cell}
                            hasDirectEdit={hasDirectEdit} isCorrectedAmt={isCorrectedAmt}
                            focusedCell={focusedCell} editingCell={editingCell} editingCellVal={editingCellVal}
                            numCellMinW={numCellMinW} numInputMinW={numInputMinW}
                            numCellInnerCls={numCellInnerCls} reextBtnCls={reextBtnCls}
                            numericCellCycle={numericCellCycle} numericCellCandidates={numericCellCandidates}
                            noCandidateCells={noCandidateCells} dbFilledCells={dbFilledCells}
                            checkedCells={checkedCells}
                            dispHeaders={dispHeaders} effectiveDispRows={effectiveDispRows}
                            permanentlyDeletedRawRows={permanentlyDeletedRawRows}
                            hiddenRawRows={hiddenRawRows} isRowDbDeleted={isRowDbDeleted}
                            setEditingCell={setEditingCell} setEditingCellVal={setEditingCellVal}
                            setFocusedCell={setFocusedCell} commitCellEdit={commitCellEdit}
                            reextractOneCell={reextractOneCell} toggleCellCheck={toggleCellCheck}
                          />
                        );
                      }

                      if (isName) {
                        return (
                          <NameCell
                            ri={ri} ci={ci} pn={pn} cell={cell}
                            dispRows={dispRows} autoSynonymMatches={autoSynonymMatches}
                            cancelledAutoMap={cancelledAutoMap} barcodeAutoMap={barcodeAutoMap}
                            nameCellCycle={nameCellCycle} nameCellCandidates={nameCellCandidates}
                            reextractingName={reextractingName} nameIdx={nameIdx}
                            editingNameRow={editingNameRow} editingNameVal={editingNameVal}
                            rawSupplierByPage={rawSupplierByPage} structuredPages={structuredPages}
                            globalSupplier={globalSupplier} pageNums={pageNums}
                            nameInputRef={nameInputRef} nameEditSearchRef={nameEditSearchRef}
                            editingNameRowRef={editingNameRowRef}
                            setEditingNameRow={setEditingNameRow} setEditingNameVal={setEditingNameVal}
                            setAutoSynonymMatches={setAutoSynonymMatches}
                            setCancelledAutoMap={setCancelledAutoMap}
                            setCancelledAutoSyn={setCancelledAutoSyn}
                            setCellEdits={setCellEdits}
                            setNameEditResults={setNameEditResults}
                            setNameEditSearchDone={setNameEditSearchDone}
                            setNameDropdownRect={setNameDropdownRect}
                            setMatchItems={setMatchItems}
                            setDeleteSynConfirm={setDeleteSynConfirm}
                            reextractProductName={reextractProductName}
                            saveSynonym={saveSynonym}
                            confirm={confirm}
                            handleMatchPage={handleMatchPage}
                            matchRawToPurchaseHistory={matchRawToPurchaseHistory}
                            nameEditResults={nameEditResults}
                            nameEditSearchDone={nameEditSearchDone}
                          />
                        );
                      }

                      if (h === "유통기한" || h === "유효기한" || h === "유통기간") {
                        return (
                          <ExpiryCell
                            ri={ri} ci={ci} cell={cell}
                            editingCell={editingCell} editingCellVal={editingCellVal}
                            numericCellCycle={numericCellCycle}
                            numericCellCandidates={numericCellCandidates}
                            noCandidateCells={noCandidateCells}
                            numCellMinW={numCellMinW} numCellInnerCls={numCellInnerCls}
                            reextBtnCls={reextBtnCls} expInputMinW={expInputMinW}
                            setEditingCell={setEditingCell} setEditingCellVal={setEditingCellVal}
                            setCellEdits={setCellEdits}
                            reextractOneCell={reextractOneCell}
                          />
                        );
                      }

                      // ── 일반 셀 렌더링 ──
                      {
                        const cellStr = cell == null ? "" : String(cell);
                        const hasEllipsis = !isNum && /\.{3}|…/.test(cellStr);
                        const isDateCol = ["거래일", "일자", "날짜", "거래일자", "거래날짜"].includes(h);
                        const dateShort = (() => {
                          if (!isDateCol || cell == null) return null;
                          const s = String(cell).trim();
                          const m = s.match(/(\d{2,4})[-./](\d{1,2})[-./](\d{1,2})/);
                          if (m) return `${m[2].padStart(2, "0")}/${m[3].padStart(2, "0")}`;
                          return s.length > 6 ? s.slice(-5) : s;
                        })();
                        const isEditingThisDate = isDateCol && editingCell?.ri === ri && editingCell?.ci === ci;
                        if (isEditingThisDate) {
                          const commitDatePage = (v: string) => {
                            const val = v === "" ? null : v;
                            setCellEdits(prev => {
                              const next = { ...prev };
                              pageNums.forEach((rowPn, rowRi) => {
                                if (rowPn !== pn) return;
                                next[rowRi] = { ...(next[rowRi] ?? {}), [ci]: val };
                              });
                              return next;
                            });
                            if (val) setPageDateOverride(prev => ({ ...prev, [pn]: val }));
                            else setPageDateOverride(prev => { const n = { ...prev }; delete n[pn]; return n; });
                          };
                          return (
                            <td key={ci} className="px-1 py-1" onClick={e => e.stopPropagation()}>
                              <input
                                autoFocus
                                type="text"
                                inputMode="text"
                                placeholder="YYYY-MM-DD"
                                value={editingCellVal}
                                onChange={e => setEditingCellVal(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    commitDatePage(normalizeExpiryDate(editingCellVal.trim()));
                                    setEditingCell(null);
                                  } else if (e.key === "Escape") {
                                    setEditingCell(null);
                                  }
                                }}
                                onBlur={() => {
                                  commitDatePage(normalizeExpiryDate(editingCellVal.trim()));
                                  setEditingCell(null);
                                }}
                                className="w-[100px] text-[11px] font-mono text-amber-800 bg-amber-50 border border-amber-300 rounded px-1.5 py-0.5 outline-none"
                                title="이 명세서의 모든 행에 일괄 적용됩니다"
                              />
                            </td>
                          );
                        }
                        return (
                          <td key={ci}
                            onClick={isDateCol ? (e => { e.stopPropagation(); setEditingCell({ ri, ci }); setEditingCellVal(cell != null ? String(cell) : ""); }) : undefined}
                            className={`px-3 py-2 ${
                              isAmt ? "text-right font-bold text-amber-800 whitespace-nowrap" :
                              isNum ? "text-right text-gray-700 whitespace-nowrap" :
                              isDateCol ? "text-gray-500 text-[11px] font-mono whitespace-nowrap cursor-pointer hover:bg-amber-50/60" :
                              h === "품명" ? "font-semibold text-gray-900 break-words whitespace-normal align-top min-w-[180px] max-w-[240px]" :
                              hasEllipsis ? "text-gray-600 break-words whitespace-normal" :
                                            "text-gray-600 whitespace-nowrap"
                            }`}
                            title={isDateCol ? (cell != null ? `클릭하여 거래일 수정 · 저장값: ${cellStr}` : "클릭하여 거래일 입력") : undefined}>
                            {h === "품명"
                              ? <span className="block line-clamp-2">{cell == null ? <span className="text-gray-300">—</span> : renderTextWithBreaks(cellStr)}</span>
                              : isDateCol
                                ? (cell == null ? <span className="text-gray-400 italic">입력...</span> : <span>{dateShort}</span>)
                                : (cell == null ? <span className="text-gray-300">—</span> : isNum ? fmt(cell) : renderTextWithBreaks(cellStr))}
                          </td>
                        );
                      }
                    })}
                  </tr>
                  {erpSubRowPages.has(pn) && (() => {
                    const qtyIdxLoc = dispHeaders.indexOf("수량");
                    const qtyVal = qtyIdxLoc >= 0 ? parseNumber(row[qtyIdxLoc]) : null;
                    const m = cancelledRows.has(ri) ? null : (selectedCands[ri] ?? matchItems?.[ri]?.matched ?? null);
                    const autoSyn = cancelledAutoMap.has(ri) ? undefined : autoSynonymMatches[ri];
                    const bc = cancelledAutoMap.has(ri) ? null : (barcodeAutoMap[ri] ?? null);
                    const colListForSub: { origIdx: number }[] = showRawDetail
                      ? dispHeaders.map((_, i) => ({ origIdx: i }))
                      : (() => {
                          const list: { origIdx: number }[] = [];
                          for (const name of RAW_ESSENTIAL_COLS) {
                            let idx = dispHeaders.indexOf(name);
                            if (idx < 0 && name === "유통기한") {
                              for (const a of ["유효기한", "유통기간"]) { idx = dispHeaders.indexOf(a); if (idx >= 0) break; }
                            }
                            if (idx >= 0) list.push({ origIdx: idx });
                          }
                          return list;
                        })();
                    const pageSupp = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
                    return (
                      <ErpMatchSubRow
                        key={`erp-sub-${ri}`}
                        colList={colListForSub}
                        dispHeaders={dispHeaders}
                        colWidthPx={(idx) => colWidths[idx]}
                        matched={m}
                        autoSyn={autoSyn}
                        barcode={bc}
                        ocrQty={qtyVal}
                        pageSupplier={pageSupp}
                        onCancel={() => {
                          setCancelledRows(prev => new Set([...prev, ri]));
                          setCancelledAutoMap(prev => new Set([...prev, ri]));
                        }}
                      />
                    );
                  })()}
                  {isLastInPage && amtIdx >= 0 && (() => {
                    const orderNow: number[] = (() => {
                      if (showRawDetail) return dispHeaders.map((_, i) => i);
                      const list: number[] = [];
                      for (const name of RAW_ESSENTIAL_COLS) {
                        let idx = dispHeaders.indexOf(name);
                        if (idx < 0 && name === "유통기한") {
                          for (const a of ["유효기한", "유통기간"]) { idx = dispHeaders.indexOf(a); if (idx >= 0) break; }
                        }
                        if (idx >= 0) list.push(idx);
                      }
                      return list;
                    })();
                    const totalColSpan = orderNow.length + 1;
                    return (
                      <InvoicePageSummary
                        pn={pn}
                        totalColSpan={totalColSpan}
                        rawSupplierByPage={rawSupplierByPage}
                        structuredPages={structuredPages}
                        effectivePageTotals={effectivePageTotals}
                        pageSubtotalChoices={pageSubtotalChoices}
                        pageSubtotalCustom={pageSubtotalCustom}
                        pageVatIncluded={pageVatIncluded}
                        pageDiscountApplied={pageDiscountApplied}
                        pageSupplierBalances={pageSupplierBalances}
                        pageBalanceOverride={pageBalanceOverride}
                        pageBalanceModeManual={pageBalanceModeManual}
                        pageBalanceManualInput={pageBalanceManualInput}
                        editingSummary={editingSummary}
                        hasMissingSupplier={hasMissingSupplier}
                        confirmedPages={confirmedPages}
                        erpSubRowPages={erpSubRowPages}
                        matchingPage={matchingPage}
                        matchItems={matchItems}
                        getPageDisplayTotal={getPageDisplayTotal}
                        getPageDiscounts={getPageDiscounts}
                        openVendorEdit={openVendorEdit}
                        setPageSubtotalChoices={setPageSubtotalChoices}
                        setPageSubtotalCustom={setPageSubtotalCustom}
                        setPageVatIncluded={setPageVatIncluded}
                        setPageDiscountApplied={setPageDiscountApplied}
                        setPageDiscountOverride={setPageDiscountOverride}
                        setPageBalanceOverride={setPageBalanceOverride}
                        setPageBalanceModeManual={setPageBalanceModeManual}
                        setEditingSummary={setEditingSummary}
                        saveSupplierBalance={saveSupplierBalance}
                        setErpSubRowPages={setErpSubRowPages}
                        setConfirmedPages={setConfirmedPages}
                        setConfirmed={setConfirmed}
                        handleMatchPage={handleMatchPage}
                        confirm={confirm}
                      />
                    );
                  })()}
                  {isLastInPage && (() => {
                    const orderNow: number[] = (() => {
                      if (showRawDetail) return dispHeaders.map((_, i) => i);
                      const list: number[] = [];
                      for (const name of RAW_ESSENTIAL_COLS) {
                        let idx = dispHeaders.indexOf(name);
                        if (idx < 0 && name === "유통기한") {
                          for (const a of ["유효기한", "유통기간"]) { idx = dispHeaders.indexOf(a); if (idx >= 0) break; }
                        }
                        if (idx >= 0) list.push(idx);
                      }
                      return list;
                    })();
                    const rawColSpanPad = orderNow.length + 1;
                    return (
                      <tr aria-hidden="true" style={{ height: shortfallRaw + 24 }}>
                        <td colSpan={rawColSpanPad} />
                      </tr>
                    );
                  })()}
                </React.Fragment>
              );
            })}
          </tbody>
          <InvoiceTableFooter
            total={total}
            totalBreakdownTitle={totalBreakdownTitle}
            supplierTotals={supplierTotals}
            supplierBalanceRecords={supplierBalanceRecords}
            editingGrandTotal={editingGrandTotal}
            grandTotalOverride={grandTotalOverride}
            dispHeaders={dispHeaders}
            amtIdx={amtIdx}
            pageImages={pageImages}
            setEditingGrandTotal={setEditingGrandTotal}
            setGrandTotalOverride={setGrandTotalOverride}
          />
        </table>
      </div>
    </Card>
  );
};
