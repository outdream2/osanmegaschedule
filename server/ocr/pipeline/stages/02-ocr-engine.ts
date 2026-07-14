import { callPpuOcr } from "../../ppuPaddle";
import { preprocessHighContrast, rotateImage } from "../../preprocess";
import type { RawOcrResult, Stage } from "../types";

// 인식 부족 판정
const isPoorRaw = (r: any): boolean => {
  const txt = String(r?.rawText ?? "");
  const rn = (r?.rows ?? []).length;
  return txt.length < 80 || (rn === 0 && txt.length < 300);
};

// Stage 02: PP-OCRv5 실행 + 회전·대비 재시도 루프
//   판정: rawText < 80자 OR (rows 0개 AND rawText < 300자)
//   재시도: 원본 → 대비강화 → 90° → 180° → 270°
//   최적: rows 개수 우선, 동률이면 rawText 길이
export const ocrEngineStage: Stage = {
  name: "ocr-engine",
  async run(ctx) {
    let raw: RawOcrResult = await callPpuOcr(ctx.rawB64, ctx.rawMime);

    if (isPoorRaw(raw)) {
      console.log(`[ocr-engine] page ${ctx.page}: 인식 부족 (rawText=${(raw?.rawText ?? "").length}자, rows=${(raw?.rows ?? []).length}) · 재시도 시작`);
      const attempts: { label: string; result: RawOcrResult }[] = [{ label: "원본", result: raw }];

      try {
        const hc = await preprocessHighContrast(ctx.rawB64);
        const rHC = await callPpuOcr(hc.b64, hc.mimeType);
        attempts.push({ label: "대비강화", result: rHC as RawOcrResult });
      } catch (e: any) { console.warn(`[ocr-engine/retry] 대비강화 실패:`, e?.message); }

      for (const deg of [90, 180, 270] as const) {
        try {
          const rot = await rotateImage(ctx.rawB64, deg);
          const rRot = await callPpuOcr(rot.b64, rot.mimeType);
          attempts.push({ label: `${deg}°`, result: rRot as RawOcrResult });
          // 조기 종료
          if (String(rRot?.rawText ?? "").length >= 300 && (rRot?.rows ?? []).length >= 3) break;
        } catch (e: any) { console.warn(`[ocr-engine/retry ${deg}°] 실패:`, e?.message); }
      }
      // 최적 후보 선택
      attempts.sort((a, b) => {
        const ra = (a.result?.rows ?? []).length;
        const rb = (b.result?.rows ?? []).length;
        if (ra !== rb) return rb - ra;
        return String(b.result?.rawText ?? "").length - String(a.result?.rawText ?? "").length;
      });
      raw = attempts[0].result;
      console.log(`[ocr-engine] page ${ctx.page}: 최적=${attempts[0].label} (rows=${(raw?.rows ?? []).length}, rawText=${String(raw?.rawText ?? "").length}자)`);
    }

    return {
      raw,
      rawText: raw.rawText ?? "",
      headers: raw.headers ?? [],
      rows: raw.rows ?? [],
      meta: raw.meta ?? {},
      // 컬럼 매핑 모달용 원본 보관
      rawOcrHeaders: raw.headers ?? [],
      rawOcrSample: (raw.rows ?? []).slice(0, 5),
    };
  },
};
