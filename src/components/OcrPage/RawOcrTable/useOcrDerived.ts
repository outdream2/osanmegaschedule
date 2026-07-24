// 2026-07-24 · RawOcrTable 리팩터 · 파생값 계산 훅 분리 (useOcrDerived)
//   원본 파일 · RawOcrTable.tsx line 60~160 의 useMemo 블록 이관
//   pages → structuredPages, dispHeaders, dispRows, pageNums 등 계산
import { useMemo } from "react";
import { buildMasterHeaders, alignRow, isFallback } from "./utils";
import type { RawPage } from "./types";

export interface OcrDerived {
  structuredPages: RawPage[];
  fallbackPages: RawPage[];
  masterH: string[];
  dispHeaders: string[];
  dispRows: (string | number | null)[][];
  rawRows: (string | number | null)[][];
  pageNums: number[];
  amtIdx: number;
  nameIdx: number;
}

const EXPIRY_VARIANTS = ["유통기한", "유효기한", "유통기간"];
const DATE_VARIANTS = ["거래일", "일자", "날짜", "거래일자", "거래날짜"];
const VAT_VARIANTS = ["세액", "부가세", "VAT", "vat", "부가가치세"];

export function useOcrDerived(pages: RawPage[]): OcrDerived {
  // pages 시그니처 · pages 실제로 변할 때만 재계산
  const pagesSignature = pages
    .map(p => `${p.page}:${p.headers.length}:${p.rows.length}:${(p.rawText ?? "").length}:${p.meta?.supplier ?? ""}:${p.meta?.date ?? ""}:${p.meta?.total ?? ""}`)
    .join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo<OcrDerived>(() => {
    const structuredPages = pages
      .filter(p => !isFallback(p.headers) && Array.isArray(p.rows) && p.rows.length > 0)
      .slice()
      .sort((a, b) => a.page - b.page);
    const fallbackPages = pages
      .filter(p => isFallback(p.headers) || !Array.isArray(p.rows) || p.rows.length === 0)
      .slice()
      .sort((a, b) => a.page - b.page);
    const masterH = buildMasterHeaders(structuredPages);
    const supplierIdx = masterH.indexOf("공급처");
    const allRows: { row: (string | number | null)[]; pageNum: number }[] = structuredPages.flatMap(p => {
      const supplier = p.meta.supplier ?? null;
      return p.rows
        .filter(row => Array.isArray(row))
        .map(row => {
          const aligned = alignRow(row, p.headers, masterH);
          if (supplierIdx >= 0) aligned[supplierIdx] = supplier;
          return { row: aligned, pageNum: p.page };
        });
    });
    const rawRows: (string | number | null)[][] = allRows.map(({ row }) => row);
    const pageNums: number[] = allRows.map(({ pageNum }) => pageNum);
    const keepCols: boolean[] = masterH.map((_, ci) =>
      rawRows.some(r => r[ci] != null && String(r[ci]).trim() !== ""),
    );
    const hasExpiryInMaster = EXPIRY_VARIANTS.some(v => masterH.indexOf(v) >= 0);
    masterH.forEach((h, ci) => { if (EXPIRY_VARIANTS.includes(h)) keepCols[ci] = true; });
    const hasDateInMaster = DATE_VARIANTS.some(v => masterH.indexOf(v) >= 0);
    masterH.forEach((h, ci) => { if (DATE_VARIANTS.includes(h)) keepCols[ci] = true; });
    let dispHeaders: string[] = masterH.filter((_, ci) => keepCols[ci]);
    let dispRows: (string | number | null)[][] = rawRows.map(r => r.filter((_, ci) => keepCols[ci]));
    if (!hasExpiryInMaster) {
      dispHeaders = [...dispHeaders, "유통기한"];
      dispRows = dispRows.map(r => [...r, null]);
    }
    if (!hasDateInMaster) {
      dispHeaders = ["거래일", ...dispHeaders];
      dispRows = dispRows.map((r, ri) => {
        const pn = pageNums[ri];
        const md = structuredPages.find(p => p.page === pn)?.meta?.date ?? null;
        return [md, ...r];
      });
    }
    if (!dispHeaders.includes("비고")) {
      dispHeaders = [...dispHeaders, "비고"];
      dispRows = dispRows.map(r => [...r, null]);
    }
    const vatMasterIdx = masterH.findIndex(h => VAT_VARIANTS.includes(h));
    if (!dispHeaders.includes("VAT")) {
      const priceIdxLocal = dispHeaders.indexOf("단가");
      const insertAt = priceIdxLocal >= 0 ? priceIdxLocal + 1 : dispHeaders.length;
      dispHeaders = [...dispHeaders.slice(0, insertAt), "VAT", ...dispHeaders.slice(insertAt)];
      dispRows = dispRows.map((r, ri) => {
        const vatVal: string | number | null = vatMasterIdx >= 0 ? (rawRows[ri]?.[vatMasterIdx] ?? null) : null;
        return [...r.slice(0, insertAt), vatVal, ...r.slice(insertAt)];
      });
    }
    const amtIdx = dispHeaders.indexOf("금액");
    const nameIdx = dispHeaders.indexOf("품명");
    return { structuredPages, fallbackPages, masterH, dispHeaders, dispRows, rawRows, pageNums, amtIdx, nameIdx };
  }, [pagesSignature]);
}
