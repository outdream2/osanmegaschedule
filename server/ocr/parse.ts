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

  if (specI < 0) {
    outHeaders = [...headers.slice(0, nameI + 1), "규격", ...headers.slice(nameI + 1)];
    specI = nameI + 1;
  }

  const outRows = rows.map(row => {
    const nameCellRaw = row[nameI];
    if (typeof nameCellRaw !== "string" || !nameCellRaw.trim()) return row;

    const existing = row[specI];
    if (existing != null && String(existing).trim()) return row;

    const { name, spec } = parseSpecFromName(nameCellRaw);
    if (!spec) return row;

    const r = [...row];
    if (r.length < outHeaders.length) r.splice(specI, 0, null);
    r[nameI] = name;
    r[specI] = spec;
    return r;
  });

  return { headers: outHeaders, rows: outRows };
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
    const q = typeof row[qI] === "number" ? row[qI] as number : null;
    const p = typeof row[pI] === "number" ? row[pI] as number : null;
    const a = typeof row[aI] === "number" ? row[aI] as number : null;
    if (q != null && p != null && a == null) {
      const r = [...row]; r[aI] = q * p; return r;
    }
    return row;
  });
}
