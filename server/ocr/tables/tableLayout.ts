// server/ocr/tableLayout.ts
// DocLayout-YOLO 기반 문서 레이아웃 검출 (OCR 전용)
//
// ** 재고세기(yolo_server.py, 포트 8002)와 완전 분리 **
//   - 별도 Python 프로세스: server/ocr/layout_server.py (포트 8004)
//   - 별도 모델: server/models/doclayout_yolo.pt (재고 SKU110K 와 다른 학습 데이터)
//
// 사용:
//   1) 모델 다운로드: python server/ocr/download_layout_model.py
//   2) 서버 자동 시작 (ensureLayoutServer)
//   3) detectLayout(base64) 호출 → table 클래스 박스 획득

import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const OCR_LAYOUT_PORT = process.env.OCR_LAYOUT_PORT ?? "8004";
const OCR_LAYOUT_URL = `http://localhost:${OCR_LAYOUT_PORT}`;
const PYTHON = process.platform === "win32" ? "py" : "python3";
const PYTHON_ARGS: string[] = process.platform === "win32" ? ["-3"] : [];
const LAYOUT_MODEL_PATH = process.env.OCR_LAYOUT_MODEL
  ?? path.join(process.cwd(), "server", "models", "doclayout_yolo.pt");

let layoutServerProc: ReturnType<typeof spawn> | null = null;
let modelWarningShown = false;

/**
 * OCR layout 서버 자동 시작 (재고세기 yolo_server 와 완전 별개 프로세스)
 * 모델 파일 없으면 spawn 안 함 (헛수고 방지)
 */
export async function ensureLayoutServer(): Promise<void> {
  // 이미 실행 중이면 건너뛰기
  try {
    const r = await fetch(`${OCR_LAYOUT_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) return;
  } catch { /* silent */ }

  // 모델 파일 없으면 서버 시작 안 함 (사용자에게 한 번만 안내)
  if (!fs.existsSync(LAYOUT_MODEL_PATH)) {
    if (!modelWarningShown) {
      console.log(`[OCR-Layout] 모델 파일 없음 → 서버 시작 건너뜀. 사용하려면:`);
      console.log(`  pip install doclayout-yolo huggingface_hub`);
      console.log(`  py server/ocr/download_layout_model.py`);
      console.log(`  또는 USE_LAYOUT=false 로 완전 비활성화`);
      modelWarningShown = true;
    }
    return;
  }

  if (layoutServerProc) return;
  console.log(`[OCR-Layout] 서버 시작 중 (${PYTHON} server/ocr/layout_server.py)...`);
  layoutServerProc = spawn(PYTHON, [...PYTHON_ARGS, "server/ocr/layout_server.py"], {
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  layoutServerProc.stdout?.on("data", (d: Buffer) => process.stdout.write(`[OCR-Layout] ${d}`));
  layoutServerProc.stderr?.on("data", (d: Buffer) => process.stderr.write(`[OCR-Layout ERR] ${d}`));
  layoutServerProc.on("exit", (code) => {
    console.log(`[OCR-Layout] 종료됨 (code=${code})`);
    layoutServerProc = null;
  });
  layoutServerProc.on("error", (err: any) => {
    console.error(`[OCR-Layout] spawn 오류: ${err?.message ?? err}`);
  });
}

export type LayoutBox = {
  x1: number;  // 0-1 정규화된 좌표 (이미지 폭 비율)
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
  class_name: string;  // "table" | "plain text" | "title" | "figure" | "table_caption" 등
};

export type LayoutResult = {
  tables: LayoutBox[];
  texts: LayoutBox[];
  headers: LayoutBox[];
  all: LayoutBox[];
  imageWidth?: number;
  imageHeight?: number;
};

/**
 * 이미지에서 문서 레이아웃(표·텍스트·제목) 검출
 * @param b64 base64 이미지
 * @param confidence 검출 임계값 (기본 0.4)
 */
export async function detectLayout(b64: string, confidence = 0.4): Promise<LayoutResult> {
  await ensureLayoutServer();
  const res = await fetch(`${OCR_LAYOUT_URL}/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: b64,
      mimeType: "image/jpeg",
      confidence,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`layout 검출 실패 (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = await res.json() as any;
  if (!json.success) throw new Error(json.error ?? "layout 검출 실패");

  const boxes: LayoutBox[] = (json.boxes ?? []).map((b: any) => ({
    x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2,
    confidence: b.confidence,
    class_name: String(b.class_name ?? "").toLowerCase(),
  }));

  return {
    tables: boxes.filter(b => b.class_name.includes("table") && !b.class_name.includes("caption")),
    texts: boxes.filter(b => b.class_name.includes("text")),
    headers: boxes.filter(b => b.class_name.includes("title") || b.class_name.includes("caption")),
    all: boxes,
  };
}

/**
 * layout 서비스 헬스체크
 */
export async function isLayoutAvailable(): Promise<boolean> {
  try {
    // 서버 켜있으면 바로 응답 · 아니면 자동 시작 시도
    await ensureLayoutServer();
    // 서버가 부팅 중일 수 있음 → 최대 3초 대기하며 healthy 확인
    for (let i = 0; i < 3; i++) {
      try {
        const res = await fetch(`${OCR_LAYOUT_URL}/health`, { signal: AbortSignal.timeout(1500) });
        if (res.ok) {
          const j = await res.json() as any;
          return !!j?.ok;
        }
      } catch { /* keep trying */ }
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * PP-OCRv5 텍스트 boxes 를 table bbox 로 필터링
 * table 안에 있는 텍스트만 유지 (그 외 헤더·주소·잡문자 배제)
 *
 * @param cells PP-OCRv5 검출 셀 배열
 * @param tables LayoutBox[] (table 클래스)
 * @param imgWidth 원본 이미지 폭 (픽셀)
 * @param imgHeight 원본 이미지 높이 (픽셀)
 */
export function filterCellsByTables<T extends { box: { x: number; y: number; width: number; height: number } }>(
  cells: T[],
  tables: LayoutBox[],
  imgWidth: number,
  imgHeight: number,
): T[] {
  if (tables.length === 0) return cells;
  return cells.filter(c => {
    const cx = (c.box.x + c.box.width / 2) / imgWidth;
    const cy = (c.box.y + c.box.height / 2) / imgHeight;
    return tables.some(t => cx >= t.x1 && cx <= t.x2 && cy >= t.y1 && cy <= t.y2);
  });
}
