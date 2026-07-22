// src/components/OcrPage/GeminiParseOnlyButton.tsx
// 2026-07-22 · Gemini 파싱만 하는 독립 컴포넌트
//
// 목적: 이미 추출된 pages (rawText 있음) 을 재-OCR 없이 Gemini 에 텍스트로만 넘겨 재파싱
// 사용 시나리오: ONNX 로컬 파싱 후 결과가 마음에 안 들면 → 같은 rawText 를 Gemini 로 재파싱해 비교
//
// 왜 분리: 재-OCR 없이 이미 있는 rawText 만 Gemini 로 넘기는 로직은 순수 · 재사용 가능한 단위

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import axios from "axios";
import type { OcrPageResult } from "./types";

export interface GeminiParseOnlyButtonProps {
  /** 재파싱 대상 · rawText 필드 필수 */
  pages: OcrPageResult[];
  /** 성공 시 정제된 pages 반환 */
  onResult: (parsed: OcrPageResult[]) => void;
  /** 실패 시 에러 메시지 */
  onError?: (message: string) => void;
  /** 부모가 로딩 UI 를 컨트롤할 때 · true 면 버튼 비활성 */
  disabled?: boolean;
  /** 크기 · sm / md (기본 md) */
  size?: "sm" | "md";
}

export function GeminiParseOnlyButton({
  pages,
  onResult,
  onError,
  disabled = false,
  size = "md",
}: GeminiParseOnlyButtonProps) {
  const [loading, setLoading] = useState(false);
  const hasRawText = pages.length > 0 && pages.some(p => (p.rawText ?? "").length > 0);
  const btnDisabled = disabled || loading || !hasRawText;

  const handleClick = async () => {
    if (btnDisabled) return;
    if (!hasRawText) {
      onError?.("rawText 가 없어 Gemini 파싱 불가 · 먼저 OCR 추출을 실행하세요");
      return;
    }
    setLoading(true);
    try {
      const payload = { pages: pages.map(p => ({ page: p.page, rawText: p.rawText ?? "" })) };
      const res = await axios.post("/api/ocr/parse-gemini", payload);
      const parsed = res.data.pages as OcrPageResult[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        onResult(parsed);
      } else {
        onError?.("Gemini 파싱 결과가 비어있음");
      }
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? e?.message ?? "unknown";
      onError?.(`Gemini 파싱 실패: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const isSm = size === "sm";
  const cls = isSm
    ? "px-2.5 py-1.5 rounded-lg text-[12px] gap-1"
    : "px-3 py-2 rounded-xl text-[13px] gap-1.5";
  const iconSize = isSm ? 12 : 14;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={btnDisabled}
      title={
        !hasRawText
          ? "rawText 가 없음 · 먼저 OCR 추출 실행"
          : "이미 있는 rawText 만 Gemini 에 전송해서 재파싱 · 재-OCR 없음 · 토큰만 소비"
      }
      className={`inline-flex items-center justify-center font-bold text-white bg-violet-500 hover:bg-violet-600 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shadow-sm whitespace-nowrap ${cls}`}
    >
      {loading
        ? <><Loader2 size={iconSize} className="animate-spin" />Gemini 파싱 중...</>
        : <><Sparkles size={iconSize} />🪄 Gemini 로 파싱만</>}
    </button>
  );
}
