import { useCallback } from "react";
import { api } from "../../../lib/apiClient";
import { isNonProductText, isValidSupplierHint } from "../../../lib/ocrRowFilter";
import type { MatchedItem, RawPage } from "./types";

interface UseHandleMatchParams {
  nameIdx: number;
  ocrSuppIdx: number;
  dispRows: (string | number | null)[][];
  pageNums: number[];
  rawSupplierByPage: Record<number, string>;
  structuredPages: RawPage[];
  globalSupplier: string | null;
  missingSupplierPages: number[];
  cellEdits: Record<number, Record<number, string | number | null>>;
  autoSynonymMatches: Record<number, { code: string; name: string }>;
  hiddenRawRows: Set<number>;
  permanentlyDeletedRawRows: Set<number>;
  isRowDbDeleted: (ri: number) => boolean;
  showError: (msg: string) => void;
  setMatching: React.Dispatch<React.SetStateAction<boolean>>;
  setMatchItems: React.Dispatch<React.SetStateAction<MatchedItem[] | null>>;
  setOverrides: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  setSupplierOverrides: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  setConfirmed: React.Dispatch<React.SetStateAction<boolean>>;
  setSavedSynonyms: React.Dispatch<React.SetStateAction<Set<number>>>;
  setSavedSupplierAliases: React.Dispatch<React.SetStateAction<Set<number>>>;
  setRetryingRows: React.Dispatch<React.SetStateAction<Set<number>>>;
  setCandidatesMap: React.Dispatch<React.SetStateAction<Record<number, any[]>>>;
  setOpenCandRow: React.Dispatch<React.SetStateAction<number | null>>;
  setSelectedCands: React.Dispatch<React.SetStateAction<Record<number, any>>>;
  setCancelledRows: React.Dispatch<React.SetStateAction<Set<number>>>;
}

export function useHandleMatch({
  nameIdx, ocrSuppIdx, dispRows, pageNums,
  rawSupplierByPage, structuredPages, globalSupplier,
  missingSupplierPages, cellEdits, autoSynonymMatches,
  hiddenRawRows, permanentlyDeletedRawRows, isRowDbDeleted,
  showError, setMatching, setMatchItems,
  setOverrides, setSupplierOverrides, setConfirmed,
  setSavedSynonyms, setSavedSupplierAliases,
  setRetryingRows, setCandidatesMap, setOpenCandRow,
  setSelectedCands, setCancelledRows,
}: UseHandleMatchParams) {
  const handleMatch = useCallback(async () => {
    if (nameIdx < 0) return;
    if (missingSupplierPages.length > 0) {
      const pagesLabel = missingSupplierPages.join(", ");
      showError(`공급사가 지정되지 않은 페이지가 있습니다: ${pagesLabel}번\n\n1차보정 표의 "공급처" 셀을 클릭하여 공급사명을 먼저 입력하세요.\n(공급사 정보 없이 상품명 매칭 시 잘못된 결과가 저장될 수 있습니다)`);
      return;
    }
    const nameSupplierPairs = dispRows.map((row, ri) => {
      const editedName = cellEdits[ri]?.[nameIdx];
      const autoSynName = autoSynonymMatches[ri]?.name;
      const rawName = String(editedName ?? autoSynName ?? row[nameIdx] ?? "").trim();
      const pn = pageNums[ri];
      let sup = "";
      if (rawSupplierByPage[pn] !== undefined) sup = rawSupplierByPage[pn];
      else if (ocrSuppIdx >= 0) {
        const cell = String(dispRows[ri]?.[ocrSuppIdx] ?? "").trim();
        if (cell) sup = cell;
      }
      if (!sup) sup = structuredPages.find(p => p.page === pn)?.meta.supplier ?? globalSupplier ?? "";
      if (!isValidSupplierHint(sup)) {
        const pageSup = structuredPages.find(p => p.page === pn)?.meta.supplier;
        sup = (pageSup && isValidSupplierHint(pageSup)) ? pageSup :
              (globalSupplier && isValidSupplierHint(globalSupplier)) ? globalSupplier : "";
      }
      const skip = !rawName || isNonProductText(rawName)
        || hiddenRawRows.has(ri)
        || permanentlyDeletedRawRows.has(ri)
        || isRowDbDeleted(ri);
      return { rowIdx: ri, name: rawName, supplier: sup, skip };
    });
    const skippedCount = nameSupplierPairs.filter(p => p.skip).length;
    if (skippedCount > 0) console.log(`[handleMatch] ${skippedCount}행 스킵 (빈 품명·배송정보·잡문자·삭제행)`);
    const activePairs = nameSupplierPairs.filter(p => !p.skip);
    const names = activePairs.map(p => p.name);
    const suppliers = activePairs.map(p => p.supplier);
    console.log(`[handleMatch] ${names.length}개 행 매칭 요청 · 고유 공급자: ${[...new Set(suppliers)].filter(Boolean).length}개`);
    setMatching(true); setMatchItems(null); setOverrides({}); setSupplierOverrides({}); setConfirmed(false); setSavedSynonyms(new Set()); setSavedSupplierAliases(new Set());
    setRetryingRows(new Set()); setCandidatesMap({}); setOpenCandRow(null); setSelectedCands({}); setCancelledRows(new Set());
    try {
      const { data } = await api.post<{ matches?: MatchedItem[] }>("/api/ocr-match", { names, suppliers });
      const returned: MatchedItem[] = data.matches ?? [];
      const aligned: (MatchedItem | null)[] = dispRows.map(() => null);
      activePairs.forEach((p, ai) => { aligned[p.rowIdx] = returned[ai] ?? null; });
      setMatchItems(aligned.map(m => m ?? { input: "", matched: null }));
    } catch { /* silent */ }
    finally { setMatching(false); }
  }, [dispRows, nameIdx, pageNums, rawSupplierByPage, ocrSuppIdx, structuredPages, globalSupplier, missingSupplierPages]);

  return { handleMatch };
}
