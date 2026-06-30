import React, { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Wand2, Loader2, CheckCircle, AlertTriangle, XCircle, X, Bookmark, BookmarkCheck, Search, Pencil, FileSpreadsheet, Upload as UploadIcon } from "lucide-react";

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

interface RawOcrTableProps {
  pages: RawPage[];
  pageImages?: string[]; // dataURL per page (index = page-1)
  rotation?: number;     // CSS rotation applied in PageImageViewer (degrees)
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

export const RawOcrTable: React.FC<RawOcrTableProps> = ({ pages, pageImages, rotation = -90 }) => {
  const structuredPages = pages.filter(p => !isFallback(p.headers) && p.rows.length > 0);
  const fallbackPages   = pages.filter(p => isFallback(p.headers) || p.rows.length === 0);

  const masterH     = buildMasterHeaders(structuredPages);
  const supplierIdx = masterH.indexOf("공급처");

  const allRows: { row: (string | number | null)[]; pageNum: number }[] = structuredPages.flatMap(p => {
    const supplier = p.meta.supplier ?? null;
    return p.rows.map(row => {
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

  // 공급처 편집 상태 — supplierTotals 계산보다 먼저 선언해야 참조 가능
  const [rawSupplierByPage, setRawSupplierByPage] = useState<Record<number, string>>({});
  const [editingRawSuppRow, setEditingRawSuppRow] = useState<number | null>(null);
  const [editingRawSuppVal, setEditingRawSuppVal] = useState("");
  const [supplierConfirm,   setSupplierConfirm  ] = useState<{ pageNum: number; newVal: string; rowCount: number } | null>(null);

  const total = amtIdx >= 0
    ? dispRows.reduce((s, r) => s + parseNumber(r[amtIdx]), 0)
    : 0;

  const meta = pages.map(p => p.meta).find(m => m.date || m.supplier) ?? {};

  // ── 이미지(페이지)별 합계 ─────────────────────────────────────────────────
  const pageTotals = new Map<number, number>();
  if (amtIdx >= 0) {
    dispRows.forEach((row, ri) => {
      const pn = pageNums[ri];
      pageTotals.set(pn, (pageTotals.get(pn) ?? 0) + parseNumber(row[amtIdx]));
    });
  }
  const uniquePageNums = [...new Set(pageNums)].sort((a, b) => a - b);

  // ── 공급처별 합계 ─────────────────────────────────────────────────────────
  const dispSupplierIdx = dispHeaders.indexOf("공급처");
  const supplierTotals: { supplier: string; total: number; count: number }[] = amtIdx >= 0
    ? (() => {
        const map = new Map<string, { total: number; count: number }>();
        dispRows.forEach((row, ri) => {
          const pn = pageNums[ri];
          const supp = (
            rawSupplierByPage[pn] !== undefined
              ? rawSupplierByPage[pn]
              : String(
                  dispSupplierIdx >= 0 && row[dispSupplierIdx] != null
                    ? row[dispSupplierIdx]
                    : (structuredPages[pn - 1]?.meta.supplier ?? meta.supplier ?? "미상")
                )
          ).trim() || "미상";
          const amt = parseNumber(row[amtIdx]);
          const prev = map.get(supp) ?? { total: 0, count: 0 };
          map.set(supp, { total: prev.total + amt, count: prev.count + 1 });
        });
        return [...map.entries()].map(([supplier, v]) => ({ supplier, ...v }));
      })()
    : [];

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
  const [savedSynonyms,    setSavedSynonyms   ] = useState<Set<number>>(new Set());
  const [retryingRows,     setRetryingRows    ] = useState<Set<number>>(new Set());
  const [candidatesMap,    setCandidatesMap   ] = useState<Record<number, CandidateInfo[]>>({});
  const [openCandRow,      setOpenCandRow     ] = useState<number | null>(null);
  const [selectedCands,    setSelectedCands   ] = useState<Record<number, CandidateInfo>>({});

  const saveSynonym = useCallback(async (ri: number, alias: string, productCode: string, supplier?: string) => {
    try {
      await fetch("/api/ocr-synonyms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias, product_code: productCode, supply: supplier?.trim() || null }),
      });
      setSavedSynonyms(prev => new Set([...prev, ri]));
    } catch { /* silent */ }
  }, []);

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

  const selectCandidate = useCallback((ri: number, cand: CandidateInfo) => {
    setSelectedCands(prev => ({ ...prev, [ri]: cand }));
    setOverrides(prev => ({ ...prev, [ri]: cand.name }));
    setOpenCandRow(null);
  }, []);

  // 유사상품 후보 선택: 동의어 자동 저장 + 선택 적용
  const handleSelectCandidate = useCallback((ri: number, cand: CandidateInfo, inputName: string, supplier: string) => {
    selectCandidate(ri, cand);
    saveSynonym(ri, inputName, cand.code, supplier || undefined);
  }, [selectCandidate, saveSynonym]);

  const handleMatch = useCallback(async () => {
    if (nameIdx < 0) return;
    const names = dispRows.map(r => String(r[nameIdx] ?? ""));
    setMatching(true); setMatchItems(null); setOverrides({}); setSupplierOverrides({}); setConfirmed(false); setSavedSynonyms(new Set());
    setRetryingRows(new Set()); setCandidatesMap({}); setOpenCandRow(null); setSelectedCands({});
    try {
      const res  = await fetch("/api/ocr-match", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ names }) });
      const data = await res.json();
      setMatchItems(data.matches ?? []);
    } finally { setMatching(false); }
  }, [dispRows, nameIdx]);

  // ── 확정 표 ──────────────────────────────────────────────────────────────
  const CONF_HEADERS = [
    "거래일","상품코드","상품명","규격",
    "마스터 매입단가","전표 매입단가","공급처","매입수량","매입총계",
    "판매단가","이익률","유통기한",
  ];
  const CONF_NUM = new Set(["마스터 매입단가","전표 매입단가","매입수량","매입총계","판매단가","이익률"]);

  // 템플릿 → 내부 키 매핑
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

  // 엑셀 서식 파일 상태
  const [xlsTemplate,    setXlsTemplate   ] = useState<ArrayBuffer | null>(null);
  const [xlsTemplateName,setXlsTemplateName] = useState<string | null>(null);
  const [xlsTemplateHdrs,setXlsTemplateHdrs] = useState<string[] | null>(null);
  const xlsInputRef = useRef<HTMLInputElement | null>(null);

  const ocrQtyIdx  = dispHeaders.indexOf("수량");
  const ocrPriIdx  = dispHeaders.indexOf("단가");
  const ocrSpecIdx = dispHeaders.indexOf("규격");
  const ocrSuppIdx = dispHeaders.indexOf("공급처");
  const globalSupplier = pages.map(p => p.meta.supplier).find(Boolean) ?? null;

  const confRows: (string | number | null)[][] = matchItems
    ? dispRows.map((row, ri) => {
        const m        = selectedCands[ri] ?? matchItems[ri]?.matched ?? null;
        const corrName = overrides[ri] ?? m?.name ?? null;
        const qty  = ocrQtyIdx  >= 0 ? row[ocrQtyIdx]  : null;
        const amt  = amtIdx >= 0 && row[amtIdx] != null ? parseNumber(row[amtIdx]) : null;
        const pri  = ocrPriIdx  >= 0 ? row[ocrPriIdx]  : null;
        const spec = ocrSpecIdx >= 0 ? (row[ocrSpecIdx] ?? m?.spec ?? null) : (m?.spec ?? null);
        const pn = pageNums[ri];
        const rawSupp = rawSupplierByPage[pn] !== undefined
          ? rawSupplierByPage[pn]
          : (ocrSuppIdx >= 0 ? (row[ocrSuppIdx] ?? globalSupplier) : (structuredPages.find(p => p.page === pn)?.meta.supplier ?? globalSupplier));
        const supp    = supplierOverrides[ri] !== undefined ? supplierOverrides[ri] : rawSupp;
        const dateVal = structuredPages.find(p => p.page === pn)?.meta.date ?? null;
        return [dateVal, m?.code ?? null, corrName, spec, m?.masterPrice ?? null, pri, supp, qty, amt,
                m?.salePrice ?? null, m?.profitRate != null ? m.profitRate : null, m?.expiryDate ?? null];
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
      // ── 서식 파일 기반 내보내기 ──────────────────────────────────────────
      const wb = XLSX.read(xlsTemplate, { type: "array" });
      const wsName = wb.SheetNames[0];
      const ws = wb.Sheets[wsName];
      const templateRange = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
      const dataStartRow = templateRange.s.r + 1;

      // 템플릿 헤더 → 내부 키 매핑
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
      // ── 기본 엑셀 내보내기 ───────────────────────────────────────────────
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

  return (
    <>
    {/* ── 이미지 모달 (줌·드래그) ── */}
    {modalImg && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
        onClick={closeModal}>
        <div className="relative w-full bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          style={{ maxWidth: "min(900px, 95vw)", height: "90vh" }}
          onClick={e => e.stopPropagation()}>

          {/* 헤더 */}
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

          {/* 뷰포트 — flex-1 + min-h-0 로 남은 공간 전부 차지 */}
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
          <div className="flex gap-2">
            <button
              onClick={() => setSupplierConfirm(null)}
              className="flex-1 py-2 text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-xl transition cursor-pointer"
            >
              취소
            </button>
            <button
              onClick={() => {
                setRawSupplierByPage(prev => ({ ...prev, [supplierConfirm.pageNum]: supplierConfirm.newVal }));
                setSupplierConfirm(null);
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

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-amber-50 border-b-2 border-amber-200">
                  {dispHeaders.map((h, ci) => (
                    <th key={ci} className={`px-3 py-2.5 font-bold text-amber-900 whitespace-nowrap text-[11px] ${NUM_COLS.has(h) ? "text-right" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dispRows.map((row, ri) => {
                  const isLastInPage = ri === dispRows.length - 1 || pageNums[ri] !== pageNums[ri + 1];
                  const pn = pageNums[ri];
                  return (
                    <React.Fragment key={ri}>
                      <tr
                        onClick={pageImages?.length ? () => openModal(ri) : undefined}
                        className={`border-t border-gray-100 transition-colors ${
                          pageImages?.length ? "cursor-pointer hover:bg-amber-100/70" : "hover:bg-amber-50/50"
                        } ${ri % 2 !== 0 ? "bg-gray-50/40" : ""}`}
                      >
                        {dispHeaders.map((h, ci) => {
                          const isSupplier = h === "공급처";
                          const rawCell = row[ci];
                          const cell = isSupplier && rawSupplierByPage[pn] !== undefined
                            ? rawSupplierByPage[pn]
                            : rawCell;
                          const isEditingThis = isSupplier && editingRawSuppRow === ri;
                          const isNum = typeof cell === "number";
                          const isAmt = h === "금액";

                          if (isEditingThis) {
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
                                      setSupplierConfirm({ pageNum: pn, newVal: trimmed, rowCount });
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

                          return (
                            <td key={ci}
                              className={`px-3 py-2 whitespace-nowrap ${
                                isAmt ? "text-right font-bold text-amber-800" :
                                isNum ? "text-right text-gray-700" :
                                h === "품명" ? "font-semibold text-gray-900" :
                                              "text-gray-600"
                              }`}>
                              {cell == null ? <span className="text-gray-300">—</span> : isNum ? fmt(cell) : String(cell)}
                            </td>
                          );
                        })}
                      </tr>
                      {isLastInPage && uniquePageNums.length > 1 && amtIdx >= 0 && (() => {
                        const pageSupplier = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
                        return (
                          <tr className="bg-amber-100/70 border-t-2 border-amber-300">
                            <td colSpan={Math.max(1, amtIdx)} className="px-3 py-1.5 text-right text-[11px] font-bold text-amber-800">
                              {pageSupplier && <span className="text-amber-600 mr-1.5">{pageSupplier}</span>}{pn}번 명세서 소계
                            </td>
                            <td className="px-3 py-1.5 text-right font-black text-amber-700 text-xs whitespace-nowrap">
                              {fmt(pageTotals.get(pn) ?? 0)}원
                            </td>
                            {dispHeaders.slice(amtIdx + 1).map((_, i) => <td key={i} />)}
                          </tr>
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
                        {supplier} <span className="text-gray-400">({count}건)</span>
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
                : <><Wand2 size={13} />상품명 자동보정</>}
            </button>
          )}

          {matchItems && (
            <div className="w-full bg-white border border-indigo-200 rounded-2xl overflow-hidden shadow-sm">
              {/* ── 섹션 헤더: 보정 결과 ── */}
              <div className="px-4 py-2.5 border-b border-indigo-100 bg-indigo-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wand2 size={13} className="text-indigo-600" />
                  <span className="text-xs font-bold text-indigo-800">상품명 보정 결과</span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-500 px-1.5 py-0.5 rounded font-bold">
                    매칭 {matchItems.filter(m => m.matched).length}/{matchItems.length}건
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleMatch} disabled={matching}
                    className="text-[11px] text-indigo-500 hover:text-indigo-700 font-bold cursor-pointer">재실행</button>
                  <button onClick={() => setConfirmed(true)}
                    className="text-[11px] font-bold text-white bg-indigo-500 hover:bg-indigo-600 px-3 py-1 rounded-lg transition cursor-pointer shrink-0">확정</button>
                </div>
              </div>

              {/* 보정 미리보기 */}
              <div className="px-4 py-2 border-b border-indigo-50 flex flex-col gap-0.5">
                {matchItems.map((item, ri) => {
                  const effMatch = selectedCands[ri] ?? item.matched ?? null;
                  const score    = effMatch?.score ?? item.score ?? 0;
                  const pn = pageNums[ri];
                  const rawSupp  = rawSupplierByPage[pn] !== undefined
                    ? rawSupplierByPage[pn]
                    : (ocrSuppIdx >= 0 ? (String(dispRows[ri]?.[ocrSuppIdx] ?? "").trim() || null) : null);
                  const pageSupp   = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? globalSupplier ?? "";
                  const currentSupp = supplierOverrides[ri] !== undefined ? supplierOverrides[ri] : (rawSupp ?? pageSupp);
                  const needsRetry  = score < 70;
                  const isCandOpen  = openCandRow === ri;
                  const isCandSelected = !!selectedCands[ri];
                  return (
                    <div key={ri} className={`flex flex-col gap-0.5 py-1 border-b last:border-0 ${isCandSelected ? "bg-emerald-50 border-emerald-100" : "border-gray-50"}`}>
                      {/* 메인 행 */}
                      <div className="flex items-start gap-2 text-[11px]">
                        <ScoreIcon score={effMatch ? score : 0} />
                        <span
                          onClick={pageImages?.length ? () => openModal(ri) : undefined}
                          className={`text-gray-400 min-w-0 truncate max-w-[160px] ${pageImages?.length ? "cursor-pointer hover:text-amber-600 hover:underline" : ""}`}
                          title={pageImages?.length ? `클릭하면 이미지 보기 — ${item.input}` : item.input}
                        >{item.input}</span>
                        <span className="text-gray-300 shrink-0">→</span>
                        {effMatch ? (
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <input
                              className="flex-1 font-semibold text-gray-800 bg-transparent border-b border-transparent hover:border-indigo-200 focus:border-indigo-400 outline-none truncate min-w-0"
                              value={overrides[ri] ?? effMatch.name}
                              onChange={e => setOverrides(prev => ({ ...prev, [ri]: e.target.value }))} />
                            <span className={`shrink-0 font-bold ${scoreColor(score)}`}>{score}%</span>
                            {effMatch.code && <span className="text-gray-300 shrink-0 text-[10px]">{effMatch.code}</span>}
                            {score < 100 && (
                              <button
                                title={savedSynonyms.has(ri) ? "동의어 저장됨" : `"${item.input}" → 동의어로 저장`}
                                onClick={() => saveSynonym(ri, item.input, effMatch.code, currentSupp || undefined)}
                                disabled={savedSynonyms.has(ri)}
                                className={`shrink-0 transition-colors ${savedSynonyms.has(ri) ? "text-emerald-500" : "text-gray-300 hover:text-indigo-500"}`}
                              >
                                {savedSynonyms.has(ri) ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
                              </button>
                            )}
                          </div>
                        ) : (
                          <input
                            className="flex-1 font-semibold text-rose-500 bg-transparent border-b border-rose-200 hover:border-rose-300 focus:border-rose-400 outline-none truncate min-w-0 placeholder-rose-300 italic"
                            value={overrides[ri] ?? ""} placeholder="직접 입력..."
                            onChange={e => setOverrides(prev => ({ ...prev, [ri]: e.target.value }))} />
                        )}
                      </div>
                      {/* 공급사 편집 */}
                      <div className="flex items-center gap-1.5 text-[10px] pl-5">
                        <span className="text-gray-300 shrink-0">공급사</span>
                        <input
                          className="flex-1 text-sky-700 font-semibold bg-transparent border-b border-transparent hover:border-sky-200 focus:border-sky-400 outline-none truncate min-w-0"
                          value={currentSupp}
                          onChange={e => setSupplierOverrides(prev => ({ ...prev, [ri]: e.target.value }))}
                          placeholder="공급사명 입력..."
                        />
                      </div>
                      {/* 유사 상품 찾기 버튼 + 후보 목록 (70% 미만 시 자동 표시, 모두 수동 가능) */}
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

          {/* ── 확정 결과표 섹션 (별도 카드) ── */}
          {matchItems && confirmed && (
            <div className="w-full bg-white border border-emerald-200 rounded-2xl overflow-hidden shadow-sm">
              {/* 확정 섹션 헤더 */}
              <div className="px-4 py-2.5 border-b border-emerald-100 bg-emerald-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle size={13} className="text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-800">거래명세서 확정표</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded font-bold">
                    {confRows.length}건 · {fmt(confTotal)}원
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* 서식 파일 업로드 */}
                  <input ref={xlsInputRef} type="file" accept=".xlsx,.xls" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { handleTemplateUpload(f); e.target.value = ""; } }} />
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
                      {CONF_HEADERS.map((h, ci) => (
                        <th key={ci} className={`px-3 py-2.5 font-bold whitespace-nowrap text-[11px] ${CONF_NUM.has(h) ? "text-right text-emerald-900" : "text-left text-emerald-900"}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                    <tbody>
                      {confRows.map((row, ri) => {
                        const m        = selectedCands[ri] ?? matchItems![ri]?.matched ?? null;
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
                                const cell          = row[ci];
                                const isNum         = typeof cell === "number";
                                const isName        = h === "상품명";
                                const isMasterPrice = h === "마스터 매입단가";
                                const isInvoiceP    = h === "전표 매입단가";
                                const isProfitRate  = h === "이익률";
                                return (
                                  <td key={ci}
                                    className={`px-3 py-2 whitespace-nowrap ${
                                      h === "매입총계"                       ? "text-right font-bold text-emerald-700" :
                                      isMasterPrice                          ? `text-right font-bold ${priceDiff ? "text-blue-600" : "text-blue-400"}` :
                                      isInvoiceP && priceDiff === "high"     ? "text-right font-bold text-rose-600" :
                                      isInvoiceP && priceDiff === "low"      ? "text-right font-bold text-emerald-600" :
                                      isInvoiceP                             ? "text-right text-gray-700" :
                                      isProfitRate                           ? "text-right text-emerald-700 font-semibold" :
                                      isNum                                  ? "text-right text-gray-700" :
                                      h === "상품코드"                       ? "text-gray-400 text-[10px] font-mono" :
                                      h === "유통기한"                       ? "text-gray-500 text-[10px]" :
                                      h === "거래일"                         ? "text-gray-500 text-[10px]" :
                                      isName ? `font-semibold ${m ? (score >= 80 ? "text-emerald-700" : score >= 50 ? "text-amber-700" : "text-rose-600") : "text-rose-500 italic"}` :
                                               "text-gray-600"
                                    }`}>
                                    {cell == null
                                      ? <span className="text-gray-300">—</span>
                                      : isProfitRate && isNum ? `${cell}%`
                                      : isNum ? fmt(cell) : String(cell)}
                                  </td>
                                );
                              })}
                            </tr>
                            {isLastInPage && uniquePageNums.length > 1 && confAmtIdx >= 0 && (() => {
                              const pageSupplier = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
                              return (
                                <tr className="bg-emerald-100/60 border-t-2 border-emerald-300">
                                  <td colSpan={Math.max(1, confAmtIdx)} className="px-3 py-1.5 text-right text-[11px] font-bold text-emerald-700">
                                    {pageSupplier && <span className="text-emerald-500 mr-1.5">{pageSupplier}</span>}{pn}번 명세서 소계
                                  </td>
                                  <td className="px-3 py-1.5 text-right font-black text-emerald-600 text-xs whitespace-nowrap">
                                    {fmt(confPageTotals.get(pn) ?? 0)}원
                                  </td>
                                  {CONF_HEADERS.slice(confAmtIdx + 1).map((_, i) => <td key={i} />)}
                                </tr>
                              );
                            })()}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    {confTotal > 0 && (
                      <tfoot>
                        {confSupplierTotals.length >= 1 && confSupplierTotals.map(({ supplier, total: sTotal, count }) => (
                          <tr key={supplier} className="border-t border-emerald-100 bg-emerald-50/40">
                            <td colSpan={Math.max(1, confAmtIdx)} className="px-3 py-2 text-right text-[11px] font-semibold text-gray-500">
                              {supplier} <span className="text-gray-400">({count}건)</span>
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-emerald-600 text-xs whitespace-nowrap">{fmt(sTotal)}원</td>
                            {CONF_HEADERS.slice(confAmtIdx + 1).map((_, i) => <td key={i} />)}
                          </tr>
                        ))}
                        <tr className="bg-emerald-50 border-t-2 border-emerald-300">
                          <td colSpan={Math.max(1, confAmtIdx)} className="px-3 py-2.5 text-right font-black text-gray-700 text-xs">합 계</td>
                          <td className="px-3 py-2.5 text-right font-black text-emerald-700 text-sm whitespace-nowrap">{fmt(confTotal)}원</td>
                          {CONF_HEADERS.slice(confAmtIdx + 1).map((_, i) => <td key={i} />)}
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
            {p.rawText ?? p.rows.map(r => r[0]).join("\n")}
          </pre>
        </div>
      ))}
    </div>
    </>
  );
};
