import React, { useCallback } from "react";
import { parseXlsxTemplateHeaders as _parseXlsxTemplateHeaders } from "./exportHelpers";
import type { MatchedItem, RawPage } from "./types";
import {
  exportCsv as _exportCsv,
  writeXlsxWithTemplate as _writeXlsxWithTemplate,
  writeXlsxFresh as _writeXlsxFresh,
  writeErpUploadXlsx as _writeErpUploadXlsx,
} from "./exportHelpers";

interface UseExportHandlersParams {
  matchItems: MatchedItem[] | null;
  confRows: (string | number | null)[][];
  CONF_HEADERS: string[];
  COL_ALIAS: Record<string, string>;
  pageNums: number[];
  uniquePageNums: number[];
  confAmtIdx: number;
  confPageTotals: Map<number, number>;
  confTotal: number;
  rawSupplierByPage: Record<number, string>;
  structuredPages: RawPage[];
  meta: { date?: string | null; supplier?: string | null };
  xlsTemplate: ArrayBuffer | null;
  xlsTemplateName: string | null;
  xlsTemplateHdrs: string[] | null;
  pageDateOverride: Record<number, string>;
  barcodeAutoMap: Record<number, any>;
  setXlsTemplate: React.Dispatch<React.SetStateAction<ArrayBuffer | null>>;
  setXlsTemplateName: React.Dispatch<React.SetStateAction<string | null>>;
  setXlsTemplateHdrs: React.Dispatch<React.SetStateAction<string[] | null>>;
}

export function useExportHandlers({
  matchItems, confRows, CONF_HEADERS, COL_ALIAS, pageNums, uniquePageNums,
  confAmtIdx, confPageTotals, confTotal, rawSupplierByPage, structuredPages, meta,
  xlsTemplate, xlsTemplateName: _xlsTemplateName, xlsTemplateHdrs,
  pageDateOverride, barcodeAutoMap,
  setXlsTemplate, setXlsTemplateName, setXlsTemplateHdrs,
}: UseExportHandlersParams) {
  void _xlsTemplateName;

  const handleExport = useCallback((headers: string[], rows: (string | number | null)[][], suffix: string) => {
    _exportCsv(headers, rows, `거래명세서_${meta.date?.replace(/-/g, "") ?? "OCR"}_${suffix}.csv`);
  }, [meta]);

  const handleErpUploadExport = useCallback(() => {
    if (!matchItems || confRows.length === 0) return;
    const filename = `ERP업로드_${meta.date?.replace(/-/g, "") ?? "OCR"}.xlsx`;
    const rows = confRows
      .map((r, ri) => {
        if (!r || r.length === 0) return null;
        const pn = pageNums[ri];
        const dateVal = pageDateOverride[pn] ?? structuredPages.find(p => p.page === pn)?.meta.date ?? "";
        const supp = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
        const codeName = String(r[1] ?? "").split("\n");
        const code = codeName[0] ?? "";
        const name = codeName[1] ?? codeName[0] ?? "";
        const matched = matchItems[ri]?.matched;
        const bc = barcodeAutoMap[ri] ?? null;
        const spec = matched?.spec ?? bc?.spec ?? "";
        void dateVal;
        return {
          code, name, spec,
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
  }, [setXlsTemplate, setXlsTemplateName, setXlsTemplateHdrs]);

  return { handleExport, handleErpUploadExport, handleExcelExport, handleTemplateUpload };
}
