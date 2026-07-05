/**
 * AI 탐지 에이전트 라우터
 * POST /api/ai-detect   — 이미지 업로드 → Python 탐지 → 결과 반환
 * GET  /api/ai-detect/status — 서버 상태 확인
 * POST /api/ai-detect/reload — 에이전트 재로드
 *
 * 기존 stockCount, StockCounterModal, YOLO ONNX 관련 기능에 영향 없음.
 */

import { Router } from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const router = Router();

// ── 설정 ─────────────────────────────────────────────────────────────────────

const AI_DETECTOR_PORT = parseInt(process.env.AI_DETECTOR_PORT ?? "8003");
const AI_DETECTOR_URL = `http://localhost:${AI_DETECTOR_PORT}`;
const SCRIPT_PATH = path.join(process.cwd(), "server", "ai_detector", "detector_server.py");

// Python 바이너리 후보
const PYTHON_BINS = ["python3", "py", "python"];

// ── 상태 ──────────────────────────────────────────────────────────────────────

let detectorProc: ReturnType<typeof spawn> | null = null;
let serverStarting = false;
let serverReady = false;
let startError = "";

// ── Python 바이너리 탐색 ──────────────────────────────────────────────────────

async function findPythonBin(): Promise<string | null> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  for (const bin of PYTHON_BINS) {
    try {
      await execFileAsync(bin, ["-c", "import fastapi, uvicorn"], { timeout: 8_000 });
      return bin;
    } catch {
      // 다음 후보
    }
  }
  // fastapi 없어도 python 자체는 찾기
  for (const bin of PYTHON_BINS) {
    try {
      await execFileAsync(bin, ["--version"], { timeout: 5_000 });
      return bin;
    } catch {
      // 계속
    }
  }
  return null;
}

// ── Python 서버 시작 ──────────────────────────────────────────────────────────

export async function startAiDetectorServer(): Promise<boolean> {
  if (serverReady) return true;
  if (serverStarting) {
    // 이미 시작 중이면 준비될 때까지 대기 (최대 30초)
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (serverReady) return true;
    }
    return false;
  }
  if (!fs.existsSync(SCRIPT_PATH)) {
    startError = `스크립트 없음: ${SCRIPT_PATH}`;
    console.error(`[AIDetector] ${startError}`);
    return false;
  }

  serverStarting = true;

  const pythonBin = await findPythonBin();
  if (!pythonBin) {
    startError = "Python 미설치 — pip install ultralytics fastapi uvicorn 후 재시도";
    console.error(`[AIDetector] ${startError}`);
    serverStarting = false;
    return false;
  }

  console.log(`[AIDetector] Python 서버 시작 중 (${pythonBin})...`);

  detectorProc = spawn(pythonBin, [SCRIPT_PATH], {
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      YOLO_VERBOSE: "False",
      AI_DETECTOR_PORT: String(AI_DETECTOR_PORT),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  detectorProc.stdout?.on("data", (d: Buffer) => {
    process.stdout.write(`[AI Detector] ${d}`);
  });
  detectorProc.stderr?.on("data", (d: Buffer) => {
    const msg = d.toString().trim();
    // uvicorn 정상 로그는 무시, 실제 에러만 출력
    if (msg && !msg.includes("INFO:") && !msg.includes("WARNING:")) {
      process.stderr.write(`[AI Detector ERR] ${msg}\n`);
    }
  });
  detectorProc.on("exit", code => {
    console.log(`[AIDetector] Python 서버 종료 (code=${code})`);
    detectorProc = null;
    serverReady = false;
    serverStarting = false;
  });

  // Health check — 최대 40초 대기
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const r = await fetch(`${AI_DETECTOR_URL}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (r.ok) {
        console.log("[AIDetector] Python 서버 준비 완료");
        serverReady = true;
        serverStarting = false;
        return true;
      }
    } catch {
      // 아직 준비 중
    }
  }

  startError = "Python 서버 시작 타임아웃 — fastapi/uvicorn 설치 여부 확인";
  console.error(`[AIDetector] ${startError}`);
  detectorProc?.kill();
  detectorProc = null;
  serverStarting = false;
  return false;
}

export function stopAiDetectorServer(): void {
  if (detectorProc) {
    detectorProc.kill();
    detectorProc = null;
  }
  serverReady = false;
  serverStarting = false;
}

// ── 응답 타입 ──────────────────────────────────────────────────────────────────

export interface DetectionBox {
  x: number;
  y: number;
  w: number;
  h: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
  class_name: string;
}

export interface AiDetectResult {
  count: number;
  mode: "detect" | "segment" | "classify";
  boxes: DetectionBox[];
  masks: Array<Array<[number, number]>> | null;
  class_scores: Record<string, number> | null;
  processing_time_ms: number;
}

// ── 엔드포인트 ────────────────────────────────────────────────────────────────

/**
 * GET /api/ai-detect/status
 * AI 탐지 서버 상태 확인
 */
router.get("/api/ai-detect/status", async (_req, res) => {
  if (!serverReady) {
    return res.json({
      ready: false,
      starting: serverStarting,
      reason: startError || (serverStarting ? "서버 시작 중..." : "미시작"),
      url: AI_DETECTOR_URL,
    });
  }
  try {
    const r = await fetch(`${AI_DETECTOR_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await r.json();
    return res.json({ ready: true, ...data, url: AI_DETECTOR_URL });
  } catch {
    serverReady = false;
    return res.json({ ready: false, reason: "Python 서버 응답 없음", url: AI_DETECTOR_URL });
  }
});

/**
 * POST /api/ai-detect/start
 * AI 탐지 서버 수동 시작
 */
router.post("/api/ai-detect/start", async (_req, res) => {
  if (serverReady) {
    return res.json({ ready: true, message: "이미 실행 중" });
  }
  // 비동기로 시작 (응답은 즉시)
  res.json({ ready: false, message: "서버 시작 중..." });
  startAiDetectorServer().then(ok => {
    if (!ok) console.error("[AIDetector] 수동 시작 실패:", startError);
  });
});

/**
 * POST /api/ai-detect/reload
 * 에이전트 재로드
 */
router.post("/api/ai-detect/reload", async (_req, res) => {
  if (!serverReady) {
    return res.status(503).json({ error: "Python 서버가 실행 중이 아닙니다" });
  }
  try {
    const r = await fetch(`${AI_DETECTOR_URL}/reload`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
    const data = await r.json();
    return res.json(data);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/ai-detect
 * 메인 탐지 엔드포인트
 *
 * Body: {
 *   image: string,        // data URI 또는 base64
 *   mode?: "detect" | "segment" | "classify",  // 기본 "detect"
 *   confidence?: number,  // 0.05~0.95, 기본 0.5
 *   iou?: number,         // 0.1~0.9, 기본 0.45
 *   model_path?: string,  // 커스텀 모델 경로
 * }
 *
 * Response: AiDetectResult
 */
router.post("/api/ai-detect", async (req, res) => {
  // 서버 자동 시작 시도
  if (!serverReady) {
    const started = await startAiDetectorServer();
    if (!started) {
      return res.status(503).json({
        error: startError || "AI 탐지 서버 시작 실패",
        hint: "pip install ultralytics fastapi uvicorn pillow 후 재시도",
      });
    }
  }

  const {
    image,
    mode = "detect",
    confidence = 0.5,
    iou = 0.45,
    model_path,
  } = req.body ?? {};

  if (!image || typeof image !== "string") {
    return res.status(400).json({ error: "image(base64 또는 data URI) 필드 필요" });
  }

  const validModes = ["detect", "segment", "classify"];
  if (!validModes.includes(mode)) {
    return res.status(400).json({ error: `mode는 ${validModes.join(" | ")} 중 하나여야 합니다` });
  }

  // data URI prefix 제거
  const b64 = image.replace(/^data:image\/[a-z+]+;base64,/, "");

  const payload: Record<string, unknown> = {
    data: b64,
    mimeType: "image/jpeg",
    mode,
    confidence: Math.max(0.05, Math.min(0.95, Number(confidence))),
    iou: Math.max(0.1, Math.min(0.9, Number(iou))),
  };
  if (model_path) payload.model_path = model_path;

  try {
    const r = await fetch(`${AI_DETECTOR_URL}/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });

    const data = await r.json() as any;

    if (!r.ok) {
      return res.status(r.status).json({ error: data?.detail ?? `Python 서버 오류 (${r.status})` });
    }

    const result: AiDetectResult = {
      count: data.count ?? 0,
      mode: data.mode ?? mode,
      boxes: data.boxes ?? [],
      masks: data.masks ?? null,
      class_scores: data.class_scores ?? null,
      processing_time_ms: data.processing_time_ms ?? 0,
    };

    return res.json(result);
  } catch (e: any) {
    if (e.name === "TimeoutError" || e.code === "ERR_CONNECT_REFUSED") {
      serverReady = false;
    }
    console.error("[AIDetector] 탐지 오류:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

export default router;
