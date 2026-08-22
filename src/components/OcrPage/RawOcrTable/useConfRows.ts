import { parseNumber } from "./utils";
import type { MatchedItem, RawPage } from "./types";

interface UseConfRowsParams {
  matchItems: MatchedItem[] | null;
  effectiveDispRows: (string | number | null)[][];
  pageNums: number[];
  permanentlyDeletedRawRows: Set<number>;
  isRowDbDeleted: (ri: number) => boolean;
  hiddenRawRows: Set<number>;
  confirmedPages: Set<number>;
  nameIdx: number;
  ocrQtyIdx: number;
  ocrPriIdx: number;
  ocrSpecIdx: number;
  ocrSuppIdx: number;
  amtIdx: number;
  dispHeaders: string[];
  cancelledRows: Set<number>;
  selectedCands: Record<number, any>;
  cancelledAutoMap: Set<number>;
  autoSynonymMatches: Record<number, { code: string; name: string }>;
  barcodeAutoMap: Record<number, any>;
  erpCellEdits: Record<number, Record<string, any>>;
  cellEdits: Record<number, Record<number, string | number | null>>;
  rawSupplierByPage: Record<number, string>;
  structuredPages: RawPage[];
  globalSupplier: string | null;
  supplierOverrides: Record<number, string>;
  pageDateOverride: Record<number, string | null>;
  pageSupplierBalances: Record<number, number>;
  pageBalanceOverride: Record<number, number>;
  pageBalanceModeManual: Set<number>;
  pageBalanceManualInput: Record<number, string>;
  confirmedAt: string | null;
  CONF_HEADERS: string[];
  uniquePageNums: number[];
  getPageConfirmedSubtotal: (pn: number) => number;
}

export function useConfRows({
  matchItems, effectiveDispRows, pageNums,
  permanentlyDeletedRawRows, isRowDbDeleted, hiddenRawRows,
  confirmedPages, nameIdx, ocrQtyIdx, ocrPriIdx, ocrSpecIdx, ocrSuppIdx,
  amtIdx, dispHeaders, cancelledRows, selectedCands, cancelledAutoMap,
  autoSynonymMatches, barcodeAutoMap, erpCellEdits, cellEdits,
  rawSupplierByPage, structuredPages, globalSupplier, supplierOverrides,
  pageDateOverride, pageSupplierBalances, pageBalanceOverride,
  pageBalanceModeManual, pageBalanceManualInput, confirmedAt,
  CONF_HEADERS, uniquePageNums, getPageConfirmedSubtotal,
}: UseConfRowsParams) {
  const confRows: (string | number | null)[][] = matchItems
    ? effectiveDispRows.map((row, ri) => {
        if (permanentlyDeletedRawRows.has(ri) || isRowDbDeleted(ri) || hiddenRawRows.has(ri)) return [] as (string | number | null)[];
        if (!confirmedPages.has(pageNums[ri])) return [] as (string | number | null)[];
        {
          const _nm = nameIdx >= 0 ? String(row[nameIdx] ?? "").trim() : "";
          const _q = ocrQtyIdx >= 0 ? parseNumber(row[ocrQtyIdx]) : 0;
          const _p = ocrPriIdx >= 0 ? parseNumber(row[ocrPriIdx]) : 0;
          if (!_nm && _q === 0 && _p === 0) return [] as (string | number | null)[];
        }
        const m        = cancelledRows.has(ri) ? null : (selectedCands[ri] ?? matchItems[ri]?.matched ?? null);
        const autoSyn  = cancelledAutoMap.has(ri) ? undefined : autoSynonymMatches[ri];
        const bc       = cancelledAutoMap.has(ri) ? null : (barcodeAutoMap[ri] ?? null);
        const origOcrName = nameIdx >= 0 ? String(row[nameIdx] ?? "").trim() || null : null;
        const erpEdits = erpCellEdits[ri];
        const firstCorrectionName =
          (nameIdx >= 0 && cellEdits[ri]?.[nameIdx] != null && String(cellEdits[ri][nameIdx]).trim())
            ? String(cellEdits[ri][nameIdx]).trim()
            : (autoSyn?.name ?? origOcrName ?? null);
        const corrName = erpEdits?.["ERP 품명"] !== undefined
          ? erpEdits["ERP 품명"]
          : (m?.name ?? firstCorrectionName ?? null);
        const corrCode = erpEdits?.["ERP 코드"] !== undefined
          ? erpEdits["ERP 코드"]
          : (m?.code ?? null);
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
        else if ((qtyEditVal !== undefined || priEditVal !== undefined) && parseNumber(qty) > 0 && parseNumber(pri) > 0) {
          amt = Math.round(parseNumber(qty) * parseNumber(pri));
        } else {
          const rawA = amtIdx >= 0 && row[amtIdx] != null ? parseNumber(row[amtIdx]) : 0;
          if (rawA > 0) amt = rawA;
          else if (parseNumber(qty) > 0 && parseNumber(pri) > 0) amt = Math.round(parseNumber(qty) * parseNumber(pri));
          else amt = null;
        }
        const pn = pageNums[ri];
        const spec = ocrSpecIdx >= 0 ? (row[ocrSpecIdx] ?? m?.spec ?? bc?.spec ?? null) : (m?.spec ?? bc?.spec ?? null);
        const rawSupp = rawSupplierByPage[pn] !== undefined
          ? rawSupplierByPage[pn]
          : (ocrSuppIdx >= 0 ? (row[ocrSuppIdx] ?? globalSupplier) : (structuredPages.find(p => p.page === pn)?.meta.supplier ?? globalSupplier));
        const supp    = supplierOverrides[ri] !== undefined ? supplierOverrides[ri] : rawSupp;
        const dateVal = pageDateOverride[pn] ?? structuredPages.find(p => p.page === pn)?.meta.date ?? null;
        const expiryEdit = erpEdits?.["유통기한"];
        const expiryIdxL = (() => {
          for (const a of ["유통기한","유효기한","유통기간"]) {
            const i = dispHeaders.indexOf(a); if (i >= 0) return i;
          }
          return -1;
        })();
        const ocrExpiry = expiryIdxL >= 0 ? String(row[expiryIdxL] ?? "").trim() || null : null;
        const expiry = expiryEdit !== undefined ? expiryEdit : (ocrExpiry ?? m?.expiryDate ?? bc?.expiryDate ?? null);
        const confirmedDateEdit = erpEdits?.["확정일"];
        const confirmedDateCell = confirmedDateEdit !== undefined ? confirmedDateEdit : (confirmedAt ?? null);
        const _balDetected = pageSupplierBalances[pn] ?? pageBalanceOverride[pn];
        const _balManual = pageBalanceModeManual.has(pn) ? parseNumber(pageBalanceManualInput[pn] ?? "") : 0;
        const pnBalance = _balDetected ?? (_balManual > 0 ? _balManual : null);
        void confirmedDateCell; void spec; void pnBalance;
        const dateSuppCombined = (() => {
          const d = dateVal ? String(dateVal) : "";
          const s = supp ? String(supp) : "";
          if (d && s) return `${d}\n${s}`;
          return d || s || null;
        })();
        const codeNameCombined = (() => {
          const c = corrCode ? String(corrCode) : "";
          const n = corrName ? String(corrName) : "";
          if (c && n) return `${c}\n${n}`;
          return c || n || null;
        })();
        return [dateSuppCombined, codeNameCombined, m?.masterPrice ?? bc?.masterPrice ?? null, pri, qty, amt,
                m?.salePrice ?? bc?.salePrice ?? null,
                m?.profitRate != null ? m.profitRate : (bc?.profitRate ?? null),
                expiry];
      })
    : [];

  const confAmtIdx  = CONF_HEADERS.indexOf("매입총계");
  const confSuppIdx = CONF_HEADERS.indexOf("공급사");

  const confPageTotals = new Map<number, number>();
  if (confAmtIdx >= 0) {
    uniquePageNums.forEach(pn => {
      confPageTotals.set(pn, getPageConfirmedSubtotal(pn));
    });
  }

  const confTotal = confAmtIdx >= 0
    ? [...confirmedPages].reduce((s, pn) => s + (confPageTotals.get(pn) ?? 0), 0)
    : 0;

  const confSupplierTotals: { supplier: string; total: number; count: number }[] = confAmtIdx >= 0
    ? (() => {
        const m = new Map<string, { total: number; count: number }>();
        for (const pn of [...confirmedPages].sort((a, b) => a - b)) {
          const supp = (rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "미상").trim() || "미상";
          const pageTotal = confPageTotals.get(pn) ?? 0;
          const prev = m.get(supp) ?? { total: 0, count: 0 };
          m.set(supp, { total: prev.total + pageTotal, count: prev.count + 1 });
        }
        return [...m.entries()].map(([supplier, v]) => ({ supplier, ...v }));
      })()
    : [];

  return { confRows, confAmtIdx, confSuppIdx, confPageTotals, confTotal, confSupplierTotals };
}
