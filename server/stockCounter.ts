import sharp from "sharp";
import path from "path";
import fs from "fs";
import { execFile, spawn } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const MODELS_DIR  = path.join(process.cwd(), "server", "models");
const ONNX_PATH   = path.join(MODELS_DIR, "sku110k-yolo11-n640.onnx");
const PT_PATH     = path.join(MODELS_DIR, "sku110k-yolo11-n640.pt");
const YOLO_SERVER_URL = "http://localhost:8002";
const INPUT_SIZE  = 640;
const CONF_THRESHOLD = 0.25;
const IOU_THRESHOLD  = 0.45;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ort: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let session: any = null;
let useYoloServer = false;   // Python YOLO 서버 사용 여부
let yoloServerProc: ReturnType<typeof spawn> | null = null;
let loadAttempted = false;
let loadStatusReason = "";

// ── Python YOLO 서버 ─────────────────────────────────────────────────────────

const PYTHON_BINS = ["python3", "py", "python"];

async function findPythonBin(): Promise<string | null> {
  for (const bin of PYTHON_BINS) {
    try {
      await execFileAsync(bin, ["-c", "import ultralytics"], { timeout: 10_000 });
      return bin;
    } catch {
      // 다음 시도
    }
  }
  return null;
}

async function startYoloServer(pythonBin: string): Promise<boolean> {
  if (yoloServerProc) return true;
  const scriptPath = path.join(process.cwd(), "scripts", "yolo_server.py");
  if (!fs.existsSync(scriptPath)) return false;

  console.log("[StockCounter] Python YOLO 서버 시작 중...");
  yoloServerProc = spawn(pythonBin, [scriptPath], {
    env: { ...process.env, PYTHONIOENCODING: "utf-8", YOLO_VERBOSE: "False" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  yoloServerProc.stdout?.on("data", (d: Buffer) => process.stdout.write(`[YOLO Server] ${d}`));
  yoloServerProc.stderr?.on("data", (d: Buffer) => process.stderr.write(`[YOLO Server ERR] ${d}`));
  yoloServerProc.on("exit", code => {
    console.log(`[YOLO Server] 종료됨 (code=${code})`);
    yoloServerProc = null;
  });

  // 최대 30초 대기
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const r = await fetch(`${YOLO_SERVER_URL}/health`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) { console.log("[StockCounter] Python YOLO 서버 준비 완료"); return true; }
    } catch {}
  }
  console.error("[StockCounter] Python YOLO 서버 시작 실패");
  yoloServerProc?.kill();
  yoloServerProc = null;
  return false;
}

// ── ONNX 경로 ────────────────────────────────────────────────────────────────

async function convertPtToOnnx(pythonBin: string): Promise<boolean> {
  console.log("[StockCounter] best.pt → ONNX 변환 중...");
  const script = [
    "from ultralytics import YOLO",
    `YOLO(r'${PT_PATH.replace(/\\/g, "\\\\")}').export(format='onnx', imgsz=640, simplify=True)`,
  ].join("; ");

  try {
    const { stdout, stderr } = await execFileAsync(pythonBin, ["-c", script], { timeout: 180_000 });
    if (stdout) console.log("[StockCounter] python stdout:", stdout.trim());
    if (stderr) console.log("[StockCounter] python stderr:", stderr.trim());
    if (fs.existsSync(ONNX_PATH)) {
      console.log("[StockCounter] ONNX 변환 완료:", ONNX_PATH);
      return true;
    }
  } catch (e: any) {
    console.warn("[StockCounter] ONNX 변환 실패:", e.message);
  }
  return false;
}

export async function loadStockCountModel(): Promise<boolean> {
  if (loadAttempted) return session !== null || useYoloServer;
  loadAttempted = true;

  // 1) best.onnx가 있으면 onnxruntime-node로 직접 로드
  if (fs.existsSync(ONNX_PATH)) {
    try {
      if (!ort) ort = await import("onnxruntime-node");
      session = await ort.InferenceSession.create(ONNX_PATH);
      console.log("[StockCounter] ONNX 모델 로드 완료:", ONNX_PATH);
      loadStatusReason = "ONNX 모델 로드 완료";
      return true;
    } catch (e: any) {
      console.error("[StockCounter] ONNX 로드 실패:", e.message);
      loadStatusReason = `ONNX 로드 실패: ${e.message}`;
    }
  }

  // 2) best.pt가 있으면 Python 경로 시도
  if (fs.existsSync(PT_PATH)) {
    const pythonBin = await findPythonBin();

    if (pythonBin) {
      // 2a) Python YOLO 서버 방식 (우선, 변환 불필요)
      const ok = await startYoloServer(pythonBin);
      if (ok) {
        useYoloServer = true;
        loadStatusReason = "Python YOLO 서버 실행 중";
        return true;
      }
      loadStatusReason = "Python YOLO 서버 시작 실패";

      // 2b) ONNX 변환 후 onnxruntime-node 방식
      const converted = await convertPtToOnnx(pythonBin);
      if (converted) {
        try {
          if (!ort) ort = await import("onnxruntime-node");
          session = await ort.InferenceSession.create(ONNX_PATH);
          console.log("[StockCounter] ONNX 모델 로드 완료 (변환 후)");
          loadStatusReason = "ONNX 변환 후 로드 완료";
          return true;
        } catch (e: any) {
          console.error("[StockCounter] 변환 후 ONNX 로드 실패:", e.message);
          loadStatusReason = `ONNX 변환 후 로드 실패: ${e.message}`;
        }
      } else {
        loadStatusReason = "ONNX 변환 실패 (ultralytics 오류)";
      }
    } else {
      loadStatusReason = "Python + ultralytics 미설치 — pip install ultralytics fastapi uvicorn 후 재로드";
      console.warn("[StockCounter] Python + ultralytics 없음. 설치 안내:");
      console.warn("  pip install ultralytics fastapi uvicorn pillow");
      console.warn("  서버를 재시작하세요.");
    }
  } else {
    loadStatusReason = "모델 파일 없음 — server/models/best.pt를 추가하세요";
    console.log("[StockCounter] 모델 없음 — server/models/best.pt를 넣어주세요");
  }

  return false;
}

export function isStockCountModelLoaded(): boolean {
  return session !== null || useYoloServer;
}

export function getLoadStatusReason(): string {
  return loadStatusReason;
}

// 현재 사용 중인 추론 백엔드 (Render 배포 진단용)
export function getStockCountBackend(): "python-yolo" | "onnx-node" | "none" {
  if (useYoloServer) return "python-yolo";
  if (session !== null) return "onnx-node";
  return "none";
}

export async function reloadStockCountModel(): Promise<boolean> {
  loadAttempted = false;
  session = null;
  useYoloServer = false;
  if (yoloServerProc) { yoloServerProc.kill(); yoloServerProc = null; }
  return loadStockCountModel();
}

// server/models 폴더의 .pt / .onnx 파일 목록 (프론트 모델 선택용)
export function listAvailableModels(): { file: string; size: number }[] {
  try {
    if (!fs.existsSync(MODELS_DIR)) return [];
    const files = fs.readdirSync(MODELS_DIR)
      .filter(f => /\.(pt|onnx)$/i.test(f))
      .map(f => {
        const stat = fs.statSync(path.join(MODELS_DIR, f));
        return { file: f, size: stat.size };
      });
    files.sort((a, b) => a.file.localeCompare(b.file));
    return files;
  } catch { return []; }
}

// Python YOLO 서버에서 현재 로드된 모델 조회
export async function getCurrentYoloModel(): Promise<string | null> {
  if (!useYoloServer) return null;
  try {
    const r = await fetch(`${YOLO_SERVER_URL}/models`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    const j: any = await r.json();
    return j.current ?? null;
  } catch { return null; }
}

// ── 이미지 전처리 (ONNX 경로 전용) ─────────────────────────────────────────

async function preprocessBase64(b64: string): Promise<Float32Array> {
  const buf = Buffer.from(b64, "base64");
  const { data } = await sharp(buf)
    .resize(INPUT_SIZE, INPUT_SIZE, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const n = INPUT_SIZE * INPUT_SIZE;
  const floats = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    floats[i]         = data[i * 3]     / 255.0;
    floats[n + i]     = data[i * 3 + 1] / 255.0;
    floats[2 * n + i] = data[i * 3 + 2] / 255.0;
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

export async function countObjectsInImage(b64: string, modelFile?: string): Promise<DetectionResult & { model?: string }> {
  // Python YOLO 서버 방식
  if (useYoloServer) {
    const body: Record<string, unknown> = { data: b64, mimeType: "image/jpeg", conf: CONF_THRESHOLD, iou: IOU_THRESHOLD };
    if (modelFile) body.model = modelFile;
    const res = await fetch(`${YOLO_SERVER_URL}/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const json: any = await res.json();
    if (!json.success) throw new Error(json.error ?? "YOLO 서버 오류");
    return { count: json.count, boxes: json.boxes, model: json.model };
  }

  // ONNX 방식
  if (!session) throw new Error("모델 미로드 — server/models/best.pt를 추가하고 서버를 재시작하세요");

  const inputData = await preprocessBase64(b64);
  const tensor = new ort.Tensor("float32", inputData, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const feeds: Record<string, unknown> = { [session.inputNames[0]]: tensor };
  const out = await session.run(feeds);

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
