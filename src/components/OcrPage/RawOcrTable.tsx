import React, { useCallback, useEffect, useRef, useState } from "react";
import { useConfirm } from "../../hooks/useConfirm";
import { useToast, toastClass } from "../../hooks/useToast";
import { api } from "../../lib/apiClient";
import { SK_OCR_DISCOUNT_MODE } from "../../lib/storageKeys";

import type {
  ConfirmedItem,
  MatchedItem,
  RawOcrTableProps,
} from "./RawOcrTable/types";
import { NUM_COLS, parseNumber } from "./RawOcrTable/utils";
import { useOcrDerived } from "./RawOcrTable/useOcrDerived";
import { useAutoTemplateSave } from "./RawOcrTable/useAutoTemplateSave";
import { useAutoBalanceLoad } from "./RawOcrTable/useAutoBalanceLoad";
import { useEditMigration } from "./RawOcrTable/useEditMigration";
import { useCellNavigation } from "./RawOcrTable/useCellNavigation";
import { usePagesSnapshot } from "./RawOcrTable/usePagesSnapshot";
import { usePurchaseHistoryMatch } from "./RawOcrTable/usePurchaseHistoryMatch";
import { useAutoPipeline } from "./RawOcrTable/useAutoPipeline";
import { useHandleMatchPage } from "./RawOcrTable/useHandleMatchPage";
import { useConfRows } from "./RawOcrTable/useConfRows";
import { useSaveConfirmed } from "./RawOcrTable/useSaveConfirmed";
import { useReextractCell } from "./RawOcrTable/useReextractCell";
import { useReextractProductName } from "./RawOcrTable/useReextractProductName";
import { useHandleMatch } from "./RawOcrTable/useHandleMatch";
import { useMissingSupplierAutoFill } from "./RawOcrTable/useMissingSupplierAutoFill";
import { useSynonymCallbacks } from "./RawOcrTable/useSynonymCallbacks";
import { useExportHandlers } from "./RawOcrTable/useExportHandlers";
import { useVendorEdit } from "./RawOcrTable/useVendorEdit";
import { useErpViewState } from "./RawOcrTable/useErpViewState";
import { useMatchingState } from "./RawOcrTable/useMatchingState";
import { useXlsTemplate } from "./RawOcrTable/useXlsTemplate";
import { useInvoiceImageControls } from "./RawOcrTable/useInvoiceImageControls";
import { usePageTotalsComputation } from "./RawOcrTable/usePageTotalsComputation";
import { ConfirmedTableSection } from "./RawOcrTable/ConfirmedTableSection";
import { FallbackPageSection } from "./RawOcrTable/FallbackPageSection";
import { RawInvoiceCard } from "./RawOcrTable/RawInvoiceCard";
import { RawOcrTableOverlays } from "./RawOcrTable/RawOcrTableOverlays";
import { REPARSE_APPROACH_CYCLE, APPROACH_LABEL, APPROACH_SHORT, CONF_HEADERS, COL_ALIAS, RAW_ESSENTIAL_COLS } from "./RawOcrTable/ocrConstants";
import { useRowCallbacks } from "./RawOcrTable/useRowCallbacks";
import { useAutoReparse } from "./RawOcrTable/useAutoReparse";

export type { ConfirmedItem }; // re-export for OcrPage.tsx consumers

export const RawOcrTable: React.FC<RawOcrTableProps> = ({ pages: pagesFromProps, pageImages, rotation = -90, onReparsePage, barcodeMatches, balanceConfig: balanceConfigProp, onSaveConfirmed, onUserEdit }) => {
  const confirm = useConfirm();
  const { toast, showError } = useToast();
  const pages = usePagesSnapshot(pagesFromProps);
  const { structuredPages, fallbackPages, dispHeaders, dispRows, rawRows, pageNums, amtIdx, nameIdx } = useOcrDerived(pages);

  const {
    vendorNames,
    vendorEditModal, setVendorEditModal,
    editingRawSuppRow, setEditingRawSuppRow,
    editingRawSuppVal, setEditingRawSuppVal,
    supplierConfirm, setSupplierConfirm,
    suppDropdownRect, setSuppDropdownRect,
    suppInputRef,
    openVendorEdit,
  } = useVendorEdit({ confirm, showError });
  const [rawSupplierByPage, setRawSupplierByPage] = useState<Record<number, string>>({});
  const [editingNameRow, setEditingNameRow] = useState<number | null>(null);
  const [editingNameVal, setEditingNameVal] = useState<string>("");
  const editingNameRowRef = useRef<number | null>(null);
  useEffect(() => { if (editingNameRow != null) editingNameRowRef.current = editingNameRow; }, [editingNameRow]);
  const nameEditSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nameEditResults, setNameEditResults] = useState<any[]>([]);
  const [nameEditSearchDone, setNameEditSearchDone] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [nameDropdownRect, setNameDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [deleteSynConfirm, setDeleteSynConfirm] = useState<{ ri: number; origName: string } | null>(null);
  const [checkedCells, setCheckedCells] = useState<Set<string>>(new Set());
  const toggleCellCheck = useCallback((ri: number, ci: number) => {
    setCheckedCells(prev => { const n = new Set(prev); const k = `${ri}:${ci}`; if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }, []);
  const clearCheckedCells = useCallback(() => setCheckedCells(new Set()), []);
  void clearCheckedCells;

  const [amountCorrections, setAmountCorrections] = useState<Record<number, number>>({});
  const [pageSubtotalChoices, setPageSubtotalChoices] = useState<Record<number, "stated" | "computed" | "custom">>({});
  const [grandTotalOverride, setGrandTotalOverride] = useState<number | null>(null);
  const [editingGrandTotal, setEditingGrandTotal] = useState<string | null>(null);
  const [pageVatIncluded, setPageVatIncluded] = useState<Record<number, boolean>>({});
  const [pageDiscountApplied, setPageDiscountApplied] = useState<Record<number, boolean>>({});
  const [discountApplyMode, setDiscountApplyMode] = useState<Record<number, "before" | "after">>(() => {
    try { const v = localStorage.getItem(SK_OCR_DISCOUNT_MODE); return v ? JSON.parse(v) : {}; } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(SK_OCR_DISCOUNT_MODE, JSON.stringify(discountApplyMode)); } catch { /* empty */ }
  }, [discountApplyMode]);
  const [pageSubtotalCustom, setPageSubtotalCustom] = useState<Record<number, number>>({});
  const [pageSupplierBalances, setPageSupplierBalances] = useState<Record<number, number>>({});
  const [supplierBalanceRecords, setSupplierBalanceRecords] = useState<{ id: number; supplier_name: string; invoice_date: string | null; balance: number; created_at: string }[]>([]);
  const [pageBalanceOverride, setPageBalanceOverride] = useState<Record<number, number>>({});
  const [pageDateOverride, setPageDateOverride] = useState<Record<number, string>>({});
  const [confImageCollapsed, setConfImageCollapsed] = useState(false);
  const [confImageZoom, setConfImageZoom] = useState<Record<number, number>>({});
  const [confImagePan, setConfImagePan] = useState<Record<number, { x: number; y: number }>>({});
  const confImageDragRef = useRef<{ pn: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = confImageDragRef.current;
      if (!d) return;
      setConfImagePan(prev => ({ ...prev, [d.pn]: { x: d.baseX + (e.clientX - d.startX), y: d.baseY + (e.clientY - d.startY) } }));
    };
    const onUp = () => { confImageDragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);
  const [editingConfDate, setEditingConfDate] = useState<number | null>(null);
  const [editingConfDateVal, setEditingConfDateVal] = useState<string>("");
  const [pageDiscountOverride, setPageDiscountOverride] = useState<Record<number, { amount: number; label: string }>>({});
  const [editingSummary, setEditingSummary] = useState<{ pn: number; kind: "discount" | "balance" | "subtotal"; value: string; dirty?: boolean } | null>(null);
  const [pageBalanceManualInput, setPageBalanceManualInput] = useState<Record<number, string>>({});
  const [pageBalanceModeManual, setPageBalanceModeManual] = useState<Set<number>>(new Set());
  const [synonymsMap, setSynonymsMap] = useState<Map<string, { name: string; code: string }>>(new Map());
  const loadSynonymsMap = useCallback(async () => {
    try {
      const { data: d } = await api.get<{ synonyms?: any[] }>("/api/ocr-synonyms");
      const m = new Map<string, { name: string; code: string }>();
      for (const syn of (d.synonyms ?? [])) {
        if (syn.cancelled) continue;
        const key = String(syn.prod_name_old ?? "").trim().toLowerCase();
        if (key && syn.prod_name_new) m.set(key, { name: String(syn.prod_name_new), code: String(syn.product_code ?? "") });
      }
      setSynonymsMap(m);
      console.log(`[synonymsMap] 로드 · ${m.size}건`);
    } catch { /* silent */ }
  }, []);
  useEffect(() => { loadSynonymsMap(); }, [loadSynonymsMap]);
  const [collapsedConfCols, setCollapsedConfCols] = useState<Set<string>>(new Set());
  const showRawDetail = false;
  const setShowRawDetail = (_: boolean) => { /* no-op */ };
  void setShowRawDetail;
  const [colWidths, setColWidths] = useState<Record<number, number>>({});
  const resizeRef = useRef<{ ci: number; startX: number; startW: number } | null>(null);

  const { erpCellEdits } = useErpViewState();

  const [cellEdits, setCellEdits] = useState<Record<number, Record<number, string | number | null>>>({});
  useEffect(() => {
    if (!onUserEdit) return;
    if (Object.keys(cellEdits).length > 0) onUserEdit();
  }, [cellEdits, onUserEdit]);
  const prevCellEditsSizeRef = useRef(0);
  useEffect(() => {
    const size = Object.values(cellEdits).reduce<number>((s, row) => s + Object.keys(row as object).length, 0);
    if (size < prevCellEditsSizeRef.current) console.warn(`[cellEdits 손실] ${prevCellEditsSizeRef.current} → ${size}`);
    prevCellEditsSizeRef.current = size;
  }, [cellEdits]);
  const [editingCell, setEditingCell] = useState<{ ri: number; ci: number } | null>(null);
  const [editingCellVal, setEditingCellVal] = useState("");
  const [focusedCell, setFocusedCell] = useState<{ ri: number; ci: number } | null>(null);
  const [numericCellCycle, setNumericCellCycle] = useState<Record<string, number>>({});
  const [numericCellCandidates, setNumericCellCandidates] = useState<Record<string, (string | number)[]>>({});
  const [noCandidateCells, setNoCandidateCells] = useState<Set<string>>(new Set());
  const [hiddenRawRows, setHiddenRawRows] = useState<Set<number>>(new Set());
  const toggleHiddenRawRowRef = useRef<(ri: number) => void>(() => {});
  const toggleHiddenRawRow = useCallback((ri: number) => toggleHiddenRawRowRef.current(ri), []);
  const [permanentlyDeletedRawRows, setPermanentlyDeletedRawRows] = useState<Set<number>>(new Set());
  const commitRawRowsDeletionRef = useRef<() => void | Promise<void>>(() => {});
  const commitRawRowsDeletion = useCallback(() => commitRawRowsDeletionRef.current(), []);
  const revertSelectedRawRows = useCallback(() => {
    if (hiddenRawRows.size === 0) return;
    setCellEdits(prev => { const next = { ...prev }; hiddenRawRows.forEach(ri => { delete next[ri]; }); return next; });
    setAmountCorrections(prev => { const next = { ...prev }; hiddenRawRows.forEach(ri => { delete next[ri]; }); return next; });
    setPermanentlyDeletedRawRows(prev => { const n = new Set(prev); hiddenRawRows.forEach(ri => n.delete(ri)); return n; });
    setHiddenRawRows(new Set());
  }, [hiddenRawRows]);
  const [reextractCycle, setReextractCycle] = useState<Record<number, number>>({});
  const [dbDeletedSignatures, setDbDeletedSignatures] = useState<Set<string>>(new Set());
  const normNameForSig = useCallback((s: string) =>
    s.toLowerCase().replace(/[\s\-_()（）,·./[\]{}「」『』@*※~+【】<>《》"'`^!?:;|]/g, "").trim(), []);
  const normSupplierForSig = useCallback((s: string) =>
    s.replace(/주식회사|유한회사|㈜|\(주\)|\(유\)|\(재\)/gi, "").replace(/\s+/g, "").toLowerCase(), []);
  const makeRowSignature = useCallback((supplier: string, name: string) =>
    `${normSupplierForSig(supplier)}|${normNameForSig(name)}`, [normSupplierForSig, normNameForSig]);
  useEffect(() => {
    api.get<{ rows?: any[] }>("/api/ocr-deleted-rows")
      .then(({ data }) => {
        if (Array.isArray(data?.rows)) setDbDeletedSignatures(new Set(data.rows.map((r: any) => String(r.signature ?? ""))));
      }).catch(() => {});
  }, []);
  const [manualRows, setManualRows] = useState<Array<{ pageNum: number; values: (string | number | null)[] }>>([]);
  const addManualRow = useCallback((pn: number) => setManualRows(prev => [...prev, { pageNum: pn, values: [] }]), []);
  const updateManualRow = useCallback((mIdx: number, ci: number, val: string, isNumeric: boolean) => {
    setManualRows(prev => prev.map((r, i) => {
      if (i !== mIdx) return r;
      const nv = [...r.values];
      if (isNumeric) { const num = parseNumber(val.replace(/,/g, "")); nv[ci] = num > 0 ? num : (val.trim() ? val : null); }
      else nv[ci] = val.trim() || null;
      return { ...r, values: nv };
    }));
  }, []);
  const removeManualRow = useCallback((mIdx: number) => setManualRows(prev => prev.filter((_, i) => i !== mIdx)), []);

  const effectiveDispRowsRef = useRef<(string | number | null)[][]>([]);

  // ── 단일 셀 재추출 + 행 복원 → useReextractCell 훅으로 분리 ──────────────
  const matchItemsRef = useRef<MatchedItem[] | null>(null);
  const { reextractOneCell, revertSingleRawRow } = useReextractCell({
    pageNums, structuredPages, pages, dispHeaders, dispRows, rawRows,
    nameIdx, amtIdx, numericCellCycle, numericCellCandidates, noCandidateCells,
    cellEdits, reextractCycle, effectiveDispRowsRef, matchItemsRef,
    setNumericCellCycle, setNumericCellCandidates, setNoCandidateCells,
    setCellEdits, setAmountCorrections, setPermanentlyDeletedRawRows,
    setHiddenRawRows, setReextractCycle,
  });

  const [addSynonymsOnChange, setAddSynonymsOnChange] = useState(true);
  const [synonymAddStatus, setSynonymAddStatus] = useState<{ pageNum: number; status: 'loading' | 'done' | 'error'; count: number } | null>(null);
  type ReparseStatus = 'loading' | 'done' | 'error' | 'saved';
  const [reparseStatus,   setReparseStatus  ] = useState<Record<number, ReparseStatus>>({});
  const [reparseSupplier, setReparseSupplier] = useState<Record<number, string>>({});
  const [reparseAttempt, setReparseAttempt] = useState<Record<number, number>>({});

  // effectiveDispRows: cellEdits + amountCorrections 반영, Q*P=A 엄격 정책 (단가 없으면 금액 null)
  const _qtyIdxER = dispHeaders.indexOf("수량");
  const _priIdxER = dispHeaders.indexOf("단가");
  const effectiveDispRows = dispRows.map((row, ri) => {
    const edits = cellEdits[ri];
    const nr = [...row];
    if (amtIdx >= 0 && amountCorrections[ri] !== undefined) nr[amtIdx] = amountCorrections[ri];
    if (edits) for (const [ciStr, val] of Object.entries(edits)) nr[Number(ciStr)] = val as string | number;
    if (amtIdx >= 0 && _qtyIdxER >= 0 && _priIdxER >= 0) {
      const q = parseNumber(nr[_qtyIdxER]);
      const p = parseNumber(nr[_priIdxER]);
      const userEditedAmt = edits && edits[amtIdx] != null;
      if (q > 0 && p > 0 && !userEditedAmt) nr[amtIdx] = Math.ceil((q * p) / 10) * 10;
      else if (!userEditedAmt) nr[amtIdx] = null;
    }
    return nr;
  });

  // ref 동기화 (revertSingleRawRow 가 인접 행 접근할 때 사용)
  effectiveDispRowsRef.current = effectiveDispRows;

  // 보정 반영된 페이지별 합계 (사용자가 삭제 마킹/확정 삭제한 행은 제외)
  // DB에 저장된 삭제 서명(공급사+품명)과 매치되는지
  const isRowDbDeleted = (ri: number): boolean => {
    if (dbDeletedSignatures.size === 0) return false;
    const row = effectiveDispRows[ri] ?? dispRows[ri];
    if (!Array.isArray(row)) return false;
    const nameIdxLocal = dispHeaders.indexOf("품명");
    if (nameIdxLocal < 0) return false;
    const name = String(row[nameIdxLocal] ?? "").trim();
    if (!name) return false;
    const pn = pageNums[ri];
    const supplier = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
    if (!supplier) return false;
    return dbDeletedSignatures.has(makeRowSignature(supplier, name));
  };
  const isRowDeleted = (ri: number) => hiddenRawRows.has(ri) || permanentlyDeletedRawRows.has(ri) || isRowDbDeleted(ri);

  toggleHiddenRawRowRef.current = (ri: number) => {
    setHiddenRawRows(prev => { const n = new Set(prev); if (n.has(ri)) n.delete(ri); else n.add(ri); return n; });
  };

  useCellNavigation({
    focusedCell, editingCell, dispHeaders, effectiveDispRows,
    permanentlyDeletedRawRows, hiddenRawRows, isRowDbDeleted,
    setFocusedCell, setEditingCell, setEditingCellVal,
  });

  commitRawRowsDeletionRef.current = async () => {
    if (hiddenRawRows.size === 0) return;
    const cnt = hiddenRawRows.size;
    if (!await confirm({ message: `체크된 ${cnt}개 행을 완전히 삭제하시겠습니까?\n· DB에 서명이 저장되어 다음 스캔에도 자동 필터됩니다.`, danger: true })) return;
    const nameIdxLocal = dispHeaders.indexOf("품명");
    const items: Array<{ supplier: string; name: string }> = [];
    hiddenRawRows.forEach(ri => {
      const row = effectiveDispRows[ri] ?? dispRows[ri];
      if (!Array.isArray(row)) return;
      const pn = pageNums[ri];
      const supplier = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
      const name = nameIdxLocal >= 0 ? String(row[nameIdxLocal] ?? "").trim() : "";
      if (supplier && name) items.push({ supplier, name });
    });
    setPermanentlyDeletedRawRows(prev => { const n = new Set(prev); hiddenRawRows.forEach(ri => n.add(ri)); return n; });
    setDbDeletedSignatures(prev => { const n = new Set(prev); items.forEach(it => n.add(makeRowSignature(it.supplier, it.name))); return n; });
    setHiddenRawRows(new Set());
    if (items.length > 0) api.post("/api/ocr-deleted-rows", { items }).catch(() => {});
  };
  const _qtyIdxForEff = dispHeaders.indexOf("수량");
  const _priIdxForEff = dispHeaders.indexOf("단가");
  const getRowEffectiveAmount = (row: any[]): number => {
    if (amtIdx < 0) return 0;
    const raw = parseNumber(row[amtIdx]);
    if (raw > 0) return raw;
    if (_qtyIdxForEff >= 0 && _priIdxForEff >= 0) {
      const q = parseNumber(row[_qtyIdxForEff]);
      const p = parseNumber(row[_priIdxForEff]);
      if (q > 0 && p > 0) return Math.ceil((q * p) / 10) * 10;
    }
    return 0;
  };
  const effectivePageTotals = new Map<number, number>();
  if (amtIdx >= 0) {
    effectiveDispRows.forEach((row, ri) => {
      if (isRowDeleted(ri)) return;
      const pn = pageNums[ri];
      effectivePageTotals.set(pn, (effectivePageTotals.get(pn) ?? 0) + getRowEffectiveAmount(row));
    });
  }

  // ── 페이지 소계 계산 함수들 → usePageTotalsComputation 훅으로 분리 ─────────────────
  const {
    getPageDiscounts, getPageDiscount, getPageCrossCheckWarning,
    getPageDisplayTotal, getPageDisplayTotalWithVat, getPageConfirmedSubtotal,
    total, totalBreakdownTitle, meta, balanceConfig,
    uniquePageNums, pageBalanceFromConfig,
    supplierTotals, _discountIdxEarly,
  } = usePageTotalsComputation({
    structuredPages, pages, pageNums, amtIdx,
    dispRows, dispHeaders, effectiveDispRows, effectivePageTotals,
    hiddenRawRows, permanentlyDeletedRawRows, isRowDbDeleted,
    pageDiscountOverride, pageSubtotalChoices, pageSubtotalCustom,
    pageDiscountApplied, discountApplyMode, pageVatIncluded,
    rawSupplierByPage, balanceConfigProp,
  });


  // ── 이미지 컬럼 리사이즈 · 줌/팬 · 모달 → useInvoiceImageControls 훅으로 분리 ────
  const {
    INV_COL_DEFAULT, invoiceColWidth, setInvoiceColWidth, invColResizing,
    invTableWrapRef, containerWidth, effectiveInvColWidth,
    _cw, numCellMinW, expCellMinW, numInputMinW, expInputMinW, reextBtnCls, numCellInnerCls,
    onInvColResizeStart,
    pageZoom, pagePan, panDragRef,
    zoomIn, zoomOut, zoomReset, onImgPanStart,
    modalImg, modalPageNum, modalLabel, zoom, setZoom, pan, setPan, isDragging,
    viewportRef, viewportCbRef,
    closeModal, openModal, openPageModal, gotoModalPage,
    onMouseDown, onMouseMove, onMouseUp, onDblClick,
  } = useInvoiceImageControls({ pageImages, pageNums, dispRows, nameIdx });

  // ── 상품명 보정 ──────────────────────────────────────────────────────────
  // ── 매칭 상태 → useMatchingState 훅으로 분리 ──────────────────────────────
  const {
    matching, setMatching, matchItems, setMatchItems,
    erpSubRowPages, setErpSubRowPages,
    overrides, setOverrides, supplierOverrides, setSupplierOverrides,
    confirmed, setConfirmed, confirmedAt, setConfirmedAt,
    setSavedSynonyms,
    setSavedSupplierAliases,
    retryingRows, setRetryingRows,
    candidatesMap, setCandidatesMap, openCandRow, setOpenCandRow,
    selectedCands, setSelectedCands,
    nameSearchResults, setNameSearchResults,
    nameSearchOpenRow, setNameSearchOpenRow, nameSearchDebounce,
    pendingSyn, setPendingSyn, savedSynonymIds, setSavedSynonymIds,
    cancelledAutoSyn, setCancelledAutoSyn,
    cancelledAutoMap, setCancelledAutoMap,
    cancelledRows, setCancelledRows,
    savingConfirmed, setSavingConfirmed,
    saveConfirmedToast, setSaveConfirmedToast,
    rawEditValues, setRawEditValues,
    confirmedPages, setConfirmedPages,
    dbFilledCells, setDbFilledCells,
    autoSynonymMatches, setAutoSynonymMatches,
    autoSynonymLoading, setAutoSynonymLoading,
    barcodeAutoMap, setBarcodeAutoMap,
    deleteSynonymByName, selectCandidate,
  } = useMatchingState({ matchItemsRef });

  // autoSynonymMatches 변경 시 onUserEdit 트리거 (Feature 3 · 자동 동의어 보정)
  useEffect(() => {
    if (!onUserEdit) return;
    if (Object.keys(autoSynonymMatches).length > 0) onUserEdit();
  }, [autoSynonymMatches, onUserEdit]);
  // 2026-07-24 · 편집 stable-key 마이그레이션
  useEditMigration({ pageNums, dispHeaders, setCellEdits, setAutoSynonymMatches });

  const ocrQtyIdx  = dispHeaders.indexOf("수량");
  const ocrPriIdx  = dispHeaders.indexOf("단가");
  const ocrSpecIdx = dispHeaders.indexOf("규격");
  const ocrSuppIdx = dispHeaders.indexOf("공급처");
  const globalSupplier = pages.map(p => p.meta.supplier).find(Boolean) ?? null;

  const { missingSupplierPages, hasMissingSupplier } = useMissingSupplierAutoFill({
    structuredPages, rawSupplierByPage, vendorNames, setRawSupplierByPage,
  });
  const _handleSynonymBulkAddRef = useRef<(pageNum: number, newSupplier: string) => Promise<void>>(async () => {});
  const {
    saveSynonym, deleteSynonymForRow, saveSupplierAlias, saveSupplierBalance,
    handleSynonymBulkAdd, saveTemplate,
  } = useSynonymCallbacks({
    nameIdx, pageNums, dispRows, structuredPages, rawSupplierByPage,
    savedSynonymIds, synonymsMap,
    setSavedSynonyms, setSavedSynonymIds, setSynonymsMap, setSynonymAddStatus,
    setOverrides, setSelectedCands, setPendingSyn, setCancelledRows,
    setReparseStatus, setSupplierBalanceRecords,
    handleSynonymBulkAddRef: _handleSynonymBulkAddRef,
  });
  void barcodeMatches;
  useAutoTemplateSave({ structuredPages, rawSupplierByPage, saveTemplate });
  const { commitCellEdit, handleRetry, searchByName, handleSelectCandidate } = useRowCallbacks({
    dispHeaders, dispRows, retryingRows, openCandRow, nameSearchDebounce,
    selectCandidate, saveSynonym, setCellEdits, setEditingCell,
    setRetryingRows, setCandidatesMap, setOpenCandRow, setNameSearchResults, setNameSearchOpenRow,
  });
  const { handleSaveConfirmed } = useSaveConfirmed({
    onSaveConfirmed, pageImages,
    rowData: { effectiveDispRows, pageNums, dispHeaders, nameIdx, amtIdx, ocrSuppIdx, ocrQtyIdx, ocrPriIdx },
    supplierData: { rawSupplierByPage, supplierOverrides, globalSupplier, missingSupplierPages, structuredPages },
    matchData: { matchItems, cancelledRows, selectedCands, cancelledAutoMap, autoSynonymMatches, barcodeAutoMap, cancelledAutoSyn, overrides },
    balanceData: { pageSupplierBalances, pageBalanceOverride, pageBalanceFromConfig, discountApplyMode, pageSubtotalChoices, erpCellEdits, confirmedAt },
    filterData: { permanentlyDeletedRawRows, hiddenRawRows, isRowDbDeleted },
    getPageDiscount, getPageDisplayTotal, setSaveConfirmedToast, setSavingConfirmed,
  });
  const { handleMatch } = useHandleMatch({
    nameIdx, ocrSuppIdx, dispRows, pageNums,
    rawSupplierByPage, structuredPages, globalSupplier,
    missingSupplierPages, cellEdits, autoSynonymMatches,
    hiddenRawRows, permanentlyDeletedRawRows, isRowDbDeleted,
    showError, setMatching, setMatchItems, setOverrides, setSupplierOverrides, setConfirmed,
    setSavedSynonyms, setSavedSupplierAliases, setRetryingRows, setCandidatesMap, setOpenCandRow,
    setSelectedCands, setCancelledRows,
  });
  const { matchingPage, handleMatchPage, fillMissingPricesFromDB, verifyAndSwapPricesWithDB } = useHandleMatchPage({
    dispHeaders, dispRows, nameIdx, pageNums, rawSupplierByPage, ocrSuppIdx,
    structuredPages, globalSupplier, cellEdits, autoSynonymMatches,
    hiddenRawRows, permanentlyDeletedRawRows, isRowDbDeleted,
    pageBalanceOverride, pageSupplierBalances, saveSupplierBalance,
    matchItems, setMatchItems, setConfirmedPages,
    setCellEdits, setDbFilledCells, setSaveConfirmedToast, matchItemsRef,
  });

  const { matchRawToPurchaseHistory } = usePurchaseHistoryMatch({
    dispHeaders, matchItems, dispRows, pageNums,
    permanentlyDeletedRawRows, hiddenRawRows, isRowDbDeleted,
    setCellEdits, setDbFilledCells, setSaveConfirmedToast,
  });

  const [reextractingName, setReextractingName] = useState<Set<number>>(new Set());
  const [nameCellCandidates, setNameCellCandidates] = useState<Record<number, string[]>>({});
  const [nameCellCycle, setNameCellCycle] = useState<Record<number, number>>({});
  const { reextractProductName } = useReextractProductName({
    reextractingName, dispHeaders, dispRows, cellEdits, pageNums,
    rawSupplierByPage, structuredPages, pages, globalSupplier, nameIdx,
    synonymsMap, nameCellCandidates, nameCellCycle,
    saveSynonym, loadSynonymsMap, handleMatchPage, showError,
    setReextractingName, setNameCellCandidates, setNameCellCycle,
    setAutoSynonymMatches, setCancelledAutoSyn, setCancelledAutoMap,
    setMatchItems, setCellEdits,
  });

  const { runColumnPipeline, runningPipeline } = useAutoPipeline({
    structuredPages, confirmedPages, pageNums,
    cellEdits, autoSynonymMatches,
    handleMatchPage, fillMissingPricesFromDB, verifyAndSwapPricesWithDB, matchRawToPurchaseHistory,
    setConfirmedPages, setCellEdits, setAutoSynonymMatches, setSaveConfirmedToast,
  });

  useAutoReparse({ structuredPages, pageImages, effectivePageTotals, rawSupplierByPage, onReparsePage, setSaveConfirmedToast });

  const {
    xlsTemplate, setXlsTemplate,
    xlsTemplateName, setXlsTemplateName,
    xlsTemplateHdrs, setXlsTemplateHdrs,
    xlsTemplateSaved, setXlsTemplateSaved,
    xlsInputRef,
  } = useXlsTemplate();
  useEffect(() => {
    // 2026-08-21 · Framework Phase 3 · fetch → apiClient
    api.get<{ balances?: any[] }>("/api/supplier-balances")
      .then(({ data }) => { if (Array.isArray(data.balances)) setSupplierBalanceRecords(data.balances); })
      .catch(() => {});
  }, []);
  useAutoBalanceLoad({ supplierBalanceRecords, structuredPages, rawSupplierByPage, setPageBalanceOverride });


  // ── 확정표 행 계산 → useConfRows 훅으로 분리 ───────────────────────────────────────
  const { confRows, confAmtIdx, confPageTotals, confTotal, confSupplierTotals } = useConfRows({
    matchItems, effectiveDispRows, pageNums,
    permanentlyDeletedRawRows, isRowDbDeleted, hiddenRawRows,
    confirmedPages, nameIdx, ocrQtyIdx, ocrPriIdx, ocrSpecIdx, ocrSuppIdx,
    amtIdx, dispHeaders, cancelledRows, selectedCands, cancelledAutoMap,
    autoSynonymMatches, barcodeAutoMap, erpCellEdits, cellEdits,
    rawSupplierByPage, structuredPages, globalSupplier, supplierOverrides,
    pageDateOverride, pageSupplierBalances, pageBalanceOverride,
    pageBalanceModeManual, pageBalanceManualInput, confirmedAt,
    CONF_HEADERS, uniquePageNums, getPageConfirmedSubtotal,
  });
  // 2026-07-20: export 로직 → ./RawOcrTable/exportHelpers.ts 분리 · state 는 부모 유지
  const { handleExport, handleErpUploadExport, handleExcelExport, handleTemplateUpload } = useExportHandlers({
    matchItems, confRows, CONF_HEADERS, COL_ALIAS, pageNums, uniquePageNums,
    confAmtIdx, confPageTotals, confTotal, rawSupplierByPage, structuredPages, meta,
    xlsTemplate, xlsTemplateName, xlsTemplateHdrs, pageDateOverride, barcodeAutoMap,
    setXlsTemplate, setXlsTemplateName, setXlsTemplateHdrs,
  });
  if (pages.length === 0) return null;

  const autoSynonymCount = Object.keys(autoSynonymMatches).length;

  return (
    <>
    <RawOcrTableOverlays
      saveConfirmedToast={saveConfirmedToast}
      toast={toast}
      toastClass={toastClass}
      nameDropdownRect={nameDropdownRect}
      nameEditResults={nameEditResults}
      nameEditSearchDone={nameEditSearchDone}
      editingNameRow={editingNameRow}
      editingNameRowRef={editingNameRowRef}
      autoSynonymMatches={autoSynonymMatches}
      dispRows={dispRows}
      nameIdx={nameIdx}
      pageNums={pageNums}
      rawSupplierByPage={rawSupplierByPage}
      structuredPages={structuredPages}
      globalSupplier={globalSupplier}
      matchItems={matchItems}
      setAutoSynonymMatches={setAutoSynonymMatches}
      setCancelledAutoSyn={setCancelledAutoSyn}
      setCancelledAutoMap={setCancelledAutoMap}
      setRawEditValues={setRawEditValues}
      setMatchItems={setMatchItems}
      confirm={confirm}
      saveSynonym={saveSynonym}
      setCellEdits={setCellEdits}
      setEditingNameRow={setEditingNameRow}
      setNameEditResults={setNameEditResults}
      setNameEditSearchDone={setNameEditSearchDone}
      setNameDropdownRect={setNameDropdownRect}
      handleMatchPage={handleMatchPage}
      matchRawToPurchaseHistory={matchRawToPurchaseHistory}
      deleteSynConfirm={deleteSynConfirm}
      setDeleteSynConfirm={setDeleteSynConfirm}
      deleteSynonymByName={deleteSynonymByName}
      editingRawSuppRow={editingRawSuppRow}
      suppDropdownRect={suppDropdownRect}
      suppInputRef={suppInputRef}
      editingRawSuppVal={editingRawSuppVal}
      vendorNames={vendorNames}
      addSynonymsOnChange={addSynonymsOnChange}
      setSupplierConfirm={setSupplierConfirm}
      setSuppDropdownRect={setSuppDropdownRect}
      setEditingRawSuppRow={setEditingRawSuppRow}
      vendorEditModal={vendorEditModal}
      setVendorEditModal={setVendorEditModal}
      supplierConfirm={supplierConfirm}
      nameIdxForDialog={nameIdx}
      setRawSupplierByPage={setRawSupplierByPage}
      handleSynonymBulkAdd={handleSynonymBulkAdd}
      onReparsePage={onReparsePage}
      setReparseStatus={setReparseStatus}
      setReparseSupplier={setReparseSupplier}
    />

    {/* ── 명세서별 이미지+테이블 2컬럼 그리드 (per-page pair) ── */}
    {/* 이미지 컬럼 폭 CSS variable · 드래그 리사이즈로 조절 */}
    <div
      className="w-full flex flex-col gap-0"
      style={{ "--inv-col-w": `${invoiceColWidth}px` } as React.CSSProperties}
    >

      {/* ── 콘텐츠 래퍼 ── */}
      <div className="w-full flex flex-col gap-3">

      {/* ── OCR 원본 표 (이미지+테이블 2컨럼 · rowSpan 방식) ── */}
      {structuredPages.length > 0 && (
        <RawInvoiceCard
          rawRows={rawRows}
          dispHeaders={dispHeaders}
          dispRows={dispRows}
          effectiveDispRows={effectiveDispRows}
          pageNums={pageNums}
          nameIdx={nameIdx}
          amtIdx={amtIdx}
          ocrQtyIdx={ocrQtyIdx}
          ocrPriIdx={ocrPriIdx}
          _discountIdxEarly={_discountIdxEarly}
          structuredPages={structuredPages}
          meta={meta}
          RAW_ESSENTIAL_COLS={RAW_ESSENTIAL_COLS}
          NUM_COLS={NUM_COLS}
          showRawDetail={showRawDetail}
          permanentlyDeletedRawRows={permanentlyDeletedRawRows}
          hiddenRawRows={hiddenRawRows}
          isRowDbDeleted={isRowDbDeleted}
          invTableWrapRef={invTableWrapRef}
          effectiveInvColWidth={effectiveInvColWidth}
          invColResizing={invColResizing}
          INV_COL_DEFAULT={INV_COL_DEFAULT}
          containerWidth={containerWidth}
          _cw={_cw}
          numCellMinW={numCellMinW}
          expCellMinW={expCellMinW}
          reextBtnCls={reextBtnCls}
          numCellInnerCls={numCellInnerCls}
          numInputMinW={numInputMinW}
          expInputMinW={expInputMinW}
          colWidths={colWidths}
          resizeRef={resizeRef}
          pageImages={pageImages}
          pageZoom={pageZoom}
          pagePan={pagePan}
          panDragRef={panDragRef}
          rotation={rotation}
          rawSupplierByPage={rawSupplierByPage}
          globalSupplier={globalSupplier}
          editingRawSuppRow={editingRawSuppRow}
          editingRawSuppVal={editingRawSuppVal}
          suppInputRef={suppInputRef}
          addSynonymsOnChange={addSynonymsOnChange}
          autoSynonymLoading={autoSynonymLoading}
          autoSynonymMatches={autoSynonymMatches}
          synonymAddStatus={synonymAddStatus}
          hasMissingSupplier={hasMissingSupplier}
          missingSupplierPages={missingSupplierPages}
          reparseStatus={reparseStatus}
          reparseSupplier={reparseSupplier}
          cellEdits={cellEdits}
          editingCell={editingCell}
          editingCellVal={editingCellVal}
          focusedCell={focusedCell}
          amountCorrections={amountCorrections}
          editingNameRow={editingNameRow}
          editingNameVal={editingNameVal}
          editingNameRowRef={editingNameRowRef}
          nameInputRef={nameInputRef}
          nameEditSearchRef={nameEditSearchRef}
          nameEditResults={nameEditResults}
          nameEditSearchDone={nameEditSearchDone}
          nameCellCycle={nameCellCycle}
          nameCellCandidates={nameCellCandidates}
          reextractingName={reextractingName}
          matchItems={matchItems}
          cancelledAutoMap={cancelledAutoMap}
          cancelledRows={cancelledRows}
          selectedCands={selectedCands}
          barcodeAutoMap={barcodeAutoMap}
          numericCellCycle={numericCellCycle}
          numericCellCandidates={numericCellCandidates}
          noCandidateCells={noCandidateCells}
          dbFilledCells={dbFilledCells}
          checkedCells={checkedCells}
          effectivePageTotals={effectivePageTotals}
          pageSubtotalChoices={pageSubtotalChoices}
          pageSubtotalCustom={pageSubtotalCustom}
          pageVatIncluded={pageVatIncluded}
          pageDiscountApplied={pageDiscountApplied}
          pageSupplierBalances={pageSupplierBalances}
          supplierBalanceRecords={supplierBalanceRecords}
          pageBalanceOverride={pageBalanceOverride}
          pageBalanceModeManual={pageBalanceModeManual}
          pageBalanceManualInput={pageBalanceManualInput}
          editingSummary={editingSummary}
          supplierTotals={supplierTotals}
          total={total}
          totalBreakdownTitle={totalBreakdownTitle}
          editingGrandTotal={editingGrandTotal}
          grandTotalOverride={grandTotalOverride}
          erpSubRowPages={erpSubRowPages}
          matchingPage={matchingPage}
          confirmedPages={confirmedPages}
          pageDateOverride={pageDateOverride}
          onInvColResizeStart={onInvColResizeStart}
          setInvoiceColWidth={setInvoiceColWidth}
          onImgPanStart={onImgPanStart}
          openPageModal={openPageModal}
          zoomOut={zoomOut}
          zoomReset={zoomReset}
          zoomIn={zoomIn}
          openModal={openModal}
          commitRawRowsDeletion={commitRawRowsDeletion}
          setEditingRawSuppRow={setEditingRawSuppRow}
          setEditingRawSuppVal={setEditingRawSuppVal}
          setSuppDropdownRect={setSuppDropdownRect}
          setSupplierConfirm={setSupplierConfirm}
          openVendorEdit={openVendorEdit}
          saveTemplate={saveTemplate}
          setReparseStatus={setReparseStatus}
          setEditingCell={setEditingCell}
          setEditingCellVal={setEditingCellVal}
          setFocusedCell={setFocusedCell}
          setCellEdits={setCellEdits}
          commitCellEdit={commitCellEdit}
          setPageDateOverride={setPageDateOverride}
          reextractOneCell={reextractOneCell}
          toggleCellCheck={toggleCellCheck}
          setEditingNameRow={setEditingNameRow}
          setEditingNameVal={setEditingNameVal}
          setAutoSynonymMatches={setAutoSynonymMatches}
          setCancelledAutoMap={setCancelledAutoMap}
          setCancelledAutoSyn={setCancelledAutoSyn}
          setMatchItems={setMatchItems}
          setNameEditResults={setNameEditResults}
          setNameEditSearchDone={setNameEditSearchDone}
          setNameDropdownRect={setNameDropdownRect}
          setDeleteSynConfirm={setDeleteSynConfirm}
          reextractProductName={reextractProductName}
          saveSynonym={saveSynonym}
          confirm={confirm}
          handleMatchPage={handleMatchPage}
          matchRawToPurchaseHistory={matchRawToPurchaseHistory}
          setCancelledRows={setCancelledRows}
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
          runColumnPipeline={runColumnPipeline}
          runningPipeline={runningPipeline}
          addManualRow={addManualRow}
          setPermanentlyDeletedRawRows={setPermanentlyDeletedRawRows}
          setDbDeletedSignatures={setDbDeletedSignatures}
          makeRowSignature={makeRowSignature}
          getPageDisplayTotal={getPageDisplayTotal}
          getPageDiscounts={getPageDiscounts}
          setEditingGrandTotal={setEditingGrandTotal}
          setGrandTotalOverride={setGrandTotalOverride}
        />
      )}

      {/* ── 확정 결과표 섹션 ── */}
      <ConfirmedTableSection
        structuredPages={structuredPages}
        nameIdx={nameIdx}
        matchItems={matchItems}
        confirmed={confirmed}
        pageImages={pageImages}
        confImageCollapsed={confImageCollapsed}
        setConfImageCollapsed={setConfImageCollapsed}
        effectiveInvColWidth={effectiveInvColWidth}
        rotation={rotation}
        confImageZoom={confImageZoom}
        setConfImageZoom={setConfImageZoom}
        confImagePan={confImagePan}
        setConfImagePan={setConfImagePan}
        confImageDragRef={confImageDragRef}
        openPageModal={openPageModal}
        xlsInputRef={xlsInputRef}
        handleTemplateUpload={handleTemplateUpload}
        xlsTemplateSaved={xlsTemplateSaved}
        setXlsTemplateSaved={setXlsTemplateSaved}
        xlsTemplate={xlsTemplate}
        xlsTemplateName={xlsTemplateName}
        xlsTemplateHdrs={xlsTemplateHdrs}
        handleErpUploadExport={handleErpUploadExport}
        handleExcelExport={handleExcelExport}
        handleExport={handleExport}
        CONF_HEADERS={CONF_HEADERS}
        confRows={confRows}
        collapsedConfCols={collapsedConfCols}
        setCollapsedConfCols={setCollapsedConfCols}
        confPageTotals={confPageTotals}
        permanentlyDeletedRawRows={permanentlyDeletedRawRows}
        isRowDbDeleted={isRowDbDeleted}
        hiddenRawRows={hiddenRawRows}
        pageNums={pageNums}
        cancelledRows={cancelledRows}
        selectedCands={selectedCands}
        cancelledAutoSyn={cancelledAutoSyn}
        setCancelledAutoSyn={setCancelledAutoSyn}
        rawSupplierByPage={rawSupplierByPage}
        pageVatIncluded={pageVatIncluded}
        pageDateOverride={pageDateOverride}
        setPageDateOverride={setPageDateOverride}
        editingConfDate={editingConfDate}
        setEditingConfDate={setEditingConfDate}
        editingConfDateVal={editingConfDateVal}
        setEditingConfDateVal={setEditingConfDateVal}
        effectiveDispRows={effectiveDispRows}
        onSaveConfirmed={onSaveConfirmed}
        savingConfirmed={savingConfirmed}
        hasMissingSupplier={hasMissingSupplier}
        missingSupplierPages={missingSupplierPages}
        handleSaveConfirmed={handleSaveConfirmed}
        showError={showError}
        confirm={confirm}
      />



      {/* ── 표 감지 실패 원문 ── */}
      <FallbackPageSection
        fallbackPages={fallbackPages}
        matchingPage={matchingPage}
        handleMatchPage={handleMatchPage}
        onReparsePage={onReparsePage}
      />
      </div>{/* end 콘텐츠 래퍼 */}
    </div>{/* end 명세서별 2컬럼 그리드 래퍼 */}
    {/* 2026-08-21 · Framework Phase 3 · toast */}
    {/* toast · moved to RawOcrTableOverlays */}
    </>
  );
};
