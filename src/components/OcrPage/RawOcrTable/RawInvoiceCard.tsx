import React from "react";
import { Wand2, CheckCircle, AlertTriangle, XCircle, X, Bookmark, BookmarkCheck, Search, Pencil, BookOpen, Check } from "lucide-react";
import { Spinner } from "../../common/Spinner";
import { Card } from "../../common/Card";
import { NUM_COLS, fmt, parseNumber, renderTextWithBreaks, normalizeExpiryDate } from "./utils";
import { NumericEditableCell, ExpiryCell, NameCell } from "./RawOcrCellRenderer";
import { RawPageImageCell } from "./RawPageImageCell";
import { ErpMatchSubRow } from "./ErpMatchSubRow";
import type { RawPage, MatchedItem } from "./types";

// ── 공통 타입 ──────────────────────────────────────────────────────────────────
type CellCoord = { ri: number; ci: number };
type SummaryEdit = { pn: number; kind: "discount" | "balance" | "subtotal"; value: string; dirty?: boolean };
type DiscountInfo = { amount: number; label: string; isEstimated?: boolean; valid?: boolean };

export interface RawInvoiceCardProps {
  // 테이블 데이터
  rawRows: (string | number | null)[][];
  dispHeaders: string[];
  dispRows: (string | number | null)[][];
  effectiveDispRows: (string | number | null)[][];
  pageNums: number[];
  nameIdx: number;
  amtIdx: number;
  ocrQtyIdx: number;
  ocrPriIdx: number;
  _discountIdxEarly: number;
  structuredPages: RawPage[];
  meta: { date?: string; supplier?: string; [k: string]: any };
  RAW_ESSENTIAL_COLS: string[];
  NUM_COLS: Set<string>;
  showRawDetail: boolean;

  // 행 상태
  permanentlyDeletedRawRows: Set<number>;
  hiddenRawRows: Set<number>;
  isRowDbDeleted: (ri: number) => boolean;

  // 레이아웃
  invTableWrapRef: React.RefObject<HTMLDivElement | null>;
  effectiveInvColWidth: number;
  invColResizing: boolean;
  INV_COL_DEFAULT: number;
  containerWidth: number;
  _cw: number;
  numCellMinW: number;
  expCellMinW: number;
  reextBtnCls: string;
  numCellInnerCls: string;
  numInputMinW: string;
  expInputMinW: string;
  colWidths: Record<number, number>;
  resizeRef: React.MutableRefObject<{ ci: number; startX: number; startW: number } | null>;

  // 이미지/줌/팬
  pageImages?: string[];
  pageZoom: Record<number, number>;
  pagePan: Record<number, { x: number; y: number }>;
  panDragRef: React.MutableRefObject<any>;
  rotation: number;

  // 공급처
  rawSupplierByPage: Record<number, string>;
  globalSupplier: string | null;
  editingRawSuppRow: number | null;
  editingRawSuppVal: string;
  suppInputRef: React.RefObject<HTMLInputElement | null>;
  addSynonymsOnChange: boolean;

  // 배지/상태
  autoSynonymLoading: boolean;
  autoSynonymMatches: Record<number, { code: string; name: string }>;
  synonymAddStatus: { pageNum: number; status: "loading" | "done" | "error"; count: number } | null;
  hasMissingSupplier: boolean;
  missingSupplierPages: number[];
  reparseStatus: Record<number, "loading" | "done" | "error" | "saved">;
  reparseSupplier: Record<number, string>;

  // 셀 편집
  cellEdits: Record<number, Record<number, string | number | null>>;
  editingCell: CellCoord | null;
  editingCellVal: string;
  focusedCell: CellCoord | null;
  amountCorrections: Record<number, number>;

  // 품명
  editingNameRow: number | null;
  editingNameVal: string;
  editingNameRowRef: React.MutableRefObject<number | null>;
  nameInputRef: React.RefObject<HTMLInputElement | null>;
  nameEditSearchRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  nameEditResults: any[];
  nameEditSearchDone: boolean;
  nameCellCycle: Record<number, number>;
  nameCellCandidates: Record<number, string[]>;
  reextractingName: Set<number>;

  // 매칭
  matchItems: MatchedItem[] | null;
  cancelledAutoMap: Set<number>;
  cancelledRows: Set<number>;
  selectedCands: Record<number, any>;
  barcodeAutoMap: Record<number, any>;

  // 수치 셀 재추출
  numericCellCycle: Record<string, number>;
  numericCellCandidates: Record<string, (string | number)[]>;
  noCandidateCells: Set<string>;
  dbFilledCells: Set<string>;
  checkedCells: Set<string>;

  // 페이지 소계/잔고/에누리
  effectivePageTotals: Map<number, number>;
  pageSubtotalChoices: Record<number, "stated" | "computed" | "custom">;
  pageSubtotalCustom: Record<number, number>;
  pageVatIncluded: Record<number, boolean>;
  pageDiscountApplied: Record<number, boolean>;
  pageSupplierBalances: Record<number, number>;
  supplierBalanceRecords: { id: number; supplier_name: string; invoice_date: string | null; balance: number; created_at: string }[];
  pageBalanceOverride: Record<number, number>;
  pageBalanceModeManual: Set<number>;
  pageBalanceManualInput: Record<number, string>;
  editingSummary: SummaryEdit | null;
  supplierTotals: { supplier: string; total: number; count: number }[];
  total: number;
  totalBreakdownTitle: string;
  editingGrandTotal: string | null;
  grandTotalOverride: number | null;

  // ERP
  erpSubRowPages: Set<number>;
  matchingPage: Record<number, boolean>;

  // 확정
  confirmedPages: Set<number>;

  // 파생값
  pageDateOverride: Record<number, string | null>;

  // 콜백 — 이미지
  onInvColResizeStart: (e: React.MouseEvent) => void;
  setInvoiceColWidth: (w: number) => void;
  onImgPanStart: (pn: number, e: React.MouseEvent) => void;
  openPageModal: (pn: number) => void;
  zoomOut: (pn: number) => void;
  zoomReset: (pn: number) => void;
  zoomIn: (pn: number) => void;
  openModal: (ri: number) => void;

  // 콜백 — 행 삭제
  commitRawRowsDeletion: () => void;

  // 콜백 — 공급처
  setEditingRawSuppRow: React.Dispatch<React.SetStateAction<number | null>>;
  setEditingRawSuppVal: React.Dispatch<React.SetStateAction<string>>;
  setSuppDropdownRect: React.Dispatch<React.SetStateAction<{ top: number; left: number; width: number } | null>>;
  setSupplierConfirm: React.Dispatch<React.SetStateAction<{ pageNum: number; newVal: string; rowCount: number; addSynonyms: boolean } | null>>;
  openVendorEdit: (name: string) => void;

  // 콜백 — 재파싱
  saveTemplate: (pn: number, supplier: string) => void;
  setReparseStatus: React.Dispatch<React.SetStateAction<Record<number, "loading" | "done" | "error" | "saved">>>;

  // 콜백 — 셀 편집
  setEditingCell: React.Dispatch<React.SetStateAction<CellCoord | null>>;
  setEditingCellVal: React.Dispatch<React.SetStateAction<string>>;
  setFocusedCell: React.Dispatch<React.SetStateAction<CellCoord | null>>;
  setCellEdits: React.Dispatch<React.SetStateAction<Record<number, Record<number, string | number | null>>>>;
  commitCellEdit: (ri: number, ci: number, rawVal: string) => void;
  setPageDateOverride: React.Dispatch<React.SetStateAction<Record<number, string | null>>>;
  reextractOneCell: (ri: number, ci: number, colName: "수량" | "단가" | "금액" | "유통기한") => void;
  toggleCellCheck: (ri: number, ci: number) => void;

  // 콜백 — 품명
  setEditingNameRow: React.Dispatch<React.SetStateAction<number | null>>;
  setEditingNameVal: React.Dispatch<React.SetStateAction<string>>;
  setAutoSynonymMatches: React.Dispatch<React.SetStateAction<Record<number, { code: string; name: string }>>>;
  setCancelledAutoMap: React.Dispatch<React.SetStateAction<Set<number>>>;
  setCancelledAutoSyn: React.Dispatch<React.SetStateAction<Set<number>>>;
  setMatchItems: React.Dispatch<React.SetStateAction<MatchedItem[] | null>>;
  setNameEditResults: React.Dispatch<React.SetStateAction<any[]>>;
  setNameEditSearchDone: React.Dispatch<React.SetStateAction<boolean>>;
  setNameDropdownRect: React.Dispatch<React.SetStateAction<{ top: number; left: number; width: number } | null>>;
  setDeleteSynConfirm: React.Dispatch<React.SetStateAction<{ ri: number; origName: string } | null>>;
  reextractProductName: (ri: number) => Promise<void>;
  saveSynonym: (ri: number, nameOld: string, productCode: string, supplierNew?: string, nameNew?: string, supplierOld?: string) => Promise<void>;
  confirm: (opts: { message: string; danger?: boolean }) => Promise<boolean>;
  handleMatchPage: (pn: number) => Promise<void>;
  matchRawToPurchaseHistory: (pn: number) => Promise<void>;

  // 콜백 — 매칭 취소
  setCancelledRows: React.Dispatch<React.SetStateAction<Set<number>>>;

  // 콜백 — 소계/에누리/잔고
  setPageSubtotalChoices: React.Dispatch<React.SetStateAction<Record<number, "stated" | "computed" | "custom">>>;
  setPageSubtotalCustom: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  setPageVatIncluded: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  setPageDiscountApplied: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  setPageDiscountOverride: React.Dispatch<React.SetStateAction<Record<number, { amount: number; label: string }>>>;
  setPageBalanceOverride: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  setPageBalanceModeManual: React.Dispatch<React.SetStateAction<Set<number>>>;
  setEditingSummary: React.Dispatch<React.SetStateAction<SummaryEdit | null>>;
  saveSupplierBalance: (name: string, amount: number, date: string | null) => void;

  // 콜백 — ERP/확정
  setErpSubRowPages: React.Dispatch<React.SetStateAction<Set<number>>>;
  setConfirmedPages: React.Dispatch<React.SetStateAction<Set<number>>>;
  setConfirmed: React.Dispatch<React.SetStateAction<boolean>>;
  runColumnPipeline: (pn: number) => void;
  runningPipeline: Record<number, boolean>;

  // 콜백 — 행 추가
  addManualRow: (pn: number) => void;

  // 콜백 — 행 삭제(개별)
  setPermanentlyDeletedRawRows: React.Dispatch<React.SetStateAction<Set<number>>>;
  setDbDeletedSignatures: React.Dispatch<React.SetStateAction<Set<string>>>;
  makeRowSignature: (supplier: string, name: string) => string;

  // 소계 계산
  getPageDisplayTotal: (pn: number) => number;
  getPageDiscounts: (pn: number) => DiscountInfo[];
  setEditingGrandTotal: React.Dispatch<React.SetStateAction<string | null>>;
  setGrandTotalOverride: React.Dispatch<React.SetStateAction<number | null>>;
}

export const RawInvoiceCard: React.FC<RawInvoiceCardProps> = ({
  rawRows, dispHeaders, dispRows, effectiveDispRows, pageNums,
  nameIdx, amtIdx, ocrQtyIdx, ocrPriIdx, _discountIdxEarly,
  structuredPages, meta, RAW_ESSENTIAL_COLS, showRawDetail,
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
  const autoSynonymCount = Object.keys(autoSynonymMatches).length;

  return (
    <Card variant="raw-sm" rounded="2xl" padding="none" clip className="w-full">
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-white bg-sky-500 px-1.5 py-0.5 rounded shrink-0">1차보정</span>
          <span className="text-xs font-bold text-gray-800">거래명세서 품목</span>
          <span className="text-[11px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded font-bold">
            {rawRows.length - permanentlyDeletedRawRows.size - hiddenRawRows.size}행 · {structuredPages.length}페이지
            {(permanentlyDeletedRawRows.size + hiddenRawRows.size) > 0 && (
              <span className="ml-1 text-rose-500">
                ({permanentlyDeletedRawRows.size + hiddenRawRows.size}행 제외)
              </span>
            )}
          </span>
          {hiddenRawRows.size > 0 && (
            <button
              type="button"
              onClick={commitRawRowsDeletion}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-rose-500 hover:bg-rose-600 active:bg-rose-700 px-2 py-0.5 rounded shadow-sm transition cursor-pointer whitespace-nowrap"
              title={`선택된 ${hiddenRawRows.size}행 완전 삭제 + DB 서명 저장 (다음 스캔에도 자동 필터)`}
            >
              🗑 {hiddenRawRows.size}행 삭제
            </button>
          )}
          {meta.date      && <span className="text-[11px] text-gray-400">{meta.date}</span>}
          {meta.supplier  && <span className="text-[11px] text-gray-400">공급: {meta.supplier}</span>}
          {autoSynonymLoading && (
            <span className="text-[11px] text-indigo-500 font-bold flex items-center gap-1">
              <Spinner size={10} />동의어 검색 중...
            </span>
          )}
          {!autoSynonymLoading && autoSynonymCount > 0 && (
            <span className="text-[11px] bg-indigo-50 border border-indigo-200 text-indigo-600 px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
              <BookOpen size={9} />{autoSynonymCount}건 동의어 보정
            </span>
          )}
          {synonymAddStatus?.status === 'loading' && (
            <span className="text-[11px] text-sky-500 font-bold flex items-center gap-1">
              <Spinner size={10} />동의어 추가 중...
            </span>
          )}
          {synonymAddStatus?.status === 'done' && (
            <span className="text-[11px] bg-emerald-50 border border-emerald-200 text-emerald-600 px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
              <CheckCircle size={9} />{synonymAddStatus.count}건 동의어 추가 완료
            </span>
          )}
          {synonymAddStatus?.status === 'error' && (
            <span className="text-[11px] bg-rose-50 border border-rose-200 text-rose-600 px-1.5 py-0.5 rounded font-bold">
              동의어 추가 실패
            </span>
          )}
        </div>
      </div>


      {/* ── 공급사 미입력 페이지 경고 배너 ── */}
      {hasMissingSupplier && (
        <div className="mx-3 my-2 px-3 py-2 rounded-lg bg-rose-50 border-2 border-rose-300 flex items-start gap-2 text-[12px] font-semibold text-rose-800">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-rose-600" />
          <div className="flex-1">
            <div className="font-bold text-rose-900 mb-0.5">
              공급사 미입력 페이지 {missingSupplierPages.length}개 — 입력이 필요합니다
            </div>
            <div className="font-normal text-rose-700">
              <span className="font-bold">{missingSupplierPages.join(", ")}번 명세서</span>의 공급사가 지정되지 않았습니다.
              아래 표 <span className="font-bold text-sky-700">"공급처"</span> 셀(rose 배경)을 클릭하여 공급사명을 입력해주세요.
              공급사 정보 없이는 <span className="font-bold">상품명 자동보정 · 확정표 저장</span>이 차단됩니다.
            </div>
          </div>
        </div>
      )}

      {/* ── 공급처 변경 재파싱 상태 ── */}
      {Object.entries(reparseStatus).map(([pnStr, status]) => {
        const pn = Number(pnStr);
        const supplier = reparseSupplier[pn] ?? "";
        if (!supplier) return null;
        if (status === 'loading') return (
          <div key={pn} className="px-4 py-2 bg-indigo-50 border-b border-indigo-200 flex items-center gap-2 text-[12px] font-semibold text-indigo-700">
            <Spinner size={12} className="shrink-0" />
            {pn}번 명세서 "{supplier}" 공급처 템플릿으로 재파싱 중...
          </div>
        );
        if (status === 'error') return (
          <div key={pn} className="px-4 py-2 bg-rose-50 border-b border-rose-200 flex items-center gap-2 text-[12px] font-semibold text-amber-700">
            <XCircle size={12} className="shrink-0" />{pn}번 명세서 재파싱 실패 — 원본 결과를 유지합니다
          </div>
        );
        if (status === 'done') return (
          <div key={pn} className="px-4 py-2 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2 flex-wrap text-[12px] font-semibold text-emerald-700">
            <CheckCircle size={12} className="shrink-0" />
            <span>{pn}번 명세서 재파싱 완료</span>
            <span className="text-gray-500 font-normal">이 결과를 <span className="font-bold text-sky-700">"{supplier}"</span> 공급처 템플릿으로 저장하면 다음부터 자동 적용됩니다.</span>
            <button onClick={() => saveTemplate(pn, supplier)}
              className="ml-auto text-[11px] font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] px-2 py-0.5 rounded transition cursor-pointer shrink-0">
              템플릿 저장
            </button>
            <button onClick={() => setReparseStatus(prev => { const s = { ...prev }; delete s[pn]; return s; })}
              className="text-gray-400 hover:text-gray-600 cursor-pointer shrink-0">
              <X size={10} />
            </button>
          </div>
        );
        if (status === 'saved') return (
          <div key={pn} className="px-4 py-2 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2 text-[12px] font-semibold text-emerald-700">
            <BookmarkCheck size={12} className="shrink-0" /><span className="font-bold text-sky-700">"{supplier}"</span> 공급처 템플릿 저장 완료 — 다음 스캔부터 자동 적용됩니다
          </div>
        );
        return null;
      })}

      <div className="w-full max-w-[1400px] mx-auto overflow-x-auto pl-3 pr-8 box-border" ref={invTableWrapRef}>
        <table className={`w-full border-collapse ${_cw < 500 ? "text-[10px]" : "text-xs"}`} style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="bg-amber-50 border-b-2 border-amber-200">
              {pageImages?.length ? (
                <th
                  className="p-0 text-center bg-gray-50 border-r border-line text-[10px] font-bold text-gray-500 whitespace-nowrap select-none"
                  style={{ width: effectiveInvColWidth, minWidth: effectiveInvColWidth, maxWidth: effectiveInvColWidth, position: "relative", boxSizing: "border-box" }}
                >
                  <div style={{ padding: "8px 4px", textAlign: "center" }}>
                    <span>거래명세서</span>
                  </div>
                  <div
                    role="separator"
                    aria-label="이미지 폭 조절"
                    onMouseDown={onInvColResizeStart}
                    onDoubleClick={() => setInvoiceColWidth(INV_COL_DEFAULT)}
                    onDragStart={e => { e.preventDefault(); e.stopPropagation(); }}
                    draggable={false}
                    title="드래그하여 이미지 폭 조절 · 더블클릭 초기화"
                    style={{
                      position: "absolute",
                      top: 0, right: 0, bottom: 0, width: 4,
                      cursor: "col-resize", zIndex: 50,
                      backgroundColor: invColResizing ? "#10b981" : "transparent",
                      transition: "background-color 0.15s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#10b981"; }}
                    onMouseLeave={(e) => { if (!invColResizing) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                  />
                </th>
              ) : null}
              <th className="px-1 py-2 text-center" style={{ width: 56 }} title="선택 · 재추출">
                <span className="text-[10px] font-bold text-amber-700">선택 · 🔄</span>
              </th>
              {(() => {
                const baseOrder = dispHeaders.map((_, i) => i);
                let colList: { origIdx: number; orderIdx: number }[];
                if (showRawDetail) {
                  colList = baseOrder.map((origIdx, orderIdx) => ({ origIdx, orderIdx }));
                } else {
                  const list: { origIdx: number; orderIdx: number }[] = [];
                  for (const name of RAW_ESSENTIAL_COLS) {
                    let idx = dispHeaders.indexOf(name);
                    if (idx < 0 && name === "유통기한") {
                      for (const a of ["유효기한", "유통기간"]) {
                        idx = dispHeaders.indexOf(a);
                        if (idx >= 0) break;
                      }
                    }
                    if (idx >= 0) list.push({ origIdx: idx, orderIdx: baseOrder.indexOf(idx) });
                  }
                  colList = list;
                }
                const COL_WEIGHTS: Record<string, number> = {
                  품명: 4.5,
                  금액: 2.2, 유통기한: 2.0, 유효기한: 2.0, 유통기간: 2.0,
                  단가: 1.6, 규격: 1.5, 세액: 1.4, 배치번호: 1.4, "Batch.No": 1.4,
                  수량: 1.0, 비고: 1.0, 단위: 1.0,
                  번호: 0.6, 순번: 0.6,
                };
                const fixedUsed = (pageImages?.length ? effectiveInvColWidth : 0) + 56;
                const totalAvail = Math.max((containerWidth || 700) - fixedUsed, 60);
                const userFixedTotal = colList.reduce((sum, { origIdx }) => {
                  const w = colWidths[origIdx];
                  return w != null ? sum + w : sum;
                }, 0);
                const autoColList = colList.filter(({ origIdx }) => colWidths[origIdx] == null);
                const autoAvail = Math.max(totalAvail - userFixedTotal, 0);
                const totalWeight = autoColList.reduce((sum, { origIdx }) => {
                  const h = dispHeaders[origIdx];
                  return sum + (COL_WEIGHTS[h] ?? 1.0);
                }, 0);
                return colList.map(({ origIdx }) => {
                  const h = dispHeaders[origIdx];
                  const ci = origIdx;
                  const explicitW = colWidths[ci];
                  const weight = COL_WEIGHTS[h] ?? 1.0;
                  const computedW = totalWeight > 0
                    ? Math.round((weight / totalWeight) * autoAvail)
                    : Math.round(autoAvail / Math.max(autoColList.length, 1));
                  const isExpCol = h === "유통기한" || h === "유효기한" || h === "유통기간";
                  const isCompactCell = NUM_COLS.has(h) || isExpCol;
                  const TEXT_COL_MIN: Record<string, number> = {
                    품명: 160, 공급처: 90, 규격: 60, 비고: 50, 단위: 40, 번호: 40, 순번: 40,
                    배치번호: 80, "Batch.No": 80, 거래일: 82, 일자: 82, 날짜: 82,
                  };
                  const minGuard = explicitW == null
                    ? (isExpCol ? expCellMinW
                      : isCompactCell ? numCellMinW
                      : (TEXT_COL_MIN[h] ?? 40))
                    : 0;
                  const colW = explicitW ?? Math.max(computedW, minGuard);
                  return (
                    <th key={origIdx}
                      style={{ width: colW, position: 'relative', overflow: 'hidden' }}
                      className={`px-1.5 py-1.5 font-bold text-amber-900 select-none text-[11px] ${NUM_COLS.has(h) ? "text-right" : "text-left"} truncate`}>
                      {`OCR ${h}`}
                      <div
                        style={{ position: 'absolute', right: 0, top: 4, bottom: 4, width: 4, cursor: 'col-resize', zIndex: 2 }}
                        className="bg-amber-300/40 hover:bg-amber-600/80 active:bg-amber-700 transition-colors rounded-sm"
                        title="드래그하여 컬럼 폭 조절"
                        draggable={false}
                        onDragStart={e => { e.preventDefault(); e.stopPropagation(); }}
                        onMouseDown={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          const th = (e.currentTarget as HTMLElement).parentElement as HTMLTableCellElement;
                          resizeRef.current = { ci, startX: e.clientX, startW: th.offsetWidth };
                        }}
                      />
                    </th>
                  );
                });
              })()}
            </tr>
          </thead>
          <tbody className="[&_td]:max-lg:py-4 [&_td]:lg:py-3 [&_tr]:border-b [&_tr]:border-zinc-100">
            {(() => {
              const _lastVisibleByPage = new Map<number, number>();
              const _firstVisibleByPage = new Map<number, number>();
              const _qtyIdxSkip0 = dispHeaders.indexOf("수량");
              const _priIdxSkip0 = dispHeaders.indexOf("단가");
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
              return effectiveDispRows.map((row, ri) => {
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
                const isPageCollapsedRaw = false;
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
                const rawColSpan = (() => {
                  const baseOrder = dispHeaders.map((_, i) => i);
                  if (showRawDetail) return baseOrder.length + 1;
                  let cnt = 1;
                  for (const name of RAW_ESSENTIAL_COLS) {
                    let idx = dispHeaders.indexOf(name);
                    if (idx < 0 && name === "유통기한") {
                      for (const a of ["유효기한", "유통기간"]) { idx = dispHeaders.indexOf(a); if (idx >= 0) break; }
                    }
                    if (idx >= 0) cnt++;
                  }
                  return cnt;
                })();
                void ocrQtyIdx; void ocrPriIdx; void _discountIdxEarly;
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
                    {!isPageCollapsedRaw && (
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
                                // fire-and-forget
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
                      {(() => {
                        const baseOrder = dispHeaders.map((_, i) => i);
                        if (showRawDetail) return baseOrder;
                        const list: number[] = [];
                        for (const name of RAW_ESSENTIAL_COLS) {
                          let idx = dispHeaders.indexOf(name);
                          if (idx < 0 && name === "유통기한") {
                            for (const a of ["유효기한", "유통기간"]) {
                              idx = dispHeaders.indexOf(a);
                              if (idx >= 0) break;
                            }
                          }
                          if (idx >= 0) list.push(idx);
                        }
                        return list;
                      })().map(origIdx => {
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
                        const isEditingThisNum = isEditableNum && editingCell?.ri === ri && editingCell?.ci === ci;
                        const barcodeMatch = isName && !cancelledAutoMap.has(ri) ? barcodeAutoMap[ri] : undefined;
                        const autoMatch = isName && !cancelledAutoMap.has(ri) ? autoSynonymMatches[ri] : undefined;
                        void isEditingThisNum; void barcodeMatch; void autoMatch;

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
                    )}
                    {!isPageCollapsedRaw && erpSubRowPages.has(pn) && (() => {
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
                                for (const a of ["유효기한", "유통기간"]) {
                                  idx = dispHeaders.indexOf(a); if (idx >= 0) break;
                                }
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
                      const pageSupplier = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
                      const baseOrder2 = dispHeaders.map((_, i) => i);
                      const orderNow: number[] = (() => {
                        if (showRawDetail) return baseOrder2;
                        const list: number[] = [];
                        for (const name of RAW_ESSENTIAL_COLS) {
                          let idx = dispHeaders.indexOf(name);
                          if (idx < 0 && name === "유통기한") {
                            for (const a of ["유효기한", "유통기간"]) {
                              idx = dispHeaders.indexOf(a);
                              if (idx >= 0) break;
                            }
                          }
                          if (idx >= 0) list.push(idx);
                        }
                        return list;
                      })();
                      const totalColSpan = orderNow.length + 1;
                      return (
                        <>
                          <tr className="border-t-2 border-amber-400">
                            <td
                              colSpan={totalColSpan}
                              className="px-0 py-0"
                              style={{ background: "linear-gradient(90deg, #fef3c7 0%, #ffedd5 55%, #fed7aa 100%)" }}
                            >
                              <div className="flex flex-col gap-0 px-3 py-2">
                                <div className="flex items-center justify-between gap-3 min-w-0 flex-wrap">
                                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                    {(() => {
                                      const rowSum = effectivePageTotals.get(pn) ?? 0;
                                      const displayTotal = getPageDisplayTotal(pn);
                                      const isCustom = pageSubtotalChoices[pn] === "custom";
                                      const shown = isCustom ? displayTotal : rowSum;
                                      const discs = getPageDiscounts(pn);
                                      const balForShow = pageSupplierBalances[pn] ?? pageBalanceOverride[pn];
                                      const manualBalForShow = pageBalanceModeManual.has(pn) ? parseNumber(pageBalanceManualInput[pn] ?? "") : 0;
                                      const displayBalForShow = balForShow ?? (manualBalForShow > 0 ? manualBalForShow : null);
                                      return (
                                        <>
                                          <span className="text-[12px] font-bold text-amber-700 whitespace-nowrap">{pn}번</span>
                                          {pageSupplier ? (
                                            <button type="button"
                                              onClick={e => { e.stopPropagation(); openVendorEdit(pageSupplier); }}
                                              className="text-[14px] font-bold text-amber-900 whitespace-nowrap hover:text-amber-600 cursor-pointer transition truncate max-w-[160px]"
                                              title="클릭 · 공급사 정보 조회·수정"
                                            >{pageSupplier}</button>
                                          ) : (
                                            <span className="text-[13px] font-bold text-amber-400 italic">공급사 미지정</span>
                                          )}
                                          <span className="text-[12px] font-semibold text-amber-700">총</span>
                                          {isCustom ? (
                                            <>
                                              <input type="text" inputMode="numeric"
                                                value={(() => { const raw = String(pageSubtotalCustom[pn] ?? ""); const n = parseNumber(raw); return n > 0 ? fmt(n) : raw; })()}
                                                onChange={e => { const raw = e.target.value.replace(/[^\d-]/g, ""); setPageSubtotalCustom(prev => ({ ...prev, [pn]: parseNumber(raw) })); }}
                                                placeholder="금액"
                                                className="w-[110px] text-[16px] font-bold text-amber-900 bg-white border-2 border-amber-400 rounded px-1.5 py-0.5 focus:outline-none focus:border-brand-deep text-right"
                                                autoFocus
                                              />
                                              <span className="text-[16px] font-bold text-amber-900">원</span>
                                              <button type="button" onClick={() => setPageSubtotalChoices(prev => { const n = { ...prev }; delete n[pn]; return n; })}
                                                className="text-[10px] font-bold text-zinc-500 hover:text-zinc-700 underline"
                                              >취소</button>
                                            </>
                                          ) : (
                                            <>
                                              {(() => {
                                                const vatOn = !!pageVatIncluded[pn];
                                                const finalShown = vatOn ? Math.round(shown * 1.1) : shown;
                                                const vatAmount = vatOn ? Math.round(shown * 0.1) : 0;
                                                return (
                                                  <>
                                                    <input type="text" inputMode="numeric"
                                                      value={(() => {
                                                        if (editingSummary?.pn === pn && editingSummary.kind === "subtotal") return editingSummary.value;
                                                        return fmt(finalShown);
                                                      })()}
                                                      placeholder={fmt(finalShown)}
                                                      onFocus={() => setEditingSummary({ pn, kind: "subtotal", value: "", dirty: false })}
                                                      onChange={e => setEditingSummary({ pn, kind: "subtotal", value: e.target.value, dirty: true })}
                                                      onBlur={() => {
                                                        if (!editingSummary || editingSummary.pn !== pn || (editingSummary.kind as string) !== "subtotal") { setEditingSummary(null); return; }
                                                        if (!editingSummary.dirty) { setEditingSummary(null); return; }
                                                        const n = parseNumber(editingSummary.value.replace(/[^\d-]/g, ""));
                                                        if (n > 0) {
                                                          setPageSubtotalChoices(prev => ({ ...prev, [pn]: "custom" }));
                                                          setPageSubtotalCustom(prev => ({ ...prev, [pn]: n }));
                                                        } else {
                                                          setPageSubtotalChoices(prev => { const c = { ...prev }; delete c[pn]; return c; });
                                                          setPageSubtotalCustom(prev => { const c = { ...prev }; delete c[pn]; return c; });
                                                        }
                                                        setEditingSummary(null);
                                                      }}
                                                      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingSummary(null); }}
                                                      className="w-[130px] text-[16px] font-bold text-amber-900 bg-amber-50 border border-amber-300 hover:border-amber-500 focus:bg-white rounded px-2 py-0.5 focus:outline-none focus:border-brand-deep text-right tracking-tight"
                                                      title={vatOn ? `공급가액 ${fmt(shown)} + VAT ${fmt(vatAmount)} · 클릭하여 수정` : "금액 컬럼 합 · 클릭하여 수정"}
                                                    />
                                                    <span className="text-[14px] font-bold text-amber-900">원</span>
                                                    {vatOn && (
                                                      <span className="text-[10px] font-bold text-amber-600 bg-amber-100 border border-amber-300 rounded px-1 py-px whitespace-nowrap">
                                                        +VAT {fmt(vatAmount)}
                                                      </span>
                                                    )}
                                                  </>
                                                );
                                              })()}
                                              <label className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 cursor-pointer hover:text-amber-900 ml-1"
                                                title="체크 시 · 소계에 VAT 10% 자동 합산 (매입총계 · 정산 반영)">
                                                <input type="checkbox"
                                                  checked={!!pageVatIncluded[pn]}
                                                  onChange={e => setPageVatIncluded(prev => ({ ...prev, [pn]: e.target.checked }))}
                                                  className="w-3.5 h-3.5 accent-amber-500 cursor-pointer"
                                                />
                                                VAT 별도
                                              </label>
                                            </>
                                          )}
                                          <span className="text-[12px] font-semibold text-orange-700 ml-2"
                                            title={discs.length > 0 ? discs.map(d => `${d.label}: ${fmt(d.amount)}`).join(" · ") : "차액·에누리·할인 자동 감지"}>정산차액</span>
                                          {(() => {
                                            const totalDisc = discs.reduce((s, d) => s + d.amount, 0);
                                            return (
                                              <input type="text" inputMode="numeric"
                                                value={
                                                  editingSummary?.pn === pn && editingSummary.kind === "discount"
                                                    ? editingSummary.value
                                                    : (totalDisc > 0 ? String(totalDisc) : "")
                                                }
                                                placeholder={totalDisc > 0 ? String(totalDisc) : "0"}
                                                onFocus={() => setEditingSummary({ pn, kind: "discount", value: "", dirty: false })}
                                                onChange={e => setEditingSummary({ pn, kind: "discount", value: e.target.value, dirty: true })}
                                                onBlur={() => {
                                                  if (!editingSummary || editingSummary.pn !== pn || editingSummary.kind !== "discount") { setEditingSummary(null); return; }
                                                  if (!editingSummary.dirty) { setEditingSummary(null); return; }
                                                  const n = parseNumber(editingSummary.value.replace(/[^\d-]/g, ""));
                                                  if (n > 0) setPageDiscountOverride(prev => ({ ...prev, [pn]: { amount: n, label: "수정" } }));
                                                  else setPageDiscountOverride(prev => { const c = { ...prev }; delete c[pn]; return c; });
                                                  setEditingSummary(null);
                                                }}
                                                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingSummary(null); }}
                                                className="w-[110px] text-[13px] font-bold text-orange-800 bg-orange-50 border border-orange-300 hover:border-orange-500 focus:bg-white rounded px-1.5 py-0.5 focus:outline-none focus:border-brand-deep text-right"
                                              />
                                            );
                                          })()}
                                          {(() => {
                                            const anyValid = discs.some(d => d.valid !== false);
                                            const anyInvalid = discs.some(d => d.valid === false);
                                            const explicit = pageDiscountApplied[pn];
                                            const isChecked = explicit !== undefined ? explicit : anyValid;
                                            return (
                                              <label className={`inline-flex items-center gap-1 text-[11px] font-bold cursor-pointer transition ${anyInvalid ? "text-zinc-400 hover:text-zinc-600" : "text-orange-700 hover:text-orange-900"}`}
                                                title={anyInvalid
                                                  ? "수식 미매칭 (rowsSum - stated ≠ 정산차액) · 자동 미적용 · 체크로 강제 적용 가능"
                                                  : "체크 시 · 매입총계에서 정산차액 반영 · 해제 시 소계 그대로"}>
                                                <input type="checkbox"
                                                  checked={isChecked}
                                                  onChange={e => setPageDiscountApplied(prev => ({ ...prev, [pn]: e.target.checked }))}
                                                  className={`w-3.5 h-3.5 cursor-pointer ${anyInvalid ? "accent-zinc-400" : "accent-orange-500"}`}
                                                />{anyInvalid ? "적용(⚠수식×)" : "적용"}
                                              </label>
                                            );
                                          })()}
                                          <span className="text-[12px] font-semibold text-rose-700 ml-2" title="잔고 = 미수금 (동의어)">미수금</span>
                                          <input type="text" inputMode="numeric"
                                            value={
                                              editingSummary?.pn === pn && editingSummary.kind === "balance"
                                                ? editingSummary.value
                                                : (displayBalForShow != null && displayBalForShow > 0 ? String(displayBalForShow) : "")
                                            }
                                            placeholder={displayBalForShow != null && displayBalForShow > 0 ? String(displayBalForShow) : "0"}
                                            onFocus={() => setEditingSummary({ pn, kind: "balance", value: "", dirty: false })}
                                            onChange={e => setEditingSummary({ pn, kind: "balance", value: e.target.value, dirty: true })}
                                            onBlur={() => {
                                              if (!editingSummary || editingSummary.pn !== pn || editingSummary.kind !== "balance") { setEditingSummary(null); return; }
                                              if (!editingSummary.dirty) { setEditingSummary(null); return; }
                                              const n = parseNumber(editingSummary.value.replace(/[^\d-]/g, ""));
                                              if (n > 0) {
                                                setPageBalanceOverride(prev => ({ ...prev, [pn]: n }));
                                                setPageBalanceModeManual(prev => { const s = new Set(prev); s.delete(pn); return s; });
                                                const supForSave = (rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "").trim();
                                                const dateForSave = structuredPages.find(p => p.page === pn)?.meta.date ?? null;
                                                if (supForSave) {
                                                  saveSupplierBalance(supForSave, n, dateForSave);
                                                  console.log(`[미수금 저장] "${supForSave}" ${dateForSave ?? "날짜없음"} → ${n}원`);
                                                }
                                              } else {
                                                setPageBalanceOverride(prev => { const c = { ...prev }; delete c[pn]; return c; });
                                              }
                                              setEditingSummary(null);
                                            }}
                                            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingSummary(null); }}
                                            className="w-[110px] text-[13px] font-bold text-rose-800 bg-rose-50 border border-rose-300 hover:border-rose-500 focus:bg-white rounded px-1.5 py-0.5 focus:outline-none focus:border-brand-deep text-right"
                                          />
                                          {!hasMissingSupplier && (() => {
                                            const isConfirmed = confirmedPages.has(pn);
                                            const hasErpSubRow = erpSubRowPages.has(pn);
                                            return (
                                              <div className="basis-full flex items-center gap-1 mt-1 flex-wrap">
                                                <button type="button"
                                                  onClick={async () => {
                                                    setErpSubRowPages(prev => new Set([...prev, pn]));
                                                    await handleMatchPage(pn);
                                                  }}
                                                  disabled={!!matchingPage[pn]}
                                                  className={`text-[13px] font-bold text-white disabled:bg-zinc-300 disabled:cursor-not-allowed border-2 rounded-lg px-3 py-1 cursor-pointer whitespace-nowrap inline-flex items-center gap-1 shadow-md ring-1 transition shrink-0 ${
                                                    hasErpSubRow
                                                      ? "bg-violet-500 hover:bg-violet-600 border-violet-700 ring-violet-200"
                                                      : "bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] border-indigo-700 ring-indigo-200"
                                                  }`}
                                                  title={hasErpSubRow ? `${pn}번 · ERP 재매칭` : `${pn}번 · ERP 매칭 실행 · 각 행 아래 ERP 정보 표시`}
                                                >
                                                  {matchingPage[pn]
                                                    ? (<><Spinner size={12} /> 매칭중...</>)
                                                    : (<><Wand2 size={12} /> ERP 매칭</>)}
                                                </button>
                                                <button type="button"
                                                  onClick={async () => {
                                                    const supp = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "미상";
                                                    if (!await confirm({ message: `${pn}번 명세서 · "${supp}" · 확정하시겠습니까?\n(3차 거래명세서 확정표에 추가됩니다)` })) return;
                                                    if (!matchItems || !hasErpSubRow) {
                                                      await handleMatchPage(pn);
                                                      setErpSubRowPages(prev => new Set([...prev, pn]));
                                                    }
                                                    setConfirmedPages(prev => new Set([...prev, pn]));
                                                    setConfirmed(true);
                                                  }}
                                                  disabled={!!matchingPage[pn]}
                                                  className={`text-[13px] font-bold text-white disabled:bg-zinc-300 disabled:cursor-not-allowed border-2 rounded-lg px-3 py-1 cursor-pointer whitespace-nowrap inline-flex items-center gap-1 shadow-md ring-1 transition shrink-0 ${
                                                    isConfirmed
                                                      ? "bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] border-emerald-800 ring-emerald-200"
                                                      : "bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] border-emerald-700 ring-emerald-200 animate-pulse"
                                                  }`}
                                                  title={isConfirmed ? `${pn}번 · 확정 완료 · 확정표 반영` : `${pn}번 · 확정 → 3차 거래명세서 확정표에 반영`}
                                                >
                                                  {isConfirmed ? (<><Check size={12} /> 확정완료</>) : (<><Check size={12} /> 확정</>)}
                                                </button>
                                              </div>
                                            );
                                          })()}
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        </>
                      );
                    })()}
                    {isLastInPage && (() => {
                      return (
                        <tr aria-hidden="true" style={{ height: shortfallRaw + 24 }}>
                          <td colSpan={rawColSpan} />
                        </tr>
                      );
                    })()}
                  </React.Fragment>
                );
              });
            })()}
          </tbody>
          {total > 0 && (() => {
            const orderNow = dispHeaders.map((_, i) => i);
            const amtOrderIdx = orderNow.indexOf(amtIdx);
            const imgColOffset = pageImages?.length ? 1 : 0;
            return (
            <tfoot>
              {supplierTotals.length >= 1 && supplierTotals.map(({ supplier, total: sTotal, count }) => {
                const balRec = supplierBalanceRecords.find(r => String(r.supplier_name).trim() === supplier.trim());
                const balAmt = balRec ? Number(balRec.balance) : null;
                return (
                <tr key={supplier} className="border-t border-amber-100 bg-amber-50/40">
                  {imgColOffset > 0 && <td />}
                  {amtOrderIdx > 0 && (
                    <td colSpan={Math.max(1, amtOrderIdx)} className="px-3 py-2 text-right font-semibold text-gray-500">
                      {supplier} <span className="text-gray-400">({count}매)</span>
                      {balAmt != null && balAmt > 0 && (
                        <span className="ml-2 text-[11px] text-rose-600 font-bold" title={`최신 미수금 · ${balRec?.invoice_date ?? ""}`}>
                          미수 {fmt(balAmt)}원
                        </span>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right font-bold text-amber-600 whitespace-nowrap">{fmt(sTotal)}원</td>
                  {orderNow.slice(amtOrderIdx + 1).map((_, i) => <td key={i} />)}
                </tr>
                );
              })}
              <tr className="bg-amber-50 border-t-2 border-amber-300">
                {imgColOffset > 0 && <td />}
                {amtOrderIdx > 0 && (
                  <td
                    colSpan={Math.max(1, amtOrderIdx)}
                    className="px-3 py-2.5 text-right font-bold text-gray-700 cursor-help"
                    title={totalBreakdownTitle}
                  >합 계</td>
                )}
                <td className="px-3 py-2.5 text-right font-bold text-amber-700 text-sm whitespace-nowrap">
                  {editingGrandTotal !== null ? (
                    <input type="text" inputMode="numeric" autoFocus
                      value={editingGrandTotal}
                      onChange={e => setEditingGrandTotal(e.target.value)}
                      onBlur={() => {
                        const n = parseNumber(editingGrandTotal.replace(/[^\d-]/g, ""));
                        if (n > 0) setGrandTotalOverride(n);
                        else setGrandTotalOverride(null);
                        setEditingGrandTotal(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") { setEditingGrandTotal(null); }
                      }}
                      className="w-[150px] text-right bg-white border-2 border-amber-400 rounded px-2 py-0.5 focus:outline-none focus:border-brand-deep text-amber-800"
                    />
                  ) : (
                    <button type="button"
                      onClick={() => setEditingGrandTotal(String(grandTotalOverride ?? total))}
                      title={grandTotalOverride != null ? `수정값 · 원본 자동계산: ${fmt(total)}원 · ${totalBreakdownTitle}` : `클릭하여 총합계 수정 · ${totalBreakdownTitle}`}
                      className={`cursor-pointer hover:underline ${grandTotalOverride != null ? "text-orange-700" : ""}`}
                    >
                      {fmt(grandTotalOverride ?? total)}원
                      {grandTotalOverride != null && <span className="text-[10px] font-bold text-orange-500 ml-1">✎</span>}
                    </button>
                  )}
                </td>
                {orderNow.slice(amtOrderIdx + 1).map((_, i) => <td key={i} />)}
              </tr>
            </tfoot>
            );
          })()}
        </table>
      </div>
    </Card>
  );
};
