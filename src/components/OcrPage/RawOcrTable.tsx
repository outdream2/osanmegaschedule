import React, { useCallback, useState } from "react";
import { Download, Wand2, Loader2, CheckCircle, AlertTriangle, XCircle, X } from "lucide-react";

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
}

const SCHEMA_ORDER = ["공급처","품명","규격","단위","수량","단가","금액","세액","비고"];
const HIDDEN_COLS  = new Set(["번호"]);
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

export const RawOcrTable: React.FC<RawOcrTableProps> = ({ pages, pageImages }) => {
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
  const total   = amtIdx >= 0
    ? dispRows.reduce((s, r) => s + (typeof r[amtIdx] === "number" ? (r[amtIdx] as number) : 0), 0)
    : 0;

  const meta = pages.map(p => p.meta).find(m => m.date || m.supplier) ?? {};

  // 공급처별 합계
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
          const amt = typeof row[amtIdx] === "number" ? (row[amtIdx] as number) : 0;
          const prev = map.get(supp) ?? { total: 0, count: 0 };
          map.set(supp, { total: prev.total + amt, count: prev.count + 1 });
        });
        return [...map.entries()].map(([supplier, v]) => ({ supplier, ...v }));
      })()
    : [];

  // ── 이미지 모달 상태 ──────────────────────────────────────────────────────
  const [modalImg,   setModalImg  ] = useState<string | null>(null);
  const [modalLabel, setModalLabel] = useState("");

  const openModal = useCallback((rowIdx: number) => {
    if (!pageImages?.length) return;
    const pNum  = pageNums[rowIdx] ?? 1;
    const img   = pageImages[pNum - 1];
    const label = String(dispRows[rowIdx]?.[nameIdx] ?? "");
    if (img) { setModalImg(img); setModalLabel(label); }
  }, [pageImages, pageNums, dispRows, nameIdx]);

  // ── 상품명 보정 상태 ──────────────────────────────────────────────────────
  const [matching,   setMatching  ] = useState(false);
  const [matchItems, setMatchItems] = useState<MatchedItem[] | null>(null);
  const [overrides,  setOverrides ] = useState<Record<number, string>>({});
  const [confirmed,  setConfirmed ] = useState(false);

  const handleMatch = useCallback(async () => {
    if (nameIdx < 0) return;
    const names = dispRows.map(r => String(r[nameIdx] ?? ""));
    setMatching(true);
    setMatchItems(null);
    setOverrides({});
    setConfirmed(false);
    try {
      const res = await fetch("/api/ocr-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      const data = await res.json();
      setMatchItems(data.matches ?? []);
    } finally {
      setMatching(false);
    }
  }, [dispRows, nameIdx]);

  // 확정 표 — 고정 스키마
  const CONF_HEADERS = [
    "상품코드", "상품명", "규격",
    "마스터 매입단가", "전표 매입단가", "공급처", "매입수량", "매입총계",
    "판매단가", "이익률", "소비기한",
  ];
  const CONF_NUM = new Set(["마스터 매입단가", "전표 매입단가", "매입수량", "매입총계", "판매단가", "이익률"]);

  const ocrQtyIdx  = dispHeaders.indexOf("수량");
  const ocrAmtIdx = dispHeaders.indexOf("금액");
  const ocrPriIdx  = dispHeaders.indexOf("단가");
  const ocrSpecIdx = dispHeaders.indexOf("규격");
  const ocrSuppIdx = dispHeaders.indexOf("공급처");
  const globalSupplier = pages.map(p => p.meta.supplier).find(Boolean) ?? null;

  const confRows: (string | number | null)[][] = matchItems
    ? dispRows.map((row, ri) => {
        const m = matchItems[ri]?.matched ?? null;
        const corrName = overrides[ri] ?? m?.name ?? null;
        const qty  = ocrQtyIdx  >= 0 ? row[ocrQtyIdx]  : null;
        const amt  = ocrAmtIdx >= 0 ? row[ocrAmtIdx] : null;
        const pri  = ocrPriIdx  >= 0 ? row[ocrPriIdx]  : null;
        const spec = ocrSpecIdx >= 0 ? (row[ocrSpecIdx] ?? m?.spec ?? null) : (m?.spec ?? null);
        const supp = ocrSuppIdx >= 0 ? (row[ocrSuppIdx] ?? globalSupplier) : globalSupplier;
        return [
          m?.code        ?? null,
          corrName,
          spec,
          m?.masterPrice ?? null,
          pri,
          supp,
          qty,
          amt,
          m?.salePrice   ?? null,
          m?.profitRate  != null ? m.profitRate : null,
          m?.expiryDate  ?? null,
        ];
      })
    : [];

  const confAmtIdx = CONF_HEADERS.indexOf("매입총계");
  const confTotal  = confAmtIdx >= 0
    ? confRows.reduce((s, r) => s + (typeof r[confAmtIdx] === "number" ? (r[confAmtIdx] as number) : 0), 0)
    : 0;

  const handleExport = useCallback((headers: string[], rows: (string | number | null)[][], suffix: string) => {
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `거래명세서_${meta.date?.replace(/-/g, "") ?? "OCR"}_${suffix}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [meta]);

  if (pages.length === 0) return null;

  return (
    <>
    {/* ── 이미지 모달 ── */}
    {modalImg && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        onClick={() => setModalImg(null)}>
        <div className="relative max-w-2xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
            <span className="text-xs font-bold text-gray-700 truncate max-w-[260px]">{modalLabel}</span>
            <button onClick={() => setModalImg(null)} className="p-1 rounded-lg hover:bg-gray-200 cursor-pointer">
              <X size={16} className="text-gray-500" />
            </button>
          </div>
          <div className="overflow-auto max-h-[80vh] flex items-center justify-center py-4">
            <img
              src={modalImg}
              alt={modalLabel}
              style={{ transform: "rotate(-90deg)", maxWidth: "70vh", maxHeight: "70vw", width: "auto", height: "auto" }}
            />
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
              {meta.recipient && <span className="text-[10px] text-gray-400">수신: {meta.recipient}</span>}
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
                  <tr key={ri} className={`border-t border-gray-100 hover:bg-amber-50/50 transition-colors ${ri % 2 !== 0 ? "bg-gray-50/40" : ""}`}>
                    {dispHeaders.map((h, ci) => {
                      const cell  = row[ci];
                      const isNum = typeof cell === "number";
                      const isName = h === "품명";
                      return (
                        <td key={ci}
                          onClick={isName && pageImages?.length ? () => openModal(ri) : undefined}
                          className={`px-3 py-2 whitespace-nowrap ${
                            h === "금액" ? "text-right font-bold text-amber-800" :
                            isNum        ? "text-right text-gray-700" :
                            isName       ? `font-semibold text-gray-900 ${pageImages?.length ? "cursor-pointer hover:text-amber-600 hover:underline underline-offset-2" : ""}` :
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
                  <tr className="bg-amber-50 border-t-2 border-amber-300">
                    <td colSpan={amtIdx} className="px-3 py-2.5 text-right font-black text-gray-700 text-xs">합 계</td>
                    <td className="px-3 py-2.5 text-right font-black text-amber-700 text-sm whitespace-nowrap">{fmt(total)}원</td>
                    {dispHeaders.slice(amtIdx + 1).map((_, i) => <td key={i} />)}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── 공급처별 합계 ── */}
      {supplierTotals.length >= 1 && total > 0 && (
        <div className="w-full bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <span className="text-xs font-bold text-gray-700">공급처별 합계</span>
          </div>
          <div className="divide-y divide-gray-100">
            {supplierTotals.map(({ supplier, total: sTotal, count }) => (
              <div key={supplier} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-800">{supplier}</span>
                  <span className="text-[10px] text-gray-400">{count}건</span>
                </div>
                <span className="text-xs font-black text-amber-700">{fmt(sTotal)}원</span>
              </div>
            ))}
            {supplierTotals.length >= 2 && (
              <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50">
                <span className="text-xs font-black text-gray-800">합 계</span>
                <span className="text-sm font-black text-amber-800">{fmt(total)}원</span>
              </div>
            )}
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
                    className="text-[11px] text-indigo-500 hover:text-indigo-700 font-bold cursor-pointer">
                    재실행
                  </button>
                  <button onClick={() => { setConfirmed(true); }}
                    className="text-[11px] font-bold text-white bg-indigo-500 hover:bg-indigo-600 px-3 py-1 rounded-lg transition cursor-pointer shrink-0">
                    확정
                  </button>
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
                            onChange={e => setOverrides(prev => ({ ...prev, [ri]: e.target.value }))}
                          />
                          <span className={`shrink-0 font-bold ${scoreColor(score)}`}>{score}%</span>
                          {item.matched.code && <span className="text-gray-300 shrink-0 text-[10px]">{item.matched.code}</span>}
                        </div>
                      ) : (
                        <input
                          className="flex-1 font-semibold text-rose-500 bg-transparent border-b border-rose-200 hover:border-rose-300 focus:border-rose-400 outline-none truncate min-w-0 placeholder-rose-300 italic"
                          value={overrides[ri] ?? ""}
                          placeholder="직접 입력..."
                          onChange={e => setOverrides(prev => ({ ...prev, [ri]: e.target.value }))}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 보정 표 — 확정 후 표시 */}
              {!confirmed && (
                <div className="px-4 py-3 text-center text-[11px] text-indigo-400 font-semibold">
                  상품명을 확인·수정한 후 <span className="text-indigo-600 font-bold">확정</span> 버튼을 누르면 표가 생성됩니다.
                </div>
              )}
              {confirmed && <div className="overflow-x-auto">
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
                        ? (invoiceP > masterP ? "high" : "low")
                        : null;
                      return (
                        <tr key={ri} className={`border-t border-gray-100 hover:bg-indigo-50/40 transition-colors ${ri % 2 !== 0 ? "bg-gray-50/30" : ""}`}>
                          {CONF_HEADERS.map((h, ci) => {
                            const cell  = row[ci];
                            const isNum = typeof cell === "number";
                            const isName        = h === "상품명";
                            const isMasterPrice = h === "마스터 매입단가";
                            const isInvoiceP    = h === "전표 매입단가";
                            const isProfitRate  = h === "이익률";
                            return (
                              <td key={ci}
                                onClick={isName && pageImages?.length ? () => openModal(ri) : undefined}
                                className={`px-3 py-2 whitespace-nowrap ${
                                  h === "매입총계"          ? "text-right font-bold text-indigo-700" :
                                  isMasterPrice             ? `text-right font-bold ${priceDiff ? "text-blue-600" : "text-blue-400"}` :
                                  isInvoiceP && priceDiff === "high" ? "text-right font-bold text-rose-600" :
                                  isInvoiceP && priceDiff === "low"  ? "text-right font-bold text-emerald-600" :
                                  isInvoiceP                ? "text-right text-gray-700" :
                                  isProfitRate              ? "text-right text-emerald-700 font-semibold" :
                                  isNum                     ? "text-right text-gray-700" :
                                  h === "상품코드"          ? "text-gray-400 text-[10px] font-mono" :
                                  h === "소비기한"          ? "text-gray-500 text-[10px]" :
                                  isName                    ? `font-semibold ${pageImages?.length ? "cursor-pointer hover:underline underline-offset-2" : ""} ${m ? (score >= 80 ? "text-emerald-700" : score >= 50 ? "text-amber-700" : "text-rose-600") : "text-rose-500 italic"}` :
                                                              "text-gray-600"
                                }`}
                              >
                                {cell == null
                                  ? <span className="text-gray-300">—</span>
                                  : isProfitRate && typeof cell === "number"
                                    ? `${cell}%`
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
                      <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                        <td colSpan={confAmtIdx} className="px-3 py-2.5 text-right font-black text-gray-700 text-xs">합 계</td>
                        <td className="px-3 py-2.5 text-right font-black text-indigo-700 text-sm whitespace-nowrap">{fmt(confTotal)}원</td>
                        {CONF_HEADERS.slice(confAmtIdx + 1).map((_, i) => <td key={i} />)}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>}
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
