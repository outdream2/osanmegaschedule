import sharp from "sharp";

/**
 * OCR 전송 전 이미지 전처리
 *
 * 1. 저해상도 자동 업스케일 (최소 변 < 900px → 최대 1.5× 확대)
 * 2. 그레이스케일 + 히스토그램 정규화 (normalize) + 샤프닝
 * 3. 최장변 하드캡으로 payload/토큰 절감 (Gemini 무료 티어 대응)
 *
 * 실패 시 원본 반환 (오류가 OCR 자체를 막지 않도록)
 *
 * 최적화 파라미터는 환경변수로 오버라이드 가능:
 *   OCR_MAX_LONG_SIDE    — 최장변 (기본 1400 · 더 낮추면 토큰↓ · 정확도↓)
 *   OCR_JPEG_QUALITY     — JPEG 품질 (기본 82 · 60~90 권장)
 */
const MAX_SHORT_SIDE = 1400;  // 최단변 상한 (업스케일 목표)
const MAX_LONG_SIDE  = Number(process.env.OCR_MAX_LONG_SIDE) || 1400;  // 1800 → 1400 (약 22% 픽셀 절감, 텍스트 품질 유지)
const JPEG_QUALITY   = Number(process.env.OCR_JPEG_QUALITY) || 82;     // 88 → 82 (파일 크기 ~15% 감소, 텍스트 손실 미미)

export async function preprocessImageForOcr(
  b64: string,
  _mimeType: string,
): Promise<{ b64: string; mimeType: string }> {
  try {
    const inputBuf = Buffer.from(b64, "base64");
    const meta = await sharp(inputBuf).metadata();

    const w = meta.width  ?? 640;
    const h = meta.height ?? 480;

    const shortSide = Math.min(w, h);
    const longSide  = Math.max(w, h);

    // 리사이즈 결정 우선순위:
    //   A) 최장변이 MAX_LONG_SIDE 초과 → 하드캡으로 축소 (payload/시간 절감)
    //   B) 최단변이 900 미만 → 업스케일 (단 MAX_SHORT_SIDE 이내)
    //   C) 그 외 → 리사이즈 없음
    let pipeline = sharp(inputBuf, { sequentialRead: true });
    if (longSide > MAX_LONG_SIDE) {
      const ratio = MAX_LONG_SIDE / longSide;
      pipeline = pipeline.resize(Math.round(w * ratio), Math.round(h * ratio), { fit: "fill" });
    } else if (shortSide < 900) {
      const scale = Math.min(1.5, Math.min(MAX_SHORT_SIDE, 900) / shortSide);
      if (scale > 1.05) {
        pipeline = pipeline.resize(Math.round(w * scale), Math.round(h * scale), { fit: "fill" });
      }
    }

    // raw 픽셀 조작 없이 Sharp 파이프라인만으로 처리 (메모리 절약)
    // 그레이스케일 → normalize → sharpen → JPEG
    const processed = await pipeline
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1.0, m1: 1.2, m2: 0.5 })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();

    return { b64: processed.toString("base64"), mimeType: "image/jpeg" };
  } catch (e: any) {
    console.warn("[OCR/preprocess] 전처리 실패, 원본 사용:", e?.message ?? e);
    return { b64, mimeType: _mimeType };
  }
}
