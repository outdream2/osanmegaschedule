import { parseNumber } from "./utils";
import type { RawPage } from "./types";

/**
 * 페이지별 잔고/합계/총합 후보 감지 (요약 라벨 자동 추출)
 *
 * 알고리즘:
 *   1) 요약 라벨(합·계·잔·총·미·공·부·매·입·급 등) 있는 행에서 라벨+금액 추출
 *   2) meta.total / meta.summary_rows 반영
 *   3) 헤더가 잔고 관련이면 해당 컬럼 마지막 유효값
 *   4) 라벨 셀 주변(같은 행 뒷셀·아래 행 같은 셀) 스캔
 *
 * @returns pageBalanceCandidates + pageBalanceCandidatesForFormula (formula 계산용)
 */
export function computePageBalanceCandidates(
  structuredPages: RawPage[],
  uniquePageNums: number[],
  balanceConfig: Record<string, string> | undefined,
): {
  pageBalanceCandidates: Map<number, { label: string; amount: number }[]>;
  pageBalanceCandidatesForFormula: Map<number, Map<string, number>>;
} {
  const normalizeLabelStr = (s: string): string => s.replace(/[\s.·:/\\-]+/g, "");
  const SUMMARY_CHAR = /[합계잔총미공부매입급액]/;
  const isSummaryLabel = (s: string): boolean => {
    if (!s) return false;
    const norm = normalizeLabelStr(s);
    if (!/[가-힣]/.test(norm)) return false;
    if (norm.length > 10) return false;
    if (!SUMMARY_CHAR.test(norm)) return false;
    return true;
  };
  const learnedLabels: Set<string> = new Set(
    Object.values(balanceConfig ?? {})
      .filter(v => typeof v === "string" && v.trim() && v !== "(없음)" && v !== "직접입력")
      .map(v => normalizeLabelStr(String(v))),
  );
  const findKeyword = (s: string): string | null => {
    const norm = normalizeLabelStr(s);
    if (!norm) return null;
    for (const lk of learnedLabels) if (lk && norm.includes(lk)) return lk;
    if (isSummaryLabel(s)) return norm;
    return null;
  };

  const pageBalanceCandidates = new Map<number, { label: string; amount: number }[]>();
  const pageBalanceCandidatesForFormula = new Map<number, Map<string, number>>();

  for (const pn of uniquePageNums) {
    const pageData = structuredPages.find(p => p.page === pn);
    if (!pageData) continue;
    const seen = new Set<number>();
    const result: { label: string; amount: number }[] = [];

    const pushCand = (label: string, amount: number) => {
      if (amount <= 0 || seen.has(amount)) return;
      seen.add(amount);
      result.push({ label, amount });
    };

    const NUM_RE = /(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;
    for (const row of pageData.rows) {
      if (!Array.isArray(row)) continue;
      const isSummaryRow = row.some(cell => cell != null && findKeyword(String(cell)) != null);
      if (!isSummaryRow) continue;
      let rowLabel = "";
      const rowNums: number[] = [];
      for (const cell of row) {
        if (cell == null) continue;
        if (typeof cell === "string") {
          const kwInCell = findKeyword(cell);
          const matches = Array.from(cell.matchAll(NUM_RE));
          if (kwInCell && matches.length > 0) {
            for (const m of matches) {
              const n = parseFloat(m[0].replace(/,/g, ""));
              if (n > 0) pushCand(kwInCell, n);
            }
          }
          if (kwInCell && cell.length <= 25) rowLabel = kwInCell;
          for (const m of matches) {
            const n = parseFloat(m[0].replace(/,/g, ""));
            if (n > 0) rowNums.push(n);
          }
        } else if (typeof cell === "number") {
          if (cell > 0) rowNums.push(cell);
        }
      }
      for (const n of rowNums) pushCand(rowLabel || "합계", n);
    }

    if (pageData.meta?.total && pageData.meta.total > 0) pushCand("총합계", pageData.meta.total);

    if (Array.isArray(pageData.meta?.summary_rows)) {
      for (const sr of pageData.meta!.summary_rows!) {
        if (sr && typeof sr.amount === "number" && sr.amount > 0) {
          const lbl = String(sr.label ?? "").trim() || "요약";
          if (lbl) pushCand(lbl, sr.amount);
        }
      }
    }

    if (Array.isArray(pageData.headers)) {
      for (let ci = 0; ci < pageData.headers.length; ci++) {
        const kw = findKeyword(String(pageData.headers[ci] ?? ""));
        if (!kw) continue;
        let lastVal: number | null = null;
        for (const row of pageData.rows) {
          if (!Array.isArray(row)) continue;
          const v = row[ci];
          if (v == null) continue;
          const n = typeof v === "number" ? v : parseNumber(v);
          if (n > 0) lastVal = n;
        }
        if (lastVal != null) pushCand(kw, lastVal);
      }
    }

    for (let ri = 0; ri < pageData.rows.length; ri++) {
      const row = pageData.rows[ri];
      if (!Array.isArray(row)) continue;
      for (let ci = 0; ci < row.length; ci++) {
        const cell = row[ci];
        if (typeof cell !== "string") continue;
        const kw = findKeyword(cell);
        if (!kw || cell.length > 20) continue;
        for (let cj = ci + 1; cj < row.length; cj++) {
          const v = row[cj];
          if (v == null) continue;
          const n = typeof v === "number" ? v : parseNumber(v);
          if (n > 0) { pushCand(kw, n); break; }
        }
        const belowRow = pageData.rows[ri + 1];
        if (Array.isArray(belowRow)) {
          const v = belowRow[ci];
          if (v != null) {
            const n = typeof v === "number" ? v : parseNumber(v);
            if (n > 0) pushCand(kw, n);
          }
        }
      }
    }

    if (result.length > 0) pageBalanceCandidates.set(pn, result);
    const labelMap = new Map<string, number>();
    for (const c of result) { if (!labelMap.has(c.label)) labelMap.set(c.label, c.amount); }
    pageBalanceCandidatesForFormula.set(pn, labelMap);

    // 2026-07-21: opt-in 방식으로 변경 · 기본 off (매 렌더마다 콘솔 스팸 방지)
    //   진단 필요 시 브라우저 콘솔에서 `window.__OCR_BAL_DEBUG = true` 실행
    if (typeof window !== "undefined" && (window as unknown as { __OCR_BAL_DEBUG?: boolean }).__OCR_BAL_DEBUG === true) {
      /* eslint-disable no-console */
      console.groupCollapsed(`[잔고진단] page ${pn} (공급사="${pageData.meta?.supplier ?? ""}") → 후보 ${result.length}건`);
      console.log("headers:", pageData.headers);
      console.log("meta:", pageData.meta);
      const scan: Array<{ where: string; label: string }> = [];
      (pageData.headers ?? []).forEach((h, hi) => {
        const kw = findKeyword(String(h ?? ""));
        if (kw) scan.push({ where: `헤더[${hi}]`, label: `${h} → ${kw}` });
      });
      (pageData.rows ?? []).forEach((r, ri) => {
        if (!Array.isArray(r)) return;
        r.forEach((c, ci) => {
          if (typeof c !== "string") return;
          const kw = findKeyword(c);
          if (kw) scan.push({ where: `행[${ri}][${ci}]`, label: `"${c}" → ${kw}` });
        });
      });
      console.log("잔고 키워드 스캔:", scan);
      console.log("최종 후보:", result);
      console.groupEnd();
      /* eslint-enable no-console */
    }
  }

  return { pageBalanceCandidates, pageBalanceCandidatesForFormula };
}

/**
 * balanceConfig 지정 컬럼의 마지막 유효값 = 페이지별 잔고
 * (supplier → 라벨 매핑을 통해 헤더 컬럼 lookup)
 */
export function computePageBalanceFromConfig(
  structuredPages: RawPage[],
  uniquePageNums: number[],
  rawSupplierByPage: Record<number, string>,
  balanceConfig: Record<string, string>,
): Map<number, number> {
  const pageBalanceFromConfig = new Map<number, number>();
  for (const pn of uniquePageNums) {
    const pageData = structuredPages.find(p => p.page === pn);
    if (!pageData) continue;
    const pageSupplier = (rawSupplierByPage[pn] ?? pageData.meta.supplier ?? "").trim();
    const configuredLabel = pageSupplier ? balanceConfig[pageSupplier] : undefined;
    if (!configuredLabel || configuredLabel === "(없음)") continue;
    const colIdx = pageData.headers.indexOf(configuredLabel);
    if (colIdx < 0) continue;
    let lastVal: number | null = null;
    for (const row of pageData.rows) {
      if (!Array.isArray(row)) continue;
      const v = row[colIdx];
      if (v != null) {
        const n = typeof v === "number" ? v : parseNumber(v);
        if (n > 0) lastVal = n;
      }
    }
    if (lastVal != null) pageBalanceFromConfig.set(pn, lastVal);
  }
  return pageBalanceFromConfig;
}
