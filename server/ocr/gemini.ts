// server/ocr/gemini.ts
// Gemini 비전 API OCR 엔진 — 무료 quota + 다중 키 로테이션
// 유료 fallback: Mistral (별도 mistral.ts)

import { GoogleGenAI } from "@google/genai";
import { type GeminiResult, GEMINI_OCR_PROMPT } from "./schema";

// 2026-07-09 회귀 복구: flash-lite는 비전 이해력 낮음 → 2.5-flash 로 승격
// 무료 quota: flash 2.5 는 250~500회/일 (키당) · 정확도 최상
// 환경변수로 override 가능: GEMINI_MODEL=gemini-2.5-flash
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// 현재 사용 중인 키 인덱스 (sticky: 성공한 키를 계속 사용, 실패 시에만 다음으로)
export const geminiState = { currentKeyIdx: 0 };

export function getGeminiKeys(): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  const push = (k: string | undefined) => { if (k && !seen.has(k)) { seen.add(k); keys.push(k); } };
  push(process.env.GEMINI_API_KEY);
  for (let i = 1; i <= 20; i++) {
    push(process.env[`GEMINI_API_KEY_${i}`]);
    push(process.env[`GEMINI_API_KEY${i}`]);
  }
  return keys;
}

export function parseGeminiText(raw: string): string {
  let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (m) text = m[0];
  return text;
}

function isQuotaError(msg: string): boolean {
  return /429|quota|rate.?limit|resource.?exhausted/i.test(msg);
}

function makeGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" }, timeout: 55_000 },
  });
}

export async function callGeminiOcr(b64: string, mimeType: string, apiKey: string, timeoutMs = 45_000, templatePrompt?: string): Promise<GeminiResult> {
  // AbortController — timeout 발동 시 SDK 요청도 실제로 중단
  const abortController = new AbortController();
  let aborted = false;
  const timeoutHandle = setTimeout(() => {
    aborted = true;
    try { abortController.abort(); } catch { /* ignore */ }
  }, timeoutMs);

  const timeoutPromise: Promise<GeminiResult> = new Promise(resolve => {
    // 별도 타이머로 race용 결과 준비 (SDK 응답 대기 없이 즉시 반환)
    setTimeout(() => resolve({ ok: false, quota: false, error: `Gemini 응답 없음 (${timeoutMs / 1000}s 초과)` }), timeoutMs);
  });

  const callPromise: Promise<GeminiResult> = (async () => {
    const attempts = 3;
    let lastResult: GeminiResult = { ok: false, quota: false, error: "알 수 없는 에러" };

    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (aborted) return lastResult;  // timeout 후 재시도 방지
      try {
        const ai = makeGeminiClient(apiKey);
        const result = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [{
            parts: [
              { inlineData: { mimeType: mimeType ?? "image/jpeg", data: b64 } },
              { text: templatePrompt ? `${templatePrompt}\n\n${GEMINI_OCR_PROMPT}` : GEMINI_OCR_PROMPT },
            ],
          }],
          config: {
            temperature: 0,
            responseMimeType: "application/json",
            abortSignal: abortController.signal,
          } as any,
        });

        if (aborted) return lastResult;

        const finishReason = result.candidates?.[0]?.finishReason ?? "STOP";
        if (finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
          lastResult = { ok: false, quota: false, error: `Gemini 응답 차단됨 (${finishReason})` };
          continue;
        }

        const raw = result.text ?? "";
        if (!raw) { lastResult = { ok: false, quota: false, error: "Gemini 빈 응답" }; continue; }
        return { ok: true, text: parseGeminiText(raw) };
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (aborted || /aborted|abortSignal|user aborted/i.test(msg)) {
          return { ok: false, quota: false, error: `Gemini 응답 없음 (${timeoutMs / 1000}s 초과)` };
        }
        const isQuota = isQuotaError(msg);
        lastResult = { ok: false, quota: isQuota, error: msg };
        if (msg.includes("503") || msg.includes("UNAVAILABLE")) {
          console.log(`[OCR/Gemini] 서버 오류 ${attempt}/${attempts}차 재시도 대기 중...`);
          await new Promise(r => setTimeout(r, 2000 * attempt));
          continue;
        }
        // quota(429), UNAUTHENTICATED 등은 재시도 불필요 — 즉시 반환
        break;
      }
    }
    return lastResult;
  })();

  try {
    return await Promise.race([callPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

const SUPPLIER_EXTRACT_PROMPT = `이 이미지는 한국 거래명세서입니다.
이미지에서 "공급자" 또는 "납품자"의 회사 상호명만 추출하세요. 수신처(약국, 병원 등 구매처)는 제외합니다.
JSON 형식으로만 응답: {"supplier": "회사명"}`;

export async function extractSupplierFromImage(b64: string, mimeType: string, apiKey: string): Promise<string | null> {
  try {
    const ai = makeGeminiClient(apiKey);
    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{
        parts: [
          { inlineData: { mimeType: mimeType ?? "image/jpeg", data: b64 } },
          { text: SUPPLIER_EXTRACT_PROMPT },
        ],
      }],
      config: { temperature: 0, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } },
    });
    const raw = result.text ?? "";
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const obj = JSON.parse(cleaned);
    const supplier = (obj?.supplier ?? "").trim();
    return supplier || null;
  } catch {
    return null;
  }
}
