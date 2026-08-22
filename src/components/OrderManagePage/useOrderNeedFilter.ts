// src/components/OrderManagePage/useOrderNeedFilter.ts
// 2026-08-22 · Framework Phase 4 · 발주필요 인라인 필터 상태 훅
import { useCallback, useEffect, useRef, useState } from "react";

const ORDER_NEED_INLINE_KEY = "megatown_orderNeed_inline";

interface OrderNeedInline {
  maxCurrent: number;
  maxSalesMonth: number;
  maxSalesQuarter: number;
  currentEnabled: boolean;
  salesMonthEnabled: boolean;
  salesQuarterEnabled: boolean;
}

const DEFAULT_INLINE: OrderNeedInline = {
  maxCurrent: 50, maxSalesMonth: 50, maxSalesQuarter: 100,
  currentEnabled: false, salesMonthEnabled: false, salesQuarterEnabled: false,
};

function loadInlineFilter(): OrderNeedInline {
  try {
    const raw = localStorage.getItem(ORDER_NEED_INLINE_KEY);
    if (!raw) return DEFAULT_INLINE;
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return DEFAULT_INLINE;
    const hasLegacyMinSales = "minSales" in p && !("maxSalesMonth" in p);
    return {
      maxCurrent:      typeof p.maxCurrent      === "number" && p.maxCurrent      >= 0 ? Math.floor(p.maxCurrent)      : DEFAULT_INLINE.maxCurrent,
      maxSalesMonth:   hasLegacyMinSales ? 0 : (typeof p.maxSalesMonth === "number" && p.maxSalesMonth >= 0 ? Math.floor(p.maxSalesMonth) : DEFAULT_INLINE.maxSalesMonth),
      maxSalesQuarter: typeof p.maxSalesQuarter === "number" && p.maxSalesQuarter >= 0 ? Math.floor(p.maxSalesQuarter) : DEFAULT_INLINE.maxSalesQuarter,
      currentEnabled:      typeof p.currentEnabled      === "boolean" ? p.currentEnabled      : DEFAULT_INLINE.currentEnabled,
      salesMonthEnabled:   typeof p.salesMonthEnabled   === "boolean" ? p.salesMonthEnabled   : DEFAULT_INLINE.salesMonthEnabled,
      salesQuarterEnabled: typeof p.salesQuarterEnabled === "boolean" ? p.salesQuarterEnabled : DEFAULT_INLINE.salesQuarterEnabled,
    };
  } catch { return DEFAULT_INLINE; }
}

export function useOrderNeedFilter() {
  const [needInlineMaxCurrent,        setNeedInlineMaxCurrent]        = useState<number>(() => loadInlineFilter().maxCurrent);
  const [needInlineMaxSalesMonth,     setNeedInlineMaxSalesMonth]     = useState<number>(() => loadInlineFilter().maxSalesMonth);
  const [needInlineMaxSalesQuarter,   setNeedInlineMaxSalesQuarter]   = useState<number>(() => loadInlineFilter().maxSalesQuarter);
  const [needCurrentEnabled,      setNeedCurrentEnabled]      = useState<boolean>(() => loadInlineFilter().currentEnabled);
  const [needSalesMonthEnabled,   setNeedSalesMonthEnabled]   = useState<boolean>(() => loadInlineFilter().salesMonthEnabled);
  const [needSalesQuarterEnabled, setNeedSalesQuarterEnabled] = useState<boolean>(() => loadInlineFilter().salesQuarterEnabled);

  const [deferredInlineCurrent,       setDeferredInlineCurrent]       = useState(needInlineMaxCurrent);
  const [deferredInlineSalesMonth,    setDeferredInlineSalesMonth]    = useState(needInlineMaxSalesMonth);
  const [deferredInlineSalesQuarter,  setDeferredInlineSalesQuarter]  = useState(needInlineMaxSalesQuarter);
  const [deferredCurrentEnabled,      setDeferredCurrentEnabled]      = useState(needCurrentEnabled);
  const [deferredSalesMonthEnabled,   setDeferredSalesMonthEnabled]   = useState(needSalesMonthEnabled);
  const [deferredSalesQuarterEnabled, setDeferredSalesQuarterEnabled] = useState(needSalesQuarterEnabled);
  const inlineDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [inlineFiltering, setInlineFiltering] = useState(false);

  const updateInline = useCallback((field: "current" | "salesMonth" | "salesQuarter", raw: string) => {
    const n = raw === "" ? 0 : Math.max(0, Math.floor(Number(raw)));
    if (!Number.isFinite(n)) return;
    if (field === "current")      setNeedInlineMaxCurrent(n);
    if (field === "salesMonth")   setNeedInlineMaxSalesMonth(n);
    if (field === "salesQuarter") setNeedInlineMaxSalesQuarter(n);
  }, []);

  const applyInlineFilter = useCallback(() => {
    if (inlineDebounceRef.current) clearTimeout(inlineDebounceRef.current);
    setDeferredInlineCurrent(needInlineMaxCurrent);
    setDeferredInlineSalesMonth(needInlineMaxSalesMonth);
    setDeferredInlineSalesQuarter(needInlineMaxSalesQuarter);
    setDeferredCurrentEnabled(needCurrentEnabled);
    setDeferredSalesMonthEnabled(needSalesMonthEnabled);
    setDeferredSalesQuarterEnabled(needSalesQuarterEnabled);
    setInlineFiltering(false);
    try {
      localStorage.setItem(ORDER_NEED_INLINE_KEY, JSON.stringify({
        maxCurrent: needInlineMaxCurrent,
        maxSalesMonth: needInlineMaxSalesMonth,
        maxSalesQuarter: needInlineMaxSalesQuarter,
        currentEnabled: needCurrentEnabled,
        salesMonthEnabled: needSalesMonthEnabled,
        salesQuarterEnabled: needSalesQuarterEnabled,
      }));
    } catch { /**/ }
  }, [needInlineMaxCurrent, needInlineMaxSalesMonth, needInlineMaxSalesQuarter, needCurrentEnabled, needSalesMonthEnabled, needSalesQuarterEnabled]);

  useEffect(() => {
    setInlineFiltering(true);
    if (inlineDebounceRef.current) clearTimeout(inlineDebounceRef.current);
    inlineDebounceRef.current = setTimeout(() => {
      applyInlineFilter();
    }, 400);
    return () => { if (inlineDebounceRef.current) clearTimeout(inlineDebounceRef.current); };
  }, [needInlineMaxCurrent, needInlineMaxSalesMonth, needInlineMaxSalesQuarter, needCurrentEnabled, needSalesMonthEnabled, needSalesQuarterEnabled, applyInlineFilter]);

  const resetInlineFilter = () => {
    if (inlineDebounceRef.current) clearTimeout(inlineDebounceRef.current);
    setNeedCurrentEnabled(false); setNeedSalesMonthEnabled(false); setNeedSalesQuarterEnabled(false);
    setDeferredCurrentEnabled(false); setDeferredSalesMonthEnabled(false); setDeferredSalesQuarterEnabled(false);
    try {
      localStorage.setItem(ORDER_NEED_INLINE_KEY, JSON.stringify({
        maxCurrent: needInlineMaxCurrent,
        maxSalesMonth: needInlineMaxSalesMonth,
        maxSalesQuarter: needInlineMaxSalesQuarter,
        currentEnabled: false, salesMonthEnabled: false, salesQuarterEnabled: false,
      }));
    } catch { /**/ }
  };

  const inlineActive = deferredCurrentEnabled || deferredSalesMonthEnabled || deferredSalesQuarterEnabled;

  return {
    needInlineMaxCurrent, setNeedInlineMaxCurrent,
    needInlineMaxSalesMonth, setNeedInlineMaxSalesMonth,
    needInlineMaxSalesQuarter, setNeedInlineMaxSalesQuarter,
    needCurrentEnabled, setNeedCurrentEnabled,
    needSalesMonthEnabled, setNeedSalesMonthEnabled,
    needSalesQuarterEnabled, setNeedSalesQuarterEnabled,
    deferredInlineCurrent,
    deferredInlineSalesMonth,
    deferredInlineSalesQuarter,
    deferredCurrentEnabled,
    deferredSalesMonthEnabled,
    deferredSalesQuarterEnabled,
    inlineFiltering,
    updateInline,
    applyInlineFilter,
    resetInlineFilter,
    inlineActive,
  };
}
