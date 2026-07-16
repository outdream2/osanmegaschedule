// server/ocr/ppuPaddle.ts
// PP-OCRv5 한국어 dedicated ONNX + Microsoft Table Transformer (TATR) 하이브리드 엔진
//
// 라이브러리:
//   - ppu-paddle-ocr v6 (텍스트 검출·인식, ONNX)
//   - @huggingface/transformers (TATR 표 구조 검출, ONNX)
//
// 핵심 파이프라인:
//   1) TATR 로 표 행/열 경계 검출  (env USE_TATR=true 일 때만 · 기본 true)
//   2) PP-OCRv5로 텍스트 검출 → 각 셀 (text, box, confidence)
//   3) TATR 셀 grid 에 텍스트 boxes 배정 (row_idx × col_idx 매트릭스)
//   4) 헤더 행 자동 탐지 → 표준화
//   5) TATR fallback: 실패 시 헤더 X좌표 기반 정렬 (기존 로직)
//
// 이 조합의 장점:
//   - 셀 경계 정확 → 품명·수량·단가 밀림 근본 해결
//   - 긴 한글 품명이 다음 행으로 흘러도 TATR row 경계로 정확히 배정

import { detectTableStructure, type TableStructure, type BBox } from "./tableStructure";
import { detectLayout, isLayoutAvailable, filterCellsByTables } from "./tableLayout";
import { isDeliveryOrAdminInfo } from "./invoice-vocab";
import { detectTableSlanet, slanetToTableStructure, isSlanetAvailable } from "./slanetTable";
import { extractInvoiceMetadata } from "./metadataKV";
import { extractSupplierFromRawText } from "./parse";

type Cell = { text: string; box: { x: number; y: number; width: number; height: number }; confidence: number };

type OcrPageRaw = {
  headers: string[];
  rows: (string | number | null)[][];
  meta: Record<string, any>;
  rawText: string;
};

// SLANet-plus 사용 여부 — 기본 ON (모델 있으면)
//   6.8MB · CPU 100-150ms/이미지 · PubTabNet TEDS 76+ · 격자표 95%+ 실측
//   다운로드: node scripts/download-slanet.mjs
//   완전 비활성화: USE_SLANET=false
//   Render(LOW_MEM) 자동 OFF: 세션 상주 ~40MB 절감
const USE_SLANET = process.env.USE_SLANET !== "false"
  && process.env.RENDER !== "true"
  && process.env.LOW_MEM !== "true";

// TATR 사용 여부 — 기본 OFF (SLANet 로 대체됨 · 115MB 오버킬)
const USE_TATR = process.env.USE_TATR === "true";

// DocLayout-YOLO 사용 여부 — 기본 ON (ai_detector 이미 있음)
//   layout 모델 다운로드: python server/ai_detector/download_layout_model.py
//   실패 시 조용히 fallback (기존 파이프라인)
const USE_LAYOUT = process.env.USE_LAYOUT !== "false";

let ocrInstance: any | null = null;
let initPromise: Promise<any> | null = null;

// LOW_MEM: 페이지 처리 후 세션 destroy + 캐시 클리어
// Render 512MB에서 상주 ~200MB 해제 · 다음 페이지 시 재로드 (1-2초 오버헤드)
const LOW_MEM =
  process.env.RENDER === "true" ||
  process.env.LOW_MEM === "true";

async function getOcrInstance() {
  if (ocrInstance) return ocrInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const mod: any = await import("ppu-paddle-ocr");
      const { PaddleOcrService } = mod;
      const path = await import("path");
      const fs = await import("fs");

      // ── 모델 선택 (env `OCR_MODEL` 로 런타임 전환 가능) ────────────────────
      //   v5_korean_mobile (기본, 한국어 특화, 13MB rec)
      //   v5_server        (다국어 서버, ~130MB, 표·숫자 정확도 상승)
      //   v6_small         (v6 소형, 다국어, ~35MB, 새 아키텍처)
      //   v6_medium        (v6 중형, 다국어, ~120MB, 정확도 최상)
      //   v6_tiny          (v6 소형화, ~10MB)
      const modelName = String(process.env.OCR_MODEL ?? "v5_korean_mobile").toLowerCase();
      const {
        V5_KOREAN_MOBILE_MODEL,
        V5_SERVER_MODEL,
        V6_SMALL_MODEL,
        V6_MEDIUM_MODEL,
        V6_TINY_MODEL,
      } = mod;
      const modelMap: Record<string, any> = {
        v5_korean_mobile: V5_KOREAN_MOBILE_MODEL,
        v5_server:        V5_SERVER_MODEL,
        v6_small:         V6_SMALL_MODEL,
        v6_medium:        V6_MEDIUM_MODEL,
        v6_tiny:          V6_TINY_MODEL,
      };
      const presetModel = modelMap[modelName] ?? V5_KOREAN_MOBILE_MODEL;

      // ── 로컬 모델 우선 (v5_korean_mobile 만 소스에 포함) ───────────────────
      const modelDir = path.join(process.cwd(), "server", "models", "ppocr");
      const detPath  = path.join(modelDir, "PP-OCRv5_mobile_det_infer.onnx");
      const recPath  = path.join(modelDir, "korean_PP-OCRv5_mobile_rec_infer.onnx");
      const dictPath = path.join(modelDir, "ppocrv5_korean_dict.txt");
      const canUseLocal = modelName === "v5_korean_mobile"
        && fs.existsSync(detPath) && fs.existsSync(recPath) && fs.existsSync(dictPath);

      // 모델 초기화 (실패 시 v5_korean_mobile 폴백)
      const initModel = async (target: string, preset: any, useLocal: boolean) => {
        const service = useLocal
          ? new PaddleOcrService({
              model: { detection: detPath, recognition: recPath, charactersDictionary: dictPath },
            })
          : new PaddleOcrService({ model: preset });
        await service.initialize();
        return service;
      };

      let svc: any;
      try {
        svc = await initModel(modelName, presetModel, canUseLocal);
        console.log(`[OCR/PP-OCR] 모델 = ${modelName} (${canUseLocal ? "로컬" : "캐시 다운로드"})`);
      } catch (primaryErr: any) {
        // 폴백: v5_korean_mobile (반드시 로컬 or 최소 캐시로 사용 가능)
        console.warn(`[OCR/PP-OCR] "${modelName}" 로드 실패 → v5_korean_mobile 폴백: ${primaryErr?.message}`);
        const fallbackUseLocal = fs.existsSync(detPath) && fs.existsSync(recPath) && fs.existsSync(dictPath);
        svc = await initModel("v5_korean_mobile", V5_KOREAN_MOBILE_MODEL, fallbackUseLocal);
        console.log(`[OCR/PP-OCR] 폴백 성공 = v5_korean_mobile (${fallbackUseLocal ? "로컬" : "캐시"})`);
      }
      ocrInstance = svc;
      console.log(`[OCR/PP-OCR] 초기화 완료`);
      return svc;
    } catch (e: any) {
      initPromise = null;
      throw new Error(`ppu-paddle-ocr 로드 실패: ${e?.message ?? e}. npm i ppu-paddle-ocr onnxruntime-node 확인 필요.`);
    }
  })();
  return initPromise;
}

function bufToArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

// ─────────────────────────────────────────────────────────────────────────
// 셀 처리 헬퍼
// ─────────────────────────────────────────────────────────────────────────

const cellCx = (c: Cell) => c.box.x + c.box.width / 2;
const cellCy = (c: Cell) => c.box.y + c.box.height / 2;

/** y좌표 기반 재클러스터링 (라이브러리 line grouping 보정) */
function reflowRows(lines: Cell[][]): Cell[][] {
  const reflowed: Cell[][] = [];
  for (const row of lines) {
    if (row.length === 0) continue;
    const rowY = row.reduce((s, c) => s + cellCy(c), 0) / row.length;
    const rowH = row.reduce((s, c) => s + c.box.height, 0) / row.length;
    const last = reflowed[reflowed.length - 1];
    if (last && last.length > 0) {
      const lastY = last.reduce((s, c) => s + cellCy(c), 0) / last.length;
      const lastH = last.reduce((s, c) => s + c.box.height, 0) / last.length;
      if (Math.abs(rowY - lastY) < Math.max(rowH, lastH) * 0.5) {
        last.push(...row);
        continue;
      }
    }
    reflowed.push([...row]);
  }
  return reflowed.map(row => [...row].sort((a, b) => cellCx(a) - cellCx(b)));
}

/** 헤더 행 탐지 (스코어 방식, 임계 3점) */
function findHeaderRow(rows: Cell[][]): { headerIdx: number; headerScore: number } {
  const HEADER_KW = ["품목", "품명", "품 명", "상품명", "제품명", "규격", "포장", "단위", "수량", "단가",
                     "금액", "공급가액", "가액", "세액", "부가세", "합계금액", "적요", "비고", "번호",
                     "코드", "상품코드", "품목코드", "바코드", "일자", "월일", "날짜", "유효기한", "유통기한"];
  const stripSpaces = (s: string) => s.replace(/\s+/g, "");
  const kwStripped = HEADER_KW.map(stripSpaces);

  const scoreRow = (row: Cell[]): number => {
    const flat = stripSpaces(row.map(c => c.text).join(""));
    return kwStripped.reduce((s, kw) => s + (flat.includes(kw) ? 1 : 0), 0);
  };

  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    if (rows[i].length < 3) continue;
    const s = scoreRow(rows[i]);
    if (s > bestScore) { bestScore = s; bestIdx = i; }
  }
  return { headerIdx: bestIdx, headerScore: bestScore };
}

/**
 * 데이터 행 셀들을 헤더 컬럼 X좌표에 정렬
 * — align_row 방식 (ocr_server.py 참고)
 * — 한 컬럼에 여러 셀이 배정되면 공백으로 join
 */
function alignRowToColumns(row: Cell[], colXs: number[]): (string | null)[] {
  const aligned = Array<string | null>(colXs.length).fill(null);
  for (const cell of row) {
    const cx = cellCx(cell);
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < colXs.length; i++) {
      const d = Math.abs(cx - colXs[i]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const text = cell.text.trim();
    if (!text) continue;
    aligned[bestIdx] = aligned[bestIdx] == null ? text : `${aligned[bestIdx]} ${text}`;
  }
  return aligned;
}

/** 문자열이 순수 숫자 (쉼표/소수점 허용) 인지 · (string|null)[] 및 string[] 모두 허용 */
function isMostlyNumeric(row: (string | null)[]): boolean {
  const nonNull = row.filter((c): c is string => c != null && c.trim() !== "");
  if (nonNull.length === 0) return true;
  const numCount = nonNull.filter(c => /^[\d,.\s]+$/.test(c.trim())).length;
  return numCount / nonNull.length >= 0.7;
}

/** 소계/합계 행 판정 */
const TOTAL_RE = /합\s*계|소\s*계|총\s*계|합\s*금|총\s*금|누\s*계|잔\s*액|공\s*급\s*가\s*액|부\s*가\s*세|이\s*월/;
function isTotalRow(row: (string | null)[]): boolean {
  const joined = row.filter(c => c).join(" ");
  return TOTAL_RE.test(joined);
}

// ─────────────────────────────────────────────────────────────────────────
// 메인 진입점
// ─────────────────────────────────────────────────────────────────────────

/**
 * TATR 표 구조 + PP-OCRv5 텍스트를 조합하여 셀 매트릭스 구성
 * @returns 행 매트릭스 (각 행 = 셀 텍스트 배열, 열 인덱스는 TATR cols 순서)
 */
function buildMatrixFromTatr(
  allCells: Cell[],
  structure: TableStructure
): { headerRowIdx: number; matrix: string[][] } {
  const nRows = structure.rows.length;
  const nCols = structure.cols.length;
  if (nRows === 0 || nCols === 0) return { headerRowIdx: -1, matrix: [] };

  // (rowIdx, colIdx) 매트릭스 초기화
  const matrix: string[][] = Array.from({ length: nRows }, () => Array(nCols).fill(""));

  const bboxContains = (bb: BBox, cx: number, cy: number) =>
    cx >= bb.x1 && cx <= bb.x2 && cy >= bb.y1 && cy <= bb.y2;

  for (const cell of allCells) {
    const cx = cell.box.x + cell.box.width / 2;
    const cy = cell.box.y + cell.box.height / 2;
    // 행 찾기: y가 row bbox 안에 있는 첫 번째
    let rowIdx = structure.rows.findIndex(r => bboxContains(r, cx, cy));
    // 못 찾으면 가장 가까운 행 (y 거리 기준)
    if (rowIdx < 0) {
      let bestDist = Infinity;
      structure.rows.forEach((r, i) => {
        const centerY = (r.y1 + r.y2) / 2;
        const d = Math.abs(cy - centerY);
        if (d < bestDist && d < (r.y2 - r.y1)) { bestDist = d; rowIdx = i; }
      });
    }
    if (rowIdx < 0) continue;

    // 열 찾기: x가 col bbox 안에 있는 첫 번째
    let colIdx = structure.cols.findIndex(c => bboxContains(c, cx, cy));
    if (colIdx < 0) {
      let bestDist = Infinity;
      structure.cols.forEach((c, i) => {
        const centerX = (c.x1 + c.x2) / 2;
        const d = Math.abs(cx - centerX);
        if (d < bestDist && d < (c.x2 - c.x1)) { bestDist = d; colIdx = i; }
      });
    }
    if (colIdx < 0) continue;

    const text = cell.text.trim();
    if (!text) continue;
    matrix[rowIdx][colIdx] = matrix[rowIdx][colIdx]
      ? `${matrix[rowIdx][colIdx]} ${text}`
      : text;
  }

  // 헤더 행 탐지: TATR headers 라벨이 있으면 우선, 없으면 매트릭스에서 KW 스코어
  const HEADER_KW = ["품목", "품명", "품 명", "상품명", "제품명", "규격", "포장", "단위", "수량", "단가",
                     "금액", "공급가액", "가액", "세액", "부가세", "합계금액", "적요", "비고", "번호",
                     "코드", "유통기한", "유효기한", "일자"];
  const stripSpaces = (s: string) => s.replace(/\s+/g, "");
  const kwStripped = HEADER_KW.map(stripSpaces);
  const scoreRow = (row: string[]) => {
    const flat = stripSpaces(row.join(""));
    return kwStripped.reduce((s, kw) => s + (flat.includes(kw) ? 1 : 0), 0);
  };

  let headerRowIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(matrix.length, 6); i++) {
    const s = scoreRow(matrix[i]);
    if (s > bestScore) { bestScore = s; headerRowIdx = i; }
  }
  // 임계 3 미만이면 헤더 없다고 판정
  if (bestScore < 3) headerRowIdx = -1;

  return { headerRowIdx, matrix };
}

export async function callPpuOcr(b64: string, mimeType: string): Promise<OcrPageRaw> {
  try {
    return await _callPpuOcrInner(b64, mimeType);
  } finally {
    // LOW_MEM: 세션 파괴 · 다음 페이지 시 재로드 (~200MB 해제)
    if (LOW_MEM) {
      await disposeOcrInstance();
      if (typeof (global as any).gc === "function") (global as any).gc();
    }
  }
}

async function disposeOcrInstance(): Promise<void> {
  const svc = ocrInstance;
  ocrInstance = null;
  initPromise = null;
  if (!svc) return;
  try {
    if (typeof svc.destroy === "function") await svc.destroy();
    else if (typeof svc.dispose === "function") await svc.dispose();
  } catch (e: any) {
    console.warn(`[OCR/PP-OCR] destroy 실패 (무시):`, e?.message);
  }
}

async function _callPpuOcrInner(b64: string, mimeType: string): Promise<OcrPageRaw> {
  const svc = await getOcrInstance();
  const buf = Buffer.from(b64, "base64");
  // noCache: true — globalImageCache 축적 방지 (같은 이미지 재사용 없음)
  const result = await svc.recognize(bufToArrayBuffer(buf), { noCache: true });

  const rawLines: Cell[][] = result?.lines ?? [];
  if (rawLines.length === 0) return { headers: [], rows: [], meta: {}, rawText: "" };

  // 1) confidence 0.3 미만 셀 제거
  const cleanedLines = rawLines
    .map(row => row.filter(c => c.text && c.text.trim() && c.confidence > 0.3))
    .filter(r => r.length > 0);

  const fullText = result?.text ?? cleanedLines.flat().map(c => c.text).join(" ");
  const regexMeta = extractMeta(fullText);

  // 메타데이터 KV 페어 추출 (좌측 라벨 · 우측 값 위치 관계 기반)
  //   - 상품 표 영역 자동 검출 → 표 밖 셀들만 대상
  //   - 공급사·소계·부가세·합계·잔액·담당자·날짜 자동 추출
  //   - regex 로 잡힌 값이 있으면 KV 로 보완 (숫자 필드는 KV 우선 · 오탐 적음)
  const allCellsForMeta = cleanedLines.flat();
  let meta: any = regexMeta;
  try {
    const imgMaxX = Math.max(...allCellsForMeta.map(c => c.box.x + c.box.width), 1);
    const imgMaxY = Math.max(...allCellsForMeta.map(c => c.box.y + c.box.height), 1);
    const kvMeta = extractInvoiceMetadata(
      allCellsForMeta,
      { width: imgMaxX, height: imgMaxY },
      regexMeta,
    );
    meta = kvMeta;
    const kvHitCount = Object.keys(kvMeta).filter(k => k !== "extraPairs" && (kvMeta as any)[k] != null).length;
    if (kvHitCount > 0) {
      console.log(`[OCR/PP-OCRv5+KV] 메타 KV 페어 ${kvHitCount}개 추출: ${JSON.stringify({
        supplier: kvMeta.supplier, subtotal: kvMeta.subtotal, vat: kvMeta.vat,
        total: kvMeta.total, balanceAfter: kvMeta.balanceAfter, date: kvMeta.date,
      })}`);
    }
  } catch (e: any) {
    console.warn(`[OCR/PP-OCRv5+KV] KV 추출 실패 (regex meta 유지): ${e?.message}`);
  }

  // 1.4) DocLayout-YOLO 로 표 영역 검출 → 표 밖 텍스트(주소·전화·도장 등) 필터
  //      실패 시 조용히 원본 유지 (fallback)
  let layoutFilteredLines = cleanedLines;
  if (USE_LAYOUT) {
    try {
      const available = await isLayoutAvailable();
      if (available) {
        const layout = await detectLayout(b64, 0.4);
        if (layout.tables.length > 0) {
          // 이미지 크기 계산 (모든 cell 의 x2/y2 최대값 근사)
          const allCells = cleanedLines.flat();
          const maxX = Math.max(...allCells.map(c => c.box.x + c.box.width), 1);
          const maxY = Math.max(...allCells.map(c => c.box.y + c.box.height), 1);
          const filtered = filterCellsByTables(allCells, layout.tables, maxX, maxY);
          // 필터링된 셀들로 재구성 (row grouping 은 뒤에서)
          if (filtered.length >= allCells.length * 0.3) {
            layoutFilteredLines = [filtered];  // 한 그룹으로 통합 → reflowRows 가 재클러스터
            console.log(`[OCR/PP-OCRv5+Layout] 표 ${layout.tables.length}개 검출, 셀 ${allCells.length}→${filtered.length}개 필터`);
          } else {
            console.log(`[OCR/PP-OCRv5+Layout] 표 필터링 결과 너무 적음 (${filtered.length}/${allCells.length}) → 원본 사용`);
          }
        } else {
          console.log(`[OCR/PP-OCRv5+Layout] 표 검출 안 됨 → 원본 사용`);
        }
      }
    } catch (e: any) {
      console.warn(`[OCR/PP-OCRv5+Layout] 실패, fallback 사용: ${e?.message}`);
    }
  }

  // 1.45) SLANet-plus 로 표 구조 검출 시도 (기본 ON, 실패 시 조용히 fallback)
  //       6.8MB 경량 · CPU 100ms · TATR 대체
  if (USE_SLANET && isSlanetAvailable()) {
    try {
      const slanet = await detectTableSlanet(b64);
      if (slanet.cells.length >= 4 && slanet.rows >= 2 && slanet.cols >= 3) {
        const structure = slanetToTableStructure(slanet);
        const allCells = layoutFilteredLines.flat();
        const { headerRowIdx, matrix } = buildMatrixFromTatr(allCells, structure);
        if (headerRowIdx >= 0) {
          const headers = matrix[headerRowIdx];
          const dataRows = matrix.slice(headerRowIdx + 1).filter(row => {
            const nonEmpty = row.filter(c => c && c.trim());
            return nonEmpty.length >= 2 && !isMostlyNumeric(row) && !isTotalRowStr(row);
          });
          console.log(`[OCR/PP-OCRv5+SLANet] 셀 ${slanet.cells.length}개 · 헤더=${JSON.stringify(headers)} · 행=${dataRows.length}`);
          return { headers, rows: dataRows, meta, rawText: fullText };
        }
        console.log(`[OCR/PP-OCRv5+SLANet] 매트릭스 구성 OK 이나 헤더 탐지 실패 → fallback`);
      } else {
        console.log(`[OCR/PP-OCRv5+SLANet] 표 구조 불충분 (셀=${slanet.cells.length}, rows=${slanet.rows}, cols=${slanet.cols}) → fallback`);
      }
    } catch (e: any) {
      console.warn(`[OCR/PP-OCRv5+SLANet] 실패, fallback: ${e?.message}`);
    }
  }

  // 1.5) TATR 로 표 구조 검출 시도 (실패 시 fallback 파이프라인)
  if (USE_TATR) {
    try {
      const structure = await detectTableStructure(b64, 0.6);
      if (structure.rows.length >= 2 && structure.cols.length >= 3) {
        const allCells = layoutFilteredLines.flat();
        const { headerRowIdx, matrix } = buildMatrixFromTatr(allCells, structure);
        if (headerRowIdx >= 0) {
          const headers = matrix[headerRowIdx].filter(Boolean);
          const dataRows = matrix.slice(headerRowIdx + 1).filter(row => {
            const nonEmpty = row.filter(c => c && c.trim());
            return nonEmpty.length >= 2 && !isMostlyNumeric(row) && !isTotalRowStr(row);
          });
          console.log(`[OCR/PP-OCRv5+TATR] 헤더=${JSON.stringify(matrix[headerRowIdx])}, 행=${dataRows.length}`);
          return { headers: matrix[headerRowIdx], rows: dataRows, meta, rawText: fullText };
        }
        console.log(`[OCR/PP-OCRv5+TATR] TATR 셀 매트릭스 구성됐으나 헤더 탐지 실패 — fallback`);
      } else {
        console.log(`[OCR/PP-OCRv5+TATR] TATR 표 구조 불충분 (rows=${structure.rows.length}, cols=${structure.cols.length}) — fallback`);
      }
    } catch (e: any) {
      console.warn("[OCR/PP-OCRv5+TATR] TATR 실패, fallback 사용:", e?.message);
    }
  }

  // 2) fallback: y좌표 기반 재클러스터링 (layout 필터 적용된 셀 사용)
  const reflowed = reflowRows(layoutFilteredLines);

  // 3) 헤더 행 탐지
  const { headerIdx, headerScore } = findHeaderRow(reflowed);

  // 헤더 못 찾으면 → 패턴 기반 fallback 시도 (세로로 흩어진 헤더·1행짜리 명세서 등)
  if (headerIdx < 0 || headerScore < 3) {
    console.log(`[OCR/PP-OCRv5] 헤더 인식 실패 (headerIdx=${headerIdx}, score=${headerScore}) — 패턴 fallback 시도`);
    const fallback = extractByPattern(reflowed);
    if (fallback.rows.length > 0) {
      console.log(`[OCR/PP-OCRv5] 패턴 fallback 성공 · 행=${fallback.rows.length}`);
      return { headers: fallback.headers, rows: fallback.rows, meta, rawText: fullText };
    }
    return {
      headers: [],
      rows: reflowed.map(row => row.map(c => c.text.trim())),
      meta,
      rawText: fullText,
    };
  }

  // 4) 헤더 셀 X 중심좌표
  const headerRow = reflowed[headerIdx];
  const headers = headerRow.map(c => c.text.trim());
  const colXs = headerRow.map(cellCx);

  // 5) 데이터 행(헤더 이후) 셀을 헤더 컬럼 X좌표에 정렬
  const dataRows = reflowed.slice(headerIdx + 1);
  const alignedRows = dataRows
    .map(row => alignRowToColumns(row, colXs))
    .filter(row => {
      const nonNull = row.filter(c => c != null && c!.trim() !== "");
      // 셀 2개 이상 · 순수 숫자만 아님 · 소계 행 아님
      return nonNull.length >= 2 && !isMostlyNumeric(row) && !isTotalRow(row);
    });

  console.log(`[OCR/PP-OCRv5] 헤더=${JSON.stringify(headers)}, 행=${alignedRows.length}`);

  return {
    headers,
    rows: alignedRows as (string | number | null)[][],
    meta,
    rawText: fullText,
  };
}

/** 문자열 배열이 소계·합계 행인지 판정 (TATR 매트릭스용) */
function isTotalRowStr(row: string[]): boolean {
  const joined = row.filter(c => c).join(" ");
  return TOTAL_RE.test(joined);
}

/**
 * 헤더 인식 실패 시 패턴 기반 데이터 추출 (2026-07-09 fallback)
 *
 * 세로로 헤더가 흩어진 명세서·1행짜리 명세서를 살리기 위한 최후 수단.
 *
 * 규칙:
 *   - 데이터 행 = "한글/영문 텍스트 (품명)" 과 "3+ 숫자" 가 연속 라인에 있음
 *   - 상품명 후보: 한글 3자+ 또는 괄호 포함 텍스트
 *   - 수량/단가/금액 후보: 쉼표 있는 숫자 or 순수 정수
 *   - 규격 후보: 숫자+단위 (mg, ml, T, C, EA, p 등)
 */
function extractByPattern(rows: Cell[][]): { headers: string[]; rows: (string | number | null)[][] } {
  // 모든 셀을 flatten
  const allCells = rows.flat();
  if (allCells.length === 0) return { headers: [], rows: [] };

  // 후보 분류
  const nameCells: Cell[] = [];
  const numCells: { cell: Cell; value: number }[] = [];
  const specCells: Cell[] = [];

  const SPEC_UNIT = /^\d+\s*(mg|mcg|ug|μg|g|kg|ml|mL|L|IU|mEq|%|T|C|V|정|캡슐|포|개|EA|ea|BOX|박스|호|p)$/i;

  for (const c of allCells) {
    const t = c.text.trim();
    if (!t) continue;
    // 제외: 소계·합계·공급자·수신자 라벨 텍스트
    if (/합\s*계|소\s*계|공\s*급|부\s*가\s*세|잔\s*액|비고|규\s*격|수\s*량|단\s*가|금\s*액|품\s*명/.test(t)) continue;
    // 제외: 배송·행정 정보 (차량번호·기사명·담당자·배송처 등)
    if (isDeliveryOrAdminInfo(t)) continue;

    // 규격 후보
    if (SPEC_UNIT.test(t)) { specCells.push(c); continue; }

    // 숫자 (쉼표 or 순수 정수)
    const cleaned = t.replace(/[,\s]/g, "");
    if (/^\d+(\.\d+)?$/.test(cleaned)) {
      const n = parseFloat(cleaned);
      if (Number.isFinite(n) && n > 0 && n < 1e10) {
        numCells.push({ cell: c, value: n });
        continue;
      }
    }

    // 상품명 후보 (한글 3자+ 포함, 순수 숫자 아님)
    if (/[가-힣]{3,}/.test(t)) {
      nameCells.push(c);
    }
  }

  if (nameCells.length === 0 || numCells.length < 2) {
    return { headers: [], rows: [] };
  }

  // 상품명 별로: 근처 (y좌표 가까운) 숫자·규격 셀 수집
  const HEADERS = ["품명", "수량", "단가", "금액", "규격", "유통기한", "비고"];
  const outRows: (string | number | null)[][] = [];

  for (const nameCell of nameCells) {
    const nameY = nameCell.box.y + nameCell.box.height / 2;
    const nameH = nameCell.box.height;
    // 같은 행 or 인접 아래행: 세로로 흩어진 명세서(경방신약 등) 대응 → 아래로 최대 6H
    // 위로는 2H (헤더 라벨은 제외)
    const upThresh = nameH * 2;
    const downThresh = nameH * 6;
    const isNearby = (cellY: number) => {
      const dy = cellY - nameY;
      return dy > -upThresh && dy < downThresh;
    };

    const nearbyNums = numCells
      .filter(n => isNearby(n.cell.box.y + n.cell.box.height / 2))
      .sort((a, b) => {
        // 우선 y 좌표(같은 행) · 그다음 x
        const dy = (a.cell.box.y + a.cell.box.height / 2) - (b.cell.box.y + b.cell.box.height / 2);
        if (Math.abs(dy) > nameH * 0.7) return dy;
        return a.cell.box.x - b.cell.box.x;
      });
    const nearbySpecs = specCells.filter(s => isNearby(s.box.y + s.box.height / 2));

    if (nearbyNums.length < 2) continue;

    // 수량 × 단가 = 금액 관계로 3개 숫자 찾기 (경방신약 명세서 케이스)
    // 3개 이상 숫자 조합에서 수학 관계 만족하는 조합 우선 채택
    let qty: number | null = null, price: number | null = null, amt: number | null = null;

    if (nearbyNums.length >= 3) {
      // 모든 3개 조합에서 수학 관계 만족하는 것 탐색
      const vals = nearbyNums.map(n => n.value);
      let bestQPA: [number, number, number] | null = null;
      for (let i = 0; i < vals.length; i++) {
        for (let j = 0; j < vals.length; j++) {
          if (j === i) continue;
          for (let k = 0; k < vals.length; k++) {
            if (k === i || k === j) continue;
            const q = vals[i], p = vals[j], a = vals[k];
            // 수량은 대체로 작은 정수, 단가·금액은 크고, 금액 = 수량 × 단가
            if (q > 0 && q < 100000 && p > 0 && a > 0 && Math.abs(q * p - a) <= Math.max(1, a * 0.02)) {
              bestQPA = [q, p, a];
              break;
            }
          }
          if (bestQPA) break;
        }
        if (bestQPA) break;
      }
      if (bestQPA) {
        [qty, price, amt] = bestQPA;
      } else {
        // 관계 못 찾으면 마지막 3개 (경방신약 원본 순서: 수량 단가 금액)
        [qty, price, amt] = nearbyNums.slice(-3).map(n => n.value);
      }
    } else if (nearbyNums.length === 2) {
      [price, amt] = nearbyNums.slice(-2).map(n => n.value);
    }

    const spec = nearbySpecs[0]?.text.trim() ?? null;
    outRows.push([nameCell.text.trim(), qty, price, amt, spec, null, null]);
  }

  return outRows.length > 0 ? { headers: HEADERS, rows: outRows } : { headers: [], rows: [] };
}

/** rawText에서 supplier·date·소계·공급가액·세액·합계·잔액 추출 */
function extractMeta(text: string): Record<string, any> {
  const meta: Record<string, any> = {};

  const dateM = text.match(/(\d{4})[년.\-\/]\s*(\d{1,2})[월.\-\/]\s*(\d{1,2})[일]?/);
  if (dateM) meta.date = `${dateM[1]}-${dateM[2].padStart(2, "0")}-${dateM[3].padStart(2, "0")}`;

  // ═══ 공급사 추출 단계별 로그 (2026-07-14) ═══
  console.log(`[supplier/①공급자라벨] 시도 · rawText ${text.length}자`);
  const supM = text.match(/공\s*급\s*[자처사]\s*[:\s]*([가-힣a-zA-Z0-9()（）\s]{2,30})/);
  if (supM) {
    const raw = supM[1].trim();
    const cand = raw.split(/\s{2,}/)[0];
    const isAdmin = isDeliveryOrAdminInfo(cand);
    console.log(`[supplier/①공급자라벨] 매치 "${raw}" → 후보 "${cand}" · 행정정보=${isAdmin}`);
    if (!isAdmin) {
      meta.supplier = cand;
      console.log(`[supplier/①공급자라벨] ✅ 채택 "${cand}"`);
    }
  } else {
    console.log(`[supplier/①공급자라벨] 매치 없음`);
  }

  // 상호 라벨 폴백
  if (!meta.supplier) {
    console.log(`[supplier/②상호라벨] 시도 (공급자 라벨 실패)`);
    const shoResult = extractSupplierFromRawText(text);
    console.log(`[supplier/②상호라벨] 결과 supplier="${shoResult.supplier}" · bizNum="${shoResult.supplierBizNum}" · source=${shoResult.source}`);
    if (shoResult.supplier) {
      const isAdmin = isDeliveryOrAdminInfo(shoResult.supplier);
      if (!isAdmin) {
        meta.supplier = shoResult.supplier;
        console.log(`[supplier/②상호라벨] ✅ 채택 "${shoResult.supplier}"`);
      } else {
        console.log(`[supplier/②상호라벨] ⚠ 행정정보 판정 · 스킵`);
      }
    } else {
      console.log(`[supplier/②상호라벨] 추출 실패`);
    }
  }
  console.log(`[supplier/최종meta] meta.supplier = "${meta.supplier ?? "(없음)"}"`);

  // 쉼표 있는 숫자만 추출 (코드/일련번호 오인식 방지)
  const findAmt = (patterns: RegExp[]): number | null => {
    for (const pat of patterns) {
      const m = text.match(pat);
      if (m) {
        const n = parseInt(m[1].replace(/,/g, ""), 10);
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    return null;
  };

  // 2026-07-16 · 소계·공급가액·세액·잔액 regex 관대화
  //   기존: `\d{1,3}(?:,\d{3})+` 만 매치 → 쉼표 없는 숫자 (예: "25044", "1000000") 놓침
  //   개선: `\d{1,3}(?:,\d{3})+|\d{4,}` 로 쉼표 없는 4자리+ 정수도 허용
  //   목적: 다양한 명세서 대응 (일부 OCR 이 쉼표를 놓치는 케이스 방어)
  const NUM_LOOSE = `(\\d{1,3}(?:,\\d{3})+|\\d{4,})`;
  const subtotalV = findAmt([new RegExp(`소\\s*계[^\\d]*${NUM_LOOSE}`)]);
  const discountV = findAmt([
    new RegExp(`에누리\\s*액?[^\\d]*${NUM_LOOSE}`),
    new RegExp(`할\\s*인\\s*액?[^\\d]*${NUM_LOOSE}`),
  ]);
  const supplyAmountV = findAmt([new RegExp(`공\\s*급\\s*가\\s*액[^\\d]*${NUM_LOOSE}`)]);
  const vatV = findAmt([new RegExp(`세\\s*액[^\\d]*${NUM_LOOSE}`), new RegExp(`부\\s*가\\s*세[^\\d]*${NUM_LOOSE}`)]);
  const balancePrevV = findAmt([new RegExp(`전\\s*잔\\s*액[^\\d]*${NUM_LOOSE}`), new RegExp(`이\\s*월\\s*잔\\s*액[^\\d]*${NUM_LOOSE}`)]);
  const balanceAfterV = findAmt([new RegExp(`(?<!전\\s*)(?<!이\\s*월\\s*)잔\\s*액[^\\d]*${NUM_LOOSE}`)]);

  if (subtotalV) meta.subtotal = subtotalV;
  if (discountV) meta.discount = discountV;
  if (supplyAmountV) meta.supplyAmount = supplyAmountV;
  if (vatV) meta.vat = vatV;
  if (balancePrevV) meta.balancePrev = balancePrevV;
  if (balanceAfterV) meta.balanceAfter = balanceAfterV;

  // total 추출: 라벨 특정성 우선 · Math.max 금지 (누적잔액 오염 방지)
  //   1) "합계금액" > "총합계" > "총금액" > "합계"(합계액 제외) 순서
  //   2) [^\d]{0,20} 로 바운드 → 여러 라인 흡수 방지
  //   3) total == balancePrev/balanceAfter 면 잔고 오염이므로 무효화
  // 2026-07-16 · total 도 관대화 · 쉼표 없는 큰 숫자도 허용
  const totalPatterns: Array<[string, RegExp]> = [
    ["합계금액", new RegExp(`합\\s*계\\s*금\\s*액[^\\d]{0,20}${NUM_LOOSE}`)],
    ["총합계",   new RegExp(`총\\s*합\\s*계[^\\d]{0,20}${NUM_LOOSE}`)],
    ["총금액",   new RegExp(`총\\s*금\\s*액[^\\d]{0,20}${NUM_LOOSE}`)],
    ["합계",     new RegExp(`합\\s*계(?!\\s*액)[^\\d]{0,20}${NUM_LOOSE}`)],
  ];
  for (const [, pat] of totalPatterns) {
    const m = text.match(pat);
    if (m) {
      const val = Number(m[1].replace(/,/g, ""));
      if (val > 0) { meta.total = val; break; }
    }
  }
  // 잔고 오염 방지: total 이 balancePrev/balanceAfter 와 같으면 무효화
  if (meta.total != null) {
    if (meta.total === meta.balancePrev || meta.total === meta.balanceAfter) {
      delete meta.total;
    }
  }

  return meta;
}

export async function prewarmPpuOcr(): Promise<void> {
  try { await getOcrInstance(); }
  catch (e: any) { console.warn("[OCR/PP-OCRv5] prewarm 실패 (무시):", e?.message); }
}
