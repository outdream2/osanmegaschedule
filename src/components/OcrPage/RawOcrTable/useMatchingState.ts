import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../lib/apiClient";
import type { MatchedItem, CandidateInfo } from "./types";

interface UseMatchingStateParams {
  matchItemsRef: React.MutableRefObject<MatchedItem[] | null>;
}

export function useMatchingState({ matchItemsRef }: UseMatchingStateParams) {
  const [matching,          setMatching         ] = useState(false);
  const [matchItems,        setMatchItems       ] = useState<MatchedItem[] | null>(null);
  const [erpSubRowPages,    setErpSubRowPages   ] = useState<Set<number>>(new Set());
  const [erpStockMap,       setErpStockMap      ] = useState<Record<string, number | null>>({});
  const [erpStockLoaded,    setErpStockLoaded   ] = useState(false);
  const [overrides,         setOverrides        ] = useState<Record<number, string>>({});
  const [supplierOverrides, setSupplierOverrides] = useState<Record<number, string>>({});
  const [confirmed,         setConfirmed        ] = useState(false);
  const [confirmedAt,       setConfirmedAt      ] = useState<string | null>(null);
  const [savedSynonyms,     setSavedSynonyms    ] = useState<Set<number>>(new Set());
  const [savedSupplierAliases, setSavedSupplierAliases] = useState<Set<number>>(new Set());
  const [retryingRows,      setRetryingRows     ] = useState<Set<number>>(new Set());
  const [candidatesMap,     setCandidatesMap    ] = useState<Record<number, CandidateInfo[]>>({});
  const [openCandRow,       setOpenCandRow      ] = useState<number | null>(null);
  const [selectedCands,     setSelectedCands    ] = useState<Record<number, CandidateInfo>>({});
  const [nameSearchResults, setNameSearchResults] = useState<Record<number, any[]>>({});
  const [nameSearchOpenRow, setNameSearchOpenRow] = useState<number | null>(null);
  const nameSearchDebounce = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const [restoredRows,      setRestoredRows     ] = useState<Set<number>>(new Set());
  const [pendingSyn,        setPendingSyn       ] = useState<Record<number, { inputName: string; code: string; supplier?: string; name: string }>>({});
  const [savedSynonymIds,   setSavedSynonymIds  ] = useState<Record<number, number>>({});
  const [cancelledAutoSyn,  setCancelledAutoSyn ] = useState<Set<number>>(new Set());
  const [cancelledAutoMap,  setCancelledAutoMap ] = useState<Set<number>>(new Set());
  const [cancelledRows,     setCancelledRows    ] = useState<Set<number>>(new Set());
  const [savingConfirmed,   setSavingConfirmed  ] = useState(false);
  const [saveConfirmedToast, setSaveConfirmedToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [rawEditValues,     setRawEditValues    ] = useState<Record<number, string>>({});
  const rawSearchDebounce = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const [confirmedPages,    setConfirmedPages   ] = useState<Set<number>>(new Set());
  const [dbFilledCells,     setDbFilledCells    ] = useState<Set<string>>(new Set());
  const [autoSynonymMatches, setAutoSynonymMatches] = useState<Record<number, { code: string; name: string }>>({});
  const [autoSynonymLoading, setAutoSynonymLoading] = useState(false);
  const [barcodeAutoMap,    setBarcodeAutoMap   ] = useState<Record<number, any>>({});

  // Sync matchItems to ref for forward-reference consumers
  useEffect(() => { matchItemsRef.current = matchItems; }, [matchItems, matchItemsRef]);

  // Load products-map when matchItems first becomes available
  useEffect(() => {
    if (!matchItems || matchItems.length === 0) return;
    if (erpStockLoaded) return;
    (async () => {
      try {
        const { data } = await api.get<Record<string, any>>("/api/products-map");
        const map: Record<string, number | null> = {};
        for (const code in data) {
          const p = data[code];
          const s = p?.current_stock;
          map[code] = (s === null || s === undefined) ? null : Number(s);
        }
        setErpStockMap(map);
        setErpStockLoaded(true);
      } catch (e) {
        console.warn("[products-map] 로드 실패:", e);
      }
    })();
  }, [matchItems, erpStockLoaded]);

  // Reset when pages cleared
  useEffect(() => {
    // Handled by parent (pages.length === 0 guard) — hook just exposes setState
  }, []);

  const deleteSynonymByName = useCallback(async (origName: string, productCode?: string) => {
    const name = origName.trim();
    if (!name) return;
    try {
      await api.post("/api/ocr-synonyms/cancel-by-name", { prod_name_old: name, product_code: productCode ?? null });
    } catch (e) {
      console.warn("[ocr-synonyms/cancel-by-name] 취소 오류:", e);
    }
  }, []);

  const selectCandidate = useCallback((ri: number, cand: CandidateInfo) => {
    setSelectedCands(prev => ({ ...prev, [ri]: cand }));
    setOverrides(prev => ({ ...prev, [ri]: cand.name }));
    setCancelledRows(prev => { const s = new Set(prev); s.delete(ri); return s; });
    setOpenCandRow(null);
    setNameSearchOpenRow(null);
  }, []);

  return {
    matching, setMatching,
    matchItems, setMatchItems,
    erpSubRowPages, setErpSubRowPages,
    erpStockMap, setErpStockMap,
    erpStockLoaded, setErpStockLoaded,
    overrides, setOverrides,
    supplierOverrides, setSupplierOverrides,
    confirmed, setConfirmed,
    confirmedAt, setConfirmedAt,
    savedSynonyms, setSavedSynonyms,
    savedSupplierAliases, setSavedSupplierAliases,
    retryingRows, setRetryingRows,
    candidatesMap, setCandidatesMap,
    openCandRow, setOpenCandRow,
    selectedCands, setSelectedCands,
    nameSearchResults, setNameSearchResults,
    nameSearchOpenRow, setNameSearchOpenRow,
    nameSearchDebounce,
    restoredRows, setRestoredRows,
    pendingSyn, setPendingSyn,
    savedSynonymIds, setSavedSynonymIds,
    cancelledAutoSyn, setCancelledAutoSyn,
    cancelledAutoMap, setCancelledAutoMap,
    cancelledRows, setCancelledRows,
    savingConfirmed, setSavingConfirmed,
    saveConfirmedToast, setSaveConfirmedToast,
    rawEditValues, setRawEditValues,
    rawSearchDebounce,
    confirmedPages, setConfirmedPages,
    dbFilledCells, setDbFilledCells,
    autoSynonymMatches, setAutoSynonymMatches,
    autoSynonymLoading, setAutoSynonymLoading,
    barcodeAutoMap, setBarcodeAutoMap,
    deleteSynonymByName, selectCandidate,
  };
}
