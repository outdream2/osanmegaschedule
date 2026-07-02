import { GoogleGenAI } from "@google/genai";
import { type GeminiResult, GEMINI_OCR_PROMPT } from "./schema";

export const GEMINI_MODEL = "gemini-2.5-flash-lite";

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

export function getMistralKeys(): string[] {
  const keys: string[] = [];
  if (process.env.MISTRAL_API_KEY) keys.push(process.env.MISTRAL_API_KEY);
  for (let i = 1; i <= 10; i++) {
    const k = process.env[`MISTRAL_API_KEY_${i}`];
    if (k) keys.push(k);
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
    httpOptions: { headers: { "User-Agent": "aistudio-build" }, timeout: 25_000 },
  });
}

export async function callGeminiOcr(b64: string, mimeType: string, apiKey: string, timeoutMs = 20_000, templatePrompt?: string): Promise<GeminiResult> {
  const timeoutPromise: Promise<GeminiResult> = new Promise(resolve =>
    setTimeout(() => resolve({ ok: false, quota: false, error: `Gemini 응답 없음 (${timeoutMs / 1000}s 초과)` }), timeoutMs)
  );
  const callPromise: Promise<GeminiResult> = (async () => {
    const attempts = 3;
    let lastResult: GeminiResult = { ok: false, quota: false, error: "알 수 없는 에러" };

    for (let attempt = 1; attempt <= attempts; attempt++) {
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
          config: { temperature: 0, responseMimeType: "application/json" },
        });

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
  return Promise.race([callPromise, timeoutPromise]);
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

export async function callMistralOcr(b64: string, mimeType: string, apiKey: string, templatePrompt?: string): Promise<GeminiResult> {
  try {
    const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "pixtral-12b-2409",
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: `data:${mimeType};base64,${b64}` },
            { type: "text", text: templatePrompt ? `${templatePrompt}\n\n${GEMINI_OCR_PROMPT}` : GEMINI_OCR_PROMPT },
          ],
        }],
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({})) as any;
      const msg = err?.message ?? JSON.stringify(err);
      return { ok: false, quota: resp.status === 429, error: `Mistral ${resp.status}: ${msg}` };
    }
    const data = await resp.json() as any;
    const raw = data.choices?.[0]?.message?.content ?? "";
    if (!raw) return { ok: false, quota: false, error: "Mistral 빈 응답" };
    return { ok: true, text: parseGeminiText(raw) };
  } catch (e: any) {
    return { ok: false, quota: false, error: String(e?.message ?? e) };
  }
}
