import { preprocessForEasyOcr } from "../../preprocess";
import type { Stage } from "../types";

// Stage 01: 이미지 전처리 (리사이즈 + 색상 유지)
export const preprocessStage: Stage = {
  name: "preprocess",
  async run(ctx) {
    const { b64, mimeType } = await preprocessForEasyOcr(ctx.rawB64, ctx.rawMime);
    // 전처리된 데이터로 rawB64/rawMime 갱신 (다음 stage 가 사용)
    return { rawB64: b64, rawMime: mimeType };
  },
};
