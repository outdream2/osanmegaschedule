import React, { useCallback, useEffect, useRef, useState } from "react";
import { Download, Wand2, Loader2, CheckCircle, AlertTriangle, XCircle, X, Bookmark, BookmarkCheck } from "lucide-react";

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
  } | null;
  score?: number;
}

interface RawOcrTableProps {
  pages: RawPage[];
  pageImages?: string[]; // dataURL per page (index = page-1)
  rotation?: number;     // CSS rotation applied in PageImageViewer (degrees)
}

const SCHEMA_ORDER = ["공급처","일자","품명","규격","단위","수량","단가","금액","세액","비고"];
const HIDDEN_COLS  = new Set(["번호", "배치번호", "에누리"]);
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

  const total = amtIdx >= 0
    ? dispRows.reduce((s, r) => s + parseNumber(r[amtIdx]), 0)
    : 0;

  const meta = pages.map(p => p.meta).find(m => m.date || m.supplier) ?? {};

  // ── 공급처별 합계 ─────────────────────────────────────────────────────────
  const dispSupplierIdx = dispHeaders.indexOf("공급처");
  const supplierTotals: { supplier: string; total: number; count: number }[] = amtIdx >= 0
    ? (() => {
        const map = new Map<string, { total: number; count: number }>();
        dispRows.forEach((row, ri) => {
          const supp = String(
            dispSupplierIdx >= 0 && row[dispSupplierIdx] != null
              ? row[dispSupplierIdx]
              : (structuredPages[pageNums[ri] - 1]?.meta.supplier ?? meta.supplier ?? "미상")
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
  const [matching,      setMatching     ] = useState(false);
  const [matchItems,    setMatchItems   ] = useState<MatchedItem[] | null>(null);
  const [overrides,     setOverrides    ] = useState<Record<number, string>>({});
  const [confirmed,     setConfirmed    ] = useState(false);
  const [savedSynonyms, setSavedSynonyms] = useState<Set<number>>(new Set());

  const saveSynonym = useCallback(async (ri: number, alias: string, productCode: string) => {
    try {
      await fetch("/api/ocr-synonyms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias, product_code: productCode }),
      });
      setSavedSynonyms(prev => new Set([...prev, ri]));
    } catch { /* silent */ }
  }, []);

  const handleMatch = useCallback(async () => {
    if (nameIdx < 0) return;
    const names = dispRows.map(r => String(r[nameIdx] ?? ""));
    setMatching(true); setMatchItems(null); setOverrides({}); setConfirmed(false); setSavedSynonyms(new Set());
    try {
      const res  = await fetch("/api/ocr-match", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ names }) });
      const data = await res.json();
      setMatchItems(data.matches ?? []);
    } finally { setMatching(false); }
  }, [dispRows, nameIdx]);

  // ── 확정 표 ──────────────────────────────────────────────────────────────
  const CONF_HEADERS = [
    "상품코드","상품명","규격",
    "마스터 매입단가","전표 매입단가","공급처","매입수량","매입총계",
    "판매단가","이익률","소비기한",
  ];
  const CONF_NUM = new Set(["마스터 매입단가","전표 매입단가","매입수량","매입총계","판매단가","이익률"]);

  const ocrQtyIdx  = dispHeaders.indexOf("수량");
  const ocrPriIdx  = dispHeaders.indexOf("단가");
  const ocrSpecIdx = dispHeaders.indexOf("규격");
  const ocrSuppIdx = dispHeaders.indexOf("공급처");
  const globalSupplier = pages.map(p => p.meta.supplier).find(Boolean) ?? null;

  const confRows: (string | number | null)[][] = matchItems
    ? dispRows.map((row, ri) => {
        const m        = matchItems[ri]?.matched ?? null;
        const corrName = overrides[ri] ?? m?.name ?? null;
        const qty  = ocrQtyIdx  >= 0 ? row[ocrQtyIdx]  : null;
        const amt  = amtIdx >= 0 && row[amtIdx] != null ? parseNumber(row[amtIdx]) : null;
        const pri  = ocrPriIdx  >= 0 ? row[ocrPriIdx]  : null;
        const spec = ocrSpecIdx >= 0 ? (row[ocrSpecIdx] ?? m?.spec ?? null) : (m?.spec ?? null);
        const supp = ocrSuppIdx >= 0 ? (row[ocrSuppIdx] ?? globalSupplier) : globalSupplier;
        return [m?.code ?? null, corrName, spec, m?.masterPrice ?? null, pri, supp, qty, amt,
                m?.salePrice ?? null, m?.profitRate != null ? m.profitRate : null, m?.expiryDate ?? null];
      })
    : [];

  const confAmtIdx  = CONF_HEADERS.indexOf("매입총계");
  const confSuppIdx = CONF_HEADERS.indexOf("공급처");
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
                {dispRows.map((row, ri) => (
                  <tr
                    key={ri}
                    onClick={pageImages?.length ? () => openModal(ri) : undefined}
                    className={`border-t border-gray-100 transition-colors ${
                      pageImages?.length ? "cursor-pointer hover:bg-amber-100/70" : "hover:bg-amber-50/50"
                    } ${ri % 2 !== 0 ? "bg-gray-50/40" : ""}`}
                  >
                    {dispHeaders.map((h, ci) => {
                      const cell  = row[ci];
                      const isNum = typeof cell === "number";
                      const isAmt = h === "금액";
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
                ))}
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
                  {confirmed && (
                    <button onClick={() => handleExport(CONF_HEADERS, confRows, "확정")}
                      className="flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 px-2 py-1 rounded-lg transition cursor-pointer shrink-0">
                      <Download size={11} />CSV
                    </button>
                  )}
                </div>
              </div>

              {/* 보정 미리보기 */}
              <div className="px-4 py-2 border-b border-indigo-50 flex flex-col gap-1.5">
                {matchItems.map((item, ri) => {
                  const score = item.matched?.score ?? item.score ?? 0;
                  return (
                    <div key={ri} className="flex items-start gap-2 text-[11px]">
                      <ScoreIcon score={item.matched ? score : 0} />
                      <span className="text-gray-400 min-w-0 truncate max-w-[160px]" title={item.input}>{item.input}</span>
                      <span className="text-gray-300 shrink-0">→</span>
                      {item.matched ? (
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <input
                            className="flex-1 font-semibold text-gray-800 bg-transparent border-b border-transparent hover:border-indigo-200 focus:border-indigo-400 outline-none truncate min-w-0"
                            value={overrides[ri] ?? item.matched.name}
                            onChange={e => setOverrides(prev => ({ ...prev, [ri]: e.target.value }))} />
                          <span className={`shrink-0 font-bold ${scoreColor(score)}`}>{score}%</span>
                          {item.matched.code && <span className="text-gray-300 shrink-0 text-[10px]">{item.matched.code}</span>}
                          {score < 100 && (
                            <button
                              title={savedSynonyms.has(ri) ? "동의어 저장됨" : `"${item.input}" → 동의어로 저장`}
                              onClick={() => saveSynonym(ri, item.input, item.matched!.code)}
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
                  );
                })}
              </div>

              {!confirmed && (
                <div className="px-4 py-3 text-center text-[11px] text-indigo-400 font-semibold">
                  상품명을 확인·수정한 후 <span className="text-indigo-600 font-bold">확정</span> 버튼을 누르면 표가 생성됩니다.
                </div>
              )}

              {confirmed && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-indigo-50 border-b-2 border-indigo-200">
                        {CONF_HEADERS.map((h, ci) => (
                          <th key={ci} className={`px-3 py-2.5 font-bold whitespace-nowrap text-[11px] ${CONF_NUM.has(h) ? "text-right text-indigo-900" : "text-left text-indigo-900"}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {confRows.map((row, ri) => {
                        const m        = matchItems![ri]?.matched ?? null;
                        const score    = m?.score ?? 0;
                        const masterP  = m?.masterPrice ?? null;
                        const invoiceP = row[CONF_HEADERS.indexOf("전표 매입단가")];
                        const priceDiff = masterP != null && typeof invoiceP === "number" && invoiceP !== masterP
                          ? (invoiceP > masterP ? "high" : "low") : null;
                        return (
                          <tr
                            key={ri}
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
                                    h === "매입총계"                       ? "text-right font-bold text-indigo-700" :
                                    isMasterPrice                          ? `text-right font-bold ${priceDiff ? "text-blue-600" : "text-blue-400"}` :
                                    isInvoiceP && priceDiff === "high"     ? "text-right font-bold text-rose-600" :
                                    isInvoiceP && priceDiff === "low"      ? "text-right font-bold text-emerald-600" :
                                    isInvoiceP                             ? "text-right text-gray-700" :
                                    isProfitRate                           ? "text-right text-emerald-700 font-semibold" :
                                    isNum                                  ? "text-right text-gray-700" :
                                    h === "상품코드"                       ? "text-gray-400 text-[10px] font-mono" :
                                    h === "소비기한"                       ? "text-gray-500 text-[10px]" :
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
                        );
                      })}
                    </tbody>
                    {confTotal > 0 && (
                      <tfoot>
                        {confSupplierTotals.length >= 1 && confSupplierTotals.map(({ supplier, total: sTotal, count }) => (
                          <tr key={supplier} className="border-t border-indigo-100 bg-indigo-50/40">
                            <td colSpan={Math.max(1, confAmtIdx)} className="px-3 py-2 text-right text-[11px] font-semibold text-gray-500">
                              {supplier} <span className="text-gray-400">({count}건)</span>
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-indigo-600 text-xs whitespace-nowrap">{fmt(sTotal)}원</td>
                            {CONF_HEADERS.slice(confAmtIdx + 1).map((_, i) => <td key={i} />)}
                          </tr>
                        ))}
                        <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                          <td colSpan={Math.max(1, confAmtIdx)} className="px-3 py-2.5 text-right font-black text-gray-700 text-xs">합 계</td>
                          <td className="px-3 py-2.5 text-right font-black text-indigo-700 text-sm whitespace-nowrap">{fmt(confTotal)}원</td>
                          {CONF_HEADERS.slice(confAmtIdx + 1).map((_, i) => <td key={i} />)}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
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
