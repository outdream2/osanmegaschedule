import { preprocessForEasyOcr, preprocessHighContrast } from "../../preprocess";
import type { Stage } from "../types";

// Stage 01: 이미지 전처리 (리사이즈 + 색상 유지)
//
// 재추출 approach 분기 (2026-07-19):
//   - "high-contrast": preprocessHighContrast 강제 (grayscale + sharpen + linear contrast)
//   - "rearrange":     이미지 전처리 스킵 (OCR 재실행 안 함 · cachedRawText 를 다음 stage 에서 사용)
//   - "default"/기타:  기존 preprocessForEasyOcr 유지
export const preprocessStage: Stage = {
  name: "preprocess",
  when: (ctx) => ctx.approach !== "rearrange",  // rearrange 는 OCR 스킵 → 전처리도 불필요
  async run(ctx) {
    if (ctx.approach === "high-contrast") {
      const { b64, mimeType } = await preprocessHighContrast(ctx.rawB64);
      console.log(`[preprocess] page ${ctx.page}: high-contrast 강제 (재추출 approach)`);
      return { rawB64: b64, rawMime: mimeType };
    }
    const { b64, mimeType } = await preprocessForEasyOcr(ctx.rawB64, ctx.rawMime);
    // 전처리된 데이터로 rawB64/rawMime 갱신 (다음 stage 가 사용)
    return { rawB64: b64, rawMime: mimeType };
  },
};
