// server/ocr/mistral.ts
// Mistral pixtral-12b OCR 엔진 — 유료 · Gemini quota 초과 시 fallback

import { type GeminiResult, GEMINI_OCR_PROMPT } from "./schema";
import { parseGeminiText } from "./gemini";

export function getMistralKeys(): string[] {
  const keys: string[] = [];
  if (process.env.MISTRAL_API_KEY) keys.push(process.env.MISTRAL_API_KEY);
  for (let i = 1; i <= 10; i++) {
    const k = process.env[`MISTRAL_API_KEY_${i}`];
    if (k) keys.push(k);
  }
  return keys;
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
