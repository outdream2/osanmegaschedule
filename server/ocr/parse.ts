import { INVOICE_SCHEMA } from "./schema";

const OCR_RECIPIENTS: string[] = (process.env.OCR_RECIPIENT ?? "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

export function sanitizeOcrMeta(meta: any): any {
  if (!meta || !meta.supplier) return meta;
  const sup = String(meta.supplier).trim().toLowerCase();
  const isRecipient = OCR_RECIPIENTS.some(r => sup.includes(r));
  return isRecipient ? { ...meta, supplier: null } : meta;
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

export function fixAmounts(
  headers: string[],
  rows: (string | number | null)[][]
): (string | number | null)[][] {
  const qI = headers.indexOf("수량");
  const pI = headers.indexOf("단가");
  const aI = headers.indexOf("금액");
  if (qI < 0 || pI < 0 || aI < 0) return rows;

  return rows.map(row => {
    const q = safeParseNumber(row[qI]);
    const p = safeParseNumber(row[pI]);
    const a = safeParseNumber(row[aI]);

    // 금액 누락 시에만 수량×단가로 채움 (유효한 금액은 절대 덮어쓰지 않음)
    if (a == null && q != null && p != null && q > 0 && p > 0) {
      const r = [...row];
      r[aI] = Math.round(q * p);
      return r;
    }

    // 삼각 교차 검증: 세 값 모두 존재할 때 불일치 시 오독된 컬럼 역산 복원
    if (q != null && p != null && a != null && q > 0 && p > 0 && a > 0) {
      if (Math.abs(Math.round(q * p) - a) <= 1) return row; // 일치, 보정 불필요

      // 수량 역산: a / p → 정수이면 수량이 오독된 것
      const qRecov = a / p;
      const qRecovInt = Math.round(qRecov);
      if (qRecovInt > 0 && Math.abs(qRecovInt * p - a) <= 1 && Math.abs(qRecovInt - q) > 0.5) {
        const r = [...row];
        r[qI] = qRecovInt;
        return r;
      }

      // 단가 역산: a / q → 정수이면 단가가 오독된 것
      const pRecov = a / q;
      const pRecovInt = Math.round(pRecov);
      if (pRecovInt > 0 && Math.abs(pRecovInt * q - a) <= 1 && Math.abs(pRecovInt - p) > 0.5) {
        const r = [...row];
        r[pI] = pRecovInt;
        return r;
      }

      // 판별 불가(두 개 이상 오독 추정) → 금액 건드리지 않고 원본 반환
    }

    return row;
  });
}
