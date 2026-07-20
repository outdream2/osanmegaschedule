import { callPpuOcr } from "../../ppuPaddle";
import { preprocessHighContrast, rotateImage } from "../../preprocess";
import { ocrConfig } from "../../../config/ocrConfig";
import type { RawOcrResult, Stage } from "../types";

// 인식 부족 판정
const isPoorRaw = (r: any): boolean => {
  const txt = String(r?.rawText ?? "");
  const rn = (r?.rows ?? []).length;
  return txt.length < 80 || (rn === 0 && txt.length < 300);
};

// 결과 스코어 (rows 우선 · 동률이면 rawText 길이)
const scoreOf = (r: RawOcrResult | null | undefined): number => {
  if (!r) return -1;
  const rn = (r.rows ?? []).length;
  const tl = String(r.rawText ?? "").length;
  return rn * 100000 + tl;
};

// Stage 02: PP-OCRv5 실행 + 회전·대비 재시도 (스트리밍 · best-only)
//   메모리 절감 (2026-07-14):
//     - attempts 배열 대신 best 스칼라 유지 · 매 시도 즉시 폐기
//     - LOW_MEM 모드에서는 재시도 90° 1회만 (기존 대비/90/180/270 = 4회 → 1회)
//     - 조기 종료 조건 충족 시 즉시 반환
//   재추출 approach 분기 (2026-07-19):
//     - "rearrange": OCR 재실행 안 함 · cachedRawText 를 headers/rows 비운 채 rawText 로 주입
//                    → 후속 stage (fallback + normalize) 가 rawText 재파싱만으로 결과 생성
export const ocrEngineStage: Stage = {
  name: "ocr-engine",
  async run(ctx) {
    // rearrange 모드: OCR 스킵 · 이전 rawText 를 재사용해 파싱 로직만 다르게 (headers/rows 비우기)
    if (ctx.approach === "rearrange") {
      const cached = ctx.cachedRawText ?? "";
      console.log(`[ocr-engine] page ${ctx.page}: rearrange 모드 · OCR 스킵 · cachedRawText ${cached.length}자 재파싱`);
      const raw: RawOcrResult = { headers: [], rows: [], meta: {}, rawText: cached };
      return finalize(raw);
    }

    let best: RawOcrResult = await callPpuOcr(ctx.rawB64, ctx.rawMime);
    let bestLabel = "원본";

    if (!isPoorRaw(best)) {
      return finalize(best);
    }

    console.log(`[ocr-engine] page ${ctx.page}: 인식 부족 (rawText=${(best?.rawText ?? "").length}자, rows=${(best?.rows ?? []).length}) · 재시도 시작 (attempts=${ocrConfig.retryAttempts.length})`);

    // best-only 갱신 헬퍼 (직전 시도 즉시 폐기)
    const tryOne = async (label: string, gen: () => Promise<{ b64: string; mimeType: string }>): Promise<boolean> => {
      try {
        const src = await gen();
        const r = await callPpuOcr(src.b64, src.mimeType) as RawOcrResult;
        if (scoreOf(r) > scoreOf(best)) {
          best = r;
          bestLabel = label;
        }
        // 조기 종료 판정
        return String(r?.rawText ?? "").length >= 300 && (r?.rows ?? []).length >= 3;
      } catch (e: any) {
        console.warn(`[ocr-engine/retry ${label}] 실패:`, e?.message);
        return false;
      }
    };

    // 재시도 순서 · server/config/ocrConfig.ts 에서 관리 (env 무시 · 로컬↔Render 일치)
    const retryGens: Record<string, () => Promise<{ b64: string; mimeType: string }>> = {
      "대비강화": () => preprocessHighContrast(ctx.rawB64),
      "90°":  () => rotateImage(ctx.rawB64, 90),
      "180°": () => rotateImage(ctx.rawB64, 180),
      "270°": () => rotateImage(ctx.rawB64, 270),
    };
    const attempts: Array<[string, () => Promise<{ b64: string; mimeType: string }>]> =
      ocrConfig.retryAttempts
        .map(label => [label, retryGens[label]] as [string, () => Promise<{ b64: string; mimeType: string }>])
        .filter(([, gen]) => typeof gen === "function");

    for (const [label, gen] of attempts) {
      const done = await tryOne(label, gen);
      if (done) break;
    }

    console.log(`[ocr-engine] page ${ctx.page}: 최적=${bestLabel} (rows=${(best?.rows ?? []).length}, rawText=${String(best?.rawText ?? "").length}자)`);
    return finalize(best);
  },
};

function finalize(raw: RawOcrResult) {
  return {
    raw,
    rawText: raw.rawText ?? "",
    headers: raw.headers ?? [],
    rows: raw.rows ?? [],
    meta: raw.meta ?? {},
    rawOcrHeaders: raw.headers ?? [],
    rawOcrSample: (raw.rows ?? []).slice(0, 5),
  };
}
