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
export async function preprocessImageForOcr(
  b64: string,
  _mimeType: string,
): Promise<{ b64: string; mimeType: string }> {
  try {
    const inputBuf = Buffer.from(b64, "base64");
    const meta = await sharp(inputBuf).metadata();

    const w = meta.width  ?? 640;
    const h = meta.height ?? 480;

    // 1. 업스케일: 최단 변이 1000px 미만이면 확대
    const scale = Math.min(w, h) < 1000
      ? Math.min(2.5, 1000 / Math.min(w, h))
      : 1.0;

    let base = sharp(inputBuf);
    if (scale > 1.05) {
      base = base.resize(Math.round(w * scale), Math.round(h * scale), { fit: "fill" });
    }

    // 2. RGBA 픽셀 버퍼 취득 후 도장 제거
    const { data, info } = await base.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // 붉은 도장 판별: R이 G·B의 1.5배 이상이고 G·B < 110
      if (r > 150 && g < 110 && b < 110 && r > g * 1.5 && r > b * 1.5) {
        data[i] = data[i + 1] = data[i + 2] = 255; // 흰색으로 교체
      }
    }

    // 3. 그레이스케일 → normalize → sharpen → JPEG 출력
    const processed = await sharp(Buffer.from(data), {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .removeAlpha()
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1.0, m1: 1.2, m2: 0.5 })
      .jpeg({ quality: 92 })
      .toBuffer();

    return { b64: processed.toString("base64"), mimeType: "image/jpeg" };
  } catch (e: any) {
    console.warn("[OCR/preprocess] 전처리 실패, 원본 사용:", e?.message ?? e);
    return { b64, mimeType: _mimeType };
  }
}
