export interface OcrPageResult {
  page: number;
  headers: string[];
  rows: (string | number | null)[][];
  meta: { supplier?: string | null; recipient?: string | null; date?: string | null; total?: number | null };
  rawText?: string;
}

export interface TesseractProgress {
  type: "status" | "page";
  status?: string;
  done?: number;
  total?: number;
}

/**
 * Tesseract.js로 이미지 배열을 OCR 처리한 뒤 백엔드 /api/ocr 로 구조화 요청.
 * 모든 Tesseract 관련 파일(worker, WASM, 언어팩)은 로컬 public/ 에서 로딩 — CDN 불필요.
 */
export async function runTesseractOcr(
  images: { data: string; mimeType: string }[],
  onProgress: (p: TesseractProgress) => void,
): Promise<OcrPageResult[]> {
  const { createWorker } = await import("tesseract.js");
  const base = window.location.origin;

  onProgress({ type: "status", status: "Tesseract 초기화 중..." });

  const worker = await createWorker(["kor", "eng"], 1, {
    workerPath: `${base}/tesseract/worker.min.js`,
    corePath:   `${base}/tesseract`,
    langPath:   `${base}/tessdata`,
    logger: (m: any) => {
      if (m?.status === "loading language traineddata") {
        onProgress({ type: "status", status: `언어 데이터 로딩 중... ${Math.round((m.progress ?? 0) * 100)}%` });
      } else if (m?.status === "initializing api") {
        onProgress({ type: "status", status: "OCR 엔진 초기화 중..." });
      }
    },
  });

  const rawTexts: string[] = [];
  for (let i = 0; i < images.length; i++) {
    onProgress({ type: "status", status: `페이지 ${i + 1}/${images.length} 인식 중...` });
    const dataUrl = `data:${images[i].mimeType};base64,${images[i].data}`;
    const { data: { text } } = await worker.recognize(dataUrl);
    rawTexts.push(text);
    onProgress({ type: "page", done: i + 1, total: images.length });
  }
  await worker.terminate();

  const res = await fetch("/api/ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts: rawTexts, engine: "tesseract" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(err?.error ?? "Tesseract 백엔드 처리 실패");
  }
  const data = await res.json();
  return (data.pages ?? []) as OcrPageResult[];
}
