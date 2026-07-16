import { Router } from "express";
import { supabase } from "../../src/supabase/client";
import { getProductMap, getSynonymMap, resetSynonymCache, getSupplierAliasMap, resetSupplierAliasCache, getVendorNames } from "../productCache";
import { cleanCellValues, mergeAdjacentHeaders, normalizeInvoiceCols, extractSpecFromName, repairColumnShift, fixAmountsBySubtotal, crossValidateIntraPage, sanitizeOcrMeta, filterCodeOnlyRows, filterMetadataBleedRows, validateCellTypes, applyPositionalHints, detectSuspiciousEqualPriceAmount, mergeSplitProductRows, verifyRowsAgainstRawText, auditRowSumVsTotal, autoFillMissingMathField, inferMissingTotals, extractCommonMetadataLines, fixDateInAmountColumns, sanitizeBalanceContamination, fallbackParseRowsFromRawText, mergeAdjacentSplitRows } from "../ocr/parse";
import { buildOnnxPipeline, runPipeline, makeInitialContext } from "../ocr/pipeline";
import { callGeminiOcr, callMistralOcr, getGeminiKeys, getMistralKeys, geminiState, extractSupplierFromImage } from "../ocr/llm";
import { preprocessImageForOcr, preprocessForEasyOcr, rotateImage, preprocessHighContrast } from "../ocr/preprocess";
import { callPpuOcr } from "../ocr/ppuPaddle";
import { SUPPLIER_EXTRACT_RE } from "../ocr/invoice-vocab";
import { saveMatchDiagnostic, type RowMatchTrace, type MatchDiagnostic } from "../ocr/diagnostics";
import { invoiceMatchScore, makeMatchResult, norm, normSupplier, bigramSim } from "../ocr/match";
import type { GeminiResult } from "../ocr/schema";

// ── 세션 단위 rawText 캐시 (2026-07-10 v4c) ────────────────────────────────
// 사용자 통찰: "여러 명세서에 공통으로 나오는 정보 = 수신처 (공급받는쪽)"
// 사용자가 명세서를 한 장씩 업로드해도 (pages.length === 1) 최근 요청과 비교하여
// 공통 라인을 검출 → 필터 강화.
//
// 저장: rawText 스냅샷 배열 · TTL 10분 · 최대 20페이지
// 사용: 단일 페이지 요청 시 캐시의 다른 rawText 와 비교 → 공통 라인 추출
const _recentRawTextCache: { text: string; ts: number }[] = [];
const _RAW_CACHE_TTL_MS = 10 * 60 * 1000; // 10분
// LOW_MEM 모드에서는 5개로 · 각 rawText 도 4KB 캡 (요청 간 누적 방지)
const _LOW_MEM_CACHE = process.env.RENDER === "true" || process.env.LOW_MEM === "true";
const _RAW_CACHE_MAX = _LOW_MEM_CACHE ? 5 : 20;
const _RAW_CACHE_TEXT_CAP = _LOW_MEM_CACHE ? 4000 : Infinity;
function pruneRawTextCache() {
  const now = Date.now();
  while (_recentRawTextCache.length > 0 && now - _recentRawTextCache[0].ts > _RAW_CACHE_TTL_MS) {
    _recentRawTextCache.shift();
  }
  while (_recentRawTextCache.length > _RAW_CACHE_MAX) _recentRawTextCache.shift();
}
function addToRawCache(text: string) {
  if (!text || text.length < 30) return;
  const trimmed = text.length > _RAW_CACHE_TEXT_CAP ? text.slice(0, _RAW_CACHE_TEXT_CAP) : text;
  _recentRawTextCache.push({ text: trimmed, ts: Date.now() });
  pruneRawTextCache();
}
function getRawCacheTexts(): string[] {
  pruneRawTextCache();
  return _recentRawTextCache.map(c => c.text);
}

function buildTemplatePrompt(supplierName: string, headers: string[]): string {
  return `[공급처 템플릿 — 최우선 적용]\n이 명세서는 "${supplierName}" 공급처 양식입니다.\n표의 컬럼 순서를 정확히 다음과 같이 지정합니다:\n${headers.map((h, i) => `  ${i + 1}번 컬럼 → "${h}"`).join("\n")}\n이 매핑 외의 추론·재배열은 절대 하지 마세요.`;
}

// ── OCR 템플릿 자동 저장/조회 헬퍼 (2026-07-09 신설) ──────────────────────
//
// 아이디어:
//   Gemini 는 표 구조 인식 최상 → 성공 시 헤더 구조를 ocr_templates 에 자동 upsert
//   Local(EasyOCR)/AI(ONNX) 는 같은 공급사 명세서 처리 시 이 템플릿을 참조해 헤더 라벨 교정
//
// 이렇게 하면 공급사별 명세서 "형태"가 DB 에 축적됨 → 시간이 지날수록 Local/AI 정확도 상승

/** 헤더가 표준 컬럼(품명/수량/단가/금액 등) 3개 이상 포함하는지 검증 (오탐 저장 방지) */
function isGoodHeaderSet(headers: string[]): boolean {
  const stripped = headers.map(h => String(h ?? "").replace(/\s+/g, ""));
  const CORE = ["품명", "품목", "상품명", "수량", "단가", "금액", "공급가액", "규격", "세액"];
  const hits = CORE.filter(k => stripped.some(h => h.includes(k) || k.includes(h))).length;
  return hits >= 3;
}

/** 공급사 상호 정규화 (템플릿 키용) */
function cleanSupplierName(name: string): string {
  return name.replace(/\(주\)|\(株\)|주식회사|（주）|㈜/g, "").trim();
}

/** Gemini/ONNX 성공 시 헤더 구조를 ocr_templates 에 upsert (자동 학습)
 *  ⚠ 사용자가 명시적으로 저장한 column_mapping 은 절대 덮어쓰지 않음 (headers 만 업데이트)
 */
async function upsertOcrTemplate(supplier: string | null | undefined, headers: string[]): Promise<void> {
  if (!supplier || !Array.isArray(headers) || !isGoodHeaderSet(headers)) return;
  const cleaned = cleanSupplierName(supplier);
  if (!cleaned) return;
  try {
    // 기존 레코드 있으면 column_mapping 보존 (headers 만 갱신)
    const existing = await supabase.from("ocr_templates")
      .select("column_mapping").eq("supplier_name", cleaned).limit(1).maybeSingle();
    if (existing.data?.column_mapping) {
      // 사용자 저장 매핑이 있는 공급사 → 자동 headers 덮어쓰기 스킵
      return;
    }
    await supabase.from("ocr_templates").upsert(
      { supplier_name: cleaned, headers, updated_at: new Date().toISOString() },
      { onConflict: "supplier_name" }
    );
    console.log(`[OCR/Template] 자동 저장/갱신: "${cleaned}" 헤더=${JSON.stringify(headers)}`);
  } catch (e: any) {
    console.warn("[OCR/Template] 자동 저장 실패 (무시):", e?.message);
  }
}

/** 공급처 힌트 or rawText 에서 supplier 를 뽑아 템플릿 조회
 *  반환: { supplier, headers, column_mapping }
 *   - headers: 표준 필드명 리스트 (예: ["품명","규격","수량","단가","금액"])
 *   - column_mapping: 원본 컬럼 순서 유지 배열 · "" = 제외 · 없으면 undefined
 */
async function findOcrTemplate(supplierHint: string | null | undefined, rawText?: string): Promise<{ supplier: string; headers: string[]; column_mapping?: string[] } | null> {
  let hint = supplierHint;
  // 힌트 없으면 rawText에서 공급자 라벨로 추출
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

/**
 * 검출된 헤더 · 행을 template 로 재배치
 *   column_mapping 이 있으면: 원본 컬럼 순서를 그대로 유지하되 라벨만 매핑 결과로 교체 · "제외" 컬럼 삭제
 *   column_mapping 이 없으면: 기존 로직 (헤더 수 일치 시 라벨 교체)
 */
function applyTemplateHeaders(detected: string[], template: string[]): string[] {
  if (detected.length === template.length) return [...template];
  // 검출 헤더 수가 템플릿보다 1개 많으면 트림 (마지막 노이즈 제거)
  if (detected.length === template.length + 1) return [...template, detected[detected.length - 1]];
  // 그 외엔 원본 유지
  return detected;
}

/**
 * column_mapping 을 사용해 rows 를 재구성.
 *   columnMapping[origIdx] === "제외" or "" → 해당 컬럼 제거
 *   나머지는 순서대로 유지, 헤더는 매핑 결과 사용
 */
function applyColumnMapping(
  detectedHeaders: string[],
  rows: (string | number | null)[][],
  columnMapping: string[],
): { headers: string[]; rows: (string | number | null)[][] } {
  // 2026-07-10 v4c:
  //   병합: 여러 원본 컬럼 → 같은 표준 필드 (셀 값 합침)
  //   분할: 한 원본 컬럼 → 여러 표준 필드 ("|" 구분자 · 셀 값을 공백으로 split)
  //     예) raw 컬럼값 "20281221 454" · mapping = "유통기한|단가"
  //         → 유통기한=20281221, 단가=454 로 분리 배치
  const NUM_FIELDS = new Set(["수량", "단가", "금액", "세액"]);
  const SPLIT_DELIM = "|";

  // 1) 원본 컬럼 값을 미리 "분할된 (필드, 값)" 페어 리스트로 확장
  //    → 이후 merge 로직에서 필드별로 병합
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

  // 2) 필드 순서 결정 (첫 등장 순서 유지, 분할 필드 순서도 포함)
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

/**
 * OCR 로 뽑은 공급사 후보를 vendors 테이블과 fuzzy 매칭 (2026-07-09)
 *
 * 사용 시나리오:
 *   Local(EasyOCR) / AI(ONNX) 는 표에서 공급사명이 뭉개져 나올 때 많음.
 *   실제 상호 마스터가 vendors 테이블에 150개 있으니 fuzzy 매칭으로 정규화.
 *   매칭되면 정규화된 상호명 반환 → 상품 pool 필터가 정확해짐.
 *
 * 매칭 방식:
 *   1) normSupplier 로 후보/DB 상호 정규화 (법인·VAT·지역 태그 제거)
 *   2) exact / includes / bigramSim >= 60 순으로 매칭
 *   3) 최고 점수 반환 (임계 미만이면 null)
 */
async function matchVendorSupplier(rawSupplier: string | null | undefined): Promise<string | null> {
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
      // exact
      if (vn === target) return v;
      // includes 관계 (부분 일치)
      if (vn.includes(target) || target.includes(vn)) {
        const ratio = Math.min(vn.length, target.length) / Math.max(vn.length, target.length);
        const score = Math.round(80 + 15 * ratio);
        if (score > bestScore) { bestScore = score; best = v; }
        continue;
      }
      // fuzzy
      const score = bigramSim(vn, target);
      if (score > bestScore) { bestScore = score; best = v; }
    }
    return bestScore >= 60 ? best : null;
  } catch {
    return null;
  }
}

/**
 * rawText 에서 vendors DB 와 매칭되는 공급사명을 찾기 (2026-07-09)
 *
 * Local(EasyOCR)/AI(ONNX) 는 meta.supplier 추출이 자주 실패함.
 * 그럴 때 rawText 를 vendors 상호 리스트로 스캔해서 매칭되는 것을 찾음.
 *
 * 매칭 방식:
 *   1) vendors 상호를 normSupplier 로 정규화
 *   2) 정규화된 rawText 에 정규화된 vendor 상호가 포함되는지 검사
 *   3) 가장 긴 매칭이 우승 (짧은 이름이 다른 이름의 부분으로 잘못 매칭되는 것 방지)
 */
async function findVendorInText(rawText: string | null | undefined): Promise<string | null> {
  if (!rawText || String(rawText).trim().length < 3) return null;
  try {
    const vendors = await getVendorNames();
    if (vendors.length === 0) return null;

    // 2026-07-14 v3 (A + C 조합):
    //   A) 최장 매칭 (v1 · 결정적 · 안전)
    //   C) 명세서 상단 헤더 영역만 스캔 (첫 350자) · 하단 상품 라인 노이즈 배제
    //      + 공급자 라벨 근처 vendor 최우선
    //      + 상단에서 매칭 없으면 전체 rawText 로 폴백

    const SUPPLIER_LABEL = /(?:공\s*급\s*자|공\s*급\s*하?\s*는?\s*자|공급업체|공급회사|판\s*매\s*자|판매업체|매출자)/;

    // (1) 명세서 상단 헤더 영역: 첫 350자 (헤더 · 공급자/수신처 정보)
    const header = rawText.slice(0, 350);
    const headerNorm = normSupplier(header);

    // 헤더 내에서 매칭 · 최장 이름 우승 (v1 방식)
    const headerFindLongest = (): string | null => {
      let best: string | null = null;
      let bestLen = 0;
      for (const v of vendors) {
        const vn = normSupplier(v);
        if (!vn || vn.length < 3) continue;
        if (headerNorm.includes(vn) && vn.length > bestLen) {
          bestLen = vn.length;
          best = v;
        }
      }
      return best;
    };

    // (2) 공급자 라벨 직후 100자 안에서 매칭 · 최우선
    const supplierMatch = rawText.match(SUPPLIER_LABEL);
    if (supplierMatch) {
      const pos = rawText.indexOf(supplierMatch[0]);
      const window = rawText.slice(pos, Math.min(rawText.length, pos + 100));
      const windowNorm = normSupplier(window);
      let best: string | null = null;
      let bestLen = 0;
      for (const v of vendors) {
        const vn = normSupplier(v);
        if (!vn || vn.length < 3) continue;
        if (windowNorm.includes(vn) && vn.length > bestLen) {
          bestLen = vn.length;
          best = v;
        }
      }
      if (best) {
        console.log(`[findVendorInText] page-header/공급자-label → "${best}"`);
        return best;
      }
    }

    // (3) 상단 350자 안에서 최장 매칭
    const headerBest = headerFindLongest();
    if (headerBest) {
      console.log(`[findVendorInText] page-header 최장매칭 → "${headerBest}"`);
      return headerBest;
    }

    // (4) 최종 폴백: 전체 rawText 에서 최장 매칭 (v1 원본 로직 · 안전)
    const textNorm = normSupplier(rawText);
    if (!textNorm) return null;
    let best: string | null = null;
    let bestLen = 0;
    for (const v of vendors) {
      const vn = normSupplier(v);
      if (!vn || vn.length < 3) continue;
      if (textNorm.includes(vn) && vn.length > bestLen) {
        bestLen = vn.length;
        best = v;
      }
    }
    if (best) console.log(`[findVendorInText] 전체 rawText 최장매칭 → "${best}"`);
    return best;
  } catch {
    return null;
  }
}

const router = Router();

// Gemini 키 중 이번 서버 세션에서 영구 제외된 키 (할당량 초과 or 인증 실패)
const sessionDeadKeys = new Set<string>();

router.get("/api/health", (_req, res) => res.json({ ok: true }));

router.get("/api/ocr-ping", (_req, res) => {
  const keys = getGeminiKeys();
  const mKeys = getMistralKeys();
  res.json({ ok: true, gemini: keys.length > 0, geminiKeyCount: keys.length, mistral: mKeys.length > 0, mistralKeyCount: mKeys.length });
});

router.post("/api/ocr-match", async (req, res) => {
  try {
    const { names } = req.body ?? {};
    const isCandidateMode = typeof req.body?.name === "string" && req.body?.topN;
    if (!isCandidateMode && !Array.isArray(names)) return res.status(400).json({ error: "names 배열 필요" });

    const map = await getProductMap();
    const products = Object.values(map);
    const synonymMap = await getSynonymMap();
    const supplierAliasMap = await getSupplierAliasMap();

    // 공급사 별칭 보정 헬퍼
    const resolveSupplier = (hint: string): string => {
      if (!hint) return hint;
      const aliased = supplierAliasMap.get(normSupplier(hint));
      return aliased ?? hint;
    };

    if (isCandidateMode) {
      const name = req.body.name as string;
      const topN = Math.min(Number(req.body.topN) || 10, 30);
      const rawHint = (req.body.supplier as string | undefined)?.trim() ?? "";
      const supplierHint = resolveSupplier(rawHint);

      const nameLC = name.trim().toLowerCase();
      const synKeyCompound = supplierHint ? `${normSupplier(supplierHint)}|${nameLC}` : null;
      const synCode = (synKeyCompound && synonymMap.get(synKeyCompound)) ?? synonymMap.get(nameLC);
      if (synCode) {
        const sp = map[synCode] ?? products.find(p => p.code === synCode);
        if (sp) return res.json({ candidates: [makeMatchResult(name, sp, 100).matched] });
      }

      const pool = (() => {
        if (!supplierHint) return products;
        const sh = normSupplier(supplierHint);
        // 2026-07-09 안전판: bigramSim threshold 40→30 (한글 접미사·괄호 태그 있는 DB에 관대)
        // 또한 pool 이 5개 미만이면 전체 상품 fallback (잘못된 pool 필터로 정답 배제 방지)
        const filtered = products.filter(p => {
          if (!p.supplier) return false;
          const sp = normSupplier(String(p.supplier));
          return sp === sh || sp.includes(sh) || sh.includes(sp) || bigramSim(sp, sh) >= 30;
        });
        return filtered.length >= 5 ? filtered : products;
      })();

      const scored = pool
        .map(p => ({ p, score: invoiceMatchScore(name, p) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);

      return res.json({
        candidates: scored.map(({ p, score }) => ({
          code: p.code, name: p.name, spec: p.spec, score,
          supplier: p.supplier != null ? String(p.supplier) : null,
          masterPrice: p.purchase_price != null ? Number(p.purchase_price) : null,
          salePrice: p.sale_price != null ? Number(p.sale_price) : null,
          profitRate: p.profit_rate != null ? Number(p.profit_rate) : null,
          expiryDate: p.expiry_date != null ? String(p.expiry_date) : null,
        })),
      });
    }

    const supplierHints: string[] = Array.isArray(req.body?.suppliers) ? req.body.suppliers : [];

    // 매칭 진단 수집 (사용자가 어느 행이 왜 매칭 실패했는지 즉시 파악 가능)
    const matchTraces: RowMatchTrace[] = [];

    const matches = names.map((name: string, i: number) => {
      if (!name?.trim()) {
        matchTraces.push({ rowIdx: i, ocrName: String(name ?? ""), supplierHint: null, bestScore: 0, bestCandidate: null, bestCode: null, matched: false, reason: "empty-name" });
        return { input: name, matched: null };
      }

      const supplierHint = resolveSupplier((supplierHints[i] ?? "").trim());
      const nameLC = name.trim().toLowerCase();
      const synKeyCompound = supplierHint ? `${normSupplier(supplierHint)}|${nameLC}` : null;
      const synCode = (synKeyCompound && synonymMap.get(synKeyCompound)) ?? synonymMap.get(nameLC);
      if (synCode) {
        const sp = map[synCode] ?? products.find(p => p.code === synCode);
        if (sp) {
          matchTraces.push({ rowIdx: i, ocrName: name, supplierHint, bestScore: 100, bestCandidate: sp.name, bestCode: sp.code, matched: true, reason: "synonym-hit" });
          return makeMatchResult(name, sp, 100);
        }
      }

      const pool = (() => {
        if (!supplierHint) return products;
        const sh = normSupplier(supplierHint);
        const filtered = products.filter(p => {
          if (!p.supplier) return false;
          const sp = normSupplier(String(p.supplier));
          return sp === sh || sp.includes(sh) || sh.includes(sp) || bigramSim(sp, sh) >= 30;
        });
        return filtered.length >= 5 ? filtered : products;
      })();

      // 상위 3개 후보 저장 (진단용)
      const scoredAll = pool.map(p => ({ p, score: invoiceMatchScore(name, p) }));
      scoredAll.sort((a, b) => b.score - a.score);
      const top3 = scoredAll.slice(0, 3).map(({ p, score }) => ({ name: p.name, code: p.code, score }));

      const best = scoredAll[0]?.p ?? null;
      const bestScore = scoredAll[0]?.score ?? 0;

      const commonTrace = { rowIdx: i, ocrName: name, supplierHint, bestScore, bestCandidate: best?.name ?? null, bestCode: best?.code ?? null, top3Candidates: top3 };

      if (!best || bestScore < 20) {
        console.log(`[MATCH-MISS] score=${bestScore ?? 0} ocr="${name}" best="${best?.name ?? "-"}"`);
        matchTraces.push({ ...commonTrace, matched: false, reason: bestScore < 20 ? "score-too-low" : "no-candidate" });
        return { input: name, matched: null, score: bestScore };
      }
      if (bestScore < 70) {
        console.log(`[MATCH-LOW] score=${bestScore} ocr="${name}" → db="${best.name}"`);
      }
      matchTraces.push({ ...commonTrace, matched: true, reason: bestScore >= 95 ? "high-confidence" : bestScore >= 70 ? "medium-confidence" : "low-confidence" });
      return {
        input: name,
        matched: {
          code: best.code,
          name: best.name,
          spec: best.spec,
          score: bestScore,
          masterPrice: best.purchase_price != null ? Number(best.purchase_price) : null,
          salePrice: best.sale_price != null ? Number(best.sale_price) : null,
          profitRate: best.profit_rate != null ? Number(best.profit_rate) : null,
          expiryDate: best.expiry_date != null ? String(best.expiry_date) : null,
        },
      };
    });

    // 매칭 진단 저장 (비동기 · 응답에 영향 없음)
    const diag: MatchDiagnostic = {
      ts: new Date().toISOString(),
      totalRows: matchTraces.length,
      matched: matchTraces.filter(r => r.matched).length,
      missed: matchTraces.filter(r => !r.matched).length,
      lowScore: matchTraces.filter(r => r.matched && r.bestScore < 70).length,
      perfectMatch: matchTraces.filter(r => r.bestScore >= 95).length,
      supplierHints: [...new Set(supplierHints.filter(Boolean))],
      rows: matchTraces,
    };
    void saveMatchDiagnostic(diag);

    res.json({ matches });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/ocr-synonyms", async (_req, res) => {
  try {
    const { data, error } = await supabase.from("ocr_synonyms").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    res.json({ synonyms: data ?? [] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/api/ocr-synonyms", async (req, res) => {
  try {
    const { prod_name_old, prod_name_new, supplier_old, supplier_new, product_code } = req.body ?? {};
    if (!prod_name_old?.trim() || !product_code?.trim()) return res.status(400).json({ error: "prod_name_old, product_code 필요" });
    const nameOldNorm = prod_name_old.trim().toLowerCase();
    const codeNorm = product_code.trim();
    const supplierNewNorm = supplier_new?.trim() ? normSupplier(supplier_new.trim()) : null;
    const supplierOldNorm = supplier_old?.trim() || null;
    const nameNewVal = prod_name_new?.trim() || null;

    // prod_name_old 기준 기존 행 조회
    const { data: existing } = await supabase
      .from("ocr_synonyms").select("id").eq("prod_name_old", nameOldNorm).limit(1);
    if (existing?.[0]) {
      const { data, error } = await supabase.from("ocr_synonyms")
        .update({ product_code: codeNorm, supplier_new: supplierNewNorm, prod_name_new: nameNewVal, supplier_old: supplierOldNorm })
        .eq("id", existing[0].id)
        .select().single();
      if (error) throw new Error(error.message);
      resetSynonymCache();
      return res.json({ synonym: data });
    }

    // 새로 삽입
    const { data, error } = await supabase.from("ocr_synonyms")
      .insert({ prod_name_old: nameOldNorm, prod_name_new: nameNewVal, product_code: codeNorm, supplier_new: supplierNewNorm, supplier_old: supplierOldNorm })
      .select().single();
    if (error) throw new Error(error.message);
    resetSynonymCache();
    res.json({ synonym: data });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/api/ocr-synonyms/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { prod_name_old, prod_name_new, product_code, supplier_old, supplier_new } = req.body ?? {};
    if (!prod_name_old?.trim() || !product_code?.trim()) return res.status(400).json({ error: "prod_name_old, product_code 필요" });
    const { data, error } = await supabase.from("ocr_synonyms")
      .update({
        prod_name_old: prod_name_old.trim().toLowerCase(),
        prod_name_new: prod_name_new?.trim() || null,
        product_code: product_code.trim(),
        supplier_new: supplier_new?.trim() ? normSupplier(supplier_new.trim()) : null,
        supplier_old: supplier_old?.trim() || null,
      })
      .eq("id", id).select().single();
    if (error) throw new Error(error.message);
    resetSynonymCache();
    res.json({ synonym: data });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE by prod_name_old (for pre-existing synonyms without a known ID) — must be before /:id
router.delete("/api/ocr-synonyms/by-name", async (req, res) => {
  try {
    const { prod_name_old } = req.body ?? {};
    if (!prod_name_old?.trim()) return res.status(400).json({ error: "prod_name_old 필요" });
    const nameOldNorm = prod_name_old.trim().toLowerCase();
    const { error } = await supabase.from("ocr_synonyms").delete().eq("prod_name_old", nameOldNorm);
    if (error) throw new Error(error.message);
    resetSynonymCache();
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// 2차 보정 ✕ 취소: 삭제 대신 cancelled=true 마킹 (재적용 방지 + 관리 가능)
// 마이그레이션(20260705_ocr_synonyms_cancelled.sql)이 적용되어야 정상 동작.
// 미적용 시에는 400 응답 대신 delete로 폴백.
router.post("/api/ocr-synonyms/cancel-by-name", async (req, res) => {
  try {
    const { prod_name_old, product_code } = req.body ?? {};
    if (!prod_name_old?.trim()) return res.status(400).json({ error: "prod_name_old 필요" });
    const nameOldNorm = prod_name_old.trim().toLowerCase();
    // 존재하면 cancelled=true로 업데이트, 없으면 새 레코드 삽입 (cancelled=true)
    const { data: exist, error: findErr } = await supabase
      .from("ocr_synonyms").select("id").eq("prod_name_old", nameOldNorm).limit(1);
    if (findErr) {
      // cancelled 컬럼 미존재 등 스키마 오류 시 delete로 폴백
      await supabase.from("ocr_synonyms").delete().eq("prod_name_old", nameOldNorm);
      resetSynonymCache();
      return res.json({ ok: true, fallback: "delete" });
    }
    if (exist && exist.length > 0) {
      const { error } = await supabase.from("ocr_synonyms")
        .update({ cancelled: true, cancelled_at: new Date().toISOString() })
        .eq("id", exist[0].id);
      if (error) {
        await supabase.from("ocr_synonyms").delete().eq("prod_name_old", nameOldNorm);
        resetSynonymCache();
        return res.json({ ok: true, fallback: "delete" });
      }
    } else {
      const codeToUse = String(product_code ?? "").trim() || "__cancelled__";
      const { error } = await supabase.from("ocr_synonyms").insert([{
        prod_name_old: nameOldNorm,
        product_code: codeToUse,
        cancelled: true,
        cancelled_at: new Date().toISOString(),
      }]);
      if (error) {
        // 마이그레이션 미적용 시 조용히 성공 처리 (기록 실패해도 UX는 유지)
        resetSynonymCache();
        return res.json({ ok: true, fallback: "insert_failed" });
      }
    }
    resetSynonymCache();
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// 취소 항목 복원 (cancelled=false)
router.post("/api/ocr-synonyms/restore/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { error } = await supabase.from("ocr_synonyms")
      .update({ cancelled: false, cancelled_at: null }).eq("id", id);
    if (error) throw new Error(error.message);
    resetSynonymCache();
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/api/ocr-synonyms/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("ocr_synonyms").delete().eq("id", Number(req.params.id));
    if (error) throw new Error(error.message);
    resetSynonymCache();
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── 공급사 별칭 CRUD ──────────────────────────────────────────────────────────
router.get("/api/ocr-supplier-aliases", async (_req, res) => {
  try {
    const { data, error } = await supabase.from("ocr_supplier_aliases").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    res.json({ aliases: data ?? [] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/api/ocr-supplier-aliases", async (req, res) => {
  try {
    const { alias, supplier_name } = req.body ?? {};
    if (!alias?.trim() || !supplier_name?.trim()) return res.status(400).json({ error: "alias, supplier_name 필요" });
    const aliasNorm = alias.trim();
    const nameNorm = supplier_name.trim();

    const { data: existing } = await supabase
      .from("ocr_supplier_aliases").select("id").eq("alias", aliasNorm).limit(1);
    let result;
    if (existing?.[0]) {
      const { data, error } = await supabase.from("ocr_supplier_aliases")
        .update({ supplier_name: nameNorm })
        .eq("id", existing[0].id).select().single();
      if (error) throw new Error(error.message);
      result = data;
    } else {
      const { data, error } = await supabase.from("ocr_supplier_aliases")
        .insert({ alias: aliasNorm, supplier_name: nameNorm }).select().single();
      if (error) throw new Error(error.message);
      result = data;
    }
    resetSupplierAliasCache();
    res.json({ alias: result });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/api/ocr-supplier-aliases/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { alias, supplier_name } = req.body ?? {};
    if (!alias?.trim() || !supplier_name?.trim()) return res.status(400).json({ error: "alias, supplier_name 필요" });
    const { data, error } = await supabase.from("ocr_supplier_aliases")
      .update({ alias: alias.trim(), supplier_name: supplier_name.trim() })
      .eq("id", id).select().single();
    if (error) throw new Error(error.message);
    resetSupplierAliasCache();
    res.json({ alias: data });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/api/ocr-supplier-aliases/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("ocr_supplier_aliases").delete().eq("id", Number(req.params.id));
    if (error) throw new Error(error.message);
    resetSupplierAliasCache();
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/api/ocr-templates", async (_req, res) => {
  try {
    const { data, error } = await supabase.from("ocr_templates").select("*").order("supplier_name");
    if (error) throw new Error(error.message);
    res.json({ templates: data ?? [] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/api/ocr-templates", async (req, res) => {
  try {
    const { supplier_name, headers, column_mapping } = req.body ?? {};
    if (!supplier_name?.trim() || !Array.isArray(headers)) return res.status(400).json({ error: "supplier_name, headers 필요" });
    // column_mapping: 원본 컬럼 순서 유지 배열 (선택) · 예: ["품명","","수량","단가","금액","유통기한"]
    //   빈 문자열 = 이 컬럼은 제외 · 나머지는 표준 필드명
    const payload: any = { supplier_name: supplier_name.trim(), headers, updated_at: new Date().toISOString() };
    if (Array.isArray(column_mapping)) {
      payload.column_mapping = column_mapping.map((v: any) => (v == null ? "" : String(v)));
    }
    const { data, error } = await supabase.from("ocr_templates")
      .upsert(payload, { onConflict: "supplier_name" })
      .select().single();
    if (error) throw new Error(error.message);
    res.json({ template: data });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/api/ocr-templates/:supplier_name", async (req, res) => {
  try {
    const { error } = await supabase.from("ocr_templates").delete().eq("supplier_name", req.params.supplier_name);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/api/ocr", async (req, res) => {
  const { images, engine: reqEngine = "gemini" } = req.body ?? {};
  const engine = reqEngine as string;
  const supplierHints: string[] = Array.isArray(req.body?.supplierHints) ? req.body.supplierHints : [];
  // 요청 스코프 로컬 키 인덱스 — 동시 요청 간 race 방지
  // 시작값만 전역 geminiState에서 읽고, 이후는 로컬에서만 관리
  const keysAtStart = getGeminiKeys();
  let reqLocalKeyIdx = keysAtStart.length > 0 ? geminiState.currentKeyIdx % keysAtStart.length : 0;
  const templateMap = new Map<string, string[]>();
  const uniqueHints = [...new Set(supplierHints.filter(Boolean))];
  if (uniqueHints.length > 0) {
    const { data: tmpls } = await supabase.from("ocr_templates").select("supplier_name, headers").in("supplier_name", uniqueHints);
    (tmpls ?? []).forEach((t: any) => templateMap.set(t.supplier_name, t.headers));
  }

  if (!Array.isArray(images) || images.length === 0)
    return res.status(400).json({ error: "images 배열이 필요합니다." });
  if (engine === "gemini" && getGeminiKeys().length === 0 && getMistralKeys().length === 0)
    return res.status(400).json({ error: "GEMINI_API_KEY 또는 MISTRAL_API_KEY가 설정되지 않았습니다. .env에 추가하세요." });

  console.log(`[OCR] 요청 엔진: ${engine}`);

  // AI 파이프라인용 raw 데이터 로그 저장 (진단용)
  //   - engine=onnx 는 원래 진단 로그 저장이 없어서 raw 데이터 확인 불가했음
  //   - logs/ocr-last.json + logs/ocr-onnx-last.json 에 파이프라인 각 단계 결과 저장
  //   - logs/ocr-compare-onnx-last.txt 에 raw OCR ↔ 1차보정테이블 side-by-side 비교
  const saveLocalOcrLog = async (
    engineName: "onnx",
    pageDiagnostics: any[]
  ) => {
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const logsDir = path.join(process.cwd(), "logs");
      await fs.mkdir(logsDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const payload = JSON.stringify({
        ts: new Date().toISOString(),
        engine: engineName,
        pageCount: pageDiagnostics.length,
        diagnostics: pageDiagnostics,
      }, null, 2);

      // ── side-by-side 비교 로그 (raw OCR ↔ 1차보정테이블) ──
      const compareLines: string[] = [];
      const dt = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
      const engineLabel = "🤖 AI 모델 (ONNX)";
      compareLines.push(`════════════════════════════════════════════════════════════════════════════════`);
      compareLines.push(`  OCR ↔ 1차보정테이블 비교 · ${engineLabel} · ${dt}`);
      compareLines.push(`════════════════════════════════════════════════════════════════════════════════`);

      for (const d of pageDiagnostics) {
        compareLines.push(``);
        compareLines.push(`─── 페이지 ${d.page} (${(d.timeMs / 1000).toFixed(2)}초) ──────────────────────────────────`);
        const rawKey = "rawFromOnnx";
        const rawInfo = d[rawKey] ?? {};
        const finalInfo = d.final ?? {};
        compareLines.push(``);
        compareLines.push(`로 : ${JSON.stringify(rawInfo.headers ?? [])}`);
        compareLines.push(`[1차보정 헤더]  : ${JSON.stringify(finalInfo.headers ?? [])}`);
        compareLines.push(`[원본 행 수]    : ${rawInfo.rowCount ?? 0}`);
        compareLines.push(`[1차보정 행 수] : ${finalInfo.rowCount ?? 0}`);
        const m = finalInfo.meta ?? {};
        compareLines.push(`[공급자]         : ${m.supplier ?? "-"}`);
        compareLines.push(`[일자]           : ${m.date ?? "-"}`);
        compareLines.push(`[소계]           : ${m.subtotal?.toLocaleString() ?? "-"}`);
        compareLines.push(`[공급가액]      : ${m.supplyAmount?.toLocaleString() ?? "-"}`);
        compareLines.push(`[세액/부가세]   : ${m.vat?.toLocaleString() ?? "-"}`);
        compareLines.push(`[합계/총합계]   : ${m.total?.toLocaleString() ?? "-"}`);
        if (m.balancePrev != null) compareLines.push(`[전잔액]        : ${m.balancePrev.toLocaleString()}`);
        if (m.balanceAfter != null) compareLines.push(`[누적잔액]      : ${m.balanceAfter.toLocaleString()}`);
        compareLines.push(``);
        compareLines.push(`  ┌─ 원본 OCR 행 (상위 5개) ─────────────────────────────────────────`);
        for (let i = 0; i < (rawInfo.rowsPreview ?? []).length; i++) {
          const row = rawInfo.rowsPreview[i];
          const preview = row.map((c: any) => c == null ? "-" : String(c).slice(0, 25)).join(" | ");
          compareLines.push(`  │ #${i + 1}: ${preview}`);
        }
        compareLines.push(`  └─────────────────────────────────────────────────────────────────`);
        compareLines.push(``);
        compareLines.push(`  ┌─ 1차보정 행 (상위 5개) ──────────────────────────────────────────`);
        for (let i = 0; i < (finalInfo.rowsPreview ?? []).length; i++) {
          const row = finalInfo.rowsPreview[i];
          const preview = row.map((c: any) => c == null ? "-" : String(c).slice(0, 25)).join(" | ");
          compareLines.push(`  │ #${i + 1}: ${preview}`);
        }
        compareLines.push(`  └─────────────────────────────────────────────────────────────────`);
        // 진단: 단가==금액 의심 행
        const susp = d.suspiciousEqualPriceAmount ?? [];
        if (susp.length > 0) {
          compareLines.push(``);
          compareLines.push(`  ⚠️  단가=금액 의심 행 ${susp.length}개 (페이지 통계 벗어남 · 보정 X · 진단만)`);
          susp.slice(0, 10).forEach((s: any) => {
            compareLines.push(`     · 행#${s.rowIdx}: ${s.reason}`);
          });
        }
        // rawText 미리보기
        if (rawInfo.rawTextPreview) {
          compareLines.push(``);
          compareLines.push(`[Raw Text (500자 미리보기)]`);
          compareLines.push(String(rawInfo.rawTextPreview).slice(0, 500));
        }
      }
      compareLines.push(``);
      compareLines.push(`════════════════════════════════════════════════════════════════════════════════`);
      compareLines.push(`  다음: RawOcrTable 에서 매칭 → logs/ocr-match-summary.txt 확인`);
      compareLines.push(`════════════════════════════════════════════════════════════════════════════════`);
      const compareText = compareLines.join("\n");

      await Promise.all([
        fs.writeFile(path.join(logsDir, "ocr-last.json"), payload),
        fs.writeFile(path.join(logsDir, `ocr-${engineName}-last.json`), payload),
        fs.writeFile(path.join(logsDir, `ocr-${timestamp}.json`), payload),
        fs.writeFile(path.join(logsDir, `ocr-compare-${engineName}-last.txt`), compareText),
      ]);
      // 콘솔에도 비교 요약 출력
      console.log("\n" + compareText + "\n");

      // 오래된 로그 정리 (30개 유지)
      const files = (await fs.readdir(logsDir)).filter(f => /^ocr-\d/.test(f)).sort();
      while (files.length > 30) {
        const f = files.shift();
        if (f) await fs.unlink(path.join(logsDir, f)).catch(() => { });
      }
    } catch (e: any) {
      console.warn(`[OCR/${engineName}] 로그 저장 실패 (무시):`, e?.message);
    }
  };

  // ── ONNX (PP-OCRv5 한국어) · Render 배포 · 완전 무료 · Node 네이티브 ──
  //   순차 처리 이유: onnxruntime-node 세션은 CPU 코어를 다 쓰므로 병렬 실행이 오히려 느림
  //   2026-07-14 리팩토링: 파이프라인 구조로 전환 · 각 stage 격리 · 진단 로그 자동
  if (engine === "onnx") {
    try {
      const pages: any[] = [];
      const diagnostics: any[] = [];
      const imgs = images as { data: string; mimeType: string }[];

      // 파이프라인 조립 (한 번만)
      const pipeline = buildOnnxPipeline({
        matchVendorSupplier,
        findVendorInText,
        findOcrTemplate,
        applyColumnMapping,
        applyTemplateHeaders,
        upsertOcrTemplate,
      });

      for (let i = 0; i < imgs.length; i++) {
        const startTs = Date.now();
        const { data: rawB64, mimeType: rawMime } = imgs[i];
        console.log(`[OCR/ONNX] page ${i + 1}/${imgs.length}`);
        try {
          // 파이프라인 실행 (모든 stage 순차 · 실패해도 다음 stage 진행)
          const ctx = makeInitialContext({
            page: i + 1,
            rawB64,
            rawMime,
            supplierHint: (supplierHints[i] ?? "").trim() || undefined,
          });
          await runPipeline(pipeline, ctx, { page: i + 1 });
          const LOW_MEM_MODE = process.env.RENDER === "true" || process.env.LOW_MEM === "true";
          // pages 저장 · rawText 는 LOW_MEM 에서 4KB 캡 (누적 성장 방지)
          pages.push({
            page: ctx.page,
            headers: ctx.headers,
            rows: ctx.rows,
            meta: ctx.meta,
            rawText: LOW_MEM_MODE ? (ctx.rawText ?? "").slice(0, 4000) : ctx.rawText,
            supplierHintUsed: ctx.template?.supplier ?? ctx.supplierHint,
            rawOcrHeaders: ctx.rawOcrHeaders ?? [],
            rawOcrSample: ctx.rawOcrSample ?? [],
          });
          // 진단은 LOW_MEM 에서 더 짧게 · rawFromOnnx 는 필수 필드만
          diagnostics.push({
            page: ctx.page,
            timeMs: Date.now() - startTs,
            rawFromOnnx: {
              headers: ctx.raw?.headers ?? [],
              rowCount: (ctx.raw?.rows ?? []).length,
              rowsPreview: LOW_MEM_MODE ? [] : (ctx.raw?.rows ?? []).slice(0, 5),
              meta: ctx.raw?.meta ?? {},
              rawTextPreview: (ctx.raw?.rawText ?? "").slice(0, LOW_MEM_MODE ? 200 : 800),
            },
            final: { headers: ctx.headers, rowCount: ctx.rows.length, meta: ctx.meta, rowsPreview: LOW_MEM_MODE ? [] : ctx.rows.slice(0, 5) },
            stages: LOW_MEM_MODE ? [] : ctx.diagnostics,
            errors: ctx.errors,
            suspiciousEqualPriceAmount: detectSuspiciousEqualPriceAmount(ctx.headers, ctx.rows),
          });
          // 명시적 큰 객체 참조 해제 (다음 페이지 전에 GC 가능하게)
          ctx.raw = undefined;
          ctx.rawB64 = "";
          if (LOW_MEM_MODE) {
            ctx.rawText = "";
            ctx.rawOcrSample = [];
            ctx.diagnostics = [];
          }
        } catch (pageErr: any) {
          console.error(`[OCR/ONNX] page ${i + 1} 처리 실패 · 빈 페이지로 대체:`, pageErr?.message);
          console.error(`  stack:`, pageErr?.stack);
          pages.push({ page: i + 1, headers: ["품명", "규격", "수량", "단가", "금액", "비고"], rows: [], meta: {}, rawText: "", supplierHintUsed: undefined, _error: pageErr?.message });
          diagnostics.push({ page: i + 1, timeMs: Date.now() - startTs, error: pageErr?.message });
        }
        // 페이지 간 메모리 해제 힌트 (Render 512MB · OOM 방지)
        //   node --expose-gc 필요 · 없으면 조용히 skip
        //   큰 이미지 버퍼 · ONNX 중간 텐서 참조를 다음 페이지 전에 반환
        if (typeof (global as any).gc === "function") {
          (global as any).gc();
        }
        // heap 사용량 로그 (Render 대시보드에서 추적용)
        if (process.env.RENDER === "true" || process.env.LOW_MEM === "true") {
          const mu = process.memoryUsage();
          console.log(`[OCR/mem] page ${i + 1} 완료 · rss=${(mu.rss / 1024 / 1024).toFixed(0)}MB · heap=${(mu.heapUsed / 1024 / 1024).toFixed(0)}MB`);
        }
      }
      // ── 다중 페이지 공통 라인 감지 → 메타 노이즈 2차 필터 (v4c 강화) ──
      //   페이지 2개 이상일 때 rawText 공통 라인 (수신처/공급자/주소/담당자)을 검출해
      //   각 페이지의 상품 행 목록에서 재차 제거. 여러 명세서 배치 처리 시 정확도 급상승.
      //   + v4c: 단일 페이지 요청도 세션 캐시(_recentRawTextCache)의 다른 rawText 와 비교
      //          → 사용자가 한 장씩 업로드해도 공통 라인 검출 가능
      const currentRawTexts = pages.map(p => p.rawText ?? "").filter(t => t.length > 30);
      // 세션 캐시에 이번 페이지들의 rawText 추가 (다음 요청에서 활용 가능)
      currentRawTexts.forEach(t => addToRawCache(t));
      // 공통 라인 검출용 rawText 풀 (현재 페이지 + 세션 캐시)
      const commonPool = [...currentRawTexts, ...getRawCacheTexts().filter(t => !currentRawTexts.includes(t))];
      if (commonPool.length >= 2) {
        const commonLines = extractCommonMetadataLines(commonPool, 0.5);
        if (commonLines.length > 0) {
          console.log(`[OCR/ONNX/commonMeta] 공통 라인 ${commonLines.length}개 검출 (풀 ${commonPool.length}개 · 세션캐시 ${_recentRawTextCache.length}개):`);
          commonLines.slice(0, 10).forEach(c => console.log(`   · "${c}"`));
          for (const p of pages) {
            const beforeCnt = p.rows.length;
            const filtered = filterMetadataBleedRows(p.headers, p.rows, p.meta, commonLines);
            if (filtered.length < beforeCnt) {
              console.log(`[OCR/ONNX/commonMeta] page ${p.page}: 공통라인 기반 ${beforeCnt - filtered.length}행 추가 제거`);
              p.rows = filtered;
            }
          }
        }
      }
      await saveLocalOcrLog("onnx", diagnostics);
      return res.json({ pages, engine });
    } catch (err: any) {
      // 🔍 stack trace 전체 로그 (Cannot read undefined length 위치 파악)
      console.error("[OCR/ONNX] error:", err?.message);
      console.error("[OCR/ONNX] stack:", err?.stack);
      return res.status(500).json({ error: err?.message ?? "ONNX(PP-OCRv5 한국어) 처리 중 오류" });
    }
  }

  try {
    const pages: any[] = [];
    // 페이지별 상세 처리 트레이스 (진단 로그용)
    const pageTraces: any[] = [];

    if (engine === "gemini") {
      const keys = getGeminiKeys();

      for (let i = 0; i < images.length; i++) {
        const { data: rawB64, mimeType: rawMime } = images[i] as { data: string; mimeType: string };
        const pageStartTs = Date.now();
        const trace: any = {
          page: i + 1,
          startedAt: new Date(pageStartTs).toISOString(),
          originalBytes: Math.round(rawB64.length * 0.75),  // base64 → byte 근사
          preprocessing: null,
          supplierExtract: null,
          templateApplied: null,
          keyAttempts: [],
          rawTextLength: 0,
          parsePipeline: null,
          totalMs: 0,
        };

        // 이미지 전처리: 업스케일 + 도장 제거 + 그레이스케일 정규화
        const preT0 = Date.now();
        const { b64, mimeType } = await preprocessImageForOcr(rawB64, rawMime);
        trace.preprocessing = {
          timeMs: Date.now() - preT0,
          originalMime: rawMime,
          processedMime: mimeType,
          processedBytes: Math.round(b64.length * 0.75),
          sizeRatio: Number(((b64.length / rawB64.length) || 1).toFixed(3)),
        };

        // 공급처 힌트가 없으면 1차 경량 추출 → 템플릿 조회
        let hint = supplierHints[i] ?? "";
        const hintProvided = !!hint;
        if (!hint && keys.length > 0) {
          const extractKey = keys[reqLocalKeyIdx % keys.length];
          if (!sessionDeadKeys.has(extractKey)) {
            const exT0 = Date.now();
            const extracted = await extractSupplierFromImage(b64, mimeType, extractKey);
            trace.supplierExtract = {
              tried: true, timeMs: Date.now() - exT0, result: extracted ?? null,
              keyIdx: reqLocalKeyIdx % keys.length,
            };
            if (extracted) {
              hint = extracted;
              console.log(`[OCR/2pass] page ${i + 1}: 공급처 1차 추출 → "${extracted}"`);
              // 추출된 공급처로 템플릿 조회
              const cleanedName = extracted.replace(/\(주\)|\(株\)|주식회사|（주）/g, "").trim();
              const { data: tmplData } = await supabase.from("ocr_templates")
                .select("supplier_name, headers").ilike("supplier_name", `%${cleanedName}%`).limit(1);
              if (tmplData?.[0]) templateMap.set(hint, tmplData[0].headers);
            }
          } else {
            trace.supplierExtract = { tried: false, reason: "key dead" };
          }
        } else if (hintProvided) {
          trace.supplierExtract = { tried: false, reason: "hint provided", hint };
        }
        const tmplHeaders = hint ? templateMap.get(hint) : undefined;
        const templatePrompt = tmplHeaders ? buildTemplatePrompt(hint, tmplHeaders) : undefined;
        if (templatePrompt) {
          console.log(`[OCR/Template] page ${i + 1}: 템플릿 "${hint}" 적용`);
          trace.templateApplied = { supplier: hint, headers: tmplHeaders };
        }

        // ── Gemini (sticky key, 세션 내 dead key 제외 · 요청 로컬 인덱스) ──
        let rawText = "";
        let lastError = "";

        const startIdx = keys.length > 0 ? reqLocalKeyIdx % keys.length : 0;
        console.log(`[OCR/Gemini] page ${i + 1}/${images.length} — 키 ${startIdx + 1}번부터 (총 ${keys.length}개)`);

        for (let k = 0; k < keys.length; k++) {
          const ki = (startIdx + k) % keys.length;
          const apiKey = keys[ki];
          if (sessionDeadKeys.has(apiKey)) {
            trace.keyAttempts.push({ keyIdx: ki, skipped: "dead" });
            continue;
          }

          const attT0 = Date.now();
          const r = await callGeminiOcr(b64, mimeType, apiKey, undefined, templatePrompt);
          const attMs = Date.now() - attT0;
          if (r.ok) {
            rawText = r.text;
            reqLocalKeyIdx = ki;
            geminiState.currentKeyIdx = ki;
            trace.keyAttempts.push({ keyIdx: ki, ok: true, timeMs: attMs, textLen: r.text.length });
            trace.rawTextLength = r.text.length;
            console.log(`[OCR/Gemini] page ${i + 1}: 키 ${ki + 1} 성공 (${attMs}ms)`);
            break;
          }
          const fail = r as Extract<GeminiResult, { ok: false }>;
          lastError = fail.error;
          trace.keyAttempts.push({ keyIdx: ki, ok: false, timeMs: attMs, quota: fail.quota, errorPreview: fail.error.slice(0, 100) });
          if (fail.quota || fail.error.includes("UNAUTHENTICATED") || fail.error.includes("API_KEY_INVALID") || fail.error.includes("not valid")) {
            sessionDeadKeys.add(apiKey);
            reqLocalKeyIdx = (ki + 1) % keys.length;
            console.warn(`[OCR/Gemini] 키 ${ki + 1} 세션 제외 (할당량 초과 또는 인증 실패)`);
          } else {
            reqLocalKeyIdx = (ki + 1) % keys.length;
            console.warn(`[OCR/Gemini] 키 ${ki + 1}/${keys.length} 실패: ${fail.error}`);
          }
        }

        // ── 3순위: Mistral fallback ──────────────────────────────────────────
        if (!rawText) {
          const mistralKeys = getMistralKeys();
          for (const mKey of mistralKeys) {
            const r = await callMistralOcr(b64, mimeType, mKey, templatePrompt);
            if (r.ok) { rawText = r.text; console.log(`[OCR/Mistral] page ${i + 1}: 성공`); break; }
            console.warn(`[OCR/Mistral] 실패: ${(r as Extract<GeminiResult, { ok: false }>).error}`);
          }
        }

        if (!rawText) {
          const deadCount = keys.filter(k => sessionDeadKeys.has(k)).length;
          const errMsg = deadCount === keys.length
            ? `Gemini 키 ${keys.length}개 모두 할당량 초과 또는 인증 실패. 새 키를 추가하거나 내일 재시도하세요.`
            : `OCR 실패: ${lastError}`;
          return res.status(500).json({ error: errMsg });
        }

        let parsed: any;
        try { parsed = JSON.parse(rawText); }
        catch {
          pages.push({ page: i + 1, headers: ["원문 응답"], rows: [[rawText]], meta: {}, rawText });
          continue;
        }

        let pageData: any;
        try {
          const rawHeadersOrig = Array.isArray(parsed.headers) ? [...parsed.headers] : [];
          const rawRowsCount = Array.isArray(parsed.rows) ? parsed.rows.length : 0;
          const cleaned = cleanCellValues(
            Array.isArray(parsed.headers) ? parsed.headers : [],
            Array.isArray(parsed.rows) ? parsed.rows : [],
          );
          const pre = mergeAdjacentHeaders(cleaned.headers, cleaned.rows);
          const normalized = normalizeInvoiceCols(pre.headers, pre.rows);
          const spec = extractSpecFromName(normalized.headers, normalized.rows);
          const validated = validateCellTypes(spec.headers, spec.rows);
          if (validated.issues.length > 0) console.log(`[OCR/Gemini/validate] page ${i + 1}: ${validated.issues.length}개 셀 보정`);
          const cleanMeta = sanitizeOcrMeta(parsed.meta ?? {});
          const rows0 = fixAmountsBySubtotal(validated.headers, validated.rows, cleanMeta.total ?? null);
          const rows1 = repairColumnShift(validated.headers, rows0);
          const rows2 = crossValidateIntraPage(validated.headers, rows1);
          const rows3 = filterCodeOnlyRows(validated.headers, rows2);
          // 메타데이터 노이즈 필터 (공급사명/수신처/주소/업종/사람이름 반복 행 제거)
          const beforeMeta = rows3.length;
          const rows = filterMetadataBleedRows(validated.headers, rows3, cleanMeta);
          if (rows.length < beforeMeta) console.log(`[OCR/Gemini] page ${i + 1}: 메타 노이즈 ${beforeMeta - rows.length}행 제거`);
          // 진단: 단가==금액 이지만 페이지 통계상 컬럼 shift 의심되는 행 (보정 없이 로그만)
          const suspicious = detectSuspiciousEqualPriceAmount(spec.headers, rows);
          if (suspicious.length > 0) {
            console.log(`[OCR/Gemini/suspicious] page ${i + 1}: ${suspicious.length}개 의심 행 (단가=금액 · 페이지 통계 벗어남)`);
            suspicious.slice(0, 5).forEach(s => console.log(`  · 행#${s.rowIdx}: ${s.reason}`));
          }

          // 파이프라인 각 단계 추적
          trace.parsePipeline = {
            rawHeadersFromGemini: rawHeadersOrig,
            rawRowsCount,
            afterClean: { headers: cleaned.headers, rowCount: cleaned.rows.length },
            afterMergeHeaders: { headers: pre.headers, rowCount: pre.rows.length },
            afterNormalize: { headers: normalized.headers, rowCount: normalized.rows.length },
            afterSpec: { headers: spec.headers, rowCount: spec.rows.length },
            afterFixAmounts: { rowCount: rows0.length, changed: rows0.length !== spec.rows.length },
            afterRepairShift: { rowCount: rows1.length, changed: JSON.stringify(rows1) !== JSON.stringify(rows0) },
            afterCrossValidate: { rowCount: rows2.length, changed: JSON.stringify(rows2) !== JSON.stringify(rows1) },
            afterFilterCode: { rowCount: rows.length, filtered: rows2.length - rows.length },
            suspiciousEqualPriceAmount: suspicious,
            finalMeta: cleanMeta,
          };
          const aI = spec.headers.indexOf("금액");
          if (aI >= 0 && cleanMeta.total) {
            const finalSum = rows.reduce((s, r) => s + (typeof r[aI] === "number" ? (r[aI] as number) : 0), 0);
            if (Math.abs(finalSum - cleanMeta.total) > 1) {
              console.warn(`[OCR/합계불일치] page ${i + 1} — 합계 ${cleanMeta.total} vs 행합 ${finalSum}`);
            }
          }
          if (hint && !cleanMeta.supplier) cleanMeta.supplier = hint;
          process.stdout.write(`\n[OCR 결과] page ${i + 1}\n  헤더: ${JSON.stringify(spec.headers)}\n  행 수: ${rows.length}\n  메타: ${JSON.stringify(cleanMeta)}\n`);
          // 잔고 후보 진단 로그 — "합계액/총합계/잔고" 등 키워드 발견 시 어디에 있는지 표시
          try {
            const BAL_KW = /합\s*계\s*액|총\s*합\s*계|합\s*계|잔\s*고|잔\s*액|미\s*수|공\s*급\s*가|매\s*입\s*총\s*계/;
            const hdrHits: string[] = [];
            spec.headers.forEach((h: string, hi: number) => {
              if (BAL_KW.test(String(h ?? ""))) hdrHits.push(`컬럼[${hi}]="${h}"`);
            });
            const rowHits: string[] = [];
            rows.forEach((r: any[], ri: number) => {
              r.forEach((c: any, ci: number) => {
                if (typeof c === "string" && BAL_KW.test(c)) {
                  const near = r.slice(Math.max(0, ci - 1), ci + 3).map(v => JSON.stringify(v)).join(", ");
                  rowHits.push(`행[${ri}][${ci}]="${c}" 인접={${near}}`);
                }
              });
            });
            if (hdrHits.length || rowHits.length) {
              console.log(`[OCR/잔고진단] page ${i + 1} (공급사=${cleanMeta.supplier ?? "-"})`);
              hdrHits.forEach(h => console.log(`  헤더: ${h}`));
              rowHits.forEach(h => console.log(`  ${h}`));
            }
          } catch (_diagErr) { /* ignore */ }
          pageData = { page: i + 1, headers: validated.headers, rows, meta: cleanMeta, rawText, supplierHintUsed: hint || undefined };
        } catch (parseErr: any) {
          console.error(`[OCR/parse-error] page ${i + 1}:`, parseErr?.stack ?? parseErr?.message);
          trace.parseError = String(parseErr?.message ?? parseErr);
          pageData = { page: i + 1, headers: ["원문 응답"], rows: [[rawText]], meta: {}, rawText };
        }
        trace.totalMs = Date.now() - pageStartTs;
        pageTraces.push(trace);
        pages.push(pageData);

        // ── 자동 학습: Gemini가 뽑은 헤더가 표준 컬럼 3개+ 포함하면 템플릿 저장 ──
        //    Local/AI 가 같은 공급사 처리할 때 이 헤더 구조를 참조하게 됨
        if (pageData?.headers?.length && pageData?.meta?.supplier) {
          void upsertOcrTemplate(pageData.meta.supplier, pageData.headers);
        }
      }
    }

    // ── 상세 진단 로그: 페이지별·행별 품질 지표 계산 ─────────────────────────
    // 목적: 추출이 실패했을 때 어느 단계·어느 셀에서 문제가 있었는지 즉시 파악.
    const diagnostics = pages.map((pg: any) => {
      const H: string[] = pg.headers ?? [];
      const rows: any[][] = pg.rows ?? [];
      // 표준 컬럼 인덱스
      const idx = (re: RegExp) => H.findIndex(h => re.test(String(h).replace(/\s+/g, "")));
      const iName = idx(/품명|품목|상품명|제품명/);
      const iSpec = idx(/규격|사양/);
      const iQty = idx(/수량|매수/);
      const iPrice = idx(/단가/);
      const iAmt = idx(/^금액$|공급가액|매출액/);
      const iVat = idx(/세액|부가세/);

      let qtyPriceAmtMismatch = 0;
      let missingName = 0;
      let missingQty = 0;
      let missingPrice = 0;
      let missingAmount = 0;
      let outlierAmount = 0;
      let outlierQty = 0;
      let outlierPrice = 0;
      const rowIssues: Array<any> = [];

      const toNum = (v: any): number => {
        if (typeof v === "number") return v;
        const s = String(v ?? "").replace(/,/g, "").trim();
        if (!s) return 0;
        // "1.000" → 1000 (콤마-점 오독)
        if (/^\d{1,3}(\.\d{3})+$/.test(s)) return parseInt(s.replace(/\./g, ""), 10);
        const n = parseFloat(s);
        return isFinite(n) ? n : 0;
      };

      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        if (!Array.isArray(row)) continue;
        const name = iName >= 0 ? String(row[iName] ?? "").trim() : "";
        const qty = iQty >= 0 ? toNum(row[iQty]) : 0;
        const price = iPrice >= 0 ? toNum(row[iPrice]) : 0;
        const amt = iAmt >= 0 ? toNum(row[iAmt]) : 0;
        const issues: string[] = [];

        if (!name) { missingName++; issues.push("품명 없음"); }
        if (iQty >= 0 && qty === 0) { missingQty++; issues.push("수량 0/없음"); }
        if (iPrice >= 0 && price === 0) { missingPrice++; issues.push("단가 0/없음"); }
        if (iAmt >= 0 && amt === 0) { missingAmount++; issues.push("금액 0/없음"); }

        // 이상치 감지 (한국 거래명세서 통계적 범위)
        if (qty > 0 && qty > 100000) { outlierQty++; issues.push(`수량 과대(${qty})`); }
        if (price > 0 && price > 10_000_000) { outlierPrice++; issues.push(`단가 과대(${price})`); }
        if (amt > 0 && amt > 100_000_000) { outlierAmount++; issues.push(`금액 과대(${amt})`); }

        // 행의 모든 셀 값 (진단용) + 다른 수량 후보 (X × 단가 ≈ 금액 을 만족하는 값)
        const allCells = row.map((v, ci) => ({ col: ci, header: H[ci] ?? `col${ci}`, value: v }));
        let qtyCandidates: Array<{ col: number; header: string; value: number }> = [];
        if (price > 0 && amt > 0) {
          const targetQty = amt / price;
          qtyCandidates = allCells
            .map(c => ({ ...c, num: toNum(c.value) }))
            .filter(c => c.col !== iQty && c.num > 0 && Math.abs(c.num - targetQty) <= Math.max(1, targetQty * 0.02))
            .map(c => ({ col: c.col, header: c.header, value: c.num }));
        }

        // 수량 × 단가 ≠ 금액 검증
        let mismatch = false;
        let expected: number | undefined;
        if (qty > 0 && price > 0 && amt > 0) {
          expected = qty * price;
          const drift = Math.abs(expected - amt) / Math.max(expected, amt);
          if (drift > 0.02) {
            mismatch = true;
            qtyPriceAmtMismatch++;
            issues.push(`수량×단가 불일치: ${qty}×${price}=${expected} vs 금액 ${amt}`);
          }
        }

        if ((mismatch || issues.length > 0) && rowIssues.length < 30) {
          rowIssues.push({
            row: ri + 1,
            product: name,
            issues: [...issues],
            qty, price, amount: amt, expected,
            allCells,           // 진단: 이 행의 모든 셀 원본 값
            qtyCandidates,      // 진단: (X × 단가 ≈ 금액)을 만족하는 다른 컬럼 후보 (자동 교정 후보)
          });
        }
      }

      // 페이지 합계 검증
      const rowAmountSum = rows.reduce((s, r) => {
        const a = iAmt >= 0 ? (typeof r[iAmt] === "number" ? r[iAmt] : parseFloat(String(r[iAmt] ?? "").replace(/,/g, "")) || 0) : 0;
        return s + a;
      }, 0);
      const statedTotal = Number(pg.meta?.total ?? 0);
      const totalMismatch = statedTotal > 0 && Math.abs(rowAmountSum - statedTotal) > 1;

      return {
        page: pg.page,
        supplier: pg.meta?.supplier ?? null,
        supplierHintUsed: pg.supplierHintUsed ?? null,
        date: pg.meta?.date ?? null,
        headers: H,
        columnMap: {
          품명: iName, 규격: iSpec, 수량: iQty, 단가: iPrice, 금액: iAmt, 세액: iVat,
        },
        stats: {
          rowCount: rows.length,
          statedTotal,
          rowAmountSum,
          totalMismatch,
          totalDrift: statedTotal > 0 ? Math.round(((rowAmountSum - statedTotal) / statedTotal) * 10000) / 100 : null,
          qtyPriceAmtMismatch,
          missingName, missingQty, missingPrice, missingAmount,
          outlierQty, outlierPrice, outlierAmount,
        },
        rowIssues,
        rawTextPreview: pg.rawText ? String(pg.rawText).slice(0, 500) : null,
      };
    });

    // 최신 OCR 결과를 파일로 저장 (진단용) — logs/ocr-last.json + logs/ocr-<timestamp>.json
    // 비동기 저장으로 이벤트 루프 블로킹 방지
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const logsDir = path.join(process.cwd(), "logs");
      await fs.mkdir(logsDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      // 페이지 진단과 처리 트레이스를 병합
      const diagnosticsMerged = diagnostics.map((d, di) => ({
        ...d,
        trace: pageTraces[di] ?? null,
      }));
      const summary = {
        ts: new Date().toISOString(),
        engine,
        pageCount: pages.length,
        totals: {
          rowsExtracted: diagnostics.reduce((s, d) => s + d.stats.rowCount, 0),
          totalMismatchPages: diagnostics.filter(d => d.stats.totalMismatch).length,
          qtyPriceAmtMismatches: diagnostics.reduce((s, d) => s + d.stats.qtyPriceAmtMismatch, 0),
          missingFieldTotal: diagnostics.reduce((s, d) => s + d.stats.missingName + d.stats.missingQty + d.stats.missingPrice + d.stats.missingAmount, 0),
          totalTimeMs: pageTraces.reduce((s, t) => s + (t.totalMs ?? 0), 0),
          keyRotationCount: pageTraces.reduce((s, t) => s + (t.keyAttempts?.filter((a: any) => a.ok === false).length ?? 0), 0),
        },
        diagnostics: diagnosticsMerged,
      };
      const detailedPayload = JSON.stringify({ ...summary, pages }, null, 2);
      const summaryPayload = JSON.stringify(summary, null, 2);
      await Promise.all([
        fs.writeFile(path.join(logsDir, "ocr-last.json"), detailedPayload),
        fs.writeFile(path.join(logsDir, `ocr-${timestamp}.json`), detailedPayload),
        fs.writeFile(path.join(logsDir, "ocr-last-summary.json"), summaryPayload),
      ]);
      // 최대 20개 유지
      const files = (await fs.readdir(logsDir)).filter(f => /^ocr-\d/.test(f)).sort();
      while (files.length > 20) {
        const f = files.shift();
        if (f) await fs.unlink(path.join(logsDir, f)).catch(() => { });
      }
      // 콘솔 요약 출력 — 다음 개선 방안 착수 시 즉시 확인 가능
      console.log(`[OCR/diag] ${pages.length}페이지 처리 완료:
  - 추출 행 수: ${summary.totals.rowsExtracted}
  - 소계 불일치 페이지: ${summary.totals.totalMismatchPages}/${pages.length}
  - 수량×단가≠금액 행: ${summary.totals.qtyPriceAmtMismatches}
  - 필드 누락 총계: ${summary.totals.missingFieldTotal}
  → 자세한 분석: logs/ocr-last-summary.json`);
    } catch (logErr: any) {
      console.warn("[OCR/log-save]", logErr?.message);
    }
    return res.json({ pages, engine });
  } catch (err: any) {
    console.error("[OCR] error:", err?.message);
    console.error("[OCR] stack:", err?.stack);
    res.status(500).json({ error: err?.message ?? "OCR 처리 중 오류" });
  }
});

// 최신 OCR 결과 조회 (진단용) — logs/ocr-last.json 반환
router.get("/api/ocr/last-log", async (_req, res) => {
  try {
    const fs = await import("fs");
    const path = await import("path");
    const p = path.join(process.cwd(), "logs", "ocr-last.json");
    if (!fs.existsSync(p)) return res.status(404).json({ error: "저장된 OCR 로그 없음" });
    const data = fs.readFileSync(p, "utf-8");
    res.type("application/json").send(data);
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// 공급사명 + 금액으로 OCR 결과에서 항목 검색 (진단용)
router.get("/api/ocr/search-balance", async (req, res) => {
  try {
    const supplier = String(req.query.supplier ?? "").trim();
    const amount = req.query.amount ? Number(req.query.amount) : null;
    const fs = await import("fs");
    const path = await import("path");
    const p = path.join(process.cwd(), "logs", "ocr-last.json");
    if (!fs.existsSync(p)) return res.status(404).json({ error: "저장된 OCR 로그 없음. OCR을 한 번 실행하세요." });
    const data = JSON.parse(fs.readFileSync(p, "utf-8"));
    const matches: any[] = [];
    for (const page of data.pages ?? []) {
      const supp = page.meta?.supplier ?? "";
      if (supplier && !String(supp).includes(supplier)) continue;
      const hits: any = { page: page.page, supplier: supp, hits: [] as any[] };
      (page.headers ?? []).forEach((h: string, hi: number) => {
        if (/합\s*계\s*액|총\s*합\s*계|합\s*계|잔\s*고|잔\s*액|미\s*수|공\s*급\s*가|매\s*입\s*총\s*계/.test(String(h ?? ""))) {
          const values = (page.rows ?? []).map((r: any[]) => r?.[hi]).filter((v: any) => v != null);
          hits.hits.push({ type: "header", col: hi, label: h, values });
        }
      });
      (page.rows ?? []).forEach((r: any[], ri: number) => {
        r?.forEach((c: any, ci: number) => {
          if (typeof c === "string" && /합\s*계\s*액|총\s*합\s*계|합\s*계|잔\s*고|잔\s*액|미\s*수|공\s*급\s*가|매\s*입\s*총\s*계/.test(c)) {
            hits.hits.push({ type: "cell", row: ri, col: ci, label: c, rowFull: r });
          }
          if (amount != null && typeof c === "number" && Math.abs(c - amount) < 1) {
            hits.hits.push({ type: "amount-match", row: ri, col: ci, value: c, rowFull: r });
          }
        });
      });
      if (hits.hits.length) matches.push(hits);
    }
    res.json({ query: { supplier, amount }, matches });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

// ── 공급사 잔고 기록 ──────────────────────────────────────────────────────────
router.get("/api/supplier-balances", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("supplier_balances")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    res.json({ balances: data ?? [] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/api/supplier-balances", async (req, res) => {
  try {
    const { supplier_name, invoice_date, balance } = req.body ?? {};
    if (!supplier_name?.trim() || balance == null) return res.status(400).json({ error: "supplier_name, balance 필요" });
    const { data, error } = await supabase
      .from("supplier_balances")
      .insert({ supplier_name: supplier_name.trim(), invoice_date: invoice_date ?? null, balance: Number(balance) })
      .select().single();
    if (error) throw new Error(error.message);
    res.json({ balance: data });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/api/supplier-balances/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("supplier_balances").delete().eq("id", Number(req.params.id));
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
