import React, { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Wand2, Loader2, CheckCircle, AlertTriangle, XCircle, X, Bookmark, BookmarkCheck, Search, Pencil, FileSpreadsheet, Upload as UploadIcon, BookmarkPlus, BookOpen, Check } from "lucide-react";

interface RawPage {
  page: number;
  headers: string[];
  rows: (string | number | null)[][];
  meta: { supplier?: string | null; recipient?: string | null; date?: string | null; total?: number | null };
  rawText?: string;
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
}

const SCHEMA_ORDER = ["공급처","일자","품명","수량","단가","금액","세액","규격","단위","비고"];
const HIDDEN_COLS  = new Set(["번호", "배치번호", "에누리", "Batch No", "BatchNo", "BATCH NO", "소비기한", "사용기한", "소비/사용기한", "보험코드"]);
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

export const RawOcrTable: React.FC<RawOcrTableProps> = ({ pages, pageImages, rotation = -90, onReparsePage, barcodeMatches, balanceConfig: balanceConfigProp }) => {
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

  // ── Feature 1: 금액 자동보정 ──────────────────────────────────────────────
  const [amountCorrections, setAmountCorrections] = useState<Record<number, number>>({});
  // 소계 불일치 시 사용자 선택: "stated" = 명세서 소계, "computed" = 인식된 합계
  const [pageSubtotalChoices, setPageSubtotalChoices] = useState<Record<number, "stated" | "computed">>({});
  // 공급사 잔고 (페이지별)
  const [pageSupplierBalances, setPageSupplierBalances] = useState<Record<number, number>>({});
  // 공급사 잔고 DB 기록
  const [supplierBalanceRecords, setSupplierBalanceRecords] = useState<{ id: number; supplier_name: string; invoice_date: string | null; balance: number; created_at: string }[]>([]);
  const [savingBalance, setSavingBalance] = useState<Record<string, boolean>>({});
  // 확정표 컬럼 접기
  const [collapsedConfCols, setCollapsedConfCols] = useState<Set<string>>(new Set());

  // ── 컬럼 너비 조정 ────────────────────────────────────────────────────────────
  const [colWidths, setColWidths] = useState<Record<number, number>>({});
  const resizeRef = useRef<{ ci: number; startX: number; startW: number } | null>(null);

  // ── 셀 인라인 편집 (수량/단가/금액) ───────────────────────────────────────
  const [cellEdits,      setCellEdits     ] = useState<Record<number, Record<number, number | null>>>({});
  const [editingCell,    setEditingCell   ] = useState<{ ri: number; ci: number } | null>(null);
  const [editingCellVal, setEditingCellVal] = useState("");

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
  const effectiveDispRows = dispRows.map((row, ri) => {
    const hasAmtCorr = amtIdx >= 0 && amountCorrections[ri] !== undefined;
    const edits = cellEdits[ri];
    if (!hasAmtCorr && !edits) return row;
    const nr = [...row];
    if (hasAmtCorr) nr[amtIdx] = amountCorrections[ri];
    if (edits) for (const [ciStr, val] of Object.entries(edits)) nr[Number(ciStr)] = val as string | number;
    return nr;
  });

  // 보정 반영된 페이지별 합계
  const effectivePageTotals = new Map<number, number>();
  if (amtIdx >= 0) {
    effectiveDispRows.forEach((row, ri) => {
      const pn = pageNums[ri];
      effectivePageTotals.set(pn, (effectivePageTotals.get(pn) ?? 0) + parseNumber(row[amtIdx]));
    });
  }

  // 사용자 선택 반영한 페이지 표시 합계
  const getPageDisplayTotal = (pn: number): number => {
    if (pageSubtotalChoices[pn] === "stated") {
      return structuredPages.find(p => p.page === pn)?.meta?.total ?? effectivePageTotals.get(pn) ?? 0;
    }
    return effectivePageTotals.get(pn) ?? 0;
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

  // 페이지별 잔고 후보 (OCR 행 중 합계/잔고/잔액 포함 행의 금액)
  const pageBalanceCandidates = new Map<number, { label: string; amount: number }[]>();
  for (const pn of uniquePageNums) {
    const pageData = structuredPages.find(p => p.page === pn);
    if (!pageData) continue;
    const seen = new Set<number>();
    const result: { label: string; amount: number }[] = [];
    for (const row of pageData.rows) {
      if (!Array.isArray(row)) continue;
      const isSummaryRow = row.some(cell => cell != null && /합계|잔고|잔액|전잔|미수/.test(String(cell)));
      if (!isSummaryRow) continue;
      let label = "";
      let amount = 0;
      for (const cell of row) {
        if (cell == null) continue;
        const n = typeof cell === "number" ? cell : parseNumber(cell);
        if (n > 0 && amount === 0) amount = n;
        if (typeof cell === "string" && /합계|잔고|잔액|전잔|미수/.test(cell) && cell.length <= 10) label = cell.trim();
      }
      if (amount > 0 && !seen.has(amount)) { seen.add(amount); result.push({ label: label || "잔고", amount }); }
    }
    if (result.length > 0) pageBalanceCandidates.set(pn, result);
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

  // ── 이미지 모달 + 줌/패닝 ────────────────────────────────────────────────
  const [modalImg,   setModalImg  ] = useState<string | null>(null);
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
    setModalImg(null); setZoom(1); setPan({ x: 0, y: 0 });
  }, []);

  const openModal = useCallback((rowIdx: number) => {
    if (!pageImages?.length) return;
    const pNum = Math.max(1, Math.min(pageNums[rowIdx] ?? 1, pageImages.length));
    const img  = pageImages[pNum - 1] ?? pageImages[0];
    const label = String(dispRows[rowIdx]?.[nameIdx] ?? "");
    if (img) { setModalImg(img); setModalLabel(label); setZoom(1); setPan({ x: 0, y: 0 }); }
  }, [pageImages, pageNums, dispRows, nameIdx]);

  const openPageModal = useCallback((pageNum: number) => {
    if (!pageImages?.length) return;
    const pNum = Math.max(1, Math.min(pageNum, pageImages.length));
    const img = pageImages[pNum - 1] ?? pageImages[0];
    if (img) { setModalImg(img); setModalLabel(`${pageNum}번 명세서`); setZoom(1); setPan({ x: 0, y: 0 }); }
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
  const [overrides,        setOverrides       ] = useState<Record<number, string>>({});
  const [supplierOverrides,setSupplierOverrides] = useState<Record<number, string>>({});
  const [confirmed,        setConfirmed       ] = useState(false);
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
  const [cancelledRows,    setCancelledRows    ] = useState<Set<number>>(new Set());
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
      if (e.key !== "Escape") return;
      if (modalImg) { closeModal(); return; }
      if (deleteSynConfirm) { setDeleteSynConfirm(null); return; }
      if (supplierConfirm) { setSupplierConfirm(null); return; }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalImg, deleteSynConfirm, supplierConfirm, closeModal]);

  // ── 이름 기반 동의어 삭제 ────────────────────────────────────────────────
  const deleteSynonymByName = useCallback(async (origName: string) => {
    const name = origName.trim();
    if (!name) return;
    try {
      await fetch("/api/ocr-synonyms/by-name", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prod_name_old: name }),
      });
    } catch (e) {
      console.warn("[ocr-synonyms/by-name] 삭제 오류:", e);
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

  const handleMatch = useCallback(async () => {
    if (nameIdx < 0) return;
    const names = dispRows.map(r => String(r[nameIdx] ?? ""));
    const suppliers = dispRows.map((_, ri) => {
      const pn = pageNums[ri];
      if (rawSupplierByPage[pn] !== undefined) return rawSupplierByPage[pn];
      if (ocrSuppIdx >= 0) {
        const cell = String(dispRows[ri]?.[ocrSuppIdx] ?? "").trim();
        if (cell) return cell;
      }
      return structuredPages.find(p => p.page === pn)?.meta.supplier ?? globalSupplier ?? "";
    });
    setMatching(true); setMatchItems(null); setOverrides({}); setSupplierOverrides({}); setConfirmed(false); setSavedSynonyms(new Set()); setSavedSupplierAliases(new Set());
    setRetryingRows(new Set()); setCandidatesMap({}); setOpenCandRow(null); setSelectedCands({}); setCancelledRows(new Set());
    try {
      const res  = await fetch("/api/ocr-match", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ names, suppliers }) });
      const data = await res.json();
      setMatchItems(data.matches ?? []);
    } finally { setMatching(false); }
  }, [dispRows, nameIdx, pageNums, rawSupplierByPage, ocrSuppIdx, structuredPages, globalSupplier]);

  // ── 확정 표 ──────────────────────────────────────────────────────────────
  const CONF_HEADERS = [
    "거래일","상품코드","상품명",
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

  const confRows: (string | number | null)[][] = matchItems
    ? effectiveDispRows.map((row, ri) => {
        const m        = cancelledRows.has(ri) ? null : (selectedCands[ri] ?? matchItems[ri]?.matched ?? null);
        const autoSyn  = autoSynonymMatches[ri];
        const bc       = barcodeAutoMap[ri] ?? null;
        const origOcrName = nameIdx >= 0 ? String(row[nameIdx] ?? "").trim() || null : null;
        const corrName = cancelledAutoSyn.has(ri)
          ? (overrides[ri] ?? origOcrName)
          : (overrides[ri] ?? m?.name ?? autoSyn?.name ?? bc?.name ?? origOcrName);
        const corrCode = m?.code ?? autoSyn?.code ?? bc?.code ?? null;
        const qty  = ocrQtyIdx  >= 0 ? row[ocrQtyIdx]  : null;
        const amt  = amtIdx >= 0 && row[amtIdx] != null ? parseNumber(row[amtIdx]) : null;
        const pri  = ocrPriIdx  >= 0 ? row[ocrPriIdx]  : null;
        const spec = ocrSpecIdx >= 0 ? (row[ocrSpecIdx] ?? m?.spec ?? bc?.spec ?? null) : (m?.spec ?? bc?.spec ?? null);
        const pn = pageNums[ri];
        const rawSupp = rawSupplierByPage[pn] !== undefined
          ? rawSupplierByPage[pn]
          : (ocrSuppIdx >= 0 ? (row[ocrSuppIdx] ?? globalSupplier) : (structuredPages.find(p => p.page === pn)?.meta.supplier ?? globalSupplier));
        const supp    = supplierOverrides[ri] !== undefined ? supplierOverrides[ri] : rawSupp;
        const dateVal = structuredPages.find(p => p.page === pn)?.meta.date ?? null;
        return [dateVal, corrCode, corrName, m?.masterPrice ?? bc?.masterPrice ?? null, pri, supp, qty, amt,
                m?.salePrice ?? bc?.salePrice ?? null,
                m?.profitRate != null ? m.profitRate : (bc?.profitRate ?? null),
                m?.expiryDate ?? bc?.expiryDate ?? null, spec, null];
      })
    : [];

  const confAmtIdx  = CONF_HEADERS.indexOf("매입총계");
  const confSuppIdx = CONF_HEADERS.indexOf("공급처");

  const confPageTotals = new Map<number, number>();
  if (confAmtIdx >= 0 && matchItems) {
    confRows.forEach((row, ri) => {
      const pn = pageNums[ri];
      confPageTotals.set(pn, (confPageTotals.get(pn) ?? 0) + parseNumber(row[confAmtIdx]));
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
            {p.spec && <span className="text-gray-400 shrink-0 max-w-[60px] truncate">{p.spec}</span>}
            {p.supplier && <span className="text-sky-500 shrink-0 max-w-[60px] truncate">{p.supplier}</span>}
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

    {/* ── 이미지 모달 (줌·드래그) ── */}
    {modalImg && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
        onClick={closeModal}>
        <div className="relative w-full bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          style={{ maxWidth: "min(900px, 95vw)", height: "90vh" }}
          onClick={e => e.stopPropagation()}>

          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200 shrink-0">
            <span className="text-xs font-bold text-gray-700 truncate max-w-[220px]">{modalLabel}</span>
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
              <span className="text-xs font-bold text-gray-800">거래명세서 품목</span>
              <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded font-bold">
                {allRows.length}행 · {structuredPages.length}페이지
              </span>
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
            <button onClick={() => handleExport(dispHeaders, dispRows, "원본")}
              className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 px-2 py-1 rounded-lg transition cursor-pointer shrink-0">
              <Download size={11} />CSV
            </button>
          </div>

          {/* ── 소계 불일치 경고 ── */}
          {pageMismatches.length > 0 && (
            <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 flex flex-col gap-1.5">
              {pageMismatches.map(({ pageNum, computed, stated }) => {
                const resolved = isPageResolved(pageNum);
                const effectiveComputed = effectivePageTotals.get(pageNum) ?? computed;

                if (resolved) {
                  const choice = pageSubtotalChoices[pageNum];
                  const chosenVal = choice === "stated" ? stated : effectiveComputed;
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
                            ({choice === "stated" ? "명세서 소계" : "인식된 합계"} 기준)
                          </span>
                        )}
                        <button
                          onClick={() => setPageSubtotalChoices(prev => { const n = { ...prev }; delete n[pageNum]; return n; })}
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

                return (
                  <div key={pageNum} className="flex items-center gap-2 flex-wrap">
                    <AlertTriangle size={12} className="shrink-0 text-rose-500" />
                    <button
                      onClick={() => openPageModal(pageNum)}
                      disabled={!pageImages?.length}
                      className="text-[11px] font-semibold text-rose-700 shrink-0 disabled:cursor-default enabled:hover:underline enabled:cursor-pointer"
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
              <div key={pn} className="px-4 py-2 bg-rose-50 border-b border-rose-200 flex items-center gap-2 text-[11px] font-semibold text-rose-700">
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

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-amber-50 border-b-2 border-amber-200">
                  {dispHeaders.map((h, ci) => (
                    <th key={ci}
                      style={{ width: colWidths[ci] ?? 'auto', minWidth: 40, position: 'relative' }}
                      className={`px-3 py-2.5 font-bold text-amber-900 whitespace-nowrap text-[11px] ${NUM_COLS.has(h) ? "text-right" : "text-left"}`}>
                      {h}
                      <div
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 1 }}
                        onMouseDown={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          const th = (e.currentTarget as HTMLElement).parentElement as HTMLTableCellElement;
                          resizeRef.current = { ci, startX: e.clientX, startW: th.offsetWidth };
                        }}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {effectiveDispRows.map((row, ri) => {
                  const isLastInPage = ri === effectiveDispRows.length - 1 || pageNums[ri] !== pageNums[ri + 1];
                  const pn = pageNums[ri];
                  const isMismatch = ocrQtyIdx >= 0 && ocrPriIdx >= 0 && amtIdx >= 0 && (() => {
                    const qty = parseNumber(row[ocrQtyIdx]);
                    const pri = parseNumber(row[ocrPriIdx]);
                    const amt = parseNumber(row[amtIdx]);
                    return qty > 0 && pri > 0 && amt > 0 && Math.abs(Math.round(qty * pri) - amt) > 1;
                  })();
                  return (
                    <React.Fragment key={ri}>
                      <tr
                        onClick={pageImages?.length ? () => openModal(ri) : undefined}
                        className={`border-t border-gray-100 transition-colors ${
                          isMismatch ? "bg-rose-50/60" : ri % 2 !== 0 ? "bg-gray-50/40" : ""
                        } ${pageImages?.length ? "cursor-pointer hover:bg-amber-100/70" : "hover:bg-amber-50/50"}`}
                      >
                        {dispHeaders.map((h, ci) => {
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
                          const barcodeMatch = isName ? barcodeAutoMap[ri] : undefined;
                          const autoMatch = isName ? autoSynonymMatches[ri] : undefined;
                          const origCell = isName ? dispRows[ri]?.[ci] : null;

                          if (isEditingThisSupp) {
                            return (
                              <td key={ci} className="px-1 py-1" onClick={e => e.stopPropagation()}>
                                <input
                                  autoFocus
                                  className="text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-300 rounded px-2 py-0.5 outline-none min-w-[80px] w-full"
                                  value={editingRawSuppVal}
                                  onChange={e => setEditingRawSuppVal(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") e.currentTarget.blur();
                                    if (e.key === "Escape") setEditingRawSuppRow(null);
                                  }}
                                  onBlur={() => {
                                    const trimmed = editingRawSuppVal.trim();
                                    const current = String(cell ?? "");
                                    if (trimmed && trimmed !== current) {
                                      const rowCount = pageNums.filter(p => p === pn).length;
                                      setSupplierConfirm({ pageNum: pn, newVal: trimmed, rowCount, addSynonyms: addSynonymsOnChange });
                                    }
                                    setEditingRawSuppRow(null);
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
                                className="px-3 py-2 whitespace-nowrap text-sky-700 font-semibold cursor-pointer hover:bg-sky-50 group"
                                title="클릭하여 공급처 변경"
                              >
                                <span className="flex items-center gap-1">
                                  <span>{cell == null ? <span className="text-gray-300">—</span> : String(cell)}</span>
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
                                    if (e.key === "Enter") e.currentTarget.blur();
                                    if (e.key === "Escape") setEditingCell(null);
                                  }}
                                  onBlur={() => commitCellEdit(ri, ci, editingCellVal)}
                                />
                              </td>
                            );
                          }

                          // 수량/단가/금액 인라인 편집 — 클릭 가능 셀
                          if (isEditableNum) {
                            return (
                              <td key={ci}
                                onClick={e => {
                                  e.stopPropagation();
                                  setEditingCell({ ri, ci });
                                  const rawNum = cell != null ? String(parseNumber(cell) || "") : "";
                                  setEditingCellVal(rawNum);
                                }}
                                className={`px-3 py-2 whitespace-nowrap text-right cursor-pointer hover:bg-indigo-50/60 group ${
                                  isMismatch && isAmt ? "text-rose-700 font-bold" : "font-bold text-amber-800"
                                }`}
                                title="클릭하여 수정"
                              >
                                <span className="flex items-center justify-end gap-1">
                                  {isMismatch && isAmt && <AlertTriangle size={9} className="text-rose-400 shrink-0" />}
                                  <span className={hasDirectEdit ? "text-indigo-700" : isCorrectedAmt ? "text-emerald-700" : ""}>
                                    {cell == null
                                      ? <span className="text-gray-300">—</span>
                                      : typeof cell === "number" ? fmt(cell) : String(cell)}
                                  </span>
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
                              <td key={ci} className="px-3 py-2 max-w-[220px]">
                                <div className="flex flex-col gap-0">
                                  <span className="flex items-center gap-1">
                                    <span className="text-[9px] bg-emerald-100 text-emerald-700 font-black px-1 rounded shrink-0">BC</span>
                                    <span className="font-semibold text-emerald-700 break-words whitespace-normal text-[11px]">{barcodeMatch.name}</span>
                                  </span>
                                  <span className="text-gray-300 text-[10px] line-through break-words whitespace-normal">{String(origCell ?? "")}</span>
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
                                  className="px-3 py-2 max-w-[220px] cursor-pointer hover:bg-indigo-50/60 group"
                                  title="클릭하여 상품명 수정">
                                  <div className="flex flex-col gap-0">
                                    <span className="flex items-center gap-1">
                                      <BookOpen size={9} className="text-indigo-400 shrink-0" />
                                      <span className="font-semibold text-indigo-700 break-words line-clamp-2 text-[11px]">{autoMatch.name}</span>
                                      <Pencil size={8} className="text-indigo-200 opacity-0 group-hover:opacity-100 transition shrink-0" />
                                    </span>
                                    <button
                                      type="button"
                                      onClick={e => { e.stopPropagation(); setDeleteSynConfirm({ ri, origName: String(origCell ?? "") }); }}
                                      className="text-gray-300 text-[10px] line-through break-words line-clamp-2 hover:text-rose-400 cursor-pointer text-left"
                                      title="클릭하여 동의어 삭제"
                                    >
                                      {String(origCell ?? "")}
                                    </button>
                                  </div>
                                </td>
                              );
                            }

                            // 일반 품명 (autoMatch 없음, barcodeMatch도 없음) → 클릭 편집
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
                                    {cell == null ? <span className="text-gray-300">—</span> : String(cell)}
                                  </span>
                                  <Pencil size={8} className="text-indigo-200 opacity-0 group-hover:opacity-100 transition shrink-0" />
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

                          return (
                            <td key={ci}
                              className={`px-3 py-2 ${
                                isAmt ? "text-right font-bold text-amber-800 whitespace-nowrap" :
                                isNum ? "text-right text-gray-700 whitespace-nowrap" :
                                h === "품명" ? "font-semibold text-gray-900 break-words whitespace-normal max-w-[200px]" :
                                              "text-gray-600 whitespace-nowrap"
                              }`}>
                              {cell == null ? <span className="text-gray-300">—</span> : isNum ? fmt(cell) : String(cell)}
                            </td>
                          );
                        })}
                      </tr>
                      {isLastInPage && uniquePageNums.length > 1 && amtIdx >= 0 && (() => {
                        const pageSupplier = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
                        const configuredLabel = pageSupplier ? balanceConfig[pageSupplier] : undefined;
                        const balanceCands = pageBalanceCandidates.get(pn) ?? [];
                        const balanceAmount = configuredLabel
                          ? (balanceCands.find(c => c.label === configuredLabel)?.amount
                             ?? (configuredLabel && ["합계", "합계액", "총합계"].includes(configuredLabel) ? (structuredPages.find(p => p.page === pn)?.meta.total ?? null) : null))
                          : null;
                        const totalColSpan = dispHeaders.length;
                        return (
                          <>
                            <tr className="bg-amber-100/70 border-t-2 border-amber-300">
                              <td colSpan={Math.max(1, amtIdx)} className="px-3 py-1.5 text-right text-[11px] font-bold text-amber-800">
                                {pageSupplier && <span className="text-amber-600 mr-1.5">{pageSupplier}</span>}{pn}번 명세서 소계
                              </td>
                              <td className="px-3 py-1.5 text-right font-black text-amber-700 text-xs whitespace-nowrap">
                                {fmt(getPageDisplayTotal(pn))}원
                              </td>
                              {dispHeaders.slice(amtIdx + 1).map((_, i) => <td key={i} />)}
                            </tr>
                            {balanceAmount != null && (
                              <tr className="bg-orange-50 border-b border-orange-100">
                                <td colSpan={totalColSpan} className="px-3 py-1 text-right text-[11px] font-bold text-orange-600 whitespace-nowrap">
                                  잔고: {fmt(balanceAmount)}원
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })()}
                    </React.Fragment>
                  );
                })}
              </tbody>
              {total > 0 && (
                <tfoot>
                  {supplierTotals.length >= 1 && supplierTotals.map(({ supplier, total: sTotal, count }) => (
                    <tr key={supplier} className="border-t border-amber-100 bg-amber-50/40">
                      <td colSpan={Math.max(1, amtIdx)} className="px-3 py-2 text-right text-[11px] font-semibold text-gray-500">
                        {supplier} <span className="text-gray-400">({count}매)</span>
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-amber-600 text-xs whitespace-nowrap">{fmt(sTotal)}원</td>
                      {dispHeaders.slice(amtIdx + 1).map((_, i) => <td key={i} />)}
                    </tr>
                  ))}
                  <tr className="bg-amber-50 border-t-2 border-amber-300">
                    <td colSpan={Math.max(1, amtIdx)} className="px-3 py-2.5 text-right font-black text-gray-700 text-xs">합 계</td>
                    <td className="px-3 py-2.5 text-right font-black text-amber-700 text-sm whitespace-nowrap">{fmt(total)}원</td>
                    {dispHeaders.slice(amtIdx + 1).map((_, i) => <td key={i} />)}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── 상품명 보정 ── */}
      {structuredPages.length > 0 && nameIdx >= 0 && (
        <>
          {!matchItems && (
            <button onClick={handleMatch} disabled={matching}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer">
              {matching
                ? <><Loader2 size={13} className="animate-spin" />상품명 매칭 중...</>
                : <><Wand2 size={13} />상품명 자동보정{autoSynonymCount > 0 ? ` (동의어 ${autoSynonymCount}건 포함)` : ""}</>}
            </button>
          )}

          {matchItems && (
            <div className="w-full bg-white border border-indigo-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 border-b border-indigo-100 bg-indigo-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
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
                  <button onClick={handleMatch} disabled={matching}
                    className="text-[11px] text-indigo-500 hover:text-indigo-700 font-bold cursor-pointer">재실행</button>
                  <button onClick={() => setConfirmed(true)}
                    className="text-[11px] font-bold text-white bg-indigo-500 hover:bg-indigo-600 px-3 py-1 rounded-lg transition cursor-pointer shrink-0">확정</button>
                </div>
              </div>

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
                                    <span className="flex-1 font-semibold text-gray-800 truncate">{p.product_name}</span>
                                    {p.spec && <span className="text-gray-400 truncate max-w-[60px] shrink-0">{p.spec}</span>}
                                    {p.supplier && <span className="text-sky-500 shrink-0 truncate max-w-[60px]">{p.supplier}</span>}
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
                                    <span className="flex-1 font-semibold text-gray-800 truncate">{p.product_name}</span>
                                    {p.spec && <span className="text-gray-400 truncate max-w-[60px] shrink-0">{p.spec}</span>}
                                    {p.supplier && <span className="text-sky-500 shrink-0 truncate max-w-[60px]">{p.supplier}</span>}
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
                                  <span className="flex-1 font-semibold text-gray-800 text-[11px] truncate group-hover:text-indigo-700">{cand.name}</span>
                                  {cand.spec && <span className="text-gray-400 text-[10px] truncate max-w-[60px]">{cand.spec}</span>}
                                  {cand.supplier && <span className="text-sky-500 text-[10px] truncate max-w-[60px] shrink-0">{cand.supplier}</span>}
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
              <div className="px-4 py-2.5 border-b border-emerald-100 bg-emerald-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle size={13} className="text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-800">거래명세서 확정표</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded font-bold">
                    {confRows.length}건 · {fmt(confTotal)}원
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input ref={xlsInputRef} type="file" accept=".xlsx,.xls" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { handleTemplateUpload(f); setXlsTemplateSaved(false); e.target.value = ""; } }} />
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
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-emerald-50/60 border-b-2 border-emerald-200">
                      {CONF_HEADERS.map((h, ci) => {
                        const collapsed = collapsedConfCols.has(h);
                        return (
                          <th key={ci}
                            onClick={() => setCollapsedConfCols(prev => { const s = new Set(prev); s.has(h) ? s.delete(h) : s.add(h); return s; })}
                            title={collapsed ? `${h} (클릭해서 펼치기)` : "클릭해서 접기"}
                            className={`py-2.5 font-bold whitespace-nowrap text-[11px] cursor-pointer select-none transition-colors hover:bg-emerald-100/60 ${
                              collapsed ? "px-1 text-center text-emerald-300 w-4 max-w-[16px]" :
                              CONF_NUM.has(h) ? "px-3 text-right text-emerald-900" : "px-3 text-left text-emerald-900"
                            }`}>
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
                        const isLastInPage = ri === confRows.length - 1 || pageNums[ri] !== pageNums[ri + 1];
                        const pn = pageNums[ri];
                        return (
                          <React.Fragment key={ri}>
                            <tr
                              onClick={pageImages?.length ? () => openModal(ri) : undefined}
                              className={`border-t border-gray-100 transition-colors ${
                                pageImages?.length ? "cursor-pointer hover:bg-indigo-100/60" : "hover:bg-indigo-50/40"
                              } ${ri % 2 !== 0 ? "bg-gray-50/30" : ""}`}
                            >
                              {CONF_HEADERS.map((h, ci) => {
                                if (collapsedConfCols.has(h)) return <td key={ci} className="px-0 py-2 w-1 max-w-[4px] bg-emerald-50/30" />;
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
                                    className={`px-3 py-2 ${isSpec || isName ? "whitespace-normal max-w-[200px]" : "whitespace-nowrap"} ${
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
                            {isLastInPage && uniquePageNums.length > 1 && confAmtIdx >= 0 && (() => {
                              const pageSupplier = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
                              const pageBalance  = pageSupplierBalances[pn];
                              const configuredLabel = pageSupplier ? balanceConfig[pageSupplier] : undefined;
                              const balanceCands = pageBalanceCandidates.get(pn) ?? [];
                              const confBalanceAmount = configuredLabel
                                ? (balanceCands.find(c => c.label === configuredLabel)?.amount
                                   ?? (configuredLabel && ["합계", "합계액", "총합계"].includes(configuredLabel) ? (structuredPages.find(p => p.page === pn)?.meta.total ?? null) : null))
                                : null;
                              return (
                                <>
                                  <tr className="bg-emerald-100/60 border-t-2 border-emerald-300">
                                    {CONF_HEADERS.slice(0, confAmtIdx).map((h, i) => {
                                      if (collapsedConfCols.has(h)) return <td key={i} className="px-0 py-1.5 w-1 max-w-[4px] bg-emerald-50/30" />;
                                      if (h === "공급처") return (
                                        <td key={i} className="px-3 py-1.5 text-left text-[11px] font-bold text-emerald-500 whitespace-nowrap">
                                          {pageSupplier}
                                        </td>
                                      );
                                      const isLastVisible = !CONF_HEADERS.slice(i + 1, confAmtIdx).some(hh => !collapsedConfCols.has(hh));
                                      return isLastVisible
                                        ? <td key={i} className="px-3 py-1.5 text-right text-[11px] font-bold text-emerald-700">
                                            {pn}번 소계
                                          </td>
                                        : <td key={i} />;
                                    })}
                                    {!collapsedConfCols.has("매입총계") && (
                                      <td className="px-3 py-1.5 text-right font-black text-emerald-600 text-xs whitespace-nowrap">
                                        {fmt(confPageTotals.get(pn) ?? 0)}원
                                      </td>
                                    )}
                                    {CONF_HEADERS.slice(confAmtIdx + 1).map((h, i) =>
                                      collapsedConfCols.has(h)
                                        ? <td key={i} className="px-0 py-1.5 w-1 max-w-[4px] bg-emerald-50/30" />
                                        : h === "공급사잔고" && pageBalance != null
                                          ? <td key={i} className="px-3 py-1.5 text-right font-black text-indigo-600 text-xs whitespace-nowrap">
                                              {fmt(pageBalance)}원
                                            </td>
                                          : <td key={i} />
                                    )}
                                  </tr>
                                  {confBalanceAmount != null && (
                                    <tr className="bg-orange-50 border-b border-orange-100">
                                      <td colSpan={CONF_HEADERS.length} className="px-3 py-1 text-right text-[11px] font-bold text-orange-600 whitespace-nowrap">
                                        잔고: {fmt(confBalanceAmount)}원
                                      </td>
                                    </tr>
                                  )}
                                </>
                              );
                            })()}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    {confTotal > 0 && (
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
                              <td colSpan={confAmtIdx} className="px-3 py-2 text-right text-[11px] font-semibold text-gray-500">
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
                              <td className="px-3 py-2 text-right font-bold text-emerald-600 text-xs whitespace-nowrap">{fmt(sTotal)}원</td>
                              <td colSpan={CONF_HEADERS.length - confAmtIdx - 1} />
                            </tr>
                          );
                        })}
                        <tr className="bg-emerald-50 border-t-2 border-emerald-300">
                          <td colSpan={confAmtIdx} className="px-3 py-2.5 text-right font-black text-gray-700 text-xs">합 계</td>
                          <td className="px-3 py-2.5 text-right font-black text-emerald-700 text-sm whitespace-nowrap">{fmt(confTotal)}원</td>
                          <td colSpan={CONF_HEADERS.length - confAmtIdx - 1} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
            </div>
          )}
        </>
      )}

      {/* ── 표 감지 실패 원문 ── */}
      {fallbackPages.map(p => (
        <div key={p.page} className="w-full bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
            <span className="text-[11px] font-bold text-gray-400">페이지 {p.page} — 표 감지 실패 (원문)</span>
          </div>
          <pre className="px-4 py-3 text-[11px] text-gray-600 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
            {p.rawText ?? p.rows.filter(r => Array.isArray(r)).map(r => r[0]).join("\n")}
          </pre>
        </div>
      ))}
    </div>
    </>
  );
};
