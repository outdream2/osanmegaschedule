import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TIMING } from "../../constants/timing";
import { useConfirm } from "../../hooks/useConfirm";
// 2026-08-21 · Framework Phase 3 · alert → useToast
import { useToast, toastClass } from "../../hooks/useToast";
// 2026-08-21 · Framework Phase 3 · fetch → apiClient
import { api } from "../../lib/apiClient";
import * as XLSX from "xlsx";
import { Wand2, CheckCircle, AlertTriangle, XCircle, X, Bookmark, BookmarkCheck, Search, Pencil, BookmarkPlus, BookOpen, Check, Save } from "lucide-react";
import { Spinner } from "../common/Spinner";
// 2026-08-21 · Framework Phase 3 · Card 프리미티브 (raw wrapper 이관)
import { Card } from "../common/Card";
import { isNonProductText, isValidSupplierHint, isValidProductName, scoreProductRow, cleanProductName } from "../../lib/ocrRowFilter";
import { reextractCellCandidates } from "../../lib/cellReextract";
import { VendorDetailModal, type Vendor } from "../LandingPage/VendorListEditor";
import { useVendors } from "../../hooks/useVendors";
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
import { SupplierChangeDialog } from "./RawOcrTable/SupplierChangeDialog";
import { DeleteSynonymDialog } from "./RawOcrTable/DeleteSynonymDialog";
import {
  exportCsv as _exportCsv,
  parseXlsxTemplateHeaders as _parseXlsxTemplateHeaders,
  writeXlsxWithTemplate as _writeXlsxWithTemplate,
  writeXlsxFresh as _writeXlsxFresh,
  writeErpUploadXlsx as _writeErpUploadXlsx,
} from "./RawOcrTable/exportHelpers";
import { computePageBalanceFromConfig as _computePageBalanceFromConfig } from "./RawOcrTable/balanceHelpers";
import { CrossCheckBadge } from "./RawOcrTable/CrossCheckBadge";
import { useOcrDerived } from "./RawOcrTable/useOcrDerived";
import { useAutoTemplateSave } from "./RawOcrTable/useAutoTemplateSave";
import { useAutoBalanceLoad } from "./RawOcrTable/useAutoBalanceLoad";
import { useEditMigration } from "./RawOcrTable/useEditMigration";
import { useCellNavigation } from "./RawOcrTable/useCellNavigation";
import { usePagesSnapshot } from "./RawOcrTable/usePagesSnapshot";
import { usePurchaseHistoryMatch } from "./RawOcrTable/usePurchaseHistoryMatch";
import { useAutoPipeline } from "./RawOcrTable/useAutoPipeline";
import { useHandleMatchPage } from "./RawOcrTable/useHandleMatchPage";
import { ErpMatchSubRow } from "./RawOcrTable/ErpMatchSubRow";
import {
  findNameHeaderIdx,
  findRowPositionInRawText,
  computeScanText,
  collectNameCandidates,
  scoreProductNameToken,
  koreanJaccardSimilarity,
} from "./RawOcrTable/productNameReextract";
import { XlsxExportSection } from "./RawOcrTable/XlsxExportSection";
import { useSaveConfirmed } from "./RawOcrTable/useSaveConfirmed";
import { useReextractCell } from "./RawOcrTable/useReextractCell";
import { useReextractProductName } from "./RawOcrTable/useReextractProductName";
import { useInvoiceImageControls } from "./RawOcrTable/useInvoiceImageControls";
import { usePageTotalsComputation } from "./RawOcrTable/usePageTotalsComputation";
import { ConfirmedTableSection } from "./RawOcrTable/ConfirmedTableSection";
import { FallbackPageSection } from "./RawOcrTable/FallbackPageSection";
import { NumericEditableCell, ExpiryCell, NameCell } from "./RawOcrTable/RawOcrCellRenderer";
import { RawPageImageCell } from "./RawOcrTable/RawPageImageCell";

// 외부 소비자(OcrPage.tsx)가 `import { type ConfirmedItem } from "./RawOcrTable"` 로 사용 중 → re-export 유지
export type { ConfirmedItem };

export const RawOcrTable: React.FC<RawOcrTableProps> = ({ pages: pagesFromProps, pageImages, rotation = -90, onReparsePage, barcodeMatches, balanceConfig: balanceConfigProp, onSaveConfirmed, onUserEdit }) => {
  const confirm = useConfirm();
  // 2026-08-21 · Framework Phase 3 · alert → useToast
  const { toast, showError } = useToast();

  // 공급사 목록 · 자동완성·조회 공용 (inline fetch 제거)
  const { vendors: _ocrVendors, refresh: refreshVendors } = useVendors();
  // 2026-07-24 · 리팩터 · 페이지 snapshot 은 usePagesSnapshot 훅으로 분리
  //   props.pages (SSE 업데이트) → 내부 스냅샷 (append-only) → dispRows 파생
  const pages = usePagesSnapshot(pagesFromProps);
  // 2026-07-24 · 리팩터 · 파생값 계산은 useOcrDerived 훅으로 분리 (원래 85줄 → 1줄)
  const derived = useOcrDerived(pages);
  const { structuredPages, fallbackPages, masterH, dispHeaders, dispRows, rawRows, pageNums, amtIdx, nameIdx } = derived;

  // ── 공급처 편집 상태 — supplierTotals 계산보다 먼저 선언해야 참조 가능
  const [rawSupplierByPage, setRawSupplierByPage] = useState<Record<number, string>>({});
  // 공급사 조회·수정 모달 (2026-07-18 · 명세서 헤더 공급사 클릭 시)
  const [vendorEditModal, setVendorEditModal] = useState<Vendor | null>(null);
  const openVendorEdit = useCallback(async (supplierName: string) => {
    const name = supplierName.trim();
    if (!name) return;
    const norm = (s: string) => s.toLowerCase().replace(/[()（）\s㈜(주)주식회사]/g, "");
    const target = norm(name);
    // 캐시된 목록에서 조회 (정확일치 우선 · 부분일치 fallback)
    let match = (_ocrVendors as unknown as Vendor[]).find(v => norm(String(v.company_name ?? "")) === target);
    if (!match) match = (_ocrVendors as unknown as Vendor[]).find(v => norm(String(v.company_name ?? "")).includes(target) || target.includes(norm(String(v.company_name ?? ""))));
    if (match) { setVendorEditModal(match); return; }
    // 신규 공급사 등록 유도
    if (await confirm({ message: `"${name}" 은(는) 공급사 DB 에 없습니다.\n신규 등록하시겠습니까?` })) {
      try {
        // 2026-08-21 · Framework Phase 3 · fetch → apiClient
        const { data: newV } = await api.post<Vendor>("/api/vendors", { company_name: name });
        setVendorEditModal(newV);
        refreshVendors(); // 캐시 갱신
      } catch (e) {
        console.error("[공급사조회] 실패:", e);
        showError("공급사 신규 등록 실패");
      }
    }
  }, [_ocrVendors, refreshVendors, showError]);
  const [editingRawSuppRow, setEditingRawSuppRow] = useState<number | null>(null);
  const [editingRawSuppVal, setEditingRawSuppVal] = useState("");
  const [supplierConfirm,   setSupplierConfirm  ] = useState<{ pageNum: number; newVal: string; rowCount: number; addSynonyms: boolean } | null>(null);
  // 셀 단위 선택 (Alt+Click · 재추출/삭제 대상 · 2026-07-14)
  //   key 형식: "ri:ci"
  const [checkedCells, setCheckedCells] = useState<Set<string>>(new Set());
  const toggleCellCheck = useCallback((ri: number, ci: number) => {
    setCheckedCells(prev => {
      const n = new Set(prev);
      const k = `${ri}:${ci}`;
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }, []);
  const clearCheckedCells = useCallback(() => setCheckedCells(new Set()), []);

  // 공급사 DB 리스트 (자동완성 · 2026-07-14) · useVendors 캐시에서 파생
  const vendorNames = useMemo<string[]>(
    () => _ocrVendors.map(v => String(v.company_name ?? "").trim()).filter(Boolean),
    [_ocrVendors],
  );
  // 공급처 편집 시 드롭다운 위치 (fixed positioning · 테이블 안 stacking context 우회)
  const [suppDropdownRect, setSuppDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const suppInputRef = useRef<HTMLInputElement | null>(null);

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
  // ERP 상품코드 → 현재고 매핑 (products-map API 캐시)
  const [erpStockMap, setErpStockMap] = useState<Record<string, number | null>>({});
  const [erpStockLoaded, setErpStockLoaded] = useState(false);
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

  // ── 2차 보정 뷰 전환 (검토 목록 / 명세서 뷰) ─────────────────────────────
  // 기본: 명세서 뷰 (거래명세서 포맷으로 2차 보정 전체 항목 표시)
  const [erpViewTab, setErpViewTab] = useState<'list' | 'table'>('table');
  // 명세서 뷰 셀 수동 편집 (컬럼명 기반)
  const [erpCellEdits, setErpCellEdits] = useState<Record<number, Record<string, string>>>({});
  const [editingErpCell, setEditingErpCell] = useState<{ ri: number; col: string } | null>(null);
  const [editingErpCellVal, setEditingErpCellVal] = useState("");
  // ERP 명세서 뷰 컬럼별 폭(px) — 상품명이 2줄 안에서 다 보이도록 넓게, 나머지 최소화
  const ERP_TABLE_COLS_DEFAULT: Record<string, number> = {
    "ERP 코드": 100,
    "공급사": 88,
    "OCR 품명": 260,
    "ERP 품명": 260,
    "OCR수량": 60,
    "ERP수량": 60,
    "단가": 76,
    "금액": 92,
    "유통기한": 88,
  };
  const [erpColWidths, setErpColWidths] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem("ocr_erp_col_widths");
      if (raw) return { ...ERP_TABLE_COLS_DEFAULT, ...JSON.parse(raw) };
    } catch { /* empty */ }
    return { ...ERP_TABLE_COLS_DEFAULT };
  });
  useEffect(() => {
    try { localStorage.setItem("ocr_erp_col_widths", JSON.stringify(erpColWidths)); } catch { /* empty */ }
  }, [erpColWidths]);
  const startErpColResize = useCallback((col: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const startW = erpColWidths[col] ?? ERP_TABLE_COLS_DEFAULT[col] ?? 100;
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(40, Math.min(600, startW + (ev.clientX - startX)));
      setErpColWidths(prev => ({ ...prev, [col]: next }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [erpColWidths]);

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

  // ── Feature 3: OCR 추출 후 자동 동의어 1차 보정 ──────────────────────────
  const [autoSynonymMatches, setAutoSynonymMatches] = useState<Record<number, { code: string; name: string }>>({});
  useEffect(() => {
    if (!onUserEdit) return;
    if (Object.keys(autoSynonymMatches).length > 0) onUserEdit();
  }, [autoSynonymMatches, onUserEdit]);
  // 2026-07-24 · 리팩터 · 편집 stable-key 마이그레이션은 useEditMigration 훅으로 분리
  useEditMigration({ pageNums, dispHeaders, setCellEdits, setAutoSynonymMatches });
  const [autoSynonymLoading, setAutoSynonymLoading] = useState(false);
  // barcodeAutoMap: 바코드 자동 매핑 · 2026-07-28 자동 바인딩 제거 후 항상 {} · BarcodeProduct 타입 유지 (useSaveConfirmed/ErpMatchSubRow 호환)
  const [barcodeAutoMap, setBarcodeAutoMap] = useState<Record<number, BarcodeProduct>>({});

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

  // 페이지별 수량×단가 계산합 (행합 vs 명세서 소계 · vs OCR 추출 소계 대조용)
  const _qtyIdxForQP = dispHeaders.indexOf("수량");
  const _priIdxForQP = dispHeaders.indexOf("단가");
  const effectivePageQtyPrice = new Map<number, number>();
  if (_qtyIdxForQP >= 0 && _priIdxForQP >= 0) {
    effectiveDispRows.forEach((row, ri) => {
      if (isRowDeleted(ri)) return;
      const q = parseNumber(row[_qtyIdxForQP]);
      const p = parseNumber(row[_priIdxForQP]);
      if (q > 0 && p > 0) {
        const pn = pageNums[ri];
        effectivePageQtyPrice.set(pn, (effectivePageQtyPrice.get(pn) ?? 0) + q * p);
      }
    });
  }

  // ── 페이지 소계 계산 함수들 → usePageTotalsComputation 훅으로 분리 ─────────────────
  const {
    getPageDiscounts, getPageDiscount, getPageCrossCheckWarning,
    getPageDisplayTotal, getPageDisplayTotalWithVat, getPageConfirmedSubtotal,
    total, totalBreakdownTitle, meta, balanceConfig,
    pageTotals, uniquePageNums, pageBalanceFromConfig, supplierOcrBalance,
    supplierTotals, pageMismatches, isPageResolved, _discountIdxEarly,
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
  const [matching,         setMatching        ] = useState(false);
  const [matchItems,       setMatchItems      ] = useState<MatchedItem[] | null>(null);
  // 2026-07-27 · 페이지별 "ERP 매칭" 버튼 클릭 후 · 해당 페이지 1차 표에 ERP sub-row 노출
  //   기존 flow 그대로 · 확정 버튼은 유지 · 이 flag 는 sub-row 표시 여부만 제어
  const [erpSubRowPages, setErpSubRowPages] = useState<Set<number>>(new Set());
  // 2026-07-22 · matchItems ref 동기화 (reextractOneCell forward reference용)
  useEffect(() => { matchItemsRef.current = matchItems; }, [matchItems]);
  // matchItems가 준비되면 products-map을 한 번 로드해서 code → current_stock 매핑 생성
  useEffect(() => {
    if (!matchItems || matchItems.length === 0) return;
    if (erpStockLoaded) return;
    (async () => {
      try {
        // 2026-08-21 · Framework Phase 3 · fetch → apiClient
        const { data } = await api.get<Record<string, any>>("/api/products-map");
        const map: Record<string, number | null> = {};
        for (const code in data) {
          const p = data[code];
          const s = p?.current_stock;
          map[code] = (s === null || s === undefined) ? null : Number(s);
        }
        setErpStockMap(map);
        setErpStockLoaded(true);
      } catch (e) {
        console.warn("[products-map] 로드 실패:", e);
      }
    })();
  }, [matchItems, erpStockLoaded]);
  const [overrides,        setOverrides       ] = useState<Record<number, string>>({});
  const [supplierOverrides,setSupplierOverrides] = useState<Record<number, string>>({});
  const [confirmed,        setConfirmed       ] = useState(false);
  // 2차보정 확정 버튼 누른 작업일 (YYYY-MM-DD)
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [savedSynonyms,      setSavedSynonyms      ] = useState<Set<number>>(new Set());
  const [savedSupplierAliases, setSavedSupplierAliases] = useState<Set<number>>(new Set());
  const [retryingRows,     setRetryingRows    ] = useState<Set<number>>(new Set());
  const [candidatesMap,    setCandidatesMap   ] = useState<Record<number, CandidateInfo[]>>({});
  const [openCandRow,      setOpenCandRow     ] = useState<number | null>(null);
  const [selectedCands,    setSelectedCands   ] = useState<Record<number, CandidateInfo>>({});
  const [nameSearchResults,setNameSearchResults] = useState<Record<number, any[]>>({});
  const [nameSearchOpenRow,setNameSearchOpenRow] = useState<number | null>(null);
  const nameSearchDebounce = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const [restoredRows,     setRestoredRows     ] = useState<Set<number>>(new Set());
  const [pendingSyn,       setPendingSyn        ] = useState<Record<number, { inputName: string; code: string; supplier?: string; name: string }>>({});
  const [savedSynonymIds,  setSavedSynonymIds   ] = useState<Record<number, number>>({});
  const [cancelledAutoSyn, setCancelledAutoSyn ] = useState<Set<number>>(new Set());
  const [cancelledAutoMap, setCancelledAutoMap ] = useState<Set<number>>(new Set());
  const [cancelledRows,    setCancelledRows    ] = useState<Set<number>>(new Set());
  const [savingConfirmed,  setSavingConfirmed  ] = useState(false);
  const [saveConfirmedToast, setSaveConfirmedToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [rawEditValues,    setRawEditValues    ] = useState<Record<number, string>>({});
  const rawSearchDebounce = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // ── 품명 인라인 편집 (fixed-position 드롭다운) ──────────────────────────
  const [editingNameRow, setEditingNameRow] = useState<number | null>(null);
  const [editingNameVal, setEditingNameVal] = useState<string>("");
  // 2026-07-24 · 사용자 문제 "품명 드롭다운 선택 안됨" · blur 로 state 지워도 · 최근 ri 보존
  const editingNameRowRef = useRef<number | null>(null);
  useEffect(() => { if (editingNameRow != null) editingNameRowRef.current = editingNameRow; }, [editingNameRow]);
  const nameEditSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nameEditResults, setNameEditResults] = useState<any[]>([]);
  const [nameEditSearchDone, setNameEditSearchDone] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [nameDropdownRect, setNameDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [deleteSynConfirm, setDeleteSynConfirm] = useState<{ ri: number; origName: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 다이얼로그 우선 처리 · Esc (구브라우저 호환) + Escape
      if (e.key === "Escape" || e.key === "Esc") {
        if (modalImg) { e.preventDefault(); closeModal(); return; }
        if (deleteSynConfirm) { setDeleteSynConfirm(null); return; }
        if (supplierConfirm) { setSupplierConfirm(null); return; }
        return;
      }
      // 명세서 이미지 모달 키보드 조작 (페이지 이동은 PgUp/PgDn만 · 화살표는 셀 이동 전용)
      if (modalImg && modalPageNum != null && pageImages?.length) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        if (e.key === "PageDown") { e.preventDefault(); gotoModalPage(modalPageNum + 1); return; }
        if (e.key === "PageUp") { e.preventDefault(); gotoModalPage(modalPageNum - 1); return; }
        if (e.key === "Home") { e.preventDefault(); gotoModalPage(1); return; }
        if (e.key === "End")  { e.preventDefault(); gotoModalPage(pageImages.length); return; }
        if (e.key === "+" || e.key === "=") { e.preventDefault(); setZoom(z => Math.min(6, +(z + 0.25).toFixed(2))); return; }
        if (e.key === "-" || e.key === "_") { e.preventDefault(); setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2))); return; }
        if (e.key === "0")   { e.preventDefault(); setZoom(1); setPan({ x: 0, y: 0 }); return; }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalImg, modalPageNum, pageImages, deleteSynConfirm, supplierConfirm, closeModal, gotoModalPage]);

  // ── 이름 기반 동의어 삭제 ────────────────────────────────────────────────
  const deleteSynonymByName = useCallback(async (origName: string, productCode?: string) => {
    const name = origName.trim();
    if (!name) return;
    try {
      // 2026-08-21 · Framework Phase 3 · fetch → apiClient
      // cancel-by-name 사용: 삭제 대신 cancelled=true 마킹 → 동의어 관리에서 관리 가능, 재적용 방지
      await api.post("/api/ocr-synonyms/cancel-by-name", { prod_name_old: name, product_code: productCode ?? null });
    } catch (e) {
      console.warn("[ocr-synonyms/cancel-by-name] 취소 오류:", e);
    }
  }, []);

  const ocrQtyIdx  = dispHeaders.indexOf("수량");
  const ocrPriIdx  = dispHeaders.indexOf("단가");
  const ocrSpecIdx = dispHeaders.indexOf("규격");
  const ocrSuppIdx = dispHeaders.indexOf("공급처");
  const globalSupplier = pages.map(p => p.meta.supplier).find(Boolean) ?? null;

  // ── 공급사 미입력 페이지 검출 (필수 입력 검증 · 2026-07-15) ────────────
  //   rawSupplierByPage 편집값 우선 → structuredPages meta.supplier 폴백
  //   빈 문자열/null 이면 미입력으로 간주 → 자동보정·저장 차단
  const effectiveSupplierForPage = useCallback((pn: number): string => {
    const edited = rawSupplierByPage[pn];
    if (edited !== undefined) return String(edited ?? "").trim();
    const meta = structuredPages.find(p => p.page === pn)?.meta.supplier;
    return String(meta ?? "").trim();
  }, [rawSupplierByPage, structuredPages]);
  const missingSupplierPages: number[] = React.useMemo(() => {
    const uniquePages = Array.from(new Set(structuredPages.map(p => p.page)));
    return uniquePages.filter(pn => !effectiveSupplierForPage(pn));
  }, [structuredPages, effectiveSupplierForPage]);

  // 2026-07-21: 서버 vendor-match 실패 폴백 · 클라이언트에서 직접 상품앞2자→vendor 다수결
  //   페이지가 미상일 때 · vendors DB (vendorNames) 로 즉시 자동 채움
  useEffect(() => {
    if (missingSupplierPages.length === 0 || vendorNames.length === 0) return;
    const normV = (s: string) => s.replace(/[\s()（）·・.,\-*/[\]{}]/g, "")
      .replace(/주식회사|유한회사|㈜|\(주\)|\(유\)/gi, "").toLowerCase();
    const vendorNorms = vendorNames.map(v => ({ name: v, n: normV(v) }));
    const autoFill: Record<number, string> = {};
    for (const pn of missingSupplierPages) {
      const pd = structuredPages.find(p => p.page === pn);
      if (!pd) continue;
      const nameIdx = pd.headers.indexOf("품명");
      if (nameIdx < 0) continue;
      // 상품명에서 한글 앞2자 추출
      const productPrefixes: string[] = [];
      for (const row of pd.rows) {
        if (!Array.isArray(row)) continue;
        const nm = String(row[nameIdx] ?? "").trim();
        if (nm.length < 2 || !/[가-힣]/.test(nm)) continue;
        const koreanOnly = nm.replace(/[^가-힣]/g, "").slice(0, 2);
        if (koreanOnly.length >= 2) productPrefixes.push(koreanOnly);
      }
      // vendor 앞2자 매칭 다수결
      const votes = new Map<string, number>();
      for (const p of productPrefixes) {
        for (const v of vendorNorms) {
          if (v.n.startsWith(p)) votes.set(v.name, (votes.get(v.name) ?? 0) + 1);
        }
      }
      if (votes.size > 0) {
        let bestName = "", bestVotes = 0;
        for (const [n, c] of votes) if (c > bestVotes) { bestName = n; bestVotes = c; }
        // 이미 사용자가 편집한 값 있으면 스킵
        if (rawSupplierByPage[pn] === undefined && bestVotes >= 1) {
          autoFill[pn] = bestName;
          console.log(`[client/auto-supplier] page ${pn}: "${bestName}" (${bestVotes}/${productPrefixes.length}상품 매칭 · prefixes=${JSON.stringify(productPrefixes)})`);
        }
      } else {
        // 상품에서 못 찾으면 rawText 전체에서 vendor 이름/prefix2 스캔
        const rtNorm = (pd.rawText ?? "").replace(/\s+/g, "");
        let best = "";
        let bestLen = 0;
        for (const v of vendorNorms) {
          if (v.n.length < 2) continue;
          if (rtNorm.includes(v.n) && v.n.length > bestLen) {
            best = v.name; bestLen = v.n.length;
          }
        }
        if (!best) {
          for (const v of vendorNorms) {
            if (v.n.length < 2) continue;
            const prefix2 = v.n.slice(0, 2);
            if (rtNorm.includes(prefix2) && v.n.length > bestLen) {
              best = v.name; bestLen = v.n.length;
            }
          }
        }
        if (best && rawSupplierByPage[pn] === undefined) {
          autoFill[pn] = best;
          console.log(`[client/auto-supplier] page ${pn}: "${best}" (rawText 스캔)`);
        }
      }
    }
    if (Object.keys(autoFill).length > 0) {
      setRawSupplierByPage(prev => ({ ...prev, ...autoFill }));
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [missingSupplierPages, vendorNames, structuredPages]);

  // 2026-07-21: 미상 페이지 진단 로그 · 목록이 실제 변경될 때만 1회 출력 (useEffect · spam 방지)
  const _prevMissingKeyRef = useRef<string>("");
  useEffect(() => {
    const key = missingSupplierPages.join(",");
    if (key === _prevMissingKeyRef.current) return;
    _prevMissingKeyRef.current = key;
    if (missingSupplierPages.length === 0) return;
    console.group(`[missingSupplier] ${missingSupplierPages.length}개 페이지 미상 · 원인 분석`);
    for (const pn of missingSupplierPages) {
      const pd = structuredPages.find(p => p.page === pn);
      const rawText = pd?.rawText ?? "";
      console.log(`━━━ page ${pn} ━━━`);
      console.log(`meta.supplier: "${pd?.meta?.supplier ?? "(undefined)"}"`);
      console.log(`meta.recipient: "${pd?.meta?.recipient ?? "(undefined)"}"`);
      console.log(`meta.date: "${pd?.meta?.date ?? "(undefined)"}"`);
      console.log(`headers (${pd?.headers?.length ?? 0}): ${JSON.stringify(pd?.headers ?? [])}`);
      console.log(`rowCount: ${pd?.rows?.length ?? 0}`);
      console.log(`rawTextLen: ${rawText.length}`);
      console.log(`--- rawText (첫 500자) ---\n${rawText.slice(0, 500)}`);
      if (rawText.length > 500) console.log(`--- ... 총 ${rawText.length}자 ---`);
    }
    console.groupEnd();
  }, [missingSupplierPages, structuredPages]);
  const hasMissingSupplier = missingSupplierPages.length > 0;

  // ── Feature 1: 금액 자동보정 콜백 ────────────────────────────────────────
  // WARNING: 재추출 격리 정책 (2026-07-18) — 이 함수는 수량×단가로 금액을 자동계산합니다.
  // 격리 정책에 따라 절대 호출하면 안 됩니다. dead function 으로 유지.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const autoCorrectAmounts = useCallback((_pageNum: number) => {
    void _pageNum; // 재추출 격리 정책으로 비활성화 (2026-07-18) — 절대 호출 금지
  }, []);

  // ── Feature 2: 공급사 변경 + 동의어 일괄 추가 ───────────────────────────
  const handleSynonymBulkAdd = useCallback(async (pageNum: number, newSupplier: string) => {
    if (nameIdx < 0) return;
    // 빈 이름 제외하되 인덱스 유지
    const entries: { ri: number; name: string }[] = [];
    pageNums.forEach((pn, ri) => {
      if (pn !== pageNum) return;
      const n = String(dispRows[ri][nameIdx] ?? "").trim();
      if (n) entries.push({ ri, name: n });
    });
    if (entries.length === 0) return;
    setSynonymAddStatus({ pageNum, status: 'loading', count: 0 });
    try {
      // 2026-08-21 · Framework Phase 3 · fetch → apiClient
      const { data } = await api.post<{ matches?: MatchedItem[] }>("/api/ocr-match", {
        names: entries.map(e => e.name),
        suppliers: entries.map(() => newSupplier),
      });
      const matches: MatchedItem[] = data.matches ?? [];
      let count = 0;
      for (let i = 0; i < entries.length; i++) {
        const m = matches[i]?.matched;
        if (!m) continue;
        try {
          await api.post("/api/ocr-synonyms", {
            prod_name_old: entries[i].name,
            prod_name_new: m.name,
            product_code: m.code,
            supplier_new: newSupplier,
          });
          count++;
        } catch { /* silent · 개별 실패 흡수 */ }
      }
      setSynonymAddStatus({ pageNum, status: count > 0 ? 'done' : 'error', count });
    } catch {
      setSynonymAddStatus({ pageNum, status: 'error', count: 0 });
    }
  }, [nameIdx, pageNums, dispRows]);

  // 2026-07-28 · 사용자 요청 "OCR 에 있는 바코드 기능은 제거" · barcodeAutoMap 자동 바인딩 로직 완전 제거
  //   barcodeAutoMap state · barcodeMatches prop 은 backward-compat 유지 (props · 다른 컴포넌트 재사용 대비)
  //   downstream 의 bc 참조 · 모두 null 로 흘러가서 자연 fallback (autoSyn/matched/OCR)
  void barcodeMatches;

  // ── 1차보정에서 자동 매칭 제거 (2026-07-14 사용자 정책 재확립) ─────────
  //   1차보정 = OCR 원본 그대로 표시
  //   수동편집(직접 셀 편집·후보 선택) → 2차보정(handleMatch 버튼) → 확정
  // 2026-07-27 · 사용자 문제 "DB 보정된 상품명이 다른 페이지 로드되면 리로드"
  //   원인 · pages 변경 (SSE append 포함) 마다 autoSynonymMatches 완전 초기화 → 편집 손실
  //   수정 · 완전 새 업로드(pages.length===0)일 때만 초기화 · SSE append 는 유지
  //   useEditMigration 이 이미 새 페이지 append 시 stable-key 로 remap 처리
  useEffect(() => {
    if (pages.length === 0) {
      setAutoSynonymMatches({});
      setAutoSynonymLoading(false);
    }
  }, [pages.length]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const { ci, startX, startW } = resizeRef.current;
      setColWidths(prev => ({ ...prev, [ci]: Math.max(40, startW + e.clientX - startX) }));
    };
    const onUp = () => { resizeRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const saveTemplate = useCallback(async (pageNum: number, supplierName: string) => {
    const pageHdrs = structuredPages.find(p => p.page === pageNum)?.headers;
    if (!pageHdrs?.length) return;
    try {
      // 2026-08-21 · Framework Phase 3 · fetch → apiClient
      await api.post("/api/ocr-templates", { supplier_name: supplierName, headers: pageHdrs });
      setReparseStatus(prev => ({ ...prev, [pageNum]: 'saved' }));
    } catch { /* silent */ }
    // 이 페이지 상품명을 해당 공급사의 동의어로 일괄 저장
    await handleSynonymBulkAdd(pageNum, supplierName);
  }, [structuredPages, handleSynonymBulkAdd]);

  // 2026-07-24 · 리팩터 · 템플릿 자동 저장은 useAutoTemplateSave 훅으로 분리
  useAutoTemplateSave({ structuredPages, rawSupplierByPage, saveTemplate });

  const saveSynonym = useCallback(async (
    ri: number,
    nameOld: string,
    productCode: string,
    supplierNew?: string,
    nameNew?: string,
    supplierOld?: string,
  ) => {
    try {
      // 2026-08-21 · Framework Phase 3 · fetch → apiClient
      const { data: json } = await api.post<{ synonym?: { id?: number } }>("/api/ocr-synonyms", {
        prod_name_old: nameOld,
        prod_name_new: nameNew ?? null,
        product_code: productCode,
        supplier_new: supplierNew?.trim() || null,
        supplier_old: supplierOld?.trim() || null,
      });
      setSavedSynonyms(prev => new Set([...prev, ri]));
      if (json?.synonym?.id) setSavedSynonymIds(prev => ({ ...prev, [ri]: json.synonym!.id! }));
      // 2026-07-28 · 재추출 캐시에 즉시 반영
      if (nameOld && nameNew && productCode) {
        setSynonymsMap(prev => {
          const m = new Map(prev);
          m.set(nameOld.trim().toLowerCase(), { name: nameNew, code: productCode });
          return m;
        });
      }
    } catch (e) {
      console.warn("[ocr-synonyms] 네트워크 오류:", e);
    }
  }, []);

  const deleteSynonymForRow = useCallback(async (ri: number) => {
    const id = savedSynonymIds[ri];
    if (!id) return;
    try {
      // 2026-08-21 · Framework Phase 3 · fetch → apiClient
      await api.del(`/api/ocr-synonyms/${id}`);
    } catch (e) {
      console.warn("[ocr-synonyms] 삭제 오류:", e);
    }
    setSavedSynonyms(prev => { const s = new Set(prev); s.delete(ri); return s; });
    setSavedSynonymIds(prev => { const s = { ...prev }; delete s[ri]; return s; });
    setOverrides(prev => ({ ...prev, [ri]: undefined as unknown as string }));
    setSelectedCands(prev => { const s = { ...prev }; delete s[ri]; return s; });
    setPendingSyn(prev => { const s = { ...prev }; delete s[ri]; return s; });
    setCancelledRows(prev => { const s = new Set(prev); s.delete(ri); return s; });
  }, [savedSynonymIds]);

  // 공급사 이름 보정: OCR 오인식 공급사명 → 정확한 공급사명 저장 (ocr_supplier_aliases)
  const saveSupplierAlias = useCallback(async (ri: number, aliasOld: string, supplierNew: string) => {
    const alias = aliasOld.trim();
    const name  = supplierNew.trim();
    if (!alias || !name || alias === name) return;
    try {
      // 2026-08-21 · Framework Phase 3 · fetch → apiClient
      await api.post("/api/ocr-supplier-aliases", { alias, supplier_name: name });
      setSavedSupplierAliases(prev => new Set([...prev, ri]));
    } catch (e) {
      console.warn("[ocr-supplier-aliases] 네트워크 오류:", e);
    }
  }, []);

  const saveSupplierBalance = useCallback(async (supplierName: string, amount: number, invoiceDate: string | null) => {
    // 2026-07-28 · setSavingBalance / savingBalance state · dead code 정리에서 제거됨 · 여기서는 fire-and-forget
    try {
      // 2026-08-21 · Framework Phase 3 · fetch → apiClient
      const { data: d } = await api.post<{ balance?: any }>("/api/supplier-balances", {
        supplier_name: supplierName,
        invoice_date: invoiceDate,
        balance: amount,
      });
      if (d.balance) setSupplierBalanceRecords(prev => [d.balance, ...prev]);
    } catch { /* silent */ }
  }, []);

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

  const selectCandidate = useCallback((ri: number, cand: CandidateInfo) => {
    setSelectedCands(prev => ({ ...prev, [ri]: cand }));
    setOverrides(prev => ({ ...prev, [ri]: cand.name }));
    setCancelledRows(prev => { const s = new Set(prev); s.delete(ri); return s; });
    setOpenCandRow(null);
    setNameSearchOpenRow(null);
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

  const handleMatch = useCallback(async () => {
    if (nameIdx < 0) return;
    // 공급사 필수 입력 검증 (2026-07-15) — 미입력 페이지가 있으면 차단
    //   supplier 힌트 없이 2차보정을 실행하면 잘못된 매칭 · 동의어 오학습 위험
    if (missingSupplierPages.length > 0) {
      const pagesLabel = missingSupplierPages.join(", ");
      showError(`공급사가 지정되지 않은 페이지가 있습니다: ${pagesLabel}번\n\n1차보정 표의 "공급처" 셀을 클릭하여 공급사명을 먼저 입력하세요.\n(공급사 정보 없이 상품명 매칭 시 잘못된 결과가 저장될 수 있습니다)`);
      return;
    }
    // 2026-07-09: 강화된 필터
    // - 빈 품명 · 배송·행정 라벨(차람번호/기사명/담당자/주소 등) · 사람이름/사업자번호 등을 스킵
    // - 공급자 힌트도 상품명·배송정보로 오분류된 것 페이지 fallback
    // 이는 1차보정에서 발생하는 무의미한 매칭 결과를 방지 (실제 매칭은 2차보정에서 ERP 로)
    const nameSupplierPairs = dispRows.map((row, ri) => {
      // 2026-07-28 · 사용자 요청 "1차보정 상품명값으로 ERP 매칭"
      //   우선순위: cellEdits (직접 편집) > autoSynonymMatches.name (DB 드롭다운) > 원본 OCR
      const editedName = cellEdits[ri]?.[nameIdx];
      const autoSynName = autoSynonymMatches[ri]?.name;
      const rawName = String(editedName ?? autoSynName ?? row[nameIdx] ?? "").trim();
      const pn = pageNums[ri];
      let sup = "";
      if (rawSupplierByPage[pn] !== undefined) sup = rawSupplierByPage[pn];
      else if (ocrSuppIdx >= 0) {
        const cell = String(dispRows[ri]?.[ocrSuppIdx] ?? "").trim();
        if (cell) sup = cell;
      }
      if (!sup) sup = structuredPages.find(p => p.page === pn)?.meta.supplier ?? globalSupplier ?? "";

      // supplier 힌트가 유효하지 않으면 (상품명/배송정보) 페이지 폴백 시도
      if (!isValidSupplierHint(sup)) {
        const pageSup = structuredPages.find(p => p.page === pn)?.meta.supplier;
        sup = (pageSup && isValidSupplierHint(pageSup)) ? pageSup :
              (globalSupplier && isValidSupplierHint(globalSupplier)) ? globalSupplier : "";
      }

      // 상품명이 아닌 것 (배송·행정·주소·사람이름·번호 등) 스킵
      // 2026-07-19 · 체크박스로 제외한 행 · 완전 삭제 행 · DB필터 행도 매칭 요청에서 제외
      const skip = !rawName || isNonProductText(rawName)
        || hiddenRawRows.has(ri)
        || permanentlyDeletedRawRows.has(ri)
        || isRowDbDeleted(ri);
      return { rowIdx: ri, name: rawName, supplier: sup, skip };
    });

    const skippedCount = nameSupplierPairs.filter(p => p.skip).length;
    if (skippedCount > 0) console.log(`[handleMatch] ${skippedCount}행 스킵 (빈 품명·배송정보·잡문자·삭제행)`);
    const activePairs = nameSupplierPairs.filter(p => !p.skip);
    const names = activePairs.map(p => p.name);
    const suppliers = activePairs.map(p => p.supplier);
    console.log(`[handleMatch] ${names.length}개 행 매칭 요청 · 고유 공급자: ${[...new Set(suppliers)].filter(Boolean).length}개`);

    setMatching(true); setMatchItems(null); setOverrides({}); setSupplierOverrides({}); setConfirmed(false); setSavedSynonyms(new Set()); setSavedSupplierAliases(new Set());
    setRetryingRows(new Set()); setCandidatesMap({}); setOpenCandRow(null); setSelectedCands({}); setCancelledRows(new Set());
    try {
      // 2026-08-21 · Framework Phase 3 · fetch → apiClient
      const { data } = await api.post<{ matches?: MatchedItem[] }>("/api/ocr-match", { names, suppliers });
      // matchItems 를 원본 dispRows 인덱스 순서로 재배열 (skip 된 행은 null)
      const returned: MatchedItem[] = data.matches ?? [];
      const aligned: (MatchedItem | null)[] = dispRows.map(() => null);
      activePairs.forEach((p, ai) => { aligned[p.rowIdx] = returned[ai] ?? null; });
      setMatchItems(aligned.map(m => m ?? { input: "", matched: null }));
    } catch { /* silent */ }
    finally { setMatching(false); }
  }, [dispRows, nameIdx, pageNums, rawSupplierByPage, ocrSuppIdx, structuredPages, globalSupplier, missingSupplierPages]);

  // 2026-07-28 · 리팩터 · handleMatchPage · fillMissingPricesFromDB · verifyAndSwapPricesWithDB
  //   → useHandleMatchPage 훅으로 분리
  // 2026-07-22 · 확정 → 2차보정 완료 페이지 추적 · 버튼 색 변경 (사용자 요청)
  const [confirmedPages, setConfirmedPages] = useState<Set<number>>(new Set());
  // 2026-07-22 · DB 에서 채워진 셀 추적 (사용자 요청: "옆에 표시해")
  const [dbFilledCells, setDbFilledCells] = useState<Set<string>>(new Set()); // key: `${ri}-${ci}`

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
  const CONF_NUM = new Set(["마스터 매입단가","전표 매입단가","매입수량","매입총계","판매단가","이익률"]);

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

  const [xlsTemplate,    setXlsTemplate   ] = useState<ArrayBuffer | null>(null);
  const [xlsTemplateName,setXlsTemplateName] = useState<string | null>(null);
  const [xlsTemplateHdrs,setXlsTemplateHdrs] = useState<string[] | null>(null);
  const [xlsTemplateSaved,setXlsTemplateSaved] = useState(false);
  const xlsInputRef = useRef<HTMLInputElement | null>(null);

  // localStorage에서 서식 파일 자동 복원
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ocr_xls_template");
      if (!raw) return;
      const { name, hdrs, data } = JSON.parse(raw);
      const buf = Uint8Array.from(atob(data), c => c.charCodeAt(0)).buffer;
      setXlsTemplate(buf);
      setXlsTemplateName(name);
      setXlsTemplateHdrs(hdrs);
      setXlsTemplateSaved(true);
    } catch { /* 손상된 캐시 무시 */ }
  }, []);

  useEffect(() => {
    // 2026-08-21 · Framework Phase 3 · fetch → apiClient
    api.get<{ balances?: any[] }>("/api/supplier-balances")
      .then(({ data }) => { if (Array.isArray(data.balances)) setSupplierBalanceRecords(data.balances); })
      .catch(() => {});
  }, []);
  // 2026-07-24 · 리팩터 · 잔고 자동 로드는 useAutoBalanceLoad 훅으로 분리
  useAutoBalanceLoad({ supplierBalanceRecords, structuredPages, rawSupplierByPage, setPageBalanceOverride });


  const confRows: (string | number | null)[][] = matchItems
    ? effectiveDispRows.map((row, ri) => {
        // 2026-07-24 · 사용자 요청 "1차보정에서 선택 삭제한 행은 2차보정에 안 들어감 · 확정 상태만"
        //   permanentlyDeletedRawRows + isRowDbDeleted + hiddenRawRows (체크박스 숨김) 모두 제외
        if (permanentlyDeletedRawRows.has(ri) || isRowDbDeleted(ri) || hiddenRawRows.has(ri)) return [] as (string | number | null)[];
        // 2026-07-27 · 사용자 요청 "확정 누르면 확정표 1페이지씩" · 페이지별 확정된 것만 확정표에 표시
        if (!confirmedPages.has(pageNums[ri])) return [] as (string | number | null)[];
        // 2026-07-27 · 사용자 문제 "확정표에 빈 행이 들어감" · 1차와 동일 규칙 · 품명·수량·단가 모두 없으면 skip
        {
          const _nm = nameIdx >= 0 ? String(row[nameIdx] ?? "").trim() : "";
          const _q = ocrQtyIdx >= 0 ? parseNumber(row[ocrQtyIdx]) : 0;
          const _p = ocrPriIdx >= 0 ? parseNumber(row[ocrPriIdx]) : 0;
          if (!_nm && _q === 0 && _p === 0) return [] as (string | number | null)[];
        }
        const m        = cancelledRows.has(ri) ? null : (selectedCands[ri] ?? matchItems[ri]?.matched ?? null);
        const autoSyn  = cancelledAutoMap.has(ri) ? undefined : autoSynonymMatches[ri];
        const bc       = cancelledAutoMap.has(ri) ? null : (barcodeAutoMap[ri] ?? null);
        const origOcrName = nameIdx >= 0 ? String(row[nameIdx] ?? "").trim() || null : null;
        // 2026-07-28 · 사용자 요청 재변경 "ERP 상품명 없으면 1차보정 상품명을 확정표로"
        //   corrName 우선순위 · erpEdits (2차편집) > matched.name (ERP 서버매칭) > 1차보정값 (cellEdits > autoSyn > OCR)
        //   → ERP 매칭 실패해도 확정표에 최소 1차보정 상품명 표시
        const erpEdits = erpCellEdits[ri];
        const firstCorrectionName =
          (nameIdx >= 0 && cellEdits[ri]?.[nameIdx] != null && String(cellEdits[ri][nameIdx]).trim())
            ? String(cellEdits[ri][nameIdx]).trim()
            : (autoSyn?.name ?? origOcrName ?? null);
        const corrName = erpEdits?.["ERP 품명"] !== undefined
          ? erpEdits["ERP 품명"]
          : (m?.name ?? firstCorrectionName ?? null);
        const corrCode = erpEdits?.["ERP 코드"] !== undefined
          ? erpEdits["ERP 코드"]
          : (m?.code ?? null);
        const qtyEditVal = erpEdits?.["OCR수량"] ?? erpEdits?.["수량"];
        const priEditVal = erpEdits?.["단가"];
        const amtEditVal = erpEdits?.["금액"];
        const qty = qtyEditVal !== undefined
          ? parseNumber(qtyEditVal)
          : (ocrQtyIdx >= 0 ? row[ocrQtyIdx] : null);
        const pri = priEditVal !== undefined
          ? parseNumber(priEditVal)
          : (ocrPriIdx >= 0 ? row[ocrPriIdx] : null);
        let amt: number | null;
        if (amtEditVal !== undefined) amt = parseNumber(amtEditVal);
        // 2차보정 원복 (2026-07-18): 수량/단가 편집 있으면 금액 자동계산
        else if ((qtyEditVal !== undefined || priEditVal !== undefined) && parseNumber(qty) > 0 && parseNumber(pri) > 0) {
          amt = Math.round(parseNumber(qty) * parseNumber(pri));
        }
        else {
          const rawA = amtIdx >= 0 && row[amtIdx] != null ? parseNumber(row[amtIdx]) : 0;
          if (rawA > 0) amt = rawA;
          else if (parseNumber(qty) > 0 && parseNumber(pri) > 0) amt = Math.round(parseNumber(qty) * parseNumber(pri));
          else amt = null;
        }
        const pn = pageNums[ri];
        // 2026-07-28 · 사용자 지적 "1차 보정에서 이미 부가세 처리됨 · 확정표에서 재계산 X"
        //   row amt · pre-VAT 유지 (1차 UI 의 행 amt 와 동일 · 부가세는 페이지 소계에만 적용됨)
        const spec = ocrSpecIdx >= 0 ? (row[ocrSpecIdx] ?? m?.spec ?? bc?.spec ?? null) : (m?.spec ?? bc?.spec ?? null);
        const rawSupp = rawSupplierByPage[pn] !== undefined
          ? rawSupplierByPage[pn]
          : (ocrSuppIdx >= 0 ? (row[ocrSuppIdx] ?? globalSupplier) : (structuredPages.find(p => p.page === pn)?.meta.supplier ?? globalSupplier));
        const supp    = supplierOverrides[ri] !== undefined ? supplierOverrides[ri] : rawSupp;
        // 2026-07-27 · 사용자 편집 (pageDateOverride) 우선 · 없으면 OCR meta.date
        const dateVal = pageDateOverride[pn] ?? structuredPages.find(p => p.page === pn)?.meta.date ?? null;
        // 2026-07-27 · 사용자 원칙 "1차 최종값 + ERP 매칭값 → 3차"
        //   유통기한: 2차편집(erpEdits) > 1차 편집(cellEdits/row) > ERP matched > barcode
        const expiryEdit = erpEdits?.["유통기한"];
        const expiryIdxL = (() => {
          for (const a of ["유통기한","유효기한","유통기간"]) {
            const i = dispHeaders.indexOf(a); if (i >= 0) return i;
          }
          return -1;
        })();
        const ocrExpiry = expiryIdxL >= 0 ? String(row[expiryIdxL] ?? "").trim() || null : null;
        const expiry = expiryEdit !== undefined ? expiryEdit : (ocrExpiry ?? m?.expiryDate ?? bc?.expiryDate ?? null);
        // 확정일: erpCellEdits 우선, 없으면 batch confirmedAt
        const confirmedDateEdit = erpEdits?.["확정일"];
        const confirmedDateCell = confirmedDateEdit !== undefined ? confirmedDateEdit : (confirmedAt ?? null);
        // 2026-07-27 · 사용자 요청 "잔고는 각 명세서의 소계부분의 정보를 넣어야지"
        //   1차보정 소계 area 의 displayBal 계산과 완전 동일 규칙 (미수금 input · 수동입력 · OCR 감지 순)
        //   pageBalanceOverride = 미수금 input 편집값 · pageSupplierBalances = OCR 감지값 · pageBalanceManualInput = 수동 입력값
        const _balDetected = pageSupplierBalances[pn] ?? pageBalanceOverride[pn];
        const _balManual = pageBalanceModeManual.has(pn) ? parseNumber(pageBalanceManualInput[pn] ?? "") : 0;
        const pnBalance = _balDetected ?? (_balManual > 0 ? _balManual : null);
        // 2026-07-27 · CONF_HEADERS 축소 반영 · 확정일·규격·공급사잔고 제외
        //   (confirmedDateCell · spec · pnBalance 는 handleSaveConfirmed 에서 별도 참조 · 표에는 미표시)
        // 2026-07-28 · 거래일 / 공급사 · 한 셀에 두 줄로 (\n · CSS whitespace-pre-line 렌더)
        void confirmedDateCell; void spec; void pnBalance;
        const dateSuppCombined = (() => {
          const d = dateVal ? String(dateVal) : "";
          const s = supp ? String(supp) : "";
          if (d && s) return `${d}\n${s}`;
          return d || s || null;
        })();
        const codeNameCombined = (() => {
          const c = corrCode ? String(corrCode) : "";
          const n = corrName ? String(corrName) : "";
          if (c && n) return `${c}\n${n}`;
          return c || n || null;
        })();
        return [dateSuppCombined, codeNameCombined, m?.masterPrice ?? bc?.masterPrice ?? null, pri, qty, amt,
                m?.salePrice ?? bc?.salePrice ?? null,
                m?.profitRate != null ? m.profitRate : (bc?.profitRate ?? null),
                expiry];
      })
      // 2026-07-24 · filter 제거 · 빈 행은 map 렌더에서 return null · ri 를 effectiveDispRows 와 일치 유지
    : [];

  const confAmtIdx  = CONF_HEADERS.indexOf("매입총계");
  const confSuppIdx = CONF_HEADERS.indexOf("공급사");

  // 2026-07-27 · 사용자 요청 "1차보정 총금액값이 확정표에도 적용" · 1차 UI 소계와 완전 동일
  //   getPageConfirmedSubtotal 사용 (finalShown 계산 · VAT × 1.1 포함)
  const confPageTotals = new Map<number, number>();
  if (confAmtIdx >= 0) {
    uniquePageNums.forEach(pn => {
      confPageTotals.set(pn, getPageConfirmedSubtotal(pn));
    });
  }

  // 2026-07-27 · 사용자 요청 "확정표 합계 · 1차보정 값 반영 · VAT 포함 총 소계"
  //   confRows 개별 amt 합산 → confirmedPages 의 페이지 소계 (VAT 포함) 합산으로 변경
  //   1차 보정에서 사용자가 확정한 페이지 소계 (VAT 포함/미포함 반영) 을 그대로 반영
  const confTotal   = confAmtIdx >= 0
    ? [...confirmedPages].reduce((s, pn) => s + (confPageTotals.get(pn) ?? 0), 0)
    : 0;
  // 2026-07-27 · confSupplierTotals · 1차 소계 (VAT 포함) 기준으로 페이지별 그룹화
  //   기존: 개별 row amt 합산 → 빈 [] 행 · VAT 미반영 (사용자 지적)
  //   수정: confirmedPages 만 · getPageDisplayTotalWithVat(pn) 사용 · 공급사별 페이지 매(=1건 = 1페이지) 카운트
  const confSupplierTotals: { supplier: string; total: number; count: number }[] = confAmtIdx >= 0
    ? (() => {
        const m = new Map<string, { total: number; count: number }>();
        for (const pn of [...confirmedPages].sort((a, b) => a - b)) {
          const supp = (rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "미상").trim() || "미상";
          const pageTotal = confPageTotals.get(pn) ?? 0;
          const prev = m.get(supp) ?? { total: 0, count: 0 };
          m.set(supp, { total: prev.total + pageTotal, count: prev.count + 1 });
        }
        return [...m.entries()].map(([supplier, v]) => ({ supplier, ...v }));
      })()
    : [];

  // 2026-07-20: export 로직 → ./RawOcrTable/exportHelpers.ts 분리 · state 는 부모 유지
  const handleExport = useCallback((headers: string[], rows: (string | number | null)[][], suffix: string) => {
    _exportCsv(headers, rows, `거래명세서_${meta.date?.replace(/-/g, "") ?? "OCR"}_${suffix}.csv`);
  }, [meta]);

  const handleTemplateUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const buf = e.target?.result as ArrayBuffer;
      const hdrs = _parseXlsxTemplateHeaders(buf);
      if (hdrs) {
        setXlsTemplate(buf);
        setXlsTemplateName(file.name);
        setXlsTemplateHdrs(hdrs);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // 2026-07-28 · ERP 업로드 전용 엑셀 · 고정 서식 (사용자 요청)
  //   컬럼: 상품코드(*) · 상품명(*) · 규격 · 마스터매입단가 · 공급처 · 전표매입단가 · 매입수량(*) · 매입총계 · 판매단가 · 이익률 · 소비기한
  //   소비기한 = 유통기한 값 매핑
  const handleErpUploadExport = useCallback(() => {
    if (!matchItems || confRows.length === 0) return;
    const filename = `ERP업로드_${meta.date?.replace(/-/g, "") ?? "OCR"}.xlsx`;
    const rows = confRows
      .map((r, ri) => {
        if (!r || r.length === 0) return null;
        // confRows 구조: [dateSuppCombined, codeNameCombined, masterP, pri, qty, amt, salePrice, profitRate, expiry]
        // ERP 서식은 각각 분리 필요 · confRows 만들 때 사용한 소스 재구성
        const pn = pageNums[ri];
        const dateVal = pageDateOverride[pn] ?? structuredPages.find(p => p.page === pn)?.meta.date ?? "";
        const supp = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
        const codeName = String(r[1] ?? "").split("\n");
        const code = codeName[0] ?? "";
        const name = codeName[1] ?? codeName[0] ?? "";
        const matched = matchItems[ri]?.matched;
        const bc = barcodeAutoMap[ri] ?? null;
        const spec = matched?.spec ?? bc?.spec ?? "";
        void dateVal; // ERP 서식에 거래일 없음
        return {
          code,
          name,
          spec,
          masterPrice: typeof r[2] === "number" ? r[2] : null,
          supplier: supp,
          invoicePrice: typeof r[3] === "number" ? r[3] : null,
          qty: typeof r[4] === "number" ? r[4] : null,
          amount: typeof r[5] === "number" ? r[5] : null,
          salePrice: typeof r[6] === "number" ? r[6] : null,
          profitRate: typeof r[7] === "number" ? r[7] : null,
          expiry: r[8] ?? "",
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    _writeErpUploadXlsx({ rows, filename });
  }, [matchItems, confRows, meta, pageNums, pageDateOverride, structuredPages, rawSupplierByPage, barcodeAutoMap]);

  const handleExcelExport = useCallback(() => {
    if (!matchItems || confRows.length === 0) return;
    const filename = `거래명세서_${meta.date?.replace(/-/g, "") ?? "OCR"}_확정.xlsx`;

    if (xlsTemplate && xlsTemplateHdrs) {
      _writeXlsxWithTemplate({
        templateBuf: xlsTemplate,
        templateHdrs: xlsTemplateHdrs,
        confHeaders: CONF_HEADERS,
        colAlias: COL_ALIAS,
        confRows,
        filename,
      });
    } else {
      _writeXlsxFresh({
        confHeaders: CONF_HEADERS,
        confRows,
        pageNums,
        uniquePageNums,
        confAmtIdx,
        confPageTotals,
        confTotal,
        rawSupplierByPage,
        supplierByPageFallback: (pn) => structuredPages.find(p => p.page === pn)?.meta.supplier ?? "",
        filename,
      });
    }
  }, [matchItems, confRows, CONF_HEADERS, COL_ALIAS, pageNums, uniquePageNums, confAmtIdx,
      confPageTotals, confTotal, rawSupplierByPage, structuredPages, meta, xlsTemplate, xlsTemplateHdrs]);

  if (pages.length === 0) return null;

  const autoSynonymCount = Object.keys(autoSynonymMatches).length;

  return (
    <>
    {/* ── 저장 완료 토스트 ── */}
    {saveConfirmedToast && (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-xl shadow-2xl text-xs font-bold flex items-center gap-2 pointer-events-none"
        style={{
          background: saveConfirmedToast.type === "success" ? "#059669" : "#e11d48",
          color: "white",
        }}
      >
        {saveConfirmedToast.type === "success" ? <CheckCircle size={13} /> : <XCircle size={13} />}
        {saveConfirmedToast.msg}
      </div>
    )}
    {/* ── 품명 검색 드롭다운 (position:fixed — overflow 클리핑 우회) ── */}
    {nameDropdownRect && (nameEditResults.length > 0 || nameEditSearchDone) && (
      <div
        // 2026-07-24 · 사용자 문제 "아래쪽 항목 선택 안됨"
        //   기존 max-h-48 (192px · 약 5개만) → max-h-[70vh] (뷰포트의 70%) 로 확장
        //   화면 아래 짤리지 않게 · viewport 초과 시 스크롤
        style={{ position: "fixed", top: nameDropdownRect.top, left: nameDropdownRect.left, width: nameDropdownRect.width, zIndex: 9999, maxHeight: "70vh" }}
        className="bg-white border border-indigo-200 rounded-xl shadow-2xl overflow-y-auto"
        onMouseDown={e => e.preventDefault()}
      >
        {nameEditResults.length === 0 ? (
          <div className="px-3 py-2.5 text-[12px] text-gray-400 text-center">상품이 없습니다</div>
        ) : nameEditResults.map((p, pi) => (
          <button key={pi}
            onMouseDown={e => e.preventDefault()}
            onClick={async () => {
              // 2026-07-24 · state 지워졌으면 ref 폴백 · 클릭 항상 작동
              const ri = editingNameRow ?? editingNameRowRef.current;
              if (ri == null) { console.warn("[dropdown click] editingNameRow null · 무시"); return; }
              // 2026-07-28 · B 옵션 · "셀에 표시되던 값" (autoSyn 있으면 그 이름 · 없으면 OCR 원본)
              const origName = String(autoSynonymMatches[ri]?.name ?? dispRows[ri]?.[nameIdx] ?? "");
              const pnLocal = pageNums[ri];
              const supplier = rawSupplierByPage[pnLocal] ?? structuredPages.find(pg => pg.page === pnLocal)?.meta.supplier ?? globalSupplier ?? "";
              setAutoSynonymMatches(prev => ({ ...prev, [ri]: { code: p.product_code, name: p.product_name } }));
              setCancelledAutoSyn(prev => { const s = new Set(prev); s.delete(ri); return s; });
              // 2026-07-27 · 사용자 문제 "품명 리스트 선택 반영 안 됨"
              //   원인 · cancelledAutoMap 안 지우면 autoMatch = undefined 라서 새 선택 무시됨
              setCancelledAutoMap(prev => { const s = new Set(prev); s.delete(ri); return s; });
              setRawEditValues(prev => { const n = { ...prev }; delete n[ri]; return n; });
              // 2026-07-28 · 드롭다운 선택 즉시 · matchItems 에 판매가·사입가·이익률 반영 (ERP row 표시)
              setMatchItems(prev => {
                const next = prev ? [...prev] : dispRows.map(() => ({ input: "", matched: null }));
                next[ri] = {
                  input: origName,
                  matched: {
                    code: String(p.product_code ?? ""),
                    name: String(p.product_name ?? ""),
                    spec: String(p.spec ?? ""),
                    score: 100,
                    masterPrice: p.purchase_price != null ? Number(p.purchase_price) : null,
                    salePrice: p.sale_price != null ? Number(p.sale_price) : null,
                    profitRate: p.profit_rate != null ? Number(p.profit_rate) : null,
                    expiryDate: p.expiry_date ?? null,
                    supplier: p.supplier ?? null,
                  },
                };
                return next;
              });
              // 2026-07-28 · 사용자 요청 (재변경) · 동의어보정사전 등록 confirm 다시 활성화
              //   흐름 · 재추출 → 상품명 클릭 → 기존 저장 → 입력 후 선택 → 확인창 → DB 등록
              if (origName && origName !== p.product_name) {
                if (await confirm({ message: `동의어보정사전에 등록할까요?\n\n· 보정 전: ${origName}\n· 보정 후: ${p.product_name}` })) {
                  saveSynonym(ri, origName, p.product_code, supplier || undefined, p.product_name);
                }
              }
              // 2026-07-28 · 사용자 문제 "확정표에 1차 값이 들어감" · cellEdits 의 상품명 항목 클리어
              //   → userEditedName 이 corrName 을 덮어쓰지 못하게 · autoSyn/matched.name 이 확정표에 반영
              setCellEdits(prev => {
                if (!prev[ri]) return prev;
                const rowEdits = { ...prev[ri] };
                delete rowEdits[nameIdx];
                if (Object.keys(rowEdits).length === 0) { const n = { ...prev }; delete n[ri]; return n; }
                return { ...prev, [ri]: rowEdits };
              });
              setEditingNameRow(null);
              setNameEditResults([]);
              setNameEditSearchDone(false);
              setNameDropdownRect(null);
              // 2026-07-28 · 사용자 요청 "1차보정값에서 제품명 찾으면 바로 ERP 자동 업데이트"
              //   드롭다운 선택 즉시 · 해당 페이지 ERP 매칭 재실행 → autoSyn 값으로 masterPrice·유통기한 등 조회
              //   + 매입이력 매칭 · 해당 상품 최근 매입 수량·단가와 유사한 raw 값 자동 채움
              setTimeout(() => {
                (async () => {
                  try {
                    await handleMatchPage(pnLocal);
                    await matchRawToPurchaseHistory(pnLocal);
                  } catch { /* silent */ }
                })();
              }, 100);
            }}
            className="flex items-center gap-2 w-full text-left px-3 py-1.5 hover:bg-indigo-50 text-[12px] border-b border-gray-50 last:border-0">
            <span className="flex-1 font-semibold text-gray-800 break-words">{p.product_name}</span>
            {p.spec && <span className="text-gray-400 shrink-0 max-w-[60px] break-words">{p.spec}</span>}
            {p.supplier && <span className="text-sky-500 shrink-0 max-w-[60px] break-words">{p.supplier}</span>}
          </button>
        ))}
      </div>
    )}

    {/* ── 동의어 삭제 확인 다이얼로그 ── */}
    {deleteSynConfirm && (
      <DeleteSynonymDialog
        deleteSynConfirm={deleteSynConfirm}
        setDeleteSynConfirm={setDeleteSynConfirm}
        deleteSynonymByName={deleteSynonymByName}
        setAutoSynonymMatches={setAutoSynonymMatches}
      />
    )}

    {/* ── 공급처 자동완성 드롭다운 (fixed · 테이블 stacking context 우회) ── */}
    {/* editing 활성 시 무조건 표시 · vendorNames 없어도 진단용 안내 · rect 없으면 input 재추적 */}
    {editingRawSuppRow != null && (() => {
      // rect 없으면 input 을 지금 다시 조회 (ref callback 놓쳤을 경우 대비)
      let rect = suppDropdownRect;
      if (!rect && suppInputRef.current) {
        const r = suppInputRef.current.getBoundingClientRect();
        rect = { top: r.bottom, left: r.left, width: Math.max(220, r.width) };
      }
      if (!rect) return null;
      const q = editingRawSuppVal.trim().toLowerCase().replace(/[\s()（）]/g, "");
      const matches = vendorNames.length === 0 ? [] : (q.length === 0
        ? vendorNames.slice(0, 8)
        : vendorNames.filter(n => n.toLowerCase().replace(/[\s()（）]/g, "").includes(q)).slice(0, 8));
      const commit = (val: string) => {
        const trimmed = val.trim();
        const pn = pageNums[editingRawSuppRow];
        const currentSupp = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
        if (trimmed && trimmed !== currentSupp) {
          const rowCount = pageNums.filter(p => p === pn).length;
          setSupplierConfirm({ pageNum: pn, newVal: trimmed, rowCount, addSynonyms: addSynonymsOnChange });
        }
        setSuppDropdownRect(null);
        setEditingRawSuppRow(null);
      };
      return (
        <div
          className="fixed z-[9999] max-h-52 overflow-y-auto bg-white border border-sky-300 rounded-lg shadow-xl text-xs"
          style={{ top: rect.top + 2, left: rect.left, width: rect.width }}
        >
          <div className="px-2 py-1 text-[10px] text-zinc-500 border-b border-zinc-100 bg-zinc-50 font-bold">
            공급사 DB · {vendorNames.length === 0 ? "⚠ vendors 로드 안 됨 (F5 시도)" : `${matches.length}건${q ? ` ("${q}" 매칭)` : " (전체)"} / 총 ${vendorNames.length}`}
          </div>
          {vendorNames.length === 0 ? (
            <div className="px-2 py-3 text-[11px] text-rose-500 text-center">
              공급사 DB 목록이 로드되지 않았어요.<br />/api/vendors 응답 확인 필요.
            </div>
          ) : matches.length === 0 ? (
            <div className="px-2 py-2 text-[11px] text-zinc-400 text-center">"{q}" 매칭 없음</div>
          ) : matches.map(name => (
            <button
              key={name}
              type="button"
              onMouseDown={e => { e.preventDefault(); commit(name); }}
              className="w-full text-left px-2 py-1.5 hover:bg-sky-50 text-sky-800 font-semibold border-b border-zinc-50 last:border-0 cursor-pointer"
            >
              {name}
            </button>
          ))}
        </div>
      );
    })()}

    {/* 2026-07-22: 이미지 모달 렌더링 제거 (사용자 요청) · state/함수는 유지 (다른 코드 참조 대비) */}

    {/* ── 공급사 조회·수정 모달 (2026-07-18 · 공급사명 클릭 시) ── */}
    {vendorEditModal && (
      <VendorDetailModal
        vendor={vendorEditModal}
        onClose={() => setVendorEditModal(null)}
        onSaved={() => { setVendorEditModal(null); }}
      />
    )}

    {/* ── 공급처 변경 확인 다이얼로그 ── */}
    {supplierConfirm && (
      <SupplierChangeDialog
        supplierConfirm={supplierConfirm}
        setSupplierConfirm={setSupplierConfirm}
        nameIdx={nameIdx}
        structuredPages={structuredPages}
        setRawSupplierByPage={setRawSupplierByPage}
        handleSynonymBulkAdd={handleSynonymBulkAdd}
        onReparsePage={onReparsePage}
        setReparseStatus={setReparseStatus}
        setReparseSupplier={setReparseSupplier}
      />
    )}

    {/* ── 명세서별 이미지+테이블 2컬럼 그리드 (per-page pair) ── */}
    {/* 이미지 컬럼 폭 CSS variable · 드래그 리사이즈로 조절 */}
    <div
      className="w-full flex flex-col gap-0"
      style={{ "--inv-col-w": `${invoiceColWidth}px` } as React.CSSProperties}
    >

      {/* ── 콘텐츠 래퍼 ── */}
      <div className="w-full flex flex-col gap-3">

      {/* ── OCR 원본 표 (이미지+테이블 2컬럼 · rowSpan 방식) ── */}
      {structuredPages.length > 0 && (
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
              {/* DB 필터·행선택·원본복원 배지 제거됨 (2026-07-22) */}
              {/* 2026-07-24 · 사용자 요청 "헤더 쪽 선택 재추출 버튼 제거 · 필요없음"
                  기존 · Alt+Click 셀 체크 → 선택 재추출 / 지우기 / 취소 버튼 표시
                  대체 · 각 셀에 재추출 버튼(🔄) 이미 있음 · 개별 재추출로 충분 */}
              {/* 2026-07-22 · 사용자 요청 삭제: ☑ 행 선택 배지 · ↺ 원본 복원 버튼 제거
                   🗑 선택 삭제만 유지 (편집·삭제 기능 필요) */}
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
              {/* Feature 3: 동의어 자동보정 뱃지 */}
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
              {/* Feature 2: 동의어 추가 완료 상태 */}
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
              {/* 2026-07-22: "📄 행 클릭 → 이미지 보기" 배지 삭제 (사용자 요청) */}
            </div>
            {/* 2026-07-22: 상세정보 토글 · CSV 다운로드 모두 삭제 (사용자 요청) · 다운로드는 3차 확정표에만 */}
          </div>


          {/* ── 공급사 미입력 페이지 경고 배너 (2026-07-15 · 필수 검증) ── */}
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

          {/* 2026-07-22 · 양쪽 여백 (사용자 요청 "양쪽에 여백") · px-3 */}
          {/* 2026-07-23 · 최대 폭 제한 · 보기 좋게 (사용자 요청 "일정 넓이 이상 안 넓어지게") · max-w-[1400px] mx-auto */}
          <div className="w-full max-w-[1400px] mx-auto overflow-x-auto pl-3 pr-8 box-border" ref={invTableWrapRef}>
            <table className={`w-full border-collapse ${_cw < 500 ? "text-[10px]" : "text-xs"}`} style={{ tableLayout: "fixed" }}>
              <thead>
                <tr className="bg-amber-50 border-b-2 border-amber-200">
                  {/* 이미지 컬럼 헤더 (이미지가 있을 때) */}
                  {pageImages?.length ? (
                    <th
                      className="p-0 text-center bg-gray-50 border-r border-line text-[10px] font-bold text-gray-500 whitespace-nowrap select-none"
                      style={{ width: effectiveInvColWidth, minWidth: effectiveInvColWidth, maxWidth: effectiveInvColWidth, position: "relative", boxSizing: "border-box" }}
                    >
                      <div style={{ padding: "8px 4px", textAlign: "center" }}>
                        <span>거래명세서</span>
                      </div>
                      {/* 2026-07-21: 얇고 은은한 리사이즈 핸들 · hover 시 emerald 강조 */}
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
                          top: 0,
                          right: 0,
                          bottom: 0,
                          width: 4,
                          cursor: "col-resize",
                          zIndex: 50,
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
                    // 표시할 (원본 인덱스, 순서 인덱스) 리스트 계산
                    const baseOrder = dispHeaders.map((_, i) => i);
                    let colList: { origIdx: number; orderIdx: number }[];
                    if (showRawDetail) {
                      colList = baseOrder.map((origIdx, orderIdx) => ({ origIdx, orderIdx }));
                    } else {
                      // 압축 모드: RAW_ESSENTIAL_COLS 순서(존재하는 것만)
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

                    // ── 가중치 기반 가용 폭 배분 (IIFE 밖에서 계산) ──────────────
                    // 가중치 테이블: 중요도 기반 상대 비율
                    const COL_WEIGHTS: Record<string, number> = {
                      품명: 4.5,
                      금액: 2.2, 유통기한: 2.0, 유효기한: 2.0, 유통기간: 2.0,
                      단가: 1.6, 규격: 1.5, 세액: 1.4, 배치번호: 1.4, "Batch.No": 1.4,
                      수량: 1.0, 비고: 1.0, 단위: 1.0,
                      번호: 0.6, 순번: 0.6,
                    };
                    // 고정 폭 합산: 이미지 컬럼 + 선택·재추출 컬럼
                    const fixedUsed = (pageImages?.length ? effectiveInvColWidth : 0) + 56;
                    // containerWidth 가 아직 0이면 fallback 으로 700 사용
                    const totalAvail = Math.max((containerWidth || 700) - fixedUsed, 60);
                    // 사용자가 리사이즈한 컬럼의 폭 합산 → 나머지 가용 폭 계산
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
                      // 사용자 리사이즈 값 우선 · 없으면 가중치 비율로 배분
                      const weight = COL_WEIGHTS[h] ?? 1.0;
                      const computedW = totalWeight > 0
                        ? Math.round((weight / totalWeight) * autoAvail)
                        : Math.round(autoAvail / Math.max(autoColList.length, 1));
                      // 숫자/날짜 셀은 breakpoint 기반 최소 폭 보장 (사용자 리사이즈 없을 때만)
                      // 유통기한 계열은 별도 expCellMinW(82px+) 로 더 넓게 보장
                      // 2026-07-24 · 사용자 문제 "2번째 페이지 나오면서 컬럼 확 줄어듬"
                      //   원인 · 새 페이지가 새 컬럼 추가 시 totalWeight 증가 → 텍스트 컬럼도 shrink
                      //   해결 · 텍스트 컬럼도 최소 폭 보장
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
                          style={{
                            width: colW,
                            position: 'relative',
                            overflow: 'hidden',
                          }}
                          className={`px-1.5 py-1.5 font-bold text-amber-900 select-none text-[11px] ${NUM_COLS.has(h) ? "text-right" : "text-left"} truncate`}>
                          {`OCR ${h}`}
                          {/* 2026-07-23 · 사용자 요청 "헤더 넓이 조절 라인 안보여" · 항상 보이게 · hover 진하게 */}
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
                {/* 2026-07-23 · 사용자 요청 "행간격 충분히" · 모바일 py-4 · 데스크탑 py-3 · 행별 얇은 구분선 */}
                {(() => {
                  // 페이지별 마지막 표시 행 인덱스 사전 계산 (완전삭제 · DB삭제 제외)
                  //   → 마지막 행이 삭제돼도 요약 행 안 사라지도록 (2026-07-10)
                  const _lastVisibleByPage = new Map<number, number>();
                  const _firstVisibleByPage = new Map<number, number>();
                  // 2026-07-27 · 사용자 요청 "거래명세표 사이에 없는 공급사 데이터 생겨 · 삭제도 안돼"
                  //   유효 행이 하나도 없는 페이지는 · 페이지 헤더·소계도 렌더 안 함 (phantom page 완전 제거)
                  //   유효 조건: 삭제·숨김 아니고 · 품명·수량·단가 중 하나라도 있음
                  const _qtyIdxSkip0 = dispHeaders.indexOf("수량");
                  const _priIdxSkip0 = dispHeaders.indexOf("단가");
                  effectiveDispRows.forEach((row, i) => {
                    if (permanentlyDeletedRawRows.has(i) || isRowDbDeleted(i) || hiddenRawRows.has(i)) return;
                    const nmVal0 = nameIdx >= 0 ? String(row[nameIdx] ?? "").trim() : "";
                    const qtVal0 = _qtyIdxSkip0 >= 0 ? parseNumber(row[_qtyIdxSkip0]) : 0;
                    const prVal0 = _priIdxSkip0 >= 0 ? parseNumber(row[_priIdxSkip0]) : 0;
                    if (!nmVal0 && qtVal0 === 0 && prVal0 === 0) return;  // 잡음 행 스킵
                    const pn = pageNums[i];
                    if (!_firstVisibleByPage.has(pn)) _firstVisibleByPage.set(pn, i);
                    _lastVisibleByPage.set(pn, i);
                  });
                  return effectiveDispRows.map((row, ri) => {
                  // 확정 삭제된 행 · DB 서명 매치 → 완전 스킵 (체크 상태는 취소선만 표시)
                  if (permanentlyDeletedRawRows.has(ri)) return null;
                  if (isRowDbDeleted(ri)) return null;
                  // 2026-07-28 · 사용자 요청 "선택삭제한 행이 보여" · 체크된 행 완전 숨김
                  //   페이지 헤더에 "N개 숨김 · 복원" 링크로 되돌리기 가능
                  if (hiddenRawRows.has(ri)) return null;
                  // 2026-07-24 · 사용자 요청 "품명·단가·수량에 값이 없으면 행 만들지 마"
                  //   세 필드 모두 비어있으면 렌더 스킵 (OCR 잡음 행 자동 배제)
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
                  // 우측 명세서 접기 제거 (2026-07-19) · 항상 펼침
                  const isPageCollapsedRaw = false;
                  const pageRowCountRaw = isFirstInPage
                    ? effectiveDispRows.filter((_, i) => pageNums[i] === pn && !permanentlyDeletedRawRows.has(i) && !hiddenRawRows.has(i)).length
                    : 0;
                  // 2026-07-28 · 이미지 rowSpan · 실제 DOM 에 렌더될 <tr> 수와 정확히 일치
                  //   hiddenRawRows 는 이제 완전 숨김 (return null) · 카운트에서 제외
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
                  // 2026-07-27 · ERP 매칭 sub-row 는 데이터 행마다 1개 · 헤더 sub-row 는 이제 없음 (컬럼 정렬 방식으로 변경)
                  const _subRowMultiplier = erpSubRowPages.has(pn) ? 2 : 1;
                  // 2026-07-28 · imgRowSpan · 페이지 헤더(1) + 데이터N*_subRowMultiplier + 소계(amtIdx>=0?1:0) + spacer(1)
                  const imgRowSpan = isFirstInPage
                    ? 1 + (_visibleDataRowsForImg * _subRowMultiplier) + (amtIdx >= 0 ? 1 : 0) + 1
                    : 0;
                  // 2026-07-28 · 이미지 td 높이 명시 (확정표와 동일 방식) · 데이터 행 stretch 방지
                  //   페이지 헤더(44) + 데이터N*44 + 소계(amtIdx>=0?44:0) + spacer(shortfall+24)
                  const RAW_MIN_PAGE_HEIGHT = 240;
                  const RAW_DATA_ROW_H = 44;
                  const naturalHeightRaw = 44 + (_visibleDataRowsForImg * _subRowMultiplier * RAW_DATA_ROW_H) + (amtIdx >= 0 ? 44 : 0);
                  const shortfallRaw = Math.max(0, RAW_MIN_PAGE_HEIGHT - naturalHeightRaw);
                  const imgCellHeightRaw = naturalHeightRaw + shortfallRaw + 24;
                  const pageSupplierHeadRaw = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
                  const rawColSpan = (() => {
                    const baseOrder = dispHeaders.map((_, i) => i);
                    if (showRawDetail) return baseOrder.length + 1; // +1 = 체크박스 컬럼
                    let cnt = 1; // 체크박스 컬럼
                    for (const name of RAW_ESSENTIAL_COLS) {
                      let idx = dispHeaders.indexOf(name);
                      if (idx < 0 && name === "유통기한") {
                        for (const a of ["유효기한", "유통기간"]) { idx = dispHeaders.indexOf(a); if (idx >= 0) break; }
                      }
                      if (idx >= 0) cnt++;
                    }
                    return cnt;
                  })();
                  // 2026-07-28 · 수식오탐 빨강 강조 완전 제거 (사용자 요청) · 관련 변수·분기 삭제
                  void ocrQtyIdx; void ocrPriIdx; void _discountIdxEarly;
                  return (
                    <React.Fragment key={ri}>
                      {/* 페이지 헤더 — 접기 제거 (2026-07-19) · 명세서 정보만 표시 */}
                      {isFirstInPage && (
                        <tr className="border-t-2 select-none bg-amber-100/70 border-amber-300">
                          {/* 이미지 셀: rowSpan으로 이 명세서 전체 행을 커버 */}
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
                              {/* 공급사 정보 조회·수정 버튼 (2026-07-19 · 명세서 헤더 · 공급사관리 상세 페이지 재사용) */}
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
                              {/* 페이지별 상품명 보정 버튼 제거 (2026-07-19 · 실수 클릭 방지)
                                  전체 매칭은 아래 "1차보정 완료 · 2차보정 시작" 버튼으로 진행 */}
                              {/* 2026-07-22: "이 명세서 재추출" 버튼 삭제 (사용자 요청) */}
                              {/* 2026-07-28 · 선택 재추출/삭제 배지·버튼 제거 (체크박스 = 즉시 삭제로 변경 · 안 씀) */}
                              {/* 2026-07-28 · 자동정리 버튼 유지 (사용자 재요청 "일단 놔둬") · autoPipeline 자동 실행과 병행 · 수동 재실행용 */}
                              <button type="button"
                                onClick={() => runColumnPipeline(pn)}
                                disabled={!!runningPipeline[pn]}
                                className="ml-1 text-[10px] font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:bg-zinc-300 disabled:cursor-not-allowed rounded px-2 py-0.5 cursor-pointer shadow-sm whitespace-nowrap"
                                title="상품명 매칭 → 빈 단가 DB 조회 → OCR vs DB 큰차이 스왑 · 페이지 로드 시 자동 실행됨 · 재실행용"
                              >{runningPipeline[pn] ? "⏳ 정리중..." : "🎯 자동정리"}</button>
                              {/* 2026-07-22 · 명세서마다 행추가 (사용자 요청) */}
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
                                // 2026-07-28 · 사용자 요청 "체크된 데이터 자체를 삭제 · 숨기는게 아니고"
                                //   체크 즉시 · 확인 후 · 완전 삭제 (DB signature 저장 · 다음 스캔 자동 필터)
                                const nmIdx = dispHeaders.indexOf("품명");
                                const rowName = nmIdx >= 0 ? String(effectiveDispRows[ri]?.[nmIdx] ?? "").trim() : "";
                                if (!await confirm({ message: `이 행을 완전 삭제하시겠습니까?\n${rowName ? `· 품명: ${rowName}` : ""}\n· DB 서명 저장 · 다음 스캔에도 자동 필터`, danger: true })) return;
                                setPermanentlyDeletedRawRows(prev => { const n = new Set(prev); n.add(ri); return n; });
                                const supplier = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
                                if (supplier && rowName) {
                                  setDbDeletedSignatures(prev => { const n = new Set(prev); n.add(makeRowSignature(supplier, rowName)); return n; });
                                  // 2026-08-21 · Framework Phase 3 · fetch → apiClient · fire-and-forget
                                  api.post("/api/ocr-deleted-rows", { items: [{ supplier, name: rowName }] }).catch(() => {});
                                }
                              }}
                              className="w-4 h-4 cursor-pointer accent-rose-500"
                              title="체크하면 이 행 완전 삭제 (DB 서명 저장)"
                            />
                            {/* 재추출·행 밀기 버튼 전면 제거 (2026-07-18 · 사용자 요청) */}
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
                          const origCell = isName ? dispRows[ri]?.[ci] : null;

                          if (isEditingThisSupp) {
                            return (
                              <td key={ci} className="px-1 py-1" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center gap-1">
                                  <input
                                    ref={el => {
                                      if (el && suppInputRef.current !== el) {
                                        suppInputRef.current = el;
                                        // 한 번만 좌표 계산 (매 렌더마다 setState 호출 방지)
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
                                  {/* 공급사 정보 조회·수정 버튼 (2026-07-19 · 입력창 옆) */}
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
                            // 공급사 미입력 검증 (2026-07-15) — 빈 값이면 rose 배경 + "⚠ 공급사 필수" 강조
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

                          // 일자: 날짜 + 이미지 보기 버튼
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

                          // 수량/단가/금액 셀 렌더
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

                          // 품명 셀 렌더 (바코드 매칭 + 자동보정 + 편집 통합)
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

                          // 유통기한/유효기한/유통기간 셀 렌더
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
                            // 2026-07-24 · 거래일·일자·날짜 표시 간단히 (저장은 풀로 · 표시는 MM/DD)
                            //   사용자 요청: "1차보정 거래일 간단히 · 저장은 풀로 표시는 간단히"
                            const isDateCol = ["거래일", "일자", "날짜", "거래일자", "거래날짜"].includes(h);
                            const dateShort = (() => {
                              if (!isDateCol || cell == null) return null;
                              const s = String(cell).trim();
                              // 2026-07-24 · 2026-7-24 · 2026/07/24 · 26-07-24 등 → MM/DD 로 축약
                              const m = s.match(/(\d{2,4})[-./](\d{1,2})[-./](\d{1,2})/);
                              if (m) return `${m[2].padStart(2, "0")}/${m[3].padStart(2, "0")}`;
                              return s.length > 6 ? s.slice(-5) : s;
                            })();
                            // 2026-07-27 · 사용자 요청 "1차보정에서 거래일 편집 가능하게"
                            const isEditingThisDate = isDateCol && editingCell?.ri === ri && editingCell?.ci === ci;
                            if (isEditingThisDate) {
                              // 2026-07-28 · 사용자 요청 "거래일 입력 시 같은 명세서면 일괄 적용"
                              //   → 페이지 내 모든 행의 거래일 셀 (cellEdits[ri][ci]) 를 동일 값으로 세팅 + pageDateOverride 도 갱신
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
                      {/* 2026-07-27 · 페이지별 "ERP 매칭" 버튼 클릭한 페이지만 · 각 행 아래 violet ERP sub-row (1차 컬럼 정렬) */}
                      {!isPageCollapsedRaw && erpSubRowPages.has(pn) && (() => {
                        const qtyIdxLoc = dispHeaders.indexOf("수량");
                        const qtyVal = qtyIdxLoc >= 0 ? parseNumber(row[qtyIdxLoc]) : null;
                        const m = cancelledRows.has(ri) ? null : (selectedCands[ri] ?? matchItems?.[ri]?.matched ?? null);
                        const autoSyn = cancelledAutoMap.has(ri) ? undefined : autoSynonymMatches[ri];
                        const bc = cancelledAutoMap.has(ri) ? null : (barcodeAutoMap[ri] ?? null);
                        // parent 와 동일한 colList 재계산 (없는 것은 skip)
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
                        // 2026-07-28 · ERP 매칭에 supplier 없을 때 · 페이지 공급사로 폴백
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
                      {/* 자동정리 버튼 · 명세서 시작 부분(페이지 헤더 행)에 배치 */}
                      {isLastInPage && amtIdx >= 0 && (() => {
                        const pageSupplier = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
                        // 현재 렌더링 중인 컬럼 순서 (compact/detail 모드에 따라)
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
                        const totalColSpan = orderNow.length + 1; // +1 = 체크박스 컬럼
                        return (
                          <>
                            {/* ── 통합 소계+잔고 요약 행 ── */}
                            <tr className="border-t-2 border-amber-400">
                              <td
                                colSpan={totalColSpan}
                                className="px-0 py-0"
                                style={{
                                  background: "linear-gradient(90deg, #fef3c7 0%, #ffedd5 55%, #fed7aa 100%)"
                                }}
                              >
                                {/* 2026-07-22 · 사용자 요청 한 줄 요약: "N번 공급사 총 XXX원 정산차액 YYY원 (없으면 -)" · 우측 [확정] */}
                                <div className="flex flex-col gap-0 px-3 py-2">
                                  <div className="flex items-center justify-between gap-3 min-w-0 flex-wrap">
                                    {/* 좌: 번호 + 공급사 + 총소계 + 정산차액 · 한 줄 · 같은 톤 */}
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
                                                      {/* 2026-07-24 · 사용자 요청 "총소계 금액도 수정 가능하게" · 클릭 시 인라인 입력 */}
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
                                                {/* 2026-07-24 · 사용자 요청 "각 페이지 소계 부분 VAT 포함 체크박스 · 체크 시 금액계산 반영" */}
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
                                            {/* 2026-07-24 · 사용자 요청 "정산차액 = 차액+에누리+할인 합 · 적용 체크박스" */}
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
                                                  // 2026-07-24 · 사용자 요청 "클릭하면 비어있게 · 아무것도 안하고 나오면 원래 금액"
                                                  //   onFocus 에서 value=""로 비움 · dirty=false · onBlur 시 dirty 안하면 스킵
                                                  onFocus={() => setEditingSummary({ pn, kind: "discount", value: "", dirty: false })}
                                                  onChange={e => setEditingSummary({ pn, kind: "discount", value: e.target.value, dirty: true })}
                                                  onBlur={() => {
                                                    if (!editingSummary || editingSummary.pn !== pn || editingSummary.kind !== "discount") { setEditingSummary(null); return; }
                                                    if (!editingSummary.dirty) { setEditingSummary(null); return; }  // 아무것도 안 함 · 원본 유지
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
                                              // 2026-07-24 · 수식 검증 반영 · valid=false 면 자동 적용 안 함 · 회색 경고 표시
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
                                            {/* 2026-07-23 · 미수금(=잔고) · 사용자 요청 "미수금 = 잔고 · 잔고항목에 미수금 추가" */}
                                            <span className="text-[12px] font-semibold text-rose-700 ml-2" title="잔고 = 미수금 (동의어)">미수금</span>
                                            <input type="text" inputMode="numeric"
                                              value={
                                                editingSummary?.pn === pn && editingSummary.kind === "balance"
                                                  ? editingSummary.value
                                                  : (displayBalForShow != null && displayBalForShow > 0 ? String(displayBalForShow) : "")
                                              }
                                              placeholder={displayBalForShow != null && displayBalForShow > 0 ? String(displayBalForShow) : "0"}
                                              // 2026-07-24 · 정산차액과 동일 정책 · 클릭 시 비우고 · 아무것도 안하면 원본 유지
                                              onFocus={() => setEditingSummary({ pn, kind: "balance", value: "", dirty: false })}
                                              onChange={e => setEditingSummary({ pn, kind: "balance", value: e.target.value, dirty: true })}
                                              onBlur={() => {
                                                if (!editingSummary || editingSummary.pn !== pn || editingSummary.kind !== "balance") { setEditingSummary(null); return; }
                                                if (!editingSummary.dirty) { setEditingSummary(null); return; }
                                                const n = parseNumber(editingSummary.value.replace(/[^\d-]/g, ""));
                                                if (n > 0) {
                                                  setPageBalanceOverride(prev => ({ ...prev, [pn]: n }));
                                                  setPageBalanceModeManual(prev => { const s = new Set(prev); s.delete(pn); return s; });
                                                  // 2026-07-28 · setPageBalanceModeSkip · dead state 정리에서 제거됨
                                                  // 2026-07-24 · 사용자 요청 "지금 잔고 저장돼?" · 편집 시 즉시 DB 저장
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
                                            {/* 2026-07-24 · 사용자 요청 "확정 버튼 미수금 입력창 옆으로 이동" · 우측 배치 X · 인라인 */}
                                            {!hasMissingSupplier && (() => {
                                              const isConfirmed = confirmedPages.has(pn);
                                              const hasErpSubRow = erpSubRowPages.has(pn);
                                              return (
                                                // 2026-07-28 · ERP매칭·확정 버튼 다음 줄로 (사용자 요청) · basis-full 로 새 줄 강제
                                                <div className="basis-full flex items-center gap-1 mt-1 flex-wrap">
                                                  {/* 2026-07-27 · ERP 매칭 버튼 · 클릭 시 handleMatchPage + sub-row 노출 */}
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
                                                  {/* 확정 · 확정표 반영 */}
                                                  <button type="button"
                                                    onClick={async () => {
                                                      // 2026-07-27 · 사용자 요청 "확정 누르면 확정하시겠습니까 알림창"
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


                                  {/* 잔고 기록 행 제거됨 (2026-07-24) */}

                                </div>
                              </td>
                            </tr>
                          </>
                        );
                      })()}
                      {/* 2026-07-28 · 1차보정 페이지별 spacer · 이미지 td rowSpan 여분 1칸 채움
                          MIN_PAGE_HEIGHT 보장 + 여백 24px · 확정표와 동일 방식 */}
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
                const imgColOffset = pageImages?.length ? 1 : 0; // 이미지 컬럼 추가 시 colSpan 보정
                return (
                <tfoot>
                  {supplierTotals.length >= 1 && supplierTotals.map(({ supplier, total: sTotal, count }) => {
                    // 2026-07-27 · 사용자 요청 "각 공급사의 잔고도 같이 표시"
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
                      {/* 2026-07-27 · 사용자 요청 "1차보정 총소계금액도 편집가능하게" · 클릭 인라인 입력 */}
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
    {toast && (
      <div className="fixed bottom-6 right-6 z-[9999]">
        <div className={toastClass(toast.tone)}>{toast.message}</div>
      </div>
    )}
    </>
  );
};
