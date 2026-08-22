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
import { useInvoiceImageControls } from "./RawOcrTable/useInvoiceImageControls";
import { usePageTotalsComputation } from "./RawOcrTable/usePageTotalsComputation";
import { ConfirmedTableSection } from "./RawOcrTable/ConfirmedTableSection";
import { FallbackPageSection } from "./RawOcrTable/FallbackPageSection";
import { NumericEditableCell, ExpiryCell, NameCell } from "./RawOcrTable/RawOcrCellRenderer";
import { RawPageImageCell } from "./RawOcrTable/RawPageImageCell";
import { RawInvoiceCard } from "./RawOcrTable/RawInvoiceCard";

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
    {toast && (
      <div className="fixed bottom-6 right-6 z-[9999]">
        <div className={toastClass(toast.tone)}>{toast.message}</div>
      </div>
    )}
    </>
  );
};
