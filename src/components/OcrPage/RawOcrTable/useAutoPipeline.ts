// useAutoPipeline.ts
// 2026-07-28 · 분리: 컬럼별 자동정리 파이프라인 훅
//   runColumnPipeline + 자동실행 useEffect
//   원본 로직: RawOcrTable.tsx line ~3060~3143

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { RawPage } from "./types";

interface UseAutoPipelineParams {
  structuredPages: RawPage[];
  pageNums: number[];
  confirmedPages: Set<number>;
  cellEdits: Record<number, Record<number, string | number | null>>;
  autoSynonymMatches: Record<number, { code: string; name: string }>;
  handleMatchPage: (pn: number) => Promise<void>;
  fillMissingPricesFromDB: (pn: number) => Promise<void>;
  verifyAndSwapPricesWithDB: (pn: number) => void;
  matchRawToPurchaseHistory: (pn: number) => Promise<void>;
  setConfirmedPages: Dispatch<SetStateAction<Set<number>>>;
  setCellEdits: Dispatch<SetStateAction<Record<number, Record<number, string | number | null>>>>;
  setAutoSynonymMatches: Dispatch<SetStateAction<Record<number, { code: string; name: string }>>>;
  setSaveConfirmedToast: Dispatch<SetStateAction<{ type: "success" | "error"; msg: string } | null>>;
}

export function useAutoPipeline({
  structuredPages,
  pageNums,
  confirmedPages,
  cellEdits,
  autoSynonymMatches,
  handleMatchPage,
  fillMissingPricesFromDB,
  verifyAndSwapPricesWithDB,
  matchRawToPurchaseHistory,
  setConfirmedPages,
  setCellEdits,
  setAutoSynonymMatches,
  setSaveConfirmedToast,
}: UseAutoPipelineParams) {

  const [runningPipeline, setRunningPipeline] = useState<Record<number, boolean>>({});

  // 2026-07-22 · 컬럼별 자동정리 파이프라인 (매칭·DB 조회 전담)
  //   1. 공급사·상품명 매칭 (handleMatchPage)
  //   2. 빈 단가 DB 조회 (fillMissingPricesFromDB)
  //   3. OCR vs DB 큰 차이 스왑 (verifyAndSwapPricesWithDB)
  //   4. 매입이력 기반 raw 데이터 매칭 (matchRawToPurchaseHistory)
  //   금액 = Q*P (자동)
  const runColumnPipeline = useCallback(async (pn: number) => {
    if (runningPipeline[pn]) return;
    setRunningPipeline(prev => ({ ...prev, [pn]: true }));
    console.log(`\n╔══ [column-pipeline] page ${pn} 시작 ══`);
    // 2026-07-28 · 사용자 요청 "자동정리 안하는 것 같음" · 시작·완료 토스트 표시
    setSaveConfirmedToast({ type: "success", msg: `⏳ ${pn}번 명세서 자동정리 중...` });
    // 이전 상태 snapshot (변경 여부 판단용)
    const beforeCellEditsCount = Object.values(cellEdits).reduce((s, r) => s + Object.keys(r ?? {}).length, 0);
    const beforeMatchCount = Object.keys(autoSynonymMatches).length;
    try {
      console.log(`║ 1단계: 상품명 매칭 (동의어사전 포함)`);
      await handleMatchPage(pn);
      setConfirmedPages(prev => { const n = new Set(prev); n.delete(pn); return n; });
      console.log(`║ 2단계: 빈 단가 DB 조회`);
      await fillMissingPricesFromDB(pn);
      console.log(`║ 3단계: OCR vs DB 큰 차이 스왑`);
      verifyAndSwapPricesWithDB(pn);
      console.log(`║ 4단계: 매입이력 기반 raw 데이터 매칭 (수량·단가)`);
      await matchRawToPurchaseHistory(pn);
      console.log(`╚══ [column-pipeline] page ${pn} 완료\n`);
      // 변경 개수 계산 · 토스트 갱신
      setTimeout(() => {
        setCellEdits((latestCellEdits: Record<number, Record<number, string | number | null>>) => {
          setAutoSynonymMatches((latestMatches: Record<number, { code: string; name: string }>) => {
            const afterCellEditsCount = Object.values(latestCellEdits).reduce((s: number, r) => s + Object.keys(r ?? {}).length, 0);
            const afterMatchCount = Object.keys(latestMatches).length;
            const cellDelta = afterCellEditsCount - beforeCellEditsCount;
            const matchDelta = afterMatchCount - beforeMatchCount;
            const changed = cellDelta + matchDelta;
            const msg = changed > 0
              ? `✅ ${pn}번 자동정리 완료 · 매칭 +${matchDelta}건 · 셀 +${cellDelta}건`
              : `ℹ️ ${pn}번 자동정리 완료 · 변경 없음 (이미 매칭됨)`;
            setSaveConfirmedToast({ type: "success", msg });
            setTimeout(() => setSaveConfirmedToast(null), 3000);
            return latestMatches;
          });
          return latestCellEdits;
        });
      }, 100);
    } catch (e: any) {
      console.error(`[column-pipeline] page ${pn} 예외:`, e?.message);
      setSaveConfirmedToast({ type: "error", msg: `❌ 자동정리 실패: ${e?.message ?? "알 수 없는 오류"}` });
      setTimeout(() => setSaveConfirmedToast(null), 4000);
    } finally {
      setRunningPipeline(prev => ({ ...prev, [pn]: false }));
    }
  }, [runningPipeline, handleMatchPage, fillMissingPricesFromDB, verifyAndSwapPricesWithDB, matchRawToPurchaseHistory, cellEdits, autoSynonymMatches, setConfirmedPages, setCellEdits, setAutoSynonymMatches, setSaveConfirmedToast]);

  // 2026-07-28 · 사용자 요청 "자동정리를 각 페이지 로딩 후 자동 적용"
  //   SSE 로 새 페이지 도착 → useEffect 감지 → 자동 파이프라인 1회 실행
  //   guard · autoPipelineRanRef (페이지 당 1회) · confirmedPages (사용자 확정 시 skip)
  const autoPipelineRanRef = useRef<Set<number>>(new Set());
  const runColumnPipelineRef = useRef(runColumnPipeline);
  useEffect(() => { runColumnPipelineRef.current = runColumnPipeline; }, [runColumnPipeline]);
  useEffect(() => {
    if (structuredPages.length === 0) {
      autoPipelineRanRef.current = new Set();
      return;
    }
    const toRun: number[] = [];
    for (const p of structuredPages) {
      if (autoPipelineRanRef.current.has(p.page)) continue;
      if (confirmedPages.has(p.page)) continue;
      const hasRows = pageNums.some(pn => pn === p.page);
      if (!hasRows) continue;
      autoPipelineRanRef.current.add(p.page);
      toRun.push(p.page);
    }
    if (toRun.length === 0) return;
    console.log(`[auto-pipeline] 자동 실행 대기 ${toRun.length}개 페이지 · pn:`, toRun);
    (async () => {
      for (const pn of toRun) {
        await runColumnPipelineRef.current(pn);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuredPages, confirmedPages, pageNums]);

  return { runningPipeline, runColumnPipeline };
}
