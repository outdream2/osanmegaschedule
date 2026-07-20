import * as XLSX from "xlsx";

/**
 * CSV 다운로드 (BOM 포함 · Excel 한글 호환)
 */
export function exportCsv(
  headers: string[],
  rows: (string | number | null)[][],
  filename: string,
): void {
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * XLSX 템플릿 첫 시트의 헤더 행 추출
 * @returns 헤더 문자열 배열 (파싱 실패 시 null)
 */
export function parseXlsxTemplateHeaders(buf: ArrayBuffer): string[] | null {
  try {
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    const hdrs: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: range.s.r, c })];
      hdrs.push(cell?.v != null ? String(cell.v) : "");
    }
    return hdrs;
  } catch {
    return null;
  }
}

/**
 * 사용자 지정 xlsx 템플릿에 확정표 데이터 채워 저장
 */
export function writeXlsxWithTemplate(params: {
  templateBuf: ArrayBuffer;
  templateHdrs: string[];
  confHeaders: readonly string[];
  colAlias: Record<string, string>;
  confRows: (string | number | null)[][];
  filename: string;
}): void {
  const { templateBuf, templateHdrs, confHeaders, colAlias, confRows, filename } = params;
  const wb = XLSX.read(templateBuf, { type: "array" });
  const wsName = wb.SheetNames[0];
  const ws = wb.Sheets[wsName];
  const templateRange = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const dataStartRow = templateRange.s.r + 1;

  const colMap: (string | null)[] = templateHdrs.map(th => {
    const t = th.trim();
    return colAlias[t] ?? (confHeaders.includes(t) ? t : null);
  });

  const buildDataMap = (row: (string | number | null)[]): Record<string, string | number | null> => {
    const m: Record<string, string | number | null> = {};
    confHeaders.forEach((h, ci) => { m[h] = row[ci] ?? null; });
    return m;
  };

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
  XLSX.writeFile(wb, filename);
}

/**
 * 템플릿 없이 확정표 xlsx 처음부터 생성 (페이지별 소계 · 합계 포함)
 */
export function writeXlsxFresh(params: {
  confHeaders: readonly string[];
  confRows: (string | number | null)[][];
  pageNums: number[];
  uniquePageNums: number[];
  confAmtIdx: number;
  confPageTotals: Map<number, number>;
  confTotal: number;
  rawSupplierByPage: Record<number, string>;
  supplierByPageFallback: (pn: number) => string;
  filename: string;
}): void {
  const {
    confHeaders, confRows, pageNums, uniquePageNums, confAmtIdx,
    confPageTotals, confTotal, rawSupplierByPage, supplierByPageFallback, filename,
  } = params;

  const wsData: (string | number | null)[][] = [confHeaders.slice()];
  confRows.forEach((row, ri) => {
    wsData.push(row.slice());
    const isLastInPage = ri === confRows.length - 1 || pageNums[ri] !== pageNums[ri + 1];
    if (isLastInPage && uniquePageNums.length > 1 && confAmtIdx >= 0) {
      const pn = pageNums[ri];
      const ps = rawSupplierByPage[pn] ?? supplierByPageFallback(pn);
      const sub: (string | number | null)[] = Array(confHeaders.length).fill(null);
      sub[confHeaders.indexOf("상품명")] = `${ps ? ps + " " : ""}${pn}번 소계`;
      sub[confAmtIdx] = confPageTotals.get(pn) ?? 0;
      wsData.push(sub);
    }
  });
  if (confTotal > 0) {
    const tot: (string | number | null)[] = Array(confHeaders.length).fill(null);
    tot[confHeaders.indexOf("상품명")] = "합 계";
    tot[confAmtIdx] = confTotal;
    wsData.push(tot);
  }
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = confHeaders.map(h => ({
    wch: h === "상품명" ? 32 : h === "공급처" ? 14 : h === "상품코드" ? 13 :
         h === "규격" ? 12 : h === "유통기한" || h === "거래일" ? 13 :
         h.includes("단가") || h === "매입총계" ? 14 : 9,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "거래명세서");
  XLSX.writeFile(wb, filename);
}
