import { useCallback } from "react";
import { reextractCellCandidates } from "../../../lib/cellReextract";
import { parseNumber } from "./utils";
import { findNameHeaderIdx, findRowPositionInRawText } from "./productNameReextract";
import type { RawPage, MatchedItem } from "./types";

interface UseReextractCellParams {
  pageNums: number[];
  structuredPages: any[];
  pages: RawPage[];
  dispHeaders: string[];
  dispRows: (string | number | null | undefined)[][];
  rawRows: (string | number | null)[][];
  nameIdx: number;
  amtIdx: number;
  numericCellCycle: Record<string, number>;
  numericCellCandidates: Record<string, (string | number)[]>;
  noCandidateCells: Set<string>;
  cellEdits: Record<number, Record<number, string | number | null>>;
  reextractCycle: Record<number, number>;
  effectiveDispRowsRef: React.MutableRefObject<(string | number | null | undefined)[][]>;
  matchItemsRef: React.MutableRefObject<MatchedItem[] | null>;
  setNumericCellCycle: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setNumericCellCandidates: React.Dispatch<React.SetStateAction<Record<string, (string | number)[]>>>;
  setNoCandidateCells: React.Dispatch<React.SetStateAction<Set<string>>>;
  setCellEdits: React.Dispatch<React.SetStateAction<Record<number, Record<number, string | number | null>>>>;
  setAmountCorrections: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  setPermanentlyDeletedRawRows: React.Dispatch<React.SetStateAction<Set<number>>>;
  setHiddenRawRows: React.Dispatch<React.SetStateAction<Set<number>>>;
  setReextractCycle: React.Dispatch<React.SetStateAction<Record<number, number>>>;
}

export function useReextractCell({
  pageNums, structuredPages, pages, dispHeaders, dispRows, rawRows,
  nameIdx, amtIdx, numericCellCycle, numericCellCandidates, noCandidateCells,
  cellEdits, reextractCycle, effectiveDispRowsRef, matchItemsRef,
  setNumericCellCycle, setNumericCellCandidates, setNoCandidateCells,
  setCellEdits, setAmountCorrections, setPermanentlyDeletedRawRows,
  setHiddenRawRows, setReextractCycle,
}: UseReextractCellParams) {

  const reextractOneCell = useCallback((ri: number, ci: number, colName: "수량" | "단가" | "금액" | "유통기한") => {
    const cellKey = `${ri}-${ci}`;

    if (colName === "유통기한") {
      const pn = pageNums[ri];
      const pageObj = structuredPages.find(p => p.page === pn) ?? pages.find(p => p.page === pn);
      if (!pageObj?.rawText) return;
      const raw = String(pageObj.rawText);
      const MIN_YEAR = 2026;
      const currentName = String(cellEdits[ri]?.[nameIdx] ?? dispRows[ri]?.[nameIdx] ?? "").trim();
      const headerIdx = findNameHeaderIdx(raw);
      const rowPosR = findRowPositionInRawText(raw, 0, 0, headerIdx);
      let priorityText = "";
      if (currentName) {
        const nameIdxInRaw = raw.indexOf(currentName);
        if (nameIdxInRaw >= 0) priorityText = raw.slice(nameIdxInRaw, nameIdxInRaw + 250);
      }
      if (!priorityText && rowPosR?.localScanText) priorityText = rowPosR.localScanText;
      const patterns: { re: RegExp; hasM?: boolean; hasD?: boolean; short?: boolean }[] = [
        { re: /(20\d{2})\s*[.\-\/·~]\s*(\d{1,2})\s*[.\-\/·~]\s*(\d{1,2})/g, hasM: true, hasD: true },
        { re: /(20\d{2})(\d{2})(\d{2})(?!\d)/g, hasM: true, hasD: true },
        { re: /(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g, hasM: true, hasD: true },
        { re: /(20\d{2})\s*[.\-\/·~]\s*(\d{1,2})(?!\s*[.\-\/·~\d])/g, hasM: true, hasD: false },
        { re: /(20\d{2})\s*년\s*(\d{1,2})\s*월(?!\s*\d)/g, hasM: true, hasD: false },
        { re: /(?<![\d])(\d{2})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})(?![\d])/g, hasM: true, hasD: true, short: true },
        { re: /(?<![\d])(20\d{2})(?!\s*[.\-\/·~\d년])/g, hasM: false, hasD: false },
      ];
      const scanTexts = priorityText && priorityText !== raw
        ? [{ text: priorityText, tag: "행" }, { text: raw, tag: "페이지" }]
        : [{ text: raw, tag: "페이지" }];
      const seenDates = new Set<string>();
      const priorityCands: string[] = [];
      const fallbackCands: string[] = [];
      for (const { text, tag } of scanTexts) {
        for (const p of patterns) {
          const re = new RegExp(p.re.source, "g");
          let m;
          while ((m = re.exec(text)) !== null) {
            let y = m[1];
            if (p.short) {
              const yy = Number(y); if (!Number.isFinite(yy)) continue;
              y = String(2000 + yy);
            }
            const yN = Number(y);
            if (yN < MIN_YEAR) continue;
            const mo = p.hasM ? String(m[2]).padStart(2, "0") : "01";
            const d = p.hasD ? String(m[3]).padStart(2, "0") : "01";
            const monthN = Number(mo), dayN = Number(d);
            if (monthN < 1 || monthN > 12 || dayN < 1 || dayN > 31) continue;
            const dateStr = `${y}-${mo}-${d}`;
            if (seenDates.has(dateStr)) continue;
            seenDates.add(dateStr);
            (tag === "행" ? priorityCands : fallbackCands).push(dateStr);
          }
        }
      }
      const sortedCands = [...priorityCands.sort(), ...fallbackCands.sort()];
      console.log(`[셀재추출/유통기한] ri=${ri} page=${pn} · 행근처 ${priorityCands.length}개 · 페이지 ${fallbackCands.length}개 · 총 ${sortedCands.length}:`, sortedCands);
      if (sortedCands.length === 0) { console.log(`[셀재추출/유통기한] ri=${ri} 후보 없음`); return; }

      const existingCands = (numericCellCandidates[cellKey] as string[] | undefined) ?? sortedCands;
      const prevIdx = numericCellCycle[cellKey] ?? -1;
      const nextIdx = prevIdx + 1;

      if (nextIdx >= existingCands.length) {
        setNumericCellCycle(prev => { const n = { ...prev }; delete n[cellKey]; return n; });
        setCellEdits(prev => {
          const rowEdits = { ...(prev[ri] ?? {}) };
          delete rowEdits[ci];
          if (Object.keys(rowEdits).length === 0) { const n = { ...prev }; delete n[ri]; return n; }
          return { ...prev, [ri]: rowEdits };
        });
        console.log(`[셀재추출/유통기한] ri=${ri} 원본 복원`);
      } else {
        setNumericCellCandidates(prev => ({ ...prev, [cellKey]: existingCands }));
        setNumericCellCycle(prev => ({ ...prev, [cellKey]: nextIdx }));
        setCellEdits(prev => ({ ...prev, [ri]: { ...(prev[ri] ?? {}), [ci]: existingCands[nextIdx] } }));
        console.log(`[셀재추출/유통기한] ri=${ri} → ${existingCands[nextIdx]} (${nextIdx + 1}/${existingCands.length})`);
      }
      return;
    }

    const pn = pageNums[ri];
    const pageObj = structuredPages.find(p => p.page === pn) ?? pages.find(p => p.page === pn);
    if (!pageObj) { console.warn(`[셀재추출/단일] page ${pn} 없음`); return; }
    const pageRi = pageNums.slice(0, ri).filter(p => p === pn).length;

    let candidateVals: number[] = [];
    const cached = numericCellCandidates[cellKey] as number[] | undefined;
    if (cached) {
      candidateVals = cached;
    } else {
      const rawCands = reextractCellCandidates({
        currentPage: { page: pageObj.page, headers: pageObj.headers, rows: pageObj.rows, rawText: pageObj.rawText },
        otherPages: [],
        rowIndex: pageRi,
        columnKind: colName,
      });
      const sameRowOthers = new Set<number>();
      const qtyH = pageObj.headers.indexOf("수량");
      const priH = pageObj.headers.indexOf("단가");
      const amtH = pageObj.headers.indexOf("금액");
      const localRow = pageObj.rows[pageRi];
      if (Array.isArray(localRow)) {
        for (const otherH of [qtyH, priH, amtH]) {
          if (otherH < 0) continue;
          if (pageObj.headers[otherH] === colName) continue;
          const rawV = localRow[otherH];
          const n = typeof rawV === "number" ? rawV : parseFloat(String(rawV ?? "").replace(/[^0-9.-]/g, ""));
          if (Number.isFinite(n) && n > 0) sameRowOthers.add(n);
        }
      }
      candidateVals = rawCands.map(c => Number(c.value)).filter(v => !sameRowOthers.has(v));

      if (candidateVals.length === 0) {
        const rawText = String(pageObj.rawText ?? "");
        const RANGE_FOR_COL: Record<string, { min: number; max: number }> = {
          수량: { min: 1, max: 99999 },
          단가: { min: 50, max: 9999999 },
          금액: { min: 100, max: 999999999 },
        };
        const rng = RANGE_FOR_COL[colName];
        if (rng && rawText) {
          const NUM_RE = /\d{1,3}(?:[,.]\d{3})+|\d{4,}|\d+/g;
          const seen = new Set<number>();
          const commaSet = new Set<number>();
          const cands: number[] = [];
          let m: RegExpExecArray | null;
          while ((m = NUM_RE.exec(rawText))) {
            const rawV = m[0];
            const cleaned = rawV.replace(/[,.]/g, "");
            const n = parseInt(cleaned, 10);
            if (!Number.isFinite(n) || n < rng.min || n > rng.max) continue;
            if (/^20\d{2}/.test(cleaned) && cleaned.length >= 4 && cleaned.length <= 8) continue;
            if (cleaned.length >= 10) continue;
            if (sameRowOthers.has(n)) continue;
            if (seen.has(n)) continue;
            seen.add(n);
            if (rawV.includes(",")) commaSet.add(n);
            cands.push(n);
          }
          if (colName === "단가" && commaSet.size > 0) {
            cands.sort((a, b) => {
              const aC = commaSet.has(a) ? 0 : 1;
              const bC = commaSet.has(b) ? 0 : 1;
              return aC - bC;
            });
          }
          candidateVals = cands;
          console.log(`[셀재추출/폴백] ri=${ri} (${colName}) 페이지 전체 rawText 스캔 · ${cands.length}개 후보`);
        }
      }

      if (colName === "단가" && candidateVals.length > 0) {
        const dbPrice = matchItemsRef.current?.[ri]?.matched?.masterPrice;
        if (dbPrice != null && Number.isFinite(dbPrice) && dbPrice > 0) {
          const before = candidateVals.length;
          const upper = dbPrice * 30;
          const lower = dbPrice / 30;
          const filtered = candidateVals.filter(v => {
            const n = Number(v);
            return Number.isFinite(n) && n >= lower && n <= upper;
          });
          if (filtered.length > 0) candidateVals = filtered;
          const excluded = before - candidateVals.length;
          candidateVals = [...candidateVals].sort((a, b) =>
            Math.abs(Number(a) - dbPrice) - Math.abs(Number(b) - dbPrice)
          );
          console.log(`[셀재추출/DB필터+정렬] ri=${ri} 단가 · DB=${dbPrice} · 30배 초과 ${excluded}개 제외`);
        }
      }

      if (candidateVals.length > 1 && (colName === "수량" || colName === "단가" || colName === "금액")) {
        const effRow = effectiveDispRowsRef.current[ri];
        if (Array.isArray(effRow)) {
          const qI2 = dispHeaders.indexOf("수량");
          const pI2 = dispHeaders.indexOf("단가");
          const aI2 = dispHeaders.indexOf("금액");
          const parseN = (v: unknown): number | null => {
            if (v == null) return null;
            const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.]/g, ""));
            return Number.isFinite(n) && n > 0 ? n : null;
          };
          const mathOk2 = (q: number, p: number, a: number) =>
            Math.abs(q * p - a) <= Math.max(1, a * 0.02);
          const crossSorted = [...candidateVals].sort((av, bv) => {
            let aOk = false, bOk = false;
            if (colName === "수량") {
              const p2 = pI2 >= 0 ? parseN(effRow[pI2]) : null;
              const a2 = aI2 >= 0 ? parseN(effRow[aI2]) : null;
              if (p2 != null && a2 != null) { aOk = mathOk2(av, p2, a2); bOk = mathOk2(bv, p2, a2); }
            } else if (colName === "단가") {
              const q2 = qI2 >= 0 ? parseN(effRow[qI2]) : null;
              const a2 = aI2 >= 0 ? parseN(effRow[aI2]) : null;
              if (q2 != null && a2 != null) { aOk = mathOk2(q2, av, a2); bOk = mathOk2(q2, bv, a2); }
            } else {
              const q2 = qI2 >= 0 ? parseN(effRow[qI2]) : null;
              const p2 = pI2 >= 0 ? parseN(effRow[pI2]) : null;
              if (q2 != null && p2 != null) { aOk = mathOk2(q2, p2, av); bOk = mathOk2(q2, p2, bv); }
            }
            if (aOk && !bOk) return -1;
            if (!aOk && bOk) return 1;
            return 0;
          });
          const passCount = crossSorted.filter(v => {
            if (colName === "수량") {
              const p2 = pI2 >= 0 ? parseN(effRow[pI2]) : null;
              const a2 = aI2 >= 0 ? parseN(effRow[aI2]) : null;
              return p2 != null && a2 != null && mathOk2(v, p2, a2);
            } else if (colName === "단가") {
              const q2 = qI2 >= 0 ? parseN(effRow[qI2]) : null;
              const a2 = aI2 >= 0 ? parseN(effRow[aI2]) : null;
              return q2 != null && a2 != null && mathOk2(q2, v, a2);
            } else {
              const q2 = qI2 >= 0 ? parseN(effRow[qI2]) : null;
              const p2 = pI2 >= 0 ? parseN(effRow[pI2]) : null;
              return q2 != null && p2 != null && mathOk2(q2, p2, v);
            }
          }).length;
          if (passCount > 0) {
            candidateVals = crossSorted;
            console.log(`[셀재추출/교차검증] ri=${ri} (${colName}) 방정식 통과 ${passCount}개 → 앞으로 정렬`);
          }
        }
      }

      if ((colName === "수량" || colName === "단가") && candidateVals.length > 1) {
        candidateVals = [...candidateVals].sort((a, b) => Number(a) - Number(b));
      }

      const currentCellVal = String(effectiveDispRowsRef.current[ri]?.[ci] ?? "").trim();
      if (currentCellVal) {
        const smartSplits: number[] = [];
        const numDateM = currentCellVal.match(/^(\d+)(20\d{2}[-.\/]\d{1,2}[-.\/]\d{1,2}|20\d{6})/);
        if (numDateM) {
          const prefixN = parseInt(numDateM[1], 10);
          if (Number.isFinite(prefixN) && prefixN > 0 && prefixN < 100000) smartSplits.push(prefixN);
        }
        const numSpecM = currentCellVal.match(/^(\d+)\s*\[/);
        if (numSpecM) {
          const prefixN = parseInt(numSpecM[1], 10);
          if (Number.isFinite(prefixN) && prefixN > 0) smartSplits.push(prefixN);
        }
        const digitsOnly = currentCellVal.replace(/[^\d]/g, "");
        if (digitsOnly.length >= 6 && digitsOnly.length <= 12) {
          const rng2: Record<string, { min: number; max: number }> = {
            수량: { min: 1, max: 99999 }, 단가: { min: 50, max: 9999999 }, 금액: { min: 100, max: 999999999 },
          };
          const range = rng2[colName];
          if (range) {
            for (let len = 1; len <= Math.min(5, digitsOnly.length - 1); len++) {
              const prefix = parseInt(digitsOnly.slice(0, len), 10);
              const suffix = parseInt(digitsOnly.slice(-len), 10);
              if (Number.isFinite(prefix) && prefix >= range.min && prefix <= range.max && !smartSplits.includes(prefix)) smartSplits.push(prefix);
              if (Number.isFinite(suffix) && suffix >= range.min && suffix <= range.max && !smartSplits.includes(suffix)) smartSplits.push(suffix);
            }
          }
        }
        if (smartSplits.length > 0) {
          candidateVals = [...smartSplits, ...candidateVals.filter(v => !smartSplits.includes(v))];
          console.log(`[셀재추출/스마트분리] ri=${ri} (${colName}) 분리 후보=${smartSplits.join(",")}`);
        }
      }
      if (candidateVals.length > 0) {
        setNumericCellCandidates(prev => ({ ...prev, [cellKey]: candidateVals }));
      }
    }

    if (candidateVals.length === 0) {
      const localRow2 = pageObj.rows[pageRi];
      const nameH = pageObj.headers.indexOf("품명");
      const nameVal = Array.isArray(localRow2) && nameH >= 0 ? String(localRow2[nameH] ?? "").trim() : "";
      const hasCol = pageObj.headers.indexOf(colName) >= 0;
      console.log(`[셀재추출/단일] ri=${ri} ci=${ci} (${colName}) 후보 없음`,
        { page: pn, pageRi, headers: pageObj.headers, hasColInPage: hasCol, productName: nameVal, rawTextLen: (pageObj.rawText ?? "").length });
      setNoCandidateCells(prev => new Set(prev).add(cellKey));
      return;
    }
    if (noCandidateCells.has(cellKey)) {
      setNoCandidateCells(prev => { const n = new Set(prev); n.delete(cellKey); return n; });
    }

    const prevIdx = numericCellCycle[cellKey] ?? -1;
    const nextIdx2 = prevIdx + 1;

    if (nextIdx2 >= candidateVals.length) {
      setNumericCellCycle(prev => { const n = { ...prev }; delete n[cellKey]; return n; });
      setCellEdits(prev => {
        const rowEdits = { ...(prev[ri] ?? {}) };
        delete rowEdits[ci];
        if (Object.keys(rowEdits).length === 0) { const n = { ...prev }; delete n[ri]; return n; }
        return { ...prev, [ri]: rowEdits };
      });
      console.log(`[셀재추출/단일] ri=${ri} ci=${ci} (${colName}) 원본 복원`);
    } else {
      setNumericCellCycle(prev => ({ ...prev, [cellKey]: nextIdx2 }));
      const newVal = candidateVals[nextIdx2];
      setCellEdits(prev => {
        const rowEdits = { ...(prev[ri] ?? {}), [ci]: newVal };
        if (colName === "수량" || colName === "단가") {
          const aIdx = dispHeaders.indexOf("금액");
          if (aIdx >= 0) {
            delete rowEdits[aIdx];
            console.log(`[재추출/금액잠금해제] ri=${ri} · ${colName}=${newVal} · 금액 자동 재계산 예정`);
          }
        }
        return { ...prev, [ri]: rowEdits };
      });
      console.log(`[셀재추출/단일] ri=${ri} ci=${ci} (${colName}) → ${newVal} (${nextIdx2 + 1}/${candidateVals.length})`);
    }
  }, [pageNums, structuredPages, pages, numericCellCycle, numericCellCandidates, noCandidateCells, cellEdits, dispHeaders, dispRows, nameIdx]);

  const revertSingleRawRow = useCallback((ri: number) => {
    setCellEdits(prev => {
      if (prev[ri] === undefined) return prev;
      const next = { ...prev };
      delete next[ri];
      return next;
    });
    setAmountCorrections(prev => {
      if (prev[ri] === undefined) return prev;
      const next = { ...prev };
      delete next[ri];
      return next;
    });
    setPermanentlyDeletedRawRows(prev => {
      if (!prev.has(ri)) return prev;
      const n = new Set(prev);
      n.delete(ri);
      return n;
    });
    setHiddenRawRows(prev => {
      if (!prev.has(ri)) return prev;
      const n = new Set(prev);
      n.delete(ri);
      return n;
    });

    const nextCycle = ((reextractCycle[ri] ?? 0) + 1) % 7;
    setReextractCycle(prev => ({ ...prev, [ri]: nextCycle }));

    if (nextCycle === 0) return;

    const qtyIdx = dispHeaders.indexOf("수량");
    const priIdx = dispHeaders.indexOf("단가");
    if (qtyIdx < 0 || priIdx < 0 || amtIdx < 0) return;

    const dispRow = dispRows[ri];
    if (!Array.isArray(dispRow)) return;
    const fullRow = rawRows[ri];

    const q = parseNumber(dispRow[qtyIdx]);
    const p = parseNumber(dispRow[priIdx]);
    const a = parseNumber(dispRow[amtIdx]);
    const editsForRow: Record<number, number | null> = {};

    const collectCandidates = (): number[] => {
      const set = new Set<number>();
      for (const v of fullRow ?? []) {
        const n = parseNumber(v);
        if (n > 0 && n < 999_999_999) set.add(n);
      }
      for (const v of dispRow) {
        const n = parseNumber(v);
        if (n > 0 && n < 999_999_999) set.add(n);
      }
      return [...set].sort((a, b) => a - b);
    };

    const collectNeighborCandidates = (): number[] => {
      const set = new Set<number>();
      const currentPn = pageNums[ri];
      const effRows = effectiveDispRowsRef.current;
      const rowsLen = effRows.length;
      const collectFromRow = (targetRi: number) => {
        if (targetRi < 0 || targetRi >= rowsLen) return;
        if (pageNums[targetRi] !== currentPn) return;
        const eRow = effRows[targetRi];
        if (Array.isArray(eRow)) {
          for (const v of eRow) {
            const n = parseNumber(v);
            if (n > 0 && n < 999_999_999) set.add(n);
          }
        }
        const rawR = rawRows[targetRi];
        if (Array.isArray(rawR)) {
          for (const v of rawR) {
            const n = parseNumber(v);
            if (n > 0 && n < 999_999_999) set.add(n);
          }
        }
      };
      collectFromRow(ri - 1);
      collectFromRow(ri + 1);
      [q, p, a].forEach(v => { if (v > 0) set.delete(v); });
      return [...set].sort((a, b) => a - b);
    };

    const emptyTargets: number[] = [];
    if (q <= 0) emptyTargets.push(qtyIdx);
    if (p <= 0) emptyTargets.push(priIdx);
    if (a <= 0) emptyTargets.push(amtIdx);

    const assignByMagnitude = (targetIdx: number, unusedPool: number[]): number | null => {
      if (unusedPool.length === 0) return null;
      let pick: number;
      if (targetIdx === qtyIdx) {
        pick = unusedPool.find(v => v < 1000) ?? unusedPool[0];
      } else if (targetIdx === priIdx) {
        pick = unusedPool.find(v => v >= 100 && v < 1_000_000) ?? unusedPool[0];
      } else {
        pick = unusedPool[unusedPool.length - 1];
      }
      const idx = unusedPool.indexOf(pick);
      if (idx >= 0) unusedPool.splice(idx, 1);
      return pick;
    };

    if (nextCycle === 1) {
      const neighborPool = collectNeighborCandidates();
      if (neighborPool.length === 0) {
        const candidates = collectCandidates();
        const used = new Set<number>([q, p, a].filter(v => v > 0));
        const unused = candidates.filter(c => !used.has(c));
        for (const targetIdx of emptyTargets) {
          const pick = assignByMagnitude(targetIdx, unused);
          if (pick != null) editsForRow[targetIdx] = pick;
        }
      } else {
        const pool = [...neighborPool];
        for (const targetIdx of emptyTargets) {
          const pick = assignByMagnitude(targetIdx, pool);
          if (pick != null) editsForRow[targetIdx] = pick;
        }
        if (emptyTargets.length === 0) {
          const sortedDesc = [...pool].reverse();
          if (sortedDesc.length >= 1 && a > 0) editsForRow[amtIdx] = sortedDesc[0];
          if (sortedDesc.length >= 2 && p > 0) editsForRow[priIdx] = sortedDesc[1];
          if (sortedDesc.length >= 3 && q > 0) editsForRow[qtyIdx] = sortedDesc[2];
        }
      }
    } else if (nextCycle === 2) {
      const merged = new Set<number>([...collectCandidates(), ...collectNeighborCandidates()]);
      const all = [...merged].sort((a, b) => a - b);
      if (all.length >= 3) {
        const sortedDesc = [...all].reverse();
        editsForRow[amtIdx] = sortedDesc[0];
        editsForRow[priIdx] = sortedDesc[1];
        editsForRow[qtyIdx] = sortedDesc[2];
      } else if (all.length === 2) {
        editsForRow[amtIdx] = all[1];
        editsForRow[priIdx] = all[0];
      }
    } else if (nextCycle === 3) {
      if (p > 0) editsForRow[qtyIdx] = p;
      if (q > 0) editsForRow[priIdx] = q;
    } else if (nextCycle === 4) {
      if (a > 0) editsForRow[priIdx] = a;
      if (p > 0) editsForRow[amtIdx] = p;
    } else if (nextCycle === 5) {
      const candidates = collectCandidates();
      const used = new Set<number>([q, p, a].filter(v => v > 0));
      const unused = candidates.filter(c => !used.has(c));
      for (const targetIdx of emptyTargets) {
        const pick = assignByMagnitude(targetIdx, unused);
        if (pick != null) editsForRow[targetIdx] = pick;
      }
    } else if (nextCycle === 6) {
      const candidates = collectCandidates();
      if (candidates.length >= 3) {
        const sortedDesc = [...candidates].reverse();
        editsForRow[amtIdx] = sortedDesc[0];
        editsForRow[priIdx] = sortedDesc[1];
        editsForRow[qtyIdx] = sortedDesc[2];
      } else if (candidates.length === 2) {
        editsForRow[amtIdx] = candidates[1];
        editsForRow[priIdx] = candidates[0];
      }
    }

    if (Object.keys(editsForRow).length > 0) {
      setCellEdits(prev => ({ ...prev, [ri]: editsForRow }));
    }
  }, [reextractCycle, dispHeaders, dispRows, rawRows, amtIdx, pageNums]);

  return { reextractOneCell, revertSingleRawRow };
}
