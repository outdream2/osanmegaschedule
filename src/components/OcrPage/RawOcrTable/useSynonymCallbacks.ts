import { useCallback } from "react";
import { api } from "../../../lib/apiClient";
import type { MatchedItem, RawPage } from "./types";

interface UseSynonymCallbacksParams {
  nameIdx: number;
  pageNums: number[];
  dispRows: (string | number | null)[][];
  structuredPages: RawPage[];
  rawSupplierByPage: Record<number, string>;
  savedSynonymIds: Record<number, number>;
  synonymsMap: Map<string, { name: string; code: string }>;
  setSavedSynonyms: React.Dispatch<React.SetStateAction<Set<number>>>;
  setSavedSynonymIds: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  setSynonymsMap: React.Dispatch<React.SetStateAction<Map<string, { name: string; code: string }>>>;
  setSynonymAddStatus: React.Dispatch<React.SetStateAction<{ pageNum: number; status: "loading" | "done" | "error"; count: number } | null>>;
  setOverrides: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  setSelectedCands: React.Dispatch<React.SetStateAction<Record<number, any>>>;
  setPendingSyn: React.Dispatch<React.SetStateAction<Record<number, any>>>;
  setCancelledRows: React.Dispatch<React.SetStateAction<Set<number>>>;
  setReparseStatus: React.Dispatch<React.SetStateAction<Record<number, "loading" | "done" | "error" | "saved">>>;
  setSupplierBalanceRecords: React.Dispatch<React.SetStateAction<any[]>>;
  handleSynonymBulkAddRef: React.MutableRefObject<(pageNum: number, newSupplier: string) => Promise<void>>;
}

export function useSynonymCallbacks({
  nameIdx, pageNums, dispRows, structuredPages, rawSupplierByPage,
  savedSynonymIds, synonymsMap: _synonymsMap,
  setSavedSynonyms, setSavedSynonymIds, setSynonymsMap, setSynonymAddStatus,
  setOverrides, setSelectedCands, setPendingSyn, setCancelledRows,
  setReparseStatus, setSupplierBalanceRecords,
  handleSynonymBulkAddRef,
}: UseSynonymCallbacksParams) {
  void _synonymsMap;

  const saveSynonym = useCallback(async (
    ri: number,
    nameOld: string,
    productCode: string,
    supplierNew?: string,
    nameNew?: string,
    supplierOld?: string,
  ) => {
    try {
      const { data: json } = await api.post<{ synonym?: { id?: number } }>("/api/ocr-synonyms", {
        prod_name_old: nameOld,
        prod_name_new: nameNew ?? null,
        product_code: productCode,
        supplier_new: supplierNew?.trim() || null,
        supplier_old: supplierOld?.trim() || null,
      });
      setSavedSynonyms(prev => new Set([...prev, ri]));
      if (json?.synonym?.id) setSavedSynonymIds(prev => ({ ...prev, [ri]: json.synonym!.id! }));
      if (nameOld && nameNew && productCode) {
        setSynonymsMap(prev => {
          const m = new Map(prev);
          m.set(nameOld.trim().toLowerCase(), { name: nameNew, code: productCode });
          return m;
        });
      }
    } catch (e) {
      console.warn("[ocr-synonyms] 네트워크 오류:", e);
    }
  }, [setSavedSynonyms, setSavedSynonymIds, setSynonymsMap]);

  const deleteSynonymForRow = useCallback(async (ri: number) => {
    const id = savedSynonymIds[ri];
    if (!id) return;
    try {
      await api.del(`/api/ocr-synonyms/${id}`);
    } catch (e) {
      console.warn("[ocr-synonyms] 삭제 오류:", e);
    }
    setSavedSynonyms(prev => { const s = new Set(prev); s.delete(ri); return s; });
    setSavedSynonymIds(prev => { const s = { ...prev }; delete s[ri]; return s; });
    setOverrides(prev => ({ ...prev, [ri]: undefined as unknown as string }));
    setSelectedCands(prev => { const s = { ...prev }; delete s[ri]; return s; });
    setPendingSyn(prev => { const s = { ...prev }; delete s[ri]; return s; });
    setCancelledRows(prev => { const s = new Set(prev); s.delete(ri); return s; });
  }, [savedSynonymIds, setSavedSynonyms, setSavedSynonymIds, setOverrides, setSelectedCands, setPendingSyn, setCancelledRows]);

  const saveSupplierAlias = useCallback(async (ri: number, aliasOld: string, supplierNew: string) => {
    const alias = aliasOld.trim();
    const name  = supplierNew.trim();
    if (!alias || !name || alias === name) return;
    try {
      await api.post("/api/ocr-supplier-aliases", { alias, supplier_name: name });
    } catch (e) {
      console.warn("[ocr-supplier-aliases] 네트워크 오류:", e);
    }
  }, []);

  const saveSupplierBalance = useCallback(async (supplierName: string, amount: number, invoiceDate: string | null) => {
    try {
      const { data: d } = await api.post<{ balance?: any }>("/api/supplier-balances", {
        supplier_name: supplierName,
        invoice_date: invoiceDate,
        balance: amount,
      });
      if (d.balance) setSupplierBalanceRecords(prev => [d.balance, ...prev]);
    } catch { /* silent */ }
  }, [setSupplierBalanceRecords]);

  const handleSynonymBulkAdd = useCallback(async (pageNum: number, newSupplier: string) => {
    if (nameIdx < 0) return;
    const entries: { ri: number; name: string }[] = [];
    pageNums.forEach((pn, ri) => {
      if (pn !== pageNum) return;
      const n = String(dispRows[ri][nameIdx] ?? "").trim();
      if (n) entries.push({ ri, name: n });
    });
    if (entries.length === 0) return;
    setSynonymAddStatus({ pageNum, status: "loading", count: 0 });
    try {
      const { data } = await api.post<{ matches?: MatchedItem[] }>("/api/ocr-match", {
        names: entries.map(e => e.name),
        suppliers: entries.map(() => newSupplier),
      });
      const matches: MatchedItem[] = data.matches ?? [];
      let count = 0;
      for (let i = 0; i < entries.length; i++) {
        const m = matches[i]?.matched;
        if (!m) continue;
        try {
          await api.post("/api/ocr-synonyms", {
            prod_name_old: entries[i].name,
            prod_name_new: m.name,
            product_code: m.code,
            supplier_new: newSupplier,
          });
          count++;
        } catch { /* silent */ }
      }
      setSynonymAddStatus({ pageNum, status: count > 0 ? "done" : "error", count });
    } catch {
      setSynonymAddStatus({ pageNum, status: "error", count: 0 });
    }
  }, [nameIdx, pageNums, dispRows, setSynonymAddStatus]);

  // Keep ref up to date for saveTemplate forward-reference
  handleSynonymBulkAddRef.current = handleSynonymBulkAdd;

  const saveTemplate = useCallback(async (pageNum: number, supplierName: string) => {
    const pageHdrs = structuredPages.find(p => p.page === pageNum)?.headers;
    if (!pageHdrs?.length) return;
    try {
      await api.post("/api/ocr-templates", { supplier_name: supplierName, headers: pageHdrs });
      setReparseStatus(prev => ({ ...prev, [pageNum]: "saved" }));
    } catch { /* silent */ }
    await handleSynonymBulkAddRef.current(pageNum, supplierName);
  }, [structuredPages, setReparseStatus, handleSynonymBulkAddRef]);

  return {
    saveSynonym, deleteSynonymForRow, saveSupplierAlias, saveSupplierBalance,
    handleSynonymBulkAdd, saveTemplate,
  };
}
