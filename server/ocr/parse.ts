import { INVOICE_SCHEMA } from "./schema";

const OCR_RECIPIENTS: string[] = (process.env.OCR_RECIPIENT ?? "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

export function sanitizeOcrMeta(meta: any): any {
  if (!meta || !meta.supplier) return meta;
  const sup = String(meta.supplier).trim().toLowerCase();
  const isRecipient = OCR_RECIPIENTS.some(r => sup.includes(r));
  return isRecipient ? { ...meta, supplier: null } : meta;
}

export function cleanCellValues(
  headers: string[],
  rows: (string | number | null)[][]
): { headers: string[]; rows: (string | number | null)[][] } {
  const clean = (v: string | number | null): string | number | null => {
    if (typeof v !== "string") return v;
    return v.replace(/[\x00-\x1F\x7F]+/g, "").trim() || null;
  };
  return {
    headers: headers.map(h => h.replace(/[\x00-\x1F\x7F]+/g, "").trim()),
    rows: rows.filter(row => Array.isArray(row)).map(row => row.map(clean)),
  };
}

export function mergeAdjacentHeaders(
  headers: string[],
  rows: (string | number | null)[][]
): { headers: string[]; rows: (string | number | null)[][] } {
  const COMPOUNDS: [string, string, string][] = [
    ["품", "명", "품명"], ["품", "목", "품목"], ["상품", "명", "상품명"],
    ["수", "량", "수량"], ["단", "가", "단가"], ["금", "액", "금액"],
    ["세", "액", "세액"], ["규", "격", "규격"], ["단", "위", "단위"],
    ["비", "고", "비고"],
    ["발행", "일자", "발행일자"], ["전표", "일자", "전표일자"], ["월", "일", "월일"],
    ["거래", "일자", "거래일자"], ["발행", "일", "발행일"],
    ["총매출", "액", "총매출액"],
    ["유통", "기한", "유통기한"], ["소비", "기한", "소비기한"], ["유효", "기한", "유효기한"],
  ];
  const mergeAt = new Set<number>();
  const merged = [...headers];
  for (let i = 0; i < merged.length - 1; i++) {
    const a = merged[i].trim(), b = merged[i + 1].trim();
    for (const [p1, p2, result] of COMPOUNDS) {
      if (a === p1 && b === p2) { merged[i] = result; mergeAt.add(i + 1); break; }
    }
  }
  if (mergeAt.size === 0) return { headers, rows };
  const keep = headers.map((_, i) => i).filter(i => !mergeAt.has(i));
  const pairs = new Map<number, number>();
  for (const mi of mergeAt) pairs.set(mi - 1, mi);
  const outRows = rows.map(row => {
    const r = [...row];
    for (const [ai, bi] of pairs) {
      if (bi < row.length && row[bi] != null && String(row[bi]).trim()) {
        r[ai] = r[ai] != null ? `${String(r[ai])} ${String(row[bi])}`.trim() : row[bi];
      }
    }
    return keep.map(i => r[i]);
  });
  return { headers: keep.map(i => merged[i]), rows: outRows };
}

export function normalizeInvoiceCols(
  headers: string[],
  rows: (string | number | null)[][]
): { headers: string[]; rows: (string | number | null)[][] } {
  const mapping = INVOICE_SCHEMA
    .map(s => ({ std: s.name, oi: headers.findIndex(h => s.re.test(h.trim().replace(/\s+/g, ""))) }))
    .filter(m => m.oi >= 0);

  const usedIdx = new Set(mapping.map(m => m.oi));
  const extra = headers.map((h, i) => ({ h, i })).filter(({ i }) => !usedIdx.has(i));

  const outHeaders = [...mapping.map(m => m.std), ...extra.map(e => e.h)];
  const outRows    = rows.map(row => [
    ...mapping.map(m => row[m.oi]),
    ...extra.map(e => row[e.i]),
  ]);
  return { headers: outHeaders, rows: outRows };
}

const SPEC_UNIT_RE =
  /^(\d+(?:[./]\d+)*)\s*(mg|mcg|μg|ug|g|kg|ml|mL|L|IU|mEq|%|T|C|정|캡슐|포|개|EA|ea)(?:\s*[×xX]\s*\d+\s*(?:mm|cm|m)?)?$/i;

export function parseSpecFromName(raw: string): { name: string; spec: string | null } {
  const s = raw.trim();

  const bracketM = s.match(/^(.*?)\s*[(\[]([\d\w./×xX\s%μ]+)[)\]]\s*$/);
  if (bracketM) {
    const cand = bracketM[2].trim();
    if (SPEC_UNIT_RE.test(cand))
      return { name: bracketM[1].trim(), spec: cand };
  }

  const spaceM = s.match(/^(.+?)\s+(\d[\d./]*\s*(?:mg|mcg|μg|ug|g|kg|ml|mL|L|IU|mEq|%|T|C|정|캡슐|포|개|EA|ea)(?:\s*[×xX]\s*\d+\s*(?:mm|cm|m)?)?)$/i);
  if (spaceM) {
    const cand = spaceM[2].trim();
    if (SPEC_UNIT_RE.test(cand))
      return { name: spaceM[1].trim(), spec: cand };
  }

  const glueM = s.match(/^(.+?)(\d+(?:[./]\d+)?\s*(?:mg|mcg|μg|ug|g|kg|ml|mL|L|IU|mEq|%|T|C|정|캡슐|포|개|EA|ea))$/i);
  if (glueM && /\D$/.test(glueM[1])) {
    return { name: glueM[1].trim(), spec: glueM[2].trim() };
  }

  return { name: s, spec: null };
}

export function extractSpecFromName(
  headers: string[],
  rows: (string | number | null)[][]
): { headers: string[]; rows: (string | number | null)[][] } {
  const nameI = headers.indexOf("품명");
  if (nameI < 0) return { headers, rows };

  let specI = headers.indexOf("규격");
  let outHeaders = headers;
  const specWasAdded = specI < 0;

  if (specI < 0) {
    outHeaders = [...headers.slice(0, nameI + 1), "규격", ...headers.slice(nameI + 1)];
    specI = nameI + 1;
  }

  const outRows = rows.map(row => {
    const r = [...row];
    // 규격 컬럼이 새로 추가된 경우 모든 행에 null을 삽입해 컬럼 정렬 유지
    if (specWasAdded && r.length < outHeaders.length) {
      r.splice(specI, 0, null);
    }

    const nameCellRaw = r[nameI];
    if (typeof nameCellRaw !== "string" || !nameCellRaw.trim()) return r;

    const existing = r[specI];
    if (existing != null && String(existing).trim()) return r;

    const { name, spec } = parseSpecFromName(nameCellRaw);
    if (!spec) return r;

    r[nameI] = name;
    r[specI] = spec;
    return r;
  });

  return { headers: outHeaders, rows: outRows };
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr.slice()];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.filter((_, j) => j !== i);
    for (const p of permutations(rest)) result.push([arr[i], ...p]);
  }
  return result;
}

function safeParseNumber(val: any): number | null {
  if (val == null || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  const s = String(val).trim();
  const clean = s.replace(/[^0-9.,]/g, "");
  if (!clean) return null;
  // "15.000" → 15000 (OCR이 천 단위 쉼표를 마침표로 오독한 경우)
  if (/^\d{1,3}(\.\d{3})+$/.test(clean)) {
    return parseInt(clean.replace(/\./g, ""), 10);
  }
  const num = parseFloat(clean.replace(/,/g, ""));
  return isNaN(num) ? null : num;
}

/**
 * 컬럼 시프트 복원: 수량 × 단가 ≠ 금액인 행의 숫자 컬럼 값을 재배치합니다.
 *
 * 같은 이미지(페이지) 내에서 다른 행의 배치 패턴을 참고해 올바른 순서를 먼저 시도하고,
 * 그래도 실패하면 순열 탐색으로 수식이 맞는 배치를 찾아 반환합니다.
 */
export function repairColumnShift(
  headers: string[],
  rows: (string | number | null)[][]
): (string | number | null)[][] {
  const qI = headers.indexOf("수량");
  const pI = headers.indexOf("단가");
  const aI = headers.indexOf("금액");
  const tI = headers.indexOf("세액");
  if (qI < 0 || pI < 0 || aI < 0) return rows;

  const numCols = [qI, pI, aI, ...(tI >= 0 ? [tI] : [])];

  const mathOk = (row: (string | number | null)[]): boolean => {
    const q = safeParseNumber(row[qI]);
    const p = safeParseNumber(row[pI]);
    const a = safeParseNumber(row[aI]);
    if (q == null || p == null || a == null) return true;
    if (q <= 0 || p <= 0 || a <= 0) return true;
    const exp = Math.round(q * p);
    return Math.abs(exp - a) <= Math.max(1, exp * 0.01);
  };

  const numericVal = (row: (string | number | null)[], ci: number): number | null =>
    safeParseNumber(row[ci]);

  // 같은 이미지 내 유효 행들의 숫자 크기 순위 패턴 집계
  // (예: 금액이 가장 크고 단가가 그다음, 수량이 가장 작은 경우 → 순위=[2,1,0,...])
  const patternCounts = new Map<string, number>();
  for (const row of rows) {
    if (!mathOk(row)) continue;
    const vals = numCols.map(ci => numericVal(row, ci));
    const nonNull = vals.filter(v => v !== null) as number[];
    if (nonNull.length < 3) continue;
    const sorted = [...nonNull].sort((a, b) => b - a);
    const pattern = vals.map(v => (v === null ? -1 : sorted.indexOf(v))).join(",");
    patternCounts.set(pattern, (patternCounts.get(pattern) ?? 0) + 1);
  }
  const bestPattern: number[] | null =
    patternCounts.size > 0
      ? [...patternCounts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number)
      : null;

  return rows.map(row => {
    if (mathOk(row)) return row;

    const vals = numCols.map(ci => numericVal(row, ci));
    const nonNull = vals.filter(v => v !== null) as number[];
    if (nonNull.length < 3) return row;

    // 1순위: 같은 이미지의 다른 유효 행 패턴으로 재배치
    if (bestPattern && bestPattern.length === numCols.length) {
      const sortedDesc = [...nonNull].sort((a, b) => b - a);
      const testRow = [...row];
      numCols.forEach((ci, j) => {
        if (bestPattern![j] >= 0 && bestPattern![j] < sortedDesc.length)
          testRow[ci] = sortedDesc[bestPattern![j]];
      });
      if (mathOk(testRow)) return testRow;
    }

    // 2순위: 순열 탐색 (최대 4개 숫자 = 최대 24가지)
    for (const perm of permutations(nonNull.slice(0, numCols.length))) {
      const testRow = [...row];
      numCols.slice(0, perm.length).forEach((ci, j) => { testRow[ci] = perm[j]; });
      if (mathOk(testRow)) return testRow;
    }

    return row;
  });
}

/**
 * 합계금액 기반 보정 (1순위 보정 수단):
 * 명세서 합계(statedTotal)를 절대 기준으로 삼아 행 금액을 보정합니다.
 * 전략 순서: ① 수량×단가 역산 ② 단일 행 자릿수 ③ 두 행 조합 자릿수
 */
export function fixAmountsBySubtotal(
  headers: string[],
  rows: (string | number | null)[][],
  statedTotal: number | null
): (string | number | null)[][] {
  if (statedTotal == null || statedTotal <= 0) return rows;

  const qI = headers.indexOf("수량");
  const pI = headers.indexOf("단가");
  const aI = headers.indexOf("금액");
  if (aI < 0) return rows;

  const getAmt = (row: (string | number | null)[]) =>
    typeof row[aI] === "number" ? (row[aI] as number) : 0;
  const sumRows = (r: (string | number | null)[][]) => r.reduce((s, row) => s + getAmt(row), 0);

  const currentTotal = sumRows(rows);
  if (Math.abs(currentTotal - statedTotal) <= 1) return rows;

  // 전략 1: 수량×단가로 금액 역산 (합계가 맞아지는 행만 교체)
  if (qI >= 0 && pI >= 0) {
    const candidate = rows.map(row => {
      const q = safeParseNumber(row[qI]);
      const p = safeParseNumber(row[pI]);
      const a = getAmt(row);
      if (q == null || p == null || q <= 0 || p <= 0) return row;
      const calc = Math.round(q * p);
      if (calc > 0 && Math.abs(calc - a) > Math.max(1, a * 0.01)) {
        const r = [...row]; r[aI] = calc; return r;
      }
      return row;
    });
    if (Math.abs(sumRows(candidate) - statedTotal) <= 1) return candidate;
  }

  // 전략 2: 단일 행 자릿수 오독 보정 (×10, ×100, ×1000, ÷10, ÷100, ÷1000)
  const scales = [10, 100, 1000, 0.1, 0.01, 0.001];
  for (let ri = 0; ri < rows.length; ri++) {
    const a = getAmt(rows[ri]);
    if (a <= 0) continue;
    for (const scale of scales) {
      const na = Math.round(a * scale);
      if (na <= 0) continue;
      if (Math.abs(currentTotal - a + na - statedTotal) <= 1) {
        const r = [...rows[ri]]; r[aI] = na;
        return [...rows.slice(0, ri), r, ...rows.slice(ri + 1)];
      }
    }
  }

  // 전략 3: 두 행 조합 자릿수 보정
  const scales2 = [10, 100, 0.1, 0.01];
  for (let ri = 0; ri < rows.length; ri++) {
    const a1 = getAmt(rows[ri]);
    if (a1 <= 0) continue;
    for (const s1 of scales2) {
      const na1 = Math.round(a1 * s1);
      if (na1 <= 0) continue;
      const partial = currentTotal - a1 + na1;
      for (let rj = ri + 1; rj < rows.length; rj++) {
        const a2 = getAmt(rows[rj]);
        if (a2 <= 0) continue;
        for (const s2 of scales2) {
          const na2 = Math.round(a2 * s2);
          if (na2 <= 0) continue;
          if (Math.abs(partial - a2 + na2 - statedTotal) <= 1) {
            const r1 = [...rows[ri]]; r1[aI] = na1;
            const r2 = [...rows[rj]]; r2[aI] = na2;
            return rows.map((row, i) => i === ri ? r1 : i === rj ? r2 : row);
          }
        }
      }
    }
  }

  return rows;
}

/**
 * 페이지 내 교차 검증 (intra-page cross-validation):
 * 같은 이미지 내에서 수량×단가=금액이 성립하는 "신뢰 행"들의 자릿수 분포를 기준으로
 * 나머지 행의 수치 이상 여부를 감지하고 자동 보정합니다.
 *
 * 거래명세서 한 장은 같은 공급사·같은 일자이므로 수량/단가/금액의 자릿수 범위가
 * 행마다 유사하다는 특성을 활용합니다.
 */
export function crossValidateIntraPage(
  headers: string[],
  rows: (string | number | null)[][]
): (string | number | null)[][] {
  const qI = headers.indexOf("수량");
  const pI = headers.indexOf("단가");
  const aI = headers.indexOf("금액");
  if (qI < 0 || pI < 0 || aI < 0) return rows;

  const pos = (row: (string | number | null)[], i: number): number | null => {
    const v = row[i];
    return typeof v === "number" && v > 0 ? v : null;
  };

  const mathOk = (q: number, p: number, a: number) => {
    const exp = Math.round(q * p);
    return Math.abs(exp - a) <= Math.max(1, exp * 0.01);
  };

  // 신뢰 행: 수량×단가=금액이 성립하는 행
  const trusted = rows.filter(row => {
    const q = pos(row, qI), p = pos(row, pI), a = pos(row, aI);
    return q != null && p != null && a != null && mathOk(q, p, a);
  });

  if (trusted.length < 2) return rows; // 기준 행 부족

  // 자릿수(order of magnitude) 계산
  const magOf = (v: number) => (v > 0 ? Math.floor(Math.log10(v)) : 0);

  // 최빈 자릿수 반환
  const magMode = (vals: number[]): number => {
    const cnt = new Map<number, number>();
    for (const v of vals) { const m = magOf(v); cnt.set(m, (cnt.get(m) ?? 0) + 1); }
    return [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  };

  const qMag = magMode(trusted.map(r => pos(r, qI)!));
  const pMag = magMode(trusted.map(r => pos(r, pI)!));
  const aMag = magMode(trusted.map(r => pos(r, aI)!));

  // 허용 자릿수 범위: 최빈값 ±1 자릿수
  const inRange = (v: number, mag: number) => Math.abs(magOf(v) - mag) <= 1;

  const scales = [10, 100, 0.1, 0.01];

  return rows.map(row => {
    const q = pos(row, qI), p = pos(row, pI), a = pos(row, aI);
    if (q == null || p == null || a == null) return row;
    if (mathOk(q, p, a)) return row; // 이미 유효

    const qBad = !inRange(q, qMag);
    const pBad = !inRange(p, pMag);
    const aBad = !inRange(a, aMag);

    // 전략 A: 자릿수 이상 컬럼만 스케일 보정 시도
    for (const [ci, bad, mag] of [
      [qI, qBad, qMag], [pI, pBad, pMag], [aI, aBad, aMag],
    ] as [number, boolean, number][]) {
      if (!bad) continue;
      const orig = row[ci] as number;
      for (const s of scales) {
        const nv = Math.round(orig * s);
        if (!inRange(nv, mag)) continue;
        const nq = ci === qI ? nv : q;
        const np = ci === pI ? nv : p;
        const na = ci === aI ? nv : a;
        if (nq > 0 && np > 0 && na > 0 && mathOk(nq, np, na)) {
          const r = [...row]; r[ci] = nv; return r;
        }
      }
    }

    // 전략 B: 자릿수는 정상이나 수식이 안 맞는 경우 → 각 컬럼 스케일 후 범위+수식 이중 검증
    if (!qBad && !pBad && !aBad) {
      for (const [ci, orig] of [[qI, q], [pI, p], [aI, a]] as [number, number][]) {
        for (const s of scales) {
          const nv = Math.round(orig * s);
          const nq = ci === qI ? nv : q;
          const np = ci === pI ? nv : p;
          const na = ci === aI ? nv : a;
          if (
            nq > 0 && np > 0 && na > 0 &&
            inRange(nq, qMag) && inRange(np, pMag) && inRange(na, aMag) &&
            mathOk(nq, np, na)
          ) {
            const r = [...row]; r[ci] = nv; return r;
          }
        }
      }
    }

    return row;
  });
}
