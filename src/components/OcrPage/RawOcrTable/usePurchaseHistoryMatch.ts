// usePurchaseHistoryMatch.ts
// 2026-07-28 · 분리: matchRawToPurchaseHistory 훅
//   매입이력 DB 기반 · raw data 최근 매입 유사값 매칭 (수량·단가 자동 채움)
//   원본 로직: RawOcrTable.tsx line ~2789~2873

import { useCallback } from "react";
import { TIMING } from "../../../constants/timing";
import type { Dispatch, SetStateAction } from "react";
import type { MatchedItem } from "./types";
// 2026-08-21 · Framework Phase 3 · fetch → apiClient
import { api } from "../../../lib/apiClient";

interface UsePurchaseHistoryMatchParams {
  dispHeaders: string[];
  dispRows: (string | number | null)[][];
  pageNums: number[];
  matchItems: MatchedItem[] | null;
  permanentlyDeletedRawRows: Set<number>;
  hiddenRawRows: Set<number>;
  isRowDbDeleted: (ri: number) => boolean;
  setCellEdits: Dispatch<SetStateAction<Record<number, Record<number, string | number | null>>>>;
  setDbFilledCells: Dispatch<SetStateAction<Set<string>>>;
  setSaveConfirmedToast: Dispatch<SetStateAction<{ type: "success" | "error"; msg: string } | null>>;
}

export function usePurchaseHistoryMatch({
  dispHeaders,
  dispRows,
  pageNums,
  matchItems,
  permanentlyDeletedRawRows,
  hiddenRawRows,
  isRowDbDeleted,
  setCellEdits,
  setDbFilledCells,
  setSaveConfirmedToast,
}: UsePurchaseHistoryMatchParams) {

  // 2026-07-28 · 사용자 요청 "매입 이력 DB 기반 · raw data 최근 매입 유사값 매칭"
  //   흐름 · 상품명 확정된 행 (matched.code 있음) → 서버 매입이력 API 조회 →
  //          raw dispRow 셀 숫자 후보들 중 · 예상 수량·단가와 가장 가까운 값 선택 → cellEdits
  //   임계 · 수량 ±50% · 단가 ±30% · 이내 후보 중 가장 근접
  //   방어 · 사용자가 이미 편집한 셀 (cellEdits) 은 건드리지 않음
  const matchRawToPurchaseHistory = useCallback(async (pn: number) => {
    const qtyIdx = dispHeaders.indexOf("수량");
    const priIdx = dispHeaders.indexOf("단가");
    if (qtyIdx < 0 || priIdx < 0 || !matchItems) return;
    // 이 페이지 · matched.code 있는 행 수집
    const targets: { ri: number; code: string; rawCells: (string | number | null)[] }[] = [];
    dispRows.forEach((row, ri) => {
      if (pageNums[ri] !== pn) return;
      if (permanentlyDeletedRawRows.has(ri) || hiddenRawRows.has(ri) || isRowDbDeleted(ri)) return;
      const code = matchItems[ri]?.matched?.code;
      if (!code) return;
      targets.push({ ri, code: String(code), rawCells: row });
    });
    if (targets.length === 0) return;
    const codes = [...new Set(targets.map(t => t.code))];
    try {
      // 2026-08-21 · Framework Phase 3 · fetch → apiClient
      const { data } = await api.get<{ history?: Record<string, any> }>(`/api/products/purchase-history?codes=${encodeURIComponent(codes.join(","))}&limit=5`);
      const history: Record<string, any> = data.history ?? {};
      // raw 숫자 후보 추출 · 셀 내부 공백 분리 · 사업자·전화·년도 배제
      const extractCandidates = (cells: (string | number | null)[]): number[] => {
        const tokens: string[] = [];
        for (const c of cells) {
          if (c == null) continue;
          const s = String(c).trim();
          if (!s) continue;
          s.split(/[\s,]+/).forEach(t => { if (t) tokens.push(t); });
        }
        const nums: number[] = [];
        for (const t of tokens) {
          const cleaned = t.replace(/[^\d.-]/g, "");
          if (!cleaned || cleaned.length >= 10) continue;  // 사업자번호·전화 배제
          if (/^20[2-4]\d/.test(cleaned) && cleaned.length <= 8) continue;  // 년도 배제
          const n = parseFloat(cleaned);
          if (Number.isFinite(n) && n > 0) nums.push(n);
        }
        return nums;
      };
      const findNearest = (candidates: number[], expected: number, tolerance: number): number | null => {
        if (expected <= 0 || candidates.length === 0) return null;
        const within = candidates.filter(c => Math.abs(c - expected) / expected <= tolerance);
        if (within.length === 0) return null;
        return within.reduce((best, c) => Math.abs(c - expected) < Math.abs(best - expected) ? c : best, within[0]);
      };
      let matchedQty = 0, matchedPri = 0;
      const dbKeys: string[] = [];
      setCellEdits(prev => {
        const next = { ...prev };
        for (const t of targets) {
          const h = history[t.code];
          if (!h || h.count === 0) continue;
          const expectedQty = h.latest_qty ?? h.avg_qty;
          const expectedPri = h.latest_unit_price ?? h.avg_unit_price;
          const rawCands = extractCandidates(t.rawCells);
          // 수량 · 사용자 편집 없고 · 현재 값 없거나 매우 다름 → 후보 채움
          if (expectedQty && (next[t.ri]?.[qtyIdx] === undefined)) {
            const nearest = findNearest(rawCands, expectedQty, 0.5);
            if (nearest != null) {
              next[t.ri] = { ...(next[t.ri] ?? {}), [qtyIdx]: nearest };
              dbKeys.push(`${t.ri}-${qtyIdx}`);
              matchedQty++;
            }
          }
          if (expectedPri && (next[t.ri]?.[priIdx] === undefined)) {
            const nearest = findNearest(rawCands, expectedPri, 0.3);
            if (nearest != null) {
              next[t.ri] = { ...(next[t.ri] ?? {}), [priIdx]: nearest };
              dbKeys.push(`${t.ri}-${priIdx}`);
              matchedPri++;
            }
          }
        }
        return next;
      });
      if (dbKeys.length > 0) setDbFilledCells(prev => new Set([...prev, ...dbKeys]));
      console.log(`[matchRawToPurchaseHistory] page ${pn}: ${targets.length}행 대상 · 수량 매칭 ${matchedQty} · 단가 매칭 ${matchedPri}`);
      if (matchedQty + matchedPri > 0) {
        setSaveConfirmedToast({ type: "success", msg: `📚 매입이력 매칭 · ${pn}번 · 수량 ${matchedQty}건 · 단가 ${matchedPri}건 자동 채움` });
        setTimeout(() => setSaveConfirmedToast(null), TIMING.TOAST_MEDIUM);
      }
    } catch (e: any) {
      console.warn(`[matchRawToPurchaseHistory] page ${pn}: 실패`, e?.message);
    }
  }, [dispHeaders, matchItems, dispRows, pageNums, permanentlyDeletedRawRows, hiddenRawRows, isRowDbDeleted, setCellEdits, setDbFilledCells, setSaveConfirmedToast]);

  return { matchRawToPurchaseHistory };
}
