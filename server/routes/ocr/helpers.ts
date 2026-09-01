// ocr/helpers.ts — 캐시·템플릿·컬럼매핑·vendor매칭 공통 유틸
import { supabase } from "../../../src/supabase/client";
import { ocrConfig } from "../../config/ocrConfig";
import { getVendorNames } from "../../productCache";
import { SUPPLIER_EXTRACT_RE } from "../../ocr/invoice-vocab";
import { normSupplier, bigramSim } from "../../ocr/match";

// ── 세션 단위 rawText 캐시 ────────────────────────────────────────────────────
const _recentRawTextCache: { text: string; ts: number }[] = [];
const _RAW_CACHE_TTL_MS = 10 * 60 * 1000;
const _RAW_CACHE_MAX = ocrConfig.rawCacheMax;
const _RAW_CACHE_TEXT_CAP = ocrConfig.rawCacheTextCap;

export function pruneRawTextCache(): void {
  const now = Date.now();
  while (_recentRawTextCache.length > 0 && now - _recentRawTextCache[0].ts > _RAW_CACHE_TTL_MS) {
    _recentRawTextCache.shift();
  }
  while (_recentRawTextCache.length > _RAW_CACHE_MAX) _recentRawTextCache.shift();
}

export function addToRawCache(text: string): void {
  if (!text || text.length < 30) return;
  const trimmed = text.length > _RAW_CACHE_TEXT_CAP ? text.slice(0, _RAW_CACHE_TEXT_CAP) : text;
  _recentRawTextCache.push({ text: trimmed, ts: Date.now() });
  pruneRawTextCache();
}

export function getRawCacheTexts(): string[] {
  pruneRawTextCache();
  return _recentRawTextCache.map(c => c.text);
}

// ── 템플릿 헬퍼 ──────────────────────────────────────────────────────────────

export function buildTemplatePrompt(supplierName: string, headers: string[]): string {
  return `[공급처 템플릿 — 최우선 적용]\n이 명세서는 "${supplierName}" 공급처 양식입니다.\n표의 컬럼 순서를 정확히 다음과 같이 지정합니다:\n${headers.map((h, i) => `  ${i + 1}번 컬럼 → "${h}"`).join("\n")}\n이 매핑 외의 추론·재배열은 절대 하지 마세요.`;
}

function isGoodHeaderSet(headers: string[]): boolean {
  const stripped = headers.map(h => String(h ?? "").replace(/\s+/g, ""));
  const CORE = ["품명", "품목", "상품명", "수량", "단가", "금액", "공급가액", "규격", "세액"];
  const hits = CORE.filter(k => stripped.some(h => h.includes(k) || k.includes(h))).length;
  return hits >= 3;
}

export function cleanSupplierName(name: string): string {
  return name.replace(/\(주\)|\(株\)|주식회사|（주）|㈜/g, "").trim();
}

export async function upsertOcrTemplate(supplier: string | null | undefined, headers: string[]): Promise<void> {
  if (!supplier || !Array.isArray(headers) || !isGoodHeaderSet(headers)) return;
  const cleaned = cleanSupplierName(supplier);
  if (!cleaned) return;
  try {
    const existing = await supabase.from("ocr_templates")
      .select("column_mapping").eq("supplier_name", cleaned).limit(1).maybeSingle();
    if (existing.data?.column_mapping) return;
    await supabase.from("ocr_templates").upsert(
      { supplier_name: cleaned, headers, updated_at: new Date().toISOString() },
      { onConflict: "supplier_name" }
    );
    console.log(`[OCR/Template] 자동 저장/갱신: "${cleaned}" 헤더=${JSON.stringify(headers)}`);
  } catch (e: any) {
    console.warn("[OCR/Template] 자동 저장 실패 (무시):", e?.message);
  }
}

export async function findOcrTemplate(
  supplierHint: string | null | undefined,
  rawText?: string
): Promise<{ supplier: string; headers: string[]; column_mapping?: string[] } | null> {
  let hint = supplierHint;
  if (!hint && rawText) {
    const m = rawText.match(SUPPLIER_EXTRACT_RE);
    if (m) hint = m[1].trim().split(/\s{2,}/)[0];
  }
  if (!hint) return null;
  try {
    const cleaned = cleanSupplierName(hint);
    if (!cleaned) return null;
    const { data } = await supabase.from("ocr_templates")
      .select("supplier_name, headers, column_mapping").ilike("supplier_name", `%${cleaned}%`).limit(1);
    if (data?.[0]?.headers) {
      return {
        supplier: data[0].supplier_name,
        headers: data[0].headers,
        column_mapping: Array.isArray(data[0].column_mapping) ? data[0].column_mapping : undefined,
      };
    }
    return null;
  } catch { return null; }
}

export function applyTemplateHeaders(detected: string[], template: string[]): string[] {
  if (detected.length === template.length) return [...template];
  if (detected.length === template.length + 1) return [...template, detected[detected.length - 1]];
  return detected;
}

export function applyColumnMapping(
  detectedHeaders: string[],
  rows: (string | number | null)[][],
  columnMapping: string[],
): { headers: string[]; rows: (string | number | null)[][] } {
  const NUM_FIELDS = new Set(["수량", "단가", "금액", "세액"]);
  const SPLIT_DELIM = "|";

  const expandRow = (row: (string | number | null)[]): { field: string; value: (string | number | null) }[] => {
    const out: { field: string; value: (string | number | null) }[] = [];
    for (let ci = 0; ci < columnMapping.length; ci++) {
      const f = columnMapping[ci];
      if (!f || f === "제외") continue;
      const cellVal = ci < row.length ? row[ci] : null;
      if (f.includes(SPLIT_DELIM)) {
        const parts = f.split(SPLIT_DELIM).map(s => s.trim()).filter(Boolean);
        const chunks = cellVal == null ? [] : String(cellVal).trim().split(/\s+/);
        for (let pi = 0; pi < parts.length; pi++) {
          const partField = parts[pi];
          const partValRaw: string | null = chunks[pi] ?? null;
          if (NUM_FIELDS.has(partField) && partValRaw != null) {
            const n = parseFloat(String(partValRaw).replace(/[^0-9.-]/g, ""));
            out.push({ field: partField, value: Number.isFinite(n) ? n : partValRaw });
          } else {
            out.push({ field: partField, value: partValRaw });
          }
        }
      } else {
        out.push({ field: f, value: cellVal });
      }
    }
    return out;
  };

  const fieldOrder: string[] = [];
  const fieldSeen = new Set<string>();
  for (const f of columnMapping) {
    if (!f || f === "제외") continue;
    const parts = f.includes(SPLIT_DELIM) ? f.split(SPLIT_DELIM).map(s => s.trim()).filter(Boolean) : [f];
    for (const pf of parts) {
      if (!fieldSeen.has(pf)) { fieldSeen.add(pf); fieldOrder.push(pf); }
    }
  }
  if (fieldOrder.length === 0) return { headers: detectedHeaders, rows };

  const mergeCells = (values: (string | number | null)[], isNumField: boolean): string | number | null => {
    const nonNull = values.filter(v => v != null && v !== "");
    if (nonNull.length === 0) return null;
    if (nonNull.length === 1) return nonNull[0];
    if (isNumField) {
      let sum = 0, allNum = true;
      for (const v of nonNull) {
        const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ""));
        if (!Number.isFinite(n)) { allNum = false; break; }
        sum += n;
      }
      return allNum ? sum : nonNull[0];
    }
    return nonNull.map(v => String(v).trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  };

  const newRows = rows.map(r => {
    if (!Array.isArray(r)) return r;
    const pairs = expandRow(r);
    return fieldOrder.map(f => {
      const values = pairs.filter(p => p.field === f).map(p => p.value);
      return mergeCells(values, NUM_FIELDS.has(f));
    });
  });
  return { headers: fieldOrder, rows: newRows };
}

// ── Vendor 매칭 헬퍼 ─────────────────────────────────────────────────────────

const SUPPLIER_LABEL = /(?:공\s*급\s*자|공\s*급\s*하?\s*는?\s*자|공급업체|공급회사|판\s*매\s*자|판매업체|매출자)/;

export async function matchVendorSupplier(rawSupplier: string | null | undefined): Promise<string | null> {
  if (!rawSupplier || String(rawSupplier).trim().length < 2) return null;
  try {
    const vendors = await getVendorNames();
    if (vendors.length === 0) return null;
    const target = normSupplier(String(rawSupplier));
    if (!target) return null;
    let best: string | null = null;
    let bestScore = 0;
    for (const v of vendors) {
      const vn = normSupplier(v);
      if (!vn) continue;
      if (vn === target) return v;
      if (vn.includes(target) || target.includes(vn)) {
        const ratio = Math.min(vn.length, target.length) / Math.max(vn.length, target.length);
        const score = Math.round(80 + 15 * ratio);
        if (score > bestScore) { bestScore = score; best = v; }
        continue;
      }
      const score = bigramSim(vn, target);
      if (score > bestScore) { bestScore = score; best = v; }
    }
    return bestScore >= 60 ? best : null;
  } catch {
    return null;
  }
}

export async function findVendorInText(rawText: string | null | undefined): Promise<string | null> {
  if (!rawText || String(rawText).trim().length < 3) return null;
  try {
    const vendors = await getVendorNames();
    if (vendors.length === 0) return null;

    const header = rawText.slice(0, 350);
    const headerNorm = normSupplier(header);

    const headerFindLongest = (): string | null => {
      let best: string | null = null;
      let bestLen = 0;
      for (const v of vendors) {
        const vn = normSupplier(v);
        if (!vn || vn.length < 3) continue;
        if (headerNorm.includes(vn) && vn.length > bestLen) { bestLen = vn.length; best = v; }
      }
      return best;
    };

    const supplierMatch = rawText.match(SUPPLIER_LABEL);
    if (supplierMatch) {
      const pos = rawText.indexOf(supplierMatch[0]);
      const win = rawText.slice(pos, Math.min(rawText.length, pos + 100));
      const windowNorm = normSupplier(win);
      let best: string | null = null;
      let bestLen = 0;
      for (const v of vendors) {
        const vn = normSupplier(v);
        if (!vn || vn.length < 3) continue;
        if (windowNorm.includes(vn) && vn.length > bestLen) { bestLen = vn.length; best = v; }
      }
      if (best) {
        console.log(`[findVendorInText] page-header/공급자-label → "${best}"`);
        return best;
      }
    }

    const headerBest = headerFindLongest();
    if (headerBest) {
      console.log(`[findVendorInText] page-header 최장매칭 → "${headerBest}"`);
      return headerBest;
    }

    const textNorm = normSupplier(rawText);
    if (!textNorm) return null;
    let best: string | null = null;
    let bestLen = 0;
    for (const v of vendors) {
      const vn = normSupplier(v);
      if (!vn || vn.length < 3) continue;
      if (textNorm.includes(vn) && vn.length > bestLen) { bestLen = vn.length; best = v; }
    }
    if (best) console.log(`[findVendorInText] 전체 rawText 최장매칭 → "${best}"`);
    return best;
  } catch {
    return null;
  }
}
