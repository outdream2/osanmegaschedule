import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TIMING } from "../../constants/timing";
import { useConfirm } from "../../hooks/useConfirm";
// 2026-08-21 · Framework Phase 3 · alert → useToast
import { useToast, toastClass } from "../../hooks/useToast";
// 2026-08-21 · Framework Phase 3 · fetch → apiClient
import { api } from "../../lib/apiClient";
import { X, Search, Check, Save } from "lucide-react";
import { Spinner } from "../common/Spinner";
// 2026-08-21 · Framework Phase 3 · Card 프리미티브 (raw wrapper 이관)
import { Card } from "../common/Card";

import type {
  ConfirmedItem,
  RawPage,
  MatchedItem,
  CandidateInfo,
  BarcodeProduct,
  RawOcrTableProps,
} from "./RawOcrTable/types";
import {
  SCHEMA_ORDER,
  HIDDEN_COLS,
  NUM_COLS,
  fmt,
  isFallback,
  buildMasterHeaders,
  alignRow,
  scoreColor,
  ScoreIcon,
  parseNumber,
  renderTextWithBreaks,
  normalizeExpiryDate,
} from "./RawOcrTable/utils";
import { ImageZoomModal } from "./RawOcrTable/ImageZoomModal";
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
import { ErpMatchSubRow } from "./RawOcrTable/ErpMatchSubRow";
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
import { NumericEditableCell, ExpiryCell, NameCell } from "./RawOcrTable/RawOcrCellRenderer";
import { RawPageImageCell } from "./RawOcrTable/RawPageImageCell";
import { RawInvoiceCard } from "./RawOcrTable/RawInvoiceCard";
import { RawOcrTableOverlays } from "./RawOcrTable/RawOcrTableOverlays";

// 외부 소비자(OcrPage.tsx)가 `import { type ConfirmedItem } from "./RawOcrTable"` 로 사용 중 → re-export 유지
export type { ConfirmedItem };

export const RawOcrTable: React.FC<RawOcrTableProps> = ({ pages: pagesFromProps, pageImages, rotation = -90, onReparsePage, barcodeMatches, balanceConfig: balanceConfigProp, onSaveConfirmed, onUserEdit }) => {
  const confirm = useConfirm();
  // 2026-08-21 · Framework Phase 3 · alert → useToast
  const { toast, showError } = useToast();

  // 2026-07-24 · 리팩터 · 페이지 snapshot
  const pages = usePagesSnapshot(pagesFromProps);
  // 2026-07-24 · 리팩터 · 파생값 계산은 useOcrDerived 훅으로 분리
  const derived = useOcrDerived(pages);
  const { structuredPages, fallbackPages, masterH, dispHeaders, dispRows, rawRows, pageNums, amtIdx, nameIdx } = derived;

  // ── 공급사 편집 상태 → useVendorEdit 훅으로 분리 ─────────────────────────
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

  // ── 공급사 페이지별 편집값 (공급사 헤더 영역 인라인 편집) ───────────────
  const [rawSupplierByPage, setRawSupplierByPage] = useState<Record<number, string>>({});

  // ── 품명 인라인 편집 상태 ─────────────────────────────────────────────────
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

  // ── 셀 체크 (복수 선택 · 다중 편집용) ───────────────────────────────────
  const [checkedCells, setCheckedCells] = useState<Set<string>>(new Set());
  const toggleCellCheck = useCallback((ri: number, ci: number) => {
    setCheckedCells(prev => { const n = new Set(prev); const k = `${ri}:${ci}`; if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }, []);
  const clearCheckedCells = useCallback(() => setCheckedCells(new Set()), []);
  void clearCheckedCells;

  // ── Feature 1: 금액 자동보정 ──────────────────────────────────────────────
  const [amountCorrections, setAmountCorrections] = useState<Record<number, number>>({});
  // 소계 불일치 시 사용자 선택: "stated" = 명세서 소계, "computed" = 인식된 합계, "custom" = 직접 선택
  const [pageSubtotalChoices, setPageSubtotalChoices] = useState<Record<number, "stated" | "computed" | "custom">>({});
  // 2026-07-27 · 사용자 요청 "1차보정 총소계금액도 편집가능하게" · grand total override
  const [grandTotalOverride, setGrandTotalOverride] = useState<number | null>(null);
  const [editingGrandTotal, setEditingGrandTotal] = useState<string | null>(null);
  // 2026-07-24 · 사용자 요청 "각 페이지 소계에 VAT 포함 체크박스 · 체크 시 금액계산 반영"
  //   true 이면 · 매입총계 · 정산 계산 시 소계 × 1.1 (또는 실제 VAT 합 반영)
  const [pageVatIncluded, setPageVatIncluded] = useState<Record<number, boolean>>({});
  // 2026-07-24 · 사용자 요청 "정산차액 적용 체크박스 · 적용할지 안할지 선택"
  //   기본 true (적용) · false 면 getPageDisplayTotal 에서 정산차액 제외
  const [pageDiscountApplied, setPageDiscountApplied] = useState<Record<number, boolean>>({});
  // 2026-07-21: 에누리 적용 전/후 토글 · 기본 "before" (적용 전 · stated + 에누리)
  //   사용자가 "after" 선택 시 stated 그대로 (에누리 이미 반영된 최종금액 사용)
  const [discountApplyMode, setDiscountApplyMode] = useState<Record<number, "before" | "after">>(() => {
    try {
      const v = localStorage.getItem("ocr-discount-mode");
      return v ? JSON.parse(v) : {};
    } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem("ocr-discount-mode", JSON.stringify(discountApplyMode)); } catch { /* empty */ }
  }, [discountApplyMode]);
  // "둘 다 아님" 선택 시 사용자가 고른 커스텀 소계 값
  const [pageSubtotalCustom, setPageSubtotalCustom] = useState<Record<number, number>>({});
  // "둘 다 아님" 드롭다운 열림 상태
  const [pageSubtotalDropdownOpen, setPageSubtotalDropdownOpen] = useState<Set<number>>(new Set());
  // 공급사 잔고 (페이지별)
  const [pageSupplierBalances, setPageSupplierBalances] = useState<Record<number, number>>({});
  // 공급사 잔고 DB 기록
  const [supplierBalanceRecords, setSupplierBalanceRecords] = useState<{ id: number; supplier_name: string; invoice_date: string | null; balance: number; created_at: string }[]>([]);

  // 페이지별 사용자 지정 잔고 (드롭박스로 OCR 추출 금액 중 선택) — 저장 버튼 클릭 시 확정
  const [pageBalanceOverride, setPageBalanceOverride] = useState<Record<number, number>>({});
  // 2026-07-27 · 사용자 요청 "OCR 거래일 없으면 입력가능하게" · 페이지별 사용자 지정 거래일
  const [pageDateOverride, setPageDateOverride] = useState<Record<number, string>>({});
  // 2026-07-28 · 확정표 이미지 컬럼 접기/펴기 (사용자 요청)
  const [confImageCollapsed, setConfImageCollapsed] = useState(false);
  // 2026-07-28 · 확정표 이미지 페이지별 zoom·pan (사용자 요청 · 손바닥 드래그)
  const [confImageZoom, setConfImageZoom] = useState<Record<number, number>>({});
  const [confImagePan, setConfImagePan] = useState<Record<number, { x: number; y: number }>>({});
  const confImageDragRef = useRef<{ pn: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = confImageDragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      setConfImagePan(prev => ({ ...prev, [d.pn]: { x: d.baseX + dx, y: d.baseY + dy } }));
    };
    const onUp = () => { confImageDragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);
  // 확정표에서 거래일 편집 중인 페이지
  const [editingConfDate, setEditingConfDate] = useState<number | null>(null);
  const [editingConfDateVal, setEditingConfDateVal] = useState<string>("");
  // 2026-07-23 · 정산차액 사용자 override (사용자 요청 "정산차액도 입력가능")
  const [pageDiscountOverride, setPageDiscountOverride] = useState<Record<number, { amount: number; label: string }>>({});
  // 인라인 편집 UI · null = 편집 아님 · "discount"|"balance" = 편집 중
  const [editingSummary, setEditingSummary] = useState<{ pn: number; kind: "discount" | "balance" | "subtotal"; value: string; dirty?: boolean } | null>(null);
  // "직접 입력" 모드: 사용자가 잔고 금액을 수동으로 입력
  const [pageBalanceManualInput, setPageBalanceManualInput] = useState<Record<number, string>>({});
  const [pageBalanceModeManual, setPageBalanceModeManual] = useState<Set<number>>(new Set());
  // 2026-07-28 · 동의어 map · 재추출 시 · 로컬 캐시 우선 lookup
  // 사용자 요청 "재추출 버튼 누를때마다 동의어관리값 찾아서 매칭" · 아래 캐시 hit 시 즉시 적용
  const [synonymsMap, setSynonymsMap] = useState<Map<string, { name: string; code: string }>>(new Map());
  const loadSynonymsMap = useCallback(async () => {
    try {
      // 2026-08-21 · Framework Phase 3 · fetch → apiClient
      const { data: d } = await api.get<{ synonyms?: any[] }>("/api/ocr-synonyms");
      const m = new Map<string, { name: string; code: string }>();
      for (const syn of (d.synonyms ?? [])) {
        if (syn.cancelled) continue;
        const key = String(syn.prod_name_old ?? "").trim().toLowerCase();
        // 2026-07-28 · product_code 없어도 · 이름 매핑 자체가 유효한 동의어 (null 로 code 저장 가능)
        if (key && syn.prod_name_new) {
          m.set(key, { name: String(syn.prod_name_new), code: String(syn.product_code ?? "") });
        }
      }
      setSynonymsMap(m);
      console.log(`[synonymsMap] 로드 · ${m.size}건`);
    } catch { /* silent */ }
  }, []);
  useEffect(() => { loadSynonymsMap(); }, [loadSynonymsMap]);
  // 확정표 컬럼 접기
  const [collapsedConfCols, setCollapsedConfCols] = useState<Set<string>>(new Set());
  // 페이지별 접기 상태 제거 (2026-07-19) · 우측 명세서는 항상 펼침
  // 2026-07-22 · 상세정보 토글 삭제 후 · 항상 compact 모드 강제 (사용자 요청 "유통기한 이후 비고 등 표시 X")
  //   localStorage 잔여 값 무시 · false 상수
  const showRawDetail = false;
  const setShowRawDetail = (_: boolean) => { /* no-op · 토글 제거됨 */ };
  void setShowRawDetail;
  // 1차보정 압축(기본) 모드에서 표시할 필수 컬럼 순서
  // 요구사항: 공급처 → 품명 → 수량 → 단가 → 금액 → 규격 → 유통기한
  const RAW_ESSENTIAL_COLS = ["거래일", "공급처", "품명", "수량", "단가", "VAT", "금액", "유통기한", "규격", "비고"];

  // ── 컬럼 너비 조정 ────────────────────────────────────────────────────────────
  const [colWidths, setColWidths] = useState<Record<number, number>>({});
  const resizeRef = useRef<{ ci: number; startX: number; startW: number } | null>(null);

  // ── ERP 뷰 상태 → useErpViewState 훅으로 분리 ─────────────────────────────
  const {
    ERP_TABLE_COLS_DEFAULT,
    erpViewTab, setErpViewTab,
    erpCellEdits, setErpCellEdits,
    editingErpCell, setEditingErpCell,
    editingErpCellVal, setEditingErpCellVal,
    erpColWidths, startErpColResize,
  } = useErpViewState();
  // ── 셀 인라인 편집 (수량/단가/금액) ───────────────────────────────────────
  // 2026-07-15: shiftRowLeft 지원 위해 string 값도 허용 (품명·규격·유통기한 등 이동)
  const [cellEdits,      setCellEdits     ] = useState<Record<number, Record<number, string | number | null>>>({});
  // 2026-07-23 · 편집 감지 · onUserEdit 콜백 호출 (부모가 이후 setPages 스킵)
  //   cellEdits · autoSynonymMatches · rawSupplierByPage 변경 시 트리거
  useEffect(() => {
    if (!onUserEdit) return;
    if (Object.keys(cellEdits).length > 0) onUserEdit();
  }, [cellEdits, onUserEdit]);
  // 2026-07-24 · 사용자 요청 "편집한 것은 저장되게 · 추출과 무관하게" 진단용 로그
  //   cellEdits 크기 변화 감지 · 감소 시 경고 (편집 손실 추적)
  const prevCellEditsSizeRef = useRef(0);
  useEffect(() => {
    const size = Object.values(cellEdits).reduce<number>((s, row) => s + Object.keys(row as object).length, 0);
    if (size < prevCellEditsSizeRef.current) {
      console.warn(`[cellEdits 손실 감지] 이전 ${prevCellEditsSizeRef.current}개 → 현재 ${size}개 · 셀 편집이 줄어듬`);
    }
    prevCellEditsSizeRef.current = size;
  }, [cellEdits]);
  const [editingCell,    setEditingCell   ] = useState<{ ri: number; ci: number } | null>(null);
  const [editingCellVal, setEditingCellVal] = useState("");
  // 2026-07-24 · 사용자 요청 "방향키가 셀로 이동" · 편집 종료 후에도 focus 유지 · 방향키로 셀간 이동
  const [focusedCell, setFocusedCell] = useState<{ ri: number; ci: number } | null>(null);
  // (document keydown 리스너는 · effectiveDispRows 등 의존 변수 선언 이후에 정의됨 · 아래 참조)
  // ── 셀 재추출 순환 인덱스 (2026-07-16) ────────────────────────────────────
  // numericCellCycle[`${ri}-${ci}`] = 현재 순환 인덱스 (-1 = 원본, 0+ = 후보)
  // numericCellCandidates[`${ri}-${ci}`] = 이 셀에 대해 캐싱된 후보 배열
  const [numericCellCycle, setNumericCellCycle] = useState<Record<string, number>>({});
  const [numericCellCandidates, setNumericCellCandidates] = useState<Record<string, (string | number)[]>>({});
  // 후보 없음 시각 피드백 (2026-07-18)
  const [noCandidateCells, setNoCandidateCells] = useState<Set<string>>(new Set());

  // ── 1차보정 체크박스 마킹 (삭제 대기 · 취소선 표시) ─────────────────────
  const [hiddenRawRows, setHiddenRawRows] = useState<Set<number>>(new Set());
  // 체크박스 → 확인 다이얼로그로 처리 · 실제 로직은 아래 useCallback (effectiveDispRows 필요)
  const toggleHiddenRawRowRef = useRef<(ri: number) => void>(() => {});
  const toggleHiddenRawRow = useCallback((ri: number) => toggleHiddenRawRowRef.current(ri), []);
  // ── 확정 삭제된 행 (렌더에서 완전 제외) ──────────────────────────────────
  const [permanentlyDeletedRawRows, setPermanentlyDeletedRawRows] = useState<Set<number>>(new Set());
  // "🗑 선택 삭제" 버튼: 삭제 함수는 effectiveDispRows/makeRowSignature 선언 뒤에 정의됨 (아래)
  const commitRawRowsDeletionRef = useRef<() => void | Promise<void>>(() => {});
  const commitRawRowsDeletion = useCallback(() => commitRawRowsDeletionRef.current(), []);
  // "🔄 다시 읽어오기" 버튼: 선택된 행들의 셀 편집·자동보정·삭제 상태를 모두 초기화 → raw OCR 원본으로 복원
  const revertSelectedRawRows = useCallback(() => {
    if (hiddenRawRows.size === 0) return;
    // 1) cellEdits 에서 해당 ri 제거
    setCellEdits(prev => {
      const next = { ...prev };
      hiddenRawRows.forEach(ri => { delete next[ri]; });
      return next;
    });
    // 2) amountCorrections 에서 해당 ri 제거
    setAmountCorrections(prev => {
      const next = { ...prev };
      hiddenRawRows.forEach(ri => { delete next[ri]; });
      return next;
    });
    // 3) 확정 삭제 목록에서도 제거 (원본 복구되면 다시 표시)
    setPermanentlyDeletedRawRows(prev => {
      const n = new Set(prev);
      hiddenRawRows.forEach(ri => n.delete(ri));
      return n;
    });
    // 4) 체크 해제
    setHiddenRawRows(new Set());
  }, [hiddenRawRows]);
  // 각 행별 재추출 회전 인덱스 (같은 행 재추출 클릭시 다른 후보로 순환)
  const [reextractCycle, setReextractCycle] = useState<Record<number, number>>({});
  // ── DB에 저장된 삭제 서명 (매치되는 행은 자동 필터) ───────────────────────
  const [dbDeletedSignatures, setDbDeletedSignatures] = useState<Set<string>>(new Set());
  const normNameForSig = useCallback((s: string) => {
    return s.toLowerCase().replace(/[\s\-_()（）,·./[\]{}「」『』@*※~+【】<>《》"'`^!?:;|]/g, "").trim();
  }, []);
  const normSupplierForSig = useCallback((s: string) => {
    return s.replace(/주식회사|유한회사|㈜|\(주\)|\(유\)|\(재\)/gi, "")
            .replace(/\s+/g, "").toLowerCase();
  }, []);
  const makeRowSignature = useCallback((supplier: string, name: string) => {
    return `${normSupplierForSig(supplier)}|${normNameForSig(name)}`;
  }, [normSupplierForSig, normNameForSig]);
  // 초기 로드
  useEffect(() => {
    // 2026-08-21 · Framework Phase 3 · fetch → apiClient
    api.get<{ rows?: any[] }>("/api/ocr-deleted-rows")
      .then(({ data }) => {
        if (Array.isArray(data?.rows)) {
          setDbDeletedSignatures(new Set(data.rows.map((r: any) => String(r.signature ?? ""))));
        }
      })
      .catch(() => {});
  }, []);
  // ── 수동 추가 행 (사용자가 명세서에 없는 것 직접 입력) ─────────────────
  //   effectiveDispRows 뒤에 append 렌더 · dispRows 인덱스와 겹치지 않게 오프셋
  const [manualRows, setManualRows] = useState<Array<{
    pageNum: number;
    values: (string | number | null)[]; // dispHeaders 순서
  }>>([]);
  const addManualRow = useCallback((pn: number) => {
    setManualRows(prev => [...prev, { pageNum: pn, values: [] }]);
  }, []);
  const updateManualRow = useCallback((mIdx: number, ci: number, val: string, isNumeric: boolean) => {
    setManualRows(prev => prev.map((r, i) => {
      if (i !== mIdx) return r;
      const nv = [...r.values];
      if (isNumeric) {
        const num = parseNumber(val.replace(/,/g, ""));
        nv[ci] = num > 0 ? num : (val.trim() ? val : null);
      } else {
        nv[ci] = val.trim() || null;
      }
      return { ...r, values: nv };
    }));
  }, []);
  const removeManualRow = useCallback((mIdx: number) => {
    setManualRows(prev => prev.filter((_, i) => i !== mIdx));
  }, []);

  /**
   * 개별 행 재추출 (체크박스 옆 🔄 버튼)
   *
   * 순환 (클릭할 때마다) — v4c 재정렬: 사용자 통찰 "품명 있는 행 → 주변 숫자 읽기 우선"
   *   0) 원본 복원 (편집·보정 삭제)
   *   1) **품명 근처 숫자 재추출** — 인접 행(±1) 후보로 비어있는 셀 채움 (제일 먼저)
   *   2) 자기 + 인접 후보 통합해서 최적 조합 재배치
   *   3) 수량 ↔ 단가 스왑
   *   4) 단가 ↔ 금액 스왑
   *   5) rawRow 의 numeric 후보 값을 비어있는 컬럼에 채움 (자기 행)
   *   6) rawRow numeric 후보 조합 다른 배치 (자기 행 · 매그니튜드 재정렬)
   */
  // 2026-07-28 · 첫행보정 관련 콜백 삭제 (사용자 요청 "첫행보정기능 제거")
  //   applyFirstRowPattern (v3 position-first) · applyLongestRowPatternAll · 모두 삭제
  //   자동정리 (runColumnPipeline) 파이프라인이 대체


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

  // ── 2026-07-15: 한 칸 왼쪽 shift (OCR 컬럼 밀림 정정) ──────────────────────
  //   effectiveDispRows (편집 반영본) 의 그 행 셀들을 왼쪽으로 1칸 이동
  //   첫 컬럼(0번) 값은 버리고 · 마지막 컬럼은 null 로 · cellEdits 로 저장
  //   → rawRows 원본은 건드리지 않음 · 사용자가 개별 셀 편집으로 재조정 가능
  const shiftRowLeft = useCallback((ri: number) => {
    const baseRow = effectiveDispRowsRef.current[ri] ?? dispRows[ri];
    if (!Array.isArray(baseRow) || baseRow.length === 0) return;
    const nextEdits: Record<number, string | number | null> = {};
    for (let ci = 0; ci < baseRow.length; ci++) {
      const src = ci + 1 < baseRow.length ? baseRow[ci + 1] : null;
      // number / string / null 유지 (원본 타입 존중) · undefined → null
      const val: string | number | null =
        src == null ? null
        : typeof src === "number" ? src
        : typeof src === "string" ? src
        : String(src);
      nextEdits[ci] = val;
    }
    setCellEdits(prev => ({ ...prev, [ri]: { ...(prev[ri] ?? {}), ...nextEdits } }));
    // shift 는 명시 편집이므로 재추출 cycle 은 원본(0)으로 리셋
    setReextractCycle(prev => {
      if ((prev[ri] ?? 0) === 0) return prev;
      const next = { ...prev };
      delete next[ri];
      return next;
    });
    console.log(`[shiftRowLeft] ri=${ri} · ${baseRow.length}개 셀 왼쪽 이동`);
  }, [dispRows]);

  // effectiveDispRows 참조용 ref (revertSingleRawRow 가 자기보다 뒤에 선언된 값 접근용)

  // ── Feature 2: 공급사 변경 시 동의어 일괄 추가 ───────────────────────────
  const [addSynonymsOnChange, setAddSynonymsOnChange] = useState(true);
  const [synonymAddStatus, setSynonymAddStatus] = useState<{ pageNum: number; status: 'loading' | 'done' | 'error'; count: number } | null>(null);

  // ── 공급처 변경 재파싱 + 템플릿 저장 ──────────────────────────────────────
  type ReparseStatus = 'loading' | 'done' | 'error' | 'saved';
  const [reparseStatus,   setReparseStatus  ] = useState<Record<number, ReparseStatus>>({});
  const [reparseSupplier, setReparseSupplier] = useState<Record<number, string>>({});
  // 페이지별 재추출 시도 카운트 (2026-07-19 · 순환 approach)
  //   0=default(다음 클릭) → 1=rearrange → 2=high-contrast → 3=gemini → wrap-around
  const [reparseAttempt, setReparseAttempt] = useState<Record<number, number>>({});
  const REPARSE_APPROACH_CYCLE = ["default", "rearrange", "high-contrast", "gemini"] as const;
  const APPROACH_LABEL: Record<string, string> = {
    "default":       "원본 방식 재추출",
    "rearrange":     "rawText 재배치 (헤더·컬럼 순서 대안)",
    "high-contrast": "대비강화 전처리 후 재 OCR",
    "gemini":        "Gemini API 강제 사용",
  };
  const APPROACH_SHORT: Record<string, string> = {
    "default":       "원본",
    "rearrange":     "재배치",
    "high-contrast": "대비강화",
    "gemini":        "Gemini",
  };

  // ── Feature 3: OCR 추출 후 자동 동의어 1차 보정 · onUserEdit 트리거 ────
  // autoSynonymMatches/autoSynonymLoading/barcodeAutoMap 은 useMatchingState 에서 선언됨 (아래)
  // useEditMigration 은 autoSynonymMatches 선언 이후에 호출해야 하므로 여기 위치 유지 불가 · 아래로 이동

  // effectiveDispRows: 자동보정 + 셀 인라인 편집 결과를 반영한 행 (cellEdits 우선)
  // 2026-07-18 v2 · 금액 무조건 자동 반영 (사용자 요청)
  //   - 처음부터 수량×단가 로 금액 계산 (OCR 원본 금액 있어도 덮어씀)
  //   - 재추출로 수량/단가 바뀌면 즉시 금액 갱신
  //   - 유일한 예외: 사용자가 금액 셀을 직접 편집한 경우 (cellEdits[ri][amtIdx] 있음)
  const _qtyIdxER = dispHeaders.indexOf("수량");
  const _priIdxER = dispHeaders.indexOf("단가");
  const effectiveDispRows = dispRows.map((row, ri) => {
    const hasAmtCorr = amtIdx >= 0 && amountCorrections[ri] !== undefined;
    const edits = cellEdits[ri];
    const nr = [...row];
    if (hasAmtCorr) nr[amtIdx] = amountCorrections[ri];
    if (edits) for (const [ciStr, val] of Object.entries(edits)) nr[Number(ciStr)] = val as string | number;
    // 2026-07-22 정책: Q*P=A 엄격 · 단가 없으면 금액도 비움
    //   - Q>0, P>0 이면 amount = Q*P (덮어씀)
    //   - P 없으면(0/null) amount 도 null (단가 없이 금액만 표시되는 이상한 상태 방지)
    //   - Q 없어도(직접 편집 등) 마찬가지 · 단가만 있으면 amount null
    //   - 예외: 사용자가 직접 금액 편집한 경우 (cellEdits[ri][amtIdx] 있음) → 그대로 유지
    if (amtIdx >= 0 && _qtyIdxER >= 0 && _priIdxER >= 0) {
      const q = parseNumber(nr[_qtyIdxER]);
      const p = parseNumber(nr[_priIdxER]);
      const userEditedAmt = edits && edits[amtIdx] != null;
      // 2026-07-24 · 사용자 요청 "금액 입력 시 수량 있으면 단가 역계산"
      //   commitCellEdit 에서 이미 P 를 A/Q 로 계산해 cellEdits 에 넣어놨음
      //   여기서는 · 사용자 편집한 금액은 그대로 유지 · Q*P 로 덮어쓰지 않음
      // 2026-07-24 · 사용자 요청 "금액은 맨 마지막 1원자리에서 올림" · Math.ceil(x/10)*10
      if (q > 0 && p > 0 && !userEditedAmt) {
        nr[amtIdx] = Math.ceil((q * p) / 10) * 10;
      } else if (!userEditedAmt) {
        // 사용자 직접 편집이 아니면서 Q 또는 P 없으면 · 금액 표시 X
        nr[amtIdx] = null;
      }
      // 사용자 편집값이면 그대로 유지
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

  // 실제 체크박스 로직: 마킹만 (개별 확인 다이얼로그 제거 · 2026-07-10)
  //   → 삭제/완전삭제는 하단 "🗑 선택 N행 삭제" 버튼에서 1회 확인 후 일괄 처리
  toggleHiddenRawRowRef.current = (ri: number) => {
    setHiddenRawRows(prev => {
      const n = new Set(prev);
      if (n.has(ri)) n.delete(ri);
      else n.add(ri);
      return n;
    });
  };

  // 2026-07-24 · 리팩터 · 방향키 셀 이동은 useCellNavigation 훅으로 분리
  useCellNavigation({
    focusedCell, editingCell, dispHeaders, effectiveDispRows,
    permanentlyDeletedRawRows, hiddenRawRows, isRowDbDeleted,
    setFocusedCell, setEditingCell, setEditingCellVal,
  });

  // 실제 "🗑 선택 삭제" 로직 (effectiveDispRows/makeRowSignature 참조를 위해 여기서 세팅)
  //   → 체크된 여러 행을 한 번의 확인 다이얼로그로 일괄 완전삭제 + DB 서명 저장
  commitRawRowsDeletionRef.current = async () => {
    if (hiddenRawRows.size === 0) return;
    const cnt = hiddenRawRows.size;
    if (!await confirm({ message: `체크된 ${cnt}개 행을 완전히 삭제하시겠습니까?\n· DB에 서명이 저장되어 다음 스캔에도 자동 필터됩니다.`, danger: true })) return;
    const items: Array<{ supplier: string; name: string }> = [];
    hiddenRawRows.forEach(ri => {
      const row = effectiveDispRows[ri] ?? dispRows[ri];
      if (!Array.isArray(row)) return;
      const pn = pageNums[ri];
      const supplier = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
      const nameIdxLocal = dispHeaders.indexOf("품명");
      const name = nameIdxLocal >= 0 ? String(row[nameIdxLocal] ?? "").trim() : "";
      if (supplier && name) items.push({ supplier, name });
    });
    setPermanentlyDeletedRawRows(prev => {
      const n = new Set(prev);
      hiddenRawRows.forEach(ri => n.add(ri));
      return n;
    });
    setDbDeletedSignatures(prev => {
      const n = new Set(prev);
      items.forEach(it => n.add(makeRowSignature(it.supplier, it.name)));
      return n;
    });
    setHiddenRawRows(new Set());
    if (items.length > 0) {
      // 2026-08-21 · Framework Phase 3 · fetch → apiClient · fire-and-forget
      api.post("/api/ocr-deleted-rows", { items }).catch(() => {});
    }
  };
  // 행별 유효 금액 계산: 금액 있으면 그대로, 없으면 수량×단가 자동계산값 (표시와 소계 통일)
  const _qtyIdxForEff = dispHeaders.indexOf("수량");
  const _priIdxForEff = dispHeaders.indexOf("단가");
  const getRowEffectiveAmount = (row: any[]): number => {
    if (amtIdx < 0) return 0;
    const raw = parseNumber(row[amtIdx]);
    if (raw > 0) return raw;
    if (_qtyIdxForEff >= 0 && _priIdxForEff >= 0) {
      const q = parseNumber(row[_qtyIdxForEff]);
      const p = parseNumber(row[_priIdxForEff]);
      // 2026-07-24 · 사용자 요청 "금액은 맨 마지막 1원자리에서 올림"
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
    erpStockMap, setErpStockMap, erpStockLoaded, setErpStockLoaded,
    overrides, setOverrides, supplierOverrides, setSupplierOverrides,
    confirmed, setConfirmed, confirmedAt, setConfirmedAt,
    savedSynonyms, setSavedSynonyms,
    savedSupplierAliases, setSavedSupplierAliases,
    retryingRows, setRetryingRows,
    candidatesMap, setCandidatesMap, openCandRow, setOpenCandRow,
    selectedCands, setSelectedCands,
    nameSearchResults, setNameSearchResults,
    nameSearchOpenRow, setNameSearchOpenRow, nameSearchDebounce,
    restoredRows, setRestoredRows,
    pendingSyn, setPendingSyn, savedSynonymIds, setSavedSynonymIds,
    cancelledAutoSyn, setCancelledAutoSyn,
    cancelledAutoMap, setCancelledAutoMap,
    cancelledRows, setCancelledRows,
    savingConfirmed, setSavingConfirmed,
    saveConfirmedToast, setSaveConfirmedToast,
    rawEditValues, setRawEditValues, rawSearchDebounce,
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

  // ── 공급사 미입력 페이지 검출 (필수 입력 검증 · 2026-07-15) ────────────
  //   rawSupplierByPage 편집값 우선 → structuredPages meta.supplier 폴백
  //   빈 문자열/null 이면 미입력으로 간주 → 자동보정·저장 차단
  // ── 공급사 미입력 자동보완 → useMissingSupplierAutoFill 훅으로 분리 ──
  const { missingSupplierPages, hasMissingSupplier } = useMissingSupplierAutoFill({
    structuredPages, rawSupplierByPage, vendorNames, setRawSupplierByPage,
  });

  // ── 동의어/공급사 콜백 → useSynonymCallbacks 훅으로 분리 ──────────────
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
  // 2026-07-28 · barcodeAutoMap 자동 바인딩 제거 · backward-compat 유지
  void barcodeMatches;
  // 2026-07-24 · 템플릿 자동 저장 훅
  useAutoTemplateSave({ structuredPages, rawSupplierByPage, saveTemplate });
  const commitCellEdit = useCallback((ri: number, ci: number, rawVal: string) => {
    // 2026-07-22: 빈 입력 (아무것도 안 입력하고 blur/Enter) → 원래 값 복원 · cellEdits 미변경
    //   (기존: cellEdits[ri][ci] = null 로 저장 · 원래 값 사라짐 문제 해결)
    if (rawVal.trim() === "") {
      setEditingCell(null);
      return;
    }
    const cleaned = rawVal.replace(/[^0-9.-]/g, "");
    const numVal = cleaned === "" ? null : (parseFloat(cleaned) || null);
    // 셀 값 갱신 + 수량·단가 편집이면 금액 잠금 자동 해제 (2026-07-19)
    //   → effectiveDispRows 에서 수량×단가 로 다시 자동 계산됨
    setCellEdits(prev => {
      const rowEdits = { ...(prev[ri] ?? {}), [ci]: numVal };
      const qIdx = dispHeaders.indexOf("수량");
      const pIdx = dispHeaders.indexOf("단가");
      const aIdx = dispHeaders.indexOf("금액");
      // 수량 또는 단가 편집 → 이전에 잠긴 금액 편집값 제거 (자동재계산 유발)
      if ((ci === qIdx || ci === pIdx) && aIdx >= 0) {
        delete rowEdits[aIdx];
      }
      // 2026-07-24 · 사용자 요청 "금액 입력 시 수량 있으면 단가 역계산"
      //   금액 편집 · 수량 유효 · 단가 없거나 자동값 → 단가 = 금액/수량 (반올림)
      if (ci === aIdx && qIdx >= 0 && pIdx >= 0 && numVal != null && numVal > 0) {
        const currentQty = Number(rowEdits[qIdx] ?? dispRows[ri]?.[qIdx] ?? 0);
        if (currentQty > 0) {
          const derivedPrice = Math.round(numVal / currentQty);
          rowEdits[pIdx] = derivedPrice;
          console.log(`[commitCellEdit] 금액 ${numVal} / 수량 ${currentQty} = 단가 ${derivedPrice} (역계산)`);
        }
      }
      return { ...prev, [ri]: rowEdits };
    });
    setEditingCell(null);
  }, [dispHeaders, dispRows]);

  const handleRetry = useCallback(async (ri: number, inputName: string, supplierHint?: string) => {
    if (retryingRows.has(ri)) return;
    if (openCandRow === ri) { setOpenCandRow(null); return; }
    setRetryingRows(prev => new Set([...prev, ri]));
    try {
      // 2026-08-21 · Framework Phase 3 · fetch → apiClient
      const { data } = await api.post<{ candidates?: CandidateInfo[] }>("/api/ocr-match", {
        name: inputName,
        topN: 10,
        supplier: supplierHint ?? "",
      });
      setCandidatesMap(prev => ({ ...prev, [ri]: data.candidates ?? [] }));
      setOpenCandRow(ri);
    } catch { /* silent · handled by outer state */ }
    finally {
      setRetryingRows(prev => { const s = new Set(prev); s.delete(ri); return s; });
    }
  }, [retryingRows, openCandRow]);

  const searchByName = useCallback((ri: number, name: string, supplierHint?: string) => {
    clearTimeout(nameSearchDebounce.current[ri]);
    if (name.trim().length < 2) { setNameSearchOpenRow(null); return; }
    nameSearchDebounce.current[ri] = setTimeout(async () => {
      const params = new URLSearchParams({ q: name.trim() });
      if (supplierHint?.trim()) params.set("supplier", supplierHint.trim());
      try {
        // 2026-08-21 · Framework Phase 3 · fetch → apiClient
        const { data } = await api.get<any[]>(`/api/products-search?${params}`);
        const list = Array.isArray(data) ? data : [];
        setNameSearchResults(prev => ({ ...prev, [ri]: list }));
        setNameSearchOpenRow(list.length > 0 ? ri : null);
      } catch { /* silent */ }
    }, 280);
  }, []);

  const handleSelectCandidate = useCallback((ri: number, cand: CandidateInfo, inputName: string, supplier: string) => {
    selectCandidate(ri, cand);
    saveSynonym(ri, inputName, cand.code, supplier || undefined, cand.name);
  }, [selectCandidate, saveSynonym]);

  // ── 확정표에 저장 (외부 콜백에 ConfirmedItem[] 전달) ──────────────────────
  // 2026-07-28 · 리팩터 · useSaveConfirmed 훅으로 분리
  const { handleSaveConfirmed } = useSaveConfirmed({
    onSaveConfirmed,
    pageImages,
    rowData: { effectiveDispRows, pageNums, dispHeaders, nameIdx, amtIdx, ocrSuppIdx, ocrQtyIdx, ocrPriIdx },
    supplierData: { rawSupplierByPage, supplierOverrides, globalSupplier, missingSupplierPages, structuredPages },
    matchData: { matchItems, cancelledRows, selectedCands, cancelledAutoMap, autoSynonymMatches, barcodeAutoMap, cancelledAutoSyn, overrides },
    balanceData: { pageSupplierBalances, pageBalanceOverride, pageBalanceFromConfig, discountApplyMode, pageSubtotalChoices, erpCellEdits, confirmedAt },
    filterData: { permanentlyDeletedRawRows, hiddenRawRows, isRowDbDeleted },
    getPageDiscount,
    getPageDisplayTotal,
    setSaveConfirmedToast,
    setSavingConfirmed,
  });

  // ── 2차보정 매칭 → useHandleMatch 훅으로 분리 ─────────────────────────────────────
  const { handleMatch } = useHandleMatch({
    nameIdx, ocrSuppIdx, dispRows, pageNums,
    rawSupplierByPage, structuredPages, globalSupplier,
    missingSupplierPages, cellEdits, autoSynonymMatches,
    hiddenRawRows, permanentlyDeletedRawRows, isRowDbDeleted,
    showError, setMatching, setMatchItems,
    setOverrides, setSupplierOverrides, setConfirmed,
    setSavedSynonyms, setSavedSupplierAliases,
    setRetryingRows, setCandidatesMap, setOpenCandRow,
    setSelectedCands, setCancelledRows,
  });

  // 2026-07-28 · 리팩터 · handleMatchPage · fillMissingPricesFromDB · verifyAndSwapPricesWithDB
  //   → useHandleMatchPage 훅으로 분리
  const { matchingPage, handleMatchPage, fillMissingPricesFromDB, verifyAndSwapPricesWithDB } = useHandleMatchPage({
    dispHeaders, dispRows, nameIdx, pageNums, rawSupplierByPage, ocrSuppIdx,
    structuredPages, globalSupplier, cellEdits, autoSynonymMatches,
    hiddenRawRows, permanentlyDeletedRawRows, isRowDbDeleted,
    pageBalanceOverride, pageSupplierBalances, saveSupplierBalance,
    matchItems, setMatchItems, setConfirmedPages,
    setCellEdits, setDbFilledCells, setSaveConfirmedToast, matchItemsRef,
  });

  // 2026-07-28 · 리팩터 · matchRawToPurchaseHistory → usePurchaseHistoryMatch 훅으로 분리
  const { matchRawToPurchaseHistory } = usePurchaseHistoryMatch({
    dispHeaders, matchItems, dispRows, pageNums,
    permanentlyDeletedRawRows, hiddenRawRows, isRowDbDeleted,
    setCellEdits, setDbFilledCells, setSaveConfirmedToast,
  });

  // 2026-07-23 · 사용자 요청 "품명 재추출 · 수량·금액 있는 행의 한글 · 공급사 DB 매칭되는 것으로"
  //   1. 현재 행의 수량·금액 있는지 확인 (없으면 스킵 · 경고)
  //   2. rawText 에서 현재 품명 앵커 앞뒤로 한글 토큰(3자+) 수집
  //   3. 각 후보를 /api/products-search 에 공급사 필터로 조회
  //   4. 첫 매칭 → autoSynonymMatches[ri] 저장 (동의어 자동 등록)
  //   5. 매칭 실패 시 · 가장 긴 한글 토큰을 cellEdits 로 저장 (사용자 확인용)
  const [reextractingName, setReextractingName] = useState<Set<number>>(new Set());
  // 2026-07-24 · 사용자 요청 "재추출 순환 · 품명 헤더 이후 값 우선순위"
  //   ri → 후보 배열 · 현재 순환 인덱스 (-1 = DB 매칭 시도 중, 0+ = 후보 순환)
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

  // 2026-07-28 · 리팩터 · runColumnPipeline + 자동파이프라인 → useAutoPipeline 훅으로 분리
  const { runColumnPipeline, runningPipeline } = useAutoPipeline({
    structuredPages, confirmedPages, pageNums,
    cellEdits, autoSynonymMatches,
    handleMatchPage, fillMissingPricesFromDB, verifyAndSwapPricesWithDB, matchRawToPurchaseHistory,
    setConfirmedPages, setCellEdits, setAutoSynonymMatches, setSaveConfirmedToast,
  });

  // 2026-07-28 · 사용자 요청 "이미지 갯수 ≠ 페이지 갯수 · 명세서 소계 0 → 재추출"
  //   조건 · (a) pageImages.length !== structuredPages.length OR (b) 페이지 소계 = 0
  //   자동 재추출 · onReparsePage 있으면 자동 트리거 (페이지당 1회 · 무한루프 방지)
  //   없으면 · 토스트로 사용자에게 문제 알림
  const autoReparseRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (structuredPages.length === 0) {
      autoReparseRef.current = new Set();
      return;
    }
    // (a) 이미지·페이지 개수 불일치 감지
    const imgCount = pageImages?.length ?? 0;
    const pageCount = structuredPages.length;
    const countMismatch = imgCount > 0 && imgCount !== pageCount;
    // (b) 소계 0 페이지 감지
    const zeroSubtotalPages: number[] = [];
    for (const p of structuredPages) {
      if (autoReparseRef.current.has(p.page)) continue;
      const rowsSum = effectivePageTotals.get(p.page) ?? 0;
      const stated = typeof p.meta?.total === "number" ? p.meta.total : 0;
      const effective = stated > 0 ? stated : rowsSum;
      if (effective === 0) zeroSubtotalPages.push(p.page);
    }
    if (!countMismatch && zeroSubtotalPages.length === 0) return;
    // 알림 + 자동 재추출 (onReparsePage 있으면)
    if (countMismatch) {
      const msg = `⚠ 이미지 ${imgCount}장 ≠ 페이지 ${pageCount}건 · OCR 오분리 가능성`;
      console.warn(`[auto-reparse] ${msg}`);
      setSaveConfirmedToast({ type: "error", msg });
      setTimeout(() => setSaveConfirmedToast(null), 4000);
    }
    if (zeroSubtotalPages.length > 0) {
      console.warn(`[auto-reparse] 소계 0 페이지 · 재추출 대상:`, zeroSubtotalPages);
      if (onReparsePage) {
        for (const pn of zeroSubtotalPages) autoReparseRef.current.add(pn);
        (async () => {
          for (const pn of zeroSubtotalPages) {
            const supp = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
            setSaveConfirmedToast({ type: "success", msg: `⏳ ${pn}번 · 소계 0 · 자동 재추출 중...` });
            try {
              await onReparsePage(pn, supp, "default");
              setSaveConfirmedToast({ type: "success", msg: `✅ ${pn}번 · 재추출 완료` });
            } catch (e: any) {
              setSaveConfirmedToast({ type: "error", msg: `❌ ${pn}번 · 재추출 실패 · ${e?.message ?? "오류"}` });
            }
            setTimeout(() => setSaveConfirmedToast(null), TIMING.TOAST_MEDIUM);
          }
        })();
      } else {
        setSaveConfirmedToast({ type: "error", msg: `⚠ 소계 0 페이지 ${zeroSubtotalPages.length}건 · 수동 재추출 필요 (pn: ${zeroSubtotalPages.join(",")})` });
        setTimeout(() => setSaveConfirmedToast(null), TIMING.TOAST_EXTRA_LONG);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuredPages, pageImages]);

  // ── 확정 표 ──────────────────────────────────────────────────────────────
  // 2026-07-27 · 사용자 요청 "확정표에서 확정일·규격·공급사잔고 컬럼 제거"
  // 2026-07-28 · 사용자 요청 "거래일·공급사 · 상품코드·상품명 · 각각 한 셀에 두 줄"
  const CONF_HEADERS = [
    "거래일·공급사","상품코드·상품명",
    "마스터 매입단가","전표 매입단가","매입수량","매입총계",
    "판매단가","이익률","유통기한",
  ];

  const COL_ALIAS: Record<string, string> = {
    "품명":"상품명","품목명":"상품명","상품명":"상품명",
    "코드":"상품코드","품목코드":"상품코드","상품코드":"상품코드",
    "규격":"규격","사양":"규격",
    "매입수량":"매입수량","수량":"매입수량","발주수량":"매입수량",
    "단가":"전표 매입단가","매입단가":"전표 매입단가","전표단가":"전표 매입단가","전표 매입단가":"전표 매입단가",
    "마스터단가":"마스터 매입단가","마스터 매입단가":"마스터 매입단가",
    "금액":"매입총계","합계":"매입총계","매입총계":"매입총계","공급가액":"매입총계","매입금액":"매입총계",
    "공급처":"공급처","공급업체":"공급처","공급사":"공급처","거래처":"공급처","납품처":"공급처",
    "판매단가":"판매단가","소비자가":"판매단가","소비자단가":"판매단가",
    "이익률":"이익률",
    "유효기간":"유통기한","소비기한":"유통기한","유통기한":"유통기한","만료일":"유통기한",
    "거래일":"거래일","일자":"거래일","날짜":"거래일","거래일자":"거래일","거래날짜":"거래일",
  };

  // ── XLS 서식 파일 상태 → useXlsTemplate 훅으로 분리 ─────────────────────
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
  // 2026-07-24 · 리팩터 · 잔고 자동 로드는 useAutoBalanceLoad 훅으로 분리
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
