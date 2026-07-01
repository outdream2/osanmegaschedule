import { spawn } from "child_process";

const PYTHON = process.platform === "win32" ? "python" : "python3";
const OCR_SERVER_URL = "http://localhost:8001";
let ocrServerProc: ReturnType<typeof spawn> | null = null;

export async function ensureOcrServer(): Promise<void> {
  try {
    const r = await fetch(`${OCR_SERVER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) { console.log("[OCR Server] 이미 실행 중."); return; }
  } catch {}
  if (ocrServerProc) return;
  console.log("[OCR Server] EasyOCR 서버 시작 중 (ocr_server.py)...");
  ocrServerProc = spawn(PYTHON, ["scripts/ocr_server.py"], {
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  ocrServerProc.stdout?.on("data", (d: Buffer) => process.stdout.write(`[OCR Server] ${d}`));
  ocrServerProc.stderr?.on("data", (d: Buffer) => process.stderr.write(`[OCR Server ERR] ${d}`));
  ocrServerProc.on("exit", (code) => {
    console.log(`[OCR Server] 종료됨 (code=${code})`);
    ocrServerProc = null;
  });
}

export async function callEasyOcrServer(b64: string, mimeType: string): Promise<any> {
  for (let attempt = 0; attempt < 45; attempt++) {
    try {
      const res = await fetch(`${OCR_SERVER_URL}/ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: b64, mimeType }),
        signal: AbortSignal.timeout(60000),
      });
      const json = await res.json() as any;
      if (!json.success) throw new Error(json.error ?? "EasyOCR 실패");
      return json;
    } catch (e: any) {
      const connRefused = e?.cause?.code === "ECONNREFUSED" || e?.code === "ECONNREFUSED" || String(e).includes("ECONNREFUSED");
      if (connRefused && attempt < 44) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw e;
    }
  }
  throw new Error("EasyOCR 서버에 연결할 수 없습니다. ocr_server.py가 실행 중인지 확인하세요.");
}
