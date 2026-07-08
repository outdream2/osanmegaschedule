// server/ocr/rapidocr.ts
// multilingual-purejs-ocr (RapidOCR/PP-OCRv4 순수 Node.js 바인딩) 래퍼
// - 완전 무료 · 셀프호스팅 · Render 배포 가능 (ONNX Runtime)
// - 한국어 사전 + 다국어 인식 모델 조합
// - Python 의존성 X · npm install 만으로 완결

import fs from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";

// ESM 안전 require (다양한 CJS 진입점 처리)
const req = createRequire(import.meta.url);

// TextElement/Paragraph 반환 형태 (multilingual-purejs-ocr types.d.ts 참조)
export interface RapidLine { text: string; confidence: number; x: number; y: number; w: number; h: number; }
export type RapidOcrResult =
  | { ok: true; headers: string[]; rows: (string | number | null)[][]; meta: Record<string, any>; rawText: string; lines: RapidLine[]; }
  | { ok: false; error: string; };

// 무거운 모델 로딩은 프로세스 lifetime 동안 한 번만
let ocrPromise: Promise<any> | null = null;
async function getOcr(): Promise<any> {
  if (ocrPromise) return ocrPromise;
  ocrPromise = (async () => {
    const mod = req("multilingual-purejs-ocr");
    const Ocr = mod.default ?? mod;
    return await Ocr.create({
      language: "ko",
      detectionThreshold: 0.1,
      confidenceThreshold: 0.4,
      // 표 문서 · 셀 사이 간격 좁아도 잡히도록 unclip 확장
      unclipRatio: 1.7,
    });
  })().catch(err => { ocrPromise = null; throw err; });
  return ocrPromise;
}

// 거래명세서 헤더 키워드 (한국어)
const HEADER_KW = new Set([
  "품목", "품명", "상품명", "수량", "단가", "금액",
  "규격", "단위", "공급가액", "공급가", "세액", "적요",
  "번호", "No", "일자", "날짜", "거래일자",
]);
const TOTAL_KW = /합\s*계|소\s*계|총\s*계|합\s*금|총\s*금액/;

function isMostlyNumeric(row: string[]): boolean {
  const numeric = row.filter(c => /^[\d,.\s]+$/.test(c.trim())).length;
  return row.length > 0 && numeric / row.length >= 0.5;
}

// Y좌표 기반 라인 → 행 그룹핑 (EasyOCR Python 스크립트와 동일 알고리즘)
function groupIntoRows(lines: RapidLine[]): RapidLine[][] {
  if (lines.length === 0) return [];
  const sorted = [...lines].sort((a, b) => a.y - b.y);
  const heights = sorted.map(l => l.h).filter(h => h > 0);
  const medianH = heights.length > 0 ? heights.slice().sort((a, b) => a - b)[Math.floor(heights.length / 2)] : 12;
  const threshold = Math.max(6, medianH * 0.55);
  const groups: RapidLine[][] = [];
  let cur: RapidLine[] = [sorted[0]];
  let anchor = sorted[0].y;
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - anchor) < threshold) cur.push(sorted[i]);
    else { groups.push(cur.sort((a, b) => a.x - b.x)); cur = [sorted[i]]; anchor = sorted[i].y; }
  }
  if (cur.length > 0) groups.push(cur.sort((a, b) => a.x - b.x));
  return groups;
}

function findHeaderRow(rowGroups: RapidLine[][]): { idx: number; colXs: number[]; texts: string[] } {
  const textRows = rowGroups.map(g => g.map(l => l.text));
  const isCandidate = (row: string[]): boolean => {
    const joined = row.join(" ");
    if (TOTAL_KW.test(joined)) return false;
    if (isMostlyNumeric(row)) return false;
    return true;
  };
  // 1단계: 정확 일치 2개 이상
  for (let i = 0; i < textRows.length; i++) {
    if (!isCandidate(textRows[i])) continue;
    const hits = textRows[i].filter(c => HEADER_KW.has(c.trim())).length;
    if (hits >= 2 && textRows[i].length >= 3) {
      return { idx: i, colXs: rowGroups[i].map(l => l.x), texts: textRows[i] };
    }
  }
  // 2단계: 부분 일치 2개 이상
  for (let i = 0; i < textRows.length; i++) {
    if (!isCandidate(textRows[i])) continue;
    const hits = textRows[i].filter(c => [...HEADER_KW].some(k => c.includes(k))).length;
    if (hits >= 2 && textRows[i].length >= 3) {
      return { idx: i, colXs: rowGroups[i].map(l => l.x), texts: textRows[i] };
    }
  }
  return { idx: -1, colXs: [], texts: [] };
}

function alignRow(group: RapidLine[], colXs: number[]): (string | null)[] {
  const row: (string | null)[] = new Array(colXs.length).fill(null);
  for (const item of group) {
    let nearest = 0, minDist = Infinity;
    for (let i = 0; i < colXs.length; i++) {
      const d = Math.abs(item.x - colXs[i]);
      if (d < minDist) { minDist = d; nearest = i; }
    }
    if (row[nearest] === null) row[nearest] = item.text;
    else row[nearest] += " " + item.text;
  }
  return row;
}

function parseNum(v: string | null): string | number | null {
  if (v === null) return null;
  const cleaned = String(v).replace(/[,\s]/g, "");
  const n = Number(cleaned);
  if (Number.isFinite(n) && cleaned !== "") return Number.isInteger(n) ? n : Number(n.toFixed(2));
  return v;
}

function extractMeta(rawText: string): Record<string, any> {
  const meta: Record<string, any> = {};
  const dm = rawText.match(/(\d{4})[년.\-\/]\s*(\d{1,2})[월.\-\/]\s*(\d{1,2})[일]?/);
  if (dm) meta.date = `${dm[1]}-${dm[2].padStart(2, "0")}-${dm[3].padStart(2, "0")}`;
  const sm = rawText.match(/공\s*급\s*[자처사]\s*[:\s]*([가-힣a-zA-Z0-9()（）\s]{2,20})/);
  if (sm) meta.supplier = sm[1].trim().split(/\s+/)[0];
  const rm = rawText.match(/공\s*급\s*받\s*는\s*자?\s*[:\s]*([가-힣a-zA-Z0-9()（）\s]{2,20})/);
  if (rm) meta.recipient = rm[1].trim().split(/\s+/)[0];
  const totals: number[] = [];
  for (const pat of [/합\s*계[^\d]*(\d[\d,]+)/, /총\s*금\s*액[^\d]*(\d[\d,]+)/, /공\s*급\s*가\s*액[^\d]*(\d[\d,]+)/]) {
    const m = rawText.match(pat);
    if (m) totals.push(parseInt(m[1].replace(/,/g, ""), 10));
  }
  if (totals.length > 0) meta.total = Math.max(...totals);
  return meta;
}

export async function callRapidOcr(b64: string, mimeType: string): Promise<RapidOcrResult> {
  let ocr: any;
  try { ocr = await getOcr(); }
  catch (e: any) { return { ok: false, error: `RapidOCR 초기화 실패: ${String(e?.message ?? e)}` }; }

  // detect(imagePath) — 임시 파일 필요
  const ext = mimeType?.includes("png") ? "png" : mimeType?.includes("webp") ? "webp" : "jpg";
  const tmpPath = path.join(os.tmpdir(), `rapidocr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
  try {
    fs.writeFileSync(tmpPath, Buffer.from(b64, "base64"));
    const detectResult = await ocr.detect(tmpPath, { grouped: false });
    const elements = Array.isArray(detectResult?.data) ? detectResult.data : [];
    // TextElement → RapidLine 변환
    const lines: RapidLine[] = elements
      .filter((el: any) => el?.text && el.text.trim())
      .map((el: any) => ({
        text: String(el.text).trim(),
        confidence: Number(el.confidence ?? 0),
        x: Number(el.frame?.left ?? 0),
        y: Number(el.frame?.top ?? 0),
        w: Number(el.frame?.width ?? 0),
        h: Number(el.frame?.height ?? 12),
      }));

    if (lines.length === 0) {
      return { ok: true, headers: ["원문 텍스트"], rows: [[""]], meta: {}, rawText: "", lines: [] };
    }

    const rowGroups = groupIntoRows(lines);
    const rawText = rowGroups.map(g => g.map(l => l.text).join(" ")).join("\n");
    const meta = extractMeta(rawText);
    const { idx: headerIdx, colXs, texts: headerTexts } = findHeaderRow(rowGroups);

    if (headerIdx < 0) {
      // 헤더 감지 실패 → 원문만 반환 (기존 파이프라인이 원문 뷰로 처리)
      return { ok: true, headers: ["원문 텍스트"], rows: [[rawText]], meta, rawText, lines };
    }

    const rows: (string | number | null)[][] = [];
    for (let i = headerIdx + 1; i < rowGroups.length; i++) {
      const aligned = alignRow(rowGroups[i], colXs);
      const nonEmpty = aligned.filter(c => c !== null && String(c).trim() !== "").length;
      if (nonEmpty < 2) continue;
      const joined = aligned.map(c => c ?? "").join(" ");
      if (TOTAL_KW.test(joined)) continue;
      rows.push(aligned.map(parseNum));
    }

    if (rows.length === 0) {
      return { ok: true, headers: ["원문 텍스트"], rows: [[rawText]], meta, rawText, lines };
    }

    return { ok: true, headers: headerTexts, rows, meta, rawText, lines };
  } catch (e: any) {
    return { ok: false, error: `RapidOCR 처리 오류: ${String(e?.message ?? e)}` };
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}
