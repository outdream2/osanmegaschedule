import sharp from "sharp";

/**
 * OCR 전송 전 이미지 전처리
 *
 * 1. 저해상도 자동 업스케일 (최소 변 < 1000px → 최대 2.5× 확대)
 * 2. 붉은 도장 잉크 제거 (R 채널 우세 픽셀 → 흰색으로 대체)
 * 3. 그레이스케일 + 히스토그램 정규화 (normalize) + 샤프닝
 *
 * 실패 시 원본 반환 (오류가 OCR 자체를 막지 않도록)
 */
const MAX_SHORT_SIDE = 1400; // px — Gemini vision이 인식하기에 충분하고 메모리 안전한 상한

export async function preprocessImageForOcr(
  b64: string,
  _mimeType: string,
): Promise<{ b64: string; mimeType: string }> {
  try {
    const inputBuf = Buffer.from(b64, "base64");
    const meta = await sharp(inputBuf).metadata();

    const w = meta.width  ?? 640;
    const h = meta.height ?? 480;

    // 업스케일: 최단 변이 900px 미만이면 확대. 단 MAX_SHORT_SIDE 이하로 제한
    const shortSide = Math.min(w, h);
    const scale = shortSide < 900
      ? Math.min(1.5, Math.min(MAX_SHORT_SIDE, 900) / shortSide)
      : 1.0;

    let pipeline = sharp(inputBuf, { sequentialRead: true });
    if (scale > 1.05) {
      pipeline = pipeline.resize(Math.round(w * scale), Math.round(h * scale), { fit: "fill" });
    } else if (Math.max(w, h) > MAX_SHORT_SIDE * 2) {
      // 이미 충분히 크면 오히려 축소해 메모리 절약
      const ratio = (MAX_SHORT_SIDE * 2) / Math.max(w, h);
      pipeline = pipeline.resize(Math.round(w * ratio), Math.round(h * ratio), { fit: "fill" });
    }

    // raw 픽셀 조작 없이 Sharp 파이프라인만으로 처리 (메모리 절약)
    // 그레이스케일 → normalize → sharpen → JPEG
    const processed = await pipeline
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1.0, m1: 1.2, m2: 0.5 })
      .jpeg({ quality: 88 })
      .toBuffer();

    return { b64: processed.toString("base64"), mimeType: "image/jpeg" };
  } catch (e: any) {
    console.warn("[OCR/preprocess] 전처리 실패, 원본 사용:", e?.message ?? e);
    return { b64, mimeType: _mimeType };
  }
}
