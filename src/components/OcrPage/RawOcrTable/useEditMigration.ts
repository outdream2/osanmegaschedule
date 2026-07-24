// 2026-07-24 · RawOcrTable 리팩터 · 편집 stable-key 마이그레이션 훅 (#1 부분)
//   pages 재로딩·컬럼 위치 변경 시 · cellEdits[ri][ci] · autoSynonymMatches[ri] 를 안정키 기반으로 재매핑
//   안정키 = "pn|localRi" (페이지번호+페이지내 인덱스) · 컬럼은 이름 기반
import { useEffect, useRef } from "react";
import type React from "react";

type CellEdits = Record<number, Record<number, string | number | null>>;
type AutoSynMap = Record<number, { code: string; name: string }>;

interface Args {
  pageNums: number[];
  dispHeaders: string[];
  setCellEdits: React.Dispatch<React.SetStateAction<CellEdits>>;
  setAutoSynonymMatches: React.Dispatch<React.SetStateAction<AutoSynMap>>;
}

/** 각 ri → "pn|localRi" 안정키 */
function buildStableKeys(pns: number[]): string[] {
  const cnt: Record<number, number> = {};
  return pns.map(pn => {
    const local = cnt[pn] ?? 0;
    cnt[pn] = local + 1;
    return `${pn}|${local}`;
  });
}

export function useEditMigration({ pageNums, dispHeaders, setCellEdits, setAutoSynonymMatches }: Args) {
  const prevStructureRef = useRef<{ pageNums: number[]; dispHeaders: string[] } | null>(null);
  useEffect(() => {
    const prev = prevStructureRef.current;
    prevStructureRef.current = { pageNums: [...pageNums], dispHeaders: [...dispHeaders] };
    if (!prev || prev.pageNums.length === 0) return;
    // 구조 동일하면 스킵
    const samePn = prev.pageNums.length === pageNums.length && prev.pageNums.every((v, i) => v === pageNums[i]);
    const sameHd = prev.dispHeaders.length === dispHeaders.length && prev.dispHeaders.every((v, i) => v === dispHeaders[i]);
    if (samePn && sameHd) return;
    console.log(`[cellEdits migration] 구조 변경 감지 · prev: ${prev.pageNums.length}행 ${prev.dispHeaders.length}컬 → new: ${pageNums.length}행 ${dispHeaders.length}컬`);
    const prevKeys = buildStableKeys(prev.pageNums);
    const newKeys = buildStableKeys(pageNums);
    const prevHeaders = prev.dispHeaders;
    // cellEdits 재매핑
    setCellEdits(prevEdits => {
      const editKeys = Object.keys(prevEdits);
      if (editKeys.length === 0) return prevEdits;
      const next: CellEdits = {};
      let preserved = 0;
      let lost = 0;
      for (const prevRiStr of editKeys) {
        const prevRi = Number(prevRiStr);
        const stableKey = prevKeys[prevRi];
        if (!stableKey) { lost++; continue; }
        const newRi = newKeys.indexOf(stableKey);
        if (newRi < 0) { lost++; continue; }
        const remapped: Record<number, string | number | null> = {};
        const rowEdits = prevEdits[prevRi];
        for (const prevCiStr of Object.keys(rowEdits)) {
          const prevCi = Number(prevCiStr);
          const colName = prevHeaders[prevCi];
          if (!colName) continue;
          const newCi = dispHeaders.indexOf(colName);
          if (newCi < 0) continue;
          remapped[newCi] = rowEdits[prevCi];
        }
        if (Object.keys(remapped).length > 0) {
          next[newRi] = remapped;
          preserved++;
        } else {
          lost++;
        }
      }
      console.log(`[cellEdits migration] ${editKeys.length}행 → 유지 ${preserved} · 손실 ${lost}`);
      if (lost > 0 && lost >= preserved) {
        console.warn(`[cellEdits migration] 손실률 ${lost}/${editKeys.length} 이 유지보다 많음 · 안전을 위해 원본 유지`);
        return prevEdits;
      }
      return next;
    });
    // autoSynonymMatches 재매핑 (ri 만 · ci 무관)
    setAutoSynonymMatches(prevMap => {
      const keys = Object.keys(prevMap);
      if (keys.length === 0) return prevMap;
      const next: AutoSynMap = {};
      let preserved = 0;
      let lost = 0;
      for (const prevRiStr of keys) {
        const prevRi = Number(prevRiStr);
        const val = prevMap[prevRi];
        if (!val) continue;
        const stableKey = prevKeys[prevRi];
        if (!stableKey) { lost++; continue; }
        const newRi = newKeys.indexOf(stableKey);
        if (newRi < 0) { lost++; continue; }
        next[newRi] = val;
        preserved++;
      }
      console.log(`[autoSynonymMatches migration] ${keys.length}행 → 유지 ${preserved} · 손실 ${lost}`);
      if (lost > 0 && lost >= preserved) {
        console.warn(`[autoSynonymMatches migration] 손실률 높음 · 원본 유지`);
        return prevMap;
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNums, dispHeaders]);
}
