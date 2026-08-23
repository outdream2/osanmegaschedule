import { useCallback } from "react";
import { api } from "../../../lib/apiClient";
import { parseNumber } from "./utils";
import type { CandidateInfo } from "./types";

interface UseRowCallbacksParams {
  dispHeaders: string[];
  dispRows: (string | number | null)[][];
  retryingRows: Set<number>;
  openCandRow: number | null;
  nameSearchDebounce: React.MutableRefObject<Record<number, ReturnType<typeof setTimeout>>>;
  selectCandidate: (ri: number, cand: CandidateInfo) => void;
  saveSynonym: (ri: number, inputName: string, code: string, supplier?: string, name?: string) => void;
  setCellEdits: React.Dispatch<React.SetStateAction<Record<number, Record<number, string | number | null>>>>;
  setEditingCell: React.Dispatch<React.SetStateAction<{ ri: number; ci: number } | null>>;
  setRetryingRows: React.Dispatch<React.SetStateAction<Set<number>>>;
  setCandidatesMap: React.Dispatch<React.SetStateAction<Record<number, CandidateInfo[]>>>;
  setOpenCandRow: React.Dispatch<React.SetStateAction<number | null>>;
  setNameSearchResults: React.Dispatch<React.SetStateAction<Record<number, any[]>>>;
  setNameSearchOpenRow: React.Dispatch<React.SetStateAction<number | null>>;
}

export function useRowCallbacks({
  dispHeaders, dispRows,
  retryingRows, openCandRow, nameSearchDebounce,
  selectCandidate, saveSynonym,
  setCellEdits, setEditingCell,
  setRetryingRows, setCandidatesMap, setOpenCandRow,
  setNameSearchResults, setNameSearchOpenRow,
}: UseRowCallbacksParams) {
  const commitCellEdit = useCallback((ri: number, ci: number, rawVal: string) => {
    if (rawVal.trim() === "") { setEditingCell(null); return; }
    const cleaned = rawVal.replace(/[^0-9.-]/g, "");
    const numVal = cleaned === "" ? null : (parseFloat(cleaned) || null);
    setCellEdits(prev => {
      const rowEdits = { ...(prev[ri] ?? {}), [ci]: numVal };
      const qIdx = dispHeaders.indexOf("수량");
      const pIdx = dispHeaders.indexOf("단가");
      const aIdx = dispHeaders.indexOf("금액");
      if ((ci === qIdx || ci === pIdx) && aIdx >= 0) delete rowEdits[aIdx];
      if (ci === aIdx && qIdx >= 0 && pIdx >= 0 && numVal != null && numVal > 0) {
        const currentQty = Number(rowEdits[qIdx] ?? dispRows[ri]?.[qIdx] ?? 0);
        if (currentQty > 0) {
          const derivedPrice = Math.round(numVal / currentQty);
          rowEdits[pIdx] = derivedPrice;
          console.log(`[commitCellEdit] 금액 ${numVal} / 수량 ${currentQty} = 단가 ${derivedPrice} (역계산)`);
        }
      }
      return { ...prev, [ri]: rowEdits };
    });
    setEditingCell(null);
  }, [dispHeaders, dispRows, setCellEdits, setEditingCell]);

  const handleRetry = useCallback(async (ri: number, inputName: string, supplierHint?: string) => {
    if (retryingRows.has(ri)) return;
    if (openCandRow === ri) { setOpenCandRow(null); return; }
    setRetryingRows(prev => new Set([...prev, ri]));
    try {
      const { data } = await api.post<{ candidates?: CandidateInfo[] }>("/api/ocr-match", {
        name: inputName, topN: 10, supplier: supplierHint ?? "",
      });
      setCandidatesMap(prev => ({ ...prev, [ri]: data.candidates ?? [] }));
      setOpenCandRow(ri);
    } catch { /* silent */ }
    finally {
      setRetryingRows(prev => { const s = new Set(prev); s.delete(ri); return s; });
    }
  }, [retryingRows, openCandRow, setRetryingRows, setCandidatesMap, setOpenCandRow]);

  const searchByName = useCallback((ri: number, name: string, supplierHint?: string) => {
    clearTimeout(nameSearchDebounce.current[ri]);
    if (name.trim().length < 2) { setNameSearchOpenRow(null); return; }
    nameSearchDebounce.current[ri] = setTimeout(async () => {
      const params = new URLSearchParams({ q: name.trim() });
      if (supplierHint?.trim()) params.set("supplier", supplierHint.trim());
      try {
        const { data } = await api.get<any[]>(`/api/products-search?${params}`);
        const list = Array.isArray(data) ? data : [];
        setNameSearchResults(prev => ({ ...prev, [ri]: list }));
        setNameSearchOpenRow(list.length > 0 ? ri : null);
      } catch { /* silent */ }
    }, 280);
  }, [nameSearchDebounce, setNameSearchResults, setNameSearchOpenRow]);

  const handleSelectCandidate = useCallback((ri: number, cand: CandidateInfo, inputName: string, supplier: string) => {
    selectCandidate(ri, cand);
    saveSynonym(ri, inputName, cand.code, supplier || undefined, cand.name);
  }, [selectCandidate, saveSynonym]);

  return { commitCellEdit, handleRetry, searchByName, handleSelectCandidate };
}
