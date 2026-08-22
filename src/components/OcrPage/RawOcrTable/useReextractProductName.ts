import { useCallback } from "react";
import { api } from "../../../lib/apiClient";
import type { RawPage, MatchedItem } from "./types";
import {
  findNameHeaderIdx,
  findRowPositionInRawText,
  computeScanText,
  collectNameCandidates,
  scoreProductNameToken,
  koreanJaccardSimilarity,
} from "./productNameReextract";

interface UseReextractProductNameParams {
  reextractingName: Set<number>;
  dispHeaders: string[];
  dispRows: (string | number | null)[][];
  cellEdits: Record<number, Record<number, string | number | null>>;
  pageNums: number[];
  rawSupplierByPage: Record<number, string>;
  structuredPages: RawPage[];
  pages: RawPage[];
  globalSupplier: string | null;
  nameIdx: number;
  synonymsMap: Map<string, { name: string; code: string }>;
  nameCellCandidates: Record<number, string[]>;
  nameCellCycle: Record<number, number>;
  saveSynonym: (ri: number, nameOld: string, productCode: string, supplierNew?: string, nameNew?: string, supplierOld?: string) => Promise<void>;
  loadSynonymsMap: () => Promise<void>;
  handleMatchPage: (pn: number) => Promise<void>;
  showError: (msg: string) => void;
  setReextractingName: React.Dispatch<React.SetStateAction<Set<number>>>;
  setNameCellCandidates: React.Dispatch<React.SetStateAction<Record<number, string[]>>>;
  setNameCellCycle: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  setAutoSynonymMatches: React.Dispatch<React.SetStateAction<Record<number, { code: string; name: string }>>>;
  setCancelledAutoSyn: React.Dispatch<React.SetStateAction<Set<number>>>;
  setCancelledAutoMap: React.Dispatch<React.SetStateAction<Set<number>>>;
  setMatchItems: React.Dispatch<React.SetStateAction<MatchedItem[] | null>>;
  setCellEdits: React.Dispatch<React.SetStateAction<Record<number, Record<number, string | number | null>>>>;
}

export function useReextractProductName({
  reextractingName, dispHeaders, dispRows, cellEdits, pageNums,
  rawSupplierByPage, structuredPages, pages, globalSupplier, nameIdx,
  synonymsMap, nameCellCandidates, nameCellCycle,
  saveSynonym, loadSynonymsMap, handleMatchPage, showError,
  setReextractingName, setNameCellCandidates, setNameCellCycle,
  setAutoSynonymMatches, setCancelledAutoSyn, setCancelledAutoMap,
  setMatchItems, setCellEdits,
}: UseReextractProductNameParams) {
  const reextractProductName = useCallback(async (ri: number) => {
    if (reextractingName.has(ri)) return;
    const pn = pageNums[ri];
    const qtyIdxL = dispHeaders.indexOf("수량");
    const amtIdxL = dispHeaders.indexOf("금액");
    const row = dispRows[ri];
    const qty = qtyIdxL >= 0 ? Number(cellEdits[ri]?.[qtyIdxL] ?? row?.[qtyIdxL] ?? 0) : 0;
    const amt = amtIdxL >= 0 ? Number(cellEdits[ri]?.[amtIdxL] ?? row?.[amtIdxL] ?? 0) : 0;
    const koreanOnlyMode = !(qty > 0) && !(amt > 0);
    if (koreanOnlyMode) {
      console.log(`[reextractName] ri=${ri} · 수량·금액 없음 → 한글 위주 모드`);
    }
    const supplier = rawSupplierByPage[pn]
      ?? structuredPages.find(p => p.page === pn)?.meta.supplier
      ?? globalSupplier ?? "";
    const pageObj = structuredPages.find(p => p.page === pn) ?? pages.find(p => p.page === pn);
    const rawText = pageObj?.rawText ?? "";
    const currentName = String(cellEdits[ri]?.[nameIdx] ?? row?.[nameIdx] ?? "").trim();
    let synHit: { name: string; code: string } | null = currentName ? (synonymsMap.get(currentName.toLowerCase()) ?? null) : null;
    if (currentName && !synHit) {
      try {
        await loadSynonymsMap();
        const { data: d } = await api.get<{ synonyms?: any[] }>("/api/ocr-synonyms");
        for (const syn of (d.synonyms ?? [])) {
          if (syn.cancelled) continue;
          const key = String(syn.prod_name_old ?? "").trim().toLowerCase();
          if (key === currentName.toLowerCase() && syn.prod_name_new) {
            synHit = { name: String(syn.prod_name_new), code: String(syn.product_code ?? "") };
            break;
          }
        }
      } catch { /* silent */ }
    }
    if (synHit) {
      console.log(`[reextractName] ✓ 동의어 캐시 hit · "${currentName}" → ${synHit.name} (${synHit.code})`);
      setAutoSynonymMatches(prev => ({ ...prev, [ri]: { code: synHit!.code, name: synHit!.name } }));
      setCancelledAutoSyn(prev => { const s = new Set(prev); s.delete(ri); return s; });
      setCancelledAutoMap(prev => { const s = new Set(prev); s.delete(ri); return s; });
      try {
        const { data: arr } = await api.get<any[]>(`/api/products-search?q=${encodeURIComponent(synHit.code)}`);
        {
          const p = Array.isArray(arr) ? arr.find(x => String(x.product_code ?? "") === synHit!.code) ?? arr[0] : null;
          if (p) {
            setMatchItems(prev => {
              const next = prev ? [...prev] : dispRows.map(() => ({ input: "", matched: null }));
              next[ri] = {
                input: currentName,
                matched: {
                  code: String(p.product_code ?? synHit!.code),
                  name: String(p.product_name ?? synHit!.name),
                  spec: String(p.spec ?? ""),
                  score: 100,
                  masterPrice: p.purchase_price != null ? Number(p.purchase_price) : null,
                  salePrice: p.sale_price != null ? Number(p.sale_price) : null,
                  profitRate: p.profit_rate != null ? Number(p.profit_rate) : null,
                  expiryDate: p.expiry_date ?? null,
                  supplier: p.supplier ?? null,
                },
              };
              return next;
            });
            console.log(`[reextractName] 상품코드 ${synHit.code} · 판매가 ${p.sale_price} 사입가 ${p.purchase_price} 반영`);
          }
        }
      } catch { /* silent · fallback to handleMatchPage */ }
      setTimeout(() => { handleMatchPage(pn).catch(() => {}); }, 100);
      return;
    }
    const headerIdx = findNameHeaderIdx(rawText);
    const rowPosResult = findRowPositionInRawText(rawText, qty, amt, headerIdx);
    const localScanText = rowPosResult?.localScanText ?? "";
    if (rowPosResult) {
      console.log(`[reextractName] 행 위치 정확 매치 · pos=${rowPosResult.pos}`);
    }
    const scanText = computeScanText(rawText, headerIdx, currentName, localScanText);
    const uniqTokens = collectNameCandidates(scanText, currentName);
    const tokens: string[] = uniqTokens
      .map(t => ({ t, s: scoreProductNameToken(t, scanText) }))
      .sort((a, b) => b.s - a.s)
      .map(x => x.t);
    if (tokens.length === 0) {
      showError("한글 토큰을 찾을 수 없습니다. 수동으로 편집하세요.");
      return;
    }
    setReextractingName(prev => new Set([...prev, ri]));
    console.log(`[reextractName] ri=${ri} 후보 ${tokens.length}개 · 공급사="${supplier}" · 첫5개=`, tokens.slice(0, 5));
    try {
      const topTokens = tokens.slice(0, 10);
      const queries = topTokens.map(async tok => {
        const params = new URLSearchParams({ q: tok });
        if (supplier) params.set("supplier", supplier);
        try {
          const { data } = await api.get<any[]>(`/api/products-search?${params}`);
          const hit = Array.isArray(data) && data[0] ? data[0] : null;
          return { tok, hit };
        } catch { return { tok, hit: null }; }
      });
      const results = await Promise.all(queries);
      const scored = results
        .filter(r => r.hit?.product_code && r.hit?.product_name)
        .map(r => {
          const tokScore = scoreProductNameToken(r.tok, scanText);
          const sim = koreanJaccardSimilarity(r.tok, r.hit!.product_name);
          const combined = tokScore * (0.3 + 0.7 * sim);
          return { tok: r.tok, hit: r.hit!, sim, tokScore, combined };
        })
        .sort((a, b) => b.combined - a.combined);
      if (scored.length > 0 && scored[0].sim >= 0.35) {
        const best = scored[0];
        console.log(`[reextractName] ✓ 매칭 · "${best.tok}" → ${best.hit.product_name} (유사도=${(best.sim * 100).toFixed(0)}%, 종합=${best.combined.toFixed(1)})`);
        console.log(`[reextractName] 상위 3개 결과:`, scored.slice(0, 3).map(s => `${s.tok}→${s.hit.product_name}(${(s.sim*100).toFixed(0)}%)`));
        setAutoSynonymMatches(prev => ({ ...prev, [ri]: { code: best.hit.product_code, name: best.hit.product_name } }));
        setCancelledAutoSyn(prev => { const s = new Set(prev); s.delete(ri); return s; });
        if (best.tok !== best.hit.product_name) {
          saveSynonym(ri, best.tok, best.hit.product_code, supplier || undefined, best.hit.product_name);
        }
        return;
      }
      console.log(`[reextractName] DB 매칭 실패 · 순환 모드 진입 · 후보 ${tokens.length}개`);
      const existingCands = nameCellCandidates[ri];
      const cycleIdx = nameCellCycle[ri] ?? -1;
      let nextCands: string[];
      let nextIdx: number;
      if (!existingCands || existingCands.length === 0) {
        nextCands = tokens.slice(0, 20);
        nextIdx = 0;
        setNameCellCandidates(prev => ({ ...prev, [ri]: nextCands }));
      } else {
        nextCands = existingCands;
        nextIdx = cycleIdx + 1;
        if (nextIdx >= nextCands.length) {
          console.log(`[reextractName] 순환 종료 · 원본 복원`);
          setCellEdits(prev => {
            const rowEdits = { ...(prev[ri] ?? {}) };
            delete rowEdits[nameIdx];
            return { ...prev, [ri]: rowEdits };
          });
          setNameCellCycle(prev => { const n = { ...prev }; delete n[ri]; return n; });
          setNameCellCandidates(prev => { const n = { ...prev }; delete n[ri]; return n; });
          return;
        }
      }
      const chosen = nextCands[nextIdx];
      setNameCellCycle(prev => ({ ...prev, [ri]: nextIdx }));
      setCellEdits(prev => ({ ...prev, [ri]: { ...(prev[ri] ?? {}), [nameIdx]: chosen } }));
      console.log(`[reextractName] 후보 ${nextIdx + 1}/${nextCands.length} 채택 · "${chosen}"`);
    } finally {
      setReextractingName(prev => { const s = new Set(prev); s.delete(ri); return s; });
    }
  }, [reextractingName, dispHeaders, dispRows, cellEdits, pageNums, rawSupplierByPage, structuredPages, pages, globalSupplier, nameIdx, saveSynonym, nameCellCandidates, nameCellCycle]);

  return { reextractProductName };
}
