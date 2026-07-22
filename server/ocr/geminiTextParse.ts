// server/ocr/geminiTextParse.ts
// 2026-07-22 · ONNX 로 추출한 rawText 를 Gemini 에게 넘겨 거래명세서로 파싱
//
// 기존 gemini.ts (Gemini 비전 OCR 전체 담당) 는 절대 미변경 · 이 파일은 완전 독립.
// 공유하는 것: getGeminiKeys / parseGeminiText / geminiState / GEMINI_MODEL (읽기 전용 import)

import { GoogleGenAI } from "@google/genai";
import type { GeminiResult } from "./schema";
import { GEMINI_MODEL, parseGeminiText } from "./gemini";

const CLEANUP_PROMPT = `당신은 한국 거래명세서 파싱 전문가입니다.
아래 ONNX OCR 결과(rawText) 를 정제해서 표준 거래명세서 JSON 을 반환하세요.

[규칙]
1. 헤더는 반드시: ["품명","규격","수량","단가","금액","유통기한","비고"] 순서
2. 상품 행만 rows 로 반환 (합계·소계·총계·부가세 행 제외)
3. 수량·단가·금액은 정수 (쉼표 없음)
4. 유통기한은 YYYY-MM-DD 형식 (예: 2028-12-21)
5. OCR 오독 수정: "0p0"→"000", "l"→"1", "O"→"0", "S"→"5" 등
6. 수량*단가=금액 검증 · 불일치 시 rawText 재확인하여 정정
7. meta.supplier (공급사명) · meta.date (거래일자) · meta.total (합계액) 도 추출

[출력 JSON 형식]
{
  "headers": ["품명","규격","수량","단가","금액","유통기한","비고"],
  "rows": [["광동원탕","100ML",1000,508,508000,"2028-12-21",""], ...],
  "meta": { "supplier":"광동제약", "date":"2026-04-14", "total":1416000 }
}

JSON 만 반환. 설명·마크다운·코드블록 X.`;

function makeGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" }, timeout: 55_000 },
  });
}

function isQuotaError(msg: string): boolean {
  return /429|quota|rate.?limit|resource.?exhausted/i.test(msg);
}

export async function callGeminiTextParse(
  rawText: string,
  apiKey: string,
  timeoutMs = 30_000,
): Promise<GeminiResult> {
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => { try { abortController.abort(); } catch { /* ignore */ } }, timeoutMs);
  try {
    // rawText 캡 · 토큰 절감 (Gemini flash 는 ~1M context 이지만 정확도 위해 컷)
    const input = rawText.slice(0, 6000);
    const ai = makeGeminiClient(apiKey);
    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{
        parts: [
          { text: `${CLEANUP_PROMPT}\n\n[ONNX rawText]\n${input}` },
        ],
      }],
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        abortSignal: abortController.signal,
      } as any,
    });
    const raw = result.text ?? "";
    if (!raw) return { ok: false, quota: false, error: "Gemini 빈 응답" };
    return { ok: true, text: parseGeminiText(raw) };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    return { ok: false, quota: isQuotaError(msg), error: msg };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
