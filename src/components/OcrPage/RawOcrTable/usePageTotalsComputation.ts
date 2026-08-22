import React from "react";
import { computePageBalanceFromConfig as _computePageBalanceFromConfig } from "./balanceHelpers";
import { fmt, parseNumber } from "./utils";
import type { RawPage } from "./types";

interface DiscountInfo { amount: number; label: string; isEstimated?: boolean; valid?: boolean }

interface UsePageTotalsComputationParams {
  structuredPages: RawPage[];
  pages: RawPage[];
  pageNums: number[];
  amtIdx: number;
  dispRows: (string | number | null)[][];
  dispHeaders: string[];
  effectiveDispRows: (string | number | null)[][];
  effectivePageTotals: Map<number, number>;
  hiddenRawRows: Set<number>;
  permanentlyDeletedRawRows: Set<number>;
  isRowDbDeleted: (ri: number) => boolean;
  pageDiscountOverride: Record<number, { amount: number; label: string }>;
  pageSubtotalChoices: Record<number, "stated" | "computed" | "custom">;
  pageSubtotalCustom: Record<number, number>;
  pageDiscountApplied: Record<number, boolean>;
  discountApplyMode: Record<number, "before" | "after">;
  pageVatIncluded: Record<number, boolean>;
  rawSupplierByPage: Record<number, string>;
  balanceConfigProp?: Record<string, string> | null;
}

export function usePageTotalsComputation({
  structuredPages, pages, pageNums, amtIdx,
  dispRows, dispHeaders, effectiveDispRows, effectivePageTotals,
  hiddenRawRows, permanentlyDeletedRawRows, isRowDbDeleted,
  pageDiscountOverride, pageSubtotalChoices, pageSubtotalCustom,
  pageDiscountApplied, discountApplyMode, pageVatIncluded,
  rawSupplierByPage, balanceConfigProp,
}: UsePageTotalsComputationParams) {
  const getPageDiscounts = (pn: number): DiscountInfo[] => {
    const ov = pageDiscountOverride[pn];
    if (ov && ov.amount > 0) return [{ amount: ov.amount, label: ov.label || "수정", valid: true }];
    const pageData = structuredPages.find(p => p.page === pn);
    const summary = pageData?.meta?.summary_rows ?? [];
    const discRe = /에누리|할인|차액|차감|DC|D\.C/i;
    const results: DiscountInfo[] = [];
    const seenLabels = new Set<string>();
    for (const s of summary) {
      const norm = String(s.label ?? "").replace(/\s+/g, "");
      if (!discRe.test(norm)) continue;
      if (!(Math.abs(s.amount) > 0)) continue;
      const label = String(s.label ?? "에누리").trim();
      if (seenLabels.has(label)) continue;
      seenLabels.add(label);
      results.push({ amount: Math.abs(s.amount), label, isEstimated: label.includes("역산") || label.includes("추정") });
    }
    if (results.length === 0) {
      const metaDisc = pageData?.meta?.discount;
      if (typeof metaDisc === "number" && metaDisc > 0) {
        const label = String(pageData?.meta?.discountLabel ?? "에누리").trim();
        results.push({ amount: metaDisc, label, isEstimated: label.includes("역산") || label.includes("추정") });
      }
    }
    if (results.length === 0 && pageData?.rawText) {
      const raw = String(pageData.rawText);
      const re = /(에누리|할인|차액|차감|DC|D\.C)[\s:￦₩\-]*([+-]?\d{1,3}(?:,\d{3})+)/gi;
      let m;
      while ((m = re.exec(raw)) !== null) {
        const label = m[1].trim();
        const amount = Math.abs(parseInt(m[2].replace(/,/g, ""), 10));
        if (amount > 0 && !seenLabels.has(label)) {
          seenLabels.add(label);
          results.push({ amount, label, isEstimated: true });
        }
      }
    }
    if (results.length > 0) {
      const rowsSum = effectivePageTotals.get(pn) ?? 0;
      const stated = pageData?.meta?.total;
      const totalDisc = results.reduce((s, d) => s + d.amount, 0);
      if (typeof stated === "number" && stated > 0 && rowsSum > 0) {
        const expectedDiff = rowsSum - stated;
        const tol = Math.max(1, stated * 0.02);
        const mathOk = Math.abs(expectedDiff - totalDisc) <= tol;
        for (const r of results) r.valid = mathOk;
      } else {
        for (const r of results) r.valid = true;
      }
    }
    return results;
  };

  const getPageDiscount = (pn: number): DiscountInfo | null => {
    const list = getPageDiscounts(pn);
    if (list.length === 0) return null;
    const totalAmt = list.reduce((s, d) => s + d.amount, 0);
    const anyValid = list.some(d => d.valid !== false);
    return { amount: totalAmt, label: list.map(d => d.label).join("·"), isEstimated: list.some(d => d.isEstimated), valid: anyValid };
  };

  const getPageCrossCheckWarning = (pn: number): string | null => {
    const pageData = structuredPages.find(p => p.page === pn);
    if (!pageData?.meta) return null;
    const A = typeof pageData.meta.supplyAmount === "number" ? pageData.meta.supplyAmount : null;
    const T = typeof pageData.meta.total === "number" ? pageData.meta.total : null;
    if (A == null || T == null) return null;
    if (T >= A) return null;
    const disc = getPageDiscount(pn);
    if (disc?.isEstimated) return null;
    const D = disc?.amount ?? 0;
    const diff = Math.abs((A - D) - T);
    if (diff > Math.max(1, A * 0.01)) {
      const V = typeof pageData.meta.vat === "number" ? pageData.meta.vat : null;
      const vatNote = V != null && Math.abs(V - A) < 1 ? ` (세액=${V.toLocaleString()} 이 공급가액과 같아 OCR 오독 의심)` : "";
      return `공급가액(${A.toLocaleString()}) - 에누리(${D.toLocaleString()}) ≠ 합계(${T.toLocaleString()}) · 차이 ${diff.toLocaleString()}원${vatNote}`;
    }
    return null;
  };

  const getPageDisplayTotal = (pn: number): number => {
    const stated = structuredPages.find(p => p.page === pn)?.meta?.total;
    const computed = effectivePageTotals.get(pn) ?? 0;
    if (pageSubtotalChoices[pn] === "custom") return pageSubtotalCustom[pn] ?? stated ?? computed;
    if (pageSubtotalChoices[pn] === "computed") return computed;
    if (pageSubtotalChoices[pn] === "stated") return stated ?? computed;
    const pageHasExclusion = effectiveDispRows.some((_, ri) =>
      pageNums[ri] === pn && (hiddenRawRows.has(ri) || permanentlyDeletedRawRows.has(ri) || isRowDbDeleted(ri))
    );
    if (pageHasExclusion) return computed;
    const base = stated ?? computed;
    if (base <= 0) return computed;
    const disc = getPageDiscount(pn);
    const explicitApplied = pageDiscountApplied[pn];
    const autoApplied = disc ? disc.valid !== false : false;
    const applied = explicitApplied !== undefined ? explicitApplied : autoApplied;
    if (applied && disc) {
      const mode = discountApplyMode[pn] ?? "before";
      return mode === "after" ? base : base + disc.amount;
    }
    return base;
  };

  const getPageDisplayTotalWithVat = (pn: number): number => {
    const base = getPageDisplayTotal(pn);
    if (pageVatIncluded[pn]) return Math.round(base * 1.1);
    return base;
  };

  const getPageConfirmedSubtotal = (pn: number): number => {
    if (pageSubtotalChoices[pn] === "custom") return getPageDisplayTotal(pn);
    const shown = effectivePageTotals.get(pn) ?? 0;
    return pageVatIncluded[pn] ? Math.round(shown * 1.1) : shown;
  };

  const uniquePageNums = [...new Set(pageNums)].sort((a, b) => a - b);

  const _uniquePageNumsForTotal = uniquePageNums;
  const total = amtIdx >= 0
    ? _uniquePageNumsForTotal.reduce((s, pn) => s + getPageConfirmedSubtotal(pn), 0)
    : 0;
  const totalBreakdownTitle = amtIdx >= 0 && _uniquePageNumsForTotal.length > 0
    ? _uniquePageNumsForTotal.map(pn => `명세서${pn} ${fmt(getPageConfirmedSubtotal(pn))}원`).join(" + ")
      + ` = 총 ${fmt(total)}원`
    : "";

  const meta = pages.map(p => p.meta).find(m => m.date || m.supplier) ?? {};
  const balanceConfig: Record<string, string> = balanceConfigProp ?? {};

  const pageTotals = new Map<number, number>();
  if (amtIdx >= 0) {
    dispRows.forEach((row, ri) => {
      const pn = pageNums[ri];
      pageTotals.set(pn, (pageTotals.get(pn) ?? 0) + parseNumber(row[amtIdx]));
    });
  }

  const pageBalanceFromConfig = React.useMemo(
    () => _computePageBalanceFromConfig(structuredPages, uniquePageNums, rawSupplierByPage, balanceConfig ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structuredPages, uniquePageNums, rawSupplierByPage, balanceConfig],
  );

  const supplierOcrBalance = new Map<string, number>();
  for (const [pn, balance] of pageBalanceFromConfig) {
    const pageData = structuredPages.find(p => p.page === pn);
    const pageSupplier = (rawSupplierByPage[pn] ?? pageData?.meta.supplier ?? "").trim() || "미상";
    supplierOcrBalance.set(pageSupplier, (supplierOcrBalance.get(pageSupplier) ?? 0) + balance);
  }

  const supplierTotals: { supplier: string; total: number; count: number }[] = amtIdx >= 0
    ? (() => {
        const map = new Map<string, { total: number; count: number }>();
        for (const pn of uniquePageNums) {
          const supp = (
            rawSupplierByPage[pn] !== undefined
              ? rawSupplierByPage[pn]
              : (structuredPages.find(p => p.page === pn)?.meta.supplier ?? "미상")
          ).trim() || "미상";
          const subtotal = getPageConfirmedSubtotal(pn);
          const prev = map.get(supp) ?? { total: 0, count: 0 };
          map.set(supp, { total: prev.total + subtotal, count: prev.count + 1 });
        }
        return [...map.entries()].map(([supplier, v]) => ({ supplier, ...v }));
      })()
    : [];

  const _qtyIdxEarly = dispHeaders.indexOf("수량");
  const _priIdxEarly = dispHeaders.indexOf("단가");
  const _discountIdxEarly = (() => {
    for (const h of dispHeaders) {
      const norm = String(h).replace(/\s+/g, "");
      if (/에누리|할인|디씨|D\.?C/i.test(norm)) return dispHeaders.indexOf(h);
    }
    return -1;
  })();
  void _qtyIdxEarly; void _priIdxEarly;

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

  const isPageResolved = (pn: number) => {
    if (pageSubtotalChoices[pn]) return true;
    const stated = structuredPages.find(p => p.page === pn)?.meta?.total ?? 0;
    const effective = effectivePageTotals.get(pn) ?? 0;
    return stated > 0 && Math.abs(stated - effective) <= 1;
  };

  return {
    getPageDiscounts,
    getPageDiscount,
    getPageCrossCheckWarning,
    getPageDisplayTotal,
    getPageDisplayTotalWithVat,
    getPageConfirmedSubtotal,
    total,
    totalBreakdownTitle,
    meta,
    balanceConfig,
    pageTotals,
    uniquePageNums,
    pageBalanceFromConfig,
    supplierOcrBalance,
    supplierTotals,
    pageMismatches,
    isPageResolved,
    _discountIdxEarly,
  };
}
