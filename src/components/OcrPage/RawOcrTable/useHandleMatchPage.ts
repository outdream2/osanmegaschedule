// useHandleMatchPage.ts
// 2026-07-28 · 분리: ERP 매칭 관련 훅
//   handleMatchPage · fillMissingPricesFromDB · verifyAndSwapPricesWithDB
//   원본 로직: RawOcrTable.tsx line ~2530~2782

import { useCallback, useState } from "react";
import { TIMING } from "../../../constants/timing";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { MatchedItem } from "./types";
import { parseNumber } from "./utils";
import {
  isNonProductText,
  isValidSupplierHint,
  isValidProductName,
  scoreProductRow,
  cleanProductName,
} from "../../../lib/ocrRowFilter";

interface UseHandleMatchPageParams {
  dispHeaders: string[];
  dispRows: (string | number | null)[][];
  nameIdx: number;
  pageNums: number[];
  rawSupplierByPage: Record<number, string>;
  ocrSuppIdx: number;
  structuredPages: Array<{ page: number; headers: string[]; rows: (string | number | null)[][]; meta: Record<string, any>; rawText?: string }>;
  globalSupplier: string | null;
  cellEdits: Record<number, Record<number, string | number | null>>;
  autoSynonymMatches: Record<number, { code: string; name: string }>;
  hiddenRawRows: Set<number>;
  permanentlyDeletedRawRows: Set<number>;
  isRowDbDeleted: (ri: number) => boolean;
  pageBalanceOverride: Record<number, number>;
  pageSupplierBalances: Record<number, number>;
  saveSupplierBalance: (supplierName: string, amount: number, invoiceDate: string | null) => Promise<void>;
  matchItems: MatchedItem[] | null;
  setMatchItems: Dispatch<SetStateAction<MatchedItem[] | null>>;
  setConfirmedPages: Dispatch<SetStateAction<Set<number>>>;
  setCellEdits: Dispatch<SetStateAction<Record<number, Record<number, string | number | null>>>>;
  setDbFilledCells: Dispatch<SetStateAction<Set<string>>>;
  setSaveConfirmedToast: Dispatch<SetStateAction<{ type: "success" | "error"; msg: string } | null>>;
  matchItemsRef: MutableRefObject<MatchedItem[] | null>;
}

export function useHandleMatchPage({
  dispHeaders,
  dispRows,
  nameIdx,
  pageNums,
  rawSupplierByPage,
  ocrSuppIdx,
  structuredPages,
  globalSupplier,
  cellEdits,
  autoSynonymMatches,
  hiddenRawRows,
  permanentlyDeletedRawRows,
  isRowDbDeleted,
  pageBalanceOverride,
  pageSupplierBalances,
  saveSupplierBalance,
  matchItems,
  setMatchItems,
  setConfirmedPages,
  setCellEdits,
  setDbFilledCells,
  setSaveConfirmedToast,
  matchItemsRef,
}: UseHandleMatchPageParams) {

  const [matchingPage, setMatchingPage] = useState<Record<number, boolean>>({});

  // handleMatch 의 페이지 한정 버전: targetPage 행만 /api/ocr-match POST
  const handleMatchPage = useCallback(async (targetPage: number) => {
    if (nameIdx < 0) return;
    // 2026-07-23 · 페이지 내 품명 최대 길이 · 스코어링용
    const pageMaxNameLen = Math.max(0, ...dispRows
      .filter((_, ri) => pageNums[ri] === targetPage)
      .map(r => String(r[nameIdx] ?? "").trim().length));
    const qtyIdxLocal = dispHeaders.indexOf("수량");
    const priIdxLocal = dispHeaders.indexOf("단가");
    const nameSupplierPairs = dispRows.map((row, ri) => {
      if (pageNums[ri] !== targetPage) return null;
      // 2026-07-28 · 사용자 요청 (재확정) "ERP 매칭 버튼 누를 때마다 다시 반영"
      //   우선순위 · autoSynonymMatches.name (DB 보정) > cellEdits (직접 편집) > 원본 OCR
      const editedName = cellEdits[ri]?.[nameIdx];
      const autoSynName = autoSynonymMatches[ri]?.name;
      let rawName = String(autoSynName ?? editedName ?? row[nameIdx] ?? "").trim();
      // 2026-07-28 · 사용자 요청 "잡문자 제거 후 재검색 · 그냥 제외 X"
      if (rawName && !isValidProductName(rawName)) {
        const cleaned = cleanProductName(rawName);
        if (cleaned && isValidProductName(cleaned)) {
          console.log(`[handleMatchPage] 행 ${ri} 잡문자 제거 · "${rawName.slice(0, 30)}" → "${cleaned.slice(0, 30)}"`);
          rawName = cleaned;
        }
      }
      let sup = "";
      if (rawSupplierByPage[targetPage] !== undefined) sup = rawSupplierByPage[targetPage];
      else if (ocrSuppIdx >= 0) {
        const cell = String(dispRows[ri]?.[ocrSuppIdx] ?? "").trim();
        if (cell) sup = cell;
      }
      if (!sup) sup = structuredPages.find(p => p.page === targetPage)?.meta.supplier ?? globalSupplier ?? "";
      if (!isValidSupplierHint(sup)) {
        const pageSup = structuredPages.find(p => p.page === targetPage)?.meta.supplier;
        sup = (pageSup && isValidSupplierHint(pageSup)) ? pageSup :
              (globalSupplier && isValidSupplierHint(globalSupplier)) ? globalSupplier : "";
      }
      // 2026-07-23 · 행 스코어 계산
      const qty = qtyIdxLocal >= 0 ? Number(cellEdits[ri]?.[qtyIdxLocal] ?? row[qtyIdxLocal] ?? 0) : 0;
      const pri = priIdxLocal >= 0 ? Number(cellEdits[ri]?.[priIdxLocal] ?? row[priIdxLocal] ?? 0) : 0;
      const { score, reasons } = scoreProductRow({
        quantity: qty, price: pri, productName: rawName, supplier: sup, maxNameLen: pageMaxNameLen,
      });
      const lowScore = score < 0.30;
      const skip = !rawName || isNonProductText(rawName)
        || !isValidProductName(rawName)
        || lowScore
        || hiddenRawRows.has(ri)
        || permanentlyDeletedRawRows.has(ri)
        || isRowDbDeleted(ri);
      if (skip && rawName && lowScore) {
        console.log(`[handleMatchPage] 행 ${ri} 스킵 · 저스코어(${score}) · ${reasons.join(",")} · "${rawName.slice(0, 20)}"`);
      }
      return { rowIdx: ri, name: rawName, supplier: sup, skip };
    }).filter((x): x is { rowIdx: number; name: string; supplier: string; skip: boolean } => x !== null);

    const activePairs = nameSupplierPairs.filter(p => !p.skip);
    // 2026-07-24 · activePairs 없어도 확정 상태 마킹 + 잔고 저장
    if (activePairs.length === 0) {
      console.log(`[handleMatchPage] ${targetPage}번 · 매칭할 활성 행 없음 · 확정만 마킹`);
      setConfirmedPages(prev => new Set([...prev, targetPage]));
      const currentBal0 = pageBalanceOverride[targetPage] ?? pageSupplierBalances[targetPage];
      if (currentBal0 != null && currentBal0 > 0) {
        const supForBal0 = (rawSupplierByPage[targetPage] ?? structuredPages.find(p => p.page === targetPage)?.meta.supplier ?? "").trim();
        const dateForBal0 = structuredPages.find(p => p.page === targetPage)?.meta.date ?? null;
        if (supForBal0) saveSupplierBalance(supForBal0, currentBal0, dateForBal0);
      }
      setSaveConfirmedToast({ type: "error", msg: `⚠ ${targetPage}번 · 매칭 가능한 행 없음 (품명 없음/저스코어)` });
      setTimeout(() => setSaveConfirmedToast(null), TIMING.TOAST_MEDIUM);
      return;
    }
    const names = activePairs.map(p => p.name);
    const suppliers = activePairs.map(p => p.supplier);
    console.log(`[handleMatchPage] ${targetPage}번 명세서 · ${names.length}행 매칭 요청`);
    setSaveConfirmedToast({ type: "success", msg: `⏳ ${targetPage}번 · ERP 매칭 요청 (${names.length}행)...` });

    setMatchingPage(prev => ({ ...prev, [targetPage]: true }));
    let matchedCount = 0;
    let lowScoreCount = 0;
    let autoSynPreservedCount = 0;
    try {
      const res = await fetch("/api/ocr-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names, suppliers }),
      });
      const data = await res.json();
      const returned: MatchedItem[] = data.matches ?? [];
      const MIN_ERP_SCORE = 60;
      setMatchItems(prev => {
        const next = prev ? [...prev] : dispRows.map(() => ({ input: "", matched: null }));
        activePairs.forEach((p, ai) => {
          const serverItem = returned[ai];
          const svrScore = serverItem?.matched?.score ?? serverItem?.score ?? 0;
          const uAutoSyn = autoSynonymMatches[p.rowIdx];
          if (uAutoSyn?.code) {
            const prevMatched = matchItemsRef.current?.[p.rowIdx]?.matched;
            next[p.rowIdx] = {
              input: p.name,
              matched: {
                code: uAutoSyn.code,
                name: uAutoSyn.name,
                spec: prevMatched?.spec ?? serverItem?.matched?.spec ?? "",
                score: 100,
                masterPrice: serverItem?.matched?.masterPrice ?? prevMatched?.masterPrice ?? null,
                salePrice: serverItem?.matched?.salePrice ?? prevMatched?.salePrice ?? null,
                profitRate: serverItem?.matched?.profitRate ?? prevMatched?.profitRate ?? null,
                expiryDate: serverItem?.matched?.expiryDate ?? prevMatched?.expiryDate ?? null,
                supplier: serverItem?.matched?.supplier ?? prevMatched?.supplier ?? null,
              },
            };
            autoSynPreservedCount++;
            matchedCount++;
            return;
          }
          if (!serverItem?.matched || svrScore < MIN_ERP_SCORE) {
            console.log(`[handleMatchPage] 저스코어 ${svrScore} · "${p.name}" 매칭 안 함 (임계 ${MIN_ERP_SCORE})`);
            next[p.rowIdx] = { input: p.name, matched: null };
            lowScoreCount++;
            return;
          }
          next[p.rowIdx] = serverItem;
          matchedCount++;
        });
        return next;
      });
      const msg = matchedCount > 0
        ? `✅ ${targetPage}번 · 매칭 ${matchedCount}건 (autoSyn 유지 ${autoSynPreservedCount}) · 저스코어 ${lowScoreCount}건`
        : `⚠ ${targetPage}번 · 매칭 없음 · 요청 ${activePairs.length}건 모두 저스코어`;
      setSaveConfirmedToast({ type: matchedCount > 0 ? "success" : "error", msg });
      setTimeout(() => setSaveConfirmedToast(null), TIMING.TOAST_LONG);
      setConfirmedPages(prev => new Set([...prev, targetPage]));
      // 2026-07-24 · 확정 누르면 공급사별로 잔고 저장
      const currentBal = pageBalanceOverride[targetPage] ?? pageSupplierBalances[targetPage];
      if (currentBal != null && currentBal > 0) {
        const supForBal = (rawSupplierByPage[targetPage] ?? structuredPages.find(p => p.page === targetPage)?.meta.supplier ?? "").trim();
        const dateForBal = structuredPages.find(p => p.page === targetPage)?.meta.date ?? null;
        if (supForBal) {
          saveSupplierBalance(supForBal, currentBal, dateForBal);
          console.log(`[확정→잔고저장] "${supForBal}" ${dateForBal ?? "날짜없음"} → ${currentBal}원`);
        }
      }
    } finally {
      setMatchingPage(prev => ({ ...prev, [targetPage]: false }));
    }
  }, [dispRows, dispHeaders, nameIdx, pageNums, rawSupplierByPage, ocrSuppIdx, structuredPages, globalSupplier, cellEdits, autoSynonymMatches, hiddenRawRows, permanentlyDeletedRawRows, isRowDbDeleted, pageBalanceOverride, pageSupplierBalances, saveSupplierBalance, setMatchItems, setConfirmedPages, setSaveConfirmedToast, matchItemsRef]);

  // 단가 비어있는 행 · 상품명+공급사로 products DB 조회 → 사입단가(purchase_price) 자동 채움
  const fillMissingPricesFromDB = useCallback(async (pn: number) => {
    const priIdx = dispHeaders.indexOf("단가");
    if (priIdx < 0 || nameIdx < 0) return;
    const targets: { rowIdx: number; name: string; supplier: string }[] = [];
    dispRows.forEach((row, ri) => {
      if (pageNums[ri] !== pn) return;
      if (permanentlyDeletedRawRows.has(ri) || hiddenRawRows.has(ri) || isRowDbDeleted(ri)) return;
      const effective = cellEdits[ri]?.[priIdx] ?? row[priIdx];
      const n = effective == null ? 0 : parseNumber(effective);
      if (n > 0) return;
      const rawName = String(row[nameIdx] ?? "").trim();
      if (!rawName || isNonProductText(rawName)) return;
      const sup = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? globalSupplier ?? "";
      targets.push({ rowIdx: ri, name: rawName, supplier: sup });
    });
    if (targets.length === 0) return;
    try {
      const res = await fetch("/api/ocr-match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: targets.map(t => t.name), suppliers: targets.map(t => t.supplier) }),
      });
      const data = await res.json();
      const matches: MatchedItem[] = data.matches ?? [];
      let filled = 0;
      const dbCellKeys: string[] = [];
      setCellEdits(prev => {
        const next = { ...prev };
        targets.forEach((t, ai) => {
          const mp = matches[ai]?.matched?.masterPrice;
          if (mp != null && Number.isFinite(mp) && mp > 0) {
            next[t.rowIdx] = { ...(next[t.rowIdx] ?? {}), [priIdx]: mp };
            dbCellKeys.push(`${t.rowIdx}-${priIdx}`);
            filled++;
          }
        });
        return next;
      });
      if (dbCellKeys.length > 0) {
        setDbFilledCells(prev => new Set([...prev, ...dbCellKeys]));
      }
      setMatchItems(prev => {
        const arr = prev ? [...prev] : dispRows.map(() => ({ input: "", matched: null }));
        targets.forEach((t, ai) => { if (matches[ai]) arr[t.rowIdx] = matches[ai]; });
        return arr;
      });
      console.log(`[fillMissingPricesFromDB] page ${pn}: ${filled}/${targets.length} 행 사입단가 DB 채움`);
    } catch (e: any) {
      console.warn(`[fillMissingPricesFromDB] page ${pn}: DB 조회 실패`, e?.message);
    }
  }, [dispHeaders, nameIdx, dispRows, pageNums, permanentlyDeletedRawRows, hiddenRawRows, isRowDbDeleted, cellEdits, rawSupplierByPage, structuredPages, globalSupplier, setCellEdits, setDbFilledCells, setMatchItems]);

  // 2026-07-22 · OCR 단가 vs DB 사입가 큰 차이 스왑 (50% 이상 차이면 DB 값으로 스왑)
  const verifyAndSwapPricesWithDB = useCallback((pn: number) => {
    const priIdx = dispHeaders.indexOf("단가");
    if (priIdx < 0 || !matchItems) return;
    let swapped = 0;
    const dbKeys: string[] = [];
    setCellEdits(prev => {
      const next = { ...prev };
      dispRows.forEach((row, ri) => {
        if (pageNums[ri] !== pn) return;
        if (permanentlyDeletedRawRows.has(ri) || hiddenRawRows.has(ri) || isRowDbDeleted(ri)) return;
        const dbPrice = matchItems[ri]?.matched?.masterPrice;
        if (dbPrice == null || !Number.isFinite(dbPrice) || dbPrice <= 0) return;
        const cur = parseNumber(next[ri]?.[priIdx] ?? row[priIdx]);
        if (cur <= 0) return;
        const diffRatio = Math.abs(cur - dbPrice) / Math.max(cur, 1);
        if (diffRatio > 0.5) {
          next[ri] = { ...(next[ri] ?? {}), [priIdx]: dbPrice };
          dbKeys.push(`${ri}-${priIdx}`);
          swapped++;
        }
      });
      return next;
    });
    if (dbKeys.length > 0) setDbFilledCells(prev => new Set([...prev, ...dbKeys]));
    console.log(`[verifyAndSwapPricesWithDB] page ${pn}: ${swapped} 행 · OCR vs DB 50%+ 차이 → DB 값으로 스왑`);
  }, [dispHeaders, matchItems, dispRows, pageNums, permanentlyDeletedRawRows, hiddenRawRows, isRowDbDeleted, setCellEdits, setDbFilledCells]);

  return { matchingPage, handleMatchPage, fillMissingPricesFromDB, verifyAndSwapPricesWithDB };
}
