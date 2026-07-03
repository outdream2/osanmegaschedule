// onnxruntime-node는 top-level import 하지 않음.
// 모델 파일이 실제로 존재할 때만 동적 import해서 메모리 낭비를 막는다.
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const MODELS_DIR  = path.join(process.cwd(), "server", "models");
const ONNX_PATH   = path.join(MODELS_DIR, "best.onnx");
const PT_PATH     = path.join(MODELS_DIR, "best.pt");
const INPUT_SIZE  = 640;
const CONF_THRESHOLD = 0.25;
const IOU_THRESHOLD  = 0.45;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ort: any = null; // onnxruntime-node — loaded lazily
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let session: any = null; // ort.InferenceSession
let loadAttempted = false;

async function convertPtToOnnx(): Promise<boolean> {
  console.log("[StockCounter] best.pt 발견 — Python으로 ONNX 변환 시작...");
  const script = [
    "from ultralytics import YOLO",
    `YOLO(r'${PT_PATH.replace(/\\/g, "\\\\")}').export(format='onnx', imgsz=640, simplify=True)`,
  ].join("; ");

  // python3 우선, 없으면 python
  for (const bin of ["python3", "python"]) {
    try {
      const { stdout, stderr } = await execFileAsync(bin, ["-c", script], { timeout: 180_000 });
      if (stdout) console.log("[StockCounter] python stdout:", stdout.trim());
      if (stderr) console.log("[StockCounter] python stderr:", stderr.trim());
      if (fs.existsSync(ONNX_PATH)) {
        console.log("[StockCounter] ONNX 변환 완료:", ONNX_PATH);
        return true;
      }
    } catch (_) {
      // 다음 bin 시도
    }
  }
  console.error("[StockCounter] ONNX 변환 실패 — Python + ultralytics가 설치되어 있는지 확인하세요");
  console.error("  pip install ultralytics");
  return false;
}

export async function loadStockCountModel(): Promise<boolean> {
  if (loadAttempted) return session !== null;
  loadAttempted = true;

  // 1) best.onnx 없고 best.pt 있으면 자동 변환
  if (!fs.existsSync(ONNX_PATH) && fs.existsSync(PT_PATH)) {
    const ok = await convertPtToOnnx();
    if (!ok) return false;
  }

  if (!fs.existsSync(ONNX_PATH)) {
    // 모델 파일 없음 — onnxruntime-node 로드 자체를 건너뜀 (메모리 절약)
    console.log("[StockCounter] 모델 없음 — server/models/에 best.pt 또는 best.onnx를 넣어주세요");
    return false;
  }

  try {
    // 모델 파일이 실제로 있을 때만 onnxruntime-node를 동적 import
    if (!ort) {
      ort = await import("onnxruntime-node");
    }
    session = await ort.InferenceSession.create(ONNX_PATH);
    console.log("[StockCounter] ONNX 모델 로드 완료:", ONNX_PATH);
    return true;
  } catch (e: any) {
    console.error("[StockCounter] 모델 로드 실패:", e.message);
    return false;
  }
}

export function isStockCountModelLoaded(): boolean {
  return session !== null;
}

// base64 → Buffer → 640×640 CHW float32
async function preprocessBase64(b64: string): Promise<Float32Array> {
  const buf = Buffer.from(b64, "base64");
  const { data, info } = await sharp(buf)
    .resize(INPUT_SIZE, INPUT_SIZE, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const n = INPUT_SIZE * INPUT_SIZE;
  const floats = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    floats[i]         = data[i * 3]     / 255.0; // R
    floats[n + i]     = data[i * 3 + 1] / 255.0; // G
    floats[2 * n + i] = data[i * 3 + 2] / 255.0; // B
  }
  return floats;
}

function iou(a: number[], b: number[]): number {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]), y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const ua = (a[2] - a[0]) * (a[3] - a[1]);
  const ub = (b[2] - b[0]) * (b[3] - b[1]);
  return inter / (ua + ub - inter + 1e-6);
}

function nms(boxes: number[][], scores: number[]): number[] {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const keep: number[] = [];
  const suppressed = new Set<number>();
  for (const i of idx) {
    if (suppressed.has(i)) continue;
    keep.push(i);
    for (const j of idx) {
      if (j !== i && !suppressed.has(j) && iou(boxes[i], boxes[j]) > IOU_THRESHOLD) suppressed.add(j);
    }
  }
  return keep;
}

export interface DetectionResult {
  count: number;
  boxes: Array<{ x1: number; y1: number; x2: number; y2: number; score: number }>;
}

export async function countObjectsInImage(b64: string): Promise<DetectionResult> {
  if (!session) throw new Error("모델 미로드 — server/models/best.onnx를 추가하세요");

  const inputData = await preprocessBase64(b64);
  const tensor = new ort.Tensor("float32", inputData, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const feeds: Record<string, unknown> = { [session.inputNames[0]]: tensor };
  const out = await session.run(feeds);

  // YOLOv8 export 포맷: output0 shape [1, 4+numClasses, numAnchors]
  const rawOut = out[session.outputNames[0]];
  const [, rowCount, anchors] = rawOut.dims as number[];
  const data = rawOut.data as Float32Array;

  const boxes: number[][] = [];
  const scores: number[] = [];

  for (let a = 0; a < anchors; a++) {
    const cx = data[0 * anchors + a];
    const cy = data[1 * anchors + a];
    const w  = data[2 * anchors + a];
    const h  = data[3 * anchors + a];

    // 클래스 점수 최대값
    let maxScore = 0;
    for (let c = 4; c < rowCount; c++) {
      const s = data[c * anchors + a];
      if (s > maxScore) maxScore = s;
    }

    if (maxScore >= CONF_THRESHOLD) {
      boxes.push([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]);
      scores.push(maxScore);
    }
  }

  const kept = nms(boxes, scores);
  return {
    count: kept.length,
    boxes: kept.map(i => ({
      x1: boxes[i][0] / INPUT_SIZE,
      y1: boxes[i][1] / INPUT_SIZE,
      x2: boxes[i][2] / INPUT_SIZE,
      y2: boxes[i][3] / INPUT_SIZE,
      score: Math.round(scores[i] * 100),
    })),
  };
}
