import { fallbackParseRowsFromRawText } from "../../parse";
import type { Cell, Row, Stage } from "../types";

// Stage 10: rawText 폴백 파서 (2026-07-14 v5: 항상 실행 + 병합)
//   기존: rows≤1 일 때만 실행
//   신규: 항상 실행 → 놓친 상품 발견 시 기존 결과에 추가 병합
//         이미 있는 상품(품명 유사)은 스킵 · 새 상품만 추가
export const fallbackStage: Stage = {
  name: "fallback-parse",
  when: (ctx) => !!ctx.rawText && ctx.rawText.length > 30,
  run(ctx) {
    let rows = ctx.rows;
    let headers = ctx.headers;
    const fallback = fallbackParseRowsFromRawText(ctx.rawText);
    if (fallback.rows.length === 0) return {};

    // 중복 판정 v3 (2026-07-14): 품명 정규화 + 한글 3-gram 셋 교집합 검사
    //   → 어순/규격/접두어(공급사명) 다를때도 핵심 한글 어휘 겹치면 중복 처리
    const nameIdx = headers.indexOf("품명");
    const norm = (s: Cell | string) => String(s ?? "").replace(/[\s()\[\]{}·・.,+\-*/]/g, "").toLowerCase();
    const koreanNgrams = (s: Cell | string, n = 3): Set<string> => {
      const chars = (String(s ?? "").match(/[가-힣]/g) ?? []).join("");
      const set = new Set<string>();
      for (let i = 0; i + n <= chars.length; i++) set.add(chars.slice(i, i + n));
      return set;
    };
    const jaccard = (a: Set<string>, b: Set<string>): number => {
      if (a.size === 0 || b.size === 0) return 0;
      let inter = 0;
      for (const x of a) if (b.has(x)) inter++;
      const union = a.size + b.size - inter;
      return union === 0 ? 0 : inter / union;
    };
    const existingNorms = rows.map(r => {
      if (!Array.isArray(r) || nameIdx < 0) return "";
      return norm(r[nameIdx]);
    }).filter(Boolean);
    const existingNgrams: Set<string>[] = rows.map(r => {
      if (!Array.isArray(r) || nameIdx < 0) return new Set<string>();
      return koreanNgrams(r[nameIdx]);
    });

    // fallback headers → 현재 headers 로 remap 하는 헬퍼
    const fallbackHeaders = fallback.headers;
    const remap = (fr: Row): Row =>
      (headers.length > 0 ? headers : fallbackHeaders).map(h => {
        const idx = fallbackHeaders.indexOf(h);
        return idx >= 0 ? fr[idx] : null;
      });

    // 새로 추가할 행만 필터
    const newRows: Row[] = [];
    for (const fr of fallback.rows) {
      const nm = norm(fr[0]);
      const grams = koreanNgrams(fr[0]);
      if (!nm) continue;
      const isDupBySubstr = existingNorms.some(en => en.length >= 3 && (en.includes(nm) || nm.includes(en)));
      // 한글 3-gram Jaccard >= 0.4 이면 같은 상품 (어순 · 공급사 접두어 · 규격 위치 다름 허용)
      const isDupByJaccard = grams.size >= 2 && existingNgrams.some(eg => jaccard(grams, eg) >= 0.4);
      if (isDupBySubstr || isDupByJaccard) continue;
      newRows.push(fr);
      existingNorms.push(nm);
      existingNgrams.push(grams);
    }
    if (newRows.length === 0) return {};

    console.log(`[fallback-parse] page ${ctx.page}: rows ${rows.length}개 → rawText 에서 ${newRows.length}행 추가 (병합 모드)`);
    newRows.forEach(r => console.log(`   + ${JSON.stringify(r)}`));

    // rows.length === 0 이면 fallback headers 로 시작
    if (rows.length === 0 && fallbackHeaders.length > 0) {
      headers = fallbackHeaders;
    }
    const remapped = newRows.map(remap);
    rows = [...rows, ...remapped];
    return { headers, rows };
  },
};
