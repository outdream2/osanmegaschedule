import React, { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Wand2, Loader2, CheckCircle, AlertTriangle, XCircle, X, Bookmark, BookmarkCheck, Search, Pencil, FileSpreadsheet, Upload as UploadIcon, BookmarkPlus, BookOpen, Check, Save } from "lucide-react";
import { isNonProductText, isValidSupplierHint } from "../../lib/ocrRowFilter";
import { reextractCellCandidates } from "../../lib/cellReextract";
import { ColumnMappingModal } from "./ColumnMappingModal";

// 컬럼 매핑 모달의 표준 필드 옵션 (모듈 상수 · 참조 안정성 확보 · 무한 루프 방지)
const MAPPING_FIELD_OPTIONS = ["품명", "규격", "수량", "단가", "금액", "세액", "유통기한", "일자", "공급처", "비고", "제외"];

export interface ConfirmedItem {
  supplier: string;
  product_name: string;
  product_code?: string;
  quantity?: number;
  unit_price?: number;
  amount?: number;
  balance?: number;
  expiry_date?: string;
  memo?: string;
  confirmed_at?: string; // 2차보정 확정 버튼 누른 작업일 (YYYY-MM-DD)
  raw_json?: Record<string, unknown>;
}

interface RawPage {
  page: number;
  headers: string[];
  rows: (string | number | null)[][];
  meta: {
    supplier?: string | null;
    recipient?: string | null;
    date?: string | null;
    total?: number | null;
    summary_rows?: Array<{ label: string; amount: number }>;
  };
  rawText?: string;
  // 컬럼 매핑 모달용 OCR 원본 데이터 (정규화 전 · 서버 v4c 추가)
  rawOcrHeaders?: string[];
  rawOcrSample?: (string | number | null)[][];
}

interface MatchedItem {
  input: string;
  matched: {
    code: string; name: string; spec: string; score: number;
    masterPrice: number | null;
    salePrice:   number | null;
    profitRate:  number | null;
    expiryDate:  string | null;
    supplier:    string | null;
  } | null;
  score?: number;
}

type CandidateInfo = NonNullable<MatchedItem["matched"]>;

interface BarcodeProduct {
  barcode: string;
  code: string;
  name: string;
  spec: string | null;
  supplier: string | null;
  masterPrice: number | null;
  salePrice: number | null;
  profitRate: number | null;
  expiryDate: string | null;
}

interface RawOcrTableProps {
  pages: RawPage[];
  pageImages?: string[]; // dataURL per page (index = page-1)
  rotation?: number;     // CSS rotation applied in PageImageViewer (degrees)
  onReparsePage?: (pageNum: number, supplier: string) => Promise<any>;
  barcodeMatches?: BarcodeProduct[];
  balanceConfig?: Record<string, string>;
  onSaveConfirmed?: (items: ConfirmedItem[]) => Promise<void>;
}

const SCHEMA_ORDER = ["공급처","일자","품명","수량","단가","금액","세액","규격","유통기한","단위","비고"];
// "에누리"/"에누리액"은 할인 금액으로 계산에 사용하므로 HIDDEN에서 제외 (필요 시 상세정보 모드에서 표시)
// "유통기한"은 SCHEMA_ORDER 에 포함 → HIDDEN 에서 제외
const HIDDEN_COLS  = new Set(["번호", "배치번호", "Batch No", "BatchNo", "BATCH NO", "소비기한", "사용기한", "소비/사용기한", "보험코드"]);
const NUM_COLS     = new Set(["수량","단가","금액","세액"]);

function fmt(v: number) { return v.toLocaleString("ko-KR"); }

function isFallback(headers: string[]) {
  return headers.length <= 1 &&
    (headers[0] === "원문 텍스트" || headers[0] === "원문 응답" || headers.length === 0);
}

function buildMasterHeaders(pages: RawPage[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const hasSupplier = pages.some(p => p.meta.supplier);
  for (const col of SCHEMA_ORDER) {
    if (col === "공급처") {
      if (hasSupplier) { out.push(col); seen.add(col); }
      continue;
    }
    if (pages.some(p => p.headers.includes(col))) {
      out.push(col); seen.add(col);
    }
  }
  for (const p of pages) {
    for (const h of p.headers) {
      if (!seen.has(h) && !isFallback([h]) && !HIDDEN_COLS.has(h)) {
        out.push(h); seen.add(h);
      }
    }
  }
  return out;
}

function alignRow(
  row: (string | number | null)[],
  src: string[],
  dst: string[]
): (string | number | null)[] {
  return dst.map(h => { const i = src.indexOf(h); return i >= 0 ? row[i] : null; });
}

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 50) return "text-amber-500";
  return "text-rose-500";
}

function ScoreIcon({ score }: { score: number }) {
  if (score >= 80) return <CheckCircle size={12} className="text-emerald-500 shrink-0" />;
  if (score >= 50) return <AlertTriangle size={12} className="text-amber-400 shrink-0" />;
  return <XCircle size={12} className="text-rose-400 shrink-0" />;
}

const parseNumber = (val: any): number => {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  const clean = String(val).replace(/[^0-9.-]/g, "");
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
};

// 말줄임표(..., …)를 줄바꿈으로 렌더링
function renderTextWithBreaks(text: string): React.ReactNode {
  const parts = text.split(/\.{3}|…/);
  if (parts.length <= 1) return text;
  return (
    <>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {part}
          {i < parts.length - 1 && <br />}
        </React.Fragment>
      ))}
    </>
  );
}

export const RawOcrTable: React.FC<RawOcrTableProps> = ({ pages, pageImages, rotation = -90, onReparsePage, barcodeMatches, balanceConfig: balanceConfigProp, onSaveConfirmed }) => {
  const structuredPages = pages.filter(p => !isFallback(p.headers) && Array.isArray(p.rows) && p.rows.length > 0);
  const fallbackPages   = pages.filter(p => isFallback(p.headers) || !Array.isArray(p.rows) || p.rows.length === 0);

  const masterH     = buildMasterHeaders(structuredPages);
  const supplierIdx = masterH.indexOf("공급처");

  const allRows: { row: (string | number | null)[]; pageNum: number }[] = structuredPages.flatMap(p => {
    const supplier = p.meta.supplier ?? null;
    return p.rows.filter(row => Array.isArray(row)).map(row => {
      const aligned = alignRow(row, p.headers, masterH);
      if (supplierIdx >= 0) aligned[supplierIdx] = supplier;
      return { row: aligned, pageNum: p.page };
    });
  });

  const rawRows  = allRows.map(({ row }) => row);
  const pageNums = allRows.map(({ pageNum }) => pageNum);
  const keepCols = masterH.map((_, ci) =>
    rawRows.some(r => r[ci] != null && String(r[ci]).trim() !== "")
  );
  const dispHeaders = masterH.filter((_, ci) => keepCols[ci]);
  const dispRows    = rawRows.map(r => r.filter((_, ci) => keepCols[ci]));

  const amtIdx  = dispHeaders.indexOf("금액");
  const nameIdx = dispHeaders.indexOf("품명");

  // ── 공급처 편집 상태 — supplierTotals 계산보다 먼저 선언해야 참조 가능
  const [rawSupplierByPage, setRawSupplierByPage] = useState<Record<number, string>>({});
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

  // 공급사 DB 리스트 (자동완성 · 2026-07-14) · 컴포넌트 mount 시 한 번만 로드
  const [vendorNames, setVendorNames] = useState<string[]>([]);
  useEffect(() => {
    let mounted = true;
    fetch("/api/vendors")
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (!mounted) return;
        const names = Array.isArray(data) ? data.map((v: any) => String(v.company_name ?? "").trim()).filter(Boolean) : [];
        setVendorNames(names);
        console.log(`[공급사자동완성] vendors 로드: ${names.length}건`);
      })
      .catch(e => console.warn("[공급사자동완성] 로드 실패:", e));
    return () => { mounted = false; };
  }, []);
  // 공급처 편집 시 드롭다운 위치 (fixed positioning · 테이블 안 stacking context 우회)
  const [suppDropdownRect, setSuppDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const suppInputRef = useRef<HTMLInputElement | null>(null);

  // ── Feature 1: 금액 자동보정 ──────────────────────────────────────────────
  const [amountCorrections, setAmountCorrections] = useState<Record<number, number>>({});
  // 소계 불일치 시 사용자 선택: "stated" = 명세서 소계, "computed" = 인식된 합계, "custom" = 직접 선택
  const [pageSubtotalChoices, setPageSubtotalChoices] = useState<Record<number, "stated" | "computed" | "custom">>({});
  // "둘 다 아님" 선택 시 사용자가 고른 커스텀 소계 값
  const [pageSubtotalCustom, setPageSubtotalCustom] = useState<Record<number, number>>({});
  // "둘 다 아님" 드롭다운 열림 상태
  const [pageSubtotalDropdownOpen, setPageSubtotalDropdownOpen] = useState<Set<number>>(new Set());
  // 공급사 잔고 (페이지별)
  const [pageSupplierBalances, setPageSupplierBalances] = useState<Record<number, number>>({});
  // 공급사 잔고 DB 기록
  const [supplierBalanceRecords, setSupplierBalanceRecords] = useState<{ id: number; supplier_name: string; invoice_date: string | null; balance: number; created_at: string }[]>([]);
  // 공급사별 소계 공식 캐시: { "대웅제약": { subtotal: { positive: ["총합계액"], negative: ["에누리액"] }, resultLabel: "합계액" } }
  // 서버 /api/supplier-balance-configs 응답의 column_layout.subtotal_formula에서 로드
  const [supplierFormulaCache, setSupplierFormulaCache] = useState<Record<string, { subtotal?: { positive?: string[]; negative?: string[] }; resultLabel?: string }>>({});
  useEffect(() => {
    fetch("/api/supplier-balance-configs")
      .then(r => r.json())
      .then((rows: any[]) => {
        if (!Array.isArray(rows)) return;
        const cache: Record<string, any> = {};
        for (const row of rows) {
          const supp = String(row?.supplier_name ?? "").trim();
          const layout = row?.column_layout;
          if (!supp) continue;
          if (layout && typeof layout === "object" && layout.subtotal_formula) {
            cache[supp] = layout.subtotal_formula;
          }
        }
        setSupplierFormulaCache(cache);
      })
      .catch(() => {});
  }, []);

  // 페이지별 label → amount map (formula 계산용)
  const pageBalanceCandidatesForFormula = new Map<number, Map<string, number>>();
  // 페이지별 사용자 지정 잔고 (드롭박스로 OCR 추출 금액 중 선택) — 저장 버튼 클릭 시 확정
  const [pageBalanceOverride, setPageBalanceOverride] = useState<Record<number, number>>({});
  // "직접 입력" 모드: 사용자가 잔고 금액을 수동으로 입력
  const [pageBalanceManualInput, setPageBalanceManualInput] = useState<Record<number, string>>({});
  const [pageBalanceModeManual, setPageBalanceModeManual] = useState<Set<number>>(new Set());
  // "기록 안 함" 모드: 이 페이지 잔고 저장 안 함
  const [pageBalanceModeSkip, setPageBalanceModeSkip] = useState<Set<number>>(new Set());
  // 저장 완료된 페이지 (시각 피드백)
  const [savedBalancePages, setSavedBalancePages] = useState<Set<number>>(new Set());
  const [savingBalance, setSavingBalance] = useState<Record<string, boolean>>({});
  // 확정표 컬럼 접기
  const [collapsedConfCols, setCollapsedConfCols] = useState<Set<string>>(new Set());
  // 페이지별 접기 상태 (각 표 별도 관리)
  const [collapsedErpPages, setCollapsedErpPages]   = useState<Set<number>>(new Set());
  const [collapsedRawPages, setCollapsedRawPages]   = useState<Set<number>>(new Set());
  const [collapsedConfPages, setCollapsedConfPages] = useState<Set<number>>(new Set());
  // ERP 상품코드 → 현재고 매핑 (products-map API 캐시)
  const [erpStockMap, setErpStockMap] = useState<Record<string, number | null>>({});
  const [erpStockLoaded, setErpStockLoaded] = useState(false);
  // 1차보정(거래명세서 품목) 상세정보 표시 여부 — false면 필수 컬럼만 표시
  const [showRawDetail, setShowRawDetail] = useState<boolean>(() => {
    try { return localStorage.getItem("ocr_raw_show_detail") === "1"; }
    catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("ocr_raw_show_detail", showRawDetail ? "1" : "0"); } catch { /* empty */ }
  }, [showRawDetail]);
  // 1차보정 압축(기본) 모드에서 표시할 필수 컬럼 순서
  // 요구사항: 공급처 → 품명 → 수량 → 단가 → 금액 → 규격 → 유통기한
  const RAW_ESSENTIAL_COLS = ["공급처", "품명", "수량", "단가", "금액", "규격", "유통기한"];

  // ── 컬럼 너비 조정 ────────────────────────────────────────────────────────────
  const [colWidths, setColWidths] = useState<Record<number, number>>({});
  const resizeRef = useRef<{ ci: number; startX: number; startW: number } | null>(null);

  // ── 컬럼 순서(드래그) ────────────────────────────────────────────────────────
  // 원본표 (dispHeaders 기준, localStorage 저장)
  const [colOrder, setColOrder] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem("ocr_raw_col_order");
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr) && arr.every((v: unknown) => typeof v === "number")) return arr as number[];
      }
    } catch { /* ignore */ }
    return [];
  });
  const [dragColIdx, setDragColIdx] = useState<number | null>(null);
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
  // 확정표 (CONF_HEADERS 기준, localStorage 저장)
  const [confColOrder, setConfColOrder] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem("ocr_conf_col_order");
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr) && arr.every((v: unknown) => typeof v === "number")) return arr as number[];
      }
    } catch { /* ignore */ }
    return [];
  });
  const [confDragColIdx, setConfDragColIdx] = useState<number | null>(null);

  // ── 셀 인라인 편집 (수량/단가/금액) ───────────────────────────────────────
  const [cellEdits,      setCellEdits     ] = useState<Record<number, Record<number, number | null>>>({});
  const [editingCell,    setEditingCell   ] = useState<{ ri: number; ci: number } | null>(null);
  const [editingCellVal, setEditingCellVal] = useState("");

  // ── 1차보정 체크박스 마킹 (삭제 대기 · 취소선 표시) ─────────────────────
  const [hiddenRawRows, setHiddenRawRows] = useState<Set<number>>(new Set());
  // 체크박스 → 확인 다이얼로그로 처리 · 실제 로직은 아래 useCallback (effectiveDispRows 필요)
  const toggleHiddenRawRowRef = useRef<(ri: number) => void>(() => {});
  const toggleHiddenRawRow = useCallback((ri: number) => toggleHiddenRawRowRef.current(ri), []);
  // ── 확정 삭제된 행 (렌더에서 완전 제외) ──────────────────────────────────
  const [permanentlyDeletedRawRows, setPermanentlyDeletedRawRows] = useState<Set<number>>(new Set());
  // ── 공급사별 컬럼 매핑 모달 (raw 값 확인 후 표준 필드 지정) ─────────────
  const [mappingModal, setMappingModal] = useState<{
    pageNum: number;
    supplier: string;
    rawHeaders: string[];
    sampleRows: any[][];
    rawSampleForDetect?: any[][];
  } | null>(null);
  const [mappingSelection, setMappingSelection] = useState<string[]>([]);
  const [mappingSaving, setMappingSaving] = useState(false);
  const [mappingSaved, setMappingSaved] = useState<Set<string>>(new Set());
  // MAPPING_FIELD_OPTIONS 는 모듈 상단 상수 (참조 안정성 · useLayoutEffect 무한 루프 방지)
  const openMappingModal = useCallback((pageNum: number) => {
    // 페이지 데이터 조회 (structuredPages 우선 · 없으면 pages 에서 직접)
    const pageData = structuredPages.find(p => p.page === pageNum)
      ?? pages.find(p => p.page === pageNum);
    // 컬럼 매핑은 OCR 원본을 보고 지정해야 정확함 (덩어리 붙어있는 걸 확인 가능)
    //   → rawOcrHeaders/rawOcrSample 사용 · 없으면 processed 로 폴백
    const useRaw = pageData?.rawOcrHeaders && pageData.rawOcrHeaders.length > 0;
    const rawHeaders = useRaw
      ? [...pageData!.rawOcrHeaders!]
      : (pageData?.headers && pageData.headers.length > 0
          ? [...pageData.headers]
          : ["(원본 헤더 없음)"]);
    const sampleRows = useRaw
      ? (pageData!.rawOcrSample ?? [])
      : (pageData?.rows ? pageData.rows.slice(0, 5) : []);
    const rawSampleForDetect = undefined;  // sampleRows 가 이미 raw 라 별도 소스 불필요
    // 공급사 fallback 체인
    const gs = pages.map(p => p.meta.supplier).find(Boolean) ?? null;
    const supplier = rawSupplierByPage[pageNum] ?? pageData?.meta?.supplier ?? gs ?? "";
    console.log(`[컬럼매핑] 모달 열기 · page=${pageNum} · supplier="${supplier}" · headers=`, rawHeaders);
    setMappingModal({ pageNum, supplier, rawHeaders, sampleRows, rawSampleForDetect });
    setMappingSelection(rawHeaders.map(h => {
      if (MAPPING_FIELD_OPTIONS.includes(h)) return h;
      return "제외";
    }));
  }, [structuredPages, rawSupplierByPage, pages]);
  const saveMappingTemplate = useCallback(async () => {
    if (!mappingModal || !mappingModal.supplier) return;
    setMappingSaving(true);
    try {
      // "제외"는 매핑에서 빈 문자열로 유지 (인덱스는 원본 컬럼 순서와 대응)
      // 서버는 mappingSelection[origIdx] === "제외" 이면 해당 컬럼 제거하고 나머지를 순서대로 사용
      const positionalHeaders = mappingSelection.map(f => (!f || f === "제외") ? "" : f);
      const nonEmptyHeaders = positionalHeaders.filter(Boolean);
      // 1) DB 저장 · 표준 필드명 리스트 + 원본 위치 매핑 함께
      const res = await fetch("/api/ocr-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_name: mappingModal.supplier,
          headers: nonEmptyHeaders,             // ["품명","규격","수량","단가","금액",...]
          column_mapping: positionalHeaders,    // 원본 컬럼 순서 유지 · "" = 제외
        }),
      });
      if (res.ok) {
        setMappingSaved(prev => new Set([...prev, mappingModal.supplier]));
        // 2) 현재 페이지 즉시 재파싱 (템플릿 적용된 결과로 표 업데이트)
        if (onReparsePage) {
          try {
            setReparseStatus(prev => ({ ...prev, [mappingModal.pageNum]: 'loading' }));
            setReparseSupplier(prev => ({ ...prev, [mappingModal.pageNum]: mappingModal.supplier }));
            await onReparsePage(mappingModal.pageNum, mappingModal.supplier);
            setReparseStatus(prev => ({ ...prev, [mappingModal.pageNum]: 'saved' }));
          } catch {
            setReparseStatus(prev => ({ ...prev, [mappingModal.pageNum]: 'error' }));
          }
        }
        setTimeout(() => setMappingModal(null), 800);
      }
    } finally {
      setMappingSaving(false);
    }
  }, [mappingModal, mappingSelection, onReparsePage]);
  // "🗑 선택 삭제" 버튼: 삭제 함수는 effectiveDispRows/makeRowSignature 선언 뒤에 정의됨 (아래)
  const commitRawRowsDeletionRef = useRef<() => void>(() => {});
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
  // 공급사 잔고 재추출 회전 인덱스 (페이지별)
  const [balanceReextractCycle, setBalanceReextractCycle] = useState<Record<number, number>>({});
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
    fetch("/api/ocr-deleted-rows")
      .then(r => r.json())
      .then((data: any) => {
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
  const revertSingleRawRow = useCallback((ri: number) => {
    // 편집·보정·삭제 상태 초기화 (원본 복원부터)
    setCellEdits(prev => {
      if (prev[ri] === undefined) return prev;
      const next = { ...prev };
      delete next[ri];
      return next;
    });
    setAmountCorrections(prev => {
      if (prev[ri] === undefined) return prev;
      const next = { ...prev };
      delete next[ri];
      return next;
    });
    setPermanentlyDeletedRawRows(prev => {
      if (!prev.has(ri)) return prev;
      const n = new Set(prev);
      n.delete(ri);
      return n;
    });
    setHiddenRawRows(prev => {
      if (!prev.has(ri)) return prev;
      const n = new Set(prev);
      n.delete(ri);
      return n;
    });

    const nextCycle = ((reextractCycle[ri] ?? 0) + 1) % 7;
    setReextractCycle(prev => ({ ...prev, [ri]: nextCycle }));

    if (nextCycle === 0) return; // 원본으로

    const qtyIdx = dispHeaders.indexOf("수량");
    const priIdx = dispHeaders.indexOf("단가");
    if (qtyIdx < 0 || priIdx < 0 || amtIdx < 0) return;

    const dispRow = dispRows[ri];
    if (!Array.isArray(dispRow)) return;
    // masterH 기준 원본 aligned 행 (표시 안 되는 셀도 포함 · numeric 후보 소스)
    const fullRow = rawRows[ri];

    const q = parseNumber(dispRow[qtyIdx]);
    const p = parseNumber(dispRow[priIdx]);
    const a = parseNumber(dispRow[amtIdx]);
    const editsForRow: Record<number, number | null> = {};

    // 자기 행 numeric 후보
    const collectCandidates = (): number[] => {
      const set = new Set<number>();
      for (const v of fullRow ?? []) {
        const n = parseNumber(v);
        if (n > 0 && n < 999_999_999) set.add(n);
      }
      for (const v of dispRow) {
        const n = parseNumber(v);
        if (n > 0 && n < 999_999_999) set.add(n);
      }
      return [...set].sort((a, b) => a - b);
    };

    // 인접 행(위/아래) numeric 후보 · 같은 페이지 내에서만
    //   effectiveDispRows 는 이 함수 선언 뒤에 정의되지만 실행 시점엔 존재 → ref 로 우회
    const collectNeighborCandidates = (): number[] => {
      const set = new Set<number>();
      const currentPn = pageNums[ri];
      const effRows = effectiveDispRowsRef.current;
      const rowsLen = effRows.length;
      const collectFromRow = (targetRi: number) => {
        if (targetRi < 0 || targetRi >= rowsLen) return;
        if (pageNums[targetRi] !== currentPn) return;
        const eRow = effRows[targetRi];
        if (Array.isArray(eRow)) {
          for (const v of eRow) {
            const n = parseNumber(v);
            if (n > 0 && n < 999_999_999) set.add(n);
          }
        }
        const rawR = rawRows[targetRi];
        if (Array.isArray(rawR)) {
          for (const v of rawR) {
            const n = parseNumber(v);
            if (n > 0 && n < 999_999_999) set.add(n);
          }
        }
      };
      collectFromRow(ri - 1);
      collectFromRow(ri + 1);
      [q, p, a].forEach(v => { if (v > 0) set.delete(v); });
      return [...set].sort((a, b) => a - b);
    };

    // 유효 셀 분류 (자기 값이 있는 셀 vs 비어있는 셀)
    const emptyTargets: number[] = [];
    if (q <= 0) emptyTargets.push(qtyIdx);
    if (p <= 0) emptyTargets.push(priIdx);
    if (a <= 0) emptyTargets.push(amtIdx);
    // 크기 기반 할당 헬퍼 (재사용)
    const assignByMagnitude = (targetIdx: number, unusedPool: number[]): number | null => {
      if (unusedPool.length === 0) return null;
      let pick: number;
      if (targetIdx === qtyIdx) {
        pick = unusedPool.find(v => v < 1000) ?? unusedPool[0];
      } else if (targetIdx === priIdx) {
        pick = unusedPool.find(v => v >= 100 && v < 1_000_000) ?? unusedPool[0];
      } else {
        pick = unusedPool[unusedPool.length - 1];
      }
      const idx = unusedPool.indexOf(pick);
      if (idx >= 0) unusedPool.splice(idx, 1);
      return pick;
    };

    if (nextCycle === 1) {
      // 🎯 제일 먼저: 인접 행(위/아래) 후보로 empty 셀 채움 (품명 근처 숫자 우선)
      //    사용자 통찰: "재추출을 누르면 품명이 있는 행의 주변 숫자들을 읽어와"
      const neighborPool = collectNeighborCandidates();
      if (neighborPool.length === 0) {
        // 인접 후보 없으면 자기 행 후보로 fallback
        const candidates = collectCandidates();
        const used = new Set<number>([q, p, a].filter(v => v > 0));
        const unused = candidates.filter(c => !used.has(c));
        for (const targetIdx of emptyTargets) {
          const pick = assignByMagnitude(targetIdx, unused);
          if (pick != null) editsForRow[targetIdx] = pick;
        }
      } else {
        const pool = [...neighborPool];
        for (const targetIdx of emptyTargets) {
          const pick = assignByMagnitude(targetIdx, pool);
          if (pick != null) editsForRow[targetIdx] = pick;
        }
        if (emptyTargets.length === 0) {
          const sortedDesc = [...pool].reverse();
          if (sortedDesc.length >= 1 && a > 0) editsForRow[amtIdx] = sortedDesc[0];
          if (sortedDesc.length >= 2 && p > 0) editsForRow[priIdx] = sortedDesc[1];
          if (sortedDesc.length >= 3 && q > 0) editsForRow[qtyIdx] = sortedDesc[2];
        }
      }
    } else if (nextCycle === 2) {
      // 자기 + 인접 후보 통합 · 3자리 최적 매그니튜드 배치
      const merged = new Set<number>([...collectCandidates(), ...collectNeighborCandidates()]);
      const all = [...merged].sort((a, b) => a - b);
      if (all.length >= 3) {
        const sortedDesc = [...all].reverse();
        editsForRow[amtIdx] = sortedDesc[0];
        editsForRow[priIdx] = sortedDesc[1];
        editsForRow[qtyIdx] = sortedDesc[2];
      } else if (all.length === 2) {
        editsForRow[amtIdx] = all[1];
        editsForRow[priIdx] = all[0];
      }
    } else if (nextCycle === 3) {
      // 수량 ↔ 단가 스왑
      if (p > 0) editsForRow[qtyIdx] = p;
      if (q > 0) editsForRow[priIdx] = q;
    } else if (nextCycle === 4) {
      // 단가 ↔ 금액 스왑
      if (a > 0) editsForRow[priIdx] = a;
      if (p > 0) editsForRow[amtIdx] = p;
    } else if (nextCycle === 5) {
      // 자기 행 후보로 empty 셀 채움
      const candidates = collectCandidates();
      const used = new Set<number>([q, p, a].filter(v => v > 0));
      const unused = candidates.filter(c => !used.has(c));
      for (const targetIdx of emptyTargets) {
        const pick = assignByMagnitude(targetIdx, unused);
        if (pick != null) editsForRow[targetIdx] = pick;
      }
    } else if (nextCycle === 6) {
      // 자기 행 후보 3개 이상이면 매그니튜드로 3자리 재배치
      const candidates = collectCandidates();
      if (candidates.length >= 3) {
        const sortedDesc = [...candidates].reverse();
        editsForRow[amtIdx] = sortedDesc[0];
        editsForRow[priIdx] = sortedDesc[1];
        editsForRow[qtyIdx] = sortedDesc[2];
      } else if (candidates.length === 2) {
        editsForRow[amtIdx] = candidates[1];
        editsForRow[priIdx] = candidates[0];
      }
    }

    if (Object.keys(editsForRow).length > 0) {
      setCellEdits(prev => ({ ...prev, [ri]: editsForRow }));
    }
  }, [reextractCycle, dispHeaders, dispRows, rawRows, amtIdx, pageNums]);
  // effectiveDispRows 참조용 ref (revertSingleRawRow 가 자기보다 뒤에 선언된 값 접근용)
  const effectiveDispRowsRef = useRef<(string | number | null)[][]>([]);

  // ── Feature 2: 공급사 변경 시 동의어 일괄 추가 ───────────────────────────
  const [addSynonymsOnChange, setAddSynonymsOnChange] = useState(true);
  const [synonymAddStatus, setSynonymAddStatus] = useState<{ pageNum: number; status: 'loading' | 'done' | 'error'; count: number } | null>(null);

  // ── 공급처 변경 재파싱 + 템플릿 저장 ──────────────────────────────────────
  type ReparseStatus = 'loading' | 'done' | 'error' | 'saved';
  const [reparseStatus,   setReparseStatus  ] = useState<Record<number, ReparseStatus>>({});
  const [reparseSupplier, setReparseSupplier] = useState<Record<number, string>>({});

  // ── Feature 3: OCR 추출 후 자동 동의어 1차 보정 ──────────────────────────
  const [autoSynonymMatches, setAutoSynonymMatches] = useState<Record<number, { code: string; name: string }>>({});
  const [autoSynonymLoading, setAutoSynonymLoading] = useState(false);
  const [barcodeAutoMap, setBarcodeAutoMap] = useState<Record<number, CandidateInfo>>({});

  // effectiveDispRows: 자동보정 + 셀 인라인 편집 결과를 반영한 행 (cellEdits 우선)
  // + 2026-07-10: 금액 null · 수량·단가 있으면 자동 계산값 표시 (수량 × 단가 = 금액)
  const _qtyIdxForAuto = dispHeaders.indexOf("수량");
  const _priIdxForAuto = dispHeaders.indexOf("단가");
  const effectiveDispRows = dispRows.map((row, ri) => {
    const hasAmtCorr = amtIdx >= 0 && amountCorrections[ri] !== undefined;
    const edits = cellEdits[ri];
    const nr = [...row];
    if (hasAmtCorr) nr[amtIdx] = amountCorrections[ri];
    if (edits) for (const [ciStr, val] of Object.entries(edits)) nr[Number(ciStr)] = val as string | number;
    // 금액이 여전히 비어있고 수량·단가 모두 있으면 자동 계산해 채움 (표시용)
    if (amtIdx >= 0 && _qtyIdxForAuto >= 0 && _priIdxForAuto >= 0) {
      const rawAmt = parseNumber(nr[amtIdx]);
      if (rawAmt <= 0) {
        const q = parseNumber(nr[_qtyIdxForAuto]);
        const p = parseNumber(nr[_priIdxForAuto]);
        if (q > 0 && p > 0) nr[amtIdx] = Math.round(q * p);
      }
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

  // 실제 "🗑 선택 삭제" 로직 (effectiveDispRows/makeRowSignature 참조를 위해 여기서 세팅)
  //   → 체크된 여러 행을 한 번의 확인 다이얼로그로 일괄 완전삭제 + DB 서명 저장
  commitRawRowsDeletionRef.current = () => {
    if (hiddenRawRows.size === 0) return;
    const cnt = hiddenRawRows.size;
    if (!window.confirm(`체크된 ${cnt}개 행을 완전히 삭제하시겠습니까?\n· DB에 서명이 저장되어 다음 스캔에도 자동 필터됩니다.`)) return;
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
      fetch("/api/ocr-deleted-rows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      }).catch(() => {});
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
      if (q > 0 && p > 0) return Math.round(q * p);
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

  // 페이지의 에누리/차액 금액 감지 (summary_rows에서 라벨 매칭)
  const getPageDiscount = (pn: number): { amount: number; label: string } | null => {
    const pageData = structuredPages.find(p => p.page === pn);
    const summary = pageData?.meta?.summary_rows ?? [];
    // "에누리액", "에누리", "할인액", "할인", "차액", "차감" 등 라벨 매칭
    const discRe = /에누리|할인|차액|차감|DC|D\.C/i;
    const hit = summary.find(s => {
      const norm = String(s.label ?? "").replace(/\s+/g, "");
      return discRe.test(norm);
    });
    if (hit && Math.abs(hit.amount) > 0) {
      return { amount: Math.abs(hit.amount), label: String(hit.label ?? "에누리").trim() };
    }
    return null;
  };

  // 페이지의 소계 계산
  // - 기본: 명세서의 합계(stated) 반영
  // - 에누리/차액이 있으면: stated + 에누리 (에누리 적용 전 금액)
  // - 사용자가 직접 입력했으면 그 값 우선
  // - 🔔 사용자가 체크박스로 행을 제외/DB 삭제행 있으면 computed 우선 (2026-07-10)
  const getPageDisplayTotal = (pn: number): number => {
    const stated = structuredPages.find(p => p.page === pn)?.meta?.total;
    const computed = effectivePageTotals.get(pn) ?? 0;

    // 1) 사용자 직접 입력
    if (pageSubtotalChoices[pn] === "custom") {
      return pageSubtotalCustom[pn] ?? stated ?? computed;
    }

    // 2) 이 페이지에 사용자가 제외한 행이 있으면 → 계산된 값을 우선 사용 (실시간 반영)
    const pageHasExclusion = effectiveDispRows.some((_, ri) =>
      pageNums[ri] === pn && (hiddenRawRows.has(ri) || permanentlyDeletedRawRows.has(ri) || isRowDbDeleted(ri))
    );
    if (pageHasExclusion) return computed;

    // 3) 명세서 합계 기본값
    const base = stated ?? computed;
    if (base <= 0) return computed;

    // 4) 에누리/차액이 있으면 그 금액 만큼 되돌린 값 (에누리 적용 전)
    const disc = getPageDiscount(pn);
    if (disc) return base + disc.amount;

    // 5) 명세서 합계 그대로
    return base;
  };

  const total = amtIdx >= 0
    ? effectiveDispRows.reduce((s, r) => s + parseNumber(r[amtIdx]), 0)
    : 0;

  const meta = pages.map(p => p.meta).find(m => m.date || m.supplier) ?? {};

  const balanceConfig: Record<string, string> = balanceConfigProp ?? {};

  // ── 이미지(페이지)별 합계 (원본, mismatch 감지용) ─────────────────────────
  const pageTotals = new Map<number, number>();
  if (amtIdx >= 0) {
    dispRows.forEach((row, ri) => {
      const pn = pageNums[ri];
      pageTotals.set(pn, (pageTotals.get(pn) ?? 0) + parseNumber(row[amtIdx]));
    });
  }
  const uniquePageNums = [...new Set(pageNums)].sort((a, b) => a - b);

  // 페이지별 잔고 후보 — 요약 행/헤더/공급사설정 모두 감지
  // 하드코딩 없이 요약 행 패턴을 자동 감지:
  //   - 요약 성격의 한국어 문자 세트(합·계·잔·총·미·공·부·매·입·급) 중 하나 이상 포함 = 라벨 후보
  //   - 이 라벨과 같은 행에 금액이 있으면 후보로 저장
  //   - 라벨 문자열 자체(그대로)를 후보의 label로 사용 → OCR이 뽑은 원문 그대로 반영
  const normalizeLabelStr = (s: string): string => s.replace(/[\s.·:/\\-]+/g, "");
  // 요약 성격의 한글자 패턴 (금액 요약 라벨에서 흔히 나타나는 글자들)
  const SUMMARY_CHAR = /[합계잔총미공부매입급액]/;
  const isSummaryLabel = (s: string): boolean => {
    if (!s) return false;
    const norm = normalizeLabelStr(s);
    // 숫자만 있으면 라벨 아님
    if (!/[가-힣]/.test(norm)) return false;
    // 너무 긴 문자열(문장)은 라벨 아님
    if (norm.length > 10) return false;
    // 요약 문자 세트 포함 + 순수 한글자 위주
    if (!SUMMARY_CHAR.test(norm)) return false;
    return true;
  };
  // DB에 이미 지정된 balance_field 값들(사용자가 확정한 실제 라벨) — 우선 인식
  const learnedLabels: Set<string> = new Set(
    Object.values(balanceConfig ?? {})
      .filter(v => typeof v === "string" && v.trim() && v !== "(없음)" && v !== "직접입력")
      .map(v => normalizeLabelStr(String(v)))
  );
  const findKeyword = (s: string): string | null => {
    const norm = normalizeLabelStr(s);
    if (!norm) return null;
    // 1) DB에 학습된 라벨과 완전/부분 일치하면 그대로 사용
    for (const lk of learnedLabels) if (lk && norm.includes(lk)) return lk;
    // 2) 요약 문자 세트 기반 자동 감지
    if (isSummaryLabel(s)) return norm;
    return null;
  };
  const pageBalanceCandidates = new Map<number, { label: string; amount: number }[]>();
  for (const pn of uniquePageNums) {
    const pageData = structuredPages.find(p => p.page === pn);
    if (!pageData) continue;
    const seen = new Set<number>();
    const result: { label: string; amount: number }[] = [];

    const pushCand = (label: string, amount: number) => {
      if (amount <= 0 || seen.has(amount)) return;
      seen.add(amount);
      result.push({ label, amount });
    };

    // 1) 요약/합계/잔고/잔액 라벨이 있는 행에서 라벨과 함께 금액 추출
    //    - 같은 셀 안에 여러 label+amount 쌍이 CSV로 있어도 (예: "합계, 1,900,000, 잔고, 500,000") 개별 파싱
    const NUM_RE = /(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;
    for (const row of pageData.rows) {
      if (!Array.isArray(row)) continue;
      const isSummaryRow = row.some(cell => cell != null && findKeyword(String(cell)) != null);
      if (!isSummaryRow) continue;
      let rowLabel = "";
      const rowNums: number[] = [];
      for (const cell of row) {
        if (cell == null) continue;
        // 1-a) 셀 안에서 여러 금액 추출 (콤마 포함 형식 지원)
        if (typeof cell === "string") {
          // 1-b) 셀 내부 label...amount 쌍 스캔 (예: "합계액 1,900,000")
          const kwInCell = findKeyword(cell);
          const matches = Array.from(cell.matchAll(NUM_RE));
          if (kwInCell && matches.length > 0) {
            for (const m of matches) {
              const n = parseFloat(m[0].replace(/,/g, ""));
              if (n > 0) pushCand(kwInCell, n);
            }
          }
          // 1-c) label만 있고 amount는 다른 셀에 있는 경우 대비 (rowLabel 저장)
          if (kwInCell && cell.length <= 25) rowLabel = kwInCell;
          // 1-d) 라벨 없는 셀에서도 amount 후보 저장 (같은 행의 라벨과 매칭)
          for (const m of matches) {
            const n = parseFloat(m[0].replace(/,/g, ""));
            if (n > 0) rowNums.push(n);
          }
        } else if (typeof cell === "number") {
          if (cell > 0) rowNums.push(cell);
        }
      }
      // 라벨이 확인되면 이 행의 모든 숫자에 그 라벨 부여
      for (const n of rowNums) pushCand(rowLabel || "합계", n);
    }

    // 2) 명세서 메타 total (해당 페이지 총합)
    if (pageData.meta?.total && pageData.meta.total > 0) pushCand("총합계", pageData.meta.total);

    // 2-b) meta.summary_rows — Gemini가 별도로 반환한 요약 행들 (합계액/에누리액/총합계액/공급가액/부가세 등)
    //      OCR이 rows에서 제외한 요약 데이터의 정본
    if (Array.isArray(pageData.meta?.summary_rows)) {
      for (const sr of pageData.meta!.summary_rows!) {
        if (sr && typeof sr.amount === "number" && sr.amount > 0) {
          const lbl = normalizeLabelStr(String(sr.label ?? ""));
          if (lbl) pushCand(lbl, sr.amount);
        }
      }
    }

    // 3) 헤더 자체가 잔고 관련 키워드(합계액/총합계/잔고 등)인 경우 → 해당 컬럼의 마지막 유효값
    if (Array.isArray(pageData.headers)) {
      for (let ci = 0; ci < pageData.headers.length; ci++) {
        const kw = findKeyword(String(pageData.headers[ci] ?? ""));
        if (!kw) continue;
        let lastVal: number | null = null;
        for (const row of pageData.rows) {
          if (!Array.isArray(row)) continue;
          const v = row[ci];
          if (v == null) continue;
          const n = typeof v === "number" ? v : parseNumber(v);
          if (n > 0) lastVal = n;
        }
        if (lastVal != null) pushCand(kw, lastVal);
      }
    }

    // 4) 요약 라벨이 있는 셀 옆에(같은 행 뿐 아니라) 인접 행/셀도 스캔 (라벨이 별도 셀에 있는 경우)
    for (let ri = 0; ri < pageData.rows.length; ri++) {
      const row = pageData.rows[ri];
      if (!Array.isArray(row)) continue;
      for (let ci = 0; ci < row.length; ci++) {
        const cell = row[ci];
        if (typeof cell !== "string") continue;
        const kw = findKeyword(cell);
        if (!kw || cell.length > 20) continue;
        // 같은 행의 뒤 셀들 스캔
        for (let cj = ci + 1; cj < row.length; cj++) {
          const v = row[cj];
          if (v == null) continue;
          const n = typeof v === "number" ? v : parseNumber(v);
          if (n > 0) { pushCand(kw, n); break; }
        }
        // 아래 행 같은 컬럼도 시도
        const belowRow = pageData.rows[ri + 1];
        if (Array.isArray(belowRow)) {
          const v = belowRow[ci];
          if (v != null) {
            const n = typeof v === "number" ? v : parseNumber(v);
            if (n > 0) pushCand(kw, n);
          }
        }
      }
    }

    if (result.length > 0) pageBalanceCandidates.set(pn, result);
    // formula 계산용 label→amount 맵
    const labelMap = new Map<string, number>();
    for (const c of result) { if (!labelMap.has(c.label)) labelMap.set(c.label, c.amount); }
    pageBalanceCandidatesForFormula.set(pn, labelMap);

    // ── 진단 로그: 잔고 후보가 없으면 왜 없는지 표시 ───────────────
    // eslint-disable-next-line no-console
    if (typeof window !== "undefined" && (window as any).__OCR_BAL_DEBUG !== false) {
      // eslint-disable-next-line no-console
      console.groupCollapsed(`[잔고진단] page ${pn} (공급사="${pageData.meta?.supplier ?? ""}") → 후보 ${result.length}건`);
      // eslint-disable-next-line no-console
      console.log("headers:", pageData.headers);
      // eslint-disable-next-line no-console
      console.log("meta:", pageData.meta);
      // 잔고 관련 후보군이 될 만한 셀 스캔 결과 요약
      const scan: Array<{ where: string; label: string; amount?: number; cell?: unknown; row?: unknown[] }> = [];
      // 헤더 스캔
      (pageData.headers ?? []).forEach((h, hi) => {
        const kw = findKeyword(String(h ?? ""));
        if (kw) scan.push({ where: `헤더[${hi}]`, label: `${h} → ${kw}` });
      });
      // 행 스캔
      (pageData.rows ?? []).forEach((r, ri) => {
        if (!Array.isArray(r)) return;
        r.forEach((c, ci) => {
          if (typeof c !== "string") return;
          const kw = findKeyword(c);
          if (kw) scan.push({ where: `행[${ri}][${ci}]`, label: `"${c}" → ${kw}`, cell: c, row: r });
        });
      });
      // eslint-disable-next-line no-console
      console.log("잔고 키워드 스캔:", scan);
      // eslint-disable-next-line no-console
      console.log("최종 후보:", result);
      // eslint-disable-next-line no-console
      console.groupEnd();
    }
  }

  // balanceConfig에 지정된 컬럼의 마지막 유효값 = 잔고
  const pageBalanceFromConfig = new Map<number, number>();
  for (const pn of uniquePageNums) {
    const pageData = structuredPages.find(p => p.page === pn);
    if (!pageData) continue;
    const pageSupplier = (rawSupplierByPage[pn] ?? pageData.meta.supplier ?? "").trim();
    const configuredLabel = pageSupplier ? balanceConfig[pageSupplier] : undefined;
    if (!configuredLabel || configuredLabel === "(없음)") continue;
    const colIdx = pageData.headers.indexOf(configuredLabel);
    if (colIdx < 0) continue;
    let lastVal: number | null = null;
    for (const row of pageData.rows) {
      if (!Array.isArray(row)) continue;
      const v = row[colIdx];
      if (v != null) {
        const n = typeof v === "number" ? v : parseNumber(v as any);
        if (n > 0) lastVal = n;
      }
    }
    if (lastVal != null) pageBalanceFromConfig.set(pn, lastVal);
  }

  // 공급사별 OCR 잔고 합산
  const supplierOcrBalance = new Map<string, number>();
  for (const [pn, balance] of pageBalanceFromConfig) {
    const pageData = structuredPages.find(p => p.page === pn);
    const pageSupplier = (rawSupplierByPage[pn] ?? pageData?.meta.supplier ?? "").trim() || "미상";
    supplierOcrBalance.set(pageSupplier, (supplierOcrBalance.get(pageSupplier) ?? 0) + balance);
  }

  // ── 공급처별 합계 — 명세서 소계(getPageDisplayTotal) 기준 ───────────────
  const supplierTotals: { supplier: string; total: number; count: number }[] = amtIdx >= 0
    ? (() => {
        const map = new Map<string, { total: number; count: number }>();
        for (const pn of uniquePageNums) {
          const supp = (
            rawSupplierByPage[pn] !== undefined
              ? rawSupplierByPage[pn]
              : (structuredPages.find(p => p.page === pn)?.meta.supplier ?? "미상")
          ).trim() || "미상";
          const subtotal = getPageDisplayTotal(pn);
          const prev = map.get(supp) ?? { total: 0, count: 0 };
          map.set(supp, { total: prev.total + subtotal, count: prev.count + 1 });
        }
        return [...map.entries()].map(([supplier, v]) => ({ supplier, ...v }));
      })()
    : [];

  // ── 명세서 소계 불일치 감지 (원본 기준) ──────────────────────────────────
  // 페이지별 "수량×단가 ≠ 금액" 불일치 카운트 (에누리액 있으면 할인으로 반영 후 비교)
  const _qtyIdxEarly = dispHeaders.indexOf("수량");
  const _priIdxEarly = dispHeaders.indexOf("단가");
  const _discountIdxEarly = (() => {
    // "에누리액", "에누리", "할인액", "할인" 등 (공백 허용)
    for (const h of dispHeaders) {
      const norm = String(h).replace(/\s+/g, "");
      if (/에누리|할인|디씨|D\.?C/i.test(norm)) return dispHeaders.indexOf(h);
    }
    return -1;
  })();
  // 교차검증 1단계 · 행별 수량×단가 ≠ 금액 카운트 (숨김/삭제 행 제외)
  const pageQtyPriceAmtMismatch = new Map<number, number>();
  if (_qtyIdxEarly >= 0 && _priIdxEarly >= 0 && amtIdx >= 0) {
    effectiveDispRows.forEach((row, ri) => {
      if (isRowDeleted(ri)) return;
      const qty = parseNumber(row[_qtyIdxEarly]);
      const pri = parseNumber(row[_priIdxEarly]);
      const amt = parseNumber(row[amtIdx]);
      const disc = _discountIdxEarly >= 0 ? parseNumber(row[_discountIdxEarly]) : 0;
      if (qty > 0 && pri > 0 && amt > 0) {
        const expected = Math.round(qty * pri) - Math.max(0, disc);
        if (Math.abs(expected - amt) > 1) {
          const pn = pageNums[ri];
          pageQtyPriceAmtMismatch.set(pn, (pageQtyPriceAmtMismatch.get(pn) ?? 0) + 1);
        }
      }
    });
  }

  const pageMismatches: { pageNum: number; computed: number; stated: number }[] = [];
  if (amtIdx >= 0) {
    for (const pn of uniquePageNums) {
      const pageData = structuredPages.find(p => p.page === pn);
      const stated = pageData?.meta?.total;
      if (stated != null && stated > 0) {
        const computed = pageTotals.get(pn) ?? 0;
        if (Math.abs(stated - computed) > 1) {
          pageMismatches.push({ pageNum: pn, computed, stated });
        }
      }
    }
  }

  // 보정 후 아직 불일치인 페이지
  const isPageResolved = (pn: number) => {
    if (pageSubtotalChoices[pn]) return true;
    const stated = structuredPages.find(p => p.page === pn)?.meta?.total ?? 0;
    const effective = effectivePageTotals.get(pn) ?? 0;
    return stated > 0 && Math.abs(stated - effective) <= 1;
  };

  // "둘 다 아님" 드롭다운용 금액 후보 — 페이지의 OCR 행에서 큰 숫자들을 추출
  const pageAmountCandidates = new Map<number, number[]>();
  if (amtIdx >= 0) {
    for (const pn of uniquePageNums) {
      const pageData = structuredPages.find(p => p.page === pn);
      if (!pageData) continue;
      const seen = new Set<number>();
      const candidates: number[] = [];
      for (const row of pageData.rows) {
        if (!Array.isArray(row)) continue;
        for (const cell of row) {
          if (cell == null) continue;
          const n = typeof cell === "number" ? cell : parseNumber(cell);
          if (n >= 1000 && !seen.has(n)) { seen.add(n); candidates.push(n); }
        }
      }
      const stated = pageData.meta?.total;
      if (stated != null && stated >= 1000 && !seen.has(stated)) { seen.add(stated); candidates.push(stated); }
      const computed = pageTotals.get(pn) ?? 0;
      if (computed >= 1000 && !seen.has(computed)) candidates.push(computed);
      candidates.sort((a, b) => b - a);
      pageAmountCandidates.set(pn, candidates.slice(0, 10));
    }
  }

  // ── 이미지 모달 + 줌/패닝 ────────────────────────────────────────────────
  const [modalImg,   setModalImg  ] = useState<string | null>(null);
  const [modalPageNum, setModalPageNum] = useState<number | null>(null);
  const [modalLabel, setModalLabel] = useState("");
  const [zoom,       setZoom      ] = useState(1);
  const [pan,        setPan       ] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const viewportRef   = useRef<HTMLDivElement | null>(null);
  const dragRef       = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const zoomRef       = useRef(1);
  const panRef        = useRef({ x: 0, y: 0 });
  const wheelCleanRef = useRef<(() => void) | null>(null);

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current  = pan;  }, [pan]);

  // 콜백 ref: 뷰포트가 DOM에 마운트되는 순간 비수동 wheel 리스너 즉시 등록
  const viewportCbRef = useCallback((el: HTMLDivElement | null) => {
    if (wheelCleanRef.current) { wheelCleanRef.current(); wheelCleanRef.current = null; }
    viewportRef.current = el;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect  = el.getBoundingClientRect();
      const cx    = e.clientX - rect.left - rect.width  / 2;
      const cy    = e.clientY - rect.top  - rect.height / 2;
      const delta = e.deltaY < 0 ? 0.2 : -0.2;
      const newZ  = Math.min(6, Math.max(0.5, zoomRef.current + delta));
      const scale = newZ / zoomRef.current;
      const curP  = panRef.current;
      const newP  = { x: cx + (curP.x - cx) * scale, y: cy + (curP.y - cy) * scale };
      zoomRef.current = newZ; panRef.current = newP;
      setZoom(newZ); setPan(newP);
    };
    el.addEventListener("wheel", handler, { passive: false });
    wheelCleanRef.current = () => el.removeEventListener("wheel", handler);
  }, []);

  const closeModal = useCallback(() => {
    setModalImg(null); setModalPageNum(null); setZoom(1); setPan({ x: 0, y: 0 });
  }, []);

  const openModal = useCallback((rowIdx: number) => {
    if (!pageImages?.length) return;
    const pNum = Math.max(1, Math.min(pageNums[rowIdx] ?? 1, pageImages.length));
    const img  = pageImages[pNum - 1] ?? pageImages[0];
    const label = String(dispRows[rowIdx]?.[nameIdx] ?? "");
    if (img) { setModalImg(img); setModalLabel(label); setModalPageNum(pNum); setZoom(1); setPan({ x: 0, y: 0 }); }
  }, [pageImages, pageNums, dispRows, nameIdx]);

  const openPageModal = useCallback((pageNum: number) => {
    if (!pageImages?.length) return;
    const pNum = Math.max(1, Math.min(pageNum, pageImages.length));
    const img = pageImages[pNum - 1] ?? pageImages[0];
    if (img) { setModalImg(img); setModalLabel(`${pageNum}번 명세서`); setModalPageNum(pNum); setZoom(1); setPan({ x: 0, y: 0 }); }
  }, [pageImages]);

  // 명세서 모달 내 페이지 이동 (← 이전 · → 다음 · Enter 이동/현위치 유지 · +/- 줌 · Esc 닫기)
  const gotoModalPage = useCallback((next: number) => {
    if (!pageImages?.length) return;
    const bounded = Math.max(1, Math.min(next, pageImages.length));
    const img = pageImages[bounded - 1];
    if (!img) return;
    setModalImg(img);
    setModalLabel(`${bounded}번 명세서`);
    setModalPageNum(bounded);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [pageImages]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    setPan({ x: dragRef.current.px + e.clientX - dragRef.current.sx,
             y: dragRef.current.py + e.clientY - dragRef.current.sy });
  };
  const onMouseUp = () => { setIsDragging(false); dragRef.current = null; };
  const onDblClick = (e: React.MouseEvent) => {
    const el = viewportRef.current; if (!el) return;
    if (zoom > 1) { setZoom(1); setPan({ x: 0, y: 0 }); }
    else {
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top  - rect.height / 2;
      const newZ = 2.5; const scale = newZ / zoom;
      setPan({ x: cx + (pan.x - cx) * scale, y: cy + (pan.y - cy) * scale });
      setZoom(newZ);
    }
  };

  // ── 상품명 보정 ──────────────────────────────────────────────────────────
  const [matching,         setMatching        ] = useState(false);
  const [matchItems,       setMatchItems      ] = useState<MatchedItem[] | null>(null);
  // matchItems가 준비되면 products-map을 한 번 로드해서 code → current_stock 매핑 생성
  useEffect(() => {
    if (!matchItems || matchItems.length === 0) return;
    if (erpStockLoaded) return;
    (async () => {
      try {
        const res = await fetch("/api/products-map");
        if (!res.ok) return;
        const data = await res.json();
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
      // cancel-by-name 사용: 삭제 대신 cancelled=true 마킹 → 동의어 관리에서 관리 가능, 재적용 방지
      await fetch("/api/ocr-synonyms/cancel-by-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prod_name_old: name, product_code: productCode ?? null }),
      });
    } catch (e) {
      console.warn("[ocr-synonyms/cancel-by-name] 취소 오류:", e);
    }
  }, []);

  const ocrQtyIdx  = dispHeaders.indexOf("수량");
  const ocrPriIdx  = dispHeaders.indexOf("단가");
  const ocrSpecIdx = dispHeaders.indexOf("규격");
  const ocrSuppIdx = dispHeaders.indexOf("공급처");
  const globalSupplier = pages.map(p => p.meta.supplier).find(Boolean) ?? null;

  // ── Feature 1: 금액 자동보정 콜백 ────────────────────────────────────────
  const autoCorrectAmounts = useCallback((pageNum: number) => {
    if (ocrQtyIdx < 0 || ocrPriIdx < 0 || amtIdx < 0) return;
    const corrections: Record<number, number> = {};
    dispRows.forEach((row, ri) => {
      if (pageNums[ri] !== pageNum) return;
      const qty = parseNumber(row[ocrQtyIdx]);
      const pri = parseNumber(row[ocrPriIdx]);
      const amt = parseNumber(row[amtIdx]);
      if (qty > 0 && pri > 0) {
        const expected = Math.round(qty * pri);
        if (Math.abs(expected - amt) > 1) {
          corrections[ri] = expected;
        }
      }
    });
    if (Object.keys(corrections).length > 0) {
      setAmountCorrections(prev => ({ ...prev, ...corrections }));
    }
  }, [ocrQtyIdx, ocrPriIdx, amtIdx, dispRows, pageNums]);

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
      const res = await fetch("/api/ocr-match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: entries.map(e => e.name), suppliers: entries.map(() => newSupplier) }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const matches: MatchedItem[] = data.matches ?? [];
      let count = 0;
      for (let i = 0; i < entries.length; i++) {
        const m = matches[i]?.matched;
        if (!m) continue;
        const sr = await fetch("/api/ocr-synonyms", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prod_name_old: entries[i].name, prod_name_new: m.name, product_code: m.code, supplier_new: newSupplier }),
        });
        if (sr.ok) count++;
      }
      setSynonymAddStatus({ pageNum, status: count > 0 ? 'done' : 'error', count });
    } catch {
      setSynonymAddStatus({ pageNum, status: 'error', count: 0 });
    }
  }, [nameIdx, pageNums, dispRows]);

  // ── 바코드 DB 매칭 결과를 행에 자동 바인딩 ─────────────────────────────
  useEffect(() => {
    if (!barcodeMatches?.length || nameIdx < 0) { setBarcodeAutoMap({}); return; }
    const normName = (s: string) => s.toLowerCase().replace(/[\s\-\(\)·]/g, "");
    const result: Record<number, CandidateInfo> = {};
    dispRows.forEach((row, ri) => {
      if (result[ri]) return;
      const rowName = normName(String(row[nameIdx] ?? ""));
      if (!rowName || rowName.length < 2) return;
      for (const bc of barcodeMatches) {
        const bcName = normName(bc.name);
        if (!bcName) continue;
        const shorter = rowName.length < bcName.length ? rowName : bcName;
        const longer  = rowName.length < bcName.length ? bcName  : rowName;
        if (shorter.length >= 4 && longer.includes(shorter)) {
          result[ri] = {
            code: bc.code, name: bc.name, spec: bc.spec ?? "", score: 100,
            masterPrice: bc.masterPrice, salePrice: bc.salePrice,
            profitRate: bc.profitRate, expiryDate: bc.expiryDate,
            supplier: bc.supplier,
          };
          break;
        }
      }
    });
    setBarcodeAutoMap(result);
  }, [barcodeMatches, dispRows, nameIdx]);

  // ── Feature 3: OCR 추출 후 동의어 사전 1차 자동보정 ─────────────────────
  useEffect(() => {
    if (!pages?.length) { setAutoSynonymMatches({}); return; }

    // pages에서 직접 이름/공급처 추출 (dispRows 의존성 없이)
    const structPages = pages.filter(p =>
      !(p.headers.length <= 1 && (p.headers[0] === "원문 텍스트" || p.headers[0] === "원문 응답"))
      && Array.isArray(p.rows)
    );
    if (structPages.length === 0) return;
    const mHeaders = buildMasterHeaders(structPages);
    const localNameIdx = mHeaders.indexOf("품명");
    const localSuppIdx = mHeaders.indexOf("공급처");
    if (localNameIdx < 0) return;

    const localRows: { name: string; supplier: string }[] = structPages.flatMap(p =>
      p.rows.filter(row => Array.isArray(row)).map(row => {
        const nameI = p.headers.indexOf("품명");
        const suppMeta = p.meta.supplier ?? "";
        const name = nameI >= 0 ? String(row[nameI] ?? "").trim() : "";
        let supplier = suppMeta;
        if (localSuppIdx >= 0) {
          const colVal = String(row[localSuppIdx] ?? "").trim();
          if (colVal) supplier = colVal;
        }
        return { name, supplier };
      })
    );

    const names = localRows.map(r => r.name);
    const suppliers = localRows.map(r => r.supplier);
    if (names.every(n => !n)) return;

    setAutoSynonymLoading(true);
    setAutoSynonymMatches({});
    fetch("/api/ocr-match", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names, suppliers }),
    })
      .then(r => r.json())
      .then(data => {
        const matches: MatchedItem[] = data.matches ?? [];
        const result: Record<number, { code: string; name: string }> = {};
        matches.forEach((m, ri) => {
          if (m.matched && (m.matched.score ?? 0) === 100) {
            result[ri] = { code: m.matched.code, name: m.matched.name };
          }
        });
        setAutoSynonymMatches(result);
      })
      .catch(() => {})
      .finally(() => setAutoSynonymLoading(false));
  }, [pages]);

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
      const res = await fetch("/api/ocr-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_name: supplierName, headers: pageHdrs }),
      });
      if (!res.ok) throw new Error(await res.text());
      setReparseStatus(prev => ({ ...prev, [pageNum]: 'saved' }));
    } catch { /* silent */ }
    // 이 페이지 상품명을 해당 공급사의 동의어로 일괄 저장
    await handleSynonymBulkAdd(pageNum, supplierName);
  }, [structuredPages, handleSynonymBulkAdd]);

  const saveSynonym = useCallback(async (
    ri: number,
    nameOld: string,
    productCode: string,
    supplierNew?: string,
    nameNew?: string,
    supplierOld?: string,
  ) => {
    try {
      const res = await fetch("/api/ocr-synonyms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prod_name_old: nameOld,
          prod_name_new: nameNew ?? null,
          product_code: productCode,
          supplier_new: supplierNew?.trim() || null,
          supplier_old: supplierOld?.trim() || null,
        }),
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        setSavedSynonyms(prev => new Set([...prev, ri]));
        if (json?.synonym?.id) setSavedSynonymIds(prev => ({ ...prev, [ri]: json.synonym.id }));
      } else {
        const err = await res.json().catch(() => ({}));
        console.warn("[ocr-synonyms] 저장 실패:", err?.error ?? res.status);
      }
    } catch (e) {
      console.warn("[ocr-synonyms] 네트워크 오류:", e);
    }
  }, []);

  const deleteSynonymForRow = useCallback(async (ri: number) => {
    const id = savedSynonymIds[ri];
    if (!id) return;
    try {
      await fetch(`/api/ocr-synonyms/${id}`, { method: "DELETE" });
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
      const res = await fetch("/api/ocr-supplier-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias, supplier_name: name }),
      });
      if (res.ok) {
        setSavedSupplierAliases(prev => new Set([...prev, ri]));
      } else {
        const err = await res.json().catch(() => ({}));
        console.warn("[ocr-supplier-aliases] 저장 실패:", err?.error ?? res.status);
      }
    } catch (e) {
      console.warn("[ocr-supplier-aliases] 네트워크 오류:", e);
    }
  }, []);

  const saveSupplierBalance = useCallback(async (supplierName: string, amount: number, invoiceDate: string | null) => {
    setSavingBalance(prev => ({ ...prev, [supplierName]: true }));
    try {
      const res = await fetch("/api/supplier-balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_name: supplierName, invoice_date: invoiceDate, balance: amount }),
      });
      const d = await res.json();
      if (d.balance) setSupplierBalanceRecords(prev => [d.balance, ...prev]);
    } catch { /* silent */ }
    finally { setSavingBalance(prev => ({ ...prev, [supplierName]: false })); }
  }, []);

  const commitCellEdit = useCallback((ri: number, ci: number, rawVal: string) => {
    const cleaned = rawVal.replace(/[^0-9.-]/g, "");
    const numVal = cleaned === "" ? null : (parseFloat(cleaned) || null);
    setCellEdits(prev => {
      const rowEdits = { ...(prev[ri] ?? {}) };
      rowEdits[ci] = numVal;
      if ((ci === ocrQtyIdx || ci === ocrPriIdx) && amtIdx >= 0 && ocrQtyIdx >= 0 && ocrPriIdx >= 0) {
        const qtyVal = ci === ocrQtyIdx ? (numVal ?? 0) : parseNumber(prev[ri]?.[ocrQtyIdx] ?? dispRows[ri]?.[ocrQtyIdx]);
        const priVal = ci === ocrPriIdx ? (numVal ?? 0) : parseNumber(prev[ri]?.[ocrPriIdx] ?? dispRows[ri]?.[ocrPriIdx]);
        if (qtyVal > 0 && priVal > 0) rowEdits[amtIdx] = Math.round(qtyVal * priVal);
      }
      return { ...prev, [ri]: rowEdits };
    });
    setEditingCell(null);
  }, [ocrQtyIdx, ocrPriIdx, amtIdx, dispRows]);

  const handleRetry = useCallback(async (ri: number, inputName: string, supplierHint?: string) => {
    if (retryingRows.has(ri)) return;
    if (openCandRow === ri) { setOpenCandRow(null); return; }
    setRetryingRows(prev => new Set([...prev, ri]));
    try {
      const res = await fetch("/api/ocr-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: inputName, topN: 10, supplier: supplierHint ?? "" }),
      });
      const data = await res.json();
      setCandidatesMap(prev => ({ ...prev, [ri]: data.candidates ?? [] }));
      setOpenCandRow(ri);
    } finally {
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
        const res = await fetch(`/api/products-search?${params}`);
        const data: any[] = await res.json();
        setNameSearchResults(prev => ({ ...prev, [ri]: Array.isArray(data) ? data : [] }));
        setNameSearchOpenRow(data.length > 0 ? ri : null);
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
  const handleSaveConfirmed = useCallback(async () => {
    if (!onSaveConfirmed || nameIdx < 0) return;
    const expiryIdx = dispHeaders.indexOf("유통기한");
    const items: ConfirmedItem[] = [];
    effectiveDispRows.forEach((row, ri) => {
      const pn = pageNums[ri];
      const pageData = structuredPages.find(p => p.page === pn);
      // 공급처
      const rowSupp = ocrSuppIdx >= 0 ? String(row[ocrSuppIdx] ?? "").trim() : "";
      const supplier = (
        rawSupplierByPage[pn] !== undefined ? rawSupplierByPage[pn] :
        supplierOverrides[ri] !== undefined ? supplierOverrides[ri] :
        rowSupp || pageData?.meta.supplier || globalSupplier || ""
      ).trim();
      // 품명 (매칭 우선, 취소 상태 반영)
      const origName = String(row[nameIdx] ?? "").trim();
      const m = matchItems ? (cancelledRows.has(ri) ? null : (selectedCands[ri] ?? matchItems[ri]?.matched ?? null)) : null;
      const autoSyn = cancelledAutoMap.has(ri) ? undefined : autoSynonymMatches[ri];
      const bc = cancelledAutoMap.has(ri) ? null : (barcodeAutoMap[ri] ?? null);
      const productName = (cancelledAutoSyn.has(ri) || cancelledAutoMap.has(ri))
        ? (overrides[ri] ?? origName)
        : (overrides[ri] ?? m?.name ?? autoSyn?.name ?? bc?.name ?? origName);
      if (!supplier || !productName) return;
      const productCode = m?.code ?? autoSyn?.code ?? bc?.code ?? undefined;
      // 수량/단가/금액 — 2차 보정(erpCellEdits) 우선 반영
      const numOrUndef = (n: number): number | undefined => Number.isFinite(n) && n !== 0 ? n : undefined;
      const erpEdits = erpCellEdits[ri];
      const qtyEditV = erpEdits?.["OCR수량"] ?? erpEdits?.["수량"];
      const priEditV = erpEdits?.["단가"];
      const amtEditV = erpEdits?.["금액"];
      const qty = qtyEditV !== undefined
        ? numOrUndef(parseNumber(qtyEditV))
        : (ocrQtyIdx >= 0 ? numOrUndef(parseNumber(row[ocrQtyIdx])) : undefined);
      const pri = priEditV !== undefined
        ? numOrUndef(parseNumber(priEditV))
        : (ocrPriIdx >= 0 ? numOrUndef(parseNumber(row[ocrPriIdx])) : undefined);
      let amt: number | undefined;
      if (amtEditV !== undefined) amt = numOrUndef(parseNumber(amtEditV));
      else if ((qtyEditV !== undefined || priEditV !== undefined) && qty && pri) amt = numOrUndef(Math.round(Number(qty) * Number(pri)));
      else amt = amtIdx >= 0 ? numOrUndef(parseNumber(row[amtIdx])) : undefined;
      // 유통기한 — erpCellEdits > OCR row > 매칭 정보
      const expiry = erpEdits?.["유통기한"] !== undefined
        ? String(erpEdits["유통기한"]).trim()
        : (expiryIdx >= 0 && row[expiryIdx] != null && String(row[expiryIdx]).trim()
            ? String(row[expiryIdx]).trim()
            : (m?.expiryDate ?? bc?.expiryDate ?? undefined));
      // 잔고 — 사용자 저장(pageSupplierBalances) > override > config 값
      const bal = pageSupplierBalances[pn] ?? pageBalanceOverride[pn] ?? pageBalanceFromConfig.get(pn);
      // raw
      const rawObj: Record<string, unknown> = {};
      dispHeaders.forEach((h, ci) => { rawObj[h] = row[ci] ?? null; });
      rawObj.__page = pn;
      if (pageData?.meta.date) rawObj.__date = pageData.meta.date;

      // 확정일: 셀 편집(erpCellEdits[ri]["확정일"]) 우선, 없으면 전체 confirmedAt
      const confirmedDate = (erpCellEdits[ri]?.["확정일"] ?? confirmedAt ?? "").trim() || undefined;
      items.push({
        supplier,
        product_name: String(productName),
        product_code: productCode ? String(productCode) : undefined,
        quantity: qty,
        unit_price: pri,
        amount: amt,
        balance: bal != null && Number.isFinite(bal) ? bal : undefined,
        expiry_date: expiry ? String(expiry) : undefined,
        memo: undefined,
        confirmed_at: confirmedDate,
        raw_json: rawObj,
      });
    });

    if (items.length === 0) {
      setSaveConfirmedToast({ type: "error", msg: "저장할 항목이 없습니다." });
      setTimeout(() => setSaveConfirmedToast(null), 2500);
      return;
    }

    setSavingConfirmed(true);
    try {
      await onSaveConfirmed(items);
      setSaveConfirmedToast({ type: "success", msg: `저장 완료! (${items.length}건)` });
    } catch (e: any) {
      setSaveConfirmedToast({ type: "error", msg: e?.message ?? "저장 실패" });
    } finally {
      setSavingConfirmed(false);
      setTimeout(() => setSaveConfirmedToast(null), 2500);
    }
  }, [
    onSaveConfirmed, nameIdx, dispHeaders, effectiveDispRows, pageNums, structuredPages,
    ocrSuppIdx, rawSupplierByPage, supplierOverrides, globalSupplier, matchItems, cancelledRows,
    selectedCands, cancelledAutoMap, autoSynonymMatches, barcodeAutoMap, cancelledAutoSyn,
    overrides, ocrQtyIdx, ocrPriIdx, amtIdx, pageBalanceFromConfig,
    erpCellEdits, pageSupplierBalances, pageBalanceOverride, confirmedAt,
  ]);

  const handleMatch = useCallback(async () => {
    if (nameIdx < 0) return;
    // 2026-07-09: 강화된 필터
    // - 빈 품명 · 배송·행정 라벨(차람번호/기사명/담당자/주소 등) · 사람이름/사업자번호 등을 스킵
    // - 공급자 힌트도 상품명·배송정보로 오분류된 것 페이지 fallback
    // 이는 1차보정에서 발생하는 무의미한 매칭 결과를 방지 (실제 매칭은 2차보정에서 ERP 로)
    const nameSupplierPairs = dispRows.map((row, ri) => {
      const rawName = String(row[nameIdx] ?? "").trim();
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
      const skip = !rawName || isNonProductText(rawName);
      return { rowIdx: ri, name: rawName, supplier: sup, skip };
    });

    const skippedCount = nameSupplierPairs.filter(p => p.skip).length;
    if (skippedCount > 0) console.log(`[handleMatch] ${skippedCount}행 스킵 (빈 품명·배송정보·잡문자)`);
    const activePairs = nameSupplierPairs.filter(p => !p.skip);
    const names = activePairs.map(p => p.name);
    const suppliers = activePairs.map(p => p.supplier);
    console.log(`[handleMatch] ${names.length}개 행 매칭 요청 · 고유 공급자: ${[...new Set(suppliers)].filter(Boolean).length}개`);

    setMatching(true); setMatchItems(null); setOverrides({}); setSupplierOverrides({}); setConfirmed(false); setSavedSynonyms(new Set()); setSavedSupplierAliases(new Set());
    setRetryingRows(new Set()); setCandidatesMap({}); setOpenCandRow(null); setSelectedCands({}); setCancelledRows(new Set());
    try {
      const res  = await fetch("/api/ocr-match", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ names, suppliers }) });
      const data = await res.json();
      // matchItems 를 원본 dispRows 인덱스 순서로 재배열 (skip 된 행은 null)
      const returned: MatchedItem[] = data.matches ?? [];
      const aligned: (MatchedItem | null)[] = dispRows.map(() => null);
      activePairs.forEach((p, ai) => { aligned[p.rowIdx] = returned[ai] ?? null; });
      setMatchItems(aligned.map(m => m ?? { input: "", matched: null }));
    } finally { setMatching(false); }
  }, [dispRows, nameIdx, pageNums, rawSupplierByPage, ocrSuppIdx, structuredPages, globalSupplier]);

  // ── 확정 표 ──────────────────────────────────────────────────────────────
  const CONF_HEADERS = [
    "거래일","확정일","상품코드","상품명",
    "마스터 매입단가","전표 매입단가","공급처","매입수량","매입총계",
    "판매단가","이익률","유통기한","규격","공급사잔고",
  ];
  const CONF_NUM = new Set(["마스터 매입단가","전표 매입단가","매입수량","매입총계","판매단가","이익률","공급사잔고"]);

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
    fetch("/api/supplier-balances")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.balances)) setSupplierBalanceRecords(d.balances); })
      .catch(() => {});
  }, []);

  // dispHeaders 길이 변경 시 colOrder 초기화 (저장된 값이 유효하면 유지, 아니면 리셋)
  useEffect(() => {
    setColOrder(prev => {
      if (prev.length === dispHeaders.length &&
          prev.every(i => i >= 0 && i < dispHeaders.length) &&
          new Set(prev).size === prev.length) return prev;
      return Array.from({ length: dispHeaders.length }, (_, i) => i);
    });
  }, [dispHeaders.length]);

  // colOrder 변경 시 localStorage 저장
  useEffect(() => {
    if (colOrder.length > 0) {
      try { localStorage.setItem("ocr_raw_col_order", JSON.stringify(colOrder)); } catch { /* ignore */ }
    }
  }, [colOrder]);

  // CONF_HEADERS 길이 변경 시 confColOrder 초기화 (localStorage 저장값 유효성 검사)
  useEffect(() => {
    setConfColOrder(prev => {
      if (prev.length === CONF_HEADERS.length &&
          prev.every(i => i >= 0 && i < CONF_HEADERS.length) &&
          new Set(prev).size === prev.length) return prev;
      return Array.from({ length: CONF_HEADERS.length }, (_, i) => i);
    });
  }, [CONF_HEADERS.length]);

  // confColOrder 변경 시 localStorage 저장
  useEffect(() => {
    if (confColOrder.length > 0) {
      try { localStorage.setItem("ocr_conf_col_order", JSON.stringify(confColOrder)); } catch { /* ignore */ }
    }
  }, [confColOrder]);

  const confRows: (string | number | null)[][] = matchItems
    ? effectiveDispRows.map((row, ri) => {
        // 1차보정에서 삭제된 행 · DB 서명 매치 행은 확정표에서도 제외 (빈 배열로 마킹 후 하단 필터)
        if (permanentlyDeletedRawRows.has(ri) || isRowDbDeleted(ri)) return [] as (string | number | null)[];
        const m        = cancelledRows.has(ri) ? null : (selectedCands[ri] ?? matchItems[ri]?.matched ?? null);
        const autoSyn  = cancelledAutoMap.has(ri) ? undefined : autoSynonymMatches[ri];
        const bc       = cancelledAutoMap.has(ri) ? null : (barcodeAutoMap[ri] ?? null);
        const origOcrName = nameIdx >= 0 ? String(row[nameIdx] ?? "").trim() || null : null;
        // 2차 보정 셀 편집 우선 반영
        const erpEdits = erpCellEdits[ri];
        const corrName = erpEdits?.["ERP 품명"] !== undefined
          ? erpEdits["ERP 품명"]
          : ((cancelledAutoSyn.has(ri) || cancelledAutoMap.has(ri))
              ? (overrides[ri] ?? origOcrName)
              : (overrides[ri] ?? m?.name ?? autoSyn?.name ?? bc?.name ?? origOcrName));
        const corrCode = erpEdits?.["ERP 코드"] !== undefined
          ? erpEdits["ERP 코드"]
          : (m?.code ?? autoSyn?.code ?? bc?.code ?? null);
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
        else if ((qtyEditVal !== undefined || priEditVal !== undefined) && qty && pri) amt = Math.round(Number(qty) * Number(pri));
        else amt = amtIdx >= 0 && row[amtIdx] != null ? parseNumber(row[amtIdx]) : null;
        const spec = ocrSpecIdx >= 0 ? (row[ocrSpecIdx] ?? m?.spec ?? bc?.spec ?? null) : (m?.spec ?? bc?.spec ?? null);
        const pn = pageNums[ri];
        const rawSupp = rawSupplierByPage[pn] !== undefined
          ? rawSupplierByPage[pn]
          : (ocrSuppIdx >= 0 ? (row[ocrSuppIdx] ?? globalSupplier) : (structuredPages.find(p => p.page === pn)?.meta.supplier ?? globalSupplier));
        const supp    = supplierOverrides[ri] !== undefined ? supplierOverrides[ri] : rawSupp;
        const dateVal = structuredPages.find(p => p.page === pn)?.meta.date ?? null;
        // 유통기한: erpCellEdits > matched.expiryDate > barcode.expiryDate
        const expiryEdit = erpEdits?.["유통기한"];
        const expiry = expiryEdit !== undefined ? expiryEdit : (m?.expiryDate ?? bc?.expiryDate ?? null);
        // 확정일: erpCellEdits 우선, 없으면 batch confirmedAt
        const confirmedDateEdit = erpEdits?.["확정일"];
        const confirmedDateCell = confirmedDateEdit !== undefined ? confirmedDateEdit : (confirmedAt ?? null);
        return [dateVal, confirmedDateCell, corrCode, corrName, m?.masterPrice ?? bc?.masterPrice ?? null, pri, supp, qty, amt,
                m?.salePrice ?? bc?.salePrice ?? null,
                m?.profitRate != null ? m.profitRate : (bc?.profitRate ?? null),
                expiry, spec, null];
      }).filter(r => r.length > 0)
    : [];

  const confAmtIdx  = CONF_HEADERS.indexOf("매입총계");
  const confSuppIdx = CONF_HEADERS.indexOf("공급처");

  // 확정표 페이지별 소계 — 1차보정 사용자 선택(pageSubtotalChoices) 우선 반영, 없으면 confRows 합
  const confPageTotals = new Map<number, number>();
  if (confAmtIdx >= 0 && matchItems) {
    // 우선 확정표 행별 amount 합계를 계산
    confRows.forEach((row, ri) => {
      const pn = pageNums[ri];
      confPageTotals.set(pn, (confPageTotals.get(pn) ?? 0) + parseNumber(row[confAmtIdx]));
    });
    // 1차보정에서 사용자가 소계를 명시적으로 선택한 페이지는 그 값으로 오버라이드
    uniquePageNums.forEach(pn => {
      const choice = pageSubtotalChoices[pn];
      if (choice === "stated" || choice === "computed" || choice === "custom") {
        confPageTotals.set(pn, getPageDisplayTotal(pn));
      }
    });
  }

  const confTotal   = confAmtIdx >= 0
    ? confRows.reduce((s, r) => s + parseNumber(r[confAmtIdx]), 0)
    : 0;
  const confSupplierTotals: { supplier: string; total: number; count: number }[] = confAmtIdx >= 0
    ? (() => {
        const m = new Map<string, { total: number; count: number }>();
        confRows.forEach(r => {
          const supp = String(confSuppIdx >= 0 && r[confSuppIdx] != null ? r[confSuppIdx] : "미상").trim() || "미상";
          const amt  = parseNumber(r[confAmtIdx]);
          const prev = m.get(supp) ?? { total: 0, count: 0 };
          m.set(supp, { total: prev.total + amt, count: prev.count + 1 });
        });
        return [...m.entries()].map(([supplier, v]) => ({ supplier, ...v }));
      })()
    : [];

  const handleExport = useCallback((headers: string[], rows: (string | number | null)[][], suffix: string) => {
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `거래명세서_${meta.date?.replace(/-/g, "") ?? "OCR"}_${suffix}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  }, [meta]);

  const handleTemplateUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const buf = e.target?.result as ArrayBuffer;
      try {
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
        const hdrs: string[] = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r: range.s.r, c })];
          hdrs.push(cell?.v != null ? String(cell.v) : "");
        }
        setXlsTemplate(buf);
        setXlsTemplateName(file.name);
        setXlsTemplateHdrs(hdrs);
      } catch { /* invalid file */ }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleExcelExport = useCallback(() => {
    if (!matchItems || confRows.length === 0) return;

    const buildDataMap = (row: (string | number | null)[]) => {
      const m: Record<string, string | number | null> = {};
      CONF_HEADERS.forEach((h, ci) => { m[h] = row[ci] ?? null; });
      return m;
    };

    if (xlsTemplate && xlsTemplateHdrs) {
      const wb = XLSX.read(xlsTemplate, { type: "array" });
      const wsName = wb.SheetNames[0];
      const ws = wb.Sheets[wsName];
      const templateRange = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
      const dataStartRow = templateRange.s.r + 1;

      const colMap: (string | null)[] = xlsTemplateHdrs.map(th => {
        const t = th.trim();
        return COL_ALIAS[t] ?? (CONF_HEADERS.includes(t) ? t : null);
      });

      confRows.forEach((row, ri) => {
        const dm = buildDataMap(row);
        colMap.forEach((ourKey, tc) => {
          if (!ourKey) return;
          const val = dm[ourKey];
          if (val == null) return;
          const addr = XLSX.utils.encode_cell({ r: dataStartRow + ri, c: templateRange.s.c + tc });
          ws[addr] = typeof val === "number" ? { t: "n", v: val } : { t: "s", v: String(val) };
        });
      });

      const newRange = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
      newRange.e.r = Math.max(newRange.e.r, dataStartRow + confRows.length - 1);
      ws["!ref"] = XLSX.utils.encode_range(newRange);
      XLSX.writeFile(wb, `거래명세서_${meta.date?.replace(/-/g, "") ?? "OCR"}_확정.xlsx`);
    } else {
      const wsData: (string | number | null)[][] = [CONF_HEADERS];
      confRows.forEach((row, ri) => {
        wsData.push(row.slice());
        const isLastInPage = ri === confRows.length - 1 || pageNums[ri] !== pageNums[ri + 1];
        if (isLastInPage && uniquePageNums.length > 1 && confAmtIdx >= 0) {
          const pn = pageNums[ri];
          const ps = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
          const sub: (string | number | null)[] = Array(CONF_HEADERS.length).fill(null);
          sub[CONF_HEADERS.indexOf("상품명")] = `${ps ? ps + " " : ""}${pn}번 소계`;
          sub[confAmtIdx] = confPageTotals.get(pn) ?? 0;
          wsData.push(sub);
        }
      });
      if (confTotal > 0) {
        const tot: (string | number | null)[] = Array(CONF_HEADERS.length).fill(null);
        tot[CONF_HEADERS.indexOf("상품명")] = "합 계";
        tot[confAmtIdx] = confTotal;
        wsData.push(tot);
      }
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws["!cols"] = CONF_HEADERS.map(h => ({
        wch: h === "상품명" ? 32 : h === "공급처" ? 14 : h === "상품코드" ? 13 :
             h === "규격" ? 12 : h === "유통기한" || h === "거래일" ? 13 :
             h.includes("단가") || h === "매입총계" ? 14 : 9,
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "거래명세서");
      XLSX.writeFile(wb, `거래명세서_${meta.date?.replace(/-/g, "") ?? "OCR"}_확정.xlsx`);
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
        style={{ position: "fixed", top: nameDropdownRect.top, left: nameDropdownRect.left, width: nameDropdownRect.width, zIndex: 9999 }}
        className="bg-white border border-indigo-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto"
        onMouseDown={e => e.preventDefault()}
      >
        {nameEditResults.length === 0 ? (
          <div className="px-3 py-2.5 text-[11px] text-gray-400 text-center">상품이 없습니다</div>
        ) : nameEditResults.map((p, pi) => (
          <button key={pi}
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              if (editingNameRow == null) return;
              const ri = editingNameRow;
              const origName = String(dispRows[ri]?.[nameIdx] ?? "");
              const pnLocal = pageNums[ri];
              const supplier = rawSupplierByPage[pnLocal] ?? structuredPages.find(pg => pg.page === pnLocal)?.meta.supplier ?? globalSupplier ?? "";
              setAutoSynonymMatches(prev => ({ ...prev, [ri]: { code: p.product_code, name: p.product_name } }));
              setCancelledAutoSyn(prev => { const s = new Set(prev); s.delete(ri); return s; });
              setRawEditValues(prev => { const n = { ...prev }; delete n[ri]; return n; });
              saveSynonym(ri, origName, p.product_code, supplier || undefined, p.product_name);
              setEditingNameRow(null);
              setNameEditResults([]);
              setNameEditSearchDone(false);
              setNameDropdownRect(null);
            }}
            className="flex items-center gap-2 w-full text-left px-3 py-1.5 hover:bg-indigo-50 text-[11px] border-b border-gray-50 last:border-0">
            <span className="flex-1 font-semibold text-gray-800 break-words">{p.product_name}</span>
            {p.spec && <span className="text-gray-400 shrink-0 max-w-[60px] break-words">{p.spec}</span>}
            {p.supplier && <span className="text-sky-500 shrink-0 max-w-[60px] break-words">{p.supplier}</span>}
          </button>
        ))}
      </div>
    )}

    {/* ── 동의어 삭제 확인 다이얼로그 ── */}
    {deleteSynConfirm && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-slate-100 space-y-4">
          <p className="text-sm font-bold text-slate-800">동의어를 삭제하시겠습니까?</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            <span className="line-through text-gray-400">{deleteSynConfirm.origName}</span>의 동의어 매핑을 삭제합니다.
          </p>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setDeleteSynConfirm(null)}
              className="flex-1 px-3 py-2 text-xs font-bold bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 cursor-pointer">아니오</button>
            <button type="button"
              onClick={async () => {
                const { ri, origName } = deleteSynConfirm;
                setDeleteSynConfirm(null);
                await deleteSynonymByName(origName);
                setAutoSynonymMatches(prev => { const s = { ...prev }; delete s[ri]; return s; });
              }}
              className="flex-1 px-3 py-2 text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white rounded-lg cursor-pointer">예, 삭제</button>
          </div>
        </div>
      </div>
    )}

    {/* ── 공급처 자동완성 드롭다운 (fixed · 테이블 stacking context 우회) ── */}
    {editingRawSuppRow != null && suppDropdownRect && vendorNames.length > 0 && (() => {
      const q = editingRawSuppVal.trim().toLowerCase().replace(/[\s()（）]/g, "");
      const matches = q.length === 0
        ? vendorNames.slice(0, 8)
        : vendorNames.filter(n => n.toLowerCase().replace(/[\s()（）]/g, "").includes(q)).slice(0, 8);
      if (matches.length === 0) return null;
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
          style={{ top: suppDropdownRect.top + 2, left: suppDropdownRect.left, width: suppDropdownRect.width }}
        >
          <div className="px-2 py-1 text-[9px] text-slate-500 border-b border-slate-100 bg-slate-50 font-bold">
            공급사 DB · {matches.length}건 {q ? `("${q}" 매칭)` : "(전체)"}
          </div>
          {matches.map(name => (
            <button
              key={name}
              type="button"
              onMouseDown={e => { e.preventDefault(); commit(name); }}
              className="w-full text-left px-2 py-1.5 hover:bg-sky-50 text-sky-800 font-semibold border-b border-slate-50 last:border-0 cursor-pointer"
            >
              {name}
            </button>
          ))}
        </div>
      );
    })()}

    {/* ── 이미지 모달 (줌·드래그 · ESC 로 닫기) ── */}
    {modalImg && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 outline-none"
        onClick={closeModal}
        tabIndex={-1}
        autoFocus
        ref={el => { if (el) el.focus(); }}
        onKeyDown={e => {
          if (e.key === "Escape" || e.key === "Esc") { e.stopPropagation(); closeModal(); }
        }}
      >
        <div className="relative w-full bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          style={{ maxWidth: "min(900px, 95vw)", height: "90vh" }}
          onClick={e => e.stopPropagation()}>

          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200 shrink-0">
            <span className="text-xs font-bold text-gray-700 break-all min-w-0 flex-1 mr-3">{modalLabel}</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg px-1 py-0.5">
                <button onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-600 font-bold text-base leading-none cursor-pointer select-none">−</button>
                <span className="text-[11px] font-bold text-gray-500 min-w-[40px] text-center tabular-nums">
                  {Math.round(zoom * 100)}%
                </span>
                <button onClick={() => setZoom(z => Math.min(6, +(z + 0.25).toFixed(2)))}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-600 font-bold text-base leading-none cursor-pointer select-none">+</button>
              </div>
              <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                className="text-[10px] font-bold text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 cursor-pointer">
                초기화
              </button>
              <button onClick={closeModal} className="p-1 rounded-lg hover:bg-gray-200 cursor-pointer">
                <X size={16} className="text-gray-500" />
              </button>
            </div>
          </div>

          <div ref={viewportCbRef}
            className="relative flex-1 min-h-0 overflow-hidden select-none flex items-center justify-center"
            style={{ cursor: isDragging ? "grabbing" : zoom > 1 ? "grab" : "zoom-in" }}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove}
            onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onDoubleClick={onDblClick}>
            <div style={{
              transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              transition: isDragging ? "none" : "transform 0.12s ease-out",
            }}>
              <img src={modalImg} alt={modalLabel} draggable={false}
                style={{
                  display: "block",
                  transform: `rotate(${rotation}deg)`,
                  maxWidth:  (rotation === 90 || rotation === -90 || rotation === 270) ? "80vh" : "90vw",
                  maxHeight: (rotation === 90 || rotation === -90 || rotation === 270) ? "80vw" : "80vh",
                  width: "auto", height: "auto", userSelect: "none", pointerEvents: "none",
                }} />
            </div>
            {zoom <= 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-white/70 bg-black/40 px-3 py-1 rounded-full pointer-events-none whitespace-nowrap">
                스크롤 줌 · 더블클릭 2.5× · 드래그 이동
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    {/* ── 공급처 변경 확인 다이얼로그 ── */}
    {supplierConfirm && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
        onClick={() => setSupplierConfirm(null)}>
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 max-w-sm w-full flex flex-col gap-4"
          onClick={e => e.stopPropagation()}>
          <div>
            <p className="text-sm font-bold text-gray-800 mb-1">공급처 변경</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              <span className="font-bold text-sky-700">"{supplierConfirm.newVal}"</span>으로 변경합니다.{" "}
              해당 페이지의 <span className="font-bold text-gray-700">{supplierConfirm.rowCount}개</span> 항목과
              이후 모든 프로세스(보정 결과, 확정 표)에 즉시 반영됩니다.
            </p>
          </div>
          {/* 동의어 일괄 추가 옵션 */}
          {nameIdx >= 0 && (
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={supplierConfirm.addSynonyms}
                onChange={e => setSupplierConfirm(prev => prev ? { ...prev, addSynonyms: e.target.checked } : null)}
                className="mt-0.5 accent-indigo-500"
              />
              <span className="text-xs text-gray-600 leading-snug">
                <span className="font-bold text-indigo-700">동의어 일괄 추가</span> — 이 페이지 상품명을{" "}
                <span className="font-semibold text-sky-700">"{supplierConfirm.newVal}"</span> 공급사로 동의어 사전에 등록
                <span className="block text-[10px] text-gray-400 mt-0.5">(DB 매칭 후 상품코드 포함 자동 등록)</span>
              </span>
            </label>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setSupplierConfirm(null)}
              className="flex-1 py-2 text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-xl transition cursor-pointer"
            >
              취소
            </button>
            <button
              onClick={async () => {
                const { pageNum, newVal, addSynonyms } = supplierConfirm;
                // 이전 OCR 인식 공급사 → 보정 공급사를 DB에 저장 (자동보정)
                const oldOcrSupplier = structuredPages.find(p => p.page === pageNum)?.meta.supplier;
                if (oldOcrSupplier && oldOcrSupplier.trim() !== newVal.trim()) {
                  fetch("/api/ocr-supplier-aliases", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ alias: oldOcrSupplier.trim(), supplier_name: newVal.trim() }),
                  }).catch(() => {});
                }
                setRawSupplierByPage(prev => ({ ...prev, [pageNum]: newVal }));
                setSupplierConfirm(null);
                if (addSynonyms) await handleSynonymBulkAdd(pageNum, newVal);
                if (onReparsePage) {
                  setReparseStatus(prev => ({ ...prev, [pageNum]: 'loading' }));
                  setReparseSupplier(prev => ({ ...prev, [pageNum]: newVal }));
                  try {
                    await onReparsePage(pageNum, newVal);
                    setReparseStatus(prev => ({ ...prev, [pageNum]: 'done' }));
                  } catch {
                    setReparseStatus(prev => ({ ...prev, [pageNum]: 'error' }));
                  }
                }
              }}
              className="flex-1 py-2 text-xs font-bold text-white bg-sky-500 hover:bg-sky-600 rounded-xl transition cursor-pointer"
            >
              변경 적용
            </button>
          </div>
        </div>
      </div>
    )}

    <div className="w-full flex flex-col gap-3">

      {/* ── OCR 원본 표 ── */}
      {structuredPages.length > 0 && (
        <div className="w-full bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-black text-white bg-sky-500 px-1.5 py-0.5 rounded shrink-0">1차보정</span>
              <span className="text-xs font-bold text-gray-800">거래명세서 품목</span>
              <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded font-bold">
                {allRows.length - permanentlyDeletedRawRows.size - hiddenRawRows.size}행 · {structuredPages.length}페이지
                {(permanentlyDeletedRawRows.size + hiddenRawRows.size) > 0 && (
                  <span className="ml-1 text-rose-500">
                    ({permanentlyDeletedRawRows.size + hiddenRawRows.size}행 제외)
                  </span>
                )}
              </span>
              {/* DB 삭제 서명 필터 · 매치된 행이 안 보이는 원인 표시 · 리셋 가능 */}
              {(() => {
                const dbFilteredCount = allRows.filter((_, ri) => isRowDbDeleted(ri)).length;
                if (dbFilteredCount === 0) return null;
                return (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded font-bold">
                    🔍 DB 필터 {dbFilteredCount}행 숨김
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm(`DB에 저장된 삭제 서명 ${dbDeletedSignatures.size}개를 모두 초기화합니다.\n이 세션의 필터가 해제되고, 서버 DB 기록도 삭제됩니다.\n계속?`)) return;
                        // 로컬 필터 즉시 해제
                        setDbDeletedSignatures(new Set());
                        // 서버 DB 전체 삭제 (개별 DELETE · 실패는 무시)
                        try {
                          const r = await fetch("/api/ocr-deleted-rows");
                          const data = await r.json();
                          if (Array.isArray(data?.rows)) {
                            await Promise.all(data.rows.map((row: any) =>
                              fetch(`/api/ocr-deleted-rows/${row.id}`, { method: "DELETE" }).catch(() => {})
                            ));
                          }
                        } catch { /* silent */ }
                      }}
                      className="text-white bg-amber-600 hover:bg-amber-700 rounded px-1 text-[9px]"
                      title="DB 저장된 삭제 서명 전체 초기화 · 모든 숨겨진 행 복원"
                    >
                      리셋
                    </button>
                  </span>
                );
              })()}
              {/* 📍 체크된 셀 · Alt+Click 으로 선택 (2026-07-14) */}
              {checkedCells.size > 0 && (
                <>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-300 rounded px-2 py-0.5 whitespace-nowrap">
                    📍 셀 {checkedCells.size}개 선택
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      // 셀 재추출 · A안 3-로직 (rawText 로컬 + 컬럼 지문 + 크로스 페이지)
                      const newEdits: Record<number, Record<number, number | null>> = {};
                      let hitCount = 0;
                      const missCells: string[] = [];
                      checkedCells.forEach(k => {
                        const [rStr, cStr] = k.split(":");
                        const ri = parseInt(rStr), ci = parseInt(cStr);
                        const colName = dispHeaders[ci];
                        if (colName !== "수량" && colName !== "단가" && colName !== "금액") {
                          missCells.push(k); return;
                        }
                        const pn = pageNums[ri];
                        // current page 구성 (structuredPages 에서 · rawText 포함)
                        const pageObj = structuredPages.find(p => p.page === pn) ?? pages.find(p => p.page === pn);
                        if (!pageObj) { missCells.push(k); return; }
                        // 이 페이지의 row index (page-local)
                        const pageRi = pageNums.slice(0, ri).filter(p => p === pn).length;
                        const others = pages.filter(p => p.page !== pn);
                        const cands = reextractCellCandidates({
                          currentPage: { page: pageObj.page, headers: pageObj.headers, rows: pageObj.rows, rawText: pageObj.rawText },
                          otherPages: others.map(p => ({ page: p.page, headers: p.headers, rows: p.rows, rawText: p.rawText })),
                          rowIndex: pageRi,
                          columnKind: colName as "수량" | "단가" | "금액",
                        });
                        if (cands.length > 0 && cands[0].confidence >= 0.6) {
                          if (!newEdits[ri]) newEdits[ri] = {};
                          newEdits[ri][ci] = cands[0].value;
                          hitCount++;
                          console.log(`[셀재추출] ri=${ri} ci=${ci} (${colName}) → ${cands[0].value} · ${cands[0].source} · ${(cands[0].confidence*100).toFixed(0)}%`);
                        } else {
                          missCells.push(k);
                        }
                      });
                      if (Object.keys(newEdits).length > 0) {
                        setCellEdits(prev => {
                          const next = { ...prev };
                          for (const [riStr, cols] of Object.entries(newEdits)) {
                            const ri = parseInt(riStr);
                            next[ri] = { ...(next[ri] ?? {}), ...cols };
                          }
                          return next;
                        });
                      }
                      // 후보 없는 셀: 기존 7-cycle 로직 폴백
                      if (missCells.length > 0) {
                        const rowsFallback = new Set<number>();
                        missCells.forEach(k => rowsFallback.add(parseInt(k.split(":")[0])));
                        rowsFallback.forEach(ri => revertSingleRawRow(ri));
                      }
                      clearCheckedCells();
                      console.log(`[셀재추출] 완료 · 신규매칭 ${hitCount}개 · 폴백 ${missCells.length}개`);
                    }}
                    className="inline-flex items-center gap-1 text-[10px] font-black text-white bg-sky-500 hover:bg-sky-600 active:bg-sky-700 px-2 py-0.5 rounded shadow-sm transition cursor-pointer whitespace-nowrap"
                    title="rawText 로컬 스캔 + 컬럼 지문 + 크로스 페이지 참조로 재추출"
                  >
                    🔄 셀 {checkedCells.size}개 재추출
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // 삭제: 각 체크된 셀을 null 로 (cellEdits)
                      setCellEdits(prev => {
                        const next = { ...prev };
                        checkedCells.forEach(k => {
                          const [rStr, cStr] = k.split(":");
                          const ri = parseInt(rStr), ci = parseInt(cStr);
                          next[ri] = { ...(next[ri] ?? {}), [ci]: null };
                        });
                        return next;
                      });
                      clearCheckedCells();
                    }}
                    className="inline-flex items-center gap-1 text-[10px] font-black text-white bg-rose-500 hover:bg-rose-600 active:bg-rose-700 px-2 py-0.5 rounded shadow-sm transition cursor-pointer whitespace-nowrap"
                    title="체크된 셀 값만 지우기 (행은 유지)"
                  >
                    🗑 셀 {checkedCells.size}개 지우기
                  </button>
                  <button
                    type="button"
                    onClick={clearCheckedCells}
                    className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-500 hover:text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded px-1.5 py-0.5 cursor-pointer"
                    title="셀 선택 해제"
                  >
                    선택 취소
                  </button>
                </>
              )}
              {/* 체크박스 마킹된 행 · 재추출 / 원본복원 / 삭제 (2026-07-14 라벨 명확화) */}
              {hiddenRawRows.size > 0 && (
                <>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-300 rounded px-2 py-0.5 whitespace-nowrap">
                    ☑ {hiddenRawRows.size}행 선택
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      // 선택된 행 재추출 · 각 행에 대해 7-cycle 로직 순환
                      Array.from(hiddenRawRows).forEach(ri => revertSingleRawRow(ri));
                      // 체크 해제 (재추출 후 재확인)
                      setHiddenRawRows(new Set());
                    }}
                    className="inline-flex items-center gap-1 text-[10px] font-black text-white bg-sky-500 hover:bg-sky-600 active:bg-sky-700 px-2 py-0.5 rounded shadow-sm transition cursor-pointer whitespace-nowrap"
                    title="선택 행 재추출 (수량↔단가 스왑 · 인접 행 후보 · rawText 재분석 순환)"
                  >
                    🔄 선택 재추출
                  </button>
                  <button
                    type="button"
                    onClick={revertSelectedRawRows}
                    className="inline-flex items-center gap-1 text-[10px] font-black text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 px-2 py-0.5 rounded shadow-sm transition cursor-pointer whitespace-nowrap"
                    title="선택 행의 편집·보정 모두 초기화 · raw OCR 원본으로 복원"
                  >
                    ↺ 원본 복원
                  </button>
                  <button
                    type="button"
                    onClick={commitRawRowsDeletion}
                    className="inline-flex items-center gap-1 text-[10px] font-black text-white bg-rose-500 hover:bg-rose-600 active:bg-rose-700 px-2 py-0.5 rounded shadow-sm transition cursor-pointer whitespace-nowrap"
                    title="선택 행 완전 삭제 + DB 서명 저장 (다음 스캔에도 자동 필터)"
                  >
                    🗑 선택 삭제
                  </button>
                </>
              )}
              {meta.date      && <span className="text-[10px] text-gray-400">{meta.date}</span>}
              {meta.supplier  && <span className="text-[10px] text-gray-400">공급: {meta.supplier}</span>}
              {/* Feature 3: 동의어 자동보정 뱃지 */}
              {autoSynonymLoading && (
                <span className="text-[10px] text-indigo-500 font-bold flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" />동의어 검색 중...
                </span>
              )}
              {!autoSynonymLoading && autoSynonymCount > 0 && (
                <span className="text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-600 px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                  <BookOpen size={9} />{autoSynonymCount}건 동의어 보정
                </span>
              )}
              {/* Feature 2: 동의어 추가 완료 상태 */}
              {synonymAddStatus?.status === 'loading' && (
                <span className="text-[10px] text-sky-500 font-bold flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" />동의어 추가 중...
                </span>
              )}
              {synonymAddStatus?.status === 'done' && (
                <span className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-600 px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                  <CheckCircle size={9} />{synonymAddStatus.count}건 동의어 추가 완료
                </span>
              )}
              {synonymAddStatus?.status === 'error' && (
                <span className="text-[10px] bg-rose-50 border border-rose-200 text-rose-600 px-1.5 py-0.5 rounded font-bold">
                  동의어 추가 실패
                </span>
              )}
              {pageImages?.length ? (
                <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">
                  📄 행 클릭 → 이미지 보기
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setShowRawDetail(v => !v)}
                className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border transition cursor-pointer ${
                  showRawDetail
                    ? "text-indigo-700 bg-indigo-50 border-indigo-300 hover:bg-indigo-100"
                    : "text-gray-500 bg-white border-gray-200 hover:bg-gray-50"
                }`}
                title={showRawDetail ? "필수 컬럼만 표시" : "공급처·일자·규격·단위·비고 등 상세 컬럼까지 표시"}
              >
                {showRawDetail ? "상세정보 숨기기" : "상세정보"}
              </button>
              {showRawDetail && colOrder.length > 0 && colOrder.some((v, i) => v !== i) && (
                <button
                  onClick={() => {
                    const reset = Array.from({ length: dispHeaders.length }, (_, i) => i);
                    setColOrder(reset);
                    try { localStorage.setItem("ocr_raw_col_order", JSON.stringify(reset)); } catch { /* ignore */ }
                  }}
                  className="flex items-center gap-1 text-[11px] font-bold text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 px-2 py-1 rounded-lg transition cursor-pointer"
                  title="열 순서 초기화"
                >
                  열순서 리셋
                </button>
              )}
              <button onClick={() => handleExport(dispHeaders, dispRows, "원본")}
                className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 px-2 py-1 rounded-lg transition cursor-pointer">
                <Download size={11} />CSV
              </button>
            </div>
          </div>

          {/* ── 소계 불일치 경고 ── */}
          {pageMismatches.length > 0 && (
            <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 flex flex-col gap-1.5">
              {pageMismatches.map(({ pageNum, computed, stated }) => {
                const resolved = isPageResolved(pageNum);
                const effectiveComputed = effectivePageTotals.get(pageNum) ?? computed;

                if (resolved) {
                  const choice = pageSubtotalChoices[pageNum];
                  const chosenVal = choice === "stated" ? stated
                    : choice === "custom" ? (pageSubtotalCustom[pageNum] ?? effectiveComputed)
                    : effectiveComputed;
                  const choiceLabel = choice === "stated" ? "명세서 소계"
                    : choice === "custom" ? "직접 선택"
                    : "인식된 합계";
                  const balanceCands = pageBalanceCandidates.get(pageNum) ?? [];
                  const selectedBalance = pageSupplierBalances[pageNum];
                  return (
                    <div key={pageNum} className="flex items-center gap-2 flex-wrap text-[11px] font-semibold text-emerald-700">
                      <CheckCircle size={12} className="shrink-0 text-emerald-500" />
                      <span className="flex items-center gap-1 flex-wrap">
                        <button
                          onClick={() => openPageModal(pageNum)}
                          disabled={!pageImages?.length}
                          className="disabled:cursor-default enabled:hover:underline enabled:cursor-pointer"
                          title={pageImages?.length ? `${pageNum}번 명세서 이미지 보기` : undefined}
                        >{pageNum}번 소계 확정: <span className="font-black">{fmt(chosenVal)}원</span></button>
                        {choice && (
                          <span className="text-emerald-500 font-normal">
                            ({choiceLabel} 기준)
                          </span>
                        )}
                        <button
                          onClick={() => {
                            setPageSubtotalChoices(prev => { const n = { ...prev }; delete n[pageNum]; return n; });
                            setPageSubtotalCustom(prev => { const n = { ...prev }; delete n[pageNum]; return n; });
                            setPageSubtotalDropdownOpen(prev => { const s = new Set(prev); s.delete(pageNum); return s; });
                          }}
                          className="text-[10px] text-emerald-600 hover:text-emerald-800 underline cursor-pointer"
                        >
                          취소
                        </button>
                      </span>
                      <span className="text-gray-300">|</span>
                      <span className="text-indigo-500 font-normal shrink-0">공급사잔고:</span>
                      {selectedBalance != null ? (
                        <span className="flex items-center gap-1">
                          <span className="font-black text-indigo-700">{fmt(selectedBalance)}원</span>
                          <button
                            onClick={() => setPageSupplierBalances(prev => { const n = { ...prev }; delete n[pageNum]; return n; })}
                            className="text-[10px] text-gray-400 hover:text-gray-600 underline cursor-pointer"
                          >초기화</button>
                        </span>
                      ) : balanceCands.length > 0 ? (
                        balanceCands.map(({ label, amount }, i) => (
                          <button key={i}
                            onClick={() => setPageSupplierBalances(prev => ({ ...prev, [pageNum]: amount }))}
                            className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-600 hover:bg-indigo-100 rounded-lg cursor-pointer whitespace-nowrap"
                          >{label} {fmt(amount)}원</button>
                        ))
                      ) : (
                        <span className="text-gray-300 text-[10px] font-normal">항목 없음</span>
                      )}
                    </div>
                  );
                }

                const isDropdownOpen = pageSubtotalDropdownOpen.has(pageNum);
                const amtCandidates = pageAmountCandidates.get(pageNum) ?? [];
                return (
                  <div key={pageNum} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <AlertTriangle size={12} className="shrink-0 text-rose-500" />
                      <button
                        onClick={() => openPageModal(pageNum)}
                        disabled={!pageImages?.length}
                        className="text-[11px] font-semibold text-amber-700 shrink-0 disabled:cursor-default enabled:hover:underline enabled:cursor-pointer"
                        title={pageImages?.length ? `${pageNum}번 명세서 이미지 보기` : undefined}
                      >
                        {pageNum}번 소계 불일치
                      </button>
                      <span className="text-[10px] text-rose-400 shrink-0">어느 값이 맞나요?</span>
                      <button
                        onClick={() => setPageSubtotalChoices(prev => ({ ...prev, [pageNum]: "stated" }))}
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold bg-rose-500 hover:bg-rose-600 text-white rounded-lg transition cursor-pointer"
                      >
                        명세서 소계 {fmt(stated)}원
                      </button>
                      <button
                        onClick={() => setPageSubtotalChoices(prev => ({ ...prev, [pageNum]: "computed" }))}
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold bg-white border border-rose-300 text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                      >
                        인식된 합계 {fmt(effectiveComputed)}원
                      </button>
                      <button
                        onClick={() => setPageSubtotalDropdownOpen(prev => {
                          const s = new Set(prev);
                          if (s.has(pageNum)) s.delete(pageNum); else s.add(pageNum);
                          return s;
                        })}
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg transition cursor-pointer"
                      >
                        둘 다 아님 ▾
                      </button>
                    </div>
                    {isDropdownOpen && (
                      <div className="flex items-center gap-2 flex-wrap pl-5 pb-1">
                        <span className="text-[10px] text-gray-500 shrink-0">직접 선택:</span>
                        {amtCandidates.length > 0 ? (
                          <select
                            className="border border-gray-300 rounded px-2 py-0.5 text-[11px] outline-none focus:border-rose-400 bg-white cursor-pointer"
                            defaultValue=""
                            onChange={e => {
                              const val = Number(e.target.value);
                              if (!val) return;
                              setPageSubtotalCustom(prev => ({ ...prev, [pageNum]: val }));
                              setPageSubtotalChoices(prev => ({ ...prev, [pageNum]: "custom" }));
                              setPageSubtotalDropdownOpen(prev => { const s = new Set(prev); s.delete(pageNum); return s; });
                            }}
                          >
                            <option value="" disabled>-- 금액 선택 --</option>
                            {amtCandidates.map(v => (
                              <option key={v} value={v}>{fmt(v)}원</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[10px] text-gray-400">후보 금액이 없습니다</span>
                        )}
                        <button
                          onClick={() => setPageSubtotalDropdownOpen(prev => { const s = new Set(prev); s.delete(pageNum); return s; })}
                          className="text-[10px] text-gray-400 hover:text-gray-600 underline cursor-pointer"
                        >
                          취소
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── 공급처 변경 재파싱 상태 ── */}
          {Object.entries(reparseStatus).map(([pnStr, status]) => {
            const pn = Number(pnStr);
            const supplier = reparseSupplier[pn] ?? "";
            if (!supplier) return null;
            if (status === 'loading') return (
              <div key={pn} className="px-4 py-2 bg-indigo-50 border-b border-indigo-200 flex items-center gap-2 text-[11px] font-semibold text-indigo-700">
                <Loader2 size={12} className="animate-spin shrink-0" />
                {pn}번 명세서 "{supplier}" 공급처 템플릿으로 재파싱 중...
              </div>
            );
            if (status === 'error') return (
              <div key={pn} className="px-4 py-2 bg-rose-50 border-b border-rose-200 flex items-center gap-2 text-[11px] font-semibold text-amber-700">
                <XCircle size={12} className="shrink-0" />{pn}번 명세서 재파싱 실패 — 원본 결과를 유지합니다
              </div>
            );
            if (status === 'done') return (
              <div key={pn} className="px-4 py-2 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2 flex-wrap text-[11px] font-semibold text-emerald-700">
                <CheckCircle size={12} className="shrink-0" />
                <span>{pn}번 명세서 재파싱 완료</span>
                <span className="text-gray-500 font-normal">이 결과를 <span className="font-bold text-sky-700">"{supplier}"</span> 공급처 템플릿으로 저장하면 다음부터 자동 적용됩니다.</span>
                <button onClick={() => saveTemplate(pn, supplier)}
                  className="ml-auto text-[10px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 px-2 py-0.5 rounded transition cursor-pointer shrink-0">
                  템플릿 저장
                </button>
                <button onClick={() => setReparseStatus(prev => { const s = { ...prev }; delete s[pn]; return s; })}
                  className="text-gray-400 hover:text-gray-600 cursor-pointer shrink-0">
                  <X size={10} />
                </button>
              </div>
            );
            if (status === 'saved') return (
              <div key={pn} className="px-4 py-2 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2 text-[11px] font-semibold text-emerald-700">
                <BookmarkCheck size={12} className="shrink-0" /><span className="font-bold text-sky-700">"{supplier}"</span> 공급처 템플릿 저장 완료 — 다음 스캔부터 자동 적용됩니다
              </div>
            );
            return null;
          })}

          <div className="w-full overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-amber-50 border-b-2 border-amber-200">
                  <th className="w-14 px-1 py-2 text-center" title="선택 · 재추출">
                    <span className="text-[9px] font-bold text-amber-700">선택 · 🔄</span>
                  </th>
                  {(() => {
                    // 표시할 (원본 인덱스, 순서 인덱스) 리스트 계산
                    const baseOrder = colOrder.length === dispHeaders.length ? colOrder : dispHeaders.map((_, i) => i);
                    if (showRawDetail) return baseOrder.map((origIdx, orderIdx) => ({ origIdx, orderIdx }));
                    // 압축 모드: 품명 → 수량 → 단가 → 금액 → 세액 → 유통기한 순서(존재하는 것만)
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
                    return list;
                  })().map(({ origIdx, orderIdx }) => {
                    const h = dispHeaders[origIdx];
                    const ci = origIdx;
                    return (
                      <th key={origIdx}
                        draggable
                        onDragStart={() => setDragColIdx(orderIdx)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => {
                          if (dragColIdx === null || dragColIdx === orderIdx) { setDragColIdx(null); return; }
                          setColOrder(prev => {
                            const base = prev.length === dispHeaders.length ? prev : dispHeaders.map((_, i) => i);
                            const next = [...base];
                            const [removed] = next.splice(dragColIdx, 1);
                            next.splice(orderIdx, 0, removed);
                            return next;
                          });
                          setDragColIdx(null);
                        }}
                        onDragEnd={() => setDragColIdx(null)}
                        style={{ width: colWidths[ci] ?? 'auto', minWidth: 40, position: 'relative', cursor: 'grab' }}
                        className={`px-3 py-2 font-bold text-amber-900 whitespace-nowrap select-none ${NUM_COLS.has(h) ? "text-right" : "text-left"} ${dragColIdx === orderIdx ? 'opacity-50' : ''}`}
                        title="드래그하여 열 순서 변경">
                        {h}
                        <div
                          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 1 }}
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
                  })}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // 페이지별 마지막 표시 행 인덱스 사전 계산 (완전삭제 · DB삭제 제외)
                  //   → 마지막 행이 삭제돼도 요약 행 안 사라지도록 (2026-07-10)
                  const _lastVisibleByPage = new Map<number, number>();
                  const _firstVisibleByPage = new Map<number, number>();
                  effectiveDispRows.forEach((_, i) => {
                    if (permanentlyDeletedRawRows.has(i) || isRowDbDeleted(i)) return;
                    const pn = pageNums[i];
                    if (!_firstVisibleByPage.has(pn)) _firstVisibleByPage.set(pn, i);
                    _lastVisibleByPage.set(pn, i);
                  });
                  return effectiveDispRows.map((row, ri) => {
                  // 확정 삭제된 행 · DB 서명 매치 → 완전 스킵 (체크 상태는 취소선만 표시)
                  if (permanentlyDeletedRawRows.has(ri)) return null;
                  if (isRowDbDeleted(ri)) return null;
                  const isFirstInPage = ri === _firstVisibleByPage.get(pageNums[ri]);
                  const isLastInPage = ri === _lastVisibleByPage.get(pageNums[ri]);
                  const pn = pageNums[ri];
                  const isPageCollapsedRaw = collapsedRawPages.has(pn);
                  const pageRowCountRaw = isFirstInPage
                    ? effectiveDispRows.filter((_, i) => pageNums[i] === pn && !permanentlyDeletedRawRows.has(i) && !hiddenRawRows.has(i)).length
                    : 0;
                  const pageSupplierHeadRaw = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
                  const rawColSpan = (() => {
                    const baseOrder = colOrder.length === dispHeaders.length ? colOrder : dispHeaders.map((_, i) => i);
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
                  const isMismatch = ocrQtyIdx >= 0 && ocrPriIdx >= 0 && amtIdx >= 0 && (() => {
                    const qty = parseNumber(row[ocrQtyIdx]);
                    const pri = parseNumber(row[ocrPriIdx]);
                    const amt = parseNumber(row[amtIdx]);
                    const disc = _discountIdxEarly >= 0 ? parseNumber(row[_discountIdxEarly]) : 0;
                    const expected = Math.round(qty * pri) - Math.max(0, disc);
                    return qty > 0 && pri > 0 && amt > 0 && Math.abs(expected - amt) > 1;
                  })();
                  const pageQpaMismatchCount = pageQtyPriceAmtMismatch.get(pn) ?? 0;
                  const pageHasQpaMismatch = pageQpaMismatchCount > 0;
                  return (
                    <React.Fragment key={ri}>
                      {/* 페이지 헤더 (접기/펴기) — 불일치 있으면 붉은 강조 */}
                      {isFirstInPage && (
                        <tr className={`border-t-2 cursor-pointer select-none ${
                          pageHasQpaMismatch
                            ? "bg-rose-100/80 border-rose-400 hover:bg-rose-200/80 ring-2 ring-rose-400 ring-inset"
                            : "bg-amber-100/70 border-amber-300 hover:bg-amber-200/70"
                        }`}
                          onClick={() => setCollapsedRawPages(prev => {
                            const n = new Set(prev);
                            if (n.has(pn)) n.delete(pn); else n.add(pn);
                            return n;
                          })}
                          title={isPageCollapsedRaw ? "펴기" : "접기"}>
                          <td colSpan={rawColSpan} className="px-3 py-1.5">
                            <span className={`flex items-center gap-2 text-xs font-bold ${pageHasQpaMismatch ? "text-rose-800" : "text-amber-800"}`}>
                              <span className={`w-4 text-center ${pageHasQpaMismatch ? "text-rose-600" : "text-amber-600"}`}>{isPageCollapsedRaw ? "▶" : "▼"}</span>
                              <span className={`bg-white border rounded px-1.5 py-0.5 ${pageHasQpaMismatch ? "border-rose-300 text-rose-700" : "border-amber-300 text-amber-700"}`}>{pn}번 명세서</span>
                              {pageSupplierHeadRaw && <span className={pageHasQpaMismatch ? "text-rose-700 font-black" : "text-amber-700 font-black"}>{pageSupplierHeadRaw}</span>}
                              <span className={pageHasQpaMismatch ? "text-rose-500 font-normal" : "text-amber-500 font-normal"}>· {pageRowCountRaw}건</span>
                              {pageHasQpaMismatch && (
                                <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-black text-white bg-rose-500 border border-rose-600 rounded px-1.5 py-0.5 animate-pulse">
                                  ⚠️ 수량×단가 ≠ 금액 {pageQpaMismatchCount}건
                                </span>
                              )}
                              {/* 🔧 컬럼 매핑 저장 · 모든 명세서에 노출 (공급사 미탐지 시 모달에서 지정 가능) */}
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); openMappingModal(pn); }}
                                className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-white border border-indigo-300 hover:bg-indigo-50 rounded px-1.5 py-0.5 whitespace-nowrap"
                                title={pageSupplierHeadRaw
                                  ? `${pageSupplierHeadRaw} 공급사의 컬럼 매핑 저장 (다음부터 자동 적용)`
                                  : "이 명세서 컬럼 매핑 지정 (공급사 미탐지 · 모달에서 입력 가능)"}
                              >
                                🔧 컬럼 매핑{pageSupplierHeadRaw && mappingSaved.has(pageSupplierHeadRaw) ? " ✓" : ""}
                              </button>
                              {/* 🔄 전체 재추출 (이 명세서 모든 행의 편집·보정 초기화 + 서버 재파싱) */}
                              <button
                                type="button"
                                onClick={async e => {
                                  e.stopPropagation();
                                  // 1) 이 페이지의 모든 행의 cellEdits/amountCorrections 초기화
                                  const pageRowIndices: number[] = [];
                                  pageNums.forEach((p, i) => { if (p === pn) pageRowIndices.push(i); });
                                  setCellEdits(prev => {
                                    const next = { ...prev };
                                    pageRowIndices.forEach(i => { delete next[i]; });
                                    return next;
                                  });
                                  setAmountCorrections(prev => {
                                    const next = { ...prev };
                                    pageRowIndices.forEach(i => { delete next[i]; });
                                    return next;
                                  });
                                  setReextractCycle(prev => {
                                    const next = { ...prev };
                                    pageRowIndices.forEach(i => { delete next[i]; });
                                    return next;
                                  });
                                  // 2) 서버 재파싱 (템플릿 + 컬럼 매핑 재적용)
                                  if (onReparsePage) {
                                    setReparseStatus(prev => ({ ...prev, [pn]: 'loading' }));
                                    setReparseSupplier(prev => ({ ...prev, [pn]: pageSupplierHeadRaw }));
                                    try {
                                      await onReparsePage(pn, pageSupplierHeadRaw);
                                      setReparseStatus(prev => ({ ...prev, [pn]: 'done' }));
                                    } catch {
                                      setReparseStatus(prev => ({ ...prev, [pn]: 'error' }));
                                    }
                                  }
                                }}
                                className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-white border border-emerald-300 hover:bg-emerald-50 rounded px-1.5 py-0.5 whitespace-nowrap"
                                title={`${pn}번 명세서 전체 재추출 · 모든 행 편집·보정 초기화 + 서버 재파싱`}
                              >
                                🔄 전체 재추출
                              </button>
                              {/* 🔄 선택 재추출 + 🗑 선택 삭제 · 이 명세서의 체크된 행만 · 2026-07-14 */}
                              {/* 항상 표시 · 0개일 때 비활성 (사용자에게 기능 존재 알림) */}
                              {(() => {
                                const pageCheckedRows: number[] = Array.from(hiddenRawRows as Set<number>).filter(ri => pageNums[ri] === pn);
                                const hasChecked = pageCheckedRows.length > 0;
                                if (!hasChecked) {
                                  return (
                                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 whitespace-nowrap" title="행 왼쪽 체크박스로 선택하면 재추출/삭제 버튼이 활성화됩니다">
                                      ☐ 선택하여 재추출/삭제
                                    </span>
                                  );
                                }
                                return (
                                  <>
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation();
                                        pageCheckedRows.forEach(ri => revertSingleRawRow(ri));
                                        setHiddenRawRows(prev => {
                                          const n = new Set(prev);
                                          pageCheckedRows.forEach(ri => n.delete(ri));
                                          return n;
                                        });
                                      }}
                                      className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-white border border-sky-300 hover:bg-sky-50 rounded px-1.5 py-0.5 whitespace-nowrap"
                                      title={`${pn}번 명세서 · 선택된 ${pageCheckedRows.length}행 재추출`}
                                    >
                                      🔄 선택 재추출 ({pageCheckedRows.length})
                                    </button>
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation();
                                        const cnt = pageCheckedRows.length;
                                        if (!window.confirm(`${pn}번 명세서의 체크된 ${cnt}개 행을 완전히 삭제하시겠습니까?\n· DB에 서명이 저장되어 다음 스캔에도 자동 필터됩니다.`)) return;
                                        const items: Array<{ supplier: string; name: string }> = [];
                                        pageCheckedRows.forEach(ri => {
                                          const row = effectiveDispRows[ri] ?? dispRows[ri];
                                          if (!Array.isArray(row)) return;
                                          const supplier = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
                                          const nameIdxLocal = dispHeaders.indexOf("품명");
                                          const name = nameIdxLocal >= 0 ? String(row[nameIdxLocal] ?? "").trim() : "";
                                          if (supplier && name) items.push({ supplier, name });
                                        });
                                        setPermanentlyDeletedRawRows(prev => {
                                          const n = new Set(prev);
                                          pageCheckedRows.forEach(ri => n.add(ri));
                                          return n;
                                        });
                                        setDbDeletedSignatures(prev => {
                                          const n = new Set(prev);
                                          items.forEach(it => n.add(makeRowSignature(it.supplier, it.name)));
                                          return n;
                                        });
                                        setHiddenRawRows(prev => {
                                          const n = new Set(prev);
                                          pageCheckedRows.forEach(ri => n.delete(ri));
                                          return n;
                                        });
                                        if (items.length > 0) {
                                          fetch("/api/ocr-deleted-rows", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ items }),
                                          }).catch(() => {});
                                        }
                                      }}
                                      className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold text-white bg-rose-500 hover:bg-rose-600 rounded px-1.5 py-0.5 whitespace-nowrap"
                                      title={`${pn}번 명세서 · 선택된 ${pageCheckedRows.length}행 완전 삭제 (DB 서명 저장)`}
                                    >
                                      🗑 선택 삭제 ({pageCheckedRows.length})
                                    </button>
                                  </>
                                );
                              })()}
                              {isPageCollapsedRaw && <span className={`ml-auto font-normal ${pageHasQpaMismatch ? "text-rose-500" : "text-amber-500"}`}>(클릭하여 펼치기)</span>}
                            </span>
                          </td>
                        </tr>
                      )}
                      {!isPageCollapsedRaw && (
                      <tr
                        className={`border-t transition-colors hover:bg-amber-50/50 ${
                          hiddenRawRows.has(ri) ? "opacity-40 line-through bg-slate-100/60" : ""
                        } ${
                          isMismatch ? "bg-rose-50/60 border-rose-100" : ri % 2 !== 0 ? "bg-gray-50/40 border-gray-100" : "border-gray-100"
                        } ${pageHasQpaMismatch ? "border-l-4 border-l-rose-500" : ""}`}
                      >
                        <td className="w-14 px-1 py-1 text-center align-middle">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="checkbox"
                              checked={hiddenRawRows.has(ri)}
                              onChange={() => toggleHiddenRawRow(ri)}
                              className="w-4 h-4 cursor-pointer accent-rose-500"
                              title={hiddenRawRows.has(ri) ? "이 행을 다시 포함" : "이 행을 소계 계산에서 제외"}
                            />
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); revertSingleRawRow(ri); }}
                              className={`text-[10px] font-bold rounded w-5 h-5 flex items-center justify-center transition cursor-pointer ${
                                (reextractCycle[ri] ?? 0) > 0
                                  ? "bg-indigo-500 text-white hover:bg-indigo-600"
                                  : "bg-slate-200 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700"
                              }`}
                              title={`재추출 (다른 값 시도) · 클릭할 때마다 순환: 원본 → 수량↔단가 스왑 → 단가↔금액 스왑 → 왼쪽 shift${(reextractCycle[ri] ?? 0) > 0 ? ` · 현재 ${reextractCycle[ri]}번째 시도` : ""}`}
                            >
                              🔄
                            </button>
                          </div>
                        </td>
                        {(() => {
                          const baseOrder = colOrder.length === dispHeaders.length ? colOrder : dispHeaders.map((_, i) => i);
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
                                  className="text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-300 rounded px-2 py-0.5 outline-none min-w-[120px] w-full"
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
                              </td>
                            );
                          }

                          if (isSupplier) {
                            return (
                              <td key={ci}
                                onClick={e => {
                                  e.stopPropagation();
                                  setEditingRawSuppRow(ri);
                                  setEditingRawSuppVal(String(cell ?? ""));
                                }}
                                className="px-2 sm:px-3 py-2 text-sky-700 font-semibold cursor-pointer hover:bg-sky-50 group max-w-[60px] sm:max-w-[120px]"
                                title={`클릭하여 공급처 변경${cell != null ? ` (${String(cell)})` : ""}`}
                              >
                                <span className="flex items-center gap-1">
                                  <span className="break-words">
                                    {cell == null ? <span className="text-gray-300">—</span> : String(cell)}
                                  </span>
                                  <Pencil size={9} className="text-sky-300 opacity-0 group-hover:opacity-100 transition shrink-0" />
                                </span>
                              </td>
                            );
                          }

                          // 일자: 날짜 + 이미지 보기 버튼
                          if (h === "일자" && pageImages?.length) {
                            return (
                              <td key={ci} className="px-2 py-1.5" onClick={e => e.stopPropagation()}>
                                <div className="flex flex-col items-start gap-0.5">
                                  {cell != null && <span className="text-gray-400 text-[10px]">{String(cell)}</span>}
                                  <button
                                    onClick={() => openModal(ri)}
                                    className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded px-1.5 py-0.5 leading-tight"
                                  >
                                    보기
                                  </button>
                                </div>
                              </td>
                            );
                          }

                          // 수량/단가/금액 인라인 편집 — 입력 중
                          if (isEditingThisNum) {
                            return (
                              <td key={ci} className="px-1 py-1" onClick={e => e.stopPropagation()}>
                                <input
                                  autoFocus
                                  type="text"
                                  inputMode="numeric"
                                  className="text-xs font-bold text-right text-indigo-700 bg-indigo-50 border border-indigo-300 rounded px-2 py-0.5 outline-none w-full min-w-[60px]"
                                  value={editingCellVal}
                                  onChange={e => setEditingCellVal(e.target.value)}
                                  onKeyDown={e => {
                                    const moveToCell = (nextRi: number, nextCi: number) => {
                                      const cellVal = effectiveDispRows[nextRi]?.[nextCi];
                                      setEditingCell({ ri: nextRi, ci: nextCi });
                                      setEditingCellVal(cellVal != null ? String(parseNumber(cellVal) || "") : "");
                                    };
                                    const editableIdxs = [dispHeaders.indexOf("수량"), dispHeaders.indexOf("단가"), dispHeaders.indexOf("금액")].filter(i => i >= 0).sort((a,b) => a - b);
                                    const curPos = editableIdxs.indexOf(ci);
                                    const input = e.currentTarget as HTMLInputElement;
                                    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
                                    const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;

                                    if (e.key === "Enter" || e.key === "Tab") {
                                      e.preventDefault();
                                      commitCellEdit(ri, ci, editingCellVal);
                                      const nextCi = e.shiftKey
                                        ? (curPos > 0 ? editableIdxs[curPos - 1] : editableIdxs[editableIdxs.length - 1])
                                        : (curPos >= 0 && curPos < editableIdxs.length - 1 ? editableIdxs[curPos + 1] : editableIdxs[0]);
                                      if (nextCi != null && nextCi !== ci) moveToCell(ri, nextCi);
                                      else setEditingCell(null);
                                      return;
                                    }
                                    if (e.key === "Escape") { setEditingCell(null); return; }

                                    // 방향키로 셀 이동 · 텍스트 편집 방해 없이:
                                    //   ← : 커서가 맨 앞이면 왼쪽 셀로
                                    //   → : 커서가 맨 뒤면 오른쪽 셀로
                                    //   ↑↓: 항상 위/아래 행 같은 컬럼으로
                                    if (e.key === "ArrowLeft" && atStart && curPos > 0) {
                                      e.preventDefault();
                                      commitCellEdit(ri, ci, editingCellVal);
                                      moveToCell(ri, editableIdxs[curPos - 1]);
                                      return;
                                    }
                                    if (e.key === "ArrowRight" && atEnd && curPos < editableIdxs.length - 1) {
                                      e.preventDefault();
                                      commitCellEdit(ri, ci, editingCellVal);
                                      moveToCell(ri, editableIdxs[curPos + 1]);
                                      return;
                                    }
                                    if (e.key === "ArrowDown" && ri < effectiveDispRows.length - 1) {
                                      e.preventDefault();
                                      commitCellEdit(ri, ci, editingCellVal);
                                      moveToCell(ri + 1, ci);
                                      return;
                                    }
                                    if (e.key === "ArrowUp" && ri > 0) {
                                      e.preventDefault();
                                      commitCellEdit(ri, ci, editingCellVal);
                                      moveToCell(ri - 1, ci);
                                      return;
                                    }
                                  }}
                                  onBlur={() => commitCellEdit(ri, ci, editingCellVal)}
                                />
                              </td>
                            );
                          }

                          // 수량/단가/금액 인라인 편집 — 클릭 가능 셀
                          //   · 일반 클릭: 편집 모드
                          //   · Alt+Click: 셀 체크 토글 (재추출/삭제 대상)
                          if (isEditableNum) {
                            const cellKey = `${ri}:${ci}`;
                            const isCellChecked = checkedCells.has(cellKey);
                            return (
                              <td key={ci}
                                onClick={e => {
                                  e.stopPropagation();
                                  if (e.altKey || e.ctrlKey || e.metaKey) {
                                    toggleCellCheck(ri, ci);
                                    return;
                                  }
                                  setEditingCell({ ri, ci });
                                  // 금액 셀이 비어있으면 수량×단가 자동 계산값 프리필
                                  if (isAmt && (cell == null || parseNumber(cell) <= 0)) {
                                    const qtyIdx = dispHeaders.indexOf("수량");
                                    const priIdx = dispHeaders.indexOf("단가");
                                    if (qtyIdx >= 0 && priIdx >= 0) {
                                      const q = parseNumber(effectiveDispRows[ri]?.[qtyIdx]);
                                      const p = parseNumber(effectiveDispRows[ri]?.[priIdx]);
                                      if (q > 0 && p > 0) {
                                        setEditingCellVal(String(Math.round(q * p)));
                                        return;
                                      }
                                    }
                                  }
                                  const rawNum = cell != null ? String(parseNumber(cell) || "") : "";
                                  setEditingCellVal(rawNum);
                                }}
                                className={`px-3 py-2 whitespace-nowrap text-right cursor-pointer hover:bg-indigo-50/60 group ${
                                  isCellChecked ? "bg-sky-100 ring-1 ring-sky-400" :
                                  isMismatch && isAmt ? "text-amber-700 font-bold" : "font-bold text-amber-800"
                                }`}
                                title={isCellChecked ? "체크됨 (Alt+Click 해제)" : "클릭하여 수정 · Alt+Click 으로 선택"}
                              >
                                <span className="flex items-center justify-end gap-1">
                                  {isMismatch && isAmt && <AlertTriangle size={9} className="text-rose-400 shrink-0" />}
                                  {(() => {
                                    // 금액이 비어있으면 수량×단가 자동 계산값 표시 + 확인 배지
                                    if (isAmt && (cell == null || parseNumber(cell) <= 0)) {
                                      const qtyIdx2 = dispHeaders.indexOf("수량");
                                      const priIdx2 = dispHeaders.indexOf("단가");
                                      if (qtyIdx2 >= 0 && priIdx2 >= 0) {
                                        const q2 = parseNumber(effectiveDispRows[ri]?.[qtyIdx2]);
                                        const p2 = parseNumber(effectiveDispRows[ri]?.[priIdx2]);
                                        if (q2 > 0 && p2 > 0) {
                                          const auto = Math.round(q2 * p2);
                                          return (
                                            <>
                                              <span className="text-amber-700 font-bold">{fmt(auto)}</span>
                                              <span className="text-[9px] bg-amber-100 text-amber-700 border border-amber-300 px-1 rounded font-bold whitespace-nowrap" title="수량 × 단가 자동 계산 · 클릭하여 확인/수정">
                                                ⚠ 자동계산확인필요
                                              </span>
                                            </>
                                          );
                                        }
                                      }
                                      return <span className="text-gray-300">—</span>;
                                    }
                                    return (
                                      <span className={hasDirectEdit ? "text-indigo-700" : isCorrectedAmt ? "text-emerald-700" : ""}>
                                        {typeof cell === "number" ? fmt(cell) : String(cell)}
                                      </span>
                                    );
                                  })()}
                                  {hasDirectEdit && <span className="text-[9px] bg-indigo-100 text-indigo-600 px-1 rounded font-bold">수정</span>}
                                  {isCorrectedAmt && <span className="text-[9px] bg-emerald-100 text-emerald-600 px-1 rounded font-bold">보정</span>}
                                  <Pencil size={8} className="text-indigo-200 opacity-0 group-hover:opacity-100 transition shrink-0" />
                                </span>
                              </td>
                            );
                          }

                          // 바코드 100% 확정 매칭
                          if (isName && barcodeMatch && !matchItems) {
                            return (
                              <td key={ci} className="px-3 py-2 max-w-[240px]">
                                <div className="flex flex-col gap-0">
                                  <span className="flex items-center gap-1">
                                    <span className="text-[9px] bg-emerald-100 text-emerald-700 font-black px-1 rounded shrink-0">BC</span>
                                    <span className="font-semibold text-emerald-700 break-words whitespace-normal">{renderTextWithBreaks(barcodeMatch.name)}</span>
                                    <button
                                      type="button"
                                      title="ERP 자동보정 취소 → 원본 이름으로 복원"
                                      onClick={e => { e.stopPropagation(); setCancelledAutoMap(prev => new Set([...prev, ri])); }}
                                      className="text-[9px] px-1 py-px rounded bg-rose-100 text-rose-600 hover:bg-rose-200 cursor-pointer shrink-0"
                                    >✕</button>
                                  </span>
                                  <span className="text-gray-300 text-[10px] line-through break-words whitespace-normal">{renderTextWithBreaks(String(origCell ?? ""))}</span>
                                </div>
                              </td>
                            );
                          }

                          // ── 품명 인라인 편집 (autoMatch/일반/취소 통합) ──────────
                          if (isName && !matchItems) {
                            const rawSupplierForRow = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? globalSupplier ?? "";
                            // 편집 중: 입력창 + fixed-position 드롭다운(별도 렌더)
                            if (editingNameRow === ri) {
                              return (
                                <td key={ci} className="px-2 py-1.5 max-w-[260px]" onClick={e => e.stopPropagation()}>
                                  <input
                                    ref={nameInputRef}
                                    autoFocus
                                    className="w-full text-[11px] font-semibold text-gray-800 bg-indigo-50 border border-indigo-300 rounded px-2 py-0.5 outline-none"
                                    value={editingNameVal}
                                    placeholder={String(origCell ?? cell ?? "")}
                                    onChange={e => {
                                      const v = e.target.value;
                                      setEditingNameVal(v);
                                      if (nameEditSearchRef.current) clearTimeout(nameEditSearchRef.current);
                                      if (v.trim().length < 2) {
                                        setNameEditResults([]);
                                        setNameEditSearchDone(false);
                                        setNameDropdownRect(null);
                                        return;
                                      }
                                      // rect를 즉시 설정하여 드롭다운 위치 확보
                                      if (nameInputRef.current) {
                                        const r = nameInputRef.current.getBoundingClientRect();
                                        setNameDropdownRect({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 220) });
                                      }
                                      setNameEditSearchDone(false);
                                      nameEditSearchRef.current = setTimeout(async () => {
                                        const params = new URLSearchParams({ q: v.trim() });
                                        if (rawSupplierForRow) params.set("supplier", rawSupplierForRow);
                                        try {
                                          const res = await fetch(`/api/products-search?${params}`);
                                          const data: any[] = await res.json();
                                          const results = Array.isArray(data) ? data : [];
                                          setNameEditResults(results);
                                          setNameEditSearchDone(true);
                                        } catch {
                                          setNameEditResults([]);
                                          setNameEditSearchDone(false);
                                          setNameDropdownRect(null);
                                        }
                                      }, 280);
                                    }}
                                    onKeyDown={e => {
                                      if (e.key === "Escape") {
                                        setEditingNameRow(null);
                                        setNameEditResults([]);
                                        setNameEditSearchDone(false);
                                        setNameDropdownRect(null);
                                      }
                                      if (e.key === "Enter") e.currentTarget.blur();
                                    }}
                                    onBlur={() => setTimeout(() => {
                                      setEditingNameRow(null);
                                      setNameEditResults([]);
                                      setNameEditSearchDone(false);
                                      setNameDropdownRect(null);
                                    }, 150)}
                                  />
                                </td>
                              );
                            }

                            // autoMatch 존재: 보정된 이름 + 연필(수정) + 원본명(클릭 → 삭제 확인)
                            if (autoMatch) {
                              return (
                                <td key={ci}
                                  onClick={e => {
                                    e.stopPropagation();
                                    setEditingNameRow(ri);
                                    setEditingNameVal(String(origCell ?? ""));
                                    setNameEditResults([]);
                                    setNameEditSearchDone(false);
                                    setNameDropdownRect(null);
                                  }}
                                  className="px-3 py-2 max-w-[240px] cursor-pointer hover:bg-indigo-50/60 group"
                                  title="클릭하여 상품명 수정">
                                  <div className="flex flex-col gap-0">
                                    <span className="flex items-center gap-1">
                                      <BookOpen size={9} className="text-indigo-400 shrink-0" />
                                      <span className="font-semibold text-indigo-700 break-words whitespace-normal">{renderTextWithBreaks(autoMatch.name)}</span>
                                      <Pencil size={8} className="text-indigo-200 opacity-0 group-hover:opacity-100 transition shrink-0" />
                                      <button
                                        type="button"
                                        title="ERP 자동보정 취소 → 원본 이름으로 복원"
                                        onClick={e => { e.stopPropagation(); setCancelledAutoMap(prev => new Set([...prev, ri])); }}
                                        className="text-[9px] px-1 py-px rounded bg-rose-100 text-rose-600 hover:bg-rose-200 cursor-pointer shrink-0"
                                      >✕</button>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={e => { e.stopPropagation(); setDeleteSynConfirm({ ri, origName: String(origCell ?? "") }); }}
                                      className="text-gray-300 text-[10px] line-through break-words whitespace-normal hover:text-rose-400 cursor-pointer text-left"
                                      title="클릭하여 동의어 삭제"
                                    >
                                      {renderTextWithBreaks(String(origCell ?? ""))}
                                    </button>
                                  </div>
                                </td>
                              );
                            }

                            // 일반 품명 (autoMatch 없음, barcodeMatch도 없음) → 클릭 편집
                            const isCancelledAutoMap = cancelledAutoMap.has(ri);
                            return (
                              <td key={ci}
                                onClick={e => {
                                  e.stopPropagation();
                                  setEditingNameRow(ri);
                                  setEditingNameVal(String(cell ?? ""));
                                  setNameEditResults([]);
                                  setNameEditSearchDone(false);
                                  setNameDropdownRect(null);
                                }}
                                className="px-3 py-2 cursor-pointer hover:bg-indigo-50/60 group"
                                title="클릭하여 상품명 수정">
                                <span className="flex items-center gap-1">
                                  <span className="font-semibold text-gray-900 break-words whitespace-normal">
                                    {cell == null ? <span className="text-gray-300">—</span> : renderTextWithBreaks(String(cell))}
                                  </span>
                                  <Pencil size={8} className="text-indigo-200 opacity-0 group-hover:opacity-100 transition shrink-0" />
                                  {isCancelledAutoMap && (
                                    <button
                                      type="button"
                                      title="ERP 자동보정 복원"
                                      onClick={e => {
                                        e.stopPropagation();
                                        setCancelledAutoMap(prev => { const s = new Set(prev); s.delete(ri); return s; });
                                      }}
                                      className="text-[9px] px-1 py-px rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 cursor-pointer shrink-0"
                                    >↩ 복원</button>
                                  )}
                                </span>
                              </td>
                            );
                          }

                          // 규격 컬럼: 폭 제한 + 줄바꿈 + 2줄 이상 말줄임
                          if (h === "규격") {
                            return (
                              <td key={ci} className="px-3 py-2 max-w-[80px] text-gray-600">
                                <span className="block line-clamp-2 break-words text-[10px]">
                                  {cell == null ? <span className="text-gray-300">—</span> : String(cell)}
                                </span>
                              </td>
                            );
                          }

                          {
                            const cellStr = cell == null ? "" : String(cell);
                            const hasEllipsis = !isNum && /\.{3}|…/.test(cellStr);
                            return (
                              <td key={ci}
                                className={`px-3 py-2 ${
                                  isAmt ? "text-right font-bold text-amber-800 whitespace-nowrap" :
                                  isNum ? "text-right text-gray-700 whitespace-nowrap" :
                                  h === "품명" ? "font-semibold text-gray-900 break-words whitespace-normal align-top min-w-[180px] max-w-[240px]" :
                                  hasEllipsis ? "text-gray-600 break-words whitespace-normal" :
                                                "text-gray-600 whitespace-nowrap"
                                }`}>
                                {h === "품명"
                                  ? <span className="block line-clamp-2">{cell == null ? <span className="text-gray-300">—</span> : renderTextWithBreaks(cellStr)}</span>
                                  : (cell == null ? <span className="text-gray-300">—</span> : isNum ? fmt(cell) : renderTextWithBreaks(cellStr))}
                              </td>
                            );
                          }
                        })}
                      </tr>
                      )}
                      {isLastInPage && amtIdx >= 0 && (() => {
                        const pageSupplier = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
                        const configuredLabel = pageSupplier ? balanceConfig[pageSupplier] : undefined;
                        const balanceCands = pageBalanceCandidates.get(pn) ?? [];
                        const balanceAmount = configuredLabel
                          ? (balanceCands.find(c => c.label === configuredLabel)?.amount
                             ?? (configuredLabel && ["합계", "합계액", "총합계"].includes(configuredLabel) ? (structuredPages.find(p => p.page === pn)?.meta.total ?? null) : null))
                          : null;
                        // 다중 페이지가 아니면 소계 행은 생략, 잔고+드롭다운만 표시
                        const isMultiPage = uniquePageNums.length > 1;
                        // 현재 렌더링 중인 컬럼 순서 (compact/detail 모드에 따라)
                        const baseOrder2 = colOrder.length === dispHeaders.length ? colOrder : dispHeaders.map((_, i) => i);
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
                        const amtOrderIdx = orderNow.indexOf(amtIdx);
                        const cands = pageBalanceCandidates.get(pn) ?? [];
                        const overrideVal = pageBalanceOverride[pn];
                        const effectiveBal = overrideVal ?? balanceAmount;
                        const isMismatch = balanceAmount != null && overrideVal != null && overrideVal !== balanceAmount;
                        const pageHasQpaErr = (pageQtyPriceAmtMismatch.get(pn) ?? 0) > 0;
                        return (
                          <>
                            {/* ── 통합 소계+잔고 요약 행 (불일치 있으면 붉은 강조) ── */}
                            <tr className={`border-t-2 ${pageHasQpaErr ? "border-rose-500" : "border-amber-400"}`}>
                              <td
                                colSpan={totalColSpan}
                                className={`px-0 py-0 ${pageHasQpaErr ? "border-l-4 border-l-rose-500 border-r-4 border-r-rose-500 border-b-2 border-b-rose-500" : ""}`}
                                style={{
                                  background: pageHasQpaErr
                                    ? "linear-gradient(90deg, #ffe4e6 0%, #fecaca 55%, #fca5a5 100%)"
                                    : "linear-gradient(90deg, #fef3c7 0%, #ffedd5 55%, #fed7aa 100%)"
                                }}
                              >
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1 md:gap-2 px-3 py-1.5">

                                  {/* 좌측: [N번 명세서 소계] [명세서 보기] [공급사 잔고] [공급사] · 반응형 wrap */}
                                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                                    <span className="text-amber-700 font-black text-[10px] tracking-wide uppercase whitespace-nowrap bg-amber-200/60 border border-amber-300 rounded px-1.5 py-0.5">
                                      {pn}번 명세서 소계
                                    </span>
                                    {pageImages?.length ? (
                                      <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); openPageModal(pn); }}
                                        className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-amber-500 hover:bg-amber-600 active:bg-amber-700 px-2 py-0.5 rounded shadow-sm transition cursor-pointer whitespace-nowrap"
                                        title={`${pn}번 거래명세서 이미지 보기`}
                                      >
                                        📄 <span className="hidden sm:inline">거래명세서</span>보기
                                      </button>
                                    ) : null}
                                    {/* 공급사 잔고 값 (있으면 · 공급사 앞에 표시) */}
                                    {(() => {
                                      const bal = pageSupplierBalances[pn] ?? pageBalanceOverride[pn];
                                      const manualBal = pageBalanceModeManual.has(pn) ? parseNumber(pageBalanceManualInput[pn] ?? "") : 0;
                                      const displayBal = bal ?? (manualBal > 0 ? manualBal : null);
                                      if (displayBal == null || displayBal <= 0) return null;
                                      return (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-300 rounded px-1.5 py-0.5 whitespace-nowrap"
                                          title="공급사 잔고">
                                          💰 {fmt(displayBal)}
                                        </span>
                                      );
                                    })()}
                                    {pageSupplier && (
                                      <span className="text-amber-800 font-black text-[11px] whitespace-nowrap">
                                        {pageSupplier}
                                      </span>
                                    )}
                                  </div>

                                  {/* 중앙: 소계 금액 — 명세서 합계 기준, 에누리 있으면 적용 전 금액 표시. 직접 입력 가능. */}
                                  <div className="flex items-center justify-start md:justify-center flex-wrap gap-1.5 md:flex-1 md:min-w-[120px]">
                                    {(() => {
                                      const displayTotal = getPageDisplayTotal(pn);
                                      const pageData = structuredPages.find(p => p.page === pn);
                                      const stated = pageData?.meta?.total ?? null;
                                      const disc = getPageDiscount(pn);
                                      const isCustom = pageSubtotalChoices[pn] === "custom";
                                      return (
                                        <div className="flex items-center gap-2">
                                          {isCustom ? (
                                            <>
                                              <input
                                                type="text"
                                                inputMode="numeric"
                                                value={(() => {
                                                  const raw = String(pageSubtotalCustom[pn] ?? "");
                                                  const n = parseNumber(raw);
                                                  return n > 0 ? fmt(n) : raw;
                                                })()}
                                                onChange={e => {
                                                  const raw = e.target.value.replace(/[^\d-]/g, "");
                                                  setPageSubtotalCustom(prev => ({ ...prev, [pn]: parseNumber(raw) }));
                                                }}
                                                placeholder="금액"
                                                className="w-[120px] text-base font-black text-amber-900 bg-white border-2 border-amber-400 rounded px-2 py-0.5 focus:outline-none focus:border-amber-600 text-right"
                                                autoFocus
                                              />
                                              <span className="font-black text-base text-amber-900">원</span>
                                              <button
                                                type="button"
                                                onClick={() => setPageSubtotalChoices(prev => { const n = { ...prev }; delete n[pn]; return n; })}
                                                className="text-[9px] font-bold text-slate-500 hover:text-slate-700 bg-white/70 border border-slate-300 rounded px-1.5 py-0.5 cursor-pointer"
                                                title="자동값으로 되돌리기"
                                              >취소</button>
                                            </>
                                          ) : (
                                            <>
                                              <span
                                                className="font-black text-base tracking-tight whitespace-nowrap text-amber-900"
                                                title={disc
                                                  ? `명세서 합계 ${fmt(stated ?? 0)}원 + ${disc.label} ${fmt(disc.amount)}원 (에누리 적용 전 금액)`
                                                  : `명세서 합계 ${fmt(displayTotal)}원`}
                                              >
                                                {fmt(displayTotal)}원
                                              </span>
                                              {disc && (
                                                <span className="text-[9px] font-bold text-amber-700 bg-white/70 border border-amber-300 rounded px-1.5 py-0.5 whitespace-nowrap"
                                                  title={`합계 ${fmt(stated ?? 0)}원 + ${disc.label} ${fmt(disc.amount)}원 = ${fmt(displayTotal)}원`}>
                                                  {disc.label} {fmt(disc.amount)}원 적용 전
                                                </span>
                                              )}
                                              {/* ── 교차검증 배지 (행합 · 수량×단가합 · OCR총계 대조) ── */}
                                              {(() => {
                                                const rowSum = effectivePageTotals.get(pn) ?? 0;
                                                const qpSum  = effectivePageQtyPrice.get(pn) ?? 0;
                                                const statedTotal = stated ?? null;
                                                const qpaMismatchCount = pageQtyPriceAmtMismatch.get(pn) ?? 0;
                                                const rowSumOk = statedTotal != null && Math.abs(rowSum - statedTotal) <= Math.max(1, statedTotal * 0.02);
                                                const qpSumOk = qpSum > 0 && Math.abs(qpSum - rowSum) <= Math.max(1, rowSum * 0.02);
                                                const allOk = qpaMismatchCount === 0 && (statedTotal == null || rowSumOk);
                                                return (
                                                  <span
                                                    className={`text-[9px] font-black border rounded px-1.5 py-0.5 whitespace-nowrap ${
                                                      allOk
                                                        ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                                        : "bg-rose-50 text-rose-700 border-rose-300"
                                                    }`}
                                                    title={
                                                      `[교차검증]\n` +
                                                      `· 행 금액합: ${fmt(rowSum)}원\n` +
                                                      `· 수량×단가 합: ${fmt(qpSum)}원 (${qpSumOk ? "일치" : "불일치"})\n` +
                                                      (statedTotal != null ? `· OCR 소계: ${fmt(statedTotal)}원 (${rowSumOk ? "일치" : `Δ=${fmt(Math.abs(rowSum - statedTotal))}`})\n` : "· OCR 소계 없음\n") +
                                                      `· 행 수식 오탐: ${qpaMismatchCount}건`
                                                    }
                                                  >
                                                    {allOk ? "✓ 교차검증" : `⚠ 교차검증 · 행합 ${fmt(rowSum)}${statedTotal != null && !rowSumOk ? ` ≠ OCR ${fmt(statedTotal)}` : ""}${qpaMismatchCount > 0 ? ` · 수식오탐 ${qpaMismatchCount}건` : ""}`}
                                                  </span>
                                                );
                                              })()}
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setPageSubtotalChoices(prev => ({ ...prev, [pn]: "custom" }));
                                                  setPageSubtotalCustom(prev => ({ ...prev, [pn]: displayTotal }));
                                                }}
                                                className="text-[9px] font-bold text-amber-700 hover:text-amber-900 bg-white/70 border border-amber-300 rounded px-1.5 py-0.5 cursor-pointer whitespace-nowrap"
                                                title="소계 금액 직접 입력"
                                              >✎ 수정</button>
                                            </>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </div>

                                  {/* 우측: 공급사 잔고 드롭박스 + 직접입력 + 기록안함 + 확인 */}
                                  <div className="flex items-center gap-1.5 flex-wrap justify-start md:justify-end border-t border-amber-300/50 md:border-0 pt-1 md:pt-0">
                                    <span className="text-rose-600 font-bold text-[10px] whitespace-nowrap">공급사 잔고</span>
                                    {(() => {
                                      const allAmts = pageAmountCandidates.get(pn) ?? [];
                                      // 정렬 우선순위:
                                      //   1) 사용자가 이 공급사에 대해 이전에 저장한 balance_field
                                      //   2) DB에 학습된 다른 공급사 라벨 (learnedLabels)
                                      //   3) 라벨 길이가 긴 것 (더 구체적) 먼저
                                      const currentSupplierLabel = pageSupplier ? balanceConfig[pageSupplier] : undefined;
                                      const labeledSorted = [...cands].sort((a, b) => {
                                        const aMatchesCurrent = currentSupplierLabel && a.label.includes(currentSupplierLabel);
                                        const bMatchesCurrent = currentSupplierLabel && b.label.includes(currentSupplierLabel);
                                        if (aMatchesCurrent && !bMatchesCurrent) return -1;
                                        if (bMatchesCurrent && !aMatchesCurrent) return 1;
                                        const aInLearned = Array.from(learnedLabels).some(lk => a.label.includes(lk));
                                        const bInLearned = Array.from(learnedLabels).some(lk => b.label.includes(lk));
                                        if (aInLearned && !bInLearned) return -1;
                                        if (bInLearned && !aInLearned) return 1;
                                        return b.label.length - a.label.length;
                                      });
                                      const labeledAmts = new Set(labeledSorted.map(c => c.amount));
                                      // 2) 나머지 금액 (라벨 없는 것)
                                      const otherAmts = allAmts.filter(a => !labeledAmts.has(a));
                                      const isManual = pageBalanceModeManual.has(pn);
                                      const isSkip   = pageBalanceModeSkip.has(pn);
                                      const currentVal = isManual ? "__manual__" : isSkip ? "__skip__" : (overrideVal != null ? String(overrideVal) : (balanceAmount ?? ""));
                                      return (
                                        <select
                                          value={currentVal}
                                          onChange={e => {
                                            const v = e.target.value;
                                            setSavedBalancePages(prev => { const n = new Set(prev); n.delete(pn); return n; });
                                            if (v === "__manual__") {
                                              setPageBalanceModeManual(prev => new Set([...prev, pn]));
                                              setPageBalanceModeSkip(prev => { const n = new Set(prev); n.delete(pn); return n; });
                                              setPageBalanceOverride(prev => { const n = { ...prev }; delete n[pn]; return n; });
                                            } else if (v === "__skip__") {
                                              setPageBalanceModeSkip(prev => new Set([...prev, pn]));
                                              setPageBalanceModeManual(prev => { const n = new Set(prev); n.delete(pn); return n; });
                                              setPageBalanceOverride(prev => { const n = { ...prev }; delete n[pn]; return n; });
                                              setPageBalanceManualInput(prev => { const n = { ...prev }; delete n[pn]; return n; });
                                            } else if (v === "") {
                                              setPageBalanceModeManual(prev => { const n = new Set(prev); n.delete(pn); return n; });
                                              setPageBalanceModeSkip(prev => { const n = new Set(prev); n.delete(pn); return n; });
                                              setPageBalanceOverride(prev => { const n = { ...prev }; delete n[pn]; return n; });
                                            } else {
                                              setPageBalanceOverride(prev => ({ ...prev, [pn]: Number(v) }));
                                              setPageBalanceModeManual(prev => { const n = new Set(prev); n.delete(pn); return n; });
                                              setPageBalanceModeSkip(prev => { const n = new Set(prev); n.delete(pn); return n; });
                                            }
                                          }}
                                          className="text-[10px] font-bold text-orange-800 bg-white/80 border border-orange-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-orange-500 focus:bg-white cursor-pointer min-w-[160px] shadow-sm"
                                          title={`${pn}번 명세서의 공급사 잔고 값 선택`}
                                        >
                                          <option value="">-- 금액 선택 --</option>
                                          {labeledSorted.length > 0 && (
                                            <optgroup label="잔고항목 지정 (우선)">
                                              {labeledSorted.map((c, ci) => (
                                                <option key={`l-${ci}`} value={c.amount}>
                                                  {c.label} · {fmt(c.amount)}원
                                                </option>
                                              ))}
                                            </optgroup>
                                          )}
                                          {otherAmts.length > 0 && (
                                            <optgroup label="기타 OCR 금액">
                                              {otherAmts.map((amt, ai) => (
                                                <option key={`o-${ai}`} value={amt}>
                                                  {fmt(amt)}원
                                                </option>
                                              ))}
                                            </optgroup>
                                          )}
                                          <option value="__manual__">✎ 직접 입력…</option>
                                          <option value="__skip__">— 기록 안 함 —</option>
                                        </select>
                                      );
                                    })()}
                                    {/* 🔄 재추출: 다음 OCR 금액 후보로 순환 */}
                                    {(() => {
                                      const allAmts = pageAmountCandidates.get(pn) ?? [];
                                      if (allAmts.length === 0) return null;
                                      const cycleIdx = balanceReextractCycle[pn] ?? -1;
                                      return (
                                        <button
                                          type="button"
                                          onClick={e => {
                                            e.stopPropagation();
                                            const next = (cycleIdx + 1) % allAmts.length;
                                            setBalanceReextractCycle(prev => ({ ...prev, [pn]: next }));
                                            setPageBalanceOverride(prev => ({ ...prev, [pn]: allAmts[next] }));
                                            setPageBalanceModeManual(prev => { const n = new Set(prev); n.delete(pn); return n; });
                                            setPageBalanceModeSkip(prev => { const n = new Set(prev); n.delete(pn); return n; });
                                            setSavedBalancePages(prev => { const n = new Set(prev); n.delete(pn); return n; });
                                          }}
                                          className={`text-[10px] font-black rounded w-6 h-6 flex items-center justify-center transition cursor-pointer border ${
                                            cycleIdx >= 0
                                              ? "bg-indigo-500 text-white border-indigo-600 hover:bg-indigo-600"
                                              : "bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50"
                                          }`}
                                          title={`재추출 · 다른 OCR 금액 후보 시도 (${(pageAmountCandidates.get(pn) ?? []).length}개 후보)${cycleIdx >= 0 ? ` · 현재 ${cycleIdx + 1}/${(pageAmountCandidates.get(pn) ?? []).length}` : ""}`}
                                        >
                                          🔄
                                        </button>
                                      );
                                    })()}
                                    {/* ✎ 직접 입력 (드롭다운 옵션 대신 원클릭) */}
                                    {!pageBalanceModeManual.has(pn) && (
                                      <button
                                        type="button"
                                        onClick={e => {
                                          e.stopPropagation();
                                          setPageBalanceModeManual(prev => new Set([...prev, pn]));
                                          setPageBalanceModeSkip(prev => { const n = new Set(prev); n.delete(pn); return n; });
                                          setPageBalanceOverride(prev => { const n = { ...prev }; delete n[pn]; return n; });
                                          setSavedBalancePages(prev => { const n = new Set(prev); n.delete(pn); return n; });
                                        }}
                                        className="text-[10px] font-black rounded w-6 h-6 flex items-center justify-center transition cursor-pointer border bg-white text-orange-700 border-orange-300 hover:bg-orange-50"
                                        title="공급사 잔고 직접 입력 모드"
                                      >
                                        ✎
                                      </button>
                                    )}
                                    {/* 직접 입력 필드 — 통화 형식(콤마) 표시 */}
                                    {pageBalanceModeManual.has(pn) && (() => {
                                      const rawDigits = pageBalanceManualInput[pn] ?? "";
                                      const n = parseNumber(rawDigits);
                                      const display = n > 0 ? fmt(n) : rawDigits;
                                      return (
                                        <div className="flex items-center gap-0.5">
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            placeholder="0"
                                            value={display}
                                            onChange={e => {
                                              const raw = e.target.value.replace(/[^\d-]/g, "");
                                              setPageBalanceManualInput(prev => ({ ...prev, [pn]: raw }));
                                              setSavedBalancePages(prev => { const s = new Set(prev); s.delete(pn); return s; });
                                            }}
                                            className="text-[10px] font-bold text-orange-800 bg-white border border-orange-400 rounded px-1.5 py-0.5 focus:outline-none focus:border-orange-500 shadow-sm w-[110px] text-right"
                                          />
                                          <span className="text-[10px] font-bold text-orange-700">원</span>
                                        </div>
                                      );
                                    })()}
                                    {/* 상태 배지 */}
                                    {pageBalanceModeSkip.has(pn) && (
                                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded border bg-slate-100 text-slate-600 border-slate-300 whitespace-nowrap">기록 안 함</span>
                                    )}
                                    {!pageBalanceModeManual.has(pn) && !pageBalanceModeSkip.has(pn) && overrideVal != null && (
                                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border whitespace-nowrap ${
                                        isMismatch
                                          ? "bg-rose-100 text-rose-600 border-rose-300"
                                          : "bg-emerald-100 text-emerald-700 border-emerald-300"
                                      }`}>
                                        {isMismatch ? "불일치" : "선택됨"}
                                      </span>
                                    )}
                                    {/* 확인 버튼: 3가지 모드 모두 저장 */}
                                    {(overrideVal != null || pageBalanceModeManual.has(pn) || pageBalanceModeSkip.has(pn)) && (
                                      <button
                                        type="button"
                                        onClick={async e => {
                                          e.stopPropagation();
                                          const isManual = pageBalanceModeManual.has(pn);
                                          const isSkip = pageBalanceModeSkip.has(pn);
                                          let saveAmt: number | null = null;
                                          let saveLabel = "";
                                          if (isSkip) {
                                            saveLabel = "(없음)";
                                            setPageSupplierBalances(prev => { const n = { ...prev }; delete n[pn]; return n; });
                                          } else if (isManual) {
                                            const raw = pageBalanceManualInput[pn] ?? "";
                                            const n = parseNumber(raw);
                                            if (n > 0) {
                                              saveAmt = n;
                                              saveLabel = "직접입력";
                                              setPageSupplierBalances(prev => ({ ...prev, [pn]: n }));
                                            } else return;
                                          } else if (overrideVal != null) {
                                            saveAmt = overrideVal;
                                            const picked = cands.find(c => c.amount === overrideVal);
                                            saveLabel = picked?.label ?? "직접선택";
                                            setPageSupplierBalances(prev => ({ ...prev, [pn]: overrideVal }));
                                          }
                                          if (pageSupplier) {
                                            try {
                                              const currentColOrder = colOrder.length === dispHeaders.length ? colOrder : dispHeaders.map((_, i) => i);
                                              // 소계 공식 자동 감지: 선택한 값 = A - B 형태인지 확인 (예: 합계액 = 총합계액 - 에누리액)
                                              let subtotalFormula: any = null;
                                              if (saveAmt != null && saveAmt > 0) {
                                                const labelMap = pageBalanceCandidatesForFormula.get(pn) ?? new Map<string, number>();
                                                const entries = Array.from(labelMap.entries()).filter(([lbl]) => lbl !== saveLabel);
                                                for (let i = 0; i < entries.length && !subtotalFormula; i++) {
                                                  for (let j = 0; j < entries.length; j++) {
                                                    if (i === j) continue;
                                                    const [labelA, valA] = entries[i];
                                                    const [labelB, valB] = entries[j];
                                                    if (Math.abs(valA - valB - saveAmt) <= 1) {
                                                      subtotalFormula = {
                                                        subtotal: { positive: [labelA], negative: [labelB] },
                                                        resultLabel: saveLabel,
                                                      };
                                                      break;
                                                    }
                                                  }
                                                }
                                              }
                                              const layoutPayload: any = { col_order: currentColOrder, headers: dispHeaders };
                                              if (subtotalFormula) {
                                                layoutPayload.subtotal_formula = subtotalFormula;
                                                // 로컬 캐시도 즉시 업데이트
                                                setSupplierFormulaCache(prev => ({ ...prev, [pageSupplier]: subtotalFormula }));
                                              }
                                              await fetch("/api/supplier-balance-configs", {
                                                method: "PUT",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({
                                                  supplier_name: pageSupplier,
                                                  balance_field: saveLabel,
                                                  column_layout: layoutPayload,
                                                }),
                                              });
                                            } catch (err) { console.warn("[supplier-balance-configs] 저장 실패", err); }
                                          }
                                          void saveAmt;
                                          setSavedBalancePages(prev => new Set([...prev, pn]));
                                        }}
                                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded shadow-sm transition cursor-pointer whitespace-nowrap ${
                                          savedBalancePages.has(pn)
                                            ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                                            : "bg-orange-500 hover:bg-orange-600 text-white"
                                        }`}
                                        title={`공급사(${pageSupplier || "미지정"})의 잔고 설정을 저장`}
                                      >
                                        {savedBalancePages.has(pn) ? "✓ 저장됨" : "잔고 저장"}
                                      </button>
                                    )}
                                  </div>

                                </div>
                              </td>
                            </tr>
                          </>
                        );
                      })()}
                    </React.Fragment>
                  );
                });
                })()}
              </tbody>
              {total > 0 && (() => {
                const orderNow = colOrder.length === dispHeaders.length ? colOrder : dispHeaders.map((_, i) => i);
                const amtOrderIdx = orderNow.indexOf(amtIdx);
                return (
                <tfoot>
                  {supplierTotals.length >= 1 && supplierTotals.map(({ supplier, total: sTotal, count }) => (
                    <tr key={supplier} className="border-t border-amber-100 bg-amber-50/40">
                      {amtOrderIdx > 0 && (
                        <td colSpan={Math.max(1, amtOrderIdx)} className="px-3 py-2 text-right font-semibold text-gray-500">
                          {supplier} <span className="text-gray-400">({count}매)</span>
                        </td>
                      )}
                      <td className="px-3 py-2 text-right font-bold text-amber-600 whitespace-nowrap">{fmt(sTotal)}원</td>
                      {orderNow.slice(amtOrderIdx + 1).map((_, i) => <td key={i} />)}
                    </tr>
                  ))}
                  <tr className="bg-amber-50 border-t-2 border-amber-300">
                    {amtOrderIdx > 0 && <td colSpan={Math.max(1, amtOrderIdx)} className="px-3 py-2.5 text-right font-black text-gray-700">합 계</td>}
                    <td className="px-3 py-2.5 text-right font-black text-amber-700 text-sm whitespace-nowrap">{fmt(total)}원</td>
                    {orderNow.slice(amtOrderIdx + 1).map((_, i) => <td key={i} />)}
                  </tr>
                </tfoot>
                );
              })()}
            </table>
          </div>
        </div>
      )}

      {/* ── 상품명 보정 ── */}
      {structuredPages.length > 0 && nameIdx >= 0 && (
        <>
          {!matchItems && (
            <div className="w-full flex flex-col sm:flex-row gap-2">
              <button onClick={handleMatch} disabled={matching}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer">
                {matching
                  ? <><Loader2 size={13} className="animate-spin" />상품명 매칭 중...</>
                  : <><Wand2 size={13} />상품명 자동보정{autoSynonymCount > 0 ? ` (동의어 ${autoSynonymCount}건 포함)` : ""}</>}
              </button>
            </div>
          )}

          {matchItems && (
            <div className="w-full bg-white border border-indigo-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 border-b border-indigo-100 bg-indigo-50 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-white bg-indigo-600 px-1.5 py-0.5 rounded shrink-0">2차보정</span>
                  <Wand2 size={13} className="text-indigo-600" />
                  <span className="text-xs font-bold text-indigo-800">거래명세서 ↔ ERP 상품 매칭 보정</span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-500 px-1.5 py-0.5 rounded font-bold">
                    검토 필요 {matchItems.filter((m, ri) => {
                      const bc = barcodeAutoMap[ri] ?? null;
                      const eff = selectedCands[ri] ?? (bc ? { ...bc, score: 100 } : null) ?? m.matched ?? null;
                      const s = eff?.score ?? m.score ?? 0;
                      return (bc ? 100 : s) <= 90;
                    }).length}/{matchItems.length}건
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* 뷰 전환 탭 */}
                  <div className="flex items-center gap-0 bg-white border border-indigo-200 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setErpViewTab('list')}
                      className={`text-[11px] font-bold px-2.5 py-1 transition cursor-pointer ${
                        erpViewTab === 'list'
                          ? 'bg-indigo-500 text-white'
                          : 'text-indigo-500 hover:bg-indigo-50'
                      }`}
                    >
                      검토 목록
                    </button>
                    <button
                      type="button"
                      onClick={() => setErpViewTab('table')}
                      className={`text-[11px] font-bold px-2.5 py-1 transition cursor-pointer ${
                        erpViewTab === 'table'
                          ? 'bg-indigo-500 text-white'
                          : 'text-indigo-500 hover:bg-indigo-50'
                      }`}
                    >
                      명세서 뷰
                    </button>
                  </div>
                  <button onClick={handleMatch} disabled={matching}
                    className="text-[11px] text-indigo-500 hover:text-indigo-700 font-bold cursor-pointer">재실행</button>
                  <button onClick={() => {
                      setConfirmed(true);
                      // 확정 버튼 누른 시점의 작업일 (로컬 날짜 YYYY-MM-DD) 저장
                      const now = new Date();
                      const ymd = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
                      setConfirmedAt(ymd);
                    }}
                    className="text-[11px] font-bold text-white bg-indigo-500 hover:bg-indigo-600 px-3 py-1 rounded-lg transition cursor-pointer shrink-0">확정</button>
                </div>
              </div>

              {erpViewTab === 'list' && (
              <div className="px-4 py-2 border-b border-indigo-50 flex flex-col gap-0.5">
                {matchItems.map((item, ri) => {
                  const bcMatch    = barcodeAutoMap[ri] ?? null;
                  const effMatch = selectedCands[ri] ?? (bcMatch ? { ...bcMatch, score: 100 } : null) ?? item.matched ?? null;
                  const score    = effMatch?.score ?? item.score ?? 0;
                  // 90% 초과(100% 포함, BC 포함)는 숨김
                  if ((bcMatch ? 100 : score) > 90) return null;
                  const pn = pageNums[ri];
                  const rawSupp  = rawSupplierByPage[pn] !== undefined
                    ? rawSupplierByPage[pn]
                    : (ocrSuppIdx >= 0 ? (String(dispRows[ri]?.[ocrSuppIdx] ?? "").trim() || null) : null);
                  const pageSupp   = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? globalSupplier ?? "";
                  const currentSupp = supplierOverrides[ri] !== undefined ? supplierOverrides[ri] : (rawSupp ?? pageSupp);
                  const needsRetry  = !bcMatch && score < 70;
                  const isCandOpen  = openCandRow === ri;
                  const isCandSelected = !!selectedCands[ri] || !!bcMatch;
                  return (
                    <div key={ri} className={`flex flex-col gap-0.5 py-1 border-b last:border-0 ${isCandSelected ? "bg-emerald-50 border-emerald-100" : "border-gray-50"}`}>
                      <div className="flex items-start gap-2 text-[11px]">
                        {bcMatch
                          ? <span className="text-[9px] bg-emerald-100 text-emerald-700 font-black px-1 rounded shrink-0 self-center">BC</span>
                          : <ScoreIcon score={effMatch ? score : 0} />}
                        {(() => {
                          const isOverridden = overrides[ri] !== undefined || !!selectedCands[ri];
                          return (
                            <span
                              onClick={() => {
                                if (isOverridden) {
                                  if (window.confirm(`'${item.input}'으로 복원하시겠습니까?`)) {
                                    setOverrides(prev => ({ ...prev, [ri]: item.input }));
                                    setSelectedCands(prev => { const s = { ...prev }; delete s[ri]; return s; });
                                    setSavedSynonyms(prev => { const n = new Set(prev); n.delete(ri); return n; });
                                    setCancelledRows(prev => new Set([...prev, ri]));
                                    setNameSearchOpenRow(null);
                                  }
                                } else if (pageImages?.length) {
                                  openModal(ri);
                                }
                              }}
                              className={`min-w-0 break-words whitespace-normal max-w-[160px] cursor-pointer select-none ${
                                isOverridden
                                  ? "text-gray-300 line-through hover:text-rose-400"
                                  : `text-gray-400 ${pageImages?.length ? "hover:text-amber-600 hover:underline" : ""}`
                              }`}
                              title={isOverridden ? `클릭하여 원본 복원 — ${item.input}` : (pageImages?.length ? `클릭하면 이미지 보기 — ${item.input}` : item.input)}
                            >{item.input}</span>
                          );
                        })()}
                        <span className="text-gray-300 shrink-0">→</span>
                        {effMatch ? (
                          <div className="flex items-center gap-1.5 min-w-0 flex-1 relative">
                            <input
                              className={`flex-1 font-semibold bg-transparent border-b border-transparent hover:border-indigo-200 focus:border-indigo-400 outline-none truncate min-w-0 ${bcMatch ? "text-emerald-700" : "text-gray-800"}`}
                              value={overrides[ri] ?? effMatch.name}
                              onChange={e => {
                                setOverrides(prev => ({ ...prev, [ri]: e.target.value }));
                                setSavedSynonyms(prev => { const s = new Set(prev); s.delete(ri); return s; });
                                setPendingSyn(prev => { const s = { ...prev }; delete s[ri]; return s; });
                                setCancelledRows(prev => { const s = new Set(prev); s.delete(ri); return s; });
                                searchByName(ri, e.target.value, currentSupp || undefined);
                              }}
                              onBlur={() => setTimeout(() => setNameSearchOpenRow(r => r === ri ? null : r), 150)}
                            />
                            {!bcMatch && score < 100 && <span className={`shrink-0 font-bold ${scoreColor(score)}`}>{score}%</span>}
                            {effMatch.code && <span className="text-gray-300 shrink-0 text-[10px]">{effMatch.code}</span>}
                            {/* 확인 버튼: 드롭다운에서 선택 후 동의어 저장 */}
                            {pendingSyn[ri] && (
                              <button
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => {
                                  const p = pendingSyn[ri];
                                  saveSynonym(ri, p.inputName, p.code, p.supplier, p.name);
                                  setPendingSyn(prev => { const s = { ...prev }; delete s[ri]; return s; });
                                  setRestoredRows(prev => { const s = new Set(prev); s.delete(ri); return s; });
                                }}
                                className="shrink-0 flex items-center gap-0.5 text-[10px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded px-1.5 py-0.5 transition cursor-pointer"
                                title="동의어 DB에 저장"
                              >
                                <Check size={10} /> 확인
                              </button>
                            )}
                            {/* 북마크: 저장됨 표시 + X(DB 삭제) */}
                            {!bcMatch && score < 100 && !pendingSyn[ri] && (
                              savedSynonyms.has(ri) ? (
                                <span className="shrink-0 flex items-center gap-0.5">
                                  <BookmarkCheck size={12} className="text-emerald-500" />
                                  <button
                                    title="동의어 DB에서 삭제"
                                    onClick={() => deleteSynonymForRow(ri)}
                                    className="text-gray-300 hover:text-rose-500 transition-colors cursor-pointer"
                                  >
                                    <X size={11} />
                                  </button>
                                </span>
                              ) : (
                                <button
                                  title={`"${item.input}" → 동의어로 저장`}
                                  onClick={() => saveSynonym(ri, item.input, effMatch.code, currentSupp || undefined, effMatch.name)}
                                  className="shrink-0 text-gray-300 hover:text-indigo-500 transition-colors cursor-pointer"
                                >
                                  <Bookmark size={12} />
                                </button>
                              )
                            )}
                            {nameSearchOpenRow === ri && (nameSearchResults[ri]?.length ?? 0) > 0 && (
                              <div className="absolute top-full left-0 z-30 mt-0.5 bg-white border border-indigo-200 rounded-xl shadow-xl max-h-48 overflow-y-auto min-w-[220px] w-full">
                                {nameSearchResults[ri].map((p, pi) => (
                                  <button key={pi} onMouseDown={e => e.preventDefault()}
                                    onClick={() => {
                                      setOverrides(prev => ({ ...prev, [ri]: p.product_name ?? "" }));
                                      setNameSearchOpenRow(null);
                                      setPendingSyn(prev => ({ ...prev, [ri]: {
                                        inputName: item.input,
                                        code: p.product_code ?? "",
                                        supplier: currentSupp || undefined,
                                        name: p.product_name ?? "",
                                      }}));
                                    }}
                                    className="flex items-center gap-2 w-full text-left px-3 py-1.5 hover:bg-indigo-50 transition text-[11px] border-b border-gray-50 last:border-0">
                                    <span className="flex-1 font-semibold text-gray-800 break-words">{p.product_name}</span>
                                    {p.spec && <span className="text-gray-400 break-words max-w-[60px] shrink-0">{p.spec}</span>}
                                    {p.supplier && <span className="text-sky-500 shrink-0 break-words max-w-[60px]">{p.supplier}</span>}
                                    <span className="text-gray-300 font-mono shrink-0 text-[10px]">{p.product_code}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : overrides[ri] === item.input ? (
                          // 거래명세표 품목으로 대체 확정됨
                          <div className="flex items-center gap-1.5 flex-1">
                            <span className="font-semibold text-slate-700 text-[11px]">{item.input}</span>
                            <span className="text-[9px] bg-slate-100 text-slate-500 px-1 rounded font-bold shrink-0">거래명세표</span>
                            <button
                              onClick={() => setOverrides(prev => { const s = { ...prev }; delete s[ri]; return s; })}
                              className="text-[9px] text-slate-300 hover:text-rose-400 cursor-pointer transition shrink-0">취소</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-1 flex-wrap relative">
                            <span className="text-[11px] text-rose-500 font-semibold shrink-0">상품이 없습니다.</span>
                            <span className="text-[11px] text-slate-500 shrink-0">거래명세표 품목으로 대체할까요?</span>
                            <button
                              onClick={() => setOverrides(prev => ({ ...prev, [ri]: item.input }))}
                              className="shrink-0 text-[10px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded px-2 py-0.5 cursor-pointer transition">
                              확인
                            </button>
                            <input
                              className="flex-1 min-w-[80px] font-semibold text-rose-400 bg-transparent border-b border-rose-200 hover:border-rose-300 focus:border-rose-400 outline-none truncate placeholder-rose-300 italic text-[11px]"
                              value={overrides[ri] ?? ""} placeholder="직접 입력..."
                              onChange={e => {
                                setOverrides(prev => ({ ...prev, [ri]: e.target.value }));
                                setSavedSynonyms(prev => { const s = new Set(prev); s.delete(ri); return s; });
                                setPendingSyn(prev => { const s = { ...prev }; delete s[ri]; return s; });
                                searchByName(ri, e.target.value, currentSupp || undefined);
                              }}
                              onBlur={() => setTimeout(() => setNameSearchOpenRow(r => r === ri ? null : r), 150)}
                            />
                            {pendingSyn[ri] && (
                              <button
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => {
                                  const p = pendingSyn[ri];
                                  saveSynonym(ri, p.inputName, p.code, p.supplier, p.name);
                                  setPendingSyn(prev => { const s = { ...prev }; delete s[ri]; return s; });
                                }}
                                className="shrink-0 flex items-center gap-0.5 text-[10px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded px-1.5 py-0.5 transition cursor-pointer"
                                title="동의어 DB에 저장"
                              >
                                <Check size={10} /> 확인
                              </button>
                            )}
                            {nameSearchOpenRow === ri && (nameSearchResults[ri]?.length ?? 0) > 0 && (
                              <div className="absolute top-full left-0 z-30 mt-0.5 bg-white border border-indigo-200 rounded-xl shadow-xl max-h-48 overflow-y-auto min-w-[220px] w-full">
                                {nameSearchResults[ri].map((p, pi) => (
                                  <button key={pi} onMouseDown={e => e.preventDefault()}
                                    onClick={() => {
                                      setOverrides(prev => ({ ...prev, [ri]: p.product_name ?? "" }));
                                      setNameSearchOpenRow(null);
                                      setPendingSyn(prev => ({ ...prev, [ri]: {
                                        inputName: item.input,
                                        code: p.product_code ?? "",
                                        supplier: currentSupp || undefined,
                                        name: p.product_name ?? "",
                                      }}));
                                    }}
                                    className="flex items-center gap-2 w-full text-left px-3 py-1.5 hover:bg-indigo-50 transition text-[11px] border-b border-gray-50 last:border-0">
                                    <span className="flex-1 font-semibold text-gray-800 break-words">{p.product_name}</span>
                                    {p.spec && <span className="text-gray-400 break-words max-w-[60px] shrink-0">{p.spec}</span>}
                                    {p.supplier && <span className="text-sky-500 shrink-0 break-words max-w-[60px]">{p.supplier}</span>}
                                    <span className="text-gray-300 font-mono shrink-0 text-[10px]">{p.product_code}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] pl-5">
                        <span className="text-gray-300 shrink-0">공급사</span>
                        <input
                          className="flex-1 text-sky-700 font-semibold bg-transparent border-b border-transparent hover:border-sky-200 focus:border-sky-400 outline-none truncate min-w-0"
                          value={currentSupp}
                          onChange={e => setSupplierOverrides(prev => ({ ...prev, [ri]: e.target.value }))}
                          placeholder="공급사명 입력..."
                        />
                        {supplierOverrides[ri] !== undefined && !savedSupplierAliases.has(ri) && (() => {
                          const origSupp = rawSupp ?? pageSupp;
                          const newSupp  = supplierOverrides[ri].trim();
                          if (!origSupp || !newSupp || origSupp === newSupp) return null;
                          return (
                            <button
                              title={`공급사 오인식 보정: "${origSupp}" → "${newSupp}" 별칭 저장`}
                              onClick={() => saveSupplierAlias(ri, origSupp, newSupp)}
                              className="shrink-0 flex items-center gap-0.5 text-[9px] font-bold text-sky-500 hover:text-sky-700 border border-sky-200 hover:bg-sky-50 rounded px-1 py-0.5 transition cursor-pointer"
                            >
                              <BookmarkPlus size={9} /> 공급사 보정
                            </button>
                          );
                        })()}
                        {supplierOverrides[ri] !== undefined && savedSupplierAliases.has(ri) && (
                          <span className="shrink-0 text-[9px] text-sky-500 font-bold flex items-center gap-0.5">
                            <BookmarkCheck size={9} /> 공급사 저장됨
                          </span>
                        )}
                      </div>
                      {needsRetry && (
                        <div className="pl-5 flex flex-col gap-1 mt-0.5">
                          <button
                            onClick={() => handleRetry(ri, item.input, currentSupp || undefined)}
                            disabled={retryingRows.has(ri)}
                            className={`self-start flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition cursor-pointer disabled:opacity-50 ${
                              isCandOpen
                                ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
                                : "bg-rose-50 text-rose-500 border border-rose-200 hover:bg-rose-100"
                            }`}
                          >
                            {retryingRows.has(ri)
                              ? <Loader2 size={9} className="animate-spin" />
                              : <Search size={9} />}
                            유사 상품 {isCandOpen ? "닫기" : "찾기"}
                            {currentSupp && !isCandOpen && (
                              <span className="text-sky-600 font-normal ml-0.5">+{currentSupp}</span>
                            )}
                          </button>
                          {isCandOpen && (
                            <div className="flex flex-col gap-0.5 bg-indigo-50/80 border border-indigo-100 rounded-lg p-1.5">
                              {candidatesMap[ri]?.length > 0 ? candidatesMap[ri].map((cand, ci) => (
                                <button
                                  key={ci}
                                  onClick={() => handleSelectCandidate(ri, cand, item.input, currentSupp)}
                                  className="flex items-center gap-2 text-left px-2 py-1.5 rounded-md hover:bg-emerald-50 hover:shadow-sm transition cursor-pointer group"
                                >
                                  <span className={`shrink-0 font-black text-[10px] w-7 text-right ${scoreColor(cand.score)}`}>{cand.score}%</span>
                                  <span className="flex-1 font-semibold text-gray-800 text-[11px] break-words whitespace-normal group-hover:text-indigo-700">{cand.name}</span>
                                  {cand.spec && <span className="text-gray-400 text-[10px] break-words max-w-[60px]">{cand.spec}</span>}
                                  {cand.supplier && <span className="text-sky-500 text-[10px] break-words max-w-[60px] shrink-0">{cand.supplier}</span>}
                                  <span className="text-gray-300 text-[10px] font-mono shrink-0">{cand.code}</span>
                                </button>
                              )) : (
                                <p className="text-[10px] text-gray-400 text-center py-1.5">유사 상품을 찾지 못했습니다</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              )}

              {/* ── 명세서 뷰 (2차 보정 결과 — 명세표 형식, 전체 셀 편집 가능) ── */}
              {erpViewTab === 'table' && (() => {
                // 요청된 9개 컬럼: ERP상품코드, 공급사, OCR품명, ERP품명, OCR수량, ERP수량, 단가, 금액, 유통기한
                const ERP_NUM_COLS_SET = new Set(["OCR수량", "ERP수량", "단가", "금액"]);
                const allErpCols = ["ERP 코드", "공급사", "OCR 품명", "ERP 품명", "OCR수량", "ERP수량", "단가", "금액", "유통기한"];
                // 헤더 라벨 매핑 (내부 key ≠ 표시 라벨)
                const ERP_HEADER_LABEL: Record<string, string> = {
                  "ERP 코드": "ERP상품코드",
                };
                // dispHeaders에서 유통기한/공급처 등 대체 이름 매핑
                const findDispIdx = (aliases: string[]) => {
                  for (const a of aliases) {
                    const i = dispHeaders.indexOf(a);
                    if (i >= 0) return i;
                  }
                  return -1;
                };
                const supplyIdx = findDispIdx(["공급사", "공급처", "제조사"]);
                const expiryIdx = findDispIdx(["유통기한", "유효기한", "유통기간"]);

                // 임의 컬럼 표시값 헬퍼
                const getErpCellDisplayVal = (ri: number, col: string, row: (string | number | null)[]): string | number | null => {
                  const editVal = erpCellEdits[ri]?.[col];
                  if (editVal !== undefined) return ERP_NUM_COLS_SET.has(col) ? parseNumber(editVal) : editVal;
                  if (col === "공급사") {
                    const pn2 = pageNums[ri];
                    if (rawSupplierByPage[pn2] !== undefined) return rawSupplierByPage[pn2];
                    return supplyIdx >= 0 ? row[supplyIdx] : null;
                  }
                  if (col === "유통기한") return expiryIdx >= 0 ? row[expiryIdx] : null;
                  const ci = dispHeaders.indexOf(col);
                  if (ci >= 0) return row[ci];
                  return null;
                };

                // 인라인 편집 input 공통 렌더러
                const renderEditInput = (
                  ri: number, col: string,
                  inputMode: "text" | "numeric",
                  cls: string,
                ) => (
                  <input
                    autoFocus
                    type="text"
                    inputMode={inputMode}
                    className={cls}
                    value={editingErpCellVal}
                    onChange={e => setEditingErpCellVal(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setEditingErpCell(null);
                    }}
                    onBlur={() => {
                      const trimmed = editingErpCellVal.trim();
                      setErpCellEdits(prev => {
                        const rowEdits = { ...(prev[ri] ?? {}) };
                        if (trimmed === "") delete rowEdits[col];
                        else rowEdits[col] = trimmed;
                        return { ...prev, [ri]: rowEdits };
                      });
                      setEditingErpCell(null);
                    }}
                  />
                );

                // X(취소) 버튼 공통
                const renderCancelBtn = (ri: number, col: string) => (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setErpCellEdits(prev => {
                        const r2 = { ...(prev[ri] ?? {}) };
                        delete r2[col];
                        return { ...prev, [ri]: r2 };
                      });
                    }}
                    className="text-[9px] px-0.5 py-px rounded bg-blue-100 text-blue-600 hover:bg-blue-200 cursor-pointer shrink-0"
                    title="수정 취소"
                  >✕</button>
                );

                return (
                <div className="overflow-x-auto border-b border-indigo-50">
                  <table className="text-xs border-collapse w-full" style={{ tableLayout: "fixed" }}>
                    <colgroup>
                      {allErpCols.map(col => (
                        <col key={col} style={{ width: `${erpColWidths[col] ?? ERP_TABLE_COLS_DEFAULT[col] ?? 100}px` }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr className="bg-indigo-50/60 border-b-2 border-indigo-200">
                        {allErpCols.map(col => (
                          <th key={col}
                            className={`relative px-2 py-2 font-bold whitespace-nowrap ${
                              col === "OCR 품명" ? "text-left text-gray-500" :
                              col === "OCR수량" ? "text-right text-gray-500" :
                              col === "ERP 품명" ? "text-left text-violet-700" :
                              col === "ERP 코드" ? "text-right text-indigo-600" :
                              col === "ERP수량" ? "text-right text-violet-700" :
                              ERP_NUM_COLS_SET.has(col) ? "text-right text-indigo-800" :
                              "text-left text-indigo-800"
                            }`}>
                            {ERP_HEADER_LABEL[col] ?? col}
                            <span
                              onMouseDown={e => startErpColResize(col, e)}
                              className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-300/60 active:bg-indigo-500/70 select-none"
                              title="드래그하여 폭 조절"
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {effectiveDispRows.map((row, ri) => {
                        // 1차보정에서 삭제/DB필터된 행은 2차보정에서도 렌더 스킵
                        if (permanentlyDeletedRawRows.has(ri)) return null;
                        if (isRowDbDeleted(ri)) return null;
                        const pn = pageNums[ri];
                        const isFirstInPage = ri === 0 || pageNums[ri - 1] !== pn;
                        const isLastInPage = ri === effectiveDispRows.length - 1 || pageNums[ri] !== pageNums[ri + 1];
                        const isPageCollapsed = collapsedErpPages.has(pn);
                        const origName = nameIdx >= 0 ? String(row[nameIdx] ?? "").trim() : "";

                        // ERP 매칭 결과 결정
                        const baseMatch = cancelledAutoMap.has(ri) ? null
                          : (selectedCands[ri] ?? matchItems![ri]?.matched ?? null);
                        const autoSyn = cancelledAutoMap.has(ri) ? undefined : autoSynonymMatches[ri];
                        const bcMatch = cancelledAutoMap.has(ri) ? null : (barcodeAutoMap[ri] ?? null);
                        const matchedName = baseMatch?.name ?? autoSyn?.name ?? bcMatch?.name ?? null;
                        const matchedCode = baseMatch?.code ?? autoSyn?.code ?? bcMatch?.code ?? null;

                        const corrName = (cancelledAutoSyn.has(ri) || cancelledAutoMap.has(ri))
                          ? (erpCellEdits[ri]?.["ERP 품명"] ?? overrides[ri] ?? origName)
                          : (erpCellEdits[ri]?.["ERP 품명"] ?? overrides[ri] ?? matchedName ?? origName);
                        const corrCode = erpCellEdits[ri]?.["ERP 코드"] ?? matchedCode;
                        const isCorrected = corrName && origName && corrName !== origName;

                        // 수량/단가/금액 계산 (erpCellEdits 우선)
                        const qtyEdit = erpCellEdits[ri]?.["OCR수량"] ?? erpCellEdits[ri]?.["수량"];
                        const priEdit = erpCellEdits[ri]?.["단가"];
                        const amtEdit = erpCellEdits[ri]?.["금액"];
                        // ERP수량: matchedCode로 products-map에서 current_stock 조회
                        const erpStockVal: number | null = matchedCode
                          ? (erpStockMap[matchedCode] ?? erpStockMap[String(matchedCode).replace(/^0+/, "")] ?? null)
                          : null;
                        const erpStockMissing = !matchedCode || !(matchedCode in erpStockMap || (String(matchedCode).replace(/^0+/, "") in erpStockMap));
                        const qtyVal: number | null = qtyEdit !== undefined
                          ? parseNumber(qtyEdit)
                          : (ocrQtyIdx >= 0 ? (parseNumber(row[ocrQtyIdx]) || null) : null);
                        const priVal: number | null = priEdit !== undefined
                          ? parseNumber(priEdit)
                          : (ocrPriIdx >= 0 ? (parseNumber(row[ocrPriIdx]) || null) : null);
                        let amtVal: number | null;
                        if (amtEdit !== undefined) {
                          amtVal = parseNumber(amtEdit);
                        } else if ((qtyEdit !== undefined || priEdit !== undefined) && qtyVal && priVal) {
                          amtVal = Math.round(qtyVal * priVal);
                        } else {
                          amtVal = amtIdx >= 0 ? (parseNumber(row[amtIdx]) || null) : null;
                        }

                        // 잔고: 페이지 마지막 행에만 표시 + 편집값 우선
                        const balEdit = erpCellEdits[ri]?.["잔고"];
                        const pageBalVal = pageBalanceFromConfig.get(pn) ?? null;
                        const balanceVal: number | null = balEdit !== undefined
                          ? parseNumber(balEdit)
                          : (isLastInPage ? pageBalVal : null);

                        // 페이지별 총 행 수 (접힌 요약용)
                        const pageRowCount = isFirstInPage ? effectiveDispRows.filter((_, i) => pageNums[i] === pn).length : 0;
                        const pageSupplierHead = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
                        return (
                          <React.Fragment key={ri}>
                            {/* 페이지 헤더 (접기/펴기 토글) — 각 페이지 첫 행 앞에 삽입 */}
                            {isFirstInPage && (
                              <tr className="bg-indigo-50 border-t-2 border-indigo-200 cursor-pointer hover:bg-indigo-100/70 select-none"
                                onClick={() => setCollapsedErpPages(prev => {
                                  const n = new Set(prev);
                                  if (n.has(pn)) n.delete(pn); else n.add(pn);
                                  return n;
                                })}
                                title={isPageCollapsed ? "펴기" : "접기"}>
                                <td colSpan={allErpCols.length} className="px-3 py-1.5">
                                  <span className="flex items-center gap-2 text-xs font-bold text-indigo-800">
                                    <span className="w-4 text-center text-indigo-500">{isPageCollapsed ? "▶" : "▼"}</span>
                                    <span className="bg-white border border-indigo-200 rounded px-1.5 py-0.5 text-indigo-700">{pn}번 명세서</span>
                                    {pageSupplierHead && <span className="text-indigo-600 font-semibold">{pageSupplierHead}</span>}
                                    <span className="text-indigo-400 font-normal">· {pageRowCount}건</span>
                                    {isPageCollapsed && <span className="text-indigo-400 font-normal ml-auto">(클릭하여 펼치기)</span>}
                                  </span>
                                </td>
                              </tr>
                            )}
                            {/* 데이터 행 — 접힌 상태면 숨김 */}
                            {!isPageCollapsed && (
                            <tr className={`border-t border-gray-100 hover:bg-indigo-50/30 ${ri % 2 !== 0 ? "bg-gray-50/20" : ""}`}>
                              {allErpCols.map(col => {
                                const isEditingThis = editingErpCell?.ri === ri && editingErpCell?.col === col;
                                const hasEdit = erpCellEdits[ri]?.[col] !== undefined;

                                // OCR 품명 (읽기 전용, 클릭 시 명세서 이미지 열기, 2줄 클램프)
                                if (col === "OCR 품명") {
                                  return (
                                    <td key={col}
                                      onClick={pageImages?.length ? () => openModal(ri) : undefined}
                                      className={`px-2 py-2 align-top ${pageImages?.length ? "cursor-pointer hover:bg-indigo-50/60" : ""}`}
                                      title={pageImages?.length ? "클릭하면 해당 거래명세서 이미지 열기" : undefined}>
                                      <span className={`break-words whitespace-normal line-clamp-2 ${isCorrected ? "text-gray-400 line-through" : "font-semibold text-gray-700"}`}>
                                        {origName || <span className="text-gray-300">—</span>}
                                      </span>
                                    </td>
                                  );
                                }

                                // ERP 품명 (편집 가능)
                                if (col === "ERP 품명") {
                                  // 취소 대상: 자동/수동 매칭 어떤 것이든 원본과 다르면 취소 버튼 표시
                                  const hasAutoMatch = !cancelledAutoMap.has(ri) && !cancelledAutoSyn.has(ri)
                                    && (barcodeAutoMap[ri] || autoSynonymMatches[ri] || selectedCands[ri] || matchItems?.[ri]?.matched
                                        || (!!isCorrected && !hasEdit));
                                  const isAutoCancelled = (cancelledAutoMap.has(ri) || cancelledAutoSyn.has(ri)) && !hasEdit;
                                  if (isEditingThis) {
                                    return (
                                      <td key={col} className="px-1 py-1 max-w-[200px]" onClick={e => e.stopPropagation()}>
                                        {renderEditInput(ri, col, "text", "w-full text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-400 rounded px-2 py-0.5 outline-none")}
                                      </td>
                                    );
                                  }
                                  return (
                                    <td key={col}
                                      onClick={() => { setEditingErpCell({ ri, col }); setEditingErpCellVal(corrName); }}
                                      className="px-2 py-2 align-top cursor-pointer hover:bg-indigo-50/70 group"
                                      title="클릭하여 ERP 품명 수정">
                                      <span className="flex items-center gap-1 flex-wrap">
                                        <span className={`break-words whitespace-normal font-bold flex-1 line-clamp-2 ${
                                          hasEdit ? "text-blue-700" : "text-violet-700"
                                        }`}>
                                          {corrName || <span className="text-gray-300">—</span>}
                                        </span>
                                        {hasEdit && renderCancelBtn(ri, col)}
                                        {/* 자동보정 취소 버튼 (항상 표시) */}
                                        {hasAutoMatch && !hasEdit && (
                                          <button
                                            type="button"
                                            onClick={async e => {
                                              e.stopPropagation();
                                              setCancelledAutoMap(prev => new Set([...prev, ri]));
                                              setCancelledAutoSyn(prev => new Set([...prev, ri]));
                                              // 동의어 관리에 취소 기록 (재적용 방지 + 관리 가능)
                                              if (origName) {
                                                await deleteSynonymByName(origName, matchedCode ?? undefined);
                                                setAutoSynonymMatches(prev => { const s = { ...prev }; delete s[ri]; return s; });
                                              }
                                            }}
                                            className="shrink-0 text-[9px] font-bold text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-400 rounded px-1.5 py-0.5 leading-4 transition cursor-pointer"
                                            title="자동 ERP 매칭 취소 → 원본 복원 + 동의어 관리에 '취소됨'으로 기록 (재적용 안됨)"
                                          >✕ 취소</button>
                                        )}
                                        {/* 취소 복원 버튼 */}
                                        {isAutoCancelled && (
                                          <button
                                            type="button"
                                            onClick={e => {
                                              e.stopPropagation();
                                              setCancelledAutoMap(prev => { const s = new Set(prev); s.delete(ri); return s; });
                                              setCancelledAutoSyn(prev => { const s = new Set(prev); s.delete(ri); return s; });
                                            }}
                                            className="shrink-0 text-[9px] font-bold text-indigo-500 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-400 rounded px-1 py-0 leading-4 transition cursor-pointer"
                                            title="ERP 자동매칭 복원"
                                          >↩ 복원</button>
                                        )}
                                        <Pencil size={8} className="text-indigo-200 opacity-0 group-hover:opacity-100 transition shrink-0" />
                                      </span>
                                    </td>
                                  );
                                }

                                // ERP 코드 (편집 가능)
                                if (col === "ERP 코드") {
                                  const displayCode = hasEdit ? erpCellEdits[ri]![col] : (corrCode ?? null);
                                  if (isEditingThis) {
                                    return (
                                      <td key={col} className="px-1 py-1" onClick={e => e.stopPropagation()}>
                                        {renderEditInput(ri, col, "text", "w-full text-[11px] font-mono text-gray-600 bg-indigo-50 border border-indigo-400 rounded px-2 py-0.5 outline-none min-w-[80px]")}
                                      </td>
                                    );
                                  }
                                  return (
                                    <td key={col}
                                      onClick={() => { setEditingErpCell({ ri, col }); setEditingErpCellVal(displayCode ?? ""); }}
                                      className="px-2 py-2 text-right cursor-pointer hover:bg-indigo-50/60 group"
                                      title={displayCode ? "클릭하여 ERP 상품코드 수정" : "ERP에 미등록 — 클릭하여 코드 입력"}>
                                      {displayCode ? (
                                        <span className={`font-mono text-[10px] ${hasEdit ? "text-blue-600" : "text-indigo-700"}`}>{displayCode}</span>
                                      ) : (
                                        <span className="text-rose-600 font-black text-base leading-none" title="ERP 분류코드 미등록">✕</span>
                                      )}
                                      {hasEdit && renderCancelBtn(ri, col)}
                                    </td>
                                  );
                                }

                                // OCR수량 — 2차보정에서는 읽기 전용 (1차보정 값 그대로)
                                if (col === "OCR수량") {
                                  return (
                                    <td key={col}
                                      className="px-2 py-2 text-right font-bold whitespace-nowrap text-gray-700"
                                      title="1차보정 값 (2차보정에서는 편집 불가)">
                                      {qtyVal != null ? fmt(qtyVal) : <span className="text-gray-300">—</span>}
                                    </td>
                                  );
                                }

                                // ERP수량 (products.current_stock — 읽기 전용, 없으면 붉은 X)
                                if (col === "ERP수량") {
                                  const stockReady = erpStockLoaded;
                                  return (
                                    <td key={col}
                                      className="px-2 py-2 text-right font-bold whitespace-nowrap"
                                      title={erpStockMissing ? "ERP에 등록되지 않은 상품" : `현재고 ${erpStockVal ?? "—"}`}>
                                      {!stockReady ? <span className="text-gray-300">…</span>
                                        : erpStockMissing ? <span className="text-rose-600 font-black text-base">✕</span>
                                        : erpStockVal != null ? <span className="text-violet-700">{fmt(erpStockVal)}</span>
                                        : <span className="text-gray-300">—</span>}
                                    </td>
                                  );
                                }

                                // 단가 — 2차보정에서는 읽기 전용
                                if (col === "단가") {
                                  return (
                                    <td key={col}
                                      className="px-2 py-2 text-right font-bold whitespace-nowrap text-gray-700"
                                      title="1차보정 값 (2차보정에서는 편집 불가)">
                                      {priVal != null ? fmt(priVal) : <span className="text-gray-300">—</span>}
                                    </td>
                                  );
                                }

                                // 금액 — 2차보정에서는 읽기 전용
                                if (col === "금액") {
                                  return (
                                    <td key={col}
                                      className="px-2 py-2 text-right font-bold whitespace-nowrap text-amber-800"
                                      title="1차보정 값 (2차보정에서는 편집 불가)">
                                      {amtVal != null ? fmt(amtVal) : <span className="text-gray-300">—</span>}
                                    </td>
                                  );
                                }

                                // (잔고 컬럼은 2차보정 표에서 제외됨 — 하단 요약 행에만 표시)

                                // 그 외 컬럼 (공급사, 유통기한) — 2차보정 읽기 전용 (1차보정 값 그대로)
                                const displayVal = getErpCellDisplayVal(ri, col, row);
                                const isSupplierCol = col === "공급사";
                                const isNumCol = typeof displayVal === "number";
                                const cellStr = displayVal == null ? null : isNumCol ? fmt(displayVal as number) : String(displayVal);
                                return (
                                  <td key={col}
                                    className={`px-2 py-2 align-top ${
                                      isSupplierCol ? "text-sky-700 font-semibold" :
                                      isNumCol ? "text-right text-gray-700" :
                                      "text-gray-600"
                                    }`}
                                    title="1차보정 값 (2차보정에서는 편집 불가)">
                                    <span className={`flex items-center gap-1 ${isNumCol ? "justify-end" : ""}`}>
                                      <span className="break-words whitespace-normal line-clamp-2 flex-1">
                                        {cellStr ?? <span className="text-gray-200">—</span>}
                                      </span>
                                    </span>
                                  </td>
                                );
                              })}
                            </tr>
                            )}
                            {/* 페이지별 소계+공급사 잔고 통합 요약 행 — 1차보정과 동일한 내용, 값 편집 공유 */}
                            {isLastInPage && (() => {
                              const pageSupplier = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
                              // 2차 소계 표시값: 1차보정의 pageSubtotalChoices(사용자 선택) 그대로 반영
                              // getPageDisplayTotal은 pageSubtotalChoices(stated/computed/custom) 우선순위를 이미 적용
                              const pageTotalEdited = getPageDisplayTotal(pn);
                              // 잔고 후보/상태 — 1차보정과 동일한 state 공유
                              const cands2 = pageBalanceCandidates.get(pn) ?? [];
                              const overrideVal2 = pageBalanceOverride[pn];
                              const configuredLabel2 = pageSupplier ? balanceConfig[pageSupplier] : undefined;
                              const balanceCands2 = pageBalanceCandidates.get(pn) ?? [];
                              const balanceAmount2 = configuredLabel2
                                ? (balanceCands2.find(c => c.label === configuredLabel2)?.amount
                                   ?? (Array.from(learnedLabels).some(lk => configuredLabel2.includes(lk)) ? (structuredPages.find(p => p.page === pn)?.meta.total ?? null) : null))
                                : null;
                              const allAmts2 = pageAmountCandidates.get(pn) ?? [];
                              const labeledSorted2 = [...cands2].sort((a, b) => {
                                const aCur = configuredLabel2 && a.label.includes(configuredLabel2);
                                const bCur = configuredLabel2 && b.label.includes(configuredLabel2);
                                if (aCur && !bCur) return -1;
                                if (bCur && !aCur) return 1;
                                const aLearned = Array.from(learnedLabels).some(lk => a.label.includes(lk));
                                const bLearned = Array.from(learnedLabels).some(lk => b.label.includes(lk));
                                if (aLearned && !bLearned) return -1;
                                if (bLearned && !aLearned) return 1;
                                return b.label.length - a.label.length;
                              });
                              const labeledSet2 = new Set(labeledSorted2.map(c => c.amount));
                              const otherAmts2 = allAmts2.filter(a => !labeledSet2.has(a));
                              const isManual2 = pageBalanceModeManual.has(pn);
                              const isSkip2 = pageBalanceModeSkip.has(pn);
                              const currentVal2 = isManual2 ? "__manual__" : isSkip2 ? "__skip__" : (overrideVal2 != null ? String(overrideVal2) : (balanceAmount2 ?? ""));
                              return (
                                <tr className="border-t-2 border-amber-400">
                                  <td colSpan={allErpCols.length} className="px-0 py-0"
                                    style={{ background: "linear-gradient(90deg, #fef3c7 0%, #ffedd5 55%, #fed7aa 100%)" }}>
                                    <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-1.5">
                                      {/* 좌측: [N번 명세서 소계] [거래명세서 보기] [공급사] */}
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <span className="text-amber-700 font-black text-[10px] tracking-wide uppercase whitespace-nowrap bg-amber-200/60 border border-amber-300 rounded px-1.5 py-0.5">
                                          {pn}번 명세서 소계
                                        </span>
                                        {pageImages?.length ? (
                                          <button type="button"
                                            onClick={e => { e.stopPropagation(); openPageModal(pn); }}
                                            className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-amber-500 hover:bg-amber-600 active:bg-amber-700 px-2.5 py-1 rounded shadow-sm transition cursor-pointer whitespace-nowrap"
                                            title={`${pn}번 거래명세서 이미지 보기`}
                                          >📄 거래명세서 보기</button>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-100 px-2.5 py-1 rounded opacity-50 whitespace-nowrap cursor-not-allowed">📄 이미지 없음</span>
                                        )}
                                        {pageSupplier && (
                                          <span className="text-amber-800 font-black text-[11px] whitespace-nowrap border-l border-amber-300 pl-2">{pageSupplier}</span>
                                        )}
                                      </div>
                                      {/* 중앙: 소계 금액 — 수량×단가 합과 일치 여부에 따라 색상 변경 + 코멘트 */}
                                      <div className="flex items-center justify-center flex-1 min-w-[120px]">
                                        {(() => {
                                          const pageData2 = structuredPages.find(p => p.page === pn);
                                          const summary2 = pageData2?.meta?.summary_rows ?? [];
                                          const statedFromSummary2 = summary2.find(s => {
                                            const norm = String(s.label).replace(/\s+/g, "");
                                            return /합계액|총합계액|총합계|합계|소계/.test(norm);
                                          })?.amount;
                                          const stated2 = statedFromSummary2 ?? pageData2?.meta?.total ?? null;
                                          // 2차보정: erpCellEdits(OCR수량/단가) 우선 반영해 실시간 계산
                                          let sumQtyPrice2 = 0;
                                          effectiveDispRows.forEach((r, rii) => {
                                            if (pageNums[rii] !== pn) return;
                                            const qE = erpCellEdits[rii]?.["OCR수량"] ?? erpCellEdits[rii]?.["수량"];
                                            const pE = erpCellEdits[rii]?.["단가"];
                                            const q = qE !== undefined ? parseNumber(qE) : (_qtyIdxEarly >= 0 ? parseNumber(r[_qtyIdxEarly]) : 0);
                                            const p = pE !== undefined ? parseNumber(pE) : (_priIdxEarly >= 0 ? parseNumber(r[_priIdxEarly]) : 0);
                                            if (q > 0 && p > 0) sumQtyPrice2 += Math.round(q * p);
                                          });
                                          const mismatch2 = stated2 != null && sumQtyPrice2 > 0 && Math.abs(sumQtyPrice2 - stated2) > 1;
                                          return (
                                            <div className="flex flex-col items-center gap-0.5">
                                              <span
                                                className={`font-black text-base tracking-tight whitespace-nowrap ${
                                                  mismatch2 ? "text-rose-600 underline decoration-wavy decoration-rose-400 underline-offset-2" : "text-amber-900"
                                                }`}
                                                title={mismatch2
                                                  ? `수량×단가 합(${fmt(sumQtyPrice2)}원)이 명세서 소계(${fmt(stated2!)}원)와 다릅니다`
                                                  : `수량×단가 합과 명세서 소계가 일치`}
                                              >
                                                {fmt(pageTotalEdited)}원
                                              </span>
                                              {mismatch2 && (
                                                <span className="text-[9px] font-bold whitespace-nowrap px-1.5 py-0.5 rounded border bg-rose-50 text-rose-700 border-rose-300">
                                                  ⚠ 수량×단가 합({fmt(sumQtyPrice2)}원) ≠ 합계금액({fmt(stated2!)}원)
                                                </span>
                                              )}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                      {/* 우측: 공급사 잔고 드롭박스 + 직접입력/기록안함 + 확인 */}
                                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                        <span className="text-rose-600 font-bold text-[10px] whitespace-nowrap">공급사 잔고</span>
                                        <select
                                          value={currentVal2}
                                          onChange={e => {
                                            const v = e.target.value;
                                            setSavedBalancePages(prev => { const n = new Set(prev); n.delete(pn); return n; });
                                            if (v === "__manual__") {
                                              setPageBalanceModeManual(prev => new Set([...prev, pn]));
                                              setPageBalanceModeSkip(prev => { const n = new Set(prev); n.delete(pn); return n; });
                                              setPageBalanceOverride(prev => { const n = { ...prev }; delete n[pn]; return n; });
                                            } else if (v === "__skip__") {
                                              setPageBalanceModeSkip(prev => new Set([...prev, pn]));
                                              setPageBalanceModeManual(prev => { const n = new Set(prev); n.delete(pn); return n; });
                                              setPageBalanceOverride(prev => { const n = { ...prev }; delete n[pn]; return n; });
                                              setPageBalanceManualInput(prev => { const n = { ...prev }; delete n[pn]; return n; });
                                            } else if (v === "") {
                                              setPageBalanceModeManual(prev => { const n = new Set(prev); n.delete(pn); return n; });
                                              setPageBalanceModeSkip(prev => { const n = new Set(prev); n.delete(pn); return n; });
                                              setPageBalanceOverride(prev => { const n = { ...prev }; delete n[pn]; return n; });
                                            } else {
                                              setPageBalanceOverride(prev => ({ ...prev, [pn]: Number(v) }));
                                              setPageBalanceModeManual(prev => { const n = new Set(prev); n.delete(pn); return n; });
                                              setPageBalanceModeSkip(prev => { const n = new Set(prev); n.delete(pn); return n; });
                                            }
                                          }}
                                          className="text-[10px] font-bold text-orange-800 bg-white/80 border border-orange-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-orange-500 focus:bg-white cursor-pointer min-w-[160px] shadow-sm"
                                          title={`${pn}번 명세서의 공급사 잔고 값 선택`}
                                        >
                                          <option value="">-- 금액 선택 --</option>
                                          {labeledSorted2.length > 0 && (
                                            <optgroup label="잔고항목 지정 (우선)">
                                              {labeledSorted2.map((c, ci) => (
                                                <option key={`l2-${ci}`} value={c.amount}>{c.label} · {fmt(c.amount)}원</option>
                                              ))}
                                            </optgroup>
                                          )}
                                          {otherAmts2.length > 0 && (
                                            <optgroup label="기타 OCR 금액">
                                              {otherAmts2.map((amt, ai) => (
                                                <option key={`o2-${ai}`} value={amt}>{fmt(amt)}원</option>
                                              ))}
                                            </optgroup>
                                          )}
                                          <option value="__manual__">✎ 직접 입력…</option>
                                          <option value="__skip__">— 기록 안 함 —</option>
                                        </select>
                                        {/* 직접 입력 필드 */}
                                        {isManual2 && (() => {
                                          const raw = pageBalanceManualInput[pn] ?? "";
                                          const n = parseNumber(raw);
                                          const disp = n > 0 ? fmt(n) : raw;
                                          return (
                                            <div className="flex items-center gap-0.5">
                                              <input type="text" inputMode="numeric" placeholder="0"
                                                value={disp}
                                                onChange={e => {
                                                  const r = e.target.value.replace(/[^\d-]/g, "");
                                                  setPageBalanceManualInput(prev => ({ ...prev, [pn]: r }));
                                                  setSavedBalancePages(prev => { const s = new Set(prev); s.delete(pn); return s; });
                                                }}
                                                className="text-[10px] font-bold text-orange-800 bg-white border border-orange-400 rounded px-1.5 py-0.5 focus:outline-none focus:border-orange-500 shadow-sm w-[110px] text-right"/>
                                              <span className="text-[10px] font-bold text-orange-700">원</span>
                                            </div>
                                          );
                                        })()}
                                        {isSkip2 && (
                                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded border bg-slate-100 text-slate-600 border-slate-300 whitespace-nowrap">기록 안 함</span>
                                        )}
                                        {!isManual2 && !isSkip2 && overrideVal2 != null && (
                                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border whitespace-nowrap ${
                                            balanceAmount2 != null && overrideVal2 !== balanceAmount2
                                              ? "bg-rose-100 text-rose-600 border-rose-300"
                                              : "bg-emerald-100 text-emerald-700 border-emerald-300"
                                          }`}>
                                            {balanceAmount2 != null && overrideVal2 !== balanceAmount2 ? "불일치" : "선택됨"}
                                          </span>
                                        )}
                                        {(overrideVal2 != null || isManual2 || isSkip2) && (
                                          <button type="button"
                                            onClick={async e => {
                                              e.stopPropagation();
                                              let saveLabel = "";
                                              if (isSkip2) {
                                                saveLabel = "(없음)";
                                                setPageSupplierBalances(prev => { const n = { ...prev }; delete n[pn]; return n; });
                                              } else if (isManual2) {
                                                const raw = pageBalanceManualInput[pn] ?? "";
                                                const n = parseNumber(raw);
                                                if (n > 0) {
                                                  saveLabel = "직접입력";
                                                  setPageSupplierBalances(prev => ({ ...prev, [pn]: n }));
                                                } else return;
                                              } else if (overrideVal2 != null) {
                                                const picked = cands2.find(c => c.amount === overrideVal2);
                                                saveLabel = picked?.label ?? "직접선택";
                                                setPageSupplierBalances(prev => ({ ...prev, [pn]: overrideVal2 }));
                                              }
                                              if (pageSupplier) {
                                                try {
                                                  const currentColOrder = colOrder.length === dispHeaders.length ? colOrder : dispHeaders.map((_, i) => i);
                                                  await fetch("/api/supplier-balance-configs", {
                                                    method: "PUT",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({ supplier_name: pageSupplier, balance_field: saveLabel, column_layout: { col_order: currentColOrder, headers: dispHeaders } }),
                                                  });
                                                } catch (err) { console.warn("[supplier-balance-configs] 저장 실패", err); }
                                              }
                                              setSavedBalancePages(prev => new Set([...prev, pn]));
                                            }}
                                            className={`text-[10px] font-bold px-2.5 py-0.5 rounded shadow-sm transition cursor-pointer whitespace-nowrap ${
                                              savedBalancePages.has(pn) ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "bg-orange-500 hover:bg-orange-600 text-white"
                                            }`}
                                            title={`공급사(${pageSupplier || "미지정"})의 잔고 설정을 저장`}
                                          >{savedBalancePages.has(pn) ? "✓ 저장됨" : "잔고 저장"}</button>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })()}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                );
              })()}

              {!confirmed && (
                <div className="px-4 py-3 text-center text-[11px] text-indigo-400 font-semibold">
                  상품명을 확인·수정한 후 <span className="text-indigo-600 font-bold">확정</span> 버튼을 누르면 표가 생성됩니다.
                </div>
              )}
            </div>
          )}

          {/* ── 확정 결과표 섹션 ── */}
          {matchItems && confirmed && (
            <div className="w-full bg-white border border-emerald-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 border-b border-emerald-100 bg-emerald-50 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 shrink-0">
                  <CheckCircle size={13} className="text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-800">거래명세서 확정표</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded font-bold">
                    {confRows.length}건 · {fmt(confTotal)}원
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input ref={xlsInputRef} type="file" accept=".xlsx,.xls" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { handleTemplateUpload(f); setXlsTemplateSaved(false); e.target.value = ""; } }} />
                  {/* 확정표 열 순서 리셋 버튼 */}
                  {confColOrder.length > 0 && confColOrder.some((v, i) => v !== i) && (
                    <button
                      onClick={() => {
                        const reset = Array.from({ length: CONF_HEADERS.length }, (_, i) => i);
                        setConfColOrder(reset);
                        try { localStorage.setItem("ocr_conf_col_order", JSON.stringify(reset)); } catch { /* ignore */ }
                      }}
                      className="flex items-center gap-1 text-[11px] font-bold text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 px-2 py-1 rounded-lg transition cursor-pointer shrink-0"
                      title="확정표 열 순서 초기화"
                    >
                      열순서 리셋
                    </button>
                  )}
                  {/* 서식 파일 저장 버튼 */}
                  {xlsTemplate && (
                    <button
                      onClick={() => {
                        if (!xlsTemplate || !xlsTemplateName || !xlsTemplateHdrs) return;
                        try {
                          const bytes = new Uint8Array(xlsTemplate);
                          const b64 = btoa(String.fromCharCode(...bytes));
                          localStorage.setItem("ocr_xls_template", JSON.stringify({ name: xlsTemplateName, hdrs: xlsTemplateHdrs, data: b64 }));
                          setXlsTemplateSaved(true);
                        } catch { /* silent */ }
                      }}
                      title="서식 파일을 브라우저에 저장 (다음 방문 시 자동 복원)"
                      className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg transition cursor-pointer shrink-0 border ${
                        xlsTemplateSaved
                          ? "text-emerald-600 bg-emerald-50 border-emerald-200"
                          : "text-indigo-600 bg-indigo-50 border-indigo-200 hover:bg-indigo-100"
                      }`}
                    >
                      <Bookmark size={11} />
                      {xlsTemplateSaved ? "저장됨" : "저장"}
                    </button>
                  )}
                  <button
                    onClick={() => xlsInputRef.current?.click()}
                    title={xlsTemplateName ?? "엑셀 서식 파일 업로드"}
                    className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg transition cursor-pointer shrink-0 border ${
                      xlsTemplateName
                        ? "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                        : "text-gray-500 bg-white border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <UploadIcon size={11} />
                    {xlsTemplateName ? <span className="max-w-[80px] truncate">{xlsTemplateName}</span> : "서식 파일"}
                  </button>
                  <button onClick={handleExcelExport}
                    className="flex items-center gap-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 rounded-lg transition cursor-pointer shrink-0">
                    <FileSpreadsheet size={11} />엑셀 다운로드
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse table-fixed">
                  <thead>
                    <tr className="bg-emerald-50/60 border-b-2 border-emerald-200">
                      {(confColOrder.length === CONF_HEADERS.length ? confColOrder : CONF_HEADERS.map((_, i) => i)).map((origIdx, orderIdx) => {
                        const h = CONF_HEADERS[origIdx];
                        const collapsed = collapsedConfCols.has(h);
                        return (
                          <th key={origIdx}
                            draggable
                            onDragStart={() => setConfDragColIdx(orderIdx)}
                            onDragOver={e => e.preventDefault()}
                            onDrop={() => {
                              if (confDragColIdx === null || confDragColIdx === orderIdx) { setConfDragColIdx(null); return; }
                              setConfColOrder(prev => {
                                const base = prev.length === CONF_HEADERS.length ? prev : CONF_HEADERS.map((_, i) => i);
                                const next = [...base];
                                const [removed] = next.splice(confDragColIdx, 1);
                                next.splice(orderIdx, 0, removed);
                                return next;
                              });
                              setConfDragColIdx(null);
                            }}
                            onDragEnd={() => setConfDragColIdx(null)}
                            onClick={() => setCollapsedConfCols(prev => { const s = new Set(prev); s.has(h) ? s.delete(h) : s.add(h); return s; })}
                            title={collapsed ? `${h} (클릭해서 펼치기 · 드래그로 순서 변경)` : "클릭해서 접기 · 드래그로 순서 변경"}
                            style={{ cursor: 'grab' }}
                            className={`py-2 font-bold whitespace-nowrap select-none transition-colors hover:bg-emerald-100/60 ${
                              collapsed ? "px-1 text-center text-emerald-300 w-4 max-w-[16px]" :
                              CONF_NUM.has(h) ? "px-3 text-right text-emerald-900" : "px-3 text-left text-emerald-900"
                            } ${confDragColIdx === orderIdx ? 'opacity-50' : ''}`}>
                            {collapsed ? "·" : h}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                    <tbody>
                      {confRows.map((row, ri) => {
                        const m        = cancelledRows.has(ri) ? null : (selectedCands[ri] ?? matchItems![ri]?.matched ?? null);
                        const score    = m?.score ?? 0;
                        const masterP  = m?.masterPrice ?? null;
                        const invoiceP = row[CONF_HEADERS.indexOf("전표 매입단가")];
                        const priceDiff = masterP != null && typeof invoiceP === "number" && invoiceP !== masterP
                          ? (invoiceP > masterP ? "high" : "low") : null;
                        const isFirstInPage = ri === 0 || pageNums[ri - 1] !== pageNums[ri];
                        const isLastInPage = ri === confRows.length - 1 || pageNums[ri] !== pageNums[ri + 1];
                        const pn = pageNums[ri];
                        const isPageCollapsedConf = collapsedConfPages.has(pn);
                        const pageRowCountConf = isFirstInPage ? confRows.filter((_, i) => pageNums[i] === pn).length : 0;
                        const pageSupplierHeadConf = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
                        return (
                          <React.Fragment key={ri}>
                            {/* 확정표 페이지 헤더 (접기/펴기) */}
                            {isFirstInPage && (
                              <tr className="bg-emerald-100/70 border-t-2 border-emerald-300 cursor-pointer hover:bg-emerald-200/70 select-none"
                                onClick={() => setCollapsedConfPages(prev => {
                                  const n = new Set(prev);
                                  if (n.has(pn)) n.delete(pn); else n.add(pn);
                                  return n;
                                })}
                                title={isPageCollapsedConf ? "펴기" : "접기"}>
                                <td colSpan={CONF_HEADERS.length} className="px-3 py-1.5">
                                  <span className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                                    <span className="w-4 text-center text-emerald-600">{isPageCollapsedConf ? "▶" : "▼"}</span>
                                    <span className="bg-white border border-emerald-300 rounded px-1.5 py-0.5 text-emerald-700">{pn}번 명세서</span>
                                    {pageSupplierHeadConf && <span className="text-emerald-700 font-black">{pageSupplierHeadConf}</span>}
                                    <span className="text-emerald-500 font-normal">· {pageRowCountConf}건</span>
                                    {isPageCollapsedConf && <span className="text-emerald-500 font-normal ml-auto">(클릭하여 펼치기)</span>}
                                  </span>
                                </td>
                              </tr>
                            )}
                            {!isPageCollapsedConf && (
                            <tr
                              className={`border-t border-gray-100 transition-colors hover:bg-indigo-50/40 ${ri % 2 !== 0 ? "bg-gray-50/30" : ""}`}
                            >
                              {(confColOrder.length === CONF_HEADERS.length ? confColOrder : CONF_HEADERS.map((_, i) => i)).map(origIdx => {
                                const h = CONF_HEADERS[origIdx];
                                const ci = origIdx;
                                if (collapsedConfCols.has(h)) return <td key={origIdx} className="px-0 py-2 w-1 max-w-[4px] bg-emerald-50/30" />;
                                const cell          = row[ci];
                                const isNum         = typeof cell === "number";
                                const isName        = h === "상품명";
                                const isMasterPrice = h === "마스터 매입단가";
                                const isInvoiceP    = h === "전표 매입단가";
                                const isProfitRate  = h === "이익률";
                                const isBalance     = h === "공급사잔고";
                                const isSpec = h === "규격";
                                return (
                                  <td key={ci}
                                    className={`px-3 py-2 ${isSpec || isName ? "whitespace-normal max-w-[240px]" : "whitespace-nowrap"} ${
                                      h === "매입총계"                       ? "text-right font-bold text-emerald-700" :
                                      isMasterPrice                          ? `text-right font-bold ${priceDiff ? "text-blue-600" : "text-blue-400"}` :
                                      isInvoiceP && priceDiff === "high"     ? "text-right font-bold text-rose-600" :
                                      isInvoiceP && priceDiff === "low"      ? "text-right font-bold text-emerald-600" :
                                      isInvoiceP                             ? "text-right text-gray-700" :
                                      isProfitRate                           ? "text-right text-emerald-700 font-semibold" :
                                      isBalance                              ? "text-right text-indigo-600 font-bold" :
                                      isNum                                  ? "text-right text-gray-700" :
                                      h === "상품코드"                       ? "text-gray-400 text-[10px] font-mono" :
                                      h === "유통기한"                       ? "text-gray-500 text-[10px]" :
                                      isSpec                                 ? "text-gray-400 text-[10px]" :
                                      h === "거래일"                         ? "text-gray-500 text-[10px]" :
                                      isName ? `font-semibold ${m ? (score >= 80 ? "text-emerald-700" : score >= 50 ? "text-amber-700" : "text-rose-600") : "text-rose-500 italic"}` :
                                               "text-gray-600"
                                    }`}>
                                    {cell == null
                                      ? isMasterPrice
                                        ? <span className="text-rose-500 font-bold text-xs">✕</span>
                                        : <span className="text-gray-300">—</span>
                                      : isProfitRate && isNum ? `${cell}%`
                                      : isNum ? fmt(cell)
                                      : isName ? (() => {
                                          const origOcr = nameIdx >= 0 ? String(effectiveDispRows[ri]?.[nameIdx] ?? "").trim() : null;
                                          const hasCorrected = origOcr && String(cell) !== origOcr;
                                          const isCancelled = cancelledAutoSyn.has(ri);
                                          return (
                                            <div className="flex items-start gap-1">
                                              <span className="block break-words line-clamp-2 flex-1">{String(cell)}</span>
                                              {hasCorrected && !isCancelled && (
                                                <button
                                                  onClick={e => { e.stopPropagation(); setCancelledAutoSyn(prev => new Set([...prev, ri])); }}
                                                  title={`취소 → 원본: ${origOcr}`}
                                                  className="text-[9px] px-1 py-px rounded bg-rose-100 text-rose-600 hover:bg-rose-200 cursor-pointer shrink-0 mt-0.5">✕</button>
                                              )}
                                              {hasCorrected && isCancelled && (
                                                <button
                                                  onClick={e => { e.stopPropagation(); setCancelledAutoSyn(prev => { const n = new Set(prev); n.delete(ri); return n; }); }}
                                                  title="보정 복원"
                                                  className="text-[9px] px-1 py-px rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 cursor-pointer shrink-0 mt-0.5">↩</button>
                                              )}
                                            </div>
                                          );
                                        })()
                                      : isSpec ? <span className="block break-words line-clamp-2">{String(cell)}</span>
                                      : String(cell)}
                                  </td>
                                );
                              })}
                            </tr>
                            )}
                            {isLastInPage && uniquePageNums.length > 1 && confAmtIdx >= 0 && (() => {
                              const pageSupplier = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
                              const pageBalance  = pageSupplierBalances[pn];
                              const configuredLabel = pageSupplier ? balanceConfig[pageSupplier] : undefined;
                              const balanceCands = pageBalanceCandidates.get(pn) ?? [];
                              const confBalanceAmount = configuredLabel
                                ? (balanceCands.find(c => c.label === configuredLabel)?.amount
                                   ?? (configuredLabel && ["합계", "합계액", "총합계"].includes(configuredLabel) ? (structuredPages.find(p => p.page === pn)?.meta.total ?? null) : null))
                                : null;
                              // confColOrder 반영: 렌더 순서대로 subtotal 셀 배치
                              const confOrderNow = confColOrder.length === CONF_HEADERS.length
                                ? confColOrder
                                : CONF_HEADERS.map((_, i) => i);
                              // "매입총계" 이전(원본 인덱스 < confAmtIdx) 중 마지막으로 화면에 표시되는 열 찾기
                              const subtotalLabelOrderIdx = (() => {
                                for (let k = confOrderNow.length - 1; k >= 0; k--) {
                                  const origIdx = confOrderNow[k];
                                  const h = CONF_HEADERS[origIdx];
                                  if (origIdx < confAmtIdx && origIdx !== CONF_HEADERS.indexOf("공급처") && !collapsedConfCols.has(h)) {
                                    return k;
                                  }
                                }
                                return -1;
                              })();
                              return (
                                <>
                                  <tr className="bg-emerald-100/60 border-t-2 border-emerald-300">
                                    {confOrderNow.map((origIdx, orderIdx) => {
                                      const h = CONF_HEADERS[origIdx];
                                      if (collapsedConfCols.has(h)) return <td key={origIdx} className="px-0 py-1.5 w-1 max-w-[4px] bg-emerald-50/30" />;
                                      if (h === "공급처") return (
                                        <td key={origIdx} className="px-3 py-1.5 text-left font-bold text-emerald-500 whitespace-nowrap">
                                          {pageSupplier}
                                        </td>
                                      );
                                      if (h === "매입총계") return (
                                        <td key={origIdx} className="px-3 py-1.5 text-right font-black text-emerald-600 whitespace-nowrap">
                                          {fmt(confPageTotals.get(pn) ?? 0)}원
                                        </td>
                                      );
                                      if (h === "공급사잔고" && pageBalance != null) return (
                                        <td key={origIdx} className="px-3 py-1.5 text-right font-black text-indigo-600 whitespace-nowrap">
                                          {fmt(pageBalance)}원
                                        </td>
                                      );
                                      if (orderIdx === subtotalLabelOrderIdx) return (
                                        <td key={origIdx} className="px-3 py-1.5 text-right font-bold text-emerald-700">
                                          {pn}번 소계
                                        </td>
                                      );
                                      return <td key={origIdx} />;
                                    })}
                                  </tr>
                                  {(confBalanceAmount != null || balanceCands.length > 0) && (() => {
                                    const overrideValConf = pageBalanceOverride[pn];
                                    const effectiveBalConf = overrideValConf ?? confBalanceAmount;
                                    const isMismatchConf = confBalanceAmount != null && overrideValConf != null && overrideValConf !== confBalanceAmount;
                                    return (
                                      <tr className="bg-orange-50 border-b border-orange-100">
                                        <td colSpan={CONF_HEADERS.length} className="px-3 py-1 text-center text-[11px] font-bold text-orange-600 whitespace-nowrap">
                                          <span className="inline-flex items-center gap-2 justify-center flex-wrap">
                                            {pageSupplier && <span className="text-orange-700 font-black">{pageSupplier}</span>}
                                            {pageImages?.length ? (
                                              <button
                                                type="button"
                                                onClick={e => { e.stopPropagation(); openPageModal(pn); }}
                                                className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-orange-500 hover:bg-orange-600 px-2 py-0.5 rounded transition cursor-pointer"
                                                title={`${pn}번 거래명세서 이미지 보기`}
                                              >📄 거래명세서 보기</button>
                                            ) : null}
                                            <span>잔고: {effectiveBalConf != null ? `${fmt(effectiveBalConf)}원` : <span className="text-gray-300">—</span>}</span>
                                            {balanceCands.length > 0 && (
                                              <>
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                                  isMismatchConf ? "bg-rose-100 text-rose-600 border border-rose-200" : "bg-white text-orange-500 border border-orange-200"
                                                }`}>
                                                  {isMismatchConf ? "불일치" : "OCR 추출값"}
                                                </span>
                                                <select
                                                  value={overrideValConf ?? ""}
                                                  onChange={async e => {
                                                    const v = e.target.value;
                                                    if (v === "") {
                                                      setPageBalanceOverride(prev => { const n = { ...prev }; delete n[pn]; return n; });
                                                      return;
                                                    }
                                                    const amt = Number(v);
                                                    setPageBalanceOverride(prev => ({ ...prev, [pn]: amt }));
                                                    const picked = balanceCands.find(c => c.amount === amt);
                                                    if (picked && pageSupplier) {
                                                      try {
                                                        await fetch("/api/supplier-balance-configs", {
                                                          method: "PUT",
                                                          headers: { "Content-Type": "application/json" },
                                                          body: JSON.stringify({ supplier_name: pageSupplier, balance_field: picked.label }),
                                                        });
                                                      } catch (err) { console.warn("[supplier-balance-configs] 저장 실패", err); }
                                                    }
                                                  }}
                                                  className="text-[10px] font-bold text-orange-700 bg-white border border-orange-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-orange-500 cursor-pointer"
                                                  title="OCR 추출 금액 중 잔고로 사용할 값 선택 (선택 시 잔고항목 지정 테이블에 자동 저장)"
                                                >
                                                  <option value="">자동</option>
                                                  {balanceCands.map((c, ci) => (
                                                    <option key={ci} value={c.amount}>
                                                      {c.label} · {fmt(c.amount)}원
                                                    </option>
                                                  ))}
                                                </select>
                                              </>
                                            )}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })()}
                                </>
                              );
                            })()}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    {confTotal > 0 && (() => {
                      const confOrderNow = confColOrder.length === CONF_HEADERS.length
                        ? confColOrder
                        : CONF_HEADERS.map((_, i) => i);
                      const amtOrderIdx = confOrderNow.indexOf(confAmtIdx);
                      return (
                      <tfoot>
                        {confSupplierTotals.length >= 1 && confSupplierTotals.map(({ supplier, total: sTotal, count }) => {
                          const latestBalance = supplierBalanceRecords.find(b => b.supplier_name === supplier);
                          const ocrBalance = supplierOcrBalance.get(supplier);
                          const invoiceDateForSupplier = (() => {
                            const pageNums_ = [...new Set(pageNums)];
                            for (const pn of pageNums_) {
                              const sp = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
                              if (sp === supplier) return structuredPages.find(p => p.page === pn)?.meta.date ?? null;
                            }
                            return null;
                          })();
                          const isSaving = savingBalance[supplier] ?? false;
                          return (
                            <tr key={supplier} className="border-t border-emerald-100 bg-emerald-50/40">
                              {amtOrderIdx > 0 && (
                                <td colSpan={amtOrderIdx} className="px-3 py-2 text-right font-semibold text-gray-500">
                                  <span className="flex items-center justify-end gap-2 flex-wrap">
                                    <span>{supplier} <span className="text-gray-400">({count}건)</span></span>
                                    {ocrBalance != null && ocrBalance > 0 && (
                                      <span className="text-rose-600 font-black text-xs whitespace-nowrap bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                                        잔고 {fmt(ocrBalance)}원
                                      </span>
                                    )}
                                    {latestBalance && (
                                      <span className="text-rose-500 font-bold whitespace-nowrap text-[10px]">
                                        (DB: {fmt(latestBalance.balance)}원
                                        {latestBalance.invoice_date && <span className="text-rose-400 font-normal ml-1">{latestBalance.invoice_date}</span>})
                                      </span>
                                    )}
                                    <button
                                      onClick={() => saveSupplierBalance(supplier, sTotal, invoiceDateForSupplier)}
                                      disabled={isSaving}
                                      className="text-[10px] font-bold text-white bg-rose-500 hover:bg-rose-600 disabled:opacity-50 px-1.5 py-0.5 rounded transition cursor-pointer shrink-0"
                                      title="이 총액을 잔고로 DB에 기록"
                                    >
                                      {isSaving ? "..." : "잔고기록"}
                                    </button>
                                  </span>
                                </td>
                              )}
                              <td className="px-3 py-2 text-right font-bold text-emerald-600 text-xs whitespace-nowrap">{fmt(sTotal)}원</td>
                              {(confOrderNow.length - amtOrderIdx - 1) > 0 && (
                                <td colSpan={confOrderNow.length - amtOrderIdx - 1} />
                              )}
                            </tr>
                          );
                        })}
                        <tr className="bg-emerald-50 border-t-2 border-emerald-300">
                          {amtOrderIdx > 0 && <td colSpan={amtOrderIdx} className="px-3 py-2.5 text-right font-black text-gray-700 text-xs">합 계</td>}
                          <td className="px-3 py-2.5 text-right font-black text-emerald-700 text-sm whitespace-nowrap">{fmt(confTotal)}원</td>
                          {(confOrderNow.length - amtOrderIdx - 1) > 0 && <td colSpan={confOrderNow.length - amtOrderIdx - 1} />}
                        </tr>
                      </tfoot>
                      );
                    })()}
                  </table>
                </div>
                {onSaveConfirmed && (
                  <div className="px-4 py-3 flex justify-end border-t border-emerald-100 bg-white">
                    <button
                      type="button"
                      onClick={handleSaveConfirmed}
                      disabled={savingConfirmed}
                      className="flex items-center gap-1.5 text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition cursor-pointer shrink-0 shadow-sm"
                      title="현재 표시된 항목들을 확정표(DB)에 저장합니다"
                    >
                      {savingConfirmed
                        ? <><Loader2 size={12} className="animate-spin" />저장 중</>
                        : <><Save size={12} />확정표 저장</>}
                    </button>
                  </div>
                )}
            </div>
          )}
        </>
      )}

      {/* ── 공급사별 컬럼 매핑 모달 · 시각적 연결선 방식 ─────────────────── */}
      {mappingModal && (
        <ColumnMappingModal
          supplier={mappingModal.supplier}
          rawHeaders={mappingModal.rawHeaders}
          sampleRows={mappingModal.sampleRows}
          rawSampleForDetect={mappingModal.rawSampleForDetect}
          fieldOptions={MAPPING_FIELD_OPTIONS}
          mapping={mappingSelection}
          onChangeMapping={setMappingSelection}
          onCancel={() => setMappingModal(null)}
          onSave={saveMappingTemplate}
          saving={mappingSaving}
        />
      )}

      {/* ── 표 감지 실패 원문 (컬럼 매핑 · 재추출 버튼 포함) ── */}
      {fallbackPages.map(p => {
        const supplier = p.meta?.supplier ?? "";
        return (
          <div key={p.page} className="w-full bg-white border border-rose-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-2 border-b border-rose-100 bg-rose-50 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-rose-700">
                페이지 {p.page} — 표 감지 실패 (원문)
              </span>
              {supplier && (
                <span className="text-[11px] font-bold text-amber-700">공급: {supplier}</span>
              )}
              {/* 🔧 컬럼 매핑 — 모든 명세서에 노출 (공급사 미탐지 시 모달에서 입력) */}
              <button
                type="button"
                onClick={() => openMappingModal(p.page)}
                className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-white border border-indigo-300 hover:bg-indigo-50 rounded px-1.5 py-0.5 whitespace-nowrap"
                title={supplier ? `${supplier} 공급사의 컬럼 매핑 저장` : "이 명세서 컬럼 매핑 지정 (공급사 미탐지)"}
              >🔧 컬럼 매핑{supplier && mappingSaved.has(supplier) ? " ✓" : ""}</button>
              {/* 🔄 재추출 (다시 파싱 시도) */}
              {onReparsePage && supplier && (
                <button
                  type="button"
                  onClick={() => onReparsePage(p.page, supplier)}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-indigo-500 hover:bg-indigo-600 rounded px-1.5 py-0.5 whitespace-nowrap"
                  title="이 페이지 재파싱 시도"
                >🔄 재파싱</button>
              )}
            </div>
            <pre className="px-4 py-3 text-[11px] text-gray-600 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
              {p.rawText ?? p.rows.filter(r => Array.isArray(r)).map(r => r[0]).join("\n")}
            </pre>
          </div>
        );
      })}
    </div>
    </>
  );
};
