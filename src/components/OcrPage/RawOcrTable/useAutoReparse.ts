import { useEffect, useRef } from "react";
import { TIMING } from "../../../constants/timing";
import type { RawPage } from "./types";

interface StructuredPage { page: number; meta: { total?: number; supplier?: string; [k: string]: any }; rows: any[][] }

interface UseAutoReparseParams {
  structuredPages: StructuredPage[];
  pageImages?: string[];
  effectivePageTotals: Map<number, number>;
  rawSupplierByPage: Record<number, string>;
  onReparsePage?: (pageNum: number, supplier: string, approach: string) => Promise<void>;
  setSaveConfirmedToast: React.Dispatch<React.SetStateAction<{ type: "success" | "error"; msg: string } | null>>;
}

export function useAutoReparse({
  structuredPages, pageImages, effectivePageTotals,
  rawSupplierByPage, onReparsePage, setSaveConfirmedToast,
}: UseAutoReparseParams) {
  const autoReparseRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (structuredPages.length === 0) { autoReparseRef.current = new Set(); return; }
    const imgCount = pageImages?.length ?? 0;
    const pageCount = structuredPages.length;
    const countMismatch = imgCount > 0 && imgCount !== pageCount;
    const zeroSubtotalPages: number[] = [];
    for (const p of structuredPages) {
      if (autoReparseRef.current.has(p.page)) continue;
      const rowsSum = effectivePageTotals.get(p.page) ?? 0;
      const stated = typeof p.meta?.total === "number" ? p.meta.total : 0;
      if ((stated > 0 ? stated : rowsSum) === 0) zeroSubtotalPages.push(p.page);
    }
    if (!countMismatch && zeroSubtotalPages.length === 0) return;
    if (countMismatch) {
      const msg = `⚠ 이미지 ${imgCount}장 ≠ 페이지 ${pageCount}건 · OCR 오분리 가능성`;
      console.warn(`[auto-reparse] ${msg}`);
      setSaveConfirmedToast({ type: "error", msg });
      setTimeout(() => setSaveConfirmedToast(null), 4000);
    }
    if (zeroSubtotalPages.length > 0) {
      console.warn(`[auto-reparse] 소계 0 페이지:`, zeroSubtotalPages);
      if (onReparsePage) {
        for (const pn of zeroSubtotalPages) autoReparseRef.current.add(pn);
        (async () => {
          for (const pn of zeroSubtotalPages) {
            const supp = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
            setSaveConfirmedToast({ type: "success", msg: `⏳ ${pn}번 · 소계 0 · 자동 재추출 중...` });
            try {
              await onReparsePage(pn, supp, "default");
              setSaveConfirmedToast({ type: "success", msg: `✅ ${pn}번 · 재추출 완료` });
            } catch (e: any) {
              setSaveConfirmedToast({ type: "error", msg: `❌ ${pn}번 · 재추출 실패 · ${e?.message ?? "오류"}` });
            }
            setTimeout(() => setSaveConfirmedToast(null), TIMING.TOAST_MEDIUM);
          }
        })();
      } else {
        setSaveConfirmedToast({ type: "error", msg: `⚠ 소계 0 페이지 ${zeroSubtotalPages.length}건 · 수동 재추출 필요 (pn: ${zeroSubtotalPages.join(",")})` });
        setTimeout(() => setSaveConfirmedToast(null), TIMING.TOAST_EXTRA_LONG);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuredPages, pageImages]);
}
