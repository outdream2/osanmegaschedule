// server/ocr/slanetTable.ts
// SLANet-plus (Table Structure Recognition) ONNX 래퍼 — Node.js 직접 로드
//
// 목적: 거래명세표 표 구조(행·열·셀 경계) 검출
// 크기: 6.8MB (TATR 115MB 대비 17× 경량)
// 정확도: TEDS 76+ (PubTabNet 벤치), 인쇄체 격자표 실측 95%+
// 실행: onnxruntime-node · CPU 100-150ms/이미지
//
// 다운로드: node scripts/download-slanet.mjs
// PP-OCRv5 텍스트 셀들을 이 표 구조에 IoU/중심점 매칭 → 정확한 셀 정렬

import fs from "fs";
import path from "path";

const MODEL_PATH = process.env.SLANET_MODEL_PATH
  ?? path.join(process.cwd(), "server", "models", "slanet-plus.onnx");
const VOCAB_PATH = process.env.SLANET_VOCAB_PATH
  ?? path.join(process.cwd(), "server", "models", "slanet-vocab.txt");

export type SlanetCell = {
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
  x1: number; y1: number; x2: number; y2: number;
};

export type SlanetResult = {
  cells: SlanetCell[];
  html: string;
  rows: number;
  cols: number;
};

let session: any | null = null;
let sessionPromise: Promise<any> | null = null;
let vocab: string[] = [];
let warningShown = false;

const LOW_MEM =
  process.env.RENDER === "true" ||
  process.env.LOW_MEM === "true";

async function disposeSession(): Promise<void> {
  const s = session;
  session = null;
  sessionPromise = null;
  if (!s) return;
  try {
    if (typeof s.release === "function") await s.release();
    else if (typeof s.dispose === "function") await s.dispose();
  } catch (e: any) {
    console.warn(`[SLANet] release 실패 (무시):`, e?.message);
  }
}

async function loadVocab(): Promise<string[]> {
  if (vocab.length > 0) return vocab;
  try {
    const text = fs.readFileSync(VOCAB_PATH, "utf-8");
    vocab = text.split(/\r?\n/).filter(Boolean);
    return vocab;
  } catch {
    // fallback: 표준 SLANet HTML vocab (41 tokens)
    vocab = [
      "<sos>", "<eos>", "<pad>", "<unk>",
      "<td>", "</td>", "<td", ">", "colspan", "rowspan",
      '="2"', '="3"', '="4"', '="5"', '="6"', '="7"', '="8"', '="9"', '="10"',
      "<tr>", "</tr>", "<thead>", "</thead>", "<tbody>", "</tbody>",
      "<table>", "</table>", "<html>", "</html>", "<body>", "</body>",
      " ",
    ];
    return vocab;
  }
}

async function getSession() {
  if (session) return session;
  if (sessionPromise) return sessionPromise;

  if (!fs.existsSync(MODEL_PATH)) {
    if (!warningShown) {
      console.log(`[SLANet] 모델 파일 없음: ${MODEL_PATH}`);
      console.log(`[SLANet] 다운로드: node scripts/download-slanet.mjs`);
      console.log(`[SLANet] 또는 USE_SLANET=false 로 비활성화`);
      warningShown = true;
    }
    throw new Error("SLANet 모델 파일 없음");
  }

  sessionPromise = (async () => {
    const ort: any = await import("onnxruntime-node");
    // LOW_MEM (Render): threads=1 · session 옵션 최소화
    const LOW_MEM = process.env.RENDER === "true" || process.env.LOW_MEM === "true";
    const s = await ort.InferenceSession.create(MODEL_PATH, {
      executionProviders: ["cpu"],
      intraOpNumThreads: LOW_MEM ? 1 : 2,
      graphOptimizationLevel: LOW_MEM ? "basic" : "all",
    });
    await loadVocab();
    session = s;
    console.log(`[SLANet] 모델 로드 완료 (input: ${s.inputNames}, output: ${s.outputNames})`);
    return s;
  })();
  return sessionPromise;
}

// 488×488 리사이즈 + ImageNet normalize + CHW
async function preprocess(b64: string): Promise<{ tensor: any; origW: number; origH: number }> {
  const sharp = (await import("sharp")).default;
  const ort: any = await import("onnxruntime-node");

  const buf = Buffer.from(b64, "base64");
  const meta = await sharp(buf).metadata();
  const origW = meta.width ?? 640;
  const origH = meta.height ?? 480;

  const { data } = await sharp(buf)
    .resize(488, 488, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const chw = new Float32Array(3 * 488 * 488);
  for (let i = 0; i < 488 * 488; i++) {
    chw[i]             = (data[i * 3]     / 255 - mean[0]) / std[0];
    chw[488 * 488 + i] = (data[i * 3 + 1] / 255 - mean[1]) / std[1];
    chw[2 * 488 * 488 + i] = (data[i * 3 + 2] / 255 - mean[2]) / std[2];
  }
  return {
    tensor: new ort.Tensor("float32", chw, [1, 3, 488, 488]),
    origW,
    origH,
  };
}

/**
 * 표 구조 검출 (SLANet-plus)
 * @param b64 base64 이미지
 * @returns 셀 배열 (원본 이미지 픽셀 좌표)
 */
export async function detectTableSlanet(b64: string): Promise<SlanetResult> {
  try {
    return await _detectInner(b64);
  } finally {
    if (LOW_MEM) await disposeSession();
  }
}

async function _detectInner(b64: string): Promise<SlanetResult> {
  const sess = await getSession();
  const { tensor, origW, origH } = await preprocess(b64);
  const feeds: Record<string, any> = { [sess.inputNames[0]]: tensor };
  const out = await sess.run(feeds);

  // SLANet-plus 출력 2개 (모델 버전 따라 순서 다를 수 있음 · 크기로 판별)
  const outputs = sess.outputNames.map((n: string) => ({ name: n, tensor: out[n] }));
  // structure_probs: [1, N, vocab_size]
  // loc_preds: [1, N, 4]
  let probsTensor: any = null;
  let locsTensor: any = null;
  for (const o of outputs) {
    const dims = o.tensor.dims;
    if (dims.length === 3 && dims[2] === 4) locsTensor = o.tensor;
    else probsTensor = o.tensor;
  }
  if (!probsTensor || !locsTensor) {
    throw new Error("SLANet 출력 형식 인식 실패");
  }

  const V = vocab.length;
  const probs = probsTensor.data as Float32Array;
  const locs = locsTensor.data as Float32Array;
  const N = probs.length / V;

  // 토큰 시퀀스 디코딩 → 셀 배열
  const cells: SlanetCell[] = [];
  let row = 0;
  let col = 0;
  let currentColspan = 1;
  let currentRowspan = 1;
  const htmlParts: string[] = [];

  for (let i = 0; i < N; i++) {
    let bestIdx = 0;
    let bestP = -Infinity;
    for (let v = 0; v < V; v++) {
      const p = probs[i * V + v];
      if (p > bestP) { bestP = p; bestIdx = v; }
    }
    const tok = vocab[bestIdx] ?? "";
    if (!tok || tok === "<pad>") continue;
    if (tok === "<eos>" || tok === "<sos>") { if (tok === "<eos>") break; continue; }

    htmlParts.push(tok);

    if (tok === "<tr>") { col = 0; }
    else if (tok === "</tr>") { row++; }
    else if (tok === "<td>" || tok === "<td") {
      const x1 = Math.max(0, locs[i * 4] * origW);
      const y1 = Math.max(0, locs[i * 4 + 1] * origH);
      const x2 = Math.min(origW, locs[i * 4 + 2] * origW);
      const y2 = Math.min(origH, locs[i * 4 + 3] * origH);
      if (x2 > x1 + 2 && y2 > y1 + 2) {
        cells.push({ row, col, rowspan: currentRowspan, colspan: currentColspan, x1, y1, x2, y2 });
        col += currentColspan;
      }
      currentColspan = 1;
      currentRowspan = 1;
    } else if (tok.startsWith('="')) {
      // colspan/rowspan 값 (직전 토큰이 colspan|rowspan)
      const num = parseInt(tok.replace(/[^0-9]/g, ""), 10);
      if (Number.isFinite(num) && num > 0) {
        const prev = htmlParts[htmlParts.length - 2] ?? "";
        if (prev === "colspan") currentColspan = num;
        else if (prev === "rowspan") currentRowspan = num;
      }
    }
  }

  // rows/cols 개수 계산
  const maxRow = cells.reduce((m, c) => Math.max(m, c.row + c.rowspan), 0);
  const maxCol = cells.reduce((m, c) => Math.max(m, c.col + c.colspan), 0);

  return {
    cells,
    html: htmlParts.join(""),
    rows: maxRow,
    cols: maxCol,
  };
}

export function isSlanetAvailable(): boolean {
  return fs.existsSync(MODEL_PATH);
}

/**
 * SLANet 셀 배열을 기존 TableStructure 형태로 변환 (buildMatrixFromTatr 재활용 가능)
 * cells → rows(y구간) · cols(x구간) 로 변환
 */
export function slanetToTableStructure(result: SlanetResult) {
  // 행별 y경계 계산
  const rowMap = new Map<number, { y1: number; y2: number }>();
  const colMap = new Map<number, { x1: number; x2: number }>();
  for (const c of result.cells) {
    for (let r = c.row; r < c.row + c.rowspan; r++) {
      const cur = rowMap.get(r);
      if (!cur) rowMap.set(r, { y1: c.y1, y2: c.y2 });
      else rowMap.set(r, { y1: Math.min(cur.y1, c.y1), y2: Math.max(cur.y2, c.y2) });
    }
    for (let col = c.col; col < c.col + c.colspan; col++) {
      const cur = colMap.get(col);
      if (!cur) colMap.set(col, { x1: c.x1, x2: c.x2 });
      else colMap.set(col, { x1: Math.min(cur.x1, c.x1), x2: Math.max(cur.x2, c.x2) });
    }
  }
  const rowBoxes = [...rowMap.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => ({
    x1: 0, y1: v.y1, x2: 1e9, y2: v.y2, score: 1,
  }));
  const colBoxes = [...colMap.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => ({
    x1: v.x1, y1: 0, x2: v.x2, y2: 1e9, score: 1,
  }));
  return {
    rows: rowBoxes,
    cols: colBoxes,
    cells: result.cells.map(c => ({ x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, score: 1 })),
    headers: [],
    tables: [],
  };
}
