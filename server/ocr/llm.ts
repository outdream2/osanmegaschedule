import { GoogleGenAI } from "@google/genai";
import { type GeminiResult, GEMINI_OCR_PROMPT } from "./schema";

export const GEMINI_MODEL = "gemini-2.5-flash";

export const geminiState = { roundRobinIdx: 0 };

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
        if (isQuota || msg.includes("503") || msg.includes("UNAVAILABLE")) {
          console.log(`[OCR/Gemini] API 오류로 인해 ${attempt}/${attempts}차 재시도 대기 중...`);
          await new Promise(r => setTimeout(r, 2000 * attempt));
          continue;
        }
        break;
      }
    }
    return lastResult;
  })();
  return Promise.race([callPromise, timeoutPromise]);
}

export async function structureWithGemini(rawText: string, apiKey: string): Promise<GeminiResult> {
  const prompt = `당신은 한국 거래명세서·납품서·세금계산서 전문 데이터 추출 엔진입니다.
아래 OCR 텍스트에서 품목 표를 찾아 JSON으로 반환하세요.

[추출 규칙]
1. 표의 헤더 행을 정확히 찾아 실제 컬럼명을 그대로 headers에 넣으세요
2. 헤더 아래 품목 행만 rows로 추출 (합계·소계·총계 행 제외)
3. 숫자 쉼표 제거 후 숫자형 반환 (예: "1,500" → 1500)
4. 비어있거나 없는 셀은 null
5. meta: date(YYYY-MM-DD), supplier(공급자/납품자/도매상 — 약국·병원 등 구매처 제외, 위치 무관), recipient(수신자/구매처), total(합계숫자)

마크다운·설명 없이 JSON만:
{"headers":["번호","품명","규격","단위","수량","단가","금액","세액"],"rows":[[1,"상품A","500ml","EA",10,1500,15000,1500]],"meta":{"supplier":"(주)공급사","recipient":"수신사","date":"2024-01-15","total":16500}}

[OCR 텍스트]
${rawText}`;

  const attempts = 3;
  let lastResult: GeminiResult = { ok: false, quota: false, error: "알 수 없는 에러" };

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const ai = makeGeminiClient(apiKey);
      const result = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ parts: [{ text: prompt }] }],
        config: { temperature: 0 },
      });
      const raw = result.text ?? "";
      if (!raw) { lastResult = { ok: false, quota: false, error: "Gemini 빈 응답" }; continue; }
      return { ok: true, text: parseGeminiText(raw) };
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const isQuota = isQuotaError(msg);
      lastResult = { ok: false, quota: isQuota, error: msg };
      if (isQuota || msg.includes("503") || msg.includes("UNAVAILABLE")) {
        console.log(`[OCR/Gemini] 구조화 API 오류로 인해 ${attempt}/${attempts}차 재시도 대기 중...`);
        await new Promise(r => setTimeout(r, 2000 * attempt));
        continue;
      }
      break;
    }
  }
  return lastResult;
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
