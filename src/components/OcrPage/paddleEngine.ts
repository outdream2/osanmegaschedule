import type { OcrPageResult } from "./tesseractEngine";
export type { OcrPageResult };

export interface PaddleProgress {
  done: number;
  total: number;
}

/**
 * PaddleOCR — 서버에서 Python 서브프로세스로 실행.
 * 이미지 한 장씩 /api/ocr (engine:"paddle") 로 전송.
 */
export async function runPaddleOcr(
  images: { data: string; mimeType: string }[],
  onProgress: (p: PaddleProgress) => void,
): Promise<OcrPageResult[]> {
  const results: OcrPageResult[] = [];

  for (let i = 0; i < images.length; i++) {
    const res = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: [images[i]], engine: "paddle" }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      throw new Error(err?.error ?? `페이지 ${i + 1} OCR 실패`);
    }
    const data = await res.json();
    const page = data.pages?.[0];
    if (page) results.push({ ...page, page: i + 1 });
    onProgress({ done: i + 1, total: images.length });
  }

  return results;
}
