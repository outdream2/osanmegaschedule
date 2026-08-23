import React from "react";
import type { RawPage, MatchedItem } from "./types";

// ── 로컬 타입 ──────────────────────────────────────────────────────────────────
export type CellCoord = { ri: number; ci: number };
export type SummaryEdit = { pn: number; kind: "discount" | "balance" | "subtotal"; value: string; dirty?: boolean };
export type DiscountInfo = { amount: number; label: string; isEstimated?: boolean; valid?: boolean };

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
