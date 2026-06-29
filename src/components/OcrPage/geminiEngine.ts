import type { OcrPageResult } from "./tesseractEngine";

export type { OcrPageResult };

export interface GeminiProgress {
  type: "page";
  done: number;
  total: number;
}

/**
 * Gemini 비전 API로 이미지 배열을 OCR 처리. 백엔드 /api/ocr (engine:"gemini") 호출.
 */
export async function runGeminiOcr(
  images: { data: string; mimeType: string }[],
  onProgress: (p: GeminiProgress) => void,
): Promise<OcrPageResult[]> {
  const results: OcrPageResult[] = [];

  for (let i = 0; i < images.length; i++) {
    const res = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: [images[i]], engine: "gemini" }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      throw new Error(err?.error ?? `페이지 ${i + 1} OCR 실패`);
    }
    const data = await res.json();
    const page = data.pages?.[0];
    if (page) results.push({ ...page, page: i + 1 });
    onProgress({ type: "page", done: i + 1, total: images.length });
  }

  return results;
}
