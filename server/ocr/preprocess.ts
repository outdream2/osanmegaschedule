import sharp from "sharp";

/**
 * Gemini OCR 전송 전 이미지 전처리
 *
 * 2026-07-09 회귀 복구:
 *   - MAX_LONG_SIDE 1400 → 1800 (작은 글자 뭉개짐 방지)
 *   - JPEG_QUALITY 82 → 92 (텍스트 엣지 손실 최소화)
 *   - grayscale 제거 (Gemini 비전은 컬러가 유리 · 도장/색상 힌트 손실 방지)
 *   - normalize + sharpen 만 유지 (콘트라스트↑ · 엣지 강화)
 *
 * 실패 시 원본 반환 (오류가 OCR 자체를 막지 않도록)
 *
 * 최적화 파라미터는 환경변수로 오버라이드 가능:
 *   OCR_MAX_LONG_SIDE    — 최장변 (기본 1800)
 *   OCR_JPEG_QUALITY     — JPEG 품질 (기본 92 · 80~95 권장)
 */
const MAX_SHORT_SIDE = 1600;
const MAX_LONG_SIDE  = Number(process.env.OCR_MAX_LONG_SIDE) || 1800;
const JPEG_QUALITY   = Number(process.env.OCR_JPEG_QUALITY) || 92;

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
    //   B) 최단변이 1000 미만 → 업스케일 (작은 글자 확보)
    //   C) 그 외 → 리사이즈 없음
    let pipeline = sharp(inputBuf, { sequentialRead: true });
    if (longSide > MAX_LONG_SIDE) {
      const ratio = MAX_LONG_SIDE / longSide;
      pipeline = pipeline.resize(Math.round(w * ratio), Math.round(h * ratio), { fit: "fill" });
    } else if (shortSide < 1000) {
      const scale = Math.min(1.6, Math.min(MAX_SHORT_SIDE, 1200) / shortSide);
      if (scale > 1.05) {
        pipeline = pipeline.resize(Math.round(w * scale), Math.round(h * scale), { fit: "fill" });
      }
    }

    // 컬러 유지 · normalize + sharpen · 고품질 JPEG
    const processed = await pipeline
      .normalize()
      .sharpen({ sigma: 1.0, m1: 1.2, m2: 0.5 })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();

    return { b64: processed.toString("base64"), mimeType: "image/jpeg" };
  } catch (e: any) {
    console.warn("[OCR/preprocess] 전처리 실패, 원본 사용:", e?.message ?? e);
    return { b64, mimeType: _mimeType };
  }
}

/**
 * EasyOCR 전용 전처리 — 색상 유지 · 최소 조정
 *
 * EasyOCR(CRAFT+CRNN)은 RGB 컬러 이미지로 학습됨. 그레이스케일·과한 샤프닝은 오히려 인식률↓.
 *   - 저해상도만 업스케일 (텍스트 크기 확보)
 *   - 색상 유지 (Detection 성능 보존)
 *   - JPEG q95 (엣지 손실 최소화)
 */
// 2026-07-20: env 분기 제거 · server/config/ocrConfig.ts 단일 소스
//   Render↔로컬 결과 일치 · 페이지마다 dispose 로 메모리 안전
import { ocrConfig } from "../config/ocrConfig";
const OCR_MAX_LONG_SIDE = ocrConfig.maxImageLongSide;
const OCR_JPEG_QUALITY = ocrConfig.jpegQuality;
const OCR_UPSCALE = ocrConfig.upscaleSmallImages;

export async function preprocessForEasyOcr(
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

    let pipeline = sharp(inputBuf, { sequentialRead: true, failOn: "none" });

    // 우선순위 A: 최장변이 캡 초과 → 다운샘플
    if (longSide > OCR_MAX_LONG_SIDE) {
      const ratio = OCR_MAX_LONG_SIDE / longSide;
      pipeline = pipeline.resize(Math.round(w * ratio), Math.round(h * ratio), { fit: "fill" });
    }
    // 우선순위 B: 저해상도 → 업스케일 (config.upscaleSmallImages 로 제어)
    else if (shortSide < 1200 && OCR_UPSCALE) {
      const scale = Math.min(2.0, 1600 / shortSide);
      if (scale > 1.05) {
        pipeline = pipeline.resize(Math.round(w * scale), Math.round(h * scale), { fit: "fill" });
      }
    }

    const processed = await pipeline.jpeg({ quality: OCR_JPEG_QUALITY, mozjpeg: true }).toBuffer();
    return { b64: processed.toString("base64"), mimeType: "image/jpeg" };
  } catch (e: any) {
    console.warn("[OCR/preprocessForEasyOcr] 전처리 실패, 원본 사용:", e?.message ?? e);
    return { b64, mimeType: _mimeType };
  }
}

/**
 * 이미지 회전 (2026-07-10 · OCR 실패 시 재시도용)
 * @param angle 90 | 180 | 270 (그 외는 원본 반환)
 */
export async function rotateImage(
  b64: string,
  angle: 90 | 180 | 270,
): Promise<{ b64: string; mimeType: string }> {
  try {
    const inputBuf = Buffer.from(b64, "base64");
    const rotated = await sharp(inputBuf, { sequentialRead: true })
      .rotate(angle)
      .jpeg({ quality: 95, mozjpeg: true })
      .toBuffer();
    return { b64: rotated.toString("base64"), mimeType: "image/jpeg" };
  } catch (e: any) {
    console.warn(`[OCR/rotate ${angle}°] 실패, 원본 반환:`, e?.message ?? e);
    return { b64, mimeType: "image/jpeg" };
  }
}

/**
 * 대비/이진화 강화 전처리 (2026-07-10 · 흐릿한 스캔 재시도용)
 *   - grayscale + normalize + 강한 sharpen + threshold
 *   - EasyOCR 기본 전처리 실패 시 폴백
 */
export async function preprocessHighContrast(
  b64: string,
): Promise<{ b64: string; mimeType: string }> {
  try {
    const inputBuf = Buffer.from(b64, "base64");
    const processed = await sharp(inputBuf, { sequentialRead: true })
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1.5, m1: 1.5, m2: 0.6 })
      .linear(1.3, -20) // contrast·brightness
      .jpeg({ quality: 95, mozjpeg: true })
      .toBuffer();
    return { b64: processed.toString("base64"), mimeType: "image/jpeg" };
  } catch (e: any) {
    console.warn("[OCR/preprocessHighContrast] 실패, 원본 반환:", e?.message ?? e);
    return { b64, mimeType: "image/jpeg" };
  }
}
