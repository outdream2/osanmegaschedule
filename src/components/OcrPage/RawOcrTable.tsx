import React, { useCallback } from "react";
import { Download } from "lucide-react";

interface RawPage {
  page: number;
  headers: string[];
  rows: (string | number | null)[][];
  meta: { supplier?: string | null; recipient?: string | null; date?: string | null; total?: number | null };
  rawText?: string;
}

interface RawOcrTableProps { pages: RawPage[]; }

const SCHEMA_ORDER = ["공급처","번호","품명","규격","단위","수량","단가","금액","세액","비고"];
const NUM_COLS     = new Set(["번호","수량","단가","금액","세액"]);

function fmt(v: number) { return v.toLocaleString("ko-KR"); }

function isFallback(headers: string[]) {
  return headers.length <= 1 &&
    (headers[0] === "원문 텍스트" || headers[0] === "원문 응답" || headers.length === 0);
}

/** 모든 페이지의 헤더를 합쳐 스키마 순으로 정렬한 마스터 헤더 */
function buildMasterHeaders(pages: RawPage[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  // 공급처: meta.supplier 있는 페이지가 하나라도 있으면 컬럼 추가
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
      if (!seen.has(h) && !isFallback([h])) {
        out.push(h); seen.add(h);
      }
    }
  }
  return out;
}

/** 한 행을 srcHeaders → dstHeaders 로 재매핑 */
function alignRow(
  row: (string | number | null)[],
  src: string[],
  dst: string[]
): (string | number | null)[] {
  return dst.map(h => { const i = src.indexOf(h); return i >= 0 ? row[i] : null; });
}

export const RawOcrTable: React.FC<RawOcrTableProps> = ({ pages }) => {
  const structuredPages = pages.filter(p => !isFallback(p.headers) && p.rows.length > 0);
  const fallbackPages   = pages.filter(p => isFallback(p.headers) || p.rows.length === 0);

  const masterH  = buildMasterHeaders(structuredPages);
  const multiPage = structuredPages.length > 1;

  const supplierIdx = masterH.indexOf("공급처");

  // 전 페이지 행 통합
  const allRows: { row: (string | number | null)[]; page: number }[] = structuredPages.flatMap(p => {
    const supplier = p.meta.supplier ?? null;
    return p.rows.map(row => {
      const aligned = alignRow(row, p.headers, masterH);
      if (supplierIdx >= 0) aligned[supplierIdx] = supplier;
      return { row: aligned, page: p.page };
    });
  });

  // 표시용 헤더 (멀티페이지면 앞에 페이지 번호 추가)
  const dispHeaders = multiPage ? ["페이지", ...masterH] : masterH;
  const dispRows    = allRows.map(({ row, page }) =>
    multiPage ? [page, ...row] : row
  );

  // 합계
  const amtIdx = dispHeaders.indexOf("금액");
  const total  = amtIdx >= 0
    ? dispRows.reduce((s, r) => s + (typeof r[amtIdx] === "number" ? (r[amtIdx] as number) : 0), 0)
    : 0;

  // 메타 (모든 페이지 중 값 있는 첫 번째)
  const meta = pages.map(p => p.meta).find(m => m.date || m.supplier) ?? {};

  const handleExport = useCallback(() => {
    const csv = [dispHeaders, ...dispRows]
      .map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `거래명세서_${meta.date?.replace(/-/g, "") ?? "OCR"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [dispHeaders, dispRows, meta]);

  if (pages.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-3">
      {/* ── 메인 통합 표 ── */}
      {structuredPages.length > 0 && (
        <div className="w-full bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          {/* 헤더 바 */}
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-gray-800">거래명세서 품목</span>
              <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded font-bold">
                {allRows.length}행 · {structuredPages.length}페이지
              </span>
              {meta.date     && <span className="text-[10px] text-gray-400">{meta.date}</span>}
              {meta.supplier && <span className="text-[10px] text-gray-400">공급: {meta.supplier}</span>}
              {meta.recipient && <span className="text-[10px] text-gray-400">수신: {meta.recipient}</span>}
            </div>
            <button
              onClick={handleExport}
              className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 px-2 py-1 rounded-lg transition cursor-pointer shrink-0"
            >
              <Download size={11} />CSV
            </button>
          </div>

          {/* 표 */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-amber-50 border-b-2 border-amber-200">
                  {dispHeaders.map((h, ci) => (
                    <th key={ci}
                      className={`px-3 py-2.5 font-bold text-amber-900 whitespace-nowrap text-[11px] ${
                        h === "페이지" || NUM_COLS.has(h) ? "text-right" : "text-left"
                      }`}
                    >
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
                      const isAmt  = h === "금액";
                      const isName = h === "품명";
                      const isPage = h === "페이지";
                      return (
                        <td key={ci} className={`px-3 py-2 whitespace-nowrap ${
                          isAmt  ? "text-right font-bold text-amber-800" :
                          isPage ? "text-right text-gray-400 text-[10px]" :
                          isNum  ? "text-right text-gray-700" :
                          isName ? "font-semibold text-gray-900" :
                                   "text-gray-600"
                        }`}>
                          {cell == null
                            ? <span className="text-gray-300">—</span>
                            : isNum ? fmt(cell)
                            : String(cell)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>

              {total > 0 && (
                <tfoot>
                  <tr className="bg-amber-50 border-t-2 border-amber-300">
                    <td colSpan={amtIdx} className="px-3 py-2.5 text-right font-black text-gray-700 text-xs">
                      합 계
                    </td>
                    <td className="px-3 py-2.5 text-right font-black text-amber-700 text-sm whitespace-nowrap">
                      {fmt(total)}원
                    </td>
                    {dispHeaders.slice(amtIdx + 1).map((_, i) => <td key={i} />)}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── 표 감지 실패 페이지 원문 ── */}
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
  );
};
